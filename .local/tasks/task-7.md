---
title: Employee dialog scroll fix
---
# Employee Dialog Scrollable Fix

## What & Why
The Add/Edit Employee dialog is taller than the screen height on smaller displays. Users cannot scroll inside it, so fields at the bottom (like the Portal Access section) are cut off and unreachable.

## Done looks like
- The employee Add/Edit dialog is fully scrollable — users can scroll up and down to reach all fields
- The dialog title stays visible at the top and the Save button stays accessible at the bottom
- The dialog does not overflow the viewport or get clipped on any screen size

## Out of scope
- Changes to other dialogs (QR, payslip, reject leave, etc.)

## Tasks
1. **Make the employee dialog scrollable** — Constrain the DialogContent to a max height and make the inner form area scrollable, while keeping the title header and footer action buttons fixed/visible.

## Relevant files
- `client/src/pages/Employees.tsx:1000-1110`