/**
 * Dedicated seed script for default expense categories.
 *
 * Run with: `npx tsx scripts/seed-expense-categories.ts`
 *
 * This script is the canonical, deployment-safe entry point for seeding the
 * 15 default operational expense categories. It is idempotent — categories
 * are matched by `name` and only inserted when missing. The same routine is
 * also invoked from server bootstrap as a safety net so a fresh deployment
 * is never missing defaults, but operations teams should prefer running
 * this script explicitly as part of their migration/release pipeline.
 */
import { storage } from "../server/storage";

async function main() {
  const inserted = await storage.seedDefaultExpenseCategories();
  console.log(`[seed-expense-categories] inserted=${inserted}`);
  process.exit(0);
}

main().catch((err) => {
  console.error("[seed-expense-categories] failed:", err);
  process.exit(1);
});
