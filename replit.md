# NexERP - Enterprise Resource Planning System

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
- Flow: QR code scan -> Employee identification -> Selfie capture -> Auto action based on time
- Each employee has unique QR code (format: NEXERP-EMP-{uuid}) generated from Employee Management
- Multi-scan flow per day (6 scans total):
  1. Check In (first scan of day)
  2. Lunch Out (12:00 PM - 6:00 PM window, after check-in)
  3. Lunch In (12:00 PM - 6:00 PM window, after lunch out)
  4. Tea Out (4:00 PM - 8:00 PM window, after lunch in)
  5. Tea In (4:00 PM - 8:00 PM window, after tea out)
  6. Check Out (final scan, after all breaks or anytime)
- Break schedule: Lunch at 1:00 PM (45 min), Tea at 5:00 PM (15 min)
- Time-based break detection determines scan type automatically
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
