// WhatsApp Business Cloud API (Meta) client: sends approved templates.
// Docs: https://developers.facebook.com/docs/whatsapp/cloud-api/reference/messages
import { TEMPLATE_LANGUAGE, TEMPLATES, buildTemplateParams, type TemplateKey } from "./templates";

export type SendResult = { ok: true; messageId: string } | { ok: false; transient: boolean; error: string };

export interface CloudConfig {
  token: string;
  phoneNumberId: string;
  apiBase: string;
  apiVersion: string;
}

/** Null when the credentials are not all present. */
export function cloudConfig(env: NodeJS.ProcessEnv = process.env): CloudConfig | null {
  const token = env.WHATSAPP_TOKEN;
  const phoneNumberId = env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneNumberId) return null;
  return {
    token,
    phoneNumberId,
    apiBase: (env.WHATSAPP_API_BASE ?? "https://graph.facebook.com").replace(/\/$/, ""),
    apiVersion: env.WHATSAPP_API_VERSION ?? "v23.0",
  };
}

export function buildRequestBody(to: string, template: TemplateKey, payload: unknown) {
  const params = buildTemplateParams(template, payload);
  return {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
    type: "template",
    template: {
      name: TEMPLATES[template].metaName,
      language: { code: TEMPLATE_LANGUAGE },
      components: [{ type: "body", parameters: params.map((text) => ({ type: "text", text })) }],
    },
  };
}

// Error codes worth retrying: throttling and temporary Meta-side failures. Anything else (bad number,
// unapproved template, parameter mismatch, number not on WhatsApp) will fail again, so we stop.
// Confirm against Meta's current error-code table when you go live.
const TRANSIENT_CODES = new Set([1, 2, 4, 17, 32, 613, 80007, 130429, 131016, 131056]);

export function classifyFailure(httpStatus: number, code?: number): boolean {
  if (httpStatus === 429 || httpStatus >= 500) return true;
  return code !== undefined && TRANSIENT_CODES.has(code);
}

export async function sendTemplate(cfg: CloudConfig, to: string, template: TemplateKey, payload: unknown, fetchImpl: typeof fetch = fetch): Promise<SendResult> {
  const url = `${cfg.apiBase}/${cfg.apiVersion}/${cfg.phoneNumberId}/messages`;
  let res: Response;
  try {
    res = await fetchImpl(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${cfg.token}`, "Content-Type": "application/json" },
      body: JSON.stringify(buildRequestBody(to, template, payload)),
      signal: AbortSignal.timeout(15000),
    });
  } catch (e) {
    // Network failure or timeout: the message may or may not have left, but retrying is the only sensible move.
    return { ok: false, transient: true, error: `Network error: ${e instanceof Error ? e.message : String(e)}` };
  }

  let body: { messages?: Array<{ id?: string }>; error?: { code?: number; message?: string; error_data?: { details?: string } } } = {};
  try {
    body = (await res.json()) as typeof body;
  } catch {
    /* non-JSON body: fall through to the status handling below */
  }

  const id = body.messages?.[0]?.id;
  if (res.ok && id) return { ok: true, messageId: id };

  const code = body.error?.code;
  const detail = body.error?.error_data?.details ?? body.error?.message ?? `HTTP ${res.status}`;
  return { ok: false, transient: classifyFailure(res.status, code), error: `WhatsApp ${code ?? res.status}: ${detail}`.slice(0, 500) };
}
