import { db } from "@/lib/db";
import { getCtx } from "@/lib/auth/context";
import { audit } from "@/lib/audit";
import { getStore } from "@/lib/storage";
import { MIME, type ResumeKind } from "@/lib/resume/file";

// The original resume is for consultancy staff only. Client users get the masked profile, never this file.
export async function GET(_req: Request, { params }: { params: Promise<{ profileId: string }> }) {
  const ctx = await getCtx();
  if (!ctx || ctx.role === "CLIENT_USER") return new Response("Not found", { status: 404 });
  const { profileId } = await params;
  const p = await db.profile.findFirst({ where: { id: profileId, requisition: { consultancyId: ctx.consultancyId } }, select: { id: true, resumeKey: true, resumeName: true } });
  if (!p?.resumeKey) return new Response("Not found", { status: 404 });
  const data = await getStore().get(p.resumeKey);
  if (!data) return new Response("Not found", { status: 404 });
  await audit(ctx.consultancyId, ctx.userId, "resume.download", "Profile", p.id);
  const ext = p.resumeKey.split(".").pop() as ResumeKind;
  const name = (p.resumeName ?? `resume.${ext}`).replace(/[^\w.\- ]/g, "_");
  return new Response(new Uint8Array(data), { headers: { "content-type": MIME[ext] ?? "application/octet-stream", "content-disposition": `attachment; filename="${name}"`, "cache-control": "private, no-store", "x-content-type-options": "nosniff" } });
}
