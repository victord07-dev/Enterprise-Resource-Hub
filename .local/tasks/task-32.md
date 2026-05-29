---
title: WhatsApp CRM Integration (Interakt)
---
# WhatsApp CRM Integration (Interakt)

## What & Why
Integrate Interakt's WhatsApp Business API into the ERP so employees can conduct
sales conversations, send quotations/invoices, run bulk campaigns, and receive
automated owner alerts — all without leaving the app.
This transforms the system from a pure ERP into an ERP + CRM + WhatsApp sales channel.

## Done looks like
- A full-featured `/inbox` page in the sidebar (admin, sales_manager, field_staff) shows conversations left, chat centre, customer timeline right.
- Employees can send free-text session messages (24-hour window open) or approved template messages at any time. A banner is shown when the window is closed.
- A "Send via WhatsApp" button on each quotation/sales order opens a modal to pick a template, preview it, and send via Interakt.
- `/campaigns` page (admin + sales_manager) sends bulk WhatsApp messages in rate-limited batches with per-recipient feedback.
- `/settings/whatsapp-templates` (admin only) manages template records.
- CRON jobs at 09:00 and 18:00 send a summary alert to all admin WhatsApp numbers.
- Incoming messages arrive at `POST /api/whatsapp/webhook`, verified by HMAC signature, and persisted; inbox polls every 10 seconds (paused when tab is hidden).
- Message delivery ticks (✓ / ✓✓ / ✓✓ blue / ✗) are driven by Interakt status webhooks matched to outbound messages via `interaktMessageId`.
- Conversations support assignment, internal notes, and fixed-set tags.
- Opening a conversation immediately resets its unread count to zero.

## Out of scope
- AI chatbots or automated conversation flows
- WhatsApp analytics dashboard
- Multi-language bot responses
- Green-tick verification (handled on Meta/Interakt side)
- Interakt contact sync (customers managed in existing tables)
- Campaign scheduling, drafts, and partial retry

## Architecture notes

### Provider
Interakt (https://api.interakt.ai). Outbound messages:
`POST https://api.interakt.ai/v1/public/message/`
`Authorization: Basic <base64(INTERAKT_API_KEY)>`

### Webhook security (MANDATORY — two layers)
**Primary — HMAC Signature Verification:**
Interakt sends an `X-Interakt-Signature` header (HMAC-SHA256 of raw request body, signed with your webhook secret). Verify on every request using `express.raw()` to preserve the raw body:
```typescript
import crypto from 'crypto';

function verifyInteraktSignature(
  rawBody: Buffer,
  signature: string,
  secret: string
): boolean {
  const expected = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex');
  return crypto.timingSafeEqual(
    Buffer.from(expected),
    Buffer.from(signature)
  );
}
// If verification fails → return HTTP 401, log the attempt, do not process.
```

**Secondary — Query param token:**
Also verify `?token=<WHATSAPP_WEBHOOK_TOKEN>`. Reject if missing or mismatched.

### Environment secrets required
The executor must call the environment-secrets skill to prompt for all three:
- `INTERAKT_API_KEY` — authenticates outbound API calls
- `WHATSAPP_WEBHOOK_TOKEN` — secondary webhook query-param check
- `INTERAKT_WEBHOOK_SECRET` — HMAC signature verification on inbound webhooks

### Phone number normalisation (MANDATORY — apply everywhere)
WhatsApp numbers must be in E.164 format: digits only, with country code, no `+`.
Example: `+91 98765 43210` → `919876543210`

Implement in `server/whatsapp.ts`:
```typescript
export function normalisePhone(raw: string): string {
  // Strip all non-digit characters
  const digits = raw.replace(/\D/g, '');
  // If Indian number entered without country code (10 digits starting with 6-9)
  if (digits.length === 10 && /^[6-9]/.test(digits)) {
    return `91${digits}`;
  }
  return digits;
}
```

Apply `normalisePhone()` on:
- Webhook inbound: before looking up customer by phone
- Outbound send: before calling Interakt API
- Campaign fan-out: before each recipient send
- CRON alerts: before sending to admin phones

All phone numbers stored in `whatsapp_conversations.phoneNumber` must be normalised. Run `normalisePhone()` at **write time**, not read time.

### DB tables (add to shared/schema.ts)

**whatsapp_conversations**
```sql
id                  VARCHAR PRIMARY KEY,          -- uuid
customerId          VARCHAR NULL,                 -- FK to customers; NULL if no match
phoneNumber         VARCHAR NOT NULL,             -- normalised E.164, always set
assignedEmployeeId  VARCHAR NULL,
status              VARCHAR(20)
                    CHECK (status IN ('open', 'closed')),
lastMessageAt       TIMESTAMP,
windowExpiresAt     TIMESTAMP NULL,               -- NULL when closed or window elapsed
tags                TEXT[]
                    CHECK (tags <@ ARRAY[
                      'Hot','Negotiation','Closed Won','Lost','Follow-up'
                    ]),
unreadCount         INTEGER DEFAULT 0
```
`phoneNumber` is always stored (normalised). `customerId` is nullable for cases where the incoming phone does not match any customer record.

**whatsapp_messages**
```sql
id                  VARCHAR PRIMARY KEY,
conversationId      VARCHAR NOT NULL,             -- FK → whatsapp_conversations.id
direction           VARCHAR(10)
                    CHECK (direction IN ('inbound', 'outbound')),
type                VARCHAR(20)
                    CHECK (type IN ('text', 'template', 'note', 'document')),
body                TEXT,
templateName        VARCHAR NULL,
status              VARCHAR(20)
                    CHECK (status IN ('sent', 'delivered', 'read', 'failed'))
                    NULL,                         -- NULL for inbound and notes
interaktMessageId   VARCHAR NULL,                 -- stored from Interakt API response;
                                                  -- required for status tick matching
senderEmployeeId    VARCHAR NULL,                 -- NULL for inbound messages
createdAt           TIMESTAMP DEFAULT NOW()
```

**whatsapp_templates**
```sql
id                    VARCHAR PRIMARY KEY,
name                  VARCHAR NOT NULL,           -- internal display name
interaktTemplateName  VARCHAR NOT NULL,           -- exact name in Interakt dashboard
languageCode          VARCHAR DEFAULT 'en',
category              VARCHAR(30)
                      CHECK (category IN (
                        'quotation','invoice','payment_reminder','alert','custom'
                      )),
bodyContent           TEXT,                       -- with {{1}} placeholders
variables             TEXT[],                     -- ordered list of variable names
isActive              BOOLEAN DEFAULT TRUE
```

### Conversation lifecycle (CRITICAL — follow exactly)
When an inbound message arrives at the webhook:
1. Verify HMAC signature → reject HTTP 401 if invalid
2. Verify `?token` query param → reject HTTP 401 if invalid
3. `normalisePhone(incoming phone number)`
4. Look up customer WHERE `normalisePhone(phone) = normalisedPhone`
5. Search for conversation WHERE `status = 'open'` AND (`customerId` matches OR `phoneNumber` matches)

   **IF found:**
   - Add message to that conversation
   - Set `windowExpiresAt = NOW() + 24 hours`
   - Increment `unreadCount + 1`
   - Update `lastMessageAt = NOW()`

   **IF NOT found:**
   - Create new conversation with `status = 'open'`
   - Set `customerId` = matched customer id (or `NULL` if no match)
   - Set `phoneNumber` = normalised incoming phone
   - Set `windowExpiresAt = NOW() + 24 hours`
   - Set `unreadCount = 1`
   - Add the inbound message to the new conversation

**Rules:**
- Closed conversations are **NEVER** reopened. Always create a fresh one.
- Only inbound messages extend `windowExpiresAt`. Outbound messages and notes do NOT reset it.
- On `status → 'closed'`, simultaneously set `windowExpiresAt = NULL`.
- `POST /api/whatsapp/conversations` is for **explicit admin creation only**. If an open conversation already exists for the same customer, return it (HTTP 200) — never create a duplicate.

### Unread count behaviour
- Incremented by 1 on every inbound webhook message.
- When an employee opens a conversation (selects it), the frontend immediately calls `PATCH /api/whatsapp/conversations/:id` with `{ unreadCount: 0 }`. The unread badge disappears.

### 24-hour window
The UI checks `windowExpiresAt > NOW()`:
- **Window open**: show free-text composer + template button + attachment button
- **Window closed/null**: show "24-hour window closed — use a template" banner + template-only button

### Notes vs messages
Internal notes: `direction = 'outbound'`, `type = 'note'`. Never sent to Interakt. Displayed with yellow background and 🔒 label, visible to employees only.

### interaktMessageId — storage on send (MANDATORY)
After every successful outbound Interakt API call, store the returned message ID:
```typescript
const response = await sendTemplateMessage(...);
// Interakt returns: { result: true, id: "msg_abc123" }

await db.update(whatsappMessages)
  .set({ interaktMessageId: response.id, status: 'sent' })
  .where(eq(whatsappMessages.id, localMessageId));
```
This is **required** for status tick matching. When Interakt sends a status webhook (delivered/read), it includes the original message ID. Without storing it, tick indicators (✓✓ blue) cannot work.

### Direct send rate limiting
`POST /api/whatsapp/conversations/:id/send` must return **HTTP 429** if more than 20 messages are sent to the same `conversationId` within a rolling 60-second window. Use an in-memory counter keyed by `conversationId`.
```typescript
// TODO: move to Redis at scale
```

### Campaign rate limiting
`POST /api/whatsapp/campaigns/send` processes in **batches of 10** with a **100ms delay** between batches. Returns:
```json
[
  { "customerId": "...", "phone": "...", "status": "sent" },
  { "customerId": "...", "phone": "...", "status": "failed", "error": "..." }
]
```
Campaign scheduling, drafts, and partial retry are out of scope.

### CRON alert template
Pre-approved Interakt template:
- **Name**: `owner_daily_alert`
- **Body**: `"Hi {{1}}, daily ERP summary: {{2}} overdue invoices, {{3}} unpaid supplier bills, {{4}} pending salary approvals. Please review."`
- **Variables**: `[ownerName, overdueCount, supplierDueCount, salaryPendingCount]`

Must be created and approved in Interakt dashboard before production use.

**Admin phone resolution (MANDATORY):**
1. Fetch `users WHERE role = 'admin'`
2. Join to `employees` table to get phone number
3. Apply `normalisePhone()` to each number
4. Skip admins with no phone — `logger.warn(\`Admin user ${userId} has no phone number — skipping CRON alert\`)`
5. On send failure — `logger.warn(\`owner_daily_alert send failed for ${phone}: ${error}\`)` — do NOT throw, do NOT crash the process

### Polling
Inbox polls every 10 seconds. Pause when `document.visibilityState === 'hidden'`; resume on `visibilitychange`.
```typescript
// TODO: replace polling with WebSocket at scale
```

## Tasks

1. **Install dependencies & environment setup** — Install `node-cron`; prompt for `INTERAKT_API_KEY`, `WHATSAPP_WEBHOOK_TOKEN`, and `INTERAKT_WEBHOOK_SECRET` via the environment-secrets skill; create `server/whatsapp.ts` exporting: `normalisePhone(raw)`, `verifyInteraktSignature(rawBody, signature, secret)`, `sendTextMessage(phone, text)`, `sendTemplateMessage(phone, templateName, languageCode, bodyValues, headerValues?)`, and `sendDocumentMessage(phone, url, filename)` — all using Interakt's API with proper Basic auth header.

2. **Database schema** — Add all three tables to `shared/schema.ts` with insert/select types (include `phoneNumber NOT NULL` on conversations, all CHECK constraints); run `npm run db:push`.

3. **Backend API routes** — Implement in `server/routes.ts`:

   | Method | Route | Notes |
   |--------|-------|-------|
   | POST | `/api/whatsapp/webhook` | HMAC + token verify; full lifecycle logic; store `interaktMessageId` on status updates; increment `unreadCount` on inbound |
   | GET | `/api/whatsapp/conversations` | List with last message, unreadCount, customerName, assignedEmployee, window-open status (`windowExpiresAt > NOW()`) |
   | GET | `/api/whatsapp/conversations/:id/messages` | Paginated message history |
   | POST | `/api/whatsapp/conversations/:id/send` | Check window for text; rate limit 20/60s; persist with `status='sent'`; store `interaktMessageId` from response |
   | POST | `/api/whatsapp/conversations/:id/note` | `direction='outbound'`, `type='note'`; never forwarded to Interakt |
   | PATCH | `/api/whatsapp/conversations/:id` | Update assignedEmployeeId, status, tags, or reset `unreadCount=0`; set `windowExpiresAt=NULL` when `status→'closed'` |
   | POST | `/api/whatsapp/conversations` | Admin creation only; return existing open conversation (HTTP 200) if duplicate |
   | POST | `/api/whatsapp/generate-pdf` | Auth check first (403 if insufficient role) → generate → upload to Object Storage → return public URL |
   | GET/POST/PATCH/DELETE | `/api/whatsapp/templates` | Full CRUD for template records |
   | POST | `/api/whatsapp/campaigns/send` | Batched fan-out; 10 per batch; 100ms delay; return per-recipient result array |

4. **CRON owner alerts** — In `server/index.ts`, register two `node-cron` jobs (`0 9 * * *` and `0 18 * * *`). Each queries for overdue AR invoices, unpaid supplier invoices, and pending salary approvals; fetches admin phones via `users JOIN employees`, applies `normalisePhone()`; sends `owner_daily_alert` template; skips and logs if no phone; logs and continues on send failure.

5. **Inbox UI (`/inbox`)** — Build `client/src/pages/Inbox.tsx` with three panels:
   - **Left**: Search bar; tabs (All / Assigned to me / Unassigned); per conversation: customer name, last message preview, timestamp, tags, unread badge, green dot when `windowExpiresAt > NOW()`. On select: call `PATCH /:id { unreadCount: 0 }`, clear badge.
   - **Centre**: Inbound grey bubbles left-aligned, outbound blue right-aligned, notes yellow right-aligned with 🔒; tick indicators per outbound (✓ sent / ✓✓ delivered / ✓✓ blue read / ✗ failed); composer shows free-text input + template + attachment buttons when window open, or "24-hour window closed — use a template" banner + template-only button when expired; `/` quick-reply picker. Polls messages every 10 seconds with `// TODO: replace with WebSocket at scale`; pauses on `visibilityState === 'hidden'`.
   - **Right**: Linked Quotations, Orders, Invoices, Payments; assignment dropdown; tag picker (Hot / Negotiation / Closed Won / Lost / Follow-up); "Create Quotation" and "Create Order" quick actions with pre-filled `customerId`.

6. **Campaigns UI (`/campaigns`)** — Build `client/src/pages/Campaigns.tsx` with customer multi-select + search, template picker, variable value inputs, send button with batch progress bar, and results table showing per-customer sent ✓ / failed ✗ with error reason.

7. **Template Manager (`/settings/whatsapp-templates`)** — Admin-only page with table of templates and create/edit dialog for: display name, Interakt template name, language code, category, body with `{{1}}` syntax, variables list, active toggle.

8. **Sales integration** — Add "Send via WhatsApp" button to Quotation expanded view and Sales Order detail view in `client/src/pages/Sales.tsx`. Modal pre-selects quotation template, fills customer phone via `normalisePhone()`, auto-populates variables (quotation number, amount), previews filled template, sends via conversations send endpoint.

9. **Sidebar & routing** — Register `/inbox`, `/campaigns`, `/settings/whatsapp-templates` in `client/src/App.tsx` and `client/src/components/app-sidebar.tsx`:

   | Page | Icon | Roles |
   |------|------|-------|
   | `/inbox` | MessageCircle | admin, sales_manager, field_staff |
   | `/campaigns` | Megaphone | admin, sales_manager |
   | `/settings/whatsapp-templates` | Settings | admin |

## Relevant files
- `shared/schema.ts`
- `server/routes.ts`
- `server/index.ts`
- `server/whatsapp.ts` ← new
- `client/src/App.tsx`
- `client/src/components/app-sidebar.tsx`
- `client/src/pages/Inbox.tsx` ← new
- `client/src/pages/Campaigns.tsx` ← new
- `client/src/pages/Sales.tsx`
- `client/src/pages/Leads.tsx`