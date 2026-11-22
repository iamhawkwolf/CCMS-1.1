import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/lib/db";
import { requireClientUser } from "@/lib/auth/context";
import { isFeatureOn } from "@/lib/features/server";
import { Badge, Card, Empty, Field, PageHeader, fmtDate } from "@/components/ui";
import { raiseRequisition } from "./actions";

export const metadata: Metadata = { title: "Your hiring" };

export default async function PortalHome({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const ctx = await requireClientUser();
  const { error } = await searchParams;
  const [portalOn, reqOn] = await Promise.all([isFeatureOn("client_portal", ctx.consultancyId, ctx.plan, ctx.clientId), isFeatureOn("requisition_tracker", ctx.consultancyId, ctx.plan, ctx.clientId)]);
  if (!portalOn) return <Empty title="Portal unavailable" hint={`Your portal is not switched on. Please contact ${ctx.consultancyName}.`} />;
  if (!reqOn) return <Empty title="Nothing here yet" hint={`Hiring tracking is not enabled for your account. Please contact ${ctx.consultancyName}.`} />;

  const reqs = await db.requisition.findMany({ where: { clientId: ctx.clientId, consultancyId: ctx.consultancyId }, orderBy: { createdAt: "desc" }, include: { profiles: { select: { stage: true } } } });

  return (
    <>
      <PageHeader eyebrow="Your hiring" title="Open roles and candidates" />
      {error && <p role="alert" className="badge b-red mb-4" style={{ textTransform: "none" }}>{error}</p>}
      <div className="grid gap-5 lg:grid-cols-[2fr_1fr]">
        <div className="grid content-start gap-3">
          {reqs.length === 0 ? <Empty title="No requisitions yet" hint="Raise your first requirement on the right." /> : reqs.map((r) => {
            const waiting = r.profiles.filter((p) => p.stage === "SUBMITTED").length;
            return (
              <Link key={r.id} href={`/portal/requisitions/${r.id}`}>
                <Card hover className="flex flex-wrap items-center justify-between gap-3">
                  <div><div className="h-section">{r.title}</div><div className="faint text-xs">{r.openings} opening{r.openings > 1 ? "s" : ""}{r.deadline ? ` · by ${fmtDate(r.deadline)}` : ""}</div></div>
                  <div className="flex gap-2">{waiting > 0 && <Badge tone="blue">{waiting} to review</Badge>}<Badge tone="blue">{r.profiles.length} profiles</Badge></div>
                </Card>
              </Link>
            );
          })}
        </div>
        <Card className="content-start">
          <h2 className="h-section mb-3">Raise a requisition</h2>
          <form action={raiseRequisition} className="grid gap-3">
            <Field label="Role"><input className="input" name="title" required /></Field>
            <Field label="Openings"><input className="input" name="openings" type="number" min={1} defaultValue={1} required /></Field>
            <Field label="Needed by"><input className="input" name="deadline" type="date" /></Field>
            <button className="btn btn-primary" type="submit">Send to {ctx.consultancyName}</button>
          </form>
        </Card>
      </div>
    </>
  );
}
