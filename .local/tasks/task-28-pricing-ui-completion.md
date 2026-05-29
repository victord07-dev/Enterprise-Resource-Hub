---
title: Daily Pricing UI — Completion & #27 Integration
---
# Daily Pricing UI — Completion & #27 Integration (Task #28)

## What & Why
The Daily Pricing workflow is currently buried inside the Inventory page — a supply chain screen.
The staff who use it daily (sales_manager, accountant) and the CEO who approves it have no natural home
for pricing work there. Additionally, the sales team has no dedicated read-only view of today's
approved prices before they build quotations.

This task corrects the architecture and completes the integration with Tasks #26 and #27.

## Done looks like

### 1. Standalone "Pricing" page + sidebar entry
- A new `/pricing` route and `Pricing.tsx` page is created.
- The sidebar gains a "Pricing" entry (between Products and Sales, or under a sensible grouping),
  visible only to roles: `admin`, `sales_manager`, `accountant`.
- The full Daily Pricing tab content is moved from `Inventory.tsx` into `Pricing.tsx` —
  same table, same dialog, same logic, just a dedicated page.
- The Inventory page removes the Daily Pricing tab entirely (warehouse/supply chain staff
  don't need it; their work is GRN, stock movements, and purchase orders).

### 2. Bug fixes from Task #27's status change (in the new Pricing.tsx)
- **Rejected count card**: simplified to `s.status === "rejected"` only — removes the old
  `|| (s.status === "draft" && s.rejectionNotes)` fallback that causes double-counting now
  that rejected sheets hold `status = "rejected"` permanently.
- **Toast after reject**: updated from "Returned to draft for revision" to
  "Sheet rejected — submitter can revise and resubmit".

### 3. Source badge + Effective Price column in Pricing table
- Fetch `GET /api/daily-price-sheets/effective-prices-today` in Pricing.tsx (same endpoint
  already used in Sales.tsx).
- Each product row gains:
  - **Source badge**: 🟢 "Approved Today" (source="today") / 🟡 "Prev Price" (source="fallback") /
    🔴 "No Price" (source="none") — small coloured badge in or beside the Status column.
  - **Effective Price column**: the confirmed price sales will actually use, distinct from the
    Proposed Price column. Shown in muted text when source="none" (it's the fallback unitPrice).

### 4. Products page — read-only "Today's Prices" tab
- The Products/Services page gains a new tab: **"Today's Prices"**.
- Visible to all roles that can access Products (sales team included).
- A simple read-only table: Product | Unit | Today's Effective Price | Source | Floor Price | Status.
  - Source column uses the same 🟢/🟡/🔴 badges.
  - No actions, no dialogs — purely informational so the sales team can review prices before
    building quotations, similar to how a "Last Sold Price" board works.
  - Data comes from `GET /api/daily-price-sheets/effective-prices-today`.

### 5. Sales / Quotation form UX cleanup
- Replace the per-line "Show/Hide Margin Simulation" collapsible toggle with a compact
  **"Check Margin"** button (BarChart3 icon) per line item. Clicking opens a small Dialog modal
  showing the same data: source alert, margin %, floor checks (vs blended/global/strict floors).
- Below the Unit Price input, add a small **inline chip** immediately visible when a product is
  selected: "🟢 Floor ₹115 · Approved Today" / "🟡 Floor ₹115 · Prev (YYYY-MM-DD)" /
  "🔴 Floor ₹115 · No Approval". Uses `source` and `globalFloorPrice` from effective-prices-today.

### 6. Notification deep-link → Pricing dialog
- When a notification with type containing "pricing" is clicked (sent by Task #27's
  `notifyPricingReviewers`), navigate to `/pricing?sheet=<notification.relatedId>`.
- In Pricing.tsx, on mount read the `?sheet=` query param. If present, find the matching product
  from todaySheets and auto-open the PricingDialog for it. After opening, clear the param from
  the URL so a refresh doesn't re-open it.

## Workflow summary (who does what, where)
| Step | Who | Where |
|---|---|---|
| Enter proposed selling price | sales_manager, accountant | /pricing (Pricing page) |
| Submit for approval | sales_manager, accountant | /pricing (Pricing page) |
| Receive notification | admin/CEO | Bell icon → click → /pricing?sheet=ID |
| Approve / Reject | admin/CEO | /pricing (Pricing page dialog) |
| View today's approved prices | all sales roles | Products → "Today's Prices" tab |
| Price auto-fills in order | sales_rep | Sales/Quotation form (already works) |

## Files to change
- `client/src/pages/Pricing.tsx` — NEW file; move all Daily Pricing tab content from Inventory.tsx here
- `client/src/pages/Inventory.tsx` — remove Daily Pricing tab and its state/queries
- `client/src/pages/Products.tsx` — add "Today's Prices" read-only tab
- `client/src/pages/Sales.tsx` — replace MarginSimPanel toggle with "Check Margin" modal;
  add inline source+floor chip below unit price input
- `client/src/App.tsx` — register `/pricing` route
- Sidebar component — add "Pricing" nav entry visible to admin/sales_manager/accountant
- Notification click handler — navigate to `/pricing?sheet=<relatedId>` for pricing notifications

## Out of scope
- Any backend changes (all backend done in Tasks #23, #26, #27 — no new endpoints needed).
- Mobile / kiosk pricing views.
- Automated cron for missing-approval alerts.
- Portfolio-level margin summary report (that is Task #25/Reports).

## Key data sources
- `GET /api/daily-price-sheets/effective-prices-today` — returns source ("today"/"fallback"/"none"),
  effectivePrice (never null), noConfirmedPrice, hasConfirmedToday, blendedCost,
  globalFloorPrice, strictFloorPrice per product.
- `GET /api/daily-price-sheets?date=TODAY` — returns today's sheets with status and lot lines.
- Notification relatedId = the price sheet ID; notification type contains "pricing".
- No backend changes required — all data is already available.
