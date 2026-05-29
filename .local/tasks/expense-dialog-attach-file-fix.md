# Expense Dialog: Attach File & List Refresh Fix

## What & Why
Two post-deploy bugs were reported on the Operational Expense module:

1. **"Attach File" closes the dialog.** After saving an expense, clicking the **Attach File** button inside the green "Expense Recorded" panel closes the dialog instead of opening the file picker.
2. **Saved expense doesn't appear in the list.** After saving, the user perceives the new expense as missing from the Expenses list.

Primary suspected root cause (shared between both bugs): `AttachmentsPanel` is rendered inside the `ExpenseDialog` `<form>`, but its "Attach File" button (and per-row Preview / Download / Delete buttons) are missing an explicit `type="button"`. The HTML default for a `<button>` inside a `<form>` is `type="submit"`, so any click on those controls submits the form. In post-save ("saved") mode, the form's `handleSubmit` short-circuits with `onOpenChange(false)`, closing the dialog before the file picker can open. Bug #2 may have a second cause beyond this submit-close issue, so both bugs must be verified independently after the fix.

## Done looks like
- After saving an expense, clicking **Attach File** opens the OS file picker; the dialog stays open while the user uploads.
- The "Expense Recorded" green banner remains visible until the user clicks **Done** (or the X close).
- Selecting and uploading a file shows the new attachment row inside the dialog without closing it.
- After clicking **Done**, the saved expense appears immediately in the Accounts → Expenses list (date in range), and Dashboard / summary cards reflect the new total.
- Edit mode still works end-to-end: opening an existing expense, changing the amount, and clicking **Update Expense** closes the dialog and reflects the new amount in the list.
- The same defensive fix applies anywhere `AttachmentsPanel` is hosted inside a parent `<form>`.

## Out of scope
- Any redesign of the saved-mode UX (banner copy, layout, button labels).
- Changes to the upload backend, attachment storage, or audit logging.
- Touching any other dialog/page that already works.

## Steps
1. **Harden `AttachmentsPanel` against accidental form submission.** Add explicit `type="button"` to every interactive `<Button>` inside the panel (Attach File, Preview, Download, Delete). **STOP and pause for user verification before continuing.** The user wants to confirm the root cause is correct by manually testing that the Attach File button now opens the file picker without closing the dialog.

2. **Audit `ExpenseDialog` for the same risk.** Only after the user confirms step 1 fixed Bug #1. Verify every `<Button>` inside the dialog's `<form>` other than the explicit "Record Expense" submit button has `type="button"` (Cancel, Done, optional-details toggle). Add `type="button"` where missing.

3. **Verify both bugs independently — do not assume one fix covered both.** After steps 1+2:
   - Test Bug #2 (Attach File) end-to-end: save an expense, click Attach File, upload a file, confirm the dialog stays open and the attachment row appears.
   - Test Bug #1 (list refresh) separately: save a fresh expense dated today, click Done, confirm the new row appears in Accounts → Expenses with the default 30-day filter and that summary cards (Total / Entries / Top Category / Highest) update.
   - **If Bug #1 is still broken after the type="button" fix**, add a second invalidation on dialog `onOpenChange(false)` for the create path so the list always refetches when the dialog closes after a save. Do not skip this fallback.

4. **Manual regression sweep — must include edit mode.** Re-test:
   - Saved-mode flow with file upload (PDF + JPG).
   - **Edit mode:** open an existing expense, change the amount, click **Update Expense**, verify the dialog closes and the list reflects the new amount. This catches edit-mode regressions, which is why this step exists.
   - Cancel button — should close without submitting.

5. **Capture three PR screenshots** for the merge artefact:
   - **Screenshot 1:** Attach File button has opened the file picker and the dialog is still visible behind it.
   - **Screenshot 2:** An uploaded file appears as an attachment row inside the open dialog.
   - **Screenshot 3:** After clicking Done, the new expense (today's date) is visible in the Accounts → Expenses list.

## Relevant files
- `client/src/components/AttachmentsPanel.tsx:177-291`
- `client/src/components/ExpenseDialog.tsx:140-336`
- `client/src/components/ExpensesTab.tsx:91-150`
- `client/src/pages/Dashboard.tsx:325-385`
