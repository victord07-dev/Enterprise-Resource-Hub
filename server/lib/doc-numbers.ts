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
 * Concurrency: uses a single atomic PostgreSQL upsert
 *   INSERT … ON CONFLICT DO UPDATE SET last_seq = last_seq + 1 RETURNING last_seq
 * so two concurrent requests can never receive the same sequence number.
 *
 * Gap-minimisation: callers MUST validate the request payload before calling
 * nextDocNumber(). If validation fails, the sequence is never incremented.
 * A number is only "burned" if the DB INSERT itself fails after allocation —
 * an extremely rare event.
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
 * Call once at server startup before any document-creation endpoints are
 * registered, so deployments that skipped drizzle-kit push still work.
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
 * Atomically allocates the next sequence number for (prefix, fyStr) and
 * returns the formatted document number.
 *
 * IMPORTANT: validate the request payload BEFORE calling this function so
 * that sequence numbers are not burned on bad requests.
 *
 * Uses a single SQL upsert so concurrent calls are serialised by Postgres
 * without application-level locking or read-then-write races.
 */
export async function nextDocNumber(prefix: string, fyStr: string): Promise<string> {
  const result = await db.execute(sql`
    INSERT INTO doc_number_sequences (doc_type, fy_str, last_seq)
    VALUES (${prefix}, ${fyStr}, 1)
    ON CONFLICT (doc_type, fy_str)
    DO UPDATE SET last_seq = doc_number_sequences.last_seq + 1
    RETURNING last_seq
  `);
  const seq = (result.rows[0] as { last_seq: number }).last_seq;
  return `${prefix}/${fyStr}/${String(seq).padStart(4, "0")}`;
}
