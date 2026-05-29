# Late Arrival Request & Approval System

## What & Why
Employees currently have no formal way to notify HR or Admin about a late arrival in advance (e.g., car breakdown, traffic emergency). This feature mirrors the existing leave-request workflow: an employee submits a late-arrival request from their portal with a reason, and HR/Admin approves or rejects it. Approved requests prevent the automatic `half_day` mark that fires when check-in happens after the 9:35 AM grace deadline.

## Done looks like
- In **My Portal → Attendance**, employees see a "Request Late Arrival" button that opens a form asking for: date, expected arrival time, and reason
- Submitted requests appear in a list in My Portal showing status (pending / approved / rejected) and any reviewer note
- Employees can withdraw a pending request before it is reviewed
- In **Employees → Attendance** (or a new "Late Arrivals" sub-tab), HR managers and admins see all pending late-arrival requests with approve / reject actions; rejecting requires a brief reason note
- Approving a request prevents that day's kiosk check-in from being auto-marked `half_day` — the attendance record is set to `present` even if check-in is after 9:35 AM, and a note is added to the record
- Both employee and reviewer receive an in-app notification on status change (consistent with the leave-request notification pattern)
- Late-arrival approvals are visible in the Audit Trail

## Out of scope
- Email/SMS notifications (in-app only)
- Retroactive requests for past dates (date must be today or a future date at request time)
- Integration with payroll deductions

## Steps
1. **Schema** — Add a `late_arrival_requests` table mirroring `leave_requests` with fields: `id`, `employeeId`, `date` (the day of late arrival), `expectedArrivalTime` (text, e.g. "10:30"), `reason`, `status` (pending / approved / rejected), `reviewedBy`, `reviewNote`, `createdAt`. Add the Drizzle insert schema and inferred types. Run `npm run db:push`.
2. **Storage layer** — Add CRUD methods to `IStorage` and `DatabaseStorage`: `createLateArrivalRequest`, `getLateArrivalRequests` (admin sees all, employee sees own), `getLateArrivalRequest(id)`, `updateLateArrivalRequest(id, data)`, `deleteLateArrivalRequest(id)`.
3. **API routes** — Add endpoints: `GET /api/late-arrival-requests`, `POST /api/late-arrival-requests`, `PATCH /api/late-arrival-requests/:id/approve`, `PATCH /api/late-arrival-requests/:id/reject` (body: `{ reviewNote }`), `DELETE /api/late-arrival-requests/:id`. Wire notifications the same way leave-request approval/rejection does it. Log approvals/rejections to the audit trail.
4. **Kiosk attendance integration** — In the `POST /api/kiosk/attendance` check-in handler, before applying the `half_day` penalty for late arrivals (after 9:35 AM), check if there is an approved `late_arrival_request` for that employee on that date. If one exists, set status to `present` and record `lateArrivalApproved: true` in the attendance record notes.
5. **Employee portal UI** — In `MyPortal.tsx`, add a "Request Late Arrival" button in the Attendance section. Clicking opens a dialog with date picker (defaults to today), time input for expected arrival, and reason textarea. Below the button, show a compact list of the employee's own late-arrival requests (date, expected time, status badge, reviewer note if rejected). Add withdraw action for pending requests.
6. **Admin/HR UI** — In `Employees.tsx`, add a "Late Arrivals" sub-tab (alongside the existing "Leave" tab structure). Show a pending requests table with employee name, date, expected time, reason, and Approve / Reject action buttons. Rejecting opens a small popover/dialog for the reason note. Add a history view for approved and rejected requests.

## Relevant files
- `shared/schema.ts:599-610`
- `server/storage.ts:390-430`
- `server/routes.ts`
- `client/src/pages/MyPortal.tsx:142-151,577-608,715-786`
- `client/src/pages/Employees.tsx:744-1015`
- `client/src/pages/Kiosk.tsx`
- `server/routes.ts:5498`
