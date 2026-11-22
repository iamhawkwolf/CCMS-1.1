import type { Tone } from "./ui";

const MARK: Record<Tone, string> = { blue: "var(--blue-mark)", green: "var(--green-mark)", red: "var(--red-mark)", dim: "var(--ink-2)" };

/**
 * Thin vertical bars, like the reference's KPI sparklines. Quiet grey by default; the bars that matter
 * (every non-zero day, or just the peak) take the tone colour. Decorative: the number beside it is the data,
 * and `label` describes the series for screen readers.
 */
export function Sparkbars({ values, tone = "blue", highlight = "nonzero", label, height = 46 }: { values: number[]; tone?: Tone; highlight?: "nonzero" | "max"; label: string; height?: number }) {
  const max = Math.max(...values, 1);
  const peak = values.indexOf(Math.max(...values));
  return (
    <div role="img" aria-label={`${label}: ${values.join(", ")}`} className="flex items-end gap-[3px]" style={{ height }}>
      {values.map((v, i) => {
        const on = v > 0 && (highlight === "nonzero" || i === peak);
        return <span key={i} style={{ width: 3, height: Math.max(3, (v / max) * height), borderRadius: 2, background: on ? MARK[tone] : "var(--neutral-mark)" }} />;
      })}
    </div>
  );
}
