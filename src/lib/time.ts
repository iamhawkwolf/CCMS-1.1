// Everything the product schedules is in Indian Standard Time (UTC+5:30, no daylight saving).
// Due dates are stored as UTC midnight of the calendar date, so "today" must be the IST calendar date too.

const IST_MS = 330 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

/** Hours (IST) during which WhatsApp messages may go out. Outside this we hold them until morning. */
export const SEND_WINDOW = { startHour: 9, endHour: 20 } as const;

const shifted = (d: Date): Date => new Date(d.getTime() + IST_MS);

/** "2026-11-22": the calendar date in India at `now`. */
export function istDateKey(now: Date): string {
  return shifted(now).toISOString().slice(0, 10);
}

/** UTC midnight of today's date in India. Compare task due dates against this. */
export function istToday(now: Date): Date {
  const s = shifted(now);
  return new Date(Date.UTC(s.getUTCFullYear(), s.getUTCMonth(), s.getUTCDate()));
}

/** Whole calendar days from today (IST) to `due`. Negative when overdue, 0 when due today. */
export function daysUntil(due: Date, now: Date): number {
  const d = Date.UTC(due.getUTCFullYear(), due.getUTCMonth(), due.getUTCDate());
  return Math.round((d - istToday(now).getTime()) / 86400000);
}

export function istHour(now: Date): number {
  return shifted(now).getUTCHours();
}

/** `t` if it falls inside the send window, otherwise the next 09:00 IST. */
export function nextSendWindow(t: Date): Date {
  const h = istHour(t);
  if (h >= SEND_WINDOW.startHour && h < SEND_WINDOW.endHour) return t;
  const s = shifted(t);
  const istMidnight = Date.UTC(s.getUTCFullYear(), s.getUTCMonth(), s.getUTCDate()) - IST_MS;
  const dayOffset = h >= SEND_WINDOW.endHour ? 24 : 0;
  return new Date(istMidnight + (dayOffset + SEND_WINDOW.startHour) * HOUR_MS);
}

export function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * 86400000);
}

/** "15 Nov 2026" for a stored due date (UTC midnight of the calendar date). */
export function formatDate(d: Date): string {
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
}
