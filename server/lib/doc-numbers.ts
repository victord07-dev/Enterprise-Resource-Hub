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
 * Allocation strategy (gap-free):
 *   nextDocNumberInTx() reads MAX(seq) directly from the document table
 *   within the *same* db.transaction() that performs the INSERT.  If the
 *   INSERT fails and the transaction rolls back, the MAX read is also rolled
 *   back — the number is never permanently assigned, so no gap is created.
 *
 *   Under concurrent creates two transactions may both read the same MAX
 *   and both attempt to insert the same number.  The UNIQUE constraint on
 *   the document-number column causes one to fail with code 23505.
 *   withDocNumberRetry() catches that and retries the entire transaction
 *   (re-reading MAX from the now-updated table), converging in O(concurrent)
 *   retries — typically 1.
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
 * Ensures the doc_number_sequences table exists.
 * The table is no longer used for allocation but is kept for backward
 * compatibility with existing prod data; this guard is a no-op if the table
 * already exists.
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
 * Computes the next document number by reading MAX(seq) directly from the
 * actual document table.
 *
 * MUST be called within a db.transaction() whose commit also performs the
 * INSERT.  That way a failed insert rolls the MAX read back too — no gap.
 *
 * Locking: FOR UPDATE locks matching rows so concurrent transactions with
 * existing records serialize.  For the first document in a FY (no rows to
 * lock) two concurrent readers may both get seq=1; the unique constraint
 * on the document-number column rejects the second; withDocNumberRetry()
 * retries, re-reading MAX=1 and returning 2.
 *
 * @param tx          - drizzle transaction (same tx that will INSERT the doc)
 * @param tableName   - raw SQL table name,  e.g. "sales_orders"
 * @param columnName  - raw SQL column name, e.g. "order_number"
 * @param prefix      - document prefix,     e.g. "ITFI-SO"
 * @param fyStr       - FY string,           e.g. "2026-27"
 */
export async function nextDocNumberInTx(
  tx: typeof db,
  tableName: string,
  columnName: string,
  prefix: string,
  fyStr: string,
): Promise<string> {
  const likePattern = `${prefix}/${fyStr}/%`;
  const rows = await tx.execute(sql`
    SELECT COALESCE(
      MAX(CAST(SPLIT_PART(${sql.raw(columnName)}, '/', 3) AS INTEGER)),
      0
    ) + 1 AS next_seq
    FROM ${sql.raw(tableName)}
    WHERE ${sql.raw(columnName)} LIKE ${likePattern}
    FOR UPDATE
  `);
  const seq = (rows.rows[0] as { next_seq: number }).next_seq;
  return `${prefix}/${fyStr}/${String(seq).padStart(4, "0")}`;
}

/**
 * Retry wrapper for transactional document-number allocation.
 *
 * Retries on Postgres unique-constraint violations (code 23505) which
 * indicate a concurrent transaction committed the same number first.
 * Each retry re-runs fn() so MAX is re-read from the updated table.
 *
 * @param fn         - async function that opens a transaction, allocates a
 *                     number via nextDocNumberInTx, and inserts the document.
 * @param maxRetries - maximum number of additional attempts (default 5).
 */
export async function withDocNumberRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 5,
): Promise<T> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      if (err.code === "23505" && attempt < maxRetries) continue;
      throw err;
    }
  }
  throw new Error("withDocNumberRetry: unreachable");
}
