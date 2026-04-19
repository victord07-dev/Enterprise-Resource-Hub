/**
 * Customer Type Migration — Phase 1 of Multi-Brand Catalog
 *
 * Two modes:
 *   --report  : Generates .local/customer-type-mapping.json with current/suggested customerType per customer
 *               for operator review. Operator may edit "suggested" values and "operatorOverride" notes.
 *   --commit  : Reads the same file and applies suggested types in a single transaction.
 *
 * Mapping logic (suggested):
 *   - Most recent sales_invoices.customer_type for the customer
 *     B2B  → dealer
 *     B2C  → end_user
 *     null → end_user
 *   - Operator may override any row before commit by editing the JSON.
 */
import { db } from "../server/db";
import { customers, salesInvoices, customerTypeValues, type CustomerType } from "../shared/schema";
import { sql, eq, desc } from "drizzle-orm";
import { writeFileSync, readFileSync, existsSync } from "fs";

const REPORT_PATH = ".local/customer-type-mapping.json";

type Row = {
  customerId: string;
  name: string;
  current: CustomerType;
  invoiceCustomerTypeHint: string | null;
  suggested: CustomerType;
  outstandingReceivable: number;
  operatorNote?: string;
};

function map(invoiceType: string | null): CustomerType {
  if (invoiceType === "B2B") return "dealer";
  return "end_user";
}

async function buildReport(): Promise<Row[]> {
  const rows = await db.execute(sql`
    SELECT
      c.id,
      c.name,
      c.customer_type AS current,
      (
        SELECT customer_type
        FROM sales_invoices si
        WHERE si.customer_id = c.id
        ORDER BY si.invoice_date DESC
        LIMIT 1
      ) AS invoice_hint,
      COALESCE(
        (SELECT SUM(si.grand_total - si.credited_amount)::float
         FROM sales_invoices si
         WHERE si.customer_id = c.id),
        0
      ) - COALESCE(
        (SELECT SUM(cp.amount)::float
         FROM customer_payments cp
         WHERE cp.customer_id = c.id),
        0
      ) AS outstanding
    FROM customers c
    ORDER BY c.name;
  `);

  return (rows.rows as any[]).map((r) => ({
    customerId: r.id,
    name: r.name,
    current: r.current as CustomerType,
    invoiceCustomerTypeHint: r.invoice_hint,
    suggested: map(r.invoice_hint),
    outstandingReceivable: Number(r.outstanding) || 0,
  }));
}

async function runReport() {
  const report = await buildReport();
  writeFileSync(
    REPORT_PATH,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        totalCustomers: report.length,
        instructions:
          "Review each row's `suggested` value. To override, edit the `suggested` field to one of " +
          customerTypeValues.join(", ") +
          " and optionally add an `operatorNote`. Then run `tsx scripts/migrate-customer-types.ts --commit`.",
        rows: report,
      },
      null,
      2,
    ),
  );
  console.log(`\nReport written to ${REPORT_PATH}`);
  console.log(`Total customers: ${report.length}`);
  console.log(`Suggested distribution:`);
  const dist: Record<string, number> = {};
  for (const r of report) dist[r.suggested] = (dist[r.suggested] || 0) + 1;
  for (const [k, v] of Object.entries(dist)) console.log(`  ${k}: ${v}`);
  console.log(`\nNext: review ${REPORT_PATH}, edit any suggestions, then run --commit.`);
}

async function runCommit() {
  if (!existsSync(REPORT_PATH)) {
    console.error(`Report not found at ${REPORT_PATH}. Run with --report first.`);
    process.exit(1);
  }
  const file = JSON.parse(readFileSync(REPORT_PATH, "utf-8"));
  const rows: Row[] = file.rows;

  for (const r of rows) {
    if (!customerTypeValues.includes(r.suggested)) {
      console.error(`Invalid suggested type for ${r.name}: ${r.suggested}`);
      process.exit(1);
    }
  }

  let updated = 0;
  let unchanged = 0;
  await db.transaction(async (tx) => {
    for (const r of rows) {
      if (r.current === r.suggested) {
        unchanged++;
        continue;
      }
      await tx.update(customers).set({ customerType: r.suggested }).where(eq(customers.id, r.customerId));
      updated++;
    }
  });
  console.log(`\nCommit complete. updated=${updated} unchanged=${unchanged}`);
}

const mode = process.argv[2];
if (mode === "--report") {
  runReport().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
} else if (mode === "--commit") {
  runCommit().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
} else {
  console.error("Usage: tsx scripts/migrate-customer-types.ts --report | --commit");
  process.exit(1);
}
