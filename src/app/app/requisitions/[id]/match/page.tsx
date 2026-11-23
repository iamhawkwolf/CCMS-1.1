import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { clientScope, requireStaff } from "@/lib/auth/context";
import { loadSettings } from "@/lib/features/server";
import { resolveFeature } from "@/lib/features/resolve";
import { configuredProvider } from "@/lib/resume";
import { MatchWorkbench } from "@/components/match-workbench";
import { Card, Notice, PageHeader } from "@/components/ui";
import { submitProfile } from "../../actions";

export const metadata: Metadata = { title: "Match resumes" };

export default async function MatchPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireStaff();
  const { id } = await params;
  const req = await db.requisition.findFirst({
    where: { id, consultancyId: ctx.consultancyId, client: clientScope(ctx) },
    include: { client: true, jds: { orderBy: { createdAt: "desc" }, take: 1, select: { id: true } } },
  });
  if (!req) notFound();
  const s = await loadSettings(ctx.consultancyId, req.clientId);
  if (!resolveFeature("requisition_tracker", ctx.plan, s.account, s.client).enabled) notFound();

  return (
    <>
      <PageHeader eyebrow={req.client.name} title={`Match resumes: ${req.title}`} back={`/app/requisitions/${id}`} />
      <Card>
        {req.jds.length === 0 ? (
          <Notice tone="blue">
            Add the job description first. Matching compares every resume against it.{" "}
            <Link href={`/app/requisitions/${id}`} className="underline">Go to the requisition</Link>
          </Notice>
        ) : (
          <>
            <p className="dim mb-4 text-sm">Upload resumes to rank them against this requisition&apos;s latest job description. Nothing is saved until you submit a candidate.</p>
            <MatchWorkbench requisitionId={id} submitAction={submitProfile.bind(null, id)} aiMode={configuredProvider()} />
          </>
        )}
      </Card>
    </>
  );
}
