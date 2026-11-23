"use server";
import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { createSession, destroySession } from "@/lib/auth/session";
import { signupOpen } from "@/lib/demo/mode";
import { LIMITS, clearHits, isLimited, recordHit, requestIp } from "@/lib/auth/rate-limit";
import { consumeResetToken, createResetToken } from "@/lib/auth/password-reset";
import { sendEmail } from "@/lib/email";
import type { AuthState } from "@/components/auth-form";

const loginSchema = z.object({ email: z.string().trim().toLowerCase().pipe(z.email()), password: z.string().min(1) });

const signupSchema = z.object({
  consultancy: z.string().trim().min(2, "Enter your consultancy name"),
  name: z.string().trim().min(2, "Enter your name"),
  email: z.string().trim().toLowerCase().pipe(z.email("Enter a valid email")),
  password: z.string().min(8, "Password needs at least 8 characters"),
});

// Compared against when the email is unknown, so a missing account takes as long to reject as a wrong password.
const DUMMY_HASH = bcrypt.hashSync("not-a-real-password", 11);

export async function login(_: AuthState, form: FormData): Promise<AuthState> {
  const keep = { email: String(form.get("email") ?? "") };
  const parsed = loginSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: "Enter your email and password", values: keep };

  const ip = await requestIp();
  const emailKey = `login:email:${parsed.data.email}`;
  const ipKey = ip ? `login:ip:${ip}` : null;
  if ((await isLimited(emailKey, LIMITS.loginEmail)) || (ipKey && (await isLimited(ipKey, LIMITS.loginIp)))) {
    return { error: "Too many sign-in attempts. Wait 15 minutes, or reset your password.", values: keep };
  }

  const user = await db.user.findUnique({ where: { email: parsed.data.email } });
  const ok = await bcrypt.compare(parsed.data.password, user?.passwordHash ?? DUMMY_HASH);
  // Same message for unknown email and wrong password, so accounts cannot be probed.
  if (!user || !user.active || !ok) {
    await recordHit(emailKey);
    if (ipKey) await recordHit(ipKey);
    return { error: "Email or password is incorrect", values: keep };
  }
  await clearHits(emailKey);
  await createSession(user.id);
  redirect(user.role === "CLIENT_USER" ? "/portal" : "/app");
}

export async function signup(_: AuthState, form: FormData): Promise<AuthState> {
  if (!signupOpen()) return { error: "Sign-up is by invitation only" };
  const keep = { consultancy: String(form.get("consultancy") ?? ""), name: String(form.get("name") ?? ""), email: String(form.get("email") ?? "") };
  const parsed = signupSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the form and try again", values: keep };
  const { consultancy, name, email, password } = parsed.data;
  if (await db.user.findUnique({ where: { email } })) return { error: "An account with this email already exists", values: keep };

  const user = await db.consultancy.create({
    data: { name: consultancy, users: { create: { name, email, passwordHash: await bcrypt.hash(password, 11), role: "ADMIN" } } },
    include: { users: true },
  });
  await createSession(user.users[0]!.id);
  redirect("/app");
}

const RESET_NOTICE = "If that email has an account, we have sent a link to reset the password. It works for one hour.";

export async function requestPasswordReset(_: AuthState, form: FormData): Promise<AuthState> {
  const parsed = z.object({ email: z.string().trim().toLowerCase().pipe(z.email("Enter a valid email")) }).safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Enter a valid email" };
  const { email } = parsed.data;

  // Every request counts, whether or not the account exists, and a limited request gets the same answer as a normal one.
  const ip = await requestIp();
  const emailKey = `reset:email:${email}`;
  const ipKey = ip ? `reset:ip:${ip}` : null;
  const limited = (await isLimited(emailKey, LIMITS.resetEmail)) || (ipKey ? await isLimited(ipKey, LIMITS.resetIp) : false);
  await recordHit(emailKey);
  if (ipKey) await recordHit(ipKey);
  if (limited) return { notice: RESET_NOTICE };

  const made = await createResetToken(email);
  if (made) {
    const link = `${(process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "")}/reset-password/${made.token}`;
    await sendEmail({
      to: made.user.email,
      subject: "Reset your Banyanroot password",
      text: `Hi ${made.user.name},\n\nUse this link to choose a new password. It works once and expires in one hour:\n${link}\n\nIf you did not ask for this, ignore this email; your password stays the same.`,
    });
  }
  return { notice: RESET_NOTICE };
}

export async function resetPassword(token: string, _: AuthState, form: FormData): Promise<AuthState> {
  const parsed = z.object({ password: z.string().min(8, "Password needs at least 8 characters"), confirm: z.string() }).safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the form and try again" };
  if (parsed.data.password !== parsed.data.confirm) return { error: "The two passwords do not match" };

  const ip = await requestIp();
  const ipKey = ip ? `reset-submit:ip:${ip}` : null;
  if (ipKey && (await isLimited(ipKey, LIMITS.resetSubmitIp))) return { error: "Too many attempts. Try again in an hour." };

  if (!(await consumeResetToken(token, parsed.data.password))) {
    if (ipKey) await recordHit(ipKey);
    return { error: "This link has expired or was already used. Ask for a new one." };
  }
  redirect("/login?reset=1");
}

export async function signOut(): Promise<void> {
  await destroySession();
  redirect("/login");
}
