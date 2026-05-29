# Kiosk Account & Wake Lock

## What & Why
Add a dedicated `kiosk` user account that, when logged in, bypasses all navigation and goes straight to the kiosk attendance page. The device screen should stay on automatically (using the browser Wake Lock API) as long as the kiosk page is active. This lets a dedicated tablet or terminal run the attendance kiosk without navigating the rest of the ERP.

## Done looks like
- Logging in as `kiosk` / `kiosk@itfi2026` redirects immediately to `/kiosk` with no dashboard or sidebar visible
- Attempting to navigate to any other route while logged in as kiosk redirects back to `/kiosk`
- The kiosk page keeps the device screen awake (Wake Lock API active) while open, and re-acquires the lock if the tab becomes visible again after being backgrounded
- The kiosk account is auto-seeded on server start (same pattern as admin seeding) so no manual DB step is needed

## Out of scope
- Changing any existing kiosk attendance scanning logic or QR flow
- Managing the kiosk user from the admin Employees UI
- Supporting multiple kiosk accounts

## Tasks
1. **Add `kiosk` role to schema and seed the account** — Add `kiosk` to the user role enum in `shared/schema.ts`, run a DB push to sync, and add server-startup seeding of a user with username=`kiosk`, password=`kiosk@itfi2026`, role=`kiosk` (same pattern as admin seeding).

2. **Redirect kiosk role on login and guard all other routes** — In the login handler, redirect to `/kiosk` when role is `kiosk`. In `App.tsx` / `AuthenticatedLayout`, redirect any `kiosk`-role user away from non-kiosk routes back to `/kiosk`. Remove kiosk from all sidebar navigation entries.

3. **Add Wake Lock API to kiosk page** — In `Kiosk.tsx`, add a `useEffect` that requests a `screen` wake lock on mount, re-acquires it on `visibilitychange` (when tab becomes visible again), and releases it on unmount.

## Relevant files
- `shared/schema.ts`
- `server/routes.ts`
- `client/src/pages/Login.tsx`
- `client/src/App.tsx`
- `client/src/components/app-sidebar.tsx`
- `client/src/pages/Kiosk.tsx`
