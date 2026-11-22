import Link from "next/link";
import type { ReactNode } from "react";
import { daysUntil } from "@/lib/time";

/** Meaning, not decoration: blue = brand/info, green = good/done, red = overdue/error, dim = everything else. */
export type Tone = "blue" | "green" | "red" | "dim";

export function PageHeader({ eyebrow, title, back, children }: { eyebrow?: string; title: ReactNode; back?: string; children?: ReactNode }) {
  return (
    <header className="mb-7 flex flex-wrap items-center justify-between gap-4">
      <div className="flex items-center gap-4">
        {back && (
          <Link href={back} className="icon-btn" aria-label="Back">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M19 12H5M11 6l-6 6 6 6" /></svg>
          </Link>
        )}
        <div>
          <h1 className="h-display">{title}</h1>
          {eyebrow && <div className="eyebrow mt-1">{eyebrow}</div>}
        </div>
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </header>
  );
}

export function Card({ children, className = "", hover = false, deep = false }: { children: ReactNode; className?: string; hover?: boolean; deep?: boolean }) {
  return <section className={`glass p-5 ${deep ? "glass-deep" : ""} ${hover ? "glass-hover" : ""} ${className}`}>{children}</section>;
}

/** Small square status chip: a different glyph per tone, so it reads without colour. */
export function StatusChip({ tone }: { tone: Tone }) {
  const glyph = { green: "✓", red: "!", blue: "●", dim: "–" }[tone];
  const bg = { green: "var(--green)", red: "var(--red)", blue: "var(--blue)", dim: "var(--pill)" }[tone];
  return <span aria-hidden className="inline-grid h-[1.15rem] w-[1.15rem] place-items-center rounded-[6px] text-[.65rem] font-extrabold" style={{ background: bg, color: "var(--ink)" }}>{glyph}</span>;
}

export function Stat({ label, value, hint, tone = "blue" }: { label: string; value: ReactNode; hint?: string; tone?: Tone }) {
  return (
    <Card>
      <div className="flex items-center gap-2"><div className="num text-[2.4rem] leading-none">{value}</div><StatusChip tone={tone} /></div>
      <div className="dim mt-2 text-sm">{label}</div>
      {hint && <div className="faint text-xs">{hint}</div>}
    </Card>
  );
}

export function Badge({ tone = "dim", children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`badge b-${tone}`}>{children}</span>;
}

/** Solid status pill, as in the reference. */
export function Pill({ tone = "dim", children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`pill pill-${tone}`}>{children}</span>;
}

/** The thin "battery life" bar: label, value, track, marker. Colour follows the tone; the number carries the meaning. */
export function Meter({ label, value, tone }: { label: string; value: number; tone?: Tone }) {
  const v = Math.max(0, Math.min(100, Math.round(value)));
  const t: Tone = tone ?? (v >= 60 ? "green" : "red");
  const fill = { green: "var(--green)", red: "var(--red)", blue: "var(--blue)", dim: "var(--ink-2)" }[t];
  return (
    <div role="meter" aria-label={label} aria-valuenow={v} aria-valuemin={0} aria-valuemax={100}>
      <div className="flex items-baseline justify-between gap-3 text-sm"><span className="dim">{label}</span><span>{v}<span className="faint">%</span></span></div>
      <div className="meter-track"><div className="meter-fill" style={{ width: `${v}%`, background: fill }} /><span className="meter-marker" style={{ left: `${v}%` }} /></div>
    </div>
  );
}

export function Empty({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="glass-flat px-6 py-10 text-center">
      <div className="h-section">{title}</div>
      {hint && <p className="dim mx-auto mt-1 max-w-md text-sm">{hint}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint && <span className="faint text-xs font-normal">{hint}</span>}
    </label>
  );
}

export function ButtonLink({ href, children, primary = false }: { href: string; children: ReactNode; primary?: boolean }) {
  return (
    <Link href={href} className={`btn ${primary ? "btn-primary" : ""}`}>
      {children}
    </Link>
  );
}

export function Notice({ tone = "blue", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <div className="glass-flat flex items-start gap-3 px-4 py-3 text-sm" role="status">
      <Badge tone={tone}>Note</Badge>
      <div className="dim">{children}</div>
    </div>
  );
}

export function ErrorLine({ children }: { children: ReactNode }) {
  return <p role="alert" className="badge b-red mb-4" style={{ textTransform: "none" }}>{children}</p>;
}

export function fmtDate(d: Date | string | null | undefined): string {
  if (!d) return "-";
  return new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
}

export const daysFromNow = (d: Date): number => daysUntil(d, new Date());

export function DueBadge({ due, done = false }: { due: Date; done?: boolean }) {
  if (done) return <Badge tone="green">Done</Badge>;
  const n = daysFromNow(due);
  if (n < 0) return <Badge tone="red">Overdue {-n}d</Badge>;
  if (n === 0) return <Badge tone="blue">Due today</Badge>;
  if (n <= 7) return <Badge tone="blue">Due in {n}d</Badge>;
  return <Badge tone="dim">In {n}d</Badge>;
}
