/**
 * Phase 4C T7+T8 — Excel exporters for P&L Statement + Cash Flow Statement.
 *
 * Builds 2-sheet Excel workbooks via shared excel-export.ts wrapper.
 * Both reports use the same letterhead/header block (auto-applied by wrapper).
 *
 * P&L Statement sheets:
 *   1. "Statement"  — flat hierarchy with indented row labels
 *   2. "Opex Detail" — operating expense by category (also flat in sheet 1)
 *
 * Cash Flow Statement sheets:
 *   1. "Statement"  — Operating + Internal sections + Net Change
 *   2. "Per-Account" — full reconciliation table (4 cols × N accounts + total)
 */

import { buildExcelBuffer, type SheetSpec } from "./excel-export";
import type { PLStatement, CashFlowStatement } from "./financial-aggregations";

function periodLabel(from: string | null, to: string | null): string {
  const fmt = (d: string) =>
    new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  return `Period: ${from ? fmt(from) : "—"} → ${to ? fmt(to) : "Today"}`;
}

// ── P&L Statement Excel ──────────────────────────────────────────────────────
export async function exportPLStatementExcel(pl: PLStatement): Promise<Buffer> {
  const subtitle = periodLabel(pl.period.from, pl.period.to);

  // Sheet 1: Statement (flat with indent prefix)
  const statementRows: Array<Record<string, unknown>> = [
    { label: "REVENUE", amount: "" },
    { label: "  Sales Revenue (ex-GST)", amount: pl.revenue.salesRevenue },
    { label: "  Less: Sales Returns", amount: -pl.revenue.salesReturns },
    { label: "  Net Revenue", amount: pl.revenue.netRevenue },
    { label: "", amount: "" },
    { label: pl.cogs.label.toUpperCase(), amount: "" },
    { label: `  Purchases (${pl.cogs.supplierInvoiceCount} supplier invoices)`, amount: -pl.cogs.purchases },
    { label: "", amount: "" },
    { label: "GROSS PROFIT", amount: pl.grossProfit },
    { label: "", amount: "" },
    { label: "OPERATING EXPENSES", amount: "" },
    ...pl.operatingExpenses.byCategory.map((c) => ({
      label: `  ${c.categoryName}`,
      amount: -c.total,
    })),
    { label: "  Total Operating Expenses", amount: -pl.operatingExpenses.total },
    { label: "", amount: "" },
  ];

  const statementSpec: SheetSpec = {
    name: "Statement",
    title: "Profit & Loss Statement",
    subtitle: `${subtitle}  |  ${pl.cogs.label} — see footer for caveat`,
    columns: [
      { header: "Line Item", key: "label", width: 50, type: "text" },
      { header: "Amount (₹)", key: "amount", width: 22, type: "currency" },
    ],
    rows: statementRows,
    totals: { label: "NET PROFIT BEFORE TAX", amount: pl.netProfitBeforeTax },
  };

  // Sheet 2: Opex Detail
  const opexRows = pl.operatingExpenses.byCategory.map((c) => ({
    category: c.categoryName,
    amount: c.total,
    pct: pl.operatingExpenses.total > 0 ? (c.total / pl.operatingExpenses.total) * 100 : 0,
  }));
  const opexSpec: SheetSpec = {
    name: "Opex Detail",
    title: "Operating Expenses by Category",
    subtitle: `${subtitle}  |  ${pl.operatingExpenses.expenseCount} expense records`,
    columns: [
      { header: "Category", key: "category", width: 40, type: "text" },
      { header: "Amount (₹)", key: "amount", width: 22, type: "currency" },
      { header: "% of Opex", key: "pct", width: 14, type: "pct" },
    ],
    rows: opexRows,
    totals: { category: "TOTAL", amount: pl.operatingExpenses.total, pct: 100 },
  };

  return buildExcelBuffer({ sheets: [statementSpec, opexSpec] });
}

// ── Cash Flow Statement Excel ────────────────────────────────────────────────
export async function exportCashFlowStatementExcel(cf: CashFlowStatement): Promise<Buffer> {
  const subtitle = periodLabel(cf.period.from, cf.period.to);

  // Sheet 1: Statement (Operating + Internal sections)
  const stmtRows: Array<Record<string, unknown>> = [
    { label: "OPERATING ACTIVITIES", amount: "" },
    { label: "  Customer Payments Received", amount: cf.operating.customerPaymentsReceived },
    { label: "  Supplier Payments Made", amount: -cf.operating.supplierPaymentsMade },
    { label: "  Operating Expenses", amount: -cf.operating.operatingExpenses },
    { label: "  Net Operating Cash Flow", amount: cf.operating.netOperating },
    { label: "", amount: "" },
    { label: "INTERNAL MOVEMENTS", amount: "" },
    { label: `  Transfers (gross ₹${cf.internal.transfersGross.toFixed(2)} both legs)`, amount: cf.internal.transfersNet },
    ...cf.internal.adjustments.byReason.map((r) => ({
      label: `  Adjustment: ${r.reason}`,
      amount: r.amount,
    })),
    { label: "  Net Internal Movement", amount: cf.internal.netInternal },
    { label: "", amount: "" },
  ];

  const stmtSpec: SheetSpec = {
    name: "Statement",
    title: "Cash Flow Statement (Direct Method)",
    subtitle: subtitle + (cf.notes.legacyReceiptsExcluded.count > 0
      ? `  |  ⚠ ${cf.notes.legacyReceiptsExcluded.count} legacy receipt(s) ₹${cf.notes.legacyReceiptsExcluded.amount.toFixed(2)} excluded (unattributed)`
      : ""),
    columns: [
      { header: "Line Item", key: "label", width: 50, type: "text" },
      { header: "Amount (₹)", key: "amount", width: 22, type: "currency" },
    ],
    rows: stmtRows,
    totals: { label: "NET CHANGE IN CASH", amount: cf.netChangeInCash },
  };

  // Sheet 2: Per-Account reconciliation
  const acctRows = cf.perAccount.map((a) => ({
    account: `${a.accountName} (${a.accountType})`,
    opening: a.opening,
    inflows: a.inflows,
    outflows: a.outflows,
    closing: a.closing,
    netChange: a.netChange,
  }));
  const acctSpec: SheetSpec = {
    name: "Per-Account",
    title: "Per-Account Reconciliation",
    subtitle: `${subtitle}  |  Opening + Inflows − Outflows = Closing  (must hold per row)`,
    columns: [
      { header: "Account", key: "account", width: 32, type: "text" },
      { header: "Opening (₹)", key: "opening", width: 18, type: "currency" },
      { header: "Inflows (₹)", key: "inflows", width: 18, type: "currency" },
      { header: "Outflows (₹)", key: "outflows", width: 18, type: "currency" },
      { header: "Closing (₹)", key: "closing", width: 18, type: "currency" },
      { header: "Net Change (₹)", key: "netChange", width: 18, type: "currency" },
    ],
    rows: acctRows,
    totals: {
      account: "TOTAL",
      opening: cf.totals.opening,
      inflows: cf.totals.inflows,
      outflows: cf.totals.outflows,
      closing: cf.totals.closing,
      netChange: cf.totals.netChange,
    },
  };

  return buildExcelBuffer({ sheets: [stmtSpec, acctSpec] });
}
