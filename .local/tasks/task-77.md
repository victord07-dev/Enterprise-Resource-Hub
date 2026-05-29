---
title: Product picker — add search input on product step
---
# Product Picker — Search Input on Product Step

  ## What & Why
  The final step of the HierarchicalProductPicker already narrows products via Type → Brand → Grid Type hierarchy. But when a brand still has many products, users must scroll through the dropdown to find the right one. Adding a small search input above the existing product Select lets users type a few characters to further filter the visible list — the Select dropdown itself is unchanged.

  ## Done looks like
  - After choosing Type → Brand → (optional Grid Type), a text input labelled "Search…" appears directly above the existing product dropdown
  - Typing into the input filters the products shown in the dropdown in real time (case-insensitive, matches anywhere in the product name)
  - Clearing the input restores the full list; the dropdown works exactly as before
  - The input is cleared automatically when Type or Brand changes (so stale search text doesn't carry over)
  - If the search reduces the list to zero matches, the dropdown shows "No products found" (existing empty-state behaviour)
  - The input has data-testid="input-product-search-{lineIndex}"

  ## Out of scope
  - Replacing the Select dropdown with a combobox — keep the dropdown
  - Searching across Type / Brand / Grid Type steps
  - Server-side search
  - Fuzzy / phonetic matching — simple includes() substring match is fine

  ## Steps
  1. Add a productSearch string state; reset it to "" whenever handleTypeChange or handleBrandChange fires.
  2. Apply the search as an extra client-side filter on filteredProducts after the existing grid-type filter — keep only products whose name includes productSearch (case-insensitive).
  3. Add a Shadcn Input above the existing product Select, bound to productSearch, with placeholder "Search…" and data-testid="input-product-search-{lineIndex}".

  ## Relevant files
  - client/src/components/HierarchicalProductPicker.tsx