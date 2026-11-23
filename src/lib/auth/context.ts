import { redirect } from "next/navigation";
import type { Plan, Prisma, Role } from "@prisma/client";
import { db } from "@/lib/db";
import { readSessionUserId } from "./session";

export interface Ctx {
  userId: string;
  name: string;
  email: string;
  role: Role;
  consultancyId: string;
  consultancyName: string;
  plan: Plan;
  /** True for the demo consultancy: sample data, and nothing is ever sent. */
  isDemo: boolean;
  /** Only set for CLIENT_USER. */
  clientId: string | null;
}

export async function getCtx(): Promise<Ctx | null> {
  const userId = await readSessionUserId();
  if (!userId) return null;
  const u = await db.user.findUnique({ where: { id: userId }, include: { consultancy: true } });
  if (!u || !u.active) return null;
  return {
    userId: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    consultancyId: u.consultancyId,
    consultancyName: u.consultancy.name,
    plan: u.consultancy.plan,
    isDemo: u.consultancy.isDemo,
    clientId: u.clientId,
  };
}

/** Consultancy staff only (ADMIN or CONSULTANT). Client users are sent to the portal. */
export async function requireStaff(): Promise<Ctx> {
  const ctx = await getCtx();
  if (!ctx) redirect("/login");
  if (ctx.role === "CLIENT_USER") redirect("/portal");
  return ctx;
}

export async function requireAdmin(): Promise<Ctx> {
  const ctx = await requireStaff();
  if (ctx.role !== "ADMIN") redirect("/app");
  return ctx;
}

export async function requireClientUser(): Promise<Ctx & { clientId: string }> {
  const ctx = await getCtx();
  if (!ctx) redirect("/login");
  if (ctx.role !== "CLIENT_USER" || !ctx.clientId) redirect("/app");
  return ctx as Ctx & { clientId: string };
}

/**
 * The tenant boundary for staff. Every query on client-owned data starts from this filter.
 * Admins see every client in their consultancy; consultants only the clients assigned to them.
 */
export function clientScope(ctx: Ctx): Prisma.ClientWhereInput {
  const base: Prisma.ClientWhereInput = { consultancyId: ctx.consultancyId };
  if (ctx.role === "ADMIN") return base;
  return { ...base, assignments: { some: { userId: ctx.userId } } };
}

/** Loads one client the staff member is allowed to see, or null. Use this before touching anything under a client. */
export async function getClientFor(ctx: Ctx, clientId: string) {
  return db.client.findFirst({ where: { id: clientId, ...clientScope(ctx) } });
}

/** Ids of every client this staff member may see, for scoping tasks, requisitions and invoices. */
export async function visibleClientIds(ctx: Ctx): Promise<string[]> {
  const rows = await db.client.findMany({ where: clientScope(ctx), select: { id: true } });
  return rows.map((r) => r.id);
}
