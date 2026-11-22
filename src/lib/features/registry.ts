// Single source of truth for every switchable feature.
// The plan decides which features exist for an account; the admin then toggles them
// at account level and can override per client.

export type PlanName = "STARTER" | "GROWTH" | "PRO";

export const PLAN_ORDER: PlanName[] = ["STARTER", "GROWTH", "PRO"];

export type FeatureKey =
  | "requisition_tracker"
  | "jd_watermark"
  | "number_masking"
  | "client_portal"
  | "compliance_calendar"
  | "whatsapp_reminders"
  | "invoicing"
  | "time_tracking"
  | "analytics";

export interface FeatureDef {
  key: FeatureKey;
  label: string;
  description: string;
  /** Lowest plan that includes this feature. */
  minPlan: PlanName;
  /** Value used when neither account nor client has chosen. */
  defaultOn: boolean;
  /** Sub-setting: this feature only works while the parent is on. */
  parent?: FeatureKey;
}

export const FEATURES: readonly FeatureDef[] = [
  {
    key: "requisition_tracker",
    label: "Requisition and profile tracker",
    description: "Clients raise requisitions and review candidate profiles in one list.",
    minPlan: "STARTER",
    defaultOn: true,
  },
  {
    key: "jd_watermark",
    label: "JD watermark",
    description: "Stamp the consultant's name and logo on every shared JD.",
    minPlan: "STARTER",
    defaultOn: true,
    parent: "requisition_tracker",
  },
  {
    key: "number_masking",
    label: "Number and email masking",
    description: "Detect and mask phone numbers and emails in JDs before sharing.",
    minPlan: "STARTER",
    defaultOn: true,
    parent: "requisition_tracker",
  },
  {
    key: "client_portal",
    label: "Client portal",
    description: "Client users log in to raise requisitions and review profiles.",
    minPlan: "STARTER",
    defaultOn: true,
  },
  {
    key: "compliance_calendar",
    label: "Compliance calendar",
    description: "Auto-generated PF, ESI, PT, TDS and LWF due dates with alerts.",
    minPlan: "STARTER",
    defaultOn: true,
  },
  {
    key: "whatsapp_reminders",
    label: "WhatsApp reminders",
    description: "Send reminders and requests to clients on WhatsApp.",
    minPlan: "STARTER",
    defaultOn: true,
  },
  {
    key: "invoicing",
    label: "Invoicing and billing",
    description: "GST invoices, payment links and automatic reminders.",
    minPlan: "STARTER",
    defaultOn: true,
  },
  {
    key: "time_tracking",
    label: "Time tracking",
    description: "Timers on tasks, linked to project budgets and hourly billing.",
    minPlan: "GROWTH",
    defaultOn: true,
  },
  {
    key: "analytics",
    label: "Analytics and monthly reports",
    description: "Per-client HR reports and the consultant business view.",
    minPlan: "PRO",
    defaultOn: true,
  },
];

export const FEATURE_KEYS = FEATURES.map((f) => f.key);

export function getFeature(key: string): FeatureDef | undefined {
  return FEATURES.find((f) => f.key === key);
}

export function planIncludes(plan: PlanName, minPlan: PlanName): boolean {
  return PLAN_ORDER.indexOf(plan) >= PLAN_ORDER.indexOf(minPlan);
}

export interface PlanLimits {
  maxClients: number | null; // null = unlimited
  maxTeamMembers: number | null;
  priceRupeesPerMonth: number;
}

export const PLAN_LIMITS: Record<PlanName, PlanLimits> = {
  STARTER: { maxClients: 5, maxTeamMembers: 1, priceRupeesPerMonth: 999 },
  GROWTH: { maxClients: 25, maxTeamMembers: 3, priceRupeesPerMonth: 2499 },
  PRO: { maxClients: null, maxTeamMembers: null, priceRupeesPerMonth: 4999 },
};
