import { describe, expect, it } from "vitest";
import { extractFields } from "./index";
import { sanitiseLlmOutput } from "./llm";
import { extractWithRules, findExperienceYears, findName, findPhone } from "./rules";
import { normaliseText, sniffFileKind } from "./text";

const now = new Date("2026-11-23T00:00:00Z");

const RESUME = normaliseText(`
RAVI KUMAR
Senior Software Engineer
Email: ravi.kumar@example.com | Mobile: +91 98765-43210
Bengaluru, Karnataka

PROFESSIONAL SUMMARY
Backend engineer building payment systems.

WORK EXPERIENCE
Senior Software Engineer, Infosys Limited          Jan 2021 - Present
• Built the settlement service.
Software Engineer | Wipro Technologies             Jun 2017 - Dec 2020
• Maintained billing APIs.

EDUCATION
B.Tech in Computer Science, Anna University, 2017
12th, Sri Vidyalaya School, 2013

TECHNICAL SKILLS
Languages: Java, Python, SQL
Tools: Docker, Kubernetes; AWS
`);

describe("rule extraction", () => {
  const r = extractWithRules(RESUME, now);
  it("reads contact details", () => {
    expect(r.email).toBe("ravi.kumar@example.com");
    expect(r.phone).toBe("+91 98765 43210");
  });
  it("finds the name, not the job title", () => expect(r.name).toBe("Ravi Kumar"));
  it("finds current company and title", () => {
    expect(r.currentCompany).toBe("Infosys Limited");
    expect(r.currentTitle).toBe("Senior Software Engineer");
  });
  it("adds dated jobs without double counting", () => {
    // Jun 2017 - Dec 2020 (3.5y) + Jan 2021 - Nov 2026 (5.9y)
    expect(r.experienceYears).toBeGreaterThan(9);
    expect(r.experienceYears).toBeLessThan(10);
  });
  it("splits skills and drops the labels", () => expect(r.skills).toEqual(["Java", "Python", "SQL", "Docker", "Kubernetes", "AWS"]));
  it("reads degrees with year and institution", () => {
    expect(r.education[0]).toMatchObject({ year: 2017, institution: "Anna University" });
    expect(r.education[0]!.degree.toLowerCase()).toContain("b.tech");
  });
});

describe("experience years", () => {
  it("prefers an explicit statement", () => expect(findExperienceYears("Over 8+ years of experience in sales", [], now)).toBe(8));
  it("counts overlapping jobs once", () => expect(findExperienceYears("", ["Jan 2020 - Dec 2021", "Jan 2021 - Dec 2022"], now)).toBe(3));
  it("returns null without evidence", () => expect(findExperienceYears("fresher", [], now)).toBeNull());
});

describe("small helpers", () => {
  it("normalises phones", () => {
    expect(findPhone("call 09876543210")).toBe("+91 98765 43210");
    expect(findPhone("order 12345")).toBeNull();
  });
  it("ignores headings when looking for a name", () => expect(findName(["CURRICULUM VITAE", "priya sharma"], null)).toBe("Priya Sharma"));
  it("falls back to the email local part", () => expect(findName(["12345"], "anita.rao@x.com")).toBe("Anita Rao"));
  it("recognises files by their bytes", () => {
    expect(sniffFileKind(new TextEncoder().encode("%PDF-1.7"))).toBe("pdf");
    expect(sniffFileKind(new Uint8Array([0x50, 0x4b, 3, 4]))).toBe("docx");
    expect(sniffFileKind(new TextEncoder().encode("MZ.exe"))).toBeNull();
  });
});

describe("AI output guard", () => {
  const base = { name: "Ravi Kumar", email: "ravi.kumar@example.com", phone: "9876543210", currentCompany: "Infosys Limited", currentTitle: null, experienceYears: 9.4, skills: ["Java", "Java"], education: [] };
  it("keeps values that appear in the resume", () => {
    const { fields, dropped } = sanitiseLlmOutput(base, RESUME);
    expect(dropped).toEqual([]);
    expect(fields.skills).toEqual(["Java"]);
  });
  it("drops invented contact details", () => {
    const { fields, dropped } = sanitiseLlmOutput({ ...base, email: "ceo@evil.com", phone: "9000000001", currentCompany: "Google" }, RESUME);
    expect(dropped).toEqual(["email", "phone", "currentCompany"]);
    expect(fields.email).toBeNull();
  });
  it("rejects answers that do not match the schema", () => {
    expect(() => sanitiseLlmOutput({ ...base, experienceYears: "lots" }, RESUME)).toThrow();
  });
});

describe("provider selection", () => {
  it("refuses hosted AI when the resume must stay in-house", async () => {
    const out = await extractFields(RESUME, { provider: "claude", allowThirdParty: false, now });
    expect(out.method).toBe("rules");
    expect(out.warnings[0]).toMatch(/cannot be sent/);
  });
  it("falls back to rules when the model is unreachable", async () => {
    process.env.OLLAMA_URL = "http://127.0.0.1:1";
    const out = await extractFields(RESUME, { provider: "ollama", now });
    expect(out.method).toBe("rules");
    expect(out.fields.email).toBe("ravi.kumar@example.com");
    expect(out.warnings[0]).toMatch(/unavailable/);
  });
});
