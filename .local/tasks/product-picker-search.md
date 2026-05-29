# Product Picker — Search Input on Product Step

## What & Why
The final step of the HierarchicalProductPicker already narrows products via Type → Brand → Grid Type hierarchy. But when a brand still has many products, users must scroll through the dropdown to find the right one. Adding a small search input above the existing product Select lets users type a few characters to further filter the visible list — the Select dropdown itself is unchanged.

## Done looks like
- After choosing Type → Brand → (optional Grid Type), a text input labelled "Search…" appears directly above the existing product dropdown
- Typing into the input filters the products shown in the dropdown in real time (case-insensitive, matches anywhere in the product name)
- Clearing the input restores the full list; the dropdown works exactly as before
- The input is cleared automatically when Type or Brand changes (so stale search text doesn't carry over)
- If the search reduces the list to zero matches, the dropdown shows "No products found" (existing empty-state behaviour)
- The input has `data-testid="input-product-search-{lineIndex}"`

## Out of scope
- Replacing the Select dropdown with a combobox — keep the dropdown
- Searching across Type / Brand / Grid Type steps
- Server-side search
- Fuzzy / phonetic matching — simple `includes()` substring match is fine

## Steps
1. **Add `productSearch` state** — Add a `productSearch` string state in `HierarchicalProductPicker`. Reset it to `""` whenever `handleTypeChange` or `handleBrandChange` fires.
2. **Filter by search term** — Apply the search filter as an additional pass on `filteredProducts`: keep only products whose `name` includes `productSearch` (case-insensitive). The existing grid-type filter remains unchanged; this is just an extra client-side filter after it.
3. **Render search input** — Inside the product step `<div>`, add an `<Input>` (Shadcn) above the existing `<Select>`. Bind it to `productSearch`. Give it `data-testid="input-product-search-{lineIndex}"` and placeholder `"Search…"`.

## Relevant files
- `client/src/components/HierarchicalProductPicker.tsx`
