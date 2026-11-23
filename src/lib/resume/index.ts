import { extractWithClaude, extractWithOllama, sanitiseLlmOutput } from "./llm";
import { extractWithRules } from "./rules";
import { readResumeText } from "./text";
import type { ExtractionMethod, ExtractionResult, ParsedResume } from "./types";

export { MAX_RESUME_BYTES, ResumeFileError } from "./text";
export type { ExtractionResult, ParsedResume } from "./types";
export { analyseJd, matchResume, rankResumes } from "./match";
export type { MatchResult } from "./match";

export type Provider = "rules" | "ollama" | "claude";

export function configuredProvider(): Provider {
  const p = (process.env.RESUME_EXTRACTOR ?? "rules").toLowerCase();
  return p === "ollama" || p === "claude" ? p : "rules";
}

/** AI answer first; rules fill the gaps. Contact details prefer the rules, which are deterministic. */
function merge(ai: ParsedResume, rules: ParsedResume): ParsedResume {
  return {
    name: ai.name ?? rules.name,
    email: rules.email ?? ai.email,
    phone: rules.phone ?? ai.phone,
    currentCompany: ai.currentCompany ?? rules.currentCompany,
    currentTitle: ai.currentTitle ?? rules.currentTitle,
    experienceYears: ai.experienceYears ?? rules.experienceYears,
    skills: ai.skills.length ? ai.skills : rules.skills,
    education: ai.education.length ? ai.education : rules.education,
  };
}

export interface ExtractOptions {
  provider?: Provider;
  /**
   * False when the resume must not leave our servers (for example a client who keeps files in their
   * own storage). Hosted AI is then refused and the rules run instead.
   */
  allowThirdParty?: boolean;
  now?: Date;
}

export async function extractFields(text: string, opts: ExtractOptions = {}): Promise<ExtractionResult> {
  const warnings: string[] = [];
  const rules = extractWithRules(text, opts.now);
  let provider = opts.provider ?? configuredProvider();

  if (provider === "claude" && opts.allowThirdParty === false) {
    warnings.push("This resume cannot be sent to a hosted AI service; used built-in rules instead.");
    provider = "rules";
  }
  if (provider === "rules") return { fields: rules, method: "rules", warnings };

  try {
    const raw = provider === "ollama" ? await extractWithOllama(text) : await extractWithClaude(text);
    const { fields, dropped } = sanitiseLlmOutput(raw, text);
    if (dropped.length) warnings.push(`Ignored AI values not found in the resume: ${dropped.join(", ")}.`);
    return { fields: merge(fields, rules), method: provider as ExtractionMethod, warnings };
  } catch (e) {
    console.error("[resume] AI extraction failed, using rules:", e instanceof Error ? e.message : e);
    warnings.push("The AI model was unavailable or returned an unusable answer; used built-in rules instead.");
    return { fields: rules, method: "rules", warnings };
  }
}

/** Upload bytes in, reviewed-by-a-human-later fields out. Throws ResumeFileError for bad files. */
export async function parseResume(file: Uint8Array, opts: ExtractOptions = {}): Promise<ExtractionResult & { text: string; kind: "pdf" | "docx"; pages: number | null; chars: number }> {
  const { text, kind, pages } = await readResumeText(file);
  const result = await extractFields(text, opts);
  return { ...result, text, kind, pages, chars: text.length };
}
