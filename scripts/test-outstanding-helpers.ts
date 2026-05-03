/**
 * Phase 4C unit test — canonical helper agreement.
 * Asserts per-row helpers and set-based helpers agree on the same dataset.
 * Operator-required by FIX 1, decision 1.
 */
import { storage } from "../server/storage";
import { db } from "../server/db";
import { sql } from "drizzle-orm";

(async () => {
  let failed = 0;
  const fail = (msg: string) => { console.error("  ✗ " + msg); failed++; };
  const pass = (msg: string) => console.log("  ✓ " + msg);

  // -- Customer side --
  const sales: any[] = (await db.execute(sql`
    SELECT id, invoice_number, status, upload_status FROM sales_invoices
  `)).rows;
  console.log(`\n[CUSTOMER] ${sales.length} sales invoices`);
  let perRowSum = 0, perRowCount = 0;
  for (const r of sales) {
    if (r.status === "paid" || r.upload_status === "cancelled") continue;
    const v = await storage.computeCustomerInvoiceOutstanding(r.id);
    if (v > 0) { perRowSum += v; perRowCount++; }
  }
  const setBased = await storage.sumOpenCustomerOutstanding();
  console.log(`  per-row open: ${perRowCount} invoices, ₹${perRowSum.toFixed(2)}`);
  console.log(`  set-based   : ${setBased.count} invoices, ₹${setBased.amount.toFixed(2)}`);
  if (perRowCount === setBased.count) pass("counts agree"); else fail(`count drift ${perRowCount} vs ${setBased.count}`);
  if (Math.abs(perRowSum - setBased.amount) < 0.01) pass("amounts agree"); else fail(`amount drift ${perRowSum} vs ${setBased.amount}`);

  // -- Supplier side --
  const supps: any[] = (await db.execute(sql`
    SELECT id, status, upload_status FROM supplier_invoices
  `)).rows;
  console.log(`\n[SUPPLIER] ${supps.length} supplier invoices`);
  let sPerRowSum = 0, sPerRowCount = 0;
  for (const r of supps) {
    if (r.status === "paid" || r.upload_status === "cancelled") continue;
    const v = await storage.computeSupplierInvoiceOutstanding(r.id);
    if (v > 0) { sPerRowSum += v; sPerRowCount++; }
  }
  const sSetBased = await storage.sumOpenSupplierOutstanding();
  console.log(`  per-row open: ${sPerRowCount} invoices, ₹${sPerRowSum.toFixed(2)}`);
  console.log(`  set-based   : ${sSetBased.count} invoices, ₹${sSetBased.amount.toFixed(2)}`);
  if (sPerRowCount === sSetBased.count) pass("counts agree"); else fail(`count drift ${sPerRowCount} vs ${sSetBased.count}`);
  if (Math.abs(sPerRowSum - sSetBased.amount) < 0.01) pass("amounts agree"); else fail(`amount drift ${sPerRowSum} vs ${sSetBased.amount}`);

  // -- Drift surfacing (operator decision 2 / option a) --
  console.log(`\n[STATUS DRIFT — Audit Trail finding]`);
  let drift = 0;
  for (const r of sales) {
    const out = await storage.computeCustomerInvoiceOutstanding(r.id);
    if (r.status === "paid" && out > 0.01) { console.log(`  paid but outstanding ₹${out.toFixed(2)}: ${r.invoice_number}`); drift++; }
    if (r.status === "paid" && out < -0.01) { console.log(`  over-paid ${r.invoice_number}: ₹${(-out).toFixed(2)} excess`); drift++; }
    if ((r.status === "partial_paid") && out > 0 && r.upload_status !== "cancelled") {
      const paid = await db.execute(sql`SELECT COALESCE(SUM(amount::numeric),0) AS s FROM customer_payments WHERE invoice_id = ${r.id}`);
      const credited = await db.execute(sql`SELECT credited_amount::numeric AS c FROM sales_invoices WHERE id = ${r.id}`);
      const p = Number((paid.rows[0] as any).s);
      const c = Number((credited.rows[0] as any).c);
      if (p === 0 && c === 0) { console.log(`  status=partial_paid but no payments + no credits: ${r.invoice_number}`); drift++; }
    }
  }
  for (const r of supps) {
    const out = await storage.computeSupplierInvoiceOutstanding(r.id);
    if ((r.status === "partial_paid") && r.upload_status !== "cancelled") {
      const paid = await db.execute(sql`SELECT COALESCE(SUM(amount::numeric),0) AS s FROM supplier_payments WHERE supplier_invoice_id = ${r.id}`);
      const p = Number((paid.rows[0] as any).s);
      if (p === 0) { console.log(`  supplier status=partial_paid but no payments: ${r.id}`); drift++; }
    }
  }
  console.log(`  total drift rows: ${drift}`);

  console.log(`\n${failed === 0 ? "✅ ALL TESTS PASS" : `❌ ${failed} TEST(S) FAILED`}`);
  process.exit(failed === 0 ? 0 : 1);
})();
