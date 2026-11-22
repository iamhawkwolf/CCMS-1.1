// One pass, then exit. `npm run jobs:run` runs whatever is due; add --force to ignore intervals,
// and job names to limit it: `npm run jobs:run -- --force deliver compliance-alerts`.
import "./_env";
import { db } from "../src/lib/db";
import { JOBS, runDueJobs } from "../src/lib/jobs/runner";

async function main() {
  const args = process.argv.slice(2);
  const force = args.includes("--force");
  const only = args.filter((a) => !a.startsWith("--"));
  const unknown = only.filter((n) => !JOBS.some((j) => j.name === n));
  if (unknown.length) throw new Error(`Unknown job(s): ${unknown.join(", ")}. Available: ${JOBS.map((j) => j.name).join(", ")}`);
  console.log(JSON.stringify(await runDueJobs({ force, only: only.length ? only : undefined }), null, 2));
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exitCode = 1; }).finally(() => db.$disconnect());
