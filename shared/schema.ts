import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, decimal, timestamp, boolean, pgEnum, uniqueIndex, index, jsonb, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const userRoleEnum = pgEnum("user_role", ["admin", "sales_manager", "warehouse_manager", "field_staff", "hr_manager", "accountant", "kiosk"]);

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
  hsnCode: text("hsn_code"),
  gstRate: decimal("gst_rate", { precision: 5, scale: 2 }).notNull().default("0"),
  needsPricingReview: boolean("needs_pricing_review").notNull().default(false),
  minMarginPct: decimal("min_margin_pct", { precision: 5, scale: 2 }).notNull().default("5.00"),
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
  subtotal: decimal("subtotal", { precision: 12, scale: 2 }).notNull().default("0"),
  totalTax: decimal("total_tax", { precision: 12, scale: 2 }).notNull().default("0"),
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
  warehouseId: varchar("warehouse_id").references(() => warehouses.id),
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
  hsnCode: text("hsn_code"),
  gstRate: decimal("gst_rate", { precision: 5, scale: 2 }).notNull().default("0"),
  taxAmount: decimal("tax_amount", { precision: 12, scale: 2 }).notNull().default("0"),
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
  advancePaid: decimal("advance_paid", { precision: 12, scale: 2 }).notNull().default("0"),
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
  isPrimary: boolean("is_primary").notNull().default(false),
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
  grnId: varchar("grn_id"),
  notes: text("notes"),
  createdBy: varchar("created_by").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [
  index("idx_stock_movements_product_id").on(t.productId),
  index("idx_stock_movements_created_at").on(t.createdAt),
  index("idx_stock_movements_grn_id").on(t.grnId),
]);

export const deliveryChallans = pgTable("delivery_challans", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  challanNumber: text("challan_number").notNull().unique(),
  orderId: varchar("order_id").notNull(),
  customerId: varchar("customer_id"),
  sourceType: text("source_type").notNull(),
  sourceId: varchar("source_id").notNull(),
  status: text("status").notNull().default("draft"),
  dispatchDate: timestamp("dispatch_date"),
  deliveryDate: timestamp("delivery_date"),
  dispatchBatchId: varchar("dispatch_batch_id"),
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
  qtyOrdered: decimal("qty_ordered", { precision: 12, scale: 2 }),
  qtyReserved: decimal("qty_reserved", { precision: 12, scale: 2 }),
  qtyToDispatch: decimal("qty_to_dispatch", { precision: 12, scale: 2 }),
  qtyDispatched: decimal("qty_dispatched", { precision: 12, scale: 2 }).default("0"),
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
  supplierChallanNumber: text("supplier_challan_number"),
  supplierChallanDate: timestamp("supplier_challan_date"),
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
}, (t) => [
  index("idx_grn_items_product_id").on(t.productId),
]);

export const supplierInvoices = pgTable("supplier_invoices", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  invoiceNumber: text("invoice_number").notNull(),
  supplierId: varchar("supplier_id").notNull(),
  purchaseOrderId: varchar("purchase_order_id"),
  grnId: varchar("grn_id"),
  invoiceDate: timestamp("invoice_date").notNull().defaultNow(),
  subtotal: decimal("subtotal", { precision: 12, scale: 2 }).notNull(),
  taxAmount: decimal("tax_amount", { precision: 12, scale: 2 }).notNull().default("0"),
  totalAmount: decimal("total_amount", { precision: 12, scale: 2 }).notNull(),
  paymentTerms: text("payment_terms").notNull().default("net_30"),
  dueDate: timestamp("due_date"),
  status: text("status").notNull().default("pending"),
  notes: text("notes"),
  createdBy: varchar("created_by").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  supplierInvoiceUnique: uniqueIndex("supplier_invoice_number_supplier_idx").on(table.supplierId, table.invoiceNumber),
}));

export const supplierPayments = pgTable("supplier_payments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  supplierInvoiceId: varchar("supplier_invoice_id"),
  purchaseOrderId: varchar("purchase_order_id"),
  supplierId: varchar("supplier_id").notNull(),
  amount: decimal("amount", { precision: 12, scale: 2 }).notNull(),
  paymentType: text("payment_type").notNull().default("regular"),
  paymentMethod: text("payment_method").notNull().default("bank_transfer"),
  paymentDate: timestamp("payment_date").notNull().defaultNow(),
  reference: text("reference"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
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

// Sales Invoices (GST-compliant, created from dispatched delivery challans)
export const salesInvoices = pgTable("sales_invoices", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  invoiceNumber: text("invoice_number").notNull().unique(),
  invoiceDate: timestamp("invoice_date").notNull().defaultNow(),
  customerId: varchar("customer_id").notNull(),
  soId: varchar("so_id"),
  challanId: varchar("challan_id").unique(),
  customerType: text("customer_type").notNull().default("B2C"),
  customerGSTIN: text("customer_gstin"),
  isInterState: boolean("is_inter_state").notNull().default(false),
  subtotal: decimal("subtotal", { precision: 12, scale: 2 }).notNull(),
  totalCgst: decimal("total_cgst", { precision: 12, scale: 2 }).notNull().default("0"),
  totalSgst: decimal("total_sgst", { precision: 12, scale: 2 }).notNull().default("0"),
  totalIgst: decimal("total_igst", { precision: 12, scale: 2 }).notNull().default("0"),
  totalTax: decimal("total_tax", { precision: 12, scale: 2 }).notNull(),
  grandTotal: decimal("grand_total", { precision: 12, scale: 2 }).notNull(),
  creditedAmount: decimal("credited_amount", { precision: 12, scale: 2 }).notNull().default("0"),
  status: text("status").notNull().default("pending"),
  dueDate: timestamp("due_date"),
  notes: text("notes"),
  createdBy: varchar("created_by"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const salesInvoiceItems = pgTable("sales_invoice_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  invoiceId: varchar("invoice_id").notNull(),
  productId: varchar("product_id"),
  description: text("description").notNull(),
  qty: decimal("qty", { precision: 12, scale: 3 }).notNull(),
  unitPrice: decimal("unit_price", { precision: 12, scale: 2 }).notNull(),
  hsnCode: text("hsn_code"),
  gstRate: decimal("gst_rate", { precision: 5, scale: 2 }).notNull().default("0"),
  taxableAmount: decimal("taxable_amount", { precision: 12, scale: 2 }).notNull(),
  cgst: decimal("cgst", { precision: 12, scale: 2 }).notNull().default("0"),
  sgst: decimal("sgst", { precision: 12, scale: 2 }).notNull().default("0"),
  igst: decimal("igst", { precision: 12, scale: 2 }).notNull().default("0"),
  taxAmount: decimal("tax_amount", { precision: 12, scale: 2 }).notNull(),
  totalAmount: decimal("total_amount", { precision: 12, scale: 2 }).notNull(),
});

export const customerPayments = pgTable("customer_payments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  invoiceId: varchar("invoice_id").notNull(),
  customerId: varchar("customer_id").notNull(),
  amount: decimal("amount", { precision: 12, scale: 2 }).notNull(),
  paymentDate: timestamp("payment_date").notNull().defaultNow(),
  method: text("method").notNull().default("bank_transfer"),
  reference: text("reference"),
  notes: text("notes"),
  createdBy: varchar("created_by"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Daily Price Sheets — one per product per day, flows through draft→submitted→confirmed/rejected
export const dailyPriceSheets = pgTable("daily_price_sheets", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  productId: varchar("product_id").notNull(),
  sheetDate: text("sheet_date").notNull(),
  status: text("status").notNull().default("draft"),
  proposedPrice: decimal("proposed_price", { precision: 12, scale: 2 }),
  blendedCost: decimal("blended_cost", { precision: 12, scale: 2 }),
  globalFloorPrice: decimal("global_floor_price", { precision: 12, scale: 2 }),
  strictFloorPrice: decimal("strict_floor_price", { precision: 12, scale: 2 }),
  overrideRequired: boolean("override_required").notNull().default(false),
  overrideReason: text("override_reason"),
  rejectionNotes: text("rejection_notes"),
  notes: text("notes"),
  createdBy: varchar("created_by").notNull(),
  confirmedBy: varchar("confirmed_by"),
  rejectedBy: varchar("rejected_by"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [uniqueIndex("daily_price_sheets_product_date_uniq").on(t.productId, t.sheetDate)]);

export const dailyPriceSheetLots = pgTable("daily_price_sheet_lots", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sheetId: varchar("sheet_id").notNull(),
  grnId: varchar("grn_id"),
  grnNumber: text("grn_number"),
  lotDate: timestamp("lot_date"),
  remainingQty: decimal("remaining_qty", { precision: 12, scale: 3 }).notNull(),
  landedCost: decimal("landed_cost", { precision: 12, scale: 2 }).notNull(),
  floorPrice: decimal("floor_price", { precision: 12, scale: 2 }).notNull(),
  proposedPrice: decimal("proposed_price", { precision: 12, scale: 2 }),
});

export const insertDailyPriceSheetSchema = createInsertSchema(dailyPriceSheets).omit({ id: true, createdAt: true });
export const insertDailyPriceSheetLotSchema = createInsertSchema(dailyPriceSheetLots).omit({ id: true });
export type DailyPriceSheet = typeof dailyPriceSheets.$inferSelect;
export type DailyPriceSheetLot = typeof dailyPriceSheetLots.$inferSelect;
export type InsertDailyPriceSheet = z.infer<typeof insertDailyPriceSheetSchema>;

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
export const insertSupplierInvoiceSchema = createInsertSchema(supplierInvoices).omit({ id: true, createdAt: true });
export const insertSupplierPaymentSchema = createInsertSchema(supplierPayments).omit({ id: true, createdAt: true });
export const insertSalesInvoiceSchema = createInsertSchema(salesInvoices).omit({ id: true, createdAt: true });
export const insertSalesInvoiceItemSchema = createInsertSchema(salesInvoiceItems).omit({ id: true });
export const insertCustomerPaymentSchema = createInsertSchema(customerPayments).omit({ id: true, createdAt: true });

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

export const attachments = pgTable("attachments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  entityType: text("entity_type").notNull(),
  entityId: varchar("entity_id").notNull(),
  module: text("module").notNull().default("inventory"),
  documentType: text("document_type").notNull().default("other"),
  fileUrl: text("file_url").notNull(),
  fileName: text("file_name").notNull(),
  fileType: text("file_type").notNull(),
  fileSize: integer("file_size").notNull(),
  fileHash: text("file_hash").notNull(),
  uploadedBy: varchar("uploaded_by").notNull(),
  isDeleted: boolean("is_deleted").notNull().default(false),
  deletedAt: timestamp("deleted_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  entityIdx: index("attachments_entity_idx").on(table.entityType, table.entityId),
}));

export const insertAttachmentSchema = createInsertSchema(attachments).omit({ id: true, createdAt: true, isDeleted: true, deletedAt: true });
export type InsertAttachment = z.infer<typeof insertAttachmentSchema>;
export type Attachment = typeof attachments.$inferSelect;

// ── Operational Expenses (Task #69) ──────────────────────────────────────────
export const expenseCategories = pgTable("expense_categories", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull().unique(),
  description: text("description"),
  color: text("color").notNull().default("#64748b"),
  icon: text("icon").notNull().default("Receipt"),
  sortOrder: integer("sort_order").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => ({
  activeIdx: index("expense_categories_active_idx").on(t.isActive, t.sortOrder),
}));

export const EXPENSE_PAYMENT_METHODS = ["cash", "upi", "card", "bank_transfer", "cheque"] as const;
export const EXPENSE_LINKED_ENTITY_TYPES = ["sales_order", "delivery_challan", "customer", "project", "purchase_order", "goods_receipt_note"] as const;

export const expenses = pgTable("expenses", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  expenseDate: date("expense_date").notNull(),
  categoryId: varchar("category_id").notNull().references(() => expenseCategories.id, { onDelete: "restrict" }),
  amount: decimal("amount", { precision: 12, scale: 2 }).notNull(),
  paymentMethod: text("payment_method").notNull(),
  description: text("description").notNull(),
  vendorName: text("vendor_name"),
  paidByUserId: varchar("paid_by_user_id").notNull().references(() => users.id),
  linkedEntityType: text("linked_entity_type"),
  linkedEntityId: varchar("linked_entity_id"),
  notes: text("notes"),
  createdByUserId: varchar("created_by_user_id").notNull().references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => ({
  dateIdx: index("expenses_date_idx").on(t.expenseDate.desc()),
  categoryIdx: index("expenses_category_idx").on(t.categoryId),
  paidByIdx: index("expenses_paid_by_idx").on(t.paidByUserId),
  paidByDateIdx: index("expenses_paid_by_date_idx").on(t.paidByUserId, t.expenseDate.desc()),
  createdByIdx: index("expenses_created_by_idx").on(t.createdByUserId),
  linkedEntityIdx: index("expenses_linked_entity_idx").on(t.linkedEntityType, t.linkedEntityId),
  createdAtIdx: index("expenses_created_at_idx").on(t.createdAt.desc()),
}));

export const insertExpenseCategorySchema = createInsertSchema(expenseCategories).omit({ id: true, createdAt: true, updatedAt: true });
export const insertExpenseSchema = createInsertSchema(expenses, {
  amount: z.union([z.string(), z.number()]).transform((v) => String(v)).refine((v) => Number(v) > 0, "Amount must be greater than zero"),
  expenseDate: z.union([z.string(), z.date()]).transform((v) => {
    const d = v instanceof Date ? v : new Date(v);
    return d.toISOString().split("T")[0];
  }),
  paymentMethod: z.enum(EXPENSE_PAYMENT_METHODS),
  linkedEntityType: z.enum(EXPENSE_LINKED_ENTITY_TYPES).nullable().optional(),
  description: z.string().min(1, "Description is required").max(500),
  vendorName: z.string().max(200).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  paidByUserId: z.string().min(1).optional(),
}).omit({ id: true, createdByUserId: true, createdAt: true, updatedAt: true });

export type ExpenseCategory = typeof expenseCategories.$inferSelect;
export type Expense = typeof expenses.$inferSelect;
export type InsertExpenseCategory = z.infer<typeof insertExpenseCategorySchema>;
export type InsertExpense = z.infer<typeof insertExpenseSchema>;

export type GoodsReceiptNote = typeof goodsReceiptNotes.$inferSelect;
export type GoodsReceiptNoteItem = typeof goodsReceiptNoteItems.$inferSelect;
export type Notification = typeof notifications.$inferSelect;
export type LeaveRequest = typeof leaveRequests.$inferSelect;
export type SupplierInvoice = typeof supplierInvoices.$inferSelect;
export type SupplierPayment = typeof supplierPayments.$inferSelect;
export type SalesInvoice = typeof salesInvoices.$inferSelect;
export type SalesInvoiceItem = typeof salesInvoiceItems.$inferSelect;
export type CustomerPayment = typeof customerPayments.$inferSelect;

// Sales Returns
export const salesReturns = pgTable("sales_returns", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  returnNumber: text("return_number").notNull().unique(),
  invoiceId: varchar("invoice_id").notNull(),
  challanId: varchar("challan_id"),
  soId: varchar("so_id"),
  customerId: varchar("customer_id").notNull(),
  warehouseId: varchar("warehouse_id"),
  status: text("status").notNull().default("draft"),
  returnType: text("return_type").notNull().default("customer_rejection"),
  reason: text("reason"),
  returnDate: timestamp("return_date").notNull().defaultNow(),
  createdBy: varchar("created_by").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const salesReturnItems = pgTable("sales_return_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  salesReturnId: varchar("sales_return_id").notNull(),
  invoiceItemId: varchar("invoice_item_id"),
  productId: varchar("product_id"),
  description: text("description").notNull(),
  qtySold: decimal("qty_sold", { precision: 12, scale: 3 }).notNull(),
  qtyAlreadyReturned: decimal("qty_already_returned", { precision: 12, scale: 3 }).notNull().default("0"),
  qtyReturned: decimal("qty_returned", { precision: 12, scale: 3 }).notNull().default("0"),
  unitPrice: decimal("unit_price", { precision: 12, scale: 2 }).notNull(),
  hsnCode: text("hsn_code"),
  gstRate: decimal("gst_rate", { precision: 5, scale: 2 }).notNull().default("0"),
  taxableAmount: decimal("taxable_amount", { precision: 12, scale: 2 }).notNull().default("0"),
  cgst: decimal("cgst", { precision: 12, scale: 2 }).notNull().default("0"),
  sgst: decimal("sgst", { precision: 12, scale: 2 }).notNull().default("0"),
  igst: decimal("igst", { precision: 12, scale: 2 }).notNull().default("0"),
  taxAmount: decimal("tax_amount", { precision: 12, scale: 2 }).notNull().default("0"),
  totalAmount: decimal("total_amount", { precision: 12, scale: 2 }).notNull().default("0"),
});

export const creditNotes = pgTable("credit_notes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  creditNoteNumber: text("credit_note_number").notNull().unique(),
  invoiceId: varchar("invoice_id").notNull(),
  salesReturnId: varchar("sales_return_id").notNull(),
  customerId: varchar("customer_id").notNull(),
  isInterState: boolean("is_inter_state").notNull().default(false),
  subtotal: decimal("subtotal", { precision: 12, scale: 2 }).notNull(),
  totalCgst: decimal("total_cgst", { precision: 12, scale: 2 }).notNull().default("0"),
  totalSgst: decimal("total_sgst", { precision: 12, scale: 2 }).notNull().default("0"),
  totalIgst: decimal("total_igst", { precision: 12, scale: 2 }).notNull().default("0"),
  taxAmount: decimal("tax_amount", { precision: 12, scale: 2 }).notNull(),
  grandTotal: decimal("grand_total", { precision: 12, scale: 2 }).notNull(),
  status: text("status").notNull().default("issued"),
  createdBy: varchar("created_by").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertSalesReturnSchema = createInsertSchema(salesReturns).omit({ id: true, createdAt: true });
export const insertSalesReturnItemSchema = createInsertSchema(salesReturnItems).omit({ id: true });
export const insertCreditNoteSchema = createInsertSchema(creditNotes).omit({ id: true, createdAt: true });

export type SalesReturn = typeof salesReturns.$inferSelect;
export type SalesReturnItem = typeof salesReturnItems.$inferSelect;
export type CreditNote = typeof creditNotes.$inferSelect;
export type InsertSalesReturn = z.infer<typeof insertSalesReturnSchema>;
export type InsertSalesReturnItem = z.infer<typeof insertSalesReturnItemSchema>;
export type InsertCreditNote = z.infer<typeof insertCreditNoteSchema>;

// ── WhatsApp CRM ──────────────────────────────────────────────────────────────

export const whatsappConversations = pgTable("whatsapp_conversations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  phoneNumber: text("phone").notNull(),
  contactName: text("contact_name"),
  customerId: varchar("customer_id"),
  leadId: varchar("lead_id"),
  status: text("status").notNull().default("open"),
  tags: text("tag"),
  assignedEmployeeId: varchar("assigned_to"),
  unreadCount: integer("unread_count").notNull().default(0),
  windowExpiresAt: timestamp("window_expires_at"),
  lastMessageAt: timestamp("last_message_at").notNull().defaultNow(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const whatsappMessages = pgTable("whatsapp_messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  conversationId: varchar("conversation_id").notNull(),
  direction: text("direction").notNull(),
  body: text("body"),
  type: text("message_type").notNull().default("text"),
  interaktMessageId: text("interakt_message_id"),
  status: text("status"),
  mediaUrl: text("media_url"),
  sentBy: varchar("sent_by"),
  isNote: boolean("is_note").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const whatsappTemplates = pgTable("whatsapp_templates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  interaktTemplateName: text("template_id").notNull(),
  category: text("category").notNull().default("custom"),
  languageCode: text("language").notNull().default("en"),
  body: text("body").notNull(),
  variables: text("variables").array().notNull().default(sql`'{}'::text[]`),
  exampleValues: text("example_values").array().notNull().default(sql`'{}'::text[]`),
  isActive: text("status").notNull().default("approved"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const whatsappTemplateStatusHistory = pgTable("whatsapp_template_status_history", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  templateId: varchar("template_id").notNull(),
  previousStatus: text("previous_status"),
  newStatus: text("new_status").notNull(),
  source: text("source").notNull().default("scheduled"),
  changedBy: varchar("changed_by"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [index("idx_wa_tmpl_status_hist_template").on(t.templateId, t.createdAt)]);

export const whatsappTemplateSyncLogs = pgTable("whatsapp_template_sync_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  attemptAt: timestamp("attempt_at").notNull().defaultNow(),
  trigger: text("trigger").notNull(),
  success: boolean("success").notNull(),
  errorMessage: text("error_message"),
  total: integer("total").notNull().default(0),
  created: integer("created").notNull().default(0),
  updated: integer("updated").notNull().default(0),
  skipped: integer("skipped").notNull().default(0),
  statusChangesCount: integer("status_changes_count").notNull().default(0),
  statusChanges: jsonb("status_changes").$type<Array<{ templateId: string; name: string; languageCode: string; previousStatus: string; newStatus: string }>>().notNull().default(sql`'[]'::jsonb`),
  triggeredByUserId: varchar("triggered_by_user_id"),
  triggeredByName: text("triggered_by_name"),
}, (t) => [index("idx_wa_template_sync_logs_attempt_at").on(t.attemptAt)]);

// ── WhatsApp Webhook Job Queue (Task #67 Phase 1) ────────────────────────────
// Inbound webhook deliveries are enqueued here and processed by a worker so
// the webhook handler can return 200 in <500ms. On retry exhaustion (5 attempts)
// jobs are moved to whatsapp_webhook_jobs_dead_letter for manual inspection.
export const whatsappWebhookJobs = pgTable("whatsapp_webhook_jobs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  jobType: text("job_type").notNull(), // "process_inbound" | "download_media"
  payload: jsonb("payload").notNull(),
  payloadHash: text("payload_hash"), // sha256 hex; used for inbound idempotency
  status: text("status").notNull().default("pending"), // pending | processing | done | failed
  attempts: integer("attempts").notNull().default(0),
  nextRunAt: timestamp("next_run_at").notNull().defaultNow(),
  lockedAt: timestamp("locked_at"),
  lastError: text("last_error"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => [
  index("idx_wa_jobs_pickup").on(t.status, t.nextRunAt),
  index("idx_wa_jobs_payload_hash").on(t.payloadHash),
]);

export const whatsappWebhookJobsDeadLetter = pgTable("whatsapp_webhook_jobs_dead_letter", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  originalJobId: varchar("original_job_id"),
  jobType: text("job_type").notNull(),
  payload: jsonb("payload").notNull(),
  lastError: text("last_error"),
  attempts: integer("attempts").notNull(),
  manualRetryAttempts: integer("manual_retry_attempts").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  deadLetteredAt: timestamp("dead_lettered_at").notNull().defaultNow(),
});

export type WhatsappWebhookJob = typeof whatsappWebhookJobs.$inferSelect;
export type WhatsappWebhookJobDeadLetter = typeof whatsappWebhookJobsDeadLetter.$inferSelect;

// ── WhatsApp Webhook Rejected Payloads (Task #67 Phase 2 — rolling 20) ───────
// Captures the last 20 rejected webhook calls so an admin can diagnose
// without log access. `Authorization`, `X-Interakt-Signature`, and any
// query param matching /token/i are redacted before storage.
export const whatsappWebhookRejectedPayloads = pgTable("whatsapp_webhook_rejected_payloads", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  reason: text("reason").notNull(), // token_mismatch | hmac_mismatch | secret_missing | parse_error | enqueue_error
  httpStatus: integer("http_status").notNull(),
  method: text("method").notNull(),
  path: text("path").notNull(),
  query: jsonb("query"), // redacted
  headers: jsonb("headers"), // redacted
  rawBody: text("raw_body"), // capped at 16KB
  rawBodyTruncated: boolean("raw_body_truncated").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [
  index("idx_wa_rejected_created").on(t.createdAt),
]);

export type WhatsappWebhookRejectedPayload = typeof whatsappWebhookRejectedPayloads.$inferSelect;

// ── Debug Payload Captures (Task #67 Phase 2 task 10a — generalised) ─────────
// A reusable primitive for capturing the first N real payloads of an event
// type whose shape we don't yet have authoritative docs for. Driven by the
// env var WHATSAPP_DEBUG_CAPTURE_TYPES (comma-separated event types). Capped
// at 5 rows per (source, eventType) pair, auto-pruned after 30 days.
// First use: capture inbound `message_received` payloads to learn whether
// Interakt sends media as URL, ID, or both. Same table will serve future
// templates / button responses / interactive messages / location etc.
export const debugPayloadCaptures = pgTable("debug_payload_captures", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  source: text("source").notNull(), // e.g. "whatsapp_webhook", "interakt_send_response"
  eventType: text("event_type").notNull(), // e.g. "message_received", "message_api_sent"
  rawPayload: jsonb("raw_payload").notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [
  index("idx_debug_capture_source_event").on(t.source, t.eventType),
  index("idx_debug_capture_created").on(t.createdAt),
]);

export type DebugPayloadCapture = typeof debugPayloadCaptures.$inferSelect;

export const insertWhatsappConversationSchema = createInsertSchema(whatsappConversations).omit({ id: true, createdAt: true, lastMessageAt: true });
export const insertWhatsappMessageSchema = createInsertSchema(whatsappMessages).omit({ id: true, createdAt: true });
export const insertWhatsappTemplateSchema = createInsertSchema(whatsappTemplates).omit({ id: true, createdAt: true });
export const insertWhatsappTemplateStatusHistorySchema = createInsertSchema(whatsappTemplateStatusHistory).omit({ id: true, createdAt: true });
export const insertWhatsappTemplateSyncLogSchema = createInsertSchema(whatsappTemplateSyncLogs).omit({ id: true, attemptAt: true });

export type WhatsappConversation = typeof whatsappConversations.$inferSelect;
export type WhatsappMessage = typeof whatsappMessages.$inferSelect;
export type WhatsappTemplate = typeof whatsappTemplates.$inferSelect;
export type WhatsappTemplateStatusHistory = typeof whatsappTemplateStatusHistory.$inferSelect;
export type WhatsappTemplateSyncLog = typeof whatsappTemplateSyncLogs.$inferSelect;
export type InsertWhatsappConversation = z.infer<typeof insertWhatsappConversationSchema>;
export type InsertWhatsappMessage = z.infer<typeof insertWhatsappMessageSchema>;
export type InsertWhatsappTemplate = z.infer<typeof insertWhatsappTemplateSchema>;
export type InsertWhatsappTemplateStatusHistory = z.infer<typeof insertWhatsappTemplateStatusHistorySchema>;
export type InsertWhatsappTemplateSyncLog = z.infer<typeof insertWhatsappTemplateSyncLogSchema>;

