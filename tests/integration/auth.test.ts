import { afterAll, beforeEach, describe, expect, it } from "vitest";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { LIMITS, clearHits, isLimited, recordHit } from "@/lib/auth/rate-limit";
import { RESET_TTL_MS, consumeResetToken, createResetToken, hashToken, resetTokenValid } from "@/lib/auth/password-reset";

afterAll(async () => { await db.consultancy.deleteMany(); await db.rateLimitHit.deleteMany(); await db.$disconnect(); });
beforeEach(async () => { await db.consultancy.deleteMany(); await db.rateLimitHit.deleteMany(); });

const makeUser = async (email = "owner@hr.in", isDemo = false, active = true) =>
  db.user.create({ data: { name: "Owner", email, passwordHash: await bcrypt.hash("oldpassword", 4), role: "ADMIN", active, consultancy: { create: { name: `Co ${email}`, isDemo } } } });

describe("rate limit", () => {
  const limit = { max: 3, windowMs: 60_000 };
  const T0 = new Date("2026-11-23T10:00:00Z");

  it("blocks after max hits inside the window and frees up when hits age out", async () => {
    for (let i = 0; i < 3; i++) {
      expect(await isLimited("k", limit, T0)).toBe(false);
      await recordHit("k", T0);
    }
    expect(await isLimited("k", limit, new Date(T0.getTime() + 30_000))).toBe(true);
    expect(await isLimited("k", limit, new Date(T0.getTime() + 61_000))).toBe(false);
    expect(await db.rateLimitHit.count({ where: { key: "k" } })).toBe(0); // old hits were cleaned up
  });

  it("keeps keys separate and can be cleared", async () => {
    for (let i = 0; i < 3; i++) await recordHit("a", T0);
    expect(await isLimited("a", limit, T0)).toBe(true);
    expect(await isLimited("b", limit, T0)).toBe(false);
    await clearHits("a");
    expect(await isLimited("a", limit, T0)).toBe(false);
  });

  it("uses a sign-in limit stricter per email than per address", () => {
    expect(LIMITS.loginEmail.max).toBeLessThan(LIMITS.loginIp.max);
  });
});

describe("password reset", () => {
  const T0 = new Date("2026-11-23T10:00:00Z");

  it("sets the new password once, signs out older sessions, and stores only a hash", async () => {
    const u = await makeUser();
    const made = (await createResetToken("owner@hr.in", T0))!;
    expect(made.user.id).toBe(u.id);
    const row = await db.passwordResetToken.findFirstOrThrow();
    expect(row.tokenHash).toBe(hashToken(made.token));
    expect(row.tokenHash).not.toContain(made.token);

    expect(await resetTokenValid(made.token, T0)).toBe(true);
    expect(await consumeResetToken(made.token, "brandnewpass", T0)).toBe(true);
    const after = await db.user.findUniqueOrThrow({ where: { id: u.id } });
    expect(await bcrypt.compare("brandnewpass", after.passwordHash)).toBe(true);
    expect(await bcrypt.compare("oldpassword", after.passwordHash)).toBe(false);
    expect(after.passwordChangedAt?.toISOString()).toBe(T0.toISOString());

    expect(await resetTokenValid(made.token, T0)).toBe(false);
    expect(await consumeResetToken(made.token, "another-pass", T0)).toBe(false); // link works once
  });

  it("lifts the sign-in lockout for that email", async () => {
    await makeUser();
    for (let i = 0; i < LIMITS.loginEmail.max; i++) await recordHit("login:email:owner@hr.in", T0);
    expect(await isLimited("login:email:owner@hr.in", LIMITS.loginEmail, T0)).toBe(true);
    const made = (await createResetToken("owner@hr.in", T0))!;
    await consumeResetToken(made.token, "brandnewpass", T0);
    expect(await isLimited("login:email:owner@hr.in", LIMITS.loginEmail, T0)).toBe(false);
  });

  it("rejects expired links and unknown tokens", async () => {
    await makeUser();
    const made = (await createResetToken("owner@hr.in", T0))!;
    const late = new Date(T0.getTime() + RESET_TTL_MS + 1000);
    expect(await resetTokenValid(made.token, late)).toBe(false);
    expect(await consumeResetToken(made.token, "brandnewpass", late)).toBe(false);
    expect(await consumeResetToken("not-a-token", "brandnewpass", T0)).toBe(false);
    expect(await bcrypt.compare("oldpassword", (await db.user.findFirstOrThrow()).passwordHash)).toBe(true);
  });

  it("a new request cancels the earlier link", async () => {
    await makeUser();
    const first = (await createResetToken("owner@hr.in", T0))!;
    const second = (await createResetToken("owner@hr.in", T0))!;
    expect(await resetTokenValid(first.token, T0)).toBe(false);
    expect(await resetTokenValid(second.token, T0)).toBe(true);
  });

  it("two simultaneous submits: exactly one wins", async () => {
    await makeUser();
    const made = (await createResetToken("owner@hr.in", T0))!;
    const results = await Promise.all([consumeResetToken(made.token, "winner-one-1", T0), consumeResetToken(made.token, "winner-two-2", T0)]);
    expect(results.filter(Boolean)).toHaveLength(1);
  });

  it("gives nothing for unknown, inactive or demo accounts", async () => {
    await makeUser("gone@hr.in", false, false);
    await makeUser("demo@demo.test", true);
    expect(await createResetToken("nobody@hr.in", T0)).toBeNull();
    expect(await createResetToken("gone@hr.in", T0)).toBeNull();
    expect(await createResetToken("demo@demo.test", T0)).toBeNull();
    expect(await db.passwordResetToken.count()).toBe(0);
  });
});
