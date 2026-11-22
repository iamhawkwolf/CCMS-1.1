import { db } from "@/lib/db";
import type { Plan } from "@prisma/client";
import { FEATURE_KEYS, type FeatureKey } from "./registry";
import { resolveAll, resolveFeature, type FeatureState, type SettingMap } from "./resolve";

function toMap(rows: { key: string; enabled: boolean }[]): SettingMap {
  const m: SettingMap = {};
  for (const r of rows) if ((FEATURE_KEYS as string[]).includes(r.key)) m[r.key as FeatureKey] = r.enabled;
  return m;
}

export async function loadSettings(consultancyId: string, clientId?: string | null) {
  const rows = await db.featureSetting.findMany({
    where: { consultancyId, scope: { in: clientId ? ["ACCOUNT", clientId] : ["ACCOUNT"] } },
    select: { key: true, enabled: true, scope: true },
  });
  return {
    account: toMap(rows.filter((r) => r.scope === "ACCOUNT")),
    client: toMap(rows.filter((r) => r.scope !== "ACCOUNT")),
  };
}

export async function featuresFor(consultancyId: string, plan: Plan, clientId?: string | null): Promise<FeatureState[]> {
  const { account, client } = await loadSettings(consultancyId, clientId);
  return resolveAll(plan, account, client);
}

export async function isFeatureOn(key: FeatureKey, consultancyId: string, plan: Plan, clientId?: string | null): Promise<boolean> {
  const { account, client } = await loadSettings(consultancyId, clientId);
  return resolveFeature(key, plan, account, client).enabled;
}
