import { describe, expect, it } from "vitest";
import { isEnabled, resolveFeature } from "./resolve";

describe("resolveFeature", () => {
  it("uses the registry default when nothing is chosen", () => {
    expect(resolveFeature("invoicing", "STARTER", {}).enabled).toBe(true);
    expect(resolveFeature("invoicing", "STARTER", {}).source).toBe("default");
  });

  it("is off and unavailable when the plan does not include it", () => {
    const s = resolveFeature("analytics", "STARTER", { analytics: true });
    expect(s.available).toBe(false);
    expect(s.enabled).toBe(false);
    expect(s.source).toBe("plan");
  });

  it("becomes available on a higher plan", () => {
    expect(isEnabled("time_tracking", "GROWTH", {})).toBe(true);
    expect(isEnabled("analytics", "PRO", {})).toBe(true);
  });

  it("lets the account default switch a feature off", () => {
    expect(isEnabled("whatsapp_reminders", "PRO", { whatsapp_reminders: false })).toBe(false);
  });

  it("lets a client override beat the account default in both directions", () => {
    const account = { jd_watermark: true };
    expect(isEnabled("jd_watermark", "PRO", account, { jd_watermark: false })).toBe(false);
    expect(isEnabled("jd_watermark", "PRO", { jd_watermark: false }, { jd_watermark: true })).toBe(true);
  });

  it("toggles watermark and masking independently", () => {
    const client = { jd_watermark: false };
    expect(isEnabled("jd_watermark", "PRO", {}, client)).toBe(false);
    expect(isEnabled("number_masking", "PRO", {}, client)).toBe(true);
  });

  it("switches sub-features off when the parent is off", () => {
    const s = resolveFeature("number_masking", "PRO", { requisition_tracker: false });
    expect(s.enabled).toBe(false);
    expect(s.source).toBe("parent");
    // even an explicit client "on" cannot revive a child of a disabled parent
    expect(isEnabled("jd_watermark", "PRO", { requisition_tracker: false }, { jd_watermark: true })).toBe(false);
  });
});
