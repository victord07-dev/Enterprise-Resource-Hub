---
title: Operational expense tracking — entry, list, analytics, categories
---
# Operational Expense Tracking

## What & Why
The company has no system to record day-to-day operational expenses — guest hospitality, loading/unloading, fuel, office supplies, software renewals, driver/labour charges during dispatch, vehicle maintenance, etc. These are paid daily by various people (CEO, employees upfront for later reimbursement) and currently go entirely unrecorded. This ticket builds the foundational entry + visibility layer so data starts flowing immediately. Approvals, petty-cash balance, and reimbursement workflow are deliberately deferred to a future ticket once a week of real usage shows what's actually needed.

## Done looks like
- A "Today's Expenses" summary card appears on the Dashboard below "Today's Follow-ups", showing total ₹, count, top category, and a "Record Expense" button. Visible to admin, accountant, sales_manager, hr_manager, warehouse_manager. Hidden from field_staff.
- Clicking "Record Expense" anywhere opens a single shared dialog with the same form, validation, and submit behaviour.
- A new "Expenses" tab inside the existing Accounts page contains a list view (filters + sortable table + summary cards), an Analytics view (4 charts respecting the active filters), and a Categories admin view.
- Filters: date range with presets, category multi-select, paid-by multi-select, payment method multi-select, free-text search. Filter state persists in URL query params.
- Required fields on entry: date (defaults today), category, amount > 0, description, payment method, paid-by (defaults to current user). Optional fields collapsed behind a toggle: vendor name, link to existing entity (Sales Order / Delivery Challan / Customer / Project / Purchase Order / GRN), notes, attachment.
- Attachments use the existing attachments table and AttachmentsPanel component. The string `'expense'` is added to the app-level allow-list of entity types.
- Admin can add, rename, deactivate (soft-delete) and reorder categories. Deactivating a category that has expenses against it shows a confirmation dialog with the usage count.
- Non-admin/non-accountant users see and edit only their own expenses (paid_by_user_id or created_by_user_id matches their id).
- Edit allowed for admin/accountant on any expense; for other roles only on their own expenses created in the last 24 hours. Delete is admin-only.
- Every create/update/delete writes to the existing audit log with module='expenses'. Update entries capture old → new diff for changed fields.
- 15 default categories seeded in this exact order: Hospitality & Guests, Loading / Unloading, Delivery & Logistics, Warehouse Operations, Office Supplies, Utilities, Software & IT, Vehicle Maintenance, Repairs & Maintenance, Marketing & Customer Relations, Legal & Professional, Bank & Finance Charges, Employee Welfare, Events & Celebrations, Miscellaneous.
- All 4 analytics charts render correctly with empty states when no data, and respect the active date range filter.
- replit.md gains a new "Expense Tracking" section matching the depth of Sales / Inventory / Accounts.

## Out of scope
- Petty cash balance tracking (starting balance, deductions, replenishment).
- Reimbursement workflow ("owed to employee" → "marked as reimbursed").
- Approval workflow for expenses above a threshold.
- Bulk CSV upload / import.
- Budget vs actual tracking per category.
- Email/WhatsApp digests or notifications for expenses.
- Linking expenses to GL accounts (no GL exists yet).
- Per-delivery / per-customer cost roll-ups in reports.
- Recurring expense templates.
- Mobile-app-specific layout beyond basic responsive design.
- Modifying or migrating the existing travel expense system in FieldStaff — this is a parallel, fully separate module.
- Export to Tally or any external accounting system.

## Pre-kickoff confirmations (already verified against the codebase)
- **Payment methods** = `cash`, `upi`, `card`, `bank_transfer`, `cheque`. Column name is `payment_method` to match the rest of the codebase (existing tables use `text("payment_method").notNull().default("bank_transfer")`).
- **Linked entity types** = `sales_order`, `delivery_challan`, `customer`, `project`, `purchase_order`, `goods_receipt_note`. All six tables exist in `shared/schema.ts` and all use `varchar` UUID PKs with `gen_random_uuid()`. GRN and PO were added because loading/unloading expenses commonly tie to GRN receipts and vendor-site visits tie to POs.

## Execution discipline (non-negotiable)
1. **Strict phase gating.** At the end of each phase the executor commits and pushes, then **stops and waits for explicit user approval** before starting the next phase. Do not chain phases. Phase 1 must run in a deployed environment and be reviewed before Phase 2 UI work begins. Same discipline applied to Task #67.
2. **Ignore stale auto-injected task lists.** If references appear to WhatsApp, Live Tracking, Task #32, or any other unrelated work, ignore them. Stay on this task only.
3. **PR description requirements** (collected at the end of Phase 3, surfaced incrementally where possible):
   - (a) Migration output from `npm run db:push` showing both new tables and the 15 seeded categories
   - (b) Screenshot of Dashboard "Today's Expenses" card in empty state
   - (c) Screenshot of Dashboard card populated with at least 3 today's expenses
   - (d) Screenshot of `ExpenseDialog` with optional fields expanded
   - (e) Screenshot of Accounts > Expenses list view with 5+ entries and filters applied
   - (f) Screenshot of Analytics sub-view with all 4 charts populated
   - (g) Screenshot of Categories sub-view (admin only)
   - (h) Screenshot of one audit-trail entry for an expense_created action
   - (i) Grep proof showing exactly one definition of `ExpenseDialog` and at least two callers (Dashboard + Accounts)
   - (j) The replit.md diff showing the new Expense Tracking section
   - (k) Screenshot proving a non-admin user cannot see other users' expenses

## Steps
Three phases, one shipping increment per phase. Each phase deploys before the next begins.

### Phase 1 — Foundation: schema + backend + Dashboard card + ExpenseDialog
1. **Schema** — add two tables: `expense_categories` (id, name, description?, is_active, sort_order, timestamps) and `expenses` (id, date, category_id FK NOT NULL ON DELETE RESTRICT, amount decimal(12,2) > 0, payment_method text, description varchar(500), vendor_name varchar(200)?, paid_by_user_id FK NOT NULL, linked_entity_type text?, linked_entity_id varchar?, notes text?, created_by_user_id FK NOT NULL, timestamps). Use `text` columns with Zod enums for payment_method and linked_entity_type to match existing codebase convention (no pgEnum). UUID PKs with `varchar("id").primaryKey().default(sql\`gen_random_uuid()\`)`.
2. **Indexes** — `expenses(date DESC)`, `expenses(category_id)`, `expenses(paid_by_user_id)`, composite `expenses(paid_by_user_id, date DESC)`, `expenses(created_at DESC)`.
3. **Allow `'expense'` as an attachment entity type** — `attachments.entity_type` is plain text with no DB constraint. Only the app-level allow-list and `AttachmentsPanel`'s accepted-types list need updating.
4. **Seed migration** — insert the 15 categories in the exact order above with `sort_order` 1–15.
5. **Storage methods** in `server/storage.ts`: createExpense, listExpenses (with filters + RBAC scoping), getExpenseById, updateExpense (with 24h-window check for non-admin), deleteExpense (admin only), listExpenseCategories, createExpenseCategory, updateExpenseCategory, deactivateExpenseCategory, getExpensesSummary, getExpensesAnalytics.
6. **API endpoints** in `server/routes.ts`: POST /api/expenses, GET /api/expenses (filters via query params), GET /api/expenses/:id, PATCH /api/expenses/:id, DELETE /api/expenses/:id, GET /api/expenses/summary, GET /api/expenses/analytics, GET /api/expense-categories, POST /api/expense-categories, PATCH /api/expense-categories/:id, PATCH /api/expense-categories/:id/deactivate. All endpoints enforce the role matrix and self-scoping.
7. **Build `ExpenseDialog` shared component** — single source of truth for entry. Required fields visible by default. "+ Add more details" toggle reveals optional fields. Form submits via React Query mutation with cache invalidation for both summary and list query keys.
8. **Dashboard card** — add "Today's Expenses" card to `Dashboard.tsx` immediately below the Today's Follow-ups section. Fetch from `/api/expenses/summary?scope=today`. Show total ₹, count, top category, "Record Expense" button. Hide for field_staff. Card refreshes after dialog submits.
9. **Smoke test + Phase 1 stop** — record an expense from the Dashboard card, confirm the card updates, confirm DB row + audit log entry exist. Commit, push, **stop and wait for approval**.

### Phase 2 — Accounts > Expenses tab (list + analytics)
1. **New tab** — add "Expenses" tab to the existing tab strip in `Accounts.tsx`, after current tabs.
2. **List sub-view** — summary cards at top (filtered total, count, top category, highest single expense), filters bar (date range with presets, category multi-select, paid-by multi-select, payment method multi-select, search), sortable table (date / amount / category / paid-by / description / linked entity / attachment indicator), "New Expense" button opens the same shared `ExpenseDialog`. URL query params persist filter state.
3. **Analytics sub-view** — 4 Recharts visualisations sharing the same date range filter: by Category (horizontal bar), by Person (horizontal bar), Daily Trend (line), Category Share (pie). Each has an empty state.
4. **Edit / delete from list** — row-level actions respecting the edit/delete permission matrix (admin/accountant any; other roles own + within 24h; delete admin-only).
5. **Phase 2 stop** — commit, push, **stop and wait for approval**.

### Phase 3 — Categories admin + audit + docs + manual verification
1. **Categories sub-view** (admin only) — list of categories with name, active toggle, sort order, drag-to-reorder. Add new, rename, deactivate. Deactivating a category with existing expenses shows a confirmation: "This category has N expenses against it. Deactivate anyway? Existing entries will keep this category name."
2. **Audit wiring** — every create/update/delete on expenses and on expense_categories writes to `audit_logs` via the existing `storage.createAuditLog({userId, action, module, details})`. Module='expenses' for expense ops; module='expense_categories' for category ops. Update details include a compact diff of changed fields.
3. **Mobile responsiveness** — basic responsive check on Dashboard card, ExpenseDialog, and the Accounts > Expenses list.
4. **replit.md update** — new "Expense Tracking" section with: tables, endpoints, role matrix, dashboard placement, Accounts tab structure, seed category list, out-of-scope items, and a short operator runbook.
5. **Manual verification** — record at least 10 expenses across 5+ categories spanning 3+ dates; 2 with attachments; 1 linked to a real Sales Order; under 3 different user accounts; verify every filter combination; verify all 4 charts render; verify admin can rename a category and non-admin cannot; verify field_staff has no access to any part of this module; verify audit trail.
6. **Final PR** — assemble all 11 PR artefacts (a-k) listed in the Execution Discipline section above.

## Architectural constraints
- New tables use Drizzle ORM following existing patterns in `shared/schema.ts` (column naming, timestamps, FK conventions, `gen_random_uuid()` PKs).
- Monetary fields use `decimal('amount', { precision: 12, scale: 2 })` matching every other monetary column in the codebase.
- All dates stored and interpreted in IST. `date` columns use Postgres DATE; timestamps use TIMESTAMP WITH TIME ZONE.
- Single shared `ExpenseDialog` — imported by Dashboard card and Accounts tab. No form duplication.
- No new third-party dependencies — Recharts, Shadcn UI, React Query, Drizzle, existing `AttachmentsPanel`.
- Reuse existing `storage.createAuditLog` helper. Do not build new audit infrastructure.
- Travel expenses in FieldStaff are completely separate. Do not merge, link, or modify them.
- RBAC enforced server-side in every endpoint. UI hides what server denies but never trusts the UI for security.

## Relevant files
- `shared/schema.ts`
- `server/storage.ts`
- `server/routes.ts`
- `client/src/pages/Dashboard.tsx`
- `client/src/pages/Accounts.tsx`
- `client/src/components/AttachmentsPanel.tsx`
- `replit.md`