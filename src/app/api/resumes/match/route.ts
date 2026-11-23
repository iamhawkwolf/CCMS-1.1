import { clientScope, getCtx } from "@/lib/auth/context";
import { db } from "@/lib/db";
import { configuredProvider, MAX_RESUME_BYTES, parseResume, ResumeFileError } from "@/lib/resume";
import { rankResumes } from "@/lib/resume/match";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const MAX_FILES = 20;
const MAX_JD_CHARS = 20_000;

/**
 * POST multipart/form-data:
 *   file        one or more resumes (PDF or .docx, 5 MB each, up to 20)
 *   requisitionId   score against that requisition's latest JD   (or)
 *   jdText      a pasted JD
 * Returns every resume with a 0 to 100 match percentage, best first, with the reasons behind it.
 * Nothing is stored. Rules score every resume; the AI (if configured) only re-judges the top ones.
 */
export async function POST(req: Request): Promise<Response> {
  const ctx = await getCtx();
  if (!ctx) return Response.json({ error: "Not signed in" }, { status: 401 });
  if (ctx.role === "CLIENT_USER") return Response.json({ error: "Not allowed" }, { status: 403 });

  if (Number(req.headers.get("content-length") ?? 0) > MAX_FILES * MAX_RESUME_BYTES + 256 * 1024) return Response.json({ error: "Upload is too large." }, { status: 413 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return Response.json({ error: "Send multipart form data." }, { status: 400 });
  }
  const files = form.getAll("file").filter((f): f is File => f instanceof File);
  if (!files.length) return Response.json({ error: "Upload at least one resume in the \"file\" field." }, { status: 400 });
  if (files.length > MAX_FILES) return Response.json({ error: `Upload at most ${MAX_FILES} resumes at a time.` }, { status: 400 });

  // Where does the JD come from? Either a requisition this person may see, or pasted text.
  let jdText = String(form.get("jdText") ?? "").trim();
  let jdTitle: string | null = null;
  const requisitionId = String(form.get("requisitionId") ?? "");
  if (requisitionId) {
    const reqn = await db.requisition.findFirst({
      where: { id: requisitionId, consultancyId: ctx.consultancyId, client: clientScope(ctx) },
      select: { title: true, jds: { orderBy: { createdAt: "desc" }, take: 1, select: { originalText: true } } },
    });
    if (!reqn) return Response.json({ error: "Requisition not found." }, { status: 404 });
    if (!reqn.jds[0]) return Response.json({ error: "This requisition has no job description yet." }, { status: 422 });
    jdText = reqn.jds[0].originalText;
    jdTitle = reqn.title;
  }
  if (jdText.length < 40) return Response.json({ error: "Provide a requisitionId with a JD, or paste the JD in \"jdText\"." }, { status: 400 });

  // Read each file one at a time so memory stays flat; a bad file reports its own error and does not stop the rest.
  const readable: Array<{ id: string; name: string; text: string; fields: Awaited<ReturnType<typeof parseResume>>["fields"] }> = [];
  const failed: Array<{ name: string; error: string; code?: string }> = [];
  for (const [i, f] of files.entries()) {
    try {
      const out = await parseResume(new Uint8Array(await f.arrayBuffer()), { provider: "rules" }); // fields by rules; AI is spent on matching
      readable.push({ id: String(i), name: f.name, text: out.text, fields: out.fields });
    } catch (e) {
      failed.push({ name: f.name, error: e instanceof ResumeFileError ? e.message : "Could not read this file.", code: e instanceof ResumeFileError ? e.code : undefined });
    }
  }

  const ranked = await rankResumes(jdText.slice(0, MAX_JD_CHARS), readable.map((r) => ({ id: r.id, text: r.text })), { provider: configuredProvider(), jdTitle });
  const byId = new Map(readable.map((r) => [r.id, r]));
  return Response.json({
    results: ranked.map(({ id, ...m }) => {
      const r = byId.get(id)!;
      return { file: r.name, candidate: r.fields, match: m };
    }),
    failed,
  });
}
