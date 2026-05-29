---
title: Task #31 — Reports Overview: Real Downloadable Reports
---
# Reports Overview: Real Downloadable Reports

## What & Why
The 6 "Generate Report" cards on the Reports Overview tab currently do nothing useful:
- Inventory Report and Staff Report navigate to other modules instead of downloading a file
- Tax Report falls back to switching tabs instead of generating a PDF
- Sales Report and Financial Report show a "coming soon" toast

All the underlying data exists in the system. This task wires each card to fetch that
data and produce a real downloadable CSV or PDF — no new API endpoints required.

## Done looks like
- **Inventory Report** button downloads a CSV/PDF of all products: name, SKU, category, unit,
  total stock quantity, cost price, and unit/list price. Filename: `itfi-inventory-YYYY-MM-DD.*`
- **Staff Report** button downloads a CSV/PDF of all employees: name, employee ID, department,
  designation, role, and status (active/inactive). Filename: `itfi-staff-YYYY-MM-DD.*`
- **Sales Report** button downloads a CSV/PDF of all sales invoices: invoice number, customer,
  invoice date, due date, grand total, amount collected, balance, and status.
  Filename: `itfi-sales-report-YYYY-MM-DD.*`
- **Financial Report** button downloads a combined CSV/PDF summarising revenue (from AR invoices)
  and payables (from AP supplier invoices): entity name, invoice #, date, amount, type (Income/Expense).
  Filename: `itfi-financial-report-YYYY-MM-DD.*`
- **Tax Report** generates the combined AP+AR aging PDF immediately on click (fetches data
  on demand if not yet cached, no fallback navigation). Filename: `itfi-tax-report-YYYY-MM-DD.pdf`
- Each card's button label stays "Generate Report" and triggers a dropdown or split:
  CSV and PDF options (same UX pattern as the per-tab export buttons).
  If only one format makes sense for a card, a single button is fine.

## Out of scope
- New backend API endpoints (all data comes from existing endpoints)
- Payroll, leave, or attendance breakdowns in the Staff Report (employee roster only)
- P&L statements with journal entries in Financial Report (invoice-level list only)
- Charts or graphs in the generated files

## Tasks
1. **Add `generateInventoryPDF` and `generateStaffPDF` to `reports-pdf.ts`** — same style as
   existing AP/AR generators: navy header, optional summary band, paginated table, footer.

2. **Add `generateSalesReportPDF` and `generateFinancialReportPDF` to `reports-pdf.ts`** —
   Sales PDF lists all sales invoices; Financial PDF has two sections (Revenue / Payables) on
   separate pages if needed, with a summary band showing totals.

3. **Wire Inventory and Staff report buttons in `Reports.tsx`** — on click, fetch
   `/api/products` and `/api/employees` respectively using `queryClient.fetchQuery`, then call
   the corresponding CSV helper (reuse `downloadCSV`) and PDF generator. Show a loading state
   (disable button while fetching).

4. **Wire Sales and Financial report buttons in `Reports.tsx`** — Sales fetches
   `/api/sales-invoices`; Financial fetches both `/api/sales-invoices` and
   `/api/supplier-invoices`. Generate and download the file immediately.

5. **Fix Tax Report button** — replace the cache-check + navigate fallback with a direct
   `queryClient.fetchQuery` call for both `/api/reports/ap-aging` and `/api/reports/ar-aging`
   in parallel, then pass the results to the existing `generateTaxReportPDF`. Show a spinner
   toast while fetching.

6. **Update Overview card buttons** — replace single "Generate Report" button per card with a
   small dropdown (CSV / PDF) using the same `DropdownMenu` pattern as the top-level Export
   button, except Tax Report which is PDF-only.

## Relevant files
- `client/src/pages/Reports.tsx:984-1165`
- `client/src/lib/reports-pdf.ts`