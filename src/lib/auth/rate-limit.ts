import { headers } from "next/headers";
import { db } from "@/lib/db";

/** Counts hits per key in a sliding window, stored in Postgres so it works on serverless hosts too. */
export interface Limit { max: number; windowMs: number }

export async function isLimited(key: string, { max, windowMs }: Limit, now = new Date()): Promise<boolean> {
  const since = new Date(now.getTime() - windowMs);
  // Housekeeping: drop this key's expired hits so the table does not grow forever.
  await db.rateLimitHit.deleteMany({ where: { key, createdAt: { lt: since } } });
  return (await db.rateLimitHit.count({ where: { key, createdAt: { gte: since } } })) >= max;
}

export async function recordHit(key: string, now = new Date()): Promise<void> {
  await db.rateLimitHit.create({ data: { key, createdAt: now } });
}

export async function clearHits(key: string): Promise<void> {
  await db.rateLimitHit.deleteMany({ where: { key } });
}

/** The caller's address from the proxy headers, or null when there is none. Only trust this behind a proxy you control (Vercel, nginx). */
export function clientIpFrom(get: (name: string) => string | null): string | null {
  const first = (get("x-forwarded-for") ?? "").split(",")[0]?.trim();
  const ip = first || get("x-real-ip")?.trim() || "";
  return ip && ip.length <= 64 ? ip : null;
}

export async function requestIp(): Promise<string | null> {
  const h = await headers();
  return clientIpFrom((n) => h.get(n));
}

export const LIMITS = {
  /** Wrong passwords for one email. Cleared by a successful sign-in. */
  loginEmail: { max: 5, windowMs: 15 * 60_000 },
  /** Wrong passwords from one address, across any emails. */
  loginIp: { max: 20, windowMs: 15 * 60_000 },
  resetEmail: { max: 3, windowMs: 60 * 60_000 },
  resetIp: { max: 10, windowMs: 60 * 60_000 },
  /** Bad or expired reset links from one address. */
  resetSubmitIp: { max: 10, windowMs: 60 * 60_000 },
} satisfies Record<string, Limit>;
