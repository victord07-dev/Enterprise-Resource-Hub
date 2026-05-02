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
function dayStart(iso?: string): Date | null {
  if (!iso) return null;
  const d = new Date(iso + "T00:00:00");
  return isNaN(d.getTime()) ? null : d;
}
function dayEnd(iso?: string): Date | null {
  if (!iso) return null;
  const d = new Date(iso + "T23:59:59.999");
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

  // Sales-side overdue:
  //   - status != 'paid' (still owes money, including 'partial_paid')
  //   - uploadStatus != 'cancelled' (lifecycle cancellation)
  //   - amount = grand_total - paid_amount - credited_amount (true outstanding,
  //     not gross — partial-paid invoices were inflated under the old logic)
  const [overdueCustRow] = await db
    .select({
      c: sql<number>`COUNT(*)::int`,
      a: sql<string>`COALESCE(SUM(GREATEST(${salesInvoices.grandTotal} - ${salesInvoices.paidAmount} - ${salesInvoices.creditedAmount}, 0)),0)`,
    })
    .from(salesInvoices)
    .where(and(
      lt(salesInvoices.dueDate, today),
      ne(salesInvoices.status, "paid"),
      ne(salesInvoices.uploadStatus, "cancelled"),
    ));

  // Supplier-side overdue:
  //   - status != 'paid', uploadStatus != 'cancelled'
  //   - amount stays gross (supplier_invoices has no paid_amount column;
  //     payment progress is tracked via supplier_payments aggregation, which
  //     belongs in the AP Aging Report — Phase 4C T9 will deepen this).
  const [overdueSupRow] = await db
    .select({
      c: sql<number>`COUNT(*)::int`,
      a: sql<string>`COALESCE(SUM(${supplierInvoices.totalAmount}),0)`,
    })
    .from(supplierInvoices)
    .where(and(
      lt(supplierInvoices.dueDate, today),
      ne(supplierInvoices.status, "paid"),
      ne(supplierInvoices.uploadStatus, "cancelled"),
    ));

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
    overdueCustomerInvoices: { count: overdueCustRow?.c ?? 0, amount: Number(overdueCustRow?.a ?? 0) },
    overdueSupplierInvoices: { count: overdueSupRow?.c ?? 0, amount: Number(overdueSupRow?.a ?? 0) },
    quotationsExpiringThisWeek: quoteExpRow?.c ?? 0,
  };
}

// ── 🔧 Per-report helpers — implemented in their respective tasks (T7..T16) ──
// These signatures are declared here so route handlers can import them later.
// Each is filled in (with tests) when its report tab is built.

export async function getPLStatement(_p: PeriodFilter): Promise<unknown> {
  throw new Error("getPLStatement not yet implemented (T7)");
}
export async function getCashFlowStatement(_p: PeriodFilter): Promise<unknown> {
  throw new Error("getCashFlowStatement not yet implemented (T8)");
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
