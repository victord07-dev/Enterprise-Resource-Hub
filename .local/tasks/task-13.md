---
title: Inventory Ledger Hardening & Traceability
---
# Inventory Ledger Hardening & Traceability

## What & Why
The inventory system already has the right structure (stock_movements as ledger + inventory_stock as snapshot), but it has two critical production risks: stock updates are not wrapped in database transactions (meaning a mid-operation failure can cause permanent mismatches between the ledger and snapshot), and the same update logic is copy-pasted in 4 separate places in routes.ts (GRN confirm, challan dispatch, manual adjustment, direct PO delivery). This task hardens the system and adds clickable traceability to the UI.

## Done looks like
- All inventory-changing operations (GRN confirm, challan dispatch, manual adjustment, direct PO delivery) execute atomically — if any step fails, the entire operation rolls back with no partial data saved
- Weighted Average Cost recalculation is also inside the same transaction as the GRN stock update
- A single central `addLedgerEntry()` function handles all stock movement creation + snapshot update; all 4 flows call this instead of duplicating logic
- In the Inventory module, the stock movements list shows each entry with a clickable reference — clicking a GRN reference navigates to that GRN's detail view; clicking a Challan reference navigates to that Challan's detail view; adjustment entries show a simple info modal
- A `GET /api/inventory/ledger` endpoint exists with optional query filters: `productId`, `warehouseId`, `type` (grn / dispatch / adjustment)

## Out of scope
- Reservation system / reserved stock calculation changes (future task)
- Serial number or warranty tracking
- Costing changes beyond ensuring WAC is inside the transaction
- New schema tables (no schema changes needed — existing tables are sufficient)

## Tasks
1. **Add DB transactions to all 4 stock-changing flows** — Wrap GRN confirm, challan dispatch, manual stock adjustment, and direct PO delivery each in a `db.transaction()` block so that ledger insert + snapshot update + any costing update are atomic.

2. **Create central `addLedgerEntry()` service function** — Extract the repeated stock-movement insert + inventory snapshot update logic into one shared function inside `server/routes.ts` (or a new `server/inventory-service.ts`). Ensure WAC recalculation for GRN is also performed inside this transaction scope.

3. **Refactor all 4 flows to use the central service** — Remove the duplicated inline logic from GRN confirm, challan dispatch, manual adjustment, and direct PO delivery, and replace with calls to `addLedgerEntry()`.

4. **Add `GET /api/inventory/ledger` endpoint** — Returns stock movements with optional `productId`, `warehouseId`, and `type` query filters. Joins product and warehouse names for display.

5. **Wire up clickable ledger references in the Inventory UI** — In the stock movements / ledger list, make the reference column clickable: GRN references navigate to the GRN detail view, Challan references navigate to the Challan detail view, and manual adjustments open a simple info modal showing notes/reason.

## Relevant files
- `server/routes.ts:1950-1958`
- `server/routes.ts:2130-2155`
- `server/routes.ts:2320-2369`
- `server/routes.ts:2552-2654`
- `server/routes.ts:2710-2730`
- `shared/schema.ts:354-367`
- `client/src/pages/Inventory.tsx`