/**
 * Customer Type Migration — Phase 1 of Multi-Brand Catalog (revised)
 *
 * 2-type model: end_user | business
 *
 * Suggested mapping:
 *   - GSTIN present (non-empty)  → business
 *   - GSTIN null/empty           → end_user
 * Operator may override any row before commit.
 *
 * Modes:
 *   --report  : Generates .local/customer-type-mapping.json
 *   --commit  : Applies suggested types in a single transaction
 */
import { db } from "../server/db";
import { customers, customerTypeValues, type CustomerType } from "../shared/schema";
import { sql, eq } from "drizzle-orm";
import { writeFileSync, readFileSync, existsSync } from "fs";

const REPORT_PATH = ".local/customer-type-mapping.json";

type Row = {
  customerId: string;
  name: string;
  gstNumber: string | null;
  current: CustomerType | string;
  suggested: CustomerType;
  outstandingReceivable: number;
  operatorNote?: string;
};

function suggest(gst: string | null): CustomerType {
  return gst && gst.trim().length > 0 ? "business" : "end_user";
}

async function buildReport(): Promise<Row[]> {
  const rows = await db.execute(sql`
    SELECT
      c.id,
      c.name,
      NULLIF(TRIM(c.gst_number), '') AS gst_number,
      c.customer_type AS current,
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
    gstNumber: r.gst_number,
    current: r.current,
    suggested: suggest(r.gst_number),
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
        model: "2-type (end_user | business) — GSTIN-based",
        totalCustomers: report.length,
        instructions:
          "Review each row's `suggested` value. To override, edit the `suggested` field to one of: " +
          customerTypeValues.join(", ") +
          ". Optionally add an `operatorNote`. Then run `tsx scripts/migrate-customer-types.ts --commit`.",
        rows: report,
      },
      null,
      2,
    ),
  );
  console.log(`\nReport written to ${REPORT_PATH}`);
  console.log(`Total customers: ${report.length}`);
  const dist: Record<string, number> = {};
  for (const r of report) dist[r.suggested] = (dist[r.suggested] || 0) + 1;
  console.log(`Suggested distribution:`);
  for (const [k, v] of Object.entries(dist)) console.log(`  ${k}: ${v}`);
  const legacyCount = report.filter((r) => r.current !== "end_user" && r.current !== "business").length;
  if (legacyCount > 0) {
    console.log(`\nNote: ${legacyCount} customer(s) carry a legacy customer_type value that will be reclassified on commit.`);
  }
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
    if (!customerTypeValues.includes(r.suggested as CustomerType)) {
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
      await tx.update(customers).set({ customerType: r.suggested as CustomerType }).where(eq(customers.id, r.customerId));
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
