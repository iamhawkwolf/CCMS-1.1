import { describe, expect, it } from "vitest";
import { bucketByDay, bucketByWeek, onTimeRate, pctOf, weekStartIST } from "./dashboard";

const d = (s: string) => new Date(s);

describe("weekStartIST", () => {
  it("finds the Monday of the current week in India", () => {
    expect(weekStartIST(d("2026-11-22T08:00:00Z")).toISOString()).toBe("2026-11-16T00:00:00.000Z"); // Sunday -> Monday before
    expect(weekStartIST(d("2026-11-23T05:00:00Z")).toISOString()).toBe("2026-11-23T00:00:00.000Z"); // Monday itself
  });
  it("uses the IST date near midnight", () => {
    // 20:00 UTC Sunday is already Monday 01:30 in India
    expect(weekStartIST(d("2026-11-22T20:00:00Z")).toISOString()).toBe("2026-11-23T00:00:00.000Z");
  });
});

describe("bucketByDay", () => {
  const start = d("2026-11-20T00:00:00Z");
  it("counts due dates per day and ignores anything outside the window", () => {
    const dates = [d("2026-11-20T00:00:00Z"), d("2026-11-20T00:00:00Z"), d("2026-11-22T00:00:00Z"), d("2026-11-19T00:00:00Z"), d("2026-11-30T00:00:00Z")];
    expect(bucketByDay(dates, start, 5, "date")).toEqual([2, 0, 1, 0, 0]);
  });
  it("places real timestamps on their India calendar day", () => {
    // 19:00 UTC on the 20th is 00:30 IST on the 21st
    expect(bucketByDay([d("2026-11-20T19:00:00Z"), d("2026-11-20T05:00:00Z")], start, 3, "instant")).toEqual([1, 1, 0]);
  });
});

describe("bucketByWeek", () => {
  it("groups by Monday-start week", () => {
    const start = d("2026-11-02T00:00:00Z");
    const dates = [d("2026-11-02T00:00:00Z"), d("2026-11-08T00:00:00Z"), d("2026-11-09T00:00:00Z"), d("2026-11-30T00:00:00Z")];
    expect(bucketByWeek(dates, start, 4)).toEqual([2, 1, 0, 0]);
  });
});

describe("onTimeRate", () => {
  const today = d("2026-11-22T00:00:00Z");
  const t = (due: string, status: string, done?: string) => ({ dueDate: d(due), status, completedAt: done ? d(done) : null });
  it("counts tasks finished on or before their due date", () => {
    const r = onTimeRate([t("2026-11-10T00:00:00Z", "DONE", "2026-11-09T10:00:00Z"), t("2026-11-10T00:00:00Z", "DONE", "2026-11-10T15:00:00Z"), t("2026-11-10T00:00:00Z", "DONE", "2026-11-12T10:00:00Z"), t("2026-11-11T00:00:00Z", "TODO")], today, 60);
    expect(r).toEqual({ total: 4, onTime: 2, pct: 50 });
  });
  it("ignores tasks not yet due or older than the window", () => {
    const r = onTimeRate([t("2026-11-22T00:00:00Z", "TODO"), t("2026-12-01T00:00:00Z", "TODO"), t("2026-08-01T00:00:00Z", "DONE", "2026-08-01T00:00:00Z")], today, 60);
    expect(r).toEqual({ total: 0, onTime: 0, pct: null });
  });
});

describe("pctOf", () => {
  it("avoids dividing by zero", () => {
    expect(pctOf(1, 0)).toBeNull();
    expect(pctOf(1, 4)).toBe(25);
  });
});
