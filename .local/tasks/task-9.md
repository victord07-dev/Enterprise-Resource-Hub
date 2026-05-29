---
title: Field Staff module: active trip clicks, live map filtering, field-staff-only employee dropdowns
---
# Field Staff Module — 3 UI Fixes

## Fix 1: Make active trip cards clickable to show route on map

**Where:** `client/src/pages/FieldStaff.tsx` lines 522-539 (Active Trips card)

The active trip `<div>` has no `onClick`. Add the same `onClick={() => viewTripRoute(trip.id)}` that the Recorded Routes list uses, plus `cursor-pointer` and hover styling to match:

```tsx
<div
  key={trip.id}
  className="flex items-center justify-between gap-2 p-2 rounded-md bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800 cursor-pointer hover:bg-emerald-100 dark:hover:bg-emerald-900/30 transition-colors"
  onClick={() => viewTripRoute(trip.id)}
  data-testid={`active-trip-${trip.id}`}
>
```

Also add a small Eye icon button (same as recorded routes) so it's clear it's interactive.

---

## Fix 2: Live map only shows markers for employees with active trips

**Where:** `client/src/pages/FieldStaff.tsx` in the `useEffect` that renders map markers (around line 238)

Current code falls into `else if (locationLogs && locationLogs.length > 0)` and shows the LATEST location log for every employee who ever has a log — including historical logs from employees who are not currently on a trip (e.g., Mohammed Khan).

**Fix:** Filter `locationLogs` to only entries whose `employeeId` is in the `activeTripsData` list before building `latestByEmp`:

```typescript
// Only show live markers for employees with active trips
const activeEmployeeIds = new Set((activeTripsData || []).map(t => t.employeeId));
const activeLogs = (locationLogs || []).filter(log => activeEmployeeIds.has(log.employeeId));

if (activeLogs.length > 0) {
  const latestByEmp: Record<string, LocationLog> = {};
  activeLogs.forEach(log => { ... });
  ...
} else if (locationLogs && locationLogs.length > 0 && activeEmployeeIds.size === 0) {
  // fallback: show all latest locations only when there are no active trips at all
  ...
}
```

This way: when Vikram Singh starts a trip but has no GPS logs yet, no stale Mohammed Khan markers appear. When he does log GPS points, his marker shows. When there are no active trips at all, the fallback shows recent locations as before.

---

## Fix 3: Employee dropdowns filter to field_staff role only

**Where:** `client/src/pages/FieldStaff.tsx`

Three places currently show all employees:
1. Line ~556: Recorded Routes filter dropdown
2. Line ~670: Expense submission "Employee" dropdown (admin/manager view)

**Fix:** Add a `/api/users` query at the top of the component (same as Employees.tsx does):

```typescript
const { data: users } = useQuery<UserAccount[]>({ queryKey: ["/api/users"] });
```

Then derive a filtered list:
```typescript
const fieldStaffEmployees = employees?.filter(emp =>
  users?.find(u => u.id === emp.userId && u.role === "field_staff")
) ?? [];
```

Replace `employees?.map(...)` with `fieldStaffEmployees.map(...)` in both dropdowns.

Also apply the same filter to the Recorded Routes employee filter dropdown (line ~556).

Add the `UserAccount` type at the top of the file:
```typescript
type UserAccount = { id: string; username: string; role: string };
```

---

## Files
- `client/src/pages/FieldStaff.tsx` — all changes, no backend changes needed