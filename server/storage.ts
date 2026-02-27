import { db } from "./db";
import { eq, desc, sql, and, gte, lte } from "drizzle-orm";
import {
  users, customers, suppliers, products, warehouses, inventoryStock,
  salesOrders, salesOrderItems, quotations, quotationItems, projects, purchaseOrders,
  invoices, payments, employees, attendanceRecords, fieldStaffActivities, payrollStatus, travelExpenses, trips, locationLogs, auditLogs,
  type User, type InsertUser, type Customer, type Supplier, type Product,
  type Warehouse, type InventoryStock, type SalesOrder, type SalesOrderItem,
  type Quotation, type QuotationItem, type Project, type PurchaseOrder, type Invoice, type Payment,
  type Employee, type AttendanceRecord, type FieldStaffActivity, type PayrollStatus, type TravelExpense, type Trip, type LocationLog, type AuditLog,
} from "@shared/schema";

export interface IStorage {
  // Users
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUsers(): Promise<User[]>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: string, data: Partial<InsertUser>): Promise<User | undefined>;
  deleteUser(id: string): Promise<boolean>;

  // Customers
  getCustomers(): Promise<Customer[]>;
  getCustomer(id: string): Promise<Customer | undefined>;
  createCustomer(data: Omit<Customer, "id">): Promise<Customer>;
  updateCustomer(id: string, data: Partial<Omit<Customer, "id">>): Promise<Customer | undefined>;
  deleteCustomer(id: string): Promise<boolean>;

  // Suppliers
  getSuppliers(): Promise<Supplier[]>;
  getSupplier(id: string): Promise<Supplier | undefined>;
  createSupplier(data: Omit<Supplier, "id">): Promise<Supplier>;
  updateSupplier(id: string, data: Partial<Omit<Supplier, "id">>): Promise<Supplier | undefined>;
  deleteSupplier(id: string): Promise<boolean>;

  // Products
  getProducts(): Promise<Product[]>;
  getProduct(id: string): Promise<Product | undefined>;
  createProduct(data: Omit<Product, "id">): Promise<Product>;
  updateProduct(id: string, data: Partial<Omit<Product, "id">>): Promise<Product | undefined>;
  deleteProduct(id: string): Promise<boolean>;

  // Warehouses
  getWarehouses(): Promise<Warehouse[]>;
  getWarehouse(id: string): Promise<Warehouse | undefined>;
  createWarehouse(data: Omit<Warehouse, "id">): Promise<Warehouse>;
  updateWarehouse(id: string, data: Partial<Omit<Warehouse, "id">>): Promise<Warehouse | undefined>;
  deleteWarehouse(id: string): Promise<boolean>;

  // Inventory Stock
  getInventoryStock(): Promise<InventoryStock[]>;
  getInventoryStockByProduct(productId: string): Promise<InventoryStock[]>;
  createInventoryStock(data: Omit<InventoryStock, "id">): Promise<InventoryStock>;
  updateInventoryStock(id: string, data: Partial<Omit<InventoryStock, "id">>): Promise<InventoryStock | undefined>;

  // Sales Orders
  getSalesOrders(): Promise<SalesOrder[]>;
  getSalesOrder(id: string): Promise<SalesOrder | undefined>;
  createSalesOrder(data: Omit<SalesOrder, "id">): Promise<SalesOrder>;
  updateSalesOrder(id: string, data: Partial<Omit<SalesOrder, "id">>): Promise<SalesOrder | undefined>;
  deleteSalesOrder(id: string): Promise<boolean>;

  // Sales Order Items
  getSalesOrderItems(orderId: string): Promise<SalesOrderItem[]>;
  createSalesOrderItem(data: Omit<SalesOrderItem, "id">): Promise<SalesOrderItem>;
  deleteSalesOrderItems(orderId: string): Promise<boolean>;

  // Quotations
  getQuotations(): Promise<Quotation[]>;
  getQuotation(id: string): Promise<Quotation | undefined>;
  createQuotation(data: Omit<Quotation, "id">): Promise<Quotation>;
  updateQuotation(id: string, data: Partial<Omit<Quotation, "id">>): Promise<Quotation | undefined>;
  deleteQuotation(id: string): Promise<boolean>;

  // Quotation Items
  getQuotationItems(quotationId: string): Promise<QuotationItem[]>;
  createQuotationItem(data: Omit<QuotationItem, "id">): Promise<QuotationItem>;
  deleteQuotationItems(quotationId: string): Promise<boolean>;

  // Projects
  getProjects(): Promise<Project[]>;
  getProject(id: string): Promise<Project | undefined>;
  createProject(data: Omit<Project, "id">): Promise<Project>;
  updateProject(id: string, data: Partial<Omit<Project, "id">>): Promise<Project | undefined>;
  deleteProject(id: string): Promise<boolean>;

  // Purchase Orders
  getPurchaseOrders(): Promise<PurchaseOrder[]>;
  getPurchaseOrder(id: string): Promise<PurchaseOrder | undefined>;
  createPurchaseOrder(data: Omit<PurchaseOrder, "id">): Promise<PurchaseOrder>;
  updatePurchaseOrder(id: string, data: Partial<Omit<PurchaseOrder, "id">>): Promise<PurchaseOrder | undefined>;
  deletePurchaseOrder(id: string): Promise<boolean>;

  // Invoices
  getInvoices(): Promise<Invoice[]>;
  getInvoice(id: string): Promise<Invoice | undefined>;
  createInvoice(data: Omit<Invoice, "id">): Promise<Invoice>;
  updateInvoice(id: string, data: Partial<Omit<Invoice, "id">>): Promise<Invoice | undefined>;
  deleteInvoice(id: string): Promise<boolean>;

  // Payments
  getPayments(): Promise<Payment[]>;
  getPayment(id: string): Promise<Payment | undefined>;
  createPayment(data: Omit<Payment, "id">): Promise<Payment>;
  updatePayment(id: string, data: Partial<Omit<Payment, "id">>): Promise<Payment | undefined>;
  deletePayment(id: string): Promise<boolean>;

  // Employees
  getEmployees(): Promise<Employee[]>;
  getEmployee(id: string): Promise<Employee | undefined>;
  createEmployee(data: Omit<Employee, "id">): Promise<Employee>;
  updateEmployee(id: string, data: Partial<Omit<Employee, "id">>): Promise<Employee | undefined>;
  deleteEmployee(id: string): Promise<boolean>;

  // Attendance
  getAttendance(): Promise<AttendanceRecord[]>;
  createAttendanceRecord(data: Omit<AttendanceRecord, "id">): Promise<AttendanceRecord>;
  updateAttendanceRecord(id: string, data: Partial<Omit<AttendanceRecord, "id">>): Promise<AttendanceRecord | undefined>;
  deleteAttendanceRecord(id: string): Promise<void>;

  // Field Staff Activities
  getFieldStaffActivities(): Promise<FieldStaffActivity[]>;
  createFieldStaffActivity(data: Omit<FieldStaffActivity, "id">): Promise<FieldStaffActivity>;

  // Payroll Status
  getPayrollStatuses(): Promise<PayrollStatus[]>;
  getPayrollStatus(month: number, year: number): Promise<PayrollStatus | undefined>;
  createPayrollStatus(data: Omit<PayrollStatus, "id">): Promise<PayrollStatus>;
  updatePayrollStatus(id: string, data: Partial<Omit<PayrollStatus, "id">>): Promise<PayrollStatus | undefined>;

  // Travel Expenses
  getTravelExpenses(): Promise<TravelExpense[]>;
  getTravelExpensesByEmployee(employeeId: string): Promise<TravelExpense[]>;
  createTravelExpense(data: Omit<TravelExpense, "id">): Promise<TravelExpense>;
  updateTravelExpense(id: string, data: Partial<Omit<TravelExpense, "id">>): Promise<TravelExpense | undefined>;

  // Trips
  getTrips(): Promise<Trip[]>;
  getTripsByEmployee(employeeId: string): Promise<Trip[]>;
  getActiveTrips(): Promise<Trip[]>;
  createTrip(data: Omit<Trip, "id">): Promise<Trip>;
  updateTrip(id: string, data: Partial<Omit<Trip, "id">>): Promise<Trip | undefined>;

  // Location Logs
  getLocationLogs(): Promise<LocationLog[]>;
  getLocationLogsByEmployee(employeeId: string, startDate?: Date, endDate?: Date): Promise<LocationLog[]>;
  getLocationLogsByTrip(tripId: string): Promise<LocationLog[]>;
  getLatestLocationByEmployee(employeeId: string): Promise<LocationLog | undefined>;
  createLocationLog(data: Omit<LocationLog, "id">): Promise<LocationLog>;

  // Audit Logs
  getAuditLogs(): Promise<AuditLog[]>;
  createAuditLog(log: { userId: string; action: string; module: string; details?: string; ipAddress?: string }): Promise<AuditLog>;

  // Dashboard
  getDashboardStats(): Promise<{
    totalRevenue: number;
    totalOrders: number;
    activeProjects: number;
    totalCustomers: number;
    totalStaff: number;
    pendingPayments: number;
    lowStockAlerts: number;
    recentOrders: SalesOrder[];
    recentActivities: AuditLog[];
  }>;
}

export class DatabaseStorage implements IStorage {
  // Users
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user;
  }

  async getUsers(): Promise<User[]> {
    return db.select().from(users);
  }

  async createUser(user: InsertUser): Promise<User> {
    const [created] = await db.insert(users).values(user).returning();
    return created;
  }

  async updateUser(id: string, data: Partial<InsertUser>): Promise<User | undefined> {
    const [updated] = await db.update(users).set(data).where(eq(users.id, id)).returning();
    return updated;
  }

  async deleteUser(id: string): Promise<boolean> {
    const result = await db.delete(users).where(eq(users.id, id));
    return true;
  }

  // Customers
  async getCustomers(): Promise<Customer[]> {
    return db.select().from(customers);
  }

  async getCustomer(id: string): Promise<Customer | undefined> {
    const [customer] = await db.select().from(customers).where(eq(customers.id, id));
    return customer;
  }

  async createCustomer(data: Omit<Customer, "id">): Promise<Customer> {
    const [created] = await db.insert(customers).values(data).returning();
    return created;
  }

  async updateCustomer(id: string, data: Partial<Omit<Customer, "id">>): Promise<Customer | undefined> {
    const [updated] = await db.update(customers).set(data).where(eq(customers.id, id)).returning();
    return updated;
  }

  async deleteCustomer(id: string): Promise<boolean> {
    await db.delete(customers).where(eq(customers.id, id));
    return true;
  }

  // Suppliers
  async getSuppliers(): Promise<Supplier[]> {
    return db.select().from(suppliers);
  }

  async getSupplier(id: string): Promise<Supplier | undefined> {
    const [supplier] = await db.select().from(suppliers).where(eq(suppliers.id, id));
    return supplier;
  }

  async createSupplier(data: Omit<Supplier, "id">): Promise<Supplier> {
    const [created] = await db.insert(suppliers).values(data).returning();
    return created;
  }

  async updateSupplier(id: string, data: Partial<Omit<Supplier, "id">>): Promise<Supplier | undefined> {
    const [updated] = await db.update(suppliers).set(data).where(eq(suppliers.id, id)).returning();
    return updated;
  }

  async deleteSupplier(id: string): Promise<boolean> {
    await db.delete(suppliers).where(eq(suppliers.id, id));
    return true;
  }

  // Products
  async getProducts(): Promise<Product[]> {
    return db.select().from(products);
  }

  async getProduct(id: string): Promise<Product | undefined> {
    const [product] = await db.select().from(products).where(eq(products.id, id));
    return product;
  }

  async createProduct(data: Omit<Product, "id">): Promise<Product> {
    const [created] = await db.insert(products).values(data).returning();
    return created;
  }

  async updateProduct(id: string, data: Partial<Omit<Product, "id">>): Promise<Product | undefined> {
    const [updated] = await db.update(products).set(data).where(eq(products.id, id)).returning();
    return updated;
  }

  async deleteProduct(id: string): Promise<boolean> {
    await db.delete(products).where(eq(products.id, id));
    return true;
  }

  // Warehouses
  async getWarehouses(): Promise<Warehouse[]> {
    return db.select().from(warehouses);
  }

  async getWarehouse(id: string): Promise<Warehouse | undefined> {
    const [wh] = await db.select().from(warehouses).where(eq(warehouses.id, id));
    return wh;
  }

  async createWarehouse(data: Omit<Warehouse, "id">): Promise<Warehouse> {
    const [created] = await db.insert(warehouses).values(data).returning();
    return created;
  }

  async updateWarehouse(id: string, data: Partial<Omit<Warehouse, "id">>): Promise<Warehouse | undefined> {
    const [updated] = await db.update(warehouses).set(data).where(eq(warehouses.id, id)).returning();
    return updated;
  }

  async deleteWarehouse(id: string): Promise<boolean> {
    await db.delete(warehouses).where(eq(warehouses.id, id));
    return true;
  }

  // Inventory Stock
  async getInventoryStock(): Promise<InventoryStock[]> {
    return db.select().from(inventoryStock);
  }

  async getInventoryStockByProduct(productId: string): Promise<InventoryStock[]> {
    return db.select().from(inventoryStock).where(eq(inventoryStock.productId, productId));
  }

  async createInventoryStock(data: Omit<InventoryStock, "id">): Promise<InventoryStock> {
    const [created] = await db.insert(inventoryStock).values(data).returning();
    return created;
  }

  async updateInventoryStock(id: string, data: Partial<Omit<InventoryStock, "id">>): Promise<InventoryStock | undefined> {
    const [updated] = await db.update(inventoryStock).set(data).where(eq(inventoryStock.id, id)).returning();
    return updated;
  }

  // Sales Orders
  async getSalesOrders(): Promise<SalesOrder[]> {
    return db.select().from(salesOrders).orderBy(desc(salesOrders.orderDate));
  }

  async getSalesOrder(id: string): Promise<SalesOrder | undefined> {
    const [order] = await db.select().from(salesOrders).where(eq(salesOrders.id, id));
    return order;
  }

  async createSalesOrder(data: Omit<SalesOrder, "id">): Promise<SalesOrder> {
    const [created] = await db.insert(salesOrders).values(data).returning();
    return created;
  }

  async updateSalesOrder(id: string, data: Partial<Omit<SalesOrder, "id">>): Promise<SalesOrder | undefined> {
    const [updated] = await db.update(salesOrders).set(data).where(eq(salesOrders.id, id)).returning();
    return updated;
  }

  async deleteSalesOrder(id: string): Promise<boolean> {
    await db.delete(salesOrderItems).where(eq(salesOrderItems.orderId, id));
    await db.delete(salesOrders).where(eq(salesOrders.id, id));
    return true;
  }

  // Sales Order Items
  async getSalesOrderItems(orderId: string): Promise<SalesOrderItem[]> {
    return db.select().from(salesOrderItems).where(eq(salesOrderItems.orderId, orderId));
  }

  async createSalesOrderItem(data: Omit<SalesOrderItem, "id">): Promise<SalesOrderItem> {
    const [created] = await db.insert(salesOrderItems).values(data).returning();
    return created;
  }

  async deleteSalesOrderItems(orderId: string): Promise<boolean> {
    await db.delete(salesOrderItems).where(eq(salesOrderItems.orderId, orderId));
    return true;
  }

  // Quotations
  async getQuotations(): Promise<Quotation[]> {
    return db.select().from(quotations).orderBy(desc(quotations.createdAt));
  }

  async getQuotation(id: string): Promise<Quotation | undefined> {
    const [q] = await db.select().from(quotations).where(eq(quotations.id, id));
    return q;
  }

  async createQuotation(data: Omit<Quotation, "id">): Promise<Quotation> {
    const [created] = await db.insert(quotations).values(data).returning();
    return created;
  }

  async updateQuotation(id: string, data: Partial<Omit<Quotation, "id">>): Promise<Quotation | undefined> {
    const [updated] = await db.update(quotations).set(data).where(eq(quotations.id, id)).returning();
    return updated;
  }

  async deleteQuotation(id: string): Promise<boolean> {
    await db.delete(quotationItems).where(eq(quotationItems.quotationId, id));
    await db.delete(quotations).where(eq(quotations.id, id));
    return true;
  }

  // Quotation Items
  async getQuotationItems(quotationId: string): Promise<QuotationItem[]> {
    return db.select().from(quotationItems).where(eq(quotationItems.quotationId, quotationId));
  }

  async createQuotationItem(data: Omit<QuotationItem, "id">): Promise<QuotationItem> {
    const [created] = await db.insert(quotationItems).values(data).returning();
    return created;
  }

  async deleteQuotationItems(quotationId: string): Promise<boolean> {
    await db.delete(quotationItems).where(eq(quotationItems.quotationId, quotationId));
    return true;
  }

  // Projects
  async getProjects(): Promise<Project[]> {
    return db.select().from(projects);
  }

  async getProject(id: string): Promise<Project | undefined> {
    const [project] = await db.select().from(projects).where(eq(projects.id, id));
    return project;
  }

  async createProject(data: Omit<Project, "id">): Promise<Project> {
    const [created] = await db.insert(projects).values(data).returning();
    return created;
  }

  async updateProject(id: string, data: Partial<Omit<Project, "id">>): Promise<Project | undefined> {
    const [updated] = await db.update(projects).set(data).where(eq(projects.id, id)).returning();
    return updated;
  }

  async deleteProject(id: string): Promise<boolean> {
    await db.delete(projects).where(eq(projects.id, id));
    return true;
  }

  // Purchase Orders
  async getPurchaseOrders(): Promise<PurchaseOrder[]> {
    return db.select().from(purchaseOrders).orderBy(desc(purchaseOrders.orderDate));
  }

  async getPurchaseOrder(id: string): Promise<PurchaseOrder | undefined> {
    const [po] = await db.select().from(purchaseOrders).where(eq(purchaseOrders.id, id));
    return po;
  }

  async createPurchaseOrder(data: Omit<PurchaseOrder, "id">): Promise<PurchaseOrder> {
    const [created] = await db.insert(purchaseOrders).values(data).returning();
    return created;
  }

  async updatePurchaseOrder(id: string, data: Partial<Omit<PurchaseOrder, "id">>): Promise<PurchaseOrder | undefined> {
    const [updated] = await db.update(purchaseOrders).set(data).where(eq(purchaseOrders.id, id)).returning();
    return updated;
  }

  async deletePurchaseOrder(id: string): Promise<boolean> {
    await db.delete(purchaseOrders).where(eq(purchaseOrders.id, id));
    return true;
  }

  // Invoices
  async getInvoices(): Promise<Invoice[]> {
    return db.select().from(invoices).orderBy(desc(invoices.issuedDate));
  }

  async getInvoice(id: string): Promise<Invoice | undefined> {
    const [inv] = await db.select().from(invoices).where(eq(invoices.id, id));
    return inv;
  }

  async createInvoice(data: Omit<Invoice, "id">): Promise<Invoice> {
    const [created] = await db.insert(invoices).values(data).returning();
    return created;
  }

  async updateInvoice(id: string, data: Partial<Omit<Invoice, "id">>): Promise<Invoice | undefined> {
    const [updated] = await db.update(invoices).set(data).where(eq(invoices.id, id)).returning();
    return updated;
  }

  async deleteInvoice(id: string): Promise<boolean> {
    await db.delete(invoices).where(eq(invoices.id, id));
    return true;
  }

  // Payments
  async getPayments(): Promise<Payment[]> {
    return db.select().from(payments).orderBy(desc(payments.paymentDate));
  }

  async getPayment(id: string): Promise<Payment | undefined> {
    const [payment] = await db.select().from(payments).where(eq(payments.id, id));
    return payment;
  }

  async createPayment(data: Omit<Payment, "id">): Promise<Payment> {
    const [created] = await db.insert(payments).values(data).returning();
    return created;
  }

  async updatePayment(id: string, data: Partial<Omit<Payment, "id">>): Promise<Payment | undefined> {
    const [updated] = await db.update(payments).set(data).where(eq(payments.id, id)).returning();
    return updated;
  }

  async deletePayment(id: string): Promise<boolean> {
    await db.delete(payments).where(eq(payments.id, id));
    return true;
  }

  // Employees
  async getEmployees(): Promise<Employee[]> {
    return db.select().from(employees);
  }

  async getEmployee(id: string): Promise<Employee | undefined> {
    const [emp] = await db.select().from(employees).where(eq(employees.id, id));
    return emp;
  }

  async createEmployee(data: Omit<Employee, "id">): Promise<Employee> {
    const [created] = await db.insert(employees).values(data).returning();
    return created;
  }

  async updateEmployee(id: string, data: Partial<Omit<Employee, "id">>): Promise<Employee | undefined> {
    const [updated] = await db.update(employees).set(data).where(eq(employees.id, id)).returning();
    return updated;
  }

  async deleteEmployee(id: string): Promise<boolean> {
    await db.delete(employees).where(eq(employees.id, id));
    return true;
  }

  // Attendance
  async getAttendance(): Promise<AttendanceRecord[]> {
    return db.select().from(attendanceRecords).orderBy(desc(attendanceRecords.date));
  }

  async createAttendanceRecord(data: Omit<AttendanceRecord, "id">): Promise<AttendanceRecord> {
    const [created] = await db.insert(attendanceRecords).values(data).returning();
    return created;
  }

  async updateAttendanceRecord(id: string, data: Partial<Omit<AttendanceRecord, "id">>): Promise<AttendanceRecord | undefined> {
    const [updated] = await db.update(attendanceRecords).set(data).where(eq(attendanceRecords.id, id)).returning();
    return updated;
  }

  async deleteAttendanceRecord(id: string): Promise<void> {
    await db.delete(attendanceRecords).where(eq(attendanceRecords.id, id));
  }

  // Field Staff Activities
  async getFieldStaffActivities(): Promise<FieldStaffActivity[]> {
    return db.select().from(fieldStaffActivities).orderBy(desc(fieldStaffActivities.date));
  }

  async createFieldStaffActivity(data: Omit<FieldStaffActivity, "id">): Promise<FieldStaffActivity> {
    const [created] = await db.insert(fieldStaffActivities).values(data).returning();
    return created;
  }

  // Payroll Status
  async getPayrollStatuses(): Promise<PayrollStatus[]> {
    return db.select().from(payrollStatus);
  }

  async getPayrollStatus(month: number, year: number): Promise<PayrollStatus | undefined> {
    const [ps] = await db.select().from(payrollStatus).where(and(eq(payrollStatus.month, month), eq(payrollStatus.year, year)));
    return ps;
  }

  async createPayrollStatus(data: Omit<PayrollStatus, "id">): Promise<PayrollStatus> {
    const [created] = await db.insert(payrollStatus).values(data).returning();
    return created;
  }

  async updatePayrollStatus(id: string, data: Partial<Omit<PayrollStatus, "id">>): Promise<PayrollStatus | undefined> {
    const [updated] = await db.update(payrollStatus).set(data).where(eq(payrollStatus.id, id)).returning();
    return updated;
  }

  // Travel Expenses
  async getTravelExpenses(): Promise<TravelExpense[]> {
    return db.select().from(travelExpenses).orderBy(desc(travelExpenses.createdAt));
  }

  async getTravelExpensesByEmployee(employeeId: string): Promise<TravelExpense[]> {
    return db.select().from(travelExpenses).where(eq(travelExpenses.employeeId, employeeId)).orderBy(desc(travelExpenses.createdAt));
  }

  async createTravelExpense(data: Omit<TravelExpense, "id">): Promise<TravelExpense> {
    const [created] = await db.insert(travelExpenses).values(data).returning();
    return created;
  }

  async updateTravelExpense(id: string, data: Partial<Omit<TravelExpense, "id">>): Promise<TravelExpense | undefined> {
    const [updated] = await db.update(travelExpenses).set(data).where(eq(travelExpenses.id, id)).returning();
    return updated;
  }

  // Location Logs
  async getLocationLogs(): Promise<LocationLog[]> {
    return db.select().from(locationLogs).orderBy(desc(locationLogs.timestamp));
  }

  async getLocationLogsByEmployee(employeeId: string, startDate?: Date, endDate?: Date): Promise<LocationLog[]> {
    if (startDate && endDate) {
      return db.select().from(locationLogs).where(and(eq(locationLogs.employeeId, employeeId), gte(locationLogs.timestamp, startDate), lte(locationLogs.timestamp, endDate))).orderBy(locationLogs.timestamp);
    }
    return db.select().from(locationLogs).where(eq(locationLogs.employeeId, employeeId)).orderBy(desc(locationLogs.timestamp)).limit(100);
  }

  async getLatestLocationByEmployee(employeeId: string): Promise<LocationLog | undefined> {
    const [log] = await db.select().from(locationLogs).where(eq(locationLogs.employeeId, employeeId)).orderBy(desc(locationLogs.timestamp)).limit(1);
    return log;
  }

  async createLocationLog(data: Omit<LocationLog, "id">): Promise<LocationLog> {
    const [created] = await db.insert(locationLogs).values(data).returning();
    return created;
  }

  // Trips
  async getTrips(): Promise<Trip[]> {
    return db.select().from(trips).orderBy(desc(trips.startTime));
  }

  async getTripsByEmployee(employeeId: string): Promise<Trip[]> {
    return db.select().from(trips).where(eq(trips.employeeId, employeeId)).orderBy(desc(trips.startTime));
  }

  async getActiveTrips(): Promise<Trip[]> {
    return db.select().from(trips).where(eq(trips.status, "active")).orderBy(desc(trips.startTime));
  }

  async createTrip(data: Omit<Trip, "id">): Promise<Trip> {
    const [created] = await db.insert(trips).values(data).returning();
    return created;
  }

  async updateTrip(id: string, data: Partial<Omit<Trip, "id">>): Promise<Trip | undefined> {
    const [updated] = await db.update(trips).set(data).where(eq(trips.id, id)).returning();
    return updated;
  }

  async getLocationLogsByTrip(tripId: string): Promise<LocationLog[]> {
    return db.select().from(locationLogs).where(eq(locationLogs.tripId, tripId)).orderBy(locationLogs.timestamp);
  }

  // Audit Logs
  async getAuditLogs(): Promise<AuditLog[]> {
    return db.select().from(auditLogs).orderBy(desc(auditLogs.timestamp)).limit(200);
  }

  async createAuditLog(log: { userId: string; action: string; module: string; details?: string; ipAddress?: string }): Promise<AuditLog> {
    const [created] = await db.insert(auditLogs).values(log).returning();
    return created;
  }

  // Dashboard
  async getDashboardStats() {
    const [staffResult] = await db.select({ count: sql<number>`count(*)::int` }).from(employees).where(eq(employees.isActive, true));
    const [projectResult] = await db.select({ count: sql<number>`count(*)::int` }).from(projects).where(eq(projects.status, "in_progress"));
    const [paymentResult] = await db.select({ count: sql<number>`count(*)::int` }).from(invoices).where(eq(invoices.status, "unpaid"));
    const [customerResult] = await db.select({ count: sql<number>`count(*)::int` }).from(customers);
    const [orderResult] = await db.select({ count: sql<number>`count(*)::int` }).from(salesOrders);
    const [revenueResult] = await db.select({ total: sql<number>`coalesce(sum(amount::numeric), 0)::float` }).from(payments).where(eq(payments.status, "completed"));
    const [stockResult] = await db.select({ count: sql<number>`count(*)::int` }).from(products);

    const recentOrders = await db.select().from(salesOrders).orderBy(desc(salesOrders.orderDate)).limit(5);
    const recentActivities = await db.select().from(auditLogs).orderBy(desc(auditLogs.timestamp)).limit(10);

    return {
      totalRevenue: revenueResult?.total ?? 0,
      totalOrders: orderResult?.count ?? 0,
      activeProjects: projectResult?.count ?? 0,
      totalCustomers: customerResult?.count ?? 0,
      totalStaff: staffResult?.count ?? 0,
      pendingPayments: paymentResult?.count ?? 0,
      lowStockAlerts: stockResult?.count ?? 0,
      recentOrders,
      recentActivities,
    };
  }
}

export const storage = new DatabaseStorage();
