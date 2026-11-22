import Link from "next/link";
import type { ReactNode } from "react";
import { daysUntil } from "@/lib/time";

export function PageHeader({ eyebrow, title, children }: { eyebrow?: string; title: ReactNode; children?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        {eyebrow && <div className="eyebrow mb-1">{eyebrow}</div>}
        <h1 className="h-display">{title}</h1>
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </header>
  );
}

export function Card({ children, className = "", hover = false }: { children: ReactNode; className?: string; hover?: boolean }) {
  return <section className={`glass p-5 ${hover ? "glass-hover" : ""} ${className}`}>{children}</section>;
}

export function Stat({ label, value, hint, tone = "violet" }: { label: string; value: ReactNode; hint?: string; tone?: Tone }) {
  return (
    <Card>
      <div className="eyebrow">{label}</div>
      <div className={`mt-2 text-4xl font-bold tracking-tight b-${tone}`} style={{ color: `var(--${toneVar[tone]})` }}>
        {value}
      </div>
      {hint && <div className="faint mt-1 text-sm">{hint}</div>}
    </Card>
  );
}

export type Tone = "violet" | "pink" | "cyan" | "mint" | "lime" | "rose" | "dim";
const toneVar: Record<Tone, string> = { violet: "violet-2", pink: "pink", cyan: "cyan", mint: "mint", lime: "lime", rose: "rose", dim: "text-dim" };

export function Badge({ tone = "dim", children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`badge b-${tone}`}>{children}</span>;
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

export function Notice({ tone = "cyan", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <div className="glass-flat flex items-start gap-3 px-4 py-3 text-sm" role="status">
      <span className={`badge b-${tone}`}>Note</span>
      <div className="dim">{children}</div>
    </div>
  );
}

export function fmtDate(d: Date | string | null | undefined): string {
  if (!d) return "-";
  return new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
}

export const daysFromNow = (d: Date): number => daysUntil(d, new Date());

export function DueBadge({ due, done = false }: { due: Date; done?: boolean }) {
  if (done) return <Badge tone="mint">Done</Badge>;
  const n = daysFromNow(due);
  if (n < 0) return <Badge tone="rose">Overdue {-n}d</Badge>;
  if (n === 0) return <Badge tone="pink">Due today</Badge>;
  if (n <= 7) return <Badge tone="lime">Due in {n}d</Badge>;
  return <Badge tone="cyan">In {n}d</Badge>;
}
