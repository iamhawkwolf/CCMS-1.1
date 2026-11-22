import { db } from "@/lib/db";
import { requireStaff } from "@/lib/auth/context";
import { FEATURES, planIncludes } from "@/lib/features/registry";
import { resolveFeature, type SettingMap } from "@/lib/features/resolve";
import { TopNav, type NavItem } from "@/components/topnav";
import { signOut } from "../actions-auth";

const initialsOf = (name: string): string => name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join("") || "?";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireStaff();
  const [unread, rows] = await Promise.all([
    db.notification.count({ where: { channel: "IN_APP", to: ctx.userId, readAt: null } }),
    db.featureSetting.findMany({ where: { consultancyId: ctx.consultancyId }, select: { scope: true, key: true, enabled: true } }),
  ]);
  const account: SettingMap = {};
  for (const r of rows) if (r.scope === "ACCOUNT") (account as Record<string, boolean>)[r.key] = r.enabled;

  // A module stays in the menu if it is on for the account, or switched on for at least one client.
  const visible = (key: (typeof FEATURES)[number]["key"]): boolean => {
    const def = FEATURES.find((f) => f.key === key)!;
    if (!planIncludes(ctx.plan, def.minPlan)) return false;
    if (resolveFeature(key, ctx.plan, account).enabled) return true;
    return rows.some((r) => r.scope !== "ACCOUNT" && r.key === key && r.enabled);
  };

  const items: NavItem[] = [
    { href: "/app", label: "Dashboard" },
    { href: "/app/clients", label: "Clients" },
    { href: "/app/tasks", label: "Tasks" },
    ...(visible("requisition_tracker") ? [{ href: "/app/requisitions", label: "Requisitions" }] : []),
    ...(visible("invoicing") ? [{ href: "/app/invoices", label: "Invoices" }] : []),
  ];

  return (
    <div className="frame">
      <TopNav items={items} brand={ctx.consultancyName} initials={initialsOf(ctx.name)} who={`${ctx.name} · ${ctx.role === "ADMIN" ? "Admin" : "Consultant"}`} unread={unread} showSettings={ctx.role === "ADMIN"} signOut={signOut} />
      <main className="min-w-0">{children}</main>
    </div>
  );
}
