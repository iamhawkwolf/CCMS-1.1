// Deletes and rebuilds the demo consultancy ("Demo HR Advisors") with fresh sample data. Touches nothing else,
// so it is safe on a database that also holds real accounts.   npm run demo:reset
import "./_env";
import { db } from "../src/lib/db";
import { resetDemoWithAlerts } from "../src/lib/demo/reset";
import { demoPassword } from "../src/lib/demo/seed";
import { DEMO_LOGINS } from "../src/lib/demo/mode";

async function main() {
  const r = await resetDemoWithAlerts();
  console.log("Demo data is fresh:", JSON.stringify(r.counts));
  console.log("Logins:", Object.values(DEMO_LOGINS).map((l) => l.email).join(", "));
  console.log(process.env.DEMO_PASSWORD || process.env.NODE_ENV !== "production" ? `Password: ${demoPassword()}` : "Password: set DEMO_PASSWORD to choose one (the one-click buttons need none).");
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exitCode = 1; }).finally(() => db.$disconnect());
