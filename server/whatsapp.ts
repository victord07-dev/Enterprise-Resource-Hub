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

// ── Send text message ─────────────────────────────────────────────────────────
export async function sendTextMessage(phone: string, body: string): Promise<string | null> {
  const normPhone = normalisePhone(phone);
  const payload = {
    countryCode: "+91",
    phoneNumber: normPhone.startsWith("91") ? normPhone.slice(2) : normPhone,
    callbackData: "itfi-erp",
    type: "Text",
    data: { message: body },
  };
  try {
    const res = await fetch(`${INTERAKT_BASE}/v1/public/message/`, {
      method: "POST",
      headers: {
        Authorization: authHeader(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.text();
      console.error("[WA] sendTextMessage failed:", err);
      return null;
    }
    const data = await res.json() as any;
    return data?.id || data?.messageId || null;
  } catch (e) {
    console.error("[WA] sendTextMessage error:", e);
    return null;
  }
}

// ── Send template message ─────────────────────────────────────────────────────
export async function sendTemplateMessage(
  phone: string,
  templateName: string,
  variables: string[],
  language = "en",
): Promise<string | null> {
  const normPhone = normalisePhone(phone);
  const bodyComponents = variables.length > 0
    ? [{ type: "body", parameters: variables.map(v => ({ type: "text", text: v })) }]
    : [];
  const payload = {
    countryCode: "+91",
    phoneNumber: normPhone.startsWith("91") ? normPhone.slice(2) : normPhone,
    callbackData: "itfi-erp",
    type: "Template",
    template: {
      name: templateName,
      languageCode: language,
      bodyValues: variables,
      components: bodyComponents,
    },
  };
  try {
    const res = await fetch(`${INTERAKT_BASE}/v1/public/message/`, {
      method: "POST",
      headers: {
        Authorization: authHeader(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.text();
      console.error("[WA] sendTemplateMessage failed:", err);
      return null;
    }
    const data = await res.json() as any;
    return data?.id || data?.messageId || null;
  } catch (e) {
    console.error("[WA] sendTemplateMessage error:", e);
    return null;
  }
}

// ── Send document message ─────────────────────────────────────────────────────
export async function sendDocumentMessage(
  phone: string,
  documentUrl: string,
  filename: string,
  caption?: string,
): Promise<string | null> {
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
  try {
    const res = await fetch(`${INTERAKT_BASE}/v1/public/message/`, {
      method: "POST",
      headers: {
        Authorization: authHeader(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.text();
      console.error("[WA] sendDocumentMessage failed:", err);
      return null;
    }
    const data = await res.json() as any;
    return data?.id || data?.messageId || null;
  } catch (e) {
    console.error("[WA] sendDocumentMessage error:", e);
    return null;
  }
}

// ── In-memory rate limiter (20 msg / 60s per conversation) ───────────────────
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

export function checkRateLimit(conversationId: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(conversationId);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(conversationId, { count: 1, resetAt: now + 60000 });
    return true;
  }
  if (entry.count >= 20) return false;
  entry.count++;
  return true;
}
