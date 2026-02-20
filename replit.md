# ITFI Group - Enterprise Resource Planning System

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
7. Employee Management - Staff, attendance (with QR + selfie kiosk), field staff, payroll
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
- GPS location captured during selfie step, stored as exact lat/long coordinates
- Location coordinates stored with attendance record and displayed in kiosk success screen + ERP attendance table
- Selfie photos stored in Replit Object Storage
- Attendance records visible in ERP Employee Management -> Attendance tab (shows all break times + total break duration + location)
- Schema fields: checkIn, checkOut, lunchOut, lunchIn, teaOut, teaIn, location
- API endpoints: /api/kiosk/employee/:qrCode (GET), /api/kiosk/attendance (POST)
- QR management: /api/employees/:id/generate-qr, /api/employees/generate-all-qr, /api/employees/:id/qr-image

## Salary & Attendance Rules
- Monthly salary stored per employee (existing salary field)
- Daily rate = Monthly salary / 26 (6 working days/week)
- Work hours: 9:30 AM - 7:00 PM, productive time 8hr 30min (45min lunch + 15min tea break)
- Grace period: 5 minutes (up to 9:35:00 AM = full day)
- Late rule: Check-in after 9:35:00 AM (even 9:35:01) = half day (status: "half_day")
- Employee table shows Monthly Salary and Daily Rate columns
- Attendance table shows "Half Day" badge (amber) for late arrivals

## Field Staff Travel Expense System
- Located under Employee Management → Field Staff tab
- Three sections: Live Location Tracking, Travel Expense Submission, Travel Expense History
- **Travel Expense Form**: GPS "Get My Location" + Leaflet map destination picker, transport mode (Bus ₹10/km, Train ₹5/km, Bike ₹20/km), lunch ₹200 fixed, auto distance calc (Haversine × 1.3 road factor)
- **Expense Status Flow**: Pending → Approved → Disbursed (3-step)
- **Live Location Tracking**: Start/End Trip toggle, GPS updates every 5 minutes, admin map view with route polyline
- Multiple trips per day allowed
- Tables: travel_expenses, location_logs
- API: /api/travel-expenses (CRUD + /approve + /disburse), /api/location-logs (CRUD + /employee/:id/latest)
- Uses raw Leaflet (not react-leaflet) with OpenStreetMap tiles

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
