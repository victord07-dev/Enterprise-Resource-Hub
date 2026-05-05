/**
 * ITFI financial-year document numbering helpers.
 *
 * India FY: April 1 – March 31 (evaluated in IST, UTC+5:30).
 *   May 2026  → "2026-27"
 *   Feb 2027  → "2026-27"
 *   April 2027 → "2027-28"
 *
 * Formats:
 *   Quotation      ITFI-Q/2026-27/0001
 *   Sales Order    ITFI-SO/2026-27/0001
 *   Purchase Order ITFI-PO/2026-27/0001
 *
 * --- Allocation strategy (gap-free, concurrency-safe) ---
 *
 * nextDocNumberInTx(tx, prefix, fyStr) increments the counter row in
 * `doc_number_sequences` using a single atomic upsert, WITHIN the same
 * db.transaction() that also INSERTs the document.
 *
 * If the document INSERT fails and the transaction rolls back, the counter
 * increment is rolled back too — no number is permanently assigned, so no
 * gap is created.
 *
 * Concurrent transactions are serialised by Postgres implicit row-level
 * locking on the existing sequence row (the UPDATE step of the upsert
 * blocks until the first writer commits), so two concurrent requests can
 * never receive the same sequence number.
 *
 * Note: `SELECT MAX(...) FOR UPDATE` is invalid in Postgres with aggregates
 * and is deliberately NOT used here.
 */

import { db } from "../db";
import { sql } from "drizzle-orm";

const IST_TZ = "Asia/Kolkata";

/**
 * Returns the India financial-year string for a given UTC instant,
 * evaluating date parts in IST (Asia/Kolkata, UTC+5:30).
 *
 * Examples:
 *   new Date("2026-05-05T00:00:00Z") → "2026-27"
 *   new Date("2027-03-31T22:00:00Z") → "2026-27"  (still Mar 31 IST)
 *   new Date("2027-03-31T18:31:00Z") → "2027-28"  (Apr 1 IST)
 */
export function getFinancialYear(date: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: IST_TZ,
    year: "numeric",
    month: "2-digit",
  }).formatToParts(date);
  const year = parseInt(parts.find((p) => p.type === "year")!.value, 10);
  const month = parseInt(parts.find((p) => p.type === "month")!.value, 10);
  const fyStart = month >= 4 ? year : year - 1;
  return `${fyStart}-${String(fyStart + 1).slice(-2)}`;
}

/**
 * Ensures the doc_number_sequences table exists at runtime.
 * Call once at server startup before any request is served.
 * This is a no-op if the table was already created by drizzle-kit push.
 */
export async function initDocNumberTable(): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS doc_number_sequences (
      doc_type TEXT    NOT NULL,
      fy_str   TEXT    NOT NULL,
      last_seq INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (doc_type, fy_str)
    )
  `);
}

/**
 * Atomically increments the counter for (prefix, fyStr) within the provided
 * Drizzle transaction `tx`, and returns the formatted document number.
 *
 * MUST be called inside a db.transaction() whose commit also performs the
 * document INSERT.  If the INSERT fails and the transaction rolls back, the
 * counter increment is also rolled back — the number is never permanently
 * assigned, so no gap is created.
 *
 * The single-statement upsert serialises concurrent writes at the Postgres
 * row level, so two concurrent requests cannot receive the same number.
 *
 * @param tx     - Drizzle transaction (same one that will INSERT the document)
 * @param prefix - Document prefix, e.g. "ITFI-SO"
 * @param fyStr  - FY string,       e.g. "2026-27"
 */
export async function nextDocNumberInTx(
  tx: typeof db,
  prefix: string,
  fyStr: string,
): Promise<string> {
  const result = await tx.execute(sql`
    INSERT INTO doc_number_sequences (doc_type, fy_str, last_seq)
    VALUES (${prefix}, ${fyStr}, 1)
    ON CONFLICT (doc_type, fy_str)
    DO UPDATE SET last_seq = doc_number_sequences.last_seq + 1
    RETURNING last_seq
  `);
  const seq = (result.rows[0] as { last_seq: number }).last_seq;
  return `${prefix}/${fyStr}/${String(seq).padStart(4, "0")}`;
}
