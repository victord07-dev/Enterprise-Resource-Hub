# Fix Mark as Recorded form + E-way Bill threshold reminder

## What & Why
Code audit found the "Mark as Recorded" button on Sales Invoices is completely non-functional: the frontend never sends `extTotalAmount`, which is required by the backend, so every click returns a 400 error. The form also lacks the total amount field, labels incorrectly say "(optional)" on required fields, and the submit button is not disabled when fields are empty. Additionally, the e-way bill ≥₹50,000 threshold reminder is documented as "client-side" in the backend comment but was never implemented on the frontend.

## Done looks like
- The "Mark as Recorded" form in the Sales Invoices detail panel shows four fields: Ext. Invoice Number * (required), Ext. Invoice Date * (required), Ext. Total Amount ₹ * (required), Ext. GST Amount ₹ (optional). All required fields are marked with `*`. No field carries the "(optional)" label except Ext. GST Amount.
- The "Mark as Recorded" button is disabled until all three required fields are filled.
- The signed copy prerequisite is shown clearly: if signed copy has not been uploaded yet, the "Mark as Recorded" section shows an amber note "Upload the signed invoice copy (above) before marking as recorded" and the form is not shown.
- **Soft variance warning:** When the user clicks "Mark as Recorded" and `extTotalAmount` differs from the invoice's `grandTotal` by more than ₹5, a confirmation modal appears showing:
  - "External invoice total: ₹[extTotalAmount]"
  - "System invoice total: ₹[grandTotal]"
  - "Difference: ₹[diff]"
  - "The external total differs from the system-calculated total. This may indicate a typo or a rounding adjustment. Continue with this amount?"
  - Two buttons: "Continue" (proceeds with the API call) and "Cancel" (returns to form).
  - Within ₹5 difference: no modal, proceed silently.
- On successfully recording: the panel refreshes and shows Ext. Invoice Number, Ext. Invoice Date, and Ext. Total Amount in the status summary.
- When the invoice's `grandTotal` is ≥ ₹50,000, the e-way bill sub-section shows an amber advisory: "E-way bill required for consignments exceeding ₹50,000 — capture the bill number and valid-until date." This is shown whether or not an e-way bill has already been saved.
- When `grandTotal` < ₹50,000, no advisory is shown.

## Out of scope
- Changing the backend — backend validation is already correct
- Changing the GRN confirm gate — already verified working

## Steps
1. **Add state variables** — Add `extTotalAmount`, `extGstAmount` state to `InvoiceDetailPanel`. Add a `showVarianceModal` boolean state for the soft-warning dialog.
2. **Render four-field form** — In the "Mark as Recorded" amber card, render four input rows: Ext. Invoice Number * (text), Ext. Invoice Date * (date), Ext. Total Amount * (number, placeholder = invoice grandTotal formatted), Ext. GST Amount (number, optional, placeholder = invoice totalTax formatted). Remove "(optional)" label from Ext. Invoice Number.
3. **Button click handler with variance check** — On button click, first validate all three required fields are filled (button is also disabled but add a guard). Then compute `diff = Math.abs(Number(extTotalAmount) - Number(inv.grandTotal))`. If `diff > 5`, set `showVarianceModal = true` instead of calling the mutation. If `diff <= 5`, call the mutation directly.
4. **Variance confirmation modal** — Render a `<Dialog>` controlled by `showVarianceModal`. Show the three-line difference summary and "Continue"/"Cancel" buttons. "Continue" calls `markRecordedMutation.mutate()` and closes the modal. "Cancel" just closes the modal.
5. **Fix mutation payload** — Update `markRecordedMutation.mutationFn` to send `extTotalAmount` (always), `extInvoiceNumber` (always), `extInvoiceDate` (always), and `extGstAmount: extGstAmount || undefined`.
6. **Signed-copy prerequisite guard** — Wrap the "Mark as Recorded" card: if `!(inv as any).signedCopyUrl`, show amber note instead of the form fields.
7. **E-way bill threshold advisory** — In the e-way bill sub-section, check `Number(inv.grandTotal) >= 50000`. If true, show amber info box above the inputs.

## Relevant files
- `client/src/pages/SalesInvoices.tsx:612-895`
