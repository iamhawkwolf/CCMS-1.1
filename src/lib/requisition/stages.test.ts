import { describe, expect, it } from "vitest";
import { canMove, emailKey, needsReviewReminder, phoneKey, allowedNextStages } from "./stages";

const day = 24 * 60 * 60 * 1000;

describe("stage transitions", () => {
  it("allows the normal path", () => {
    expect(canMove("SUBMITTED", "SHORTLISTED")).toBe(true);
    expect(canMove("SHORTLISTED", "INTERVIEW_SCHEDULED")).toBe(true);
    expect(canMove("INTERVIEW_SCHEDULED", "OFFERED")).toBe(true);
    expect(canMove("OFFERED", "JOINED")).toBe(true);
  });
  it("allows rejecting from any open stage", () => {
    for (const s of ["SUBMITTED", "SHORTLISTED", "INTERVIEW_SCHEDULED", "OFFERED"] as const) {
      expect(canMove(s, "REJECTED")).toBe(true);
    }
  });
  it("blocks skipping and moving out of a final stage", () => {
    expect(canMove("SUBMITTED", "OFFERED")).toBe(false);
    expect(canMove("JOINED", "REJECTED")).toBe(false);
    expect(allowedNextStages("REJECTED")).toEqual([]);
  });
});

describe("needsReviewReminder", () => {
  const now = new Date("2026-11-10T10:00:00Z");
  it("is false before the threshold", () => {
    expect(needsReviewReminder({ stage: "SUBMITTED", submittedAt: new Date(now.getTime() - 2 * day), lastReminderAt: null }, 3, now)).toBe(false);
  });
  it("is true once the threshold passes", () => {
    expect(needsReviewReminder({ stage: "SUBMITTED", submittedAt: new Date(now.getTime() - 4 * day), lastReminderAt: null }, 3, now)).toBe(true);
  });
  it("does not nag again inside the window", () => {
    expect(needsReviewReminder({ stage: "SUBMITTED", submittedAt: new Date(now.getTime() - 9 * day), lastReminderAt: new Date(now.getTime() - 1 * day) }, 3, now)).toBe(false);
  });
  it("ignores profiles the client has already acted on", () => {
    expect(needsReviewReminder({ stage: "SHORTLISTED", submittedAt: new Date(now.getTime() - 9 * day), lastReminderAt: null }, 3, now)).toBe(false);
  });
});

describe("duplicate keys", () => {
  it("normalises phone numbers", () => {
    expect(phoneKey("+91 98765-43210")).toBe("9876543210");
    expect(phoneKey("09876543210")).toBe("9876543210");
    expect(phoneKey("12345")).toBeNull();
  });
  it("normalises email", () => {
    expect(emailKey("  Ravi@Example.COM ")).toBe("ravi@example.com");
    expect(emailKey("")).toBeNull();
  });
});
