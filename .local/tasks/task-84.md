---
title: Road-following route tracking for field staff
---
# Road-Following Route Tracking for Field Staff

## What & Why
Currently when an admin views a field staff trip, the route is drawn as a straight-line polyline between raw GPS points. This is misleading — it cuts through rivers, buildings, and non-roads. The real route must follow actual roads, exactly like how Zomato, Swiggy, or Uber track their delivery agents.

The fix uses the free OSRM (Open Source Routing Machine) map-matching API, which runs on OpenStreetMap data, to snap the logged GPS trace to actual roads before drawing the polyline.

## Done looks like
- When viewing any completed trip in the Field Staff → Live Tracking tab, the route polyline follows actual roads on the map — no straight lines cutting across terrain
- Live active-trip routes (clicking a live trip to see current path) also show road-snapped paths
- If the GPS trace has fewer than 2 points, the map falls back to drawing the available points directly (no error shown)
- If the OSRM API is unreachable or returns an error, the system falls back gracefully to the straight-line polyline with a subtle console warning (no crash, no blank map)
- OSRM is called client-side only at view time — no server changes or new stored data needed

## Out of scope
- Changing the GPS logging frequency (still every 60 seconds)
- Building a custom routing server
- Modifying the trip start/end flow
- Mobile app (Capacitor) changes

## Steps
1. **OSRM map-matching helper** — Write a client-side async helper function that accepts an array of `{lat, lng, timestamp}` GPS points, batches them into OSRM's map-matching endpoint (`https://router.project-osrm.org/match/v1/driving/{coords}` with `geometries=geojson&overview=full&annotations=false`), and returns a flat array of `[lat, lng]` pairs representing the road-snapped route. Handle OSRM's 100-coordinate limit by splitting large traces into overlapping segments and stitching results. Gracefully return the raw input coordinates on any error.
2. **Wire into trip view** — In `viewTripRoute`, after fetching the raw location logs from the server, call the OSRM helper to snap them to roads before passing to the Leaflet polyline renderer. Show a brief loading state ("Snapping route to roads…") during the async OSRM call.
3. **Wire into live-trip view** — When an admin clicks a live active trip on the map, the existing GPS points for that trip should also be passed through the OSRM helper before drawing the polyline, so the live path also follows roads.

## Relevant files
- `client/src/pages/FieldStaff.tsx:298-316`
- `client/src/pages/FieldStaff.tsx:318-374`
- `client/src/pages/FieldStaff.tsx:207-225`
- `server/routes.ts:5883-5901`