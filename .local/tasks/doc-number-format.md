# Document Number Format — ITFI FY Scheme

## What & Why
Replace the random/legacy number formats for Quotations, Sales Orders, and Purchase Orders with a sequential, financial-year-aware scheme that matches ITFI's internal document numbering convention.

New formats:
- Quotation:    `ITFI-Q/2026-27/0001`
- Sales Order:  `ITFI-SO/2026-27/0001`
- Purchase Order: `ITFI-PO/2026-27/0001`

Sequence resets to 0001 each financial year (India FY: April 1 – March 31). The FY string is derived from the document creation date, not the calendar year.

## Done looks like
- Every new quotation created gets a number like `ITFI-Q/2026-27/0001`, incrementing by 1 for each new quotation in the same FY.
- Every new sales order (whether created directly or converted from a quotation) gets `ITFI-SO/2026-27/0001`, same logic.
- Every new purchase order (created manually or auto-generated from a purchase request) gets `ITFI-PO/2026-27/0001`, same logic.
- Existing records are untouched — old-format numbers remain as-is.
- No gaps or duplicates even under concurrent creation (use MAX query approach consistent with existing PO logic).

## Out of scope
- Migrating existing QT-/SO-/PO- numbers to the new format.
- Purchase Requests (PR-YYYY-NNNN) — leave unchanged.
- GRN, Sales Invoice, Challan numbers — leave unchanged.
- Manual override of PO number by the user — preserve this capability.

## Steps
1. **Add shared FY + sequence helpers** — Write a `getFinancialYear(date)` helper (returns e.g. `"2026-27"` for any date in the April 2026 – March 2027 window) and a `nextDocNumber(prefix, fyStr, existingNumbers)` helper (finds max sequence from a list of strings matching `prefix/fyStr/NNNN`, returns the next zero-padded 4-digit number). Place both in a short utility section near the top of `server/routes.ts` (or a new `server/lib/doc-numbers.ts`).
2. **Update Quotation generation** — Replace the `QT-${Date.now()...}` expression at line ~2816 with a query that fetches all `quote_number` values, filters to the current FY prefix, and calls the new helper. There is one generation point for QT numbers (quotation from lead + direct quotation creation both hit the same code path).
3. **Update Sales Order generation** — Replace the `SO-${Date.now()...}` expression at line ~2677 with the same pattern against `order_number` values. This path covers both direct SO creation and quotation-to-SO conversion.
4. **Update Purchase Order generation** — Replace the two `PO-${year}-${padded}` expressions (lines ~3283 and ~6331) with the new `ITFI-PO/FY/NNNN` scheme. Preserve the manual-override path: if `req.body.poNumber` is already set, use it as-is.

## Relevant files
- `server/routes.ts:2670-2685,2810-2825,3274-3284,6320-6340`
