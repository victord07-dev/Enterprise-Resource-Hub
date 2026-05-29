---
title: Kiosk user account
---
# Kiosk User Account

  ## What & Why
  Add a dedicated `kiosk` user account that, when logged in, bypasses all navigation and goes straight to the kiosk attendance page. This lets a dedicated tablet or terminal run the attendance kiosk without navigating the rest of the ERP.

  ## Done looks like
  - Logging in as `kiosk` / `kiosk@itfi2026` redirects immediately to `/kiosk` with no dashboard or sidebar visible
  - Attempting to navigate to any other route while logged in as kiosk redirects back to `/kiosk`
  - The kiosk account is auto-seeded on server start (same pattern as admin seeding) so no manual DB step is needed

  ## Out of scope
  - Wake Lock API or screen-on behavior
  - Changing any existing kiosk attendance scanning logic or QR flow
  - Managing the kiosk user from the admin Employees UI

  ## Tasks
  1. **Add `kiosk` role to schema and seed the account** — Add `kiosk` to the user role enum in `shared/schema.ts`, run a DB push to sync, and add server-startup seeding of a user with username=`kiosk`, password=`kiosk@itfi2026`, role=`kiosk` (same pattern as admin seeding).

  2. **Redirect kiosk role on login and guard all other routes** — In the login handler, redirect to `/kiosk` when role is `kiosk`. In `App.tsx` / `AuthenticatedLayout`, redirect any `kiosk`-role user away from non-kiosk routes back to `/kiosk`. Remove kiosk from all sidebar navigation entries.

  ## Relevant files
  - `shared/schema.ts`
  - `server/routes.ts`
  - `client/src/pages/Login.tsx`
  - `client/src/App.tsx`
  - `client/src/components/app-sidebar.tsx`