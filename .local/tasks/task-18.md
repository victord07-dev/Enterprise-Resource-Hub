---
title: Delivery Challan: Dispatch & Stock Deduction
---
# Delivery Challan: Dispatch & Stock Deduction

## What & Why
Enhance the existing delivery challan system to support proper quantity tracking (ordered / reserved / to-dispatch / dispatched), a dedicated "create challan from sales order" flow, partial dispatch handling, transaction-safe stock deduction, and a dispatch summary visible on the Sales Order page.

**Note:** A basic challan system already exists (`delivery_challans`, `delivery_challan_items`, dispatch route, Inventory UI). This task enhances it — do not rebuild from scratch.

## Done looks like
- Sales Order page has a "Create Challan" button on confirmed/ready_to_ship/procurement orders that auto-populates challan items from SO line items with correct quantities
- Only ONE active draft challan is allowed per SO; attempting to create a second draft returns a 409 with the existing draft so the UI can navigate to it
- Multiple dispatched challans per SO are allowed (for partial fulfillment across shipments)
- The challan items view shows four quantity columns: Ordered / Reserved / To Dispatch (editable) / Dispatched
- Dispatch validates: `qtyToDispatch > 0`, `qtyToDispatch ≤ available stock` (re-checked inside the DB transaction), `qtyToDispatch ≤ (qtyReserved − qtyDispatched)` per item
- On dispatch: `qtyDispatched += qtyToDispatch` (cumulative — not overwrite) is persisted on the item; stock deduction uses `qtyToDispatch`; ledger records the DISPATCH movement with a `dispatchBatchId`
- Partial dispatch: dispatching 60 of 100 sets SO status → `partial`; remaining reservation stays active; a second challan can dispatch the rest
- Full dispatch: when cumulative `qtyDispatched` across all challans equals `qtyOrdered` for all SO product items → SO status → `dispatched`
- Status flow: `confirmed → ready_to_ship → partial → dispatched → delivered` (delivered set separately on challan delivery; SO can reach delivered via its own flow)
- Inventory reserved stock recalculates correctly: `reserved = SO qty − total qtyDispatched` (derived, no extra table)
- Sales Order expanded view shows per-product totals: Ordered / Dispatched / Remaining

## Out of scope
- Customer invoice generation (Task #19)
- Customer payments / receipts
- Transport tracking (vehicle, driver, route)
- Challan PDF generation

## Tasks

1. **Schema migration** — Add to `delivery_challan_items`: `qtyOrdered` (decimal, nullable), `qtyReserved` (decimal, nullable), `qtyToDispatch` (decimal, nullable), `qtyDispatched` (decimal, default 0). Add to `delivery_challans`: `customerId` (varchar, nullable), `dispatchBatchId` (varchar, nullable — set on dispatch to a new UUID per dispatch event). Run `npm run db:push`. Update insert schemas and TypeScript types.

2. **Create-from-SO API** — Add `POST /api/delivery-challans/create-from-so/:soId`. Validate SO status is `confirmed`, `ready_to_ship`, or `procurement`. Check for any existing non-cancelled draft challan for the same SO — if found, return `409` with the existing challan in the body (so UI can navigate to it). Otherwise create a new draft challan: copy `customerId` from SO, set `sourceType = 'warehouse'`, `sourceId = SO.warehouseId` (fall back to first available warehouse if null), populate items from SO product line items with `qtyOrdered = SO item qty`, `qtyReserved` derived from the reserved-stock logic, `qtyToDispatch = qtyReserved`, `qtyDispatched = 0`.

3. **PATCH challan items** — Add `PATCH /api/delivery-challans/:id/items` to allow updating `qtyToDispatch` per item while challan is still draft. Validate challan status is `draft` and `qtyToDispatch > 0` for each item.

4. **Enhanced dispatch logic** — Update `POST /api/delivery-challans/:id/dispatch` to: (a) reject if any item has `qtyToDispatch ≤ 0`; (b) inside a DB transaction, re-query current `inventory_stock` to validate `qtyToDispatch ≤ availableStock` (race-condition safe); (c) also validate `qtyToDispatch ≤ (qtyReserved − qtyDispatched)` per item; (d) generate a `dispatchBatchId` (new UUID) and store it on the challan; (e) deduct stock via `addLedgerEntry` using `qtyToDispatch`; (f) update each item with `qtyDispatched = existing_qtyDispatched + qtyToDispatch` (cumulative).

5. **SO status update (partial/dispatched)** — Update `checkAndAdvanceSalesOrderOnChallan` to compute cumulative `qtyDispatched` per product across all non-cancelled challans. If all product items have `cumulative dispatched ≥ qtyOrdered` → set SO status `dispatched`. If some but not all → set SO status `partial`. Do not regress a `dispatched` SO back to `partial`. The status flow is: `confirmed → ready_to_ship → partial → dispatched`; `delivered` is set separately when the challan is marked delivered.

6. **Sales Order page UI** — Add a "Create Challan" button on confirmed/ready_to_ship/procurement SO rows. On 409 response, show toast "A draft challan already exists for this order" and open the Inventory > Challans tab. In the expanded SO row, add a per-product dispatch summary: Ordered / Dispatched / Remaining.

7. **Challan detail UI** — In the Inventory page Challans tab, display challan items with four columns: Ordered / Reserved / To Dispatch (editable number input for draft status) / Dispatched. Wire editable "To Dispatch" input to PATCH on change (debounced or on blur). Keep existing dispatch and deliver buttons.

## Critical implementation rules
- `qtyDispatched += qtyToDispatch` — never overwrite, always accumulate
- Re-validate available stock **inside** the DB transaction before deducting (prevents race conditions)
- One active draft per SO — block creation if draft already exists; multiple dispatched challans are fine
- `qtyToDispatch > 0` must be enforced server-side before any dispatch
- `dispatchBatchId` is a new UUID generated per dispatch event (not per challan)

## Relevant files
- `shared/schema.ts:376-400`
- `shared/schema.ts:549-550`
- `server/routes.ts:67-97`
- `server/routes.ts:204-250`
- `server/routes.ts:2388-2420`
- `server/routes.ts:2523-2574`
- `server/routes.ts:2601-2610`
- `server/storage.ts:986-1019`
- `client/src/pages/Inventory.tsx:206-360`
- `client/src/pages/Inventory.tsx:1230-1840`
- `client/src/pages/Sales.tsx:400-420`
- `client/src/pages/Sales.tsx:1240-1310`