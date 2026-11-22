import { describe, expect, it } from "vitest";
import { daysUntil, istDateKey, istHour, istToday, nextSendWindow } from "./time";

describe("IST dates", () => {
  it("uses the Indian calendar date, not UTC", () => {
    // 20:00 UTC on 21 Nov is 01:30 IST on 22 Nov
    const t = new Date("2026-11-21T20:00:00Z");
    expect(istDateKey(t)).toBe("2026-11-22");
    expect(istToday(t).toISOString()).toBe("2026-11-22T00:00:00.000Z");
    expect(istHour(t)).toBe(1);
  });
  it("counts days to a due date from the IST date", () => {
    const t = new Date("2026-11-21T20:00:00Z"); // 22 Nov in India
    expect(daysUntil(new Date("2026-11-22T00:00:00Z"), t)).toBe(0);
    expect(daysUntil(new Date("2026-11-25T00:00:00Z"), t)).toBe(3);
    expect(daysUntil(new Date("2026-11-20T00:00:00Z"), t)).toBe(-2);
  });
});

describe("nextSendWindow", () => {
  it("leaves times inside 09:00-20:00 IST alone", () => {
    const t = new Date("2026-11-22T06:00:00Z"); // 11:30 IST
    expect(nextSendWindow(t)).toEqual(t);
  });
  it("holds early-morning messages until 09:00 the same day", () => {
    const t = new Date("2026-11-22T00:00:00Z"); // 05:30 IST
    expect(nextSendWindow(t).toISOString()).toBe("2026-11-22T03:30:00.000Z"); // 09:00 IST
  });
  it("holds evening messages until 09:00 the next day", () => {
    const t = new Date("2026-11-22T15:00:00Z"); // 20:30 IST
    expect(nextSendWindow(t).toISOString()).toBe("2026-11-23T03:30:00.000Z");
  });
  it("treats 20:00 IST as already closed and 09:00 IST as open", () => {
    expect(nextSendWindow(new Date("2026-11-22T14:30:00Z")).toISOString()).toBe("2026-11-23T03:30:00.000Z");
    const open = new Date("2026-11-22T03:30:00Z");
    expect(nextSendWindow(open)).toEqual(open);
  });
});
