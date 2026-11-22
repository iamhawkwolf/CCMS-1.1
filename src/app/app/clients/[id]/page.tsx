import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { db } from "@/lib/db";
import { getClientFor, requireStaff } from "@/lib/auth/context";
import { STATES } from "@/lib/compliance/rules";
import { loadSettings } from "@/lib/features/server";
import { resolveAll } from "@/lib/features/resolve";
import { FeatureSwitches } from "@/components/feature-switches";
import { Badge, Card, DueBadge, Empty, PageHeader, fmtDate } from "@/components/ui";
import { assignConsultant, inviteClientUser, regenerateCompliance } from "../actions";
import { completeTask } from "../../tasks/actions";

export const metadata: Metadata = { title: "Client" };

export default async function ClientPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
  const ctx = await requireStaff();
  const [{ id }, { error }] = await Promise.all([params, searchParams]);
  const client = await getClientFor(ctx, id);
  if (!client) notFound();

  const [tasks, requisitions, assigned, staff, settings, portalUsers] = await Promise.all([
    db.task.findMany({ where: { clientId: id, status: { not: "DONE" } }, orderBy: { dueDate: "asc" }, take: 10, include: { assignee: { select: { name: true } } } }),
    db.requisition.findMany({ where: { clientId: id }, orderBy: { createdAt: "desc" }, take: 5, include: { _count: { select: { profiles: true } } } }),
    db.clientAssignment.findMany({ where: { clientId: id }, include: { user: { select: { id: true, name: true } } } }),
    ctx.role === "ADMIN" ? db.user.findMany({ where: { consultancyId: ctx.consultancyId, role: { not: "CLIENT_USER" }, active: true }, select: { id: true, name: true } }) : Promise.resolve([]),
    loadSettings(ctx.consultancyId, id),
    db.user.findMany({ where: { clientId: id, role: "CLIENT_USER" }, select: { id: true, name: true, email: true } }),
  ]);
  const states = resolveAll(ctx.plan, settings.account, settings.client);
  const portalOn = states.find((s) => s.key === "client_portal")?.enabled;
  const calendarOn = states.find((s) => s.key === "compliance_calendar")?.enabled;
  const reqOn = states.find((s) => s.key === "requisition_tracker")?.enabled;
  const assignedIds = new Set(assigned.map((a) => a.userId));
  const unassigned = staff.filter((u) => !assignedIds.has(u.id));

  return (
    <>
      <PageHeader eyebrow={STATES[client.state] ?? client.state} title={client.name}>
        <div className="flex flex-wrap gap-1.5">
          {client.pfNumber && <Badge tone="dim">PF</Badge>}
          {client.esiNumber && <Badge tone="dim">ESI</Badge>}
          {client.ptNumber && <Badge tone="dim">PT</Badge>}
          {client.tan && <Badge tone="dim">TDS</Badge>}
          {client.lwfNumber && <Badge tone="dim">LWF</Badge>}
        </div>
      </PageHeader>

      {error && <p role="alert" className="badge b-red mb-4" style={{ textTransform: "none" }}>{error}</p>}
      <div className="grid gap-5 xl:grid-cols-[3fr_2fr]">
        <div className="grid content-start gap-5">
          <Card>
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="h-section">Upcoming compliance and tasks</h2>
              {calendarOn && (
                <form action={regenerateCompliance.bind(null, id)}><button className="btn btn-sm" type="submit">Refresh calendar</button></form>
              )}
            </div>
            {tasks.length === 0 ? <Empty title="Nothing pending" hint={calendarOn ? "Refresh the calendar to generate the next deadlines." : "The compliance calendar is switched off for this client."} /> : (
              <table className="table">
                <thead><tr><th>Task</th><th>Due</th><th>Owner</th><th /></tr></thead>
                <tbody>
                  {tasks.map((t) => (
                    <tr key={t.id}>
                      <td>{t.complianceKind && <Badge tone="dim">{t.complianceKind}</Badge>} <span className="ml-1">{t.title}</span></td>
                      <td><div>{fmtDate(t.dueDate)}</div><DueBadge due={t.dueDate} /></td>
                      <td className="dim whitespace-nowrap">{t.assignee?.name ?? "Unassigned"}</td>
                      <td><form action={completeTask.bind(null, t.id)}><button className="btn btn-sm" type="submit">Mark done</button></form></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>

          {reqOn && (
            <Card>
              <div className="mb-3 flex items-center justify-between"><h2 className="h-section">Requisitions</h2><Link href={`/app/requisitions?client=${id}`} className="gradient-text text-sm font-semibold">View all</Link></div>
              {requisitions.length === 0 ? <p className="dim text-sm">No requisitions yet.</p> : (
                <ul className="grid gap-2">
                  {requisitions.map((r) => (
                    <li key={r.id}><Link href={`/app/requisitions/${r.id}`} className="glass-flat flex items-center justify-between gap-3 px-4 py-3"><span className="font-semibold">{r.title}</span><span className="faint text-sm">{r._count.profiles} profiles · {r.status.toLowerCase()}</span></Link></li>
                  ))}
                </ul>
              )}
            </Card>
          )}
        </div>

        <div className="grid content-start gap-5">
          <Card>
            <h2 className="h-section mb-3">Team on this client</h2>
            <ul className="mb-3 grid gap-1.5 text-sm">{assigned.map((a) => <li key={a.userId}>{a.user.name}</li>)}</ul>
            {ctx.role === "ADMIN" && unassigned.length > 0 && (
              <form action={assignConsultant.bind(null, id)} className="flex gap-2">
                <select className="input" name="userId" aria-label="Assign consultant">{unassigned.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select>
                <button className="btn btn-sm" type="submit">Assign</button>
              </form>
            )}
          </Card>
          {ctx.role === "ADMIN" && portalOn && (
            <Card>
              <h2 className="h-section mb-3">Client portal access</h2>
              <ul className="mb-3 grid gap-1.5 text-sm">{portalUsers.map((u) => <li key={u.id}>{u.name} <span className="faint">· {u.email}</span></li>)}{portalUsers.length === 0 && <li className="dim">No client logins yet.</li>}</ul>
              <form action={inviteClientUser.bind(null, id)} className="grid gap-2">
                <input className="input" name="name" placeholder="Name" required aria-label="Name" />
                <input className="input" name="email" type="email" placeholder="Email" required aria-label="Email" />
                <input className="input" name="password" type="text" placeholder="Temporary password (8+)" minLength={8} required aria-label="Temporary password" />
                <button className="btn btn-sm" type="submit">Create login</button>
              </form>
            </Card>
          )}
          {ctx.role === "ADMIN" && (
            <Card>
              <h2 className="h-section">Feature overrides</h2>
              <p className="dim mb-3 mt-1 text-sm">Change a switch for this client only. Everything else follows your account defaults.</p>
              <FeatureSwitches states={states} scope={id} overrides={settings.client} />
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
