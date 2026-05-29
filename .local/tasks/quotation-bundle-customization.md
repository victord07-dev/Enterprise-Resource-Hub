# Per-Quotation Bundle Component Customization

## Goal
When a bundle/kit product is added to a quotation, allow the operator to add or remove components **for that specific quotation only** — without touching the master bundle definition. The customized component list is saved with the quotation and reflected in the PDF.

Quotations only for now (sales orders come later once this is verified working).

## Context
- **Files:** `shared/schema.ts`, `server/routes.ts`, `server/storage.ts`, `client/src/pages/Sales.tsx`
- **How bundles work today:**
  - `product_bundle_items` table stores the master component list.
  - `bundleComponentsMap` in `LineItemsEditor` holds a cache of these, loaded via `GET /api/products/:id/components`.
  - The bundle panel (lines 548–606) shows a read-only list of components with stock badges.
  - `quotation_items` table stores each line item but has no field for per-quotation component overrides.
- **LineItem interface** (line 56): `{ itemType, productId, description, quantity, unitPrice, totalPrice, gstRate, hsnCode, taxAmount }` — no `customComponents` field yet.

## What to Build

### A. Schema — `quotation_items` table
Add a nullable `customComponents` jsonb column to `quotation_items`:
```
customComponents: jsonb("custom_components")
  .$type<Array<{ componentProductId: string; quantity: number; unit: string }>>()
```
Run `npm run db:push` after the schema change.

### B. Backend — save & load custom components
1. **`POST /api/quotations/:id/items`** (routes.ts ~line 2448): already replaces all items for a quotation. When each item has a `customComponents` field, persist it into the new column (pass it through to the insert).
2. **`GET /api/quotations/:id/items`** (routes.ts ~line 2439): already returns all item columns — the new column will be returned automatically.
3. **Storage** (`server/storage.ts`, `createQuotationItem`): ensure the `customComponents` field is included in the insert values.

### C. Frontend — `LineItem` type + `LineItemsEditor`

**1. `LineItem` interface** (Sales.tsx line 56):
```ts
interface LineItem {
  // ... existing fields ...
  customComponents?: Array<{ componentProductId: string; quantity: number; unit: string }> | null;
}
```

**2. Bundle components panel** (Sales.tsx lines 548–606): replace the read-only panel with an editable one when `item.productId` points to a bundle:
- Show a "Customize" toggle button (pencil/edit icon) at the top-right of the panel header.
- **View mode** (default): same as today — read-only list with stock badges and the "Invoiced as one line" note. Uses `item.customComponents` if present, else `bundleComponentsMap[prod.id]`.
- **Edit mode** (after clicking Customize):
  - Each component row shows: product name, qty input (number), unit input, and a remove (×) button.
  - Below the list: an "Add Component" row — a **searchable product combobox** (same Popover+Input pattern used for bundle component picker in Products.tsx, Task #96) + qty input + unit input + an Add (+) button.
  - The combobox lists all non-bundle, non-service products filtered by search term (name or SKU).
  - A "Done" button exits edit mode and collapses back to view mode.
- **State**: `bundleEditMode` — a `Set<number>` (line indices in edit mode), stored in `LineItemsEditor`.
- **When a component is added/removed/qty-changed**: call `updateItem(i, "customComponents", newList)` so the change flows into the parent `items` state and is serialized when the quotation is saved.
- **Saving**: `customComponents` is already in `LineItem`, so it flows naturally into the `POST /api/quotations/:id/items` payload.
- **Loading**: when quotation items are fetched (Sales.tsx ~line 1140), map `customComponents` from the DB row into `LineItem`. When `customComponents` is non-null and non-empty, the bundle panel uses that list instead of `bundleComponentsMap[prod.id]`.

**3. `emptyLineItem()`** (wherever it's defined): ensure `customComponents: null` is part of the default.

### D. Quotation PDF
The PDF generation reads `bundleComponentsMap` to list bundle sub-items. After this change, if `item.customComponents` is set, those override the master list in the PDF rendering logic too. Check wherever `bundleComponentsMap` is used in the quotation PDF code and apply the same override pattern.

## Acceptance Criteria
- Adding a bundle to a quotation shows the same component list as before (read-only by default).
- Clicking "Customize" switches to edit mode where components can be removed or new products added.
- Saving the quotation persists the custom component list.
- Re-opening the quotation shows the customized list (not the master bundle).
- Products without a custom override still show the master bundle components.
- Master bundle definition (`product_bundle_items`) is never modified.
- No changes to sales orders (deferred).
