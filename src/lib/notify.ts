// Notification outbox and delivery.
//
//   queueNotification()  features call this; it writes a row, never sends.
//   deliverPending()     the worker calls this; it claims due rows and sends them.
//
// Guarantees: a row is claimed by exactly one worker at a time; transient failures retry with backoff;
// the same dedupeKey is never queued twice; WhatsApp goes out only 09:00-20:00 IST, only to numbers that
// have not replied STOP, and only while the client's "WhatsApp reminders" switch is on.
import type { NotificationChannel, Plan, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { isFeatureOn } from "@/lib/features/server";
import { nextSendWindow } from "@/lib/time";
import { toWhatsAppNumber } from "@/lib/whatsapp/phone";
import { TemplateError, buildTemplateParams, isTemplateKey, renderTemplateText } from "@/lib/whatsapp/templates";
import { cloudConfig, sendTemplate } from "@/lib/whatsapp/cloud";

export const MAX_ATTEMPTS = 5;
const RETRY_MS = [60_000, 5 * 60_000, 15 * 60_000, 60 * 60_000, 3 * 60 * 60_000];
const STUCK_AFTER_MS = 10 * 60_000;

export const retryDelayMs = (attemptsSoFar: number): number => RETRY_MS[Math.min(Math.max(attemptsSoFar - 1, 0), RETRY_MS.length - 1)]!;

export interface QueueInput {
  consultancyId: string;
  plan: Plan;
  clientId?: string | null;
  channel: NotificationChannel;
  /** WhatsApp: a phone number in any common format. IN_APP: a user id. EMAIL: an address. */
  to: string;
  template: string;
  payload: Prisma.InputJsonValue;
  scheduledFor?: Date;
  dedupeKey?: string;
}

export type QueueOutcome = "queued" | "skipped" | "invalid" | "duplicate";

export async function queueNotification(n: QueueInput, now = new Date()): Promise<QueueOutcome> {
  const base = { consultancyId: n.consultancyId, clientId: n.clientId ?? null, channel: n.channel, template: n.template, payload: n.payload, dedupeKey: n.dedupeKey ?? null };
  let data: Prisma.NotificationUncheckedCreateInput;
  let outcome: QueueOutcome = "queued";

  if (n.channel === "WHATSAPP") {
    const to = toWhatsAppNumber(n.to);
    if (!to) {
      data = { ...base, to: n.to, status: "FAILED", error: "Invalid phone number" };
      outcome = "invalid";
    } else if (!isTemplateKey(n.template)) {
      throw new TemplateError(`Unknown WhatsApp template "${n.template}"`);
    } else {
      buildTemplateParams(n.template, n.payload); // fail loudly at queue time if the payload is incomplete
      if (!(await isFeatureOn("whatsapp_reminders", n.consultancyId, n.plan, n.clientId))) {
        data = { ...base, to, status: "SKIPPED", error: "whatsapp_reminders switched off" };
        outcome = "skipped";
      } else {
        data = { ...base, to, scheduledFor: nextSendWindow(n.scheduledFor ?? now) };
      }
    }
  } else {
    data = { ...base, to: n.to, scheduledFor: n.scheduledFor ?? now };
  }

  try {
    await db.notification.create({ data });
    return outcome;
  } catch (e) {
    if ((e as { code?: string }).code === "P2002") return "duplicate"; // dedupeKey already used
    throw e;
  }
}

/** For use inside user-facing actions: a notification problem must never block the action itself. */
export async function queueSafely(n: QueueInput, now = new Date()): Promise<QueueOutcome | "error"> {
  try {
    return await queueNotification(n, now);
  } catch (e) {
    console.error(`[notify] could not queue ${n.channel} "${n.template}":`, e instanceof Error ? e.message : e);
    return "error";
  }
}

export interface DeliverySummary { claimed: number; sent: number; retried: number; failed: number; skipped: number; waitingOnConfig: number }

type Row = { id: string; channel: NotificationChannel; to: string; template: string; payload: Prisma.JsonValue; attempts: number; consultancyId: string; clientId: string | null };

export async function deliverPending(opts: { now?: Date; limit?: number; fetchImpl?: typeof fetch } = {}): Promise<DeliverySummary> {
  const now = opts.now ?? new Date();
  const summary: DeliverySummary = { claimed: 0, sent: 0, retried: 0, failed: 0, skipped: 0, waitingOnConfig: 0 };

  // A worker that died mid-send leaves rows in SENDING. Put them back so they are not lost.
  await db.notification.updateMany({ where: { status: "SENDING", claimedAt: { lt: new Date(now.getTime() - STUCK_AFTER_MS) } }, data: { status: "PENDING", claimedAt: null } });

  const candidates = await db.notification.findMany({
    where: { status: "PENDING", scheduledFor: { lte: now } },
    orderBy: { scheduledFor: "asc" },
    take: opts.limit ?? 50,
    select: { id: true, channel: true, to: true, template: true, payload: true, attempts: true, consultancyId: true, clientId: true },
  });

  // Claim one by one. updateMany with a status condition succeeds for exactly one worker per row.
  const claimed: Row[] = [];
  for (const c of candidates) {
    const r = await db.notification.updateMany({ where: { id: c.id, status: "PENDING" }, data: { status: "SENDING", claimedAt: now } });
    if (r.count === 1) claimed.push(c);
  }
  summary.claimed = claimed.length;

  const consultancyCache = new Map<string, { plan: Plan; isDemo: boolean }>();
  const consultancyOf = async (id: string) => {
    let c = consultancyCache.get(id);
    if (!c) {
      c = await db.consultancy.findUniqueOrThrow({ where: { id }, select: { plan: true, isDemo: true } });
      consultancyCache.set(id, c);
    }
    return c;
  };
  const featureCache = new Map<string, boolean>();
  const whatsappOn = async (row: Row): Promise<boolean> => {
    if (!row.clientId) return true;
    const key = `${row.consultancyId}:${row.clientId}`;
    if (!featureCache.has(key)) featureCache.set(key, await isFeatureOn("whatsapp_reminders", row.consultancyId, (await consultancyOf(row.consultancyId)).plan, row.clientId));
    return featureCache.get(key)!;
  };
  const ctx: DeliveryCtx = { whatsappOn, isDemo: async (row) => (await consultancyOf(row.consultancyId)).isDemo };

  const queue = [...claimed];
  const workers = Array.from({ length: Math.min(5, queue.length) }, async () => {
    for (let row = queue.shift(); row; row = queue.shift()) await deliverOne(row, now, summary, ctx, opts.fetchImpl);
  });
  await Promise.all(workers);
  return summary;
}

async function finish(id: string, data: Prisma.NotificationUpdateInput): Promise<void> {
  await db.notification.update({ where: { id }, data: { claimedAt: null, ...data } });
}

interface DeliveryCtx { whatsappOn: (r: Row) => Promise<boolean>; isDemo: (r: Row) => Promise<boolean> }

async function deliverOne(row: Row, now: Date, s: DeliverySummary, { whatsappOn, isDemo }: DeliveryCtx, fetchImpl?: typeof fetch): Promise<void> {
  try {
    if (row.channel === "IN_APP") {
      await finish(row.id, { status: "SENT", sentAt: now, attempts: { increment: 1 } });
      s.sent++;
      return;
    }

    // A demo consultancy has made-up phone numbers that could belong to real people: nothing ever leaves the system.
    if (await isDemo(row)) {
      console.log(`[demo] not sent (demo account): ${row.channel} to=${row.to} ${row.template}`);
      await finish(row.id, { status: "SENT", sentAt: now, attempts: { increment: 1 }, providerMessageId: row.channel === "WHATSAPP" ? `demo-${row.id}` : null });
      s.sent++;
      return;
    }

    if (row.channel === "EMAIL") {
      if ((process.env.EMAIL_PROVIDER ?? "console") !== "console") {
        await finish(row.id, { status: "SKIPPED", error: "No email provider configured" });
        s.skipped++;
        return;
      }
      console.log(`[notify:EMAIL] to=${row.to} template=${row.template}`, JSON.stringify(row.payload));
      await finish(row.id, { status: "SENT", sentAt: now, attempts: { increment: 1 } });
      s.sent++;
      return;
    }

    // WhatsApp from here on.
    if (!(await whatsappOn(row))) {
      await finish(row.id, { status: "SKIPPED", error: "whatsapp_reminders switched off" });
      s.skipped++;
      return;
    }
    if (await db.whatsAppOptOut.findUnique({ where: { phone: row.to } })) {
      await finish(row.id, { status: "SKIPPED", error: "Recipient opted out (replied STOP)" });
      s.skipped++;
      return;
    }
    if (!isTemplateKey(row.template)) throw new TemplateError(`Unknown WhatsApp template "${row.template}"`);

    const provider = process.env.WHATSAPP_PROVIDER ?? "console";
    if (provider === "console") {
      console.log(`[whatsapp:console] to=${row.to} ${row.template}: ${renderTemplateText(row.template, row.payload)}`);
      await finish(row.id, { status: "SENT", sentAt: now, attempts: { increment: 1 }, providerMessageId: `console-${row.id}` });
      s.sent++;
      return;
    }

    const cfg = provider === "cloud" ? cloudConfig() : null;
    if (!cfg) {
      // Misconfiguration is our fault, not the message's: keep it queued instead of burning its retries.
      await finish(row.id, { status: "PENDING", scheduledFor: new Date(now.getTime() + 5 * 60_000), error: "WhatsApp provider not configured" });
      s.waitingOnConfig++;
      return;
    }

    const res = await sendTemplate(cfg, row.to, row.template, row.payload, fetchImpl);
    const attempts = row.attempts + 1;
    if (res.ok) {
      await finish(row.id, { status: "SENT", sentAt: now, attempts, providerMessageId: res.messageId, error: null });
      s.sent++;
    } else if (res.transient && attempts < MAX_ATTEMPTS) {
      await finish(row.id, { status: "PENDING", attempts, scheduledFor: new Date(now.getTime() + retryDelayMs(attempts)), error: res.error });
      s.retried++;
    } else {
      await finish(row.id, { status: "FAILED", attempts, error: res.error });
      s.failed++;
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (e instanceof TemplateError) {
      await finish(row.id, { status: "FAILED", attempts: { increment: 1 }, error: msg });
      s.failed++;
    } else {
      // Unexpected (database blip, etc.): retry later rather than lose the message.
      const attempts = row.attempts + 1;
      await finish(row.id, attempts >= MAX_ATTEMPTS ? { status: "FAILED", attempts, error: msg } : { status: "PENDING", attempts, scheduledFor: new Date(now.getTime() + retryDelayMs(attempts)), error: msg }).catch(() => undefined);
      attempts >= MAX_ATTEMPTS ? s.failed++ : s.retried++;
    }
  }
}
