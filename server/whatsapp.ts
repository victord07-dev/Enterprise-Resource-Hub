import crypto from "crypto";

const INTERAKT_BASE = "https://api.interakt.ai";

// ── Phone normalisation ───────────────────────────────────────────────────────
export function normalisePhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10 && /^[6-9]/.test(digits)) return `91${digits}`;
  if (digits.length === 12 && digits.startsWith("91")) return digits;
  if (digits.length === 13 && digits.startsWith("091")) return digits.slice(1);
  return digits;
}

// ── Webhook HMAC verification ─────────────────────────────────────────────────
export function verifyInteraktSignature(rawBody: Buffer, signature: string): boolean {
  const secret = process.env.INTERAKT_WEBHOOK_SECRET;
  if (!secret) return false;
  try {
    const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
    const expectedBuf = Buffer.from(expected, "utf8");
    const sigBuf = Buffer.from(signature || "", "utf8");
    if (expectedBuf.length !== sigBuf.length) return false;
    return crypto.timingSafeEqual(expectedBuf, sigBuf);
  } catch {
    return false;
  }
}

// ── Auth header ───────────────────────────────────────────────────────────────
function authHeader(): string {
  const key = process.env.INTERAKT_API_KEY || "";
  return `Basic ${Buffer.from(key).toString("base64")}`;
}

// ── Internal POST to Interakt — throws on non-2xx ────────────────────────────
async function interaktPost(payload: object): Promise<string> {
  const res = await fetch(`${INTERAKT_BASE}/v1/public/message/`, {
    method: "POST",
    headers: {
      Authorization: authHeader(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => "unknown error");
    throw new Error(`Interakt API error ${res.status}: ${errText}`);
  }
  const data = await res.json() as Record<string, unknown>;
  return (data?.id || data?.messageId || "") as string;
}

// ── Send text message — throws on API failure ─────────────────────────────────
export async function sendTextMessage(phone: string, body: string): Promise<string> {
  const normPhone = normalisePhone(phone);
  const payload = {
    countryCode: "+91",
    phoneNumber: normPhone.startsWith("91") ? normPhone.slice(2) : normPhone,
    callbackData: "itfi-erp",
    type: "Text",
    data: { message: body },
  };
  const msgId = await interaktPost(payload);
  return msgId;
}

// ── Send template message — throws on API failure ─────────────────────────────
export async function sendTemplateMessage(
  phone: string,
  templateName: string,
  bodyValues: string[],
  languageCode = "en",
): Promise<string> {
  const normPhone = normalisePhone(phone);
  const bodyComponents = bodyValues.length > 0
    ? [{ type: "body", parameters: bodyValues.map(v => ({ type: "text", text: v })) }]
    : [];
  const payload = {
    countryCode: "+91",
    phoneNumber: normPhone.startsWith("91") ? normPhone.slice(2) : normPhone,
    callbackData: "itfi-erp",
    type: "Template",
    template: {
      name: templateName,
      languageCode,
      bodyValues,
      components: bodyComponents,
    },
  };
  const msgId = await interaktPost(payload);
  return msgId;
}

// ── Send document message — throws on API failure ─────────────────────────────
export async function sendDocumentMessage(
  phone: string,
  documentUrl: string,
  filename: string,
  caption?: string,
): Promise<string> {
  const normPhone = normalisePhone(phone);
  const payload = {
    countryCode: "+91",
    phoneNumber: normPhone.startsWith("91") ? normPhone.slice(2) : normPhone,
    callbackData: "itfi-erp",
    type: "Document",
    data: {
      mediaUrl: documentUrl,
      fileName: filename,
      caption: caption || "",
    },
  };
  const msgId = await interaktPost(payload);
  return msgId;
}

// ── Fetch templates from Interakt — throws on API failure ────────────────────
export interface InteraktTemplate {
  id?: string;
  name: string;
  language: string;
  category?: string;
  status?: string;
  components?: Array<{
    type: string;
    text?: string;
    format?: string;
    buttons?: Array<{ type: string; text: string; url?: string; phone_number?: string }>;
  }>;
}

function extractBody(components?: InteraktTemplate["components"]): string {
  if (!components) return "";
  const body = components.find(c => c.type?.toUpperCase() === "BODY");
  return body?.text || "";
}

function mapStatus(status?: string): string {
  const s = (status || "").toUpperCase();
  if (s === "APPROVED") return "approved";
  if (s === "REJECTED") return "rejected";
  return "pending_approval";
}

export async function fetchInteraktTemplates(): Promise<InteraktTemplate[]> {
  const all: InteraktTemplate[] = [];
  const limit = 100;
  let offset = 0;
  // Paginate defensively in case the workspace has many templates.
  for (let page = 0; page < 50; page++) {
    const url = `${INTERAKT_BASE}/v1/public/message/templates/?limit=${limit}&offset=${offset}`;
    const res = await fetch(url, {
      method: "GET",
      headers: { Authorization: authHeader() },
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => "unknown error");
      throw new Error(`Interakt templates API error ${res.status}: ${errText}`);
    }
    const data = await res.json() as any;
    const list: InteraktTemplate[] =
      data?.data?.templates ?? data?.templates ?? data?.results ?? data?.data ?? [];
    if (!Array.isArray(list) || list.length === 0) break;
    all.push(...list);
    if (list.length < limit) break;
    offset += list.length;
  }
  return all;
}

export function mapInteraktTemplate(t: InteraktTemplate) {
  return {
    name: t.name,
    interaktTemplateName: t.name,
    category: (t.category || "custom").toLowerCase(),
    languageCode: t.language || "en",
    body: extractBody(t.components),
    isActive: mapStatus(t.status),
  };
}

// ── Rolling-window rate limiter (20 msg / 60s per conversation) ──────────────
// Stores timestamps of recent sends per conversation for a true sliding window.
const rateLimitMap = new Map<string, number[]>();
const RATE_LIMIT_MAX = 20;
const RATE_LIMIT_WINDOW_MS = 60_000;

export function checkRateLimit(conversationId: string): boolean {
  const now = Date.now();
  const cutoff = now - RATE_LIMIT_WINDOW_MS;
  // Get existing timestamps, evict those older than the window
  const timestamps = (rateLimitMap.get(conversationId) || []).filter(t => t > cutoff);
  if (timestamps.length >= RATE_LIMIT_MAX) return false;
  timestamps.push(now);
  rateLimitMap.set(conversationId, timestamps);
  return true;
}
