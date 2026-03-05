# ITFI Group - Enterprise Resource Planning System

## Overview
A comprehensive custom ERP system designed for a business specializing in solar panels, electronics, and commodities distribution. The system aims to streamline operations across sales, inventory, supply chain, human resources, and project management with a focus on efficiency and data-driven insights. It features a robust, custom JWT-based authentication system with role-based access control and nine core modules to manage various business functions.

## User Preferences
- Frontend-first development approach
- User wants to review design before backend completion
- Custom JWT auth (no Replit Auth)

## System Architecture
The ERP system is built with a modern web stack, prioritizing a responsive and interactive user experience.

**UI/UX Decisions:**
- **Frontend Framework:** React with TypeScript for type safety and maintainability.
- **Styling:** Tailwind CSS for utility-first styling, complemented by Shadcn UI components for a consistent and accessible design system.
- **Data Visualization:** Recharts for interactive charts and graphs in dashboards and reports.
- **Color Scheme:** Dark navy blue sidebar (#1e293b) contrasted with a light/white main content area, using a blue accent color for primary actions.
- **Currency Format:** Indian Rupee (₹).

**Technical Implementations & Feature Specifications:**
- **Authentication:** Custom JWT-based authentication ensures secure access with role-based control (admin, sales_manager, warehouse_manager, field_staff, hr_manager, accountant).
- **Module Structure:** Nine core modules cover:
    - **Dashboard:** Key metrics and activity overview.
    - **Products:** Master data management including selling prices and supplier information (role-dependent visibility).
    - **Leads (CRM):** Pipeline management, status tracking, conversion to quotations, and follow-up system.
    - **Sales:** Comprehensive order and quotation management with discounts, payment tracking, invoice generation, and delivery challan integration.
    - **Project Management:** Project and milestone tracking.
    - **Inventory:** Real-time stock levels across warehouses with Total Stock, Reserved Stock (committed to confirmed/procurement/ready_to_ship orders), and Available Stock columns. Reserved stock is expandable to show which specific sales orders are reserving stock. Includes stock movements and low stock alerts based on available stock.
    - **Supply Chain:** Supplier management, purchase orders, and automated purchase requests based on sales order demands.
    - **Field Staff:** Live location tracking, travel expense management, and approval workflows.
    - **Accounts:** Financial tracking, invoice management.
    - **Employee Management:** Staff, attendance (including a standalone Kiosk system), and payroll.
    - **Reports:** Business analytics and insights.
    - **Audit Trail:** System activity logging.
- **Kiosk Attendance System:** A standalone, no-authentication required interface for quick check-ins/outs with QR scan, selfie capture (stored in Replit Object Storage), and GPS location logging. Includes logic for breaks and half-day calculations.
- **Discount & Payment System:** Flexible discount application (percentage/fixed) on quotations and orders. Detailed payment tracking for sales orders including advances and subsequent payments.
- **Delivery Method:** Quotations and Sales Orders support "pickup" (no delivery cost) or "delivery" (with delivery cost and address). Delivery cost is added to the net total. Data flows through: quotation → order conversion carries delivery fields; PR-to-PO conversion carries delivery address for direct_delivery POs; challan creation auto-inherits delivery address from linked sales order. Quotation PDF includes delivery cost line and address. Expanded order/quotation views show delivery info with blue highlight.
- **Delivery Challans:** Managed from the Inventory module, supporting various sources (warehouse, supplier) and partial deliveries. Integrates with sales orders for dispatch and delivery tracking. Shows delivery address (from linked sales order) in expanded view.
- **Stock Movement & PO Receiving:** Automated logging of stock movements (IN/OUT/adjustment) linked to purchase orders and delivery challans. Comprehensive inventory visibility with per-warehouse breakdowns.
- **Quotation PDF Generation:** Client-side PDF generation for quotations using `jsPDF`, including company branding, customer details, line items, and terms.
- **Mixed Line Items:** Support for both product and service line items in quotations and orders, with dynamic pricing and calculations.
- **Purchase Requests (Auto-Procurement):** Automated generation of purchase requests for stock shortfalls detected upon sales order confirmation, with priority levels and conversion to purchase orders. PR edit dialog filters suppliers to only those whose catalog covers all requested products, with pricing breakdown. Shortfall checks compare against available stock (total minus reserved by other orders), not just total stock.
- **PO Number Auto-Generation:** Purchase Order numbers (PO-YYYY-XXXX) are auto-generated server-side using max-based increment, removing manual entry.
- **PO Supplier Filtering:** When creating/editing a PO, the supplier dropdown dynamically filters to only show suppliers whose catalog covers all selected line item products. If the currently selected supplier becomes invalid after product changes, the selection is auto-cleared with a notification.
- **PO Cancellation Workflow:** Approved or shipped POs can have cancellation requested (with a mandatory reason). This sets the PO to `cancellation_requested` status, showing the reason in an amber banner in the expanded view. A separate "Approve Cancellation" action finalizes it as `cancelled`. Action buttons are status-dependent: pending shows edit/delete; approved/shipped shows request cancel + download PDF; cancellation_requested shows approve cancel + download PDF; received shows download PDF only.
- **PO PDF Generation:** Client-side PDF generation for purchase orders using `jsPDF` (`purchase-order-pdf.ts`), matching the quotation PDF letterhead style. Includes PO details, supplier info, line items, totals, delivery address (for direct delivery POs), and terms.
- **Manual Stock Adjustment:** Available from the Stock Movements tab ("Manual Adjustment" button) in Inventory for corrections/adjustments only. Supports Stock In, Stock Out, and Adjustment types with warehouse selection. Prevents negative stock on stock-out adjustments.
- **Goods Receipt Notes (GRN):** Formal receiving process for warehouse-type Purchase Orders. GRN tab in Inventory module allows creating draft GRNs against approved/shipped POs, editing received quantities and buying prices per item, adding delivery costs, and confirming to update inventory stock. GRN numbers auto-generated (GRN-YYYY-XXXX). Confirming a GRN creates stock movements (referenceType "grn"), marks PO as "received" when all items are fully received, and updates product costPrice via weighted moving average formula.
- **PO Delivery Type / Fulfillment Type:** Purchase Orders have a `deliveryType` field: "warehouse" (goods received via GRN into warehouse stock) or "direct_delivery" (drop-ship via Delivery Challan). Default is "warehouse". When converting a Purchase Request to PO, a dialog prompts procurement team to choose "Warehouse Replenishment" or "Direct Supplier Delivery (Drop Shipment)".
- **Incoming Stock Tracking:** Inventory Products tab shows an "Incoming" column with expected quantities from open warehouse-type POs (pending/approved/shipped). Clickable to show PO-level breakdown with expected dates.
- **Reserved Stock Capping:** Reserved stock per product is capped at the physical total stock. If orders demand more than what's in the warehouse, only the physically available quantity shows as reserved — the remainder is handled by auto-procurement/drop shipment. This ensures Available Stock (Total - Reserved) is never negative. Low stock alerts use available stock for threshold checks.
- **Field Staff Travel Expense:** System for field staff to submit travel expenses with GPS-based distance calculation, transport mode selection, and approval workflow. Includes live location tracking for administrators.
- **Field Staff Live Tracking:** Read-only admin view showing live employee locations on map and recorded travel routes panel. Trips are started/stopped by field staff from their devices via API. Recorded routes grouped by date with employee filter and clickable entries that draw route polylines on the map.

## External Dependencies
- **Database:** PostgreSQL for persistent data storage.
- **ORM:** Drizzle ORM for type-safe database interactions.
- **Frontend Routing:** Wouter for client-side routing.
- **State Management:** TanStack React Query for data fetching, caching, and state management.
- **Mapping:** Leaflet.js (raw, not React-Leaflet) with OpenStreetMap tiles for geographical data visualization and location tracking.
- **PDF Generation:** jsPDF for client-side PDF document creation.
- **Object Storage:** Replit Object Storage for storing selfie photos from the Kiosk Attendance system.