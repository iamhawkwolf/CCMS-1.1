import type { Metadata } from "next";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth/context";
import { featuresFor } from "@/lib/features/server";
import { PLAN_LIMITS } from "@/lib/features/registry";
import { FeatureSwitches } from "@/components/feature-switches";
import { STATES } from "@/lib/compliance/rules";
import { Badge, Card, Field, PageHeader, fmtDate } from "@/components/ui";
import { saveBusiness } from "./actions";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const ctx = await requireAdmin();
  const [states, log, team, clientCount, biz] = await Promise.all([
    featuresFor(ctx.consultancyId, ctx.plan),
    db.featureChangeLog.findMany({ where: { consultancyId: ctx.consultancyId }, orderBy: { changedAt: "desc" }, take: 12 }),
    db.user.findMany({ where: { consultancyId: ctx.consultancyId, role: { not: "CLIENT_USER" } }, orderBy: { createdAt: "asc" } }),
    db.client.count({ where: { consultancyId: ctx.consultancyId } }),
    db.consultancy.findUniqueOrThrow({ where: { id: ctx.consultancyId } }),
  ]);
  const names = new Map(team.map((u) => [u.id, u.name]));
  const limits = PLAN_LIMITS[ctx.plan];

  return (
    <>
      <PageHeader eyebrow="Settings" title="Plan, team and feature switches" />

      <div className="grid gap-5 xl:grid-cols-[2fr_1fr]">
        <div className="grid gap-5">
          <Card>
            <h2 className="h-section">Feature defaults</h2>
            <p className="dim mb-4 mt-1 text-sm">These apply to every client. Override any of them on a client's own page. Turning a feature off hides it and stops its reminders, and keeps all existing data.</p>
            <FeatureSwitches states={states} scope="ACCOUNT" />
          </Card>

          <Card>
            <h2 className="h-section mb-3">Business details</h2>
            <form action={saveBusiness} className="grid gap-4 sm:grid-cols-2">
              <Field label="Consultancy name"><input className="input" name="name" defaultValue={biz.name} required /></Field>
              <Field label="GSTIN"><input className="input" name="gstin" defaultValue={biz.gstin ?? ""} /></Field>
              <Field label="State" hint="Decides CGST + SGST vs IGST on invoices">
                <select className="input" name="state" defaultValue={biz.state ?? ""}><option value="">Not set</option>{Object.entries(STATES).map(([c, n]) => <option key={c} value={c}>{n}</option>)}</select>
              </Field>
              <Field label="Address"><input className="input" name="address" defaultValue={biz.address ?? ""} /></Field>
              <div><button className="btn btn-primary" type="submit">Save</button></div>
            </form>
          </Card>

          <Card>
            <h2 className="h-section mb-3">Change log</h2>
            {log.length === 0 ? <p className="dim text-sm">No changes yet.</p> : (
              <table className="table">
                <thead><tr><th>When</th><th>Who</th><th>Switch</th><th>Change</th></tr></thead>
                <tbody>
                  {log.map((l) => (
                    <tr key={l.id}>
                      <td>{fmtDate(l.changedAt)}</td>
                      <td>{names.get(l.changedById) ?? "Unknown"}</td>
                      <td>{l.key}{l.clientId ? <span className="faint"> (client)</span> : null}</td>
                      <td>{l.oldValue === l.newValue ? <Badge tone="cyan">Reset to default</Badge> : <Badge tone={l.newValue ? "mint" : "dim"}>{l.newValue ? "Turned on" : "Turned off"}</Badge>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        </div>

        <div className="grid content-start gap-5">
          <Card>
            <div className="eyebrow">Your plan</div>
            <div className="gradient-text mt-1 text-3xl font-extrabold">{ctx.plan[0]}{ctx.plan.slice(1).toLowerCase()}</div>
            <p className="dim mt-1 text-sm">₹{limits.priceRupeesPerMonth.toLocaleString("en-IN")} per month</p>
            <dl className="mt-4 grid gap-2 text-sm">
              <div className="flex justify-between"><dt className="dim">Clients</dt><dd>{clientCount} / {limits.maxClients ?? "unlimited"}</dd></div>
              <div className="flex justify-between"><dt className="dim">Team</dt><dd>{team.length} / {limits.maxTeamMembers ?? "unlimited"}</dd></div>
            </dl>
          </Card>
          <Card>
            <h2 className="h-section mb-3">Team</h2>
            <ul className="grid gap-2 text-sm">
              {team.map((u) => (
                <li key={u.id} className="flex items-center justify-between gap-2"><span>{u.name}</span><Badge tone={u.role === "ADMIN" ? "violet" : "cyan"}>{u.role === "ADMIN" ? "Admin" : "Consultant"}</Badge></li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </>
  );
}
