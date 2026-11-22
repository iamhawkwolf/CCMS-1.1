// WhatsApp only lets a business start a conversation with a pre-approved template.
// This file is the single list of templates the product sends. Each one must be submitted to Meta
// (WhatsApp Manager, Message templates, category Utility) with EXACTLY this name, language and body
// before real sending works. Run `npm run templates:print` for a copy-paste list.
// Changing a body or parameter order here without re-approval in Meta makes sends fail.

export const TEMPLATE_LANGUAGE = "en";

export interface TemplateDef {
  /** Name registered with Meta. */
  metaName: string;
  /** Body text with {{1}}, {{2}} placeholders, in the order of `params`. */
  body: string;
  /** Payload keys, in placeholder order, each with a sample value (Meta asks for samples on submission). */
  params: ReadonlyArray<{ key: string; example: string }>;
}

export const TEMPLATES = {
  new_profile_submitted: {
    metaName: "ccms_new_profile_submitted",
    body: "Hello from {{1}}: a new candidate profile, {{2}}, has been submitted for your {{3}} requisition. Please review it in your client portal.",
    params: [
      { key: "consultancy", example: "Acme HR Advisors" },
      { key: "candidate", example: "Priya Nair" },
      { key: "requisition", example: "Senior Accountant" },
    ],
  },
  profile_review_reminder: {
    metaName: "ccms_profile_review_reminder",
    body: "Reminder from {{1}}: {{2}} candidate profile(s) for {{3}} are waiting for your review. Please shortlist or reject them in your client portal.",
    params: [
      { key: "consultancy", example: "Acme HR Advisors" },
      { key: "count", example: "3" },
      { key: "requisition", example: "Senior Accountant" },
    ],
  },
  invoice_reminder: {
    metaName: "ccms_invoice_reminder",
    body: "Hello from {{1}}: invoice {{2}} for {{3}} is due on {{4}}. Please arrange payment at your earliest convenience.",
    params: [
      { key: "consultancy", example: "Acme HR Advisors" },
      { key: "invoice", example: "INV/2026-27/0012" },
      { key: "amount", example: "₹29,500.00" },
      { key: "dueDate", example: "30 Nov 2026" },
    ],
  },
  invoice_overdue: {
    metaName: "ccms_invoice_overdue",
    body: "Hello from {{1}}: invoice {{2}} for {{3}} was due on {{4}} and is now overdue. Please arrange payment or reply to this message if you have already paid.",
    params: [
      { key: "consultancy", example: "Acme HR Advisors" },
      { key: "invoice", example: "INV/2026-27/0012" },
      { key: "amount", example: "₹29,500.00" },
      { key: "dueDate", example: "30 Nov 2026" },
    ],
  },
  compliance_alert: {
    metaName: "ccms_compliance_alert",
    body: "{{1}} reminder: {{2}} for {{3}} is due on {{4}} ({{5}}).",
    params: [
      { key: "consultancy", example: "Acme HR Advisors" },
      { key: "title", example: "PF contribution and ECR" },
      { key: "client", example: "Acme Textiles" },
      { key: "dueDate", example: "15 Nov 2026" },
      { key: "when", example: "in 3 days" },
    ],
  },
} as const satisfies Record<string, TemplateDef>;

export type TemplateKey = keyof typeof TEMPLATES;

export const isTemplateKey = (k: string): k is TemplateKey => Object.prototype.hasOwnProperty.call(TEMPLATES, k);

export class TemplateError extends Error {}

/** Meta rejects params with newlines, tabs, 5+ spaces in a row, or empty text. */
export function sanitizeParam(v: unknown): string {
  const s = String(v ?? "").replace(/[\r\n\t]+/g, " ").replace(/ {2,}/g, " ").trim().slice(0, 1024);
  return s === "" ? "-" : s;
}

/** Ordered, sanitised parameter list for a template. Throws if the payload is missing a key. */
export function buildTemplateParams(template: string, payload: unknown): string[] {
  if (!isTemplateKey(template)) throw new TemplateError(`Unknown WhatsApp template "${template}"`);
  const obj = (payload && typeof payload === "object" ? payload : {}) as Record<string, unknown>;
  const def: TemplateDef = TEMPLATES[template];
  return def.params.map((p) => {
    if (obj[p.key] === undefined || obj[p.key] === null) throw new TemplateError(`Template "${template}" needs "${p.key}"`);
    return sanitizeParam(obj[p.key]);
  });
}

/** What the recipient will read. Used by the console provider and for previews. */
export function renderTemplateText(template: string, payload: unknown): string {
  const params = buildTemplateParams(template, payload);
  return (TEMPLATES[template as TemplateKey] as TemplateDef).body.replace(/\{\{(\d+)\}\}/g, (_, n: string) => params[Number(n) - 1] ?? "");
}
