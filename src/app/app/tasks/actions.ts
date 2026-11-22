"use server";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getClientFor, requireStaff } from "@/lib/auth/context";
import { audit } from "@/lib/audit";

export async function completeTask(taskId: string): Promise<void> {
  const ctx = await requireStaff();
  const task = await db.task.findFirst({ where: { id: taskId, consultancyId: ctx.consultancyId } });
  if (!task || !(await getClientFor(ctx, task.clientId))) return;
  await db.task.update({ where: { id: taskId }, data: { status: "DONE", completedAt: new Date() } });
  await audit(ctx.consultancyId, ctx.userId, "task.complete", "Task", taskId);
  revalidatePath("/app", "layout");
}
