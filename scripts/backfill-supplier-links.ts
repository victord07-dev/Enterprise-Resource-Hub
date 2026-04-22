/**
 * Phase 6.5 A4 — Backfill supplier_products links for products that have a brand
 * but no supplier link. For each product:
 *   1. Look up the product's brand name.
 *   2. Find a supplier with the same name (case-insensitive). If none, create one.
 *   3. If supplier_products row already exists, skip. Otherwise insert one with is_primary=true
 *      (per-product — not per-supplier).
 *
 * Pass 2 (idempotent): For every branded product that has supplier_products rows but
 * none with is_primary=true, promote the cheapest existing link to primary.
 *
 * Run with:  tsx scripts/backfill-supplier-links.ts
 *      or:  npx tsx scripts/backfill-supplier-links.ts
 *
 * Idempotent — safe to re-run.
 */
import { db } from "../server/db";
import { sql } from "drizzle-orm";

async function main() {
  // ── Pass 1: create missing supplier links ────────────────────────────────
  const products = (await db.execute(sql`
    SELECT p.id, p.name, p.sku, p.brand_id, p.distributor_price, b.name AS brand_name
    FROM products p
    LEFT JOIN brands b ON b.id = p.brand_id
    LEFT JOIN supplier_products sp ON sp.product_id = p.id
    WHERE sp.id IS NULL AND p.brand_id IS NOT NULL
      AND p.type IN ('product', 'bundle')
  `)).rows as Array<{
    id: string; name: string; sku: string | null; brand_id: string;
    distributor_price: string | null; brand_name: string | null;
  }>;

  console.log(`Pass 1: ${products.length} products missing supplier link (with brand set).`);

  let createdSuppliers = 0;
  let createdLinks = 0;
  let skipped = 0;

  for (const p of products) {
    if (!p.brand_name) {
      console.warn(`Skipping ${p.sku ?? p.id} — orphaned brand_id ${p.brand_id}`);
      skipped++;
      continue;
    }
    const sLower = p.brand_name.toLowerCase();

    // Find or create supplier
    let supplierId: string | null = null;
    const existing = (await db.execute(sql`
      SELECT id FROM suppliers WHERE LOWER(name) = ${sLower} LIMIT 1
    `)).rows[0] as { id: string } | undefined;

    if (existing) {
      supplierId = existing.id;
    } else {
      const created = (await db.execute(sql`
        INSERT INTO suppliers (name) VALUES (${p.brand_name}) RETURNING id
      `)).rows[0] as { id: string };
      supplierId = created.id;
      createdSuppliers++;
      console.log(`  + Created supplier "${p.brand_name}" (${supplierId})`);
    }

    // Insert supplier_products row — always primary for this product since it's the first link
    const dp = p.distributor_price ?? "0";
    await db.execute(sql`
      INSERT INTO supplier_products (supplier_id, product_id, supplier_price, is_primary)
      VALUES (${supplierId}, ${p.id}, ${dp}, true)
    `);
    createdLinks++;
  }

  // ── Pass 2: promote cheapest existing link when no primary exists ─────────
  const promoted = (await db.execute(sql`
    UPDATE supplier_products sp
    SET is_primary = true
    WHERE sp.id IN (
      SELECT DISTINCT ON (sp2.product_id) sp2.id
      FROM supplier_products sp2
      JOIN products p ON p.id = sp2.product_id
      WHERE p.brand_id IS NOT NULL
        AND p.type IN ('product', 'bundle')
        AND NOT EXISTS (
          SELECT 1 FROM supplier_products sp3
          WHERE sp3.product_id = sp2.product_id AND sp3.is_primary = true
        )
      ORDER BY sp2.product_id, sp2.supplier_price ASC NULLS LAST
    )
    RETURNING id
  `)).rows.length;

  console.log("");
  console.log("─── Summary ─────────────────────────────");
  console.log(`Suppliers created       : ${createdSuppliers}`);
  console.log(`Supplier links made     : ${createdLinks}`);
  console.log(`Promoted to primary     : ${promoted}`);
  console.log(`Skipped (no brand)      : ${skipped}`);
  console.log("Done.");
  process.exit(0);
}

main().catch((e) => {
  console.error("Backfill failed:", e);
  process.exit(1);
});
