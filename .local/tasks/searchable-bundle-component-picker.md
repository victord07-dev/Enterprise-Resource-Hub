# Searchable Bundle Component Product Picker

## Goal
Replace the plain `<Select>` dropdown for bundle component rows in the product create/edit dialog with a simple searchable combobox — a trigger button that opens a popover with a search input and a flat filtered list of products. No hierarchy (no Type → Brand → Grid steps).

## Context
- **File:** `client/src/pages/Products.tsx` — the "Bundle / Kit" section of the product dialog, lines ~1643–1676.
- **Current:** A plain Radix `<Select>` / `<SelectContent>` listing all available component products with no search capability. Hard to use with a large catalog.
- **Reference for search UX:** The product search input inside `HierarchicalProductPicker.tsx` (lines ~231–301) — a `<Popover>` with an auto-focused `<Input>` and a scrollable filtered list. Use that same pattern directly, but skip all the Type / Brand / Grid steps. The list is always flat: just `availableComponentProducts` filtered by the search term.

## What to Build

Replace the `<Select>` / `<SelectTrigger>` / `<SelectContent>` / `<SelectItem>` block for each bundle component row with:

1. **Trigger button** (`role="combobox"`) — shows the selected product name + SKU, or placeholder "Select component…". Full width to match the current layout.
2. **Popover panel** — one `<Input>` (auto-focused when the popover opens) followed by a scrollable list of matching products.
3. **Filtering** — real-time case-insensitive match against product name and SKU from `availableComponentProducts`.
4. **Selection** — clicking an item fires the existing `onValueChange` logic (sets component id, unit, qty default), closes the popover, clears the search term.
5. **Open state** — tracked per component row (index-keyed object or per-row state).

Keep the existing fractional-units validation and all `data-testid` attributes (`select-bundle-component-${idx}`).

No schema, backend, routing, or other UI changes.

## Acceptance Criteria
- Typing filters the flat product list in real time (name or SKU match).
- Selecting a product fills the component row exactly as before.
- Quantity input, unit display, and delete button are unaffected.
- No hierarchy steps — list is always immediately visible on open.
