import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { loadFeatureCheck } from "@/lib/features/bulk";
import { queueSafely } from "@/lib/notify";
import { addDays, daysUntil, formatDate, istToday } from "@/lib/time";
import { complianceBucket, STOP_AFTER_OVERDUE_DAYS, whenLabel } from "./rules";

/** Alerts the person responsible when a task is due soon or overdue. Overdue also goes to the admins. */
export async function runComplianceAlerts(now = new Date()): Promise<Record<string, number>> {
  const horizon = addDays(istToday(now), 7);
  const earliest = addDays(istToday(now), -STOP_AFTER_OVERDUE_DAYS);
  const [tasks, admins, isOn] = await Promise.all([
    db.task.findMany({
      where: { status: { not: "DONE" }, dueDate: { lte: horizon, gte: earliest }, client: { active: true } },
      include: { client: { select: { id: true, name: true } }, assignee: { select: { id: true, phone: true, active: true } }, consultancy: { select: { id: true, name: true, plan: true } } },
    }),
    db.user.findMany({ where: { role: "ADMIN", active: true }, select: { id: true, phone: true, consultancyId: true } }),
    loadFeatureCheck(),
  ]);

  const adminsOf = new Map<string, typeof admins>();
  for (const a of admins) adminsOf.set(a.consultancyId, [...(adminsOf.get(a.consultancyId) ?? []), a]);

  const out = { tasks: tasks.length, queued: 0, duplicate: 0, skipped: 0, featureOff: 0 };
  for (const t of tasks) {
    const days = daysUntil(t.dueDate, now);
    const bucket = complianceBucket(days);
    if (!bucket) continue;
    if (!isOn(t.consultancyId, t.clientId, "compliance_calendar")) {
      out.featureOff++;
      continue;
    }

    // Who hears about it: the owner, or the admins if nobody owns it; admins also hear about anything overdue.
    const recipients = new Map<string, { id: string; phone: string | null }>();
    if (t.assignee?.active) recipients.set(t.assignee.id, { id: t.assignee.id, phone: t.assignee.phone });
    if (!t.assignee?.active || bucket.kind === "overdue") for (const a of adminsOf.get(t.consultancyId) ?? []) recipients.set(a.id, { id: a.id, phone: a.phone });

    const when = whenLabel(days);
    const dueDate = formatDate(t.dueDate);
    for (const r of recipients.values()) {
      const base = { consultancyId: t.consultancyId, plan: t.consultancy.plan, clientId: t.clientId };
      const key = `ca:${t.id}:${bucket.key}:${r.id}`;
      const app: Prisma.InputJsonValue = { title: t.title, client: t.client.name, dueDate, when, href: `/app/clients/${t.clientId}` };
      const results = [await queueSafely({ ...base, channel: "IN_APP", to: r.id, template: "compliance_alert", payload: app, dedupeKey: `${key}:app` }, now)];
      if (r.phone) results.push(await queueSafely({ ...base, channel: "WHATSAPP", to: r.phone, template: "compliance_alert", payload: { consultancy: t.consultancy.name, title: t.title, client: t.client.name, dueDate, when }, dedupeKey: `${key}:wa` }, now));
      for (const res of results) {
        if (res === "queued") out.queued++;
        else if (res === "duplicate") out.duplicate++;
        else out.skipped++;
      }
    }
  }
  return out;
}
