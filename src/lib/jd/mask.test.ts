import { describe, expect, it } from "vitest";
import { maskContactDetails, maskEmail, maskPhone } from "./mask";

describe("maskPhone", () => {
  it("keeps first two and last two digits", () => {
    expect(maskPhone("9876543210")).toBe("98XXXXXX10");
  });
  it("drops the country code", () => {
    expect(maskPhone("+91 98765 43210")).toBe("98XXXXXX10");
  });
});

describe("maskEmail", () => {
  it("hides most of the address", () => {
    expect(maskEmail("priya.sharma@acme.com")).toBe("p**********a@a***.com");
  });
});

describe("maskContactDetails", () => {
  it("masks mobile numbers in several formats", () => {
    const text = "Call 9876543210, +91-98765-43210 or 98765 43210 today.";
    const { text: out, matches } = maskContactDetails(text);
    expect(out).toBe("Call 98XXXXXX10, 98XXXXXX10 or 98XXXXXX10 today.");
    expect(matches).toHaveLength(3);
  });

  it("masks emails", () => {
    const { text, matches } = maskContactDetails("Send CV to hr@acme.in please");
    expect(text).not.toContain("hr@acme.in");
    expect(matches[0]?.kind).toBe("email");
  });

  it("masks STD landlines", () => {
    const { text } = maskContactDetails("Office: 080-23456789");
    expect(text).not.toContain("23456789");
  });

  it("leaves salaries, years and short numbers alone", () => {
    const input = "CTC 12,00,000 for 2024 batch, 5 openings, 3 to 5 years.";
    expect(maskContactDetails(input).text).toBe(input);
  });

  it("can mask only phones or only emails", () => {
    const input = "Mail a@b.com or call 9876543210";
    expect(maskContactDetails(input, { emails: false }).text).toContain("a@b.com");
    expect(maskContactDetails(input, { phones: false }).text).toContain("9876543210");
  });
});
