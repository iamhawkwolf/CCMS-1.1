import { Sparkbars } from "./spark";
import { StatusChip, type Tone } from "./ui";

/** Big light number, a status chip, a caption, and a thin sparkline: the header KPIs from the reference. */
export function Kpi({ value, label, tone, values, series, highlight = "nonzero" }: { value: number | string; label: string; tone: Tone; values: number[]; series: string; highlight?: "nonzero" | "max" }) {
  return (
    <div className="flex items-end gap-4">
      <div>
        <div className="flex items-center gap-2">
          <span className="num text-[2.5rem] leading-none">{value}</span>
          <StatusChip tone={tone} />
        </div>
        <div className="dim mt-1.5 text-sm">{label}</div>
      </div>
      <Sparkbars values={values} tone={tone} highlight={highlight} label={series} />
    </div>
  );
}
