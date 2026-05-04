import { pool } from "../db";
import fs from "fs";
import path from "path";

export interface KitMigrationResult {
  alreadyDone: boolean;
  kitsInserted?: number;
  linksInserted?: number;
  message: string;
}

export async function runKitMigration(): Promise<KitMigrationResult> {
  const client = await pool.connect();
  try {
    const existing = await client.query(
      `SELECT COUNT(*) AS cnt FROM products WHERE type = 'bundle' AND sku LIKE 'ITFI-%'`
    );
    const existingCount = parseInt(existing.rows[0].cnt, 10);
    if (existingCount >= 14) {
      return {
        alreadyDone: true,
        kitsInserted: existingCount,
        message: `Migration already done — ${existingCount} kit products already exist in production.`,
      };
    }

    const sqlFile = path.join(__dirname, "kit-migration.sql");
    const migrationSql = fs.readFileSync(sqlFile, "utf8");

    await client.query(migrationSql);

    const afterKits = await client.query(
      `SELECT COUNT(*) AS cnt FROM products WHERE type = 'bundle' AND sku LIKE 'ITFI-%'`
    );
    const afterLinks = await client.query(
      `SELECT COUNT(*) AS cnt FROM product_bundle_items pbi
       JOIN products p ON p.id = pbi.bundle_product_id
       WHERE p.sku LIKE 'ITFI-%KIT%'`
    );

    const kitsInserted = parseInt(afterKits.rows[0].cnt, 10);
    const linksInserted = parseInt(afterLinks.rows[0].cnt, 10);

    return {
      alreadyDone: false,
      kitsInserted,
      linksInserted,
      message: `Migration complete. ${kitsInserted} kit products + ${linksInserted} bundle component links inserted.`,
    };
  } finally {
    client.release();
  }
}
