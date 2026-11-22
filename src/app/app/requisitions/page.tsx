import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/lib/db";
import { requireStaff, visibleClientIds } from "@/lib/auth/context";
import { Badge, ButtonLink, Card, Empty, PageHeader, daysFromNow, fmtDate } from "@/components/ui";

export const metadata: Metadata = { title: "Requisitions" };

export default async function RequisitionsPage({ searchParams }: { searchParams: Promise<{ client?: string }> }) {
  const ctx = await requireStaff();
  const { client } = await searchParams;
  const ids = await visibleClientIds(ctx);
  const reqs = await db.requisition.findMany({
    where: { clientId: client && ids.includes(client) ? client : { in: ids } },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    include: { client: { select: { name: true } }, profiles: { select: { stage: true } } },
  });

  return (
    <>
      <PageHeader eyebrow="Requisitions" title="Hiring across your clients">
        <ButtonLink href="/app/requisitions/new" primary>New requisition</ButtonLink>
      </PageHeader>
      {reqs.length === 0 ? <Empty title="No requisitions yet" hint="Log a requisition from a call, or let clients raise them in the portal." /> : (
        <Card className="overflow-x-auto !p-2">
          <table className="table">
            <thead><tr><th>Role</th><th>Client</th><th>Status</th><th>Profiles</th><th>Awaiting client</th><th>Age</th></tr></thead>
            <tbody>
              {reqs.map((r) => {
                const waiting = r.profiles.filter((p) => p.stage === "SUBMITTED").length;
                return (
                  <tr key={r.id}>
                    <td><Link href={`/app/requisitions/${r.id}`} className="font-semibold hover:underline">{r.title}</Link><div className="faint text-xs">{r.openings} opening{r.openings > 1 ? "s" : ""}{r.deadline ? ` · by ${fmtDate(r.deadline)}` : ""}</div></td>
                    <td>{r.client.name}</td>
                    <td><Badge tone={r.status === "OPEN" ? "mint" : r.status === "ON_HOLD" ? "lime" : "dim"}>{r.status === "ON_HOLD" ? "On hold" : r.status[0] + r.status.slice(1).toLowerCase()}</Badge></td>
                    <td>{r.profiles.length}</td>
                    <td>{waiting ? <Badge tone="pink">{waiting} to review</Badge> : <span className="faint">-</span>}</td>
                    <td className="dim">{-daysFromNow(r.createdAt)}d</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}
    </>
  );
}
