---
title: Supplier Invoice & Payment Module (Accounts Payable)
---
# Supplier Invoice & Payment Module (Accounts Payable)

## What & Why
Add the Accounts Payable layer to the Accounts module — supplier invoices, supplier payments (advance and regular), balance calculation, and payment validation. Currently Accounts only handles the customer (receivable) side. This adds the supplier (payable) side so the accounts team can record what the business owes and track settlement.

## Done looks like
- A "Supplier Invoices" tab in Accounts shows all supplier invoices with columns for supplier, invoice number, date, due date, total, paid, balance, and status (Pending / Partial Paid / Paid)
- A "Supplier Payments" tab shows all payments (advance and regular) with type, method, date, and amount
- Creating a supplier invoice requires linking a supplier, PO, and GRN; entering invoice number, date, amounts, and payment terms (Immediate / 30 Days / 60 Days) with due date auto-calculated; duplicate invoice numbers for the same supplier are rejected
- An advance payment can be recorded directly against a PO before any invoice exists; when an invoice is created for that PO, the advance is shown and deducted from the balance automatically
- Recording a payment is rejected if the payment amount exceeds the current invoice balance (no overpayment)
- Invoice status auto-updates: balance = 0 → Paid; partial payments → Partial Paid; no payments → Pending
- The PO record stores `advancePaid` so advance totals are always available without recalculating from payments

## Out of scope
- AP Aging report (Task C)
- 3-way matching (future)
- Document/PDF uploads
- Locking PO/GRN editing after invoice (future refinement)
- Existing customer-facing invoices and payments tabs (unchanged)

## Tasks
1. **Schema — supplier invoices, payments, and PO advance field** — Add `supplier_invoices` table (supplierId, poId, grnId, invoiceNumber, invoiceDate, subtotal, taxAmount, totalAmount, paymentTerms, dueDate, status, notes) and `supplier_payments` table (supplierInvoiceId, poId, supplierId, amount, paymentType advance/regular, paymentMethod, paymentDate, reference) to `shared/schema.ts`. Add `advancePaid` decimal field to `purchase_orders`. Apply via `npm run db:push`.

2. **Backend API — supplier invoices** — Add CRUD endpoints for supplier invoices. On create, enforce unique `invoiceNumber + supplierId` (return 409 if duplicate). Auto-calculate `dueDate` from `invoiceDate + paymentTerms` on the server. On any payment write, recompute and persist invoice status (pending / partial_paid / paid).

3. **Backend API — supplier payments** — Add CRUD endpoints for supplier payments. On create, validate that the payment amount does not exceed the current invoice balance (invoiceTotal − advancePaid − existingPayments); reject with a clear error if exceeded. When `paymentType` is `advance`, update `purchase_orders.advancePaid` for the linked PO.

4. **Supplier Invoices tab UI** — Add a "Supplier Invoices" tab to the Accounts page with a summary header (total payable / total paid / total overdue) and a data table. Include a "New Supplier Invoice" dialog: supplier dropdown, PO selector (filtered to that supplier), GRN selector (filtered to confirmed GRNs for that PO), invoice fields, payment terms selector with auto-filled due date preview.

5. **Supplier Payments tab UI** — Add a "Supplier Payments" tab with a "Record Payment" dialog. Advance type links to a PO only; regular type requires an invoice selection. Show invoice balance (after advance deduction) before confirming. Recorded payments update the invoice balance and status in real time.

## Relevant files
- `client/src/pages/Accounts.tsx`
- `shared/schema.ts`
- `server/routes.ts`
- `server/storage.ts`