// When to nudge. Pure functions so the schedule is easy to reason about and test.
// Each returns a "bucket": a stable key for one reminder moment. The job queues one message per bucket
// (dedupeKey), so running hourly, or catching up after downtime, never sends the same reminder twice.

export interface Bucket { key: string; kind: "due" | "overdue" }

const DUE_MILESTONES = [0, 1, 3, 7] as const;
/** After this many days overdue we stop nagging: the task is almost certainly abandoned, not forgotten. */
export const STOP_AFTER_OVERDUE_DAYS = 60;

/**
 * Compliance and task deadlines. Reminders at 7, 3, 1 and 0 days before; then every 3 days while overdue.
 * If a run is missed, the next one sends only the latest milestone reached, not the whole backlog.
 * `days` = daysUntil(dueDate): positive before, 0 on the day, negative after.
 */
export function complianceBucket(days: number): Bucket | null {
  if (days > 7) return null;
  if (days >= 0) return { key: `due-${DUE_MILESTONES.find((m) => m >= days)}`, kind: "due" };
  if (-days > STOP_AFTER_OVERDUE_DAYS) return null;
  return { key: `overdue-${Math.floor((-days - 1) / 3)}`, kind: "overdue" };
}

/** Invoices: one heads-up in the last 3 days before due, then weekly once overdue. */
export function invoiceBucket(days: number): Bucket | null {
  if (days > 3) return null;
  if (days >= 0) return { key: "due-3", kind: "due" };
  if (-days > 90) return null;
  return { key: `overdue-${Math.floor((-days - 1) / 7)}`, kind: "overdue" };
}

/** "in 3 days", "tomorrow", "today", "2 days overdue": the words used in messages. */
export function whenLabel(days: number): string {
  if (days > 1) return `in ${days} days`;
  if (days === 1) return "tomorrow";
  if (days === 0) return "today";
  return days === -1 ? "1 day overdue" : `${-days} days overdue`;
}
