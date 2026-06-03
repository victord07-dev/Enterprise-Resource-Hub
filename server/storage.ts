import { db } from "./db";
import { eq, desc, sql, and, or, gte, lte, lt, isNull } from "drizzle-orm";
import {
  users, customers, suppliers, products, brands, warehouses, inventoryStock,
  salesOrders, salesOrderItems, quotations, quotationItems, projects, purchaseOrders,
  invoices, payments, employees, employeeAdvances, employeeIncentives, attendanceRecords, fieldStaffActivities, payrollStatus, travelExpenses, trips, locationLogs, leads, leadActivities, leadFollowups, quotationActivities, quotationFollowups, supplierProducts, purchaseOrderItems, stockMovements, deliveryChallans, deliveryChallanItems, purchaseRequests, purchaseRequestItems, goodsReceiptNotes, goodsReceiptNoteItems, auditLogs, notifications, leaveRequests, lateArrivalRequests, supplierInvoices, supplierPayments, salesInvoices, salesInvoiceItems, customerPayments, attachments, salesReturns, salesReturnItems, creditNotes, dailyPriceSheets, dailyPriceSheetLots, productBundleItems, monthlyTargets,
  comboComponents, comboSerialRecords,
  vehicles, vehicleTrips, vehicleTripInvoices, vehicleFuelLogs, vehicleMaintenanceLogs,
  type Vehicle, type InsertVehicle, type VehicleTrip, type InsertVehicleTrip,
  type VehicleTripInvoice, type InsertVehicleTripInvoice,
  type VehicleFuelLog, type InsertVehicleFuelLog,
  type VehicleMaintenanceLog, type InsertVehicleMaintenanceLog,
  whatsappConversations, whatsappMessages, whatsappTemplates, whatsappTemplateStatusHistory, whatsappTemplateSyncLogs,
  whatsappWebhookJobs, whatsappWebhookJobsDeadLetter, whatsappWebhookRejectedPayloads,
  type WhatsappWebhookRejectedPayload,
  debugPayloadCaptures, type DebugPayloadCapture,
  reportGenerationLog, type ReportGenerationLog, type InsertReportGenerationLog,
  expenseCategories, expenses, type ExpenseCategory, type Expense, type InsertExpense, type InsertExpenseCategory,
  cashAccounts, accountTransfers, balanceAdjustments,
  type CashAccount, type AccountTransfer, type BalanceAdjustment,
  type InsertCashAccount, type InsertAccountTransfer, type InsertBalanceAdjustment,
  customFieldUsageStats, type CustomFieldUsageStat,
  type User, type InsertUser, type Customer, type Supplier, type Product, type Brand, type InsertBrand,
  type Warehouse, type InventoryStock, type SalesOrder, type SalesOrderItem,
  type Quotation, type QuotationItem, type Project, type PurchaseOrder, type Invoice, type Payment, type ProductBundleItem, type InsertProductBundleItem,
  type Employee, type EmployeeAdvance, type EmployeeIncentive, type AttendanceRecord, type FieldStaffActivity, type PayrollStatus, type TravelExpense, type Trip, type LocationLog, type Lead, type LeadActivity, type LeadFollowup, type QuotationActivity, type QuotationFollowup, type SupplierProduct, type PurchaseOrderItem, type StockMovement, type DeliveryChallan, type DeliveryChallanItem, type PurchaseRequest, type PurchaseRequestItem, type GoodsReceiptNote, type GoodsReceiptNoteItem, type AuditLog, type Notification, type LeaveRequest, type LateArrivalRequest, type SupplierInvoice, type SupplierPayment, type SalesInvoice, type SalesInvoiceItem, type CustomerPayment, type Attachment, type SalesReturn, type SalesReturnItem, type CreditNote, type DailyPriceSheet, type DailyPriceSheetLot,
  type WhatsappConversation, type WhatsappMessage, type WhatsappTemplate, type WhatsappTemplateStatusHistory, type InsertWhatsappConversation, type InsertWhatsappMessage, type InsertWhatsappTemplate, type InsertWhatsappTemplateStatusHistory,
  type WhatsappTemplateSyncLog, type InsertWhatsappTemplateSyncLog,
  type WhatsappWebhookJob, type WhatsappWebhookJobDeadLetter,
  type ComboComponent, type InsertComboComponent,
  type ComboSerialRecord, type InsertComboSerialRecord,
} from "@shared/schema";

export type ExpenseFilters = {
  from?: string;
  to?: string;
  categoryIds?: string[];
  paidByUserIds?: string[];
  paymentMethods?: string[];
  search?: string;
  linkedEntityType?: string;
  linkedEntityId?: string;
  scopeUserId?: string; // restrict to expenses where paidBy or createdBy matches
};

export type ExpenseSummaryCategory = {
  categoryId: string;
  categoryName: string;
  color: string;
  amount: number;
  count: number;
};

export type ExpenseSummary = {
  totalAmount: number;
  count: number;
  topCategory: ExpenseSummaryCategory | null;
  highestSingle: number;
  byCategory: ExpenseSummaryCategory[];
};

export type ExpenseAnalytics = {
  byCategory: Array<{ categoryId: string; categoryName: string; color: string; amount: number }>;
  byPerson: Array<{ userId: string; userName: string; amount: number }>;
  dailyTrend: Array<{ date: string; amount: number }>;
  categoryShare: Array<{ categoryId: string; categoryName: string; color: string; amount: number; pct: number }>;
};

// Phase 4B types
export type AccountTransactionRow = {
  id: string;
  transactionDate: string;
  type: "customer_payment" | "supplier_payment" | "expense" | "transfer_in" | "transfer_out" | "adjustment";
  amount: number; // positive = credit, negative = debit
  runningBalance: number;
  description: string;
  reference: string | null;
  counterpartyName: string | null;
  linkedEntityId: string | null;
  linkedEntityType: string | null;
  adjustedByName: string | null;
};

export type AccountStats = {
  totalIn: number;
  totalOut: number;
  netChange: number;
  openingBalance: number;
  closingBalance: number;
  transactionCount: number;
};

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

  // Phase 4 — custom spec field usage tracking
  getCustomFieldSuggestions(category: string, minCount?: number): Promise<string[]>;
  incrementCustomFieldUsage(category: string, fieldKeys: string[]): Promise<void>;

  // Brands
  getBrands(): Promise<Brand[]>;
  getBrand(id: string): Promise<Brand | undefined>;
  createBrand(data: InsertBrand): Promise<Brand>;
  updateBrand(id: string, data: Partial<InsertBrand>): Promise<Brand | undefined>;
  deleteBrand(id: string): Promise<boolean>;

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

  // Employee Advances
  listEmployeeAdvances(filters?: { employeeId?: string; isDeducted?: boolean }): Promise<EmployeeAdvance[]>;
  createEmployeeAdvance(data: Omit<EmployeeAdvance, "id">): Promise<EmployeeAdvance>;
  markAdvancesDeducted(advanceIds: string[], payrollId: string): Promise<void>;

  // Employee Incentives
  listEmployeeIncentives(filters?: { employeeId?: string; isApplied?: boolean }): Promise<EmployeeIncentive[]>;
  createEmployeeIncentive(data: Omit<EmployeeIncentive, "id">): Promise<EmployeeIncentive>;
  markIncentivesApplied(incentiveIds: string[], payrollId: string): Promise<void>;

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

  // Report Generation Log (Phase 4C)
  createReportGenerationLog(data: InsertReportGenerationLog): Promise<ReportGenerationLog>;
  listReportGenerationLogs(reportType?: string, limit?: number): Promise<ReportGenerationLog[]>;

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

  // Late Arrival Requests
  getLateArrivalRequests(): Promise<LateArrivalRequest[]>;
  getLateArrivalRequestsByEmployee(employeeId: string): Promise<LateArrivalRequest[]>;
  getLateArrivalRequest(id: string): Promise<LateArrivalRequest | undefined>;
  getApprovedLateArrivalForDate(employeeId: string, date: string): Promise<LateArrivalRequest | undefined>;
  createLateArrivalRequest(data: Omit<LateArrivalRequest, "id" | "createdAt">): Promise<LateArrivalRequest>;
  updateLateArrivalRequest(id: string, data: Partial<Omit<LateArrivalRequest, "id" | "createdAt">>): Promise<LateArrivalRequest | undefined>;
  deleteLateArrivalRequest(id: string): Promise<boolean>;

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
  getSalesOrderAdvancePayments(soId: string): Promise<CustomerPayment[]>;
  getAllCustomerPayments(): Promise<CustomerPayment[]>;
  createCustomerPayment(data: Omit<CustomerPayment, "id" | "createdAt">): Promise<CustomerPayment>;
  deleteCustomerPayment(id: string): Promise<boolean>;

  // Phase 4A — outstanding dues query (E1)
  getCustomerOutstanding(customerId: string): Promise<{ outstanding: number; total: number; collected: number; invoices: Array<{ id: string; invoiceNumber: string; invoiceDate: Date; grandTotal: number; balance: number }> }>;

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
  getEffectivePriceForProduct(productId: string, date: string): Promise<{ effectivePrice: string | null; sheetDate: string | null; noConfirmedPrice: boolean; source: "today" | "fallback" | "none" } | null>;

  // Phase 7 — Bundle / Kit Engine
  getHistoricalPriceForProduct(productId: string, date: string): Promise<{ price: string; source: "APPROVED_RATE" | "FLOOR_PRICE" | "COST_PRICE" | "UNIT_PRICE" } | null>;
  getBundleItems(bundleId: string): Promise<ProductBundleItem[]>;
  replaceBundleItems(bundleId: string, items: Omit<InsertProductBundleItem, "bundleProductId">[]): Promise<ProductBundleItem[]>;
  computeBundleAutoPrice(bundleId: string, date: string): Promise<{
    totalPrice: string;
    components: Array<{
      componentProductId: string;
      componentName: string;
      componentSku: string | null;
      lifecycleStatus: string;
      quantity: string;
      unit: string;
      effectivePrice: string | null;
      lineTotal: string;
      priceSource: "today" | "fallback" | "none";
    }>;
    hasNonActiveComponent: boolean;
    nonActiveComponentNames: string[];
  }>;

  // WhatsApp CRM
  getWhatsappConversations(): Promise<WhatsappConversation[]>;
  getWhatsappConversation(id: string): Promise<WhatsappConversation | undefined>;
  getWhatsappConversationByPhone(phone: string): Promise<WhatsappConversation | undefined>;
  getWhatsappConversationByPhoneOrCustomer(phone: string, customerId?: string | null): Promise<WhatsappConversation | undefined>;
  createWhatsappConversation(data: InsertWhatsappConversation): Promise<WhatsappConversation>;
  updateWhatsappConversation(id: string, data: Partial<Omit<WhatsappConversation, "id" | "createdAt">>): Promise<WhatsappConversation | undefined>;
  getWhatsappMessages(conversationId: string, opts?: { limit?: number; before?: string }): Promise<WhatsappMessage[]>;
  createWhatsappMessage(data: InsertWhatsappMessage): Promise<WhatsappMessage>;
  updateWhatsappMessageStatus(id: string, status: string): Promise<void>;
  updateWhatsappMessageStatusByInteraktId(interaktMessageId: string, status: string): Promise<{ id: string; conversationId: string } | null>;
  getWhatsappTemplates(): Promise<WhatsappTemplate[]>;
  getWhatsappTemplate(id: string): Promise<WhatsappTemplate | undefined>;
  getWhatsappTemplateByInteraktName(interaktTemplateName: string, languageCode: string): Promise<WhatsappTemplate | undefined>;
  createWhatsappTemplate(data: InsertWhatsappTemplate): Promise<WhatsappTemplate>;
  updateWhatsappTemplate(id: string, data: Partial<Omit<WhatsappTemplate, "id" | "createdAt">>): Promise<WhatsappTemplate | undefined>;
  deleteWhatsappTemplate(id: string): Promise<boolean>;
  getWhatsappTemplateStatusHistory(templateId: string): Promise<(WhatsappTemplateStatusHistory & { changedByName: string | null })[]>;
  createWhatsappTemplateStatusHistory(data: InsertWhatsappTemplateStatusHistory): Promise<WhatsappTemplateStatusHistory>;
  backfillWhatsappTemplateStatusHistory(): Promise<number>;
  createWhatsappTemplateSyncLog(data: InsertWhatsappTemplateSyncLog): Promise<WhatsappTemplateSyncLog>;
  getRecentWhatsappTemplateSyncLogs(limit: number): Promise<WhatsappTemplateSyncLog[]>;
  deleteWhatsappTemplateSyncLogsOlderThan(cutoff: Date): Promise<number>;

  // WhatsApp Webhook Job Queue (Task #67 Phase 1)
  enqueueWhatsappWebhookJob(jobType: string, payload: any, payloadHash: string | null, nextRunAt?: Date): Promise<WhatsappWebhookJob>;
  // Returns the id of an existing job with the given payload hash, or null if
  // none. Used by the webhook handler for idempotent dedup so the duplicate
  // ack can echo the original jobId back to the caller.
  getWhatsappWebhookJobIdByPayloadHash(payloadHash: string): Promise<string | null>;
  pickupWhatsappWebhookJob(stuckThresholdMs: number): Promise<WhatsappWebhookJob | null>;
  markWhatsappWebhookJobDone(id: string): Promise<void>;
  markWhatsappWebhookJobFailed(id: string, error: string, nextRunAt: Date | null, maxAttempts: number): Promise<{ deadLettered: boolean }>;
  getWhatsappWebhookJobsDeadLetter(): Promise<WhatsappWebhookJobDeadLetter[]>;
  retryWhatsappWebhookDeadLetterJob(id: string): Promise<WhatsappWebhookJob | null>;
  deleteWhatsappWebhookDeadLetterJob(id: string): Promise<boolean>;
  incrementWhatsappWebhookDeadLetterManualRetries(id: string): Promise<number>;
  getWhatsappWebhookJobStats(): Promise<{ pending: number; processing: number; failed: number; deadLetter: number; lastJobAt: string | null }>;

  // WhatsApp Webhook Rejected Payloads (Task #67 Phase 2 — rolling 20)
  recordWhatsappWebhookRejection(args: {
    reason: string;
    httpStatus: number;
    method: string;
    path: string;
    query: Record<string, any>;
    headers: Record<string, any>;
    rawBody: string | null;
  }): Promise<void>;
  getWhatsappWebhookRejectedPayloads(limit?: number): Promise<WhatsappWebhookRejectedPayload[]>;

  // WhatsApp Failed-Outbound Surface (Task #67 Phase 4)
  // Returns the most recent failed outbound messages within the lookback window
  // (default 24h). Joined with the conversation for phone + contact context.
  getRecentFailedOutboundMessages(args?: {
    lookbackHours?: number;
    limit?: number;
  }): Promise<Array<{
    id: string;
    conversationId: string;
    body: string | null;
    type: string;
    status: string | null;
    createdAt: string;
    phone: string;
    contactName: string | null;
  }>>;

  // Expenses (Task #69)
  getExpenseCategories(includeInactive?: boolean): Promise<ExpenseCategory[]>;
  getExpenseCategory(id: string): Promise<ExpenseCategory | undefined>;
  createExpenseCategory(data: InsertExpenseCategory): Promise<ExpenseCategory>;
  updateExpenseCategory(id: string, data: Partial<InsertExpenseCategory>): Promise<ExpenseCategory | undefined>;
  deactivateExpenseCategory(id: string): Promise<ExpenseCategory | undefined>;
  reorderExpenseCategories(orderedIds: string[]): Promise<void>;
  countExpensesByCategory(categoryId: string): Promise<number>;
  seedDefaultExpenseCategories(): Promise<number>;
  getExpenses(filters?: ExpenseFilters): Promise<Expense[]>;
  getExpense(id: string): Promise<Expense | undefined>;
  createExpense(data: InsertExpense & { createdByUserId: string; paidByUserId: string }): Promise<Expense>;
  updateExpense(id: string, data: Partial<InsertExpense>): Promise<Expense | undefined>;
  deleteExpense(id: string): Promise<boolean>;
  getExpensesSummary(filters?: ExpenseFilters): Promise<ExpenseSummary>;
  getExpensesAnalytics(filters?: ExpenseFilters): Promise<ExpenseAnalytics>;

  // Cash Accounts (Phase 4B)
  getCashAccounts(includeInactive?: boolean): Promise<CashAccount[]>;
  getCashAccount(id: string): Promise<CashAccount | undefined>;
  createCashAccount(data: InsertCashAccount): Promise<CashAccount>;
  updateCashAccount(id: string, data: Partial<InsertCashAccount>): Promise<CashAccount | undefined>;
  deactivateCashAccount(id: string): Promise<CashAccount | undefined>;
  reactivateCashAccount(id: string): Promise<CashAccount | undefined>;
  seedDefaultCashAccounts(): Promise<number>;
  // Account Transfers
  createAccountTransfer(data: InsertAccountTransfer): Promise<AccountTransfer>;
  getAccountTransfers(accountId?: string): Promise<AccountTransfer[]>;
  deleteAccountTransfer(id: string): Promise<boolean>;
  // Balance Adjustments
  createBalanceAdjustment(data: InsertBalanceAdjustment): Promise<BalanceAdjustment>;
  getBalanceAdjustments(accountId?: string): Promise<BalanceAdjustment[]>;
  // Balance computation and ledger
  computeAccountBalance(accountId: string, asOfDate?: string): Promise<number>;
  getAccountStats(accountId: string, fromDate: string, toDate: string): Promise<AccountStats>;
  getAccountTransactions(accountId: string, fromDate?: string, toDate?: string, limit?: number, offset?: number): Promise<{ rows: AccountTransactionRow[]; total: number }>;

  // ── Phase 4C — Canonical outstanding helpers (FIX 1) ─────────────────────
  // Single source of truth for "amount still owed" math, used by:
  //   • dashboard cards (set-based)        • AR/AP Aging detail rows (per-row)
  //   • all 11 reports that touch outstandings
  // Both per-row and set-based variants share the SAME formula via the SQL
  // fragment OUTSTANDING_SQL_* below. Routes/components MUST NOT inline this
  // math — it caused B1 (TS2339 paid_amount + Drizzle silently producing
  // grand_total - -credited ≈ gross+credit) and B2 (gross supplier overdue).
  //
  // Formula (operator decision 1):
  //   customer_outstanding = MAX(0, grand_total - SUM(customer_payments) - credited_amount)
  //   supplier_outstanding = MAX(0, total_amount - SUM(supplier_payments))
  // The legacy `payments` table is intentionally NOT joined: verification
  // showed 0 rows link to current invoices (orphaned post-Phase-4 deletes).
  // It still contributes to cash position via computeAccountBalance.
  //
  // CAVEAT: invoice.status field can drift from this math when records are
  // imported / status is set without going through recompute*. Helper is
  // authoritative; status is a stale cache. See breach log 2026-05-02.
  computeCustomerInvoiceOutstanding(invoiceId: string): Promise<number>;
  computeSupplierInvoiceOutstanding(invoiceId: string): Promise<number>;
  sumOpenCustomerOutstanding(opts?: { dueDateBefore?: Date }): Promise<{ count: number; amount: number }>;
  sumOpenSupplierOutstanding(opts?: { dueDateBefore?: Date }): Promise<{ count: number; amount: number }>;

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

  // ── Combo Components (Phase 1) ────────────────────────────────────────────
  getComboComponents(comboProductId: string): Promise<ComboComponent[]>;
  createComboComponent(data: InsertComboComponent): Promise<ComboComponent>;
  updateComboComponent(id: string, data: Partial<InsertComboComponent>): Promise<ComboComponent | undefined>;
  deleteComboComponent(id: string): Promise<boolean>;
  replaceComboComponents(comboProductId: string, items: Omit<InsertComboComponent, "comboProductId">[]): Promise<ComboComponent[]>;

  // ── Combo Serial Records (Phase 1) ───────────────────────────────────────
  getComboSerialRecords(opts: { grnId?: string; grnItemId?: string; comboProductId?: string; allocatedChallanId?: string; available?: boolean }): Promise<ComboSerialRecord[]>;
  createComboSerialRecord(data: InsertComboSerialRecord): Promise<ComboSerialRecord>;
  allocateComboSerials(serialIds: string[], challanId: string, customerId: string, allocatedByUserId: string): Promise<void>;
  deallocateComboSerials(challanId: string): Promise<void>;
  listComboSerials(): Promise<Array<ComboSerialRecord & { comboProductName: string; grnNumber: string; challanNumber: string | null; customerName: string | null }>>;
  searchComboSerialByNumber(serialNumber: string): Promise<(ComboSerialRecord & { comboProductName: string; grnNumber: string; challanNumber: string | null; customerName: string | null }) | null>;

  // ── Vehicle Trips Module ──────────────────────────────────────────────────
  // Vehicles
  getVehicles(includeInactive?: boolean): Promise<Vehicle[]>;
  getVehicle(id: string): Promise<Vehicle | undefined>;
  createVehicle(data: Omit<Vehicle, "id" | "createdAt" | "updatedAt">): Promise<Vehicle>;
  updateVehicle(id: string, data: Partial<Omit<Vehicle, "id" | "createdAt" | "updatedAt">>): Promise<Vehicle | undefined>;
  // Vehicle Trips
  getVehicleTrips(filters?: { customerId?: string; vehicleId?: string; driverId?: string; status?: string; from?: string; to?: string }): Promise<VehicleTrip[]>;
  getVehicleTrip(id: string): Promise<VehicleTrip | undefined>;
  createVehicleTrip(data: Omit<VehicleTrip, "id" | "tripNumber" | "createdAt" | "updatedAt">): Promise<VehicleTrip>;
  updateVehicleTrip(id: string, data: Partial<Omit<VehicleTrip, "id" | "createdAt" | "updatedAt">>): Promise<VehicleTrip | undefined>;
  generateTripNumber(): Promise<string>;
  // Vehicle Trip Invoices
  getVehicleTripInvoices(filters?: { customerId?: string; tripId?: string; status?: string; from?: string; to?: string }): Promise<VehicleTripInvoice[]>;
  getVehicleTripInvoice(id: string): Promise<VehicleTripInvoice | undefined>;
  createVehicleTripInvoice(data: Omit<VehicleTripInvoice, "id" | "invoiceNumber" | "createdAt" | "updatedAt">): Promise<VehicleTripInvoice>;
  updateVehicleTripInvoice(id: string, data: Partial<Omit<VehicleTripInvoice, "id" | "createdAt" | "updatedAt">>): Promise<VehicleTripInvoice | undefined>;
  generateTripInvoiceNumber(): Promise<string>;
  computeTripInvoiceOutstanding(invoiceId: string): Promise<number>;
  // Vehicle Fuel Logs
  getVehicleFuelLogs(vehicleId?: string, tripId?: string): Promise<VehicleFuelLog[]>;
  createVehicleFuelLog(data: Omit<VehicleFuelLog, "id" | "createdAt">): Promise<VehicleFuelLog>;
  updateVehicleFuelLog(id: string, data: Partial<Omit<VehicleFuelLog, "id" | "createdAt">>): Promise<VehicleFuelLog | undefined>;
  deleteVehicleFuelLog(id: string): Promise<boolean>;
  // Vehicle Maintenance Logs
  getVehicleMaintenanceLogs(vehicleId?: string): Promise<VehicleMaintenanceLog[]>;
  createVehicleMaintenanceLog(data: Omit<VehicleMaintenanceLog, "id" | "createdAt" | "updatedAt">): Promise<VehicleMaintenanceLog>;
  updateVehicleMaintenanceLog(id: string, data: Partial<Omit<VehicleMaintenanceLog, "id" | "createdAt" | "updatedAt">>): Promise<VehicleMaintenanceLog | undefined>;
  deleteVehicleMaintenanceLog(id: string): Promise<boolean>;
  // Vehicle expense category seeding
  seedVehicleExpenseCategories(): Promise<number>;
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

  // Phase 4 — custom spec field usage tracking
  async getCustomFieldSuggestions(category: string, minCount = 3): Promise<string[]> {
    const rows = await db
      .select({ fieldKey: customFieldUsageStats.fieldKey, count: customFieldUsageStats.count })
      .from(customFieldUsageStats)
      .where(and(eq(customFieldUsageStats.category, category), gte(customFieldUsageStats.count, minCount)))
      .orderBy(desc(customFieldUsageStats.count));
    return rows.map((r) => r.fieldKey);
  }

  async incrementCustomFieldUsage(category: string, fieldKeys: string[]): Promise<void> {
    if (!category || fieldKeys.length === 0) return;
    // Upsert each (category, fieldKey) and increment count by 1.
    for (const fieldKey of fieldKeys) {
      const trimmed = String(fieldKey).trim();
      if (!trimmed) continue;
      await db
        .insert(customFieldUsageStats)
        .values({ category, fieldKey: trimmed, count: 1 })
        .onConflictDoUpdate({
          target: [customFieldUsageStats.category, customFieldUsageStats.fieldKey],
          set: { count: sql`${customFieldUsageStats.count} + 1` },
        });
    }
  }

  // Brands
  async getBrands(): Promise<Brand[]> {
    return db.select().from(brands).orderBy(brands.name);
  }
  async getBrand(id: string): Promise<Brand | undefined> {
    const [b] = await db.select().from(brands).where(eq(brands.id, id));
    return b;
  }
  async createBrand(data: InsertBrand): Promise<Brand> {
    const [created] = await db.insert(brands).values(data).returning();
    return created;
  }
  async updateBrand(id: string, data: Partial<InsertBrand>): Promise<Brand | undefined> {
    const [updated] = await db.update(brands).set(data).where(eq(brands.id, id)).returning();
    return updated;
  }
  async deleteBrand(id: string): Promise<boolean> {
    await db.delete(brands).where(eq(brands.id, id));
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
    return db.select().from(purchaseOrders).orderBy(desc(purchaseOrders.poNumber));
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

  // Employee Advances
  async listEmployeeAdvances(filters?: { employeeId?: string; isDeducted?: boolean }): Promise<EmployeeAdvance[]> {
    const conditions = [];
    if (filters?.employeeId) conditions.push(eq(employeeAdvances.employeeId, filters.employeeId));
    if (filters?.isDeducted !== undefined) conditions.push(eq(employeeAdvances.isDeducted, filters.isDeducted));
    const q = conditions.length > 0
      ? db.select().from(employeeAdvances).where(and(...conditions))
      : db.select().from(employeeAdvances);
    return (await q).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  async createEmployeeAdvance(data: Omit<EmployeeAdvance, "id">): Promise<EmployeeAdvance> {
    const [created] = await db.insert(employeeAdvances).values(data).returning();
    return created;
  }

  async markAdvancesDeducted(advanceIds: string[], payrollId: string): Promise<void> {
    if (advanceIds.length === 0) return;
    for (const id of advanceIds) {
      await db.update(employeeAdvances)
        .set({ isDeducted: true, deductedInPayrollId: payrollId })
        .where(eq(employeeAdvances.id, id));
    }
  }

  // Employee Incentives
  async listEmployeeIncentives(filters?: { employeeId?: string; isApplied?: boolean }): Promise<EmployeeIncentive[]> {
    const conditions = [];
    if (filters?.employeeId) conditions.push(eq(employeeIncentives.employeeId, filters.employeeId));
    if (filters?.isApplied !== undefined) conditions.push(eq(employeeIncentives.isApplied, filters.isApplied));
    const q = conditions.length > 0
      ? db.select().from(employeeIncentives).where(and(...conditions))
      : db.select().from(employeeIncentives);
    return (await q).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  async createEmployeeIncentive(data: Omit<EmployeeIncentive, "id">): Promise<EmployeeIncentive> {
    const [created] = await db.insert(employeeIncentives).values(data).returning();
    return created;
  }

  async markIncentivesApplied(incentiveIds: string[], payrollId: string): Promise<void> {
    if (incentiveIds.length === 0) return;
    for (const id of incentiveIds) {
      await db.update(employeeIncentives)
        .set({ isApplied: true, appliedInPayrollId: payrollId })
        .where(eq(employeeIncentives.id, id));
    }
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

  // Report Generation Log (Phase 4C)
  async createReportGenerationLog(data: InsertReportGenerationLog): Promise<ReportGenerationLog> {
    const [created] = await db.insert(reportGenerationLog).values(data).returning();
    return created;
  }

  async listReportGenerationLogs(reportType?: string, limit = 100): Promise<ReportGenerationLog[]> {
    const q = db.select().from(reportGenerationLog);
    if (reportType) {
      return q.where(eq(reportGenerationLog.reportType, reportType))
        .orderBy(desc(reportGenerationLog.generatedAt)).limit(limit);
    }
    return q.orderBy(desc(reportGenerationLog.generatedAt)).limit(limit);
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

  // Late Arrival Requests
  async getLateArrivalRequests(): Promise<LateArrivalRequest[]> {
    return await db.select().from(lateArrivalRequests).orderBy(desc(lateArrivalRequests.createdAt));
  }

  async getLateArrivalRequestsByEmployee(employeeId: string): Promise<LateArrivalRequest[]> {
    return await db.select().from(lateArrivalRequests)
      .where(eq(lateArrivalRequests.employeeId, employeeId))
      .orderBy(desc(lateArrivalRequests.createdAt));
  }

  async getLateArrivalRequest(id: string): Promise<LateArrivalRequest | undefined> {
    const [r] = await db.select().from(lateArrivalRequests).where(eq(lateArrivalRequests.id, id));
    return r;
  }

  async getApprovedLateArrivalForDate(employeeId: string, date: string): Promise<LateArrivalRequest | undefined> {
    const [r] = await db.select().from(lateArrivalRequests).where(
      and(
        eq(lateArrivalRequests.employeeId, employeeId),
        eq(lateArrivalRequests.date, date),
        eq(lateArrivalRequests.status, "approved")
      )
    );
    return r;
  }

  async createLateArrivalRequest(data: Omit<LateArrivalRequest, "id" | "createdAt">): Promise<LateArrivalRequest> {
    const [created] = await db.insert(lateArrivalRequests).values(data).returning();
    return created;
  }

  async updateLateArrivalRequest(id: string, data: Partial<Omit<LateArrivalRequest, "id" | "createdAt">>): Promise<LateArrivalRequest | undefined> {
    const [updated] = await db.update(lateArrivalRequests).set(data).where(eq(lateArrivalRequests.id, id)).returning();
    return updated;
  }

  async deleteLateArrivalRequest(id: string): Promise<boolean> {
    await db.delete(lateArrivalRequests).where(eq(lateArrivalRequests.id, id));
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

  async getSalesOrderAdvancePayments(soId: string): Promise<CustomerPayment[]> {
    return db.select().from(customerPayments)
      .where(and(eq(customerPayments.salesOrderId, soId), isNull(customerPayments.invoiceId)))
      .orderBy(desc(customerPayments.createdAt));
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

  async getCustomerOutstanding(customerId: string): Promise<{ outstanding: number; total: number; collected: number; invoices: Array<{ id: string; invoiceNumber: string; invoiceDate: Date; grandTotal: number; balance: number }> }> {
    const invRows = await db.execute(sql`
      SELECT id, invoice_number, invoice_date, grand_total
      FROM sales_invoices
      WHERE customer_id = ${customerId}
        AND status NOT IN ('cancelled')
        AND upload_status NOT IN ('cancelled')
      ORDER BY invoice_date ASC
    `);
    const totalPaidRow = await db.execute(sql`
      SELECT COALESCE(SUM(amount), 0) as total_paid
      FROM customer_payments
      WHERE customer_id = ${customerId}
    `);
    const totalInvoiced = (invRows.rows as any[]).reduce((s: number, r: any) => s + Number(r.grand_total ?? 0), 0);
    const totalPaid = Number((totalPaidRow.rows[0] as any)?.total_paid ?? 0);
    const outstanding = Math.max(0, totalInvoiced - totalPaid);
    const invoices = (invRows.rows as any[]).map((r: any) => ({
      id: r.id,
      invoiceNumber: r.invoice_number,
      invoiceDate: r.invoice_date,
      grandTotal: Number(r.grand_total ?? 0),
      balance: Number(r.grand_total ?? 0),
    }));
    return { outstanding, total: totalInvoiced, collected: totalPaid, invoices };
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
    const creditNotesTotal = cns.reduce((sum, cn) => sum + Number(cn.grandTotal), 0);
    // Preserve a higher existing credited_amount — Fix B/A may have stored an advance
    // payment stand-in there when no cashAccountId was traceable. Never lower it below
    // the credit-notes total; only raise it if credit notes exceed the stand-in.
    const existingCredited = Number(inv.creditedAmount ?? 0);
    const totalCredited = Math.max(creditNotesTotal, existingCredited);
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
    const conditions: any[] = [];
    if (filters?.productId) conditions.push(eq(dailyPriceSheets.productId, filters.productId));
    if (filters?.sheetDate) conditions.push(eq(dailyPriceSheets.sheetDate, filters.sheetDate));
    if (filters?.status) conditions.push(eq(dailyPriceSheets.status, filters.status));
    return db.select().from(dailyPriceSheets)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(dailyPriceSheets.createdAt));
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

  async getEffectivePriceForProduct(productId: string, date: string): Promise<{ effectivePrice: string | null; sheetDate: string | null; noConfirmedPrice: boolean; source: "today" | "fallback" | "none" } | null> {
    const [prod] = await db.select().from(products).where(eq(products.id, productId));
    if (!prod) return null;
    const dateObj = new Date(date);
    for (let i = 0; i < 7; i++) {
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
        return {
          effectivePrice: sheet.proposedPrice,
          sheetDate: dateStr,
          noConfirmedPrice: false,
          source: i === 0 ? "today" : "fallback",
        };
      }
    }
    return {
      effectivePrice: prod.unitPrice,
      sheetDate: null,
      noConfirmedPrice: true,
      source: "none",
    };
  }

  // ─── Phase 7 — Bundle / Kit Engine ────────────────────────────────────
  async getBundleItems(bundleId: string): Promise<ProductBundleItem[]> {
    return db.select().from(productBundleItems).where(eq(productBundleItems.bundleProductId, bundleId));
  }

  async replaceBundleItems(bundleId: string, items: Omit<InsertProductBundleItem, "bundleProductId">[]): Promise<ProductBundleItem[]> {
    return await db.transaction(async (tx) => {
      await tx.delete(productBundleItems).where(eq(productBundleItems.bundleProductId, bundleId));
      if (items.length === 0) return [];
      const rows = items.map(it => ({ ...it, bundleProductId: bundleId }));
      return tx.insert(productBundleItems).values(rows as any).returning();
    });
  }

  // ─── Set Analysis Report: historical price lookup (no date cap) ──────────────
  // Fallback order: APPROVED_RATE → FLOOR_PRICE → COST_PRICE → UNIT_PRICE
  // Only uses confirmed daily price sheets dated on or before the requested date.
  async getHistoricalPriceForProduct(productId: string, date: string): Promise<{
    price: string;
    source: "APPROVED_RATE" | "FLOOR_PRICE" | "COST_PRICE" | "UNIT_PRICE";
  } | null> {
    const [sheet] = await db
      .select()
      .from(dailyPriceSheets)
      .where(
        and(
          eq(dailyPriceSheets.productId, productId),
          eq(dailyPriceSheets.status, "confirmed"),
          sql`${dailyPriceSheets.sheetDate} <= ${date}`
        )
      )
      .orderBy(desc(dailyPriceSheets.sheetDate))
      .limit(1);

    if (sheet) {
      if (sheet.proposedPrice && Number(sheet.proposedPrice) > 0) {
        return { price: sheet.proposedPrice, source: "APPROVED_RATE" };
      }
      if (sheet.globalFloorPrice && Number(sheet.globalFloorPrice) > 0) {
        return { price: sheet.globalFloorPrice, source: "FLOOR_PRICE" };
      }
    }

    const [prod] = await db.select().from(products).where(eq(products.id, productId));
    if (!prod) return null;
    if (prod.costPrice && Number(prod.costPrice) > 0) {
      return { price: prod.costPrice, source: "COST_PRICE" };
    }
    if (prod.unitPrice && Number(prod.unitPrice) > 0) {
      return { price: prod.unitPrice, source: "UNIT_PRICE" };
    }
    return null;
  }

  async computeBundleAutoPrice(bundleId: string, date: string) {
    const items = await this.getBundleItems(bundleId);
    const components: Array<any> = [];
    let total = 0;
    const nonActiveNames: string[] = [];

    for (const item of items) {
      const [comp] = await db.select().from(products).where(eq(products.id, item.componentProductId));
      if (!comp) continue;
      const effInfo = await this.getEffectivePriceForProduct(item.componentProductId, date);
      const effPrice = effInfo?.effectivePrice ?? null;
      const qtyNum = Number(item.quantity);
      const lineTotal = effPrice != null ? Number(effPrice) * qtyNum : 0;
      total += lineTotal;
      if (comp.lifecycleStatus !== "active") nonActiveNames.push(comp.name);
      components.push({
        componentProductId: item.componentProductId,
        componentName: comp.name,
        componentSku: comp.sku,
        lifecycleStatus: comp.lifecycleStatus,
        quantity: item.quantity,
        unit: item.unit,
        effectivePrice: effPrice,
        lineTotal: lineTotal.toFixed(2),
        priceSource: effInfo?.source ?? "none",
      });
    }

    return {
      totalPrice: total.toFixed(2),
      components,
      hasNonActiveComponent: nonActiveNames.length > 0,
      nonActiveComponentNames: nonActiveNames,
    };
  }

  // WhatsApp CRM
  async getWhatsappConversations(): Promise<WhatsappConversation[]> {
    return db.select().from(whatsappConversations).orderBy(desc(whatsappConversations.lastMessageAt));
  }
  async getWhatsappConversation(id: string): Promise<WhatsappConversation | undefined> {
    const [c] = await db.select().from(whatsappConversations).where(eq(whatsappConversations.id, id));
    return c;
  }
  async getWhatsappConversationByPhone(phone: string): Promise<WhatsappConversation | undefined> {
    // Return the most recent OPEN conversation for this phone, if any
    const [c] = await db.select().from(whatsappConversations)
      .where(and(eq(whatsappConversations.phoneNumber, phone), eq(whatsappConversations.status, "open")))
      .orderBy(desc(whatsappConversations.lastMessageAt))
      .limit(1);
    return c;
  }
  async getWhatsappConversationByPhoneOrCustomer(phone: string, customerId?: string | null): Promise<WhatsappConversation | undefined> {
    // Match open conversation by (phone OR customerId) — prevents duplicates for same customer
    const phoneMatch = and(eq(whatsappConversations.phoneNumber, phone), eq(whatsappConversations.status, "open"))!;
    const whereClause = customerId
      ? and(
          or(eq(whatsappConversations.phoneNumber, phone), eq(whatsappConversations.customerId, customerId))!,
          eq(whatsappConversations.status, "open")
        )!
      : phoneMatch;
    const [c] = await db.select().from(whatsappConversations)
      .where(whereClause)
      .orderBy(desc(whatsappConversations.lastMessageAt))
      .limit(1);
    return c;
  }
  async createWhatsappConversation(data: InsertWhatsappConversation): Promise<WhatsappConversation> {
    const [c] = await db.insert(whatsappConversations).values(data).returning();
    return c;
  }
  async updateWhatsappConversation(id: string, data: Partial<Omit<WhatsappConversation, "id" | "createdAt">>): Promise<WhatsappConversation | undefined> {
    const [c] = await db.update(whatsappConversations).set(data).where(eq(whatsappConversations.id, id)).returning();
    return c;
  }
  async getWhatsappMessages(conversationId: string, opts?: { limit?: number; before?: string }): Promise<WhatsappMessage[]> {
    const limit = opts?.limit || 50;
    // Build the WHERE clause correctly to avoid double-wrapping
    const whereClause = opts?.before
      ? and(eq(whatsappMessages.conversationId, conversationId), sql`${whatsappMessages.createdAt} < ${new Date(opts.before)}`)!
      : eq(whatsappMessages.conversationId, conversationId);
    return db.select().from(whatsappMessages)
      .where(whereClause)
      .orderBy(whatsappMessages.createdAt)
      .limit(limit);
  }
  async createWhatsappMessage(data: InsertWhatsappMessage): Promise<WhatsappMessage> {
    const [m] = await db.insert(whatsappMessages).values(data).returning();
    return m;
  }
  async updateWhatsappMessageStatus(id: string, status: string): Promise<void> {
    await db.update(whatsappMessages).set({ status }).where(eq(whatsappMessages.id, id));
  }
  async updateWhatsappMessageStatusByInteraktId(interaktMessageId: string, status: string): Promise<{ id: string; conversationId: string } | null> {
    // Enforce status hierarchy so out-of-order webhook events don't downgrade ticks
    // (sent → delivered → read; failed is terminal)
    const rank: Record<string, number> = { sent: 1, delivered: 2, read: 3, failed: 4 };
    const incomingRank = rank[status] ?? 0;
    if (!incomingRank) return null;
    const [existing] = await db
      .select({ id: whatsappMessages.id, status: whatsappMessages.status, conversationId: whatsappMessages.conversationId })
      .from(whatsappMessages)
      .where(eq(whatsappMessages.interaktMessageId, interaktMessageId));
    if (!existing) return null;
    const currentRank = rank[existing.status || ""] ?? 0;
    if (incomingRank <= currentRank) return null;
    await db.update(whatsappMessages).set({ status }).where(eq(whatsappMessages.id, existing.id));
    return { id: existing.id, conversationId: existing.conversationId };
  }
  async getWhatsappTemplates(): Promise<WhatsappTemplate[]> {
    return db.select().from(whatsappTemplates).orderBy(whatsappTemplates.name);
  }
  async getWhatsappTemplate(id: string): Promise<WhatsappTemplate | undefined> {
    const [t] = await db.select().from(whatsappTemplates).where(eq(whatsappTemplates.id, id));
    return t;
  }
  async getWhatsappTemplateByInteraktName(interaktTemplateName: string, languageCode: string): Promise<WhatsappTemplate | undefined> {
    const [t] = await db.select().from(whatsappTemplates).where(
      and(eq(whatsappTemplates.interaktTemplateName, interaktTemplateName), eq(whatsappTemplates.languageCode, languageCode))
    );
    return t;
  }
  async createWhatsappTemplate(data: InsertWhatsappTemplate): Promise<WhatsappTemplate> {
    const [t] = await db.insert(whatsappTemplates).values(data).returning();
    return t;
  }
  async updateWhatsappTemplate(id: string, data: Partial<Omit<WhatsappTemplate, "id" | "createdAt">>): Promise<WhatsappTemplate | undefined> {
    const [t] = await db.update(whatsappTemplates).set(data).where(eq(whatsappTemplates.id, id)).returning();
    return t;
  }
  async deleteWhatsappTemplate(id: string): Promise<boolean> {
    await db.delete(whatsappTemplateStatusHistory).where(eq(whatsappTemplateStatusHistory.templateId, id));
    const result = await db.delete(whatsappTemplates).where(eq(whatsappTemplates.id, id));
    return (result.rowCount ?? 0) > 0;
  }
  async getWhatsappTemplateStatusHistory(templateId: string): Promise<(WhatsappTemplateStatusHistory & { changedByName: string | null })[]> {
    const rows = await db
      .select({
        id: whatsappTemplateStatusHistory.id,
        templateId: whatsappTemplateStatusHistory.templateId,
        previousStatus: whatsappTemplateStatusHistory.previousStatus,
        newStatus: whatsappTemplateStatusHistory.newStatus,
        source: whatsappTemplateStatusHistory.source,
        changedBy: whatsappTemplateStatusHistory.changedBy,
        createdAt: whatsappTemplateStatusHistory.createdAt,
        changedByName: users.fullName,
      })
      .from(whatsappTemplateStatusHistory)
      .leftJoin(users, eq(users.id, whatsappTemplateStatusHistory.changedBy))
      .where(eq(whatsappTemplateStatusHistory.templateId, templateId))
      .orderBy(desc(whatsappTemplateStatusHistory.createdAt));
    return rows;
  }
  async createWhatsappTemplateStatusHistory(data: InsertWhatsappTemplateStatusHistory): Promise<WhatsappTemplateStatusHistory> {
    const [h] = await db.insert(whatsappTemplateStatusHistory).values(data).returning();
    return h;
  }
  async backfillWhatsappTemplateStatusHistory(): Promise<number> {
    const inserted = await db.execute<{ id: string }>(sql`
      INSERT INTO whatsapp_template_status_history (template_id, previous_status, new_status, source, created_at)
      SELECT t.id, NULL, t.status, 'backfill', t.created_at
      FROM whatsapp_templates t
      WHERE NOT EXISTS (
        SELECT 1 FROM whatsapp_template_status_history h WHERE h.template_id = t.id
      )
      RETURNING id
    `);
    return inserted.rows.length;
  }

  async createWhatsappTemplateSyncLog(data: InsertWhatsappTemplateSyncLog): Promise<WhatsappTemplateSyncLog> {
    const [log] = await db.insert(whatsappTemplateSyncLogs).values(data).returning();
    return log;
  }
  async getRecentWhatsappTemplateSyncLogs(limit: number): Promise<WhatsappTemplateSyncLog[]> {
    return db
      .select()
      .from(whatsappTemplateSyncLogs)
      .orderBy(desc(whatsappTemplateSyncLogs.attemptAt))
      .limit(limit);
  }
  async deleteWhatsappTemplateSyncLogsOlderThan(cutoff: Date): Promise<number> {
    const deleted = await db
      .delete(whatsappTemplateSyncLogs)
      .where(lt(whatsappTemplateSyncLogs.attemptAt, cutoff))
      .returning({ id: whatsappTemplateSyncLogs.id });
    return deleted.length;
  }

  // ── WhatsApp Webhook Job Queue (Task #67 Phase 1) ────────────────────────
  async enqueueWhatsappWebhookJob(jobType: string, payload: any, payloadHash: string | null, nextRunAt?: Date): Promise<WhatsappWebhookJob> {
    const [job] = await db.insert(whatsappWebhookJobs).values({
      jobType,
      payload,
      payloadHash,
      status: "pending",
      attempts: 0,
      nextRunAt: nextRunAt || new Date(),
    }).returning();
    return job;
  }

  async getWhatsappWebhookJobIdByPayloadHash(payloadHash: string): Promise<string | null> {
    const [row] = await db.select({ id: whatsappWebhookJobs.id })
      .from(whatsappWebhookJobs)
      .where(eq(whatsappWebhookJobs.payloadHash, payloadHash))
      .limit(1);
    return row?.id ?? null;
  }

  async pickupWhatsappWebhookJob(stuckThresholdMs: number): Promise<WhatsappWebhookJob | null> {
    // Atomic pickup: SELECT ... FOR UPDATE SKIP LOCKED + UPDATE in one CTE.
    // Picks up either a pending job whose nextRunAt is due, or a stuck job
    // whose locked_at is older than the stuck threshold (worker likely died).
    const stuckMs = Math.max(stuckThresholdMs, 30_000);
    const result = await db.execute(sql`
      WITH next_job AS (
        SELECT id FROM whatsapp_webhook_jobs
        WHERE (status = 'pending' AND next_run_at <= NOW())
           OR (status = 'processing' AND locked_at < NOW() - (${sql.raw(String(stuckMs))}::bigint || ' milliseconds')::interval)
        ORDER BY next_run_at
        LIMIT 1
        FOR UPDATE SKIP LOCKED
      )
      UPDATE whatsapp_webhook_jobs SET
        status = 'processing',
        locked_at = NOW(),
        updated_at = NOW()
      WHERE id = (SELECT id FROM next_job)
      RETURNING *
    `);
    const rows = (result as any).rows as any[];
    if (!rows || rows.length === 0) return null;
    const r = rows[0];
    return {
      id: r.id,
      jobType: r.job_type,
      payload: r.payload,
      payloadHash: r.payload_hash,
      status: r.status,
      attempts: r.attempts,
      nextRunAt: r.next_run_at,
      lockedAt: r.locked_at,
      lastError: r.last_error,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    } as WhatsappWebhookJob;
  }

  async markWhatsappWebhookJobDone(id: string): Promise<void> {
    await db.update(whatsappWebhookJobs)
      .set({ status: "done", updatedAt: new Date(), lockedAt: null, lastError: null })
      .where(eq(whatsappWebhookJobs.id, id));
  }

  async markWhatsappWebhookJobFailed(id: string, error: string, nextRunAt: Date | null, maxAttempts: number): Promise<{ deadLettered: boolean }> {
    // Increment attempts and decide whether to retry or dead-letter.
    const [current] = await db.select().from(whatsappWebhookJobs).where(eq(whatsappWebhookJobs.id, id));
    if (!current) return { deadLettered: false };
    const newAttempts = (current.attempts || 0) + 1;
    if (newAttempts >= maxAttempts || nextRunAt === null) {
      // Move to dead letter
      await db.insert(whatsappWebhookJobsDeadLetter).values({
        originalJobId: current.id,
        jobType: current.jobType,
        payload: current.payload,
        lastError: error.slice(0, 4000),
        attempts: newAttempts,
      });
      await db.delete(whatsappWebhookJobs).where(eq(whatsappWebhookJobs.id, id));
      return { deadLettered: true };
    }
    await db.update(whatsappWebhookJobs).set({
      status: "pending",
      attempts: newAttempts,
      nextRunAt,
      lockedAt: null,
      lastError: error.slice(0, 4000),
      updatedAt: new Date(),
    }).where(eq(whatsappWebhookJobs.id, id));
    return { deadLettered: false };
  }

  async getWhatsappWebhookJobsDeadLetter(): Promise<WhatsappWebhookJobDeadLetter[]> {
    return db.select().from(whatsappWebhookJobsDeadLetter).orderBy(desc(whatsappWebhookJobsDeadLetter.deadLetteredAt));
  }

  async retryWhatsappWebhookDeadLetterJob(id: string): Promise<WhatsappWebhookJob | null> {
    const [dl] = await db.select().from(whatsappWebhookJobsDeadLetter).where(eq(whatsappWebhookJobsDeadLetter.id, id));
    if (!dl) return null;
    const [job] = await db.insert(whatsappWebhookJobs).values({
      jobType: dl.jobType,
      payload: dl.payload,
      payloadHash: null, // skip idempotency on manual retry
      status: "pending",
      attempts: 0,
      nextRunAt: new Date(),
    }).returning();
    await db.delete(whatsappWebhookJobsDeadLetter).where(eq(whatsappWebhookJobsDeadLetter.id, id));
    return job;
  }

  async deleteWhatsappWebhookDeadLetterJob(id: string): Promise<boolean> {
    const deleted = await db.delete(whatsappWebhookJobsDeadLetter)
      .where(eq(whatsappWebhookJobsDeadLetter.id, id))
      .returning({ id: whatsappWebhookJobsDeadLetter.id });
    return deleted.length > 0;
  }

  async incrementWhatsappWebhookDeadLetterManualRetries(id: string): Promise<number> {
    const result = await db.execute(sql`
      UPDATE whatsapp_webhook_jobs_dead_letter
      SET manual_retry_attempts = manual_retry_attempts + 1
      WHERE id = ${id}
      RETURNING manual_retry_attempts
    `);
    const rows = (result as any).rows as any[];
    return rows?.[0]?.manual_retry_attempts ?? 0;
  }

  async getWhatsappWebhookJobStats(): Promise<{ pending: number; processing: number; failed: number; deadLetter: number; lastJobAt: string | null }> {
    const [agg] = await db.execute(sql`
      SELECT
        COUNT(*) FILTER (WHERE status = 'pending') AS pending,
        COUNT(*) FILTER (WHERE status = 'processing') AS processing,
        COUNT(*) FILTER (WHERE status = 'failed') AS failed,
        MAX(updated_at) AS last_job_at
      FROM whatsapp_webhook_jobs
    `).then((r: any) => r.rows);
    const [dl] = await db.execute(sql`SELECT COUNT(*) AS c FROM whatsapp_webhook_jobs_dead_letter`).then((r: any) => r.rows);
    return {
      pending: Number(agg?.pending || 0),
      processing: Number(agg?.processing || 0),
      failed: Number(agg?.failed || 0),
      deadLetter: Number(dl?.c || 0),
      lastJobAt: agg?.last_job_at ? new Date(agg.last_job_at).toISOString() : null,
    };
  }

  // ── WhatsApp Webhook Rejected Payloads (Task #67 Phase 2) ──────────────────
  // Insert + trim to 20 rows. Headers/query are already redacted by caller.
  async recordWhatsappWebhookRejection(args: {
    reason: string;
    httpStatus: number;
    method: string;
    path: string;
    query: Record<string, any>;
    headers: Record<string, any>;
    rawBody: string | null;
  }): Promise<void> {
    const MAX_BODY = 16 * 1024;
    const bodyStr = args.rawBody || "";
    const truncated = bodyStr.length > MAX_BODY;
    const body = truncated ? bodyStr.slice(0, MAX_BODY) : bodyStr;
    await db.insert(whatsappWebhookRejectedPayloads).values({
      reason: args.reason,
      httpStatus: args.httpStatus,
      method: args.method,
      path: args.path,
      query: args.query,
      headers: args.headers,
      rawBody: body,
      rawBodyTruncated: truncated,
    });
    // Trim to 20 most recent.
    await db.execute(sql`
      DELETE FROM whatsapp_webhook_rejected_payloads
      WHERE id NOT IN (
        SELECT id FROM whatsapp_webhook_rejected_payloads
        ORDER BY created_at DESC
        LIMIT 20
      )
    `);
  }

  async getWhatsappWebhookRejectedPayloads(limit = 20): Promise<WhatsappWebhookRejectedPayload[]> {
    return db
      .select()
      .from(whatsappWebhookRejectedPayloads)
      .orderBy(desc(whatsappWebhookRejectedPayloads.createdAt))
      .limit(limit);
  }

  // ── Recent Failed Outbound (Task #67 Phase 4) ──────────────────────────────
  // SELECT … FROM whatsapp_messages JOIN conversations. Restricted to outbound
  // direction with status='failed' inside the lookback window. Used by the
  // Webhook Health card so admins notice send failures immediately.
  async getRecentFailedOutboundMessages(args: { lookbackHours?: number; limit?: number } = {}): Promise<Array<{
    id: string;
    conversationId: string;
    body: string | null;
    type: string;
    status: string | null;
    createdAt: string;
    phone: string;
    contactName: string | null;
  }>> {
    const lookbackHours = args.lookbackHours ?? 24;
    const limit = Math.min(args.limit ?? 20, 50);
    const result = await db.execute(sql`
      SELECT
        m.id,
        m.conversation_id AS "conversationId",
        m.body,
        m.message_type AS "type",
        m.status,
        m.created_at AS "createdAt",
        c.phone,
        c.contact_name AS "contactName"
      FROM whatsapp_messages m
      JOIN whatsapp_conversations c ON c.id = m.conversation_id
      WHERE m.direction = 'outbound'
        AND m.status = 'failed'
        AND m.created_at > NOW() - (${lookbackHours} || ' hours')::interval
      ORDER BY m.created_at DESC
      LIMIT ${limit}
    `);
    return (result.rows as any[]).map(r => ({
      id: r.id,
      conversationId: r.conversationId,
      body: r.body,
      type: r.type,
      status: r.status,
      createdAt: new Date(r.createdAt).toISOString(),
      phone: r.phone,
      contactName: r.contactName,
    }));
  }

  // ── Debug Payload Captures (Task #67 Phase 2 task 10a — generalised) ────────
  // Capped at 5 rows per (source, eventType) pair. Fire-and-forget;
  // failures must NEVER block the calling path.
  async captureDebugPayload(args: {
    source: string;
    eventType: string;
    rawPayload: any;
    notes?: string | null;
  }): Promise<void> {
    const PER_TYPE_CAP = 5;
    await db.insert(debugPayloadCaptures).values({
      source: args.source,
      eventType: args.eventType,
      rawPayload: args.rawPayload,
      notes: args.notes ?? null,
    });
    // Trim this (source, eventType) bucket to PER_TYPE_CAP most recent rows.
    await db.execute(sql`
      DELETE FROM debug_payload_captures
      WHERE source = ${args.source}
        AND event_type = ${args.eventType}
        AND id NOT IN (
          SELECT id FROM debug_payload_captures
          WHERE source = ${args.source} AND event_type = ${args.eventType}
          ORDER BY created_at DESC
          LIMIT ${PER_TYPE_CAP}
        )
    `);
  }

  async getDebugPayloadCaptures(filter?: { source?: string; eventType?: string; limit?: number }): Promise<DebugPayloadCapture[]> {
    const conds = [];
    if (filter?.source) conds.push(eq(debugPayloadCaptures.source, filter.source));
    if (filter?.eventType) conds.push(eq(debugPayloadCaptures.eventType, filter.eventType));
    const limit = Math.min(filter?.limit ?? 50, 100);
    const q = db.select().from(debugPayloadCaptures);
    const filtered = conds.length ? q.where(and(...conds)) : q;
    return filtered.orderBy(desc(debugPayloadCaptures.createdAt)).limit(limit);
  }

  async pruneOldDebugPayloadCaptures(retentionDays = 30): Promise<number> {
    const result: any = await db.execute(sql`
      DELETE FROM debug_payload_captures
      WHERE created_at < NOW() - (${retentionDays}::int * INTERVAL '1 day')
    `);
    return Number(result?.rowCount ?? 0);
  }

  // ── Expenses (Task #69) ─────────────────────────────────────────────────
  async getExpenseCategories(includeInactive = false): Promise<ExpenseCategory[]> {
    const rows = includeInactive
      ? await db.select().from(expenseCategories)
      : await db.select().from(expenseCategories).where(eq(expenseCategories.isActive, true));
    return rows.sort((a, b) => (a.sortOrder - b.sortOrder) || a.name.localeCompare(b.name));
  }

  async getExpenseCategory(id: string): Promise<ExpenseCategory | undefined> {
    const [row] = await db.select().from(expenseCategories).where(eq(expenseCategories.id, id));
    return row;
  }

  async createExpenseCategory(data: InsertExpenseCategory): Promise<ExpenseCategory> {
    const [row] = await db.insert(expenseCategories).values(data).returning();
    return row;
  }

  async updateExpenseCategory(id: string, data: Partial<InsertExpenseCategory>): Promise<ExpenseCategory | undefined> {
    const [row] = await db.update(expenseCategories).set({ ...data, updatedAt: new Date() }).where(eq(expenseCategories.id, id)).returning();
    return row;
  }

  async deactivateExpenseCategory(id: string): Promise<ExpenseCategory | undefined> {
    const [row] = await db.update(expenseCategories).set({ isActive: false, updatedAt: new Date() }).where(eq(expenseCategories.id, id)).returning();
    return row;
  }

  async reorderExpenseCategories(orderedIds: string[]): Promise<void> {
    // Persist the new sortOrder for each category in a single transaction.
    await db.transaction(async (tx) => {
      for (let i = 0; i < orderedIds.length; i++) {
        await tx.update(expenseCategories)
          .set({ sortOrder: i + 1, updatedAt: new Date() })
          .where(eq(expenseCategories.id, orderedIds[i]));
      }
    });
  }

  async countExpensesByCategory(categoryId: string): Promise<number> {
    const [r] = await db.select({ count: sql<number>`count(*)::int` }).from(expenses).where(eq(expenses.categoryId, categoryId));
    return r?.count ?? 0;
  }

  async seedDefaultExpenseCategories(): Promise<number> {
    const DEFAULTS: Array<{ name: string; color: string; icon: string }> = [
      { name: "Hospitality & Guests", color: "#f59e0b", icon: "Coffee" },
      { name: "Loading / Unloading", color: "#0ea5e9", icon: "Truck" },
      { name: "Delivery & Logistics", color: "#3b82f6", icon: "Package" },
      { name: "Warehouse Operations", color: "#8b5cf6", icon: "Warehouse" },
      { name: "Office Supplies", color: "#64748b", icon: "Pencil" },
      { name: "Utilities", color: "#06b6d4", icon: "Zap" },
      { name: "Software & IT", color: "#6366f1", icon: "Monitor" },
      { name: "Vehicle Maintenance", color: "#ef4444", icon: "Car" },
      { name: "Repairs & Maintenance", color: "#f97316", icon: "Wrench" },
      { name: "Marketing & Customer Relations", color: "#ec4899", icon: "Megaphone" },
      { name: "Legal & Professional", color: "#475569", icon: "Scale" },
      { name: "Bank & Finance Charges", color: "#10b981", icon: "Landmark" },
      { name: "Employee Welfare", color: "#14b8a6", icon: "HeartHandshake" },
      { name: "Events & Celebrations", color: "#d946ef", icon: "PartyPopper" },
      { name: "Miscellaneous", color: "#94a3b8", icon: "Receipt" },
    ];
    let inserted = 0;
    for (let i = 0; i < DEFAULTS.length; i++) {
      const d = DEFAULTS[i];
      const [existing] = await db.select().from(expenseCategories).where(eq(expenseCategories.name, d.name));
      if (!existing) {
        await db.insert(expenseCategories).values({ ...d, sortOrder: i + 1, isActive: true });
        inserted++;
      }
    }
    return inserted;
  }

  private buildExpenseConds(filters?: ExpenseFilters): any[] {
    const conds: any[] = [];
    if (filters?.from) conds.push(gte(expenses.expenseDate, filters.from));
    if (filters?.to) conds.push(lte(expenses.expenseDate, filters.to));
    if (filters?.categoryIds && filters.categoryIds.length > 0) {
      conds.push(sql`${expenses.categoryId} IN (${sql.join(filters.categoryIds.map(id => sql`${id}`), sql`, `)})`);
    }
    if (filters?.paidByUserIds && filters.paidByUserIds.length > 0) {
      conds.push(sql`${expenses.paidByUserId} IN (${sql.join(filters.paidByUserIds.map(id => sql`${id}`), sql`, `)})`);
    }
    if (filters?.paymentMethods && filters.paymentMethods.length > 0) {
      conds.push(sql`${expenses.paymentMethod} IN (${sql.join(filters.paymentMethods.map(m => sql`${m}`), sql`, `)})`);
    }
    if (filters?.search) {
      const s = `%${filters.search.toLowerCase()}%`;
      conds.push(sql`(lower(${expenses.description}) LIKE ${s} OR lower(coalesce(${expenses.vendorName}, '')) LIKE ${s} OR lower(coalesce(${expenses.notes}, '')) LIKE ${s})`);
    }
    if (filters?.linkedEntityType) conds.push(eq(expenses.linkedEntityType, filters.linkedEntityType));
    if (filters?.linkedEntityId) conds.push(eq(expenses.linkedEntityId, filters.linkedEntityId));
    if (filters?.scopeUserId) {
      conds.push(or(eq(expenses.paidByUserId, filters.scopeUserId), eq(expenses.createdByUserId, filters.scopeUserId)));
    }
    return conds;
  }

  async getExpenses(filters?: ExpenseFilters): Promise<Expense[]> {
    const conds = this.buildExpenseConds(filters);
    const q = conds.length > 0
      ? db.select().from(expenses).where(and(...conds))
      : db.select().from(expenses);
    return await q.orderBy(desc(expenses.expenseDate), desc(expenses.createdAt));
  }

  async getExpense(id: string): Promise<Expense | undefined> {
    const [row] = await db.select().from(expenses).where(eq(expenses.id, id));
    return row;
  }

  async createExpense(data: InsertExpense & { createdByUserId: string; paidByUserId: string }): Promise<Expense> {
    const [row] = await db.insert(expenses).values(data).returning();
    return row;
  }

  async updateExpense(id: string, data: Partial<InsertExpense>): Promise<Expense | undefined> {
    const [row] = await db.update(expenses).set({ ...data, updatedAt: new Date() }).where(eq(expenses.id, id)).returning();
    return row;
  }

  async deleteExpense(id: string): Promise<boolean> {
    await db.delete(expenses).where(eq(expenses.id, id));
    return true;
  }

  async getExpensesSummary(filters?: ExpenseFilters): Promise<ExpenseSummary> {
    const rows = await this.getExpenses(filters);
    const cats = await this.getExpenseCategories(true);
    const catMap = new Map(cats.map(c => [c.id, c]));
    const buckets = new Map<string, ExpenseSummaryCategory>();
    let totalAmount = 0;
    let highestSingle = 0;
    for (const e of rows) {
      const a = Number(e.amount);
      totalAmount += a;
      if (a > highestSingle) highestSingle = a;
      const cat = catMap.get(e.categoryId);
      const k = e.categoryId;
      const b = buckets.get(k) ?? { categoryId: k, categoryName: cat?.name ?? "Unknown", color: cat?.color ?? "#64748b", amount: 0, count: 0 };
      b.amount += a; b.count += 1;
      buckets.set(k, b);
    }
    const byCategory = Array.from(buckets.values()).sort((a, b) => b.amount - a.amount);
    return { totalAmount, count: rows.length, topCategory: byCategory[0] ?? null, highestSingle, byCategory };
  }

  async getExpensesAnalytics(filters?: ExpenseFilters): Promise<ExpenseAnalytics> {
    const rows = await this.getExpenses(filters);
    const cats = await this.getExpenseCategories(true);
    const catMap = new Map(cats.map(c => [c.id, c]));
    const allUsers = await db.select().from(users);
    const userMap = new Map(allUsers.map(u => [u.id, u]));

    const byCatMap = new Map<string, { categoryId: string; categoryName: string; color: string; amount: number }>();
    const byUserMap = new Map<string, { userId: string; userName: string; amount: number }>();
    const byDayMap = new Map<string, number>();
    let total = 0;

    for (const e of rows) {
      const a = Number(e.amount);
      total += a;

      const cat = catMap.get(e.categoryId);
      const c = byCatMap.get(e.categoryId) ?? { categoryId: e.categoryId, categoryName: cat?.name ?? "Unknown", color: cat?.color ?? "#64748b", amount: 0 };
      c.amount += a; byCatMap.set(e.categoryId, c);

      const u = userMap.get(e.paidByUserId);
      const userBucket = byUserMap.get(e.paidByUserId) ?? { userId: e.paidByUserId, userName: u?.fullName ?? u?.username ?? "Unknown", amount: 0 };
      userBucket.amount += a; byUserMap.set(e.paidByUserId, userBucket);

      const dKey = String(e.expenseDate);
      byDayMap.set(dKey, (byDayMap.get(dKey) ?? 0) + a);
    }

    const byCategory = Array.from(byCatMap.values()).sort((a, b) => b.amount - a.amount);
    const byPerson = Array.from(byUserMap.values()).sort((a, b) => b.amount - a.amount);
    const dailyTrend = Array.from(byDayMap.entries()).sort((a, b) => a[0].localeCompare(b[0])).map(([date, amount]) => ({ date, amount }));
    const categoryShare = byCategory.map(c => ({ ...c, pct: total > 0 ? Math.round((c.amount / total) * 1000) / 10 : 0 }));

    return { byCategory, byPerson, dailyTrend, categoryShare };
  }

  // ── Cash Accounts (Phase 4B) ────────────────────────────────────────────────

  async getCashAccounts(includeInactive = false): Promise<CashAccount[]> {
    const q = includeInactive
      ? db.select().from(cashAccounts)
      : db.select().from(cashAccounts).where(eq(cashAccounts.isActive, true));
    return await q.orderBy(cashAccounts.name);
  }

  async getCashAccount(id: string): Promise<CashAccount | undefined> {
    const [row] = await db.select().from(cashAccounts).where(eq(cashAccounts.id, id));
    return row;
  }

  async createCashAccount(data: InsertCashAccount): Promise<CashAccount> {
    const payload: any = { ...data };
    if (payload.openingBalanceDate && typeof payload.openingBalanceDate === "string") {
      payload.openingBalanceDate = new Date(payload.openingBalanceDate);
    }
    const [row] = await db.insert(cashAccounts).values(payload).returning();
    return row;
  }

  async updateCashAccount(id: string, data: Partial<InsertCashAccount>): Promise<CashAccount | undefined> {
    const payload: any = { ...data };
    if (payload.openingBalanceDate && typeof payload.openingBalanceDate === "string") {
      payload.openingBalanceDate = new Date(payload.openingBalanceDate);
    }
    const [row] = await db.update(cashAccounts).set(payload).where(eq(cashAccounts.id, id)).returning();
    return row;
  }

  async deactivateCashAccount(id: string): Promise<CashAccount | undefined> {
    const [row] = await db.update(cashAccounts).set({ isActive: false }).where(eq(cashAccounts.id, id)).returning();
    return row;
  }

  async reactivateCashAccount(id: string): Promise<CashAccount | undefined> {
    const [row] = await db.update(cashAccounts).set({ isActive: true }).where(eq(cashAccounts.id, id)).returning();
    return row;
  }

  async seedDefaultCashAccounts(): Promise<number> {
    const DEFAULTS = [
      { name: "HDFC Bank", type: "bank", bankName: "HDFC Bank" },
      { name: "ICICI Bank", type: "bank", bankName: "ICICI Bank" },
      { name: "AXIS Bank", type: "bank", bankName: "AXIS Bank" },
      { name: "CEO Cash", type: "cash", bankName: null },
    ] as const;
    let inserted = 0;
    for (const acct of DEFAULTS) {
      const [existing] = await db.select().from(cashAccounts).where(eq(cashAccounts.name, acct.name));
      if (!existing) {
        await db.insert(cashAccounts).values({ name: acct.name, type: acct.type, bankName: acct.bankName ?? undefined, openingBalance: "0", isActive: true });
        inserted++;
      }
    }
    return inserted;
  }

  // Account Transfers
  async createAccountTransfer(data: InsertAccountTransfer): Promise<AccountTransfer> {
    const payload: any = { ...data };
    if (payload.transferDate instanceof Date) {
      payload.transferDate = payload.transferDate.toISOString().slice(0, 10);
    }
    const [row] = await db.insert(accountTransfers).values(payload).returning();
    return row;
  }

  async getAccountTransfers(accountId?: string): Promise<AccountTransfer[]> {
    if (accountId) {
      return await db.select().from(accountTransfers)
        .where(or(eq(accountTransfers.fromAccountId, accountId), eq(accountTransfers.toAccountId, accountId)))
        .orderBy(desc(accountTransfers.transferDate), desc(accountTransfers.createdAt));
    }
    return await db.select().from(accountTransfers).orderBy(desc(accountTransfers.transferDate), desc(accountTransfers.createdAt));
  }

  async deleteAccountTransfer(id: string): Promise<boolean> {
    await db.delete(accountTransfers).where(eq(accountTransfers.id, id));
    return true;
  }

  // Balance Adjustments
  async createBalanceAdjustment(data: InsertBalanceAdjustment): Promise<BalanceAdjustment> {
    const payload: any = { ...data };
    if (payload.adjustmentDate instanceof Date) {
      payload.adjustmentDate = payload.adjustmentDate.toISOString().slice(0, 10);
    }
    const [row] = await db.insert(balanceAdjustments).values(payload).returning();
    return row;
  }

  async getBalanceAdjustments(accountId?: string): Promise<BalanceAdjustment[]> {
    if (accountId) {
      return await db.select().from(balanceAdjustments)
        .where(eq(balanceAdjustments.cashAccountId, accountId))
        .orderBy(desc(balanceAdjustments.adjustmentDate), desc(balanceAdjustments.createdAt));
    }
    return await db.select().from(balanceAdjustments).orderBy(desc(balanceAdjustments.adjustmentDate), desc(balanceAdjustments.createdAt));
  }

  // Balance computation (on-the-fly, no cached field)
  // Uses .rows[0] pattern consistent with the rest of the codebase.
  async computeAccountBalance(accountId: string, asOfDate?: string): Promise<number> {
    const acct = await this.getCashAccount(accountId);
    if (!acct) return 0;
    const opening = Number(acct.openingBalance ?? "0");

    const dateFilter = asOfDate ? sql`AND date(payment_date) <= ${asOfDate}` : sql``;
    const expDateFilter = asOfDate ? sql`AND expense_date <= ${asOfDate}` : sql``;
    const transferDateFilter = asOfDate ? sql`AND transfer_date <= ${asOfDate}` : sql``;
    const adjDateFilter = asOfDate ? sql`AND adjustment_date <= ${asOfDate}` : sql``;

    const cpResult = await db.execute(sql`
      SELECT COALESCE(SUM(amount::numeric), 0) AS total
      FROM customer_payments WHERE cash_account_id = ${accountId} ${dateFilter}
    `);
    const cpIn = Number((cpResult.rows[0] as any)?.total ?? 0);

    // Phase 4B: legacy sales-order-origin receipts (payments table) — IN direction.
    // Historic rows with NULL cash_account_id are skipped (Cash Position page shows them in unattributed footnote).
    const pmtResult = await db.execute(sql`
      SELECT COALESCE(SUM(amount::numeric), 0) AS total
      FROM payments WHERE cash_account_id = ${accountId} AND status = 'completed' ${dateFilter}
    `);
    const pmtIn = Number((pmtResult.rows[0] as any)?.total ?? 0);

    const spResult = await db.execute(sql`
      SELECT COALESCE(SUM(amount::numeric), 0) AS total
      FROM supplier_payments WHERE cash_account_id = ${accountId} ${dateFilter}
    `);
    const spOut = Number((spResult.rows[0] as any)?.total ?? 0);

    const expResult = await db.execute(sql`
      SELECT COALESCE(SUM(amount::numeric), 0) AS total
      FROM expenses WHERE cash_account_id = ${accountId} ${expDateFilter}
    `);
    const expOut = Number((expResult.rows[0] as any)?.total ?? 0);

    const trInResult = await db.execute(sql`
      SELECT COALESCE(SUM(amount::numeric), 0) AS total
      FROM account_transfers WHERE to_account_id = ${accountId} ${transferDateFilter}
    `);
    const trIn = Number((trInResult.rows[0] as any)?.total ?? 0);

    const trOutResult = await db.execute(sql`
      SELECT COALESCE(SUM(amount::numeric), 0) AS total
      FROM account_transfers WHERE from_account_id = ${accountId} ${transferDateFilter}
    `);
    const trOut = Number((trOutResult.rows[0] as any)?.total ?? 0);

    const adjResult = await db.execute(sql`
      SELECT COALESCE(SUM(adjustment_amount::numeric), 0) AS total
      FROM balance_adjustments WHERE cash_account_id = ${accountId} ${adjDateFilter}
    `);
    const adjNet = Number((adjResult.rows[0] as any)?.total ?? 0);

    return opening + cpIn + pmtIn - spOut - expOut + trIn - trOut + adjNet;
  }

  // ── Phase 4C — Canonical outstanding helpers (FIX 1) ──────────────────────
  // See IStorage interface above for design rationale + caveats.
  // Two consumers of one formula; unit test asserts agreement.

  async computeCustomerInvoiceOutstanding(invoiceId: string): Promise<number> {
    const r = await db.execute(sql`
      SELECT GREATEST(
        si.grand_total::numeric
        - COALESCE((SELECT SUM(amount::numeric) FROM customer_payments WHERE invoice_id = si.id), 0)
        - si.credited_amount::numeric,
        0
      ) AS outstanding
      FROM sales_invoices si
      WHERE si.id = ${invoiceId}
    `);
    return Number((r.rows[0] as any)?.outstanding ?? 0);
  }

  async computeSupplierInvoiceOutstanding(invoiceId: string): Promise<number> {
    // Credits against this invoice come from two sources (must not double-count):
    //
    //   1. Payments directly linked to the invoice (supplier_invoice_id = invoiceId)
    //      — covers regular payments AND advances that B3 has already migrated
    //
    //   2. The PO's advance_paid field
    //      — covers advances still stored against the PO (purchase_order_id set,
    //        supplier_invoice_id NULL) when B3 hasn't run for this PO yet, OR when
    //        an advance was recorded AFTER the GRN was confirmed but before the next
    //        server restart runs the B3 backfill.
    //
    // B3 ensures these two sources are mutually exclusive:
    //   • When B3 runs it moves the payment to supplier_invoice_id AND zeroes advance_paid.
    //   • Until then: advance_paid > 0, payment has purchase_order_id (not invoice_id).
    // So summing both is always safe and always accurate.
    const r = await db.execute(sql`
      SELECT GREATEST(
        si.total_amount::numeric
        - COALESCE((SELECT SUM(amount::numeric) FROM supplier_payments WHERE supplier_invoice_id = si.id), 0)
        - COALESCE((SELECT po.advance_paid::numeric FROM purchase_orders po WHERE po.id = si.purchase_order_id), 0),
        0
      ) AS outstanding
      FROM supplier_invoices si
      WHERE si.id = ${invoiceId}
    `);
    return Number((r.rows[0] as any)?.outstanding ?? 0);
  }

  async sumOpenCustomerOutstanding(opts?: { dueDateBefore?: Date }): Promise<{ count: number; amount: number }> {
    // Open = status != 'paid' AND uploadStatus != 'cancelled'
    // (mirrors getPendingActions filter; excludes cancelled invoices)
    const dueFilter = opts?.dueDateBefore
      ? sql`AND si.due_date < ${opts.dueDateBefore.toISOString()}`
      : sql``;
    const r = await db.execute(sql`
      SELECT
        COUNT(*) FILTER (WHERE outstanding > 0)::int AS cnt,
        COALESCE(SUM(outstanding), 0) AS amt
      FROM (
        SELECT GREATEST(
          si.grand_total::numeric
          - COALESCE((SELECT SUM(amount::numeric) FROM customer_payments WHERE invoice_id = si.id), 0)
          - si.credited_amount::numeric,
          0
        ) AS outstanding
        FROM sales_invoices si
        WHERE si.status <> 'paid'
          AND si.upload_status <> 'cancelled'
          ${dueFilter}
        UNION ALL
        -- Fleet service invoices (no upload_status column)
        SELECT GREATEST(
          vti.grand_total::numeric
          - COALESCE((SELECT SUM(amount::numeric) FROM customer_payments WHERE trip_invoice_id = vti.id), 0)
          - vti.credited_amount::numeric,
          0
        ) AS outstanding
        FROM vehicle_trip_invoices vti
        WHERE vti.status <> 'cancelled'
          AND vti.status <> 'paid'
          ${opts?.dueDateBefore ? sql`AND vti.due_date < ${opts.dueDateBefore.toISOString()}` : sql``}
      ) t
    `);
    const row: any = r.rows[0] ?? {};
    return { count: Number(row.cnt ?? 0), amount: Number(row.amt ?? 0) };
  }

  async sumOpenSupplierOutstanding(opts?: { dueDateBefore?: Date }): Promise<{ count: number; amount: number }> {
    const dueFilter = opts?.dueDateBefore
      ? sql`AND si.due_date < ${opts.dueDateBefore.toISOString()}`
      : sql``;
    const r = await db.execute(sql`
      SELECT
        COUNT(*) FILTER (WHERE outstanding > 0)::int AS cnt,
        COALESCE(SUM(outstanding), 0) AS amt
      FROM (
        SELECT GREATEST(
          si.total_amount::numeric
          - COALESCE((SELECT SUM(amount::numeric) FROM supplier_payments WHERE supplier_invoice_id = si.id), 0)
          - COALESCE((SELECT po.advance_paid::numeric FROM purchase_orders po WHERE po.id = si.purchase_order_id), 0),
          0
        ) AS outstanding
        FROM supplier_invoices si
        WHERE si.status <> 'paid'
          AND si.upload_status <> 'cancelled'
          ${dueFilter}
      ) t
    `);
    const row: any = r.rows[0] ?? {};
    return { count: Number(row.cnt ?? 0), amount: Number(row.amt ?? 0) };
  }

  async getAccountStats(accountId: string, fromDate: string, toDate: string): Promise<AccountStats> {
    const openingBalance = await this.computeAccountBalance(accountId, fromDate);
    const closingBalance = await this.computeAccountBalance(accountId, toDate);

    const cpRes = await db.execute(sql`
      SELECT COALESCE(SUM(amount::numeric), 0) AS total, COUNT(*)::int AS cnt
      FROM customer_payments WHERE cash_account_id = ${accountId}
        AND date(payment_date) BETWEEN ${fromDate} AND ${toDate}
    `);
    const spRes = await db.execute(sql`
      SELECT COALESCE(SUM(amount::numeric), 0) AS total, COUNT(*)::int AS cnt
      FROM supplier_payments WHERE cash_account_id = ${accountId}
        AND date(payment_date) BETWEEN ${fromDate} AND ${toDate}
    `);
    const expRes = await db.execute(sql`
      SELECT COALESCE(SUM(amount::numeric), 0) AS total, COUNT(*)::int AS cnt
      FROM expenses WHERE cash_account_id = ${accountId}
        AND expense_date BETWEEN ${fromDate} AND ${toDate}
    `);
    const trInRes = await db.execute(sql`
      SELECT COALESCE(SUM(amount::numeric), 0) AS total, COUNT(*)::int AS cnt
      FROM account_transfers WHERE to_account_id = ${accountId}
        AND transfer_date BETWEEN ${fromDate} AND ${toDate}
    `);
    const trOutRes = await db.execute(sql`
      SELECT COALESCE(SUM(amount::numeric), 0) AS total, COUNT(*)::int AS cnt
      FROM account_transfers WHERE from_account_id = ${accountId}
        AND transfer_date BETWEEN ${fromDate} AND ${toDate}
    `);
    const adjCreditRes = await db.execute(sql`
      SELECT COALESCE(SUM(adjustment_amount::numeric), 0) AS total, COUNT(*)::int AS cnt
      FROM balance_adjustments WHERE cash_account_id = ${accountId}
        AND adjustment_date BETWEEN ${fromDate} AND ${toDate}
        AND adjustment_amount > 0
    `);
    const adjDebitRes = await db.execute(sql`
      SELECT COALESCE(SUM(ABS(adjustment_amount::numeric)), 0) AS total, COUNT(*)::int AS cnt
      FROM balance_adjustments WHERE cash_account_id = ${accountId}
        AND adjustment_date BETWEEN ${fromDate} AND ${toDate}
        AND adjustment_amount < 0
    `);

    const cpRow = cpRes.rows[0] as any;
    const spRow = spRes.rows[0] as any;
    const expRow = expRes.rows[0] as any;
    const trInRow = trInRes.rows[0] as any;
    const trOutRow = trOutRes.rows[0] as any;
    const adjCreditRow = adjCreditRes.rows[0] as any;
    const adjDebitRow = adjDebitRes.rows[0] as any;

    const adjCredit = Number(adjCreditRow?.total ?? 0);
    const adjDebit = Number(adjDebitRow?.total ?? 0);
    const totalIn = Number(cpRow?.total ?? 0) + Number(trInRow?.total ?? 0) + adjCredit;
    const totalOut = Number(spRow?.total ?? 0) + Number(expRow?.total ?? 0) + Number(trOutRow?.total ?? 0) + adjDebit;
    const netChange = closingBalance - openingBalance;
    const transactionCount = Number(cpRow?.cnt ?? 0) + Number(spRow?.cnt ?? 0) +
      Number(expRow?.cnt ?? 0) + Number(trInRow?.cnt ?? 0) +
      Number(trOutRow?.cnt ?? 0) + Number(adjCreditRow?.cnt ?? 0) + Number(adjDebitRow?.cnt ?? 0);

    return { totalIn, totalOut, netChange, openingBalance, closingBalance, transactionCount };
  }

  async getAccountTransactions(
    accountId: string,
    fromDate?: string,
    toDate?: string,
    limit = 50,
    offset = 0
  ): Promise<{ rows: AccountTransactionRow[]; total: number }> {
    // Build a UNION of all transaction sources for this account
    // Each row: id, tx_date (DATE), type, amount (positive=credit, negative=debit), description, reference, entity_id, entity_type
    const fromCond = fromDate ? sql`AND tx_date >= ${fromDate}` : sql``;
    const toCond = toDate ? sql`AND tx_date <= ${toDate}` : sql``;

    const rawRows = await db.execute(sql`
      WITH all_txns AS (
        -- Customer payments IN
        SELECT
          id,
          date(payment_date) AS tx_date,
          'customer_payment' AS type,
          amount::numeric AS amount,
          COALESCE(reference, 'Customer Payment') AS description,
          reference,
          NULL::text AS counterparty_name,
          invoice_id AS entity_id,
          'invoice' AS entity_type,
          NULL::text AS adjusted_by_name
        FROM customer_payments
        WHERE cash_account_id = ${accountId}

        UNION ALL

        -- Supplier payments OUT (negative)
        SELECT
          id,
          date(payment_date) AS tx_date,
          'supplier_payment' AS type,
          -(amount::numeric) AS amount,
          COALESCE(reference, 'Supplier Payment') AS description,
          reference,
          NULL::text AS counterparty_name,
          coalesce(supplier_invoice_id, purchase_order_id) AS entity_id,
          CASE WHEN supplier_invoice_id IS NOT NULL THEN 'supplier_invoice' ELSE 'purchase_order' END AS entity_type,
          NULL::text AS adjusted_by_name
        FROM supplier_payments
        WHERE cash_account_id = ${accountId}

        UNION ALL

        -- Expenses OUT (negative)
        SELECT
          id,
          expense_date::date AS tx_date,
          'expense' AS type,
          -(amount::numeric) AS amount,
          description,
          NULL AS reference,
          NULL::text AS counterparty_name,
          id AS entity_id,
          'expense' AS entity_type,
          NULL::text AS adjusted_by_name
        FROM expenses
        WHERE cash_account_id = ${accountId}

        UNION ALL

        -- Transfer IN
        SELECT
          id,
          transfer_date::date AS tx_date,
          'transfer_in' AS type,
          amount::numeric AS amount,
          CASE WHEN reference IS NOT NULL AND reference <> '' THEN 'Transfer In: ' || reference ELSE 'Transfer In' END AS description,
          reference,
          (SELECT name FROM cash_accounts WHERE id = account_transfers.from_account_id) AS counterparty_name,
          id AS entity_id,
          'account_transfer' AS entity_type,
          NULL::text AS adjusted_by_name
        FROM account_transfers
        WHERE to_account_id = ${accountId}

        UNION ALL

        -- Transfer OUT (negative)
        SELECT
          id,
          transfer_date::date AS tx_date,
          'transfer_out' AS type,
          -(amount::numeric) AS amount,
          CASE WHEN reference IS NOT NULL AND reference <> '' THEN 'Transfer Out: ' || reference ELSE 'Transfer Out' END AS description,
          reference,
          (SELECT name FROM cash_accounts WHERE id = account_transfers.to_account_id) AS counterparty_name,
          id AS entity_id,
          'account_transfer' AS entity_type,
          NULL::text AS adjusted_by_name
        FROM account_transfers
        WHERE from_account_id = ${accountId}

        UNION ALL

        -- Balance adjustments (can be positive or negative)
        SELECT
          id,
          adjustment_date::date AS tx_date,
          'adjustment' AS type,
          adjustment_amount::numeric AS amount,
          reason AS description,
          NULL AS reference,
          NULL::text AS counterparty_name,
          id AS entity_id,
          'balance_adjustment' AS entity_type,
          (SELECT username FROM users WHERE id = balance_adjustments.adjusted_by) AS adjusted_by_name
        FROM balance_adjustments
        WHERE cash_account_id = ${accountId}
      ),
      acct AS (SELECT opening_balance::numeric AS ob FROM cash_accounts WHERE id = ${accountId}),
      dated AS (
        SELECT * FROM all_txns
        WHERE 1=1 ${fromCond} ${toCond}
      ),
      with_running AS (
        SELECT
          id,
          tx_date::text,
          type,
          amount,
          description,
          reference,
          counterparty_name,
          entity_id,
          entity_type,
          adjusted_by_name,
          (SELECT ob FROM acct) + SUM(amount) OVER (ORDER BY tx_date, id ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS running_balance,
          COUNT(*) OVER () AS total_count
        FROM dated
        ORDER BY tx_date DESC, id DESC
      )
      SELECT * FROM with_running
      LIMIT ${limit} OFFSET ${offset}
    `);

    const total = rawRows.rows.length > 0 ? Number((rawRows.rows[0] as any).total_count ?? 0) : 0;

    const rows: AccountTransactionRow[] = rawRows.rows.map((r: any) => ({
      id: r.id,
      transactionDate: r.tx_date,
      type: r.type as AccountTransactionRow["type"],
      amount: Number(r.amount),
      runningBalance: Number(r.running_balance),
      description: r.description ?? "",
      reference: r.reference ?? null,
      counterpartyName: r.counterparty_name ?? null,
      linkedEntityId: r.entity_id ?? null,
      linkedEntityType: r.entity_type ?? null,
      adjustedByName: r.adjusted_by_name ?? null,
    }));

    return { rows, total };
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

  // ─── Monthly Targets (Countdown Display) ──────────────────────────────────
  async getMonthlyTarget(month: string) {
    const rows = await db.select().from(monthlyTargets).where(eq(monthlyTargets.month, month)).limit(1);
    return rows[0] ?? null;
  }

  async upsertMonthlyTarget(month: string, data: {
    salesTarget?: string;
    salesAchieved?: string;
    solarCustomersTarget?: number;
    solarCustomersAchieved?: number;
  }) {
    const existing = await this.getMonthlyTarget(month);
    if (existing) {
      const update: Record<string, any> = { updatedAt: new Date() };
      if (data.salesTarget        !== undefined) update.salesTarget             = data.salesTarget;
      if (data.salesAchieved      !== undefined) update.salesAchieved           = data.salesAchieved;
      if (data.solarCustomersTarget   !== undefined) update.solarCustomersTarget   = data.solarCustomersTarget;
      if (data.solarCustomersAchieved !== undefined) update.solarCustomersAchieved = data.solarCustomersAchieved;
      const rows = await db.update(monthlyTargets).set(update).where(eq(monthlyTargets.month, month)).returning();
      return rows[0];
    } else {
      const rows = await db.insert(monthlyTargets).values({
        month,
        salesTarget:            data.salesTarget            ?? "50000000",
        salesAchieved:          data.salesAchieved          ?? "0",
        solarCustomersTarget:   data.solarCustomersTarget   ?? 35,
        solarCustomersAchieved: data.solarCustomersAchieved ?? 0,
        updatedAt: new Date(),
      }).returning();
      return rows[0];
    }
  }
  // ── Combo Components ───────────────────────────────────────────────────────

  async getComboComponents(comboProductId: string): Promise<ComboComponent[]> {
    return db.select().from(comboComponents)
      .where(eq(comboComponents.comboProductId, comboProductId))
      .orderBy(comboComponents.sortOrder, comboComponents.createdAt);
  }

  async createComboComponent(data: InsertComboComponent): Promise<ComboComponent> {
    const [created] = await db.insert(comboComponents).values(data).returning();
    return created;
  }

  async updateComboComponent(id: string, data: Partial<InsertComboComponent>): Promise<ComboComponent | undefined> {
    const [updated] = await db.update(comboComponents).set(data).where(eq(comboComponents.id, id)).returning();
    return updated;
  }

  async deleteComboComponent(id: string): Promise<boolean> {
    await db.delete(comboComponents).where(eq(comboComponents.id, id));
    return true;
  }

  async replaceComboComponents(comboProductId: string, items: Omit<InsertComboComponent, "comboProductId">[]): Promise<ComboComponent[]> {
    await db.delete(comboComponents).where(eq(comboComponents.comboProductId, comboProductId));
    if (items.length === 0) return [];
    const rows = await db.insert(comboComponents)
      .values(items.map(item => ({ ...item, comboProductId })))
      .returning();
    return rows;
  }

  // ── Combo Serial Records ───────────────────────────────────────────────────

  async getComboSerialRecords(opts: {
    grnId?: string;
    grnItemId?: string;
    comboProductId?: string;
    allocatedChallanId?: string;
    available?: boolean;
  }): Promise<ComboSerialRecord[]> {
    const conds = [];
    if (opts.grnId)             conds.push(eq(comboSerialRecords.grnId, opts.grnId));
    if (opts.grnItemId)         conds.push(eq(comboSerialRecords.grnItemId, opts.grnItemId));
    if (opts.comboProductId)    conds.push(eq(comboSerialRecords.comboProductId, opts.comboProductId));
    if (opts.allocatedChallanId) conds.push(eq(comboSerialRecords.allocatedChallanId, opts.allocatedChallanId));
    if (opts.available === true)  conds.push(isNull(comboSerialRecords.allocatedChallanId));
    if (opts.available === false) conds.push(sql`${comboSerialRecords.allocatedChallanId} IS NOT NULL`);
    const q = conds.length > 0
      ? db.select().from(comboSerialRecords).where(and(...conds))
      : db.select().from(comboSerialRecords);
    return q.orderBy(comboSerialRecords.comboUnitIndex, comboSerialRecords.componentName, comboSerialRecords.capturedAt);
  }

  async createComboSerialRecord(data: InsertComboSerialRecord): Promise<ComboSerialRecord> {
    const [created] = await db.insert(comboSerialRecords).values(data).returning();
    return created;
  }

  async allocateComboSerials(serialIds: string[], challanId: string, customerId: string, allocatedByUserId: string): Promise<void> {
    if (serialIds.length === 0) return;
    const now = new Date();
    for (const id of serialIds) {
      await db.update(comboSerialRecords)
        .set({ allocatedChallanId: challanId, allocatedCustomerId: customerId, allocatedAt: now, allocatedByUserId, updatedAt: now })
        .where(and(eq(comboSerialRecords.id, id), isNull(comboSerialRecords.allocatedChallanId)));
    }
  }

  async deallocateComboSerials(challanId: string): Promise<void> {
    const now = new Date();
    await db.update(comboSerialRecords)
      .set({
        deallocatedAt: now,
        allocatedChallanId: null,
        allocatedCustomerId: null,
        allocatedAt: null,
        allocatedByUserId: null,
        updatedAt: now,
      })
      .where(eq(comboSerialRecords.allocatedChallanId, challanId));
  }

  async listComboSerials(): Promise<Array<ComboSerialRecord & { comboProductName: string; grnNumber: string; challanNumber: string | null; customerName: string | null }>> {
    const rows = await db.execute(sql`
      SELECT
        csr.*,
        p.name             AS combo_product_name,
        g.grn_number       AS grn_number,
        dc.challan_number  AS challan_number,
        c.name             AS customer_name
      FROM combo_serial_records csr
      JOIN products p          ON p.id  = csr.combo_product_id
      JOIN goods_receipt_notes g ON g.id = csr.grn_id
      LEFT JOIN delivery_challans dc ON dc.id = csr.allocated_challan_id
      LEFT JOIN customers c          ON c.id  = csr.allocated_customer_id
      ORDER BY csr.captured_at DESC
    `);
    return (rows.rows as any[]).map(r => ({
      id: r.id,
      comboProductId: r.combo_product_id,
      grnId: r.grn_id,
      grnItemId: r.grn_item_id,
      comboUnitIndex: r.combo_unit_index,
      componentName: r.component_name,
      linkedProductId: r.linked_product_id ?? null,
      serialNumber: r.serial_number,
      notes: r.notes ?? null,
      capturedAt: r.captured_at,
      capturedByUserId: r.captured_by_user_id,
      allocatedChallanId: r.allocated_challan_id ?? null,
      allocatedCustomerId: r.allocated_customer_id ?? null,
      allocatedAt: r.allocated_at ?? null,
      allocatedByUserId: r.allocated_by_user_id ?? null,
      deallocatedAt: r.deallocated_at ?? null,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      comboProductName: r.combo_product_name,
      grnNumber: r.grn_number,
      challanNumber: r.challan_number ?? null,
      customerName: r.customer_name ?? null,
    }));
  }

  async searchComboSerialByNumber(serialNumber: string): Promise<(ComboSerialRecord & {
    comboProductName: string;
    grnNumber: string;
    challanNumber: string | null;
    customerName: string | null;
  }) | null> {
    const rows = await db.execute(sql`
      SELECT
        csr.*,
        p.name         AS combo_product_name,
        g.grn_number   AS grn_number,
        dc.challan_number AS challan_number,
        c.name         AS customer_name
      FROM combo_serial_records csr
      JOIN products p          ON p.id  = csr.combo_product_id
      JOIN goods_receipt_notes g ON g.id = csr.grn_id
      LEFT JOIN delivery_challans dc ON dc.id = csr.allocated_challan_id
      LEFT JOIN customers c        ON c.id  = csr.allocated_customer_id
      WHERE csr.serial_number ILIKE ${serialNumber}
      LIMIT 1
    `);
    if (rows.rows.length === 0) return null;
    const r = rows.rows[0] as any;
    return {
      id: r.id,
      comboProductId: r.combo_product_id,
      grnId: r.grn_id,
      grnItemId: r.grn_item_id,
      comboUnitIndex: r.combo_unit_index,
      componentName: r.component_name,
      linkedProductId: r.linked_product_id ?? null,
      serialNumber: r.serial_number,
      notes: r.notes ?? null,
      capturedAt: r.captured_at,
      capturedByUserId: r.captured_by_user_id,
      allocatedChallanId: r.allocated_challan_id ?? null,
      allocatedCustomerId: r.allocated_customer_id ?? null,
      allocatedAt: r.allocated_at ?? null,
      allocatedByUserId: r.allocated_by_user_id ?? null,
      deallocatedAt: r.deallocated_at ?? null,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      comboProductName: r.combo_product_name,
      grnNumber: r.grn_number,
      challanNumber: r.challan_number ?? null,
      customerName: r.customer_name ?? null,
    };
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // Vehicle Trips Module
  // ══════════════════════════════════════════════════════════════════════════════

  // ── Vehicles ─────────────────────────────────────────────────────────────────
  async getVehicles(includeInactive = false): Promise<Vehicle[]> {
    if (includeInactive) return db.select().from(vehicles).orderBy(vehicles.name);
    return db.select().from(vehicles).where(sql`${vehicles.status} != 'inactive'`).orderBy(vehicles.name);
  }

  async getVehicle(id: string): Promise<Vehicle | undefined> {
    const [v] = await db.select().from(vehicles).where(eq(vehicles.id, id));
    return v;
  }

  async createVehicle(data: Omit<Vehicle, "id" | "createdAt" | "updatedAt">): Promise<Vehicle> {
    const [created] = await db.insert(vehicles).values({ ...data, createdAt: new Date(), updatedAt: new Date() }).returning();
    return created;
  }

  async updateVehicle(id: string, data: Partial<Omit<Vehicle, "id" | "createdAt" | "updatedAt">>): Promise<Vehicle | undefined> {
    const [updated] = await db.update(vehicles).set({ ...data, updatedAt: new Date() }).where(eq(vehicles.id, id)).returning();
    return updated;
  }

  // ── Vehicle Trips ─────────────────────────────────────────────────────────────
  async getVehicleTrips(filters?: { customerId?: string; vehicleId?: string; driverId?: string; status?: string; from?: string; to?: string }): Promise<VehicleTrip[]> {
    const conds: any[] = [];
    if (filters?.customerId) conds.push(eq(vehicleTrips.customerId, filters.customerId));
    if (filters?.vehicleId) conds.push(eq(vehicleTrips.vehicleId, filters.vehicleId));
    if (filters?.driverId) conds.push(eq(vehicleTrips.driverId, filters.driverId));
    if (filters?.status) conds.push(eq(vehicleTrips.status, filters.status));
    if (filters?.from) conds.push(gte(vehicleTrips.tripDate, filters.from));
    if (filters?.to) conds.push(lte(vehicleTrips.tripDate, filters.to));
    const query = db.select().from(vehicleTrips);
    if (conds.length) return query.where(and(...conds)).orderBy(desc(vehicleTrips.tripDate));
    return query.orderBy(desc(vehicleTrips.tripDate));
  }

  async getVehicleTrip(id: string): Promise<VehicleTrip | undefined> {
    const [t] = await db.select().from(vehicleTrips).where(eq(vehicleTrips.id, id));
    return t;
  }

  async createVehicleTrip(data: Omit<VehicleTrip, "id" | "tripNumber" | "createdAt" | "updatedAt">): Promise<VehicleTrip> {
    return db.transaction(async (tx) => {
      const { nextDocNumberInTx, getFinancialYear } = await import("./lib/doc-numbers");
      const fyStr = getFinancialYear();
      const tripNumber = await nextDocNumberInTx(tx as any, "HE-TR", fyStr);
      const [created] = await tx.insert(vehicleTrips).values({ ...data, tripNumber, createdAt: new Date(), updatedAt: new Date() }).returning();
      return created;
    });
  }

  async updateVehicleTrip(id: string, data: Partial<Omit<VehicleTrip, "id" | "createdAt" | "updatedAt">>): Promise<VehicleTrip | undefined> {
    const [updated] = await db.update(vehicleTrips).set({ ...data, updatedAt: new Date() }).where(eq(vehicleTrips.id, id)).returning();
    return updated;
  }

  async generateTripNumber(): Promise<string> {
    const { getFinancialYear } = await import("./lib/doc-numbers");
    const fyStr = getFinancialYear();
    const result = await db.execute(sql`
      SELECT COALESCE(last_seq, 0) + 1 AS next_seq
      FROM doc_number_sequences
      WHERE doc_type = 'HE-TR' AND fy_str = ${fyStr}
    `);
    const seq = Number((result.rows[0] as any)?.next_seq ?? 1);
    const month = String(new Date().getMonth() + 1).padStart(2, "0");
    return `HE-TR/${fyStr}/${month}/${String(seq).padStart(4, "0")}`;
  }

  // ── Vehicle Trip Invoices ─────────────────────────────────────────────────────
  async getVehicleTripInvoices(filters?: { customerId?: string; tripId?: string; status?: string; from?: string; to?: string }): Promise<VehicleTripInvoice[]> {
    const conds: any[] = [];
    if (filters?.customerId) conds.push(eq(vehicleTripInvoices.customerId, filters.customerId));
    if (filters?.tripId) conds.push(eq(vehicleTripInvoices.tripId, filters.tripId));
    if (filters?.status) conds.push(eq(vehicleTripInvoices.status, filters.status));
    if (filters?.from) conds.push(gte(vehicleTripInvoices.invoiceDate, filters.from));
    if (filters?.to) conds.push(lte(vehicleTripInvoices.invoiceDate, filters.to));
    const query = db.select().from(vehicleTripInvoices);
    if (conds.length) return query.where(and(...conds)).orderBy(desc(vehicleTripInvoices.invoiceDate));
    return query.orderBy(desc(vehicleTripInvoices.invoiceDate));
  }

  async getVehicleTripInvoice(id: string): Promise<VehicleTripInvoice | undefined> {
    const [inv] = await db.select().from(vehicleTripInvoices).where(eq(vehicleTripInvoices.id, id));
    return inv;
  }

  async createVehicleTripInvoice(data: Omit<VehicleTripInvoice, "id" | "invoiceNumber" | "createdAt" | "updatedAt">): Promise<VehicleTripInvoice> {
    return db.transaction(async (tx) => {
      const { nextDocNumberInTx, getFinancialYear } = await import("./lib/doc-numbers");
      const fyStr = getFinancialYear();
      const invoiceNumber = await nextDocNumberInTx(tx as any, "HE-VT", fyStr);
      const [created] = await tx.insert(vehicleTripInvoices).values({ ...data, invoiceNumber, createdAt: new Date(), updatedAt: new Date() }).returning();
      // Mark trip as invoiced
      await tx.update(vehicleTrips).set({ status: "invoiced", updatedAt: new Date() }).where(eq(vehicleTrips.id, data.tripId));
      return created;
    });
  }

  async updateVehicleTripInvoice(id: string, data: Partial<Omit<VehicleTripInvoice, "id" | "createdAt" | "updatedAt">>): Promise<VehicleTripInvoice | undefined> {
    const [updated] = await db.update(vehicleTripInvoices).set({ ...data, updatedAt: new Date() }).where(eq(vehicleTripInvoices.id, id)).returning();
    return updated;
  }

  async generateTripInvoiceNumber(): Promise<string> {
    const { getFinancialYear } = await import("./lib/doc-numbers");
    const fyStr = getFinancialYear();
    const result = await db.execute(sql`
      SELECT COALESCE(last_seq, 0) + 1 AS next_seq
      FROM doc_number_sequences
      WHERE doc_type = 'HE-VT' AND fy_str = ${fyStr}
    `);
    const seq = Number((result.rows[0] as any)?.next_seq ?? 1);
    const month = String(new Date().getMonth() + 1).padStart(2, "0");
    return `HE-VT/${fyStr}/${month}/${String(seq).padStart(4, "0")}`;
  }

  async computeTripInvoiceOutstanding(invoiceId: string): Promise<number> {
    const [inv] = await db.select().from(vehicleTripInvoices).where(eq(vehicleTripInvoices.id, invoiceId));
    if (!inv) return 0;
    const paidResult = await db.execute(sql`
      SELECT COALESCE(SUM(amount::numeric), 0) AS paid
      FROM customer_payments
      WHERE trip_invoice_id = ${invoiceId}
    `);
    const paid = Number((paidResult.rows[0] as any)?.paid ?? 0);
    const credited = Number(inv.creditedAmount ?? 0);
    return Math.max(0, Number(inv.grandTotal) - paid - credited);
  }

  // ── Vehicle Fuel Logs ─────────────────────────────────────────────────────────
  async getVehicleFuelLogs(vehicleId?: string, tripId?: string): Promise<VehicleFuelLog[]> {
    const conds: any[] = [];
    if (vehicleId) conds.push(eq(vehicleFuelLogs.vehicleId, vehicleId));
    if (tripId) conds.push(eq(vehicleFuelLogs.tripId, tripId));
    const query = db.select().from(vehicleFuelLogs);
    if (conds.length) return query.where(and(...conds)).orderBy(desc(vehicleFuelLogs.logDate));
    return query.orderBy(desc(vehicleFuelLogs.logDate));
  }

  async createVehicleFuelLog(data: Omit<VehicleFuelLog, "id" | "createdAt">): Promise<VehicleFuelLog> {
    const [created] = await db.insert(vehicleFuelLogs).values({ ...data, createdAt: new Date() }).returning();
    return created;
  }

  async updateVehicleFuelLog(id: string, data: Partial<Omit<VehicleFuelLog, "id" | "createdAt">>): Promise<VehicleFuelLog | undefined> {
    const [updated] = await db.update(vehicleFuelLogs).set(data).where(eq(vehicleFuelLogs.id, id)).returning();
    return updated;
  }

  async deleteVehicleFuelLog(id: string): Promise<boolean> {
    await db.delete(vehicleFuelLogs).where(eq(vehicleFuelLogs.id, id));
    return true;
  }

  // ── Vehicle Maintenance Logs ──────────────────────────────────────────────────
  async getVehicleMaintenanceLogs(vehicleId?: string): Promise<VehicleMaintenanceLog[]> {
    if (vehicleId) {
      return db.select().from(vehicleMaintenanceLogs)
        .where(eq(vehicleMaintenanceLogs.vehicleId, vehicleId))
        .orderBy(desc(vehicleMaintenanceLogs.serviceDate));
    }
    return db.select().from(vehicleMaintenanceLogs).orderBy(desc(vehicleMaintenanceLogs.serviceDate));
  }

  async createVehicleMaintenanceLog(data: Omit<VehicleMaintenanceLog, "id" | "createdAt" | "updatedAt">): Promise<VehicleMaintenanceLog> {
    const [created] = await db.insert(vehicleMaintenanceLogs).values({ ...data, createdAt: new Date(), updatedAt: new Date() }).returning();
    return created;
  }

  async updateVehicleMaintenanceLog(id: string, data: Partial<Omit<VehicleMaintenanceLog, "id" | "createdAt" | "updatedAt">>): Promise<VehicleMaintenanceLog | undefined> {
    const [updated] = await db.update(vehicleMaintenanceLogs).set({ ...data, updatedAt: new Date() }).where(eq(vehicleMaintenanceLogs.id, id)).returning();
    return updated;
  }

  async deleteVehicleMaintenanceLog(id: string): Promise<boolean> {
    await db.delete(vehicleMaintenanceLogs).where(eq(vehicleMaintenanceLogs.id, id));
    return true;
  }

  // ── Vehicle Expense Category Seeding ─────────────────────────────────────────
  async seedVehicleExpenseCategories(): Promise<number> {
    const VEHICLE_CATEGORIES: Array<{ name: string; color: string; icon: string }> = [
      { name: "Fuel & Petrol",            color: "#ef4444", icon: "Fuel"       },
      { name: "Driver Allowance",         color: "#f59e0b", icon: "User"       },
      { name: "Toll & Road Tax",          color: "#0ea5e9", icon: "Route"      },
      { name: "Vehicle Operating Expense",color: "#8b5cf6", icon: "Car"        },
    ];
    let inserted = 0;
    const existing = await db.select({ name: expenseCategories.name }).from(expenseCategories);
    const existingNames = new Set(existing.map(e => e.name));
    for (let i = 0; i < VEHICLE_CATEGORIES.length; i++) {
      const cat = VEHICLE_CATEGORIES[i];
      if (!existingNames.has(cat.name)) {
        await db.insert(expenseCategories).values({ ...cat, sortOrder: 100 + i, isActive: true });
        inserted++;
      }
    }
    return inserted;
  }
}

export const storage = new DatabaseStorage();
