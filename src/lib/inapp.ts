import { STAGE_LABEL, type Stage } from "@/lib/requisition/stages";

export interface InAppView { title: string; body: string; href?: string }

const str = (v: unknown): string => (v == null ? "" : String(v));

/** Turns a queued IN_APP notification into text for the inbox. */
export function renderInApp(template: string, payload: unknown): InAppView {
  const p = (payload && typeof payload === "object" ? payload : {}) as Record<string, unknown>;
  const href = typeof p.href === "string" ? p.href : undefined;
  switch (template) {
    case "compliance_alert":
      return { title: `${str(p.title)} - ${str(p.when)}`, body: `${str(p.client)} · due ${str(p.dueDate)}`, href };
    case "profile_stage_changed":
    case "client_reviewed_profile": {
      const stage = STAGE_LABEL[p.stage as Stage] ?? str(p.stage);
      const who = template === "client_reviewed_profile" ? "Client reviewed a profile" : `${str(p.candidate)} moved`;
      return { title: `${who}: ${stage}`, body: [str(p.requisition), p.comment ? `"${str(p.comment)}"` : ""].filter(Boolean).join(" · "), href };
    }
    case "requisition_raised":
      return { title: `New requisition: ${str(p.title)}`, body: `${str(p.openings)} opening(s) raised in the client portal`, href };
    default:
      return { title: template.replace(/_/g, " "), body: "", href };
  }
}
