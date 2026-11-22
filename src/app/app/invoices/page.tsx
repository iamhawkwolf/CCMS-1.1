import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/lib/db";
import { requireStaff, visibleClientIds } from "@/lib/auth/context";
import { formatRupees } from "@/lib/billing/gst";
import { Badge, ButtonLink, Card, DueBadge, Empty, PageHeader, Stat, fmtDate, type Tone } from "@/components/ui";

export const metadata: Metadata = { title: "Invoices" };

const tone: Record<string, Tone> = { DRAFT: "dim", SENT: "blue", PARTIALLY_PAID: "blue", PAID: "green", VOID: "dim" };

export default async function InvoicesPage() {
  const ctx = await requireStaff();
  const ids = await visibleClientIds(ctx);
  const invoices = await db.invoice.findMany({ where: { clientId: { in: ids } }, orderBy: { issueDate: "desc" }, take: 100, include: { client: { select: { name: true } }, payments: { select: { amountPaise: true } } } });
  const balance = (i: (typeof invoices)[number]) => i.totalPaise - i.payments.reduce((a, p) => a + p.amountPaise, 0);
  const open = invoices.filter((i) => i.status === "SENT" || i.status === "PARTIALLY_PAID");
  const overdue = open.filter((i) => i.dueDate < new Date());

  return (
    <>
      <PageHeader eyebrow="Billing" title="Invoices"><ButtonLink href="/app/invoices/new" primary>New invoice</ButtonLink></PageHeader>
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Stat label="Outstanding" value={formatRupees(open.reduce((a, i) => a + balance(i), 0))} tone="blue" />
        <Stat label="Overdue" value={formatRupees(overdue.reduce((a, i) => a + balance(i), 0))} tone={overdue.length ? "red" : "green"} hint={`${overdue.length} invoice${overdue.length === 1 ? "" : "s"}`} />
        <Stat label="Collected" value={formatRupees(invoices.reduce((a, i) => a + i.payments.reduce((b, p) => b + p.amountPaise, 0), 0))} tone="green" />
      </div>
      {invoices.length === 0 ? <Empty title="No invoices yet" hint="Create a GST invoice for a client's retainer, fixed fee, hourly or per-head work." /> : (
        <Card className="overflow-x-auto !p-2">
          <table className="table">
            <thead><tr><th>Number</th><th>Client</th><th>Issued</th><th>Due</th><th>Total</th><th>Status</th></tr></thead>
            <tbody>
              {invoices.map((i) => (
                <tr key={i.id}>
                  <td><Link href={`/app/invoices/${i.id}`} className="font-semibold hover:underline">{i.number}</Link></td>
                  <td>{i.client.name}</td>
                  <td>{fmtDate(i.issueDate)}</td>
                  <td><div>{fmtDate(i.dueDate)}</div>{(i.status === "SENT" || i.status === "PARTIALLY_PAID") && <DueBadge due={i.dueDate} />}</td>
                  <td>{formatRupees(i.totalPaise)}</td>
                  <td><Badge tone={tone[i.status] ?? "dim"}>{i.status.replace("_", " ").toLowerCase()}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </>
  );
}
