---
title: Daily Pricing Engine — Spec Compliance Fixes
---
# Daily Pricing Engine — Spec Compliance Fixes (Task #27)

## What & Why
After a full spec review of the Daily Pricing Engine Backend (Task #23) against the current implementation, 3 functional gaps were identified that affect real-world workflow correctness:

1. **`rejected_by` tracking + correct rejected status** — When a price sheet is rejected, the spec requires `status = "rejected"` (not "draft") and `rejected_by` stored. Currently the sheet is sent back to draft with no record of who rejected it or that it was ever rejected. This matters for audit trails and UI differentiation.
2. **Effective price `source` field + `product.unitPrice` fallback** — The effective-price endpoint is missing a `source` field (`"today" | "fallback" | "none"`) and does NOT fall back to `product.unitPrice` when no confirmed sheet exists in 7 days. This can return `null` price to the sales form — breaking order entry for new products.
3. **No notifications on draft price sheet creation** — Neither the manual create endpoint nor the GRN auto-trigger sends any notification to pricing approvers. Approvers (admin, accountant, sales_manager) have no way to know a draft is waiting for review. Notification infrastructure already exists.

## Done looks like
- `daily_price_sheets` schema gains a `rejectedBy` (`rejected_by`) nullable varchar column.
- `POST /api/daily-price-sheets/:id/reject` sets `status = "rejected"`, `rejected_by = req.user.id`, and persists `rejectionNotes`.
- `PATCH /api/daily-price-sheets/:id` accepts editing both `draft` AND `rejected` sheets (already allows this, just needs the status check updated).
- `POST /api/daily-price-sheets/:id/submit` accepts `draft` OR `rejected` sheets (already does this — just verify it still works after status name change).
- `GET /api/daily-price-sheets/effective-price` response includes `source: "today" | "fallback" | "none"`:
  - `"today"` — confirmed sheet found for the exact requested date
  - `"fallback"` — confirmed sheet found within 7-day lookback window (not today)
  - `"none"` — no confirmed sheet in 7 days; falls back to `product.unitPrice` with a non-null `effectivePrice`
- When `source = "none"`, `effectivePrice` returns `product.unitPrice` (NOT null) and `noConfirmedPrice = true`.
- On draft creation (both manual POST and GRN auto-trigger), notify all users with role `admin`, `accountant`, and `sales_manager` with title "Price Sheet Awaiting Review" and the product name + date in the message.
- Notifications are sent using the existing `storage.createNotification` method.
- Run `npm run db:push` after schema change to add the `rejected_by` column.

## Out of scope
- Renaming `proposed_price` → `proposed_market_price` (breaking migration, not worth the risk).
- Automated 5PM cron for missing approvals (explicitly out of scope in Task #23).
- UI changes for the pricing workflow (already built in Task #24).

## Relevant files
- `shared/schema.ts` — add `rejectedBy` to `dailyPriceSheets`
- `server/storage.ts` — update `getEffectivePriceForProduct` signature and return type
- `server/routes.ts` — update reject endpoint, effective-price endpoint, add notifications at draft creation (both manual and GRN trigger)
