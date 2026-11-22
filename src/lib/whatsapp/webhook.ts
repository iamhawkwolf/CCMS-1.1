import { createHmac, timingSafeEqual } from "node:crypto";

/** Meta signs every webhook body: header `X-Hub-Signature-256: sha256=<hex hmac of raw body using the app secret>`. */
export function verifySignature(rawBody: string, header: string | null, appSecret: string): boolean {
  if (!header?.startsWith("sha256=")) return false;
  const expected = createHmac("sha256", appSecret).update(rawBody).digest();
  let got: Buffer;
  try {
    got = Buffer.from(header.slice(7), "hex");
  } catch {
    return false;
  }
  return got.length === expected.length && timingSafeEqual(got, expected);
}

export interface StatusUpdate { id: string; status: "sent" | "delivered" | "read" | "failed"; errorCode?: number; errorTitle?: string }
export interface InboundMessage { from: string; text: string }

/** Pulls the parts we care about out of Meta's nested webhook payload. Tolerates anything malformed. */
export function parseWebhook(json: unknown): { statuses: StatusUpdate[]; messages: InboundMessage[] } {
  const statuses: StatusUpdate[] = [];
  const messages: InboundMessage[] = [];
  const entries = (json as { entry?: unknown[] } | null)?.entry;
  if (!Array.isArray(entries)) return { statuses, messages };
  for (const e of entries) {
    for (const ch of ((e as { changes?: unknown[] })?.changes ?? []) as Array<{ value?: Record<string, unknown> }>) {
      for (const s of (ch.value?.statuses ?? []) as Array<{ id?: string; status?: string; errors?: Array<{ code?: number; title?: string }> }>) {
        if (s?.id && s.status && ["sent", "delivered", "read", "failed"].includes(s.status)) {
          statuses.push({ id: s.id, status: s.status as StatusUpdate["status"], errorCode: s.errors?.[0]?.code, errorTitle: s.errors?.[0]?.title });
        }
      }
      for (const m of (ch.value?.messages ?? []) as Array<{ from?: string; type?: string; text?: { body?: string } }>) {
        if (m?.from && m.type === "text" && m.text?.body) messages.push({ from: m.from, text: m.text.body });
      }
    }
  }
  return { statuses, messages };
}

export const isStopMessage = (t: string): boolean => /^\s*(stop|unsubscribe|opt[\s-]?out)\s*[.!]*\s*$/i.test(t);
export const isStartMessage = (t: string): boolean => /^\s*(start|subscribe|unstop)\s*[.!]*\s*$/i.test(t);

export type DeliveryStatus = "PENDING" | "SENDING" | "SENT" | "DELIVERED" | "READ" | "FAILED" | "SKIPPED";

const RANK: Partial<Record<DeliveryStatus, number>> = { SENT: 1, DELIVERED: 2, READ: 3 };

/**
 * Webhooks can arrive out of order (a "read" before its "delivered"). Returns the status to store,
 * or null to leave the row alone. Progress only moves forward; "failed" only applies to a message
 * that has not already been delivered.
 */
export function advanceStatus(current: DeliveryStatus, incoming: StatusUpdate["status"]): DeliveryStatus | null {
  if (incoming === "failed") return current === "DELIVERED" || current === "READ" ? null : current === "FAILED" ? null : "FAILED";
  const next: DeliveryStatus = incoming === "sent" ? "SENT" : incoming === "delivered" ? "DELIVERED" : "READ";
  const cur = RANK[current] ?? 0;
  // A row we marked FAILED (say, on a timeout) can still be upgraded if Meta confirms it went through.
  return RANK[next]! > cur ? next : null;
}
