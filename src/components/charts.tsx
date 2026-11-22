"use client";
import { useState } from "react";
import type { Tone } from "./ui";

export interface Point { label: string; value: number; /** Longer text for the tooltip, e.g. "Mon 23 Nov". */ detail?: string }

const MARK: Record<Tone, string> = { blue: "var(--blue-mark)", green: "var(--green-mark)", red: "var(--red-mark)", dim: "var(--ink-2)" };
const W = 600;
const M = { l: 34, r: 8, t: 14, b: 22 };

/** 1, 2, 5, 10, 20, 50 ... the smallest "round" ceiling for the axis. */
export function niceMax(v: number): number {
  if (v <= 4) return 4;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  for (const m of [1, 2, 4, 5, 10]) if (v <= m * p) return m * p;
  return 10 * p;
}

function Frame({ points, tone, height, unit, ariaLabel, children, kind, boldIndex }: { boldIndex?: number; points: Point[]; tone: Tone; height: number; unit: string; ariaLabel: string; kind: "bar" | "line"; children: (s: { max: number; x: (i: number) => number; y: (v: number) => number; innerW: number; innerH: number; hover: number | null; setHover: (i: number | null) => void }) => React.ReactNode }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = niceMax(Math.max(...points.map((p) => p.value), 0));
  const innerW = W - M.l - M.r;
  const innerH = height - M.t - M.b;
  const n = points.length;
  const x = (i: number) => (kind === "bar" ? M.l + (innerW / n) * (i + 0.5) : M.l + (n === 1 ? innerW / 2 : (innerW * i) / (n - 1)));
  const y = (v: number) => M.t + innerH - (v / max) * innerH;
  const step = Math.ceil(n / 8);
  const ticks = [0, 1, 2, 3, 4].map((i) => (max / 4) * i);

  return (
    <div>
      <div className="relative">
        <svg viewBox={`0 0 ${W} ${height}`} className="h-auto w-full" role="img" aria-label={ariaLabel} onMouseLeave={() => setHover(null)}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={M.l} x2={W - M.r} y1={y(t)} y2={y(t)} stroke="var(--line)" strokeWidth={1} />
              <text x={M.l - 8} y={y(t) + 3.5} textAnchor="end" fontSize={10} fill="var(--faint)">{Number.isInteger(t) ? t : t.toFixed(1)}</text>
            </g>
          ))}
          {points.map((p, i) => (i % step === 0 || i === boldIndex) && <text key={i} x={x(i)} y={height - 6} textAnchor="middle" fontSize={10} fontWeight={i === boldIndex ? 700 : 400} fill={i === boldIndex ? "var(--ink)" : "var(--faint)"}>{p.label}</text>)}
          {children({ max, x, y, innerW, innerH, hover, setHover })}
        </svg>
        {hover !== null && points[hover] && (
          <div className="tip" style={{ left: `${(x(hover) / W) * 100}%`, top: `${(y(points[hover]!.value) / height) * 100}%` }}>
            <strong>{points[hover]!.value}</strong> {unit} · {points[hover]!.detail ?? points[hover]!.label}
          </div>
        )}
      </div>
      <details className="mt-2 text-xs">
        <summary className="faint cursor-pointer">View as table</summary>
        <table className="table mt-1">
          <thead><tr><th>{kind === "bar" ? "Period" : "Day"}</th><th>{unit}</th></tr></thead>
          <tbody>{points.map((p, i) => <tr key={i}><td>{p.detail ?? p.label}</td><td>{p.value}</td></tr>)}</tbody>
        </table>
      </details>
    </div>
  );
}

/** Thin bars with rounded 4px tops. One series, so no legend; the peak is labelled directly. */
export function BarChart({ points, tone = "blue", height = 190, unit, ariaLabel, markIndex }: { points: Point[]; tone?: Tone; height?: number; unit: string; ariaLabel: string; /** Index drawn at full strength with a label under it, e.g. the current week. */ markIndex?: number }) {
  const peak = points.reduce((b, p, i) => (p.value > (points[b]?.value ?? -1) ? i : b), 0);
  return (
    <Frame points={points} tone={tone} height={height} unit={unit} ariaLabel={ariaLabel} kind="bar" boldIndex={markIndex}>
      {({ x, y, innerW, innerH, hover, setHover }) => {
        const band = innerW / points.length;
        const bw = Math.min(band * 0.5, 14);
        return (
          <>
            {points.map((p, i) => {
              const h = y(0) - y(p.value);
              const left = x(i) - bw / 2;
              const r = Math.min(4, h, bw / 2);
              const dim = hover !== null && hover !== i;
              const path = h <= 0 ? "" : `M${left},${y(0)} V${y(p.value) + r} Q${left},${y(p.value)} ${left + r},${y(p.value)} H${left + bw - r} Q${left + bw},${y(p.value)} ${left + bw},${y(p.value) + r} V${y(0)} Z`;
              return (
                <g key={i}>
                  {path && <path d={path} fill={MARK[tone]} opacity={dim ? 0.35 : markIndex === undefined || markIndex === i ? 1 : 0.55} />}
                  {i === peak && p.value > 0 && hover === null && <text x={x(i)} y={y(p.value) - 5} textAnchor="middle" fontSize={10.5} fontWeight={600} fill="var(--ink)">{p.value}</text>}
                  <rect x={x(i) - band / 2} y={y(0) - innerH - 14} width={band} height={innerH + 14} fill="transparent" tabIndex={0} aria-label={`${p.detail ?? p.label}: ${p.value}`} onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} onBlur={() => setHover(null)} />
                </g>
              );
            })}
          </>
        );
      }}
    </Frame>
  );
}

/** 2px line, an 8px end marker with a surface ring, crosshair on hover. */
export function LineChart({ points, tone = "blue", height = 190, unit, ariaLabel }: { points: Point[]; tone?: Tone; height?: number; unit: string; ariaLabel: string }) {
  return (
    <Frame points={points} tone={tone} height={height} unit={unit} ariaLabel={ariaLabel} kind="line">
      {({ x, y, innerH, innerW, hover, setHover }) => {
        const d = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(p.value)}`).join(" ");
        const last = points.length - 1;
        const band = innerW / Math.max(points.length - 1, 1);
        return (
          <>
            {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={y(0) - innerH} y2={y(0)} stroke="var(--line-strong)" strokeWidth={1} />}
            <path d={d} fill="none" stroke={MARK[tone]} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
            {hover !== null && <circle cx={x(hover)} cy={y(points[hover]!.value)} r={4} fill={MARK[tone]} stroke="var(--card)" strokeWidth={2} />}
            <circle cx={x(last)} cy={y(points[last]!.value)} r={4} fill={MARK[tone]} stroke="var(--card)" strokeWidth={2} />
            {points.map((p, i) => (
              <rect key={i} x={x(i) - band / 2} y={y(0) - innerH - 14} width={band} height={innerH + 28} fill="transparent" tabIndex={0} aria-label={`${p.detail ?? p.label}: ${p.value}`} onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} onBlur={() => setHover(null)} />
            ))}
          </>
        );
      }}
    </Frame>
  );
}
