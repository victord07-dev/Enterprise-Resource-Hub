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
