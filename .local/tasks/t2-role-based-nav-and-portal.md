# Role-Based Navigation & Employee My Portal

## What & Why
Currently all logged-in users see the full admin sidebar and all modules regardless
of their role. This task implements role-gated navigation and builds the personal
"My Portal" page that every employee sees when they log in.

## Done looks like

**Sidebar (role-gated):**
- admin → all modules (unchanged)
- hr_manager → My Portal, Employees, Field Staff (management view), Reports
- field_staff → My Portal, Field Staff (self-service: own trips + own expenses only)
- sales_manager → My Portal, Leads, Sales, Products, Reports
- warehouse_manager → My Portal, Inventory, Supply Chain, Reports
- accountant → My Portal, Accounts, Sales (read-only), Reports
- Navigating to a restricted module redirects to My Portal with an "Access denied" message

**My Portal page (`/my-portal`) — all roles:**
- Profile card: photo placeholder, name, designation, department, join date, salary
- This month's attendance summary: days present, absent, half-day, on-leave counts
- Salary records: table of recent months showing amount and disbursement status
- Announcements section (static for now, populated in T4 or future)

**Field Staff additions to My Portal:**
- My Travel Expenses section: list of own submitted expenses with status badges
  (pending = yellow, approved = green, rejected = red)
- Rejected expenses show rejection reason + "Edit & Resubmit" button that opens
  the existing expense form pre-filled with the rejected expense's data
- After editing, expense resubmits as "pending" (creates new submission, or
  patches existing with status reset to pending)

**Field Staff module (self-service view):**
- Only sees their own trips and their own expense submissions
- Cannot see other employees' data
- Live tracking tab: shows Start Trip / Stop Trip buttons (uses their own employeeId
  derived from the logged-in user → employee link)

**HR Manager field staff view:**
- Sees all employees' trips and expenses
- Approve/reject travel expenses (already exists, ensure HR role is permitted)

## Out of scope
- Notifications system (T3)
- Leave management (T4)
- Any DB schema changes for notifications/leave

## Tasks
1. **Auth context** — Create a `useCurrentUser()` hook in `client/src/lib/auth.ts`
   that returns the logged-in user's role and linked employeeId (fetched from
   `/api/auth/me`). Ensure `/api/auth/me` returns the employeeId of the linked
   employee record. Update `server/routes.ts` GET /api/auth/me to join employees
   table and return employeeId.

2. **Role-gated sidebar** — Update `client/src/components/app-sidebar.tsx` to filter
   navigation items based on the current user's role. Add "My Portal" as the first
   nav item for all non-admin roles. Add a protected route wrapper in App.tsx that
   redirects unauthorized access.

3. **My Portal page** — Create `client/src/pages/MyPortal.tsx` with profile card,
   attendance summary (current month), salary records. Use the logged-in user's
   linked employeeId to scope all queries.

4. **Field staff self-service scoping** — In FieldStaff.tsx, when the logged-in
   role is field_staff, auto-set the employeeId filter to their own employeeId
   and hide the employee selector dropdown. Show only their own expenses and trips.

5. **Travel expense edit & resubmit** — In MyPortal.tsx, rejected expenses show
   an "Edit & Resubmit" button. Clicking opens the expense form pre-filled.
   Submitting patches the expense (resets status to pending, clears approvedAt).
   Add `PATCH /api/travel-expenses/:id` endpoint in routes.ts that allows the
   owning employee to edit and resubmit a rejected expense.

## Relevant files
- `client/src/App.tsx`
- `client/src/components/app-sidebar.tsx`
- `client/src/lib/auth.ts`
- `client/src/pages/FieldStaff.tsx`
- `client/src/pages/Employees.tsx`
- `server/routes.ts`
