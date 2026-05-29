---
title: GRN Supplier Challan Fields & File Attachments
---
# GRN Supplier Challan Fields & File Attachments

## What & Why
Two precision enhancements that close real-world audit and compliance gaps:

1. **Supplier Challan Number on GRN** — Record the supplier's own DC number and date on the GRN so warehouse teams can cross-reference the physical delivery document for disputes, audits, and returns. Completes the chain: PO → Supplier DC → GRN → Invoice.

2. **Generic File Attachments** — Upload and link scanned DCs and supplier invoices to their records. Designed as a reusable `attachments` table so future modules (Sales Return, Purchase Return, Debit Notes) use the same system without schema changes.

## Done looks like
- GRN create form has two new optional fields: "Supplier Challan No." and "Supplier Challan Date"
- GRN list row and detail view show the supplier challan reference alongside the internal GRN number
- An "Attachments" panel on the GRN view and Supplier Invoice view lets users upload files (PDF, JPG, PNG; max 10 MB each)
- Uploaded files appear as a list with filename, document type badge ("challan" / "invoice" / "other"), upload date, preview (image thumbnail inline; PDF opens in new tab), download link, and delete button
- Duplicate files are rejected on upload (server checks SHA-256 hash against existing records for the same entity)
- Deleting an attachment performs a soft-delete (record stays in DB with `is_deleted = true`; only admins or the original uploader can trigger it)
- Files are stored in Replit Object Storage — only the URL is saved in the DB
- Server validates: entity exists before saving attachment (prevents orphan files), file type, and file size
- Only authenticated users can upload; only the uploader or an admin can soft-delete

## Out of scope
- Attachments on sales invoices or delivery challans (same system wires in later)
- Mandatory attachment enforcement
- File versioning
- GRN without PO (grnSource field) — deferred
- Attachment tagging (`tags: string[]`) — deferred

## Tasks
1. **Schema** — Add `supplier_challan_number` (text, nullable) and `supplier_challan_date` (date, nullable) to the `goods_receipt_notes` table. Create a new `attachments` table with fields: `id` (uuid pk), `entity_type` ("grn" | "supplier_invoice"), `entity_id` (varchar), `module` ("inventory" | "accounts" | "sales"), `document_type` ("challan" | "invoice" | "other"), `file_url` (text), `file_name` (text), `file_type` (text), `file_size` (integer), `file_hash` (text — SHA-256 of file content for duplicate detection), `uploaded_by` (varchar), `is_deleted` (boolean, default false), `deleted_at` (timestamp, nullable), `created_at` (timestamp). Add a composite index on `(entity_type, entity_id)`. Add insert schema and TypeScript types. Run `npm run db:push` to sync.

2. **Storage** — Add `getAttachments(entityType, entityId)` (filters `is_deleted = false`), `createAttachment(data)`, and `softDeleteAttachment(id, deletedBy)` to the storage interface and implementation. Update `updateGRN` to pass through the two new challan fields.

3. **Backend** — Update the GRN create/update endpoints to accept and persist `supplierChallanNumber` and `supplierChallanDate`. Add three authenticated routes: `POST /api/attachments` — validates entity exists in DB (404 if not), checks file type (pdf/jpg/png only) and size (≤ 10 MB) returning 400 on violation, computes SHA-256 hash and rejects duplicates for the same entity (409), uploads to Replit Object Storage, saves record; `GET /api/attachments/:entityType/:entityId` — lists non-deleted attachments; `DELETE /api/attachments/:id` — soft-deletes (sets `is_deleted = true`, `deleted_at`), returns 403 if the caller is not the uploader or an admin.

4. **UI** — Add supplier challan number + date fields to the GRN create dialog. Show challan reference in the GRN list row and expanded view. Build a reusable `AttachmentsPanel` component: upload button with type/size hint, file list showing document type badge, file name, upload date; for images show a small inline thumbnail, for PDFs show a link that opens in a new tab; each row has a download icon and a delete button (hidden if user is not the uploader or admin). Wire it into the GRN detail view (Inventory page) and the Supplier Invoice expanded row (Accounts page).

## Relevant files
- `shared/schema.ts:433-460`
- `server/storage.ts:1099-1145`
- `server/routes.ts:2886-2970`
- `client/src/pages/Inventory.tsx:385-386,1597-1760`
- `client/src/pages/Accounts.tsx:113,540-610`