import { describe, expect, it } from "vitest";
import { analyseJd, matchWithRules } from "./match";
import { signMatch, verifyMatch } from "./token";

const m = matchWithRules(analyseJd("Java Developer\nRequirements\n- Java, SQL, Docker\n- 3+ years of experience"), "Ravi\nJava, SQL developer\nSoftware Engineer, Acme Ltd Jan 2020 - Present");
const T0 = 1_700_000_000_000;

describe("match token", () => {
  const token = signMatch("req1", m, T0);
  it("round-trips for the requisition it was issued for", () => {
    const out = verifyMatch(token, "req1", T0 + 1000);
    expect(out?.score).toBe(m.score);
    expect(out?.detail.matchedSkills).toEqual(m.matchedSkills);
  });
  it("is useless on another requisition", () => expect(verifyMatch(token, "req2", T0)).toBeNull());
  it("expires after a day", () => {
    expect(verifyMatch(token, "req1", T0 + 23 * 3600_000)).not.toBeNull();
    expect(verifyMatch(token, "req1", T0 + 25 * 3600_000)).toBeNull();
  });
  it("rejects a tampered score", () => {
    const [body, sig] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(body!, "base64url").toString()), score: 100 })).toString("base64url");
    expect(verifyMatch(`${forged}.${sig}`, "req1", T0)).toBeNull();
  });
  it("rejects garbage", () => {
    for (const bad of ["", "abc", "a.b", "."]) expect(verifyMatch(bad, "req1", T0)).toBeNull();
  });
});
