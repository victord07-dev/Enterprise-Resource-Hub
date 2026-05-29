# Frontend Perf — Code Splitting, Lazy Libs, Compression, Dashboard Cache

## What & Why

The ERP loads slowly on first paint and on every Reports / Dashboard navigation. Audit found four root causes:

1. **All 23 pages eagerly imported in `App.tsx`** — single ~1.2 MB gzipped JS bundle on first load. The biggest pages (Sales 4 270 lines, Inventory 2 874, SupplyChain 2 709, Products 2 148, Accounts 1 865, SalesInvoices 1 677, Reports 1 589) all download even if the user only visits the Dashboard.
2. **Heavy on-demand libraries are eagerly imported** — `jspdf` (~400 KB) loads for every user even if they never click a download button; `recharts` loads on the Reports page even when the user is on the AR Aging tab.
3. **No HTTP response compression** — every API JSON payload is sent uncompressed.
4. **`/api/dashboard/snapshot` re-runs ~7 SQL queries on every dashboard mount** — no caching, even though the data only changes when an operator writes.

This task delivers route-level code splitting, dynamic imports for heavy libs, Vite vendor chunking, Express compression, and a 30-second in-memory dashboard cache. Result: cold load drops from 3-5 s to <1 s, repeat dashboard hits from ~300 ms to ~5 ms, no API contract changes, no schema changes.

## Done looks like

- First-time login → dashboard fully interactive in **<1 s** on a normal connection.
- Reports page opens **without** loading Recharts; charts only download when the operator clicks the P&L or Cash Flow tab.
- Clicking a PDF download button on PO / Quotation / Challan / ID Card / Reports works exactly as today — same visual output, same byte content — but the jsPDF library was not loaded until the click.
- Hitting the dashboard a second time within 30 seconds returns instantly from cache (visible in server logs as a cache-hit log line).
- Network tab shows API JSON responses with `Content-Encoding: gzip` and ~70-85% smaller payload sizes.
- Sales and Inventory list pages render the first 100 rows immediately with a "Load more" affordance, instead of locking the browser on huge result sets.
- All existing features pass smoke: login, dashboard reconciliation, P&L / Cash Flow / AR / AP reports, PO + Quotation + Challan + GRN + ID Card PDFs, sales-order create flow, GRN flow, payment record flow.
- Every existing route still resolves to the right page; deep-links still work.
- Every existing data-testid is preserved so the test harness keeps passing.

## Out of scope

- **No `staleTime: Infinity` → 30000 change** — current React Query config is correctly tuned for an ERP. Mutations already invalidate, dropping staleTime would cause unnecessary refetches and a perceived slowdown.
- **No `react-window` / virtualization** — Sales and Inventory rows have per-row dialogs and dropdowns that don't survive naive virtualization. Server-side limit + Load More handles 99% of the win; virtualization is a separate future task if rows still feel laggy.
- **No internal edits to `client/src/pages/FieldStaff.tsx`** — the Field Staff Live Tracking task list is currently being redesigned (T1 in_progress) and is in the standing-rule forbidden zone. Page-level lazy load via `App.tsx` is fine; touching the file's internals (e.g. dynamic-importing Leaflet inside it) is not.
- **No database schema changes, no migrations, no `db:push`.** No `drizzle.config.ts` edits.
- **No business-logic changes** — pricing engine, lot engine, FIFO, GST, payment matching, audit logs, margin engine, bundle dispatch all untouched.
- **No API contract changes** — same URLs, same request/response shapes, same status codes. The new `?limit=&offset=` params on Sales/Inventory list endpoints are optional and default to current full-list behavior.
- **No edits to active Phase 4C P&L or Cash Flow report code.** This task runs in parallel; the Phase 4C T8-T17 build will adopt the lazy-import pattern from day one.
- **No `package.json` script edits.** Only adding `compression` + `@types/compression` deps via the package manager.
- **No production data writes.** Standing rule preserved.

## Steps

1. **Route-level code splitting in `App.tsx`** — Convert the 22 non-Login page imports to `React.lazy()`. Keep `Login` eager so the auth screen is instant. Wrap the route tree in `<Suspense>` with a Skeleton-based fallback (new `PageLoader` component using existing `@/components/ui/skeleton`). Remove `SpikeSvg` import + route in the same edit. Verify every route still resolves and deep links still work.

2. **Lazy-load `jspdf` inside the 5 PDF generators** — Replace top-level `import jsPDF from "jspdf"` in `reports-pdf.ts`, `quotation-pdf.ts`, `purchase-order-pdf.ts`, `challan-pdf.ts`, `id-card-pdf.ts` with `await import("jspdf")` inside each `generate*` function. Output bytes must remain identical. Add a small shared helper to avoid 5× duplicate dynamic-import boilerplate.

3. **Lazy-load Reports tabs** — Convert `PLStatement` and `CashFlowStatement` imports inside `Reports.tsx` to `React.lazy`, wrap each in `<Suspense>` so Recharts only downloads when the tab is selected. Existing tabs (overview, ap-aging, ar-aging, daily-pricing) stay eager since they don't ship Recharts.

4. **Vite `manualChunks` configuration** — Add `build.rollupOptions.output.manualChunks` to `vite.config.ts` splitting these vendor libs into their own chunks: `react/react-dom/wouter`, `recharts`, `jspdf`, `@radix-ui/*`, `lucide-react`, `framer-motion`, `date-fns`, `@tanstack/react-query`. Goal: between deploys only the small app chunk re-downloads; vendor chunks stay cached.

5. **Express response compression** — Install `compression` + `@types/compression` via the package manager. Mount `compression()` middleware in `server/index.ts` immediately before route registration (after CORS / json parsers). Belt-and-suspenders: skip compression for any response with `Content-Type: application/pdf` or already-encoded bodies (the middleware does this by default but verify).

6. **`/api/dashboard/snapshot` 30-second in-memory cache** — Add a tiny TTL cache helper in a new file (no extra dep — a `Map<string, { value, expiresAt }>` is sufficient). Cache key includes user role + the from/to date range params. On write to any source table that feeds the snapshot (sales_invoices, customer_payments, supplier_payments, expenses, account_transfers, balance_adjustments) the cache is **not** invalidated explicitly; the 30 s TTL is acceptable for a dashboard summary. Log cache hits / misses for visibility.

7. **Optional pagination on Sales + Inventory list endpoints** — Add `?limit=N&offset=M` query-param support to the Sales (sales-orders, quotations, sales-invoices) and Inventory (inventory-stock) list endpoints. Default behavior (no params) returns the full list — backwards-compatible. Update `Sales.tsx` and `Inventory.tsx` to request `?limit=100&offset=0` and add a "Load more" button that increments offset.

8. **Request logger middleware** — Add `server/lib/request-logger.ts` Express middleware that logs any request taking >300 ms with method, path, duration, and authenticated user role. Mount in `server/index.ts`. Used to identify the next round of slow endpoints after this task ships.

9. **Cleanup** — Delete `client/src/pages/SpikeSvg.tsx` (was a dev spike, agreed for removal at end of Phase 4). Verify all `lucide-react` imports are named (`import { Bell } from "lucide-react"`), not namespace imports — a quick grep already confirmed they are; this is just a verify gate.

10. **Verification** —
   - Smoke 6 PDFs (PO, Quotation, Challan, ID Card, Reports P&L PDF, server-side GRN PDF) for byte/visual parity.
   - Smoke admin dashboard: numbers reconcile to SQL identical to today.
   - Smoke Reports → P&L tab: chart renders, CSV/Excel/PDF download (Phase 4C T7 artifacts intact).
   - Smoke Sales + Inventory: first page loads, Load More works, edit dialogs open.
   - Smoke compression: `curl -H "Accept-Encoding: gzip" -I /api/dashboard/snapshot` shows `Content-Encoding: gzip`.
   - Smoke dashboard cache: hit twice within 30 s, log shows "cache hit" on the second call.
   - Run the e2e testing skill: login as admin, navigate every page, verify no broken routes.

11. **Update `replit.md`** — Add a single line under External Dependencies: "HTTP compression: `compression` middleware." No standing-rule edits, no breach-log edits.

## Architectural constraints (must respect)

- **Standing rule — no production data writes.** This task is code-only; verify nothing in the steps writes to any business table.
- **Standing rule — Field Staff Live Tracking forbidden zone.** Do not open `client/src/pages/FieldStaff.tsx` or any file under the Live Tracking redesign. Page-level lazy load via `App.tsx` (just the import statement) is the only acceptable touchpoint.
- **Backwards-compatible APIs.** No existing caller of any API endpoint should need to change. New `?limit=&offset=` params are optional with safe defaults.
- **Preserve every `data-testid`.** The testing skill depends on them.
- **Phase 4C compatibility.** New report tabs added in T8-T17 will follow the lazy-import pattern; this task should not block or rewind Phase 4C work.
- **`package.json` scripts not edited.** Only dependencies added via the package manager tool.

## Relevant files

- `client/src/App.tsx`
- `client/src/pages/SpikeSvg.tsx`
- `client/src/components/reports/PLStatement.tsx`
- `client/src/components/reports/CashFlowStatement.tsx`
- `client/src/pages/Reports.tsx:23-24`
- `client/src/lib/reports-pdf.ts`
- `client/src/lib/quotation-pdf.ts`
- `client/src/lib/purchase-order-pdf.ts`
- `client/src/lib/challan-pdf.ts`
- `client/src/lib/id-card-pdf.ts`
- `client/src/lib/queryClient.ts`
- `client/src/components/ui/skeleton.tsx`
- `client/src/pages/Sales.tsx`
- `client/src/pages/Inventory.tsx`
- `vite.config.ts`
- `server/index.ts:21-54`
- `server/routes.ts`
- `server/lib/financial-aggregations.ts`
- `package.json`
- `replit.md`

## Estimated impact

| Metric | Before | After (target) |
|---|---|---|
| Initial JS download (gzipped) | ~1.2 MB | ~250 KB |
| Time-to-interactive on dashboard (cold) | 3-5 s | <1 s |
| Repeat-visit dashboard | ~2 s | ~300 ms |
| Reports page open (non-chart tab) | ~1.5 s (drags Recharts) | ~400 ms |
| `/api/dashboard/snapshot` 2nd hit within 30 s | ~200-500 ms | ~5 ms |
| API JSON payload size | full | -70 to -85 % |
| Sales / Inventory first paint with 1000+ rows | locks browser briefly | first 100 rows instant |

## Risk register

| Risk | Likelihood | Mitigation |
|---|---|---|
| Lazy chunk fails to load on flaky network | Very low | `<Suspense>` shows skeleton; React error boundary on import failure |
| jsPDF dynamic import breaks an old browser | Very low | All users on modern Chrome/Edge; Vite already targets ES2020 |
| `compression` middleware corrupts a streamed file response | Low | Middleware auto-skips non-text MIMEs; verify with PDF download smoke |
| Pagination param overlooked by an existing internal caller | Low | No-param default returns full list — backwards-compatible by design |
| Lazy import breaks a deep link | Low | Smoke every route in step 10; `<Suspense>` fallback always renders |
