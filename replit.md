# Hussain Group - Enterprise Resource Planning System

## Overview
A comprehensive custom ERP system for solar panel, electronics, and commodities distribution business. Features custom JWT-based authentication with role-based access control and nine core modules.

## Architecture
- **Frontend**: React + TypeScript + Tailwind CSS + Shadcn UI + Recharts
- **Backend**: Express.js + TypeScript + JWT Authentication
- **Database**: PostgreSQL with Drizzle ORM
- **Routing**: Wouter (frontend), Express (backend)
- **State**: TanStack React Query

## Modules
1. Dashboard - Metric cards, revenue chart, activity feed
2. Sales - Orders, quotations, customers
3. Project Management - Project tracking, milestones
4. Inventory - Products, warehouses, stock movements
5. Supply Chain - Suppliers, purchase orders, deliveries
6. Accounts - Invoices, payments, financial tracking
7. Employee Management - Staff, attendance (with QR + selfie kiosk), field staff
8. Reports - Business analytics with charts
9. Audit Trail - System activity logs
10. Kiosk Attendance (/kiosk) - Standalone QR scan + selfie attendance system (no auth required)

## Kiosk Attendance System
- Standalone page at `/kiosk` - no login required (designed for office tablet)
- Flow: QR code scan -> Employee identification -> Action selection -> Selfie capture -> Submit
- Each employee has unique QR code (format: NEXERP-EMP-{uuid}) generated from Employee Management
- First scan of day: automatic Check In (no action selection needed)
- Second scan onwards: shows action selection screen with options:
  - Lunch Break (only visible 1:00 PM - 2:30 PM)
  - Tea Break (only visible 5:00 PM - 5:30 PM)
  - Check Out (always available)
- If currently on a break (lunchOut/teaOut without return), auto-selects return action
- Backend accepts explicit `action` parameter: check_in, check_out, lunch_out, lunch_in, tea_out, tea_in
- Selfie photos stored in Replit Object Storage
- Attendance records visible in ERP Employee Management -> Attendance tab (shows all break times + total break duration)
- Schema fields: checkIn, checkOut, lunchOut, lunchIn, teaOut, teaIn
- API endpoints: /api/kiosk/employee/:qrCode (GET), /api/kiosk/attendance (POST)
- QR management: /api/employees/:id/generate-qr, /api/employees/generate-all-qr, /api/employees/:id/qr-image

## Authentication
- Custom JWT-based (NOT Replit Auth)
- Default admin: username=admin, password=admin123
- Roles: admin, sales_manager, warehouse_manager, field_staff, hr_manager, accountant

## Design
- Dark navy blue sidebar (#1e293b)
- Light/white main content area
- Blue accent color for primary actions
- Indian Rupee (₹) currency format

## Key Files
- `shared/schema.ts` - Database schema and types
- `server/routes.ts` - API endpoints with JWT middleware
- `server/storage.ts` - Database operations interface
- `client/src/App.tsx` - Main app with routing and auth
- `client/src/components/app-sidebar.tsx` - Navigation sidebar
- `client/src/pages/` - All module pages

## User Preferences
- Frontend-first development approach
- User wants to review design before backend completion
- Custom JWT auth (no Replit Auth)
