import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireClientUser } from "@/lib/auth/context";
import { isFeatureOn } from "@/lib/features/server";
import { StageBadge } from "@/components/stage";
import { Card, Empty, PageHeader } from "@/components/ui";
import { reviewProfile } from "../../actions";

export const metadata: Metadata = { title: "Candidates" };

export default async function PortalRequisition({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireClientUser();
  const { id } = await params;
  if (!(await isFeatureOn("client_portal", ctx.consultancyId, ctx.plan, ctx.clientId))) notFound();
  const req = await db.requisition.findFirst({ where: { id, clientId: ctx.clientId, consultancyId: ctx.consultancyId }, include: { profiles: { orderBy: { submittedAt: "desc" } } } });
  if (!req) notFound();

  return (
    <>
      <Link href="/portal" className="faint mb-2 inline-block text-sm hover:underline">← All roles</Link>
      <PageHeader eyebrow="Candidates" title={req.title} />
      {req.profiles.length === 0 ? <Empty title="No candidates yet" hint="Your consultant will add profiles here as they find them." /> : (
        <div className="grid gap-3">
          {req.profiles.map((p) => (
            <Card key={p.id}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="h-section">{p.name}</div>
                  <div className="dim text-sm">{[p.currentCompany, p.experienceYears ? `${p.experienceYears} yrs experience` : null, p.expectedCtc ? `expects ₹${p.expectedCtc.toLocaleString("en-IN")}` : null, p.noticeDays != null ? `${p.noticeDays} days notice` : null].filter(Boolean).join(" · ")}</div>
                  {p.resumeUrl && <a href={p.resumeUrl} target="_blank" rel="noopener noreferrer" className="gradient-text text-sm font-semibold">View resume</a>}
                </div>
                <StageBadge stage={p.stage} />
              </div>
              {(p.stage === "SUBMITTED" || p.stage === "SHORTLISTED") && (
                <form action={reviewProfile.bind(null, id, p.id)} className="mt-4 flex flex-wrap items-center gap-2">
                  <input className="input !w-56" name="comment" placeholder="Comment (optional)" aria-label="Comment" />
                  {p.stage === "SUBMITTED" && <button className="btn btn-sm btn-primary" name="to" value="SHORTLISTED" type="submit">Shortlist</button>}
                  <button className="btn btn-sm" name="to" value="INTERVIEW_SCHEDULED" type="submit">Request interview</button>
                  <button className="btn btn-sm btn-danger" name="to" value="REJECTED" type="submit">Reject</button>
                </form>
              )}
              {p.clientComment && <p className="faint mt-3 text-sm">Your note: {p.clientComment}</p>}
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
