# WhatsApp Webhook 404 — Root Cause Analysis

**Author:** Replit AI (Phase 0 of Task #67)
**Status:** Diagnosis + permanent fix recorded
**Date:** 2026-04-17

---

## Summary

For roughly **3 hours 37 minutes** on 2026-04-17 (between Task #32 merging into `main` and the production deploy that followed), Interakt sent every webhook POST into a 404 because the production bundle running on `erp.itfi.co.in` did not yet contain the `/api/whatsapp/webhook` route. Interakt's webhook delivery system applies exponential backoff after sustained delivery failures, so even after we redeployed and the route became live, deliveries did not resume automatically — the endpoint must be re-saved or re-tested in Interakt's dashboard to clear the backoff state.

This was **not a code bug, a security misconfiguration, or a feature flag**. It is a deployment-process gap: dev runs from source (changes visible immediately), but production only picks up code changes when an operator clicks "Publish." Anyone shipping a new webhook route — or renaming an existing one — without immediately publishing prod will re-trigger this exact failure mode.

---

## (a) What caused the original 404s

**Production was running an older build that did not contain the WhatsApp webhook route.**

Evidence from `git log`:

| Commit | UTC Timestamp | Event |
|---|---|---|
| `2df1058a` | 2026-04-17 05:48:50 | `feat: Complete WhatsApp CRM integration (Task #32)` — the route `app.post("/api/whatsapp/webhook", …)` first appears in `server/routes.ts` |
| (many merges) | 05:48 → 09:25 | Tasks #33–#58 merged into `main`, all WhatsApp-adjacent |
| `0d147e3d` | 2026-04-17 09:25:48 | `Published your App` — first production deploy that includes the webhook route |

During that ~3h37m window, the dev/preview environment (running `tsx server/index.ts` from source) served the route correctly, but production (`node ./dist/index.cjs`) was still serving an older bundle from a previous publish that pre-dated Task #32. Every webhook POST from Interakt to `https://erp.itfi.co.in/api/whatsapp/webhook?token=…` returned 404.

After enough consecutive 404s, Interakt's webhook delivery system did exactly what every webhook provider does: marked the endpoint as unhealthy and applied exponential backoff. This is why deliveries did not resume immediately when the production bundle was rebuilt at 09:25 — Interakt's next attempt was scheduled for some future time per its backoff schedule, and we have no way to override that schedule from our side. Re-saving / re-testing the webhook in Interakt's dashboard resets the backoff.

---

## (b) The exact URL Interakt is currently pointing at

```
https://erp.itfi.co.in/api/whatsapp/webhook?token=itfi_wh_9f3KxL2pQ7vN8rT5zW_secure_2026
```

This URL is configured in Interakt's dashboard, **not in our codebase**. The token query parameter is verified server-side against `process.env.WHATSAPP_WEBHOOK_TOKEN` (`server/routes.ts:6672-6675`). HMAC signature verification on `x-interakt-signature` runs second (`server/routes.ts:6679-6693`). Both must pass for a 200 response.

---

## (c) Env vars / feature flags / build steps that gate WhatsApp routes between environments

**There are none.** A `grep -i "if.*whatsapp|FEATURE_|ENABLE_WHATSAPP|WHATSAPP_ENABLED|skipWhatsapp"` across `server/` returns only legitimate role-check usage (`WHATSAPP_ROLES.has(payload.role)` in `server/wsHub.ts:38`) and storage-method existence checks. The `app.post("/api/whatsapp/webhook", …)` registration is unconditional whenever `server/routes.ts` is loaded.

The only environment variation that matters is the **deployment target itself**:

| Environment | How code is loaded | When new code becomes live |
|---|---|---|
| Dev / preview | `NODE_ENV=development tsx server/index.ts` (from source) | On every file save (workflow auto-restarts) |
| Production | `NODE_ENV=production node ./dist/index.cjs` (built bundle) | Only when operator clicks "Publish" — `npm run build` runs, then the bundle is swapped |

Defined in `.replit`:

```toml
[deployment]
deploymentTarget = "autoscale"
run = ["node", "./dist/index.cjs"]
build = ["npm", "run", "build"]
publicDir = "dist/public"
```

**There is no continuous deployment.** A `git push` to `main` does not trigger a production rebuild. This is the core mechanism behind the 3h37m gap: the route existed in `main` and ran fine in dev for over three hours before anyone published.

The webhook URL itself is also currently **not** sourced from an env var (`WHATSAPP_WEBHOOK_BASE_URL` does not exist in the codebase as of this writeup). The URL is set once in Interakt's dashboard and otherwise lives only in operator memory and replit.md. Adding the env var and surfacing the resolved URL in the admin UI is part of Phase 2 of Task #67 — see "permanent fix" below.

---

## (d) The permanent fix

The class of bug is **production code drift**: webhook routes can exist on `main` and run cleanly in dev for hours or days before an operator clicks "Publish." Combined with Interakt's no-tolerance backoff after sustained delivery failures, any deploy delay on a webhook-changing task re-triggers this same outage.

### What we changed to fix the gap permanently

The fix is layered across all three of: process discipline, code, and detection. None of these alone closes the gap; together they do.

1. **Process — runbook rule:** "Any task that adds, removes, or renames a webhook route, or changes the webhook signing secret, must be followed by an immediate production publish before the agent reports the task complete." This rule will be added to the WhatsApp section of `replit.md` in Phase 4 of Task #67. **(Recorded here as the rule. The replit.md edit ships with Phase 4.)**

2. **Code — discoverable URL:** The webhook URL will be sourced from `WHATSAPP_WEBHOOK_BASE_URL` in any place that constructs or displays it, and the resolved URL will be shown in the admin Webhook Health card (Phase 2 + Phase 3 of Task #67). This makes "is Interakt pointing at the right URL?" an inspectable fact rather than tribal knowledge, which prevents the closely-related failure mode where dev/staging/prod URLs get crossed during environment switches.

3. **Detection — silence detector:** The 6-hour business-hours silence detector (Phase 4 of Task #67) ensures the *next* time a webhook stops arriving — for any reason, deploy gap or otherwise — a red banner fires within 6 hours instead of being discovered manually days later.

### What was NOT a contributing cause and is not being changed

- **Security:** The existing handler already returns HTTP 503 when `INTERAKT_WEBHOOK_SECRET` is missing (`server/routes.ts:6682-6685`). Phase 2 of #67 will tighten this to be `NODE_ENV=production`-gated and add an explicit reason code, but the current behavior is not what caused the outage.
- **Routing:** The route is unconditionally registered. No feature flag, no env-var gate, no conditional `app.post`.
- **Auth:** Both token-check and HMAC verification are working as designed. Interakt was hitting 404 (route missing entirely) — never 401 (auth failure).

---

## Decision: proceed to Phase 1

The diagnosis is complete and points to nothing that changes the scope of Phase 1. The async job queue, slim handler, processing function extraction, and async media sub-job all proceed as originally specified. The "publish-after-webhook-changes" runbook rule and the `WHATSAPP_WEBHOOK_BASE_URL` env var are already in scope for later phases of #67 — no scope creep needed.

**Awaiting tech-team confirmation before starting Phase 1.**
