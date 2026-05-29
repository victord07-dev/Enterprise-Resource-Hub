# FieldStaff Leaflet Map Tab Fix

## What & Why
The admin tracking map in `FieldStaff.tsx` throws `Cannot read properties of undefined (reading '_leaflet_pos')` because:
1. The map is initialized via a callback ref the moment its DOM node is connected — but the node belongs to the "tracking" tab, which is NOT the first visible tab for field_staff users (they start on "expenses"). Even for admins, the tab may not be painted and sized yet, so `invalidateSize()` runs on a zero-dimension container causing Leaflet to crash.
2. The timeout protecting `invalidateSize()` is only 100ms — too short for tab transitions.

## Exact Fixes (4 changes, all in `client/src/pages/FieldStaff.tsx`)

### 1. Prevent double-initialization in `adminMapRef` callback
Current (line 159-166):
```
const adminMapRef = useCallback((node: HTMLDivElement | null) => {
  if (adminMapInstance.current) {
    try { adminMapInstance.current.remove(); } catch {}
    adminMapInstance.current = null;
  }
  ...
  if (!node) return;
```
Change to add an early exit if both `node` and `adminMapInstance.current` already exist (double-init guard):
```
  if (!node) return;
  if (adminMapInstance.current) return;   // ← add this guard
```
But keep the cleanup block when `node` is null (unmount path). So the logic becomes:
- If `node` is null → cleanup and return (unmount).
- If `node` is non-null AND instance already exists → skip init (prevent double-init).
- Otherwise → initialize.

### 2. Increase `invalidateSize` timeout from 100ms → 300ms
Line 172: `setTimeout(() => map.invalidateSize(), 100)` → `setTimeout(() => map.invalidateSize(), 300)`

### 3. Add a `useEffect` that calls `invalidateSize` when the tab switches to "tracking"
After the existing `useEffect` hooks, add:
```typescript
useEffect(() => {
  if (activeTab === "tracking") {
    setTimeout(() => adminMapInstance.current?.invalidateSize(), 300);
  }
}, [activeTab]);
```
This ensures the map always gets correct dimensions whenever the user clicks the Tracking tab, regardless of whether the map was already initialized while the tab was hidden.

### 4. Only initialize the admin map when the tracking tab is visible
In `adminMapRef` callback, before creating the Leaflet map instance, check if the container has actual dimensions. If the tab is hidden (display:none or zero height), `node.offsetHeight` will be 0. In that case, skip immediate init — the `useEffect` from step 3 will trigger a resize when the tab becomes active.

Actually a simpler approach: keep the init unconditional (the node is connected when the ref fires, so it has been inserted into the DOM), but rely on the 300ms timeout + the tab-change effect together to recover. The double-init guard (step 1) prevents the crash from multiple ref firings.

## Files
- `client/src/pages/FieldStaff.tsx` — lines 159-173 (adminMapRef callback) and add one new useEffect near line 275

## Done looks like
- No `_leaflet_pos` errors in the browser console
- The tracking map renders correctly for admin when the Tracking tab is opened
- Switching away from Tracking and back re-renders the map tiles without error
