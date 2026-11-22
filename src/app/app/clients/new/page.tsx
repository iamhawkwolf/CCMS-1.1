import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth/context";
import { STATES } from "@/lib/compliance/rules";
import { Card, Field, Notice, PageHeader } from "@/components/ui";
import { createClient } from "../actions";

export const metadata: Metadata = { title: "Add client" };

export default async function NewClientPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  await requireAdmin();
  const { error } = await searchParams;
  return (
    <>
      <PageHeader eyebrow="Clients" title="Add a client company" />
      {error && <p role="alert" className="badge b-rose mb-4" style={{ textTransform: "none" }}>{error}</p>}
      <form action={createClient} className="grid max-w-3xl gap-5">
        <Card className="grid gap-4 sm:grid-cols-2">
          <Field label="Company name"><input className="input" name="name" required /></Field>
          <Field label="State of operation">
            <select className="input" name="state" required defaultValue="KA">
              {Object.entries(STATES).map(([code, name]) => <option key={code} value={code}>{name}</option>)}
            </select>
          </Field>
          <Field label="GSTIN" hint="Used as place of supply on invoices"><input className="input" name="gstin" /></Field>
          <Field label="Address"><input className="input" name="address" /></Field>
        </Card>
        <Card className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <h2 className="h-section">Statutory registrations</h2>
            <p className="dim text-sm">Fill the ones that apply. Each one switches on its filing deadlines in the compliance calendar.</p>
          </div>
          <Field label="PF number"><input className="input" name="pfNumber" /></Field>
          <Field label="ESI number"><input className="input" name="esiNumber" /></Field>
          <Field label="Professional Tax number"><input className="input" name="ptNumber" /></Field>
          <Field label="TAN (for TDS)"><input className="input" name="tan" /></Field>
          <Field label="LWF number"><input className="input" name="lwfNumber" /></Field>
          <Field label="Notes"><input className="input" name="notes" /></Field>
        </Card>
        <Notice tone="lime">Compliance dates come from seed rules that your CA should confirm before you rely on them.</Notice>
        <div><button className="btn btn-primary" type="submit">Create client</button></div>
      </form>
    </>
  );
}
