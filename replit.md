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
- **Sales & Procurement Workflow:** Comprehensive quotation and order management with discounts, payment tracking, invoice generation, and delivery challans. Automated purchase requests for stock shortfalls, with conversion to purchase orders. Supports both warehouse replenishment and direct supplier delivery (drop-ship) for purchase orders. Automated sales order status transitions based on fulfillment events.
- **Field Staff Management:** Live location tracking, travel expense submission (with GPS-based distance), approval workflows, and a resubmit option for rejected expenses.
- **Employee Management:** Unified system for employee records and login account creation, attendance (including Kiosk), payroll, and leave management with approval workflows and in-app notifications. Personal employee dashboard (`My Portal`) for all users with attendance, salary, and notifications.
- **PDF Generation:** Client-side PDF generation for quotations and purchase orders (`jsPDF`).
- **Flexible Line Items:** Support for mixed product and service line items in sales documents.
- **PO Management:** Auto-generated PO numbers, dynamic supplier filtering based on product catalog, and a cancellation workflow.
- **In-App Notifications:** Real-time user alerts for system events (e.g., expense approval, payroll disbursement, leave request status) with unread counts and a dedicated section in My Portal.
- **Role-Based Access:** Dynamic sidebar navigation and route protection based on user roles, redirecting non-admin users to their `My Portal` dashboard.

## External Dependencies
- **Database:** PostgreSQL.
- **ORM:** Drizzle ORM.
- **Frontend Routing:** Wouter.
- **State Management:** TanStack React Query.
- **Mapping:** Leaflet.js with OpenStreetMap.
- **PDF Generation:** jsPDF.
- **Object Storage:** Replit Object Storage.