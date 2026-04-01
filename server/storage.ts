import { db } from "./db";
import { eq, desc, sql, and, gte, lte } from "drizzle-orm";
import {
  users, customers, suppliers, products, warehouses, inventoryStock,
  salesOrders, salesOrderItems, quotations, quotationItems, projects, purchaseOrders,
  invoices, payments, employees, attendanceRecords, fieldStaffActivities, payrollStatus, travelExpenses, trips, locationLogs, leads, leadActivities, leadFollowups, quotationActivities, quotationFollowups, supplierProducts, purchaseOrderItems, stockMovements, deliveryChallans, deliveryChallanItems, purchaseRequests, purchaseRequestItems, goodsReceiptNotes, goodsReceiptNoteItems, auditLogs, notifications, leaveRequests, supplierInvoices, supplierPayments, salesInvoices, salesInvoiceItems, customerPayments, attachments, salesReturns, salesReturnItems, creditNotes, dailyPriceSheets, dailyPriceSheetLots,
  type User, type InsertUser, type Customer, type Supplier, type Product,
  type Warehouse, type InventoryStock, type SalesOrder, type SalesOrderItem,
  type Quotation, type QuotationItem, type Project, type PurchaseOrder, type Invoice, type Payment,
  type Employee, type AttendanceRecord, type FieldStaffActivity, type PayrollStatus, type TravelExpense, type Trip, type LocationLog, type Lead, type LeadActivity, type LeadFollowup, type QuotationActivity, type QuotationFollowup, type SupplierProduct, type PurchaseOrderItem, type StockMovement, type DeliveryChallan, type DeliveryChallanItem, type PurchaseRequest, type PurchaseRequestItem, type GoodsReceiptNote, type GoodsReceiptNoteItem, type AuditLog, type Notification, type LeaveRequest, type SupplierInvoice, type SupplierPayment, type SalesInvoice, type SalesInvoiceItem, type CustomerPayment, type Attachment, type SalesReturn, type SalesReturnItem, type CreditNote, type DailyPriceSheet, type DailyPriceSheetLot,
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

  // Leads
  getLeads(): Promise<Lead[]>;
  getLead(id: string): Promise<Lead | undefined>;
  createLead(data: Omit<Lead, "id">): Promise<Lead>;
  updateLead(id: string, data: Partial<Omit<Lead, "id">>): Promise<Lead | undefined>;
  deleteLead(id: string): Promise<boolean>;

  // Lead Activities
  getLeadActivities(leadId: string): Promise<LeadActivity[]>;
  createLeadActivity(data: Omit<LeadActivity, "id" | "createdAt">): Promise<LeadActivity>;

  // Lead Follow-ups
  getLeadFollowups(leadId: string): Promise<LeadFollowup[]>;
  createLeadFollowup(data: Omit<LeadFollowup, "id" | "createdAt">): Promise<LeadFollowup>;
  updateLeadFollowup(id: string, data: Partial<Omit<LeadFollowup, "id" | "createdAt">>): Promise<LeadFollowup | undefined>;
  completeLeadFollowup(id: string): Promise<LeadFollowup | undefined>;

  // Quotation Activities
  getQuotationActivities(quotationId: string): Promise<QuotationActivity[]>;
  createQuotationActivity(data: Omit<QuotationActivity, "id" | "createdAt">): Promise<QuotationActivity>;

  // Quotation Follow-ups
  getQuotationFollowups(quotationId: string): Promise<QuotationFollowup[]>;
  createQuotationFollowup(data: Omit<QuotationFollowup, "id" | "createdAt">): Promise<QuotationFollowup>;
  updateQuotationFollowup(id: string, data: Partial<Omit<QuotationFollowup, "id" | "createdAt">>): Promise<QuotationFollowup | undefined>;
  completeQuotationFollowup(id: string): Promise<QuotationFollowup | undefined>;

  // Combined follow-ups
  getAllPendingFollowups(): Promise<{ type: string; id: string; parentId: string; parentName: string; title: string; dueDate: Date; priority: string; createdBy: string }[]>;
  getFollowupsSummary(): Promise<{ today: number; overdue: number; totalPending: number }>;

  // Supplier Products
  getSupplierProducts(supplierId: string): Promise<SupplierProduct[]>;
  getProductSuppliers(productId: string): Promise<SupplierProduct[]>;
  createSupplierProduct(data: Omit<SupplierProduct, "id">): Promise<SupplierProduct>;
  updateSupplierProduct(id: string, data: Partial<Omit<SupplierProduct, "id">>): Promise<SupplierProduct | undefined>;
  deleteSupplierProduct(id: string): Promise<boolean>;

  // Purchase Order Items
  getPurchaseOrderItems(purchaseOrderId: string): Promise<PurchaseOrderItem[]>;
  createPurchaseOrderItem(data: Omit<PurchaseOrderItem, "id">): Promise<PurchaseOrderItem>;
  deletePurchaseOrderItems(purchaseOrderId: string): Promise<boolean>;

  // Stock Movements
  getStockMovements(): Promise<StockMovement[]>;
  getStockMovementsByProduct(productId: string): Promise<StockMovement[]>;
  createStockMovement(data: Omit<StockMovement, "id" | "createdAt">): Promise<StockMovement>;

  // Delivery Challans
  getDeliveryChallans(): Promise<DeliveryChallan[]>;
  getDeliveryChallan(id: string): Promise<DeliveryChallan | undefined>;
  getDeliveryChallansByOrder(orderId: string): Promise<DeliveryChallan[]>;
  createDeliveryChallan(data: Omit<DeliveryChallan, "id" | "createdAt">): Promise<DeliveryChallan>;
  updateDeliveryChallan(id: string, data: Partial<Omit<DeliveryChallan, "id" | "createdAt">>): Promise<DeliveryChallan | undefined>;

  // Delivery Challan Items
  getDeliveryChallanItems(challanId: string): Promise<DeliveryChallanItem[]>;
  createDeliveryChallanItem(data: Omit<DeliveryChallanItem, "id">): Promise<DeliveryChallanItem>;
  updateDeliveryChallanItem(itemId: string, data: Partial<Omit<DeliveryChallanItem, "id">>): Promise<DeliveryChallanItem | undefined>;
  deleteDeliveryChallanItems(challanId: string): Promise<boolean>;

  // Purchase Requests
  getPurchaseRequests(): Promise<PurchaseRequest[]>;
  getPurchaseRequest(id: string): Promise<PurchaseRequest | undefined>;
  getPurchaseRequestsBySalesOrder(salesOrderId: string): Promise<PurchaseRequest[]>;
  createPurchaseRequest(data: Omit<PurchaseRequest, "id" | "createdAt">): Promise<PurchaseRequest>;
  updatePurchaseRequest(id: string, data: Partial<Omit<PurchaseRequest, "id" | "createdAt">>): Promise<PurchaseRequest | undefined>;
  deletePurchaseRequest(id: string): Promise<boolean>;

  // Purchase Request Items
  getPurchaseRequestItems(requestId: string): Promise<PurchaseRequestItem[]>;
  createPurchaseRequestItem(data: Omit<PurchaseRequestItem, "id">): Promise<PurchaseRequestItem>;
  deletePurchaseRequestItems(requestId: string): Promise<boolean>;

  // Goods Receipt Notes
  getGRNs(): Promise<GoodsReceiptNote[]>;
  getGRN(id: string): Promise<GoodsReceiptNote | undefined>;
  getGRNsByPO(poId: string): Promise<GoodsReceiptNote[]>;
  createGRN(data: Omit<GoodsReceiptNote, "id" | "createdAt">): Promise<GoodsReceiptNote>;
  updateGRN(id: string, data: Partial<Omit<GoodsReceiptNote, "id" | "createdAt">>): Promise<GoodsReceiptNote | undefined>;
  deleteGRN(id: string): Promise<boolean>;

  // Goods Receipt Note Items
  getGRNItems(grnId: string): Promise<GoodsReceiptNoteItem[]>;
  createGRNItem(data: Omit<GoodsReceiptNoteItem, "id">): Promise<GoodsReceiptNoteItem>;
  deleteGRNItems(grnId: string): Promise<boolean>;

  // Audit Logs
  getAuditLogs(): Promise<AuditLog[]>;
  createAuditLog(log: { userId: string; action: string; module: string; details?: string; ipAddress?: string }): Promise<AuditLog>;

  // Notifications
  getNotifications(userId: string): Promise<Notification[]>;
  createNotification(data: { userId: string; type: string; title: string; message: string; relatedId?: string | null }): Promise<Notification>;
  markNotificationRead(id: string, userId: string): Promise<Notification | undefined>;
  markAllNotificationsRead(userId: string): Promise<void>;

  // Leave Requests
  getLeaveRequests(): Promise<LeaveRequest[]>;
  getLeaveRequestsByEmployee(employeeId: string): Promise<LeaveRequest[]>;
  createLeaveRequest(data: Omit<LeaveRequest, "id" | "createdAt">): Promise<LeaveRequest>;
  updateLeaveRequest(id: string, data: Partial<Omit<LeaveRequest, "id" | "createdAt">>): Promise<LeaveRequest | undefined>;
  deleteLeaveRequest(id: string): Promise<boolean>;

  // Supplier Invoices
  getSupplierInvoices(): Promise<SupplierInvoice[]>;
  getSupplierInvoice(id: string): Promise<SupplierInvoice | undefined>;
  getSupplierInvoicesBySupplier(supplierId: string): Promise<SupplierInvoice[]>;
  getSupplierInvoicesByPO(poId: string): Promise<SupplierInvoice[]>;
  createSupplierInvoice(data: Omit<SupplierInvoice, "id" | "createdAt">): Promise<SupplierInvoice>;
  updateSupplierInvoice(id: string, data: Partial<Omit<SupplierInvoice, "id" | "createdAt">>): Promise<SupplierInvoice | undefined>;
  deleteSupplierInvoice(id: string): Promise<boolean>;

  // Supplier Payments
  getSupplierPayments(): Promise<SupplierPayment[]>;
  getSupplierPayment(id: string): Promise<SupplierPayment | undefined>;
  getSupplierPaymentsByInvoice(invoiceId: string): Promise<SupplierPayment[]>;
  getSupplierPaymentsByPO(poId: string): Promise<SupplierPayment[]>;
  createSupplierPayment(data: Omit<SupplierPayment, "id" | "createdAt">): Promise<SupplierPayment>;
  updateSupplierPayment(id: string, data: Partial<Omit<SupplierPayment, "id" | "createdAt">>): Promise<SupplierPayment | undefined>;
  deleteSupplierPayment(id: string): Promise<boolean>;

  // Sales Invoices
  getSalesInvoices(): Promise<SalesInvoice[]>;
  getSalesInvoice(id: string): Promise<SalesInvoice | undefined>;
  getSalesInvoiceByChallan(challanId: string): Promise<SalesInvoice | undefined>;
  getSalesInvoicesByCustomer(customerId: string): Promise<SalesInvoice[]>;
  createSalesInvoice(data: Omit<SalesInvoice, "id" | "createdAt">): Promise<SalesInvoice>;
  updateSalesInvoice(id: string, data: Partial<Omit<SalesInvoice, "id" | "createdAt">>): Promise<SalesInvoice | undefined>;
  deleteSalesInvoice(id: string): Promise<boolean>;

  // Sales Invoice Items
  getSalesInvoiceItems(invoiceId: string): Promise<SalesInvoiceItem[]>;
  createSalesInvoiceItem(data: Omit<SalesInvoiceItem, "id">): Promise<SalesInvoiceItem>;
  deleteSalesInvoiceItems(invoiceId: string): Promise<boolean>;

  // Customer Payments
  getCustomerPayments(invoiceId: string): Promise<CustomerPayment[]>;
  getAllCustomerPayments(): Promise<CustomerPayment[]>;
  createCustomerPayment(data: Omit<CustomerPayment, "id" | "createdAt">): Promise<CustomerPayment>;
  deleteCustomerPayment(id: string): Promise<boolean>;

  // Invoice Number Generation
  generateSalesInvoiceNumber(): Promise<string>;

  // Attachments
  getAttachments(entityType: string, entityId: string): Promise<Attachment[]>;
  createAttachment(data: Omit<Attachment, "id" | "createdAt" | "isDeleted" | "deletedAt">): Promise<Attachment>;
  getAttachmentByHash(entityType: string, entityId: string, fileHash: string): Promise<Attachment | undefined>;
  softDeleteAttachment(id: string): Promise<Attachment | undefined>;

  // Sales Returns
  getSalesReturns(): Promise<SalesReturn[]>;
  getSalesReturn(id: string): Promise<SalesReturn | undefined>;
  getSalesReturnsByInvoice(invoiceId: string): Promise<SalesReturn[]>;
  createSalesReturn(data: Omit<SalesReturn, "id" | "createdAt">): Promise<SalesReturn>;
  updateSalesReturn(id: string, data: Partial<Omit<SalesReturn, "id" | "createdAt">>): Promise<SalesReturn | undefined>;

  // Sales Return Items
  getSalesReturnItems(salesReturnId: string): Promise<SalesReturnItem[]>;
  createSalesReturnItem(data: Omit<SalesReturnItem, "id">): Promise<SalesReturnItem>;
  updateSalesReturnItem(id: string, data: Partial<Omit<SalesReturnItem, "id">>): Promise<SalesReturnItem | undefined>;

  // Credit Notes
  getCreditNotes(): Promise<CreditNote[]>;
  getCreditNote(id: string): Promise<CreditNote | undefined>;
  getCreditNotesByInvoice(invoiceId: string): Promise<CreditNote[]>;
  createCreditNote(data: Omit<CreditNote, "id" | "createdAt">): Promise<CreditNote>;
  generateCreditNoteNumber(): Promise<string>;

  // Invoice credited amount helper
  recomputeInvoiceCreditedAmount(invoiceId: string): Promise<SalesInvoice | undefined>;

  // Daily Price Sheets
  getDailyPriceSheets(filters?: { productId?: string; sheetDate?: string; status?: string }): Promise<DailyPriceSheet[]>;
  getDailyPriceSheet(id: string): Promise<DailyPriceSheet | undefined>;
  getDailyPriceSheetByProductDate(productId: string, sheetDate: string): Promise<DailyPriceSheet | undefined>;
  createDailyPriceSheet(data: Omit<DailyPriceSheet, "id" | "createdAt">): Promise<DailyPriceSheet>;
  updateDailyPriceSheet(id: string, data: Partial<Omit<DailyPriceSheet, "id" | "createdAt">>): Promise<DailyPriceSheet | undefined>;
  getDailyPriceSheetLots(sheetId: string): Promise<DailyPriceSheetLot[]>;
  upsertDailyPriceSheetLots(sheetId: string, lots: Omit<DailyPriceSheetLot, "id">[]): Promise<DailyPriceSheetLot[]>;
  getEffectivePriceForProduct(productId: string, date: string): Promise<{ effectivePrice: string | null; sheetDate: string | null; noConfirmedPrice: boolean } | null>;

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

  // Leads
  async getLeads(): Promise<Lead[]> {
    return db.select().from(leads).orderBy(desc(leads.createdAt));
  }

  async getLead(id: string): Promise<Lead | undefined> {
    const [lead] = await db.select().from(leads).where(eq(leads.id, id));
    return lead;
  }

  async createLead(data: Omit<Lead, "id">): Promise<Lead> {
    const [created] = await db.insert(leads).values(data).returning();
    return created;
  }

  async updateLead(id: string, data: Partial<Omit<Lead, "id">>): Promise<Lead | undefined> {
    const [updated] = await db.update(leads).set(data).where(eq(leads.id, id)).returning();
    return updated;
  }

  async deleteLead(id: string): Promise<boolean> {
    await db.delete(leads).where(eq(leads.id, id));
    return true;
  }

  // Lead Activities
  async getLeadActivities(leadId: string): Promise<LeadActivity[]> {
    return db.select().from(leadActivities).where(eq(leadActivities.leadId, leadId)).orderBy(desc(leadActivities.createdAt));
  }

  async createLeadActivity(data: Omit<LeadActivity, "id" | "createdAt">): Promise<LeadActivity> {
    const [created] = await db.insert(leadActivities).values(data).returning();
    return created;
  }

  // Lead Follow-ups
  async getLeadFollowups(leadId: string): Promise<LeadFollowup[]> {
    return db.select().from(leadFollowups).where(eq(leadFollowups.leadId, leadId)).orderBy(leadFollowups.dueDate);
  }

  async createLeadFollowup(data: Omit<LeadFollowup, "id" | "createdAt">): Promise<LeadFollowup> {
    const [created] = await db.insert(leadFollowups).values(data).returning();
    return created;
  }

  async updateLeadFollowup(id: string, data: Partial<Omit<LeadFollowup, "id" | "createdAt">>): Promise<LeadFollowup | undefined> {
    const [updated] = await db.update(leadFollowups).set(data).where(eq(leadFollowups.id, id)).returning();
    return updated;
  }

  async completeLeadFollowup(id: string): Promise<LeadFollowup | undefined> {
    const [updated] = await db.update(leadFollowups).set({ status: "completed", completedAt: new Date() }).where(eq(leadFollowups.id, id)).returning();
    return updated;
  }

  // Quotation Activities
  async getQuotationActivities(quotationId: string): Promise<QuotationActivity[]> {
    return db.select().from(quotationActivities).where(eq(quotationActivities.quotationId, quotationId)).orderBy(desc(quotationActivities.createdAt));
  }

  async createQuotationActivity(data: Omit<QuotationActivity, "id" | "createdAt">): Promise<QuotationActivity> {
    const [created] = await db.insert(quotationActivities).values(data).returning();
    return created;
  }

  // Quotation Follow-ups
  async getQuotationFollowups(quotationId: string): Promise<QuotationFollowup[]> {
    return db.select().from(quotationFollowups).where(eq(quotationFollowups.quotationId, quotationId)).orderBy(quotationFollowups.dueDate);
  }

  async createQuotationFollowup(data: Omit<QuotationFollowup, "id" | "createdAt">): Promise<QuotationFollowup> {
    const [created] = await db.insert(quotationFollowups).values(data).returning();
    return created;
  }

  async updateQuotationFollowup(id: string, data: Partial<Omit<QuotationFollowup, "id" | "createdAt">>): Promise<QuotationFollowup | undefined> {
    const [updated] = await db.update(quotationFollowups).set(data).where(eq(quotationFollowups.id, id)).returning();
    return updated;
  }

  async completeQuotationFollowup(id: string): Promise<QuotationFollowup | undefined> {
    const [updated] = await db.update(quotationFollowups).set({ status: "completed", completedAt: new Date() }).where(eq(quotationFollowups.id, id)).returning();
    return updated;
  }

  // Combined follow-ups
  async getAllPendingFollowups(): Promise<{ type: string; id: string; parentId: string; parentName: string; title: string; dueDate: Date; priority: string; createdBy: string }[]> {
    const leadFups = await db.select({
      id: leadFollowups.id,
      parentId: leadFollowups.leadId,
      title: leadFollowups.title,
      dueDate: leadFollowups.dueDate,
      priority: leadFollowups.priority,
      createdBy: leadFollowups.createdBy,
      parentName: leads.name,
    }).from(leadFollowups).leftJoin(leads, eq(leadFollowups.leadId, leads.id)).where(eq(leadFollowups.status, "pending"));

    const quoteFups = await db.select({
      id: quotationFollowups.id,
      parentId: quotationFollowups.quotationId,
      title: quotationFollowups.title,
      dueDate: quotationFollowups.dueDate,
      priority: quotationFollowups.priority,
      createdBy: quotationFollowups.createdBy,
      parentName: quotations.quoteNumber,
    }).from(quotationFollowups).leftJoin(quotations, eq(quotationFollowups.quotationId, quotations.id)).where(eq(quotationFollowups.status, "pending"));

    const combined = [
      ...leadFups.map(f => ({ ...f, type: "lead", parentName: f.parentName || "Unknown" })),
      ...quoteFups.map(f => ({ ...f, type: "quotation", parentName: f.parentName || "Unknown" })),
    ];
    combined.sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());
    return combined;
  }

  async getFollowupsSummary(): Promise<{ today: number; overdue: number; totalPending: number }> {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);

    const allPending = await this.getAllPendingFollowups();
    const today = allPending.filter(f => {
      const d = new Date(f.dueDate);
      return d >= todayStart && d < todayEnd;
    }).length;
    const overdue = allPending.filter(f => new Date(f.dueDate) < todayStart).length;

    return { today, overdue, totalPending: allPending.length };
  }

  // Audit Logs
  async getAuditLogs(): Promise<AuditLog[]> {
    return db.select().from(auditLogs).orderBy(desc(auditLogs.timestamp)).limit(200);
  }

  async createAuditLog(log: { userId: string; action: string; module: string; details?: string; ipAddress?: string }): Promise<AuditLog> {
    const [created] = await db.insert(auditLogs).values(log).returning();
    return created;
  }

  // Notifications
  async getNotifications(userId: string): Promise<Notification[]> {
    return db.select().from(notifications)
      .where(eq(notifications.userId, userId))
      .orderBy(desc(notifications.createdAt))
      .limit(50);
  }

  async createNotification(data: { userId: string; type: string; title: string; message: string; relatedId?: string | null }): Promise<Notification> {
    const [created] = await db.insert(notifications).values({
      userId: data.userId,
      type: data.type,
      title: data.title,
      message: data.message,
      isRead: false,
      relatedId: data.relatedId || null,
    }).returning();
    return created;
  }

  async markNotificationRead(id: string, userId: string): Promise<Notification | undefined> {
    const [updated] = await db.update(notifications).set({ isRead: true })
      .where(and(eq(notifications.id, id), eq(notifications.userId, userId)))
      .returning();
    return updated;
  }

  async markAllNotificationsRead(userId: string): Promise<void> {
    await db.update(notifications).set({ isRead: true }).where(eq(notifications.userId, userId));
  }

  // Supplier Products
  async getSupplierProducts(supplierId: string): Promise<SupplierProduct[]> {
    return await db.select().from(supplierProducts).where(eq(supplierProducts.supplierId, supplierId));
  }

  async getProductSuppliers(productId: string): Promise<SupplierProduct[]> {
    return await db.select().from(supplierProducts).where(eq(supplierProducts.productId, productId));
  }

  async createSupplierProduct(data: Omit<SupplierProduct, "id">): Promise<SupplierProduct> {
    const [created] = await db.insert(supplierProducts).values(data).returning();
    return created;
  }

  async updateSupplierProduct(id: string, data: Partial<Omit<SupplierProduct, "id">>): Promise<SupplierProduct | undefined> {
    const [updated] = await db.update(supplierProducts).set(data).where(eq(supplierProducts.id, id)).returning();
    return updated;
  }

  async deleteSupplierProduct(id: string): Promise<boolean> {
    const result = await db.delete(supplierProducts).where(eq(supplierProducts.id, id)).returning();
    return result.length > 0;
  }

  // Purchase Order Items
  async getPurchaseOrderItems(purchaseOrderId: string): Promise<PurchaseOrderItem[]> {
    return await db.select().from(purchaseOrderItems).where(eq(purchaseOrderItems.purchaseOrderId, purchaseOrderId));
  }

  async createPurchaseOrderItem(data: Omit<PurchaseOrderItem, "id">): Promise<PurchaseOrderItem> {
    const [created] = await db.insert(purchaseOrderItems).values(data).returning();
    return created;
  }

  async deletePurchaseOrderItems(purchaseOrderId: string): Promise<boolean> {
    await db.delete(purchaseOrderItems).where(eq(purchaseOrderItems.purchaseOrderId, purchaseOrderId));
    return true;
  }

  // Stock Movements
  async getStockMovements(): Promise<StockMovement[]> {
    return await db.select().from(stockMovements).orderBy(desc(stockMovements.createdAt));
  }

  async getStockMovementsByProduct(productId: string): Promise<StockMovement[]> {
    return await db.select().from(stockMovements).where(eq(stockMovements.productId, productId)).orderBy(desc(stockMovements.createdAt));
  }

  async createStockMovement(data: Omit<StockMovement, "id" | "createdAt">): Promise<StockMovement> {
    const [created] = await db.insert(stockMovements).values(data).returning();
    return created;
  }

  // Delivery Challans
  async getDeliveryChallans(): Promise<DeliveryChallan[]> {
    return await db.select().from(deliveryChallans).orderBy(desc(deliveryChallans.createdAt));
  }

  async getDeliveryChallan(id: string): Promise<DeliveryChallan | undefined> {
    const [found] = await db.select().from(deliveryChallans).where(eq(deliveryChallans.id, id));
    return found;
  }

  async getDeliveryChallansByOrder(orderId: string): Promise<DeliveryChallan[]> {
    return await db.select().from(deliveryChallans).where(eq(deliveryChallans.orderId, orderId)).orderBy(desc(deliveryChallans.createdAt));
  }

  async createDeliveryChallan(data: Omit<DeliveryChallan, "id" | "createdAt">): Promise<DeliveryChallan> {
    const [created] = await db.insert(deliveryChallans).values(data).returning();
    return created;
  }

  async updateDeliveryChallan(id: string, data: Partial<Omit<DeliveryChallan, "id" | "createdAt">>): Promise<DeliveryChallan | undefined> {
    const [updated] = await db.update(deliveryChallans).set(data).where(eq(deliveryChallans.id, id)).returning();
    return updated;
  }

  // Delivery Challan Items
  async getDeliveryChallanItems(challanId: string): Promise<DeliveryChallanItem[]> {
    return await db.select().from(deliveryChallanItems).where(eq(deliveryChallanItems.challanId, challanId));
  }

  async createDeliveryChallanItem(data: Omit<DeliveryChallanItem, "id">): Promise<DeliveryChallanItem> {
    const [created] = await db.insert(deliveryChallanItems).values(data).returning();
    return created;
  }

  async updateDeliveryChallanItem(itemId: string, data: Partial<Omit<DeliveryChallanItem, "id">>): Promise<DeliveryChallanItem | undefined> {
    const [updated] = await db.update(deliveryChallanItems).set(data).where(eq(deliveryChallanItems.id, itemId)).returning();
    return updated;
  }

  async deleteDeliveryChallanItems(challanId: string): Promise<boolean> {
    await db.delete(deliveryChallanItems).where(eq(deliveryChallanItems.challanId, challanId));
    return true;
  }

  // Purchase Requests
  async getPurchaseRequests(): Promise<PurchaseRequest[]> {
    return await db.select().from(purchaseRequests).orderBy(desc(purchaseRequests.createdAt));
  }

  async getPurchaseRequest(id: string): Promise<PurchaseRequest | undefined> {
    const [found] = await db.select().from(purchaseRequests).where(eq(purchaseRequests.id, id));
    return found;
  }

  async getPurchaseRequestsBySalesOrder(salesOrderId: string): Promise<PurchaseRequest[]> {
    return await db.select().from(purchaseRequests).where(eq(purchaseRequests.salesOrderId, salesOrderId));
  }

  async createPurchaseRequest(data: Omit<PurchaseRequest, "id" | "createdAt">): Promise<PurchaseRequest> {
    const [created] = await db.insert(purchaseRequests).values(data).returning();
    return created;
  }

  async updatePurchaseRequest(id: string, data: Partial<Omit<PurchaseRequest, "id" | "createdAt">>): Promise<PurchaseRequest | undefined> {
    const [updated] = await db.update(purchaseRequests).set(data).where(eq(purchaseRequests.id, id)).returning();
    return updated;
  }

  async deletePurchaseRequest(id: string): Promise<boolean> {
    await db.delete(purchaseRequestItems).where(eq(purchaseRequestItems.requestId, id));
    await db.delete(purchaseRequests).where(eq(purchaseRequests.id, id));
    return true;
  }

  // Purchase Request Items
  async getPurchaseRequestItems(requestId: string): Promise<PurchaseRequestItem[]> {
    return await db.select().from(purchaseRequestItems).where(eq(purchaseRequestItems.requestId, requestId));
  }

  async createPurchaseRequestItem(data: Omit<PurchaseRequestItem, "id">): Promise<PurchaseRequestItem> {
    const [created] = await db.insert(purchaseRequestItems).values(data).returning();
    return created;
  }

  async deletePurchaseRequestItems(requestId: string): Promise<boolean> {
    await db.delete(purchaseRequestItems).where(eq(purchaseRequestItems.requestId, requestId));
    return true;
  }

  // Goods Receipt Notes
  async getGRNs(): Promise<GoodsReceiptNote[]> {
    return await db.select().from(goodsReceiptNotes).orderBy(desc(goodsReceiptNotes.createdAt));
  }

  async getGRN(id: string): Promise<GoodsReceiptNote | undefined> {
    const [found] = await db.select().from(goodsReceiptNotes).where(eq(goodsReceiptNotes.id, id));
    return found;
  }

  async getGRNsByPO(poId: string): Promise<GoodsReceiptNote[]> {
    return await db.select().from(goodsReceiptNotes).where(eq(goodsReceiptNotes.purchaseOrderId, poId)).orderBy(desc(goodsReceiptNotes.createdAt));
  }

  async createGRN(data: Omit<GoodsReceiptNote, "id" | "createdAt">): Promise<GoodsReceiptNote> {
    const [created] = await db.insert(goodsReceiptNotes).values(data).returning();
    return created;
  }

  async updateGRN(id: string, data: Partial<Omit<GoodsReceiptNote, "id" | "createdAt">>): Promise<GoodsReceiptNote | undefined> {
    const [updated] = await db.update(goodsReceiptNotes).set(data).where(eq(goodsReceiptNotes.id, id)).returning();
    return updated;
  }

  async deleteGRN(id: string): Promise<boolean> {
    await db.delete(goodsReceiptNoteItems).where(eq(goodsReceiptNoteItems.grnId, id));
    await db.delete(goodsReceiptNotes).where(eq(goodsReceiptNotes.id, id));
    return true;
  }

  // Goods Receipt Note Items
  async getGRNItems(grnId: string): Promise<GoodsReceiptNoteItem[]> {
    return await db.select().from(goodsReceiptNoteItems).where(eq(goodsReceiptNoteItems.grnId, grnId));
  }

  async createGRNItem(data: Omit<GoodsReceiptNoteItem, "id">): Promise<GoodsReceiptNoteItem> {
    const [created] = await db.insert(goodsReceiptNoteItems).values(data).returning();
    return created;
  }

  async deleteGRNItems(grnId: string): Promise<boolean> {
    await db.delete(goodsReceiptNoteItems).where(eq(goodsReceiptNoteItems.grnId, grnId));
    return true;
  }

  // Leave Requests
  async getLeaveRequests(): Promise<LeaveRequest[]> {
    return await db.select().from(leaveRequests).orderBy(desc(leaveRequests.createdAt));
  }

  async getLeaveRequestsByEmployee(employeeId: string): Promise<LeaveRequest[]> {
    return await db.select().from(leaveRequests).where(eq(leaveRequests.employeeId, employeeId)).orderBy(desc(leaveRequests.createdAt));
  }

  async createLeaveRequest(data: Omit<LeaveRequest, "id" | "createdAt">): Promise<LeaveRequest> {
    const [created] = await db.insert(leaveRequests).values(data).returning();
    return created;
  }

  async updateLeaveRequest(id: string, data: Partial<Omit<LeaveRequest, "id" | "createdAt">>): Promise<LeaveRequest | undefined> {
    const [updated] = await db.update(leaveRequests).set(data).where(eq(leaveRequests.id, id)).returning();
    return updated;
  }

  async deleteLeaveRequest(id: string): Promise<boolean> {
    await db.delete(leaveRequests).where(eq(leaveRequests.id, id));
    return true;
  }

  // Supplier Invoices
  async getSupplierInvoices(): Promise<SupplierInvoice[]> {
    return db.select().from(supplierInvoices).orderBy(desc(supplierInvoices.createdAt));
  }

  async getSupplierInvoice(id: string): Promise<SupplierInvoice | undefined> {
    const [inv] = await db.select().from(supplierInvoices).where(eq(supplierInvoices.id, id));
    return inv;
  }

  async getSupplierInvoicesBySupplier(supplierId: string): Promise<SupplierInvoice[]> {
    return db.select().from(supplierInvoices).where(eq(supplierInvoices.supplierId, supplierId)).orderBy(desc(supplierInvoices.createdAt));
  }

  async getSupplierInvoicesByPO(poId: string): Promise<SupplierInvoice[]> {
    return db.select().from(supplierInvoices).where(eq(supplierInvoices.purchaseOrderId, poId)).orderBy(desc(supplierInvoices.createdAt));
  }

  async createSupplierInvoice(data: Omit<SupplierInvoice, "id" | "createdAt">): Promise<SupplierInvoice> {
    const [created] = await db.insert(supplierInvoices).values(data).returning();
    return created;
  }

  async updateSupplierInvoice(id: string, data: Partial<Omit<SupplierInvoice, "id" | "createdAt">>): Promise<SupplierInvoice | undefined> {
    const [updated] = await db.update(supplierInvoices).set(data).where(eq(supplierInvoices.id, id)).returning();
    return updated;
  }

  async deleteSupplierInvoice(id: string): Promise<boolean> {
    await db.delete(supplierPayments).where(eq(supplierPayments.supplierInvoiceId, id));
    await db.delete(supplierInvoices).where(eq(supplierInvoices.id, id));
    return true;
  }

  // Supplier Payments
  async getSupplierPayments(): Promise<SupplierPayment[]> {
    return db.select().from(supplierPayments).orderBy(desc(supplierPayments.createdAt));
  }

  async getSupplierPayment(id: string): Promise<SupplierPayment | undefined> {
    const [pay] = await db.select().from(supplierPayments).where(eq(supplierPayments.id, id));
    return pay;
  }

  async getSupplierPaymentsByInvoice(invoiceId: string): Promise<SupplierPayment[]> {
    return db.select().from(supplierPayments).where(eq(supplierPayments.supplierInvoiceId, invoiceId)).orderBy(desc(supplierPayments.createdAt));
  }

  async getSupplierPaymentsByPO(poId: string): Promise<SupplierPayment[]> {
    return db.select().from(supplierPayments).where(eq(supplierPayments.purchaseOrderId, poId)).orderBy(desc(supplierPayments.createdAt));
  }

  async createSupplierPayment(data: Omit<SupplierPayment, "id" | "createdAt">): Promise<SupplierPayment> {
    const [created] = await db.insert(supplierPayments).values(data).returning();
    return created;
  }

  async updateSupplierPayment(id: string, data: Partial<Omit<SupplierPayment, "id" | "createdAt">>): Promise<SupplierPayment | undefined> {
    const [updated] = await db.update(supplierPayments).set(data).where(eq(supplierPayments.id, id)).returning();
    return updated;
  }

  async deleteSupplierPayment(id: string): Promise<boolean> {
    await db.delete(supplierPayments).where(eq(supplierPayments.id, id));
    return true;
  }

  // Sales Invoices
  async getSalesInvoices(): Promise<SalesInvoice[]> {
    return db.select().from(salesInvoices).orderBy(desc(salesInvoices.createdAt));
  }

  async getSalesInvoice(id: string): Promise<SalesInvoice | undefined> {
    const [inv] = await db.select().from(salesInvoices).where(eq(salesInvoices.id, id));
    return inv;
  }

  async getSalesInvoiceByChallan(challanId: string): Promise<SalesInvoice | undefined> {
    const [inv] = await db.select().from(salesInvoices).where(eq(salesInvoices.challanId, challanId));
    return inv;
  }

  async getSalesInvoicesByCustomer(customerId: string): Promise<SalesInvoice[]> {
    return db.select().from(salesInvoices).where(eq(salesInvoices.customerId, customerId)).orderBy(desc(salesInvoices.createdAt));
  }

  async createSalesInvoice(data: Omit<SalesInvoice, "id" | "createdAt">): Promise<SalesInvoice> {
    const [inv] = await db.insert(salesInvoices).values(data as any).returning();
    return inv;
  }

  async updateSalesInvoice(id: string, data: Partial<Omit<SalesInvoice, "id" | "createdAt">>): Promise<SalesInvoice | undefined> {
    const [updated] = await db.update(salesInvoices).set(data as any).where(eq(salesInvoices.id, id)).returning();
    return updated;
  }

  async deleteSalesInvoice(id: string): Promise<boolean> {
    await db.delete(salesInvoices).where(eq(salesInvoices.id, id));
    return true;
  }

  // Sales Invoice Items
  async getSalesInvoiceItems(invoiceId: string): Promise<SalesInvoiceItem[]> {
    return db.select().from(salesInvoiceItems).where(eq(salesInvoiceItems.invoiceId, invoiceId));
  }

  async createSalesInvoiceItem(data: Omit<SalesInvoiceItem, "id">): Promise<SalesInvoiceItem> {
    const [item] = await db.insert(salesInvoiceItems).values(data as any).returning();
    return item;
  }

  async deleteSalesInvoiceItems(invoiceId: string): Promise<boolean> {
    await db.delete(salesInvoiceItems).where(eq(salesInvoiceItems.invoiceId, invoiceId));
    return true;
  }

  // Customer Payments
  async getCustomerPayments(invoiceId: string): Promise<CustomerPayment[]> {
    return db.select().from(customerPayments).where(eq(customerPayments.invoiceId, invoiceId)).orderBy(desc(customerPayments.createdAt));
  }

  async getAllCustomerPayments(): Promise<CustomerPayment[]> {
    return db.select().from(customerPayments).orderBy(desc(customerPayments.createdAt));
  }

  async createCustomerPayment(data: Omit<CustomerPayment, "id" | "createdAt">): Promise<CustomerPayment> {
    const [pmt] = await db.insert(customerPayments).values(data as any).returning();
    return pmt;
  }

  async deleteCustomerPayment(id: string): Promise<boolean> {
    await db.delete(customerPayments).where(eq(customerPayments.id, id));
    return true;
  }

  async generateSalesInvoiceNumber(): Promise<string> {
    const now = new Date();
    const month = now.getMonth(); // 0-indexed, April = 3
    const year = now.getFullYear();
    const fyStart = month >= 3 ? year : year - 1;
    const fyEnd = fyStart + 1;
    const fyCode = `${String(fyStart).slice(-2)}${String(fyEnd).slice(-2)}`;
    const prefix = `INV-${fyCode}-`;
    const countResult = await db.execute(sql`
      SELECT COUNT(*) as count FROM sales_invoices
      WHERE invoice_number LIKE ${prefix + '%'}
    `);
    const count = Number((countResult.rows[0] as any)?.count ?? 0);
    return `${prefix}${String(count + 1).padStart(4, "0")}`;
  }

  // Attachments
  async getAttachments(entityType: string, entityId: string): Promise<Attachment[]> {
    return await db.select().from(attachments)
      .where(and(eq(attachments.entityType, entityType), eq(attachments.entityId, entityId), eq(attachments.isDeleted, false)))
      .orderBy(desc(attachments.createdAt));
  }

  async createAttachment(data: Omit<Attachment, "id" | "createdAt" | "isDeleted" | "deletedAt">): Promise<Attachment> {
    const [created] = await db.insert(attachments).values(data).returning();
    return created;
  }

  async getAttachmentByHash(entityType: string, entityId: string, fileHash: string): Promise<Attachment | undefined> {
    const [found] = await db.select().from(attachments)
      .where(and(eq(attachments.entityType, entityType), eq(attachments.entityId, entityId), eq(attachments.fileHash, fileHash), eq(attachments.isDeleted, false)));
    return found;
  }

  async softDeleteAttachment(id: string): Promise<Attachment | undefined> {
    const [updated] = await db.update(attachments)
      .set({ isDeleted: true, deletedAt: new Date() })
      .where(eq(attachments.id, id))
      .returning();
    return updated;
  }

  // Sales Returns
  async getSalesReturns(): Promise<SalesReturn[]> {
    return db.select().from(salesReturns).orderBy(desc(salesReturns.createdAt));
  }

  async getSalesReturn(id: string): Promise<SalesReturn | undefined> {
    const [sr] = await db.select().from(salesReturns).where(eq(salesReturns.id, id));
    return sr;
  }

  async getSalesReturnsByInvoice(invoiceId: string): Promise<SalesReturn[]> {
    return db.select().from(salesReturns).where(eq(salesReturns.invoiceId, invoiceId)).orderBy(desc(salesReturns.createdAt));
  }

  async createSalesReturn(data: Omit<SalesReturn, "id" | "createdAt">): Promise<SalesReturn> {
    const [sr] = await db.insert(salesReturns).values(data as any).returning();
    return sr;
  }

  async updateSalesReturn(id: string, data: Partial<Omit<SalesReturn, "id" | "createdAt">>): Promise<SalesReturn | undefined> {
    const [updated] = await db.update(salesReturns).set(data as any).where(eq(salesReturns.id, id)).returning();
    return updated;
  }

  // Sales Return Items
  async getSalesReturnItems(salesReturnId: string): Promise<SalesReturnItem[]> {
    return db.select().from(salesReturnItems).where(eq(salesReturnItems.salesReturnId, salesReturnId));
  }

  async createSalesReturnItem(data: Omit<SalesReturnItem, "id">): Promise<SalesReturnItem> {
    const [item] = await db.insert(salesReturnItems).values(data as any).returning();
    return item;
  }

  async updateSalesReturnItem(id: string, data: Partial<Omit<SalesReturnItem, "id">>): Promise<SalesReturnItem | undefined> {
    const [updated] = await db.update(salesReturnItems).set(data as any).where(eq(salesReturnItems.id, id)).returning();
    return updated;
  }

  // Credit Notes
  async getCreditNotes(): Promise<CreditNote[]> {
    return db.select().from(creditNotes).orderBy(desc(creditNotes.createdAt));
  }

  async getCreditNote(id: string): Promise<CreditNote | undefined> {
    const [cn] = await db.select().from(creditNotes).where(eq(creditNotes.id, id));
    return cn;
  }

  async getCreditNotesByInvoice(invoiceId: string): Promise<CreditNote[]> {
    return db.select().from(creditNotes).where(eq(creditNotes.invoiceId, invoiceId)).orderBy(desc(creditNotes.createdAt));
  }

  async createCreditNote(data: Omit<CreditNote, "id" | "createdAt">): Promise<CreditNote> {
    const [cn] = await db.insert(creditNotes).values(data as any).returning();
    return cn;
  }

  async generateCreditNoteNumber(): Promise<string> {
    const now = new Date();
    const month = now.getMonth();
    const year = now.getFullYear();
    const fyStart = month >= 3 ? year : year - 1;
    const fyEnd = fyStart + 1;
    const fyCode = `${String(fyStart).slice(-2)}${String(fyEnd).slice(-2)}`;
    const prefix = `CN-${fyCode}-`;
    const countResult = await db.execute(sql`
      SELECT COUNT(*) as count FROM credit_notes
      WHERE credit_note_number LIKE ${prefix + '%'}
    `);
    const count = Number((countResult.rows[0] as any)?.count ?? 0);
    return `${prefix}${String(count + 1).padStart(4, "0")}`;
  }

  async recomputeInvoiceCreditedAmount(invoiceId: string): Promise<SalesInvoice | undefined> {
    const inv = await this.getSalesInvoice(invoiceId);
    if (!inv) return undefined;
    const cns = await this.getCreditNotesByInvoice(invoiceId);
    const totalCredited = cns.reduce((sum, cn) => sum + Number(cn.grandTotal), 0);
    const payments = await this.getCustomerPayments(invoiceId);
    const totalPaid = payments.reduce((sum, p) => sum + Number(p.amount), 0);
    const grandTotal = Number(inv.grandTotal);
    const netOutstanding = grandTotal - totalPaid - totalCredited;
    let newStatus = "pending";
    if (netOutstanding <= 0) newStatus = "paid";
    else if (totalPaid > 0 || totalCredited > 0) newStatus = "partial_paid";
    return this.updateSalesInvoice(invoiceId, { creditedAmount: String(totalCredited), status: newStatus });
  }

  // Daily Price Sheets
  async getDailyPriceSheets(filters?: { productId?: string; sheetDate?: string; status?: string }): Promise<DailyPriceSheet[]> {
    let result = await db.select().from(dailyPriceSheets).orderBy(desc(dailyPriceSheets.createdAt));
    if (filters?.productId) result = result.filter(s => s.productId === filters.productId);
    if (filters?.sheetDate) result = result.filter(s => s.sheetDate === filters.sheetDate);
    if (filters?.status) result = result.filter(s => s.status === filters.status);
    return result;
  }

  async getDailyPriceSheet(id: string): Promise<DailyPriceSheet | undefined> {
    const [sheet] = await db.select().from(dailyPriceSheets).where(eq(dailyPriceSheets.id, id));
    return sheet;
  }

  async getDailyPriceSheetByProductDate(productId: string, sheetDate: string): Promise<DailyPriceSheet | undefined> {
    const [sheet] = await db.select().from(dailyPriceSheets)
      .where(and(eq(dailyPriceSheets.productId, productId), eq(dailyPriceSheets.sheetDate, sheetDate)));
    return sheet;
  }

  async createDailyPriceSheet(data: Omit<DailyPriceSheet, "id" | "createdAt">): Promise<DailyPriceSheet> {
    const [sheet] = await db.insert(dailyPriceSheets).values(data as any).returning();
    return sheet;
  }

  async updateDailyPriceSheet(id: string, data: Partial<Omit<DailyPriceSheet, "id" | "createdAt">>): Promise<DailyPriceSheet | undefined> {
    const [sheet] = await db.update(dailyPriceSheets).set(data as any).where(eq(dailyPriceSheets.id, id)).returning();
    return sheet;
  }

  async getDailyPriceSheetLots(sheetId: string): Promise<DailyPriceSheetLot[]> {
    return db.select().from(dailyPriceSheetLots).where(eq(dailyPriceSheetLots.sheetId, sheetId));
  }

  async upsertDailyPriceSheetLots(sheetId: string, lots: Omit<DailyPriceSheetLot, "id">[]): Promise<DailyPriceSheetLot[]> {
    await db.delete(dailyPriceSheetLots).where(eq(dailyPriceSheetLots.sheetId, sheetId));
    if (lots.length === 0) return [];
    return db.insert(dailyPriceSheetLots).values(lots as any).returning();
  }

  async getEffectivePriceForProduct(productId: string, date: string): Promise<{ effectivePrice: string | null; sheetDate: string | null; noConfirmedPrice: boolean } | null> {
    const [prod] = await db.select().from(products).where(eq(products.id, productId));
    if (!prod) return null;
    const dateObj = new Date(date);
    for (let i = 0; i < 8; i++) {
      const d = new Date(dateObj);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().slice(0, 10);
      const [sheet] = await db.select().from(dailyPriceSheets)
        .where(and(
          eq(dailyPriceSheets.productId, productId),
          eq(dailyPriceSheets.sheetDate, dateStr),
          eq(dailyPriceSheets.status, "confirmed")
        ));
      if (sheet && sheet.proposedPrice) {
        return { effectivePrice: sheet.proposedPrice, sheetDate: dateStr, noConfirmedPrice: false };
      }
    }
    return { effectivePrice: null, sheetDate: null, noConfirmedPrice: true };
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
