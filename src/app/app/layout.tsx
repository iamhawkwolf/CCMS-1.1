import { db } from "@/lib/db";
import { requireStaff } from "@/lib/auth/context";
import { FEATURES, planIncludes } from "@/lib/features/registry";
import { resolveFeature, type SettingMap } from "@/lib/features/resolve";
import { Sidebar, type NavItem } from "@/components/sidebar";
import { signOut } from "../actions-auth";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireStaff();
  const unread = await db.notification.count({ where: { channel: "IN_APP", to: ctx.userId, readAt: null } });
  const rows = await db.featureSetting.findMany({ where: { consultancyId: ctx.consultancyId }, select: { scope: true, key: true, enabled: true } });
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
    { href: "/app", label: "Dashboard", icon: "◉" },
    { href: "/app/clients", label: "Clients", icon: "◈" },
    { href: "/app/tasks", label: "Tasks", icon: "✦" },
    { href: "/app/inbox", label: "Inbox", icon: "✉", badge: unread },
    ...(visible("requisition_tracker") ? [{ href: "/app/requisitions", label: "Requisitions", icon: "❖" }] : []),
    ...(visible("invoicing") ? [{ href: "/app/invoices", label: "Invoices", icon: "₹" }] : []),
    ...(ctx.role === "ADMIN" ? [{ href: "/app/settings", label: "Settings", icon: "⚙" }] : []),
  ];

  return (
    <div className="shell">
      <Sidebar items={items} brand={ctx.consultancyName} user={`${ctx.name} · ${ctx.role === "ADMIN" ? "Admin" : "Consultant"}`} signOut={signOut} />
      <main className="min-w-0 pb-10">{children}</main>
    </div>
  );
}
