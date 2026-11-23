// A match result travels from the match screen to "Submit to client" in the browser.
// Signing it means the score saved on a profile is one the server really produced for that
// requisition, not a number someone typed into the form.
import { createHmac, timingSafeEqual } from "node:crypto";
import type { MatchResult } from "./match";

export interface SavedMatch {
  score: number;
  method: MatchResult["method"];
  detail: {
    band: MatchResult["band"];
    rulesScore: number;
    aiScore: number | null;
    breakdown: MatchResult["breakdown"];
    matchedSkills: string[];
    missingSkills: string[];
    transferable: string[];
    summary: string | null;
    warnings: string[];
  };
}

interface Payload extends SavedMatch {
  /** requisition id */
  r: string;
  /** issued at, ms */
  t: number;
}

/** How long a result can wait on the screen before it must be re-run. */
export const TOKEN_MAX_AGE_MS = 24 * 60 * 60 * 1000;

function key(): string {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 16) {
    if (process.env.NODE_ENV === "production") throw new Error("SESSION_SECRET must be set (16+ characters)");
    return "dev-only-insecure-secret-change-me";
  }
  return s;
}

const mac = (body: string) => createHmac("sha256", `resume-match:${key()}`).update(body).digest("base64url");

export function toSavedMatch(m: MatchResult): SavedMatch {
  return {
    score: m.score,
    method: m.method,
    detail: { band: m.band, rulesScore: m.rulesScore, aiScore: m.aiScore, breakdown: m.breakdown, matchedSkills: m.matchedSkills, missingSkills: m.missingSkills, transferable: m.transferable, summary: m.summary, warnings: m.warnings },
  };
}

export function signMatch(requisitionId: string, match: MatchResult, now = Date.now()): string {
  const body = Buffer.from(JSON.stringify({ ...toSavedMatch(match), r: requisitionId, t: now } satisfies Payload)).toString("base64url");
  return `${body}.${mac(body)}`;
}

/** Returns the saved match only if the signature is valid, it was issued for this requisition, and it is fresh. */
export function verifyMatch(token: string, requisitionId: string, now = Date.now()): SavedMatch | null {
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = Buffer.from(mac(body));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, "base64url").toString()) as Payload;
    if (p.r !== requisitionId || now - p.t > TOKEN_MAX_AGE_MS || now < p.t - 60_000) return null;
    if (!Number.isInteger(p.score) || p.score < 0 || p.score > 100) return null;
    const { r: _r, t: _t, ...saved } = p;
    return saved;
  } catch {
    return null;
  }
}
