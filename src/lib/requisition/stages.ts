export type Stage = "SUBMITTED" | "SHORTLISTED" | "INTERVIEW_SCHEDULED" | "OFFERED" | "JOINED" | "REJECTED";

export const STAGES: readonly Stage[] = ["SUBMITTED", "SHORTLISTED", "INTERVIEW_SCHEDULED", "OFFERED", "JOINED", "REJECTED"];

export const STAGE_LABEL: Record<Stage, string> = {
  SUBMITTED: "Submitted",
  SHORTLISTED: "Shortlisted",
  INTERVIEW_SCHEDULED: "Interview scheduled",
  OFFERED: "Offered",
  JOINED: "Joined",
  REJECTED: "Rejected",
};

// A profile moves forward one step at a time; REJECTED is reachable from any open stage.
// The client can also ask for an interview straight from SUBMITTED ("request interview" in one click).
const NEXT: Record<Stage, Stage[]> = {
  SUBMITTED: ["SHORTLISTED", "INTERVIEW_SCHEDULED", "REJECTED"],
  SHORTLISTED: ["INTERVIEW_SCHEDULED", "REJECTED"],
  INTERVIEW_SCHEDULED: ["OFFERED", "REJECTED"],
  OFFERED: ["JOINED", "REJECTED"],
  JOINED: [],
  REJECTED: [],
};

export function allowedNextStages(from: Stage): Stage[] {
  return NEXT[from];
}

export function canMove(from: Stage, to: Stage): boolean {
  return NEXT[from].includes(to);
}

export const isTerminal = (s: Stage): boolean => NEXT[s].length === 0;

/** Stages in which a profile is waiting on the client to act. */
export const AWAITING_CLIENT: readonly Stage[] = ["SUBMITTED"];

export interface PendingProfile {
  stage: Stage;
  submittedAt: Date;
  lastReminderAt: Date | null;
}

/**
 * A reminder is due when a profile has sat in SUBMITTED for `afterDays`,
 * and we have not already reminded within the last `afterDays`.
 */
export function needsReviewReminder(p: PendingProfile, afterDays: number, now: Date): boolean {
  if (!AWAITING_CLIENT.includes(p.stage)) return false;
  const ms = afterDays * 24 * 60 * 60 * 1000;
  if (now.getTime() - p.submittedAt.getTime() < ms) return false;
  if (p.lastReminderAt && now.getTime() - p.lastReminderAt.getTime() < ms) return false;
  return true;
}

/** Normalise for duplicate detection: digits only, last 10 digits. */
export function phoneKey(phone?: string | null): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 10) return null;
  return digits.slice(-10);
}

export function emailKey(email?: string | null): string | null {
  const e = email?.trim().toLowerCase();
  return e ? e : null;
}
