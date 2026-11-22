// Detects phone numbers and email addresses in JD text and masks them.
// This deters casual bypassing; it cannot stop someone retyping a number by hand,
// and numbers written as words or split with odd separators can slip through.
// That is why the consultant reviews the result before sharing.

export interface MaskMatch {
  kind: "email" | "phone";
  original: string;
  masked: string;
  index: number;
}

export interface MaskResult {
  text: string;
  matches: MaskMatch[];
}

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;

// Indian numbers: optional +91 / 91 / 0 prefix, then 10 digits starting 6-9, allowing spaces, dots or dashes between digits.
// Also landlines with STD code, e.g. 080-2345 6789 (10 digits total after the leading 0).
const PHONE_RE = /(?<![\w])(?:(?:\+?91|0)[\s.-]*)?(?:[6-9](?:[\s.-]?\d){9}|0?\d{2,4}[\s.-]\d{6,8})(?![\w])/g;

/** 9876543210 -> 98XXXXXX10. Keeps the first two and last two digits. */
export function maskPhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  const national = digits.length > 10 ? digits.slice(-10) : digits;
  if (national.length < 5) return "X".repeat(national.length);
  return national.slice(0, 2) + "X".repeat(national.length - 4) + national.slice(-2);
}

/** priya.sharma@acme.com -> p****a@a***.com */
export function maskEmail(raw: string): string {
  const at = raw.lastIndexOf("@");
  const local = raw.slice(0, at);
  const domain = raw.slice(at + 1);
  const dot = domain.lastIndexOf(".");
  const host = dot === -1 ? domain : domain.slice(0, dot);
  const tld = dot === -1 ? "" : domain.slice(dot);
  const maskedLocal = local.length <= 2 ? "X".repeat(local.length) : local[0] + "*".repeat(local.length - 2) + local.slice(-1);
  const maskedHost = host.length <= 1 ? "*" : host[0] + "*".repeat(host.length - 1);
  return `${maskedLocal}@${maskedHost}${tld}`;
}

export interface MaskOptions {
  phones?: boolean;
  emails?: boolean;
}

export function maskContactDetails(input: string, opts: MaskOptions = {}): MaskResult {
  const { phones = true, emails = true } = opts;
  const matches: MaskMatch[] = [];
  let text = input;

  if (emails) {
    text = text.replace(EMAIL_RE, (m, offset: number) => {
      const masked = maskEmail(m);
      matches.push({ kind: "email", original: m, masked, index: offset });
      return masked;
    });
  }

  if (phones) {
    text = text.replace(PHONE_RE, (m, offset: number) => {
      const digits = m.replace(/\D/g, "");
      // ignore short digit runs such as years or salaries that only look like numbers
      if (digits.length < 10) return m;
      const masked = maskPhone(m);
      matches.push({ kind: "phone", original: m, masked, index: offset });
      return masked;
    });
  }

  matches.sort((a, b) => a.index - b.index);
  return { text, matches };
}
