import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";

export async function audit(consultancyId: string, userId: string | null, action: string, entity: string, entityId?: string, meta?: Prisma.InputJsonValue): Promise<void> {
  await db.auditLog.create({ data: { consultancyId, userId, action, entity, entityId, meta } });
}
