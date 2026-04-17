/**
 * Task #67 Phase 4 — Webhook idempotency verification.
 *
 * POSTs the same signed payload twice in rapid succession against the local
 * webhook endpoint and verifies that:
 *   1. Both HTTP calls return 200 (idempotent ack — no client-visible failure)
 *   2. Exactly ONE row exists in whatsapp_webhook_jobs for that payload hash
 *      (the second call is dedup'd by hash, never enqueued a second time)
 *
 * Run with:  npx tsx scripts/idempotency-smoke.ts
 */
import crypto from "crypto";
import { db } from "../server/db";
import { sql } from "drizzle-orm";

const URL_BASE = process.env.SMOKE_URL || "http://localhost:5000";
const TOKEN = process.env.WHATSAPP_WEBHOOK_TOKEN || "";
const SECRET = process.env.INTERAKT_WEBHOOK_SECRET || "";

if (!TOKEN || !SECRET) {
  console.error("Missing WHATSAPP_WEBHOOK_TOKEN or INTERAKT_WEBHOOK_SECRET in env. Aborting.");
  process.exit(1);
}

function sign(raw: string): string {
  return crypto.createHmac("sha256", SECRET).update(raw).digest("hex");
}

function payloadHash(raw: string): string {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

async function postOnce(rawBody: string, signature: string, attempt: number): Promise<{ status: number; body: any }> {
  const url = `${URL_BASE}/api/whatsapp/webhook?token=${encodeURIComponent(TOKEN)}`;
  const resp = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Interakt-Signature": signature,
    },
    body: rawBody,
  });
  const text = await resp.text();
  let body: any = text;
  try { body = JSON.parse(text); } catch {}
  console.log(`[idempotency] attempt ${attempt}: HTTP ${resp.status} jobId=${body?.jobId ?? "?"}`);
  return { status: resp.status, body };
}

async function main() {
  // Use a fixed unique-but-stable id so re-runs of this script in the same DB
  // cannot collide with a prior run (timestamp), while both posts in this run
  // share the same body → same hash → must dedup.
  const ts = Date.now();
  const msgId = `idempo-${ts}`;
  const payload = {
    type: "message",
    data: {
      customer: { phone_number: "+919999900099", name: "Idempotency Smoke" },
      message: {
        id: msgId,
        from: "+919999900099",
        message: { type: "text", text: { body: `idempotency check #${ts}` } },
      },
    },
  };
  const raw = JSON.stringify(payload);
  const sig = sign(raw);
  const hash = payloadHash(raw);

  console.log(`[idempotency] payload hash: ${hash.slice(0, 16)}…`);

  const r1 = await postOnce(raw, sig, 1);
  const r2 = await postOnce(raw, sig, 2);

  if (r1.status !== 200 || r2.status !== 200) {
    console.error(`FAIL: expected both attempts to return 200; got ${r1.status} / ${r2.status}`);
    process.exit(2);
  }

  // Give the DB a moment in case the second insert was attempted concurrently.
  await new Promise(r => setTimeout(r, 250));

  const result = await db.execute(sql`
    SELECT COUNT(*)::int AS count, MIN(id) AS first_id, MAX(id) AS last_id
    FROM whatsapp_webhook_jobs
    WHERE payload_hash = ${hash}
  `);
  const row = (result.rows as any[])[0];
  const count = Number(row?.count || 0);

  console.log(`[idempotency] DB rows for hash: ${count}`);
  if (count !== 1) {
    console.error(`FAIL: expected exactly 1 row in whatsapp_webhook_jobs for hash, found ${count}`);
    process.exit(3);
  }

  // Sanity: both responses should reference the same jobId.
  const id1 = r1.body?.jobId;
  const id2 = r2.body?.jobId;
  if (!id1 || !id2 || id1 !== id2) {
    console.error(`FAIL: expected both responses to return same jobId; got ${id1} vs ${id2}`);
    process.exit(4);
  }

  console.log(`PASS: idempotency verified. Single job ${id1} for both POSTs.`);
  process.exit(0);
}

main().catch(err => {
  console.error("Idempotency smoke failed:", err);
  process.exit(99);
});
