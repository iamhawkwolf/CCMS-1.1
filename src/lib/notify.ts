// Notification outbox. Features queue messages here; a worker (cron or queue) calls deliverPending().
// V1 ships a "console" provider so everything is testable without a WhatsApp account.
// To go live: implement WhatsApp Business API sending in `send()` using pre-approved templates.
import type { NotificationChannel, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { isFeatureOn } from "@/lib/features/server";
import type { Plan } from "@prisma/client";

export interface QueueInput {
  consultancyId: string;
  plan: Plan;
  clientId?: string | null;
  channel: NotificationChannel;
  to: string;
  template: string; // e.g. "profile_review_reminder"
  payload: Prisma.InputJsonValue;
  scheduledFor?: Date;
}

/** Queues a message. WhatsApp is skipped (not deleted) when the client's WhatsApp switch is off. */
export async function queueNotification(n: QueueInput): Promise<void> {
  if (n.channel === "WHATSAPP" && !(await isFeatureOn("whatsapp_reminders", n.consultancyId, n.plan, n.clientId))) {
    await db.notification.create({
      data: { consultancyId: n.consultancyId, clientId: n.clientId, channel: n.channel, to: n.to, template: n.template, payload: n.payload, status: "SKIPPED", error: "whatsapp_reminders switched off" },
    });
    return;
  }
  await db.notification.create({
    data: { consultancyId: n.consultancyId, clientId: n.clientId, channel: n.channel, to: n.to, template: n.template, payload: n.payload, scheduledFor: n.scheduledFor ?? new Date() },
  });
}

async function send(channel: NotificationChannel, to: string, template: string, payload: unknown): Promise<void> {
  const provider = process.env.NOTIFY_PROVIDER ?? "console";
  if (provider === "console") {
    console.log(`[notify:${channel}] to=${to} template=${template}`, JSON.stringify(payload));
    return;
  }
  throw new Error(`Unknown NOTIFY_PROVIDER "${provider}"`);
}

export async function deliverPending(limit = 50): Promise<{ sent: number; failed: number }> {
  const due = await db.notification.findMany({ where: { status: "PENDING", scheduledFor: { lte: new Date() } }, orderBy: { scheduledFor: "asc" }, take: limit });
  let sent = 0;
  let failed = 0;
  for (const n of due) {
    try {
      await send(n.channel, n.to, n.template, n.payload);
      await db.notification.update({ where: { id: n.id }, data: { status: "SENT", sentAt: new Date() } });
      sent++;
    } catch (e) {
      await db.notification.update({ where: { id: n.id }, data: { status: "FAILED", error: e instanceof Error ? e.message : String(e) } });
      failed++;
    }
  }
  return { sent, failed };
}
