import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/lib/db";
import { clientScope, requireStaff } from "@/lib/auth/context";
import { STATES } from "@/lib/compliance/rules";
import { PLAN_LIMITS } from "@/lib/features/registry";
import { Badge, ButtonLink, Card, Empty, PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "Clients" };

export default async function ClientsPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const ctx = await requireStaff();
  const { error } = await searchParams;
  const clients = await db.client.findMany({ where: clientScope(ctx), orderBy: { name: "asc" }, include: { _count: { select: { employees: true, requisitions: true } } } });
  const limit = PLAN_LIMITS[ctx.plan].maxClients;

  return (
    <>
      <PageHeader eyebrow="Clients" title="Client companies">
        {ctx.role === "ADMIN" && <ButtonLink href="/app/clients/new" primary>Add client</ButtonLink>}
      </PageHeader>
      {error && <p role="alert" className="badge b-rose mb-4" style={{ textTransform: "none" }}>{error}</p>}
      {limit !== null && <p className="faint mb-4 text-sm">{clients.length} of {limit} clients on your plan</p>}
      {clients.length === 0 ? (
        <Empty title="No clients yet" hint={ctx.role === "ADMIN" ? "Add your first client company." : "Ask your admin to assign clients to you."} />
      ) : (
        <Card className="overflow-x-auto !p-2">
          <table className="table">
            <thead><tr><th>Company</th><th>State</th><th>Registrations</th><th>Employees</th><th>Requisitions</th></tr></thead>
            <tbody>
              {clients.map((c) => (
                <tr key={c.id}>
                  <td><Link href={`/app/clients/${c.id}`} className="font-semibold hover:underline">{c.name}</Link></td>
                  <td>{STATES[c.state] ?? c.state}</td>
                  <td className="flex flex-wrap gap-1">
                    {c.pfNumber && <Badge tone="violet">PF</Badge>}
                    {c.esiNumber && <Badge tone="pink">ESI</Badge>}
                    {c.ptNumber && <Badge tone="cyan">PT</Badge>}
                    {c.tan && <Badge tone="mint">TDS</Badge>}
                    {c.lwfNumber && <Badge tone="lime">LWF</Badge>}
                  </td>
                  <td>{c._count.employees}</td>
                  <td>{c._count.requisitions}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </>
  );
}
