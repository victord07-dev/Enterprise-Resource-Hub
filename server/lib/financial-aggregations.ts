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
  notes: string[];               // structural notes for header/footer
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
    notes,
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
export async function getCustomerAging(_asOf?: string, _customerId?: string): Promise<unknown> {
  throw new Error("getCustomerAging extension not yet implemented (T9)");
}
export async function getSupplierAging(_asOf?: string, _supplierId?: string): Promise<unknown> {
  throw new Error("getSupplierAging extension not yet implemented (T9)");
}
export async function getTaxSummary(_p: PeriodFilter): Promise<unknown> {
  throw new Error("getTaxSummary not yet implemented (T10)");
}
export async function getSalesRegister(_p: PeriodFilter, _customerId?: string, _status?: string): Promise<unknown> {
  throw new Error("getSalesRegister not yet implemented (T11)");
}
export async function getPurchaseRegister(_p: PeriodFilter, _supplierId?: string, _status?: string): Promise<unknown> {
  throw new Error("getPurchaseRegister not yet implemented (T12)");
}
export async function getExpenseReport(_p: PeriodFilter, _categoryId?: string, _accountId?: string): Promise<unknown> {
  throw new Error("getExpenseReport not yet implemented (T13)");
}
export async function getCashPositionReport(_asOf?: string): Promise<unknown> {
  throw new Error("getCashPositionReport not yet implemented (T14)");
}
export async function getAccountStatement(_accountId: string, _p: PeriodFilter): Promise<unknown> {
  throw new Error("getAccountStatement not yet implemented (T15)");
}
export async function getConsolidatedCashStatement(_p: PeriodFilter): Promise<unknown> {
  throw new Error("getConsolidatedCashStatement not yet implemented (T16)");
}
