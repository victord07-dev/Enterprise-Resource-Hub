/**
 * Phase 4C — Centralised financial aggregation helpers.
 *
 * All money math for the dashboard + 11 reports lives here. Routes stay thin.
 *
 * Conventions:
 *   - All amounts returned as plain numbers (not strings). Convert to string at
 *     the API boundary if your client expects strings.
 *   - All "from"/"to" inputs are ISO date strings YYYY-MM-DD; helpers build
 *     proper date ranges (start-of-day → end-of-day) internally.
 *   - "as-of" inputs default to today end-of-day.
 *
 * Status:
 *   ✅ Implemented now (T4 — needed by dashboard T5)
 *   🔧 Stubbed (filled in within their report task — T7..T16)
 */

import { db } from "../db";
import { storage } from "../storage";
import { sql, and, eq, gte, lte, lt, gt, ne, desc, isNotNull, isNull, or } from "drizzle-orm";
import {
  cashAccounts, accountTransfers, balanceAdjustments,
  customerPayments, supplierPayments, expenses,
  salesInvoices, supplierInvoices, customers, suppliers,
  goodsReceiptNotes, quotations, expenseCategories,
} from "@shared/schema";

// ── Date helpers ─────────────────────────────────────────────────────────────
// Normalize empty-string to undefined so callers (UI clearing a date input)
// behave the same as omitting the parameter — never falls through to SQL.
function normIso(iso?: string): string | undefined {
  if (iso === undefined || iso === null) return undefined;
  const trimmed = String(iso).trim();
  if (trimmed === "") return undefined;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    throw new Error(`Invalid date "${iso}" — expected YYYY-MM-DD`);
  }
  return trimmed;
}
function dayStart(iso?: string): Date | null {
  const n = normIso(iso);
  if (!n) return null;
  const d = new Date(n + "T00:00:00");
  return isNaN(d.getTime()) ? null : d;
}
function dayEnd(iso?: string): Date | null {
  const n = normIso(iso);
  if (!n) return null;
  const d = new Date(n + "T23:59:59.999");
  return isNaN(d.getTime()) ? null : d;
}

export interface PeriodFilter {
  from?: string;
  to?: string;
}

// ── B3 — Cash position per account ───────────────────────────────────────────
export interface AccountBalance {
  accountId: string;
  accountName: string;
  accountType: "bank" | "cash";
  balance: number;
}

/**
 * Cash position per active account.
 *
 * Defers to `storage.computeAccountBalance()` (the system-of-record balance
 * function used by the Cash Position page and per-account ledger). This
 * guarantees the dashboard, the Cash Position page, and the per-account
 * statement always agree — including the legacy `payments` table inflows
 * (sales-order receipts) that the old standalone implementation missed.
 */
export async function getCashPositionPerAccount(): Promise<AccountBalance[]> {
  const accts = await db.select().from(cashAccounts).where(eq(cashAccounts.isActive, true));
  return Promise.all(
    accts.map(async (a) => ({
      accountId: a.id,
      accountName: a.name,
      accountType: a.type as "bank" | "cash",
      balance: await storage.computeAccountBalance(a.id),
    })),
  );
}

// ── B2 — Headline period totals ──────────────────────────────────────────────
export interface PeriodTotals {
  revenue: number;        // sum of customer_payments in period
  invoicedSales: number;  // sum of sales_invoices.grand_total in period
  expenses: number;       // sum of expenses.amount in period
  supplierPaid: number;   // sum of supplier_payments.amount in period
  netCashFlow: number;    // revenue - expenses - supplierPaid
}

export async function getPeriodTotals(p: PeriodFilter): Promise<PeriodTotals> {
  const from = dayStart(p.from);
  const to = dayEnd(p.to);

  const buildRange = (col: any) => {
    const conds = [];
    if (from) conds.push(gte(col, from));
    if (to) conds.push(lte(col, to));
    return conds.length ? and(...conds) : undefined;
  };

  const [rev] = await db
    .select({ s: sql<string>`COALESCE(SUM(${customerPayments.amount}),0)` })
    .from(customerPayments)
    .where(buildRange(customerPayments.paymentDate));

  const [inv] = await db
    .select({ s: sql<string>`COALESCE(SUM(${salesInvoices.grandTotal}),0)` })
    .from(salesInvoices)
    .where(and(
      buildRange(salesInvoices.invoiceDate),
      ne(salesInvoices.status, "cancelled"),
    ));

  const [exp] = await db
    .select({ s: sql<string>`COALESCE(SUM(${expenses.amount}),0)` })
    .from(expenses)
    .where(buildRange(expenses.expenseDate));

  const [supp] = await db
    .select({ s: sql<string>`COALESCE(SUM(${supplierPayments.amount}),0)` })
    .from(supplierPayments)
    .where(buildRange(supplierPayments.paymentDate));

  const revenue = Number(rev?.s ?? 0);
  const invoicedSales = Number(inv?.s ?? 0);
  const expensesAmt = Number(exp?.s ?? 0);
  const supplierPaid = Number(supp?.s ?? 0);

  return {
    revenue,
    invoicedSales,
    expenses: expensesAmt,
    supplierPaid,
    netCashFlow: revenue - expensesAmt - supplierPaid,
  };
}

// ── B4 — Top customers by revenue in period ──────────────────────────────────
export interface TopCustomer {
  customerId: string | null;
  customerName: string;
  totalReceived: number;
  paymentCount: number;
}

export async function getTopCustomers(p: PeriodFilter, limit = 5): Promise<TopCustomer[]> {
  const from = dayStart(p.from);
  const to = dayEnd(p.to);
  const conds: any[] = [isNotNull(customerPayments.customerId)];
  if (from) conds.push(gte(customerPayments.paymentDate, from));
  if (to) conds.push(lte(customerPayments.paymentDate, to));

  const rows = await db
    .select({
      customerId: customerPayments.customerId,
      customerName: customers.name,
      totalReceived: sql<string>`COALESCE(SUM(${customerPayments.amount}),0)`,
      paymentCount: sql<number>`COUNT(*)::int`,
    })
    .from(customerPayments)
    .leftJoin(customers, eq(customerPayments.customerId, customers.id))
    .where(and(...conds))
    .groupBy(customerPayments.customerId, customers.name)
    .orderBy(sql`SUM(${customerPayments.amount}) DESC`)
    .limit(limit);

  return rows.map(r => ({
    customerId: r.customerId,
    customerName: r.customerName ?? "—",
    totalReceived: Number(r.totalReceived),
    paymentCount: r.paymentCount,
  }));
}

// ── B5 — Top suppliers by spend in period ────────────────────────────────────
export interface TopSupplier {
  supplierId: string | null;
  supplierName: string;
  totalPaid: number;
  paymentCount: number;
}

export async function getTopSuppliers(p: PeriodFilter, limit = 5): Promise<TopSupplier[]> {
  const from = dayStart(p.from);
  const to = dayEnd(p.to);
  const conds: any[] = [isNotNull(supplierPayments.supplierId)];
  if (from) conds.push(gte(supplierPayments.paymentDate, from));
  if (to) conds.push(lte(supplierPayments.paymentDate, to));

  const rows = await db
    .select({
      supplierId: supplierPayments.supplierId,
      supplierName: suppliers.name,
      totalPaid: sql<string>`COALESCE(SUM(${supplierPayments.amount}),0)`,
      paymentCount: sql<number>`COUNT(*)::int`,
    })
    .from(supplierPayments)
    .leftJoin(suppliers, eq(supplierPayments.supplierId, suppliers.id))
    .where(and(...conds))
    .groupBy(supplierPayments.supplierId, suppliers.name)
    .orderBy(sql`SUM(${supplierPayments.amount}) DESC`)
    .limit(limit);

  return rows.map(r => ({
    supplierId: r.supplierId,
    supplierName: r.supplierName ?? "—",
    totalPaid: Number(r.totalPaid),
    paymentCount: r.paymentCount,
  }));
}

// ── B6 — Recent activity feed (UNION of money-affecting events) ──────────────
export type ActivityEventType =
  | "customer_payment"
  | "supplier_payment"
  | "expense"
  | "transfer"
  | "adjustment";

export interface ActivityEvent {
  type: ActivityEventType;
  id: string;
  occurredAt: string; // ISO
  amount: number;     // signed: + inflow, − outflow
  label: string;      // e.g. "Acme Corp paid ₹50,000"
  ref?: string | null;
}

export async function getRecentActivity(limit = 20): Promise<ActivityEvent[]> {
  // UNION ALL across 5 sources, then sort + limit.
  // Use raw SQL for performance; column shapes are simple.
  const result = await db.execute(sql`
    (
      SELECT
        'customer_payment' AS type,
        cp.id::text AS id,
        cp.payment_date AS occurred_at,
        cp.amount::numeric AS amount,
        COALESCE(c.name, 'Customer') || ' paid' AS label,
        cp.reference AS ref,
        1 AS sign
      FROM customer_payments cp
      LEFT JOIN customers c ON c.id = cp.customer_id
    )
    UNION ALL
    (
      SELECT
        'supplier_payment' AS type,
        sp.id::text AS id,
        sp.payment_date AS occurred_at,
        sp.amount::numeric AS amount,
        'Paid ' || COALESCE(s.name, 'supplier') AS label,
        sp.reference AS ref,
        -1 AS sign
      FROM supplier_payments sp
      LEFT JOIN suppliers s ON s.id = sp.supplier_id
    )
    UNION ALL
    (
      SELECT
        'expense' AS type,
        e.id::text AS id,
        e.expense_date AS occurred_at,
        e.amount::numeric AS amount,
        'Expense: ' || COALESCE(ec.name, 'uncategorised') AS label,
        e.notes AS ref,
        -1 AS sign
      FROM expenses e
      LEFT JOIN expense_categories ec ON ec.id = e.category_id
    )
    UNION ALL
    (
      SELECT
        'transfer' AS type,
        at.id::text AS id,
        at.transfer_date AS occurred_at,
        at.amount::numeric AS amount,
        'Transfer ' || COALESCE(fa.name,'?') || ' → ' || COALESCE(ta.name,'?') AS label,
        at.notes AS ref,
        0 AS sign
      FROM account_transfers at
      LEFT JOIN cash_accounts fa ON fa.id = at.from_account_id
      LEFT JOIN cash_accounts ta ON ta.id = at.to_account_id
    )
    UNION ALL
    (
      SELECT
        'adjustment' AS type,
        ba.id::text AS id,
        ba.adjustment_date::timestamp AS occurred_at,
        ABS(ba.adjustment_amount::numeric) AS amount,
        'Adjustment: ' || COALESCE(ba.reason, '—') AS label,
        NULL AS ref,
        CASE WHEN ba.adjustment_amount::numeric >= 0 THEN 1 ELSE -1 END AS sign
      FROM balance_adjustments ba
    )
    ORDER BY occurred_at DESC NULLS LAST
    LIMIT ${limit}
  `);

  const rows = (result as any).rows ?? (result as any) ?? [];
  return rows.map((r: any) => ({
    type: r.type as ActivityEventType,
    id: r.id,
    occurredAt: r.occurred_at instanceof Date ? r.occurred_at.toISOString() : String(r.occurred_at),
    amount: Number(r.amount) * Number(r.sign ?? 1),
    label: r.label,
    ref: r.ref,
  }));
}

// ── B7 — Pending Actions ─────────────────────────────────────────────────────
export interface PendingActions {
  grnDrafts: number;
  supplierInvoicesPendingUpload: number;
  overdueCustomerInvoices: { count: number; amount: number };
  overdueSupplierInvoices: { count: number; amount: number };
  quotationsExpiringThisWeek: number;
}

export async function getPendingActions(): Promise<PendingActions> {
  const today = new Date(); today.setHours(0,0,0,0);
  const weekFromNow = new Date(today); weekFromNow.setDate(weekFromNow.getDate() + 7);

  const [grnRow] = await db
    .select({ c: sql<number>`COUNT(*)::int` })
    .from(goodsReceiptNotes)
    .where(eq(goodsReceiptNotes.status, "draft"));

  const [supUpRow] = await db
    .select({ c: sql<number>`COUNT(*)::int` })
    .from(supplierInvoices)
    .where(eq(supplierInvoices.uploadStatus, "pending_upload"));

  // Sales + supplier overdue: route through canonical helpers (FIX 1).
  // Was: inline SUM(grand_total - paid_amount - credited_amount) which
  //   (a) referenced non-existent paid_amount column (TS2339), AND
  //   (b) Drizzle silently generated grand_total - -credited (gross+credit).
  // Was supplier: inline gross totalAmount (B2 — ignored payments).
  const [overdueCust, overdueSup] = await Promise.all([
    storage.sumOpenCustomerOutstanding({ dueDateBefore: today }),
    storage.sumOpenSupplierOutstanding({ dueDateBefore: today }),
  ]);

  const [quoteExpRow] = await db
    .select({ c: sql<number>`COUNT(*)::int` })
    .from(quotations)
    .where(and(
      gte(quotations.validUntil, today),
      lte(quotations.validUntil, weekFromNow),
      sql`${quotations.status} NOT IN ('expired','converted','cancelled','rejected')`,
    ));

  return {
    grnDrafts: grnRow?.c ?? 0,
    supplierInvoicesPendingUpload: supUpRow?.c ?? 0,
    overdueCustomerInvoices: overdueCust,
    overdueSupplierInvoices: overdueSup,
    quotationsExpiringThisWeek: quoteExpRow?.c ?? 0,
  };
}

// ── Phase 4C — FIX 2: Today snapshot (point-in-time financial position) ─────
// 5 cards above the existing period-scoped MetricCardsRow. These are NOT
// period-scoped; they always reflect "right now / today". Operator-locked:
//   • totalCashPosition skipped (Cash Position strip TOTAL line is canonical)
//   • todayIn/Out exclude transfers + balance_adjustments (those land on the
//     Cash Flow Statement T8 under categorised internal-movement sections)
//   • outstandings sourced from canonical helpers (FIX 1) — drift-proof
export interface TodaySnapshot {
  outstandingReceivables: number; // from sumOpenCustomerOutstanding (no due filter)
  outstandingPayables: number;    // from sumOpenSupplierOutstanding (no due filter)
  netWorkingCapital: number;      // (cash on hand) + AR - AP
  todayIn: number;                // customer_payments + legacy payments(completed) dated today
  todayOut: number;               // supplier_payments + expenses dated today
}

export async function getTodaySnapshot(): Promise<TodaySnapshot> {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);

  const [ar, ap, cashAccts, cpInRow, legacyInRow, spOutRow, expOutRow] = await Promise.all([
    storage.sumOpenCustomerOutstanding(),
    storage.sumOpenSupplierOutstanding(),
    db.select().from(cashAccounts).where(eq(cashAccounts.isActive, true)),
    db.select({ s: sql<string>`COALESCE(SUM(${customerPayments.amount}),0)` })
      .from(customerPayments)
      .where(and(gte(customerPayments.paymentDate, today), lt(customerPayments.paymentDate, tomorrow))),
    // Legacy payments table — only completed rows, attributed to a cash account.
    // Mirrors how computeAccountBalance treats them as inflows.
    db.execute(sql`
      SELECT COALESCE(SUM(amount::numeric), 0) AS s
      FROM payments
      WHERE status = 'completed'
        AND payment_date >= ${today.toISOString()}
        AND payment_date <  ${tomorrow.toISOString()}
    `),
    db.select({ s: sql<string>`COALESCE(SUM(${supplierPayments.amount}),0)` })
      .from(supplierPayments)
      .where(and(gte(supplierPayments.paymentDate, today), lt(supplierPayments.paymentDate, tomorrow))),
    // expenses.expenseDate is a date (no time component) — compare to ISO date string.
    db.execute(sql`
      SELECT COALESCE(SUM(amount::numeric), 0) AS s
      FROM expenses
      WHERE expense_date = ${today.toISOString().slice(0, 10)}
    `),
  ]);

  const cashOnHand = (await Promise.all(
    cashAccts.map((a) => storage.computeAccountBalance(a.id))
  )).reduce((s, n) => s + n, 0);

  const todayIn =
    Number(cpInRow[0]?.s ?? 0) +
    Number((legacyInRow.rows[0] as any)?.s ?? 0);
  const todayOut =
    Number(spOutRow[0]?.s ?? 0) +
    Number((expOutRow.rows[0] as any)?.s ?? 0);

  return {
    outstandingReceivables: ar.amount,
    outstandingPayables: ap.amount,
    netWorkingCapital: cashOnHand + ar.amount - ap.amount,
    todayIn,
    todayOut,
  };
}

// ── Phase 4C T7 — P&L Statement ──────────────────────────────────────────────
// Operator-locked decisions (Batch 1):
//   D1: COGS = "Purchases (proxy for COGS)" — supplier-invoice ex-GST proxy.
//       Caveat shipped in helper output so PDF/Excel header can render it.
//   D2: Sales Returns from credit_notes; period anchor = created_at; structurally
//       tested only (no real CN data exists yet).
//   D3: P&L is net-of-GST throughout. Revenue = sales_invoices.subtotal,
//       Purchases = COALESCE(supplier_invoices.subtotal, total_amount - tax_amount).
//       Net Profit shown is "Before Income Tax" (income tax not modeled).
//
// Filters out cancelled invoices/CNs via status + uploadStatus (matches
// the convention used in getPendingActions + the canonical outstanding helpers).

export interface PLOpexCategoryLine {
  categoryId: string | null;
  categoryName: string;
  total: number;
}

export interface PLStatement {
  period: { from: string | null; to: string | null };
  revenue: {
    salesRevenue: number;        // sales_invoices.subtotal in period (excl GST)
    salesReturns: number;        // credit_notes.subtotal (created_at in period)
    netRevenue: number;          // salesRevenue - salesReturns
    salesInvoiceCount: number;
    creditNoteCount: number;
  };
  cogs: {
    purchases: number;           // supplier_invoices ex-GST proxy
    label: string;               // "Purchases (proxy for COGS)"
    caveat: string;              // operator-mandated note
    supplierInvoiceCount: number;
  };
  grossProfit: number;
  operatingExpenses: {
    byCategory: PLOpexCategoryLine[];
    total: number;
    expenseCount: number;
  };
  netProfitBeforeTax: number;
  /**
   * 12-month trend ending at the calendar month containing `to`
   * (or current month if `to` is null). DECOUPLED from period filter
   * per Q3 lock. Always exactly 12 entries, zero-filled where no data.
   *   revenue   = sales_invoices.subtotal (ex-GST), excludes cancelled
   *   expense   = expenses.amount in month
   *   netProfit = revenue − sales_returns − purchases − expense
   */
  trend: PLTrendPoint[];
  trendWindow: { from: string; to: string };  // ISO yyyy-mm-dd, info for chart annotation
  notes: string[];               // structural notes for header/footer
}

export interface PLTrendPoint {
  month: string;     // 'YYYY-MM'
  revenue: number;
  expense: number;
  netProfit: number;
}

const COGS_LABEL = "Purchases (proxy for COGS)";
const COGS_CAVEAT =
  "Purchases shown as proxy for Cost of Goods Sold. True FIFO COGS based on " +
  "stock dispatch tracing requires further cost accounting work. Use this " +
  "figure for trend analysis; verify against year-end stock counts for " +
  "accurate gross margin.";

export async function getPLStatement(p: PeriodFilter): Promise<PLStatement> {
  const from = dayStart(p.from);
  const to = dayEnd(p.to);

  const buildRange = (col: any) => {
    const conds: any[] = [];
    if (from) conds.push(gte(col, from));
    if (to) conds.push(lte(col, to));
    return conds.length ? and(...conds) : undefined;
  };

  // ─── Revenue: sales_invoices.subtotal (ex-GST), exclude cancelled ────────
  const [salesRow] = await db
    .select({
      total: sql<string>`COALESCE(SUM(${salesInvoices.subtotal}),0)`,
      cnt: sql<number>`COUNT(*)::int`,
    })
    .from(salesInvoices)
    .where(and(
      buildRange(salesInvoices.invoiceDate),
      ne(salesInvoices.status, "cancelled"),
      ne(salesInvoices.uploadStatus, "cancelled"),
    ));

  // ─── Sales Returns: credit_notes.subtotal anchored on created_at ─────────
  // D2: Sales Returns line tested structurally; first real CN flow needed
  //     for data verification. Currently 0 CN rows exist.
  const cnRangeConds: any[] = [ne(sql`status`, sql`'cancelled'`)];
  if (from) cnRangeConds.push(sql`created_at >= ${from.toISOString()}`);
  if (to) cnRangeConds.push(sql`created_at <= ${to.toISOString()}`);
  const cnResult = await db.execute(sql`
    SELECT
      COALESCE(SUM(subtotal::numeric), 0) AS total,
      COUNT(*)::int AS cnt
    FROM credit_notes
    WHERE status <> 'cancelled'
      ${from ? sql`AND created_at >= ${from.toISOString()}` : sql``}
      ${to ? sql`AND created_at <= ${to.toISOString()}` : sql``}
  `);
  const cnRow = cnResult.rows[0] as any;

  // ─── Purchases (proxy for COGS): supplier_invoices ex-GST ────────────────
  // COALESCE(subtotal, total_amount - tax_amount) — D1 caveat in output.
  const [purchRow] = await db
    .select({
      total: sql<string>`COALESCE(SUM(
        COALESCE(
          ${supplierInvoices.subtotal}::numeric,
          (${supplierInvoices.totalAmount}::numeric - COALESCE(${supplierInvoices.taxAmount}::numeric, 0))
        )
      ), 0)`,
      cnt: sql<number>`COUNT(*)::int`,
    })
    .from(supplierInvoices)
    .where(and(
      buildRange(supplierInvoices.invoiceDate),
      ne(supplierInvoices.status, "cancelled"),
      ne(supplierInvoices.uploadStatus, "cancelled"),
    ));

  // ─── Operating Expenses by category ──────────────────────────────────────
  const opexRows = await db
    .select({
      categoryId: expenses.categoryId,
      categoryName: expenseCategories.name,
      total: sql<string>`COALESCE(SUM(${expenses.amount}),0)`,
    })
    .from(expenses)
    .leftJoin(expenseCategories, eq(expenses.categoryId, expenseCategories.id))
    .where(buildRange(expenses.expenseDate))
    .groupBy(expenses.categoryId, expenseCategories.name)
    .orderBy(sql`SUM(${expenses.amount}) DESC`);

  const [opexCntRow] = await db
    .select({ cnt: sql<number>`COUNT(*)::int` })
    .from(expenses)
    .where(buildRange(expenses.expenseDate));

  const salesRevenue = Number(salesRow?.total ?? 0);
  const salesReturns = Number(cnRow?.total ?? 0);
  const netRevenue = salesRevenue - salesReturns;
  const purchases = Number(purchRow?.total ?? 0);
  const grossProfit = netRevenue - purchases;
  const opexByCategory: PLOpexCategoryLine[] = opexRows.map((r) => ({
    categoryId: r.categoryId ?? null,
    categoryName: r.categoryName ?? "Uncategorised",
    total: Number(r.total),
  }));
  const opexTotal = opexByCategory.reduce((s, r) => s + r.total, 0);
  const netProfitBeforeTax = grossProfit - opexTotal;

  const notes: string[] = [
    "P&L is net-of-GST. Revenue = sales invoice subtotal (ex-GST). Purchases = supplier invoice subtotal (ex-GST proxy).",
    "Net Profit shown is Before Income Tax. GST and income tax not modelled.",
  ];
  if (Number(cnRow?.cnt ?? 0) === 0) {
    notes.push("No credit notes in period — Sales Returns line is structurally rendered only.");
  }

  return {
    period: { from: p.from ?? null, to: p.to ?? null },
    revenue: {
      salesRevenue,
      salesReturns,
      netRevenue,
      salesInvoiceCount: salesRow?.cnt ?? 0,
      creditNoteCount: Number(cnRow?.cnt ?? 0),
    },
    cogs: {
      purchases,
      label: COGS_LABEL,
      caveat: COGS_CAVEAT,
      supplierInvoiceCount: purchRow?.cnt ?? 0,
    },
    grossProfit,
    operatingExpenses: {
      byCategory: opexByCategory,
      total: opexTotal,
      expenseCount: opexCntRow?.cnt ?? 0,
    },
    netProfitBeforeTax,
    ...(await getPLTrendBlock(p.to)),
    notes,
  };
}

// ─── 12-Month Trend (decoupled from period filter) ───────────────────────────
// Returns the trend[] + trendWindow fields, anchored to the calendar month of
// the report's `to` date (or today if `to` is null). Always 12 zero-filled points.
async function getPLTrendBlock(toIso?: string): Promise<{ trend: PLTrendPoint[]; trendWindow: { from: string; to: string } }> {
  const anchor = toIso ? new Date(toIso + "T00:00:00Z") : new Date();
  const yr = anchor.getUTCFullYear();
  const mo = anchor.getUTCMonth();
  // Build 12 month buckets ending at `anchor`'s month
  const months: { key: string; start: Date; end: Date }[] = [];
  for (let i = 11; i >= 0; i--) {
    const start = new Date(Date.UTC(yr, mo - i, 1, 0, 0, 0, 0));
    const next = new Date(Date.UTC(yr, mo - i + 1, 1, 0, 0, 0, 0));
    const end = new Date(next.getTime() - 1);
    const key = `${start.getUTCFullYear()}-${String(start.getUTCMonth() + 1).padStart(2, "0")}`;
    months.push({ key, start, end });
  }
  const earliest = months[0].start;
  const latest = months[11].end;

  // Architect-flagged MEDIUM: pass plain date strings (YYYY-MM-DD) — never full
  // ISO timestamps with Z — so Postgres unambiguously compares date columns
  // (sales_invoices.invoice_date is `date`, credit_notes.created_at is
  // `timestamp` but daterange comparison stays TZ-stable when bounds are pure
  // dates). This eliminates session-TZ drift at month boundaries.
  const earliestStr = earliest.toISOString().slice(0, 10);   // YYYY-MM-DD (UTC date)
  const latestStr = new Date(Date.UTC(latest.getUTCFullYear(), latest.getUTCMonth(), latest.getUTCDate()))
    .toISOString().slice(0, 10);

  // Run 4 month-bucketed queries in parallel
  const [revRes, retRes, purchRes, expRes] = await Promise.all([
    db.execute(sql`
      SELECT to_char(date_trunc('month', invoice_date::date), 'YYYY-MM') AS m,
             COALESCE(SUM(subtotal::numeric), 0) AS total
      FROM sales_invoices
      WHERE status <> 'cancelled' AND upload_status <> 'cancelled'
        AND invoice_date >= ${earliestStr}::date AND invoice_date <= ${latestStr}::date
      GROUP BY 1
    `),
    db.execute(sql`
      SELECT to_char(date_trunc('month', created_at::date), 'YYYY-MM') AS m,
             COALESCE(SUM(subtotal::numeric), 0) AS total
      FROM credit_notes
      WHERE status <> 'cancelled'
        AND created_at::date >= ${earliestStr}::date AND created_at::date <= ${latestStr}::date
      GROUP BY 1
    `),
    db.execute(sql`
      SELECT to_char(date_trunc('month', invoice_date::date), 'YYYY-MM') AS m,
             COALESCE(SUM(COALESCE(subtotal::numeric, total_amount::numeric - COALESCE(tax_amount::numeric, 0))), 0) AS total
      FROM supplier_invoices
      WHERE status <> 'cancelled' AND upload_status <> 'cancelled'
        AND invoice_date >= ${earliestStr}::date AND invoice_date <= ${latestStr}::date
      GROUP BY 1
    `),
    db.execute(sql`
      SELECT to_char(date_trunc('month', expense_date::date), 'YYYY-MM') AS m,
             COALESCE(SUM(amount::numeric), 0) AS total
      FROM expenses
      WHERE expense_date >= ${earliestStr}::date AND expense_date <= ${latestStr}::date
      GROUP BY 1
    `),
  ]);

  const toMap = (r: any) => {
    const m = new Map<string, number>();
    for (const row of r.rows as any[]) m.set(row.m, Number(row.total));
    return m;
  };
  const revMap = toMap(revRes);
  const retMap = toMap(retRes);
  const purchMap = toMap(purchRes);
  const expMap = toMap(expRes);

  const trend: PLTrendPoint[] = months.map(({ key }) => {
    const revenue = revMap.get(key) ?? 0;
    const returns = retMap.get(key) ?? 0;
    const purchases = purchMap.get(key) ?? 0;
    const expense = expMap.get(key) ?? 0;
    return {
      month: key,
      revenue,
      expense,
      netProfit: revenue - returns - purchases - expense,
    };
  });

  return {
    trend,
    trendWindow: {
      from: earliest.toISOString().slice(0, 10),
      to: latest.toISOString().slice(0, 10),
    },
  };
}

// ── Phase 4C T8 — Cash Flow Statement (Direct Method) ────────────────────────
// Operator-locked decisions (Batch 1):
//   D4(i):   Operating (cust pmts in, supp pmts out, expenses out) | Internal
//            Movements (transfers gross both legs → net 0; adjustments) |
//            Net Change | Per-account reconciliation.
//   D4(ii):  Direct method.
//   D4(iii): Both per-account AND consolidated TOTAL row.
//   R2:      Per-account inflows/outflows include ALL movements affecting
//            that account (operating + internal). Top sectioning is narrative
//            only. Reconciliation: opening + inflows − outflows = closing
//            must hold per-account AND for the TOTAL row.
//   R3:      4 reconciliation assertions live in scripts/test-pl-cashflow-helpers.ts
//
// LEGACY PAYMENTS HANDLING: 100% of `payments` table rows currently have
// NULL cash_account_id (24 rows, all unattributed). They cannot participate
// in per-account reconciliation. They are EXCLUDED from this report and
// surfaced under `notes.legacyReceiptsExcluded`. This matches the behaviour
// of computeAccountBalance which also skips NULL-account legacy rows.

export interface CashFlowAdjustmentLine {
  reason: string;
  amount: number;       // signed; + = inflow, − = outflow
}

export interface CashFlowAccountLine {
  accountId: string;
  accountName: string;
  accountType: "bank" | "cash";
  opening: number;
  inflows: number;
  outflows: number;
  closing: number;
  netChange: number;
}

export interface CashFlowStatement {
  period: { from: string | null; to: string | null };
  operating: {
    customerPaymentsReceived: number;   // customer_payments only (legacy excluded)
    supplierPaymentsMade: number;
    operatingExpenses: number;
    netOperating: number;
  };
  internal: {
    transfersGross: number;             // sum of account_transfers.amount in period
    transfersNet: number;               // always 0 (both legs cancel) — exposed for D4 visualisation
    adjustments: {
      byReason: CashFlowAdjustmentLine[];
      net: number;                      // signed sum
    };
    netInternal: number;                // transfersNet + adjustments.net = adjustments.net
  };
  netChangeInCash: number;              // netOperating + netInternal
  perAccount: CashFlowAccountLine[];
  totals: {
    opening: number;
    inflows: number;
    outflows: number;
    closing: number;
    netChange: number;
  };
  notes: {
    legacyReceiptsExcluded: { count: number; amount: number };
    info: string[];
  };
}

/**
 * Date helpers:
 *   - period.from defaults to "1970-01-01" (i.e. "all time" up to `to`)
 *   - period.to defaults to today
 *   - opening = computeAccountBalance(acct, fromDate − 1 day) (inclusive ≤)
 *   - closing = computeAccountBalance(acct, toDate)
 */
export async function getCashFlowStatement(p: PeriodFilter): Promise<CashFlowStatement> {
  // Normalize: empty string → undefined → fallback default. Throws on malformed.
  const fromIso = normIso(p.from) ?? "1970-01-01";
  const toIso = normIso(p.to) ?? new Date().toISOString().slice(0, 10);
  const from = dayStart(fromIso)!;
  const to = dayEnd(toIso)!;

  // Compute "the day before from" for opening balance asOf parameter.
  const dayBeforeFrom = new Date(from);
  dayBeforeFrom.setDate(dayBeforeFrom.getDate() - 1);
  const dayBeforeFromIso = dayBeforeFrom.toISOString().slice(0, 10);

  const buildTimestampRange = (col: any) => and(gte(col, from), lte(col, to));
  const dateColumnRangeSql = (colName: string) =>
    sql`${sql.raw(colName)} >= ${fromIso} AND ${sql.raw(colName)} <= ${toIso}`;

  // ─── Active cash accounts ────────────────────────────────────────────────
  const accts = await db
    .select()
    .from(cashAccounts)
    .where(eq(cashAccounts.isActive, true))
    .orderBy(cashAccounts.name);

  // ─── Operating section (consolidated, period-scoped) ─────────────────────
  // EXCLUDES legacy payments (see top-of-helper comment).
  const [cpRow, spRow, expRow] = await Promise.all([
    db.select({ s: sql<string>`COALESCE(SUM(${customerPayments.amount}),0)` })
      .from(customerPayments)
      .where(buildTimestampRange(customerPayments.paymentDate)),
    db.select({ s: sql<string>`COALESCE(SUM(${supplierPayments.amount}),0)` })
      .from(supplierPayments)
      .where(buildTimestampRange(supplierPayments.paymentDate)),
    db.execute(sql`
      SELECT COALESCE(SUM(amount::numeric), 0) AS s
      FROM expenses
      WHERE expense_date >= ${fromIso} AND expense_date <= ${toIso}
    `),
  ]);
  const customerPaymentsReceived = Number(cpRow[0]?.s ?? 0);
  const supplierPaymentsMade = Number(spRow[0]?.s ?? 0);
  const operatingExpenses = Number((expRow.rows[0] as any)?.s ?? 0);
  const netOperating = customerPaymentsReceived - supplierPaymentsMade - operatingExpenses;

  // ─── Internal Movements (consolidated) ───────────────────────────────────
  const trResult = await db.execute(sql`
    SELECT COALESCE(SUM(amount::numeric), 0) AS gross, COUNT(*)::int AS cnt
    FROM account_transfers
    WHERE transfer_date >= ${fromIso} AND transfer_date <= ${toIso}
  `);
  const transfersGross = Number((trResult.rows[0] as any)?.gross ?? 0);

  const adjResult = await db.execute(sql`
    SELECT
      reason,
      COALESCE(SUM(adjustment_amount::numeric), 0) AS amount
    FROM balance_adjustments
    WHERE adjustment_date >= ${fromIso} AND adjustment_date <= ${toIso}
    GROUP BY reason
    ORDER BY ABS(SUM(adjustment_amount::numeric)) DESC
  `);
  const adjByReason: CashFlowAdjustmentLine[] = (adjResult.rows as any[]).map(r => ({
    reason: String(r.reason ?? "—"),
    amount: Number(r.amount),
  }));
  const adjustmentsNet = adjByReason.reduce((s, r) => s + r.amount, 0);
  const netInternal = 0 + adjustmentsNet; // transfers always net to 0

  const netChangeInCash = netOperating + netInternal;

  // ─── Per-account inflows/outflows + opening/closing ──────────────────────
  // Per R2: each account sums ALL movements affecting it (including transfer
  // legs and adjustments). Opening + Inflows − Outflows must equal Closing.
  const perAccount: CashFlowAccountLine[] = await Promise.all(
    accts.map(async (acct) => {
      const aid = acct.id;
      const [opening, closing, cpIn, spOut, expOut, trIn, trOut, adjPos, adjNeg] = await Promise.all([
        storage.computeAccountBalance(aid, dayBeforeFromIso),
        storage.computeAccountBalance(aid, toIso),
        // Inflows
        db.execute(sql`
          SELECT COALESCE(SUM(amount::numeric), 0) AS s
          FROM customer_payments
          WHERE cash_account_id = ${aid}
            AND date(payment_date) >= ${fromIso} AND date(payment_date) <= ${toIso}
        `),
        // Outflows
        db.execute(sql`
          SELECT COALESCE(SUM(amount::numeric), 0) AS s
          FROM supplier_payments
          WHERE cash_account_id = ${aid}
            AND date(payment_date) >= ${fromIso} AND date(payment_date) <= ${toIso}
        `),
        db.execute(sql`
          SELECT COALESCE(SUM(amount::numeric), 0) AS s
          FROM expenses
          WHERE cash_account_id = ${aid}
            AND expense_date >= ${fromIso} AND expense_date <= ${toIso}
        `),
        db.execute(sql`
          SELECT COALESCE(SUM(amount::numeric), 0) AS s
          FROM account_transfers
          WHERE to_account_id = ${aid}
            AND transfer_date >= ${fromIso} AND transfer_date <= ${toIso}
        `),
        db.execute(sql`
          SELECT COALESCE(SUM(amount::numeric), 0) AS s
          FROM account_transfers
          WHERE from_account_id = ${aid}
            AND transfer_date >= ${fromIso} AND transfer_date <= ${toIso}
        `),
        db.execute(sql`
          SELECT COALESCE(SUM(adjustment_amount::numeric), 0) AS s
          FROM balance_adjustments
          WHERE cash_account_id = ${aid}
            AND adjustment_amount::numeric > 0
            AND adjustment_date >= ${fromIso} AND adjustment_date <= ${toIso}
        `),
        db.execute(sql`
          SELECT COALESCE(SUM(adjustment_amount::numeric), 0) AS s
          FROM balance_adjustments
          WHERE cash_account_id = ${aid}
            AND adjustment_amount::numeric < 0
            AND adjustment_date >= ${fromIso} AND adjustment_date <= ${toIso}
        `),
      ]);
      const inflows =
        Number((cpIn.rows[0] as any)?.s ?? 0) +
        Number((trIn.rows[0] as any)?.s ?? 0) +
        Number((adjPos.rows[0] as any)?.s ?? 0);
      const outflows =
        Number((spOut.rows[0] as any)?.s ?? 0) +
        Number((expOut.rows[0] as any)?.s ?? 0) +
        Number((trOut.rows[0] as any)?.s ?? 0) +
        Math.abs(Number((adjNeg.rows[0] as any)?.s ?? 0));
      return {
        accountId: aid,
        accountName: acct.name,
        accountType: acct.type as "bank" | "cash",
        opening,
        inflows,
        outflows,
        closing,
        netChange: closing - opening,
      };
    }),
  );

  const totals = perAccount.reduce(
    (acc, a) => ({
      opening: acc.opening + a.opening,
      inflows: acc.inflows + a.inflows,
      outflows: acc.outflows + a.outflows,
      closing: acc.closing + a.closing,
      netChange: acc.netChange + a.netChange,
    }),
    { opening: 0, inflows: 0, outflows: 0, closing: 0, netChange: 0 },
  );

  // ─── Notes: legacy receipts excluded ─────────────────────────────────────
  const legacyResult = await db.execute(sql`
    SELECT COUNT(*)::int AS cnt, COALESCE(SUM(amount::numeric), 0) AS amt
    FROM payments
    WHERE status = 'completed'
      AND cash_account_id IS NULL
      AND payment_date >= ${from.toISOString()} AND payment_date <= ${to.toISOString()}
  `);
  const legacyRow = legacyResult.rows[0] as any;
  const legacyExcl = {
    count: Number(legacyRow?.cnt ?? 0),
    amount: Number(legacyRow?.amt ?? 0),
  };

  const info: string[] = [
    "Direct method. Per-account inflows/outflows include ALL movements (operating + internal).",
    "Transfers shown gross both legs; net contribution to cash = ₹0.",
  ];
  if (legacyExcl.count > 0) {
    info.push(`${legacyExcl.count} legacy receipt(s) totalling ₹${legacyExcl.amount.toLocaleString("en-IN")} excluded — recorded against deprecated payments table without account attribution.`);
  }

  return {
    period: { from: p.from ?? null, to: p.to ?? null },
    operating: {
      customerPaymentsReceived,
      supplierPaymentsMade,
      operatingExpenses,
      netOperating,
    },
    internal: {
      transfersGross,
      transfersNet: 0,
      adjustments: { byReason: adjByReason, net: adjustmentsNet },
      netInternal,
    },
    netChangeInCash,
    perAccount,
    totals,
    notes: { legacyReceiptsExcluded: legacyExcl, info },
  };
}
// ── Shared aging types ────────────────────────────────────────────────────────
export interface AgingSummary {
  totalOutstanding: number;
  current: number;
  days1_30: number;
  days31_60: number;
  days61_90: number;
  days90plus: number;
}

export interface CustomerAgingRow {
  customerId: string;
  customerName: string;
  gstNumber: string | null;
  customerType: string | null;
  totalOutstanding: number;
  current: number;
  days1_30: number;
  days31_60: number;
  days61_90: number;
  days90plus: number;
  oldestInvoiceDate: string | null;
}

export interface CustomerAgingResult {
  asOf: string;
  rows: CustomerAgingRow[];
  summary: AgingSummary;
}

export async function getCustomerAging(asOf?: string, customerId?: string): Promise<CustomerAgingResult> {
  const asOfNorm = normIso(asOf) ?? new Date().toISOString().slice(0, 10);

  const invResult = await db.execute(sql`
    SELECT si.id, si.invoice_date, si.due_date, si.customer_id,
           c.name AS customer_name, c.gst_number, c.customer_type
    FROM sales_invoices si
    JOIN customers c ON c.id = si.customer_id
    WHERE si.status NOT IN ('paid', 'cancelled')
      AND (si.upload_status IS NULL OR si.upload_status <> 'cancelled')
      ${customerId ? sql`AND si.customer_id = ${customerId}` : sql``}
    ORDER BY si.due_date ASC NULLS LAST
  `);

  const customerMap = new Map<string, CustomerAgingRow>();

  for (const row of invResult.rows as any[]) {
    const outstanding = await storage.computeCustomerInvoiceOutstanding(row.id);
    if (outstanding < 0.005) continue;

    const dueDate = row.due_date ? new Date(String(row.due_date) + "T00:00:00") : null;
    let bucket: "current" | "1-30" | "31-60" | "61-90" | "90+" = "current";
    if (dueDate) {
      const asOfMs = new Date(asOfNorm + "T23:59:59").getTime();
      const diffDays = Math.floor((asOfMs - dueDate.getTime()) / 86400000);
      if (diffDays > 0) {
        if (diffDays <= 30) bucket = "1-30";
        else if (diffDays <= 60) bucket = "31-60";
        else if (diffDays <= 90) bucket = "61-90";
        else bucket = "90+";
      }
    }

    const cid = String(row.customer_id);
    if (!customerMap.has(cid)) {
      customerMap.set(cid, {
        customerId: cid,
        customerName: String(row.customer_name),
        gstNumber: row.gst_number ?? null,
        customerType: row.customer_type ?? null,
        totalOutstanding: 0, current: 0, days1_30: 0,
        days31_60: 0, days61_90: 0, days90plus: 0,
        oldestInvoiceDate: null,
      });
    }
    const entry = customerMap.get(cid)!;
    entry.totalOutstanding += outstanding;
    if (bucket === "current") entry.current += outstanding;
    else if (bucket === "1-30") entry.days1_30 += outstanding;
    else if (bucket === "31-60") entry.days31_60 += outstanding;
    else if (bucket === "61-90") entry.days61_90 += outstanding;
    else entry.days90plus += outstanding;

    const invDate = row.invoice_date ? String(row.invoice_date).slice(0, 10) : null;
    if (invDate && (!entry.oldestInvoiceDate || invDate < entry.oldestInvoiceDate)) {
      entry.oldestInvoiceDate = invDate;
    }
  }

  const rows = Array.from(customerMap.values()).sort((a, b) => b.totalOutstanding - a.totalOutstanding);
  const summary = rows.reduce<AgingSummary>(
    (acc, r) => {
      acc.totalOutstanding += r.totalOutstanding;
      acc.current += r.current; acc.days1_30 += r.days1_30;
      acc.days31_60 += r.days31_60; acc.days61_90 += r.days61_90;
      acc.days90plus += r.days90plus;
      return acc;
    },
    { totalOutstanding: 0, current: 0, days1_30: 0, days31_60: 0, days61_90: 0, days90plus: 0 }
  );
  return { asOf: asOfNorm, rows, summary };
}

export interface SupplierAgingRow {
  supplierId: string;
  supplierName: string;
  totalOutstanding: number;
  current: number;
  days1_30: number;
  days31_60: number;
  days61_90: number;
  days90plus: number;
  oldestInvoiceDate: string | null;
}

export interface SupplierAgingResult {
  asOf: string;
  rows: SupplierAgingRow[];
  summary: AgingSummary;
}

export async function getSupplierAging(asOf?: string, supplierId?: string): Promise<SupplierAgingResult> {
  const asOfNorm = normIso(asOf) ?? new Date().toISOString().slice(0, 10);

  const invResult = await db.execute(sql`
    SELECT si.id, si.invoice_date, si.due_date, si.supplier_id,
           s.name AS supplier_name
    FROM supplier_invoices si
    JOIN suppliers s ON s.id = si.supplier_id
    WHERE si.status NOT IN ('paid', 'cancelled')
      AND (si.upload_status IS NULL OR si.upload_status <> 'cancelled')
      ${supplierId ? sql`AND si.supplier_id = ${supplierId}` : sql``}
    ORDER BY si.due_date ASC NULLS LAST
  `);

  const supplierMap = new Map<string, SupplierAgingRow>();

  for (const row of invResult.rows as any[]) {
    const outstanding = await storage.computeSupplierInvoiceOutstanding(row.id);
    if (outstanding < 0.005) continue;

    const dueDate = row.due_date ? new Date(String(row.due_date) + "T00:00:00") : null;
    let bucket: "current" | "1-30" | "31-60" | "61-90" | "90+" = "current";
    if (dueDate) {
      const asOfMs = new Date(asOfNorm + "T23:59:59").getTime();
      const diffDays = Math.floor((asOfMs - dueDate.getTime()) / 86400000);
      if (diffDays > 0) {
        if (diffDays <= 30) bucket = "1-30";
        else if (diffDays <= 60) bucket = "31-60";
        else if (diffDays <= 90) bucket = "61-90";
        else bucket = "90+";
      }
    }

    const sid = String(row.supplier_id);
    if (!supplierMap.has(sid)) {
      supplierMap.set(sid, {
        supplierId: sid,
        supplierName: String(row.supplier_name),
        totalOutstanding: 0, current: 0, days1_30: 0,
        days31_60: 0, days61_90: 0, days90plus: 0,
        oldestInvoiceDate: null,
      });
    }
    const entry = supplierMap.get(sid)!;
    entry.totalOutstanding += outstanding;
    if (bucket === "current") entry.current += outstanding;
    else if (bucket === "1-30") entry.days1_30 += outstanding;
    else if (bucket === "31-60") entry.days31_60 += outstanding;
    else if (bucket === "61-90") entry.days61_90 += outstanding;
    else entry.days90plus += outstanding;

    const invDate = row.invoice_date ? String(row.invoice_date).slice(0, 10) : null;
    if (invDate && (!entry.oldestInvoiceDate || invDate < entry.oldestInvoiceDate)) {
      entry.oldestInvoiceDate = invDate;
    }
  }

  const rows = Array.from(supplierMap.values()).sort((a, b) => b.totalOutstanding - a.totalOutstanding);
  const summary = rows.reduce<AgingSummary>(
    (acc, r) => {
      acc.totalOutstanding += r.totalOutstanding;
      acc.current += r.current; acc.days1_30 += r.days1_30;
      acc.days31_60 += r.days31_60; acc.days61_90 += r.days61_90;
      acc.days90plus += r.days90plus;
      return acc;
    },
    { totalOutstanding: 0, current: 0, days1_30: 0, days31_60: 0, days61_90: 0, days90plus: 0 }
  );
  return { asOf: asOfNorm, rows, summary };
}

// ── T10: Tax Summary GST ──────────────────────────────────────────────────────
export interface TaxSummaryOutputRow {
  invoiceId: string;
  invoiceNumber: string;
  invoiceDate: string;
  customerName: string;
  customerGSTIN: string | null;
  customerType: string;
  isInterState: boolean;
  subtotal: number;
  cgst: number;
  sgst: number;
  igst: number;
  totalTax: number;
  grandTotal: number;
}
export interface TaxSummaryResult {
  period: { from: string | null; to: string | null };
  output: {
    cgst: number; sgst: number; igst: number; totalTax: number;
    subtotal: number; grandTotal: number; invoiceCount: number;
    rows: TaxSummaryOutputRow[];
  };
  input: {
    totalTax: number; subtotal: number; totalAmount: number; invoiceCount: number;
  };
  netTaxLiability: number;
}

export async function getTaxSummary(p: PeriodFilter): Promise<TaxSummaryResult> {
  const from = dayStart(p.from);
  const to = dayEnd(p.to);

  const buildRange = (col: any) => {
    const conds: any[] = [];
    if (from) conds.push(gte(col, from));
    if (to) conds.push(lte(col, to));
    return conds.length ? and(...conds) : undefined;
  };

  const outputResult = await db.execute(sql`
    SELECT
      si.id, si.invoice_number, si.invoice_date::text, si.customer_type,
      si.customer_gstin, si.is_inter_state,
      si.subtotal::numeric AS subtotal,
      si.total_cgst::numeric AS cgst,
      si.total_sgst::numeric AS sgst,
      si.total_igst::numeric AS igst,
      si.total_tax::numeric AS total_tax,
      si.grand_total::numeric AS grand_total,
      COALESCE(c.name, 'Unknown') AS customer_name
    FROM sales_invoices si
    LEFT JOIN customers c ON c.id = si.customer_id
    WHERE si.status <> 'cancelled'
      AND (si.upload_status IS NULL OR si.upload_status <> 'cancelled')
      ${from ? sql`AND si.invoice_date >= ${from}` : sql``}
      ${to ? sql`AND si.invoice_date <= ${to}` : sql``}
    ORDER BY si.invoice_date ASC
  `);

  const outputRows = (outputResult.rows as any[]).map(r => ({
    invoiceId: String(r.id),
    invoiceNumber: String(r.invoice_number ?? "—"),
    invoiceDate: String(r.invoice_date ?? "").slice(0, 10),
    customerName: String(r.customer_name),
    customerGSTIN: r.customer_gstin ?? null,
    customerType: String(r.customer_type ?? "B2C"),
    isInterState: Boolean(r.is_inter_state),
    subtotal: Number(r.subtotal),
    cgst: Number(r.cgst),
    sgst: Number(r.sgst),
    igst: Number(r.igst),
    totalTax: Number(r.total_tax),
    grandTotal: Number(r.grand_total),
  }));

  const outputTotals = outputRows.reduce(
    (acc, r) => { acc.cgst += r.cgst; acc.sgst += r.sgst; acc.igst += r.igst; acc.totalTax += r.totalTax; acc.subtotal += r.subtotal; acc.grandTotal += r.grandTotal; return acc; },
    { cgst: 0, sgst: 0, igst: 0, totalTax: 0, subtotal: 0, grandTotal: 0 }
  );

  const [inputRow] = await db
    .select({
      totalTax: sql<string>`COALESCE(SUM(${supplierInvoices.taxAmount}::numeric),0)`,
      subtotal: sql<string>`COALESCE(SUM(COALESCE(${supplierInvoices.subtotal}::numeric, ${supplierInvoices.totalAmount}::numeric - COALESCE(${supplierInvoices.taxAmount}::numeric,0))),0)`,
      totalAmount: sql<string>`COALESCE(SUM(COALESCE(${supplierInvoices.totalAmount}::numeric,0)),0)`,
      cnt: sql<number>`COUNT(*)::int`,
    })
    .from(supplierInvoices)
    .where(and(
      buildRange(supplierInvoices.invoiceDate),
      ne(supplierInvoices.status, "cancelled"),
      ne(supplierInvoices.uploadStatus, "cancelled"),
    ));

  const inputTax = Number(inputRow?.totalTax ?? 0);
  return {
    period: { from: p.from ?? null, to: p.to ?? null },
    output: { ...outputTotals, invoiceCount: outputRows.length, rows: outputRows },
    input: { totalTax: inputTax, subtotal: Number(inputRow?.subtotal ?? 0), totalAmount: Number(inputRow?.totalAmount ?? 0), invoiceCount: inputRow?.cnt ?? 0 },
    netTaxLiability: outputTotals.totalTax - inputTax,
  };
}

// ── T11: Sales Register ───────────────────────────────────────────────────────
export interface SalesRegisterRow {
  invoiceId: string;
  invoiceNumber: string;
  invoiceDate: string;
  customerName: string;
  customerGSTIN: string | null;
  customerType: string;
  subtotal: number;
  totalTax: number;
  grandTotal: number;
  paidAmount: number;
  outstanding: number;
  status: string;
}
export interface SalesRegisterResult {
  period: { from: string | null; to: string | null };
  rows: SalesRegisterRow[];
  totals: { subtotal: number; totalTax: number; grandTotal: number; paidAmount: number; outstanding: number; count: number };
}

export async function getSalesRegister(p: PeriodFilter, customerId?: string, status?: string): Promise<SalesRegisterResult> {
  const from = dayStart(p.from);
  const to = dayEnd(p.to);

  const result = await db.execute(sql`
    SELECT
      si.id, si.invoice_number, si.invoice_date::text,
      si.customer_type, si.customer_gstin,
      si.subtotal::numeric AS subtotal,
      si.total_tax::numeric AS total_tax,
      si.grand_total::numeric AS grand_total,
      si.credited_amount::numeric AS credited_amount,
      si.status,
      COALESCE(c.name, 'Unknown') AS customer_name,
      COALESCE((
        SELECT SUM(cp.amount::numeric) FROM customer_payments cp WHERE cp.invoice_id = si.id
      ), 0) AS paid_amount
    FROM sales_invoices si
    LEFT JOIN customers c ON c.id = si.customer_id
    WHERE si.status <> 'cancelled'
      AND (si.upload_status IS NULL OR si.upload_status <> 'cancelled')
      ${from ? sql`AND si.invoice_date >= ${from}` : sql``}
      ${to ? sql`AND si.invoice_date <= ${to}` : sql``}
      ${customerId ? sql`AND si.customer_id = ${customerId}` : sql``}
      ${status && status !== "__all__" ? sql`AND si.status = ${status}` : sql``}
    ORDER BY si.invoice_date ASC, si.invoice_number ASC
  `);

  const rows: SalesRegisterRow[] = (result.rows as any[]).map(r => {
    const grandTotal = Number(r.grand_total);
    const paidAmount = Number(r.paid_amount);
    const credited = Number(r.credited_amount ?? 0);
    const outstanding = Math.max(0, grandTotal - paidAmount - credited);
    return {
      invoiceId: String(r.id),
      invoiceNumber: String(r.invoice_number ?? "—"),
      invoiceDate: String(r.invoice_date ?? "").slice(0, 10),
      customerName: String(r.customer_name),
      customerGSTIN: r.customer_gstin ?? null,
      customerType: String(r.customer_type ?? "B2C"),
      subtotal: Number(r.subtotal),
      totalTax: Number(r.total_tax),
      grandTotal,
      paidAmount,
      outstanding,
      status: String(r.status),
    };
  });

  const totals = rows.reduce(
    (acc, r) => { acc.subtotal += r.subtotal; acc.totalTax += r.totalTax; acc.grandTotal += r.grandTotal; acc.paidAmount += r.paidAmount; acc.outstanding += r.outstanding; acc.count++; return acc; },
    { subtotal: 0, totalTax: 0, grandTotal: 0, paidAmount: 0, outstanding: 0, count: 0 }
  );

  return { period: { from: p.from ?? null, to: p.to ?? null }, rows, totals };
}

// ── T12: Purchase Register ────────────────────────────────────────────────────
export interface PurchaseRegisterRow {
  invoiceId: string;
  invoiceNumber: string | null;
  invoiceDate: string;
  supplierName: string;
  subtotal: number;
  taxAmount: number;
  totalAmount: number;
  paidAmount: number;
  outstanding: number;
  status: string;
}
export interface PurchaseRegisterResult {
  period: { from: string | null; to: string | null };
  rows: PurchaseRegisterRow[];
  totals: { subtotal: number; taxAmount: number; totalAmount: number; paidAmount: number; outstanding: number; count: number };
}

export async function getPurchaseRegister(p: PeriodFilter, supplierId?: string, status?: string): Promise<PurchaseRegisterResult> {
  const from = dayStart(p.from);
  const to = dayEnd(p.to);

  const result = await db.execute(sql`
    SELECT
      si.id, si.invoice_number, si.invoice_date::text,
      COALESCE(si.subtotal::numeric, si.total_amount::numeric - COALESCE(si.tax_amount::numeric,0)) AS subtotal,
      si.tax_amount::numeric AS tax_amount,
      COALESCE(si.total_amount::numeric, 0) AS total_amount,
      si.status,
      COALESCE(s.name, 'Unknown') AS supplier_name,
      COALESCE((
        SELECT SUM(sp.amount::numeric) FROM supplier_payments sp WHERE sp.supplier_invoice_id = si.id
      ), 0) AS paid_amount
    FROM supplier_invoices si
    LEFT JOIN suppliers s ON s.id = si.supplier_id
    WHERE si.status <> 'cancelled'
      AND (si.upload_status IS NULL OR si.upload_status <> 'cancelled')
      ${from ? sql`AND si.invoice_date >= ${from}` : sql``}
      ${to ? sql`AND si.invoice_date <= ${to}` : sql``}
      ${supplierId ? sql`AND si.supplier_id = ${supplierId}` : sql``}
      ${status && status !== "__all__" ? sql`AND si.status = ${status}` : sql``}
    ORDER BY si.invoice_date ASC
  `);

  const rows: PurchaseRegisterRow[] = (result.rows as any[]).map(r => {
    const totalAmount = Number(r.total_amount);
    const paidAmount = Number(r.paid_amount);
    const outstanding = Math.max(0, totalAmount - paidAmount);
    return {
      invoiceId: String(r.id),
      invoiceNumber: r.invoice_number ? String(r.invoice_number) : null,
      invoiceDate: String(r.invoice_date ?? "").slice(0, 10),
      supplierName: String(r.supplier_name),
      subtotal: Number(r.subtotal ?? 0),
      taxAmount: Number(r.tax_amount ?? 0),
      totalAmount,
      paidAmount,
      outstanding,
      status: String(r.status),
    };
  });

  const totals = rows.reduce(
    (acc, r) => { acc.subtotal += r.subtotal; acc.taxAmount += r.taxAmount; acc.totalAmount += r.totalAmount; acc.paidAmount += r.paidAmount; acc.outstanding += r.outstanding; acc.count++; return acc; },
    { subtotal: 0, taxAmount: 0, totalAmount: 0, paidAmount: 0, outstanding: 0, count: 0 }
  );

  return { period: { from: p.from ?? null, to: p.to ?? null }, rows, totals };
}

// ── T13: Expense Report ───────────────────────────────────────────────────────
export interface ExpenseReportRow {
  id: string;
  expenseDate: string;
  categoryName: string;
  description: string;
  vendorName: string | null;
  amount: number;
  paymentMethod: string;
  accountName: string | null;
  notes: string | null;
}
export interface ExpenseByCategoryRow {
  categoryId: string | null;
  categoryName: string;
  total: number;
  count: number;
}
export interface ExpenseReportResult {
  period: { from: string | null; to: string | null };
  rows: ExpenseReportRow[];
  byCategory: ExpenseByCategoryRow[];
  grandTotal: number;
}

export async function getExpenseReport(p: PeriodFilter, categoryId?: string, accountId?: string): Promise<ExpenseReportResult> {
  const from = dayStart(p.from);
  const to = dayEnd(p.to);

  const result = await db.execute(sql`
    SELECT
      e.id, e.expense_date::text, e.description, e.vendor_name,
      e.amount::numeric AS amount, e.payment_method, e.notes,
      COALESCE(ec.name, 'Uncategorised') AS category_name,
      ec.id AS category_id,
      COALESCE(ca.name, NULL) AS account_name
    FROM expenses e
    LEFT JOIN expense_categories ec ON ec.id = e.category_id
    LEFT JOIN cash_accounts ca ON ca.id = e.cash_account_id
    WHERE 1=1
      ${from ? sql`AND e.expense_date >= ${from.toISOString().slice(0,10)}` : sql``}
      ${to ? sql`AND e.expense_date <= ${to.toISOString().slice(0,10)}` : sql``}
      ${categoryId && categoryId !== "__all__" ? sql`AND e.category_id = ${categoryId}` : sql``}
      ${accountId && accountId !== "__all__" ? sql`AND e.cash_account_id = ${accountId}` : sql``}
    ORDER BY e.expense_date ASC, e.created_at ASC
  `);

  const rows: ExpenseReportRow[] = (result.rows as any[]).map(r => ({
    id: String(r.id),
    expenseDate: String(r.expense_date ?? "").slice(0, 10),
    categoryName: String(r.category_name),
    description: String(r.description ?? ""),
    vendorName: r.vendor_name ? String(r.vendor_name) : null,
    amount: Number(r.amount),
    paymentMethod: String(r.payment_method ?? "—"),
    accountName: r.account_name ? String(r.account_name) : null,
    notes: r.notes ? String(r.notes) : null,
  }));

  const catMap = new Map<string, ExpenseByCategoryRow>();
  for (const r of rows) {
    const key = r.categoryName;
    if (!catMap.has(key)) catMap.set(key, { categoryId: null, categoryName: key, total: 0, count: 0 });
    const cat = catMap.get(key)!;
    cat.total += r.amount;
    cat.count++;
  }
  const byCategory = Array.from(catMap.values()).sort((a, b) => b.total - a.total);
  const grandTotal = rows.reduce((s, r) => s + r.amount, 0);

  return { period: { from: p.from ?? null, to: p.to ?? null }, rows, byCategory, grandTotal };
}

// ── R3: Cash Position ─────────────────────────────────────────────────────────
export interface CashPositionAccount {
  accountId: string;
  accountName: string;
  accountType: string;
  balance: number;
}
export interface CashPositionResult {
  asOf: string;
  accounts: CashPositionAccount[];
  totalBalance: number;
  totalBank: number;
  totalCash: number;
}

export async function getCashPositionReport(asOf?: string): Promise<CashPositionResult> {
  const asOfNorm = normIso(asOf) ?? new Date().toISOString().slice(0, 10);
  const accountsResult = await db.execute(sql`
    SELECT id, name, account_type FROM cash_accounts ORDER BY account_type, name
  `);
  const accounts: CashPositionAccount[] = [];
  let totalBalance = 0, totalBank = 0, totalCash = 0;
  for (const acct of accountsResult.rows as any[]) {
    const balance = await storage.computeAccountBalance(String(acct.id), asOfNorm);
    const a: CashPositionAccount = {
      accountId: String(acct.id),
      accountName: String(acct.name),
      accountType: String(acct.account_type),
      balance,
    };
    accounts.push(a);
    totalBalance += balance;
    if (a.accountType === "bank") totalBank += balance;
    else totalCash += balance;
  }
  return { asOf: asOfNorm, accounts, totalBalance, totalBank, totalCash };
}

// ── Ledger line type (shared by R4, R5, R6) ───────────────────────────────────
export interface LedgerLine {
  txnDate: string;
  type: string;
  description: string;
  party: string;
  reference: string;
  debit: number;
  credit: number;
  accountId: string;
  accountName: string;
}

// UNION SQL for all 5 transaction sources. accountId = null → all accounts.
async function fetchLedgerLines(accountId: string | null, fromNorm: string, toNorm: string): Promise<LedgerLine[]> {
  const acctFilter = accountId ? sql`AND cp.cash_account_id = ${accountId}` : sql``;
  const acctFilterSP = accountId ? sql`AND sp.cash_account_id = ${accountId}` : sql``;
  const acctFilterE = accountId ? sql`AND e.cash_account_id = ${accountId}` : sql``;
  const acctFilterATFrom = accountId ? sql`AND at2.from_account_id = ${accountId}` : sql``;
  const acctFilterATTo = accountId ? sql`AND at3.to_account_id = ${accountId}` : sql``;
  const acctFilterBA = accountId ? sql`AND ba.cash_account_id = ${accountId}` : sql``;

  const result = await db.execute(sql`
    SELECT
      cp.payment_date::text AS txn_date,
      'Receipt' AS type,
      COALESCE(cp.payment_method, 'Receipt') AS description,
      COALESCE(c.name, '') AS party,
      COALESCE(cp.reference_number, '') AS reference,
      0::numeric AS debit,
      cp.amount::numeric AS credit,
      cp.cash_account_id AS account_id,
      COALESCE(ca1.name, '') AS account_name
    FROM customer_payments cp
    LEFT JOIN sales_invoices si ON si.id = cp.invoice_id
    LEFT JOIN customers c ON c.id = si.customer_id
    LEFT JOIN cash_accounts ca1 ON ca1.id = cp.cash_account_id
    WHERE cp.payment_date BETWEEN ${fromNorm} AND ${toNorm}
      ${acctFilter}

    UNION ALL

    SELECT
      sp.payment_date::text AS txn_date,
      'Payment' AS type,
      COALESCE(sp.payment_method, 'Supplier Payment') AS description,
      COALESCE(s.name, '') AS party,
      COALESCE(sp.reference_number, '') AS reference,
      sp.amount::numeric AS debit,
      0::numeric AS credit,
      sp.cash_account_id AS account_id,
      COALESCE(ca2.name, '') AS account_name
    FROM supplier_payments sp
    LEFT JOIN supplier_invoices siv ON siv.id = sp.supplier_invoice_id
    LEFT JOIN suppliers s ON s.id = siv.supplier_id
    LEFT JOIN cash_accounts ca2 ON ca2.id = sp.cash_account_id
    WHERE sp.payment_date BETWEEN ${fromNorm} AND ${toNorm}
      ${acctFilterSP}

    UNION ALL

    SELECT
      e.expense_date::text AS txn_date,
      'Expense' AS type,
      e.description AS description,
      COALESCE(e.vendor_name, '') AS party,
      '' AS reference,
      e.amount::numeric AS debit,
      0::numeric AS credit,
      e.cash_account_id AS account_id,
      COALESCE(ca3.name, '') AS account_name
    FROM expenses e
    LEFT JOIN cash_accounts ca3 ON ca3.id = e.cash_account_id
    WHERE e.expense_date BETWEEN ${fromNorm} AND ${toNorm}
      ${acctFilterE}

    UNION ALL

    SELECT
      at2.transfer_date::text AS txn_date,
      'Transfer Out' AS type,
      COALESCE(at2.notes, 'Transfer') AS description,
      COALESCE(dest.name, '') AS party,
      COALESCE(at2.reference, '') AS reference,
      at2.amount::numeric AS debit,
      0::numeric AS credit,
      at2.from_account_id AS account_id,
      COALESCE(src2.name, '') AS account_name
    FROM account_transfers at2
    LEFT JOIN cash_accounts dest ON dest.id = at2.to_account_id
    LEFT JOIN cash_accounts src2 ON src2.id = at2.from_account_id
    WHERE at2.transfer_date BETWEEN ${fromNorm} AND ${toNorm}
      ${acctFilterATFrom}

    UNION ALL

    SELECT
      at3.transfer_date::text AS txn_date,
      'Transfer In' AS type,
      COALESCE(at3.notes, 'Transfer') AS description,
      COALESCE(src3.name, '') AS party,
      COALESCE(at3.reference, '') AS reference,
      0::numeric AS debit,
      at3.amount::numeric AS credit,
      at3.to_account_id AS account_id,
      COALESCE(dest3.name, '') AS account_name
    FROM account_transfers at3
    LEFT JOIN cash_accounts src3 ON src3.id = at3.from_account_id
    LEFT JOIN cash_accounts dest3 ON dest3.id = at3.to_account_id
    WHERE at3.transfer_date BETWEEN ${fromNorm} AND ${toNorm}
      ${acctFilterATTo}

    UNION ALL

    SELECT
      ba.adjustment_date::text AS txn_date,
      'Adjustment' AS type,
      ba.reason AS description,
      '' AS party,
      '' AS reference,
      CASE WHEN ba.adjustment_amount::numeric < 0 THEN ABS(ba.adjustment_amount::numeric) ELSE 0 END AS debit,
      CASE WHEN ba.adjustment_amount::numeric >= 0 THEN ba.adjustment_amount::numeric ELSE 0 END AS credit,
      ba.cash_account_id AS account_id,
      COALESCE(ca6.name, '') AS account_name
    FROM balance_adjustments ba
    LEFT JOIN cash_accounts ca6 ON ca6.id = ba.cash_account_id
    WHERE ba.adjustment_date BETWEEN ${fromNorm} AND ${toNorm}
      ${acctFilterBA}

    ORDER BY txn_date ASC, type ASC
  `);

  return (result.rows as any[]).map(r => ({
    txnDate: String(r.txn_date).slice(0, 10),
    type: String(r.type),
    description: String(r.description),
    party: String(r.party),
    reference: String(r.reference),
    debit: Number(r.debit),
    credit: Number(r.credit),
    accountId: String(r.account_id),
    accountName: String(r.account_name),
  }));
}

// ── R4: Account Statement ─────────────────────────────────────────────────────
export interface AccountStatementResult {
  accountId: string;
  accountName: string;
  period: { from: string; to: string };
  openingBalance: number;
  lines: LedgerLine[];
  totalDebit: number;
  totalCredit: number;
  closingBalance: number;
}

export async function getAccountStatement(accountId: string, p: PeriodFilter): Promise<AccountStatementResult> {
  const fromNorm = normIso(p.from) ?? new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);
  const toNorm = normIso(p.to) ?? new Date().toISOString().slice(0, 10);

  const acctResult = await db.execute(sql`SELECT id, name FROM cash_accounts WHERE id = ${accountId}`);
  const acct = (acctResult.rows[0] as any);
  if (!acct) throw new Error(`Cash account ${accountId} not found`);

  // Opening balance = balance as of day before period start
  const dayBefore = new Date(fromNorm + "T00:00:00");
  dayBefore.setDate(dayBefore.getDate() - 1);
  const openingBalance = await storage.computeAccountBalance(accountId, dayBefore.toISOString().slice(0, 10));

  const lines = await fetchLedgerLines(accountId, fromNorm, toNorm);
  const totalDebit = lines.reduce((s, l) => s + l.debit, 0);
  const totalCredit = lines.reduce((s, l) => s + l.credit, 0);
  const closingBalance = openingBalance + totalCredit - totalDebit;

  return {
    accountId,
    accountName: String(acct.name),
    period: { from: fromNorm, to: toNorm },
    openingBalance,
    lines,
    totalDebit,
    totalCredit,
    closingBalance,
  };
}

// ── R5: Consolidated Cash Statement ───────────────────────────────────────────
export interface ConsolidatedCashResult {
  period: { from: string; to: string };
  lines: LedgerLine[];
  totalDebit: number;
  totalCredit: number;
  netChange: number;
}

export async function getConsolidatedCashStatement(p: PeriodFilter): Promise<ConsolidatedCashResult> {
  const fromNorm = normIso(p.from) ?? new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);
  const toNorm = normIso(p.to) ?? new Date().toISOString().slice(0, 10);
  const lines = await fetchLedgerLines(null, fromNorm, toNorm);
  const totalDebit = lines.reduce((s, l) => s + l.debit, 0);
  const totalCredit = lines.reduce((s, l) => s + l.credit, 0);
  return { period: { from: fromNorm, to: toNorm }, lines, totalDebit, totalCredit, netChange: totalCredit - totalDebit };
}

// ── R6: Cash Ledger (per-account running balance) ─────────────────────────────
export interface CashLedgerLine extends LedgerLine {
  runningBalance: number;
}
export interface CashLedgerResult {
  accountId: string;
  accountName: string;
  period: { from: string; to: string };
  openingBalance: number;
  lines: CashLedgerLine[];
  closingBalance: number;
}

export async function getCashLedger(accountId: string, p: PeriodFilter): Promise<CashLedgerResult> {
  const stmt = await getAccountStatement(accountId, p);
  let running = stmt.openingBalance;
  const lines: CashLedgerLine[] = stmt.lines.map(l => {
    running += l.credit - l.debit;
    return { ...l, runningBalance: running };
  });
  return {
    accountId: stmt.accountId,
    accountName: stmt.accountName,
    period: stmt.period,
    openingBalance: stmt.openingBalance,
    lines,
    closingBalance: running,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// Phase 4B — CEO Reports B1–B4
// ═══════════════════════════════════════════════════════════════════════════════

export type Granularity = "daily" | "weekly" | "monthly" | "yearly";

function deriveGranularity(from?: string, to?: string): Granularity {
  if (!from || !to) return "monthly";
  const diffDays = Math.round((new Date(to).getTime() - new Date(from).getTime()) / 86400000);
  if (diffDays <= 31) return "daily";
  if (diffDays <= 180) return "weekly";
  if (diffDays <= 730) return "monthly";
  return "yearly";
}

function bucketLabelSql(col: string, gran: Granularity): string {
  switch (gran) {
    case "daily":   return `TO_CHAR(DATE_TRUNC('day',   ${col}::date), 'DD Mon YYYY')`;
    case "weekly":  return `TO_CHAR(DATE_TRUNC('week',  ${col}::date), 'DD Mon YYYY')`;
    case "monthly": return `TO_CHAR(DATE_TRUNC('month', ${col}::date), 'Mon YYYY')`;
    case "yearly":  return `TO_CHAR(DATE_TRUNC('year',  ${col}::date), 'YYYY')`;
  }
}

function bucketStartSql(col: string, gran: Granularity): string {
  const trunc = gran === "daily" ? "day" : gran === "weekly" ? "week" : gran === "monthly" ? "month" : "year";
  return `DATE_TRUNC('${trunc}', ${col}::date)`;
}

// ── B1: Period Sales ──────────────────────────────────────────────────────────

export interface PeriodSalesBucket {
  period_label: string;
  period_start: string;
  total_sales: number;
  invoice_count: number;
}

export interface PeriodSalesResult {
  buckets: PeriodSalesBucket[];
  summary: { grand_total: number; avg_per_bucket: number; peak_label: string; peak_amount: number };
  period: { from: string | null; to: string | null };
  granularity: Granularity;
}

export async function getPeriodSales(
  from?: string,
  to?: string,
  granularity?: Granularity,
): Promise<PeriodSalesResult> {
  const fromNorm = normIso(from) ?? null;
  const toNorm   = normIso(to)   ?? null;
  const gran = granularity ?? deriveGranularity(fromNorm ?? undefined, toNorm ?? undefined);

  const whereFrom = fromNorm ? sql`AND si.invoice_date >= ${fromNorm + "T00:00:00"}::timestamp` : sql``;
  const whereTo   = toNorm   ? sql`AND si.invoice_date <= ${toNorm   + "T23:59:59.999"}::timestamp` : sql``;

  const res = await db.execute(sql`
    SELECT
      ${sql.raw(bucketLabelSql("si.invoice_date", gran))} AS period_label,
      ${sql.raw(bucketStartSql("si.invoice_date", gran))} AS period_start,
      COALESCE(SUM(si.grand_total::numeric), 0)           AS total_sales,
      COUNT(*)::int                                        AS invoice_count
    FROM sales_invoices si
    WHERE si.status != 'cancelled'
      ${whereFrom}
      ${whereTo}
    GROUP BY period_label, period_start
    ORDER BY period_start ASC
  `);

  const buckets: PeriodSalesBucket[] = (res.rows as any[]).map(r => ({
    period_label:  String(r.period_label),
    period_start:  String(r.period_start),
    total_sales:   Number(r.total_sales),
    invoice_count: Number(r.invoice_count),
  }));

  const grand_total    = buckets.reduce((s, b) => s + b.total_sales, 0);
  const avg_per_bucket = buckets.length ? grand_total / buckets.length : 0;
  const peak = buckets.reduce(
    (best, b) => b.total_sales > best.total_sales ? b : best,
    { period_label: "—", total_sales: 0 } as Pick<PeriodSalesBucket, "period_label" | "total_sales">,
  );

  return {
    buckets,
    summary: { grand_total, avg_per_bucket, peak_label: peak.period_label, peak_amount: peak.total_sales },
    period: { from: fromNorm, to: toNorm },
    granularity: gran,
  };
}

// ── B2: Period Profit ─────────────────────────────────────────────────────────

export interface PeriodProfitBucket {
  period_label: string;
  period_start: string;
  revenue: number;
  purchases: number;
  expenses: number;
  profit: number;
  margin_pct: number | null;
}

export interface PeriodProfitResult {
  buckets: PeriodProfitBucket[];
  summary: { total_revenue: number; total_profit: number; avg_margin_pct: number | null };
  period: { from: string | null; to: string | null };
  granularity: Granularity;
}

export async function getPeriodProfit(
  from?: string,
  to?: string,
  granularity?: Granularity,
): Promise<PeriodProfitResult> {
  const fromNorm = normIso(from) ?? null;
  const toNorm   = normIso(to)   ?? null;
  const gran = granularity ?? deriveGranularity(fromNorm ?? undefined, toNorm ?? undefined);

  const siFrom = fromNorm ? sql`AND si.invoice_date >= ${fromNorm + "T00:00:00"}::timestamp` : sql``;
  const siTo   = toNorm   ? sql`AND si.invoice_date <= ${toNorm   + "T23:59:59.999"}::timestamp` : sql``;
  const supFrom = fromNorm ? sql`AND sup.invoice_date >= ${fromNorm + "T00:00:00"}::timestamp` : sql``;
  const supTo   = toNorm   ? sql`AND sup.invoice_date <= ${toNorm   + "T23:59:59.999"}::timestamp` : sql``;
  const expFrom = fromNorm ? sql`AND e.expense_date >= ${fromNorm}::date` : sql``;
  const expTo   = toNorm   ? sql`AND e.expense_date <= ${toNorm}::date`   : sql``;

  const [revRes, purRes, expRes] = await Promise.all([
    db.execute(sql`
      SELECT
        ${sql.raw(bucketLabelSql("si.invoice_date", gran))} AS period_label,
        ${sql.raw(bucketStartSql("si.invoice_date", gran))} AS period_start,
        COALESCE(SUM(si.grand_total::numeric), 0) AS total
      FROM sales_invoices si
      WHERE si.status != 'cancelled'
        ${siFrom} ${siTo}
      GROUP BY period_label, period_start
    `),
    db.execute(sql`
      SELECT
        ${sql.raw(bucketLabelSql("sup.invoice_date", gran))} AS period_label,
        ${sql.raw(bucketStartSql("sup.invoice_date", gran))} AS period_start,
        COALESCE(SUM(sup.total_amount::numeric), 0) AS total
      FROM supplier_invoices sup
      WHERE sup.upload_status != 'cancelled'
        ${supFrom} ${supTo}
      GROUP BY period_label, period_start
    `),
    db.execute(sql`
      SELECT
        ${sql.raw(bucketLabelSql("e.expense_date", gran))} AS period_label,
        ${sql.raw(bucketStartSql("e.expense_date", gran))} AS period_start,
        COALESCE(SUM(e.amount::numeric), 0) AS total
      FROM expenses e
      WHERE 1=1
        ${expFrom} ${expTo}
      GROUP BY period_label, period_start
    `),
  ]);

  // Merge into a keyed map by period_label, ordering by period_start
  const map = new Map<string, { period_start: string; revenue: number; purchases: number; expenses: number }>();
  for (const r of revRes.rows as any[]) {
    const key = String(r.period_label);
    map.set(key, { period_start: String(r.period_start), revenue: Number(r.total), purchases: 0, expenses: 0 });
  }
  for (const r of purRes.rows as any[]) {
    const key = String(r.period_label);
    const existing = map.get(key) ?? { period_start: String(r.period_start), revenue: 0, purchases: 0, expenses: 0 };
    existing.purchases = Number(r.total);
    map.set(key, existing);
  }
  for (const r of expRes.rows as any[]) {
    const key = String(r.period_label);
    const existing = map.get(key) ?? { period_start: String(r.period_start), revenue: 0, purchases: 0, expenses: 0 };
    existing.expenses = Number(r.total);
    map.set(key, existing);
  }

  const buckets: PeriodProfitBucket[] = Array.from(map.entries())
    .map(([period_label, v]) => {
      const profit = v.revenue - v.purchases - v.expenses;
      const margin_pct = v.revenue > 0 ? (profit / v.revenue) * 100 : null;
      return { period_label, period_start: v.period_start, revenue: v.revenue, purchases: v.purchases, expenses: v.expenses, profit, margin_pct };
    })
    .sort((a, b) => a.period_start.localeCompare(b.period_start));

  const total_revenue = buckets.reduce((s, b) => s + b.revenue, 0);
  const total_profit  = buckets.reduce((s, b) => s + b.profit,  0);
  const withMargin = buckets.filter(b => b.margin_pct !== null);
  const avg_margin_pct = withMargin.length
    ? withMargin.reduce((s, b) => s + (b.margin_pct ?? 0), 0) / withMargin.length
    : null;

  return {
    buckets,
    summary: { total_revenue, total_profit, avg_margin_pct },
    period: { from: fromNorm, to: toNorm },
    granularity: gran,
  };
}

// ── B3: Product Sales ─────────────────────────────────────────────────────────

export interface ProductSalesRow {
  product_id: string;
  product_name: string;
  sku: string;
  category: string;
  qty_sold: number;
  total_sales: number;
  invoice_count: number;
}

export interface ProductSalesResult {
  rows: ProductSalesRow[];
  summary: { total_sales: number; total_qty: number; product_count: number };
  period: { from: string | null; to: string | null };
}

export async function getProductSales(
  from?: string,
  to?: string,
  productId?: string,
): Promise<ProductSalesResult> {
  const fromNorm = normIso(from) ?? null;
  const toNorm   = normIso(to)   ?? null;

  const whereFrom = fromNorm ? sql`AND si.invoice_date >= ${fromNorm + "T00:00:00"}::timestamp` : sql``;
  const whereTo   = toNorm   ? sql`AND si.invoice_date <= ${toNorm   + "T23:59:59.999"}::timestamp` : sql``;
  const whereProduct = productId ? sql`AND p.id = ${productId}` : sql``;

  const res = await db.execute(sql`
    SELECT
      p.id                                                 AS product_id,
      p.name                                               AS product_name,
      p.sku,
      p.category,
      COALESCE(SUM(sii.qty::numeric), 0)                   AS qty_sold,
      COALESCE(SUM(sii.total_amount::numeric), 0)          AS total_sales,
      COUNT(DISTINCT sii.invoice_id)::int                  AS invoice_count
    FROM sales_invoice_items sii
    JOIN sales_invoices si ON si.id = sii.invoice_id
    JOIN products p        ON p.id  = sii.product_id
    WHERE si.status != 'cancelled'
      AND sii.product_id IS NOT NULL
      AND p.type != 'bundle'
      ${whereFrom}
      ${whereTo}
      ${whereProduct}
    GROUP BY p.id, p.name, p.sku, p.category
    ORDER BY total_sales DESC
  `);

  const rows: ProductSalesRow[] = (res.rows as any[]).map(r => ({
    product_id:    String(r.product_id),
    product_name:  String(r.product_name),
    sku:           String(r.sku),
    category:      String(r.category),
    qty_sold:      Number(r.qty_sold),
    total_sales:   Number(r.total_sales),
    invoice_count: Number(r.invoice_count),
  }));

  return {
    rows,
    summary: {
      total_sales:   rows.reduce((s, r) => s + r.total_sales, 0),
      total_qty:     rows.reduce((s, r) => s + r.qty_sold, 0),
      product_count: rows.length,
    },
    period: { from: fromNorm, to: toNorm },
  };
}

// ── B4: Product-wise Profit (FIFO dispatch-time) ──────────────────────────────

async function fifoBlendedCostPerUnit(
  productId: string,
  qty: number,
): Promise<{ costPerUnit: number; hasGrnData: boolean }> {
  if (qty <= 0) return { costPerUnit: 0, hasGrnData: false };

  const res = await db.execute(sql`
    SELECT
      gi.received_quantity::numeric                                                        AS received_qty,
      gi.buying_price::numeric                                                             AS buying_price,
      COALESCE(grn.delivery_cost::numeric, 0)                                              AS delivery_cost,
      GREATEST(
        (SELECT COALESCE(SUM(i2.received_quantity)::numeric, 1)
           FROM goods_receipt_note_items i2
          WHERE i2.grn_id = grn.id),
        1
      )                                                                                    AS total_grn_qty
    FROM goods_receipt_note_items gi
    JOIN goods_receipt_notes grn ON grn.id = gi.grn_id
    WHERE gi.product_id = ${productId}
      AND grn.status = 'confirmed'
    ORDER BY grn.received_date ASC, grn.id ASC
  `);

  if (res.rows.length === 0) return { costPerUnit: 0, hasGrnData: false };

  let remaining  = qty;
  let totalCost  = 0;
  for (const row of res.rows as any[]) {
    if (remaining <= 0) break;
    const lotQty    = Number(row.received_qty);
    const perUnit   = Number(row.buying_price) + Number(row.delivery_cost) / Number(row.total_grn_qty);
    const used      = Math.min(remaining, lotQty);
    totalCost      += used * perUnit;
    remaining      -= used;
  }

  return { costPerUnit: totalCost / qty, hasGrnData: true };
}

export interface ProductWiseProfitRow {
  product_name: string;
  sku: string;
  qty_sold: number;
  revenue: number;
  cost: number;
  gross_profit: number;
  margin_pct: number | null;
  has_grn_data: boolean;
}

export interface ProductWiseProfitResult {
  rows: ProductWiseProfitRow[];
  period: { from: string | null; to: string | null };
}

export async function getProductWiseProfit(
  from?: string,
  to?: string,
): Promise<ProductWiseProfitResult> {
  const fromNorm = normIso(from) ?? null;
  const toNorm   = normIso(to)   ?? null;

  const whereFrom = fromNorm ? sql`AND dc.dispatch_date >= ${fromNorm + "T00:00:00"}::timestamp` : sql``;
  const whereTo   = toNorm   ? sql`AND dc.dispatch_date <= ${toNorm   + "T23:59:59.999"}::timestamp` : sql``;

  const res = await db.execute(sql`
    SELECT
      p.id                                                                    AS product_id,
      p.name                                                                  AS product_name,
      p.sku,
      COALESCE(SUM(dci.qty_dispatched::numeric), 0)                          AS qty_dispatched,
      COALESCE(SUM(dci.qty_dispatched::numeric
                   * COALESCE(dci.unit_price::numeric, 0)), 0)               AS revenue
    FROM delivery_challans dc
    JOIN delivery_challan_items dci ON dci.challan_id = dc.id
    JOIN products p                 ON p.id           = dci.product_id
    WHERE dc.status = 'dispatched'
      AND p.type NOT IN ('bundle', 'service')
      AND dci.qty_dispatched > 0
      ${whereFrom}
      ${whereTo}
    GROUP BY p.id, p.name, p.sku
    ORDER BY revenue DESC
  `);

  const rows: ProductWiseProfitRow[] = await Promise.all(
    (res.rows as any[]).map(async (r) => {
      const qtySold  = Number(r.qty_dispatched);
      const revenue  = Number(r.revenue);
      const { costPerUnit, hasGrnData } = await fifoBlendedCostPerUnit(String(r.product_id), qtySold);
      const cost         = costPerUnit * qtySold;
      const gross_profit = revenue - cost;
      const margin_pct   = hasGrnData && revenue > 0 ? (gross_profit / revenue) * 100 : null;
      return {
        product_name: String(r.product_name),
        sku:          String(r.sku),
        qty_sold:     qtySold,
        revenue,
        cost,
        gross_profit,
        margin_pct,
        has_grn_data: hasGrnData,
      };
    }),
  );

  return {
    rows: rows.sort((a, b) => b.gross_profit - a.gross_profit),
    period: { from: fromNorm, to: toNorm },
  };
}
