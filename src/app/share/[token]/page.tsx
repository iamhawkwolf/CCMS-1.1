import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { loadSettings } from "@/lib/features/server";
import { resolveFeature } from "@/lib/features/resolve";

export const metadata: Metadata = { title: "Job description", robots: { index: false, follow: false } };

// Public, tracked, view-only. Every open is logged so the consultant can see who looked.
export default async function SharedJd({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const link = await db.shareLink.findUnique({ where: { token }, include: { jd: { include: { requisition: { include: { client: true } } } } } });
  if (!link || link.revokedAt || (link.expiresAt && link.expiresAt < new Date()) || !link.jd.approved) notFound();

  const req = link.jd.requisition;
  const consultancy = await db.consultancy.findUniqueOrThrow({ where: { id: req.consultancyId } });
  const s = await loadSettings(req.consultancyId, req.clientId);
  if (!resolveFeature("requisition_tracker", consultancy.plan, s.account, s.client).enabled) notFound();

  const h = await headers();
  await db.shareLinkView.create({ data: { linkId: link.id, ip: h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null, userAgent: h.get("user-agent")?.slice(0, 300) ?? null } });

  const stamp = link.jd.watermarkName ? `${link.jd.watermarkName} · ${consultancy.name}` : null;
  const tile = stamp ? Array.from({ length: 30 }, (_, i) => <span key={i}>{stamp}</span>) : null;

  return (
    <main className="relative mx-auto my-8 max-w-3xl p-4">
      <article className="glass relative overflow-hidden p-8" style={{ userSelect: "none" }}>
        <p className="eyebrow">{consultancy.name}</p>
        <h1 className="h-display mt-1">{req.title}</h1>
        <div className="mt-6 whitespace-pre-wrap leading-relaxed">{link.jd.maskedText}</div>
        {tile && (
          <div aria-hidden className="pointer-events-none absolute inset-0 grid -rotate-[24deg] scale-150 grid-cols-3 content-around gap-x-6 gap-y-14 overflow-hidden text-center text-sm font-bold" style={{ color: "var(--text)", opacity: 0.09 }}>
            {tile}
          </div>
        )}
      </article>
      <p className="faint mt-4 text-center text-xs">Shared by {consultancy.name}. Please contact them for anything about this role.</p>
    </main>
  );
}
