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
    example?: { body_text?: string[][]; header_text?: string[]; [k: string]: any };
    buttons?: Array<{ type: string; text: string; url?: string; phone_number?: string }>;
  }>;
}

function extractBody(components?: InteraktTemplate["components"]): string {
  if (!components) return "";
  const body = components.find(c => c.type?.toUpperCase() === "BODY");
  return body?.text || "";
}

export function extractBodyExamples(components?: InteraktTemplate["components"]): string[] {
  if (!components) return [];
  const body = components.find(c => c.type?.toUpperCase() === "BODY");
  const ex = body?.example?.body_text;
  if (!Array.isArray(ex) || ex.length === 0) return [];
  const row = Array.isArray(ex[0]) ? ex[0] : [];
  return row.map(v => (typeof v === "string" ? v : ""));
}

// Parse {{1}}, {{2}}, ... placeholders from a template body and return
// generic variable names. Only positions actually present in the body get
// a name (sparse placeholders like {{1}} and {{3}} produce ["var1", "var3"]).
export function extractVariableNames(body: string): string[] {
  if (!body) return [];
  const regex = /\{\{\s*(\d+)\s*\}\}/g;
  const seen = new Set<number>();
  let m: RegExpExecArray | null;
  while ((m = regex.exec(body)) !== null) {
    const n = parseInt(m[1], 10);
    if (Number.isFinite(n) && n > 0) seen.add(n);
  }
  return Array.from(seen).sort((a, b) => a - b).map(n => `var${n}`);
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
  const body = extractBody(t.components);
  return {
    name: t.name,
    interaktTemplateName: t.name,
    category: (t.category || "custom").toLowerCase(),
    languageCode: t.language || "en",
    body,
    variables: extractVariableNames(body),
    exampleValues: extractBodyExamples(t.components),
    isActive: mapStatus(t.status),
  };
}

// ── Shared sync helper (used by manual route + scheduled job) ────────────────
export interface TemplateStatusChange {
  templateId: string;
  name: string;
  languageCode: string;
  previousStatus: string;
  newStatus: string;
}

export interface SyncTemplatesResult {
  total: number;
  created: number;
  updated: number;
  skipped: number;
  statusChanges: TemplateStatusChange[];
}

export interface TemplateSyncHistoryEntry {
  id: string;
  attemptAt: string;
  trigger: "manual" | "scheduled";
  success: boolean;
  errorMessage: string | null;
  total: number;
  created: number;
  updated: number;
  skipped: number;
  statusChangesCount: number;
  statusChanges: TemplateStatusChange[];
  triggeredByUserId: string | null;
  triggeredByName: string | null;
}

export interface TemplateSyncStatus {
  lastAttemptAt: string | null;
  lastSuccessAt: string | null;
  lastError: string | null;
  lastResult: SyncTemplatesResult | null;
  lastTrigger: "manual" | "scheduled" | null;
  history: TemplateSyncHistoryEntry[];
}

// Sync log retention window. Rows older than this are pruned by
// `pruneOldTemplateSyncLogs` (called after each sync and by a daily cron).
// To change retention, update this constant — it is the single source of truth.
export const TEMPLATE_SYNC_LOG_RETENTION_DAYS = 90;

interface SyncStorage {
  getWhatsappTemplateByInteraktName: (name: string, lang: string) => Promise<any>;
  updateWhatsappTemplate: (id: string, data: any) => Promise<any>;
  createWhatsappTemplate: (data: any) => Promise<any>;
  createWhatsappTemplateSyncLog: (data: any) => Promise<any>;
  getRecentWhatsappTemplateSyncLogs: (limit: number) => Promise<any[]>;
  deleteWhatsappTemplateSyncLogsOlderThan?: (cutoff: Date) => Promise<number>;
  createWhatsappTemplateStatusHistory?: (data: {
    templateId: string;
    previousStatus: string | null;
    newStatus: string;
    source: string;
  }) => Promise<any>;
}

const HISTORY_LIMIT = 10;

// Delete sync log rows older than the retention window. Safe to call
// frequently — failures are swallowed so they never break a sync.
export async function pruneOldTemplateSyncLogs(
  storage: Pick<SyncStorage, "deleteWhatsappTemplateSyncLogsOlderThan">,
  retentionDays: number = TEMPLATE_SYNC_LOG_RETENTION_DAYS,
): Promise<number> {
  if (!storage.deleteWhatsappTemplateSyncLogsOlderThan) return 0;
  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
  try {
    return await storage.deleteWhatsappTemplateSyncLogsOlderThan(cutoff);
  } catch (err) {
    console.error("[WA TEMPLATE SYNC] Failed to prune old sync logs:", err);
    return 0;
  }
}

function toHistoryEntry(row: any): TemplateSyncHistoryEntry {
  return {
    id: String(row.id),
    attemptAt: row.attemptAt instanceof Date ? row.attemptAt.toISOString() : String(row.attemptAt),
    trigger: row.trigger === "scheduled" ? "scheduled" : "manual",
    success: !!row.success,
    errorMessage: row.errorMessage ?? null,
    total: Number(row.total ?? 0),
    created: Number(row.created ?? 0),
    updated: Number(row.updated ?? 0),
    skipped: Number(row.skipped ?? 0),
    statusChangesCount: Number(row.statusChangesCount ?? 0),
    statusChanges: Array.isArray(row.statusChanges)
      ? row.statusChanges.map((c: any) => ({
          templateId: String(c?.templateId ?? ""),
          name: String(c?.name ?? ""),
          languageCode: String(c?.languageCode ?? ""),
          previousStatus: String(c?.previousStatus ?? ""),
          newStatus: String(c?.newStatus ?? ""),
        }))
      : [],
    triggeredByUserId: row.triggeredByUserId ?? null,
    triggeredByName: row.triggeredByName ?? null,
  };
}

export async function getTemplateSyncStatus(
  storage: Pick<SyncStorage, "getRecentWhatsappTemplateSyncLogs">,
): Promise<TemplateSyncStatus> {
  const rows = await storage.getRecentWhatsappTemplateSyncLogs(HISTORY_LIMIT);
  const history = rows.map(toHistoryEntry);
  const latest = history[0];
  const lastSuccess = history.find(h => h.success) || null;
  return {
    lastAttemptAt: latest?.attemptAt ?? null,
    lastSuccessAt: lastSuccess?.attemptAt ?? null,
    lastError: latest && !latest.success ? latest.errorMessage : null,
    lastResult: lastSuccess
      ? {
          total: lastSuccess.total,
          created: lastSuccess.created,
          updated: lastSuccess.updated,
          skipped: lastSuccess.skipped,
          statusChanges: lastSuccess.statusChanges,
        }
      : null,
    lastTrigger: latest?.trigger ?? null,
    history,
  };
}

export interface TemplateSyncStorage {
  getWhatsappTemplateByInteraktName: (name: string, lang: string) => Promise<any>;
  updateWhatsappTemplate: (id: string, data: any) => Promise<any>;
  createWhatsappTemplate: (data: any) => Promise<any>;
  createWhatsappTemplateStatusHistory?: (data: {
    templateId: string;
    previousStatus: string | null;
    newStatus: string;
    source: string;
  }) => Promise<any>;
}

export async function syncInteraktTemplates(
  storage: SyncStorage,
  trigger: "manual" | "scheduled" = "manual",
  triggeredBy?: { userId?: string | null; name?: string | null } | null,
): Promise<SyncTemplatesResult> {
  const triggeredByUserId = triggeredBy?.userId ?? null;
  const triggeredByName = triggeredBy?.name ?? null;
  try {
    if (!process.env.INTERAKT_API_KEY) {
      throw new Error("INTERAKT_API_KEY is not configured");
    }
    const result = await runSyncInteraktTemplates(storage, trigger);
    try {
      await storage.createWhatsappTemplateSyncLog({
        trigger,
        success: true,
        errorMessage: null,
        total: result.total,
        created: result.created,
        updated: result.updated,
        skipped: result.skipped,
        statusChangesCount: result.statusChanges.length,
        statusChanges: result.statusChanges,
        triggeredByUserId,
        triggeredByName,
      });
    } catch (logErr) {
      console.error("[WA TEMPLATE SYNC] Failed to persist success log:", logErr);
    }
    await pruneOldTemplateSyncLogs(storage);
    return result;
  } catch (err: any) {
    try {
      await storage.createWhatsappTemplateSyncLog({
        trigger,
        success: false,
        errorMessage: (err?.message || String(err)).slice(0, 1000),
        total: 0,
        created: 0,
        updated: 0,
        skipped: 0,
        statusChangesCount: 0,
        statusChanges: [],
        triggeredByUserId,
        triggeredByName,
      });
    } catch (logErr) {
      console.error("[WA TEMPLATE SYNC] Failed to persist failure log:", logErr);
    }
    await pruneOldTemplateSyncLogs(storage);
    throw err;
  }
}

async function runSyncInteraktTemplates(
  storage: TemplateSyncStorage,
  trigger: "manual" | "scheduled" = "manual",
): Promise<SyncTemplatesResult> {
  const remote = await fetchInteraktTemplates();
  let created = 0;
  let updated = 0;
  let skipped = 0;
  const statusChanges: TemplateStatusChange[] = [];
  for (const t of remote) {
    if (!t?.name) { skipped++; continue; }
    const mapped = mapInteraktTemplate(t);
    if (!mapped.body) { skipped++; continue; }
    const existing = await storage.getWhatsappTemplateByInteraktName(mapped.interaktTemplateName, mapped.languageCode);
    if (existing) {
      const previousStatus = String(existing.isActive || "");
      if (previousStatus && previousStatus !== mapped.isActive) {
        statusChanges.push({
          templateId: existing.id,
          name: existing.name || mapped.name,
          languageCode: mapped.languageCode,
          previousStatus,
          newStatus: mapped.isActive,
        });
        if (storage.createWhatsappTemplateStatusHistory) {
          try {
            await storage.createWhatsappTemplateStatusHistory({
              templateId: existing.id,
              previousStatus,
              newStatus: mapped.isActive,
              source: trigger,
            });
          } catch (e) {
            console.error("[WA TEMPLATE SYNC] Failed to persist status history:", e);
          }
        }
      }
      // Preserve manual variable edits, but backfill any blank/missing slots
      // with generated defaults from the (possibly longer) remote body.
      const existingVars = Array.isArray(existing.variables) ? existing.variables : [];
      const mergedLen = Math.max(existingVars.length, mapped.variables.length);
      const mergedVars = Array.from({ length: mergedLen }, (_, i) => {
        const existingName = (existingVars[i] || "").trim();
        return existingName || mapped.variables[i] || `var${i + 1}`;
      });
      const existingExamples = Array.isArray(existing.exampleValues) ? existing.exampleValues : [];
      const exLen = Math.max(existingExamples.length, mapped.exampleValues.length);
      const mergedExamples = Array.from({ length: exLen }, (_, i) => {
        const existingEx = (existingExamples[i] || "").trim();
        return existingEx || mapped.exampleValues[i] || "";
      });
      await storage.updateWhatsappTemplate(existing.id, {
        name: existing.name || mapped.name,
        category: mapped.category,
        body: mapped.body,
        variables: mergedVars,
        exampleValues: mergedExamples,
        isActive: mapped.isActive,
      });
      updated++;
    } else {
      const createdTmpl = await storage.createWhatsappTemplate({
        name: mapped.name,
        interaktTemplateName: mapped.interaktTemplateName,
        category: mapped.category,
        languageCode: mapped.languageCode,
        body: mapped.body,
        variables: mapped.variables,
        exampleValues: mapped.exampleValues,
        isActive: mapped.isActive,
      });
      if (createdTmpl?.id && storage.createWhatsappTemplateStatusHistory) {
        try {
          await storage.createWhatsappTemplateStatusHistory({
            templateId: createdTmpl.id,
            previousStatus: null,
            newStatus: mapped.isActive,
            source: trigger,
          });
        } catch (e) {
          console.error("[WA TEMPLATE SYNC] Failed to persist initial status history:", e);
        }
      }
      created++;
    }
  }
  return { total: remote.length, created, updated, skipped, statusChanges };
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
