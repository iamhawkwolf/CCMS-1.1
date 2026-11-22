import { describe, expect, it } from "vitest";
import { complianceBucket, invoiceBucket, whenLabel } from "./rules";

describe("complianceBucket", () => {
  it("is silent more than a week out", () => {
    expect(complianceBucket(8)).toBeNull();
  });
  it("fires at the 7, 3, 1 and 0 day milestones", () => {
    expect(complianceBucket(7)?.key).toBe("due-7");
    expect(complianceBucket(3)?.key).toBe("due-3");
    expect(complianceBucket(1)?.key).toBe("due-1");
    expect(complianceBucket(0)?.key).toBe("due-0");
  });
  it("keeps a day inside one bucket so hourly runs do not repeat", () => {
    expect(complianceBucket(5)?.key).toBe("due-7");
    expect(complianceBucket(4)?.key).toBe("due-7");
    expect(complianceBucket(2)?.key).toBe("due-3");
  });
  it("repeats every 3 days while overdue, flagged as overdue", () => {
    expect(complianceBucket(-1)).toEqual({ key: "overdue-0", kind: "overdue" });
    expect(complianceBucket(-3)?.key).toBe("overdue-0");
    expect(complianceBucket(-4)?.key).toBe("overdue-1");
    expect(complianceBucket(-7)?.key).toBe("overdue-2");
  });
  it("gives up on long-abandoned tasks", () => {
    expect(complianceBucket(-60)).not.toBeNull();
    expect(complianceBucket(-61)).toBeNull();
  });
});

describe("invoiceBucket", () => {
  it("sends one heads-up in the last 3 days, then weekly once overdue", () => {
    expect(invoiceBucket(5)).toBeNull();
    expect(invoiceBucket(3)?.key).toBe("due-3");
    expect(invoiceBucket(0)?.key).toBe("due-3");
    expect(invoiceBucket(-1)).toEqual({ key: "overdue-0", kind: "overdue" });
    expect(invoiceBucket(-7)?.key).toBe("overdue-0");
    expect(invoiceBucket(-8)?.key).toBe("overdue-1");
  });
});

describe("whenLabel", () => {
  it("reads naturally", () => {
    expect(whenLabel(7)).toBe("in 7 days");
    expect(whenLabel(1)).toBe("tomorrow");
    expect(whenLabel(0)).toBe("today");
    expect(whenLabel(-1)).toBe("1 day overdue");
    expect(whenLabel(-5)).toBe("5 days overdue");
  });
});
