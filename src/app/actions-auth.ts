"use server";
import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { createSession, destroySession } from "@/lib/auth/session";
import type { AuthState } from "@/components/auth-form";

const loginSchema = z.object({ email: z.string().trim().toLowerCase().pipe(z.email()), password: z.string().min(1) });

const signupSchema = z.object({
  consultancy: z.string().trim().min(2, "Enter your consultancy name"),
  name: z.string().trim().min(2, "Enter your name"),
  email: z.string().trim().toLowerCase().pipe(z.email("Enter a valid email")),
  password: z.string().min(8, "Password needs at least 8 characters"),
});

export async function login(_: AuthState, form: FormData): Promise<AuthState> {
  const keep = { email: String(form.get("email") ?? "") };
  const parsed = loginSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: "Enter your email and password", values: keep };
  const user = await db.user.findUnique({ where: { email: parsed.data.email } });
  // Same message for unknown email and wrong password, so accounts cannot be probed.
  if (!user || !user.active || !(await bcrypt.compare(parsed.data.password, user.passwordHash))) return { error: "Email or password is incorrect", values: keep };
  await createSession(user.id);
  redirect(user.role === "CLIENT_USER" ? "/portal" : "/app");
}

export async function signup(_: AuthState, form: FormData): Promise<AuthState> {
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

export async function signOut(): Promise<void> {
  await destroySession();
  redirect("/login");
}
