# Unified Employee + Login Account Creation

## What & Why
Currently, employee records and login accounts are completely separate. All existing
employees have userId=null (no login). When admin adds an employee, there is no way
to also create their system login account in the same step.

This task adds a "Login Account" section to the Add/Edit Employee dialog so admin
can create the employee and their portal login in one unified flow.

## Done looks like
- "Add Employee" dialog has a new optional "Login Account" section at the bottom
- Fields: Username (auto-filled from email, editable — phone number also accepted),
  Password, Role (dropdown: field_staff, hr_manager, sales_manager, warehouse_manager, accountant)
- If the Login Account section is filled → employee + linked user account are created
  together, employee.userId is set to the new user's id
- If left blank → employee created without system access (as today)
- "Edit Employee" dialog shows current linked account username/role if one exists,
  and allows assigning a login account to employees who don't have one yet
- Admin can also reset the password for an existing linked account from the edit dialog
- Existing /api/users endpoint remains for standalone user management
- Username must be unique — clear validation error shown if duplicate

## Out of scope
- Employee self-service password change (covered in T2/My Portal)
- Any changes to the sidebar or portal pages (T2)

## Tasks
1. **Backend: combined create endpoint** — Add `POST /api/employees` to optionally
   accept login account fields (username, password, role). If provided, create the
   user record first, then link the employee to it via userId. Add
   `PATCH /api/employees/:id/account` to assign or update the linked user account
   (username, role, optional new password).

2. **Frontend: Add Employee dialog update** — Add a collapsible "Portal Access" section
   to the employee form with username (auto-populated from email), password, and role
   select. Show a badge "Has Login Access" or "No Access" on each employee row in the
   table. In the Edit dialog, show existing account details with a "Reset Password" option.

## Relevant files
- `client/src/pages/Employees.tsx`
- `server/routes.ts`
- `server/storage.ts`
- `shared/schema.ts`
