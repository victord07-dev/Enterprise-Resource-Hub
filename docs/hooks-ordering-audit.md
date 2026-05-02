# React Hooks Ordering Audit — Phase 4 Cleanup E

**Date**: 2026-05-02
**Scope**: Audit (no code changes) of hook-ordering risks across the largest
client pages (`Sales.tsx`, `Inventory.tsx`, `Accounts.tsx`, `SupplyChain.tsx`,
`Pricing.tsx`).

## Why this matters

React's Rules of Hooks require that hooks be called in the same order on every
render. Violations produce subtle bugs ("React has detected a change in the
order of Hooks called by X") that often surface only when:

- A component returns early (e.g. `if (!user) return null;`) **before** all hooks run.
- A hook is called inside a conditional, loop, or callback.
- A hook moves between renders due to a feature flag or role gate.

In a long-lived app with role-based UI gates (`isAdmin`, `isReadOnly`,
`canSeePricing`), these mistakes are easy to introduce.

## Findings — current state

### ✅ Sales.tsx (`client/src/pages/Sales.tsx`)
- All `useState`, `useQuery`, `useMutation`, `useCallback`, `useEffect`
  declarations sit at the top of `Sales()` (lines 1175–~1300) **before** any
  conditional return.
- Role gates (`isAdmin`, `isReadOnly`, `canSeePricing`) are derived **after**
  hooks and gate JSX, not hooks.
- The tab-state hook added in Phase 4 Cleanup F was inserted at the top of the
  hook block (line 1178) to preserve ordering.
- One subtle pattern at line 1191:
  `const inventoryByProduct = useState(() => new Map())[0];` — this is a
  documented React idiom for a stable reference, hook order is preserved.
  **OK as-is**, but a `useRef(new Map())` would be more idiomatic.
  Recommendation: not blocking; defer to a future refactor.

### ✅ Inventory.tsx (`client/src/pages/Inventory.tsx`)
- All hooks declared at top of component (lines 55–88) before any conditional
  branch.
- `urlParamsHandled` uses `useRef` (line 75) for a one-shot flag — correct
  pattern for "run once after first render with data".
- No early returns precede hooks.

### ✅ Accounts.tsx (`client/src/pages/Accounts.tsx`)
- The expense-only branch (`expensesOnly` prop) gates **JSX**, not hooks. All
  `useQuery` calls run unconditionally regardless of `expensesOnly`.
- Multiple sub-form `useState`s declared at the top — order is stable.

### ⚠️ SupplyChain.tsx (`client/src/pages/SupplyChain.tsx`) — minor risk
- The component is large and contains nested sub-components (PR dialog, GRN
  dialog) that each use their own hooks. As long as those sub-components are
  **rendered conditionally** (mounted/unmounted, not skipped via early return
  within the function body), this is safe — and they are.
- **Watch-out for future edits**: do not introduce `if (!editingPr) return null;`
  before the `useToast` / `useMutation` hooks inside `SupplyChain`.

### ✅ Pricing.tsx (`client/src/pages/Pricing.tsx`)
- Hooks all at top, role-gated JSX only. No issues found.

## Lint configuration

The repo's `eslint-plugin-react-hooks` rules `rules-of-hooks` and
`exhaustive-deps` should be on by default with the Vite + React preset. We
verified no rule has been disabled.

If a future PR introduces `// eslint-disable-next-line react-hooks/rules-of-hooks`,
that disable comment is the canary — it almost always indicates a real bug
that should be refactored, not silenced.

## Recommendations (not in this pass)

1. **Adopt `useRef` over `useState(...)[0]`** for stable references like the
   `inventoryByProduct` map in `Sales.tsx:1191`. Functionally equivalent but
   more readable.
2. **Extract long components**: `Sales.tsx` (4253 lines) and
   `SupplyChain.tsx` (2660 lines) would benefit from extraction of dialogs into
   separate components. This naturally enforces hook scoping. Out of scope for
   Phase 4 Cleanup.
3. **Add a CI check** (future) that fails the build if any new
   `react-hooks/rules-of-hooks` disable comments appear.

## Conclusion

No active hook-ordering violations were found. The codebase consistently
follows the convention of "hooks first, then derived values, then JSX, with
role gates applied to JSX only." Phase 4 Cleanup F's tab-state additions to
`Inventory.tsx`, `Sales.tsx`, and `Accounts.tsx` were inserted following the
same convention.
