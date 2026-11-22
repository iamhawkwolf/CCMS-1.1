"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireClientUser } from "@/lib/auth/context";
import { isFeatureOn } from "@/lib/features/server";
import { moveProfile } from "@/lib/services/requisition";
import { queueNotification } from "@/lib/notify";
import type { Stage } from "@/lib/requisition/stages";

// Clients may shortlist, reject or ask for an interview. Offers and joining are the consultant's call.
const CLIENT_STAGES: Stage[] = ["SHORTLISTED", "REJECTED", "INTERVIEW_SCHEDULED"];

async function notifyTeam(consultancyId: string, plan: Parameters<typeof queueNotification>[0]["plan"], clientId: string, template: string, payload: Record<string, string | number | null>) {
  const team = await db.clientAssignment.findMany({ where: { clientId }, select: { userId: true } });
  await Promise.all(team.map((t) => queueNotification({ consultancyId, plan, clientId, channel: "IN_APP", to: t.userId, template, payload })));
}

export async function raiseRequisition(form: FormData): Promise<void> {
  const ctx = await requireClientUser();
  if (!(await isFeatureOn("client_portal", ctx.consultancyId, ctx.plan, ctx.clientId)) || !(await isFeatureOn("requisition_tracker", ctx.consultancyId, ctx.plan, ctx.clientId))) redirect("/portal");
  const parsed = z.object({ title: z.string().trim().min(2), openings: z.preprocess(Number, z.number().int().min(1).max(500)), deadline: z.string().optional() }).safeParse(Object.fromEntries(form));
  if (!parsed.success) redirect("/portal?error=Enter+the+role+and+number+of+openings");
  const req = await db.requisition.create({ data: { consultancyId: ctx.consultancyId, clientId: ctx.clientId, title: parsed.data.title, openings: parsed.data.openings, deadline: parsed.data.deadline ? new Date(parsed.data.deadline) : null, source: "PORTAL", createdById: ctx.userId } });
  await notifyTeam(ctx.consultancyId, ctx.plan, ctx.clientId, "requisition_raised", { title: req.title, openings: req.openings });
  revalidatePath("/portal");
}

export async function reviewProfile(requisitionId: string, profileId: string, form: FormData): Promise<void> {
  const ctx = await requireClientUser();
  if (!(await isFeatureOn("client_portal", ctx.consultancyId, ctx.plan, ctx.clientId))) redirect("/portal");
  const to = String(form.get("to")) as Stage;
  if (!CLIENT_STAGES.includes(to)) return;
  const req = await db.requisition.findFirst({ where: { id: requisitionId, clientId: ctx.clientId, consultancyId: ctx.consultancyId } });
  if (!req) return;
  const comment = String(form.get("comment") ?? "").trim() || null;
  const res = await moveProfile(profileId, to, { comment, actorId: ctx.userId, consultancyId: ctx.consultancyId, plan: ctx.plan, clientId: ctx.clientId });
  if (res.ok) await notifyTeam(ctx.consultancyId, ctx.plan, ctx.clientId, "client_reviewed_profile", { requisition: req.title, stage: to, comment });
  revalidatePath(`/portal/requisitions/${requisitionId}`);
}
