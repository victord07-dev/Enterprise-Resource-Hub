# Quotation PDF Overhaul + Delivery Grand Total Fix

## What & Why
Four fixes to the quotation flow:
1. **Delivery cost missing from Grand Total** — The line-items editor shows a Grand Total that excludes the delivery charge. The delivery cost lives outside the editor component so it never reaches the total row.
2. **"Status" on PDF** — The exported PDF shows a Status field that should be removed (internal info, not customer-facing).
3. **PDF terms & conditions** — The current placeholder terms must be replaced with ITFI's real 8-clause terms.
4. **PDF branding: logo, GST, banking details, address** — The ITFI logo, company GST number, bank accounts, and registered address are missing from the PDF.

## Done looks like

### Delivery cost
- In both the quotation editor and sales order editor, the summary block shows a "Delivery Cost" row (only when delivery method = Delivery and cost > 0), and the Grand Total includes that cost
- The stored `totalAmount` already includes delivery cost (confirmed from DB), so this is a display-only fix in the editor

### PDF
- "Status" label and value are removed from the quotation meta box
- Header shows the ITFI logo on the left (`attached_assets/ITFI-LOGO-FIN_1777273207283.png`, import via `@assets/...`)
- Below the header (or in the header area), the company's GST number `18AAICI6408B1ZR` and address `Dag No: 471, Patta Number: 250, Goroimaria Pathar Aibheti, Nagaon: 782002, Assam` appear
- Terms & conditions section is replaced with the 8-clause terms below (verbatim)
- A Banking Details section appears at the bottom of every PDF with both HDFC and SBI account details
- An "Authorised Signature" line appears at the bottom right

### 8-clause terms (verbatim):
1. All prices are inclusive of 5% GST.
2. 100% advance payment required before supply or work commencement. Accepted modes: NEFT / RTGS / UPI / Account Payee Cheque only. Work begins only on fund realisation.
3. Materials will be delivered and installed at our cost.
4. Delivery is within Nagaon, Assam limits only. Freight, loading & transportation outside city limits are charged extra at actuals.
5. Site must be ready before scheduled visit. Revisit charges apply if our team cannot proceed due to site unreadiness. Engineers' travel, food & lodging for sites outside Nagaon, Assam are under the buyer's scope.
6. Warranty on materials is as per respective manufacturer's terms. Warranty is void for misuse, unauthorised modifications, or power fluctuations.
7. Orders once confirmed and materials procured cannot be cancelled. Cancellation costs will be recovered from the buyer.
8. All disputes subject to jurisdiction of Nagaon Courts, Assam. Placing an order or making payment constitutes acceptance of these terms.

### Banking details (both accounts):
Account 1 — HDFC Bank: M/S IT FUTURISTIC INDUSTRIES PVT. LTD., A/c No. 99999365647772, Haibargaon Branch, IFSC: HDFC0002036
Account 2 — SBI: A/c No. 44833748463, Nagaon Branch, IFSC: SBIN0000146

## Out of scope
- Changes to the sales invoice PDF (separate file)
- Changes to the purchase order PDF
- Changes to stored totalAmount calculation (delivery is already included correctly in the DB)

## Steps

1. **Fix delivery display in LineItemsEditor** — Add an optional `deliveryCost` prop to `LineItemsEditor`. In the summary block, add a "Delivery Cost" row (visible only when > 0) between GST and Grand Total. Include it in the `netTotal` formula. Pass the delivery cost from both the order editor and quotation editor call sites.

2. **Remove Status from quotation PDF** — In `generateQuotationPDF`, delete the two lines that render the "Status" label and value in the meta box.

3. **Add ITFI logo to PDF** — `generateQuotationPDF` needs to accept a `logoDataUrl?: string` parameter. In the header, use `doc.addImage(logoDataUrl, 'PNG', ...)` to render the logo on the left. In Sales.tsx, before calling `generateQuotationPDF`, fetch the imported logo image and convert it to a data URL, then pass it in.

4. **Add GST + address to PDF header/meta area** — Below the company name or in the meta box, add the GST number and registered address in a small font.

5. **Replace terms & conditions** — Delete the 3 placeholder terms lines. Render the 8-clause terms listed above, wrapping long lines. If content pushes past the page, add a new page before the terms block.

6. **Add banking details + authorised signature** — Below the terms, add a "Banking Details" section with both account blocks side by side or stacked. Add "Authorised Signature" aligned right at the bottom.

## Relevant files
- `client/src/pages/Sales.tsx:333-836` — LineItemsEditor component and its props
- `client/src/pages/Sales.tsx:2844-2858` — Order editor LineItemsEditor call site
- `client/src/pages/Sales.tsx:2975-2988` — Quotation editor LineItemsEditor call site
- `client/src/lib/quotation-pdf.ts`
- `attached_assets/ITFI-LOGO-FIN_1777273207283.png`
