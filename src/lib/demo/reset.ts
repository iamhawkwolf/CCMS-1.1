import { db } from "@/lib/db";
import { runDueJobs } from "@/lib/jobs/runner";
import { resetDemo, type DemoResult } from "./seed";

/**
 * Fresh demo data, then one pass of the reminder jobs so the inbox already has alerts in it.
 * Messages for the demo consultancy are never actually sent (see notify.ts), so this is safe anywhere.
 */
export async function resetDemoWithAlerts(): Promise<DemoResult> {
  const result = await resetDemo(db);
  try {
    await runDueJobs({ force: true, only: ["compliance-alerts", "review-reminders", "invoice-reminders", "deliver"] });
  } catch (e) {
    console.error("[demo] reminder pass failed:", e instanceof Error ? e.message : e);
  }
  return result;
}
