/**
 * Phase 4C — Client-side CSV exporters for downloadable reports.
 *
 * Operator-locked CSV format spec (per family):
 *
 *  - STATEMENTS (P&L, Cash Flow, Tax Summary):
 *      Section,Label,Amount
 *
 *  - REGISTERS (Sales Register, Purchase Register, Expense Report):
 *      row-per-transaction with all columns, no subtotal rows, no merged cells
 *
 *  - AGING (AR / AP / Customer / Supplier):
 *      Customer,Current,1-30,31-60,61-90,90+,Total
 *      [per-customer rows]
 *      TOTAL,X,Y,Z,A,B,C
 *
 *  - CASH (Cash Position, Account Statement, Consolidated Cash):
 *      Date,Account,Type,Description,Counterparty,Reference,Debit,Credit,Balance
 *
 * CSV is raw data — no formatting, no symbols, no thousand separators.
 * Tally / Excel pivot tables ingest cleanly without massaging.
 */

export interface CSVRow {
  [key: string]: string | number | null | undefined;
}

/** Escape a single CSV field per RFC 4180 (quote if contains , " \r \n). */
function csvField(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return "";
  const s = typeof v === "number" ? String(v) : String(v);
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/** Build a CSV string from a list of headers and rows. */
export function buildCSV(headers: string[], rows: CSVRow[]): string {
  const out: string[] = [];
  out.push(headers.map(csvField).join(","));
  for (const row of rows) {
    out.push(headers.map((h) => csvField(row[h])).join(","));
  }
  return out.join("\r\n") + "\r\n";
}

/** Trigger a browser download of a CSV blob. */
export function downloadCSV(filename: string, csv: string): void {
  // Add BOM so Excel auto-detects UTF-8
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── P&L Statement CSV (Statement family) ────────────────────────────────────
export interface PLCSVData {
  revenue: { salesRevenue: number; salesReturns: number; netProductRevenue: number };
  cogs: { amount: number; label: string };
  grossProfit: number;
  operatingExpenses: {
    byCategory: { categoryName: string; total: number }[];
    total: number;
  };
  netProfitBeforeTax: number;
}

export function generatePLStatementCSV(d: PLCSVData): string {
  const round = (n: number) => Math.round(n * 100) / 100;
  const rows: CSVRow[] = [
    { Section: "REVENUE", Label: "Sales Revenue (ex-GST)", Amount: round(d.revenue.salesRevenue) },
    { Section: "REVENUE", Label: "Sales Returns", Amount: round(-d.revenue.salesReturns) },
    { Section: "REVENUE", Label: "Net Revenue", Amount: round(d.revenue.netProductRevenue) },
    { Section: "COGS", Label: d.cogs.label, Amount: round(-d.cogs.amount) },
    { Section: "GROSS_PROFIT", Label: "Gross Profit", Amount: round(d.grossProfit) },
    ...d.operatingExpenses.byCategory.map((c) => ({
      Section: "OPEX",
      Label: c.categoryName,
      Amount: round(-c.total),
    })),
    { Section: "OPEX", Label: "Total Operating Expenses", Amount: round(-d.operatingExpenses.total) },
    { Section: "NET_PROFIT", Label: "Net Profit Before Tax", Amount: round(d.netProfitBeforeTax) },
  ];
  return buildCSV(["Section", "Label", "Amount"], rows);
}
