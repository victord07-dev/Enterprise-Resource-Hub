import { db } from "./db";
import { eq, desc, sql } from "drizzle-orm";
import {
  users, customers, suppliers, products, warehouses, inventoryStock,
  salesOrders, salesOrderItems, quotations, projects, purchaseOrders,
  invoices, payments, employees, attendanceRecords, fieldStaffActivities, auditLogs,
  type User, type InsertUser, type Customer, type Supplier, type Product,
  type Warehouse, type SalesOrder, type Quotation, type Project,
  type PurchaseOrder, type Invoice, type Payment, type Employee,
  type AttendanceRecord, type FieldStaffActivity, type AuditLog,
} from "@shared/schema";

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  getCustomers(): Promise<Customer[]>;
  getSuppliers(): Promise<Supplier[]>;
  getProducts(): Promise<Product[]>;
  getWarehouses(): Promise<Warehouse[]>;
  getSalesOrders(): Promise<SalesOrder[]>;
  getQuotations(): Promise<Quotation[]>;
  getProjects(): Promise<Project[]>;
  getPurchaseOrders(): Promise<PurchaseOrder[]>;
  getInvoices(): Promise<Invoice[]>;
  getPayments(): Promise<Payment[]>;
  getEmployees(): Promise<Employee[]>;
  getAttendance(): Promise<AttendanceRecord[]>;
  getAuditLogs(): Promise<AuditLog[]>;
  createAuditLog(log: { userId: string; action: string; module: string; details?: string; ipAddress?: string }): Promise<AuditLog>;
  getDashboardStats(): Promise<{ totalStaff: number; activeProjects: number; pendingPayments: number; lowStockAlerts: number }>;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user;
  }

  async createUser(user: InsertUser): Promise<User> {
    const [created] = await db.insert(users).values(user).returning();
    return created;
  }

  async getCustomers(): Promise<Customer[]> {
    return db.select().from(customers);
  }

  async getSuppliers(): Promise<Supplier[]> {
    return db.select().from(suppliers);
  }

  async getProducts(): Promise<Product[]> {
    return db.select().from(products);
  }

  async getWarehouses(): Promise<Warehouse[]> {
    return db.select().from(warehouses);
  }

  async getSalesOrders(): Promise<SalesOrder[]> {
    return db.select().from(salesOrders).orderBy(desc(salesOrders.orderDate));
  }

  async getQuotations(): Promise<Quotation[]> {
    return db.select().from(quotations).orderBy(desc(quotations.createdAt));
  }

  async getProjects(): Promise<Project[]> {
    return db.select().from(projects);
  }

  async getPurchaseOrders(): Promise<PurchaseOrder[]> {
    return db.select().from(purchaseOrders).orderBy(desc(purchaseOrders.orderDate));
  }

  async getInvoices(): Promise<Invoice[]> {
    return db.select().from(invoices).orderBy(desc(invoices.issuedDate));
  }

  async getPayments(): Promise<Payment[]> {
    return db.select().from(payments).orderBy(desc(payments.paymentDate));
  }

  async getEmployees(): Promise<Employee[]> {
    return db.select().from(employees);
  }

  async getAttendance(): Promise<AttendanceRecord[]> {
    return db.select().from(attendanceRecords).orderBy(desc(attendanceRecords.date));
  }

  async getAuditLogs(): Promise<AuditLog[]> {
    return db.select().from(auditLogs).orderBy(desc(auditLogs.timestamp)).limit(100);
  }

  async createAuditLog(log: { userId: string; action: string; module: string; details?: string; ipAddress?: string }): Promise<AuditLog> {
    const [created] = await db.insert(auditLogs).values(log).returning();
    return created;
  }

  async getDashboardStats() {
    const [staffResult] = await db.select({ count: sql<number>`count(*)::int` }).from(employees).where(eq(employees.isActive, true));
    const [projectResult] = await db.select({ count: sql<number>`count(*)::int` }).from(projects).where(eq(projects.status, "in_progress"));
    const [paymentResult] = await db.select({ count: sql<number>`count(*)::int` }).from(invoices).where(eq(invoices.status, "unpaid"));
    const [stockResult] = await db.select({ count: sql<number>`count(*)::int` }).from(products);

    return {
      totalStaff: staffResult?.count ?? 0,
      activeProjects: projectResult?.count ?? 0,
      pendingPayments: paymentResult?.count ?? 0,
      lowStockAlerts: stockResult?.count ?? 0,
    };
  }
}

export const storage = new DatabaseStorage();
