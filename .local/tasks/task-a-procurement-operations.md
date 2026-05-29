# Procurement Operations Hardening

## What & Why
Complete the stock-in flow by making the "Create GRN" button on the PO row actually create a GRN draft, adding a `partial` PO status for multi-shipment scenarios, enforcing quantity validation so a GRN can never receive more than what remains on the PO, and preventing duplicate draft GRNs per PO.

## Done looks like
- Clicking "Create GRN" on an approved/shipped warehouse PO creates a draft GRN pre-filled with the PO's supplier, warehouse, and line items, then navigates to the Inventory → GRN tab where it is visible
- If a PO already has an open (draft) GRN, clicking "Create GRN" warns the user and prevents creating a second draft for the same PO — it points them to the existing draft instead
- If a PO has been partially received (some GRNs confirmed but not all items fully received), its status shows as `partial`
- When confirming a GRN, the system rejects any item where the received quantity would exceed the remaining unconfirmed quantity on the PO (prevents over-receiving)
- The expanded PO row in Supply Chain shows each line item's ordered quantity alongside total already received from confirmed GRNs and the outstanding balance

## Out of scope
- Supplier invoices and payments (Task B)
- Document/challan file uploads
- 3-way matching

## Tasks
1. **Create GRN from PO API endpoint** — Add `POST /api/grns/create-from-po/:poId` that checks whether the PO already has an open draft GRN (returning a 409 with the existing GRN ID if so), then creates a draft GRN copying the PO's warehouse and all product line items with ordered quantities pre-filled.

2. **Create GRN button in Supply Chain UI** — Replace the non-interactive "Create GRN in Inventory" text hint on the PO row with a real button. On click, call the new endpoint; if a duplicate draft exists, show a toast pointing the user to the existing draft; on success, navigate to Inventory → GRN tab.

3. **Partial PO status** — When a GRN is confirmed, set PO status to `partial` if some items are received but not all, and `received` only when all quantities are fulfilled. Update the PO status badge in Supply Chain to display `partial` distinctly.

4. **GRN over-receive validation** — On GRN confirmation, calculate remaining quantity per product (PO ordered qty minus sum of all previously confirmed GRN items for that product) and reject with a clear per-item error message if any item's received quantity exceeds the remainder.

5. **PO detail received-qty display** — In the expanded PO row, show each line item's ordered qty, total received from confirmed GRNs, and outstanding balance.

## Relevant files
- `client/src/pages/SupplyChain.tsx:1260-1299`
- `server/routes.ts:2538-2570`
- `server/routes.ts:2656-2760`
- `shared/schema.ts`
- `client/src/pages/Inventory.tsx`
