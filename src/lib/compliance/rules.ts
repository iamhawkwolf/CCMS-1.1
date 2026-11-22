// Seed compliance rules. THESE DATES MUST BE CONFIRMED WITH YOUR CA BEFORE LAUNCH:
// due dates differ by state and change by notification. `verified: false` marks rules nobody has signed off.
// Keep this file as data so a CA can review it and rules can later move into the database.

export type ComplianceKind = "PF" | "ESI" | "PT" | "TDS" | "LWF";

export type Frequency =
  | { type: "MONTHLY"; dayOfNextMonth: number } // filing for month M is due on this day of month M+1
  | { type: "MONTHLY_END" } // due on last day of the same month
  | { type: "YEARLY"; month: number; day: number } // month 1-12; the due date in that calendar year
  | { type: "HALF_YEARLY"; due: Array<{ month: number; day: number }> };

export interface ComplianceRule {
  kind: ComplianceKind;
  /** "*" applies in every state. */
  state: string;
  title: string;
  frequency: Frequency;
  verified: boolean;
  note?: string;
}

export const COMPLIANCE_RULES: readonly ComplianceRule[] = [
  {
    kind: "PF",
    state: "*",
    title: "PF contribution and ECR",
    frequency: { type: "MONTHLY", dayOfNextMonth: 15 },
    verified: false,
    note: "EPFO: pay and file ECR by the 15th of the next month.",
  },
  {
    kind: "ESI",
    state: "*",
    title: "ESI contribution",
    frequency: { type: "MONTHLY", dayOfNextMonth: 15 },
    verified: false,
    note: "ESIC: pay by the 15th of the next month.",
  },
  {
    kind: "TDS",
    state: "*",
    title: "TDS deposit (salary)",
    frequency: { type: "MONTHLY", dayOfNextMonth: 7 },
    verified: false,
    note: "Deposit by the 7th of the next month. Quarterly returns (24Q) are separate.",
  },
  {
    kind: "PT",
    state: "KA",
    title: "Professional Tax (Karnataka)",
    frequency: { type: "MONTHLY", dayOfNextMonth: 20 },
    verified: false,
  },
  {
    kind: "PT",
    state: "MH",
    title: "Professional Tax (Maharashtra)",
    frequency: { type: "MONTHLY_END" },
    verified: false,
  },
  {
    kind: "LWF",
    state: "KA",
    title: "Labour Welfare Fund (Karnataka)",
    frequency: { type: "YEARLY", month: 1, day: 15 },
    verified: false,
  },
];

export const STATES: Record<string, string> = {
  AP: "Andhra Pradesh",
  DL: "Delhi",
  GJ: "Gujarat",
  HR: "Haryana",
  KA: "Karnataka",
  KL: "Kerala",
  MH: "Maharashtra",
  RJ: "Rajasthan",
  TN: "Tamil Nadu",
  TS: "Telangana",
  UP: "Uttar Pradesh",
  WB: "West Bengal",
};
