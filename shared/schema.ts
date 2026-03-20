import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, decimal, timestamp, boolean, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const userRoleEnum = pgEnum("user_role", ["admin", "sales_manager", "warehouse_manager", "field_staff", "hr_manager", "accountant"]);

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  fullName: text("full_name").notNull(),
  email: text("email").notNull(),
  role: userRoleEnum("role").notNull().default("admin"),
  isActive: boolean("is_active").notNull().default(true),
});

export const customers = pgTable("customers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  email: text("email"),
  phone: text("phone"),
  address: text("address"),
  gstNumber: text("gst_number"),
  contactPerson: text("contact_person"),
});

export const suppliers = pgTable("suppliers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  email: text("email"),
  phone: text("phone"),
  address: text("address"),
  gstNumber: text("gst_number"),
  contactPerson: text("contact_person"),
  category: text("category"),
});

export const products = pgTable("products", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  sku: text("sku").notNull().unique(),
  category: text("category").notNull(),
  description: text("description"),
  unitPrice: decimal("unit_price", { precision: 12, scale: 2 }).notNull(),
  costPrice: decimal("cost_price", { precision: 12, scale: 2 }),
  brand: text("brand"),
  unit: text("unit").notNull().default("pcs"),
  minStockLevel: integer("min_stock_level").notNull().default(10),
  type: text("type").notNull().default("product"),
});

export const warehouses = pgTable("warehouses", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  location: text("location"),
  capacity: integer("capacity"),
});

export const inventoryStock = pgTable("inventory_stock", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  productId: varchar("product_id").notNull(),
  warehouseId: varchar("warehouse_id").notNull(),
  quantity: integer("quantity").notNull().default(0),
});

export const salesOrders = pgTable("sales_orders", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orderNumber: text("order_number").notNull().unique(),
  customerId: varchar("customer_id").notNull(),
  status: text("status").notNull().default("pending"),
  totalAmount: decimal("total_amount", { precision: 12, scale: 2 }).notNull().default("0"),
  orderDate: timestamp("order_date").notNull().defaultNow(),
  notes: text("notes"),
  discountType: text("discount_type"),
  discountValue: decimal("discount_value", { precision: 12, scale: 2 }),
  paymentTerms: text("payment_terms"),
  advanceAmount: decimal("advance_amount", { precision: 12, scale: 2 }),
  paidAmount: decimal("paid_amount", { precision: 12, scale: 2 }).notNull().default("0"),
  expectedDeliveryDate: timestamp("expected_delivery_date"),
  deliveryMethod: text("delivery_method"),
  deliveryCost: decimal("delivery_cost", { precision: 12, scale: 2 }),
  deliveryAddress: text("delivery_address"),
});

export const salesOrderItems = pgTable("sales_order_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orderId: varchar("order_id").notNull(),
  productId: varchar("product_id"),
  description: text("description"),
  itemType: text("item_type").notNull().default("product"),
  quantity: integer("quantity").notNull(),
  unitPrice: decimal("unit_price", { precision: 12, scale: 2 }).notNull(),
  totalPrice: decimal("total_price", { precision: 12, scale: 2 }).notNull(),
});

export const quotations = pgTable("quotations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  quoteNumber: text("quote_number").notNull().unique(),
  customerId: varchar("customer_id").notNull(),
  status: text("status").notNull().default("draft"),
  totalAmount: decimal("total_amount", { precision: 12, scale: 2 }).notNull().default("0"),
  validUntil: timestamp("valid_until"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  notes: text("notes"),
  discountType: text("discount_type"),
  discountValue: decimal("discount_value", { precision: 12, scale: 2 }),
  expectedDeliveryDate: timestamp("expected_delivery_date"),
  deliveryMethod: text("delivery_method"),
  deliveryCost: decimal("delivery_cost", { precision: 12, scale: 2 }),
  deliveryAddress: text("delivery_address"),
});

export const quotationItems = pgTable("quotation_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  quotationId: varchar("quotation_id").notNull(),
  productId: varchar("product_id"),
  description: text("description"),
  itemType: text("item_type").notNull().default("product"),
  quantity: integer("quantity").notNull(),
  unitPrice: decimal("unit_price", { precision: 12, scale: 2 }).notNull(),
  totalPrice: decimal("total_price", { precision: 12, scale: 2 }).notNull(),
});

export const projects = pgTable("projects", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  description: text("description"),
  customerId: varchar("customer_id"),
  status: text("status").notNull().default("planning"),
  priority: text("priority").notNull().default("medium"),
  startDate: timestamp("start_date"),
  endDate: timestamp("end_date"),
  budget: decimal("budget", { precision: 12, scale: 2 }),
  assignedTo: varchar("assigned_to"),
});

export const purchaseOrders = pgTable("purchase_orders", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  poNumber: text("po_number").notNull().unique(),
  supplierId: varchar("supplier_id").notNull(),
  status: text("status").notNull().default("pending"),
  deliveryType: text("delivery_type").notNull().default("warehouse"),
  totalAmount: decimal("total_amount", { precision: 12, scale: 2 }).notNull().default("0"),
  orderDate: timestamp("order_date").notNull().defaultNow(),
  expectedDelivery: timestamp("expected_delivery"),
  notes: text("notes"),
  deliveryAddress: text("delivery_address"),
  cancellationReason: text("cancellation_reason"),
  cancellationRequestedBy: varchar("cancellation_requested_by"),
  cancellationRequestedAt: timestamp("cancellation_requested_at"),
});

export const invoices = pgTable("invoices", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  invoiceNumber: text("invoice_number").notNull().unique(),
  orderId: varchar("order_id"),
  customerId: varchar("customer_id").notNull(),
  amount: decimal("amount", { precision: 12, scale: 2 }).notNull(),
  status: text("status").notNull().default("unpaid"),
  dueDate: timestamp("due_date"),
  issuedDate: timestamp("issued_date").notNull().defaultNow(),
});

export const payments = pgTable("payments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  invoiceId: varchar("invoice_id"),
  amount: decimal("amount", { precision: 12, scale: 2 }).notNull(),
  method: text("method").notNull().default("bank_transfer"),
  status: text("status").notNull().default("completed"),
  paymentDate: timestamp("payment_date").notNull().defaultNow(),
  reference: text("reference"),
});

export const employees = pgTable("employees", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id"),
  name: text("name").notNull(),
  email: text("email").notNull(),
  phone: text("phone"),
  company: text("company"),
  department: text("department").notNull(),
  designation: text("designation").notNull(),
  joinDate: timestamp("join_date").notNull().defaultNow(),
  isActive: boolean("is_active").notNull().default(true),
  salary: decimal("salary", { precision: 12, scale: 2 }),
  qrCode: text("qr_code"),
});

export const attendanceRecords = pgTable("attendance_records", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  employeeId: varchar("employee_id").notNull(),
  date: timestamp("date").notNull(),
  checkIn: timestamp("check_in"),
  checkOut: timestamp("check_out"),
  lunchOut: timestamp("lunch_out"),
  lunchIn: timestamp("lunch_in"),
  teaOut: timestamp("tea_out"),
  teaIn: timestamp("tea_in"),
  status: text("status").notNull().default("present"),
  selfieUrl: text("selfie_url"),
  location: text("location"),
});

export const fieldStaffActivities = pgTable("field_staff_activities", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  employeeId: varchar("employee_id").notNull(),
  activityType: text("activity_type").notNull(),
  description: text("description"),
  location: text("location"),
  date: timestamp("date").notNull().defaultNow(),
  status: text("status").notNull().default("completed"),
});

export const payrollStatus = pgTable("payroll_status", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  month: integer("month").notNull(),
  year: integer("year").notNull(),
  status: text("status").notNull().default("pending"),
  totalAmount: decimal("total_amount", { precision: 12, scale: 2 }),
  disbursedAt: timestamp("disbursed_at"),
});

export const travelExpenses = pgTable("travel_expenses", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  employeeId: varchar("employee_id").notNull(),
  date: timestamp("date").notNull().defaultNow(),
  originLat: decimal("origin_lat", { precision: 10, scale: 7 }).notNull(),
  originLng: decimal("origin_lng", { precision: 10, scale: 7 }).notNull(),
  destLat: decimal("dest_lat", { precision: 10, scale: 7 }).notNull(),
  destLng: decimal("dest_lng", { precision: 10, scale: 7 }).notNull(),
  originAddress: text("origin_address"),
  destAddress: text("dest_address"),
  distance: decimal("distance", { precision: 8, scale: 2 }).notNull(),
  transportMode: text("transport_mode").notNull(),
  travelCost: decimal("travel_cost", { precision: 10, scale: 2 }).notNull(),
  lunchMoney: decimal("lunch_money", { precision: 10, scale: 2 }).notNull().default("200"),
  totalAmount: decimal("total_amount", { precision: 10, scale: 2 }).notNull(),
  status: text("status").notNull().default("pending"),
  notes: text("notes"),
  rejectionReason: text("rejection_reason"),
  approvedAt: timestamp("approved_at"),
  disbursedAt: timestamp("disbursed_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const trips = pgTable("trips", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  employeeId: varchar("employee_id").notNull(),
  startTime: timestamp("start_time").notNull().defaultNow(),
  endTime: timestamp("end_time"),
  startLat: decimal("start_lat", { precision: 10, scale: 7 }),
  startLng: decimal("start_lng", { precision: 10, scale: 7 }),
  startAddress: text("start_address"),
  endLat: decimal("end_lat", { precision: 10, scale: 7 }),
  endLng: decimal("end_lng", { precision: 10, scale: 7 }),
  endAddress: text("end_address"),
  status: text("status").notNull().default("active"),
  date: timestamp("date").notNull().defaultNow(),
});

export const locationLogs = pgTable("location_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  employeeId: varchar("employee_id").notNull(),
  tripId: varchar("trip_id"),
  lat: decimal("lat", { precision: 10, scale: 7 }).notNull(),
  lng: decimal("lng", { precision: 10, scale: 7 }).notNull(),
  timestamp: timestamp("timestamp").notNull().defaultNow(),
  tripActive: boolean("trip_active").notNull().default(true),
});

export const leads = pgTable("leads", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  email: text("email"),
  phone: text("phone"),
  company: text("company"),
  address: text("address"),
  gstNumber: text("gst_number"),
  requirement: text("requirement"),
  source: text("source").notNull().default("call"),
  status: text("status").notNull().default("new"),
  assignedTo: varchar("assigned_to"),
  estimatedValue: decimal("estimated_value", { precision: 12, scale: 2 }),
  quotationId: varchar("quotation_id"),
  notes: text("notes"),
  lossReason: text("loss_reason"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const leadActivities = pgTable("lead_activities", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  leadId: varchar("lead_id").notNull(),
  activityType: text("activity_type").notNull(),
  notes: text("notes"),
  createdBy: varchar("created_by").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const leadFollowups = pgTable("lead_followups", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  leadId: varchar("lead_id").notNull(),
  title: text("title").notNull(),
  dueDate: timestamp("due_date").notNull(),
  priority: text("priority").notNull().default("medium"),
  status: text("status").notNull().default("pending"),
  completedAt: timestamp("completed_at"),
  createdBy: varchar("created_by").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const quotationActivities = pgTable("quotation_activities", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  quotationId: varchar("quotation_id").notNull(),
  activityType: text("activity_type").notNull(),
  notes: text("notes"),
  createdBy: varchar("created_by").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const quotationFollowups = pgTable("quotation_followups", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  quotationId: varchar("quotation_id").notNull(),
  title: text("title").notNull(),
  dueDate: timestamp("due_date").notNull(),
  priority: text("priority").notNull().default("medium"),
  status: text("status").notNull().default("pending"),
  completedAt: timestamp("completed_at"),
  createdBy: varchar("created_by").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const supplierProducts = pgTable("supplier_products", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  supplierId: varchar("supplier_id").notNull(),
  productId: varchar("product_id").notNull(),
  supplierPrice: decimal("supplier_price", { precision: 12, scale: 2 }).notNull(),
  supplierSku: text("supplier_sku"),
  leadTimeDays: integer("lead_time_days"),
  isPreferred: boolean("is_preferred").notNull().default(false),
  notes: text("notes"),
});

export const purchaseOrderItems = pgTable("purchase_order_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  purchaseOrderId: varchar("purchase_order_id").notNull(),
  productId: varchar("product_id"),
  description: text("description"),
  quantity: integer("quantity").notNull(),
  unitCost: decimal("unit_cost", { precision: 12, scale: 2 }).notNull(),
  totalCost: decimal("total_cost", { precision: 12, scale: 2 }).notNull(),
});

export const stockMovements = pgTable("stock_movements", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  productId: varchar("product_id").notNull(),
  warehouseId: varchar("warehouse_id"),
  movementType: text("movement_type").notNull(),
  quantity: integer("quantity").notNull(),
  referenceType: text("reference_type"),
  referenceId: varchar("reference_id"),
  notes: text("notes"),
  createdBy: varchar("created_by").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const deliveryChallans = pgTable("delivery_challans", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  challanNumber: text("challan_number").notNull().unique(),
  orderId: varchar("order_id").notNull(),
  sourceType: text("source_type").notNull(),
  sourceId: varchar("source_id").notNull(),
  status: text("status").notNull().default("draft"),
  dispatchDate: timestamp("dispatch_date"),
  deliveryDate: timestamp("delivery_date"),
  vehicleNumber: text("vehicle_number"),
  driverName: text("driver_name"),
  notes: text("notes"),
  deliveryAddress: text("delivery_address"),
  createdBy: varchar("created_by").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const deliveryChallanItems = pgTable("delivery_challan_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  challanId: varchar("challan_id").notNull(),
  productId: varchar("product_id").notNull(),
  description: text("description"),
  quantity: integer("quantity").notNull(),
  unitPrice: decimal("unit_price", { precision: 12, scale: 2 }),
});

export const purchaseRequests = pgTable("purchase_requests", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  requestNumber: text("request_number").notNull().unique(),
  salesOrderId: varchar("sales_order_id"),
  supplierId: varchar("supplier_id"),
  status: text("status").notNull().default("pending"),
  priority: text("priority").notNull().default("medium"),
  notes: text("notes"),
  purchaseOrderId: varchar("purchase_order_id"),
  createdBy: varchar("created_by").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const purchaseRequestItems = pgTable("purchase_request_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  requestId: varchar("request_id").notNull(),
  productId: varchar("product_id").notNull(),
  description: text("description"),
  requiredQuantity: integer("required_quantity").notNull(),
  availableStock: integer("available_stock").notNull().default(0),
  shortfallQuantity: integer("shortfall_quantity").notNull(),
  unitCost: decimal("unit_cost", { precision: 12, scale: 2 }),
  notes: text("notes"),
});

export const goodsReceiptNotes = pgTable("goods_receipt_notes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  grnNumber: text("grn_number").notNull().unique(),
  purchaseOrderId: varchar("purchase_order_id").notNull(),
  warehouseId: varchar("warehouse_id").notNull(),
  status: text("status").notNull().default("draft"),
  deliveryCost: decimal("delivery_cost", { precision: 12, scale: 2 }),
  totalAmount: decimal("total_amount", { precision: 12, scale: 2 }).notNull().default("0"),
  receivedDate: timestamp("received_date").notNull().defaultNow(),
  notes: text("notes"),
  createdBy: varchar("created_by").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const goodsReceiptNoteItems = pgTable("goods_receipt_note_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  grnId: varchar("grn_id").notNull(),
  productId: varchar("product_id").notNull(),
  description: text("description"),
  orderedQuantity: integer("ordered_quantity").notNull(),
  receivedQuantity: integer("received_quantity").notNull(),
  buyingPrice: decimal("buying_price", { precision: 12, scale: 2 }).notNull(),
  totalCost: decimal("total_cost", { precision: 12, scale: 2 }),
});

export const auditLogs = pgTable("audit_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  action: text("action").notNull(),
  module: text("module").notNull(),
  details: text("details"),
  timestamp: timestamp("timestamp").notNull().defaultNow(),
  ipAddress: text("ip_address"),
});

export const notifications = pgTable("notifications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  type: text("type").notNull(),
  title: text("title").notNull(),
  message: text("message").notNull(),
  isRead: boolean("is_read").notNull().default(false),
  relatedId: varchar("related_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const leaveRequests = pgTable("leave_requests", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  employeeId: varchar("employee_id").notNull(),
  type: text("type").notNull(),
  startDate: timestamp("start_date").notNull(),
  endDate: timestamp("end_date").notNull(),
  reason: text("reason"),
  status: text("status").notNull().default("pending"),
  reviewedBy: varchar("reviewed_by"),
  reviewNote: text("review_note"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertUserSchema = createInsertSchema(users).omit({ id: true });
export const loginSchema = z.object({ username: z.string().min(1), password: z.string().min(1) });
export const insertCustomerSchema = createInsertSchema(customers).omit({ id: true });
export const insertSupplierSchema = createInsertSchema(suppliers).omit({ id: true });
export const insertProductSchema = createInsertSchema(products).omit({ id: true });
export const insertWarehouseSchema = createInsertSchema(warehouses).omit({ id: true });
export const insertInventoryStockSchema = createInsertSchema(inventoryStock).omit({ id: true });
export const insertSalesOrderSchema = createInsertSchema(salesOrders).omit({ id: true });
export const insertSalesOrderItemSchema = createInsertSchema(salesOrderItems).omit({ id: true });
export const insertQuotationSchema = createInsertSchema(quotations).omit({ id: true });
export const insertQuotationItemSchema = createInsertSchema(quotationItems).omit({ id: true });
export const insertProjectSchema = createInsertSchema(projects).omit({ id: true });
export const insertPurchaseOrderSchema = createInsertSchema(purchaseOrders).omit({ id: true });
export const insertInvoiceSchema = createInsertSchema(invoices).omit({ id: true });
export const insertPaymentSchema = createInsertSchema(payments).omit({ id: true });
export const insertEmployeeSchema = createInsertSchema(employees).omit({ id: true });
export const insertAttendanceSchema = createInsertSchema(attendanceRecords).omit({ id: true });
export const insertFieldStaffActivitySchema = createInsertSchema(fieldStaffActivities).omit({ id: true });
export const insertPayrollStatusSchema = createInsertSchema(payrollStatus).omit({ id: true });
export const insertTravelExpenseSchema = createInsertSchema(travelExpenses).omit({ id: true });
export const insertTripSchema = createInsertSchema(trips).omit({ id: true });
export const insertLocationLogSchema = createInsertSchema(locationLogs).omit({ id: true });
export const insertLeadSchema = createInsertSchema(leads).omit({ id: true });
export const insertLeadActivitySchema = createInsertSchema(leadActivities).omit({ id: true, createdAt: true });
export const insertLeadFollowupSchema = createInsertSchema(leadFollowups).omit({ id: true, createdAt: true });
export const insertQuotationActivitySchema = createInsertSchema(quotationActivities).omit({ id: true, createdAt: true });
export const insertQuotationFollowupSchema = createInsertSchema(quotationFollowups).omit({ id: true, createdAt: true });
export const insertSupplierProductSchema = createInsertSchema(supplierProducts).omit({ id: true });
export const insertPurchaseOrderItemSchema = createInsertSchema(purchaseOrderItems).omit({ id: true });
export const insertStockMovementSchema = createInsertSchema(stockMovements).omit({ id: true, createdAt: true });
export const insertDeliveryChallanSchema = createInsertSchema(deliveryChallans).omit({ id: true, createdAt: true });
export const insertDeliveryChallanItemSchema = createInsertSchema(deliveryChallanItems).omit({ id: true });
export const insertPurchaseRequestSchema = createInsertSchema(purchaseRequests).omit({ id: true, createdAt: true });
export const insertPurchaseRequestItemSchema = createInsertSchema(purchaseRequestItems).omit({ id: true });
export const insertGoodsReceiptNoteSchema = createInsertSchema(goodsReceiptNotes).omit({ id: true, createdAt: true });
export const insertGoodsReceiptNoteItemSchema = createInsertSchema(goodsReceiptNoteItems).omit({ id: true });
export const insertAuditLogSchema = createInsertSchema(auditLogs).omit({ id: true });
export const insertNotificationSchema = createInsertSchema(notifications).omit({ id: true });
export const insertLeaveRequestSchema = createInsertSchema(leaveRequests).omit({ id: true, createdAt: true });

export type InsertUser = z.infer<typeof insertUserSchema>;
export type InsertLead = z.infer<typeof insertLeadSchema>;
export type User = typeof users.$inferSelect;
export type Customer = typeof customers.$inferSelect;
export type Supplier = typeof suppliers.$inferSelect;
export type Product = typeof products.$inferSelect;
export type Warehouse = typeof warehouses.$inferSelect;
export type InventoryStock = typeof inventoryStock.$inferSelect;
export type SalesOrder = typeof salesOrders.$inferSelect;
export type SalesOrderItem = typeof salesOrderItems.$inferSelect;
export type Quotation = typeof quotations.$inferSelect;
export type QuotationItem = typeof quotationItems.$inferSelect;
export type Project = typeof projects.$inferSelect;
export type PurchaseOrder = typeof purchaseOrders.$inferSelect;
export type Invoice = typeof invoices.$inferSelect;
export type Payment = typeof payments.$inferSelect;
export type Employee = typeof employees.$inferSelect;
export type AttendanceRecord = typeof attendanceRecords.$inferSelect;
export type FieldStaffActivity = typeof fieldStaffActivities.$inferSelect;
export type PayrollStatus = typeof payrollStatus.$inferSelect;
export type TravelExpense = typeof travelExpenses.$inferSelect;
export type Trip = typeof trips.$inferSelect;
export type LocationLog = typeof locationLogs.$inferSelect;
export type AuditLog = typeof auditLogs.$inferSelect;
export type Lead = typeof leads.$inferSelect;
export type LeadActivity = typeof leadActivities.$inferSelect;
export type LeadFollowup = typeof leadFollowups.$inferSelect;
export type QuotationActivity = typeof quotationActivities.$inferSelect;
export type QuotationFollowup = typeof quotationFollowups.$inferSelect;
export type SupplierProduct = typeof supplierProducts.$inferSelect;
export type PurchaseOrderItem = typeof purchaseOrderItems.$inferSelect;
export type StockMovement = typeof stockMovements.$inferSelect;
export type DeliveryChallan = typeof deliveryChallans.$inferSelect;
export type DeliveryChallanItem = typeof deliveryChallanItems.$inferSelect;
export type PurchaseRequest = typeof purchaseRequests.$inferSelect;
export type PurchaseRequestItem = typeof purchaseRequestItems.$inferSelect;
export type GoodsReceiptNote = typeof goodsReceiptNotes.$inferSelect;
export type GoodsReceiptNoteItem = typeof goodsReceiptNoteItems.$inferSelect;
export type Notification = typeof notifications.$inferSelect;
export type LeaveRequest = typeof leaveRequests.$inferSelect;
