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
 * Concurrency: uses an atomic PostgreSQL upsert
 *   INSERT … ON CONFLICT DO UPDATE SET last_seq = last_seq + 1 RETURNING last_seq
 * so two concurrent requests can never get the same sequence number.
 */

import { db } from "../db";
import { sql } from "drizzle-orm";

const IST_TZ = "Asia/Kolkata";

/**
 * Returns the India financial-year string for a given UTC instant,
 * evaluating date parts in IST (Asia/Kolkata, UTC+5:30).
 * e.g. new Date("2026-05-05T00:00:00Z") → "2026-27"
 *      new Date("2027-03-31T22:00:00Z") → "2026-27" (still Mar 31 IST)
 *      new Date("2027-03-31T18:31:00Z") → "2027-28" (Apr 1 IST)
 */
export function getFinancialYear(date: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: IST_TZ,
    year: "numeric",
    month: "2-digit",
  }).formatToParts(date);
  const year = parseInt(parts.find((p) => p.type === "year")!.value, 10);
  const month = parseInt(parts.find((p) => p.type === "month")!.value, 10);
  // April (4) onwards is the new FY
  const fyStart = month >= 4 ? year : year - 1;
  return `${fyStart}-${String(fyStart + 1).slice(-2)}`;
}

/**
 * Atomically allocates the next sequence number for (prefix, fyStr) and
 * returns the formatted document number.
 *
 * Uses a single SQL upsert so concurrent calls are serialised by Postgres
 * without application-level locking or read-then-write races.
 *
 * The doc_number_sequences table must exist (see shared/schema.ts).
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
