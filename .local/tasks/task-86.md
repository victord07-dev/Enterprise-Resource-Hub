---
title: Field Visit Out/In punch in kiosk
---
# Field Visit Out / In Punch in Kiosk

## What & Why
The kiosk currently supports Lunch Out/In and Tea Out/In break punches. Field staff and other employees who leave the office premises for a client visit or site inspection have no way to log that movement. Adding "Field Visit Out" and "Field Visit In" actions — on the same pattern as Lunch Out/In — lets any employee record when they leave for fieldwork and when they return, without starting a full trip.

## Done looks like
- In the kiosk UI, after checking in, an employee sees a **Field Visit Out** button available alongside Lunch Out and Tea Out
- After tapping Field Visit Out (with selfie + GPS verification), the button changes to **Field Visit In** for that employee for the rest of the day
- After tapping Field Visit In, the employee is back to the normal state
- The kiosk only allows one field visit cycle per day (Field Visit Out → Field Visit In), consistent with the lunch/tea pattern
- The HR/Admin attendance grid in `Employees.tsx` shows Field Visit Out and In times in the attendance detail view
- The employee's own attendance record in My Portal also shows these timestamps if they were logged
- The kiosk action sequencing logic prevents Field Visit Out if one is already open, and prevents Field Visit In if no Field Visit Out was logged

## Out of scope
- GPS route tracking during the field visit (that is handled separately by the trip-tracking system)
- Multiple field visit cycles in one day
- Push notifications when an employee goes out for field visit

## Steps
1. **Schema** — Add `fieldVisitOut` and `fieldVisitIn` timestamp columns (nullable) to the `attendance_records` table. Add `field_visit_out` and `field_visit_in` to the `AttendanceAction` union type used by the kiosk. Run `npm run db:push`.
2. **Storage** — Update `updateAttendanceRecord` or equivalent storage method to handle the two new timestamp fields so they persist correctly.
3. **Kiosk API** — In `POST /api/kiosk/attendance`, extend the action handler to process `field_visit_out` (sets `fieldVisitOut = now`) and `field_visit_in` (sets `fieldVisitIn = now`). Update the action-sequencing logic that decides which buttons to show: Field Visit Out is available when `fieldVisitOut` is null; Field Visit In is available when `fieldVisitOut` is set but `fieldVisitIn` is null.
4. **Kiosk UI** — In `Kiosk.tsx`, add Field Visit Out and Field Visit In to the available-action computation. Add the two buttons with appropriate icons (e.g., `Building2` for field visit out, `CornerDownLeft` for field visit in) and colour coding distinct from lunch/tea buttons. Ensure the kiosk action flow correctly reflects the new states when the QR/ID is scanned.
5. **Attendance display** — In the attendance detail views in `Employees.tsx` (admin grid) and `MyPortal.tsx` (employee's own records), display Field Visit Out and Field Visit In times when present, formatted consistently with the existing Lunch and Tea time display.

## Relevant files
- `shared/schema.ts:274-287`
- `client/src/pages/Kiosk.tsx`
- `server/routes.ts:5498`
- `client/src/pages/Employees.tsx`
- `client/src/pages/MyPortal.tsx`
- `server/storage.ts`