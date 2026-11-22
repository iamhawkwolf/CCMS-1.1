import type { FeatureState } from "@/lib/features/resolve";
import { FEATURES } from "@/lib/features/registry";
import { setFeature } from "@/app/app/settings/actions";
import { Badge } from "@/components/ui";

const sourceLabel: Record<FeatureState["source"], string> = {
  plan: "Not in your plan",
  parent: "Parent switched off",
  client: "Client override",
  account: "Account default",
  default: "Default",
};

/** One row per feature. `scope` is "ACCOUNT" or a clientId. Submits plain forms, so it works without client JS. */
export function FeatureSwitches({ states, scope, overrides }: { states: FeatureState[]; scope: string; overrides?: Record<string, boolean> }) {
  const isClient = scope !== "ACCOUNT";
  return (
    <ul className="grid gap-2">
      {states.map((s) => {
        const def = FEATURES.find((f) => f.key === s.key)!;
        const locked = !s.available;
        const explicit = isClient ? overrides?.[s.key] : undefined;
        return (
          <li key={s.key} className={`glass-flat flex flex-wrap items-center justify-between gap-3 px-4 py-3 ${def.parent ? "ml-6" : ""}`}>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold">{def.label}</span>
                {locked ? <Badge tone="dim">Needs {def.minPlan.toLowerCase()} plan</Badge> : s.enabled ? <Badge tone="green">On</Badge> : <Badge tone="dim">Off</Badge>}
                {!locked && <span className="faint text-xs">{sourceLabel[s.source]}</span>}
              </div>
              <p className="dim text-sm">{def.description}</p>
            </div>
            {!locked && (
              <form action={setFeature} className="flex gap-1.5">
                <input type="hidden" name="key" value={s.key} />
                <input type="hidden" name="scope" value={scope} />
                <button className={`btn btn-sm ${explicit === true || (!isClient && s.source !== "default" && s.enabled) ? "btn-primary" : ""}`} name="value" value="on" type="submit" aria-pressed={s.enabled}>On</button>
                <button className={`btn btn-sm ${explicit === false || (!isClient && s.source !== "default" && !s.enabled) ? "btn-primary" : ""}`} name="value" value="off" type="submit" aria-pressed={!s.enabled}>Off</button>
                {isClient && explicit !== undefined && <button className="btn btn-sm" name="value" value="inherit" type="submit">Use default</button>}
              </form>
            )}
          </li>
        );
      })}
    </ul>
  );
}
