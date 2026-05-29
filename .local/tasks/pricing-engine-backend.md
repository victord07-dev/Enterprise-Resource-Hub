# Daily Pricing Engine Backend

## What & Why
Commodity prices change daily. This task builds the backend for creating, editing, submitting, confirming, and rejecting daily price sheets — the workflow that connects market prices to the lot engine and protects the business from selling below cost.

**Price strategy rule (executor must follow):**
The confirmed price on a daily price sheet does NOT overwrite `product.unitPrice`. Instead, all sales and quotation forms that need a selling price must call `GET /api/daily-price-sheets/effective-price?productId=&date=` to get today's confirmed price (or yesterday's fallback). The `product.unitPrice` field remains a manual fallback that is editable only when no confirmed sheet exists for today. This avoids silent overwrites and accounting confusion.

## Done looks like
- `POST /api/daily-price-sheets` creates a draft sheet for a product/date, auto-populating blended cost, global floor, strict floor, and per-lot breakdown from the lot engine.
- `GET /api/daily-price-sheets?productId=&date=` returns sheets with their status and lot lines.
- `POST /api/daily-price-sheets/:id/submit` moves a draft to `submitted`.
- `POST /api/daily-price-sheets/:id/confirm` (admin/accountant only) — sets status to `confirmed`. Does NOT write to `product.unitPrice`. If any lot's proposed price is below its floor, `overrideRequired = true` and the request body must include `overrideReason`.
- `POST /api/daily-price-sheets/:id/reject` returns the sheet to draft with rejection notes.
- `GET /api/daily-price-sheets/effective-price?productId=&date=` returns the confirmed market price for the given date, falling back to the most recent prior confirmed sheet if today's is not yet approved. Returns `null` with `noConfirmedPrice: true` if no confirmed sheet exists in the past 7 days.
- Attempting to confirm an already-confirmed sheet returns HTTP 403.
- When a GRN is confirmed, a draft price sheet is auto-created for each received product (if one does not already exist for today).
- When a supplier product price is updated (PATCH supplier_products), `product.needsPricingReview` is set to `true`.

## Out of scope
- The UI for the pricing workflow (Task #24).
- Automated 5PM notification cron for missing approvals.
- Purchase Return adjustments to lot cost.
- Writing confirmed price to `product.unitPrice` — this is explicitly out of scope by design.

## Tasks
1. **Price sheet CRUD endpoints** — Implement create, list, get-by-id, and update-draft endpoints. On creation, call the lot engine internally to populate `blendedInventoryPrice`, `globalFloorPrice`, `strictFloorPrice`, and insert `daily_price_sheet_lots` rows with each lot's remaining qty, landed cost, and floor price.

2. **Approval workflow endpoints** — Implement submit, confirm (role-guarded to admin/accountant), and reject endpoints. Confirm sets sheet status to `confirmed` and sets `product.needsPricingReview = false`. Does NOT write to `product.unitPrice`. Override check: if any lot's `proposedPrice < lotFloorPrice`, set `overrideRequired = true` and reject confirm requests without an `overrideReason`.

3. **Effective price endpoint** — `GET /api/daily-price-sheets/effective-price` returns the most recent confirmed sheet's market price for the given product on or before the requested date (up to 7 days back). Returns `{ effectivePrice, sheetDate, noConfirmedPrice }`.

4. **GRN auto-sheet trigger** — After GRN confirmation, for each received product check if a draft or confirmed price sheet exists for today. If not, auto-create a draft sheet using the lot engine data.

5. **Supplier price change trigger** — When supplier product price is updated via PATCH, set `product.needsPricingReview = true` for the linked product.

## Relevant files
- `shared/schema.ts`
- `server/storage.ts`
- `server/routes.ts`
- `server/routes.ts:3130-3220`
