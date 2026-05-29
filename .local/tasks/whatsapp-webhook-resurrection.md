# WhatsApp Webhook Hardening (Async Queue + Diagnostics)

## What & Why
Production is now serving WhatsApp routes after the redeploy, but Interakt has stopped delivering webhook calls — almost certainly because the earlier 404 streak (before the WhatsApp routes shipped to prod) tripped Interakt's delivery-failure backoff. Re-saving the webhook in Interakt will restart deliveries, but this is a recurring failure class unless we fix the underlying architecture: the webhook handler currently does signature check, parse, DB upsert, customer linking, and (potentially) media download all synchronously on the request path. Any slow DB query or stalled CDN response will cause Interakt to time out, log a failed delivery, and eventually back off — exactly what just happened.

This task does three things together: (1) make the webhook response time independent of how slow the actual processing is, by moving processing into a Postgres-backed background job queue with retries and a dead-letter; (2) make every failure mode (rejection, silence, queue lag, dead-lettered jobs) clearly visible to a non-technical admin without needing log access; (3) fail closed in production when secrets are missing, so the inbox can never be poisoned by unsigned webhooks. Plus a short root-cause writeup of the original 404s so we know which configuration or deployment gap to fix permanently.

## Done looks like
- Webhook handler returns HTTP 200 within ~500ms of any valid payload, regardless of how slow downstream processing is. Real work (DB upsert, customer linking, media download, notifications) happens in a background job worker.
- A fresh WhatsApp message lands in the inbox within ~3 seconds of arriving in Interakt, end-to-end.
- In production (`NODE_ENV=production`), if the webhook signing secret is missing or misconfigured, the endpoint rejects every incoming webhook with HTTP 503 until fixed. In dev, it logs a loud warning but accepts (clearly marked "DEV ONLY"). The inbox can never be poisoned by an unsigned payload in prod.
- Permanently failed jobs (after retries) land in a dead-letter table with the full original payload preserved. Admins can view, manually retry, or discard them.
- An admin "Webhook Health" card shows: webhook endpoint p95 response time, job queue lag (age of oldest pending job), last received / accepted / rejected timestamps, count by reason in last 24h, dead-letter count, media-download success rate (24h), outbound delivery success rate (24h), and the silence-banner state.
- For every rejected webhook, the full headers + raw body of the last 20 are captured into a rolling table (with `Authorization`, `X-Interakt-Signature`, and any `*token*` query params redacted). Viewable from the Health card.
- If no webhook is received for >6 hours during business hours (09:00–19:00 IST), a red banner appears on the admin dashboard ("WhatsApp webhook silent for Xh — check Interakt") and one in-app notification fires per silence streak (re-arms after a successful webhook arrives).
- Webhook event subscriptions in Interakt are confirmed to cover: inbound message, message sent, message status (sent/delivered/read), **failed message delivery** (critical for collections — failed payment-reminder messages must surface), and template status updates. Failed outbound messages render with a red badge in the inbox.
- The webhook URL is sourced from an env var (`WHATSAPP_WEBHOOK_BASE_URL`) — never hardcoded — so dev/staging/prod can each point Interakt at the right URL without code changes.
- A short root-cause writeup is committed alongside this task, covering: (a) what was different between pre-redeploy and post-redeploy state, (b) the exact URL Interakt is currently pointing at, (c) whether any env var or feature flag gates the WhatsApp routes between dev and prod, (d) the permanent fix for whatever caused the original 404 streak.
- A new dedicated WhatsApp section in `replit.md` matches the depth of the Sales / Inventory / Accounts sections: tables, roles, inbound/outbound flows, integration endpoints, webhook URL format, signing mechanism, and operator runbook.

## Out of scope
- Backfilling old conversations or messages from Interakt (handled in the follow-up task).
- Daily reconciliation cron (handled in the follow-up task).
- Replacing the Postgres job queue with Redis/BullMQ — Postgres is sufficient at our volume.

## Architectural constraints
- **Async processing is mandatory, not optional.** Synchronous webhook handlers at this scale will keep breaking. The handler does only: signature check → token check → minimal payload validation → enqueue job row → return 200. Total budget ~500ms. Everything else runs in the worker.
- **Postgres-backed job queue, no new infrastructure.** Add a `whatsapp_webhook_jobs` table with states: `pending`, `processing`, `done`, `failed`. Worker is a simple in-process loop polling every 1–2s with `SELECT … FOR UPDATE SKIP LOCKED`. No Redis, no BullMQ.
- **Retries with exponential backoff.** Failed jobs retry up to 5 times with delays of roughly 30s, 2m, 10m, 30m, 2h. Max retries exhausted → move to `whatsapp_webhook_jobs_dead_letter` with the full original payload + last error.
- **Fail closed in prod on missing secret.** `NODE_ENV=production` + missing/empty `INTERAKT_WEBHOOK_SECRET` = HTTP 503 on every webhook until fixed. No silent acceptance ever in prod.
- **Idempotency by Interakt message ID.** The job processor upserts by `interaktMessageId` — re-running a job is a no-op, so retries are safe.
- **The same processing function is used by the live worker, the future backfill, and the future reconciliation job.** This means overlap-window deduplication is automatic.

## Tasks
Execute strictly in the order below. Each phase must be completed and committed before starting the next. No phase-jumping.

### Phase 0 — Root cause (blocks everything; commit + tech-team confirmation required)
1. **Root-cause investigation** — Investigate and document in a short markdown note committed alongside the PR: (a) why the original 404s happened, (b) the exact URL Interakt is currently pointing at, (c) whether any env var, build step, or feature flag gates the WhatsApp routes between environments, (d) the permanent fix. **No other code changes are made until the tech team confirms this writeup.**

### Phase 1 — Async core (get one message flowing E2E, no UI yet)
2. **Postgres job queue tables** — `whatsapp_webhook_jobs` (id, job_type, payload jsonb, status, attempts, next_run_at, last_error, created_at, updated_at) and `whatsapp_webhook_jobs_dead_letter` (id, job_type, payload jsonb, last_error, attempts, created_at, dead_lettered_at).

3. **Processing function (extracted)** — Move all current "what to do with a webhook" logic into a single reusable function: upsert conversation by phone, upsert message by `interaktMessageId`, link to customer/lead, enqueue media-download sub-job, push WS update to clients, fire in-app notifications. Must have exactly one definition; will have one caller in #67 and become three callers in #68.

4. **Slim webhook handler + worker loop** — Strip the handler down to: signature check → token check → minimal payload validation → insert job row → return 200. Add an in-process worker polling every 1–2s with `SELECT … FOR UPDATE SKIP LOCKED`. Worker advances state, applies exponential backoff on failure (~30s, 2m, 10m, 30m, 2h), max 5 retries → dead-letter. **Stuck-job recovery:** the pickup query also reclaims any job in `processing` for >5 minutes back to `pending` and increments its attempts counter so the retry cap still applies.

5. **Async media download (sub-job)** — Message row is inserted immediately with an attachment row in `pending_download` state. A separate worker job type downloads from Interakt's CDN, stores in object storage, updates the attachment row to `ready`. After N failed retries the row shows "Media unavailable — Interakt CDN fetch failed" with a manual retry button on the message.

6. **End-to-end smoke** — Send a synthetic webhook locally; confirm message lands in the inbox via the queue. Do not proceed until this works.

### Phase 2 — Security, observability primitives
7. **Webhook URL via env var** — Read `WHATSAPP_WEBHOOK_BASE_URL` from env in any place that constructs or displays the webhook URL. Never hardcode.

8. **Fail-closed secret check** — In production (`NODE_ENV=production`), reject every webhook with HTTP 503 if `INTERAKT_WEBHOOK_SECRET` is missing or empty. In dev, log a loud warning but accept. Add a startup smoke log: `[WA] webhook signing secret OK` or `[WA] webhook signing secret MISSING — production will reject all calls`.

9. **Reason-code logging** — Replace generic 401s with explicit reason codes and one-line logs: `accept type=<event>`, `reject reason=token_mismatch`, `=hmac_mismatch`, `=secret_missing`, `=parse_error`.

10. **Rejected-payload capture (rolling 20)** — Capture full headers + raw body of the last 20 rejected webhook calls into a small rolling table. Redact `Authorization`, `X-Interakt-Signature`, and any `*token*` query params before storing.

10a. **Defensive media resolver + Object Storage re-host** — **PARTIALLY SHIPPED — full resolver BLOCKED on authoritative Interakt media-resolution endpoint (Option C in flight).**

  **Investigation result:** Web search of `interakt.shop/resource-center` and `docs.interakt.ai` (commit b258b8fa, evidence in `attached_assets/Pasted-This-is-exactly-the-right-behaviour-from-Replit-AI-They_1776423519806.txt`) confirmed: (a) Interakt's webhook docs publish full samples ONLY for outbound status webhooks (`message_api_sent/delivered/read/failed`), all of which show `"media_url": null`; (b) the `message_received` (inbound) webhook payload shape is NOT publicly documented; (c) there is NO publicly documented Interakt endpoint to resolve a media ID to a downloadable URL. The `amped-express.interakt.ai/api/v17.0/{media-id}` rumor is unconfirmed by Interakt. Per user direction: do not guess.

  **Option C in flight (parallel paths to authoritative answer):**
  1. **Support email** drafted in `.local/artifacts/interakt-support-email.txt` — three numbered questions (inbound media payload shape, media-resolution endpoint, rate-limit confirmation across surfaces). User to copy-paste, fill in account ID, send to [email protected].
  2. **Generalised debug payload capture primitive SHIPPED** (this commit). Reusable for any future undocumented Interakt event shape (templates, button responses, interactive messages, location, voice). Driven by env var `WHATSAPP_DEBUG_CAPTURE_TYPES` (comma-separated event types). Caps at 5 rows per (source, eventType) bucket, auto-expires >30d via 04:15 IST nightly cron.
     - Schema: `debug_payload_captures` (id, source, eventType, rawPayload jsonb, notes, createdAt). Pushed.
     - Storage: `captureDebugPayload` / `getDebugPayloadCaptures` / `pruneOldDebugPayloadCaptures`.
     - Webhook hook: fire-and-forget capture on accept if `req.body.type ∈ WHATSAPP_DEBUG_CAPTURE_TYPES`. Never blocks accept.
     - Admin endpoint: `GET /api/whatsapp/debug-captures?source&eventType&limit` (admin-only). Phase 3 Health card consumes.
     - Smoke test: `scripts/debug-capture-smoke.ts` PASSES (5-cap per bucket, prune works, filter works).
     - **To enable in prod:** set env `WHATSAPP_DEBUG_CAPTURE_TYPES=message_received`.

  **Unblocks when:** EITHER one real inbound media payload is captured in prod (admin views via `/api/whatsapp/debug-captures` and shares the JSON shape) OR Interakt support replies with authoritative endpoint docs — whichever lands first.

  **Implementation when unblocked:** In `processMediaDownload`, inspect the webhook media payload: if a `link`/`url` field is present, use it directly; if only an `id` is present, call the now-confirmed Interakt media-resolution endpoint to resolve to a URL. Then download and re-host into Replit Object Storage under `private/whatsapp-media/<sha256>.<ext>`, update the message attachment row from `pending_download` → `ready` with the storage path. Log which path was taken (`media_resolve_path=link` vs `media_resolve_path=id`) on every job. Failures retry with the same backoff schedule and dead-letter on attempt 5; the message row keeps a "Media unavailable — manual retry" affordance.

  **Rate limit (verified during this investigation, for #68 PR description):** Interakt Advanced plan default is **600 messages/minute**, upgradeable to **1000/minute** by request to [email protected]. Source: `interakt.shop/resource-center/interakt-apis-and-webhooks-an-overview`. Per-second burst caps + read-endpoint applicability await support reply.

  **Phase 3, Phase 4 NOT blocked on 10a** (per user direction). Only **Phase 5 verification** remains gated.

### Phase 3 — Admin UI v1 (minimal — keep it small)
11. **Webhook Health card v1** — Admin-only card on the WhatsApp Templates page showing only: last received timestamp, dead-letter count, silence-banner state, expandable rejected-payload viewer (last 20), and the dead-letter list with per-row Retry / Discard buttons. **Dead-letter retry cap:** after 3 consecutive manual retries on the same job all fail, disable the Retry button with tooltip "Permanent failure — discard or escalate." Auto-refresh every 30s.
    > The full SLO card (p95 response time, queue lag, media-download success rate, outbound-delivery success rate) ships in v1.1 once the core has run stably in prod for 24h.

### Phase 4 — Detection, prominence, docs
12. **Silence detector** — Every 15 minutes during business hours (09:00–19:00 IST), check for webhook silence > 6h. Render the dashboard red banner ("WhatsApp webhook silent for Xh — check Interakt"), fire one in-app notification per silence streak (re-arm only on next successful webhook), log a server warning.

13. **Failed-delivery prominence** — Confirm failed-status messages are stored and surface them in the inbox: red badge on the conversation, "Delivery failed" tag on the message. Wire the failed-delivery event subscription in Interakt's dashboard during the manual verification step.

14. **Idempotency verification script** — A small one-off runner script that calls the processing function with the same payload 10 times and asserts exactly one message row + one conversation row exists after. Not a unit test, just a verification tool we run post-deploy.

15. **`replit.md` WhatsApp section** — Write a dedicated section matching the depth of Sales / Inventory / Accounts: tables, roles with WhatsApp access, inbound message flow (Interakt → webhook → job → DB → WS → inbox), outbound message flow, integration endpoints, webhook URL format, signing mechanism, env vars, and the operator runbook ("if deliveries stop, do X; if dead-letter count grows, do Y; if silence banner fires, do Z; if a job is stuck, do W").

### Phase 5 — Manual verification (user action after deploy)
16. **Four-case verification** — Run all four cases on the deployed app and confirm each appears correctly with proper direction, status, and media. **Gating: this verification only runs after task 10a (defensive media resolver + Object Storage re-host) is complete and shipped. Inbound image and inbound PDF must render with the actual file in the inbox, not a placeholder. Task #67 is not marked done until both render correctly.**
    - (a) inbound text from a phone
    - (b) outbound text sent via the app
    - (c) inbound image (must render the actual image, not "Media unavailable")
    - (d) inbound PDF document (must render a working download/preview link, not a placeholder)

## PR description requirements
The PR description for this task must include all of the following so the tech team can validate without re-investigating:

1. **Verified Interakt rate limit** — the actual published per-minute and per-second limits, with a link to the Interakt docs page where you sourced them. Needed for #68 — please confirm during this task.
2. **Measured webhook p95 response time** from a test run of at least 20 synthetic webhook POSTs. Paste the raw timings + computed p95.
3. **`grep` result confirming the shared processing function has exactly one definition and one caller** (will become three after #68). Paste the grep command and its output.
4. **The exact SQL of the worker's job-pickup query** showing `SELECT … FOR UPDATE SKIP LOCKED` and the stuck-job-reclaim condition (`processing` AND `updated_at < now() - interval '5 minutes'`).
5. The Phase-0 root-cause writeup as a committed markdown file in the repo, linked from the PR description.

## Relevant files
- `server/routes.ts:6663-6815`
- `server/whatsapp.ts`
- `server/wsHub.ts`
- `server/storage.ts`
- `server/index.ts`
- `client/src/pages/WhatsAppTemplates.tsx`
- `client/src/pages/Inbox.tsx`
- `shared/schema.ts`
- `replit.md`
