import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { storage, IStorage } from "./storage";
import { db } from "./db";
import { sql } from "drizzle-orm";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import QRCode from "qrcode";
import {
  loginSchema, insertCustomerSchema, insertSupplierSchema, insertProductSchema,
  insertWarehouseSchema, insertSalesOrderSchema, insertSalesOrderItemSchema, insertQuotationSchema,
  insertQuotationItemSchema, insertProjectSchema, insertPurchaseOrderSchema, insertInvoiceSchema,
  insertPaymentSchema, insertEmployeeSchema, insertAttendanceSchema,
  insertFieldStaffActivitySchema, insertUserSchema, insertLeadSchema,
  insertLeadActivitySchema, insertLeadFollowupSchema, insertQuotationActivitySchema, insertQuotationFollowupSchema,
  insertSupplierProductSchema, insertPurchaseOrderItemSchema,
  insertStockMovementSchema, insertDeliveryChallanSchema, insertDeliveryChallanItemSchema,
  insertPurchaseRequestSchema, insertPurchaseRequestItemSchema,
  insertGoodsReceiptNoteSchema, insertGoodsReceiptNoteItemSchema,
  inventoryStock, deliveryChallans as deliveryChallansTable, purchaseRequests as purchaseRequestsTable,
} from "@shared/schema";
import { registerObjectStorageRoutes } from "./replit_integrations/object_storage";

const JWT_SECRET = process.env.SESSION_SECRET || "nexerp-secret-key-change-in-production";

function authenticateToken(req: any, res: any, next: any) {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];
  if (!token) return res.status(401).json({ message: "Authentication required" });

  jwt.verify(token, JWT_SECRET, (err: any, user: any) => {
    if (err) return res.status(403).json({ message: "Invalid or expired token" });
    req.user = user;
    next();
  });
}

function requireRole(...roles: string[]) {
  return (req: any, res: any, next: any) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ message: "Access denied. Insufficient permissions." });
    }
    next();
  };
}

async function logAction(userId: string, action: string, module: string, details?: string) {
  try {
    await storage.createAuditLog({ userId, action, module, details });
  } catch (e) {
    console.error("Audit log error:", e);
  }
}

async function notifyEmployee(employeeId: string, type: string, title: string, message: string, relatedId?: string) {
  try {
    const employees = await storage.getEmployees();
    const emp = employees.find(e => e.id === employeeId);
    if (emp?.userId) {
      await storage.createNotification({ userId: emp.userId, type, title, message, relatedId });
    }
  } catch (e) {
    console.error("Notification error:", e);
  }
}

async function calculateReservedStockForOtherOrders(excludeOrderId: string, storage: IStorage): Promise<Record<string, number>> {
  const reservedStatuses = ["confirmed", "procurement", "ready_to_ship"];
  const allOrders = await storage.getSalesOrders();
  const activeOrders = allOrders.filter(o => reservedStatuses.includes(o.status) && o.id !== excludeOrderId);

  const reserved: Record<string, number> = {};
  for (const order of activeOrders) {
    const orderItems = await storage.getSalesOrderItems(order.id);
    const productItems = orderItems.filter(it => it.itemType === "product" && it.productId);
    if (productItems.length === 0) continue;

    const challans = await storage.getDeliveryChallansByOrder(order.id);
    const challanItemsMap: Record<string, number> = {};
    for (const challan of challans) {
      if (!["dispatched", "delivered"].includes(challan.status)) continue;
      const cItems = await storage.getDeliveryChallanItems(challan.id);
      for (const ci of cItems) {
        challanItemsMap[ci.productId] = (challanItemsMap[ci.productId] || 0) + ci.quantity;
      }
    }

    for (const item of productItems) {
      const pid = item.productId!;
      const dispatched = challanItemsMap[pid] || 0;
      const res = Math.max(0, item.quantity - dispatched);
      if (res > 0) {
        reserved[pid] = (reserved[pid] || 0) + res;
      }
    }
  }
  return reserved;
}

async function checkAndCreatePurchaseRequests(orderId: string, userId: string, storage: IStorage): Promise<boolean> {
  const order = await storage.getSalesOrder(orderId);
  if (!order) return false;

  const existingPRs = await storage.getPurchaseRequestsBySalesOrder(order.id);
  const activePRs = existingPRs.filter(pr => pr.status === "pending" || pr.status === "approved");
  if (activePRs.length > 0) return true;

  const orderItems = await storage.getSalesOrderItems(order.id);
  const productItems = orderItems.filter(it => it.itemType === "product" && it.productId);
  const shortfallItems: Array<{ productId: string; description: string; required: number; available: number; shortfall: number; costPrice: string | null }> = [];

  const allStock = await storage.getInventoryStock();
  const allProds = await storage.getProducts();
  const prodMap = new Map(allProds.map(p => [p.id, p]));
  const otherReserved = await calculateReservedStockForOtherOrders(orderId, storage);

  for (const item of productItems) {
    const totalStock = allStock
      .filter(s => s.productId === item.productId)
      .reduce((sum, s) => sum + (s.quantity ?? 0), 0);
    const reservedByOthers = otherReserved[item.productId!] || 0;
    const availableStock = Math.max(0, totalStock - reservedByOthers);
    if (availableStock < item.quantity) {
      const prod = item.productId ? prodMap.get(item.productId) : null;
      shortfallItems.push({
        productId: item.productId!,
        description: item.description || prod?.name || "",
        required: item.quantity,
        available: availableStock,
        shortfall: item.quantity - availableStock,
        costPrice: prod?.costPrice || null,
      });
    }
  }

  if (shortfallItems.length > 0) {
    const year = new Date().getFullYear();
    const allPRs = await storage.getPurchaseRequests();
    const yearPRs = allPRs.filter(pr => pr.requestNumber.startsWith(`PR-${year}`));
    const maxNum = yearPRs.reduce((max, pr) => {
      const num = parseInt(pr.requestNumber.split("-").pop() || "0", 10);
      return num > max ? num : max;
    }, 0);
    const requestNumber = `PR-${year}-${String(maxNum + 1).padStart(4, "0")}`;

    const hasAdvance = Number(order.advanceAmount || 0) > 0 || Number(order.paidAmount || 0) > 0;
    const pr = await storage.createPurchaseRequest({
      requestNumber,
      salesOrderId: order.id,
      supplierId: null,
      status: "pending",
      priority: hasAdvance ? "high" : "medium",
      notes: `Auto-generated from confirmed order ${order.orderNumber}. ${shortfallItems.length} product(s) have insufficient stock.`,
      purchaseOrderId: null,
      createdBy: userId,
    });

    for (const item of shortfallItems) {
      await storage.createPurchaseRequestItem({
        requestId: pr.id,
        productId: item.productId,
        description: item.description,
        requiredQuantity: item.required,
        availableStock: item.available,
        shortfallQuantity: item.shortfall,
        unitCost: item.costPrice,
        notes: null,
      });
    }
    return true;
  }
  return false;
}

async function checkAndAdvanceSalesOrderFromProcurement(salesOrderId: string, storage: IStorage): Promise<void> {
  const order = await storage.getSalesOrder(salesOrderId);
  if (!order || order.status !== "procurement") return;

  const allPRs = await storage.getPurchaseRequestsBySalesOrder(salesOrderId);
  const relevantPRs = allPRs.filter(pr => pr.purchaseOrderId);
  if (relevantPRs.length === 0) return;

  const allChallans = await storage.getDeliveryChallans();

  for (const pr of relevantPRs) {
    const po = await storage.getPurchaseOrder(pr.purchaseOrderId!);
    if (!po) return;

    if (po.deliveryType === "warehouse") {
      if (po.status !== "received") return;
    } else if (po.deliveryType === "direct_delivery") {
      const challanExists = allChallans.some((c: any) =>
        c.notes?.includes(po.poNumber) && c.sourceType === "supplier" && c.sourceId === po.supplierId
      );
      if (!challanExists) return;
    } else {
      return;
    }
  }

  await storage.updateSalesOrder(salesOrderId, { status: "ready_to_ship" } as any);
}

async function checkAndAdvanceSalesOrderOnChallan(orderId: string, storage: IStorage): Promise<void> {
  const order = await storage.getSalesOrder(orderId);
  if (!order) return;

  const orderItems = await storage.getSalesOrderItems(orderId);
  const productItems = orderItems.filter(it => it.itemType === "product" && it.productId);
  if (productItems.length === 0) return;

  const allChallans = await storage.getDeliveryChallans();
  const orderChallans = allChallans.filter((c: any) => c.orderId === orderId && c.status !== "cancelled");

  const dispatchedQty: Record<string, number> = {};
  const deliveredQty: Record<string, number> = {};

  for (const challan of orderChallans) {
    const challanItems = await storage.getDeliveryChallanItems(challan.id);
    for (const ci of challanItems) {
      if (!ci.productId) continue;
      if (["dispatched", "delivered"].includes(challan.status)) {
        dispatchedQty[ci.productId] = (dispatchedQty[ci.productId] || 0) + ci.quantity;
      }
      if (challan.status === "delivered") {
        deliveredQty[ci.productId] = (deliveredQty[ci.productId] || 0) + ci.quantity;
      }
    }
  }

  const allDispatched = productItems.every(it => (dispatchedQty[it.productId!] || 0) >= it.quantity);
  const allDelivered = productItems.every(it => (deliveredQty[it.productId!] || 0) >= it.quantity);

  if (allDelivered && ["dispatched", "shipped", "ready_to_ship"].includes(order.status)) {
    await storage.updateSalesOrder(orderId, { status: "delivered" } as any);
  } else if (allDispatched && order.status === "ready_to_ship") {
    await storage.updateSalesOrder(orderId, { status: "dispatched" } as any);
  }
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  // Seed admin user and demo data
  const existingAdmin = await storage.getUserByUsername("admin");
  if (!existingAdmin) {
    const hashedPassword = await bcrypt.hash("admin123", 10);
    const admin = await storage.createUser({
      username: "admin",
      password: hashedPassword,
      fullName: "Admin User",
      email: "admin@itfi.co.in",
      role: "admin",
      isActive: true,
    });
    console.log("Admin user seeded: admin / admin123");

    // Seed demo data
    try {
      const cust1 = await storage.createCustomer({ name: "Rajesh Solar Industries", email: "rajesh@solarind.com", phone: "+91-9876543210", address: "Plot 45, MIDC Andheri, Mumbai, Maharashtra 400093", gstNumber: "27AABCS1234D1ZP", contactPerson: "Rajesh Sharma" });
      const cust2 = await storage.createCustomer({ name: "GreenTech Power Solutions", email: "info@greentechpower.in", phone: "+91-9823456789", address: "Sector 18, Gurugram, Haryana 122015", gstNumber: "06AABCG5678E1ZQ", contactPerson: "Priya Gupta" });
      const cust3 = await storage.createCustomer({ name: "SunPeak Energy Pvt Ltd", email: "contact@sunpeak.co.in", phone: "+91-9834567890", address: "Anna Nagar, Chennai, Tamil Nadu 600040", gstNumber: "33AABCS9012F1ZR", contactPerson: "Suresh Kumar" });
      const cust4 = await storage.createCustomer({ name: "Bharat Electronics Hub", email: "sales@bharatelec.com", phone: "+91-9845678901", address: "Koregaon Park, Pune, Maharashtra 411001", gstNumber: "27AABCB3456G1ZS", contactPerson: "Amit Patel" });
      const cust5 = await storage.createCustomer({ name: "Vishwa Commodities Trading", email: "info@vishwacomm.in", phone: "+91-9856789012", address: "Ellis Bridge, Ahmedabad, Gujarat 380006", gstNumber: "24AABCV7890H1ZT", contactPerson: "Deepak Mehta" });

      const sup1 = await storage.createSupplier({ name: "Trina Solar Ltd", email: "orders@trinasolar.com", phone: "+91-22-45678901", address: "BKC, Mumbai, Maharashtra 400051", gstNumber: "27AABCT1234I1ZU", contactPerson: "Li Wei", category: "Solar Panels" });
      const sup2 = await storage.createSupplier({ name: "Havells India Ltd", email: "b2b@havells.com", phone: "+91-11-23456789", address: "Sector 6, Noida, UP 201301", gstNumber: "09AABCH5678J1ZV", contactPerson: "Ravi Sharma", category: "Electronics" });
      const sup3 = await storage.createSupplier({ name: "Adani Solar Energy", email: "supply@adanisolar.com", phone: "+91-79-34567890", address: "SG Highway, Ahmedabad, Gujarat 380054", gstNumber: "24AABCA9012K1ZW", contactPerson: "Nitin Joshi", category: "Solar Panels" });
      const sup4 = await storage.createSupplier({ name: "Delta Electronics India", email: "sales@deltaindia.com", phone: "+91-80-45678902", address: "Electronic City, Bangalore, Karnataka 560100", gstNumber: "29AABCD3456L1ZX", contactPerson: "Karthik Reddy", category: "Electronics" });

      const prod1 = await storage.createProduct({ name: "Monocrystalline Solar Panel 400W", sku: "SP-MONO-400", category: "Solar Panels", description: "High-efficiency monocrystalline solar panel", unitPrice: "18500", unit: "pcs", minStockLevel: 50 });
      const prod2 = await storage.createProduct({ name: "Polycrystalline Solar Panel 330W", sku: "SP-POLY-330", category: "Solar Panels", description: "Cost-effective polycrystalline panel", unitPrice: "12800", unit: "pcs", minStockLevel: 75 });
      const prod3 = await storage.createProduct({ name: "Solar Inverter 5kW", sku: "INV-5KW-01", category: "Electronics", description: "Grid-tie solar inverter 5kW capacity", unitPrice: "45000", unit: "pcs", minStockLevel: 20 });
      const prod4 = await storage.createProduct({ name: "Solar Inverter 10kW", sku: "INV-10KW-01", category: "Electronics", description: "Grid-tie solar inverter 10kW capacity", unitPrice: "85000", unit: "pcs", minStockLevel: 15 });
      const prod5 = await storage.createProduct({ name: "MC4 Connector Pair", sku: "ACC-MC4-01", category: "Accessories", description: "Waterproof MC4 solar connectors", unitPrice: "150", unit: "pcs", minStockLevel: 500 });
      const prod6 = await storage.createProduct({ name: "Solar Cable 4mm (100m)", sku: "CAB-SOL-4MM", category: "Accessories", description: "UV-resistant solar DC cable", unitPrice: "3500", unit: "box", minStockLevel: 100 });
      const prod7 = await storage.createProduct({ name: "Copper Wire 2.5mm (90m)", sku: "COM-COP-25", category: "Commodities", description: "Electrical grade copper wire", unitPrice: "8500", unit: "box", minStockLevel: 60 });
      const prod8 = await storage.createProduct({ name: "Aluminium Mounting Structure", sku: "MNT-ALU-01", category: "Accessories", description: "Rooftop mounting structure for panels", unitPrice: "4200", unit: "pcs", minStockLevel: 40 });

      const wh1 = await storage.createWarehouse({ name: "Main Warehouse - Mumbai", location: "Plot 12, MIDC Industrial Area, Andheri East, Mumbai", capacity: 5000 });
      const wh2 = await storage.createWarehouse({ name: "Distribution Center - Delhi", location: "Sector 63, Noida, Uttar Pradesh", capacity: 3000 });
      const wh3 = await storage.createWarehouse({ name: "South Hub - Chennai", location: "Ambattur Industrial Estate, Chennai", capacity: 2000 });

      await storage.createSalesOrder({ orderNumber: "SO-2026-001", customerId: cust1.id, status: "confirmed", totalAmount: "370000", orderDate: new Date("2026-02-01"), notes: "10kW rooftop installation" });
      await storage.createSalesOrder({ orderNumber: "SO-2026-002", customerId: cust2.id, status: "shipped", totalAmount: "256000", orderDate: new Date("2026-02-05"), notes: "Solar panel bulk order" });
      await storage.createSalesOrder({ orderNumber: "SO-2026-003", customerId: cust3.id, status: "pending", totalAmount: "185000", orderDate: new Date("2026-02-10"), notes: "Inverter and accessories" });
      await storage.createSalesOrder({ orderNumber: "SO-2026-004", customerId: cust4.id, status: "delivered", totalAmount: "92500", orderDate: new Date("2026-01-20"), notes: "Electronic components" });
      await storage.createSalesOrder({ orderNumber: "SO-2026-005", customerId: cust5.id, status: "confirmed", totalAmount: "425000", orderDate: new Date("2026-02-12"), notes: "Commodity supply agreement" });

      await storage.createQuotation({ quoteNumber: "QT-2026-001", customerId: cust1.id, status: "sent", totalAmount: "550000", validUntil: new Date("2026-03-15"), createdAt: new Date("2026-02-01"), notes: "Large installation project quote" });
      await storage.createQuotation({ quoteNumber: "QT-2026-002", customerId: cust3.id, status: "draft", totalAmount: "180000", validUntil: new Date("2026-03-01"), createdAt: new Date("2026-02-10"), notes: "5kW system package" });
      await storage.createQuotation({ quoteNumber: "QT-2026-003", customerId: cust5.id, status: "accepted", totalAmount: "720000", validUntil: new Date("2026-04-01"), createdAt: new Date("2026-01-25"), notes: "Annual supply contract" });

      await storage.createProject({ name: "Rajesh Solar 10kW Rooftop", description: "10kW rooftop solar installation for commercial building", customerId: cust1.id, status: "in_progress", priority: "high", startDate: new Date("2026-02-01"), endDate: new Date("2026-03-15"), budget: "450000", assignedTo: null });
      await storage.createProject({ name: "GreenTech Warehouse Solar", description: "50kW ground-mounted solar for warehouse", customerId: cust2.id, status: "planning", priority: "medium", startDate: new Date("2026-03-01"), endDate: new Date("2026-05-30"), budget: "2500000", assignedTo: null });
      await storage.createProject({ name: "SunPeak Residential Complex", description: "Solar installation for 20-unit residential complex", customerId: cust3.id, status: "in_progress", priority: "high", startDate: new Date("2026-01-15"), endDate: new Date("2026-04-30"), budget: "1800000", assignedTo: null });
      await storage.createProject({ name: "Bharat Electronics Retrofit", description: "Inverter upgrade and panel replacement", customerId: cust4.id, status: "completed", priority: "low", startDate: new Date("2025-12-01"), endDate: new Date("2026-01-30"), budget: "350000", assignedTo: null });

      await storage.createPurchaseOrder({ poNumber: "PO-2026-001", supplierId: sup1.id, status: "received", totalAmount: "925000", orderDate: new Date("2026-01-15"), expectedDelivery: new Date("2026-02-01"), notes: "50x Mono 400W panels" });
      await storage.createPurchaseOrder({ poNumber: "PO-2026-002", supplierId: sup2.id, status: "approved", totalAmount: "450000", orderDate: new Date("2026-02-05"), expectedDelivery: new Date("2026-02-20"), notes: "10x 5kW inverters" });
      await storage.createPurchaseOrder({ poNumber: "PO-2026-003", supplierId: sup3.id, status: "shipped", totalAmount: "640000", orderDate: new Date("2026-02-08"), expectedDelivery: new Date("2026-02-25"), notes: "50x Poly 330W panels" });
      await storage.createPurchaseOrder({ poNumber: "PO-2026-004", supplierId: sup4.id, status: "pending", totalAmount: "170000", orderDate: new Date("2026-02-12"), expectedDelivery: new Date("2026-03-05"), notes: "2x 10kW inverters" });

      const inv1 = await storage.createInvoice({ invoiceNumber: "INV-2026-001", customerId: cust1.id, orderId: null, amount: "370000", status: "paid", dueDate: new Date("2026-03-01"), issuedDate: new Date("2026-02-01") });
      const inv2 = await storage.createInvoice({ invoiceNumber: "INV-2026-002", customerId: cust2.id, orderId: null, amount: "256000", status: "unpaid", dueDate: new Date("2026-03-05"), issuedDate: new Date("2026-02-05") });
      const inv3 = await storage.createInvoice({ invoiceNumber: "INV-2026-003", customerId: cust3.id, orderId: null, amount: "185000", status: "unpaid", dueDate: new Date("2026-03-10"), issuedDate: new Date("2026-02-10") });
      const inv4 = await storage.createInvoice({ invoiceNumber: "INV-2026-004", customerId: cust4.id, orderId: null, amount: "92500", status: "paid", dueDate: new Date("2026-02-20"), issuedDate: new Date("2026-01-20") });
      const inv5 = await storage.createInvoice({ invoiceNumber: "INV-2026-005", customerId: cust5.id, orderId: null, amount: "425000", status: "partial", dueDate: new Date("2026-03-12"), issuedDate: new Date("2026-02-12") });

      await storage.createPayment({ invoiceId: inv1.id, amount: "370000", method: "bank_transfer", status: "completed", paymentDate: new Date("2026-02-10"), reference: "NEFT/2026/0210/001" });
      await storage.createPayment({ invoiceId: inv4.id, amount: "92500", method: "upi", status: "completed", paymentDate: new Date("2026-02-05"), reference: "UPI/2026/0205/045" });
      await storage.createPayment({ invoiceId: inv5.id, amount: "200000", method: "cheque", status: "completed", paymentDate: new Date("2026-02-13"), reference: "CHQ/467892" });

      const emp1 = await storage.createEmployee({ name: "Vikram Singh", email: "vikram@nexerp.com", phone: "+91-9812345678", department: "Sales", designation: "Sales Manager", joinDate: new Date("2024-06-15"), isActive: true, salary: "65000", userId: null, qrCode: null, company: null });
      const emp2 = await storage.createEmployee({ name: "Anita Desai", email: "anita@nexerp.com", phone: "+91-9823456789", department: "Operations", designation: "Operations Head", joinDate: new Date("2024-03-01"), isActive: true, salary: "75000", userId: null, qrCode: null, company: null });
      const emp3 = await storage.createEmployee({ name: "Mohammed Khan", email: "khan@nexerp.com", phone: "+91-9834567890", department: "Warehouse", designation: "Warehouse Manager", joinDate: new Date("2024-08-20"), isActive: true, salary: "55000", userId: null, qrCode: null, company: null });
      const emp4 = await storage.createEmployee({ name: "Priya Nair", email: "priya@nexerp.com", phone: "+91-9845678901", department: "Finance", designation: "Senior Accountant", joinDate: new Date("2024-04-10"), isActive: true, salary: "60000", userId: null, qrCode: null, company: null });
      const emp5 = await storage.createEmployee({ name: "Rahul Verma", email: "rahul@nexerp.com", phone: "+91-9856789012", department: "Sales", designation: "Field Executive", joinDate: new Date("2025-01-05"), isActive: true, salary: "35000", userId: null, qrCode: null, company: null });
      const emp6 = await storage.createEmployee({ name: "Sneha Patil", email: "sneha@nexerp.com", phone: "+91-9867890123", department: "HR", designation: "HR Manager", joinDate: new Date("2024-07-01"), isActive: true, salary: "58000", userId: null, qrCode: null, company: null });
      const emp7 = await storage.createEmployee({ name: "Arjun Reddy", email: "arjun@nexerp.com", phone: "+91-9878901234", department: "IT", designation: "Technical Lead", joinDate: new Date("2024-02-15"), isActive: true, salary: "80000", userId: null, qrCode: null, company: null });

      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 2);
      for (const emp of [emp1, emp2, emp3, emp4, emp5, emp6, emp7]) {
        await storage.createAttendanceRecord({ employeeId: emp.id, date: pastDate, checkIn: new Date(pastDate.getFullYear(), pastDate.getMonth(), pastDate.getDate(), 9, 0), checkOut: new Date(pastDate.getFullYear(), pastDate.getMonth(), pastDate.getDate(), 18, 0), lunchOut: null, lunchIn: null, teaOut: null, teaIn: null, status: "present", selfieUrl: null, location: null });
      }

      await logAction(admin.id, "seed", "system", "Demo data seeded successfully");
      console.log("Demo data seeded successfully");
    } catch (seedError) {
      console.error("Error seeding demo data:", seedError);
    }
  }

  // One-time cleanup: remove seed attendance records for today (seed used to create today's records)
  try {
    const allAttendance = await storage.getAttendance();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const seedRecordsToday = allAttendance.filter(a => {
      const aDate = new Date(a.date);
      aDate.setHours(0, 0, 0, 0);
      if (aDate.getTime() !== today.getTime()) return false;
      if (a.selfieUrl) return false;
      const checkIn = new Date(a.checkIn!);
      return checkIn.getHours() === 9 && checkIn.getMinutes() === 0;
    });
    if (seedRecordsToday.length > 0) {
      for (const rec of seedRecordsToday) {
        await storage.deleteAttendanceRecord(rec.id);
      }
      console.log(`Cleaned up ${seedRecordsToday.length} seed attendance records for today`);
    }
  } catch (cleanupError) {
    console.error("Attendance cleanup error:", cleanupError);
  }

  // ======================== AUTH ========================
  app.post("/api/auth/login", async (req, res) => {
    try {
      const parsed = loginSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid credentials" });
      }
      const { username, password } = parsed.data;
      const user = await storage.getUserByUsername(username);
      if (!user) {
        return res.status(401).json({ message: "Invalid username or password" });
      }
      if (!user.isActive) {
        return res.status(401).json({ message: "Account is deactivated" });
      }
      const valid = await bcrypt.compare(password, user.password);
      if (!valid) {
        return res.status(401).json({ message: "Invalid username or password" });
      }
      const token = jwt.sign(
        { id: user.id, username: user.username, role: user.role },
        JWT_SECRET,
        { expiresIn: "24h" }
      );

      await logAction(user.id, "login", "auth", `User ${user.username} logged in`);

      res.json({
        token,
        user: {
          id: user.id,
          username: user.username,
          fullName: user.fullName,
          email: user.email,
          role: user.role,
        },
      });
    } catch (error) {
      console.error("Login error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/auth/me", authenticateToken, async (req: any, res) => {
    const user = await storage.getUser(req.user.id);
    if (!user) return res.status(404).json({ message: "User not found" });
    const employees = await storage.getEmployees();
    const linkedEmployee = employees.find(e => e.userId === user.id);
    res.json({
      id: user.id,
      username: user.username,
      fullName: user.fullName,
      email: user.email,
      role: user.role,
      employeeId: linkedEmployee?.id || null,
    });
  });

  // ======================== DASHBOARD ========================
  app.get("/api/dashboard/stats", authenticateToken, async (req: any, res) => {
    try {
      const stats = await storage.getDashboardStats();
      res.json(stats);
    } catch (error) {
      console.error("Dashboard error:", error);
      res.status(500).json({ message: "Failed to fetch dashboard stats" });
    }
  });

  // ======================== USERS ========================
  app.get("/api/users", authenticateToken, requireRole("admin"), async (req: any, res) => {
    try {
      const data = await storage.getUsers();
      const sanitized = data.map(u => ({ ...u, password: undefined }));
      res.json(sanitized);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch users" });
    }
  });

  app.post("/api/users", authenticateToken, requireRole("admin"), async (req: any, res) => {
    try {
      const parsed = insertUserSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Validation error", errors: parsed.error.errors });
      const data = parsed.data;
      data.password = await bcrypt.hash(data.password, 10);
      const created = await storage.createUser(data);
      await logAction(req.user.id, "create", "users", `Created user ${data.username}`);
      res.status(201).json({ ...created, password: undefined });
    } catch (error: any) {
      if (error.code === "23505") return res.status(409).json({ message: "Username already exists" });
      res.status(500).json({ message: "Failed to create user" });
    }
  });

  // ======================== CUSTOMERS ========================
  app.get("/api/customers", authenticateToken, async (_req, res) => {
    try {
      const data = await storage.getCustomers();
      res.json(data);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch customers" });
    }
  });

  app.get("/api/customers/:id", authenticateToken, async (req, res) => {
    try {
      const data = await storage.getCustomer(req.params.id);
      if (!data) return res.status(404).json({ message: "Customer not found" });
      res.json(data);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch customer" });
    }
  });

  app.post("/api/customers", authenticateToken, requireRole("admin", "sales_manager"), async (req: any, res) => {
    try {
      const parsed = insertCustomerSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Validation error", errors: parsed.error.errors });
      const created = await storage.createCustomer(parsed.data as any);
      await logAction(req.user.id, "create", "customers", `Created customer ${parsed.data.name}`);
      res.status(201).json(created);
    } catch (error) {
      res.status(500).json({ message: "Failed to create customer" });
    }
  });

  app.patch("/api/customers/:id", authenticateToken, requireRole("admin", "sales_manager"), async (req: any, res) => {
    try {
      const updated = await storage.updateCustomer(req.params.id, req.body);
      if (!updated) return res.status(404).json({ message: "Customer not found" });
      await logAction(req.user.id, "update", "customers", `Updated customer ${updated.name}`);
      res.json(updated);
    } catch (error) {
      res.status(500).json({ message: "Failed to update customer" });
    }
  });

  app.delete("/api/customers/:id", authenticateToken, requireRole("admin", "sales_manager"), async (req: any, res) => {
    try {
      await storage.deleteCustomer(req.params.id);
      await logAction(req.user.id, "delete", "customers", `Deleted customer ${req.params.id}`);
      res.json({ message: "Customer deleted" });
    } catch (error) {
      res.status(500).json({ message: "Failed to delete customer" });
    }
  });

  // ======================== SUPPLIERS ========================
  app.get("/api/suppliers", authenticateToken, async (_req, res) => {
    try {
      const data = await storage.getSuppliers();
      res.json(data);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch suppliers" });
    }
  });

  app.get("/api/suppliers/:id", authenticateToken, async (req, res) => {
    try {
      const data = await storage.getSupplier(req.params.id);
      if (!data) return res.status(404).json({ message: "Supplier not found" });
      res.json(data);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch supplier" });
    }
  });

  app.post("/api/suppliers", authenticateToken, async (req: any, res) => {
    try {
      const parsed = insertSupplierSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Validation error", errors: parsed.error.errors });
      const created = await storage.createSupplier(parsed.data as any);
      await logAction(req.user.id, "create", "suppliers", `Created supplier ${parsed.data.name}`);
      res.status(201).json(created);
    } catch (error) {
      res.status(500).json({ message: "Failed to create supplier" });
    }
  });

  app.patch("/api/suppliers/:id", authenticateToken, async (req: any, res) => {
    try {
      const updated = await storage.updateSupplier(req.params.id, req.body);
      if (!updated) return res.status(404).json({ message: "Supplier not found" });
      await logAction(req.user.id, "update", "suppliers", `Updated supplier ${updated.name}`);
      res.json(updated);
    } catch (error) {
      res.status(500).json({ message: "Failed to update supplier" });
    }
  });

  app.delete("/api/suppliers/:id", authenticateToken, async (req: any, res) => {
    try {
      await storage.deleteSupplier(req.params.id);
      await logAction(req.user.id, "delete", "suppliers", `Deleted supplier ${req.params.id}`);
      res.json({ message: "Supplier deleted" });
    } catch (error) {
      res.status(500).json({ message: "Failed to delete supplier" });
    }
  });

  // ======================== PRODUCTS ========================
  app.get("/api/products", authenticateToken, async (_req, res) => {
    try {
      const data = await storage.getProducts();
      res.json(data);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch products" });
    }
  });

  app.get("/api/products/last-sold-prices", authenticateToken, async (_req, res) => {
    try {
      const result = await db.execute(sql`
        SELECT DISTINCT ON (product_id) product_id, unit_price as last_price, created_at
        FROM (
          SELECT soi.product_id, soi.unit_price, so.order_date as created_at
          FROM sales_order_items soi
          JOIN sales_orders so ON soi.order_id = so.id
          WHERE soi.product_id IS NOT NULL
          UNION ALL
          SELECT qi.product_id, qi.unit_price, q.created_at
          FROM quotation_items qi
          JOIN quotations q ON qi.quotation_id = q.id
          WHERE qi.product_id IS NOT NULL
        ) combined
        ORDER BY product_id, created_at DESC
      `);
      const priceMap: Record<string, string> = {};
      for (const row of result.rows as any[]) {
        priceMap[row.product_id] = row.last_price;
      }
      res.json(priceMap);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch last sold prices" });
    }
  });

  app.get("/api/products/:id", authenticateToken, async (req, res) => {
    try {
      const data = await storage.getProduct(req.params.id);
      if (!data) return res.status(404).json({ message: "Product not found" });
      res.json(data);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch product" });
    }
  });

  app.post("/api/products", authenticateToken, async (req: any, res) => {
    try {
      const parsed = insertProductSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Validation error", errors: parsed.error.errors });
      const created = await storage.createProduct(parsed.data as any);
      await logAction(req.user.id, "create", "products", `Created product ${parsed.data.name}`);
      res.status(201).json(created);
    } catch (error: any) {
      if (error.code === "23505") return res.status(409).json({ message: "SKU already exists" });
      res.status(500).json({ message: "Failed to create product" });
    }
  });

  app.patch("/api/products/:id", authenticateToken, async (req: any, res) => {
    try {
      const updated = await storage.updateProduct(req.params.id, req.body);
      if (!updated) return res.status(404).json({ message: "Product not found" });
      await logAction(req.user.id, "update", "products", `Updated product ${updated.name}`);
      res.json(updated);
    } catch (error) {
      res.status(500).json({ message: "Failed to update product" });
    }
  });

  app.delete("/api/products/:id", authenticateToken, async (req: any, res) => {
    try {
      await storage.deleteProduct(req.params.id);
      await logAction(req.user.id, "delete", "products", `Deleted product ${req.params.id}`);
      res.json({ message: "Product deleted" });
    } catch (error) {
      res.status(500).json({ message: "Failed to delete product" });
    }
  });

  // ======================== WAREHOUSES ========================
  app.get("/api/warehouses", authenticateToken, async (_req, res) => {
    try {
      const data = await storage.getWarehouses();
      res.json(data);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch warehouses" });
    }
  });

  app.post("/api/warehouses", authenticateToken, async (req: any, res) => {
    try {
      const parsed = insertWarehouseSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Validation error", errors: parsed.error.errors });
      const created = await storage.createWarehouse(parsed.data as any);
      await logAction(req.user.id, "create", "warehouses", `Created warehouse ${parsed.data.name}`);
      res.status(201).json(created);
    } catch (error) {
      res.status(500).json({ message: "Failed to create warehouse" });
    }
  });

  app.patch("/api/warehouses/:id", authenticateToken, async (req: any, res) => {
    try {
      const updated = await storage.updateWarehouse(req.params.id, req.body);
      if (!updated) return res.status(404).json({ message: "Warehouse not found" });
      await logAction(req.user.id, "update", "warehouses", `Updated warehouse ${updated.name}`);
      res.json(updated);
    } catch (error) {
      res.status(500).json({ message: "Failed to update warehouse" });
    }
  });

  app.delete("/api/warehouses/:id", authenticateToken, async (req: any, res) => {
    try {
      await storage.deleteWarehouse(req.params.id);
      await logAction(req.user.id, "delete", "warehouses", `Deleted warehouse ${req.params.id}`);
      res.json({ message: "Warehouse deleted" });
    } catch (error) {
      res.status(500).json({ message: "Failed to delete warehouse" });
    }
  });

  // ======================== INVENTORY STOCK ========================
  app.get("/api/inventory-stock", authenticateToken, async (_req, res) => {
    try {
      const data = await storage.getInventoryStock();
      res.json(data);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch inventory stock" });
    }
  });

  app.post("/api/inventory-stock", authenticateToken, async (req: any, res) => {
    try {
      const created = await storage.createInventoryStock(req.body);
      await logAction(req.user.id, "create", "inventory", `Added stock entry`);
      res.status(201).json(created);
    } catch (error) {
      res.status(500).json({ message: "Failed to create inventory stock" });
    }
  });

  app.patch("/api/inventory-stock/:id", authenticateToken, async (req: any, res) => {
    try {
      const updated = await storage.updateInventoryStock(req.params.id, req.body);
      if (!updated) return res.status(404).json({ message: "Stock entry not found" });
      await logAction(req.user.id, "update", "inventory", `Updated stock entry`);
      res.json(updated);
    } catch (error) {
      res.status(500).json({ message: "Failed to update inventory stock" });
    }
  });

  // ======================== SALES ORDERS ========================
  app.get("/api/sales-orders", authenticateToken, async (_req, res) => {
    try {
      const data = await storage.getSalesOrders();
      res.json(data);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch sales orders" });
    }
  });

  app.get("/api/sales-orders/:id", authenticateToken, async (req, res) => {
    try {
      const data = await storage.getSalesOrder(req.params.id);
      if (!data) return res.status(404).json({ message: "Sales order not found" });
      const items = await storage.getSalesOrderItems(req.params.id);
      res.json({ ...data, items });
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch sales order" });
    }
  });

  app.post("/api/sales-orders", authenticateToken, requireRole("admin", "sales_manager"), async (req: any, res) => {
    try {
      const body = { ...req.body };
      if (body.expectedDeliveryDate && typeof body.expectedDeliveryDate === "string") {
        body.expectedDeliveryDate = new Date(body.expectedDeliveryDate);
      }
      const parsed = insertSalesOrderSchema.safeParse(body);
      if (!parsed.success) return res.status(400).json({ message: "Validation error", errors: parsed.error.errors });
      const created = await storage.createSalesOrder(parsed.data as any);
      await logAction(req.user.id, "create", "sales", `Created sales order ${parsed.data.orderNumber}`);
      res.status(201).json(created);
    } catch (error: any) {
      if (error.code === "23505") return res.status(409).json({ message: "Order number already exists" });
      res.status(500).json({ message: "Failed to create sales order" });
    }
  });

  app.patch("/api/sales-orders/:id", authenticateToken, requireRole("admin", "sales_manager"), async (req: any, res) => {
    try {
      const body = { ...req.body };
      if (body.expectedDeliveryDate && typeof body.expectedDeliveryDate === "string") {
        body.expectedDeliveryDate = new Date(body.expectedDeliveryDate);
      }
      const previousOrder = await storage.getSalesOrder(req.params.id);
      const updated = await storage.updateSalesOrder(req.params.id, body);
      if (!updated) return res.status(404).json({ message: "Sales order not found" });
      await logAction(req.user.id, "update", "sales", `Updated sales order ${updated.orderNumber}`);

      if (req.body.status === "confirmed" && previousOrder?.status !== "confirmed") {
        try {
          const hadShortfall = await checkAndCreatePurchaseRequests(updated.id, req.user.id, storage);
          const nextStatus = hadShortfall ? "procurement" : "ready_to_ship";
          const finalOrder = await storage.updateSalesOrder(updated.id, { status: nextStatus } as any);
          return res.json(finalOrder || updated);
        } catch (prError) {
          console.error("Failed to auto-generate purchase request:", prError);
        }
      }

      res.json(updated);
    } catch (error) {
      res.status(500).json({ message: "Failed to update sales order" });
    }
  });

  app.delete("/api/sales-orders/:id", authenticateToken, requireRole("admin", "sales_manager"), async (req: any, res) => {
    try {
      await storage.deleteSalesOrder(req.params.id);
      await logAction(req.user.id, "delete", "sales", `Deleted sales order ${req.params.id}`);
      res.json({ message: "Sales order deleted" });
    } catch (error) {
      res.status(500).json({ message: "Failed to delete sales order" });
    }
  });

  // ======================== QUOTATIONS ========================
  app.get("/api/quotations", authenticateToken, async (_req, res) => {
    try {
      const data = await storage.getQuotations();
      res.json(data);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch quotations" });
    }
  });

  app.post("/api/quotations", authenticateToken, requireRole("admin", "sales_manager"), async (req: any, res) => {
    try {
      const body = { ...req.body };
      if (body.validUntil && typeof body.validUntil === "string") {
        body.validUntil = new Date(body.validUntil);
      }
      if (body.expectedDeliveryDate && typeof body.expectedDeliveryDate === "string") {
        body.expectedDeliveryDate = new Date(body.expectedDeliveryDate);
      }
      const parsed = insertQuotationSchema.safeParse(body);
      if (!parsed.success) return res.status(400).json({ message: "Validation error", errors: parsed.error.errors });
      const created = await storage.createQuotation(parsed.data as any);
      await logAction(req.user.id, "create", "sales", `Created quotation ${parsed.data.quoteNumber}`);
      res.status(201).json(created);
    } catch (error: any) {
      if (error.code === "23505") return res.status(409).json({ message: "Quote number already exists" });
      res.status(500).json({ message: "Failed to create quotation" });
    }
  });

  app.patch("/api/quotations/:id", authenticateToken, requireRole("admin", "sales_manager"), async (req: any, res) => {
    try {
      const body = { ...req.body };
      if (body.validUntil !== undefined) {
        body.validUntil = body.validUntil ? new Date(body.validUntil) : null;
      }
      if (body.expectedDeliveryDate !== undefined) {
        body.expectedDeliveryDate = body.expectedDeliveryDate ? new Date(body.expectedDeliveryDate) : null;
      }
      const updated = await storage.updateQuotation(req.params.id, body);
      if (!updated) return res.status(404).json({ message: "Quotation not found" });
      await logAction(req.user.id, "update", "sales", `Updated quotation ${updated.quoteNumber}`);
      res.json(updated);
    } catch (error: any) {
      console.error("Failed to update quotation:", error?.message || error);
      res.status(500).json({ message: "Failed to update quotation" });
    }
  });

  app.delete("/api/quotations/:id", authenticateToken, requireRole("admin", "sales_manager"), async (req: any, res) => {
    try {
      await storage.deleteQuotation(req.params.id);
      await logAction(req.user.id, "delete", "sales", `Deleted quotation ${req.params.id}`);
      res.json({ message: "Quotation deleted" });
    } catch (error) {
      res.status(500).json({ message: "Failed to delete quotation" });
    }
  });

  // ======================== SALES ORDER ITEMS ========================
  app.get("/api/sales-orders/:id/items", authenticateToken, async (req, res) => {
    try {
      const items = await storage.getSalesOrderItems(req.params.id);
      res.json(items);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch order items" });
    }
  });

  app.post("/api/sales-orders/:id/items", authenticateToken, requireRole("admin", "sales_manager"), async (req: any, res) => {
    try {
      const items = req.body.items;
      if (!Array.isArray(items) || items.length === 0) return res.status(400).json({ message: "Items must be a non-empty array" });
      await storage.deleteSalesOrderItems(req.params.id);
      const created = [];
      for (const item of items) {
        const parsed = insertSalesOrderItemSchema.parse({ ...item, orderId: req.params.id });
        const c = await storage.createSalesOrderItem(parsed);
        created.push(c);
      }
      res.status(201).json(created);
    } catch (error: any) {
      if (error?.name === "ZodError") return res.status(400).json({ message: "Invalid item data", errors: error.errors });
      res.status(500).json({ message: "Failed to save order items" });
    }
  });

  // ======================== QUOTATION ITEMS ========================
  app.get("/api/quotations/:id/items", authenticateToken, async (req, res) => {
    try {
      const items = await storage.getQuotationItems(req.params.id);
      res.json(items);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch quotation items" });
    }
  });

  app.post("/api/quotations/:id/items", authenticateToken, requireRole("admin", "sales_manager"), async (req: any, res) => {
    try {
      const items = req.body.items;
      if (!Array.isArray(items) || items.length === 0) return res.status(400).json({ message: "Items must be a non-empty array" });
      await storage.deleteQuotationItems(req.params.id);
      const created = [];
      for (const item of items) {
        const parsed = insertQuotationItemSchema.parse({ ...item, quotationId: req.params.id });
        const c = await storage.createQuotationItem(parsed);
        created.push(c);
      }
      res.status(201).json(created);
    } catch (error: any) {
      if (error?.name === "ZodError") return res.status(400).json({ message: "Invalid item data", errors: error.errors });
      res.status(500).json({ message: "Failed to save quotation items" });
    }
  });

  // ======================== CONVERT QUOTATION TO ORDER ========================
  app.post("/api/quotations/:id/convert-to-order", authenticateToken, requireRole("admin", "sales_manager"), async (req: any, res) => {
    try {
      const quotation = await storage.getQuotation(req.params.id);
      if (!quotation) return res.status(404).json({ message: "Quotation not found" });
      if (quotation.status === "accepted") return res.status(400).json({ message: "Quotation already converted" });

      const orderNumber = `SO-${Date.now().toString(36).toUpperCase()}`;
      const order = await storage.createSalesOrder({
        orderNumber,
        customerId: quotation.customerId,
        status: "pending",
        totalAmount: quotation.totalAmount,
        orderDate: new Date(),
        notes: `Converted from quotation ${quotation.quoteNumber}. ${quotation.notes || ""}`.trim(),
        discountType: quotation.discountType,
        discountValue: quotation.discountValue,
        paymentTerms: null,
        advanceAmount: null,
        paidAmount: "0",
        expectedDeliveryDate: quotation.expectedDeliveryDate || null,
        deliveryMethod: (quotation as any).deliveryMethod || null,
        deliveryCost: (quotation as any).deliveryCost || null,
        deliveryAddress: (quotation as any).deliveryAddress || null,
      });

      const quotationItems = await storage.getQuotationItems(req.params.id);
      for (const qi of quotationItems) {
        await storage.createSalesOrderItem({
          orderId: order.id,
          productId: qi.productId,
          description: qi.description,
          itemType: qi.itemType,
          quantity: qi.quantity,
          unitPrice: qi.unitPrice,
          totalPrice: qi.totalPrice,
        });
      }

      await storage.updateQuotation(req.params.id, { status: "accepted" });
      await logAction(req.user.id, "create", "sales", `Converted quotation ${quotation.quoteNumber} to order ${orderNumber}`);

      res.status(201).json(order);
    } catch (error) {
      res.status(500).json({ message: "Failed to convert quotation to order" });
    }
  });

  // ======================== LEADS ========================
  app.get("/api/leads", authenticateToken, async (_req, res) => {
    try {
      const data = await storage.getLeads();
      res.json(data);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch leads" });
    }
  });

  app.get("/api/leads/:id", authenticateToken, async (req, res) => {
    try {
      const data = await storage.getLead(req.params.id);
      if (!data) return res.status(404).json({ message: "Lead not found" });
      res.json(data);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch lead" });
    }
  });

  app.post("/api/leads", authenticateToken, async (req: any, res) => {
    try {
      const parsed = insertLeadSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Validation error", errors: parsed.error.errors });
      const created = await storage.createLead(parsed.data as any);
      await logAction(req.user.id, "create", "leads", `Created lead ${parsed.data.name}`);
      res.status(201).json(created);
    } catch (error) {
      res.status(500).json({ message: "Failed to create lead" });
    }
  });

  app.patch("/api/leads/:id", authenticateToken, async (req: any, res) => {
    try {
      const updated = await storage.updateLead(req.params.id, req.body);
      if (!updated) return res.status(404).json({ message: "Lead not found" });
      await logAction(req.user.id, "update", "leads", `Updated lead ${updated.name}`);
      res.json(updated);
    } catch (error) {
      res.status(500).json({ message: "Failed to update lead" });
    }
  });

  app.delete("/api/leads/:id", authenticateToken, async (req: any, res) => {
    try {
      await storage.deleteLead(req.params.id);
      await logAction(req.user.id, "delete", "leads", `Deleted lead ${req.params.id}`);
      res.json({ message: "Lead deleted" });
    } catch (error) {
      res.status(500).json({ message: "Failed to delete lead" });
    }
  });

  app.post("/api/leads/:id/convert-to-quotation", authenticateToken, async (req: any, res) => {
    try {
      const lead = await storage.getLead(req.params.id);
      if (!lead) return res.status(404).json({ message: "Lead not found" });
      if (lead.quotationId || lead.status === "quotation_sent" || lead.status === "won") {
        return res.status(400).json({ message: "Lead already converted" });
      }

      let customer;
      if (lead.company) {
        const allCustomers = await storage.getCustomers();
        customer = allCustomers.find(c => c.name.toLowerCase() === lead.company!.toLowerCase());
        if (!customer) {
          customer = await storage.createCustomer({
            name: lead.company,
            email: lead.email || null,
            phone: lead.phone || null,
            address: lead.address || null,
            gstNumber: lead.gstNumber || null,
            contactPerson: lead.name,
          });
        }
      } else {
        customer = await storage.createCustomer({
          name: lead.name,
          email: lead.email || null,
          phone: lead.phone || null,
          address: lead.address || null,
          gstNumber: lead.gstNumber || null,
          contactPerson: lead.name,
        });
      }

      const quoteNumber = `QT-${Date.now().toString(36).toUpperCase()}`;
      const quotation = await storage.createQuotation({
        quoteNumber,
        customerId: customer.id,
        status: "draft",
        totalAmount: lead.estimatedValue || "0",
        validUntil: null,
        createdAt: new Date(),
        notes: lead.requirement || null,
        discountType: null,
        discountValue: null,
      });

      const updatedLead = await storage.updateLead(req.params.id, {
        status: "quotation_sent",
        quotationId: quotation.id,
      });

      await logAction(req.user.id, "create", "leads", `Converted lead ${lead.name} to quotation ${quoteNumber}`);

      res.status(201).json({ lead: updatedLead, quotation, customer });
    } catch (error) {
      res.status(500).json({ message: "Failed to convert lead to quotation" });
    }
  });

  // ======================== LEAD ACTIVITIES & FOLLOW-UPS ========================
  app.get("/api/leads/:id/activities", authenticateToken, async (req, res) => {
    try {
      const activities = await storage.getLeadActivities(req.params.id);
      res.json(activities);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch lead activities" });
    }
  });

  app.post("/api/leads/:id/activities", authenticateToken, async (req: any, res) => {
    try {
      const data = { ...req.body, leadId: req.params.id, createdBy: req.user.id };
      const activity = await storage.createLeadActivity(data);
      await logAction(req.user.id, "create", "leads", `Logged ${data.activityType} activity on lead`);
      res.status(201).json(activity);
    } catch (error) {
      res.status(500).json({ message: "Failed to create lead activity" });
    }
  });

  app.get("/api/leads/:id/followups", authenticateToken, async (req, res) => {
    try {
      const followups = await storage.getLeadFollowups(req.params.id);
      res.json(followups);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch lead follow-ups" });
    }
  });

  app.post("/api/leads/:id/followups", authenticateToken, async (req: any, res) => {
    try {
      const data = { ...req.body, leadId: req.params.id, createdBy: req.user.id, dueDate: new Date(req.body.dueDate) };
      const followup = await storage.createLeadFollowup(data);
      await logAction(req.user.id, "create", "leads", `Scheduled follow-up: ${data.title}`);
      res.status(201).json(followup);
    } catch (error) {
      res.status(500).json({ message: "Failed to create lead follow-up" });
    }
  });

  app.patch("/api/lead-followups/:id", authenticateToken, async (req: any, res) => {
    try {
      const body = { ...req.body };
      if (body.dueDate) body.dueDate = new Date(body.dueDate);
      const updated = await storage.updateLeadFollowup(req.params.id, body);
      if (!updated) return res.status(404).json({ message: "Follow-up not found" });
      res.json(updated);
    } catch (error) {
      res.status(500).json({ message: "Failed to update follow-up" });
    }
  });

  app.post("/api/lead-followups/:id/complete", authenticateToken, async (req: any, res) => {
    try {
      const completed = await storage.completeLeadFollowup(req.params.id);
      if (!completed) return res.status(404).json({ message: "Follow-up not found" });
      await logAction(req.user.id, "update", "leads", `Completed follow-up: ${completed.title}`);
      res.json(completed);
    } catch (error) {
      res.status(500).json({ message: "Failed to complete follow-up" });
    }
  });

  // ======================== QUOTATION ACTIVITIES & FOLLOW-UPS ========================
  app.get("/api/quotations/:id/activities", authenticateToken, async (req, res) => {
    try {
      const activities = await storage.getQuotationActivities(req.params.id);
      res.json(activities);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch quotation activities" });
    }
  });

  app.post("/api/quotations/:id/activities", authenticateToken, async (req: any, res) => {
    try {
      const data = { ...req.body, quotationId: req.params.id, createdBy: req.user.id };
      const activity = await storage.createQuotationActivity(data);
      await logAction(req.user.id, "create", "sales", `Logged ${data.activityType} activity on quotation`);
      res.status(201).json(activity);
    } catch (error) {
      res.status(500).json({ message: "Failed to create quotation activity" });
    }
  });

  app.get("/api/quotations/:id/followups", authenticateToken, async (req, res) => {
    try {
      const followups = await storage.getQuotationFollowups(req.params.id);
      res.json(followups);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch quotation follow-ups" });
    }
  });

  app.post("/api/quotations/:id/followups", authenticateToken, async (req: any, res) => {
    try {
      const data = { ...req.body, quotationId: req.params.id, createdBy: req.user.id, dueDate: new Date(req.body.dueDate) };
      const followup = await storage.createQuotationFollowup(data);
      await logAction(req.user.id, "create", "sales", `Scheduled follow-up: ${data.title}`);
      res.status(201).json(followup);
    } catch (error) {
      res.status(500).json({ message: "Failed to create quotation follow-up" });
    }
  });

  app.patch("/api/quotation-followups/:id", authenticateToken, async (req: any, res) => {
    try {
      const body = { ...req.body };
      if (body.dueDate) body.dueDate = new Date(body.dueDate);
      const updated = await storage.updateQuotationFollowup(req.params.id, body);
      if (!updated) return res.status(404).json({ message: "Follow-up not found" });
      res.json(updated);
    } catch (error) {
      res.status(500).json({ message: "Failed to update follow-up" });
    }
  });

  app.post("/api/quotation-followups/:id/complete", authenticateToken, async (req: any, res) => {
    try {
      const completed = await storage.completeQuotationFollowup(req.params.id);
      if (!completed) return res.status(404).json({ message: "Follow-up not found" });
      await logAction(req.user.id, "update", "sales", `Completed follow-up: ${completed.title}`);
      res.json(completed);
    } catch (error) {
      res.status(500).json({ message: "Failed to complete follow-up" });
    }
  });

  // ======================== COMBINED FOLLOW-UPS ========================
  app.get("/api/followups/summary", authenticateToken, async (_req, res) => {
    try {
      const summary = await storage.getFollowupsSummary();
      res.json(summary);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch follow-ups summary" });
    }
  });

  app.get("/api/followups/today", authenticateToken, async (_req, res) => {
    try {
      const all = await storage.getAllPendingFollowups();
      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
      const today = all.filter(f => {
        const d = new Date(f.dueDate);
        return d >= todayStart && d < todayEnd;
      });
      res.json(today);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch today's follow-ups" });
    }
  });

  app.get("/api/followups/overdue", authenticateToken, async (_req, res) => {
    try {
      const all = await storage.getAllPendingFollowups();
      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const overdue = all.filter(f => new Date(f.dueDate) < todayStart);
      res.json(overdue);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch overdue follow-ups" });
    }
  });

  // ======================== ORDER PAYMENTS & INVOICES ========================
  app.post("/api/sales-orders/:id/record-payment", authenticateToken, requireRole("admin", "sales_manager"), async (req: any, res) => {
    try {
      const order = await storage.getSalesOrder(req.params.id);
      if (!order) return res.status(404).json({ message: "Order not found" });

      const { amount, method, reference } = req.body;
      if (!amount || !method) return res.status(400).json({ message: "Amount and method are required" });

      const paymentAmount = parseFloat(amount);
      if (isNaN(paymentAmount) || paymentAmount <= 0) return res.status(400).json({ message: "Invalid amount" });

      const currentPaid = parseFloat(order.paidAmount || "0");
      const orderTotal = parseFloat(order.totalAmount);
      if (currentPaid + paymentAmount > orderTotal) {
        return res.status(400).json({ message: `Payment exceeds balance. Remaining: ₹${(orderTotal - currentPaid).toFixed(2)}` });
      }
      const newPaidAmount = (currentPaid + paymentAmount).toFixed(2);

      const payment = await storage.createPayment({
        invoiceId: null,
        amount: paymentAmount.toFixed(2),
        method,
        status: "completed",
        paymentDate: new Date(),
        reference: reference || `Order ${order.orderNumber}`,
      });

      const updateData: any = { paidAmount: newPaidAmount };
      const statusTransitionToConfirmed = ["pending", "awaiting_payment"].includes(order.status);
      if (statusTransitionToConfirmed) {
        updateData.status = "confirmed";
      }

      const updatedOrder = await storage.updateSalesOrder(req.params.id, updateData);

      if (statusTransitionToConfirmed) {
        try {
          const hadShortfall = await checkAndCreatePurchaseRequests(req.params.id, req.user.id, storage);
          const nextStatus = hadShortfall ? "procurement" : "ready_to_ship";
          await storage.updateSalesOrder(req.params.id, { status: nextStatus } as any);
        } catch (prError) {
          console.error("Failed to auto-generate purchase request after payment:", prError);
        }
      }

      await logAction(req.user.id, "create", "sales", `Recorded payment ₹${paymentAmount} for order ${order.orderNumber}`);

      res.status(201).json({ order: updatedOrder, payment });
    } catch (error) {
      res.status(500).json({ message: "Failed to record payment" });
    }
  });

  app.post("/api/sales-orders/:id/generate-invoice", authenticateToken, requireRole("admin", "sales_manager"), async (req: any, res) => {
    try {
      const order = await storage.getSalesOrder(req.params.id);
      if (!order) return res.status(404).json({ message: "Order not found" });

      const allInvoices = await storage.getInvoices();
      const existingInvoices = allInvoices.filter(inv => inv.orderId === order.id);
      const invoicedTotal = existingInvoices.reduce((sum, inv) => sum + parseFloat(inv.amount), 0);
      const orderTotal = parseFloat(order.totalAmount);
      const remainingAmount = orderTotal - invoicedTotal;

      if (remainingAmount <= 0) {
        return res.status(400).json({ message: "Order already fully invoiced" });
      }

      const invoiceNumber = `INV-${Date.now().toString(36).toUpperCase()}`;
      const invoice = await storage.createInvoice({
        invoiceNumber,
        orderId: order.id,
        customerId: order.customerId,
        amount: remainingAmount.toFixed(2),
        status: "unpaid",
        dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        issuedDate: new Date(),
      });

      await logAction(req.user.id, "create", "accounts", `Generated invoice ${invoiceNumber} from order ${order.orderNumber}`);

      res.status(201).json(invoice);
    } catch (error) {
      res.status(500).json({ message: "Failed to generate invoice" });
    }
  });

  // ======================== PROJECTS ========================
  app.get("/api/projects", authenticateToken, async (_req, res) => {
    try {
      const data = await storage.getProjects();
      res.json(data);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch projects" });
    }
  });

  app.get("/api/projects/:id", authenticateToken, async (req, res) => {
    try {
      const data = await storage.getProject(req.params.id);
      if (!data) return res.status(404).json({ message: "Project not found" });
      res.json(data);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch project" });
    }
  });

  app.post("/api/projects", authenticateToken, async (req: any, res) => {
    try {
      const parsed = insertProjectSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Validation error", errors: parsed.error.errors });
      const created = await storage.createProject(parsed.data as any);
      await logAction(req.user.id, "create", "projects", `Created project ${parsed.data.name}`);
      res.status(201).json(created);
    } catch (error) {
      res.status(500).json({ message: "Failed to create project" });
    }
  });

  app.patch("/api/projects/:id", authenticateToken, async (req: any, res) => {
    try {
      const updated = await storage.updateProject(req.params.id, req.body);
      if (!updated) return res.status(404).json({ message: "Project not found" });
      await logAction(req.user.id, "update", "projects", `Updated project ${updated.name}`);
      res.json(updated);
    } catch (error) {
      res.status(500).json({ message: "Failed to update project" });
    }
  });

  app.delete("/api/projects/:id", authenticateToken, async (req: any, res) => {
    try {
      await storage.deleteProject(req.params.id);
      await logAction(req.user.id, "delete", "projects", `Deleted project ${req.params.id}`);
      res.json({ message: "Project deleted" });
    } catch (error) {
      res.status(500).json({ message: "Failed to delete project" });
    }
  });

  // ======================== PURCHASE ORDERS ========================
  app.get("/api/purchase-orders", authenticateToken, async (_req, res) => {
    try {
      const data = await storage.getPurchaseOrders();
      res.json(data);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch purchase orders" });
    }
  });

  app.post("/api/purchase-orders", authenticateToken, async (req: any, res) => {
    try {
      let poNumber = req.body.poNumber;
      if (!poNumber || poNumber.trim() === "") {
        const allPOs = await storage.getPurchaseOrders();
        const year = new Date().getFullYear();
        const yearPOs = allPOs.filter((po: any) => po.poNumber?.startsWith(`PO-${year}`));
        const maxNum = yearPOs.reduce((max: number, po: any) => {
          const num = parseInt(po.poNumber.split("-").pop() || "0", 10);
          return num > max ? num : max;
        }, 0);
        poNumber = `PO-${year}-${String(maxNum + 1).padStart(4, "0")}`;
      }

      const payload = {
        ...req.body,
        poNumber,
        expectedDelivery: req.body.expectedDelivery && req.body.expectedDelivery !== "" ? new Date(req.body.expectedDelivery) : null,
      };

      const parsed = insertPurchaseOrderSchema.safeParse(payload);
      if (!parsed.success) return res.status(400).json({ message: "Validation error", errors: parsed.error.errors });
      const created = await storage.createPurchaseOrder(parsed.data as any);
      await logAction(req.user.id, "create", "supply_chain", `Created PO ${poNumber}`);
      res.status(201).json(created);
    } catch (error: any) {
      if (error.code === "23505") return res.status(409).json({ message: "PO number already exists" });
      res.status(500).json({ message: "Failed to create purchase order" });
    }
  });

  app.patch("/api/purchase-orders/:id", authenticateToken, async (req: any, res) => {
    try {
      const { lineItems, ...updateData } = req.body;
      if (updateData.expectedDelivery === "") {
        updateData.expectedDelivery = null;
      } else if (updateData.expectedDelivery) {
        updateData.expectedDelivery = new Date(updateData.expectedDelivery);
      }
      const updated = await storage.updatePurchaseOrder(req.params.id, updateData);
      if (!updated) return res.status(404).json({ message: "Purchase order not found" });
      await logAction(req.user.id, "update", "supply_chain", `Updated PO ${updated.poNumber}`);
      res.json(updated);
    } catch (error) {
      res.status(500).json({ message: "Failed to update purchase order" });
    }
  });

  app.delete("/api/purchase-orders/:id", authenticateToken, async (req: any, res) => {
    try {
      await storage.deletePurchaseOrder(req.params.id);
      await logAction(req.user.id, "delete", "supply_chain", `Deleted PO ${req.params.id}`);
      res.json({ message: "Purchase order deleted" });
    } catch (error) {
      res.status(500).json({ message: "Failed to delete purchase order" });
    }
  });

  app.post("/api/purchase-orders/:id/request-cancellation", authenticateToken, async (req: any, res) => {
    try {
      const po = await storage.getPurchaseOrder(req.params.id);
      if (!po) return res.status(404).json({ message: "Purchase order not found" });
      if (!["approved", "shipped"].includes(po.status)) {
        return res.status(400).json({ message: "Only approved or shipped POs can be cancelled" });
      }
      const { reason } = req.body;
      if (!reason || !reason.trim()) {
        return res.status(400).json({ message: "Cancellation reason is required" });
      }
      const updated = await storage.updatePurchaseOrder(po.id, {
        status: "cancellation_requested",
        cancellationReason: reason.trim(),
        cancellationRequestedBy: req.user.id,
        cancellationRequestedAt: new Date(),
      } as any);
      await logAction(req.user.id, "update", "supply_chain", `Requested cancellation for PO ${po.poNumber}: ${reason.trim()}`);
      res.json(updated);
    } catch (error) {
      res.status(500).json({ message: "Failed to request cancellation" });
    }
  });

  app.post("/api/purchase-orders/:id/approve-cancellation", authenticateToken, async (req: any, res) => {
    try {
      const po = await storage.getPurchaseOrder(req.params.id);
      if (!po) return res.status(404).json({ message: "Purchase order not found" });
      if (po.status !== "cancellation_requested") {
        return res.status(400).json({ message: "PO is not pending cancellation approval" });
      }
      const updated = await storage.updatePurchaseOrder(po.id, { status: "cancelled" } as any);
      await logAction(req.user.id, "update", "supply_chain", `Approved cancellation of PO ${po.poNumber}`);
      res.json(updated);
    } catch (error) {
      res.status(500).json({ message: "Failed to approve cancellation" });
    }
  });

  // ======================== PURCHASE ORDER ITEMS ========================
  app.get("/api/purchase-orders/:id/items", authenticateToken, async (req: any, res) => {
    try {
      const items = await storage.getPurchaseOrderItems(req.params.id);
      res.json(items);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch PO items" });
    }
  });

  app.post("/api/purchase-orders/:id/items", authenticateToken, async (req: any, res) => {
    try {
      const { items } = req.body;
      if (!Array.isArray(items)) return res.status(400).json({ message: "Items must be an array" });
      const validItems = items.filter((item: any) => item.quantity > 0 && Number(item.unitCost) > 0 && (item.productId || item.description));
      if (validItems.length === 0) return res.status(400).json({ message: "At least one valid line item is required" });
      await storage.deletePurchaseOrderItems(req.params.id);
      const created = [];
      let total = 0;
      for (const item of validItems) {
        const parsed = insertPurchaseOrderItemSchema.safeParse({
          ...item,
          purchaseOrderId: req.params.id,
          totalCost: String(Number(item.quantity) * Number(item.unitCost)),
        });
        if (!parsed.success) return res.status(400).json({ message: "Validation error", errors: parsed.error.errors });
        const c = await storage.createPurchaseOrderItem(parsed.data as any);
        created.push(c);
        total += Number(c.totalCost);
      }
      await storage.updatePurchaseOrder(req.params.id, { totalAmount: String(total) } as any);
      res.status(201).json(created);
    } catch (error) {
      res.status(500).json({ message: "Failed to save PO items" });
    }
  });

  // ======================== SUPPLIER PRODUCTS ========================
  app.get("/api/supplier-products", authenticateToken, async (_req, res) => {
    try {
      const allSuppliers = await storage.getSuppliers();
      const allMappings: any[] = [];
      for (const supplier of allSuppliers) {
        const products = await storage.getSupplierProducts(supplier.id);
        allMappings.push(...products);
      }
      res.json(allMappings);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch all supplier products" });
    }
  });

  app.get("/api/suppliers/:id/products", authenticateToken, async (req: any, res) => {
    try {
      const data = await storage.getSupplierProducts(req.params.id);
      res.json(data);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch supplier products" });
    }
  });

  app.post("/api/suppliers/:id/products", authenticateToken, async (req: any, res) => {
    try {
      const parsed = insertSupplierProductSchema.safeParse({
        ...req.body,
        supplierId: req.params.id,
      });
      if (!parsed.success) return res.status(400).json({ message: "Validation error", errors: parsed.error.errors });
      const created = await storage.createSupplierProduct(parsed.data as any);
      res.status(201).json(created);
    } catch (error) {
      res.status(500).json({ message: "Failed to add supplier product" });
    }
  });

  app.patch("/api/supplier-products/:id", authenticateToken, async (req: any, res) => {
    try {
      const allowed = ["supplierPrice", "supplierSku", "leadTimeDays", "isPreferred", "notes"];
      const filtered: Record<string, any> = {};
      for (const key of allowed) {
        if (req.body[key] !== undefined) filtered[key] = req.body[key];
      }
      const updated = await storage.updateSupplierProduct(req.params.id, filtered);
      if (!updated) return res.status(404).json({ message: "Supplier product not found" });
      res.json(updated);
    } catch (error) {
      res.status(500).json({ message: "Failed to update supplier product" });
    }
  });

  app.delete("/api/supplier-products/:id", authenticateToken, async (req: any, res) => {
    try {
      await storage.deleteSupplierProduct(req.params.id);
      res.json({ message: "Supplier product removed" });
    } catch (error) {
      res.status(500).json({ message: "Failed to delete supplier product" });
    }
  });

  app.get("/api/products/:id/suppliers", authenticateToken, async (req: any, res) => {
    try {
      const data = await storage.getProductSuppliers(req.params.id);
      res.json(data);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch product suppliers" });
    }
  });

  // ======================== INVOICES ========================
  app.get("/api/invoices", authenticateToken, async (_req, res) => {
    try {
      const data = await storage.getInvoices();
      res.json(data);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch invoices" });
    }
  });

  app.post("/api/invoices", authenticateToken, async (req: any, res) => {
    try {
      const parsed = insertInvoiceSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Validation error", errors: parsed.error.errors });
      const created = await storage.createInvoice(parsed.data as any);
      await logAction(req.user.id, "create", "accounts", `Created invoice ${parsed.data.invoiceNumber}`);
      res.status(201).json(created);
    } catch (error: any) {
      if (error.code === "23505") return res.status(409).json({ message: "Invoice number already exists" });
      res.status(500).json({ message: "Failed to create invoice" });
    }
  });

  app.patch("/api/invoices/:id", authenticateToken, async (req: any, res) => {
    try {
      const updated = await storage.updateInvoice(req.params.id, req.body);
      if (!updated) return res.status(404).json({ message: "Invoice not found" });
      await logAction(req.user.id, "update", "accounts", `Updated invoice ${updated.invoiceNumber}`);
      res.json(updated);
    } catch (error) {
      res.status(500).json({ message: "Failed to update invoice" });
    }
  });

  app.delete("/api/invoices/:id", authenticateToken, async (req: any, res) => {
    try {
      await storage.deleteInvoice(req.params.id);
      await logAction(req.user.id, "delete", "accounts", `Deleted invoice ${req.params.id}`);
      res.json({ message: "Invoice deleted" });
    } catch (error) {
      res.status(500).json({ message: "Failed to delete invoice" });
    }
  });

  // ======================== PAYMENTS ========================
  app.get("/api/payments", authenticateToken, async (_req, res) => {
    try {
      const data = await storage.getPayments();
      res.json(data);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch payments" });
    }
  });

  app.post("/api/payments", authenticateToken, async (req: any, res) => {
    try {
      const parsed = insertPaymentSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Validation error", errors: parsed.error.errors });
      const created = await storage.createPayment(parsed.data as any);
      await logAction(req.user.id, "create", "accounts", `Recorded payment of ₹${parsed.data.amount}`);
      res.status(201).json(created);
    } catch (error) {
      res.status(500).json({ message: "Failed to create payment" });
    }
  });

  app.patch("/api/payments/:id", authenticateToken, async (req: any, res) => {
    try {
      const updated = await storage.updatePayment(req.params.id, req.body);
      if (!updated) return res.status(404).json({ message: "Payment not found" });
      await logAction(req.user.id, "update", "accounts", `Updated payment ${updated.id}`);
      res.json(updated);
    } catch (error) {
      res.status(500).json({ message: "Failed to update payment" });
    }
  });

  app.delete("/api/payments/:id", authenticateToken, async (req: any, res) => {
    try {
      await storage.deletePayment(req.params.id);
      await logAction(req.user.id, "delete", "accounts", `Deleted payment ${req.params.id}`);
      res.json({ message: "Payment deleted" });
    } catch (error) {
      res.status(500).json({ message: "Failed to delete payment" });
    }
  });

  // ======================== EMPLOYEES ========================
  app.get("/api/employees", authenticateToken, async (req: any, res) => {
    try {
      const data = await storage.getEmployees();
      if (req.user.role === "field_staff") {
        const linked = data.find(e => e.userId === req.user.id);
        return res.json(linked ? [linked] : []);
      }
      res.json(data);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch employees" });
    }
  });

  app.get("/api/employees/:id", authenticateToken, async (req, res) => {
    try {
      const data = await storage.getEmployee(req.params.id);
      if (!data) return res.status(404).json({ message: "Employee not found" });
      res.json(data);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch employee" });
    }
  });

  app.post("/api/employees", authenticateToken, requireRole("admin", "hr_manager"), async (req: any, res) => {
    try {
      const { username, password, role: accountRole, ...empFields } = req.body;
      const parsed = insertEmployeeSchema.safeParse(empFields);
      if (!parsed.success) return res.status(400).json({ message: "Validation error", errors: parsed.error.errors });

      const allowedRoles = ["field_staff", "hr_manager", "sales_manager", "warehouse_manager", "accountant"];
      const hasAnyPortalField = username || password || accountRole;
      if (hasAnyPortalField && (!username || !password)) {
        return res.status(400).json({ message: "Portal access requires both username and password" });
      }
      if (accountRole && !allowedRoles.includes(accountRole)) {
        return res.status(400).json({ message: `Invalid role. Allowed roles: ${allowedRoles.join(", ")}` });
      }

      let userId: string | null = null;
      if (username && password) {
        const existingUser = await storage.getUserByUsername(username);
        if (existingUser) return res.status(409).json({ message: "Username already exists" });
        const hashedPassword = await bcrypt.hash(password, 10);
        const user = await storage.createUser({
          username,
          password: hashedPassword,
          fullName: parsed.data.name,
          email: parsed.data.email,
          role: accountRole || "field_staff",
          isActive: true,
        });
        userId = user.id;
      }

      const created = await storage.createEmployee({ ...parsed.data, userId });
      await logAction(req.user.id, "create", "employees", `Added employee ${parsed.data.name}${userId ? " with portal access" : ""}`);
      res.status(201).json(created);
    } catch (error) {
      res.status(500).json({ message: "Failed to create employee" });
    }
  });

  app.patch("/api/employees/:id", authenticateToken, async (req: any, res) => {
    try {
      const { username, password, role: accountRole, ...empFields } = req.body;
      const updated = await storage.updateEmployee(req.params.id, empFields);
      if (!updated) return res.status(404).json({ message: "Employee not found" });
      await logAction(req.user.id, "update", "employees", `Updated employee ${updated.name}`);
      res.json(updated);
    } catch (error) {
      res.status(500).json({ message: "Failed to update employee" });
    }
  });

  app.patch("/api/employees/:id/account", authenticateToken, requireRole("admin"), async (req: any, res) => {
    try {
      const emp = await storage.getEmployee(req.params.id);
      if (!emp) return res.status(404).json({ message: "Employee not found" });

      const { username, password, role: accountRole } = req.body;
      if (!username) return res.status(400).json({ message: "Username is required" });

      const allowedAccountRoles = ["field_staff", "hr_manager", "sales_manager", "warehouse_manager", "accountant"];
      if (accountRole && !allowedAccountRoles.includes(accountRole)) {
        return res.status(400).json({ message: `Invalid role. Allowed roles: ${allowedAccountRoles.join(", ")}` });
      }

      if (emp.userId) {
        const existingUser = await storage.getUserByUsername(username);
        if (existingUser && existingUser.id !== emp.userId) {
          return res.status(409).json({ message: "Username already exists" });
        }
        const updateData: any = { username };
        if (accountRole) updateData.role = accountRole;
        if (password) updateData.password = await bcrypt.hash(password, 10);
        await storage.updateUser(emp.userId, updateData);
      } else {
        const existingUser = await storage.getUserByUsername(username);
        if (existingUser) return res.status(409).json({ message: "Username already exists" });
        if (!password) return res.status(400).json({ message: "Password is required for new account" });
        const hashedPassword = await bcrypt.hash(password, 10);
        const user = await storage.createUser({
          username,
          password: hashedPassword,
          fullName: emp.name,
          email: emp.email,
          role: accountRole || "field_staff",
          isActive: true,
        });
        await storage.updateEmployee(emp.id, { userId: user.id });
      }

      const finalEmp = await storage.getEmployee(emp.id);
      await logAction(req.user.id, "update", "employees", `Updated portal access for employee ${emp.name}`);
      res.json(finalEmp);
    } catch (error) {
      res.status(500).json({ message: "Failed to update employee account" });
    }
  });

  app.delete("/api/employees/:id", authenticateToken, async (req: any, res) => {
    try {
      await storage.deleteEmployee(req.params.id);
      await logAction(req.user.id, "delete", "employees", `Deleted employee ${req.params.id}`);
      res.json({ message: "Employee deleted" });
    } catch (error) {
      res.status(500).json({ message: "Failed to delete employee" });
    }
  });

  // ======================== ATTENDANCE ========================
  app.get("/api/attendance", authenticateToken, async (req: any, res) => {
    try {
      const data = await storage.getAttendance();
      if (req.user.role === "field_staff") {
        const employees = await storage.getEmployees();
        const linked = employees.find(e => e.userId === req.user.id);
        if (!linked) return res.json([]);
        return res.json(data.filter(a => a.employeeId === linked.id));
      }
      const { employeeId } = req.query;
      if (employeeId && typeof employeeId === "string") {
        return res.json(data.filter(a => a.employeeId === employeeId));
      }
      res.json(data);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch attendance" });
    }
  });

  app.post("/api/attendance", authenticateToken, async (req: any, res) => {
    try {
      const parsed = insertAttendanceSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Validation error", errors: parsed.error.errors });
      const created = await storage.createAttendanceRecord(parsed.data as any);
      await logAction(req.user.id, "create", "attendance", `Recorded attendance for employee ${parsed.data.employeeId}`);
      res.status(201).json(created);
    } catch (error) {
      res.status(500).json({ message: "Failed to record attendance" });
    }
  });

  // ======================== FIELD STAFF ACTIVITIES ========================
  app.get("/api/field-activities", authenticateToken, async (_req, res) => {
    try {
      const data = await storage.getFieldStaffActivities();
      res.json(data);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch field activities" });
    }
  });

  app.post("/api/field-activities", authenticateToken, async (req: any, res) => {
    try {
      const parsed = insertFieldStaffActivitySchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Validation error", errors: parsed.error.errors });
      const created = await storage.createFieldStaffActivity(parsed.data as any);
      await logAction(req.user.id, "create", "field_activities", `Logged field activity`);
      res.status(201).json(created);
    } catch (error) {
      res.status(500).json({ message: "Failed to log field activity" });
    }
  });

  // ======================== PAYROLL STATUS ========================
  app.get("/api/payroll-status", authenticateToken, async (_req, res) => {
    try {
      const data = await storage.getPayrollStatuses();
      res.json(data);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch payroll statuses" });
    }
  });

  app.get("/api/payroll-status/:month/:year", authenticateToken, async (req, res) => {
    try {
      const month = parseInt(req.params.month);
      const year = parseInt(req.params.year);
      let data = await storage.getPayrollStatus(month, year);
      const now = new Date();
      const lastMonth = now.getMonth() === 0 ? 11 : now.getMonth() - 1;
      const lastMonthYear = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
      if (!data && month === lastMonth && year === lastMonthYear && now.getDate() >= 2) {
        data = await storage.createPayrollStatus({ month, year, status: "pending", totalAmount: null, disbursedAt: null });
      }
      res.json(data || null);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch payroll status" });
    }
  });

  app.post("/api/payroll-status", authenticateToken, async (req: any, res) => {
    try {
      const { month, year, totalAmount } = req.body;
      const existing = await storage.getPayrollStatus(month, year);
      if (existing) {
        return res.json(existing);
      }
      const created = await storage.createPayrollStatus({ month, year, status: "pending", totalAmount: totalAmount || "0", disbursedAt: null });
      res.json(created);
    } catch (error) {
      res.status(500).json({ message: "Failed to create payroll status" });
    }
  });

  app.patch("/api/payroll-status/:id/disburse", authenticateToken, async (req: any, res) => {
    try {
      const ps = await storage.getPayrollStatuses();
      const payrollRecord = ps.find(p => p.id === req.params.id);
      const updated = await storage.updatePayrollStatus(req.params.id, { status: "disbursed", disbursedAt: new Date() });
      if (!updated) return res.status(404).json({ message: "Payroll status not found" });
      if (payrollRecord) {
        const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
        const monthLabel = `${monthNames[payrollRecord.month]} ${payrollRecord.year}`;
        const allEmployees = await storage.getEmployees();
        const employeeUserIds = allEmployees
          .filter(e => e.isActive && e.userId)
          .map(e => e.userId!);
        for (const userId of employeeUserIds) {
          const emp = allEmployees.find(e => e.userId === userId);
          const salary = emp?.salary ? Number(emp.salary) : 0;
          const salaryStr = salary > 0 ? `₹${salary.toLocaleString("en-IN")}` : "your salary";
          await storage.createNotification({
            userId,
            type: "payroll_disbursed",
            title: "Salary Disbursed",
            message: `${salaryStr} for ${monthLabel} has been disbursed.`,
            relatedId: payrollRecord.id,
          });
        }
      }
      res.json(updated);
    } catch (error) {
      res.status(500).json({ message: "Failed to update payroll status" });
    }
  });

  // ======================== STOCK HELPER ========================
  async function updateInventoryStockForMovement(productId: string, warehouseId: string, quantityDelta: number) {
    const allStock = await storage.getInventoryStock();
    const existing = allStock.find((s: any) => s.productId === productId && s.warehouseId === warehouseId);
    if (existing) {
      await storage.updateInventoryStock(existing.id, { quantity: (existing.quantity || 0) + quantityDelta });
    } else {
      await storage.createInventoryStock({ productId, warehouseId, quantity: Math.max(0, quantityDelta) } as any);
    }
  }

  async function getAvailableStock(productId: string, warehouseId: string): Promise<number> {
    const allStock = await storage.getInventoryStock();
    const existing = allStock.find((s: any) => s.productId === productId && s.warehouseId === warehouseId);
    return existing ? (existing.quantity || 0) : 0;
  }

  async function getRemainingOrderItemQuantities(orderId: string): Promise<Record<string, number>> {
    const orderItems = await storage.getSalesOrderItems(orderId);
    const challans = await storage.getDeliveryChallansByOrder(orderId);
    const challanItemsMap: Record<string, number> = {};

    for (const challan of challans) {
      if (challan.status === "cancelled") continue;
      const cItems = await storage.getDeliveryChallanItems(challan.id);
      for (const ci of cItems) {
        challanItemsMap[ci.productId] = (challanItemsMap[ci.productId] || 0) + ci.quantity;
      }
    }

    const remaining: Record<string, number> = {};
    for (const item of orderItems) {
      if (!item.productId) continue;
      const alreadyAssigned = challanItemsMap[item.productId] || 0;
      remaining[item.productId] = Math.max(0, item.quantity - alreadyAssigned);
    }
    return remaining;
  }

  // ======================== RESERVED STOCK ========================
  app.get("/api/inventory/reserved-stock", authenticateToken, async (_req, res) => {
    try {
      const reservedStatuses = ["confirmed", "procurement", "ready_to_ship"];
      const allOrders = await storage.getSalesOrders();
      const activeOrders = allOrders.filter(o => reservedStatuses.includes(o.status));

      const result: Record<string, { total: number; orders: Array<{ orderId: string; orderNumber: string; quantity: number; expectedDeliveryDate: string | null; reservationStatus: string }> }> = {};

      for (const order of activeOrders) {
        const orderItems = await storage.getSalesOrderItems(order.id);
        const productItems = orderItems.filter(it => it.itemType === "product" && it.productId);
        if (productItems.length === 0) continue;

        const challans = await storage.getDeliveryChallansByOrder(order.id);
        const challanItemsMap: Record<string, number> = {};
        for (const challan of challans) {
          if (!["dispatched", "delivered"].includes(challan.status)) continue;
          const cItems = await storage.getDeliveryChallanItems(challan.id);
          for (const ci of cItems) {
            challanItemsMap[ci.productId] = (challanItemsMap[ci.productId] || 0) + ci.quantity;
          }
        }

        for (const item of productItems) {
          const pid = item.productId!;
          const dispatched = challanItemsMap[pid] || 0;
          const reserved = Math.max(0, item.quantity - dispatched);
          if (reserved <= 0) continue;

          if (!result[pid]) result[pid] = { total: 0, orders: [] };
          result[pid].total += reserved;
          result[pid].orders.push({
            orderId: order.id,
            orderNumber: order.orderNumber,
            quantity: reserved,
            expectedDeliveryDate: (order as any).expectedDeliveryDate ? new Date((order as any).expectedDeliveryDate).toISOString() : null,
            reservationStatus: order.status,
          });
        }
      }

      const allStock = await storage.getInventoryStock();
      const stockByProduct: Record<string, number> = {};
      for (const s of allStock) {
        stockByProduct[s.productId] = (stockByProduct[s.productId] || 0) + (s.quantity ?? 0);
      }

      for (const pid of Object.keys(result)) {
        const physicalStock = stockByProduct[pid] || 0;
        if (result[pid].total > physicalStock) {
          const ratio = physicalStock > 0 ? physicalStock / result[pid].total : 0;
          let remaining = physicalStock;
          for (const orderEntry of result[pid].orders) {
            const capped = Math.min(Math.floor(orderEntry.quantity * ratio), remaining);
            orderEntry.quantity = capped;
            remaining -= capped;
          }
          if (remaining > 0 && result[pid].orders.length > 0) {
            result[pid].orders[0].quantity += remaining;
          }
          result[pid].total = physicalStock;
          result[pid].orders = result[pid].orders.filter(o => o.quantity > 0);
        }
      }

      res.json(result);
    } catch (error) {
      console.error("Reserved stock error:", error);
      res.status(500).json({ message: "Failed to calculate reserved stock" });
    }
  });

  // ======================== INCOMING STOCK ========================
  app.get("/api/inventory/incoming-stock", authenticateToken, async (_req, res) => {
    try {
      const allPOs = await storage.getPurchaseOrders();
      const openWarehousePOs = allPOs.filter(
        (po: any) => po.deliveryType === "warehouse" && ["pending", "approved", "shipped"].includes(po.status)
      );

      const result: Record<string, { total: number; orders: Array<{ poId: string; poNumber: string; quantity: number; expectedDate: string | null }> }> = {};

      for (const po of openWarehousePOs) {
        const poItems = await storage.getPurchaseOrderItems(po.id);
        const grns = await storage.getGRNsByPO(po.id);
        const confirmedGrns = grns.filter(g => g.status === "confirmed");

        const receivedMap: Record<string, number> = {};
        for (const grn of confirmedGrns) {
          const grnItems = await storage.getGRNItems(grn.id);
          for (const gi of grnItems) {
            receivedMap[gi.productId] = (receivedMap[gi.productId] || 0) + gi.receivedQuantity;
          }
        }

        for (const item of poItems) {
          if (!item.productId) continue;
          const received = receivedMap[item.productId] || 0;
          const incoming = Math.max(0, item.quantity - received);
          if (incoming <= 0) continue;

          if (!result[item.productId]) result[item.productId] = { total: 0, orders: [] };
          result[item.productId].total += incoming;
          result[item.productId].orders.push({
            poId: po.id,
            poNumber: po.poNumber,
            quantity: incoming,
            expectedDate: po.expectedDelivery ? new Date(po.expectedDelivery).toISOString() : null,
          });
        }
      }

      res.json(result);
    } catch (error) {
      console.error("Incoming stock error:", error);
      res.status(500).json({ message: "Failed to calculate incoming stock" });
    }
  });

  // ======================== STOCK MOVEMENTS ========================
  app.get("/api/stock-movements", authenticateToken, async (req: any, res) => {
    try {
      const data = await storage.getStockMovements();
      res.json(data);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch stock movements" });
    }
  });

  app.get("/api/stock-movements/by-product/:productId", authenticateToken, async (req: any, res) => {
    try {
      const data = await storage.getStockMovementsByProduct(req.params.productId);
      res.json(data);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch stock movements" });
    }
  });

  app.post("/api/stock-movements", authenticateToken, async (req: any, res) => {
    try {
      const parsed = insertStockMovementSchema.safeParse({
        ...req.body,
        createdBy: req.user.id,
      });
      if (!parsed.success) return res.status(400).json({ message: "Validation error", errors: parsed.error.errors });

      if (parsed.data.movementType === "out" && parsed.data.warehouseId) {
        const available = await getAvailableStock(parsed.data.productId, parsed.data.warehouseId);
        if (Math.abs(parsed.data.quantity) > available) {
          return res.status(400).json({ message: `Insufficient stock. Available: ${available}, Requested: ${Math.abs(parsed.data.quantity)}` });
        }
      }

      const movement = await storage.createStockMovement(parsed.data as any);

      if (movement.warehouseId) {
        const qty = movement.movementType === "out" ? -Math.abs(movement.quantity) : movement.quantity;
        await updateInventoryStockForMovement(movement.productId, movement.warehouseId, qty);
      }

      res.status(201).json(movement);
    } catch (error) {
      res.status(500).json({ message: "Failed to create stock movement" });
    }
  });

  // ======================== DELIVERY CHALLANS ========================
  app.get("/api/delivery-challans", authenticateToken, async (_req, res) => {
    try {
      const data = await storage.getDeliveryChallans();
      res.json(data);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch delivery challans" });
    }
  });

  app.get("/api/delivery-challans/by-order/:orderId", authenticateToken, async (req: any, res) => {
    try {
      const data = await storage.getDeliveryChallansByOrder(req.params.orderId);
      res.json(data);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch challans for order" });
    }
  });

  app.get("/api/delivery-challans/:id", authenticateToken, async (req: any, res) => {
    try {
      const challan = await storage.getDeliveryChallan(req.params.id);
      if (!challan) return res.status(404).json({ message: "Challan not found" });
      const items = await storage.getDeliveryChallanItems(challan.id);
      res.json({ ...challan, items });
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch challan" });
    }
  });

  app.post("/api/delivery-challans", authenticateToken, async (req: any, res) => {
    try {
      const { items, ...challanData } = req.body;
      if (!items || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ message: "At least one item is required" });
      }

      const remaining = await getRemainingOrderItemQuantities(challanData.orderId);
      for (const item of items) {
        if (item.productId && item.quantity > (remaining[item.productId] || 0)) {
          return res.status(400).json({ message: `Quantity for product exceeds remaining order quantity. Remaining: ${remaining[item.productId] || 0}` });
        }
      }

      const year = new Date().getFullYear();
      const allChallans = await storage.getDeliveryChallans();
      const yearChallans = allChallans.filter((c: any) => c.challanNumber.startsWith(`DC-${year}`));
      const nextNum = yearChallans.length + 1;
      const challanNumber = `DC-${year}-${String(nextNum).padStart(4, "0")}`;

      let challanDeliveryAddress = challanData.deliveryAddress || null;
      if (!challanDeliveryAddress && challanData.orderId) {
        const linkedOrder = await storage.getSalesOrder(challanData.orderId);
        if (linkedOrder && (linkedOrder as any).deliveryAddress) {
          challanDeliveryAddress = (linkedOrder as any).deliveryAddress;
        }
      }

      const parsed = insertDeliveryChallanSchema.safeParse({
        ...challanData,
        challanNumber,
        status: "draft",
        createdBy: req.user.id,
        deliveryAddress: challanDeliveryAddress,
      });
      if (!parsed.success) return res.status(400).json({ message: "Validation error", errors: parsed.error.errors });

      const challan = await storage.createDeliveryChallan(parsed.data as any);

      const createdItems = [];
      for (const item of items) {
        const itemParsed = insertDeliveryChallanItemSchema.safeParse({
          ...item,
          challanId: challan.id,
        });
        if (!itemParsed.success) continue;
        const ci = await storage.createDeliveryChallanItem(itemParsed.data as any);
        createdItems.push(ci);
      }

      res.status(201).json({ ...challan, items: createdItems });
    } catch (error) {
      res.status(500).json({ message: "Failed to create delivery challan" });
    }
  });

  app.post("/api/purchase-orders/:id/generate-challan", authenticateToken, async (req: any, res) => {
    try {
      const po = await storage.getPurchaseOrder(req.params.id);
      if (!po) return res.status(404).json({ message: "Purchase order not found" });
      if (po.deliveryType !== "direct_delivery") return res.status(400).json({ message: "Only direct delivery POs can generate challans" });
      if (!["approved", "shipped"].includes(po.status)) return res.status(400).json({ message: "PO must be approved or shipped" });

      const existingChallans = await storage.getDeliveryChallans();
      const existingDraft = existingChallans.find((c: any) => c.notes?.includes(po.poNumber) && c.status === "draft" && c.sourceType === "supplier" && c.sourceId === po.supplierId);
      if (existingDraft) {
        return res.status(200).json(existingDraft);
      }

      const poItems = await storage.getPurchaseOrderItems(po.id);
      if (!poItems.length) return res.status(400).json({ message: "PO has no items" });

      const allPRs = await storage.getPurchaseRequests();
      const linkedPR = allPRs.find((pr: any) => pr.purchaseOrderId === po.id);
      const salesOrderId = linkedPR?.salesOrderId;
      if (!salesOrderId) return res.status(400).json({ message: "No linked sales order found for this PO" });

      const salesOrder = await storage.getSalesOrder(salesOrderId);
      if (!salesOrder) return res.status(400).json({ message: "Linked sales order not found" });

      const year = new Date().getFullYear();
      const allChallans = await storage.getDeliveryChallans();
      const yearChallans = allChallans.filter((c: any) => c.challanNumber.startsWith(`DC-${year}`));
      const nextNum = yearChallans.length + 1;
      const challanNumber = `DC-${year}-${String(nextNum).padStart(4, "0")}`;

      const challanData: any = {
        challanNumber,
        orderId: salesOrderId,
        sourceType: "supplier",
        sourceId: po.supplierId,
        status: "draft",
        createdBy: req.user.id,
        deliveryAddress: po.deliveryAddress || (salesOrder as any).deliveryAddress || null,
        notes: `Auto-generated from ${po.poNumber}`,
      };

      const parsed = insertDeliveryChallanSchema.safeParse(challanData);
      if (!parsed.success) return res.status(400).json({ message: "Validation error", errors: parsed.error.errors });

      const challan = await storage.createDeliveryChallan(parsed.data as any);

      const createdItems = [];
      for (const poItem of poItems) {
        const itemParsed = insertDeliveryChallanItemSchema.safeParse({
          challanId: challan.id,
          productId: poItem.productId,
          quantity: poItem.quantity,
          unitPrice: poItem.unitCost,
        });
        if (!itemParsed.success) continue;
        const ci = await storage.createDeliveryChallanItem(itemParsed.data as any);
        createdItems.push(ci);
      }

      await storage.createAuditEntry({
        entityType: "delivery_challan",
        entityId: challan.id,
        action: "created",
        userId: req.user.id,
        details: { challanNumber, generatedFromPO: po.poNumber, salesOrderId },
      });

      try {
        await checkAndAdvanceSalesOrderFromProcurement(salesOrderId, storage);
      } catch (e) {
        console.error("Failed to advance SO from procurement after challan generation:", e);
      }

      res.status(201).json({ ...challan, items: createdItems });
    } catch (error) {
      res.status(500).json({ message: "Failed to generate challan from PO" });
    }
  });

  app.post("/api/delivery-challans/:id/dispatch", authenticateToken, async (req: any, res) => {
    try {
      const challan = await storage.getDeliveryChallan(req.params.id);
      if (!challan) return res.status(404).json({ message: "Challan not found" });
      if (challan.status !== "draft") return res.status(400).json({ message: "Only draft challans can be dispatched" });

      const items = await storage.getDeliveryChallanItems(challan.id);

      if (challan.sourceType === "warehouse") {
        for (const item of items) {
          const available = await getAvailableStock(item.productId, challan.sourceId);
          if (item.quantity > available) {
            return res.status(400).json({ message: `Insufficient stock for product. Available: ${available}, Required: ${item.quantity}` });
          }
        }

        for (const item of items) {
          await storage.createStockMovement({
            productId: item.productId,
            warehouseId: challan.sourceId,
            movementType: "out",
            quantity: item.quantity,
            referenceType: "challan",
            referenceId: challan.id,
            notes: `Dispatched via challan ${challan.challanNumber}`,
            createdBy: req.user.id,
          });

          await updateInventoryStockForMovement(item.productId, challan.sourceId, -item.quantity);
        }
      }

      const updated = await storage.updateDeliveryChallan(challan.id, {
        status: "dispatched",
        dispatchDate: new Date(),
      });

      if (challan.orderId) {
        try {
          await checkAndAdvanceSalesOrderOnChallan(challan.orderId, storage);
        } catch (e) {
          console.error("Failed to advance SO on challan dispatch:", e);
        }
      }

      res.json(updated);
    } catch (error) {
      res.status(500).json({ message: "Failed to dispatch challan" });
    }
  });

  app.post("/api/delivery-challans/:id/deliver", authenticateToken, async (req: any, res) => {
    try {
      const challan = await storage.getDeliveryChallan(req.params.id);
      if (!challan) return res.status(404).json({ message: "Challan not found" });
      if (challan.status !== "dispatched") return res.status(400).json({ message: "Only dispatched challans can be delivered" });

      const updated = await storage.updateDeliveryChallan(challan.id, {
        status: "delivered",
        deliveryDate: new Date(),
      });

      if (challan.orderId) {
        try {
          await checkAndAdvanceSalesOrderOnChallan(challan.orderId, storage);
        } catch (e) {
          console.error("Failed to advance SO on challan delivery:", e);
        }
      }

      res.json(updated);
    } catch (error) {
      res.status(500).json({ message: "Failed to mark challan as delivered" });
    }
  });

  app.get("/api/delivery-challans/:id/items", authenticateToken, async (req: any, res) => {
    try {
      const items = await storage.getDeliveryChallanItems(req.params.id);
      res.json(items);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch challan items" });
    }
  });

  // ======================== GOODS RECEIPT NOTES (GRN) ========================
  app.get("/api/grns", authenticateToken, async (_req, res) => {
    try {
      const data = await storage.getGRNs();
      res.json(data);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch GRNs" });
    }
  });

  app.get("/api/grns/by-po/:poId", authenticateToken, async (req: any, res) => {
    try {
      const data = await storage.getGRNsByPO(req.params.poId);
      res.json(data);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch GRNs for PO" });
    }
  });

  app.get("/api/grns/:id", authenticateToken, async (req, res) => {
    try {
      const grn = await storage.getGRN(req.params.id);
      if (!grn) return res.status(404).json({ message: "GRN not found" });
      res.json(grn);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch GRN" });
    }
  });

  app.post("/api/grns", authenticateToken, async (req: any, res) => {
    try {
      const po = await storage.getPurchaseOrder(req.body.purchaseOrderId);
      if (!po) return res.status(400).json({ message: "Purchase order not found" });
      if (po.deliveryType !== "warehouse") return res.status(400).json({ message: "Only warehouse-type POs can have GRNs" });
      if (!["approved", "shipped"].includes(po.status)) return res.status(400).json({ message: "PO must be approved or shipped to create a GRN" });

      const year = new Date().getFullYear();
      const allGrns = await storage.getGRNs();
      const yearGrns = allGrns.filter(g => g.grnNumber.startsWith(`GRN-${year}`));
      const maxNum = yearGrns.reduce((max: number, g: any) => {
        const num = parseInt(g.grnNumber.split("-").pop() || "0", 10);
        return num > max ? num : max;
      }, 0);
      const grnNumber = `GRN-${year}-${String(maxNum + 1).padStart(4, "0")}`;

      const body = {
        ...req.body,
        grnNumber,
        createdBy: req.user.id,
      };

      const parsed = insertGoodsReceiptNoteSchema.safeParse(body);
      if (!parsed.success) return res.status(400).json({ message: "Validation error", errors: parsed.error.errors });

      const created = await storage.createGRN(parsed.data as any);
      await logAction(req.user.id, "create", "grn", `Created GRN ${grnNumber}`);
      res.status(201).json(created);
    } catch (error) {
      console.error("Create GRN error:", error);
      res.status(500).json({ message: "Failed to create GRN" });
    }
  });

  app.patch("/api/grns/:id", authenticateToken, async (req: any, res) => {
    try {
      const grn = await storage.getGRN(req.params.id);
      if (!grn) return res.status(404).json({ message: "GRN not found" });
      if (grn.status !== "draft") return res.status(400).json({ message: "Only draft GRNs can be updated" });

      const updated = await storage.updateGRN(req.params.id, req.body);
      res.json(updated);
    } catch (error) {
      res.status(500).json({ message: "Failed to update GRN" });
    }
  });

  app.delete("/api/grns/:id", authenticateToken, async (req: any, res) => {
    try {
      const grn = await storage.getGRN(req.params.id);
      if (!grn) return res.status(404).json({ message: "GRN not found" });
      if (grn.status !== "draft") return res.status(400).json({ message: "Only draft GRNs can be deleted" });

      await storage.deleteGRN(req.params.id);
      await logAction(req.user.id, "delete", "grn", `Deleted GRN ${grn.grnNumber}`);
      res.json({ message: "GRN deleted" });
    } catch (error) {
      res.status(500).json({ message: "Failed to delete GRN" });
    }
  });

  app.get("/api/grns/:id/items", authenticateToken, async (req, res) => {
    try {
      const items = await storage.getGRNItems(req.params.id);
      res.json(items);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch GRN items" });
    }
  });

  app.post("/api/grns/:id/items", authenticateToken, async (req: any, res) => {
    try {
      const grn = await storage.getGRN(req.params.id);
      if (!grn) return res.status(404).json({ message: "GRN not found" });
      if (grn.status !== "draft") return res.status(400).json({ message: "Only draft GRNs can have items modified" });

      await storage.deleteGRNItems(req.params.id);

      const items = req.body.items;
      if (!Array.isArray(items) || items.length === 0) return res.status(400).json({ message: "Items array is required" });

      for (const item of items) {
        if (!item.productId) return res.status(400).json({ message: "Each item must have a productId" });
        if (Number(item.receivedQuantity) <= 0) return res.status(400).json({ message: "Received quantity must be greater than 0" });
        if (Number(item.receivedQuantity) > Number(item.orderedQuantity)) return res.status(400).json({ message: "Received quantity cannot exceed ordered quantity" });
        if (Number(item.buyingPrice) < 0) return res.status(400).json({ message: "Buying price cannot be negative" });
      }

      const createdItems = [];
      let itemsTotal = 0;
      for (const item of items) {
        const totalCost = String(Number(item.receivedQuantity) * Number(item.buyingPrice));
        const itemData = {
          grnId: req.params.id,
          productId: item.productId,
          description: item.description || null,
          orderedQuantity: item.orderedQuantity,
          receivedQuantity: item.receivedQuantity,
          buyingPrice: item.buyingPrice,
          totalCost,
        };
        const parsed = insertGoodsReceiptNoteItemSchema.safeParse(itemData);
        if (!parsed.success) return res.status(400).json({ message: "Item validation error", errors: parsed.error.errors });
        const created = await storage.createGRNItem(parsed.data as any);
        createdItems.push(created);
        itemsTotal += Number(totalCost);
      }

      const deliveryCost = Number(grn.deliveryCost || 0);
      await storage.updateGRN(req.params.id, { totalAmount: String(itemsTotal + deliveryCost) });

      res.json(createdItems);
    } catch (error) {
      console.error("Set GRN items error:", error);
      res.status(500).json({ message: "Failed to set GRN items" });
    }
  });

  app.post("/api/grns/:id/confirm", authenticateToken, async (req: any, res) => {
    try {
      const grn = await storage.getGRN(req.params.id);
      if (!grn) return res.status(404).json({ message: "GRN not found" });
      if (grn.status !== "draft") return res.status(400).json({ message: "Only draft GRNs can be confirmed" });

      const items = await storage.getGRNItems(grn.id);
      if (items.length === 0) return res.status(400).json({ message: "GRN has no items to confirm" });

      const allStock = await storage.getInventoryStock();

      for (const item of items) {
        await storage.createStockMovement({
          productId: item.productId,
          warehouseId: grn.warehouseId,
          movementType: "in",
          quantity: item.receivedQuantity,
          referenceType: "grn",
          referenceId: grn.id,
          notes: `Received via GRN ${grn.grnNumber}`,
          createdBy: req.user.id,
        });

        await updateInventoryStockForMovement(item.productId, grn.warehouseId, item.receivedQuantity);
      }

      const costAggregates: Record<string, { totalQty: number; totalCost: number }> = {};
      for (const item of items) {
        if (item.buyingPrice && parseFloat(item.buyingPrice) > 0) {
          if (!costAggregates[item.productId]) {
            costAggregates[item.productId] = { totalQty: 0, totalCost: 0 };
          }
          costAggregates[item.productId].totalQty += item.receivedQuantity;
          costAggregates[item.productId].totalCost += item.receivedQuantity * parseFloat(item.buyingPrice);
        }
      }

      for (const [productId, agg] of Object.entries(costAggregates)) {
        const existingStock = allStock
          .filter((s: any) => s.productId === productId)
          .reduce((sum: number, s: any) => sum + (s.quantity ?? 0), 0);
        const product = await storage.getProduct(productId);
        if (product) {
          const existingCost = product.costPrice ? parseFloat(product.costPrice) : 0;
          const avgBuyingPrice = agg.totalQty > 0 ? agg.totalCost / agg.totalQty : 0;
          const totalQty = existingStock + agg.totalQty;
          const newCost = totalQty > 0
            ? ((existingStock * existingCost) + (agg.totalQty * avgBuyingPrice)) / totalQty
            : avgBuyingPrice;
          await storage.updateProduct(product.id, { costPrice: newCost.toFixed(2) });
        }
      }

      await storage.updateGRN(grn.id, { status: "confirmed" });

      const po = await storage.getPurchaseOrder(grn.purchaseOrderId);
      if (po) {
        const poItems = await storage.getPurchaseOrderItems(po.id);
        const allGrnsForPO = await storage.getGRNsByPO(po.id);
        const confirmedGrns = allGrnsForPO.filter(g => g.status === "confirmed" || g.id === grn.id);

        let allFullyReceived = true;
        for (const poItem of poItems) {
          if (!poItem.productId) continue;
          let totalReceived = 0;
          for (const cGrn of confirmedGrns) {
            const grnItems = await storage.getGRNItems(cGrn.id);
            for (const gi of grnItems) {
              if (gi.productId === poItem.productId) {
                totalReceived += gi.receivedQuantity;
              }
            }
          }
          if (totalReceived < poItem.quantity) {
            allFullyReceived = false;
            break;
          }
        }

        if (allFullyReceived) {
          await storage.updatePurchaseOrder(po.id, { status: "received" } as any);

          const allPRs = await storage.getPurchaseRequests();
          const linkedPR = allPRs.find((pr: any) => pr.purchaseOrderId === po.id);
          if (linkedPR?.salesOrderId) {
            try {
              await checkAndAdvanceSalesOrderFromProcurement(linkedPR.salesOrderId, storage);
            } catch (e) {
              console.error("Failed to advance SO from procurement after GRN:", e);
            }
          }
        }
      }

      await logAction(req.user.id, "confirm", "grn", `Confirmed GRN ${grn.grnNumber}`);

      const updated = await storage.getGRN(grn.id);
      res.json(updated);
    } catch (error) {
      console.error("Confirm GRN error:", error);
      res.status(500).json({ message: "Failed to confirm GRN" });
    }
  });

  // ======================== ORDER REMAINING QUANTITIES ========================
  app.post("/api/sales-orders/:id/confirm-pickup", authenticateToken, requireRole("admin", "sales_manager"), async (req: any, res) => {
    try {
      const order = await storage.getSalesOrder(req.params.id);
      if (!order) return res.status(404).json({ message: "Sales order not found" });
      if (order.status !== "ready_to_ship") return res.status(400).json({ message: "Order must be in ready_to_ship status" });
      if ((order as any).deliveryMethod !== "pickup") return res.status(400).json({ message: "Only pickup orders can use confirm-pickup" });

      const orderItems = await storage.getSalesOrderItems(order.id);
      const productItems = orderItems.filter((it: any) => it.itemType === "product" && it.productId);

      const allStock = await storage.getInventoryStock();
      const warehouses = await storage.getWarehouses();

      let pickupWarehouseId: string | null = null;
      if (productItems.length > 0 && allStock.length > 0) {
        const stockByWarehouse: Record<string, number> = {};
        for (const s of allStock) {
          if (!stockByWarehouse[s.warehouseId]) stockByWarehouse[s.warehouseId] = 0;
          stockByWarehouse[s.warehouseId] += s.quantity ?? 0;
        }
        const bestWh = warehouses.find((wh: any) => (stockByWarehouse[wh.id] || 0) > 0);
        pickupWarehouseId = bestWh?.id || warehouses[0]?.id || null;
      } else {
        pickupWarehouseId = warehouses[0]?.id || null;
      }

      if (!pickupWarehouseId) return res.status(400).json({ message: "No warehouse available for pickup" });

      const year = new Date().getFullYear();
      const allChallans = await storage.getDeliveryChallans();
      const yearChallans = allChallans.filter((c: any) => c.challanNumber.startsWith(`DC-${year}`));
      const nextNum = yearChallans.length + 1;
      const challanNumber = `DC-${year}-${String(nextNum).padStart(4, "0")}`;

      const challan = await storage.createDeliveryChallan({
        challanNumber,
        orderId: order.id,
        sourceType: "warehouse",
        sourceId: pickupWarehouseId,
        status: "draft",
        createdBy: req.user.id,
        notes: `Pickup confirmed for order ${order.orderNumber}`,
      } as any);

      for (const item of productItems) {
        await storage.createDeliveryChallanItem({
          challanId: challan.id,
          productId: item.productId!,
          description: item.description || null,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
        } as any);

        await storage.createStockMovement({
          productId: item.productId!,
          warehouseId: pickupWarehouseId,
          movementType: "out",
          quantity: item.quantity,
          referenceType: "challan",
          referenceId: challan.id,
          notes: `Pickup of order ${order.orderNumber}`,
          createdBy: req.user.id,
        });

        await updateInventoryStockForMovement(item.productId!, pickupWarehouseId, -item.quantity);
      }

      await storage.updateDeliveryChallan(challan.id, {
        status: "delivered",
        dispatchDate: new Date(),
        deliveryDate: new Date(),
      });

      await storage.updateSalesOrder(order.id, { status: "delivered" } as any);

      await logAction(req.user.id, "confirm_pickup", "sales", `Pickup confirmed for order ${order.orderNumber}`);

      res.json({ message: "Pickup confirmed", challanNumber, orderId: order.id });
    } catch (error) {
      console.error("Confirm pickup error:", error);
      res.status(500).json({ message: "Failed to confirm pickup" });
    }
  });

  app.get("/api/sales-orders/:id/remaining-quantities", authenticateToken, async (req: any, res) => {
    try {
      const remaining = await getRemainingOrderItemQuantities(req.params.id);
      res.json(remaining);
    } catch (error) {
      res.status(500).json({ message: "Failed to get remaining quantities" });
    }
  });

  // ======================== INVENTORY STOCK BY PRODUCT ========================
  app.get("/api/inventory-stock/by-product/:productId", authenticateToken, async (req: any, res) => {
    try {
      const allStock = await storage.getInventoryStock();
      const productStock = allStock.filter((s: any) => s.productId === req.params.productId);
      res.json(productStock);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch product stock" });
    }
  });

  // ======================== PURCHASE REQUESTS ========================
  app.get("/api/purchase-requests", authenticateToken, async (_req, res) => {
    try {
      const data = await storage.getPurchaseRequests();
      res.json(data);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch purchase requests" });
    }
  });

  app.get("/api/purchase-requests/:id", authenticateToken, async (req, res) => {
    try {
      const pr = await storage.getPurchaseRequest(req.params.id);
      if (!pr) return res.status(404).json({ message: "Purchase request not found" });
      const items = await storage.getPurchaseRequestItems(pr.id);
      res.json({ ...pr, items });
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch purchase request" });
    }
  });

  app.post("/api/purchase-requests", authenticateToken, async (req: any, res) => {
    try {
      const validPriorities = ["low", "medium", "high", "urgent"];
      const priority = validPriorities.includes(req.body.priority) ? req.body.priority : "medium";

      const year = new Date().getFullYear();
      const allPRs = await storage.getPurchaseRequests();
      const yearPRs = allPRs.filter(pr => pr.requestNumber.startsWith(`PR-${year}`));
      const maxNum = yearPRs.reduce((max, pr) => {
        const num = parseInt(pr.requestNumber.split("-").pop() || "0", 10);
        return num > max ? num : max;
      }, 0);
      const requestNumber = `PR-${year}-${String(maxNum + 1).padStart(4, "0")}`;

      const pr = await storage.createPurchaseRequest({
        requestNumber,
        salesOrderId: req.body.salesOrderId || null,
        supplierId: req.body.supplierId || null,
        status: "pending",
        priority,
        notes: req.body.notes || null,
        purchaseOrderId: null,
        createdBy: req.user.id,
      });

      if (req.body.items && Array.isArray(req.body.items)) {
        for (const item of req.body.items) {
          if (!item.productId || !item.requiredQuantity || !item.shortfallQuantity) continue;
          await storage.createPurchaseRequestItem({
            requestId: pr.id,
            productId: item.productId,
            description: item.description || null,
            requiredQuantity: Number(item.requiredQuantity) || 0,
            availableStock: Number(item.availableStock) || 0,
            shortfallQuantity: Number(item.shortfallQuantity) || 0,
            unitCost: item.unitCost ? String(item.unitCost) : null,
            notes: item.notes || null,
          });
        }
      }

      await logAction(req.user.id, "create", "supply_chain", `Created purchase request ${requestNumber}`);
      res.status(201).json(pr);
    } catch (error) {
      res.status(500).json({ message: "Failed to create purchase request" });
    }
  });

  app.patch("/api/purchase-requests/:id", authenticateToken, async (req: any, res) => {
    try {
      const allowedFields: Record<string, boolean> = { supplierId: true, priority: true, notes: true, status: true };
      const updateData: any = {};
      for (const key of Object.keys(req.body)) {
        if (allowedFields[key]) updateData[key] = req.body[key];
      }
      const validStatuses = ["pending", "approved", "converted", "cancelled"];
      if (updateData.status && !validStatuses.includes(updateData.status)) {
        return res.status(400).json({ message: "Invalid status" });
      }
      const validPriorities = ["low", "medium", "high", "urgent"];
      if (updateData.priority && !validPriorities.includes(updateData.priority)) {
        return res.status(400).json({ message: "Invalid priority" });
      }

      const updated = await storage.updatePurchaseRequest(req.params.id, updateData);
      if (!updated) return res.status(404).json({ message: "Purchase request not found" });
      await logAction(req.user.id, "update", "supply_chain", `Updated purchase request ${updated.requestNumber}`);
      res.json(updated);
    } catch (error) {
      res.status(500).json({ message: "Failed to update purchase request" });
    }
  });

  app.delete("/api/purchase-requests/:id", authenticateToken, async (req: any, res) => {
    try {
      const pr = await storage.getPurchaseRequest(req.params.id);
      if (!pr) return res.status(404).json({ message: "Purchase request not found" });
      if (pr.status !== "pending") return res.status(400).json({ message: "Can only delete pending purchase requests" });
      await storage.deletePurchaseRequest(req.params.id);
      await logAction(req.user.id, "delete", "supply_chain", `Deleted purchase request ${pr.requestNumber}`);
      res.json({ message: "Purchase request deleted" });
    } catch (error) {
      res.status(500).json({ message: "Failed to delete purchase request" });
    }
  });

  app.get("/api/purchase-requests/:id/items", authenticateToken, async (req, res) => {
    try {
      const items = await storage.getPurchaseRequestItems(req.params.id);
      res.json(items);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch purchase request items" });
    }
  });

  app.post("/api/purchase-requests/:id/items", authenticateToken, async (req: any, res) => {
    try {
      await storage.deletePurchaseRequestItems(req.params.id);
      const items = req.body.items || [];
      const created = [];
      for (const item of items) {
        const newItem = await storage.createPurchaseRequestItem({
          requestId: req.params.id,
          productId: item.productId,
          description: item.description || null,
          requiredQuantity: item.requiredQuantity,
          availableStock: item.availableStock || 0,
          shortfallQuantity: item.shortfallQuantity,
          unitCost: item.unitCost || null,
          notes: item.notes || null,
        });
        created.push(newItem);
      }
      res.json(created);
    } catch (error) {
      res.status(500).json({ message: "Failed to save purchase request items" });
    }
  });

  app.get("/api/purchase-requests/:id/matching-suppliers", authenticateToken, async (req, res) => {
    try {
      const prItems = await storage.getPurchaseRequestItems(req.params.id);
      if (prItems.length === 0) return res.json([]);

      const prProductIds = prItems.map(i => i.productId);
      const allSuppliers = await storage.getSuppliers();
      const allProducts = await storage.getProducts();
      const productMap = new Map(allProducts.map(p => [p.id, p]));

      const results = [];
      for (const supplier of allSuppliers) {
        const catalog = await storage.getSupplierProducts(supplier.id);
        const catalogProductIds = new Set(catalog.map(sp => sp.productId));
        const matchedItems = prItems.filter(i => catalogProductIds.has(i.productId));

        if (matchedItems.length === prProductIds.length) {
          const items = matchedItems.map(i => {
            const sp = catalog.find(c => c.productId === i.productId);
            const product = productMap.get(i.productId);
            return {
              productId: i.productId,
              productName: product?.name || i.description || "—",
              shortfallQuantity: i.shortfallQuantity,
              supplierPrice: sp?.supplierPrice || null,
              lineTotal: sp?.supplierPrice ? (parseFloat(sp.supplierPrice) * i.shortfallQuantity).toFixed(2) : null,
              isPreferred: sp?.isPreferred || false,
            };
          });
          const totalCost = items.reduce((sum, it) => sum + (it.lineTotal ? parseFloat(it.lineTotal) : 0), 0);
          results.push({
            supplierId: supplier.id,
            supplierName: supplier.name,
            matchedItemCount: matchedItems.length,
            totalItemCount: prProductIds.length,
            totalCost: totalCost.toFixed(2),
            items,
          });
        }
      }

      results.sort((a, b) => parseFloat(a.totalCost) - parseFloat(b.totalCost));
      res.json(results);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch matching suppliers" });
    }
  });

  app.post("/api/purchase-requests/:id/convert-to-po", authenticateToken, async (req: any, res) => {
    try {
      const pr = await storage.getPurchaseRequest(req.params.id);
      if (!pr) return res.status(404).json({ message: "Purchase request not found" });
      if (!pr.supplierId) return res.status(400).json({ message: "Assign a supplier before converting to PO" });
      if (pr.status !== "pending" && pr.status !== "approved") {
        return res.status(400).json({ message: "Can only convert pending or approved requests" });
      }

      const prItems = await storage.getPurchaseRequestItems(pr.id);
      if (prItems.length === 0) return res.status(400).json({ message: "No items in purchase request" });

      const year = new Date().getFullYear();
      const allPOs = await storage.getPurchaseOrders();
      const yearPOs = allPOs.filter((po: any) => po.poNumber?.startsWith(`PO-${year}`));
      const maxPoNum = yearPOs.reduce((max: number, po: any) => {
        const num = parseInt(po.poNumber.split("-").pop() || "0", 10);
        return num > max ? num : max;
      }, 0);
      const poNumber = `PO-${year}-${String(maxPoNum + 1).padStart(4, "0")}`;

      const supplierProds = await storage.getSupplierProducts(pr.supplierId);
      const allProducts = await storage.getProducts();
      const productMap = new Map(allProducts.map(p => [p.id, p]));

      let totalAmount = 0;
      const poItemsData = prItems.map(item => {
        const sp = supplierProds.find((sp: any) => sp.productId === item.productId);
        const product = productMap.get(item.productId);
        const unitCost = item.unitCost && parseFloat(item.unitCost) > 0
          ? parseFloat(item.unitCost)
          : sp?.supplierPrice && parseFloat(sp.supplierPrice) > 0
            ? parseFloat(sp.supplierPrice)
            : product?.costPrice && parseFloat(product.costPrice) > 0
              ? parseFloat(product.costPrice)
              : 0;
        const itemTotal = unitCost * item.shortfallQuantity;
        totalAmount += itemTotal;
        return {
          productId: item.productId,
          description: item.description || product?.name || "",
          quantity: item.shortfallQuantity,
          unitCost: unitCost.toFixed(2),
          totalCost: itemTotal.toFixed(2),
        };
      });

      const deliveryType = req.body?.deliveryType === "direct_delivery" ? "direct_delivery" : "warehouse";

      let expectedDelivery: Date | null = null;
      let deliveryAddress: string | null = null;
      if (pr.salesOrderId) {
        const linkedOrder = await storage.getSalesOrder(pr.salesOrderId);
        if (linkedOrder) {
          if ((linkedOrder as any).expectedDeliveryDate) {
            expectedDelivery = new Date((linkedOrder as any).expectedDeliveryDate);
          }
          if (deliveryType === "direct_delivery" && (linkedOrder as any).deliveryAddress) {
            deliveryAddress = (linkedOrder as any).deliveryAddress;
          }
        }
      }

      const po = await storage.createPurchaseOrder({
        poNumber,
        supplierId: pr.supplierId,
        status: "pending",
        deliveryType,
        totalAmount: totalAmount.toFixed(2),
        expectedDelivery,
        notes: `Generated from purchase request ${pr.requestNumber}`,
        deliveryAddress,
      } as any);

      for (const poItem of poItemsData) {
        await storage.createPurchaseOrderItem({
          purchaseOrderId: po.id,
          ...poItem,
        });
      }

      await storage.updatePurchaseRequest(pr.id, {
        status: "converted",
        purchaseOrderId: po.id,
      });

      await logAction(req.user.id, "create", "supply_chain", `Converted purchase request ${pr.requestNumber} to PO ${poNumber}`);
      res.json({ purchaseOrder: po, requestUpdated: true });
    } catch (error) {
      console.error("Failed to convert purchase request to PO:", error);
      res.status(500).json({ message: "Failed to convert to purchase order" });
    }
  });

  // ======================== AUDIT LOGS ========================
  app.get("/api/audit-logs", authenticateToken, async (_req, res) => {
    try {
      const data = await storage.getAuditLogs();
      res.json(data);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch audit logs" });
    }
  });

  // ======================== OBJECT STORAGE ========================
  registerObjectStorageRoutes(app);

  // ======================== KIOSK ATTENDANCE ========================

  app.get("/api/kiosk/employee/:qrCode", async (req, res) => {
    try {
      const qrCode = decodeURIComponent(req.params.qrCode).trim();
      const employees = await storage.getEmployees();
      const employee = employees.find(e => e.qrCode === qrCode && e.isActive);
      if (!employee) return res.status(404).json({ message: "Employee not found or inactive" });

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const allAttendance = await storage.getAttendance();
      const todayRecord = allAttendance.find(a => {
        const aDate = new Date(a.date);
        aDate.setHours(0, 0, 0, 0);
        return a.employeeId === employee.id && aDate.getTime() === today.getTime();
      });

      res.json({
        id: employee.id,
        name: employee.name,
        department: employee.department,
        designation: employee.designation,
        todayAttendance: todayRecord || null,
      });
    } catch (error) {
      res.status(500).json({ message: "Failed to lookup employee" });
    }
  });

  app.post("/api/kiosk/attendance", async (req, res) => {
    try {
      const { qrCode, selfieUrl, action, location } = req.body;
      if (!qrCode) return res.status(400).json({ message: "QR code required" });

      const employees = await storage.getEmployees();
      const employee = employees.find(e => e.qrCode === qrCode && e.isActive);
      if (!employee) return res.status(404).json({ message: "Invalid QR code or employee inactive" });
      const employeeId = employee.id;

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const allAttendance = await storage.getAttendance();
      const todayRecord = allAttendance.find(a => {
        const aDate = new Date(a.date);
        aDate.setHours(0, 0, 0, 0);
        return a.employeeId === employeeId && aDate.getTime() === today.getTime();
      });

      const now = new Date();

      if (!todayRecord) {
        const checkInHour = now.getHours();
        const checkInMin = now.getMinutes();
        const checkInSec = now.getSeconds();
        const totalSeconds = checkInHour * 3600 + checkInMin * 60 + checkInSec;
        const graceDeadline = 9 * 3600 + 35 * 60; // 9:35:00 AM
        const isLate = totalSeconds > graceDeadline;
        const status = isLate ? "half_day" : "present";

        const created = await storage.createAttendanceRecord({
          employeeId,
          date: today,
          checkIn: now,
          checkOut: null,
          lunchOut: null,
          lunchIn: null,
          teaOut: null,
          teaIn: null,
          status,
          selfieUrl: selfieUrl || null,
          location: location || null,
        });
        const message = isLate ? "Checked in - Marked as Half Day (Late arrival)" : "Checked in successfully";
        return res.json({ type: "check_in", message, record: created, isLate });
      }

      if (todayRecord.checkOut) {
        return res.json({ type: "already_done", message: "Attendance already completed for today", record: todayRecord });
      }

      if (action === "lunch_out") {
        if (todayRecord.lunchOut) return res.status(400).json({ message: "Lunch break already taken" });
        const updated = await storage.updateAttendanceRecord(todayRecord.id, { lunchOut: now, selfieUrl: selfieUrl || todayRecord.selfieUrl, location: location || todayRecord.location });
        return res.json({ type: "lunch_out", message: "Going for Lunch Break", record: updated });
      }

      if (action === "lunch_in") {
        if (!todayRecord.lunchOut) return res.status(400).json({ message: "Lunch out not recorded" });
        if (todayRecord.lunchIn) return res.status(400).json({ message: "Already back from lunch" });
        const updated = await storage.updateAttendanceRecord(todayRecord.id, { lunchIn: now, selfieUrl: selfieUrl || todayRecord.selfieUrl, location: location || todayRecord.location });
        return res.json({ type: "lunch_in", message: "Back from Lunch Break", record: updated });
      }

      if (action === "tea_out") {
        if (todayRecord.teaOut) return res.status(400).json({ message: "Tea break already taken" });
        const updated = await storage.updateAttendanceRecord(todayRecord.id, { teaOut: now, selfieUrl: selfieUrl || todayRecord.selfieUrl, location: location || todayRecord.location });
        return res.json({ type: "tea_out", message: "Going for Tea Break", record: updated });
      }

      if (action === "tea_in") {
        if (!todayRecord.teaOut) return res.status(400).json({ message: "Tea out not recorded" });
        if (todayRecord.teaIn) return res.status(400).json({ message: "Already back from tea" });
        const updated = await storage.updateAttendanceRecord(todayRecord.id, { teaIn: now, selfieUrl: selfieUrl || todayRecord.selfieUrl, location: location || todayRecord.location });
        return res.json({ type: "tea_in", message: "Back from Tea Break", record: updated });
      }

      if (action === "check_out") {
        const updated = await storage.updateAttendanceRecord(todayRecord.id, { checkOut: now, selfieUrl: selfieUrl || todayRecord.selfieUrl, location: location || todayRecord.location });
        return res.json({ type: "check_out", message: "Checked out successfully", record: updated });
      }

      return res.status(400).json({ message: "Invalid action" });
    } catch (error) {
      console.error("Kiosk attendance error:", error);
      res.status(500).json({ message: "Failed to record attendance" });
    }
  });

  // ======================== TRAVEL EXPENSES ========================
  app.get("/api/travel-expenses", authenticateToken, async (req: any, res) => {
    try {
      const data = await storage.getTravelExpenses();
      if (req.user.role === "field_staff") {
        const employees = await storage.getEmployees();
        const linkedEmployee = employees.find(e => e.userId === req.user.id);
        if (!linkedEmployee) return res.json([]);
        return res.json(data.filter(te => te.employeeId === linkedEmployee.id));
      }
      res.json(data);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch travel expenses" });
    }
  });

  app.get("/api/travel-expenses/employee/:employeeId", authenticateToken, async (req: any, res) => {
    try {
      if (req.user.role === "field_staff") {
        const employees = await storage.getEmployees();
        const linked = employees.find(e => e.userId === req.user.id);
        if (!linked || linked.id !== req.params.employeeId) {
          return res.status(403).json({ message: "You can only view your own travel expenses" });
        }
      }
      const data = await storage.getTravelExpensesByEmployee(req.params.employeeId);
      res.json(data);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch travel expenses" });
    }
  });

  app.post("/api/travel-expenses", authenticateToken, async (req: any, res) => {
    try {
      let { employeeId, originLat, originLng, destLat, destLng, originAddress, destAddress, transportMode, notes } = req.body;
      const allEmployees = await storage.getEmployees();
      if (req.user.role === "field_staff") {
        const linked = allEmployees.find(e => e.userId === req.user.id);
        if (!linked) return res.status(403).json({ message: "No employee record linked to your account" });
        if (employeeId && employeeId !== linked.id) {
          return res.status(403).json({ message: "Field staff can only submit expenses for themselves" });
        }
        employeeId = linked.id;
      }
      const oLat = parseFloat(originLat); const oLng = parseFloat(originLng);
      const dLat = parseFloat(destLat); const dLng = parseFloat(destLng);
      if (!employeeId || isNaN(oLat) || isNaN(oLng) || isNaN(dLat) || isNaN(dLng)) {
        return res.status(400).json({ message: "Missing or invalid required fields" });
      }
      const empExists = allEmployees.find(e => e.id === employeeId);
      if (!empExists) {
        return res.status(400).json({ message: "Employee not found" });
      }
      const validModes = ["bus", "train", "bike"];
      if (!validModes.includes(transportMode)) {
        return res.status(400).json({ message: "Invalid transport mode" });
      }
      const rates: Record<string, number> = { bus: 10, train: 5, bike: 20 };
      const R = 6371;
      const dLatR = (dLat - oLat) * Math.PI / 180;
      const dLonR = (dLng - oLng) * Math.PI / 180;
      const a = Math.sin(dLatR / 2) ** 2 + Math.cos(oLat * Math.PI / 180) * Math.cos(dLat * Math.PI / 180) * Math.sin(dLonR / 2) ** 2;
      const dist = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) * 1.3;
      const computedTravelCost = Math.round(dist * rates[transportMode]);
      const lunchMoney = 200;
      const computedTotal = computedTravelCost + lunchMoney;
      const created = await storage.createTravelExpense({
        employeeId, date: new Date(), originLat: String(oLat), originLng: String(oLng),
        destLat: String(dLat), destLng: String(dLng), originAddress: originAddress || null,
        destAddress: destAddress || null, distance: String(dist.toFixed(2)), transportMode,
        travelCost: String(computedTravelCost), lunchMoney: String(lunchMoney),
        totalAmount: String(computedTotal), status: "pending", notes: notes || null,
        approvedAt: null, disbursedAt: null, createdAt: new Date(),
      });
      await logAction(req.user.id, "create", "travel_expenses", `Travel expense created for employee ${employeeId}`);
      res.status(201).json(created);
    } catch (error) {
      console.error("Travel expense error:", error);
      res.status(500).json({ message: "Failed to create travel expense" });
    }
  });

  app.patch("/api/travel-expenses/:id", authenticateToken, async (req: any, res) => {
    try {
      const allExpenses = await storage.getTravelExpenses();
      const te = allExpenses.find(e => e.id === req.params.id);
      if (!te) return res.status(404).json({ message: "Travel expense not found" });
      const employees = await storage.getEmployees();
      const linkedEmployee = employees.find(e => e.userId === req.user.id);
      if (!linkedEmployee || te.employeeId !== linkedEmployee.id) {
        return res.status(403).json({ message: "You can only edit your own expenses" });
      }
      if (te.status !== "rejected") {
        return res.status(400).json({ message: "Only rejected expenses can be edited and resubmitted" });
      }
      const { notes, transportMode, originAddress, destAddress } = req.body;
      const newMode = transportMode || te.transportMode;
      const validModes = ["bus", "train", "bike"];
      if (!validModes.includes(newMode)) {
        return res.status(400).json({ message: "Invalid transport mode" });
      }
      const rates: Record<string, number> = { bus: 10, train: 5, bike: 20 };
      const dist = parseFloat(te.distance || "0");
      const newTravelCost = Math.round(dist * rates[newMode]);
      const lunchMoney = parseFloat(te.lunchMoney || "200");
      const newTotal = newTravelCost + lunchMoney;
      const updated = await storage.updateTravelExpense(req.params.id, {
        status: "pending",
        rejectionReason: null,
        approvedAt: null,
        notes: notes !== undefined ? notes : te.notes,
        transportMode: newMode,
        originAddress: originAddress !== undefined ? originAddress : te.originAddress,
        destAddress: destAddress !== undefined ? destAddress : te.destAddress,
        travelCost: String(newTravelCost),
        totalAmount: String(newTotal),
      });
      await logAction(req.user.id, "resubmit", "travel_expenses", `Resubmitted travel expense ${req.params.id}`);
      res.json(updated);
    } catch (error) {
      res.status(500).json({ message: "Failed to update travel expense" });
    }
  });

  app.patch("/api/travel-expenses/:id/approve", authenticateToken, requireRole("admin", "hr_manager"), async (req: any, res) => {
    try {
      const allExpenses = await storage.getTravelExpenses();
      const te = allExpenses.find(e => e.id === req.params.id);
      const updated = await storage.updateTravelExpense(req.params.id, { status: "approved", approvedAt: new Date() });
      if (!updated) return res.status(404).json({ message: "Travel expense not found" });
      await logAction(req.user.id, "approve", "travel_expenses", `Approved travel expense ${req.params.id}`);
      if (te) {
        const dateStr = new Date(te.date).toLocaleDateString("en-IN");
        await notifyEmployee(te.employeeId, "expense_approved", "Expense Approved", `Your expense of ₹${Number(te.totalAmount).toLocaleString("en-IN")} on ${dateStr} was approved.`, te.id);
      }
      res.json(updated);
    } catch (error) {
      res.status(500).json({ message: "Failed to approve travel expense" });
    }
  });

  app.patch("/api/travel-expenses/:id/disburse", authenticateToken, requireRole("admin", "hr_manager"), async (req: any, res) => {
    try {
      const updated = await storage.updateTravelExpense(req.params.id, { status: "disbursed", disbursedAt: new Date() });
      if (!updated) return res.status(404).json({ message: "Travel expense not found" });
      await logAction(req.user.id, "disburse", "travel_expenses", `Disbursed travel expense ${req.params.id}`);
      res.json(updated);
    } catch (error) {
      res.status(500).json({ message: "Failed to disburse travel expense" });
    }
  });

  app.patch("/api/travel-expenses/:id/reject", authenticateToken, requireRole("admin", "hr_manager"), async (req: any, res) => {
    try {
      const allExpenses = await storage.getTravelExpenses();
      const te = allExpenses.find(e => e.id === req.params.id);
      const { reason } = req.body;
      const rejectionReason = reason || "Rejected by manager";
      const updated = await storage.updateTravelExpense(req.params.id, { status: "rejected", rejectionReason });
      if (!updated) return res.status(404).json({ message: "Travel expense not found" });
      await logAction(req.user.id, "reject", "travel_expenses", `Rejected travel expense ${req.params.id}`);
      if (te) {
        const dateStr = new Date(te.date).toLocaleDateString("en-IN");
        await notifyEmployee(te.employeeId, "expense_rejected", "Expense Rejected", `Your expense of ₹${Number(te.totalAmount).toLocaleString("en-IN")} on ${dateStr} was rejected — Reason: ${rejectionReason}`, te.id);
      }
      res.json(updated);
    } catch (error) {
      res.status(500).json({ message: "Failed to reject travel expense" });
    }
  });

  app.patch("/api/travel-expenses/:id/resubmit", authenticateToken, async (req: any, res) => {
    try {
      const allExpenses = await storage.getTravelExpenses();
      const te = allExpenses.find(e => e.id === req.params.id);
      if (!te) return res.status(404).json({ message: "Travel expense not found" });
      if (te.status !== "rejected") return res.status(400).json({ message: "Only rejected expenses can be resubmitted" });
      const employees = await storage.getEmployees();
      const linkedEmployee = employees.find(e => e.userId === req.user.id);
      if (!linkedEmployee || te.employeeId !== linkedEmployee.id) {
        return res.status(403).json({ message: "You can only resubmit your own expenses" });
      }
      const { notes, transportMode } = req.body;
      const updated = await storage.updateTravelExpense(req.params.id, {
        status: "pending",
        rejectionReason: null,
        approvedAt: null,
        notes: notes !== undefined ? notes : te.notes,
        transportMode: transportMode || te.transportMode,
      });
      await logAction(req.user.id, "resubmit", "travel_expenses", `Resubmitted travel expense ${req.params.id}`);
      res.json(updated);
    } catch (error) {
      res.status(500).json({ message: "Failed to resubmit travel expense" });
    }
  });

  // ======================== LOCATION LOGS ========================
  app.get("/api/location-logs", authenticateToken, async (req: any, res) => {
    try {
      const data = await storage.getLocationLogs();
      if (req.user.role === "field_staff") {
        const employees = await storage.getEmployees();
        const linkedEmployee = employees.find(e => e.userId === req.user.id);
        if (!linkedEmployee) return res.json([]);
        return res.json(data.filter(log => log.employeeId === linkedEmployee.id));
      }
      res.json(data);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch location logs" });
    }
  });

  app.get("/api/location-logs/employee/:employeeId", authenticateToken, async (req, res) => {
    try {
      const { startDate, endDate } = req.query as any;
      const start = startDate ? new Date(startDate) : undefined;
      const end = endDate ? new Date(endDate) : undefined;
      const data = await storage.getLocationLogsByEmployee(req.params.employeeId, start, end);
      res.json(data);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch location logs" });
    }
  });

  app.get("/api/location-logs/employee/:employeeId/latest", authenticateToken, async (req, res) => {
    try {
      const data = await storage.getLatestLocationByEmployee(req.params.employeeId);
      res.json(data || null);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch latest location" });
    }
  });

  app.post("/api/location-logs", authenticateToken, async (req: any, res) => {
    try {
      const { employeeId, lat, lng, tripActive, tripId } = req.body;
      const parsedLat = parseFloat(lat); const parsedLng = parseFloat(lng);
      if (!employeeId || isNaN(parsedLat) || isNaN(parsedLng)) {
        return res.status(400).json({ message: "Missing or invalid required fields" });
      }
      const allEmps = await storage.getEmployees();
      if (!allEmps.find(e => e.id === employeeId)) {
        return res.status(400).json({ message: "Employee not found" });
      }
      const created = await storage.createLocationLog({
        employeeId, tripId: tripId || null, lat: String(parsedLat), lng: String(parsedLng),
        timestamp: new Date(), tripActive: tripActive !== false,
      });
      res.status(201).json(created);
    } catch (error) {
      res.status(500).json({ message: "Failed to create location log" });
    }
  });

  // Trips
  app.get("/api/trips", authenticateToken, async (req: any, res) => {
    try {
      const data = await storage.getTrips();
      if (req.user.role === "field_staff") {
        const employees = await storage.getEmployees();
        const linkedEmployee = employees.find(e => e.userId === req.user.id);
        if (!linkedEmployee) return res.json([]);
        return res.json(data.filter(t => t.employeeId === linkedEmployee.id));
      }
      res.json(data);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch trips" });
    }
  });

  app.get("/api/trips/active", authenticateToken, async (req: any, res) => {
    try {
      const data = await storage.getActiveTrips();
      if (req.user.role === "field_staff") {
        const employees = await storage.getEmployees();
        const linkedEmployee = employees.find(e => e.userId === req.user.id);
        if (!linkedEmployee) return res.json([]);
        return res.json(data.filter(t => t.employeeId === linkedEmployee.id));
      }
      res.json(data);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch active trips" });
    }
  });

  app.get("/api/trips/employee/:employeeId", authenticateToken, async (req: any, res) => {
    try {
      if (req.user.role === "field_staff") {
        const employees = await storage.getEmployees();
        const linked = employees.find(e => e.userId === req.user.id);
        if (!linked || linked.id !== req.params.employeeId) {
          return res.status(403).json({ message: "You can only view your own trips" });
        }
      }
      const data = await storage.getTripsByEmployee(req.params.employeeId);
      res.json(data);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch trips" });
    }
  });

  app.get("/api/trips/:id/route", authenticateToken, async (req: any, res) => {
    try {
      if (req.user.role === "field_staff") {
        const allTrips = await storage.getTrips();
        const trip = allTrips.find(t => t.id === req.params.id);
        if (!trip) return res.status(404).json({ message: "Trip not found" });
        const employees = await storage.getEmployees();
        const linked = employees.find(e => e.userId === req.user.id);
        if (!linked || trip.employeeId !== linked.id) {
          return res.status(403).json({ message: "You can only view your own trip routes" });
        }
      }
      const logs = await storage.getLocationLogsByTrip(req.params.id);
      res.json(logs);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch trip route" });
    }
  });

  app.post("/api/trips/start", authenticateToken, async (req: any, res) => {
    try {
      let { employeeId, lat, lng } = req.body;
      const allEmps = await storage.getEmployees();
      if (req.user.role === "field_staff") {
        const linked = allEmps.find(e => e.userId === req.user.id);
        if (!linked) return res.status(403).json({ message: "No employee record linked to your account" });
        if (employeeId && employeeId !== linked.id) {
          return res.status(403).json({ message: "Field staff can only start trips for themselves" });
        }
        employeeId = linked.id;
      }
      if (!employeeId) return res.status(400).json({ message: "Employee ID required" });
      if (!allEmps.find(e => e.id === employeeId)) {
        return res.status(400).json({ message: "Employee not found" });
      }
      const existingActive = await storage.getActiveTrips();
      const alreadyActive = existingActive.find(t => t.employeeId === employeeId);
      if (alreadyActive) {
        return res.status(400).json({ message: "Employee already has an active trip" });
      }
      const parsedLat = lat ? parseFloat(lat) : null;
      const parsedLng = lng ? parseFloat(lng) : null;
      const { address: startAddress } = req.body;
      const trip = await storage.createTrip({
        employeeId,
        startTime: new Date(),
        endTime: null,
        startLat: parsedLat !== null ? String(parsedLat) : null,
        startLng: parsedLng !== null ? String(parsedLng) : null,
        startAddress: startAddress || null,
        endLat: null,
        endLng: null,
        endAddress: null,
        status: "active",
        date: new Date(),
      });
      if (parsedLat !== null && parsedLng !== null) {
        await storage.createLocationLog({
          employeeId, tripId: trip.id, lat: String(parsedLat), lng: String(parsedLng),
          timestamp: new Date(), tripActive: true,
        });
      }
      res.status(201).json(trip);
    } catch (error) {
      res.status(500).json({ message: "Failed to start trip" });
    }
  });

  app.post("/api/trips/:id/end", authenticateToken, async (req: any, res) => {
    try {
      const { lat, lng, address: endAddress } = req.body;
      if (req.user.role === "field_staff") {
        const allTrips = await storage.getTrips();
        const trip = allTrips.find(t => t.id === req.params.id);
        if (!trip) return res.status(404).json({ message: "Trip not found" });
        const employees = await storage.getEmployees();
        const linked = employees.find(e => e.userId === req.user.id);
        if (!linked || trip.employeeId !== linked.id) {
          return res.status(403).json({ message: "You can only end your own trips" });
        }
      }
      const parsedLat = lat ? parseFloat(lat) : null;
      const parsedLng = lng ? parseFloat(lng) : null;
      const updated = await storage.updateTrip(req.params.id, {
        endTime: new Date(),
        endLat: parsedLat !== null ? String(parsedLat) : null,
        endLng: parsedLng !== null ? String(parsedLng) : null,
        endAddress: endAddress || null,
        status: "completed",
      });
      if (!updated) return res.status(404).json({ message: "Trip not found" });
      if (parsedLat !== null && parsedLng !== null) {
        await storage.createLocationLog({
          employeeId: updated.employeeId, tripId: updated.id,
          lat: String(parsedLat), lng: String(parsedLng),
          timestamp: new Date(), tripActive: false,
        });
      }
      res.json(updated);
    } catch (error) {
      res.status(500).json({ message: "Failed to end trip" });
    }
  });

  app.post("/api/trips/:id/log", authenticateToken, async (req: any, res) => {
    try {
      let { lat, lng, employeeId } = req.body;
      if (req.user.role === "field_staff") {
        const allTrips = await storage.getTrips();
        const trip = allTrips.find(t => t.id === req.params.id);
        if (!trip) return res.status(404).json({ message: "Trip not found" });
        const employees = await storage.getEmployees();
        const linked = employees.find(e => e.userId === req.user.id);
        if (!linked || trip.employeeId !== linked.id) {
          return res.status(403).json({ message: "You can only log location for your own trips" });
        }
        employeeId = linked.id;
      }
      const parsedLat = parseFloat(lat); const parsedLng = parseFloat(lng);
      if (isNaN(parsedLat) || isNaN(parsedLng) || !employeeId) {
        return res.status(400).json({ message: "Missing required fields" });
      }
      const created = await storage.createLocationLog({
        employeeId, tripId: req.params.id, lat: String(parsedLat), lng: String(parsedLng),
        timestamp: new Date(), tripActive: true,
      });
      res.status(201).json(created);
    } catch (error) {
      res.status(500).json({ message: "Failed to log location" });
    }
  });

  app.post("/api/employees/:id/generate-qr", authenticateToken, async (req: any, res) => {
    try {
      const employee = (await storage.getEmployees()).find(e => e.id === req.params.id);
      if (!employee) return res.status(404).json({ message: "Employee not found" });

      const qrCode = `NEXERP-EMP-${employee.id}`;
      await storage.updateEmployee(employee.id, { qrCode });

      const qrDataUrl = await QRCode.toDataURL(qrCode, { width: 300, margin: 2 });
      res.json({ qrCode, qrDataUrl, employeeName: employee.name });
    } catch (error) {
      res.status(500).json({ message: "Failed to generate QR code" });
    }
  });

  app.post("/api/employees/generate-all-qr", authenticateToken, async (req: any, res) => {
    try {
      const employees = await storage.getEmployees();
      const results = [];
      for (const emp of employees) {
        if (!emp.qrCode) {
          const qrCode = `NEXERP-EMP-${emp.id}`;
          await storage.updateEmployee(emp.id, { qrCode });
          results.push({ id: emp.id, name: emp.name, qrCode });
        } else {
          results.push({ id: emp.id, name: emp.name, qrCode: emp.qrCode });
        }
      }
      res.json(results);
    } catch (error) {
      res.status(500).json({ message: "Failed to generate QR codes" });
    }
  });

  app.get("/api/employees/:id/qr-image", async (req, res) => {
    try {
      const employee = (await storage.getEmployees()).find(e => e.id === req.params.id);
      if (!employee || !employee.qrCode) return res.status(404).json({ message: "QR code not found" });

      const qrDataUrl = await QRCode.toDataURL(employee.qrCode, { width: 400, margin: 2 });
      res.json({ qrDataUrl, qrCode: employee.qrCode, employeeName: employee.name });
    } catch (error) {
      res.status(500).json({ message: "Failed to get QR image" });
    }
  });

  // ======================== NOTIFICATIONS ========================
  app.get("/api/notifications", authenticateToken, async (req: any, res) => {
    try {
      const items = await storage.getNotifications(req.user.id);
      res.json(items);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch notifications" });
    }
  });

  app.patch("/api/notifications/:id/read", authenticateToken, async (req: any, res) => {
    try {
      const updated = await storage.markNotificationRead(req.params.id);
      if (!updated) return res.status(404).json({ message: "Notification not found" });
      res.json(updated);
    } catch (error) {
      res.status(500).json({ message: "Failed to mark notification read" });
    }
  });

  app.post("/api/notifications/read-all", authenticateToken, async (req: any, res) => {
    try {
      await storage.markAllNotificationsRead(req.user.id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Failed to mark all notifications read" });
    }
  });

  return httpServer;
}
