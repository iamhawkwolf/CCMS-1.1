import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { deliverPending, queueNotification } from "@/lib/notify";
import { resetDemo } from "@/lib/demo/seed";
import { startMockMeta } from "./mock-meta";

const meta = startMockMeta();
const NOW = new Date("2020-11-16T05:00:00Z"); // 10:30 IST on a Monday: inside the WhatsApp window

beforeAll(async () => { process.env.WHATSAPP_API_BASE = await meta.start(); });
afterAll(async () => { await db.consultancy.deleteMany(); await meta.stop(); await db.$disconnect(); });
beforeEach(async () => { await db.consultancy.deleteMany(); meta.reset(); });

const wa = (consultancyId: string, clientId: string) =>
  queueNotification({ consultancyId, plan: "PRO", clientId, channel: "WHATSAPP", to: "9800000012", template: "new_profile_submitted", payload: { consultancy: "X", candidate: "Priya", requisition: "Accountant" } }, NOW);

describe("demo data", () => {
  it("builds a full demo consultancy and can be rebuilt any number of times", async () => {
    const first = await resetDemo(db);
    const again = await resetDemo(db);
    expect(again.consultancyId).not.toBe(first.consultancyId);
    expect(await db.consultancy.count()).toBe(1);
    const c = await db.consultancy.findFirstOrThrow({ include: { users: true, clients: true } });
    expect(c.isDemo).toBe(true);
    expect(c.users.map((u) => u.email).sort()).toEqual(["admin@demo.test", "client@demo.test", "consultant@demo.test", "karan@demo.test"]);
    expect(c.clients).toHaveLength(4);
    expect(await db.profile.count()).toBeGreaterThan(10);
    expect(await db.invoice.groupBy({ by: ["status"] }).then((r) => r.map((x) => x.status).sort())).toEqual(["DRAFT", "PAID", "PARTIALLY_PAID", "SENT"]);
    expect(await db.task.count({ where: { status: "TODO", dueDate: { lt: new Date() } } })).toBeGreaterThan(0); // something overdue to look at
  });

  it("never touches a real consultancy, even one with a similar name", async () => {
    const real = await db.consultancy.create({ data: { name: "Real HR Co", users: { create: { name: "Owner", email: "owner@realhr.in", passwordHash: "x", role: "ADMIN" } } } });
    const lookalike = await db.consultancy.create({ data: { name: "Demo HR Advisors", users: { create: { name: "Owner", email: "owner@other.in", passwordHash: "x", role: "ADMIN" } } } });
    await resetDemo(db);
    expect(await db.consultancy.findUnique({ where: { id: real.id } })).not.toBeNull();
    expect(await db.consultancy.findUnique({ where: { id: lookalike.id } })).not.toBeNull();
    expect(await db.user.count({ where: { email: "owner@realhr.in" } })).toBe(1);
  });

  it("replaces the old unflagged demo made by the previous seed", async () => {
    await db.consultancy.create({ data: { name: "Demo HR Advisors", users: { create: { name: "A", email: "admin@demo.test", passwordHash: "x", role: "ADMIN" } } } });
    await resetDemo(db);
    expect(await db.consultancy.count()).toBe(1);
    expect((await db.consultancy.findFirstOrThrow()).isDemo).toBe(true);
  });
});

describe("demo accounts never send anything", () => {
  it("marks WhatsApp as sent without calling Meta, while a real consultancy still sends", async () => {
    const demo = await resetDemo(db);
    const demoClient = await db.client.findFirstOrThrow({ where: { consultancyId: demo.consultancyId, name: { startsWith: "Acme" } } });
    await db.notification.deleteMany();
    const real = await db.consultancy.create({ data: { name: "Real HR Co", plan: "PRO" } });
    const realClient = await db.client.create({ data: { consultancyId: real.id, name: "Real Client", state: "KA" } });

    await wa(demo.consultancyId, demoClient.id);
    await wa(real.id, realClient.id);
    await db.notification.updateMany({ data: { scheduledFor: NOW } });
    const s = await deliverPending({ now: NOW });

    expect(s.sent).toBe(2);
    expect(meta.requests).toHaveLength(1); // only the real consultancy reached Meta
    const demoRow = await db.notification.findFirstOrThrow({ where: { consultancyId: demo.consultancyId } });
    expect(demoRow).toMatchObject({ status: "SENT" });
    expect(demoRow.providerMessageId).toBe(`demo-${demoRow.id}`);
  });

  it("does not send demo email either", async () => {
    const demo = await resetDemo(db);
    process.env.EMAIL_PROVIDER = "smtp"; // anything but console would be a real provider
    try {
      await queueNotification({ consultancyId: demo.consultancyId, plan: "PRO", channel: "EMAIL", to: "someone@example.com", template: "x", payload: {}, scheduledFor: NOW }, NOW);
      await deliverPending({ now: NOW });
      expect(await db.notification.findFirstOrThrow({ where: { to: "someone@example.com" } })).toMatchObject({ status: "SENT" });
    } finally {
      delete process.env.EMAIL_PROVIDER;
    }
  });
});
