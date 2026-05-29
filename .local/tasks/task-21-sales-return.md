# Sales Return (GST + Credit Note + Ledger + AR)

## What & Why
Allow customers to return goods against dispatched sales invoices. Each return
reverses stock (via the inventory ledger), generates a GST-compliant credit
note, and adjusts the invoice's outstanding balance — keeping accounts
receivable and the inventory ledger audit-ready and accurate.

## Done looks like
- "Create Return" button appears on each dispatched (non-cancelled) sales invoice
- Return form pre-populates all product line items with Sold / Already Returned / Return Qty columns; user selects a returnType and enters quantities
- Validation prevents returning more than remaining returnable qty per item; service-type products are blocked server-side
- On processing the return (atomic transaction — ledger + credit note + invoice update all in one):
  - Stock added back via ledger: `movementType="RETURN_IN"`, `referenceType="SALES_RETURN"` — only for stock-tracked products
  - Credit note generated with sequential `CN-YYYY-NNNN` numbering per financial year, with CGST+SGST (intra-state) or IGST (inter-state) splits matching the original invoice's `isInterState` flag
  - Invoice `creditedAmount` increases; `netOutstanding = grandTotal - paidAmount - creditedAmount` recomputed; status set to "paid" when netOutstanding ≤ 0, otherwise "partial_paid" or "pending"
  - Return status transitions from "draft" → "processed"; re-processing a non-draft return returns 409
- Sales Returns list visible in the Sales Invoices page; Credit Notes tab added to Accounts page
- Attachments (return photos, damaged goods proof) via existing attachments system: `entityType="sales_return"`, `documentType="return_proof"` or `"customer_doc"`
- Partial returns supported: multiple returns per invoice, each deducting from remaining returnable qty
- Audit log entries created for `created` and `processed` actions on `entityType="sales_return"`

## Out of scope
- Cash refunds / bank transfers to the customer
- Warranty / repair workflows
- Service line items are explicitly blocked (not returned)

## Tasks

1. **Schema** — Add `sales_returns`, `sales_return_items`, and `credit_notes` tables. `sales_returns` includes: `returnNumber`, `invoiceId`, `challanId`, `soId`, `customerId`, `warehouseId`, `status: "draft"|"processed"`, `returnType: "damage"|"excess"|"customer_rejection"`, `reason`, `returnDate`, `createdBy`, `createdAt`. `sales_return_items` mirrors invoice items with `qtySold`, `qtyAlreadyReturned`, `qtyReturned` columns plus per-item GST fields (`hsnCode`, `gstRate`, `taxableAmount`, `cgst`, `sgst`, `igst`, `taxAmount`, `totalAmount`). `credit_notes` includes: `creditNoteNumber`, `invoiceId`, `salesReturnId`, `customerId`, `isInterState`, `subtotal`, `totalCgst`, `totalSgst`, `totalIgst`, `taxAmount`, `grandTotal`, `status: "issued"|"adjusted"`. Add `creditedAmount decimal` column to existing `salesInvoices` table. Export insert schemas and inferred types for all three new tables.

2. **Storage methods** — Add CRUD to `IStorage` + `DatabaseStorage` for sales returns (`createSalesReturn`, `getSalesReturn`, `getSalesReturnsByInvoice`, `getSalesReturns`), return items (`createSalesReturnItem`, `getSalesReturnItems`), and credit notes (`createCreditNote`, `getCreditNotes`, `getCreditNotesByInvoice`). Add a helper that recomputes `netOutstanding = grandTotal - sum(customer_payments) - creditedAmount` and writes `creditedAmount` + `status` back to the invoice.

3. **Backend routes** — Implement the following:
   - `POST /api/sales-returns/create-from-invoice/:invoiceId` — fetch invoice and its items; skip service-type products; compute `qtyAlreadyReturned` from prior processed returns; create a draft return + items with `qtyReturned=0`.
   - `PATCH /api/sales-returns/:id` — update `reason`, `returnDate`, `returnType`, and per-item `qtyReturned` on a draft return.
   - `POST /api/sales-returns/:id/process` — single atomic DB transaction: (a) verify status is "draft" (409 otherwise); (b) validate `qtyReturned ≤ qtySold − qtyAlreadyReturned` and `> 0` for at least one item; (c) skip service items and non-stock-tracked products for ledger; (d) insert `stock_movements` with `movementType="RETURN_IN"`, `referenceType="SALES_RETURN"` per eligible product; (e) compute credit note totals with correct GST split; (f) insert credit note with `CN-{FY}-{seq}` numbering; (g) update invoice `creditedAmount` and recompute status; (h) mark return "processed"; (i) write audit log for both `created` and `processed` events.
   - `GET /api/sales-returns` and `GET /api/credit-notes` — list endpoints with customer name join.

4. **Sales Invoices UI** — Add "Create Return" button to each expanded invoice row in `SalesInvoices.tsx` (hidden if invoice is cancelled or has no product items). Build a `SalesReturnDialog` (same file) showing a Return Type selector, per-item table (Sold / Already Returned / Return Qty inputs), a live summary footer (Subtotal / GST Reversal / Total Credit), a Reason field, and a Process button. After processing, show `AttachmentsPanel` (entityType="sales_return") and display the credit note number inline on the invoice.

5. **Accounts UI** — Add a "Credit Notes" tab to `Accounts.tsx` listing all credit notes (CN Number / Invoice / Customer / Date / Subtotal / GST / Total / Status). Update AR summary cards to factor in `creditedAmount` so outstanding totals remain consistent.

## Critical implementation constraints
- `movementType` must be the string `"RETURN_IN"` (not generic `"in"`) to distinguish from GRN and manual inbound movements
- Service items (`product.type === "service"`) must be rejected server-side in the process endpoint
- Non-stock-tracked products must skip the ledger entry but still appear on the credit note
- The entire process endpoint (ledger + credit note + invoice update) must run inside one DB transaction — no partial commits
- Invoice status uses only the existing three values (`pending`, `partial_paid`, `paid`); `creditedAmount` is tracked separately and subtracted when computing outstanding

## Relevant files
- `shared/schema.ts`
- `server/storage.ts`
- `server/routes.ts`
- `client/src/pages/SalesInvoices.tsx`
- `client/src/pages/Accounts.tsx`
- `client/src/components/AttachmentsPanel.tsx`
