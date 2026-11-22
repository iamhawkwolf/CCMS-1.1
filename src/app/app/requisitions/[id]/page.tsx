import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { getClientFor, requireStaff } from "@/lib/auth/context";
import { loadSettings } from "@/lib/features/server";
import { resolveFeature } from "@/lib/features/resolve";
import { allowedNextStages, STAGE_LABEL } from "@/lib/requisition/stages";
import { StageBadge } from "@/components/stage";
import { Badge, Card, Empty, Field, Notice, PageHeader, fmtDate } from "@/components/ui";
import { addJd, approveAndShare, changeStage, revokeLink, submitProfile } from "../actions";

export const metadata: Metadata = { title: "Requisition" };

export default async function RequisitionPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; notice?: string }> }) {
  const ctx = await requireStaff();
  const [{ id }, { error, notice }] = await Promise.all([params, searchParams]);
  const req = await db.requisition.findFirst({
    where: { id, consultancyId: ctx.consultancyId },
    include: {
      client: true,
      profiles: { orderBy: { submittedAt: "desc" }, include: { events: { orderBy: { at: "desc" }, take: 3 }, interviews: { orderBy: { scheduledAt: "desc" }, take: 1 } } },
      jds: { orderBy: { createdAt: "desc" }, include: { shareLinks: { orderBy: { createdAt: "desc" }, include: { _count: { select: { views: true } }, views: { orderBy: { viewedAt: "desc" }, take: 1 } } } } },
    },
  });
  if (!req || !(await getClientFor(ctx, req.clientId))) notFound();
  const s = await loadSettings(ctx.consultancyId, req.clientId);
  if (!resolveFeature("requisition_tracker", ctx.plan, s.account, s.client).enabled) notFound();
  const mask = resolveFeature("number_masking", ctx.plan, s.account, s.client).enabled;
  const mark = resolveFeature("jd_watermark", ctx.plan, s.account, s.client).enabled;
  const base = process.env.APP_URL ?? "http://localhost:3000";
  const bound = (profileId: string) => changeStage.bind(null, id, profileId);

  return (
    <>
      <PageHeader eyebrow={req.client.name} title={req.title}>
        <Badge tone={req.status === "OPEN" ? "mint" : "dim"}>{req.status.toLowerCase()}</Badge>
        <Badge tone="violet">{req.openings} opening{req.openings > 1 ? "s" : ""}</Badge>
        {req.deadline && <Badge tone="cyan">By {fmtDate(req.deadline)}</Badge>}
      </PageHeader>
      {error && <p role="alert" className="badge b-rose mb-4" style={{ textTransform: "none" }}>{error}</p>}
      {notice && <div className="mb-4"><Notice tone="lime">{notice}</Notice></div>}

      <div className="grid gap-5 xl:grid-cols-[2fr_1fr]">
        <div className="grid content-start gap-5">
          <Card>
            <h2 className="h-section mb-3">Profiles ({req.profiles.length})</h2>
            {req.profiles.length === 0 ? <Empty title="No profiles yet" hint="Add a candidate below. Your client sees them instantly in the portal." /> : (
              <ul className="grid gap-3">
                {req.profiles.map((p) => {
                  const next = allowedNextStages(p.stage);
                  const last = p.events[0];
                  return (
                    <li key={p.id} className="glass-flat p-4">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <div className="font-semibold">{p.name}</div>
                          <div className="faint text-xs">{[p.currentCompany, p.experienceYears ? `${p.experienceYears} yrs` : null, p.expectedCtc ? `expects ₹${p.expectedCtc.toLocaleString("en-IN")}` : null, p.noticeDays != null ? `${p.noticeDays}d notice` : null].filter(Boolean).join(" · ")}</div>
                        </div>
                        <StageBadge stage={p.stage} />
                      </div>
                      {p.clientComment && <p className="dim mt-2 text-sm">Client: {p.clientComment}</p>}
                      {p.interviews[0] && <p className="faint mt-1 text-xs">Interview {fmtDate(p.interviews[0].scheduledAt)}</p>}
                      {last && <p className="faint mt-1 text-xs">Last update {fmtDate(last.at)}</p>}
                      {next.length > 0 && (
                        <form action={bound(p.id)} className="mt-3 flex flex-wrap items-center gap-2">
                          <input className="input !w-48" name="comment" placeholder="Comment (optional)" aria-label="Comment" />
                          {next.includes("INTERVIEW_SCHEDULED") && <input className="input !w-48" type="datetime-local" name="interviewAt" aria-label="Interview time" />}
                          {next.map((n) => <button key={n} className={`btn btn-sm ${n === "REJECTED" ? "btn-danger" : ""}`} name="to" value={n} type="submit">{STAGE_LABEL[n]}</button>)}
                        </form>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          <Card>
            <h2 className="h-section mb-1">Submit a profile</h2>
            <p className="dim mb-4 text-sm">Duplicates are caught by phone number or email.</p>
            <form action={submitProfile.bind(null, id)} className="grid gap-4 sm:grid-cols-2">
              <Field label="Name"><input className="input" name="name" required /></Field>
              <Field label="Current company"><input className="input" name="currentCompany" /></Field>
              <Field label="Phone"><input className="input" name="phone" inputMode="tel" /></Field>
              <Field label="Email"><input className="input" name="email" type="email" /></Field>
              <Field label="Experience (years)"><input className="input" name="experienceYears" type="number" step="0.5" min={0} /></Field>
              <Field label="Notice period (days)"><input className="input" name="noticeDays" type="number" min={0} /></Field>
              <Field label="Current CTC (₹)"><input className="input" name="currentCtc" type="number" min={0} /></Field>
              <Field label="Expected CTC (₹)"><input className="input" name="expectedCtc" type="number" min={0} /></Field>
              <Field label="Resume link"><input className="input" name="resumeUrl" type="url" /></Field>
              <div className="flex items-end"><button className="btn btn-primary" type="submit">Submit to client</button></div>
            </form>
          </Card>
        </div>

        <div className="grid content-start gap-5">
          <Card>
            <h2 className="h-section">Job description</h2>
            <p className="dim mb-3 mt-1 text-sm">
              {mask ? "Phone numbers and emails are masked automatically. " : "Masking is off for this client. "}
              {mark ? "Your name is stamped on the shared copy." : "Watermark is off for this client."}
            </p>
            {req.jds.map((jd) => (
              <div key={jd.id} className="glass-flat mb-3 p-3">
                <div className="mb-2 flex items-center justify-between"><span className="faint text-xs">Added {fmtDate(jd.createdAt)}</span>{jd.approved ? <Badge tone="mint">Approved</Badge> : <Badge tone="lime">Review needed</Badge>}</div>
                <form action={approveAndShare.bind(null, id, jd.id)} className="grid gap-2">
                  <textarea className="input" name="maskedText" rows={7} defaultValue={jd.maskedText} aria-label="Masked JD text" />
                  <div className="flex flex-wrap items-center gap-2">
                    <select className="input !w-auto" name="days" defaultValue="14" aria-label="Link expiry"><option value="7">Expires in 7 days</option><option value="14">Expires in 14 days</option><option value="30">Expires in 30 days</option><option value="0">No expiry</option></select>
                    <button className="btn btn-sm btn-primary" type="submit">{jd.approved ? "Save and new link" : "Approve and create link"}</button>
                  </div>
                </form>
                {jd.shareLinks.map((l) => {
                  const live = !l.revokedAt && (!l.expiresAt || l.expiresAt > new Date());
                  return (
                    <div key={l.id} className="mt-3 border-t pt-3 text-xs" style={{ borderColor: "var(--glass-border)" }}>
                      <div className="flex items-center justify-between gap-2"><Badge tone={live ? "mint" : "dim"}>{live ? "Live" : l.revokedAt ? "Revoked" : "Expired"}</Badge><span className="faint">{l._count.views} view{l._count.views === 1 ? "" : "s"}{l.views[0] ? ` · last ${fmtDate(l.views[0].viewedAt)}` : ""}</span></div>
                      <code className="dim mt-2 block break-all">{`${base}/share/${l.token}`}</code>
                      {live && <form action={revokeLink.bind(null, id, l.id)} className="mt-2"><button className="btn btn-sm btn-danger" type="submit">Revoke</button></form>}
                    </div>
                  );
                })}
              </div>
            ))}
            <form action={addJd.bind(null, id)} className="grid gap-2">
              <textarea className="input" name="text" rows={5} placeholder="Paste the JD text here" aria-label="JD text" />
              <button className="btn btn-sm" type="submit">Add JD</button>
            </form>
            <p className="faint mt-3 text-xs">Watermarks and masking deter leaks, but cannot stop someone retyping a number by hand.</p>
          </Card>
        </div>
      </div>
    </>
  );
}
