import type { Client } from "@prisma/client";
import { db } from "@/lib/db";
import { defaultWindow, generateComplianceTasks } from "@/lib/compliance/generate";

/**
 * Creates compliance tasks for a client over the next 3 months. Safe to call repeatedly:
 * sourceKey is unique, so existing tasks are skipped, never duplicated.
 */
export async function ensureComplianceTasks(client: Client, assigneeId: string | null, now = new Date()): Promise<number> {
  const { from, to } = defaultWindow(now);
  const generated = generateComplianceTasks(
    { id: client.id, state: client.state, pf: !!client.pfNumber, esi: !!client.esiNumber, pt: !!client.ptNumber, tds: !!client.tan, lwf: !!client.lwfNumber },
    from,
    to,
  );
  if (!generated.length) return 0;
  const res = await db.task.createMany({
    skipDuplicates: true,
    data: generated.map((g) => ({
      consultancyId: client.consultancyId,
      clientId: client.id,
      title: g.title,
      description: g.verified ? null : "Due date comes from a seed rule that has not been confirmed with your CA yet.",
      dueDate: g.dueDate,
      assigneeId,
      complianceKind: g.kind,
      period: g.period,
      sourceKey: g.sourceKey,
    })),
  });
  return res.count;
}
