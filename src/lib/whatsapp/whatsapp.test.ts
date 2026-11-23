import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { toWhatsAppNumber } from "./phone";
import { TEMPLATES, TemplateError, buildTemplateParams, renderTemplateText, sanitizeParam } from "./templates";
import { buildRequestBody, classifyFailure, cloudConfig, sendTemplate } from "./cloud";
import { advanceStatus, isStartMessage, isStopMessage, parseWebhook, verifySignature } from "./webhook";
import { retryDelayMs } from "@/lib/notify";

describe("toWhatsAppNumber", () => {
  it("normalises common Indian formats", () => {
    for (const raw of ["+91 98765-43210", "09876543210", "9876543210", "91 98765 43210", "+919876543210"]) expect(toWhatsAppNumber(raw)).toBe("919876543210");
  });
  it("rejects things that cannot be a mobile number", () => {
    for (const raw of ["", null, "12345", "5876543210", "+1 415 555 2671", "98765432"]) expect(toWhatsAppNumber(raw)).toBeNull();
  });
});

describe("templates", () => {
  const payload = { consultancy: "Acme HR", candidate: "Priya Nair", requisition: "Senior Accountant" };
  it("orders params by placeholder position", () => {
    expect(buildTemplateParams("new_profile_submitted", payload)).toEqual(["Acme HR", "Priya Nair", "Senior Accountant"]);
  });
  it("renders the text the recipient sees", () => {
    expect(renderTemplateText("new_profile_submitted", payload)).toContain("a new candidate profile, Priya Nair, has been submitted for your Senior Accountant requisition");
  });
  it("fails loudly on a missing key or unknown template", () => {
    expect(() => buildTemplateParams("new_profile_submitted", { consultancy: "x" })).toThrow(TemplateError);
    expect(() => buildTemplateParams("nope", {})).toThrow(TemplateError);
  });
  it("sanitises values Meta would reject", () => {
    expect(sanitizeParam("Line one\nline   two\t!")).toBe("Line one line two !");
    expect(sanitizeParam("   ")).toBe("-");
    expect(sanitizeParam("x".repeat(2000))).toHaveLength(1024);
  });
  it("has placeholders matching the parameter count for every template", () => {
    for (const t of Object.values(TEMPLATES)) {
      const placeholders = [...t.body.matchAll(/\{\{(\d+)\}\}/g)].map((m) => Number(m[1]));
      expect(new Set(placeholders)).toEqual(new Set(t.params.map((_, i) => i + 1)));
    }
  });
});

describe("cloud API", () => {
  it("builds Meta's template request", () => {
    expect(buildRequestBody("919876543210", "new_profile_submitted", { consultancy: "A", candidate: "B", requisition: "C" })).toEqual({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: "919876543210",
      type: "template",
      template: { name: "banyanroot_new_profile_submitted", language: { code: "en" }, components: [{ type: "body", parameters: [{ type: "text", text: "A" }, { type: "text", text: "B" }, { type: "text", text: "C" }] }] },
    });
  });
  it("needs both token and phone number id", () => {
    expect(cloudConfig({ WHATSAPP_TOKEN: "t" } as unknown as NodeJS.ProcessEnv)).toBeNull();
    expect(cloudConfig({ WHATSAPP_TOKEN: "t", WHATSAPP_PHONE_NUMBER_ID: "123" } as unknown as NodeJS.ProcessEnv)?.apiVersion).toBe("v23.0");
  });
  it("retries throttling and server errors, not bad requests", () => {
    expect(classifyFailure(429)).toBe(true);
    expect(classifyFailure(503)).toBe(true);
    expect(classifyFailure(400, 130429)).toBe(true);
    expect(classifyFailure(400, 132001)).toBe(false); // template does not exist
    expect(classifyFailure(400, 131026)).toBe(false); // undeliverable
    expect(classifyFailure(401, 190)).toBe(false); // bad token
  });
  const cfg = { token: "tok", phoneNumberId: "555", apiBase: "https://graph.example", apiVersion: "v23.0" };
  const reply = (status: number, body: unknown) => (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;
  it("returns the message id on success", async () => {
    const r = await sendTemplate(cfg, "919876543210", "new_profile_submitted", { consultancy: "A", candidate: "B", requisition: "C" }, reply(200, { messages: [{ id: "wamid.XYZ" }] }));
    expect(r).toEqual({ ok: true, messageId: "wamid.XYZ" });
  });
  it("reports a permanent failure with Meta's detail", async () => {
    const r = await sendTemplate(cfg, "919876543210", "new_profile_submitted", { consultancy: "A", candidate: "B", requisition: "C" }, reply(400, { error: { code: 132001, message: "Template name does not exist" } }));
    expect(r).toMatchObject({ ok: false, transient: false });
    expect((r as { error: string }).error).toContain("132001");
  });
  it("treats a network failure as retryable", async () => {
    const boom = (async () => { throw new Error("ECONNRESET"); }) as unknown as typeof fetch;
    expect(await sendTemplate(cfg, "919876543210", "new_profile_submitted", { consultancy: "A", candidate: "B", requisition: "C" }, boom)).toMatchObject({ ok: false, transient: true });
  });
  it("sends the right URL and auth header", async () => {
    let seen: { url: string; auth: string | null } | null = null;
    const spy = (async (url: string, init: RequestInit) => { seen = { url, auth: new Headers(init.headers).get("authorization") }; return new Response(JSON.stringify({ messages: [{ id: "x" }] })); }) as unknown as typeof fetch;
    await sendTemplate(cfg, "919876543210", "new_profile_submitted", { consultancy: "A", candidate: "B", requisition: "C" }, spy);
    expect(seen).toEqual({ url: "https://graph.example/v23.0/555/messages", auth: "Bearer tok" });
  });
});

describe("webhook helpers", () => {
  const sign = (body: string, secret: string) => "sha256=" + createHmac("sha256", secret).update(body).digest("hex");
  it("accepts a correct signature and rejects everything else", () => {
    const body = '{"a":1}';
    expect(verifySignature(body, sign(body, "s3cret"), "s3cret")).toBe(true);
    expect(verifySignature(body, sign(body, "other"), "s3cret")).toBe(false);
    expect(verifySignature(body + " ", sign(body, "s3cret"), "s3cret")).toBe(false);
    expect(verifySignature(body, null, "s3cret")).toBe(false);
    expect(verifySignature(body, "sha256=zz", "s3cret")).toBe(false);
    expect(verifySignature(body, "nope", "s3cret")).toBe(false);
  });
  it("parses statuses and text replies, ignoring junk", () => {
    const parsed = parseWebhook({ entry: [{ changes: [{ value: { statuses: [{ id: "w1", status: "delivered" }, { id: "w2", status: "failed", errors: [{ code: 131026, title: "Undeliverable" }] }, { id: "w3", status: "weird" }], messages: [{ from: "919876543210", type: "text", text: { body: "STOP" } }, { from: "1", type: "image" }] } }] }] });
    expect(parsed.statuses).toEqual([{ id: "w1", status: "delivered", errorCode: undefined, errorTitle: undefined }, { id: "w2", status: "failed", errorCode: 131026, errorTitle: "Undeliverable" }]);
    expect(parsed.messages).toEqual([{ from: "919876543210", text: "STOP" }]);
    expect(parseWebhook(null)).toEqual({ statuses: [], messages: [] });
    expect(parseWebhook({ entry: "x" })).toEqual({ statuses: [], messages: [] });
  });
  it("recognises STOP and START replies", () => {
    for (const t of ["STOP", " stop ", "Unsubscribe", "opt out", "Stop!"]) expect(isStopMessage(t)).toBe(true);
    for (const t of ["please stop by tomorrow", "stopping", "yes"]) expect(isStopMessage(t)).toBe(false);
    expect(isStartMessage("START")).toBe(true);
    expect(isStartMessage("restart")).toBe(false);
  });
  it("only moves delivery status forward", () => {
    expect(advanceStatus("SENT", "delivered")).toBe("DELIVERED");
    expect(advanceStatus("DELIVERED", "read")).toBe("READ");
    expect(advanceStatus("SENT", "read")).toBe("READ"); // read arrived before delivered
    expect(advanceStatus("READ", "delivered")).toBeNull(); // late, out-of-order
    expect(advanceStatus("DELIVERED", "sent")).toBeNull();
  });
  it("applies failure only to undelivered messages, and lets a confirmed send revive a FAILED row", () => {
    expect(advanceStatus("SENT", "failed")).toBe("FAILED");
    expect(advanceStatus("DELIVERED", "failed")).toBeNull();
    expect(advanceStatus("FAILED", "failed")).toBeNull();
    expect(advanceStatus("FAILED", "delivered")).toBe("DELIVERED");
  });
});

describe("retry backoff", () => {
  it("grows and then holds at three hours", () => {
    expect([1, 2, 3, 4, 5, 9].map(retryDelayMs)).toEqual([60_000, 300_000, 900_000, 3_600_000, 10_800_000, 10_800_000]);
  });
});
