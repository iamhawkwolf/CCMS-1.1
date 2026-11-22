import { db } from "@/lib/db";
import { loadFeatureCheck } from "@/lib/features/bulk";
import { ensureComplianceTasks } from "@/lib/services/compliance";

/** Keeps every client's compliance calendar filled three months ahead. Idempotent: existing tasks are never duplicated. */
export async function runCalendarRollover(now = new Date()): Promise<Record<string, number>> {
  const [clients, isOn] = await Promise.all([
    db.client.findMany({ where: { active: true }, include: { assignments: { take: 1, select: { userId: true } } } }),
    loadFeatureCheck(),
  ]);
  const out = { clients: clients.length, tasksCreated: 0, featureOff: 0 };
  for (const c of clients) {
    if (!isOn(c.consultancyId, c.id, "compliance_calendar")) {
      out.featureOff++;
      continue;
    }
    out.tasksCreated += await ensureComplianceTasks(c, c.assignments[0]?.userId ?? null, now);
  }
  return out;
}
