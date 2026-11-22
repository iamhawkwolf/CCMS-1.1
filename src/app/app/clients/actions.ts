"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { getClientFor, requireStaff } from "@/lib/auth/context";
import { PLAN_LIMITS } from "@/lib/features/registry";
import { isFeatureOn } from "@/lib/features/server";
import { ensureComplianceTasks } from "@/lib/services/compliance";
import { audit } from "@/lib/audit";

const opt = z.string().trim().transform((v) => (v === "" ? null : v)).nullable().optional();

const clientSchema = z.object({
  name: z.string().trim().min(2, "Enter the company name"),
  state: z.string().trim().length(2, "Pick a state"),
  gstin: opt,
  address: opt,
  pfNumber: opt,
  esiNumber: opt,
  ptNumber: opt,
  tan: opt,
  lwfNumber: opt,
  notes: opt,
});

export async function createClient(form: FormData): Promise<void> {
  const ctx = await requireStaff();
  if (ctx.role !== "ADMIN") redirect("/app/clients?error=Only+admins+can+add+clients");

  const parsed = clientSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) redirect(`/app/clients/new?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Check the form")}`);

  const limit = PLAN_LIMITS[ctx.plan].maxClients;
  if (limit !== null && (await db.client.count({ where: { consultancyId: ctx.consultancyId } })) >= limit) {
    redirect(`/app/clients/new?error=${encodeURIComponent(`Your plan allows ${limit} clients. Upgrade to add more.`)}`);
  }

  const client = await db.client.create({ data: { ...parsed.data, consultancyId: ctx.consultancyId } });
  // The admin who created the client works it until reassigned.
  await db.clientAssignment.create({ data: { userId: ctx.userId, clientId: client.id } });
  if (await isFeatureOn("compliance_calendar", ctx.consultancyId, ctx.plan, client.id)) await ensureComplianceTasks(client, ctx.userId);
  await audit(ctx.consultancyId, ctx.userId, "client.create", "Client", client.id);
  redirect(`/app/clients/${client.id}`);
}

export async function regenerateCompliance(clientId: string): Promise<void> {
  const ctx = await requireStaff();
  const client = await getClientFor(ctx, clientId);
  if (!client) redirect("/app/clients");
  if (await isFeatureOn("compliance_calendar", ctx.consultancyId, ctx.plan, client.id)) await ensureComplianceTasks(client, ctx.userId);
  revalidatePath(`/app/clients/${clientId}`);
}

export async function assignConsultant(clientId: string, form: FormData): Promise<void> {
  const ctx = await requireStaff();
  if (ctx.role !== "ADMIN") return;
  const client = await getClientFor(ctx, clientId);
  const userId = String(form.get("userId") ?? "");
  const user = await db.user.findFirst({ where: { id: userId, consultancyId: ctx.consultancyId, role: { not: "CLIENT_USER" } } });
  if (!client || !user) return;
  await db.clientAssignment.upsert({ where: { userId_clientId: { userId, clientId } }, create: { userId, clientId }, update: {} });
  await audit(ctx.consultancyId, ctx.userId, "client.assign", "Client", clientId, { userId });
  revalidatePath(`/app/clients/${clientId}`);
}

export async function inviteClientUser(clientId: string, form: FormData): Promise<void> {
  const ctx = await requireStaff();
  if (ctx.role !== "ADMIN") return;
  const client = await getClientFor(ctx, clientId);
  if (!client) return;
  const parsed = z.object({ name: z.string().trim().min(2), email: z.string().trim().toLowerCase().pipe(z.email()), password: z.string().min(8) }).safeParse(Object.fromEntries(form));
  if (!parsed.success) redirect(`/app/clients/${clientId}?error=${encodeURIComponent("Enter a name, valid email and a password of 8+ characters")}`);
  if (await db.user.findUnique({ where: { email: parsed.data.email } })) redirect(`/app/clients/${clientId}?error=${encodeURIComponent("That email already has an account")}`);
  const bcrypt = (await import("bcryptjs")).default;
  await db.user.create({ data: { consultancyId: ctx.consultancyId, clientId, name: parsed.data.name, email: parsed.data.email, passwordHash: await bcrypt.hash(parsed.data.password, 11), role: "CLIENT_USER" } });
  await audit(ctx.consultancyId, ctx.userId, "client.invite_user", "Client", clientId, { email: parsed.data.email });
  revalidatePath(`/app/clients/${clientId}`);
}
