"use server";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { createSession } from "@/lib/auth/session";
import { getCtx } from "@/lib/auth/context";
import { DEMO_LOGINS, demoModeOn, type DemoRole } from "@/lib/demo/mode";
import { demoExists } from "@/lib/demo/seed";
import { resetDemoWithAlerts } from "@/lib/demo/reset";

/** One-click sign-in to a demo account. Only works while DEMO_MODE is on, and only for the demo consultancy. */
export async function demoLogin(form: FormData): Promise<void> {
  if (!demoModeOn()) redirect("/login");
  const role = String(form.get("as") ?? "") as DemoRole;
  const login = DEMO_LOGINS[role];
  if (!login) redirect("/login");

  // First visit to a fresh deployment: build the demo data on the spot.
  if (!(await demoExists(db))) await resetDemoWithAlerts().catch(() => undefined);

  const user = await db.user.findFirst({ where: { email: login.email, active: true, consultancy: { isDemo: true } } });
  if (!user) redirect("/login");
  await createSession(user.id);
  redirect(role === "client" ? "/portal" : "/app");
}

/** Throws the demo data away and rebuilds it. Demo admins only; the signed-in admin lands on the fresh dashboard. */
export async function resetDemoData(): Promise<void> {
  const ctx = await getCtx();
  if (!ctx || ctx.role !== "ADMIN" || !ctx.isDemo) redirect("/app");
  const { adminId } = await resetDemoWithAlerts();
  await createSession(adminId);
  redirect("/app");
}
