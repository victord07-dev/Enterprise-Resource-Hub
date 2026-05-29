---
title: Leave management system
---
# Leave Management System

## What & Why
Employees currently have no way to formally request time off. HR has no visibility
into leave requests or remaining balances. This task adds a leave request flow:
employees submit requests from their portal, HR approves or rejects from the
Employees module.

## Done looks like

**Employee (My Portal):**
- "Request Leave" button opens a dialog with: leave type (annual/sick/casual/unpaid),
  start date, end date, and reason
- "My Leave Requests" list shows all their requests with status badges
  (pending / approved / rejected) and the review note if rejected
- Rejected requests can be withdrawn (deleted) to free up the slot

**HR Manager (Employees module — new "Leave Requests" tab):**
- Table of all pending leave requests across all employees
- Each row shows: employee name, leave type, dates, duration (days), reason
- Approve or Reject buttons; rejection requires a brief note
- Approved/rejected history filterable by employee or month
- Simple leave balance summary per employee (annual: 12/yr, sick: 6/yr, casual: 6/yr —
  calculated from approved leaves in the current calendar year)

**Notifications (integrates with T3):**
- When HR approves a leave → notification to employee: "Your leave request for [dates] was approved"
- When HR rejects a leave → notification to employee: "Your leave was rejected — [note]"
- (If T3 is not yet merged, leave notifications are silently skipped via try/catch)

## Out of scope
- Leave carry-forward / complex policy rules
- Holiday calendar integration
- Payroll deduction for unpaid leave (future)

## Tasks
1. **Schema + backend** — Add `leaveRequests` table to `shared/schema.ts`:
   (id varchar PK, employeeId, type, startDate, endDate, reason, status default "pending",
   reviewedBy, reviewNote, createdAt). Add to storage interface.
   Endpoints:
   - `GET /api/leave-requests` — admin/hr sees all; employee sees own (filter by
     req.user's employeeId)
   - `POST /api/leave-requests` — employee submits (employeeId from linked employee)
   - `PATCH /api/leave-requests/:id/approve` — hr_manager/admin only
   - `PATCH /api/leave-requests/:id/reject` — hr_manager/admin only, requires reviewNote
   - `DELETE /api/leave-requests/:id` — employee can delete own pending request
   Run db:push to apply schema.

2. **My Portal — leave request UI** — In MyPortal.tsx, add a "Leave Requests" card
   with a "Request Leave" button and the employee's own leave history table.
   Form: leave type select, date range picker (two date inputs), reason textarea.

3. **HR — Leave Requests tab** — In Employees.tsx, add a "Leave Requests" tab
   alongside the existing Staff / Attendance / Payroll tabs. Shows a table of all
   pending requests with Approve / Reject action buttons. Reject opens a small
   dialog for the review note. Also add a "History" sub-tab with approved/rejected
   leave records.

## Relevant files
- `shared/schema.ts`
- `server/routes.ts`
- `server/storage.ts`
- `client/src/pages/MyPortal.tsx`
- `client/src/pages/Employees.tsx`