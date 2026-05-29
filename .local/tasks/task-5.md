---
title: In-app notifications system
---
# In-App Notifications System

## What & Why
Employees need to be notified when actions affect them — e.g., when their travel
expense is approved or rejected, or when salary is disbursed. Currently there is
no notification mechanism; employees have to manually check their expense status.

## Done looks like
- A notifications bell icon in the top header bar shows an unread count badge
- Clicking the bell opens a dropdown list of recent notifications (newest first)
- Each notification shows title, message, relative time, and read/unread state
- Clicking a notification marks it as read
- "Mark all as read" button in the dropdown
- Notifications are created automatically server-side when:
  - Travel expense approved → "Your expense of ₹X on [date] was approved"
  - Travel expense rejected → "Your expense of ₹X on [date] was rejected — Reason: [reason]"
  - Payroll disbursed → "Your salary of ₹X for [Month Year] has been disbursed"
- Notifications are scoped to the logged-in user (each user only sees their own)
- Unread count badge disappears once all are read
- Notifications panel also shown in My Portal page (recent 5)

## Out of scope
- Push notifications / mobile push (web in-app only)
- Email notifications
- SMS notifications

## Tasks
1. **Schema + backend** — Add `notifications` table to `shared/schema.ts`:
   (id, userId, type, title, message, isRead, relatedId, createdAt).
   Add to storage interface and implement:
   - `GET /api/notifications` — returns current user's notifications (newest first, limit 50)
   - `PATCH /api/notifications/:id/read` — mark single notification as read
   - `POST /api/notifications/read-all` — mark all as read for current user
   - Internal `createNotification(userId, type, title, message, relatedId?)` helper
   called within existing travel expense approve/reject endpoints and payroll
   disburse endpoint. Run `npm run db:push` to apply schema.

2. **Notification bell UI** — Add a bell icon button in the app header (in App.tsx
   layout). Shows a red badge with unread count. Clicking opens a Popover with the
   notification list. Poll for new notifications every 60 seconds using React Query
   with refetchInterval. Show "No notifications" empty state.

3. **My Portal integration** — In MyPortal.tsx, show the 5 most recent notifications
   in a dedicated "Notifications" card section, with a "View all" link that opens
   the bell popover.

## Relevant files
- `shared/schema.ts`
- `server/routes.ts`
- `server/storage.ts`
- `client/src/App.tsx`
- `client/src/pages/MyPortal.tsx`