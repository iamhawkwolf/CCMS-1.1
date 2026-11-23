// Rules-based resume reader. Pure text in, guessed fields out; nothing leaves the server.
// Every value is a suggestion: the consultant reviews and corrects it before submitting.
import { maskContactDetails } from "@/lib/jd/mask";

export interface ParsedResume {
  name: string | null;
  email: string | null;
  phone: string | null;
  currentCompany: string | null;
  experienceYears: number | null;
  currentCtc: number | null;
  expectedCtc: number | null;
  noticeDays: number | null;
}

const NOT_A_NAME = /resume|curriculum|vitae|\bcv\b|profile|summary|objective|email|e-mail|phone|mobile|contact|address|linkedin|github|http|@|\d/i;

function guessName(lines: string[]): string | null {
  for (const line of lines.slice(0, 10)) {
    const t = line.replace(/^(name\s*[:-]\s*)/i, "").trim();
    if (!t || NOT_A_NAME.test(t)) continue;
    const words = t.split(/\s+/);
    if (words.length < 2 || words.length > 4) continue;
    if (!words.every((w) => /^[A-Za-z.'-]{1,25}$/.test(w))) continue;
    // Title-case ALL-CAPS names ("PRIYA SHARMA" -> "Priya Sharma").
    return t === t.toUpperCase() ? words.map((w) => w[0]! + w.slice(1).toLowerCase()).join(" ") : t;
  }
  return null;
}

/** "12 LPA", "12.5 lakhs", "1200000", "12,00,000" -> rupees per year. */
export function parseCtc(raw: string): number | null {
  const s = raw.replace(/[₹,]|rs\.?|inr/gi, "").trim().toLowerCase();
  const lakh = s.match(/^(\d+(?:\.\d+)?)\s*(?:lpa|lakhs?|lacs?|l)\b/);
  if (lakh) return Math.round(parseFloat(lakh[1]!) * 100000);
  const plain = s.match(/^(\d{5,9})\b/);
  return plain ? parseInt(plain[1]!, 10) : null;
}

function labelled(text: string, label: RegExp): string | null {
  const m = text.match(new RegExp(`(?:${label.source})\\s*[:\\-–]?\\s*([^\\n]{1,60})`, "i"));
  return m ? m[1]!.trim() : null;
}

function guessExperience(text: string): number | null {
  const near = text.match(/(\d{1,2}(?:\.\d)?)\s*\+?\s*(?:years?|yrs?)\b[^\n]{0,30}experience/i) ?? text.match(/experience[^\n]{0,20}?(\d{1,2}(?:\.\d)?)\s*\+?\s*(?:years?|yrs?)\b/i);
  const v = near ? parseFloat(near[1]!) : NaN;
  return Number.isFinite(v) && v <= 60 ? v : null;
}

function guessNotice(text: string): number | null {
  if (/notice period[^\n]{0,20}(immediate|nil|none)|immediate(ly)? (joiner|available)/i.test(text)) return 0;
  const m = text.match(/notice(?:\s+period)?\s*[:\-–]?\s*(\d{1,3})\s*(days?|months?|weeks?)/i);
  if (!m) return null;
  const n = parseInt(m[1]!, 10);
  const unit = m[2]!.toLowerCase();
  return unit.startsWith("month") ? n * 30 : unit.startsWith("week") ? n * 7 : n;
}

function guessCompany(text: string): string | null {
  const labelledCo = labelled(text, /current(?:ly)? (?:company|employer|organi[sz]ation)|presently (?:working )?(?:at|with)|currently working (?:at|with)/);
  if (labelledCo) return labelledCo.replace(/[.,;|].*$/, "").trim() || null;
  const at = text.match(/\b(?:working|employed)\s+(?:as [^\n]{2,40}? )?(?:at|with)\s+([A-Z][^\n,.;|]{1,40})/);
  return at ? at[1]!.trim() : null;
}

export function parseResume(text: string): ParsedResume {
  const clean = text.replace(/\r/g, "").replace(/[ \t]+/g, " ");
  const lines = clean.split("\n").map((l) => l.trim()).filter(Boolean);
  const { matches } = maskContactDetails(clean);
  const email = matches.find((m) => m.kind === "email")?.original ?? null;
  const phoneRaw = matches.find((m) => m.kind === "phone")?.original ?? null;
  const phone = phoneRaw ? phoneRaw.replace(/[^\d+]/g, "") : null;

  const cur = labelled(clean, /current ctc|current salary|present ctc|ctc/);
  const exp = labelled(clean, /expected ctc|expected salary|expectation/);

  return {
    name: guessName(lines),
    email: email ? email.toLowerCase() : null,
    phone,
    currentCompany: guessCompany(clean),
    experienceYears: guessExperience(clean),
    currentCtc: cur ? parseCtc(cur) : null,
    expectedCtc: exp ? parseCtc(exp) : null,
    noticeDays: guessNotice(clean),
  };
}
