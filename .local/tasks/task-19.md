---
title: AR Aging Report & Accounts AR Upgrade
---
# AR Aging Report & Accounts AR Upgrade

  ## What & Why
  Build a customer-facing AR Aging report and upgrade the Accounts page to display data from the GST-compliant sales invoices system. Accountants need to see exactly which customers owe money, how long invoices have been outstanding, and where the collection risk is concentrated.

  ## Done looks like
  - Reports page has an "AR Aging" tab with: customer filter, 5 bucket summary cards (Current / 1–30 / 31–60 / 61–90 / 90+ days), and a sortable table showing Customer | Invoice | GST Type | Due Date | Days Overdue | Balance | Status
  - Accounts page AR tabs ("Invoices" and "Payments") show data from the new sales_invoices and customer_payments tables — including customer name, balance remaining, and overdue status — instead of the old generic invoices table
  - AR summary cards on Accounts page reflect correct totals from the new tables

  ## Out of scope
  - GSTR-1 / GST return filing
  - E-invoice API
  - Customer credit limits or write-offs

  ## Tasks
  1. **AR Aging backend endpoint** — Add `GET /api/reports/ar-aging` to server/routes.ts. For each non-paid sales invoice: join customer name, sum customer_payments to get totalPaid, compute balance and daysOverdue (negative = current), assign bucket (current / 1-30 / 31-60 / 61-90 / 90+). Return rows sorted by daysOverdue descending plus a summary object with per-bucket totals. Mirror the existing `GET /api/reports/ap-aging` logic as a pattern.

  2. **AR Aging tab in Reports page** — Add an `ARAgingTab` component to Reports.tsx following the same structure as `APAgingTab`: customer filter dropdown, same 5 bucket summary cards with same colour coding, and a data table (Customer | Invoice # | Type | Due Date | Days | Balance | Status). Wire it to the new `/api/reports/ar-aging` endpoint. Add the tab trigger labelled "AR Aging" next to "AP Aging".

  3. **Accounts page AR section upgrade** — Replace the AR tabs in Accounts.tsx (`/api/invoices` + `/api/payments`) with the new `/api/sales-invoices` + `/api/customer-payments` endpoints. Show customer name (resolved from the customers query), invoice number, due date, balance (grandTotal minus payments), customerType (B2B / B2C), and status badge. Update the AR summary cards (total receivable, collected, outstanding) to compute from the new sales_invoices data. Keep the AP section completely untouched.

  ## Relevant files
  - `server/routes.ts:4649-4749`
  - `client/src/pages/Reports.tsx:112-307`
  - `client/src/pages/Accounts.tsx:40-54,385-470`
  - `client/src/pages/SalesInvoices.tsx`
  - `shared/schema.ts:529-580`