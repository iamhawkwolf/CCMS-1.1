import { describe, expect, it } from "vitest";
import { computeGst, hourlyAmountPaise, invoiceNumber, lineAmountPaise, rupeesToPaise } from "./gst";

describe("computeGst", () => {
  it("splits into CGST and SGST within the same state", () => {
    const g = computeGst(rupeesToPaise(10000), "KA", "KA");
    expect(g).toMatchObject({ cgstPaise: 90000, sgstPaise: 90000, igstPaise: 0, totalPaise: 1180000 });
  });
  it("charges IGST across states", () => {
    const g = computeGst(rupeesToPaise(10000), "KA", "TN");
    expect(g).toMatchObject({ cgstPaise: 0, sgstPaise: 0, igstPaise: 180000, totalPaise: 1180000 });
  });
  it("keeps the halves equal to the whole when tax is an odd paisa", () => {
    const g = computeGst(5, "KA", "KA"); // tax = round(0.9) = 1 paisa
    expect(g.cgstPaise + g.sgstPaise).toBe(1);
    expect(g.totalPaise).toBe(6);
  });
  it("rejects fractional paise", () => {
    expect(() => computeGst(10.5, "KA", "KA")).toThrow();
  });
});

describe("amounts", () => {
  it("rounds line and hourly amounts", () => {
    expect(lineAmountPaise({ quantity: 2.5, ratePaise: 1001 })).toBe(2503);
    expect(hourlyAmountPaise(90, rupeesToPaise(2000))).toBe(300000);
  });
});

describe("invoiceNumber", () => {
  it("uses the April to March financial year", () => {
    expect(invoiceNumber("INV", 1, new Date("2026-11-22"))).toBe("INV/2026-27/0001");
    expect(invoiceNumber("INV", 12, new Date("2027-02-10"))).toBe("INV/2026-27/0012");
    expect(invoiceNumber("INV", 3, new Date("2026-03-31"))).toBe("INV/2025-26/0003");
  });
});
