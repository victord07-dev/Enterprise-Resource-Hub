/**
 * Phase 4C T7+T8 — Reconciliation unit test for P&L + Cash Flow helpers.
 *
 * 4 assertions locked by operator:
 *   1. Per-account: closing - opening === inflows - outflows  (each of N accounts)
 *   2. Consolidated: Σ(per-account net change) === Operating_net + Internal_net
 *   3. Transfers contribution to consolidated total === ₹0 exactly
 *   4. Categorization completeness: sum of source-table values in period
 *      (categorized as Operating + Internal) === sum captured in report sections
 *
 * If any assertion fails: surface, don't paper over. Helper is wrong.
 *
 * Run: npx tsx scripts/test-pl-cashflow-helpers.ts
 */

import { getPLStatement, getCashFlowStatement } from "../server/lib/financial-aggregations";
import { db } from "../server/db";
import { sql } from "drizzle-orm";

const TOLERANCE = 0.01; // ₹0.01 floating-point tolerance

function approxEq(a: number, b: number, label: string): { ok: boolean; msg: string } {
  const diff = Math.abs(a - b);
  return {
    ok: diff <= TOLERANCE,
    msg: `${label}: a=${a.toFixed(2)}, b=${b.toFixed(2)}, diff=${diff.toFixed(2)} (tolerance ${TOLERANCE})`,
  };
}

async function runForPeriod(label: string, from: string, to: string) {
  console.log(`\n${"═".repeat(78)}`);
  console.log(`PERIOD: ${label}  [${from} → ${to}]`);
  console.log("═".repeat(78));

  const cf = await getCashFlowStatement({ from, to });
  const pl = await getPLStatement({ from, to });

  console.log("\n── P&L Snapshot ──");
  console.log(`  Sales Revenue           ₹${pl.revenue.salesRevenue.toFixed(2).padStart(14)}`);
  console.log(`  Less: Sales Returns     ₹${pl.revenue.salesReturns.toFixed(2).padStart(14)}  (${pl.revenue.creditNoteCount} CN)`);
  console.log(`  Net Revenue             ₹${pl.revenue.netRevenue.toFixed(2).padStart(14)}`);
  console.log(`  ${pl.cogs.label.padEnd(30)} ₹${pl.cogs.purchases.toFixed(2).padStart(14)}  (${pl.cogs.supplierInvoiceCount} SI)`);
  console.log(`  Gross Profit            ₹${pl.grossProfit.toFixed(2).padStart(14)}`);
  console.log(`  Operating Expenses      ₹${pl.operatingExpenses.total.toFixed(2).padStart(14)}  (${pl.operatingExpenses.byCategory.length} categories)`);
  console.log(`  Net Profit Before Tax   ₹${pl.netProfitBeforeTax.toFixed(2).padStart(14)}`);

  console.log("\n── Cash Flow Snapshot ──");
  console.log(`  Operating: cust IN ₹${cf.operating.customerPaymentsReceived.toFixed(2)} | supp OUT ₹${cf.operating.supplierPaymentsMade.toFixed(2)} | exp OUT ₹${cf.operating.operatingExpenses.toFixed(2)} | net ₹${cf.operating.netOperating.toFixed(2)}`);
  console.log(`  Internal:  transfers gross ₹${cf.internal.transfersGross.toFixed(2)} (net 0) | adjustments net ₹${cf.internal.adjustments.net.toFixed(2)} | net internal ₹${cf.internal.netInternal.toFixed(2)}`);
  console.log(`  Net Change in Cash       ₹${cf.netChangeInCash.toFixed(2)}`);
  console.log(`  Per-account: ${cf.perAccount.length} accts | totals: opening ₹${cf.totals.opening.toFixed(2)} → closing ₹${cf.totals.closing.toFixed(2)} (Δ ₹${cf.totals.netChange.toFixed(2)})`);
  if (cf.notes.legacyReceiptsExcluded.count > 0) {
    console.log(`  ⚠ ${cf.notes.legacyReceiptsExcluded.count} legacy receipt(s) ₹${cf.notes.legacyReceiptsExcluded.amount.toFixed(2)} excluded (no account attribution)`);
  }

  console.log("\n── 4 Reconciliation Assertions ──");

  const failures: string[] = [];

  // ── ASSERTION 1: Per-account opening + inflows − outflows = closing ──────
  console.log("\n  [1] Per-account: closing − opening === inflows − outflows");
  for (const a of cf.perAccount) {
    const lhs = a.closing - a.opening;
    const rhs = a.inflows - a.outflows;
    const r = approxEq(lhs, rhs, `      ${a.accountName.padEnd(30)}`);
    console.log(`      ${r.ok ? "✓" : "✗"} ${a.accountName.padEnd(30)} Δ=${lhs.toFixed(2).padStart(12)}  in−out=${rhs.toFixed(2).padStart(12)}  diff=${(lhs - rhs).toFixed(4)}`);
    if (!r.ok) failures.push(`A1[${a.accountName}]: ${r.msg}`);
  }

  // ── ASSERTION 2: Consolidated Σ(per-account net change) = netOp + netInt ──
  const sumPerAccountNetChange = cf.perAccount.reduce((s, a) => s + a.netChange, 0);
  const a2 = approxEq(sumPerAccountNetChange, cf.netChangeInCash, "  [2] Σ(per-acct Δ) === Operating_net + Internal_net");
  console.log(`\n  [2] ${a2.ok ? "✓" : "✗"} ${a2.msg}`);
  if (!a2.ok) failures.push(`A2: ${a2.msg}`);

  // ── ASSERTION 3: Transfers contribute exactly ₹0 to consolidated ─────────
  const a3 = approxEq(cf.internal.transfersNet, 0, "  [3] transfers.net contribution to consolidated total");
  console.log(`  [3] ${a3.ok ? "✓" : "✗"} ${a3.msg}  (gross=₹${cf.internal.transfersGross.toFixed(2)})`);
  if (!a3.ok) failures.push(`A3: ${a3.msg}`);

  // ── ASSERTION 4: Categorization completeness ─────────────────────────────
  // Sum of source-table movements in period (excluding NULL-account legacy)
  // === Σ(per-account inflows + outflows). If a new movement source is added
  // to the schema and not categorized, this assertion will fail.
  const srcResult = await db.execute(sql`
    SELECT
      (SELECT COALESCE(SUM(amount::numeric), 0) FROM customer_payments
        WHERE date(payment_date) >= ${from} AND date(payment_date) <= ${to}) AS cp,
      (SELECT COALESCE(SUM(amount::numeric), 0) FROM supplier_payments
        WHERE date(payment_date) >= ${from} AND date(payment_date) <= ${to}) AS sp,
      (SELECT COALESCE(SUM(amount::numeric), 0) FROM expenses
        WHERE expense_date >= ${from} AND expense_date <= ${to}) AS exp,
      (SELECT COALESCE(SUM(amount::numeric), 0) FROM account_transfers
        WHERE transfer_date >= ${from} AND transfer_date <= ${to}) AS tr,
      (SELECT COALESCE(SUM(GREATEST(adjustment_amount::numeric, 0)), 0) FROM balance_adjustments
        WHERE cash_account_id IS NOT NULL
        AND adjustment_date >= ${from} AND adjustment_date <= ${to}) AS adj_pos,
      (SELECT COALESCE(SUM(ABS(LEAST(adjustment_amount::numeric, 0))), 0) FROM balance_adjustments
        WHERE cash_account_id IS NOT NULL
        AND adjustment_date >= ${from} AND adjustment_date <= ${to}) AS adj_neg_abs
  `);
  const s = srcResult.rows[0] as any;
  // Expected per-account sums (transfers count BOTH legs, once each):
  const expectedInflows = Number(s.cp) + Number(s.tr) + Number(s.adj_pos);
  const expectedOutflows = Number(s.sp) + Number(s.exp) + Number(s.tr) + Number(s.adj_neg_abs);
  const reportInflows = cf.perAccount.reduce((x, a) => x + a.inflows, 0);
  const reportOutflows = cf.perAccount.reduce((x, a) => x + a.outflows, 0);

  const a4in = approxEq(reportInflows, expectedInflows, "  [4a] Σ(per-acct inflows) === Σ(source inflows)");
  const a4out = approxEq(reportOutflows, expectedOutflows, "  [4b] Σ(per-acct outflows) === Σ(source outflows)");
  console.log(`\n  [4a] ${a4in.ok ? "✓" : "✗"} ${a4in.msg}`);
  console.log(`  [4b] ${a4out.ok ? "✓" : "✗"} ${a4out.msg}`);
  if (!a4in.ok) failures.push(`A4a: ${a4in.msg}`);
  if (!a4out.ok) failures.push(`A4b: ${a4out.msg}`);

  return failures;
}

(async () => {
  const allFailures: string[] = [];

  // Two periods: last 90 days + last FY (Apr 2025 → Mar 2026)
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const ninety = new Date(today); ninety.setDate(today.getDate() - 90);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);

  allFailures.push(...await runForPeriod("Last 90 days", fmt(ninety), fmt(today)));
  allFailures.push(...await runForPeriod("All time (1970→today)", "1970-01-01", fmt(today)));

  console.log(`\n${"═".repeat(78)}`);
  if (allFailures.length === 0) {
    console.log("✅ ALL 4 RECONCILIATION ASSERTIONS PASSED ACROSS BOTH PERIODS");
    console.log("═".repeat(78));
    process.exit(0);
  } else {
    console.log(`❌ ${allFailures.length} ASSERTION FAILURE(S) — helper is wrong, fix before shipping:`);
    allFailures.forEach((f) => console.log(`   • ${f}`));
    console.log("═".repeat(78));
    process.exit(1);
  }
})().catch((err) => {
  console.error("Test crashed:", err);
  process.exit(2);
});
