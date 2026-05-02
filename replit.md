# ITFI Group - Enterprise Resource Planning System

## Overview
The ITFI Group ERP system is a comprehensive, scalable solution designed for a business specializing in solar panels, electronics, and commodities. Its primary purpose is to integrate and optimize critical business operations including sales, inventory, supply chain, human resources, and project management. The system aims to provide enhanced operational visibility and strategic planning capabilities, catering to the diverse needs of a multi-faceted distribution business.

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

## External Dependencies
- **Database:** PostgreSQL.
- **ORM:** Drizzle ORM.
- **Frontend Routing:** Wouter.
- **State Management:** TanStack React Query.
- **Mapping:** Leaflet.js with OpenStreetMap.
- **PDF Generation:** jsPDF.
- **Object Storage:** Replit Object Storage.
- **WhatsApp Integration:** Interakt API.