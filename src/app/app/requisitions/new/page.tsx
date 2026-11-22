import type { Metadata } from "next";
import { db } from "@/lib/db";
import { clientScope, requireStaff } from "@/lib/auth/context";
import { Card, Field, PageHeader } from "@/components/ui";
import { createRequisition } from "../actions";

export const metadata: Metadata = { title: "New requisition" };

export default async function NewRequisition({ searchParams }: { searchParams: Promise<{ error?: string; client?: string }> }) {
  const ctx = await requireStaff();
  const { error, client } = await searchParams;
  const clients = await db.client.findMany({ where: { ...clientScope(ctx), active: true }, orderBy: { name: "asc" }, select: { id: true, name: true } });
  return (
    <>
      <PageHeader eyebrow="Requisitions" title="Log a requisition" />
      {error && <p role="alert" className="badge b-rose mb-4" style={{ textTransform: "none" }}>{error}</p>}
      <form action={createRequisition} className="max-w-3xl">
        <Card className="grid gap-4 sm:grid-cols-2">
          <Field label="Client">
            <select className="input" name="clientId" required defaultValue={client}>{clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
          </Field>
          <Field label="Role"><input className="input" name="title" required placeholder="Senior Accountant" /></Field>
          <Field label="Openings"><input className="input" name="openings" type="number" min={1} defaultValue={1} required /></Field>
          <Field label="Deadline"><input className="input" name="deadline" type="date" /></Field>
          <Field label="Budget min (₹ per year)"><input className="input" name="budgetMin" type="number" min={0} /></Field>
          <Field label="Budget max (₹ per year)"><input className="input" name="budgetMax" type="number" min={0} /></Field>
          <div className="sm:col-span-2"><button className="btn btn-primary" type="submit">Create requisition</button></div>
        </Card>
      </form>
    </>
  );
}
