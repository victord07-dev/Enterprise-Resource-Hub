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
 * Applies schema migrations for customer_payments that are additive / backward-compatible.
 * Safe to call on every startup — each statement is idempotent.
 *
 * Changes applied:
 *   1. invoice_id  — make nullable (supports SO-level advance payments before invoice exists)
 *   2. sales_order_id — new nullable column; set when payment is an advance with no invoice yet
 */
export async function migrateCustomerPaymentsSchema(): Promise<void> {
  // 1. Drop NOT NULL on invoice_id (idempotent — no-op if already nullable)
  await db.execute(sql`
    ALTER TABLE customer_payments ALTER COLUMN invoice_id DROP NOT NULL
  `);

  // 2. Add sales_order_id column if it doesn't exist yet
  await db.execute(sql`
    ALTER TABLE customer_payments
      ADD COLUMN IF NOT EXISTS sales_order_id VARCHAR
  `);

  // 3. Backfill: set serial status → 'delivered' for any serials still stuck at
  //    'dispatched' whose delivery challan has already been marked delivered.
  await db.execute(sql`
    UPDATE serial_numbers sn
    SET status = 'delivered', updated_at = now()
    FROM delivery_challans dc
    WHERE sn.challan_id = dc.id
      AND dc.status = 'delivered'
      AND sn.status = 'dispatched'
  `);

  // 4. Remove duplicate backfill rows: if a customer_payments row with invoice_id IS NULL
  //    exists for an SO that already has an invoice-linked payment of the same amount+day,
  //    the NULL row is a spurious duplicate — delete it.
  await db.execute(sql`
    DELETE FROM customer_payments cp_adv
    WHERE cp_adv.invoice_id IS NULL
      AND cp_adv.sales_order_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM customer_payments cp_inv
        JOIN sales_invoices si ON si.id = cp_inv.invoice_id
        WHERE si.so_id = cp_adv.sales_order_id
          AND cp_inv.amount::numeric = cp_adv.amount::numeric
          AND cp_inv.payment_date::date = cp_adv.payment_date::date
      )
  `);

  // 5c. Backfill: link any dangling advance supplier_payments to their auto-created invoices.
  //     For POs where the GRN was confirmed (supplier invoice auto-created) but the
  //     advance payment still has purchase_order_id set and no supplier_invoice_id,
  //     link it to the invoice and deduct from po.advance_paid (B3 fix for existing data).
  //     Idempotent — only updates payments where supplier_invoice_id IS NULL.
  await db.execute(sql`
    UPDATE supplier_payments sp
    SET supplier_invoice_id = si.id,
        purchase_order_id   = NULL,
        payment_type        = 'regular'
    FROM supplier_invoices si
    WHERE si.purchase_order_id = sp.purchase_order_id
      AND sp.payment_type = 'advance'
      AND sp.supplier_invoice_id IS NULL
      AND si.upload_status != 'cancelled'
      AND si.status != 'cancelled'
  `);

  // 5d. Rebalance po.advance_paid: for each PO, set advance_paid = SUM of remaining
  //     advance payments (those still with purchase_order_id set, after 5c moved the
  //     invoice-linked ones out).
  await db.execute(sql`
    UPDATE purchase_orders po
    SET advance_paid = COALESCE((
      SELECT SUM(sp.amount::numeric)
      FROM supplier_payments sp
      WHERE sp.purchase_order_id = po.id
        AND sp.payment_type = 'advance'
    ), 0)
  `);

  // 5b. Backfill: set grand_total for purchase_orders rows created before Phase 4A
  //     (grand_total was added later; old rows have NULL).
  //     grand_total = subtotal + COALESCE(total_tax, 0) + COALESCE(delivery_cost, 0)
  //     Idempotent — only updates rows where grand_total IS NULL but subtotal IS NOT NULL.
  await db.execute(sql`
    UPDATE purchase_orders
    SET grand_total = COALESCE(subtotal::numeric, 0)
                   + COALESCE(total_tax::numeric, 0)
                   + COALESCE(delivery_cost::numeric, 0)
    WHERE grand_total IS NULL
      AND subtotal IS NOT NULL
  `);

  // 5. Backfill: copy SO advance payments from the old `payments` table into
  //    `customer_payments` for any rows that were recorded before Fix #7 was
  //    deployed (i.e. before customer_payments got sales_order_id support).
  //    Only for SOs that do NOT yet have any sales invoice (genuine advances).
  //
  //    Dedup guard: skip if ANY customer_payments row already covers this SO +
  //    amount + day (whether invoice-linked or not), preventing double-insertion
  //    on repeated startups.
  await db.execute(sql`
    INSERT INTO customer_payments
      (id, invoice_id, sales_order_id, customer_id, amount,
       payment_date, method, reference, notes, created_by, cash_account_id, created_at)
    SELECT
      gen_random_uuid(),
      NULL,
      so.id,
      so.customer_id,
      p.amount,
      p.payment_date,
      p.method,
      p.reference,
      NULL,
      NULL,
      p.cash_account_id,
      COALESCE(p.payment_date, NOW())
    FROM payments p
    JOIN sales_orders so
      ON p.reference ILIKE '%' || so.order_number || '%'
    WHERE p.invoice_id IS NULL
      AND p.cash_account_id IS NOT NULL
      -- Only for SOs that have NO invoice yet (genuine pre-invoice advances)
      AND NOT EXISTS (
        SELECT 1 FROM sales_invoices si WHERE si.so_id = so.id
      )
      -- Dedup: skip if any customer_payments row already covers this SO + amount + day
      AND NOT EXISTS (
        SELECT 1 FROM customer_payments cp
        WHERE cp.sales_order_id = so.id
          AND cp.amount::numeric = p.amount::numeric
          AND cp.payment_date::date = p.payment_date::date
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
  const month = String(new Date().getMonth() + 1).padStart(2, "0");
  return `${prefix}/${fyStr}/${month}/${String(seq).padStart(4, "0")}`;
}
