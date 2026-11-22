import { db } from "@/lib/db";
import { FEATURE_KEYS, type FeatureKey } from "./registry";
import { resolveFeature, type SettingMap } from "./resolve";

export type FeatureCheck = (consultancyId: string, clientId: string | null, key: FeatureKey) => boolean;

/**
 * Loads every switch once so a job looping over hundreds of rows does not query per row.
 * Same resolution rules as isFeatureOn (plan, parent, client override, account default).
 */
export async function loadFeatureCheck(): Promise<FeatureCheck> {
  const [rows, consultancies] = await Promise.all([db.featureSetting.findMany({ select: { consultancyId: true, scope: true, key: true, enabled: true } }), db.consultancy.findMany({ select: { id: true, plan: true } })]);
  const plans = new Map(consultancies.map((c) => [c.id, c.plan]));
  const maps = new Map<string, SettingMap>();
  for (const r of rows) {
    if (!(FEATURE_KEYS as string[]).includes(r.key)) continue;
    const k = `${r.consultancyId}|${r.scope}`;
    const m = maps.get(k) ?? {};
    m[r.key as FeatureKey] = r.enabled;
    maps.set(k, m);
  }
  return (consultancyId, clientId, key) => {
    const plan = plans.get(consultancyId);
    if (!plan) return false;
    return resolveFeature(key, plan, maps.get(`${consultancyId}|ACCOUNT`) ?? {}, clientId ? (maps.get(`${consultancyId}|${clientId}`) ?? {}) : {}).enabled;
  };
}
