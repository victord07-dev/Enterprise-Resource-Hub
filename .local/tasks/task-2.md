---
title: Capacitor geolocation plugin integration
---
# Capacitor Geolocation Integration

  ## What & Why
  The Android app (built with Capacitor) cannot use `navigator.geolocation` reliably
  because the WebView requires a native Capacitor plugin for GPS access on Android.
  Two pages use geolocation: the Field Staff travel expense form and the Kiosk
  attendance check-in. Both need to work in the Android app AND in a regular browser.

  ## Done looks like
  - GPS location works in the Android Capacitor app (no silent failure or empty location)
  - The Kiosk check-in captures GPS coordinates on Android
  - The Field Staff "Get My Location" button returns coordinates on Android
  - Both pages still work correctly in the desktop/browser web app (using native browser geolocation)
  - Android app shows a proper location permission dialog the first time GPS is used

  ## Out of scope
  - watchPosition (not used anywhere in the codebase)
  - Any changes to the backend or location logging API
  - Camera/selfie permission handling (separate concern)

  ## Tasks

  1. **Install @capacitor/geolocation** — Install the npm package. No native Android
     project changes are needed since the user builds the APK locally; the package.json
     change is sufficient for npx cap sync on their machine.

  2. **Create a shared geolocation utility** — Add client/src/lib/geolocation.ts
     with a single async getCurrentPosition() function that:
     - Uses Capacitor.isNativePlatform() from @capacitor/core to detect Android vs browser
     - On native (Android): imports @capacitor/geolocation, requests permissions via
       Geolocation.requestPermissions(), then calls Geolocation.getCurrentPosition()
     - On browser: uses navigator.geolocation.getCurrentPosition() exactly as before
     - Returns a simple { latitude, longitude } object in both cases
     - Wraps the whole thing in a try/catch as a safety net

  3. **Update FieldStaff.tsx and Kiosk.tsx** — Replace the two
     navigator.geolocation.getCurrentPosition() call sites with the new
     shared utility function. Preserve existing error handling and toast messages.

  ## Relevant files
  - client/src/pages/FieldStaff.tsx:189-204
  - client/src/pages/Kiosk.tsx:174-191