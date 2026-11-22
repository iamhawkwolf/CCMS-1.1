import { randomBytes } from "node:crypto";
import type { Plan } from "@prisma/client";
import { db } from "@/lib/db";
import { isFeatureOn } from "@/lib/features/server";
import { maskContactDetails } from "@/lib/jd/mask";
import { queueSafely } from "@/lib/notify";
import { canMove, emailKey, phoneKey, type Stage, STAGE_LABEL } from "@/lib/requisition/stages";

export interface ProfileInput {
  name: string;
  phone?: string | null;
  email?: string | null;
  currentCompany?: string | null;
  experienceYears?: number | null;
  currentCtc?: number | null;
  expectedCtc?: number | null;
  noticeDays?: number | null;
  resumeUrl?: string | null;
}

export type AddProfileResult =
  | { ok: true; profileId: string; warning?: string }
  | { ok: false; error: string };

/**
 * Duplicate rules:
 *  - same phone or email already on THIS requisition -> blocked
 *  - same phone or email on another requisition of the SAME client -> allowed, with a warning
 *  - same person at a different client is fine (a candidate can legitimately interview at several)
 */
export async function addProfile(req: { id: string; clientId: string; consultancyId: string; title: string }, plan: Plan, input: ProfileInput, actorId: string): Promise<AddProfileResult> {
  const pk = phoneKey(input.phone);
  const ek = emailKey(input.email);
  const keyFilter = [...(pk ? [{ phoneKey: pk }] : []), ...(ek ? [{ emailKey: ek }] : [])];

  let warning: string | undefined;
  if (keyFilter.length) {
    const dupes = await db.profile.findMany({ where: { OR: keyFilter, requisition: { clientId: req.clientId } }, include: { requisition: { select: { id: true, title: true } } } });
    if (dupes.some((d) => d.requisitionId === req.id)) return { ok: false, error: "This candidate is already on this requisition (same phone or email)." };
    if (dupes.length) warning = `Already submitted to this client for "${dupes[0]!.requisition.title}".`;
  }

  const profile = await db.profile.create({
    data: {
      requisitionId: req.id,
      name: input.name,
      phone: input.phone,
      email: input.email,
      phoneKey: pk,
      emailKey: ek,
      currentCompany: input.currentCompany,
      experienceYears: input.experienceYears,
      currentCtc: input.currentCtc,
      expectedCtc: input.expectedCtc,
      noticeDays: input.noticeDays,
      resumeUrl: input.resumeUrl,
      events: { create: { toStage: "SUBMITTED", actorId, comment: "Profile submitted" } },
    },
  });

  const contact = await db.clientContact.findFirst({ where: { clientId: req.clientId, phone: { not: null } }, orderBy: { isPrimary: "desc" } });
  if (contact?.phone) {
    const consultancy = await db.consultancy.findUniqueOrThrow({ where: { id: req.consultancyId }, select: { name: true } });
    await queueSafely({ consultancyId: req.consultancyId, plan, clientId: req.clientId, channel: "WHATSAPP", to: contact.phone, template: "new_profile_submitted", payload: { consultancy: consultancy.name, requisition: req.title, candidate: input.name }, dedupeKey: `profile-submitted:${profile.id}` });
  }
  return { ok: true, profileId: profile.id, warning };
}

export async function moveProfile(profileId: string, to: Stage, opts: { comment?: string | null; actorId: string; interviewAt?: Date | null; notifyUserId?: string | null; consultancyId: string; plan: Plan; clientId: string }): Promise<{ ok: boolean; error?: string }> {
  const profile = await db.profile.findUnique({ where: { id: profileId }, include: { requisition: true } });
  if (!profile || profile.requisition.consultancyId !== opts.consultancyId || profile.requisition.clientId !== opts.clientId) return { ok: false, error: "Profile not found" };
  if (!canMove(profile.stage, to)) return { ok: false, error: `Cannot move from ${STAGE_LABEL[profile.stage]} to ${STAGE_LABEL[to]}` };

  await db.$transaction(async (tx) => {
    await tx.profile.update({ where: { id: profileId }, data: { stage: to, stageChangedAt: new Date(), clientComment: opts.comment ?? profile.clientComment } });
    await tx.profileEvent.create({ data: { profileId, fromStage: profile.stage, toStage: to, comment: opts.comment, actorId: opts.actorId } });
    if (to === "INTERVIEW_SCHEDULED" && opts.interviewAt) await tx.interview.create({ data: { profileId, scheduledAt: opts.interviewAt } });

    // Close the requisition automatically once every opening is filled.
    if (to === "JOINED") {
      const joined = (await tx.profile.count({ where: { requisitionId: profile.requisitionId, stage: "JOINED" } }));
      if (joined >= profile.requisition.openings) await tx.requisition.update({ where: { id: profile.requisitionId }, data: { status: "CLOSED", closedAt: new Date() } });
    }
  });

  if (opts.notifyUserId) {
    await queueSafely({ consultancyId: opts.consultancyId, plan: opts.plan, clientId: opts.clientId, channel: "IN_APP", to: opts.notifyUserId, template: "profile_stage_changed", payload: { candidate: profile.name, requisition: profile.requisition.title, stage: to, comment: opts.comment ?? null } });
  }
  return { ok: true };
}

/** Creates a JD, masking contact details and naming the consultant, each only if that switch is on for the client. */
export async function createJd(req: { id: string; clientId: string; consultancyId: string }, plan: Plan, text: string, consultantName: string, actorId: string) {
  const [mask, watermark] = await Promise.all([isFeatureOn("number_masking", req.consultancyId, plan, req.clientId), isFeatureOn("jd_watermark", req.consultancyId, plan, req.clientId)]);
  const masked = mask ? maskContactDetails(text) : { text, matches: [] };
  const jd = await db.jobDescription.create({ data: { requisitionId: req.id, originalText: text, maskedText: masked.text, watermarkName: watermark ? consultantName : null, createdById: actorId } });
  return { jd, maskedCount: masked.matches.length };
}

export async function createShareLink(jdId: string, actorId: string, expiresInDays: number | null) {
  const token = randomBytes(24).toString("base64url");
  const expiresAt = expiresInDays ? new Date(Date.now() + expiresInDays * 86400000) : null;
  return db.shareLink.create({ data: { token, jdId, expiresAt, createdById: actorId } });
}
