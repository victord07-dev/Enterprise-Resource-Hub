/**
 * Smoke test for the generalised debug payload capture primitive.
 * Validates:
 *   1. Insert N=7 rows for (whatsapp_webhook, message_received) → cap to 5
 *   2. Insert 1 row for a different eventType → independent bucket, total=6
 *   3. Filter by eventType returns the right subset
 *   4. pruneOldDebugPayloadCaptures(0) clears everything
 */
import { storage } from "../server/storage";
import { db } from "../server/db";
import { sql } from "drizzle-orm";

async function main() {
  // Clean slate for the test source so this script is idempotent.
  await db.execute(sql`DELETE FROM debug_payload_captures WHERE source = 'whatsapp_webhook'`);

  console.log("[CAPTURE SMOKE] inserting 7 message_received captures...");
  for (let i = 0; i < 7; i++) {
    await storage.captureDebugPayload({
      source: "whatsapp_webhook",
      eventType: "message_received",
      rawPayload: { type: "message_received", iter: i, ts: Date.now() },
      notes: `iter=${i}`,
    });
  }

  console.log("[CAPTURE SMOKE] inserting 1 message_api_sent capture...");
  await storage.captureDebugPayload({
    source: "whatsapp_webhook",
    eventType: "message_api_sent",
    rawPayload: { type: "message_api_sent", marker: "different-bucket" },
    notes: "different bucket",
  });

  const messageReceived = await storage.getDebugPayloadCaptures({
    source: "whatsapp_webhook",
    eventType: "message_received",
  });
  const messageApiSent = await storage.getDebugPayloadCaptures({
    source: "whatsapp_webhook",
    eventType: "message_api_sent",
  });
  const all = await storage.getDebugPayloadCaptures({ source: "whatsapp_webhook" });

  console.log(`[CAPTURE SMOKE] message_received rows: ${messageReceived.length} (expect 5)`);
  console.log(`[CAPTURE SMOKE] message_api_sent rows: ${messageApiSent.length} (expect 1)`);
  console.log(`[CAPTURE SMOKE] total whatsapp_webhook rows: ${all.length} (expect 6)`);

  // Verify cap kept the most recent (highest iter values).
  const iters = messageReceived
    .map(r => (r.rawPayload as any)?.iter)
    .sort((a, b) => a - b);
  console.log(`[CAPTURE SMOKE] kept iters: [${iters.join(", ")}] (expect [2, 3, 4, 5, 6] — newest 5)`);

  // Force-prune everything and confirm.
  const removed = await storage.pruneOldDebugPayloadCaptures(0);
  const afterPrune = await storage.getDebugPayloadCaptures({ source: "whatsapp_webhook" });
  console.log(`[CAPTURE SMOKE] pruned: ${removed} rows; remaining: ${afterPrune.length} (expect 0)`);

  const allOk =
    messageReceived.length === 5 &&
    messageApiSent.length === 1 &&
    all.length === 6 &&
    JSON.stringify(iters) === JSON.stringify([2, 3, 4, 5, 6]) &&
    afterPrune.length === 0;

  console.log("─────────────────────────────────────");
  console.log(`[CAPTURE SMOKE] OVERALL: ${allOk ? "PASS ✅" : "FAIL ❌"}`);
  console.log("─────────────────────────────────────");
  process.exit(allOk ? 0 : 1);
}

main().catch(err => {
  console.error("[CAPTURE SMOKE] error:", err);
  process.exit(1);
});
