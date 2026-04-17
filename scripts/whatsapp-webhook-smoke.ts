/**
 * Task #67 Phase 1 — Webhook smoke test.
 *
 * Sends N synthetic webhook payloads against the local server, measures p50/p95
 * handler latency (must be <500ms p95 for the spec to be satisfied), then waits
 * and queries the worker queue to confirm the jobs were processed end-to-end.
 *
 * Run with:  npx tsx scripts/whatsapp-webhook-smoke.ts
 */
import crypto from "crypto";
import { db } from "../server/db";
import { sql } from "drizzle-orm";

const N = 20;
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

function makePayload(i: number) {
  // Unique phone + message id so each payload has a distinct hash (no dedup).
  const ts = Date.now();
  const phone = `9${String(8000000000 + i).padStart(10, "0").slice(0, 10)}`; // 91xxxxxxxx-ish
  const msgId = `smoke-${ts}-${i}`;
  return {
    type: "message",
    data: {
      customer: { phone_number: `+91${phone}`, name: `Smoke Test User ${i}` },
      message: {
        id: msgId,
        from: `+91${phone}`,
        message: { type: "text", text: { body: `Phase 1 smoke test #${i} at ${ts}` } },
      },
    },
  };
}

async function postOne(i: number): Promise<{ status: number; ms: number; body: any }> {
  const payload = makePayload(i);
  const raw = JSON.stringify(payload);
  const signature = sign(raw);
  const start = Date.now();
  const res = await fetch(`${URL_BASE}/api/whatsapp/webhook?token=${encodeURIComponent(TOKEN)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-interakt-signature": signature },
    body: raw,
  });
  const ms = Date.now() - start;
  let body: any = null;
  try { body = await res.json(); } catch { /* ignore */ }
  return { status: res.status, ms, body };
}

function quantile(arr: number[], q: number): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.floor(q * sorted.length));
  return sorted[idx];
}

async function main() {
  console.log(`\n[SMOKE] POSTing ${N} synthetic webhooks to ${URL_BASE}`);
  console.log("─────────────────────────────────────────────────────");
  const results = await Promise.all(Array.from({ length: N }, (_, i) => postOne(i)));
  const okCount = results.filter(r => r.status === 200).length;
  const latencies = results.map(r => r.ms);
  const p50 = quantile(latencies, 0.5);
  const p95 = quantile(latencies, 0.95);
  const max = Math.max(...latencies);
  const min = Math.min(...latencies);

  console.log(`[SMOKE] Handler latency: min=${min}ms p50=${p50}ms p95=${p95}ms max=${max}ms`);
  console.log(`[SMOKE] HTTP status: ${okCount}/${N} returned 200`);
  if (okCount < N) {
    console.log(`[SMOKE] Non-200 responses:`, results.filter(r => r.status !== 200));
  }

  // Wait for worker (poll = 1.5s) to drain — give it plenty of slack.
  const drainSeconds = 8;
  console.log(`[SMOKE] Waiting ${drainSeconds}s for worker to drain queue...`);
  await new Promise(r => setTimeout(r, drainSeconds * 1000));

  // Query job stats directly via DB.
  const [stats] = await db.execute(sql`
    SELECT
      COUNT(*) FILTER (WHERE status = 'pending')    AS pending,
      COUNT(*) FILTER (WHERE status = 'processing') AS processing,
      COUNT(*) FILTER (WHERE status = 'done')       AS done,
      COUNT(*) FILTER (WHERE status = 'failed')     AS failed
    FROM whatsapp_webhook_jobs
    WHERE created_at > NOW() - INTERVAL '5 minutes'
  `).then((r: any) => r.rows);
  const [dl] = await db.execute(sql`SELECT COUNT(*) AS c FROM whatsapp_webhook_jobs_dead_letter`).then((r: any) => r.rows);
  const [convs] = await db.execute(sql`
    SELECT COUNT(DISTINCT id) AS c FROM whatsapp_conversations
    WHERE created_at > NOW() - INTERVAL '5 minutes'
  `).then((r: any) => r.rows);
  const [msgs] = await db.execute(sql`
    SELECT COUNT(*) AS c FROM whatsapp_messages
    WHERE created_at > NOW() - INTERVAL '5 minutes'
  `).then((r: any) => r.rows);

  console.log("\n[SMOKE] Queue state (last 5 min):");
  console.log(`         pending=${stats.pending} processing=${stats.processing} done=${stats.done} failed=${stats.failed}`);
  console.log(`         dead-letter total=${dl.c}`);
  console.log(`[SMOKE] DB rows created (last 5 min): conversations=${convs.c} messages=${msgs.c}`);

  // Idempotency check: re-POST one of the original payloads and confirm we get duplicate=true.
  console.log("\n[SMOKE] Idempotency check: re-POSTing payload #0");
  const dupRes = await postOne(0); // same i=0, but different timestamp → different hash. Force a real dup:
  const fixedPayload = JSON.stringify(makePayload(99999));
  const fixedSig = sign(fixedPayload);
  // First post:
  const first = await fetch(`${URL_BASE}/api/whatsapp/webhook?token=${encodeURIComponent(TOKEN)}`, {
    method: "POST", headers: { "Content-Type": "application/json", "x-interakt-signature": fixedSig }, body: fixedPayload,
  }).then(r => r.json());
  // Second identical post:
  const second = await fetch(`${URL_BASE}/api/whatsapp/webhook?token=${encodeURIComponent(TOKEN)}`, {
    method: "POST", headers: { "Content-Type": "application/json", "x-interakt-signature": fixedSig }, body: fixedPayload,
  }).then(r => r.json());
  console.log(`         first response: ${JSON.stringify(first)}`);
  console.log(`         second response: ${JSON.stringify(second)}`);
  const dupOk = second?.duplicate === true && first?.duplicate !== true;
  console.log(`         idempotency: ${dupOk ? "PASS" : "FAIL"}`);

  // Summary
  const passed =
    okCount === N &&
    p95 < 500 &&
    Number(stats.done) >= N &&
    Number(stats.failed) === 0 &&
    Number(dl.c) === 0 &&
    dupOk;
  console.log("\n─────────────────────────────────────────────────────");
  console.log(`[SMOKE] OVERALL: ${passed ? "PASS ✅" : "FAIL ❌"}`);
  console.log("─────────────────────────────────────────────────────\n");
  process.exit(passed ? 0 : 1);
}

main().catch(err => {
  console.error("[SMOKE] Unhandled error:", err);
  process.exit(2);
});
