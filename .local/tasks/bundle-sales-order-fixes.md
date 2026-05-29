# Fix bundle handling in confirmed sales orders

## What & Why
Two bugs found in SO-MO9S2TJA (Solar Kit 6KVA) after Phase 7 go-live:

**Bug A — "Loading bundle components…" stuck forever** when reopening a saved sales order that contains a bundle line item. The bundle component map is populated lazily only when a user actively *changes* a product in the editor. When an existing order is opened, nothing triggers the fetch, so the panel stays in its loading state indefinitely.

**Bug B — No purchase request raised for out-of-stock bundle components.** The `checkAndCreatePurchaseRequests` function filters `itemType === "product"` only. Bundle lines have `itemType === "bundle"` and are silently ignored. Solar Panel 500W and Solar Inverter 10kW were short but no PR was created — the order jumped straight to "Ready to Ship" instead of "procurement".

## Done looks like
- Opening any saved sales order or quotation that contains a bundle line immediately shows the component breakdown (no stuck "Loading…" state)
- When a confirmed order with a bundle has one or more out-of-stock components, a purchase request is auto-created with one PR line item per short component (scaled by bundle qty × component qty per bundle)
- Order status correctly transitions to "procurement" instead of "ready_to_ship" when any bundle component is short
- Existing non-bundle order flow is unchanged

## Out of scope
- Changing how bundle components are displayed in the edit form (only the view/readonly panel needs the load fix)
- Any changes to the dispatch / stock movement logic

## Steps
1. **Fix Bug A — auto-load bundle components on open.** In the Sales component, add a `useEffect` that runs whenever the active order's line items arrive from the server. For any item with `itemType === "bundle"`, call `loadBundleComponents(item.productId)` if the map entry is absent. This ensures the bundle panel populates immediately when an order is opened without any user interaction.

2. **Fix Bug B — expand bundle lines in PR generation.** In `checkAndCreatePurchaseRequests` (server/routes.ts), after processing regular `product` lines, also process `bundle` lines. For each bundle line: fetch its components via the existing storage method used by `GET /api/products/:id/bundle-items`, compute required qty as `bundleLineQty × componentQtyPerBundle`, check available stock per component, and push shortfall entries to `shortfallItems`. Use the same supplier-price lookup already in place for regular products.

3. **Verify end-to-end.** Confirm that: (a) reopening SO-MO9S2TJA shows Solar Kit 6KVA components without a stuck loader; (b) creating a new order with a bundle where one component is short, recording payment, then checking Supply Chain → Purchase Requests shows the new PR with per-component line items and the order status is "procurement".

## Relevant files
- `client/src/pages/Sales.tsx:885-906`
- `client/src/pages/Sales.tsx:511-524`
- `server/routes.ts:136-227`
- `server/routes.ts:144-145`
- `server/storage.ts`
