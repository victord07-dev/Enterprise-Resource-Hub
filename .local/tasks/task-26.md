---
title: Task #22 Hardening: Lot Engine — Complete & Corrected
---
# Task #22 Hardening: Lot Engine — Complete & Corrected

  ## What & Why
  The original task #22 (Lot Engine) left several production requirements unimplemented.
  This task closes every gap against the final locked spec. The core FIFO engine
  (computeFifoLots) runs in server/routes.ts and is already partially correct — this task
  extends it to be warehouse-aware, per-product margin-aware, fully logged, and properly
  backed by the missing grn_id column on stock_movements.

  **Cost strategy (MANDATORY — never change):**
  - WAC (product.costPrice) → accounting, AP, financial reports only. Never touch.
  - FIFO (lot engine) → pricing and margin decisions only. Runs in parallel to WAC.

  ## Done looks like
  - GET /api/inventory/stock-lot-summary?productId=&warehouseId= returns correct per-lot
    breakdown (grnId, grnNumber, receivedDate, remainingQty, landedCost, lotFloorPrice)
    plus aggregates (blendedCost, globalFloor, strictFloor). All nulls when stock depleted.
  - Floor prices use each product's own minMarginPct, not a hardcoded global constant.
  - products table has a working minMarginPct (editable) and needsPricingReview (badge) in Products UI.
  - stock_movements.grn_id column exists in the database and dispatch writes actually persist it.
  - daily_price_sheets column is named blendedCost / blended_cost (not blendedInventoryPrice).
  - Every lot engine call logs: productId, warehouseId, movementCount, lotCount,
    blendedCost, globalFloor, strictFloor. Full lot breakdown logged when DEBUG_LOT_ENGINE=true.
  - All four required DB indexes exist.

  ## Out of scope
  - WAC / costPrice logic (do not touch).
  - Pricing workflow UI (tasks #23, #24).
  - Purchase return lot reversal (stub comment already present).
  - Performance caching (TODO comment already present).

  ## Architectural constraints (executor MUST follow — no exceptions)

  ### ID types — varchar everywhere
  Every id, productId, grnId, warehouseId in this codebase is varchar (UUID string).
  Never use integer or number for IDs. The LotDetail interface must use string, not number.

  ### grn_id on stock_movements — THE critical missing piece
  The stock_movements table has no grn_id column today. Without it, the per-lot dispatch
  splitting is silently discarded by Drizzle and the lot engine cannot do exact FIFO.
  Add it in shared/schema.ts exactly as:
    grnId: varchar("grn_id"),   // nullable, no .notNull()
  Then run npm run db:push. This is not optional — it is the difference between an
  approximate system and an exact one.

  ### Column rename — blendedInventoryPrice → blendedCost
  In shared/schema.ts, find blendedInventoryPrice: decimal("blended_inventory_price", ...)
  in the dailyPriceSheets table and rename to blendedCost: decimal("blended_cost", ...).
  After db:push, update ALL references in:
    - server/routes.ts (search blendedInventoryPrice, blended_inventory_price)
    - server/storage.ts
    - client/src/pages/Inventory.tsx
    - client/src/pages/Sales.tsx

  ### Correct field names — do not guess
  GRN item fields (goods_receipt_note_items):
    - receivedQuantity (not quantity, not receivedQty)
    - buyingPrice (not landedCostPerUnit — this field does not exist)
    - Landed cost must be computed: buyingPrice + (grn.deliveryCost / totalGrnQty)

  ### Correct movement type strings — do not invent new ones
  The actual strings used in this codebase:
    - Dispatch / stock out:   "out"
    - Sales return:           "RETURN_IN"
    - GRN receipt:            "in"  with referenceType = "grn"
    - Adjustment in:          "in"  with referenceType = "manual"
    - Adjustment out:         "out" with referenceType = "manual"
  Never use "dispatch", "adjustment_out", "return_out" — those do not exist in the DB.

  ### Correct globalFloor formula
    blendedCost  = SUM(remainingQty × landedCost) / SUM(remainingQty)
    globalFloor  = blendedCost × (1 + minMarginPct / 100)   ← blended cost times margin
    strictFloor  = MAX(lotFloorPrice) across all active lots
  The review that circulated had globalFloor = Math.min(lotFloorPrices) — this is WRONG.

  ### Keep computeFifoLots in server/routes.ts
  The function lives at line ~255 of server/routes.ts, not storage.ts.
  Do not move it. Extend it in place.

  ### DB indexes via Drizzle (not raw SQL)
  Add Drizzle index exports at the bottom of shared/schema.ts:
    index("idx_stock_movements_product_id").on(stockMovements.productId)
    index("idx_stock_movements_grn_id").on(stockMovements.grnId)
    index("idx_stock_movements_created_at").on(stockMovements.createdAt)
    index("idx_grn_items_product_id").on(goodsReceiptNoteItems.productId)

  ## Tasks

  1. **Schema: all column additions + rename + indexes + db:push** —
     In shared/schema.ts: (a) add grnId: varchar("grn_id") to stockMovements,
     (b) add minMarginPct: decimal("min_margin_pct", {precision:5, scale:2}).default("5.00").notNull()
     and ensure needsPricingReview: boolean is already present on products,
     (c) add isPrimary: boolean("is_primary").default(false).notNull() to supplierProducts,
     (d) rename blendedInventoryPrice → blendedCost in dailyPriceSheets,
     (e) add all four Drizzle index exports.
     Run npm run db:push. Then sweep and update every code reference to the renamed column
     across routes.ts, storage.ts, Inventory.tsx, and Sales.tsx.

  2. **Lot engine: per-product margin + warehouse filter + correct field names + logging** —
     Extend computeFifoLots in server/routes.ts to accept an optional warehouseId (varchar)
     parameter and filter stock_movements by warehouse_id when provided. Replace the global
     FLOOR_MARGIN constant with a per-product minMarginPct lookup (fetch from products table
     or accept as parameter to avoid double DB hit). Use the correct field names: receivedQuantity,
     buyingPrice, and compute landedCost as buyingPrice + (deliveryCost / totalGrnQty).
     Filter outbound movements using the actual movement type strings: "out" for dispatch and
     adjustments. Fix globalFloor formula: blendedCost × (1 + minMarginPct/100).
     Add mandatory console.log on every call (productId, warehouseId, movementCount, lotCount,
     blendedCost, globalFloor, strictFloor). Add DEBUG_LOT_ENGINE=true per-lot debug logging.

  3. **Add GET /api/inventory/stock-lot-summary endpoint** —
     In server/routes.ts, add a new authenticated route near line 3480.
     Accept productId (required, varchar) and warehouseId (optional, varchar) as query params.
     Validate productId is present; return 404 if product not found.
     Call computeFifoLots and return: { productId, warehouseId, lots: [...only remainingQty > 0],
     blendedCost, globalFloor, strictFloor } with nulls when all stock is depleted.

  4. **Confirm dispatch transaction wrapping** —
     Find the delivery challan dispatch handler in routes.ts. Verify per-lot stock_movements
     writes are inside a db.transaction(). If not, wrap them. The grn_id column now exists, so
     verify that grnId is included in each insert row so it actually persists.

  5. **Products UI: minMarginPct + needsPricingReview** —
     In client/src/pages/Products.tsx, add an editable minMarginPct number input (0–100,
     step 0.01) to the product create/edit form. Add a read-only needsPricingReview badge
     that appears when the flag is true. Wire both to the existing product API.

  ## Relevant files
  - `shared/schema.ts`
  - `server/routes.ts:253-334`
  - `server/routes.ts:3160-3220`
  - `server/routes.ts:3480-3520`
  - `server/storage.ts`
  - `client/src/pages/Products.tsx`
  - `client/src/pages/Inventory.tsx`
  - `client/src/pages/Sales.tsx:141-148`