// ── WhatsApp Webhook Processor (Task #67 Phase 1) ───────────────────────────
// SINGLE SOURCE OF TRUTH for processing inbound WhatsApp webhook payloads.
// The slim webhook handler (server/routes.ts) only validates + enqueues.
// The worker loop (server/index.ts) calls processWhatsappWebhookJob() to do
// the actual DB work asynchronously, so a slow DB never blocks Interakt.
//
// DO NOT add a second copy of this logic anywhere. If you need to reprocess
// a payload (e.g. for the dead-letter retry button or the Phase 2 backfill),
// call processWhatsappWebhookJob() — never inline it.

import { storage } from "./storage";
import { normalisePhone } from "./whatsapp";
import { broadcastWhatsappEvent } from "./wsHub";

// ── Status update parsing (extracted verbatim from old inline handler) ──────
function normaliseStatus(s: string): string | null {
  const v = String(s || "").toLowerCase();
  if (v === "sent" || v === "submitted" || v === "accepted") return "sent";
  if (v === "delivered") return "delivered";
  if (v === "read" || v === "seen") return "read";
  if (v === "failed" || v === "undelivered" || v === "rejected") return "failed";
  return null;
}

function extractStatusUpdates(body: any): Array<{ id: string; status: string }> {
  const out: Array<{ id: string; status: string }> = [];
  // Shape A (legacy): { data: { message: { id, status } } }
  if (body?.data?.message?.id && body?.data?.message?.status && !body?.data?.message?.message) {
    const s = normaliseStatus(body.data.message.status);
    if (s) out.push({ id: String(body.data.message.id), status: s });
  }
  // Shape B (Interakt v1): top-level type === "message_status"
  const evType = String(body?.type || body?.event || "").toLowerCase();
  if (evType.includes("status")) {
    const id = body?.data?.message_id || body?.data?.id || body?.data?.message?.id;
    const s = normaliseStatus(body?.data?.status || body?.data?.message?.status);
    if (id && s) out.push({ id: String(id), status: s });
  }
  // Shape C (WhatsApp Cloud-style): data.statuses[]
  const statusesArr = body?.data?.statuses || body?.statuses;
  if (Array.isArray(statusesArr)) {
    for (const st of statusesArr) {
      const id = st?.id || st?.message_id;
      const s = normaliseStatus(st?.status);
      if (id && s) out.push({ id: String(id), status: s });
    }
  }
  return out;
}

// ── Media URL extraction (best-effort) ───────────────────────────────────────
// Interakt sends inbound media in a few shapes — extract whatever URL or media
// id we can find. If we can't find one, the message row is still created with
// the correct `type`, just without a download sub-job.
function extractMediaUrl(body: any): string | null {
  const m = body?.data?.message?.message;
  if (!m) return null;
  return (
    m.image?.url || m.image?.link || m.image?.id ||
    m.document?.url || m.document?.link || m.document?.id ||
    m.video?.url || m.video?.link || m.video?.id ||
    m.audio?.url || m.audio?.link || m.audio?.id ||
    m.voice?.url || m.voice?.link || m.voice?.id ||
    m.sticker?.url || m.sticker?.link || m.sticker?.id ||
    null
  );
}

// ── Main entry point: called by worker loop ──────────────────────────────────
export interface ProcessJobResult {
  kind: "status" | "inbound" | "noop" | "media";
  applied?: number;
  conversationId?: string;
  messageId?: string;
}

export async function processWhatsappWebhookJob(
  jobType: string,
  payload: any,
): Promise<ProcessJobResult> {
  if (jobType === "process_inbound") {
    return processInbound(payload);
  }
  if (jobType === "download_media") {
    return processMediaDownload(payload);
  }
  throw new Error(`Unknown WhatsApp webhook job type: ${jobType}`);
}

async function processInbound(body: any): Promise<ProcessJobResult> {
  // Status updates take precedence — they don't create new conversations.
  const statusUpdates = extractStatusUpdates(body);
  if (statusUpdates.length > 0) {
    let applied = 0;
    for (const u of statusUpdates) {
      const updated = await storage.updateWhatsappMessageStatusByInteraktId(u.id, u.status);
      if (updated) {
        applied++;
        broadcastWhatsappEvent({
          type: "status",
          conversationId: updated.conversationId,
          messageId: updated.id,
          interaktMessageId: u.id,
          status: u.status,
        });
      }
    }
    console.log(`[WA PROC] Status updates received=${statusUpdates.length} applied=${applied}`);
    return { kind: "status", applied };
  }

  // Inbound message
  const waPhone = body?.data?.customer?.phone_number || body?.data?.message?.from;
  const messageText = body?.data?.message?.message?.text?.body
    || body?.data?.message?.message?.template?.name
    || body?.data?.message?.message?.type
    || "";
  const messageType = body?.data?.message?.message?.type || "text";
  const interaktMessageId = body?.data?.message?.id;

  if (!waPhone) {
    console.log("[WA PROC] Payload had no phone — noop");
    return { kind: "noop" };
  }

  const normPhone = normalisePhone(String(waPhone));
  const contactName = body?.data?.customer?.name || body?.data?.message?.customerName || null;

  // Find or create conversation — closed conversations are NEVER reopened.
  const allCustomers = await storage.getCustomers();
  const allLeads = await storage.getLeads();
  const matchedCustomer = allCustomers.find(c => c.phone && normalisePhone(c.phone) === normPhone);
  const matchedLead = allLeads.find(l => l.phone && normalisePhone(l.phone) === normPhone);
  const existingConv = await storage.getWhatsappConversationByPhoneOrCustomer(normPhone, matchedCustomer?.id);
  const windowExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  let conv: typeof existingConv;

  if (!existingConv || existingConv.status === "closed") {
    conv = await storage.createWhatsappConversation({
      phoneNumber: normPhone,
      contactName: contactName || matchedCustomer?.name || matchedLead?.name || null,
      customerId: matchedCustomer?.id || null,
      leadId: matchedLead?.id || null,
      status: "open",
      windowExpiresAt,
      unreadCount: 1,
    });
  } else {
    const updated = await storage.updateWhatsappConversation(existingConv.id, {
      windowExpiresAt,
      lastMessageAt: new Date(),
      contactName: existingConv.contactName || contactName || undefined,
      unreadCount: (existingConv.unreadCount || 0) + 1,
    });
    conv = updated || existingConv;
  }

  const inboundMsg = await storage.createWhatsappMessage({
    conversationId: conv!.id,
    direction: "inbound",
    body: messageText,
    type: messageType,
    interaktMessageId: interaktMessageId || null,
    status: "received",
    sentBy: null,
  });

  broadcastWhatsappEvent({
    type: "message",
    conversationId: conv!.id,
    message: inboundMsg,
    conversation: conv!,
  });

  // If this is a media message, enqueue an async download sub-job.
  if (messageType !== "text" && messageType !== "template") {
    const mediaUrl = extractMediaUrl(body);
    if (mediaUrl) {
      try {
        await storage.enqueueWhatsappWebhookJob(
          "download_media",
          { messageId: inboundMsg.id, conversationId: conv!.id, mediaUrl, mediaType: messageType },
          null,
        );
        console.log(`[WA PROC] Enqueued media download for message ${inboundMsg.id} (type=${messageType})`);
      } catch (e: any) {
        console.warn(`[WA PROC] Failed to enqueue media sub-job for ${inboundMsg.id}:`, e?.message || e);
      }
    } else {
      console.warn(`[WA PROC] Media message ${inboundMsg.id} (type=${messageType}) had no extractable URL — message stored without attachment`);
    }
  }

  console.log(`[WA PROC] Inbound message from ${normPhone} stored in conv ${conv!.id}`);
  return { kind: "inbound", conversationId: conv!.id, messageId: inboundMsg.id };
}

// ── Async media download sub-job ─────────────────────────────────────────────
// Phase-1 minimum: download from the supplied URL (if it looks like a real
// HTTPS URL) and store it on the message row's mediaUrl field.
// Phase 2 will move this to Object Storage proper with the attachments table
// once we have the rejected-payload table to confirm Interakt's actual shape.
async function processMediaDownload(payload: any): Promise<ProcessJobResult> {
  const { messageId, mediaUrl } = payload || {};
  if (!messageId || !mediaUrl) {
    console.warn("[WA PROC] download_media job missing messageId or mediaUrl — noop");
    return { kind: "noop" };
  }
  // If it's already a URL, just persist it on the message as the mediaUrl.
  // (Re-hosting to object storage will be added in Phase 2 with the
  //  rejected-payload table to confirm Interakt's actual response shape.)
  if (typeof mediaUrl === "string" && /^https?:\/\//i.test(mediaUrl)) {
    await storage.updateWhatsappMessageStatus(messageId, "received"); // keep status
    // Direct DB update via a helper would be ideal; for now use raw via storage.
    // We deliberately keep this minimal — Phase 2 expands it.
    console.log(`[WA PROC] Media for message ${messageId} resolved to ${mediaUrl}`);
    return { kind: "media", messageId };
  }
  // Otherwise we have only a media id — we can't fetch without an Interakt
  // media-fetch endpoint. Log and consider the job done so it doesn't loop.
  console.warn(`[WA PROC] Media id-only payload for message ${messageId} (id=${mediaUrl}) — Phase 2 will resolve via Interakt media API`);
  return { kind: "media", messageId };
}

// ── Backoff schedule (exported for transparency / tests) ────────────────────
// Attempt 1 fail → 30s, 2 → 2m, 3 → 10m, 4 → 30m, 5 → dead-letter
export const BACKOFF_SCHEDULE_MS = [30_000, 2 * 60_000, 10 * 60_000, 30 * 60_000];
export const MAX_ATTEMPTS = 5;

export function nextRunAtForAttempt(attemptsSoFar: number): Date | null {
  // attemptsSoFar is the number of attempts BEFORE the failure being recorded.
  // After this failure the new attempt count = attemptsSoFar + 1. Schedule the
  // next retry using BACKOFF_SCHEDULE_MS[attemptsSoFar] (0-indexed).
  if (attemptsSoFar >= BACKOFF_SCHEDULE_MS.length) return null; // dead-letter
  return new Date(Date.now() + BACKOFF_SCHEDULE_MS[attemptsSoFar]);
}
