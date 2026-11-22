import { createHmac } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { MAX_ATTEMPTS, deliverPending, queueNotification } from "@/lib/notify";
import { runComplianceAlerts } from "@/lib/jobs/compliance-alerts";
import { runReviewReminders } from "@/lib/jobs/review-reminders";
import { runInvoiceReminders } from "@/lib/jobs/invoice-reminders";
import { runCalendarRollover } from "@/lib/jobs/calendar-rollover";
import { runDueJobs } from "@/lib/jobs/runner";
import { GET as webhookGet, POST as webhookPost } from "@/app/api/whatsapp/webhook/route";
import { GET as cronGet } from "@/app/api/cron/route";
import { addDays, istToday } from "@/lib/time";
import { startMockMeta } from "./mock-meta";

const meta = startMockMeta();
// 10:30 IST on a Monday: inside the WhatsApp send window. Deliberately in the PAST relative to the real clock,
// so any code that forgets to use the injected `now` (and stamps the real time) is caught.
const NOW = new Date("2020-11-16T05:00:00Z");
const TODAY = istToday(NOW);
let seq = 0;

async function wipe() {
  await db.consultancy.deleteMany();
  await db.whatsAppOptOut.deleteMany();
  await db.jobState.deleteMany();
}

async function fixture(plan: "PRO" | "STARTER" = "PRO") {
  const id = ++seq;
  const c = await db.consultancy.create({ data: { name: "IT Advisors", plan, state: "KA" } });
  const mk = (role: "ADMIN" | "CONSULTANT", phone: string) => db.user.create({ data: { consultancyId: c.id, name: role === "ADMIN" ? "Admin A" : "Consultant C", email: `${role}-${id}@t.test`, passwordHash: "x", role, phone } });
  const admin = await mk("ADMIN", "9800000010");
  const consultant = await mk("CONSULTANT", "9800000011");
  const client = await db.client.create({ data: { consultancyId: c.id, name: "Client One", state: "KA", pfNumber: "PF1", reviewReminderDays: 3, contacts: { create: { name: "Contact", phone: "+91 98000 00012", isPrimary: true } } } });
  await db.clientAssignment.create({ data: { userId: consultant.id, clientId: client.id } });
  return { c, admin, consultant, client };
}

const wa = (f: Awaited<ReturnType<typeof fixture>>, over: Partial<Parameters<typeof queueNotification>[0]> = {}) =>
  queueNotification({ consultancyId: f.c.id, plan: f.c.plan, clientId: f.client.id, channel: "WHATSAPP", to: "9800000012", template: "new_profile_submitted", payload: { consultancy: "IT Advisors", candidate: "Priya", requisition: "Accountant" }, ...over }, NOW);

const sign = (body: string) => "sha256=" + createHmac("sha256", "test-app-secret").update(body).digest("hex");
const hook = (json: unknown, sig?: string) => {
  const body = JSON.stringify(json);
  return webhookPost(new Request("http://x/api/whatsapp/webhook", { method: "POST", body, headers: { "x-hub-signature-256": sig ?? sign(body) } }));
};
const statusHook = (id: string, status: string) => ({ entry: [{ changes: [{ value: { statuses: [{ id, status }] } }] }] });
const textHook = (from: string, text: string) => ({ entry: [{ changes: [{ value: { messages: [{ from, type: "text", text: { body: text } }] } }] }] });

beforeAll(async () => { process.env.WHATSAPP_API_BASE = await meta.start(); });
afterAll(async () => { await wipe(); await meta.stop(); await db.$disconnect(); });
beforeEach(async () => { await wipe(); meta.reset(); });

describe("queueing", () => {
  it("normalises the number and sends nothing until the worker runs", async () => {
    const f = await fixture();
    expect(await wa(f, { to: "+91 98000-00012" })).toBe("queued");
    const n = await db.notification.findFirstOrThrow();
    expect(n).toMatchObject({ to: "919800000012", status: "PENDING" });
    expect(meta.requests).toHaveLength(0);
  });
  it("holds evening messages until 09:00 IST", async () => {
    const f = await fixture();
    await queueNotification({ consultancyId: f.c.id, plan: "PRO", clientId: f.client.id, channel: "WHATSAPP", to: "9800000012", template: "new_profile_submitted", payload: { consultancy: "A", candidate: "B", requisition: "C" } }, NOW);
    const late = new Date("2020-11-16T16:00:00Z"); // 21:30 IST
    await queueNotification({ consultancyId: f.c.id, plan: "PRO", clientId: f.client.id, channel: "WHATSAPP", to: "9800000013", template: "new_profile_submitted", payload: { consultancy: "A", candidate: "B", requisition: "C" }, scheduledFor: late }, NOW);
    const held = await db.notification.findFirstOrThrow({ where: { to: "919800000013" } });
    expect(held.scheduledFor.toISOString()).toBe("2020-11-17T03:30:00.000Z");
  });
  it("records an invalid number as FAILED instead of throwing", async () => {
    const f = await fixture();
    expect(await wa(f, { to: "12345" })).toBe("invalid");
    expect(await db.notification.findFirstOrThrow()).toMatchObject({ status: "FAILED", error: "Invalid phone number" });
  });
  it("skips WhatsApp when the client's switch is off, and keeps the row for the record", async () => {
    const f = await fixture();
    await db.featureSetting.create({ data: { consultancyId: f.c.id, scope: f.client.id, clientId: f.client.id, key: "whatsapp_reminders", enabled: false } });
    expect(await wa(f)).toBe("skipped");
    expect((await db.notification.findFirstOrThrow()).status).toBe("SKIPPED");
  });
  it("never queues the same dedupeKey twice", async () => {
    const f = await fixture();
    expect(await wa(f, { dedupeKey: "k1" })).toBe("queued");
    expect(await wa(f, { dedupeKey: "k1" })).toBe("duplicate");
    expect(await db.notification.count()).toBe(1);
  });
  it("rejects an incomplete payload at queue time", async () => {
    const f = await fixture();
    await expect(wa(f, { payload: { consultancy: "x" } })).rejects.toThrow(/needs "candidate"/);
  });
});

describe("delivery through the WhatsApp Cloud API", () => {
  it("sends a correct template request and records Meta's message id", async () => {
    const f = await fixture();
    await wa(f);
    const s = await deliverPending({ now: NOW });
    expect(s).toMatchObject({ claimed: 1, sent: 1 });
    expect(meta.requests).toHaveLength(1);
    expect(meta.requests[0]!.url).toBe("/v23.0/555000/messages");
    expect(meta.requests[0]!.auth).toBe("Bearer test-token");
    expect(meta.requests[0]!.body).toMatchObject({ to: "919800000012", type: "template", template: { name: "ccms_new_profile_submitted", language: { code: "en" } } });
    expect(await db.notification.findFirstOrThrow()).toMatchObject({ status: "SENT", providerMessageId: "wamid.MOCK1", attempts: 1 });
  });
  it("retries a throttled message later, then succeeds", async () => {
    const f = await fixture();
    await wa(f);
    meta.reply(429, { error: { code: 130429, message: "Rate limit hit" } });
    expect(await deliverPending({ now: NOW })).toMatchObject({ retried: 1, sent: 0 });
    let n = await db.notification.findFirstOrThrow();
    expect(n).toMatchObject({ status: "PENDING", attempts: 1 });
    expect(n.scheduledFor.getTime()).toBe(NOW.getTime() + 60_000);
    expect(await deliverPending({ now: NOW })).toMatchObject({ claimed: 0 }); // not due yet
    expect(await deliverPending({ now: new Date(NOW.getTime() + 61_000) })).toMatchObject({ sent: 1 });
    n = await db.notification.findFirstOrThrow();
    expect(n).toMatchObject({ status: "SENT", attempts: 2, error: null });
  });
  it("fails immediately on a permanent error such as an unapproved template", async () => {
    const f = await fixture();
    await wa(f);
    meta.reply(400, { error: { code: 132001, message: "Template name does not exist in the translation" } });
    expect(await deliverPending({ now: NOW })).toMatchObject({ failed: 1 });
    const n = await db.notification.findFirstOrThrow();
    expect(n.status).toBe("FAILED");
    expect(n.error).toContain("132001");
    expect(meta.requests).toHaveLength(1);
  });
  it("gives up after the maximum number of attempts", async () => {
    const f = await fixture();
    await wa(f);
    let t = NOW;
    for (let i = 0; i < MAX_ATTEMPTS; i++) {
      meta.reply(503, { error: { message: "Service unavailable" } });
      await deliverPending({ now: t });
      t = new Date(t.getTime() + 4 * 3_600_000);
    }
    expect(await db.notification.findFirstOrThrow()).toMatchObject({ status: "FAILED", attempts: MAX_ATTEMPTS });
    expect(meta.requests).toHaveLength(MAX_ATTEMPTS);
  });
  it("never double-sends when two workers run at once", async () => {
    const f = await fixture();
    for (let i = 0; i < 12; i++) await wa(f, { to: `98000001${String(i).padStart(2, "0")}` });
    meta.setDelay(25);
    await Promise.all([deliverPending({ now: NOW }), deliverPending({ now: NOW }), deliverPending({ now: NOW })]);
    expect(meta.requests).toHaveLength(12);
    expect(await db.notification.count({ where: { status: "SENT" } })).toBe(12);
  });
  it("skips (and does not send) if the switch was turned off after queueing", async () => {
    const f = await fixture();
    await wa(f);
    await db.featureSetting.create({ data: { consultancyId: f.c.id, scope: "ACCOUNT", key: "whatsapp_reminders", enabled: false } });
    expect(await deliverPending({ now: NOW })).toMatchObject({ skipped: 1, sent: 0 });
    expect(meta.requests).toHaveLength(0);
  });
  it("puts rows left in SENDING by a crashed worker back in the queue", async () => {
    const f = await fixture();
    await wa(f);
    await db.notification.updateMany({ data: { status: "SENDING", claimedAt: new Date(NOW.getTime() - 20 * 60_000) } });
    expect(await deliverPending({ now: NOW })).toMatchObject({ sent: 1 });
  });
  it("leaves messages queued, not failed, when credentials are missing", async () => {
    const f = await fixture();
    await wa(f);
    const saved = process.env.WHATSAPP_TOKEN;
    delete process.env.WHATSAPP_TOKEN;
    try {
      expect(await deliverPending({ now: NOW })).toMatchObject({ waitingOnConfig: 1, failed: 0 });
    } finally {
      process.env.WHATSAPP_TOKEN = saved;
    }
    const n = await db.notification.findFirstOrThrow();
    expect(n.status).toBe("PENDING");
    expect(n.attempts).toBe(0);
  });
});

describe("webhook", () => {
  it("verifies the endpoint with Meta's challenge", async () => {
    const ok = webhookGet(new Request("http://x/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=test-verify-token&hub.challenge=12345"));
    expect(ok.status).toBe(200);
    expect(await ok.text()).toBe("12345");
    expect(webhookGet(new Request("http://x/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=1")).status).toBe(403);
  });
  it("rejects unsigned and wrongly signed requests", async () => {
    expect((await hook(statusHook("x", "read"), "sha256=00")).status).toBe(401);
    expect((await webhookPost(new Request("http://x", { method: "POST", body: "{}" }))).status).toBe(401);
  });
  it("applies delivery receipts in order and ignores late duplicates", async () => {
    const f = await fixture();
    await wa(f);
    await deliverPending({ now: NOW });
    expect((await hook(statusHook("wamid.MOCK1", "delivered"))).status).toBe(200);
    expect((await db.notification.findFirstOrThrow()).status).toBe("DELIVERED");
    await hook(statusHook("wamid.MOCK1", "read"));
    let n = await db.notification.findFirstOrThrow();
    expect(n.status).toBe("READ");
    expect(n.readAt).not.toBeNull();
    await hook(statusHook("wamid.MOCK1", "delivered")); // out of order
    expect((await db.notification.findFirstOrThrow()).status).toBe("READ");
  });
  it("records a failure reported after sending", async () => {
    const f = await fixture();
    await wa(f);
    await deliverPending({ now: NOW });
    await hook({ entry: [{ changes: [{ value: { statuses: [{ id: "wamid.MOCK1", status: "failed", errors: [{ code: 131026, title: "Message undeliverable" }] }] } }] }] });
    expect(await db.notification.findFirstOrThrow()).toMatchObject({ status: "FAILED", error: expect.stringContaining("131026") });
  });
  it("honours STOP: cancels pending messages and blocks future ones, until START", async () => {
    const f = await fixture();
    await wa(f, { to: "9800000012" });
    expect((await hook(textHook("919800000012", "STOP"))).status).toBe(200);
    expect(await db.whatsAppOptOut.count()).toBe(1);
    expect((await db.notification.findFirstOrThrow()).status).toBe("SKIPPED");

    await wa(f, { to: "9800000012", payload: { consultancy: "IT", candidate: "Later", requisition: "R" } });
    expect(await deliverPending({ now: NOW })).toMatchObject({ skipped: 1, sent: 0 });
    expect(meta.requests).toHaveLength(0);

    await hook(textHook("919800000012", "START"));
    expect(await db.whatsAppOptOut.count()).toBe(0);
    await wa(f, { to: "9800000012", payload: { consultancy: "IT", candidate: "After", requisition: "R" } });
    expect(await deliverPending({ now: NOW })).toMatchObject({ sent: 1 });
  });
});

describe("compliance alerts", () => {
  async function tasks(f: Awaited<ReturnType<typeof fixture>>, offsets: number[]) {
    for (const o of offsets) await db.task.create({ data: { consultancyId: f.c.id, clientId: f.client.id, title: `Task ${o}`, dueDate: addDays(TODAY, o), assigneeId: f.consultant.id, complianceKind: "PF" } });
  }
  const titles = async (userId: string, channel: "IN_APP" | "WHATSAPP" = "IN_APP") => (await db.notification.findMany({ where: { channel, to: channel === "IN_APP" ? userId : { not: "" } }, orderBy: { createdAt: "asc" } })).map((n) => (n.payload as any).title as string);

  it("alerts the owner at each milestone, ignores far-future tasks", async () => {
    const f = await fixture();
    await tasks(f, [7, 3, 1, 0, 10]);
    const r = await runComplianceAlerts(NOW);
    expect(r.queued).toBeGreaterThan(0);
    expect((await titles(f.consultant.id)).sort()).toEqual(["Task 0", "Task 1", "Task 3", "Task 7"]);
    expect(await db.notification.count({ where: { channel: "IN_APP", to: f.admin.id } })).toBe(0); // not overdue, so admins stay quiet
  });
  it("sends WhatsApp to the owner too, and escalates overdue tasks to admins", async () => {
    const f = await fixture();
    await tasks(f, [-2]);
    await runComplianceAlerts(NOW);
    const to = (await db.notification.findMany({ where: { channel: "WHATSAPP" } })).map((n) => n.to).sort();
    expect(to).toEqual(["919800000010", "919800000011"]);
    expect(await db.notification.count({ where: { channel: "IN_APP", to: f.admin.id } })).toBe(1);
    expect((await db.notification.findFirstOrThrow({ where: { channel: "WHATSAPP", to: "919800000011" } })).payload).toMatchObject({ title: "Task -2", when: "2 days overdue", client: "Client One" });
  });
  it("is idempotent across repeated runs within a day", async () => {
    const f = await fixture();
    await tasks(f, [3, -1]);
    await runComplianceAlerts(NOW);
    const before = await db.notification.count();
    const again = await runComplianceAlerts(new Date(NOW.getTime() + 3 * 3_600_000));
    expect(again.queued).toBe(0);
    expect(await db.notification.count()).toBe(before);
  });
  it("re-alerts on an overdue task every three days", async () => {
    const f = await fixture();
    await tasks(f, [-1]);
    await runComplianceAlerts(NOW);
    const first = await db.notification.count({ where: { channel: "IN_APP", to: f.consultant.id } });
    await runComplianceAlerts(addDays(NOW, 1));
    expect(await db.notification.count({ where: { channel: "IN_APP", to: f.consultant.id } })).toBe(first); // day 2 overdue: same bucket
    await runComplianceAlerts(addDays(NOW, 3)); // day 4 overdue: next bucket
    expect(await db.notification.count({ where: { channel: "IN_APP", to: f.consultant.id } })).toBe(first + 1);
  });
  it("stops when the task is done or the compliance calendar is switched off", async () => {
    const f = await fixture();
    await tasks(f, [1]);
    await db.task.updateMany({ data: { status: "DONE" } });
    expect((await runComplianceAlerts(NOW)).queued).toBe(0);
    await db.task.updateMany({ data: { status: "TODO" } });
    await db.featureSetting.create({ data: { consultancyId: f.c.id, scope: f.client.id, clientId: f.client.id, key: "compliance_calendar", enabled: false } });
    const r = await runComplianceAlerts(NOW);
    expect(r.queued).toBe(0);
    expect(r.featureOff).toBe(1);
  });
  it("alerts admins when a task has no owner", async () => {
    const f = await fixture();
    await db.task.create({ data: { consultancyId: f.c.id, clientId: f.client.id, title: "Orphan", dueDate: addDays(TODAY, 1) } });
    await runComplianceAlerts(NOW);
    expect(await db.notification.count({ where: { channel: "IN_APP", to: f.admin.id } })).toBe(1);
  });
});

describe("review reminders", () => {
  async function profile(f: Awaited<ReturnType<typeof fixture>>, daysAgo: number) {
    const req = await db.requisition.create({ data: { consultancyId: f.c.id, clientId: f.client.id, title: "Accountant" } });
    return db.profile.create({ data: { requisitionId: req.id, name: "Cand", submittedAt: addDays(NOW, -daysAgo) } });
  }
  it("nudges the client's primary contact once the review period passes, then waits", async () => {
    const f = await fixture();
    await profile(f, 1);
    expect((await runReviewReminders(NOW)).queued).toBe(0); // 1 day: too soon
    await db.profile.updateMany({ data: { submittedAt: addDays(NOW, -5) } });
    expect((await runReviewReminders(NOW)).queued).toBe(1);
    const n = await db.notification.findFirstOrThrow();
    expect(n).toMatchObject({ channel: "WHATSAPP", template: "profile_review_reminder", to: "919800000012" });
    expect(n.payload).toMatchObject({ count: 1, requisition: "Accountant" });
    expect((await runReviewReminders(addDays(NOW, 1))).queued).toBe(0); // reminded yesterday
    expect((await runReviewReminders(addDays(NOW, 4))).queued).toBe(1); // 4 days on: again
  });
  it("sends one message per requisition, counting every waiting profile", async () => {
    const f = await fixture();
    const first = await profile(f, 5);
    await db.profile.create({ data: { requisitionId: first.requisitionId, name: "Second", submittedAt: addDays(NOW, -6) } });
    await runReviewReminders(NOW);
    expect(await db.notification.count()).toBe(1);
    expect((await db.notification.findFirstOrThrow()).payload).toMatchObject({ count: 2 });
  });
  it("does not nag about profiles the client has already acted on", async () => {
    const f = await fixture();
    const p = await profile(f, 9);
    await db.profile.update({ where: { id: p.id }, data: { stage: "SHORTLISTED" } });
    expect((await runReviewReminders(NOW)).queued).toBe(0);
  });
});

describe("invoice reminders", () => {
  async function invoice(f: Awaited<ReturnType<typeof fixture>>, dueOffset: number, status: "SENT" | "PAID" = "SENT") {
    return db.invoice.create({ data: { consultancyId: f.c.id, clientId: f.client.id, number: `INV/${++seq}`, status, dueDate: addDays(TODAY, dueOffset), placeOfSupply: "KA", subtotalPaise: 100000, cgstPaise: 9000, sgstPaise: 9000, totalPaise: 118000 } });
  }
  it("sends a heads-up before the due date and an overdue notice after", async () => {
    const f = await fixture();
    await invoice(f, 2);
    await invoice(f, -3);
    await invoice(f, 20); // too early
    await invoice(f, -3, "PAID"); // settled
    expect((await runInvoiceReminders(NOW)).queued).toBe(2);
    const templates = (await db.notification.findMany()).map((n) => n.template).sort();
    expect(templates).toEqual(["invoice_overdue", "invoice_reminder"]);
    expect((await db.notification.findFirstOrThrow({ where: { template: "invoice_reminder" } })).payload).toMatchObject({ amount: expect.stringContaining("1,180.00") });
  });
  it("reminds weekly while overdue, not daily", async () => {
    const f = await fixture();
    await invoice(f, -1);
    await runInvoiceReminders(NOW);
    expect((await runInvoiceReminders(addDays(NOW, 3))).queued).toBe(0);
    expect((await runInvoiceReminders(addDays(NOW, 7))).queued).toBe(1);
  });
});

describe("calendar rollover", () => {
  it("fills the calendar once and never duplicates", async () => {
    const f = await fixture();
    const first = await runCalendarRollover(NOW);
    expect(first.tasksCreated).toBeGreaterThan(0);
    const count = await db.task.count();
    expect((await runCalendarRollover(NOW)).tasksCreated).toBe(0);
    expect(await db.task.count()).toBe(count);
    expect((await db.task.findFirstOrThrow()).assigneeId).toBe(f.consultant.id);
  });
});

describe("job runner", () => {
  it("runs due jobs, then respects each job's interval", async () => {
    await fixture();
    const first = await runDueJobs({ now: NOW });
    expect(first.every((r) => r.ran && r.ok)).toBe(true);
    const second = await runDueJobs({ now: new Date(NOW.getTime() + 20_000) });
    expect(second.every((r) => !r.ran)).toBe(true);
    const minute = await runDueJobs({ now: new Date(NOW.getTime() + 61_000) });
    expect(minute.filter((r) => r.ran).map((r) => r.name)).toEqual(["deliver"]); // only the 1-minute job is due
  });
  it("force ignores intervals, and a held lease blocks a second runner", async () => {
    await fixture();
    await runDueJobs({ now: NOW });
    expect((await runDueJobs({ now: NOW, only: ["deliver"], force: true }))[0]!.ran).toBe(true);
    await db.jobState.update({ where: { name: "deliver" }, data: { lockedUntil: new Date(NOW.getTime() + 5 * 60_000) } });
    expect((await runDueJobs({ now: NOW, only: ["deliver"], force: true }))[0]!.ran).toBe(false);
  });
  it("records the outcome of each job", async () => {
    await fixture();
    await runDueJobs({ now: NOW });
    const states = await db.jobState.findMany();
    expect(states).toHaveLength(5);
    expect(states.every((s) => s.lastOk === true && s.lastFinishedAt && !s.lockedUntil)).toBe(true);
  });
  it("end to end: an overdue task produces an alert that is delivered over WhatsApp", async () => {
    const f = await fixture();
    await db.task.create({ data: { consultancyId: f.c.id, clientId: f.client.id, title: "PF filing", dueDate: addDays(TODAY, -1), assigneeId: f.consultant.id } });
    await runDueJobs({ now: NOW });
    const sent = meta.requests.map((r) => r.body.to).sort();
    expect(sent).toEqual(["919800000010", "919800000011"]); // consultant plus escalation to admin
    expect(meta.requests[0]!.body.template.components[0].parameters.map((p: any) => p.text).join("|")).toContain("PF filing");
  });
});

describe("cron endpoint", () => {
  const call = (auth?: string) => cronGet(new Request("http://x/api/cron", { headers: auth ? { authorization: auth } : {} }));
  it("requires the secret", async () => {
    expect((await call()).status).toBe(401);
    expect((await call("Bearer nope")).status).toBe(401);
  });
  it("runs the jobs when authorised", async () => {
    await fixture();
    const res = await call("Bearer test-cron-secret-0123456789");
    expect(res.status).toBe(200);
    expect(((await res.json()) as { results: unknown[] }).results).toHaveLength(5);
  });
});
