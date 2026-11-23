// Shared shapes for resume reading. Field names line up with ProfileInput
// (src/lib/services/requisition.ts) so a parsed resume can pre-fill "Submit a profile".

export interface EducationEntry {
  degree: string;
  institution?: string;
  year?: number;
}

export interface ParsedResume {
  name: string | null;
  email: string | null;
  phone: string | null;
  currentCompany: string | null;
  currentTitle: string | null;
  /** Total experience in years, one decimal. */
  experienceYears: number | null;
  skills: string[];
  education: EducationEntry[];
}

export type ExtractionMethod = "rules" | "ollama" | "claude";

export interface ExtractionResult {
  fields: ParsedResume;
  /** What actually produced the fields (the AI path can fall back to rules). */
  method: ExtractionMethod;
  /** Human-readable notes for the review screen, e.g. "AI model unavailable, used rules only". */
  warnings: string[];
}

export const EMPTY_RESUME: ParsedResume = {
  name: null,
  email: null,
  phone: null,
  currentCompany: null,
  currentTitle: null,
  experienceYears: null,
  skills: [],
  education: [],
};
