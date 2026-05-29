---
title: Fix Field Staff page crashes (useMemo + hr_manager access)
---
# Fix Field Staff Page Crashes

  ## What & Why
  Two bugs introduced in Task #9 are breaking the Field Staff page:
  1. `useMemo` is called inside the component but not imported from React — this causes a hard runtime crash ("useMemo is not defined") that prevents the page from loading at all for every user role.
  2. The `/api/users` endpoint is restricted to `admin` only, but `hr_manager` (who can also open the Field Staff page) now calls it to derive the field-staff-only employee dropdowns. The 403 silently empties both the Recorded Routes filter dropdown and the Expense employee dropdown for hr_manager users.

  ## Done looks like
  - Field Staff page loads without any runtime errors for all roles (admin, hr_manager, field_staff)
  - Recorded Routes employee filter and Expense employee dropdown both show only field-staff employees — for both admin and hr_manager users
  - No browser console errors related to useMemo or 403 on /api/users

  ## Out of scope
  - Any new features or UI changes beyond fixing these two bugs

  ## Tasks
  1. **Add useMemo import** — Add `useMemo` to the existing React import line in FieldStaff.tsx. This is a one-word change that fixes the page crash.
  2. **Fix /api/users role guard** — Extend the `GET /api/users` route to also allow `hr_manager` role (alongside `admin`), so the field-staff employee dropdown works correctly for hr_manager users on the Field Staff page. Only read access is needed — POST /api/users (create user) can remain admin-only.
  3. **Restart the server** — Restart the dev workflow so the backend change takes effect.

  ## Relevant files
  - `client/src/pages/FieldStaff.tsx:1`
  - `server/routes.ts:430`