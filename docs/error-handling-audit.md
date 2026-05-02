# Error Handling Audit — Phase 4 Cleanup C

**Date**: 2026-05-02
**Scope**: server/routes.ts silent failure sites identified during Phase 4 cleanup.
**Standing rule**: surface bugs, do not silently swallow failures.

## Background

Several `try { ... } catch { /* non-fatal */ }` blocks in `server/routes.ts`
swallowed exceptions without logging. While the underlying operations are
intentionally non-fatal (the parent request still succeeds), the absence of any
log line meant operators could not detect repeated failures or correlate them
with degraded data quality.

## Sites fixed in this pass

All three sites kept their non-fatal semantics — the change is exclusively to
add a `console.warn(...)` so the failure surfaces in workflow logs.

| File | Line (post-edit) | Operation | Why non-fatal |
|---|---|---|---|
| `server/routes.ts` | 1867 | `incrementCustomFieldUsage` (POST `/api/products`) | Custom-field usage counters are an analytics aid; product creation must not roll back if the counter table is briefly unavailable. |
| `server/routes.ts` | 1904 | `incrementCustomFieldUsage` (PATCH `/api/products/:id`) | Same as above — the product update is the user's primary action. |
| `server/routes.ts` | 5185 | Auto-invoice creation on dispatch | Already had `console.error(...)`. Reviewed and left as-is — pattern matches what we want. |

The third originally-flagged site at line 9816 (`requireWhatsappRole`) is a
plain `next()` call with no `try/catch`. After re-inspection it is **not** a
silent-failure site and was removed from this audit's scope.

## Pattern guidance going forward

When wrapping a side-effect that the caller's success does not depend on:

```ts
// Bad — failure is invisible
try { await sideEffect(); } catch { /* non-fatal */ }

// Good — failure logs but doesn't break the request
try {
  await sideEffect();
} catch (e) {
  console.warn("sideEffect failed (non-fatal, <context>):", e);
}
```

Use `console.error` if the failure represents a probable bug (e.g.
auto-invoice generation, role notifications) and `console.warn` if it is a
best-effort convenience (e.g. analytics counters, supplier-link backfills).

## Sites already following the good pattern (no change needed)

- `server/routes.ts:113` — `notifyRoles` outer catch (`console.error`)
- `server/routes.ts:1843` — `ensureSupplierLinkFromBrand` (`console.warn`)
- `server/routes.ts:5185` — Auto-invoice on dispatch (`console.error`)
- `server/routes.ts:5189-5190` — `notifyRoles(...).catch(() => {})` for
  best-effort dispatch notifications. Acceptable: failures here are double-handled
  inside `notifyRoles` itself (see line 113) which already logs. The outer
  `.catch(() => {})` only suppresses unhandled-promise-rejection noise.

## Items deferred (not in this pass)

- A broader sweep for empty `.catch(() => {})` chains across the codebase. We
  found ~12 across `server/routes.ts`; most are `notifyRoles(...)` calls whose
  inner failures are already logged (see above). A future audit can confirm
  each site individually.
