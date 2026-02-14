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
7. Employee Management - Staff, attendance, field staff
8. Reports - Business analytics with charts
9. Audit Trail - System activity logs

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
