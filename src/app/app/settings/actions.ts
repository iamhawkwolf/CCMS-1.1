"use server";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getClientFor, requireAdmin } from "@/lib/auth/context";
import { getFeature, planIncludes } from "@/lib/features/registry";
import { audit } from "@/lib/audit";

/**
 * Sets one switch. scope is "ACCOUNT" or a clientId. value is "on", "off", or "inherit" (client scope only: remove the override).
 * Turning a feature off never deletes data; it only changes what resolveFeature returns.
 */
export async function setFeature(form: FormData): Promise<void> {
  const ctx = await requireAdmin();
  const key = String(form.get("key") ?? "");
  const scope = String(form.get("scope") ?? "ACCOUNT");
  const value = String(form.get("value") ?? "");

  const def = getFeature(key);
  if (!def || !planIncludes(ctx.plan, def.minPlan)) return;

  let clientId: string | null = null;
  if (scope !== "ACCOUNT") {
    const client = await getClientFor(ctx, scope);
    if (!client) return;
    clientId = client.id;
  }

  const existing = await db.featureSetting.findUnique({ where: { consultancyId_scope_key: { consultancyId: ctx.consultancyId, scope, key } } });

  if (value === "inherit") {
    if (existing && clientId) {
      await db.featureSetting.delete({ where: { id: existing.id } });
      await db.featureChangeLog.create({ data: { consultancyId: ctx.consultancyId, clientId, key, oldValue: existing.enabled, newValue: existing.enabled, changedById: ctx.userId } });
    }
  } else if (value === "on" || value === "off") {
    const enabled = value === "on";
    if (existing?.enabled === enabled) return;
    await db.featureSetting.upsert({
      where: { consultancyId_scope_key: { consultancyId: ctx.consultancyId, scope, key } },
      create: { consultancyId: ctx.consultancyId, scope, clientId, key, enabled },
      update: { enabled },
    });
    await db.featureChangeLog.create({ data: { consultancyId: ctx.consultancyId, clientId, key, oldValue: existing?.enabled ?? null, newValue: enabled, changedById: ctx.userId } });
  } else {
    return;
  }

  await audit(ctx.consultancyId, ctx.userId, "feature.set", "FeatureSetting", undefined, { key, scope, value });
  revalidatePath("/app", "layout");
}

export async function saveBusiness(form: FormData): Promise<void> {
  const ctx = await requireAdmin();
  const text = (k: string) => String(form.get(k) ?? "").trim() || null;
  const state = text("state");
  await db.consultancy.update({ where: { id: ctx.consultancyId }, data: { name: text("name") ?? ctx.consultancyName, gstin: text("gstin"), state: state && /^[A-Z]{2}$/.test(state) ? state : null, address: text("address") } });
  await audit(ctx.consultancyId, ctx.userId, "business.update", "Consultancy", ctx.consultancyId);
  revalidatePath("/app", "layout");
}
