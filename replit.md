# ITFI Group - Enterprise Resource Planning System

## Overview
A custom ERP system for a business dealing in solar panels, electronics, and commodities. It aims to integrate and optimize operations across sales, inventory, supply chain, HR, and project management. The project's ambition is to provide a comprehensive, intuitive, and scalable solution, enhancing operational visibility and strategic planning for a multi-faceted distribution business.

## User Preferences
- Frontend-first development approach
- User wants to review design before backend completion
- Custom JWT auth (no Replit Auth)

## System Architecture
The ERP system is built on a modern web stack, emphasizing a responsive and interactive user experience.

**UI/UX Decisions:**
- **Frontend Framework:** React with TypeScript.
- **Styling:** Tailwind CSS and Shadcn UI components.
- **Data Visualization:** Recharts for dashboards and reports.
- **Color Scheme:** Dark navy blue sidebar, light main content, blue accent color.
- **Currency Format:** Indian Rupee (₹).

**Technical Implementations & Feature Specifications:**
- **Authentication:** Custom JWT-based authentication with role-based access control (admin, sales_manager, warehouse_manager, field_staff, hr_manager, accountant).
- **Core Modules:** Dashboard, Products, Leads (CRM), Sales, Project Management, Inventory, Supply Chain, Field Staff, Accounts, Employee Management, Reports, and Audit Trail.
- **Kiosk Attendance System:** Standalone interface for check-ins/outs with QR scan, selfie capture, and GPS logging.
- **Inventory Management:** Real-time stock levels (Total, Reserved, Available), low stock alerts, stock movements, GRN with weighted moving average costing, incoming stock tracking, and physical stock capping for reservations.
- **Sales & Procurement Workflow:** Comprehensive quotation and order management with discounts, payment tracking, invoice generation, delivery challans, automated purchase requests, and support for warehouse replenishment and drop-shipping. Sales orders support per-item GST rates and HSN codes, and link to fulfillment warehouses.
- **GST Compliance:** Products include `gstRate` and `hsnCode` fields. Sales orders auto-populate GST details and compute `taxAmount` per item.
- **Field Staff Management:** Live location tracking, travel expense submission with GPS, and approval workflows.
- **Employee Management:** Unified system for records, attendance, payroll, leave management with approval workflows, and in-app notifications. Includes a personal employee dashboard (`My Portal`).
- **PDF Generation:** Client-side PDF generation for quotations and purchase orders.
- **Flexible Line Items:** Support for mixed product and service line items in sales documents.
- **PO Management:** Auto-generated PO numbers, dynamic supplier filtering, and cancellation workflow.
- **In-App Notifications:** Real-time user alerts for system events with unread counts.
- **Role-Based Access:** Dynamic sidebar navigation and route protection based on user roles.
- **Sales Invoices (GST-Compliant AR):** Accounts-receivable invoicing generated from dispatched delivery challans, with sequential numbering, B2B/B2C classification, intra-state/inter-state GST splits, HSN codes, and payment tracking.
- **AR Aging Report:** Provides a report of outstanding customer receivables categorized into time bands.
- **GRN Supplier Challan Fields & File Attachments:** GRN records store supplier challan details. A generic `attachments` table supports file uploads (PDF, JPG, PNG; max 10 MB) linked to GRN or supplier invoices, stored in Replit Object Storage with deduplication.
- **Daily Pricing Engine (FIFO Lot Costing):** Implements a FIFO lot-based pricing workflow using `daily_price_sheets`. It calculates `floorPrice` based on landed cost and a minimum margin. GRN confirmation auto-creates draft price sheets. The system tracks `product.needsPricingReview`.
- **Daily Pricing UI + Sales Integration:** Dedicated `/pricing` page for managing product pricing, displaying FIFO lot breakdowns, blended cost, margins, and pressure badges. It includes a comprehensive dialog for creating/submitting/approving price sheets and integrates effective pricing into sales documents.
- **Sales Returns & Credit Notes:** Full sales return workflow with GST reversal, stock ledger entries, and numbered credit notes. Returns are linked to invoices with quantity validation, reason, and attachments.
- **WhatsApp CRM Integration (Interakt):** Full WhatsApp CRM module for inbound/outbound messaging, template management, and campaigns. Features include a dedicated inbox, campaign management, and template CRUD.
- **WhatsApp Webhook Hardening:** Asynchronous webhook handler with queueing, exponential backoff, dead-lettering, and robust error handling. Includes a webhook health dashboard with stats, configuration details, and debug capture capabilities.
- **Operational Expense Tracking:** End-to-end module for recording and analysing day-to-day operational spend (cash, UPI, card, bank transfer, cheque). Field staff are excluded entirely. Sales managers / warehouse managers / HR managers see only entries they paid or created (read-write within 24h of creation, read-only afterwards). Accountants and admins have full visibility; only admins can delete. Recording is available from a dedicated Dashboard "Record Expense" card and from a shared `ExpenseDialog` (category, amount, payment method, date, paid-by, description, optional vendor, notes, linked entity — sales order, delivery challan, customer, project, purchase order or GRN). After save, the dialog stays open so the user can attach receipts (PDF/JPG/PNG, ≤10 MB) without reopening. Accounts › Expenses tab provides:
  - Summary cards (total, count, top category, highest single)
  - Filter bar with date range + presets (today / 7d / 30d / MTD / YTD), multi-select category, paid-by, payment method, search; URL-persisted
  - Sortable table (date, amount, category, paid-by, description) with edit/delete actions and attachment indicators
  - Analytics sub-view with four Recharts visuals: by Category (bar), by Person (bar), Daily Trend (line), Category Share (pie)
  - Categories admin sub-view (admin-only) with inline create/rename, colour/icon, sort order (with up/down reorder controls persisting via `PATCH /api/expense-categories/reorder`), and soft-delete confirmation showing usage count
  - 15 default expense categories seeded eagerly at server startup (idempotent — never duplicates); `scripts/seed-expense-categories.ts` is the canonical seeding script for fresh environments
  - All date filtering (including `scope=today`) uses IST helpers in `shared/datetime.ts` on both client and server
  - Schema: `expenses` (DATE column, FK to `expense_categories` with ON DELETE RESTRICT, FKs to users for paid-by and created-by, indexes on date, category, paid-by, created-by, payment method, and a composite index on linked entity); `expense_categories` with `isActive`, colour, icon, sort order
  - All mutations write structured JSON diffs to the audit trail under modules `expenses` / `expense_categories`
- **Margin Engine & Pricing Reports:** Corrected pricing summary report to use per-product `minMarginPct`, calculates `globalFloor`, and displays `pressureLevel` based on actual margin thresholds.
- **Lot Engine Hardening:** `stock_movements` now stores `grn_id` for FIFO lot consumption. `computeFifoLots` is warehouse-aware and per-product margin-aware. Products include `minMarginPct` and `needsPricingReview` fields.
- **Daily Pricing Engine Spec Compliance:** Enhanced `daily_price_sheets` with `rejected_by` column, improved `effective-price` endpoint to return `source` (today/fallback/none), and added `notifyPricingReviewers` helper for new draft price sheets.
- **Bundle / Kit Engine (Phase 7):** Composite "bundle" products composed of component products (`product_bundle_items`) with `pricingMode` ('manual' | 'auto'). Auto mode computes Σ(component effective price × qty) live via `/api/products/:id/bundle-effective-price`. Bundles invoice as a single GST line; components are informational sub-rows on quotation PDFs. Sales line-item picker warns on per-component stock shortages and blocks discontinued components. Delivery-challan dispatch atomically expands bundles to per-component FIFO stock movements (`referenceType='bundle_dispatch'`, parent SKU/name in notes), pre-checks ALL component shortages in one pass and returns the full `shortages[]` array on failure (transaction rolled back). A nightly 02:00 IST cron flags auto-priced bundles whose computed price drifts >5% from stored `sellingPrice` by setting `needsPricingReview=true` and writing an audit row (`module='products'`, `action='bundle_drift_flag'`); `sellingPrice` is never auto-mutated.

## External Dependencies
- **Database:** PostgreSQL.
- **ORM:** Drizzle ORM.
- **Frontend Routing:** Wouter.
- **State Management:** TanStack React Query.
- **Mapping:** Leaflet.js with OpenStreetMap.
- **PDF Generation:** jsPDF.
- **Object Storage:** Replit Object Storage.
- **WhatsApp Integration:** Interakt API.