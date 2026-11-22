"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { getClientFor, requireStaff, type Ctx } from "@/lib/auth/context";
import { isFeatureOn } from "@/lib/features/server";
import { addProfile, createJd, createShareLink, moveProfile } from "@/lib/services/requisition";
import { STAGES, type Stage } from "@/lib/requisition/stages";
import { audit } from "@/lib/audit";

const num = z.preprocess((v) => (v === "" || v == null ? null : Number(v)), z.number().nonnegative().nullable());
const str = z.string().trim().transform((v) => (v === "" ? null : v)).nullable().optional();

async function loadReq(ctx: Ctx, id: string) {
  const req = await db.requisition.findFirst({ where: { id, consultancyId: ctx.consultancyId } });
  if (!req || !(await getClientFor(ctx, req.clientId))) return null;
  if (!(await isFeatureOn("requisition_tracker", ctx.consultancyId, ctx.plan, req.clientId))) return null;
  return req;
}

export async function createRequisition(form: FormData): Promise<void> {
  const ctx = await requireStaff();
  const parsed = z
    .object({ clientId: z.string().min(1), title: z.string().trim().min(2, "Enter the role"), openings: z.preprocess(Number, z.number().int().min(1).max(500)), budgetMin: num, budgetMax: num, deadline: str })
    .safeParse(Object.fromEntries(form));
  if (!parsed.success) redirect(`/app/requisitions/new?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Check the form")}`);

  const client = await getClientFor(ctx, parsed.data.clientId);
  if (!client || !(await isFeatureOn("requisition_tracker", ctx.consultancyId, ctx.plan, client.id))) redirect("/app/requisitions/new?error=Requisitions+are+switched+off+for+that+client");

  const { clientId: _c, deadline, ...rest } = parsed.data;
  const req = await db.requisition.create({ data: { ...rest, deadline: deadline ? new Date(deadline) : null, consultancyId: ctx.consultancyId, clientId: client.id, createdById: ctx.userId, source: "CONSULTANT" } });
  await audit(ctx.consultancyId, ctx.userId, "requisition.create", "Requisition", req.id);
  redirect(`/app/requisitions/${req.id}`);
}

export async function submitProfile(requisitionId: string, form: FormData): Promise<void> {
  const ctx = await requireStaff();
  const req = await loadReq(ctx, requisitionId);
  if (!req) redirect("/app/requisitions");
  const parsed = z
    .object({ name: z.string().trim().min(2, "Enter the candidate's name"), phone: str, email: z.string().trim().email().or(z.literal("")).transform((v) => v || null).optional(), currentCompany: str, experienceYears: num, currentCtc: num, expectedCtc: num, noticeDays: num, resumeUrl: str })
    .safeParse(Object.fromEntries(form));
  if (!parsed.success) redirect(`/app/requisitions/${requisitionId}?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Check the profile details")}`);

  const res = await addProfile(req, ctx.plan, parsed.data, ctx.userId);
  if (!res.ok) redirect(`/app/requisitions/${requisitionId}?error=${encodeURIComponent(res.error)}`);
  revalidatePath(`/app/requisitions/${requisitionId}`);
  redirect(`/app/requisitions/${requisitionId}${res.warning ? `?notice=${encodeURIComponent(res.warning)}` : ""}`);
}

export async function changeStage(requisitionId: string, profileId: string, form: FormData): Promise<void> {
  const ctx = await requireStaff();
  const req = await loadReq(ctx, requisitionId);
  const to = String(form.get("to"));
  if (!req || !(STAGES as readonly string[]).includes(to)) return;
  const at = String(form.get("interviewAt") ?? "");
  const res = await moveProfile(profileId, to as Stage, { comment: String(form.get("comment") ?? "").trim() || null, actorId: ctx.userId, interviewAt: at ? new Date(at) : null, consultancyId: ctx.consultancyId, plan: ctx.plan, clientId: req.clientId });
  if (!res.ok) redirect(`/app/requisitions/${requisitionId}?error=${encodeURIComponent(res.error ?? "Could not move profile")}`);
  revalidatePath(`/app/requisitions/${requisitionId}`);
}

export async function addJd(requisitionId: string, form: FormData): Promise<void> {
  const ctx = await requireStaff();
  const req = await loadReq(ctx, requisitionId);
  const text = String(form.get("text") ?? "").trim();
  if (!req || text.length < 20) redirect(`/app/requisitions/${requisitionId}?error=${encodeURIComponent("Paste the full JD text (at least 20 characters)")}`);
  const { maskedCount } = await createJd(req, ctx.plan, text, ctx.name, ctx.userId);
  await audit(ctx.consultancyId, ctx.userId, "jd.create", "Requisition", req.id, { maskedCount });
  revalidatePath(`/app/requisitions/${requisitionId}`);
}

/** Consultant reviews the masked text (can edit it), approves, and gets a tracked link. */
export async function approveAndShare(requisitionId: string, jdId: string, form: FormData): Promise<void> {
  const ctx = await requireStaff();
  const req = await loadReq(ctx, requisitionId);
  const jd = req ? await db.jobDescription.findFirst({ where: { id: jdId, requisitionId } }) : null;
  if (!req || !jd) return;
  const days = Number(form.get("days") ?? 0);
  await db.jobDescription.update({ where: { id: jdId }, data: { maskedText: String(form.get("maskedText") ?? jd.maskedText), approved: true } });
  await createShareLink(jdId, ctx.userId, days > 0 ? Math.min(days, 365) : null);
  await audit(ctx.consultancyId, ctx.userId, "jd.share", "JobDescription", jdId);
  revalidatePath(`/app/requisitions/${requisitionId}`);
}

export async function revokeLink(requisitionId: string, linkId: string): Promise<void> {
  const ctx = await requireStaff();
  const req = await loadReq(ctx, requisitionId);
  if (!req) return;
  await db.shareLink.updateMany({ where: { id: linkId, jd: { requisitionId } }, data: { revokedAt: new Date() } });
  revalidatePath(`/app/requisitions/${requisitionId}`);
}
