import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/lib/db";
import { clientScope, requireStaff } from "@/lib/auth/context";
import { Badge, ButtonLink, Card, Empty, PageHeader, Stat } from "@/components/ui";

export const metadata: Metadata = { title: "Dashboard" };

export default async function Dashboard() {
  const ctx = await requireStaff();
  const clients = await db.client.findMany({ where: { ...clientScope(ctx), active: true }, orderBy: { name: "asc" }, select: { id: true, name: true, state: true } });
  const ids = clients.map((c) => c.id);

  const startOfToday = new Date();
  startOfToday.setUTCHours(0, 0, 0, 0);
  const weekAhead = new Date(startOfToday.getTime() + 7 * 86400000);

  const [overdueBy, soonBy, openReqBy, pendingBy] = await Promise.all([
    db.task.groupBy({ by: ["clientId"], where: { clientId: { in: ids }, status: { not: "DONE" }, dueDate: { lt: startOfToday } }, _count: true }),
    db.task.groupBy({ by: ["clientId"], where: { clientId: { in: ids }, status: { not: "DONE" }, dueDate: { gte: startOfToday, lte: weekAhead } }, _count: true }),
    db.requisition.groupBy({ by: ["clientId"], where: { clientId: { in: ids }, status: "OPEN" }, _count: true }),
    db.profile.findMany({ where: { stage: "SUBMITTED", requisition: { clientId: { in: ids }, status: "OPEN" } }, select: { requisition: { select: { clientId: true } } } }),
  ]);

  const count = (rows: { clientId: string; _count: number }[], id: string) => rows.find((r) => r.clientId === id)?._count ?? 0;
  const pendingFor = (id: string) => pendingBy.filter((p) => p.requisition.clientId === id).length;
  const sum = (rows: { _count: number }[]) => rows.reduce((a, r) => a + r._count, 0);

  return (
    <>
      <PageHeader eyebrow={`Hello, ${ctx.name.split(" ")[0]}`} title={<>Everything across <span className="gradient-text">{clients.length || "your"}</span> {clients.length === 1 ? "client" : "clients"}</>}>
        <ButtonLink href="/app/clients/new" primary>Add client</ButtonLink>
      </PageHeader>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Overdue tasks" value={sum(overdueBy)} tone={sum(overdueBy) ? "rose" : "mint"} hint={sum(overdueBy) ? "Needs action now" : "All clear"} />
        <Stat label="Due in 7 days" value={sum(soonBy)} tone="lime" hint="Filings and tasks" />
        <Stat label="Open requisitions" value={sum(openReqBy)} tone="cyan" />
        <Stat label="Profiles awaiting client" value={pendingBy.length} tone="pink" hint="Not yet reviewed" />
      </div>

      <h2 className="h-section mb-3">Clients</h2>
      {clients.length === 0 ? (
        <Empty title="No clients yet" hint="Add a client company to start tracking its compliance deadlines, requisitions and invoices." action={<ButtonLink href="/app/clients/new" primary>Add your first client</ButtonLink>} />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {clients.map((c) => {
            const overdue = count(overdueBy, c.id);
            return (
              <Link key={c.id} href={`/app/clients/${c.id}`}>
                <Card hover>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="h-section">{c.name}</div>
                      <div className="faint text-xs">{c.state}</div>
                    </div>
                    {overdue ? <Badge tone="rose">{overdue} overdue</Badge> : <Badge tone="mint">On track</Badge>}
                  </div>
                  <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
                    <div><dd className="text-xl font-bold">{count(soonBy, c.id)}</dd><dt className="faint text-[0.7rem]">due soon</dt></div>
                    <div><dd className="text-xl font-bold">{count(openReqBy, c.id)}</dd><dt className="faint text-[0.7rem]">open reqs</dt></div>
                    <div><dd className="text-xl font-bold">{pendingFor(c.id)}</dd><dt className="faint text-[0.7rem]">to review</dt></div>
                  </dl>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}
