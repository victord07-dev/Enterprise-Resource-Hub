---
title: Purchase Request approval & margin UI fixes
---
# Purchase Request & Sales Form Fixes

## What & Why
Three related issues found during daily use:
1. The "Check Margin" button and dialog in the sales/quotation line-item editor is cluttering the form — hide it without removing the code.
2. A purchase request with zero supplier price (unitCost = 0 or null on its items) can be accidentally approved. PRs with zero-cost items should show a warning when opened, and the Approve button should be blocked until costs are set.
3. The "Approve" table button approves the PR instantly without requiring a supplier to be selected first. Clicking Approve should open the PR edit dialog, where the user must select a supplier before being able to approve.
4. When a PR is auto-generated from a sales order, its item unit costs are snapshotted at creation time. If the supplier price was 0 or missing at that moment, the PR item is stuck with unitCost = 0/null and "Convert to PO" fails even after the user later fixes the supplier catalog. Add editable unit-cost fields to the PR item rows inside the edit dialog so the user can correct stale costs.

## Done looks like
- "Check Margin" button and dialog are no longer visible in the line-item editor for both sales orders and quotations.
- Opening a purchase request that has one or more items with unitCost = 0 or null shows an amber/red warning banner: "One or more items have no supplier price set. Set prices before approving."
- The inline Approve button in the PR table no longer approves immediately — it opens the PR edit dialog instead (same as the pencil/edit button), with a note "Select a supplier and confirm prices, then click Approve."
- Inside the PR edit dialog, item rows are visible with editable unit-cost inputs. If any item has unitCost = 0/null those rows are highlighted in amber.
- The "Approve" action inside the dialog is only enabled when: (a) a supplier is selected and (b) all item unit costs are > 0.
- Server-side: the PATCH `/api/purchase-requests/:id` endpoint rejects status → "approved" if supplierId is null, and warns if any item unit cost is 0/null.
- "Convert to PO" no longer fails for PRs whose item costs were stale but have since been corrected through the edit dialog.

## Out of scope
- Removing the MarginSimPanel / margin-related code entirely (just hidden).
- Changing the supplier catalog or supplier_products table structure.
- Any changes to PO, GRN, or sales invoice flows.

## Steps
1. **Hide margin check UI** — Wrap the "Check Margin" button (and its associated dialog) in the `LineItemsEditor` component with a CSS `hidden` class so they're invisible but the code remains intact.
2. **Show zero-cost warning in PR dialog** — When the PR edit dialog opens, query the PR items (already fetched for the matching-suppliers panel) and display an amber warning banner if any item has unitCost = 0 or null.
3. **Add editable unit costs to PR dialog** — Add a PR items table below the supplier selector inside the edit dialog, showing product name, required quantity, and an editable unit-cost input per row. Pre-fill from `prItem.unitCost`. On save, PATCH the PR items unit costs alongside the supplierId/priority/notes.
4. **Wire Approve button to open dialog** — Change the inline "Approve" button in the PR table row to call `openEditPr(pr)` (same as the edit pencil), not the direct approve mutation. Add a visual distinction ("Approve & Save" CTA) inside the dialog when opened this way.
5. **Block approve in dialog when costs are zero** — Disable the dialog's Approve/Submit button when any item unitCost ≤ 0 or when no supplier is selected. Show an inline hint explaining why the button is disabled.
6. **Server-side guard on approve** — In the PATCH `/api/purchase-requests/:id` endpoint, when `status` is being set to "approved": reject (400) if `supplierId` is null; warn (still allow) via response body if any PR item has unitCost = 0 — or block entirely to match the frontend guard.
7. **Add a PATCH endpoint for PR items** — Add `PATCH /api/purchase-request-items/:id` (or include items array in the existing PR PATCH) so the frontend can persist corrected unit costs.

## Relevant files
- `client/src/pages/Sales.tsx:227-246,356,757-774,846-868`
- `client/src/pages/SupplyChain.tsx:869-871,1112-1127,1405-1426,1912-2014`
- `server/routes.ts:5197-5270,5333-5346`