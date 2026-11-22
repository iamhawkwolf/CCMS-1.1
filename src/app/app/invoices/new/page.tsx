import type { Metadata } from "next";
import { db } from "@/lib/db";
import { clientScope, requireStaff } from "@/lib/auth/context";
import { Card, Field, Notice, PageHeader } from "@/components/ui";
import { createInvoice } from "../actions";

export const metadata: Metadata = { title: "New invoice" };

export default async function NewInvoice({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const ctx = await requireStaff();
  const { error } = await searchParams;
  const [clients, consultancy] = await Promise.all([
    db.client.findMany({ where: { ...clientScope(ctx), active: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.consultancy.findUniqueOrThrow({ where: { id: ctx.consultancyId }, select: { state: true } }),
  ]);
  return (
    <>
      <PageHeader eyebrow="Billing" title="New GST invoice" />
      {error && <p role="alert" className="badge b-red mb-4" style={{ textTransform: "none" }}>{error}</p>}
      {!consultancy.state && <div className="mb-4 max-w-3xl"><Notice tone="blue">Your business state is not set, so GST is split as CGST and SGST. Set it in Settings to charge IGST on out-of-state clients.</Notice></div>}
      <form action={createInvoice} className="max-w-3xl">
        <Card className="grid gap-4 sm:grid-cols-2">
          <Field label="Client"><select className="input" name="clientId" required>{clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
          <Field label="Fee model">
            <select className="input" name="feeModel" defaultValue="RETAINER"><option value="RETAINER">Retainer</option><option value="FIXED">Fixed fee</option><option value="HOURLY">Hourly</option><option value="PER_HEAD">Per head</option></select>
          </Field>
          <div className="sm:col-span-2"><Field label="Description"><input className="input" name="description" required placeholder="Monthly HR retainer, November 2026" /></Field></div>
          <Field label="Quantity" hint="Months, hours or heads"><input className="input" name="quantity" type="number" step="0.01" min="0.01" defaultValue={1} required /></Field>
          <Field label="Rate (₹, before GST)"><input className="input" name="rate" type="number" step="0.01" min="0.01" required /></Field>
          <Field label="Payment due in (days)"><input className="input" name="dueDays" type="number" min={0} defaultValue={15} required /></Field>
          <div className="flex items-end"><button className="btn btn-primary" type="submit">Create invoice</button></div>
        </Card>
      </form>
    </>
  );
}
