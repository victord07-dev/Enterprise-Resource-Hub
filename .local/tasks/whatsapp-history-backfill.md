# WhatsApp History Backfill & Reconciliation

## Prerequisite gate
**Do not start this task until #67 has been deployed to production, the four manual verification cases have passed, and the system has run for at least 24 hours with healthy metrics — specifically: dead-letter count = 0 and webhook silence banner has not fired during business hours.** If the dead-letter count is non-zero after 24h, debug that first. We are not building the importer on top of an unstable foundation.

## What & Why
The WhatsApp inbox currently only contains messages received via webhook from the moment the integration went live. All historical chats that exist in Interakt's dashboard (potentially many months of customer conversations) are invisible in our ERP, which means staff must keep using two systems. Build a proper, resumable, idempotent importer that pulls every conversation and message Interakt still retains into our database — including media, status ticks, and customer linkage. Add a recurring reconciliation job that re-syncs the last few days from Interakt's REST API to fill any gaps from missed webhooks (deploys, network blips, Interakt outages). This is what turns the inbox from a forward-only feed into something you can actually replace Interakt's dashboard with.

This task builds on the async job queue and shared processing function from the previous task — backfill, live webhook, and reconciliation all funnel through the same upsert path, so dedup-by-message-ID, media re-hosting, and customer linking work identically across all three.

## Done looks like
- Admin can click "Import history from Interakt" and watch progress: conversations seen, messages imported, media downloaded, errors, plus a list of any failed conversations.
- A "Dry run" toggle is available — when set, the import walks Interakt's API, counts everything, downloads nothing, writes nothing, and reports "would import X conversations, Y messages, Z media files (estimated W MB)" so the operator can size the real run.
- After a real import finishes, every Interakt conversation appears in the inbox under one continuous thread per phone number, ordered by last message.
- Old messages display correctly: text, ticks (sent/delivered/read), inbound vs outbound direction, timestamps, and any media (images / PDFs / voice notes) hosted on our object storage and not on Interakt's CDN.
- Re-running the import is safe — no duplicate messages or conversations appear.
- A daily reconciliation job runs automatically at a scheduled time, pulls the last 7 days from Interakt, and inserts anything the webhook missed. Each run writes a log row showing how many gaps it filled.
- If the reconciliation job itself fails (Interakt API down, our DB unreachable), an in-app notification fires immediately so admins know the safety net stopped working — silent reconciliation failure is the worst possible outcome.
- Admin can see the reconciliation history (last 30 runs) on the WhatsApp Templates / Settings page, plus a list of any conversations that failed during the last backfill.

## Out of scope
- Re-implementing Interakt's analytics or template manager — only conversations + messages + status are imported.
- Backfilling internal notes/annotations (those only exist in our system, never in Interakt).
- Deleting or archiving anything in Interakt.
- Two-way sync of message edits/deletions (WhatsApp doesn't support edit/delete via Business API anyway).
- Auto-starting the backfill on deploy. **Manual-trigger only** — operators run it during a low-traffic window.

## Architectural constraints
- **Reuse the shared processing function from the previous task.** Backfill, live webhook, and reconciliation all upsert through the same code path — one source of truth for conversation creation, message dedup, customer linking, and media re-hosting.
- **Conversation threading: one continuous conversation per phone number.** Interakt's 24-hour session windows are flattened into a single thread per phone.
- **Backfill scope: all available history that Interakt still retains.** No artificial date floor.
- **Idempotency by Interakt message ID.** Every imported message upserts on `interaktMessageId`. Backfill, webhook, and reconciliation all use the same primitive, so the overlap window is handled automatically.
- **Media must be re-hosted to our object storage.** Reuse the existing `attachments` infrastructure. During backfill, media downloads happen via the same async job queue from the previous task — backfill enqueues a download job per media item and moves on, so a slow Interakt CDN can never stall the whole import.
- **Per-file media cap: 25 MB.** Files larger than 25 MB are skipped, the message body is preserved, and a clearly visible "Media too large to import (X MB)" placeholder is stored in the attachments record.
- **Rate limiting: target ~70% of Interakt's documented public-API ceiling.** Verify the current published limit (typically 60–100 req/min) at build time. Configure a token-bucket limiter at ~70% of that. Honour HTTP 429 with exponential backoff (cap ~5 minutes) and resume.
- **Resume on crash.** Persist a checkpoint (last conversation processed, last page cursor) so a paused or crashed run can resume without re-fetching everything.
- **Per-conversation failure isolation.** If a single conversation repeatedly fails (e.g. 10 consecutive 5xx), skip it, record it in a `failed_conversations` list with the last error, and continue. Nothing is silently lost — the failed list is shown in the admin UI for follow-up.
- **Phone normalisation must be audited first.** Before any backfill runs, test the existing `normalisePhone` helper against all five common Indian-number forms (`+919876543210`, `919876543210`, `09876543210`, `9876543210`, with and without spaces). Each must canonicalise to the same E.164. If the helper is weak, fix it first — otherwise we'll get duplicate conversations under different number variants.

## Tasks
1. **Phone normalisation audit & fix** — Test the existing `normalisePhone` helper against the five Indian-number forms. Fix the helper if any case fails. Block the rest of the task on this.

2. **Interakt REST client extensions** — Add paginated fetchers in the WhatsApp helper module for conversations, messages-by-conversation, and media metadata. Handle pagination cursors and 429 backoff. Configure a token-bucket rate limiter at ~70% of Interakt's published ceiling (verify current value at build time).

3. **Backfill checkpoint table** — Add a small DB table (`whatsapp_backfill_runs` or similar) to persist state: status (idle/running/dry_running/completed/failed), started_at, finished_at, last_conversation_cursor, conversations_seen, messages_imported, media_enqueued, media_skipped_oversize, error_count, last_error. Plus a parallel `failed_conversations` table (or column) for per-conversation failures with the last error message.

4. **Backfill engine (with dry-run mode)** — Walk Interakt's conversations newest-first, then for each conversation walk its messages oldest-first. For every message, call the shared processing function (the same one the live webhook worker uses) so dedup, customer linking, and media handling are identical. In dry-run mode, perform reads but no writes — produce final counts only. Per-conversation failures (after retries) skip + log + continue. Update checkpoint after each conversation.

5. **Conversation flattening** — For each unique phone number, ensure exactly one open `whatsapp_conversations` row exists. If multiple Interakt session windows exist for the same phone, merge their messages into the single conversation. Set `customerId` / `leadId` if a phone match exists.

6. **Admin "Import history" UI** — Add a section on the WhatsApp Templates / Settings page (admin-only) with: a "Dry run" button, a "Run import" button (manual-trigger only — no auto-start anywhere), live progress (poll every 2s), the final summary, and the failed-conversations list with the last error per row. Only one backfill (real or dry) may run at a time — show "Already running, started at HH:MM" if clicked again. The most recent backfill's result remains visible after completion.

7. **Daily reconciliation cron** — Schedule a node-cron job (default 04:30 IST, configurable). Each run pulls the last 7 days of conversations + messages from Interakt and runs them through the shared processing function. Writes a `whatsapp_reconciliation_logs` row (started_at, finished_at, gaps_filled_count, error). Notifies admins (in-app) only if `gaps_filled_count > 0` for two consecutive days, so transient blips don't spam. **However**, if the reconciliation job itself errors out (uncaught exception, API completely unreachable, DB error), fire an in-app notification immediately on that single failure — silent failure of the safety net is unacceptable.

8. **Reconciliation history view** — Render the last 30 reconciliation log rows on the WhatsApp Templates / Settings page (admin-only). Highlight rows with `gaps_filled_count > 0` in amber, errored rows in red.

9. **Smoke test & documentation** — Execute the dry-run on production first, eyeball the projected counts, then run a real backfill end-to-end, verify a sample of imported conversations match what Interakt's dashboard shows (text, ticks, media all rendered). Then extend the dedicated WhatsApp section in `replit.md` (created in the previous task) with: backfill workflow, reconciliation workflow, the rate-limit setting, the 25 MB media cap, the manual-trigger procedure, and the operator runbook for "what to do when reconciliation alerts fire" or "what to do when failed_conversations list is non-empty."

## Relevant files
- `server/whatsapp.ts`
- `server/routes.ts:6663-7100`
- `server/storage.ts`
- `server/index.ts`
- `shared/schema.ts`
- `client/src/pages/Inbox.tsx`
- `client/src/pages/WhatsAppTemplates.tsx`
- `replit.md`
