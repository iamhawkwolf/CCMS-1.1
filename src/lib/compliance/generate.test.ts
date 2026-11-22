import { describe, expect, it } from "vitest";
import { generateComplianceTasks, rulesFor, type ClientRegistrations } from "./generate";

const client: ClientRegistrations = { id: "c1", state: "KA", pf: true, esi: true, pt: true, tds: true, lwf: false };
const iso = (d: Date) => d.toISOString().slice(0, 10);

describe("rulesFor", () => {
  it("only returns rules for registrations the client has", () => {
    const kinds = rulesFor({ ...client, esi: false, tds: false }).map((r) => r.kind).sort();
    expect(kinds).toEqual(["PF", "PT"]);
  });
  it("prefers the state rule over the generic one", () => {
    const pt = rulesFor(client).filter((r) => r.kind === "PT");
    expect(pt).toHaveLength(1);
    expect(pt[0]?.state).toBe("KA");
  });
  it("returns nothing for a state with no PT rule yet", () => {
    expect(rulesFor({ ...client, state: "TN" }).some((r) => r.kind === "PT")).toBe(false);
  });
});

describe("generateComplianceTasks", () => {
  it("puts October filings on the 15th of November", () => {
    const tasks = generateComplianceTasks(client, new Date("2026-11-01"), new Date("2026-11-30"));
    const pf = tasks.find((t) => t.kind === "PF");
    expect(pf && iso(pf.dueDate)).toBe("2026-11-15");
    expect(pf?.period).toBe("2026-10");
    const tds = tasks.find((t) => t.kind === "TDS");
    expect(tds && iso(tds.dueDate)).toBe("2026-11-07");
  });

  it("handles the December to January rollover", () => {
    const tasks = generateComplianceTasks(client, new Date("2027-01-01"), new Date("2027-01-31"));
    const pf = tasks.find((t) => t.kind === "PF");
    expect(pf && iso(pf.dueDate)).toBe("2027-01-15");
    expect(pf?.period).toBe("2026-12");
  });

  it("is idempotent: same inputs give the same keys with no duplicates", () => {
    const a = generateComplianceTasks(client, new Date("2026-11-01"), new Date("2027-02-28"));
    const keys = a.map((t) => t.sourceKey);
    expect(new Set(keys).size).toBe(keys.length);
    const b = generateComplianceTasks(client, new Date("2026-11-01"), new Date("2027-02-28"));
    expect(b.map((t) => t.sourceKey)).toEqual(keys);
  });

  it("generates yearly LWF only when registered", () => {
    const none = generateComplianceTasks(client, new Date("2027-01-01"), new Date("2027-01-31")).filter((t) => t.kind === "LWF");
    expect(none).toHaveLength(0);
    const lwf = generateComplianceTasks({ ...client, lwf: true }, new Date("2027-01-01"), new Date("2027-01-31")).filter((t) => t.kind === "LWF");
    expect(lwf).toHaveLength(1);
    expect(iso(lwf[0]!.dueDate)).toBe("2027-01-15");
  });

  it("handles month-end rules in February", () => {
    const mh = { ...client, state: "MH" };
    const t = generateComplianceTasks(mh, new Date("2027-02-01"), new Date("2027-02-28")).find((x) => x.kind === "PT");
    expect(t && iso(t.dueDate)).toBe("2027-02-28");
  });

  it("flags unverified rules", () => {
    expect(generateComplianceTasks(client, new Date("2026-11-01"), new Date("2026-11-30")).every((t) => t.verified === false)).toBe(true);
  });
});
