# URL Persistence Audit — Phase 4 Cleanup F

**Date**: 2026-05-02
**Goal**: Top-level tabs in primary modules should round-trip through the URL
so refresh, deep-link, and browser-back preserve the user's view.

## Pattern

The reference implementation lives in `client/src/pages/Accounts.tsx`:

```tsx
const [activeAccountsTab, setActiveAccountsTab] = useState<string>(() => {
  const params = new URLSearchParams(window.location.search);
  return params.get("tab") || "invoices"; // "invoices" is the default tab
});

<Tabs
  value={activeAccountsTab}
  onValueChange={(v) => {
    setActiveAccountsTab(v);
    const params = new URLSearchParams(window.location.search);
    if (v === "invoices") params.delete("tab"); else params.set("tab", v);
    const qs = params.toString();
    window.history.replaceState({}, "", `/accounts${qs ? `?${qs}` : ""}`);
  }}
>
```

Key properties:
- **State** is initialised from `?tab=` so deep-link / refresh restores view.
- `onValueChange` updates state **first** (immediate highlight) then writes the
  URL with `replaceState` (no router navigation, no history pollution).
- Default tab value omits `?tab=` to keep URLs short.
- Stale per-tab params (e.g. `?challanId=`, `?highlightGrn=`) are stripped on
  tab change because they belong to a specific tab.

## Module-by-module status (post-Phase-4-F)

| Module | File | Read URL on mount | Write URL on tab change | Notes |
|---|---|---|---|---|
| Accounts | `client/src/pages/Accounts.tsx:65-75, 533-541` | ✅ | ✅ | Reference implementation. |
| Inventory | `client/src/pages/Inventory.tsx:73, 540-554, 893-907` | ✅ (existing `urlParamsHandled` block) | ✅ **Added in F** | Strips stale `highlightGrn` / `challanId` on tab change. |
| Sales | `client/src/pages/Sales.tsx:1175-1185, 2296-2308` | ✅ **Added in F** | ✅ **Added in F** | Was `defaultValue="orders"` (uncontrolled, no persistence). Now controlled. |
| SupplyChain | `client/src/pages/SupplyChain.tsx` | n/a | n/a | Single-tab page (no top-level tabs). Skipped. |
| Reports | `client/src/pages/Reports.tsx` | partial | partial | Out of scope for this pass — has its own filter-state persistence pattern. |
| Field Staff | (per standing rule) | — | — | Live Tracking task list is excluded from this audit. |

## Pitfalls observed

1. **`useLocation` from wouter triggers router state updates.** For tab changes
   we *do not* want a route change — `replaceState` is correct.
2. **`onValueChange` must update local state first.** If you only update the URL
   and let an effect read it back, the active-tab highlight lags by one render.
3. **Default-value branch** (`if (v === "default") params.delete("tab")`) keeps
   URLs clean and matches what the user typed when navigating from the sidebar.
4. **Stale per-tab params** (e.g. `?highlightGrn=...` on Inventory's GRN tab)
   must be stripped when leaving that tab; otherwise re-entering via a
   different route reapplies the wrong highlight.

## Items deferred

- `Reports.tsx` filter persistence (date ranges, product filters) — large
  surface area, separate audit recommended.
- Sub-tab persistence inside Inventory's Stock Movements / Challans filter
  panels — not requested.
- Browser-back integration: currently `replaceState` does not push a history
  entry. If product wants tab changes to be back-button-navigable in the
  future, switch to `pushState` with a popstate listener.
