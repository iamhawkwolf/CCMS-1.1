import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { getClientFor, requireStaff } from "@/lib/auth/context";
import { formatRupees } from "@/lib/billing/gst";
import { Badge, Card, Field, PageHeader, fmtDate } from "@/components/ui";
import { markSent, recordPayment } from "../actions";

export const metadata: Metadata = { title: "Invoice" };

export default async function InvoicePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
  const ctx = await requireStaff();
  const [{ id }, { error }] = await Promise.all([params, searchParams]);
  const inv = await db.invoice.findFirst({ where: { id, consultancyId: ctx.consultancyId }, include: { client: true, lines: true, payments: { orderBy: { paidAt: "asc" } }, consultancy: true } });
  if (!inv || !(await getClientFor(ctx, inv.clientId))) notFound();
  const paid = inv.payments.reduce((a, p) => a + p.amountPaise, 0);
  const due = inv.totalPaise - paid;

  return (
    <>
      <PageHeader eyebrow={inv.client.name} title={inv.number}>
        <Badge tone={inv.status === "PAID" ? "mint" : inv.status === "DRAFT" ? "dim" : "cyan"}>{inv.status.replace("_", " ").toLowerCase()}</Badge>
        {inv.status === "DRAFT" && <form action={markSent.bind(null, id)}><button className="btn btn-sm btn-primary" type="submit">Mark as sent</button></form>}
      </PageHeader>
      {error && <p role="alert" className="badge b-rose mb-4" style={{ textTransform: "none" }}>{error}</p>}
      <div className="grid gap-5 xl:grid-cols-[2fr_1fr]">
        <Card>
          <div className="mb-4 flex flex-wrap justify-between gap-4 text-sm">
            <div><div className="eyebrow">From</div><div className="font-semibold">{inv.consultancy.name}</div><div className="dim">{inv.consultancy.gstin ? `GSTIN ${inv.consultancy.gstin}` : "GSTIN not set"}</div></div>
            <div><div className="eyebrow">Bill to</div><div className="font-semibold">{inv.client.name}</div><div className="dim">{inv.client.gstin ? `GSTIN ${inv.client.gstin}` : "No GSTIN"} · Place of supply {inv.placeOfSupply}</div></div>
            <div><div className="eyebrow">Dates</div><div>Issued {fmtDate(inv.issueDate)}</div><div>Due {fmtDate(inv.dueDate)}</div></div>
          </div>
          <table className="table">
            <thead><tr><th>Description</th><th>SAC</th><th>Qty</th><th>Rate</th><th>Amount</th></tr></thead>
            <tbody>{inv.lines.map((l) => <tr key={l.id}><td>{l.description}</td><td>{l.sac}</td><td>{String(l.quantity)}</td><td>{formatRupees(l.ratePaise)}</td><td>{formatRupees(l.amountPaise)}</td></tr>)}</tbody>
          </table>
          <dl className="mt-4 ml-auto grid max-w-xs gap-1.5 text-sm">
            <div className="flex justify-between"><dt className="dim">Subtotal</dt><dd>{formatRupees(inv.subtotalPaise)}</dd></div>
            {inv.igstPaise > 0 ? <div className="flex justify-between"><dt className="dim">IGST 18%</dt><dd>{formatRupees(inv.igstPaise)}</dd></div> : <><div className="flex justify-between"><dt className="dim">CGST 9%</dt><dd>{formatRupees(inv.cgstPaise)}</dd></div><div className="flex justify-between"><dt className="dim">SGST 9%</dt><dd>{formatRupees(inv.sgstPaise)}</dd></div></>}
            <div className="flex justify-between border-t pt-2 text-lg font-bold" style={{ borderColor: "var(--glass-border)" }}><dt>Total</dt><dd className="gradient-text">{formatRupees(inv.totalPaise)}</dd></div>
          </dl>
        </Card>
        <Card className="content-start">
          <h2 className="h-section">Payments</h2>
          <p className="dim mb-3 text-sm">Balance due <strong>{formatRupees(due)}</strong></p>
          <ul className="mb-4 grid gap-1.5 text-sm">{inv.payments.map((p) => <li key={p.id} className="flex justify-between"><span>{fmtDate(p.paidAt)} · {p.method}</span><span>{formatRupees(p.amountPaise)}</span></li>)}</ul>
          {due > 0 && inv.status !== "DRAFT" && (
            <form action={recordPayment.bind(null, id)} className="grid gap-3">
              <Field label="Amount (₹)"><input className="input" name="amount" type="number" step="0.01" min="0.01" max={due / 100} defaultValue={due / 100} required /></Field>
              <Field label="Method"><select className="input" name="method"><option value="UPI">UPI</option><option value="BANK">Bank transfer</option><option value="RAZORPAY">Razorpay</option><option value="CASH">Cash</option></select></Field>
              <Field label="Reference"><input className="input" name="reference" /></Field>
              <button className="btn btn-primary" type="submit">Record payment</button>
            </form>
          )}
          {inv.status === "DRAFT" && <p className="faint text-sm">Mark the invoice as sent to start collecting payments.</p>}
        </Card>
      </div>
    </>
  );
}
