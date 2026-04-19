import { db } from "../server/db";
import { brands } from "../shared/schema";
import { sql } from "drizzle-orm";

const SEED_BRANDS = [
  { name: "Eastman", defaultMarginPct: "10.00", notes: "Solar PCU, batteries, panels" },
  { name: "Luminous", defaultMarginPct: "10.00", notes: "Inverters, PCUs, batteries, panels, SPGS combos" },
  { name: "Adani Solar", defaultMarginPct: "8.00", notes: "Solar panels (ALMM listed)" },
  { name: "Tata Solar", defaultMarginPct: "8.00", notes: "Solar panels (ALMM listed)" },
  { name: "Vikram Solar", defaultMarginPct: "8.00", notes: "Solar panels (ALMM listed)" },
  { name: "Waaree", defaultMarginPct: "8.00", notes: "Solar panels (ALMM listed)" },
];

async function main() {
  let inserted = 0;
  let skipped = 0;
  for (const b of SEED_BRANDS) {
    const result = await db
      .insert(brands)
      .values(b as any)
      .onConflictDoNothing({ target: brands.name })
      .returning({ id: brands.id, name: brands.name });
    if (result.length) {
      console.log(`  + inserted ${result[0].name} (${result[0].id})`);
      inserted++;
    } else {
      console.log(`  = exists ${b.name}`);
      skipped++;
    }
  }
  console.log(`\nDone. inserted=${inserted} skipped=${skipped}`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
