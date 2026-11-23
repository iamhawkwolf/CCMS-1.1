import { clientScope, getCtx } from "@/lib/auth/context";
import { db } from "@/lib/db";
import { emailKey, phoneKey } from "@/lib/requisition/stages";
import { MAX_RESUME_BYTES, parseResume, ResumeFileError } from "@/lib/resume";

export const dynamic = "force-dynamic";
export const maxDuration = 180; // a self-hosted model on CPU can take a minute or more

const STATUS: Record<ResumeFileError["code"], number> = { too_large: 413, unsupported: 415, unreadable: 422, needs_ocr: 422 };

/**
 * POST multipart/form-data with a "file" (PDF or .docx, up to 5 MB).
 * Returns the extracted fields for the "Submit a profile" form plus any candidate already on file
 * with the same phone or email. Nothing is stored here: the consultant reviews, then submits.
 */
export async function POST(req: Request): Promise<Response> {
  const ctx = await getCtx();
  if (!ctx) return Response.json({ error: "Not signed in" }, { status: 401 });
  if (ctx.role === "CLIENT_USER") return Response.json({ error: "Not allowed" }, { status: 403 });

  // Reject oversized uploads before reading the body into memory.
  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > MAX_RESUME_BYTES + 64 * 1024) return Response.json({ error: "File is larger than 5 MB." }, { status: 413 });

  let file: File | null = null;
  try {
    const f = (await req.formData()).get("file");
    file = f instanceof File ? f : null;
  } catch {
    return Response.json({ error: "Send the resume as multipart form data in a field named \"file\"." }, { status: 400 });
  }
  if (!file) return Response.json({ error: "No file uploaded." }, { status: 400 });

  try {
    const out = await parseResume(new Uint8Array(await file.arrayBuffer()));
    const pk = phoneKey(out.fields.phone);
    const ek = emailKey(out.fields.email);
    const existing =
      pk || ek
        ? await db.profile.findMany({
            where: { OR: [...(pk ? [{ phoneKey: pk }] : []), ...(ek ? [{ emailKey: ek }] : [])], requisition: { consultancyId: ctx.consultancyId, client: clientScope(ctx) } },
            select: { id: true, name: true, requisition: { select: { id: true, title: true } } },
            take: 5,
          })
        : [];
    return Response.json({ fields: out.fields, method: out.method, warnings: out.warnings, existing, file: { kind: out.kind, pages: out.pages } });
  } catch (e) {
    if (e instanceof ResumeFileError) return Response.json({ error: e.message, code: e.code }, { status: STATUS[e.code] });
    console.error("[resume] parse failed:", e);
    return Response.json({ error: "Could not process this resume." }, { status: 500 });
  }
}
