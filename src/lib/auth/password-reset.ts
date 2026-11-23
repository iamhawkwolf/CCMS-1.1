import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";

export const RESET_TTL_MS = 60 * 60_000;
export const hashToken = (token: string): string => createHash("sha256").update(token).digest("hex");

/**
 * Makes a one-hour reset link token for an active user and cancels their earlier ones.
 * Returns null for an unknown, inactive or demo account (the caller must not reveal which).
 */
export async function createResetToken(email: string, now = new Date()): Promise<{ token: string; user: { id: string; name: string; email: string } } | null> {
  const user = await db.user.findUnique({ where: { email }, include: { consultancy: { select: { isDemo: true } } } });
  // Demo logins have a public password; they are rebuilt by "reset demo data", never by email.
  if (!user || !user.active || user.consultancy.isDemo) return null;
  const token = randomBytes(32).toString("base64url");
  await db.$transaction([
    db.passwordResetToken.deleteMany({ where: { OR: [{ userId: user.id }, { expiresAt: { lt: now } }] } }),
    db.passwordResetToken.create({ data: { userId: user.id, tokenHash: hashToken(token), expiresAt: new Date(now.getTime() + RESET_TTL_MS) } }),
  ]);
  return { token, user: { id: user.id, name: user.name, email: user.email } };
}

/** True when the link is real, unused and unexpired. */
export async function resetTokenValid(token: string, now = new Date()): Promise<boolean> {
  const row = await db.passwordResetToken.findUnique({ where: { tokenHash: hashToken(token) } });
  return !!row && !row.usedAt && row.expiresAt > now;
}

/** Sets the new password, burns the link and signs the user out everywhere. False if the link is not usable. */
export async function consumeResetToken(token: string, password: string, now = new Date()): Promise<boolean> {
  const hash = hashToken(token);
  const passwordHash = await bcrypt.hash(password, 11);
  return db.$transaction(async (tx) => {
    // Atomic claim: only one of two simultaneous submits can win.
    const claimed = await tx.passwordResetToken.updateMany({ where: { tokenHash: hash, usedAt: null, expiresAt: { gt: now } }, data: { usedAt: now } });
    if (claimed.count !== 1) return false;
    const row = await tx.passwordResetToken.findUniqueOrThrow({ where: { tokenHash: hash } });
    const user = await tx.user.update({ where: { id: row.userId }, data: { passwordHash, passwordChangedAt: now } });
    // Proving control of the mailbox lifts a sign-in lockout, otherwise the new password could not be used for 15 minutes.
    await tx.rateLimitHit.deleteMany({ where: { key: `login:email:${user.email}` } });
    await tx.passwordResetToken.deleteMany({ where: { userId: row.userId, id: { not: row.id } } });
    return true;
  });
}
