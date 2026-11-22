import { createHash, timingSafeEqual } from "node:crypto";
import { runDueJobs } from "@/lib/jobs/runner";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const digest = (s: string): Buffer => createHash("sha256").update(s).digest();

/**
 * Runs whatever jobs are due. Point any scheduler at it once a minute:
 *   curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://your-app/api/cron
 * Optional: ?only=deliver,compliance-alerts
 * Calling it more often than needed is harmless: jobs have minimum intervals and a lease.
 */
async function handle(req: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 16) return Response.json({ error: "CRON_SECRET is not configured (16+ characters)" }, { status: 503 });
  const given = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!timingSafeEqual(digest(given), digest(secret))) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const only = new URL(req.url).searchParams.get("only")?.split(",").map((s) => s.trim()).filter(Boolean);
  const results = await runDueJobs({ only });
  return Response.json({ results });
}

export const GET = handle;
export const POST = handle;
