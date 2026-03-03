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
2. Leads (/leads) - CRM lead pipeline with conversion to quotation
3. Sales - Orders with line items, quotations with line items, discounts, quotation-to-order conversion, customers, payment recording, invoice generation
4. Project Management - Project tracking, milestones
5. Inventory - Products & Services (with type badges), warehouses, stock movements
6. Supply Chain - Suppliers, purchase orders, deliveries
7. Field Staff (/field-staff) - Live location tracking, travel expense submission & approval, expense history
8. Accounts - Invoices, payments, financial tracking
9. Employee Management - Staff, attendance (with QR + selfie kiosk), payroll
10. Reports - Business analytics with charts
11. Audit Trail - System activity logs
12. Kiosk Attendance (/kiosk) - Standalone QR scan + selfie attendance system (no auth required)

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

## Leads Module (CRM)
- Pipeline at `/leads` with sidebar entry between Dashboard and Sales (UserPlus icon)
- Lead table: name, email, phone, company, requirement, source, status, assignedTo, estimatedValue, quotationId, notes, createdAt
- Sources: call, website, referral, walk_in, other (color-coded badges)
- Statuses: new → contacted → qualified → quotation_sent → won/lost (pipeline-colored badges)
- Convert to Quotation: POST /api/leads/:id/convert-to-quotation — auto-creates customer (if not existing) + draft quotation, updates lead status to "quotation_sent"
- Stat cards: Total Leads, Qualified, Won, Lost
- CRUD API: GET/POST/PATCH/DELETE /api/leads
- Table: leads (id, name, email, phone, company, requirement, source, status, assignedTo, estimatedValue, quotationId, notes, createdAt)

## Sales Module - Discounts & Payments
- Quotations and orders support discounts: discountType (percentage/fixed), discountValue
- Discount display: Subtotal → Discount → Net Total; totalAmount = net total after discount
- Quotation-to-order conversion carries over discountType and discountValue
- Orders support payment tracking: paymentTerms (text), advanceAmount, paidAmount
- Order statuses expanded: pending, awaiting_payment, confirmed, procurement, ready_to_ship, dispatched, delivered, installed, completed, cancelled
- Record Payment: POST /api/sales-orders/:id/record-payment (amount, method: cash/cheque/upi/bank_transfer, reference)
- Generate Invoice: POST /api/sales-orders/:id/generate-invoice (auto-generates from order, amount = remaining uninvoiced amount)
- Expanded order row shows: payment summary (Total/Paid/Balance), Record Payment button, Generate Invoice button (visible on delivered+)

## Sales Module - Quotation PDF
- Quotations have a downloadable PDF button (Download icon) in the actions column
- PDF generated client-side using jsPDF with company letterhead (ITFI Group branding)
- PDF includes: company header, quote details (number, date, valid until, status), customer info (name, phone, email, GST, address), line items table (type, description, qty, unit price, total), discount summary, notes, terms & conditions
- Utility: `client/src/lib/quotation-pdf.ts` — `generateQuotationPDF(quotation, items, customer)`
- File saved as `{quoteNumber}.pdf`

## Sales Module - Line Items & Services
- Orders and quotations support mixed Product + Service line items
- LineItemsEditor component: type toggle (Product/Service), product/service dropdown, description, qty, unit price, auto-calc total
- Line items auto-calculate grand total; totalAmount stored on parent record
- Quotation-to-order conversion: POST /api/quotations/:id/convert-to-order copies all items, marks quotation as "accepted"
- Products table has `type` field: "product" (default) or "service"
- Service categories: Installation, AMC, Site Survey, Repair, Maintenance, Custom
- Services auto-generate SKU (SVC-xxx), hide stock-related fields in Inventory form
- Tables: sales_order_items (orderId, productId nullable, itemType, description, qty, unitPrice, totalPrice), quotation_items (same structure with quotationId)
- API: GET/POST /api/sales-orders/:id/items, GET/POST /api/quotations/:id/items
- Zod validation on item creation routes using insertSalesOrderItemSchema/insertQuotationItemSchema

## Field Staff Travel Expense System
- Separate module at /field-staff with its own sidebar entry (after Supply Chain)
- Three tabs: Live Tracking, Travel Expenses, Expense History
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
