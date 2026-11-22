// Job runner. Safe to call from several places at once (a worker loop, an HTTP cron hit, a manual run):
// each job takes a short database lease before running, so it never runs twice at the same moment,
// and each job has a minimum interval, so calling the runner every minute is cheap.
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { deliverPending } from "@/lib/notify";
import { runCalendarRollover } from "./calendar-rollover";
import { runComplianceAlerts } from "./compliance-alerts";
import { runInvoiceReminders } from "./invoice-reminders";
import { runReviewReminders } from "./review-reminders";

export interface JobDef { name: string; everyMinutes: number; run: (now: Date) => Promise<Record<string, number>> }

// Order matters: jobs that queue messages run before "deliver", so fresh alerts can go out in the same pass.
export const JOBS: readonly JobDef[] = [
  { name: "calendar-rollover", everyMinutes: 6 * 60, run: runCalendarRollover },
  { name: "compliance-alerts", everyMinutes: 60, run: runComplianceAlerts },
  { name: "review-reminders", everyMinutes: 60, run: runReviewReminders },
  { name: "invoice-reminders", everyMinutes: 60, run: runInvoiceReminders },
  {
    name: "deliver",
    everyMinutes: 1,
    run: async (now) => {
      // Drain up to a few batches per pass so a backlog clears quickly.
      const total = { claimed: 0, sent: 0, retried: 0, failed: 0, skipped: 0, waitingOnConfig: 0 };
      for (let i = 0; i < 5; i++) {
        const s = await deliverPending({ now });
        for (const k of Object.keys(total) as Array<keyof typeof total>) total[k] += s[k];
        if (s.claimed < 50) break;
      }
      return total;
    },
  },
];

const LEASE_MS = 10 * 60_000;
const SLACK_MS = 10_000; // a cron firing a hair early should still count as "a minute later"

export interface JobResult { name: string; ran: boolean; ok?: boolean; summary?: Record<string, number>; error?: string }

async function acquire(job: JobDef, now: Date, force: boolean): Promise<boolean> {
  await db.jobState.createMany({ data: [{ name: job.name }], skipDuplicates: true });
  const dueBefore = new Date(now.getTime() - job.everyMinutes * 60_000 + SLACK_MS);
  const res = await db.jobState.updateMany({
    where: {
      name: job.name,
      AND: [{ OR: [{ lockedUntil: null }, { lockedUntil: { lt: now } }] }, ...(force ? [] : [{ OR: [{ lastStartedAt: null }, { lastStartedAt: { lte: dueBefore } }] }])],
    },
    data: { lastStartedAt: now, lockedUntil: new Date(now.getTime() + LEASE_MS) },
  });
  return res.count === 1;
}

export async function runDueJobs(opts: { now?: Date; only?: string[]; force?: boolean } = {}): Promise<JobResult[]> {
  const now = opts.now ?? new Date();
  const results: JobResult[] = [];
  for (const job of JOBS) {
    if (opts.only && !opts.only.includes(job.name)) continue;
    if (!(await acquire(job, now, opts.force ?? false))) {
      results.push({ name: job.name, ran: false });
      continue;
    }
    try {
      const summary = await job.run(now);
      await db.jobState.update({ where: { name: job.name }, data: { lastFinishedAt: new Date(), lockedUntil: null, lastOk: true, lastSummary: summary as Prisma.InputJsonValue, lastError: null } });
      results.push({ name: job.name, ran: true, ok: true, summary });
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      console.error(`[jobs] ${job.name} failed:`, error);
      await db.jobState.update({ where: { name: job.name }, data: { lastFinishedAt: new Date(), lockedUntil: null, lastOk: false, lastError: error.slice(0, 500) } }).catch(() => undefined);
      results.push({ name: job.name, ran: true, ok: false, error });
    }
  }
  return results;
}
