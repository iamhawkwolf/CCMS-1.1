// Long-running scheduler process: `npm run worker`. Run exactly one of these (more is safe, but pointless),
// or skip it and call /api/cron every minute from any external scheduler instead.
import "./_env";
import { db } from "../src/lib/db";
import { runDueJobs } from "../src/lib/jobs/runner";

let stopping = false;
for (const sig of ["SIGINT", "SIGTERM"] as const) process.on(sig, () => { stopping = true; console.log(`[worker] ${sig} received, finishing the current pass`); });

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  console.log("[worker] started");
  while (!stopping) {
    const started = Date.now();
    try {
      for (const r of await runDueJobs()) {
        if (!r.ran) continue;
        // Stay quiet on idle passes; only report jobs that did something or failed.
        const active = !r.ok || Object.values(r.summary ?? {}).some((v) => v > 0);
        if (active) console.log(`[worker] ${r.name}`, r.ok ? JSON.stringify(r.summary) : `FAILED: ${r.error}`);
      }
    } catch (e) {
      console.error("[worker] pass failed:", e instanceof Error ? e.message : e);
    }
    const wait = 60_000 - ((Date.now() - started) % 60_000);
    for (let waited = 0; waited < wait && !stopping; waited += 1000) await sleep(1000);
  }
  await db.$disconnect();
  console.log("[worker] stopped");
}

main();
