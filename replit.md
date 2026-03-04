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
    - **Inventory:** Real-time stock levels across warehouses, stock movements, and low stock alerts.
    - **Supply Chain:** Supplier management, purchase orders, and automated purchase requests based on sales order demands.
    - **Field Staff:** Live location tracking, travel expense management, and approval workflows.
    - **Accounts:** Financial tracking, invoice management.
    - **Employee Management:** Staff, attendance (including a standalone Kiosk system), and payroll.
    - **Reports:** Business analytics and insights.
    - **Audit Trail:** System activity logging.
- **Kiosk Attendance System:** A standalone, no-authentication required interface for quick check-ins/outs with QR scan, selfie capture (stored in Replit Object Storage), and GPS location logging. Includes logic for breaks and half-day calculations.
- **Discount & Payment System:** Flexible discount application (percentage/fixed) on quotations and orders. Detailed payment tracking for sales orders including advances and subsequent payments.
- **Delivery Challans:** Managed from the Inventory module, supporting various sources (warehouse, supplier) and partial deliveries. Integrates with sales orders for dispatch and delivery tracking.
- **Stock Movement & PO Receiving:** Automated logging of stock movements (IN/OUT/adjustment) linked to purchase orders and delivery challans. Comprehensive inventory visibility with per-warehouse breakdowns.
- **Quotation PDF Generation:** Client-side PDF generation for quotations using `jsPDF`, including company branding, customer details, line items, and terms.
- **Mixed Line Items:** Support for both product and service line items in quotations and orders, with dynamic pricing and calculations.
- **Purchase Requests (Auto-Procurement):** Automated generation of purchase requests for stock shortfalls detected upon sales order confirmation, with priority levels and conversion to purchase orders.
- **Field Staff Travel Expense:** System for field staff to submit travel expenses with GPS-based distance calculation, transport mode selection, and approval workflow. Includes live location tracking for administrators.

## External Dependencies
- **Database:** PostgreSQL for persistent data storage.
- **ORM:** Drizzle ORM for type-safe database interactions.
- **Frontend Routing:** Wouter for client-side routing.
- **State Management:** TanStack React Query for data fetching, caching, and state management.
- **Mapping:** Leaflet.js (raw, not React-Leaflet) with OpenStreetMap tiles for geographical data visualization and location tracking.
- **PDF Generation:** jsPDF for client-side PDF document creation.
- **Object Storage:** Replit Object Storage for storing selfie photos from the Kiosk Attendance system.