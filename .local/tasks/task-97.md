---
title: Collapsible line items + bottom Add Item button in quotation form
---
# Collapsible Line Items + Sticky "Add Item" Button in Quotation Form

## Goal
Two UX improvements to the `LineItemsEditor` in `client/src/pages/Sales.tsx` that make long quotation forms much easier to work with:

1. **Collapse confirmed rows** — once a product/service/bundle has been selected on a line, the row compresses to a single compact summary line. The user can click a pencil icon to expand it back for editing.
2. **"Add Item" button at the bottom** — duplicate the Add Item button so it always appears below the last item, not just at the top. Users no longer need to scroll to the top to add another item.

## Context
- **File:** `client/src/pages/Sales.tsx` — `LineItemsEditor` component, lines ~480–780.
- **Add Item button:** Currently only at the top-right of the "Line Items" header (line 495).
- **Line item rows:** Each item is a `<div className="border rounded-lg p-3 ...">` containing the product picker, description, qty/price/GST fields, bundle panel, warnings, and totals.
- **Collapsed state** is purely UI — no schema or backend changes needed.

## What to Build

### 1. Collapsed summary row
- Add a `collapsedItems` state (`Set<number>`) inside `LineItemsEditor`.
- When a product is selected (`updateItem` called with `field === "productId"` and a non-empty value), automatically add that index to `collapsedItems`.
- When a new item is added via `addItem()`, it is NOT collapsed (open by default so the user can fill it in).
- When a row is removed, clean up its index from `collapsedItems`.
- **Collapsed appearance** (replace the full `<div className="border rounded-lg p-3 ...">` with a compact row):
  - Left: product name + SKU/description (truncated, 1 line)
  - Middle: qty × unit price, GST%, subtotal
  - Right: pencil (Edit) icon button to expand + X (remove) icon button
  - For bundles: show a small `[Bundle]` badge next to the name
- **Expand:** clicking the pencil icon removes the index from `collapsedItems`, showing the full row again.
- Keep the existing `data-testid` on the outer wrapper (`line-item-${i}`). Add `data-testid="button-expand-item-${i}"` on the pencil button.

### 2. "Add Item" button at the bottom
- After the last item in the list (or the empty-state message), render a second `<Button>` identical to the existing top one: `<Plus /> Add Item`.
- Both buttons call the same `addItem` function.
- `data-testid="button-add-line-item-bottom"`

## Acceptance Criteria
- Selecting a product on a row immediately collapses it to the compact summary.
- The compact summary shows correct name, qty, price, and total.
- Clicking the pencil icon re-expands the full row.
- "Add Item" button is visible at the bottom of the item list without scrolling.
- Removing an item works from both the collapsed (summary) and expanded states.
- No changes to backend, schema, or other pages.