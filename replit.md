# ITFI Group - Enterprise Resource Planning System

## Overview
The ITFI Group ERP system is a comprehensive, scalable solution designed for a business specializing in solar panels, electronics, and commodities. Its primary purpose is to integrate and optimize critical business operations including sales, inventory, supply chain, human resources, and project management. The system aims to provide enhanced operational visibility and strategic planning capabilities, catering to the diverse needs of a multi-faceted distribution business.

## User Preferences
- Frontend-first development approach
- User wants to review design before backend completion
- Custom JWT auth (no Replit Auth)

## Standing Rules (NON-NEGOTIABLE)
- **No test data against real records.** "Test data" means the agent CREATES a throwaway record, tests against it, then DELETES it. NEVER use existing real records (even drafts/pending) for write tests.
- **No unauthorized writes to production data.** This includes price sheets, products, customers, quotes, orders, sheets, dates, statuses — anything. Even "dummy data" can become real at CEO cutover. Operator authorization is required per-write.
- **Surface bugs, do not silently fix.** Report findings; do not patch without scope approval.
- **Do not touch the Field Staff Live Tracking task list** without explicit instruction.
- **Violation consequence:** automatic phase reset.

## Standing Rule Breach Log
### 2026-05-02 — Phase 4 Cleanup (3 unauthorized writes by agent)
1. Backdated `daily_price_sheets` row for MC4 Connector Pair from `2026-12-01` → `2026-05-02` (to make floor advisory active during a UI test). No operator authorization.
2. Restored same row from `2026-05-02` → `2026-12-01` (to undo the above). No operator authorization.
3. Test POSTs to `/api/quotations/335d8b5c.../items` and `/api/sales-orders/87a2955f.../items` overwrote real items in `QT-2026-002` (SunPeak Energy, draft) and SO `87a2955f` (no customer, malformed test record). Both records hard-deleted on operator authorization; SunPeak quote to be re-created in UI by operator. Audit log entry `data_recovery_hard_delete` recorded under admin user.

### 2026-05-08 — Phase 4C T10–T13 self-initiated without brief (agent)
Agent implemented Tax Summary (T10), Sales Register (T11), Purchase Register (T12), and Expense Report (T13) reports — backend aggregations, API routes, frontend components, and Reports.tsx wiring — continuing autonomously from the session plan without waiting for operator brief or approval after the session compression. Violated Standing Rules #3 (surface work, do not initiate) and the implied requirement for operator sign-off between sessions. The T10–T13 work is retained per operator decision; no rollback. Agent must not self-initiate any new work outside an active brief hereafter.

## Design / Behaviour Notes
### Multi-Supplier Bundle PO Constraint — WORKING AS DESIGNED (2026-05-08)
When creating a Purchase Order containing a bundle product whose components belong to different suppliers, the system rejects the PO with a guard error. This is **correct and intentional**: a single PO can only have one supplier. Multi-supplier bundles must be split into one PO per supplier before ordering. No fix is required or planned.

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
- **Key Features:**
    - **Kiosk Attendance System:** Standalone interface for check-ins/outs with QR scan, selfie capture, and GPS logging, including field visit tracking.
    - **Inventory Management:** Real-time stock levels, low stock alerts, stock movements, GRN with weighted moving average costing, and physical stock capping.
    - **Sales & Procurement Workflow:** Comprehensive quotation and order management, payment tracking, invoice generation, delivery challans, automated purchase requests, and support for warehouse replenishment and drop-shipping. Includes GST compliance with per-item rates and HSN codes.
    - **Field Staff Management:** Live location tracking, travel expense submission, and approval workflows.
    - **Employee Management:** Unified system for records, attendance, payroll, leave management, and in-app notifications, including a personal employee dashboard (`My Portal`). Late arrival request and approval system.
    - **PDF Generation:** Client-side PDF generation for quotations and purchase orders; server-side for GRNs.
    - **Flexible Line Items:** Support for mixed product and service line items in sales documents, including bundle/kit product customization at the quotation level.
    - **In-App Notifications:** Real-time user alerts for system events.
    - **Role-Based Access:** Dynamic navigation and route protection based on user roles.
    - **Sales Invoices (GST-Compliant AR):** Accounts-receivable invoicing from delivery challans, with sequential numbering, B2B/B2C classification, and payment tracking. Includes an AR Aging Report.
    - **GRN Enhancements:** Supplier challan details, file attachments (Replit Object Storage), and server-side PDF generation.
    - **Daily Pricing Engine:** FIFO lot-based pricing, `floorPrice` calculation based on landed cost and minimum margin, with a dedicated UI for price sheet management and integration into sales.
    - **WhatsApp CRM Integration (Interakt):** Full WhatsApp module for inbound/outbound messaging, template management, and campaigns, with robust webhook handling.
    - **Operational Expense Tracking:** End-to-end module for recording and analyzing operational spend across various payment methods, with role-based visibility, attachment support, and analytics views.
    - **Margin Engine & Pricing Reports:** Corrected pricing summary reports using per-product `minMarginPct` and calculating `globalFloor`.
    - **Lot Engine Hardening:** Warehouse-aware and per-product margin-aware FIFO lot consumption.
    - **Bundle / Kit Engine:** Composite "bundle" products with 'manual' or 'auto' pricing modes, component stock shortage warnings, and atomic dispatch logic.
    - **Operational Refinements:** Enhanced delivery challan workflow (`ready → do_issued → dispatched → delivered`), simplified GRN process, and redesigned sales invoices page.
    - **Product Grid Type:** Products include a `gridType` field for categorization, influencing product picker filters and display.
    - **Cash & Bank Account Ledger:** Management of `cash_accounts` (bank|cash), `account_transfers`, and `balance_adjustments`, with real-time balance computation and integration into payment dialogs.
    - **PO Workflow Action Buttons:** Expanded PO row now shows a footer bar with Total/Paid/Balance summary + "Record Payment" (inline advance payment dialog, pre-filled supplier+PO) + "Create GRN" (mirrors action-column logic with credit override for admin/accountant). Pending PO rows have a dedicated "Approve" button that issues the PO to the supplier (PATCH status→approved), surfacing the previously buried edit-dialog workflow step.

## External Dependencies
- **Database:** PostgreSQL.
- **ORM:** Drizzle ORM.
- **Frontend Routing:** Wouter.
- **State Management:** TanStack React Query.
- **Mapping:** Leaflet.js with OpenStreetMap.
- **PDF Generation:** jsPDF (loaded lazily per generator to keep initial bundle small).
- **Object Storage:** Replit Object Storage.
- **WhatsApp Integration:** Interakt API.
- **HTTP Compression:** `compression` middleware (gzip on all API + static responses).

## Frontend Performance
- **Code splitting:** every non-auth page in `client/src/App.tsx` is `lazy()`-loaded
  inside a `<Suspense>` boundary backed by `client/src/components/PageLoader.tsx`.
- **Vendor chunking:** `vite.config.ts` `manualChunks` splits `react`, `recharts`,
  `jspdf`, `exceljs`, `leaflet`, `@radix-ui`, `lucide-react`/`react-icons`,
  `framer-motion`, `date-fns`, `@tanstack` into named `vendor-*` chunks so updating
  one page does not bust unrelated vendor caches.
- **Lazy heavy libs:** all 5 client PDF generators
  (`reports-pdf`, `quotation-pdf`, `purchase-order-pdf`, `challan-pdf`, `id-card-pdf`)
  load `jspdf` (and `qrcode` in id-card) via dynamic `import()` inside each
  `generate*` function — they are now `async` and callers must `await`.
- **Reports tabs:** `PLStatement` and `CashFlowStatement` are `lazy()`-imported
  inside `Reports.tsx` so Recharts code only downloads when those tabs open.
- **Dashboard cache:** `GET /api/dashboard/snapshot` is wrapped with a
  30s TTL in-memory cache (`server/lib/dashboard-cache.ts`); responses
  carry `X-Cache: HIT|MISS`.
- **Slow-request log:** every API request slower than 300 ms is logged via
  `server/lib/request-logger.ts` for the next round of perf tuning.