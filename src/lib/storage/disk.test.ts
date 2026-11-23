import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { DiskStore } from "./index";

describe("DiskStore", () => {
  it("round-trips, reports missing files, and rejects path tricks", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "ccms-"));
    const s = new DiskStore(dir);
    await s.put("c1/resumes/a.pdf", Buffer.from("hello"), "application/pdf");
    expect((await s.get("c1/resumes/a.pdf"))?.toString()).toBe("hello");
    await s.delete("c1/resumes/a.pdf");
    expect(await s.get("c1/resumes/a.pdf")).toBeNull();
    await expect(s.get("../etc/passwd")).rejects.toThrow();
    await rm(dir, { recursive: true });
  });
});
