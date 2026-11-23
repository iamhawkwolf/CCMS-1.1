// Rule-based field extraction. Free, instant, nothing leaves the server.
// Best effort: contact details are reliable; name, company and title are heuristics,
// which is why the consultant reviews every result before it is used.
import type { EducationEntry, ParsedResume } from "./types";
import { EMPTY_RESUME } from "./types";

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9-]+(?:\.[A-Z0-9-]+)*\.[A-Z]{2,}/i;
// Indian mobile: optional +91/91/0 prefix, then 10 digits starting 6-9, separators allowed.
const PHONE_RE = /(?<![\w])(?:(?:\+?91|0)[\s.-]*)?([6-9](?:[\s.-]?\d){9})(?![\w])/;

const MONTHS = "jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec";
const MONTH_INDEX: Record<string, number> = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, sept: 8, oct: 9, nov: 10, dec: 11 };
const PRESENT = "present|current|till date|to date|till now|ongoing|now|date";
// "Jan 2019 - Mar 2022", "January 2019 – Present", "01/2019 - 03/2022", "2019 - 2022"
const DATE = `(?:(?:${MONTHS})[a-z]*\\.?,?\\s+\\d{4}|\\d{1,2}[/.-]\\d{4}|\\d{4})`;
const RANGE_RE = new RegExp(`(${DATE})\\s*(?:-|to|until)\\s*(${DATE}|${PRESENT})`, "gi");

type SectionName = "summary" | "experience" | "education" | "skills" | "other";
const HEADINGS: Array<[SectionName, RegExp]> = [
  ["experience", /^(?:work(?:ing)?\s+)?(?:experience|history)|^(?:professional|employment|career)\s+(?:experience|history|summary)|^employment|^work\s+experience/i],
  ["education", /^education|^academic|^qualifications?/i],
  ["skills", /^(?:technical\s+|key\s+|core\s+|it\s+)?skills?|^technologies|^core\s+competenc|^areas?\s+of\s+expertise/i],
  ["summary", /^(?:professional\s+|career\s+)?(?:summary|profile|objective)|^about\s+me/i],
  ["other", /^(?:projects?|certifications?|achievements?|awards?|languages?|interests?|hobbies|declaration|personal\s+(?:details|information)|references?|training)\b/i],
];

function headingOf(line: string): SectionName | null {
  const t = line.replace(/[:\-_|•\s]+$/g, "").trim();
  // A heading has no inline content: "Languages: Java, Python" is a skills line, not a heading.
  if (!t || t.length > 40 || t.split(/\s+/).length > 4 || /[:,;|]/.test(t)) return null;
  for (const [name, re] of HEADINGS) if (re.test(t)) return name;
  return null;
}

export function splitSections(text: string): { head: string[]; sections: Record<SectionName, string[]> } {
  const sections: Record<SectionName, string[]> = { summary: [], experience: [], education: [], skills: [], other: [] };
  const head: string[] = [];
  let current: SectionName | null = null;
  for (const line of text.split("\n").map((l) => l.trim()).filter(Boolean)) {
    const h = headingOf(line);
    if (h) {
      current = h;
      continue;
    }
    (current ? sections[current] : head).push(line);
  }
  return { head, sections };
}

export function findEmail(text: string): string | null {
  return text.match(EMAIL_RE)?.[0].toLowerCase() ?? null;
}

export function findPhone(text: string): string | null {
  const m = text.match(PHONE_RE);
  if (!m) return null;
  const digits = m[1]!.replace(/\D/g, "");
  return `+91 ${digits.slice(0, 5)} ${digits.slice(5)}`;
}

const NOT_A_NAME = /resume|curriculum|vitae|\bcv\b|profile|contact|address|email|phone|mobile|linkedin|github|objective|summary|page \d/i;

export function findName(head: string[], email: string | null): string | null {
  for (const raw of head.slice(0, 12)) {
    const labelled = raw.match(/^name\s*[:\-]\s*(.+)$/i);
    const line = (labelled ? labelled[1]! : raw).trim();
    if (!labelled && (NOT_A_NAME.test(line) || /[@\d/]|https?:|www\./i.test(line))) continue;
    const words = line.split(/\s+/);
    if (words.length < 1 || words.length > 4) continue;
    if (!words.every((w) => /^[A-Za-z][A-Za-z.'-]*$/.test(w))) continue;
    if (words.length === 1 && !labelled) continue; // a lone word is usually a heading, not a name
    return words.map((w) => (w === w.toUpperCase() || w === w.toLowerCase() ? w[0]!.toUpperCase() + w.slice(1).toLowerCase() : w)).join(" ");
  }
  // Fall back to the part of the email before the @ when it looks like "first.last".
  const local = email?.split("@")[0];
  if (local && /^[a-z]+[._][a-z]+$/i.test(local)) return local.split(/[._]/).map((w) => w[0]!.toUpperCase() + w.slice(1).toLowerCase()).join(" ");
  return null;
}

interface Range {
  start: number; // months since year 0
  end: number;
  present: boolean;
  line: number;
}

function toMonths(token: string, asEnd: boolean, now: Date): { m: number; present: boolean } {
  const t = token.trim().toLowerCase();
  if (new RegExp(`^(?:${PRESENT})$`).test(t)) return { m: now.getFullYear() * 12 + now.getMonth(), present: true };
  const year = Number(t.match(/\d{4}/)![0]);
  const named = t.match(new RegExp(`^(${MONTHS})`));
  if (named) return { m: year * 12 + MONTH_INDEX[named[1]!]!, present: false };
  const numeric = t.match(/^(\d{1,2})[/.-]\d{4}$/);
  if (numeric) return { m: year * 12 + Math.min(Math.max(Number(numeric[1]) - 1, 0), 11), present: false };
  // Year only: a start is January, an end is December.
  return { m: year * 12 + (asEnd ? 11 : 0), present: false };
}

export function findRanges(lines: string[], now: Date): Range[] {
  const out: Range[] = [];
  lines.forEach((line, idx) => {
    for (const m of line.matchAll(RANGE_RE)) {
      const a = toMonths(m[1]!, false, now);
      const b = toMonths(m[2]!, true, now);
      if (b.m >= a.m && a.m / 12 > 1970 && a.m / 12 < now.getFullYear() + 1) out.push({ start: a.m, end: Math.min(b.m, now.getFullYear() * 12 + now.getMonth()), present: b.present, line: idx });
    }
  });
  return out;
}

/** Total experience: explicit "8 years of experience", else the union of dated jobs (overlaps counted once). */
export function findExperienceYears(fullText: string, experienceLines: string[], now: Date): number | null {
  const explicit = fullText.match(/(\d{1,2}(?:\.\d)?)\s*\+?\s*(?:years?|yrs?)(?:\s+and\s+\d+\s+months?)?\s*(?:of\s+)?(?:total\s+|relevant\s+|overall\s+|professional\s+|work\s+)?(?:experience|exp)/i);
  if (explicit) {
    const y = Number(explicit[1]);
    if (y >= 0 && y <= 50) return y;
  }
  const ranges = findRanges(experienceLines, now).sort((x, y) => x.start - y.start);
  if (!ranges.length) return null;
  let months = 0;
  let curStart = ranges[0]!.start;
  let curEnd = ranges[0]!.end;
  for (const r of ranges.slice(1)) {
    if (r.start <= curEnd + 1) curEnd = Math.max(curEnd, r.end);
    else {
      months += curEnd - curStart + 1;
      curStart = r.start;
      curEnd = r.end;
    }
  }
  months += curEnd - curStart + 1;
  return months > 0 ? Math.round((months / 12) * 10) / 10 : null;
}

const COMPANY_WORDS = /\b(?:ltd|limited|pvt|private|inc|llp|llc|corp|corporation|technologies|technology|solutions|systems|services|software|infotech|consulting|consultancy|bank|industries|labs|group|enterprises|global|india)\b\.?/i;
const TITLE_WORDS = /\b(?:engineer|developer|manager|executive|analyst|consultant|lead|architect|designer|administrator|associate|officer|head|director|specialist|recruiter|intern|trainee|accountant|coordinator|supervisor|assistant|programmer|tester|scientist)\b/i;

function stripDates(line: string): string {
  return line.replace(RANGE_RE, " ").replace(/\s{2,}/g, " ").replace(/^[\s|,\-–•:]+|[\s|,\-–•:(]+$/g, "").trim();
}

/** Looks around the most recent dated job and works out which line is the title and which is the company. */
export function findCurrentRole(expLines: string[], now: Date): { company: string | null; title: string | null } {
  const ranges = findRanges(expLines, now);
  if (!ranges.length) return { company: null, title: null };
  const current = ranges.find((r) => r.present) ?? ranges.reduce((a, b) => (b.end > a.end ? b : a));
  const idxs = [current.line, current.line - 1, current.line + 1, current.line - 2, current.line + 2].filter((i) => i >= 0 && i < expLines.length);

  let company: string | null = null;
  let title: string | null = null;
  for (const i of idxs) {
    const line = stripDates(expLines[i]!);
    if (!line || line.length > 120 || /^•/.test(line)) continue;
    // "Senior Engineer at Acme Ltd"
    const at = line.match(/^(.+?)\s+(?:at|@)\s+(.+)$/i);
    if (at && TITLE_WORDS.test(at[1]!)) {
      title ??= at[1]!.trim();
      company ??= at[2]!.replace(/[,|].*$/, "").trim();
      continue;
    }
    // "Acme Ltd | Senior Engineer", "Senior Engineer, Acme Ltd", "Acme Ltd - Senior Engineer"
    const parts = line.split(/\s*[|,]\s*|\s+-\s+/).map((p) => p.trim()).filter(Boolean);
    for (const p of parts) {
      if (!company && COMPANY_WORDS.test(p) && !TITLE_WORDS.test(p)) company = p;
      else if (!title && TITLE_WORDS.test(p)) title = p;
    }
    if (!company && parts.length === 1 && !title && !TITLE_WORDS.test(line) && /^[A-Z]/.test(line) && line.split(/\s+/).length <= 5) company = line;
  }
  return { company, title };
}

const DEGREE_RE = /\b(?:b\.?\s?tech|m\.?\s?tech|b\.?\s?e\b\.?|m\.?\s?e\b\.?|b\.?\s?sc|m\.?\s?sc|b\.?\s?com|m\.?\s?com|b\.?\s?b\.?\s?a|m\.?\s?b\.?\s?a|b\.?\s?c\.?\s?a|m\.?\s?c\.?\s?a|b\.?\s?a\b|m\.?\s?a\b|ph\.?\s?d|bachelor[^,\n]*|master[^,\n]*|diploma[^,\n]*|post\s+graduate[^,\n]*|pgdm|ca\b|cs\b|icwa|12th|hsc|10th|ssc|higher secondary|secondary school)\b/i;
const INSTITUTION_RE = /\b(?:university|college|institute|school|iit|nit|iim|academy|vidyalaya)\b/i;

export function findEducation(lines: string[]): EducationEntry[] {
  const out: EducationEntry[] = [];
  for (let i = 0; i < lines.length && out.length < 6; i++) {
    const line = lines[i]!;
    const d = line.match(DEGREE_RE);
    if (!d) continue;
    const window = [line, lines[i + 1] ?? ""].join(" ");
    const years = [...window.matchAll(/\b(19[89]\d|20[0-4]\d)\b/g)].map((m) => Number(m[1]));
    const instLine = [line, lines[i + 1], lines[i - 1]].find((l) => l && INSTITUTION_RE.test(l));
    // Take just the comma/pipe-separated piece that names the institution, not the whole line.
    const instPart = instLine?.split(/\s*[,|]\s*|\s+-\s+/).find((p) => INSTITUTION_RE.test(p));
    out.push({
      degree: d[0].replace(/\s+/g, " ").trim(),
      institution: instPart?.replace(/\b(?:19[89]\d|20[0-4]\d)\b.*$/, "").replace(/^[\s,|\-•]+|[\s,|\-•]+$/g, "").slice(0, 120) || undefined,
      year: years.length ? Math.max(...years) : undefined,
    });
  }
  return out;
}

const SKILL_LABEL = /^(?:languages?|frameworks?|databases?|tools?|technologies|platforms?|cloud|os|operating systems?|methodologies|programming(?:\s+languages?)?|web|backend|frontend)\s*[:\-]\s*/i;

export function findSkills(lines: string[]): string[] {
  const seen = new Map<string, string>();
  for (const line of lines) {
    for (const piece of line.replace(SKILL_LABEL, "").split(/[,;|•\n]|\s{2,}/)) {
      const s = piece.replace(SKILL_LABEL, "").replace(/^[\s\-–:]+|[\s.\-–:]+$/g, "").trim();
      if (s.length < 2 || s.length > 40 || s.split(/\s+/).length > 4) continue;
      if (!seen.has(s.toLowerCase())) seen.set(s.toLowerCase(), s);
      if (seen.size >= 40) return [...seen.values()];
    }
  }
  return [...seen.values()];
}

export function extractWithRules(text: string, now: Date = new Date()): ParsedResume {
  const { head, sections } = splitSections(text);
  const email = findEmail(text);
  const phone = findPhone(text);
  // Some resumes have no "Experience" heading; fall back to scanning every line for dated jobs.
  const expLines = sections.experience.length ? sections.experience : text.split("\n");
  const role = findCurrentRole(expLines, now);
  return {
    ...EMPTY_RESUME,
    name: findName(head.length ? head : text.split("\n"), email),
    email,
    phone,
    currentCompany: role.company,
    currentTitle: role.title,
    experienceYears: findExperienceYears(text, expLines, now),
    skills: findSkills(sections.skills),
    education: findEducation(sections.education.length ? sections.education : text.split("\n")),
  };
}
