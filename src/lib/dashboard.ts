// Pure helpers that turn rows into the series the dashboard charts need. Kept free of database code so they are easy to test.
import { istDateKey, istToday } from "./time";

const DAY = 86400000;

/** Monday of the current week in India, as UTC midnight. */
export function weekStartIST(now: Date): Date {
  const today = istToday(now);
  const dow = (today.getUTCDay() + 6) % 7; // Monday = 0
  return new Date(today.getTime() - dow * DAY);
}

const utcMidnight = (d: Date): number => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());

/** For stored due dates, which are already "the calendar date" at UTC midnight. */
export const dayIndexOfDate = (d: Date, start: Date): number => Math.round((utcMidnight(d) - start.getTime()) / DAY);
/** For real timestamps (submittedAt): which IST calendar day they fall on. */
export const dayIndexOfInstant = (d: Date, start: Date): number => Math.round((Date.parse(`${istDateKey(d)}T00:00:00Z`) - start.getTime()) / DAY);

/** Counts per day for `days` days from `start`. Items outside the window are ignored. */
export function bucketByDay(items: Date[], start: Date, days: number, kind: "date" | "instant"): number[] {
  const out = new Array<number>(days).fill(0);
  for (const d of items) {
    const i = kind === "date" ? dayIndexOfDate(d, start) : dayIndexOfInstant(d, start);
    if (i >= 0 && i < days) out[i]!++;
  }
  return out;
}

/** Counts per Monday-start week for `weeks` weeks from `start` (a Monday). */
export function bucketByWeek(dates: Date[], start: Date, weeks: number): number[] {
  const out = new Array<number>(weeks).fill(0);
  for (const d of dates) {
    const i = Math.floor(dayIndexOfDate(d, start) / 7);
    if (i >= 0 && i < weeks) out[i]!++;
  }
  return out;
}

export interface DueTask { dueDate: Date; status: string; completedAt: Date | null }

/** Of the tasks that fell due in the last `windowDays` days (before today), how many were finished on or before the due date. */
export function onTimeRate(tasks: DueTask[], today: Date, windowDays: number): { total: number; onTime: number; pct: number | null } {
  const from = today.getTime() - windowDays * DAY;
  let total = 0;
  let onTime = 0;
  for (const t of tasks) {
    const due = utcMidnight(t.dueDate);
    if (due < from || due >= today.getTime()) continue;
    total++;
    if (t.status === "DONE" && t.completedAt && t.completedAt.getTime() < due + DAY) onTime++;
  }
  return { total, onTime, pct: total === 0 ? null : Math.round((onTime / total) * 100) };
}

export const pctOf = (n: number, d: number): number | null => (d === 0 ? null : Math.round((n / d) * 100));

/** "Mon", "Tue"... for a UTC-midnight date. */
export const weekdayShort = (d: Date): string => d.toLocaleDateString("en-IN", { weekday: "short", timeZone: "UTC" });
export const dayMonthShort = (d: Date): string => d.toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });
