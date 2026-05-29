---
title: Accounts Payable Aging Report
---
# Accounts Payable Aging Report

## What & Why
Add an Accounts Payable Aging report to the Reports module. This is the first report an accountant asks for — it shows exactly what the business owes to each supplier, how old each outstanding balance is, and which ones are overdue. Without this, the finance team has no visibility into payment obligations and cash flow planning is impossible.

## Done looks like
- The Reports module has an "AP Aging" tab (or section) showing a summary of outstanding supplier payables
- The report table shows: Supplier, Invoice #, Invoice Date, Due Date, Total Amount, Paid, Balance, and Days Overdue
- Balances are grouped into aging buckets: Current (not yet due), 1–30 days overdue, 31–60 days overdue, 61–90 days overdue, 90+ days overdue
- A summary row at the top shows the total outstanding balance across all buckets
- Invoices with zero balance (fully paid) are excluded by default but can be toggled visible
- The report can be filtered by supplier

## Out of scope
- PDF/Excel export of the report (future)
- Automatic payment reminders or notifications
- 3-way matching warnings

## Tasks
1. **AP Aging API endpoint** — Add `GET /api/reports/ap-aging` that fetches all supplier invoices with non-zero balances, calculates days overdue (current date minus due date), and groups them into aging buckets. Returns enriched data with supplier name, PO number, total paid (from supplier payments), and balance.

2. **AP Aging UI in Reports** — Add an "AP Aging" tab to the Reports page. Show a summary card for each aging bucket (Current, 1–30, 31–60, 61–90, 90+) at the top. Below that, a filterable table of individual invoices sorted by days overdue descending. Overdue rows should be visually distinct (red tint for 90+, amber for 31–90).

## Relevant files
- `client/src/pages/Reports.tsx`
- `server/routes.ts`
- `server/storage.ts`