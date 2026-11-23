import { describe, expect, it } from "vitest";
import { parseCtc, parseResume } from "./parse";
import { detectKind } from "./file";

const SAMPLE = `PRIYA SHARMA
Email: Priya.Sharma@example.com | Mobile: +91 98765 43210

Summary
Payroll specialist with 6.5 years of experience in statutory compliance.

Currently working at Acme Industries Pvt Ltd, Pune
Current CTC: 12 LPA
Expected CTC: 15.5 lakhs
Notice Period: 2 months`;

describe("parseResume", () => {
  const r = parseResume(SAMPLE);
  it("finds contact details", () => {
    expect(r.name).toBe("Priya Sharma");
    expect(r.email).toBe("priya.sharma@example.com");
    expect(r.phone?.replace("+", "").slice(-10)).toBe("9876543210");
  });
  it("finds career fields", () => {
    expect(r.experienceYears).toBe(6.5);
    expect(r.currentCompany).toBe("Acme Industries Pvt Ltd");
    expect(r.currentCtc).toBe(1200000);
    expect(r.expectedCtc).toBe(1550000);
    expect(r.noticeDays).toBe(60);
  });
  it("returns nulls rather than guessing on empty text", () => {
    expect(parseResume("")).toEqual({ name: null, email: null, phone: null, currentCompany: null, experienceYears: null, currentCtc: null, expectedCtc: null, noticeDays: null });
  });
  it("treats immediate joiners as 0 days", () => {
    expect(parseResume("Notice period: Immediate").noticeDays).toBe(0);
  });
});

describe("parseCtc", () => {
  it("handles common Indian formats", () => {
    expect(parseCtc("12 LPA")).toBe(1200000);
    expect(parseCtc("₹ 1200000")).toBe(1200000);
    expect(parseCtc("negotiable")).toBeNull();
  });
});

describe("detectKind", () => {
  it("identifies by signature, not name", () => {
    expect(detectKind(Buffer.from("%PDF-1.7 ..."))).toBe("pdf");
    expect(detectKind(Buffer.from("MZ executable"))).toBeNull();
    expect(detectKind(Buffer.from("PK\x03\x04 plain zip without word"))).toBeNull();
    expect(detectKind(Buffer.from("PK\x03\x04....word/document.xml"))).toBe("docx");
  });
});
