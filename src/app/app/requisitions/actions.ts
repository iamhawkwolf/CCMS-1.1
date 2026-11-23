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
import { randomUUID } from "node:crypto";
import { detectKind, extractText, MAX_RESUME_BYTES, MIME } from "@/lib/resume/file";
import { parseResume } from "@/lib/resume/parse";
import { getStore } from "@/lib/storage";

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
    .object({ name: z.string().trim().min(2, "Enter the candidate's name"), phone: str, email: z.string().trim().email().or(z.literal("")).transform((v) => v || null).optional(), currentCompany: str, experienceYears: num, currentCtc: num, expectedCtc: num, noticeDays: num, resumeUrl: str, uploadId: str })
    .safeParse(Object.fromEntries(form));
  if (!parsed.success) redirect(`/app/requisitions/${requisitionId}?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Check the profile details")}`);

  const { uploadId, ...input } = parsed.data;
  const upload = uploadId ? await db.resumeUpload.findFirst({ where: { id: uploadId, consultancyId: ctx.consultancyId, requisitionId } }) : null;
  const res = await addProfile(req, ctx.plan, { ...input, resumeKey: upload?.key, resumeName: upload?.fileName }, ctx.userId);
  if (upload && res.ok) await db.resumeUpload.delete({ where: { id: upload.id } });
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

/** Reads an uploaded PDF or Word resume and sends the consultant back to the form with fields pre-filled. */
export async function uploadResume(requisitionId: string, form: FormData): Promise<void> {
  const ctx = await requireStaff();
  const req = await loadReq(ctx, requisitionId);
  if (!req) redirect("/app/requisitions");
  const back = (q: string) => redirect(`/app/requisitions/${requisitionId}?${q}`);
  const file = form.get("resume");
  if (!(file instanceof File) || file.size === 0) back("error=" + encodeURIComponent("Choose a PDF or Word file"));
  const f = file as File;
  if (f.size > MAX_RESUME_BYTES) back("error=" + encodeURIComponent("File is over 4 MB. Compress it or use the resume link field."));
  const buf = Buffer.from(await f.arrayBuffer());
  const kind = detectKind(buf);
  if (!kind) back("error=" + encodeURIComponent("Only PDF and Word (.docx) resumes are accepted"));

  let text = "";
  try { text = await extractText(buf, kind!); } catch { /* unreadable: fall through to manual entry */ }

  const key = `${ctx.consultancyId}/resumes/${randomUUID()}.${kind}`;
  try { await getStore().put(key, buf, MIME[kind!]); } catch (e) { back("error=" + encodeURIComponent(e instanceof Error ? e.message : "Could not store the file")); }
  const extracted = parseResume(text);
  const up = await db.resumeUpload.create({ data: { consultancyId: ctx.consultancyId, requisitionId, key, fileName: f.name.slice(0, 120), size: buf.length, extracted: { ...extracted }, createdById: ctx.userId } });
  await audit(ctx.consultancyId, ctx.userId, "resume.upload", "ResumeUpload", up.id);
  const note = text.trim().length < 40 ? "&notice=" + encodeURIComponent("Could not read text from this file (it may be a scan). Fill the details in by hand; the file is still attached.") : "";
  back(`upload=${up.id}${note}`);
}
