import { describe, expect, it } from "vitest";
import { clientIpFrom } from "./rate-limit";

const from = (h: Record<string, string>) => clientIpFrom((n) => h[n] ?? null);

describe("clientIpFrom", () => {
  it("takes the first address of x-forwarded-for", () => expect(from({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" })).toBe("203.0.113.7"));
  it("falls back to x-real-ip", () => expect(from({ "x-real-ip": "198.51.100.2" })).toBe("198.51.100.2"));
  it("returns null when there is no address, so limiting falls back to the email only", () => expect(from({})).toBeNull());
  it("ignores absurdly long values", () => expect(from({ "x-forwarded-for": "a".repeat(200) })).toBeNull());
});
