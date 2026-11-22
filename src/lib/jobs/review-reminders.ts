import { db } from "@/lib/db";
import { loadFeatureCheck } from "@/lib/features/bulk";
import { queueSafely } from "@/lib/notify";
import { needsReviewReminder } from "@/lib/requisition/stages";
import { istDateKey } from "@/lib/time";

/** Nudges a client on WhatsApp when candidate profiles have sat unreviewed for their reminder period. */
export async function runReviewReminders(now = new Date()): Promise<Record<string, number>> {
  const [profiles, isOn] = await Promise.all([
    db.profile.findMany({
      where: { stage: "SUBMITTED", requisition: { status: "OPEN", client: { active: true } } },
      select: { id: true, stage: true, submittedAt: true, lastReminderAt: true, requisition: { select: { id: true, title: true, clientId: true, consultancyId: true, client: { select: { reviewReminderDays: true, consultancy: { select: { name: true, plan: true } } } } } } },
    }),
    loadFeatureCheck(),
  ]);

  const byReq = new Map<string, typeof profiles>();
  for (const p of profiles) if (needsReviewReminder(p, p.requisition.client.reviewReminderDays, now)) byReq.set(p.requisition.id, [...(byReq.get(p.requisition.id) ?? []), p]);

  const out = { requisitions: byReq.size, queued: 0, duplicate: 0, skipped: 0, noContact: 0, featureOff: 0 };
  for (const [reqId, due] of byReq) {
    const req = due[0]!.requisition;
    if (!isOn(req.consultancyId, req.clientId, "requisition_tracker")) {
      out.featureOff++;
      continue;
    }
    const contact = await db.clientContact.findFirst({ where: { clientId: req.clientId, phone: { not: null } }, orderBy: { isPrimary: "desc" } });
    if (!contact?.phone) {
      out.noContact++;
      continue;
    }
    const res = await queueSafely({
      consultancyId: req.consultancyId,
      plan: req.client.consultancy.plan,
      clientId: req.clientId,
      channel: "WHATSAPP",
      to: contact.phone,
      template: "profile_review_reminder",
      payload: { consultancy: req.client.consultancy.name, count: due.length, requisition: req.title },
      dedupeKey: `review:${reqId}:${istDateKey(now)}`,
    }, now);
    if (res === "error") continue; // leave lastReminderAt alone so tomorrow's run tries again
    if (res === "queued") out.queued++;
    else if (res === "duplicate") out.duplicate++;
    else out.skipped++;
    await db.profile.updateMany({ where: { id: { in: due.map((p) => p.id) } }, data: { lastReminderAt: now } });
  }
  return out;
}
