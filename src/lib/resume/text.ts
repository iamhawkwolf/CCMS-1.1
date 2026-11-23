// Turns an uploaded PDF or Word file into plain text.
// Pure JavaScript (unpdf, mammoth), so it runs on any server without system packages.
import { extractText, getDocumentProxy } from "unpdf";
import mammoth from "mammoth";

export const MAX_RESUME_BYTES = 5 * 1024 * 1024;
/** Below this many characters a PDF is almost certainly a scan with no text layer. */
const MIN_TEXT_CHARS = 80;

export class ResumeFileError extends Error {
  constructor(
    message: string,
    readonly code: "too_large" | "unsupported" | "unreadable" | "needs_ocr",
  ) {
    super(message);
  }
}

export type FileKind = "pdf" | "docx";

/** Decides the type from the file's first bytes, never from the name or declared type. */
export function sniffFileKind(buf: Uint8Array): FileKind | null {
  if (buf.length >= 5 && buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46 && buf[4] === 0x2d) return "pdf"; // %PDF-
  // .docx is a zip (PK\x03\x04). Old binary .doc (D0 CF 11 E0) is not supported.
  if (buf.length >= 4 && buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04) return "docx";
  return null;
}

/** Collapses the layout noise PDF extraction leaves behind. Keeps line breaks, since the rules rely on them. */
export function normaliseText(raw: string): string {
  return raw
    .replace(/\r\n?/g, "\n")
    .replace(/ /g, " ")
    .replace(/[​-‍﻿]/g, "")
    .replace(/[•●▪■◦○➢➤✓–—]/g, (c) => (c === "–" || c === "—" ? "-" : "•"))
    .replace(/[ \t]+/g, " ")
    .replace(/ ?\n ?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export async function readResumeText(file: Uint8Array): Promise<{ text: string; kind: FileKind; pages: number | null }> {
  if (file.length > MAX_RESUME_BYTES) throw new ResumeFileError("File is larger than 5 MB.", "too_large");
  const kind = sniffFileKind(file);
  if (!kind) throw new ResumeFileError("Only PDF and Word (.docx) resumes are supported.", "unsupported");

  let text: string;
  let pages: number | null = null;
  try {
    if (kind === "pdf") {
      const pdf = await getDocumentProxy(new Uint8Array(file));
      const out = await extractText(pdf, { mergePages: true });
      text = out.text;
      pages = out.totalPages;
    } else {
      text = (await mammoth.extractRawText({ buffer: Buffer.from(file) })).value;
    }
  } catch {
    throw new ResumeFileError("The file could not be read. It may be corrupted or password protected.", "unreadable");
  }

  text = normaliseText(text);
  if (text.length < MIN_TEXT_CHARS) {
    throw new ResumeFileError("No readable text found. This looks like a scanned image; scanned resumes need OCR, which is not enabled.", "needs_ocr");
  }
  return { text, kind, pages };
}
