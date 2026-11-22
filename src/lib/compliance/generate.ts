import { COMPLIANCE_RULES, type ComplianceKind, type ComplianceRule } from "./rules";

export interface ClientRegistrations {
  id: string;
  state: string;
  pf: boolean;
  esi: boolean;
  pt: boolean;
  tds: boolean;
  lwf: boolean;
}

export interface GeneratedTask {
  kind: ComplianceKind;
  title: string;
  /** Idempotency key: same client, kind and period always yields the same key. */
  sourceKey: string;
  /** "2026-10" for monthly, "2026" for yearly, "2026-H1" for half-yearly. */
  period: string;
  dueDate: Date; // UTC midnight of the due day
  verified: boolean;
}

const has = (c: ClientRegistrations, kind: ComplianceKind): boolean =>
  ({ PF: c.pf, ESI: c.esi, PT: c.pt, TDS: c.tds, LWF: c.lwf })[kind];

/** Rule for a state wins over the "*" rule of the same kind. */
export function rulesFor(client: ClientRegistrations, rules: readonly ComplianceRule[] = COMPLIANCE_RULES): ComplianceRule[] {
  const out: ComplianceRule[] = [];
  const kinds = new Set(rules.map((r) => r.kind));
  for (const kind of kinds) {
    if (!has(client, kind)) continue;
    const specific = rules.filter((r) => r.kind === kind && r.state === client.state);
    const generic = rules.filter((r) => r.kind === kind && r.state === "*");
    out.push(...(specific.length ? specific : generic));
  }
  return out;
}

const utc = (y: number, m1: number, d: number): Date => new Date(Date.UTC(y, m1 - 1, d));
const lastDay = (y: number, m1: number): number => new Date(Date.UTC(y, m1, 0)).getUTCDate();
const pad = (n: number): string => String(n).padStart(2, "0");

/** Tasks whose due date falls inside [from, to], both inclusive, date-only comparison in UTC. */
export function generateComplianceTasks(client: ClientRegistrations, from: Date, to: Date, rules: readonly ComplianceRule[] = COMPLIANCE_RULES): GeneratedTask[] {
  const out: GeneratedTask[] = [];
  const startMs = Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate());
  const endMs = Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate());
  const inRange = (d: Date): boolean => d.getTime() >= startMs && d.getTime() <= endMs;

  // Walk filing months from two months before `from` to one month after `to`, so every due date in range is found.
  const first = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() - 2, 1));
  const last = new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth() + 1, 1));

  for (const rule of rulesFor(client, rules)) {
    const f = rule.frequency;
    const push = (period: string, dueDate: Date, label: string): void => {
      if (!inRange(dueDate)) return;
      out.push({
        kind: rule.kind,
        title: `${rule.title}: ${label}`,
        sourceKey: `${client.id}:${rule.kind}:${period}`,
        period,
        dueDate,
        verified: rule.verified,
      });
    };

    if (f.type === "MONTHLY" || f.type === "MONTHLY_END") {
      for (let d = new Date(first); d <= last; d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1))) {
        const y = d.getUTCFullYear();
        const m = d.getUTCMonth() + 1;
        const period = `${y}-${pad(m)}`;
        let due: Date;
        if (f.type === "MONTHLY") {
          const ny = m === 12 ? y + 1 : y;
          const nm = m === 12 ? 1 : m + 1;
          due = utc(ny, nm, Math.min(f.dayOfNextMonth, lastDay(ny, nm)));
        } else {
          due = utc(y, m, lastDay(y, m));
        }
        push(period, due, period);
      }
    } else if (f.type === "YEARLY") {
      for (let y = from.getUTCFullYear(); y <= to.getUTCFullYear(); y++) {
        push(`${y}`, utc(y, f.month, Math.min(f.day, lastDay(y, f.month))), `${y}`);
      }
    } else {
      for (let y = from.getUTCFullYear(); y <= to.getUTCFullYear(); y++) {
        f.due.forEach((slot, i) => push(`${y}-H${i + 1}`, utc(y, slot.month, Math.min(slot.day, lastDay(y, slot.month))), `${y} H${i + 1}`));
      }
    }
  }

  return out.sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime() || a.kind.localeCompare(b.kind));
}

/** Default horizon when a client is created or the monthly job runs: today through 3 months ahead. */
export function defaultWindow(now: Date): { from: Date; to: Date } {
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 3, now.getUTCDate()));
  return { from, to };
}
