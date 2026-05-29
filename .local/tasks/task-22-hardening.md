# Task #22 Hardening: Lot Engine Gaps

## What & Why
The original task #22 (Lot Engine) was partially implemented. The core FIFO
engine (`computeFifoLots`) works and dispatch movement splitting is done, but
several production requirements from the final spec were missed. This task
closes those gaps to bring the lot engine to enterprise-grade standards.

**Cost strategy (MANDATORY — do not change):**
- WAC (`product.costPrice`) → accounting/AP only. Never touch it here.
- FIFO (lot engine) → pricing & margin decisions only. These run in parallel.

## Done looks like
- `GET /api/inventory/stock-lot-summary?productId=&warehouseId=` returns per-lot
  breakdown (grnId, grnNumber, receivedDate, remainingQty, landedCost,
  lotFloorPrice) plus aggregates (blendedCost, globalFloor, strictFloor).
- Floor prices use each product's own `minMarginPct` (not a global 5% constant).
- Products admin page has an editable `minMarginPct` field and a read-only
  `needsPricingReview` badge.
- Column in `daily_price_sheets` is named `blendedCost` (not `blendedInventoryPrice`).
- Every call to the lot engine logs: productId, warehouseId, movementCount,
  lotCount, blendedCost, globalFloor, strictFloor. Full lot breakdown logged
  when `DEBUG_LOT_ENGINE=true`.
- All four required DB indexes are present.

## Out of scope
- Changing WAC / costPrice logic anywhere.
- Pricing workflow UI (task #23/24).
- Purchase return lot reversal (future module stub already exists).
- Performance caching (TODO comment already exists).

## Architectural constraints (executor must follow)
- **Column rename:** `blendedInventoryPrice` / `blended_inventory_price` in
  `daily_price_sheets` must be renamed to `blendedCost` / `blended_cost`.
  After schema change, run `npm run db:push` and update ALL references in
  routes.ts, storage.ts, Inventory.tsx, and Sales.tsx.
- **minMarginPct in floor formulas:** Replace every use of the global
  `FLOOR_MARGIN = 0.05` constant in the lot engine with the product's own
  `minMarginPct / 100`. The product record must be fetched inside
  `computeFifoLots` (or passed as a parameter) to access this value.
- **Warehouse-aware FIFO:** `computeFifoLots` must accept a `warehouseId`
  parameter and filter `stock_movements` by `warehouse_id` when provided.
  All existing callers that don't need warehouse scoping can pass `undefined`
  (no filter = global). Verify that `stock_movements` has a `warehouse_id`
  column before implementing.
- **No partial writes:** Dispatch splitting already exists; confirm it is
  wrapped in a transaction. If not, add `BEGIN / COMMIT / ROLLBACK`.

## Tasks
1. **Schema: add missing columns + rename + indexes** — Add `minMarginPct`
   (decimal 5,2 default 5.00) to products. Add `isPrimary` (boolean default
   false) to supplier_products. Rename `blendedInventoryPrice` →
   `blendedCost` in daily_price_sheets. Add the four required DB indexes
   (product_id on stock_movements, grn_id on stock_movements, created_at on
   stock_movements, product_id on goods_receipt_note_items). Run
   `npm run db:push`. Update all code references to the renamed column.

2. **Lot engine: per-product margin + warehouse filter + logging** — Update
   `computeFifoLots` to (a) accept an optional `warehouseId` and filter
   stock_movements by it, (b) fetch the product's `minMarginPct` and use it
   in all floor price formulas instead of the hardcoded 5% constant, and
   (c) emit the mandatory log on every invocation plus per-lot debug log
   under `DEBUG_LOT_ENGINE=true`.

3. **Add `GET /api/inventory/stock-lot-summary` endpoint** — Expose the lot
   engine as a public API endpoint. Accept `productId` and `warehouseId` as
   query params (productId required). Call `computeFifoLots` and return the
   specified response shape: per-lot array (only lots with remainingQty > 0)
   plus blendedCost / globalFloor / strictFloor aggregates (null if all
   stock depleted). Gate with `authenticateToken`.

4. **Products UI: minMarginPct + needsPricingReview** — Add an editable
   `minMarginPct` number input to the product create/edit form. Add a
   read-only `needsPricingReview` badge that shows when the flag is true.
   Wire to the existing product update API.

## Relevant files
- `shared/schema.ts`
- `server/routes.ts:253-334`
- `server/routes.ts:3480-3520`
- `server/storage.ts`
- `client/src/pages/Products.tsx`
- `client/src/pages/Inventory.tsx`
- `client/src/pages/Sales.tsx:141-148`
