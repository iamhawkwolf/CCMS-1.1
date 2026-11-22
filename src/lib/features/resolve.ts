import { FEATURES, getFeature, planIncludes, type FeatureKey, type PlanName } from "./registry";

/** Explicit choices only: a missing key means "not chosen at this level". */
export type SettingMap = Partial<Record<FeatureKey, boolean>>;

export interface FeatureState {
  key: FeatureKey;
  /** The plan includes this feature, so it can be switched. */
  available: boolean;
  /** Final answer: should the feature run for this client right now? */
  enabled: boolean;
  /** Where the answer came from. */
  source: "plan" | "parent" | "client" | "account" | "default";
}

/**
 * Resolution order, first match wins:
 *   1. plan does not include it            -> off
 *   2. parent feature is off               -> off
 *   3. client override                     -> its value
 *   4. account default                     -> its value
 *   5. registry default
 *
 * Turning a feature off never deletes data; callers only use this to hide UI and skip jobs.
 */
export function resolveFeature(
  key: FeatureKey,
  plan: PlanName,
  account: SettingMap,
  client: SettingMap = {},
): FeatureState {
  const def = getFeature(key);
  if (!def) return { key, available: false, enabled: false, source: "plan" };

  if (!planIncludes(plan, def.minPlan)) {
    return { key, available: false, enabled: false, source: "plan" };
  }

  if (def.parent) {
    const parent = resolveFeature(def.parent, plan, account, client);
    if (!parent.enabled) return { key, available: true, enabled: false, source: "parent" };
  }

  if (client[key] !== undefined) return { key, available: true, enabled: client[key]!, source: "client" };
  if (account[key] !== undefined) return { key, available: true, enabled: account[key]!, source: "account" };
  return { key, available: true, enabled: def.defaultOn, source: "default" };
}

export function resolveAll(plan: PlanName, account: SettingMap, client: SettingMap = {}): FeatureState[] {
  return FEATURES.map((f) => resolveFeature(f.key, plan, account, client));
}

export function isEnabled(key: FeatureKey, plan: PlanName, account: SettingMap, client: SettingMap = {}): boolean {
  return resolveFeature(key, plan, account, client).enabled;
}
