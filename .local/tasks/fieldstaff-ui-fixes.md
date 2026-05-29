# Field Staff Module — Comprehensive Tracking Improvements

## Verified already working (no changes needed)
- Polyline drawing (blue #3b82f6, origin/destination markers) ✓
- Completed trip route from Recorded Routes tab ✓
- `POST /api/trips/:id/log` backend endpoint ✓
- `GET /api/trips/:id/route` backend endpoint ✓
- `haversineDistance()` function already in component ✓
- `activeTripsData` already has `refetchInterval: 30000` ✓

---

## Fix 1: Make active trip cards clickable to show route on map

**Where:** Active Trips card (~line 522)

Add `onClick={() => viewTripRoute(trip.id)}` + `cursor-pointer` + hover styles to the active trip card div. Add a small Eye icon to signal it's interactive.

---

## Fix 2: Live map — only show markers for employees with active trips

**Where:** map markers `useEffect` (~line 261)

Filter `locationLogs` to only `employeeId`s present in `activeTripsData`.  Fall back to showing all recent logs only when `activeTripsData` is empty.

---

## Fix 3: Employee dropdowns — field_staff only

**Where:** Recorded Routes filter + Expense submission employee select

Add `useQuery<UserAccount[]>({ queryKey: ["/api/users"] })`. Derive:
```typescript
const fieldStaffEmployees = employees?.filter(emp =>
  users?.find(u => u.id === emp.userId && u.role === "field_staff")
) ?? [];
```
Use `fieldStaffEmployees` in both dropdowns.

---

## Fix 4: Periodic GPS location logging during active trip

**Where:** New `useEffect` for field_staff with `myActiveTrip`

Every 30 seconds: get GPS → POST to `/api/trips/${myActiveTrip.id}/log` → invalidate `/api/location-logs`.  
Cleanup interval on unmount or when trip ends.

---

## Fix 5: Live location auto-refresh on admin map

**Where:** `useQuery` for locationLogs + map markers useEffect

- Add `refetchInterval: 30000` to the `locationLogs` query (it currently has none) so it auto-refreshes
- The existing map markers useEffect already depends on `locationLogs`, so it will redraw automatically when the query refetches

```typescript
const { data: locationLogs } = useQuery<LocationLog[]>({
  queryKey: ["/api/location-logs"],
  refetchInterval: 30000,   // ← add this
});
```

---

## Fix 6: Field staff tracking indicator card

**Where:** Field staff view, near the Start/Stop trip buttons (~line 450)

When `isFieldStaff && myActiveTrip`, show a small status card below the Start/Stop button area:

- Pulsing green dot + "Location tracking active"
- Trip duration (elapsed time since `myActiveTrip.startTime`, updated every second with `setInterval`)
- Estimated distance covered — computed from the field staff's own location logs for this trip (fetch from `/api/trips/${myActiveTrip.id}/route` and sum haversine segments)
- Use a `useEffect` with a 1-second interval for the live elapsed-time clock; clean up on unmount

---

## Fix 7: Location accuracy check before logging

**Where:** In the 30-second location logging interval (Fix 4)

`getCurrentPosition` from `@/lib/geolocation` returns `{ latitude, longitude, accuracy? }`.  
Before POSTing, check: `if (accuracy && accuracy > 100) return;` — skip the point silently.

```typescript
const { latitude, longitude, accuracy } = await getCurrentPosition({ enableHighAccuracy: true });
if (accuracy && accuracy > 100) return; // skip low-accuracy points
```

---

## Fix 8: Background location logging resilience (retry on GPS failure)

**Where:** Inside the 30-second interval callback

If `getCurrentPosition` throws (GPS unavailable), catch and schedule a single retry after 10 seconds using a one-shot `setTimeout`:

```typescript
} catch {
  // GPS failed — retry once after 10 seconds
  setTimeout(async () => {
    try {
      const { latitude, longitude, accuracy } = await getCurrentPosition({ enableHighAccuracy: true });
      if (accuracy && accuracy > 100) return;
      await fetch(`/api/trips/${myActiveTrip.id}/log`, { ... });
      queryClient.invalidateQueries({ queryKey: ["/api/location-logs"] });
    } catch { /* give up until next 30s tick */ }
  }, 10000);
}
```

---

## Fix 9: Trip duration + distance on admin Active Trips card

**Where:** Active Trips card (~line 522)

For each active trip in the admin view, show:
- Duration: `Math.floor((now - new Date(trip.startTime)) / 60000)` minutes, updated live
- Distance: derived from location logs for that trip; sum haversine over sorted points

The distance for active trips can be derived client-side from `locationLogs` (already fetched) filtered to `log.tripId === trip.id`.

Add a live clock for the trip duration: use a `useState(Date.now())` + 1-second `setInterval` to force re-renders for the duration display.

---

## Fix 10: Offline queuing for location logs

**Where:** Inside the 30-second interval, wrapping the `fetch` call

If the API POST fails (network error), store the point in `localStorage` under key `"pending_location_logs"` as a JSON array of `{tripId, lat, lng, timestamp}`.

On the next successful POST (or on interval tick), check for queued items and flush them first:

```typescript
const QUEUE_KEY = "pending_location_logs";

const flushQueue = async (token: string) => {
  const queue: Array<{tripId: string; lat: number; lng: number; timestamp: string}> =
    JSON.parse(localStorage.getItem(QUEUE_KEY) || "[]");
  if (!queue.length) return;
  const remaining = [];
  for (const item of queue) {
    try {
      await fetch(`/api/trips/${item.tripId}/log`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ lat: item.lat, lng: item.lng }),
      });
    } catch {
      remaining.push(item);
    }
  }
  localStorage.setItem(QUEUE_KEY, JSON.stringify(remaining));
};
```

Call `flushQueue(token)` at the start of each interval tick before logging the new point.

---

## Files
- `client/src/pages/FieldStaff.tsx` — all changes
- No backend changes needed
