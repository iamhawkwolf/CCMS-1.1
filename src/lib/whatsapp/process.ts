import { db } from "@/lib/db";
import { advanceStatus, isStartMessage, isStopMessage, type DeliveryStatus, type InboundMessage, type StatusUpdate } from "./webhook";

export interface WebhookResult { statusesApplied: number; optedOut: number; optedIn: number; cancelled: number }

/** Applies delivery receipts and STOP/START replies from Meta's webhook. */
export async function processWebhook(parsed: { statuses: StatusUpdate[]; messages: InboundMessage[] }, now = new Date()): Promise<WebhookResult> {
  const out: WebhookResult = { statusesApplied: 0, optedOut: 0, optedIn: 0, cancelled: 0 };

  for (const s of parsed.statuses) {
    const n = await db.notification.findUnique({ where: { providerMessageId: s.id }, select: { id: true, status: true } });
    if (!n) continue; // not ours (or already purged)
    const next = advanceStatus(n.status as DeliveryStatus, s.status);
    if (!next) continue;
    await db.notification.update({
      where: { id: n.id },
      data: { status: next, ...(next === "READ" ? { readAt: now } : {}), ...(next === "FAILED" ? { error: `WhatsApp ${s.errorCode ?? ""}: ${s.errorTitle ?? "delivery failed"}`.trim() } : {}) },
    });
    out.statusesApplied++;
  }

  for (const m of parsed.messages) {
    const phone = m.from.replace(/\D/g, "");
    if (isStopMessage(m.text)) {
      await db.whatsAppOptOut.upsert({ where: { phone }, create: { phone, reason: "Replied STOP" }, update: {} });
      // Anything already waiting for this number must not go out.
      const c = await db.notification.updateMany({ where: { channel: "WHATSAPP", to: phone, status: "PENDING" }, data: { status: "SKIPPED", error: "Recipient opted out (replied STOP)" } });
      out.optedOut++;
      out.cancelled += c.count;
    } else if (isStartMessage(m.text)) {
      const d = await db.whatsAppOptOut.deleteMany({ where: { phone } });
      out.optedIn += d.count;
    }
  }
  return out;
}
