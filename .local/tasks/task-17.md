---
title: Sales Order GST & Warehouse Reservation
---
# Sales Order GST & Warehouse Reservation

## What & Why
Extend the existing Sales Order system with item-level GST calculation and warehouse-linked reservation. Currently, sales order items carry no tax fields and products have no GST rate or HSN code. Adding these makes the order-to-invoice pipeline GST-compliant, ensures per-item tax breakdowns are stored (not re-derived), and enables warehouse-specific stock views of what is reserved vs available.

## Done looks like
- Products have `gstRate` (0/5/12/18/28%) and `hsnCode` fields, editable in the Products UI
- Creating or editing a Sales Order auto-fills each line item's GST rate and HSN code from the selected product
- Each line item displays: Qty × Unit Price = Item Amount → GST → Item Total
- The order footer shows: Subtotal, Total GST, Grand Total (stored in `subtotal` and `totalTax` columns alongside existing `totalAmount`)
- A Sales Order can be linked to a warehouse; this drives which warehouse's stock is considered reserved
- Inventory view continues to show Total / Reserved / Available correctly, now warehouse-aware when a warehouse is selected on the order
- Existing SO statuses and fulfillment flow are unchanged

## Out of scope
- Delivery challan (existing feature, unchanged)
- Sales invoice / GST return filing
- Customer payments
- CGST/SGST split display (shown at invoice time in task #19 — only total GST stored here)
- Separate Reservation table: the existing dynamic computation (active SO items minus dispatched challan quantities) already works correctly and avoids dual sources of truth; warehouseId on the SO is sufficient to scope reservation queries

## Tasks

1. **Schema: add GST fields to products and SO items** — Add `hsnCode` (text, nullable) and `gstRate` (decimal, default 0) to the `products` table. Add `gstRate`, `hsnCode`, and `taxAmount` (decimal) to `salesOrderItems`. Add `subtotal`, `totalTax` (decimal) and `warehouseId` (varchar, nullable FK to warehouses) to `salesOrders`. Push the schema with `npm run db:push`.

2. **Backend: GST calculation and warehouse linkage** — Update the sales order create/update routes to accept `warehouseId` and compute `taxAmount` per item (`qty × unitPrice × gstRate / 100`), then aggregate `subtotal` (sum of item amounts) and `totalTax` (sum of item tax amounts), setting `totalAmount = subtotal + totalTax`. Update product create/update routes to accept `gstRate` and `hsnCode`. Update the `/api/inventory/reserved-stock` computation to filter by `warehouseId` when present on the SO.

3. **UI: Products — GST fields** — Add a GST Rate select (0 / 5 / 12 / 18 / 28 %) and an HSN Code text input to the Product create/edit dialog. Display these columns in the Products table.

4. **UI: Sales Order — per-item GST and order totals** — In the Sales Order dialog's LineItemsEditor, auto-populate `gstRate` and `hsnCode` when a product is selected. Show per-item columns: Qty, Unit Price, GST %, Tax Amount, Item Total. Add a Warehouse dropdown to the order header. Replace the single "Total" footer with a three-line breakdown: Subtotal, Total GST, Grand Total. Update the expanded order row view to show the same breakdown and the linked warehouse.

## Relevant files
- `shared/schema.ts`
- `server/routes.ts`
- `server/storage.ts`
- `client/src/pages/Sales.tsx`
- `client/src/pages/Products.tsx`
- `client/src/pages/Inventory.tsx`