/**
 * Phase 4B: Seed default cash/bank accounts and backfill existing
 * customer_payments, supplier_payments, and expenses with cash_account_id.
 *
 * Run with: `npx tsx scripts/seed-cash-accounts.ts`
 *
 * Idempotent — accounts are matched by name; only inserts when missing.
 * Backfill: cash-method records → CEO Cash, bank/other → HDFC Bank.
 * Safe to run multiple times.
 */

import { db } from "../server/db";
import { sql } from "drizzle-orm";

const DEFAULT_ACCOUNTS = [
  { name: "HDFC Bank", type: "bank", bankName: "HDFC Bank", accountNumber: null, ifscCode: null, openingBalance: "0" },
  { name: "ICICI Bank", type: "bank", bankName: "ICICI Bank", accountNumber: null, ifscCode: null, openingBalance: "0" },
  { name: "AXIS Bank", type: "bank", bankName: "AXIS Bank", accountNumber: null, ifscCode: null, openingBalance: "0" },
  { name: "CEO Cash", type: "cash", bankName: null, accountNumber: null, ifscCode: null, openingBalance: "0" },
] as const;

async function main() {
  console.log("[seed-cash-accounts] Starting...");

  // 1. Seed accounts (idempotent by name)
  let inserted = 0;
  const accountIds: Record<string, string> = {};

  for (const acct of DEFAULT_ACCOUNTS) {
    const existing = await db.execute(
      sql`SELECT id FROM cash_accounts WHERE name = ${acct.name} LIMIT 1`
    );
    if (existing.rows.length > 0) {
      accountIds[acct.name] = existing.rows[0].id as string;
      console.log(`[seed-cash-accounts] Already exists: ${acct.name} (id=${accountIds[acct.name]})`);
    } else {
      const result = await db.execute(
        sql`INSERT INTO cash_accounts (name, type, bank_name, account_number, ifsc_code, opening_balance, is_active)
            VALUES (${acct.name}, ${acct.type}, ${acct.bankName}, ${acct.accountNumber}, ${acct.ifscCode}, ${acct.openingBalance}, true)
            RETURNING id`
      );
      accountIds[acct.name] = result.rows[0].id as string;
      inserted++;
      console.log(`[seed-cash-accounts] Inserted: ${acct.name} (id=${accountIds[acct.name]})`);
    }
  }

  console.log(`[seed-cash-accounts] Accounts seeded: ${inserted} new, ${DEFAULT_ACCOUNTS.length - inserted} already existed`);

  const hdfcId = accountIds["HDFC Bank"];
  const ceoCashId = accountIds["CEO Cash"];

  // 2. Backfill customer_payments (uses column `method`)
  const cpResult = await db.execute(sql`
    UPDATE customer_payments
    SET cash_account_id = CASE
      WHEN method = 'cash' THEN ${ceoCashId}
      ELSE ${hdfcId}
    END
    WHERE cash_account_id IS NULL
  `);
  console.log(`[seed-cash-accounts] customer_payments backfilled: ${cpResult.rowCount} rows`);

  // 3. Backfill supplier_payments (uses column `payment_method`)
  const spResult = await db.execute(sql`
    UPDATE supplier_payments
    SET cash_account_id = CASE
      WHEN payment_method = 'cash' THEN ${ceoCashId}
      ELSE ${hdfcId}
    END
    WHERE cash_account_id IS NULL
  `);
  console.log(`[seed-cash-accounts] supplier_payments backfilled: ${spResult.rowCount} rows`);

  // 4. Backfill expenses (uses column `payment_method`)
  const expResult = await db.execute(sql`
    UPDATE expenses
    SET cash_account_id = CASE
      WHEN payment_method = 'cash' THEN ${ceoCashId}
      ELSE ${hdfcId}
    END
    WHERE cash_account_id IS NULL
  `);
  console.log(`[seed-cash-accounts] expenses backfilled: ${expResult.rowCount} rows`);

  // 5. Verification: report any remaining NULLs
  const cpNull = await db.execute(sql`SELECT COUNT(*) AS c FROM customer_payments WHERE cash_account_id IS NULL`);
  const spNull = await db.execute(sql`SELECT COUNT(*) AS c FROM supplier_payments WHERE cash_account_id IS NULL`);
  const expNull = await db.execute(sql`SELECT COUNT(*) AS c FROM expenses WHERE cash_account_id IS NULL`);

  console.log(`[seed-cash-accounts] Verification — remaining NULLs:`);
  console.log(`  customer_payments: ${cpNull.rows[0].c}`);
  console.log(`  supplier_payments: ${spNull.rows[0].c}`);
  console.log(`  expenses: ${expNull.rows[0].c}`);

  console.log("[seed-cash-accounts] Done.");
  process.exit(0);
}

main().catch((err) => {
  console.error("[seed-cash-accounts] FAILED:", err);
  process.exit(1);
});
