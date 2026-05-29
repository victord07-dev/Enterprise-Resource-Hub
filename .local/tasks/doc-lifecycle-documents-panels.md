# Document Panels on SO & PO Detail Views

## What & Why
The Sales Order expanded view already lists linked Delivery Challans, but it does not show the
resulting Sales Invoices (upload status, external invoice number, signed-copy link). Likewise, the
Purchase Order expanded view uses linked GRN data for quantity math but never shows the GRN list,
each GRN's status, or links to upload documents. Adding these two "Documents" panels closes the
visibility gap so operations staff can see the full document chain without leaving the page.

## Done looks like
- **SO detail → Invoices panel**: Below the existing Challans section, an "Invoices" sub-section
  appears for each Sales Order. It lists every linked Sales Invoice with: internal invoice number,
  upload status badge (Upload Pending / Recorded / Cancelled), external invoice number (if set),
  grand total, and a "View" button that navigates to the Accounts → Sales Invoices tab filtered to
  that invoice.
- **PO detail → GRNs panel**: In the PO expanded view (POExpandedItems), a "Goods Receipts" section
  appears below the line-items table. It lists every linked GRN with: GRN number, status badge
  (Draft / Confirmed / Cancelled), received date, total amount, and icon-links for supplier-challan,
  signed-copy, and supplier-invoice documents (green tick if uploaded, orange upload icon if missing).
- No schema changes and no new API routes are needed — existing `/api/sales-invoices?orderId=` or
  equivalent and `/api/grns/by-po/:poId` endpoints are reused.
- Existing upload dialogs in Inventory.tsx (GRN signed copy, supplier invoice) are not changed.

## Out of scope
- Any new schema columns or backend routes.
- Inline file upload from within the Sales or SupplyChain pages (uploads stay in Inventory).
- Changes to SalesInvoices.tsx, Inventory.tsx, or any other existing page.

## Steps
1. **SO → Invoices panel** — In `Sales.tsx`, add a query for invoices linked to each expanded SO
   (`/api/sales-invoices` filtered by `soId`). Render an "Invoices" card below the Delivery
   Challans section with invoice number, upload-status badge, ext invoice number, total, and a
   navigate-to-accounts link.
2. **PO → GRNs panel** — In `SupplyChain.tsx`, the `POExpandedItems` component already fetches
   `/api/grns/by-po/:poId`. Add a "Goods Receipts" section below the items table that renders each
   GRN row: number, status badge, date, total, and three document-status icons (supplier challan,
   signed copy, supplier invoice) that link to the actual URLs if present.
3. **Check API shape** — Confirm the `GET /api/sales-invoices` endpoint accepts a `soId` query
   param (or add one if missing — a one-line filter addition to the existing list route). The GRN
   endpoint already supports `/api/grns/by-po/:poId`.

## Relevant files
- `client/src/pages/Sales.tsx`
- `client/src/pages/SupplyChain.tsx`
- `server/routes.ts`
