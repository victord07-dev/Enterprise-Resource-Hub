---
title: Capacitor Android app server fixes (CORS + API 404)
---
# Capacitor Android App Server Fixes

## What & Why
The Android APK built with Capacitor gets "unexpected token DOCTYPE is not valid JSON" errors because:
1. The server has no CORS headers, so requests from the native app origin (`capacitor://localhost`) may be rejected
2. Any unmatched `/api/*` route falls through to the HTML catch-all in `static.ts` and returns `index.html` instead of a JSON error

These two server-side fixes make the deployed web app compatible with the Capacitor Android client.

## Done looks like
- API requests from the Android Capacitor app are not blocked by CORS
- Any `/api/*` route that doesn't exist returns `{"message": "API endpoint not found"}` (JSON 404) instead of the login HTML page
- The existing web app in the browser continues to work exactly as before

## Out of scope
- Any changes to the Capacitor project or APK itself (user handles that locally)
- Authentication logic changes

## Tasks
1. **Install cors package and add CORS middleware** — Install the `cors` npm package, then add CORS middleware in `server/index.ts` before all routes, allowing origins: `capacitor://localhost`, `https://localhost`, `http://localhost`, and `https://erp.itfi.co.in`. Allow credentials and standard HTTP methods/headers.

2. **Add API 404 JSON handler** — In `server/static.ts`, add a `/api/*` route handler that returns a JSON 404 response immediately before the existing `/{*path}` HTML catch-all. This ensures any unmatched API endpoint returns JSON, not HTML.

## Relevant files
- `server/index.ts`
- `server/static.ts`