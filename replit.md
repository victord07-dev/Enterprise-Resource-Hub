# ITFI Group - Enterprise Resource Planning System

## Overview
A custom ERP system for a business dealing in solar panels, electronics, and commodities. It aims to integrate and optimize operations across sales, inventory, supply chain, HR, and project management. Key features include a secure JWT-based authentication system with role-based access control and nine core modules designed for efficiency and data-driven decision-making. The project's ambition is to provide a comprehensive, intuitive, and scalable solution to manage the complexities of a multi-faceted distribution business, enhancing operational visibility and strategic planning.

## User Preferences
- Frontend-first development approach
- User wants to review design before backend completion
- Custom JWT auth (no Replit Auth)

## System Architecture
The ERP system is built on a modern web stack, emphasizing a responsive and interactive user experience.

**UI/UX Decisions:**
- **Frontend Framework:** React with TypeScript.
- **Styling:** Tailwind CSS and Shadcn UI components for a consistent design system.
- **Data Visualization:** Recharts for dashboards and reports.
- **Color Scheme:** Dark navy blue sidebar, light main content, blue accent color.
- **Currency Format:** Indian Rupee (₹).

**Technical Implementations & Feature Specifications:**
- **Authentication:** Custom JWT-based authentication with role-based access control (admin, sales_manager, warehouse_manager, field_staff, hr_manager, accountant).
- **Core Modules:** Dashboard, Products, Leads (CRM), Sales, Project Management, Inventory, Supply Chain, Field Staff, Accounts, Employee Management, Reports, and Audit Trail.
- **Kiosk Attendance System:** Standalone interface for check-ins/outs with QR scan, selfie capture, and GPS logging, supporting breaks and half-day calculations.
- **Inventory Management:** Real-time stock levels (Total, Reserved, Available), low stock alerts, stock movements, and Goods Receipt Notes (GRN) with weighted moving average costing. Incoming stock tracking from open purchase orders. Reserved stock capped at physical total to prevent negative available stock.
- **Sales & Procurement Workflow:** Comprehensive quotation and order management with discounts, payment tracking, invoice generation, and delivery challans. Automated purchase requests for stock shortfalls, with conversion to purchase orders. Supports both warehouse replenishment and direct supplier delivery (drop-ship) for purchase orders. Automated sales order status transitions based on fulfillment events. Sales orders now support per-item GST rates and HSN codes, with Subtotal / Total GST / Grand Total breakdown stored in `subtotal` and `totalTax` columns. Orders can be linked to a fulfillment warehouse for stock reservation scoping.
- **GST Compliance:** Products carry `gstRate` (0/5/12/18/28%) and `hsnCode` fields. Sales order line items auto-populate GST rate and HSN code from the selected product; `taxAmount` is computed per item. Order totals include a GST breakdown displayed in the order form footer and expanded order view.
- **Field Staff Management:** Live location tracking, travel expense submission (with GPS-based distance), approval workflows, and a resubmit option for rejected expenses.
- **Employee Management:** Unified system for employee records and login account creation, attendance (including Kiosk), payroll, and leave management with approval workflows and in-app notifications. Personal employee dashboard (`My Portal`) for all users with attendance, salary, and notifications.
- **PDF Generation:** Client-side PDF generation for quotations and purchase orders (`jsPDF`).
- **Flexible Line Items:** Support for mixed product and service line items in sales documents.
- **PO Management:** Auto-generated PO numbers, dynamic supplier filtering based on product catalog, and a cancellation workflow.
- **In-App Notifications:** Real-time user alerts for system events (e.g., expense approval, payroll disbursement, leave request status) with unread counts and a dedicated section in My Portal.
- **Role-Based Access:** Dynamic sidebar navigation and route protection based on user roles, redirecting non-admin users to their `My Portal` dashboard.
- **Sales Invoices (GST-Compliant AR):** Full accounts-receivable invoicing generated from dispatched delivery challans. Features: one invoice per challan enforced (409), INV-YYZZ-NNNN sequential numbering by financial year, B2B (GSTIN) / B2C classification, intra-state (CGST+SGST) and inter-state (IGST) splits per line item, HSN codes, subtotal/total-tax/grand-total breakdown, and payment tracking (pending → partial_paid → paid) with auto-status recalculation. New tables: `sales_invoices`, `sales_invoice_items`, `customer_payments`.
- **AR Aging Report:** `GET /api/reports/ar-aging` endpoint buckets all outstanding customer receivables into Current / 1-30 / 31-60 / 61-90 / 90+ day bands. Reports page "AR Aging" tab mirrors the AP Aging tab: 6 bucket summary cards, customer filter dropdown, "Show paid" toggle, and a sortable data table (Customer | Invoice # | Type | Dates | Total | Collected | Balance | Days Overdue | Bucket). Accounts page AR section fully upgraded to use `sales_invoices` + `customer_payments` tables — showing customer name, B2B/B2C type, balance remaining, overdue status, and inline "Pay" button. AR summary cards show Total Receivable, Collected, and Outstanding computed from the GST-compliant tables.
- **GRN Supplier Challan Fields & File Attachments:** GRN records now store `supplierChallanNumber` and `supplierChallanDate` (both optional). The GRN create dialog and list/detail view expose these fields. A generic `attachments` table supports file uploads (PDF, JPG, PNG; max 10 MB) linked to any `grn` or `supplier_invoice` entity. Files are stored in Replit Object Storage with SHA-256 dedup, soft-delete (only uploader or admin), and entity-existence validation. A reusable `AttachmentsPanel` component (Inventory → GRN expanded row; Accounts → Supplier Invoice expanded row) provides upload, inline thumbnail preview for images, PDF link, download, and delete. API: `POST /api/attachments/request-upload`, `POST /api/attachments/confirm`, `GET /api/attachments/:entityType/:entityId`, `DELETE /api/attachments/:id`.

- **Daily Pricing Engine (FIFO Lot Costing):** `daily_price_sheets` and `daily_price_sheet_lots` tables implement a FIFO lot-based pricing workflow. Each product has one price sheet per day (draft→submitted→confirmed/rejected). The FIFO engine sources lots from confirmed GRNs (landedCost = buyingPrice + apportioned deliveryCost), applies net depletion (dispatches minus returns), and computes floorPrice = landedCost × 1.05 (5% minimum margin). GRN confirmation auto-creates draft price sheets. Supplier price updates set `product.needsPricingReview = true`. Confirmed sheets are pricing references only — `product.unitPrice` is never overwritten. `GET /api/daily-price-sheets/effective-price` provides a 7-day lookback with fallback to unitPrice. `GET /api/daily-price-sheets/effective-prices-today` batch endpoint returns map of productId→effectivePrice. Roles: admin/sales_manager/accountant create/update sheets; only admin/accountant can confirm/reject.

- **Daily Pricing UI + Sales Integration:** Inventory page gains a "Daily Pricing" tab (visible to admin/sales_manager/accountant) showing all products with their FIFO lot breakdown, blended cost, global floor, proposed price, margin %, pressure badge (High Risk/Medium/Safe based on cost/price ratio), and sell priority flags (🔥 for aged stock > 30 days). A full PricingDialog lets users create a sheet, enter proposed price, see live margin simulation (vs blended cost, global floor, strict floor), input override reasons when below floor, save draft, submit for approval, and confirm/reject (admin/accountant only). Products page locks `unitPrice` field when a confirmed price sheet exists today (shows Lock badge and effective price hint). Sales/Quotation line items auto-populate with the confirmed effective price when selecting a product (product dropdown shows ✓ for items with today's confirmed price).

- **Sales Returns & Credit Notes:** Full sales return workflow with GST reversal, stock ledger RETURN_IN entries, and CN-YYFYEND-NNNN numbered credit notes. Returns linked to invoice with qty validation, return type, reason, and AttachmentsPanel. `creditedAmount` tracked on invoices; AR outstanding net of credits. Credit Notes tab in Accounts page.

## External Dependencies
- **Database:** PostgreSQL.
- **ORM:** Drizzle ORM.
- **Frontend Routing:** Wouter.
- **State Management:** TanStack React Query.
- **Mapping:** Leaflet.js with OpenStreetMap.
- **PDF Generation:** jsPDF.
- **Object Storage:** Replit Object Storage.
- **Sales Returns & Credit Notes:** Full sales return workflow with GST reversal, stock ledger RETURN_IN entries, and CN-YYFYEND-NNNN numbered credit notes. Returns linked to invoice with qty validation, return type, reason, and AttachmentsPanel. `creditedAmount` tracked on invoices; AR outstanding net of credits. Credit Notes tab in Accounts page.

- **Margin Engine & Pricing Reports:** `GET /api/reports/pricing-summary` computes per-product FIFO blended cost, global floor (blendedCost×1.05), strict floor (max lot floor price), confirmed price (7-day lookback), margin %, and pressure level (High Risk/Medium/Safe/None) across all products. Returns portfolio rollup: totalInventoryCost, revenueAtConfirmedPrices, requiredRevenueAtMinMargin, portfolioStatus (SAFE/AT RISK), and risk counts. Reports page adds "Daily Pricing" tab (admin/sales_manager/accountant) with 4 portfolio cards, search/category filter, "Show only at-risk" toggle, and per-product table with pressure badges and price sheet status indicators. Sales order detail view adds "Est. Margin" column per product line item, sourced from `GET /api/sales-orders/:id/lot-margins` (FIFO blended cost), colored by margin threshold.

- **Lot Engine Hardening (Task #26):** `stock_movements.grn_id` VARCHAR column now exists — dispatch creates one movement per FIFO lot consumed with the actual GRN ID. `computeFifoLots` is warehouse-aware (optional warehouseId filter) and per-product margin-aware (reads `products.min_margin_pct`). `globalFloor = blendedCost × (1 + minMarginPct/100)` (not min of lot floors). `blendedInventoryPrice` column renamed to `blendedCost` in `daily_price_sheets`. Products carry editable `minMarginPct` (default 5%) and display `needsPricingReview` badge. `GET /api/inventory/stock-lot-summary?productId=&warehouseId=` returns per-lot FIFO breakdown with blendedCost, globalFloor, strictFloor. All lot engine calls are logged. Cost strategy: WAC (`costPrice`) for accounting only; FIFO for pricing/margin decisions (never mixed).