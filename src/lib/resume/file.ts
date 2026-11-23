// File checks and text extraction for uploaded resumes.
export const MAX_RESUME_BYTES = 4 * 1024 * 1024; // Vercel functions cap request bodies near 4.5 MB.

export type ResumeKind = "pdf" | "docx";

/** Identify the file by its first bytes, never by the name or the browser-reported type. */
export function detectKind(buf: Uint8Array): ResumeKind | null {
  const head = (n: number) => Array.from(buf.slice(0, n));
  const isPdf = head(5).join() === [0x25, 0x50, 0x44, 0x46, 0x2d].join(); // %PDF-
  if (isPdf) return "pdf";
  const isZip = buf.length > 4 && buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04;
  if (isZip && Buffer.from(buf).includes("word/")) return "docx";
  return null;
}

export const MIME: Record<ResumeKind, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

export async function extractText(buf: Buffer, kind: ResumeKind): Promise<string> {
  if (kind === "pdf") {
    const { extractText: pdfText, getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(new Uint8Array(buf));
    const { text } = await pdfText(pdf, { mergePages: true });
    return text;
  }
  const mammoth = await import("mammoth");
  const { value } = await mammoth.extractRawText({ buffer: buf });
  return value;
}
