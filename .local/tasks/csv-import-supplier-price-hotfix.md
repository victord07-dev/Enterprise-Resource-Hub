# Phase 6.5 A1 hotfix — CSV import supplier_price NOT NULL crash

## Problem
Stop-gate item (b) "Commit → new bare supplier visible in SupplyChain" fails with:

> Import failed: null value in column "supplier_price" of relation "supplier_products" violates not-null constraint

Reproduced with `attached_assets/test-brand99_*.csv`, which contains only `name, sku, category, brand, unit_price, unit` — no `distributor_price` column. Dry-run preview is happy ("1 Would Import" + "New brands to auto-create: TestBrand99"); the commit blows up.

## Root cause
`server/routes.ts` ~line 1300-1303 (CSV commit path) inserts `r.distributorPrice` straight into `supplier_products.supplier_price`:

```ts
INSERT INTO supplier_products (supplier_id, product_id, supplier_price, supplier_sku, is_primary)
VALUES (${supplierLinkId}, ${productId}, ${r.distributorPrice}, ${r.supplierSku}, ${isPrimary})
```

`r.distributorPrice` is `null` when the CSV omits the `distributor_price` column. `supplier_products.supplier_price` is `notNull()` in `shared/schema.ts:409`.

The manual product POST/PATCH path uses `ensureSupplierLinkFromBrand` (`server/routes.ts:1428`) which already coalesces `null` → `0`. Only the CSV path was missed in Section A1.

## Fix
1. In `server/routes.ts` ~line 1302, replace `${r.distributorPrice}` for the supplier_price column with `${r.distributorPrice ?? r.unitPrice ?? 0}`. This means:
   - CSVs with `distributor_price` keep working as today.
   - CSVs with only `unit_price` use it as a placeholder supplier_price (matches user expectation when uploading minimal CSVs; operator can refine later in supplier catalog).
   - CSVs with neither default to `0`.
2. Grep `server/routes.ts` for any other `INSERT INTO supplier_products` to confirm no other path has the same bug.
3. No schema change. No client change. Single-line server fix.

## Verification
- Re-upload `attached_assets/test-brand99_1776770803912.csv`; commit succeeds.
- Supply Chain → Suppliers shows new bare "TestBrand99" supplier (with ⚠ Incomplete badge) and one linked product whose supplier_price = 8000.
- Dry-run preview still lists `TestBrand99` under `suppliers_to_auto_create`.
- Manual product create with brand still creates supplier link (regression check on `ensureSupplierLinkFromBrand`).
- Operator can resume stop-gate items (c)–(n).

## Files touched
- `server/routes.ts` (~line 1302)

## Out of scope
- Making `supplier_price` nullable in the schema — would let bad data through.
- UI changes to the import dialog — dry-run already lists `suppliers_to_auto_create` correctly; the bug is server-only.
- Stop-gate items (c)–(n); those continue as planned once this hotfix lands.
