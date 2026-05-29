# Employee Incentive, Advance Payments & Payroll Export

## What & Why
Extend the employee payroll module with three capabilities:
1. **Incentive per employee** — fixed amount or percentage-of-salary bonus added to net pay
2. **Advance payment recording** — immutable log of cash advances already given to employees, auto-deducted from the matching month's payroll
3. **Payroll CSV export** — download payroll data for all employees filtered by month range
4. **Payslip improvements** — PDF download + fully responsive design matching the attached reference screenshot

No PF (Provident Fund) features are included in this build.

## Done looks like
- Employee create/edit form has an "Incentive" section: type dropdown (None / Fixed / % of Salary) + amount field with inline validation
- Payroll tab has a "Record Advance" button → dialog (employee, amount, date, reason) → saves immutably; no edit or delete
- Advances list in payroll tab shows: Employee | Date | Amount | Reason | Status (Deducted / Pending)
- Payroll table shows Incentive and Advance Deduction columns; net pay reflects both
- "Mark as Disbursed" also marks all matching undeducted advances as deducted and logs each one to audit trail
- "Download CSV" button on payroll tab header: select month range → downloads one CSV with all active employees, all columns including incentive and advance deduction
- Payslip dialog is responsive (full-screen on mobile, card on tablet/desktop) and shows Incentive and Advance Deduction as separate line items; outstanding (unrecovered) advance is flagged in footer
- "Download PDF" button on payslip generates a client-side jsPDF matching the on-screen layout

## Out of scope
- PF (Provident Fund) — explicitly excluded
- Advance repayment tracking, installment plans, carry-forward logic — advances are a single deduction in the matched payroll month
- Edit or delete of recorded advances — advances are immutable after creation
- Partial recovery across months — if net pay is insufficient, net goes to ₹0 and the advance stays undeducted for the next payroll run
- Any changes to attendance, leave, or Field Staff Live Tracking

## Steps

1. **Schema — employees table (alter)** — Add 3 columns to `employees`: `incentiveType` (text, default 'none'), `incentiveAmount` (decimal, default 0). Run `db:push`.

2. **Schema — employee_advances table (new)** — New table with: `id`, `employeeId`, `amount`, `dateGiven`, `reason` (nullable), `isDeducted` (boolean, default false), `deductedInPayrollId` (nullable varchar), `createdBy`, `createdAt`. Add insert schema + types. Run `db:push`.

3. **Storage + API — advances CRUD** — Add `IStorage` methods: `createEmployeeAdvance`, `listEmployeeAdvances` (with filters). Add API routes: `POST /api/employee-advances` and `GET /api/employee-advances?employeeId=&isDeducted=&from=&to=`. No PATCH or DELETE endpoints (advances are immutable).

4. **Extend disburse endpoint** — On `PATCH /api/payroll-status/:id/disburse`, after marking status=disbursed, loop through undeducted advances whose `dateGiven` falls within that payroll month/year, mark each `isDeducted=true` + `deductedInPayrollId=payrollStatusId`, and write one audit log entry per advance (`advance_deducted` type).

5. **Update `getPayrollData()`** — Extend the client-side calculation to accept the advances list. Add: `incentiveAmt` (flat or percent), `advanceDeduct` (sum of pending undeducted advances for this employee in this payroll month), `netPay = earnedSalary + incentiveAmt - advanceDeduct` (floor at 0), `unrecoveredAdvance` (any amount that would make net go negative). Return all new fields.

6. **Employee form — Incentive section** — Add "Incentive" section at the bottom of the employee create/edit form: type selector (None / Fixed Amount / % of Salary) + conditional amount field. Inline validation: amount ≥ 0. Save to the two new columns. Audit-log the change with old vs new values on update.

7. **Payroll tab — Advances sub-section** — Below the payroll table, add an "Advances" card with:
   - "Record Advance" button → dialog with employee selector, amount (required), date (default today), reason (optional) → POST to API → toast → refetch
   - Read-only list table: Employee | Date | Amount | Reason | Deducted (Yes/No badge)
   - Filter controls: employee dropdown + deduction status filter

8. **Payroll table columns** — Add "Incentive" and "Advance Deduction" columns to the payroll table. Update footer totals to include these columns.

9. **Payslip redesign — responsive + new line items** — Convert payslip Dialog to a Sheet on mobile (or use responsive max-width breakpoints). Add Incentive and Advance Deduction line items in the Earnings & Deductions section. If `unrecoveredAdvance > 0`, show a highlighted footer note "Unrecovered Advance: ₹X — will be deducted in next payroll." Keep the existing layout style from the reference screenshot.

10. **Payslip PDF download** — Add "Download PDF" button to payslip dialog. Lazy-load jsPDF (following the existing id-card-pdf.ts pattern). PDF mirrors the payslip layout: dark header with company name, attendance summary grid, earnings/deductions table, net payable footer. File name: `Payslip-[EmployeeName]-[Month]-[Year].pdf`.

11. **Payroll CSV export** — Add "Download CSV" button to payroll tab header. Opens a small popover with from-month/year + to-month/year selectors (defaults to current month). On confirm, generate a CSV client-side with columns: Employee, Department, Company, Gross Salary, Full Days, Half Days, Absent, Earned Salary, Incentive, Advance Deduction, Net Pay. One row per employee per month in range. Download as `Payroll-[FromMonth]-[ToMonth].csv`.

12. **Audit logging — incentive changes** — When an employee's incentive fields are updated, log old and new values to `audit_logs` via `logAction`.

## Relevant files
- `shared/schema.ts:289-302`
- `client/src/pages/Employees.tsx:339-354,656-791,1442-1555`
- `server/routes.ts:3932-3996`
- `client/src/lib/id-card-pdf.ts`
