import { timingSafeEqual } from "node:crypto";
import { processWebhook } from "@/lib/whatsapp/process";
import { parseWebhook, verifySignature } from "@/lib/whatsapp/webhook";

export const dynamic = "force-dynamic";

const same = (a: string, b: string): boolean => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

/** Meta's one-time endpoint verification when you set the webhook URL in the app dashboard. */
export function GET(req: Request): Response {
  const q = new URL(req.url).searchParams;
  const expected = process.env.WHATSAPP_VERIFY_TOKEN;
  if (expected && q.get("hub.mode") === "subscribe" && same(q.get("hub.verify_token") ?? "", expected)) return new Response(q.get("hub.challenge") ?? "", { status: 200 });
  return new Response("Forbidden", { status: 403 });
}

/** Delivery receipts and inbound replies. Unsigned or wrongly signed requests are rejected. */
export async function POST(req: Request): Promise<Response> {
  const secret = process.env.WHATSAPP_APP_SECRET;
  if (!secret) return new Response("WHATSAPP_APP_SECRET not configured", { status: 503 });

  const raw = await req.text(); // the signature covers the exact bytes, so read the body as text first
  if (!verifySignature(raw, req.headers.get("x-hub-signature-256"), secret)) return new Response("Bad signature", { status: 401 });

  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return new Response("Bad JSON", { status: 400 });
  }
  try {
    await processWebhook(parseWebhook(json));
  } catch (e) {
    console.error("[whatsapp webhook]", e instanceof Error ? e.message : e);
    return new Response("Error", { status: 500 }); // non-200 makes Meta retry, which is what we want
  }
  return new Response("ok", { status: 200 });
}
