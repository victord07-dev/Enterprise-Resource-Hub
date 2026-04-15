import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { storage, IStorage } from "./storage";
import { db } from "./db";
import { sql, eq } from "drizzle-orm";
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
  insertSupplierInvoiceSchema, insertSupplierPaymentSchema,
  insertSalesInvoiceSchema, insertSalesInvoiceItemSchema, insertCustomerPaymentSchema,
  insertAttachmentSchema, attachments as attachmentsTable,
  salesReturns, salesReturnItems, stockMovements, creditNotes, salesInvoices, customers,
} from "@shared/schema";
import { registerObjectStorageRoutes } from "./replit_integrations/object_storage";
import { ObjectStorageService } from "./replit_integrations/object_storage/objectStorage";
import multer from "multer";

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
  const reservedStatuses = ["confirmed", "procurement", "ready_to_ship", "partial"];
  const allOrders = await storage.getSalesOrders();
  const activeOrders = allOrders.filter(o => reservedStatuses.includes(o.status) && o.id !== excludeOrderId);

  const reserved: Record<string, number> = {};
  for (const order of activeOrders) {
    const orderItems = await storage.getSalesOrderItems(order.id);
    const productItems = orderItems.filter(it => it.itemType === "product" && it.productId);
    if (productItems.length === 0) continue;

    const challans = await storage.getDeliveryChallansByOrder(order.id);
    const dispatchedMap: Record<string, number> = {};
    for (const challan of challans) {
      if (!["dispatched", "delivered", "partial"].includes(challan.status)) continue;
      const cItems = await storage.getDeliveryChallanItems(challan.id);
      for (const ci of cItems) {
        const qty = Number(ci.qtyDispatched ?? ci.quantity);
        dispatchedMap[ci.productId] = (dispatchedMap[ci.productId] || 0) + qty;
      }
    }

    for (const item of productItems) {
      const pid = item.productId!;
      const dispatched = dispatchedMap[pid] || 0;
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
        const dispatched = Number(ci.qtyDispatched ?? ci.quantity);
        dispatchedQty[ci.productId] = (dispatchedQty[ci.productId] || 0) + dispatched;
      }
      if (challan.status === "delivered") {
        const dispatched = Number(ci.qtyDispatched ?? ci.quantity);
        deliveredQty[ci.productId] = (deliveredQty[ci.productId] || 0) + dispatched;
      }
    }
  }

  const allDispatched = productItems.every(it => (dispatchedQty[it.productId!] || 0) >= it.quantity);
  const anyDispatched = productItems.some(it => (dispatchedQty[it.productId!] || 0) > 0);
  const allDelivered = productItems.every(it => (deliveredQty[it.productId!] || 0) >= it.quantity);

  if (allDelivered && ["dispatched", "partial", "shipped", "ready_to_ship", "confirmed", "procurement"].includes(order.status)) {
    await storage.updateSalesOrder(orderId, { status: "delivered" } as any);
  } else if (allDispatched && ["ready_to_ship", "confirmed", "partial", "procurement"].includes(order.status)) {
    await storage.updateSalesOrder(orderId, { status: "dispatched" } as any);
  } else if (anyDispatched && ["ready_to_ship", "confirmed", "procurement"].includes(order.status)) {
    await storage.updateSalesOrder(orderId, { status: "partial" } as any);
  }
}

// ─── FIFO Lot Engine ───────────────────────────────────────────────────────

interface FifoLot {
  grnId: string;
  grnNumber: string;
  lotDate: Date | null;
  remainingQty: number;
  landedCost: number;
  floorPrice: number;
}

async function computeFifoLots(
  productId: string,
  opts: { warehouseId?: string; minMarginPct?: number } = {}
): Promise<FifoLot[]> {
  const { warehouseId, minMarginPct: overrideMargin } = opts;

  // Resolve per-product minMarginPct if not supplied by caller
  let minMarginPct = overrideMargin ?? 5;
  if (overrideMargin === undefined) {
    const marginRes = await db.execute(sql`
      SELECT min_margin_pct FROM products WHERE id = ${productId} LIMIT 1
    `);
    if (marginRes.rows.length > 0) {
      minMarginPct = Number((marginRes.rows[0] as any).min_margin_pct ?? 5);
    }
  }

  // Step 1: confirmed GRN lots for this product, oldest first, optionally scoped to a warehouse.
  // When warehouseId is supplied, only GRNs received into that warehouse are included so
  // the FIFO lot pool reflects the warehouse's own stock — not cross-warehouse lots.
  const grnRes = warehouseId
    ? await db.execute(sql`
        SELECT
          gi.grn_id,
          grn.grn_number,
          grn.received_date,
          gi.received_quantity::numeric              AS received_qty,
          gi.buying_price::numeric                   AS buying_price,
          COALESCE(grn.delivery_cost::numeric, 0)    AS delivery_cost,
          GREATEST(
            (SELECT COALESCE(SUM(i2.received_quantity)::numeric, 1)
               FROM goods_receipt_note_items i2 WHERE i2.grn_id = grn.id),
            1
          ) AS total_grn_qty
        FROM goods_receipt_note_items gi
        JOIN goods_receipt_notes grn ON grn.id = gi.grn_id
        WHERE gi.product_id = ${productId}
          AND grn.status = 'confirmed'
          AND grn.warehouse_id = ${warehouseId}
        ORDER BY grn.received_date ASC, grn.id ASC
      `)
    : await db.execute(sql`
        SELECT
          gi.grn_id,
          grn.grn_number,
          grn.received_date,
          gi.received_quantity::numeric              AS received_qty,
          gi.buying_price::numeric                   AS buying_price,
          COALESCE(grn.delivery_cost::numeric, 0)    AS delivery_cost,
          GREATEST(
            (SELECT COALESCE(SUM(i2.received_quantity)::numeric, 1)
               FROM goods_receipt_note_items i2 WHERE i2.grn_id = grn.id),
            1
          ) AS total_grn_qty
        FROM goods_receipt_note_items gi
        JOIN goods_receipt_notes grn ON grn.id = gi.grn_id
        WHERE gi.product_id = ${productId}
          AND grn.status = 'confirmed'
        ORDER BY grn.received_date ASC, grn.id ASC
      `);

  // Step 2: net dispatched quantity (out minus returns) + actual movement count for logging.
  // Movement type strings in use: "out" for dispatch/adjustments, "RETURN_IN" for sales returns,
  // "in" with reference_type="SALES_RETURN" for alternate return pattern.
  // Filter by warehouse_id when provided so lot engine is warehouse-scoped.
  let netRes;
  let movementCount = 0;
  if (warehouseId) {
    netRes = await db.execute(sql`
      SELECT
        COUNT(*)::integer AS movement_count,
        COALESCE(SUM(CASE WHEN movement_type = 'out' THEN quantity ELSE 0 END), 0)::numeric AS total_out,
        COALESCE(SUM(CASE
          WHEN movement_type = 'RETURN_IN' THEN quantity
          WHEN movement_type = 'in' AND reference_type = 'SALES_RETURN' THEN quantity
          ELSE 0
        END), 0)::numeric AS total_return
      FROM stock_movements
      WHERE product_id = ${productId}
        AND warehouse_id = ${warehouseId}
    `);
  } else {
    netRes = await db.execute(sql`
      SELECT
        COUNT(*)::integer AS movement_count,
        COALESCE(SUM(CASE WHEN movement_type = 'out' THEN quantity ELSE 0 END), 0)::numeric AS total_out,
        COALESCE(SUM(CASE
          WHEN movement_type = 'RETURN_IN' THEN quantity
          WHEN movement_type = 'in' AND reference_type = 'SALES_RETURN' THEN quantity
          ELSE 0
        END), 0)::numeric AS total_return
      FROM stock_movements
      WHERE product_id = ${productId}
    `);
  }

  const nr = netRes.rows[0] as any;
  movementCount = Number((nr as any).movement_count ?? 0);
  let toDeplete = Math.max(0, Number(nr.total_out) - Number(nr.total_return));

  // Step 3: FIFO assignment — oldest lots consumed first
  const lots: FifoLot[] = [];

  for (const row of grnRes.rows as any[]) {
    const receivedQty  = Number(row.received_qty);
    const buyingPrice  = Number(row.buying_price ?? 0);
    const deliveryCost = Number(row.delivery_cost ?? 0);
    const totalGrnQty  = Number(row.total_grn_qty ?? receivedQty) || 1;
    // landedCost = buyingPrice + apportioned delivery cost per unit (no landedCostPerUnit field)
    const landedCost   = buyingPrice + deliveryCost / totalGrnQty;
    // floorPrice uses per-product minMarginPct — blendedCost × (1 + minMarginPct/100)
    const floorPrice   = parseFloat((landedCost * (1 + minMarginPct / 100)).toFixed(2));

    let lotRemaining: number;
    if (toDeplete >= receivedQty) {
      toDeplete -= receivedQty;
      lotRemaining = 0;
    } else {
      lotRemaining = receivedQty - toDeplete;
      toDeplete = 0;
    }

    if (lotRemaining > 0) {
      lots.push({
        grnId:        row.grn_id,
        grnNumber:    row.grn_number,
        lotDate:      row.received_date ? new Date(row.received_date) : null,
        remainingQty: parseFloat(lotRemaining.toFixed(3)),
        landedCost:   parseFloat(landedCost.toFixed(2)),
        floorPrice,
      });
    }
  }

  // Step 4: compute blendedCost and floors for logging
  const totalRemQty = lots.reduce((s, l) => s + l.remainingQty, 0);
  const blendedCost = totalRemQty > 0
    ? lots.reduce((s, l) => s + l.landedCost * l.remainingQty, 0) / totalRemQty
    : 0;
  // globalFloor = blendedCost × (1 + minMarginPct/100)  ← NOT min(lotFloors)
  const globalFloor = blendedCost > 0 ? parseFloat((blendedCost * (1 + minMarginPct / 100)).toFixed(2)) : 0;
  const strictFloor = lots.length > 0 ? Math.max(...lots.map(l => l.floorPrice)) : 0;

  console.log(`[FIFO] productId=${productId} warehouseId=${warehouseId ?? "all"} movementCount=${movementCount} lotCount=${lots.length} blendedCost=${blendedCost.toFixed(2)} globalFloor=${globalFloor} strictFloor=${strictFloor} minMarginPct=${minMarginPct}`);

  if (process.env.DEBUG_LOT_ENGINE === "true") {
    for (const l of lots) {
      console.log(`  [FIFO LOT] grnId=${l.grnId} grnNumber=${l.grnNumber} remainingQty=${l.remainingQty} landedCost=${l.landedCost} floorPrice=${l.floorPrice}`);
    }
  }

  return lots;
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  // Seed kiosk user
  const existingKiosk = await storage.getUserByUsername("kiosk");
  if (!existingKiosk) {
    const kioskPassword = await bcrypt.hash("kiosk@itfi2026", 10);
    await storage.createUser({
      username: "kiosk",
      password: kioskPassword,
      fullName: "Kiosk Terminal",
      email: "kiosk@itfi.co.in",
      role: "kiosk",
      isActive: true,
    });
    console.log("Kiosk user seeded: kiosk / kiosk@itfi2026");
  }

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
  app.get("/api/users", authenticateToken, requireRole("admin", "hr_manager"), async (req: any, res) => {
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
      // Block unitPrice edits when a confirmed daily price sheet exists for today
      if (req.body.unitPrice !== undefined) {
        const today = new Date().toISOString().slice(0, 10);
        const existingSheet = await storage.getDailyPriceSheetByProductDate(req.params.id, today);
        if (existingSheet && existingSheet.status === "confirmed") {
          return res.status(409).json({
            message: "Cannot manually edit unitPrice while a confirmed daily price sheet exists for today. Use the pricing workflow instead.",
            sheetId: existingSheet.id,
          });
        }
      }
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
      // Strip client-provided totals — server recomputes these authoritatively when items are saved
      delete body.subtotal;
      delete body.totalTax;
      delete body.totalAmount;
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
      // Strip client-provided totals — server is the authority; recomputes below if discount/delivery changes
      delete body.subtotal;
      delete body.totalTax;
      delete body.totalAmount;
      const previousOrder = await storage.getSalesOrder(req.params.id);
      let updated = await storage.updateSalesOrder(req.params.id, body);
      if (!updated) return res.status(404).json({ message: "Sales order not found" });
      await logAction(req.user.id, "update", "sales", `Updated sales order ${updated.orderNumber}`);

      // Recompute order totals if discount or delivery fields changed to keep stored totals consistent
      const totalsAffectingFields = ["discountType", "discountValue", "deliveryCost"];
      if (totalsAffectingFields.some(f => f in req.body)) {
        try {
          const items = await storage.getSalesOrderItems(updated.id);
          if (items.length > 0) {
            const subtotal = items.reduce((s, it) => s + Number(it.quantity) * Number(it.unitPrice), 0);
            const totalTax = items.reduce((s, it) => s + Number(it.taxAmount || 0), 0);
            const dType = updated.discountType;
            const dValue = Number(updated.discountValue) || 0;
            const discount = dType === "percentage" ? subtotal * dValue / 100 : dType === "fixed" ? Math.min(dValue, subtotal) : 0;
            const deliveryCost = Number(updated.deliveryCost) || 0;
            const totalAmount = subtotal - discount + totalTax + deliveryCost;
            updated = await storage.updateSalesOrder(updated.id, { subtotal: subtotal.toFixed(2), totalTax: totalTax.toFixed(2), totalAmount: totalAmount.toFixed(2) } as any) || updated;
          }
        } catch (err) { console.error("Non-fatal: failed to recompute SO totals after discount/delivery patch:", err); }
      }

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

  // GET dispatch-time FIFO lot margin estimates for sales order line items
  // Restricted to pricing roles — exposes cost/margin data
  app.get("/api/sales-orders/:id/lot-margins", authenticateToken, requireRole("admin", "sales_manager", "accountant"), async (req, res) => {
    try {
      const orderId = req.params.id;
      const items = await storage.getSalesOrderItems(orderId);

      // Get dispatched challans for this order (must exist for margin to be meaningful)
      const challanRes = await db.execute(sql`
        SELECT id, dispatch_date FROM delivery_challans
        WHERE order_id = ${orderId} AND status = 'dispatched' AND dispatch_date IS NOT NULL
        ORDER BY dispatch_date ASC
      `);
      const dispatchedChallans = challanRes.rows as any[];

      if (dispatchedChallans.length === 0) {
        // No dispatched challans — margin is not computable at dispatch time
        return res.json(items.map(it => ({
          itemId: it.id,
          productId: it.itemType === "product" ? it.productId : null,
          blendedCost: null,
          estimatedMarginPct: null,
        })));
      }

      // Earliest dispatch date = the "as of" point for this order's FIFO state.
      // All 'out' movements with created_at < firstDispatchDate are "prior" dispatches from other orders.
      const firstDispatchDate = new Date(dispatchedChallans[0].dispatch_date);

      // Fetch actually dispatched quantities per product across all dispatched challans for this order.
      // This handles partial dispatches correctly by using qty_dispatched (not ordered qty).
      // Uses a JOIN to avoid any raw string interpolation — fully parameterized via orderId.
      const dispatchedQtyRes = await db.execute(sql`
        SELECT dci.product_id, COALESCE(SUM(dci.qty_dispatched::numeric), 0) AS dispatched_qty
        FROM delivery_challan_items dci
        JOIN delivery_challans dc ON dc.id = dci.challan_id
        WHERE dc.order_id = ${orderId}
          AND dc.status = 'dispatched'
          AND dci.qty_dispatched IS NOT NULL
          AND dci.qty_dispatched::numeric > 0
        GROUP BY dci.product_id
      `);
      const dispatchedQtyMap = new Map<string, number>();
      for (const row of dispatchedQtyRes.rows as any[]) {
        dispatchedQtyMap.set(row.product_id, Number(row.dispatched_qty));
      }

      const result: any[] = [];
      for (const item of items) {
        if (item.itemType !== "product" || !item.productId) {
          result.push({ itemId: item.id, productId: null, blendedCost: null, estimatedMarginPct: null });
          continue;
        }

        // Use actually dispatched quantity (partial dispatch aware); fall back to ordered qty
        const dispatchedQty = dispatchedQtyMap.get(item.productId) ?? item.quantity;

        let blendedCost: number | null = null;
        let estimatedMarginPct: number | null = null;

        try {
          // Step 1: GRN lots confirmed at or before first dispatch date, FIFO ordered (oldest first)
          const grnRes = await db.execute(sql`
            SELECT
              gi.received_quantity::numeric                           AS qty,
              gi.buying_price::numeric                               AS buying_price,
              COALESCE(g.delivery_cost::numeric, 0)                  AS delivery_cost,
              GREATEST(
                (SELECT COALESCE(SUM(i2.received_quantity)::numeric, 1)
                 FROM goods_receipt_note_items i2 WHERE i2.grn_id = g.id),
                1
              )                                                      AS total_grn_qty
            FROM goods_receipt_note_items gi
            JOIN goods_receipt_notes g ON g.id = gi.grn_id
            WHERE gi.product_id = ${item.productId}
              AND g.status = 'confirmed'
              AND g.received_date <= ${firstDispatchDate.toISOString()}
            ORDER BY g.received_date ASC, g.id ASC
          `);

          // Step 2: Prior net out movements = all out movements created BEFORE this order's first dispatch.
          // Using created_at < firstDispatchDate excludes this order's own challan movements.
          const priorRes = await db.execute(sql`
            SELECT
              COALESCE(SUM(CASE WHEN movement_type = 'out' THEN quantity ELSE 0 END), 0)::numeric AS total_out,
              COALESCE(SUM(CASE
                WHEN movement_type = 'RETURN_IN' THEN quantity
                WHEN movement_type = 'in' AND reference_type = 'SALES_RETURN' THEN quantity
                ELSE 0
              END), 0)::numeric AS total_return
            FROM stock_movements
            WHERE product_id = ${item.productId}
              AND created_at < ${firstDispatchDate.toISOString()}
          `);
          const priorNet = Math.max(
            0,
            Number((priorRes.rows[0] as any)?.total_out ?? 0) -
            Number((priorRes.rows[0] as any)?.total_return ?? 0)
          );

          // Step 3: FIFO depletion — consume prior out from earliest GRN lots
          let toDeplete = priorNet;
          const availableLots: Array<{ landedCost: number; qty: number }> = [];
          for (const row of grnRes.rows as any[]) {
            const receivedQty = Number(row.qty);
            const landedCost = Number(row.buying_price) + Number(row.delivery_cost) / Number(row.total_grn_qty);
            let remaining: number;
            if (toDeplete >= receivedQty) {
              toDeplete -= receivedQty;
              remaining = 0;
            } else {
              remaining = receivedQty - toDeplete;
              toDeplete = 0;
            }
            if (remaining > 0 && landedCost > 0) {
              availableLots.push({ landedCost, qty: remaining });
            }
          }

          // Step 4: Consume this order's DISPATCHED quantity from available lots in FIFO order
          let qtyToConsume = dispatchedQty;
          let totalCostConsumed = 0;
          let totalQtyConsumed = 0;
          for (const lot of availableLots) {
            if (qtyToConsume <= 0) break;
            const qtyFromLot = Math.min(lot.qty, qtyToConsume);
            totalCostConsumed += qtyFromLot * lot.landedCost;
            totalQtyConsumed += qtyFromLot;
            qtyToConsume -= qtyFromLot;
          }
          // Fallback for remaining qty not covered by FIFO lots (negative stock / data gaps):
          // use blended average of all available lots at dispatch time
          if (qtyToConsume > 0 && availableLots.length > 0) {
            const allLotTotalQty = availableLots.reduce((s, l) => s + l.qty, 0);
            const allLotBlended = allLotTotalQty > 0
              ? availableLots.reduce((s, l) => s + l.landedCost * l.qty, 0) / allLotTotalQty
              : 0;
            if (allLotBlended > 0) {
              totalCostConsumed += qtyToConsume * allLotBlended;
              totalQtyConsumed += qtyToConsume;
            }
          }

          if (totalQtyConsumed > 0) {
            blendedCost = parseFloat((totalCostConsumed / totalQtyConsumed).toFixed(2));
            const unitPrice = Number(item.unitPrice);
            if (unitPrice > 0) {
              estimatedMarginPct = parseFloat(((unitPrice - blendedCost) / unitPrice * 100).toFixed(2));
            }
          }
        } catch (e: any) {
          console.error(`[lot-margins] orderId=${orderId} productId=${item.productId}: ${e.message}`);
        }
        result.push({ itemId: item.id, productId: item.productId, blendedCost, estimatedMarginPct, dispatchedQty });
      }
      res.json(result);
    } catch (err: any) {
      console.error("[lot-margins]", err);
      res.status(500).json({ message: err.message || "Failed to compute lot margins" });
    }
  });

  app.post("/api/sales-orders/:id/items", authenticateToken, requireRole("admin", "sales_manager"), async (req: any, res) => {
    try {
      const items = req.body.items;
      if (!Array.isArray(items) || items.length === 0) return res.status(400).json({ message: "Items must be a non-empty array" });
      await storage.deleteSalesOrderItems(req.params.id);
      const created = [];
      for (const item of items) {
        const qty = Number(item.quantity) || 0;
        const unitPrice = Number(item.unitPrice) || 0;
        const gstRate = Number(item.gstRate) || 0;
        const serverTaxAmount = parseFloat((qty * unitPrice * gstRate / 100).toFixed(2));
        const parsed = insertSalesOrderItemSchema.parse({
          ...item,
          orderId: req.params.id,
          taxAmount: serverTaxAmount.toString(),
        });
        const c = await storage.createSalesOrderItem(parsed);
        created.push(c);
      }

      // Recompute order-level totals from saved items (authoritative server calculation)
      const order = await storage.getSalesOrder(req.params.id);
      if (order) {
        const subtotal = created.reduce((sum, it) => sum + Number(it.quantity) * Number(it.unitPrice), 0);
        const totalTax = created.reduce((sum, it) => sum + Number(it.taxAmount || 0), 0);
        const discountType = order.discountType;
        const discountValue = Number(order.discountValue) || 0;
        const discount = discountType === "percentage"
          ? subtotal * discountValue / 100
          : discountType === "fixed"
          ? Math.min(discountValue, subtotal)
          : 0;
        const deliveryCost = Number(order.deliveryCost) || 0;
        const totalAmount = subtotal - discount + totalTax + deliveryCost;
        await storage.updateSalesOrder(req.params.id, {
          subtotal: subtotal.toFixed(2),
          totalTax: totalTax.toFixed(2),
          totalAmount: totalAmount.toFixed(2),
        } as any);
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
      // Flag product for pricing review when supplier price changes
      // Not wrapped in try/catch — failure here surfaces as HTTP 500 so state can't silently drift
      if (filtered.supplierPrice !== undefined) {
        await db.execute(sql`UPDATE products SET needs_pricing_review = true WHERE id = ${updated.productId}`);
      }
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
  async function addLedgerEntry(
    tx: Awaited<Parameters<Parameters<typeof db.transaction>[0]>[0]>,
    params: {
      productId: string;
      warehouseId: string;
      movementType: string;
      quantity: number;
      referenceType?: string;
      referenceId?: string;
      grnId?: string;
      notes?: string;
      createdBy: string;
    }
  ) {
    const mvResult = await tx.execute(sql`
      INSERT INTO stock_movements (id, product_id, warehouse_id, movement_type, quantity, reference_type, reference_id, grn_id, notes, created_by, created_at)
      VALUES (gen_random_uuid(), ${params.productId}, ${params.warehouseId}, ${params.movementType}, ${params.quantity},
              ${params.referenceType ?? null}, ${params.referenceId ?? null}, ${params.grnId ?? null}, ${params.notes ?? null}, ${params.createdBy}, now())
      RETURNING *
    `);
    const movement = mvResult.rows[0];

    const qtyDelta = params.movementType === "out" ? -Math.abs(params.quantity) : params.quantity;

    const updateResult = await tx.execute(sql`
      UPDATE inventory_stock
      SET quantity = quantity + ${qtyDelta}
      WHERE product_id = ${params.productId} AND warehouse_id = ${params.warehouseId}
      RETURNING id
    `);

    if (updateResult.rows.length === 0) {
      await tx.execute(sql`
        INSERT INTO inventory_stock (id, product_id, warehouse_id, quantity)
        VALUES (gen_random_uuid(), ${params.productId}, ${params.warehouseId}, ${Math.max(0, qtyDelta)})
      `);
    }

    return movement;
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
      const reservedStatuses = ["confirmed", "procurement", "ready_to_ship", "partial"];
      const allOrders = await storage.getSalesOrders();
      const activeOrders = allOrders.filter(o => reservedStatuses.includes(o.status));

      // result[productId].orders stores all reservations with optional warehouseId for scoping
      const result: Record<string, { total: number; orders: Array<{ orderId: string; orderNumber: string; quantity: number; expectedDeliveryDate: string | null; reservationStatus: string; warehouseId: string | null }> }> = {};

      for (const order of activeOrders) {
        const orderItems = await storage.getSalesOrderItems(order.id);
        const productItems = orderItems.filter(it => it.itemType === "product" && it.productId);
        if (productItems.length === 0) continue;

        const challans = await storage.getDeliveryChallansByOrder(order.id);
        const dispatchedMap: Record<string, number> = {};
        for (const challan of challans) {
          if (!["dispatched", "delivered", "partial"].includes(challan.status)) continue;
          const cItems = await storage.getDeliveryChallanItems(challan.id);
          for (const ci of cItems) {
            const qty = Number(ci.qtyDispatched ?? ci.quantity);
            dispatchedMap[ci.productId] = (dispatchedMap[ci.productId] || 0) + qty;
          }
        }

        const orderWarehouseId = order.warehouseId ?? null;

        for (const item of productItems) {
          const pid = item.productId!;
          const dispatched = dispatchedMap[pid] || 0;
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
            warehouseId: orderWarehouseId,
          });
        }
      }

      // Fetch physical stock with per-warehouse breakdown for warehouse-aware capping
      const allStock = await storage.getInventoryStock();
      // stockByProduct: total across all warehouses
      const stockByProduct: Record<string, number> = {};
      // stockByProductAndWarehouse: per-warehouse physical stock
      const stockByProductAndWarehouse: Record<string, Record<string, number>> = {};
      for (const s of allStock) {
        stockByProduct[s.productId] = (stockByProduct[s.productId] || 0) + (s.quantity ?? 0);
        if (s.warehouseId) {
          if (!stockByProductAndWarehouse[s.productId]) stockByProductAndWarehouse[s.productId] = {};
          stockByProductAndWarehouse[s.productId][s.warehouseId] = (stockByProductAndWarehouse[s.productId][s.warehouseId] || 0) + (s.quantity ?? 0);
        }
      }

      for (const pid of Object.keys(result)) {
        const totalPhysical = stockByProduct[pid] || 0;
        const warehousePhysical = stockByProductAndWarehouse[pid] || {};

        // Separate warehouse-scoped and global reservations
        const warehouseOrders = result[pid].orders.filter(o => o.warehouseId !== null);
        const globalOrders = result[pid].orders.filter(o => o.warehouseId === null);

        // Group warehouse-scoped orders by warehouse and cap each group against its warehouse stock
        const byWarehouse: Record<string, typeof warehouseOrders> = {};
        for (const o of warehouseOrders) {
          if (!byWarehouse[o.warehouseId!]) byWarehouse[o.warehouseId!] = [];
          byWarehouse[o.warehouseId!].push(o);
        }
        let totalWarehouseReserved = 0;
        for (const [wid, wOrders] of Object.entries(byWarehouse)) {
          const wStock = warehousePhysical[wid] || 0;
          const wTotal = wOrders.reduce((s, o) => s + o.quantity, 0);
          if (wTotal > wStock) {
            const ratio = wStock > 0 ? wStock / wTotal : 0;
            let remaining = wStock;
            for (const o of wOrders) {
              const capped = Math.min(Math.floor(o.quantity * ratio), remaining);
              o.quantity = capped;
              remaining -= capped;
            }
            if (remaining > 0 && wOrders.length > 0) wOrders[0].quantity += remaining;
          }
          totalWarehouseReserved += wOrders.reduce((s, o) => s + o.quantity, 0);
        }

        // Cap global reservations against remaining stock after warehouse allocations
        const globalPool = Math.max(0, totalPhysical - totalWarehouseReserved);
        const totalGlobalReserved = globalOrders.reduce((s, o) => s + o.quantity, 0);
        if (totalGlobalReserved > globalPool) {
          const ratio = globalPool > 0 ? globalPool / totalGlobalReserved : 0;
          let remaining = globalPool;
          for (const o of globalOrders) {
            const capped = Math.min(Math.floor(o.quantity * ratio), remaining);
            o.quantity = capped;
            remaining -= capped;
          }
          if (remaining > 0 && globalOrders.length > 0) globalOrders[0].quantity += remaining;
        }

        const allOrders = [...warehouseOrders, ...globalOrders].filter(o => o.quantity > 0);
        result[pid].orders = allOrders;
        result[pid].total = allOrders.reduce((s, o) => s + o.quantity, 0);
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

  app.get("/api/inventory/ledger", authenticateToken, async (req: any, res) => {
    try {
      const { productId, warehouseId, type } = req.query as Record<string, string>;
      const allMovements = await storage.getStockMovements();
      const allProducts = await storage.getProducts();
      const allWarehouses = await storage.getWarehouses();
      const allGRNs = await storage.getGRNs();
      const allChallans = await storage.getDeliveryChallans();

      const productMap = new Map(allProducts.map((p: any) => [p.id, p]));
      const warehouseMap = new Map(allWarehouses.map((w: any) => [w.id, w]));
      const grnMap = new Map(allGRNs.map((g: any) => [g.id, g]));
      const challanMap = new Map(allChallans.map((c: any) => [c.id, c]));

      let filtered = allMovements as any[];

      if (productId) filtered = filtered.filter((m: any) => m.productId === productId);
      if (warehouseId) filtered = filtered.filter((m: any) => m.warehouseId === warehouseId);
      if (type === "grn") filtered = filtered.filter((m: any) => m.referenceType === "grn");
      else if (type === "dispatch") filtered = filtered.filter((m: any) => m.referenceType === "challan");
      else if (type === "adjustment") filtered = filtered.filter((m: any) => m.referenceType === "manual" || (!m.referenceType && m.referenceType !== "grn" && m.referenceType !== "challan"));

      const enriched = filtered
        .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .map((m: any) => {
          const product = productMap.get(m.productId);
          const warehouse = warehouseMap.get(m.warehouseId);
          let referenceLabel = "";
          let referenceNumber = "";
          if (m.referenceType === "grn" && m.referenceId) {
            const grn = grnMap.get(m.referenceId);
            referenceLabel = "GRN";
            referenceNumber = grn?.grnNumber || m.referenceId.slice(0, 8);
          } else if (m.referenceType === "challan" && m.referenceId) {
            const challan = challanMap.get(m.referenceId);
            referenceLabel = "DC";
            referenceNumber = challan?.challanNumber || m.referenceId.slice(0, 8);
          } else if (m.referenceType === "manual" || !m.referenceType) {
            referenceLabel = "Manual";
            referenceNumber = "";
          } else {
            referenceLabel = m.referenceType?.toUpperCase() || "—";
            referenceNumber = m.referenceId?.slice(0, 8) || "";
          }
          return {
            ...m,
            productName: product?.name || m.productId,
            warehouseName: warehouse?.name || (m.warehouseId ? m.warehouseId.slice(0, 8) : "—"),
            referenceLabel,
            referenceNumber,
          };
        });

      res.json(enriched);
    } catch (error) {
      console.error("Ledger fetch error:", error);
      res.status(500).json({ message: "Failed to fetch inventory ledger" });
    }
  });

  // GET /api/inventory/stock-lot-summary — FIFO lot breakdown for a product, optionally scoped to a warehouse
  app.get("/api/inventory/stock-lot-summary", authenticateToken, async (req: any, res) => {
    try {
      const { productId, warehouseId } = req.query as { productId?: string; warehouseId?: string };
      if (!productId) return res.status(400).json({ message: "productId is required" });

      const product = await storage.getProduct(productId);
      if (!product) return res.status(404).json({ message: "Product not found" });

      const lots = await computeFifoLots(productId, { warehouseId: warehouseId || undefined });

      const activeLots = lots.filter(l => l.remainingQty > 0);
      const totalRemQty = activeLots.reduce((s, l) => s + l.remainingQty, 0);

      let blendedCost: number | null = null;
      let globalFloor: number | null = null;
      let strictFloor: number | null = null;

      if (totalRemQty > 0) {
        blendedCost = parseFloat(
          (activeLots.reduce((s, l) => s + l.landedCost * l.remainingQty, 0) / totalRemQty).toFixed(2)
        );
        const minMarginPct = Number((product as any).minMarginPct ?? 5);
        globalFloor = parseFloat((blendedCost * (1 + minMarginPct / 100)).toFixed(2));
        strictFloor = parseFloat(Math.max(...activeLots.map(l => l.floorPrice)).toFixed(2));
      }

      res.json({
        productId,
        warehouseId: warehouseId || null,
        lots: activeLots.map(l => ({
          grnId: l.grnId,
          grnNumber: l.grnNumber,
          receivedDate: l.lotDate,
          remainingQty: l.remainingQty,
          landedCost: l.landedCost,
          lotFloorPrice: l.floorPrice,
        })),
        blendedCost,
        globalFloor,
        strictFloor,
      });
    } catch (error) {
      console.error("Stock lot summary error:", error);
      res.status(500).json({ message: "Failed to compute stock lot summary" });
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

      const manualRefType = parsed.data.referenceType ?? "manual";

      let movement: any;
      if (parsed.data.warehouseId) {
        movement = await db.transaction(async (tx) => {
          return await addLedgerEntry(tx, {
            productId: parsed.data.productId,
            warehouseId: parsed.data.warehouseId!,
            movementType: parsed.data.movementType,
            quantity: parsed.data.quantity,
            referenceType: manualRefType,
            referenceId: parsed.data.referenceId ?? undefined,
            notes: parsed.data.notes ?? undefined,
            createdBy: parsed.data.createdBy,
          });
        });
      } else {
        movement = await storage.createStockMovement({ ...parsed.data, referenceType: manualRefType } as any);
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

      if (challanData.orderId) {
        const allChallansCheck = await storage.getDeliveryChallans();
        const existingDraft = allChallansCheck.find((c: any) => c.orderId === challanData.orderId && c.status === "draft");
        if (existingDraft) {
          return res.status(409).json({ message: "A draft challan already exists for this order", challanId: existingDraft.id });
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

  app.post("/api/delivery-challans/create-from-so/:soId", authenticateToken, async (req: any, res) => {
    try {
      const { soId } = req.params;
      const order = await storage.getSalesOrder(soId);
      if (!order) return res.status(404).json({ message: "Sales order not found" });

      const eligibleStatuses = ["confirmed", "procurement", "ready_to_ship", "partial"];
      if (!eligibleStatuses.includes(order.status)) {
        return res.status(400).json({ message: "Sales order is not in a dispatchable state" });
      }

      const allChallans = await storage.getDeliveryChallans();
      const existingDraft = allChallans.find((c: any) => c.orderId === soId && c.status === "draft");
      if (existingDraft) {
        const draftItems = await storage.getDeliveryChallanItems(existingDraft.id);
        return res.status(409).json({ message: "A draft challan already exists for this order", challan: { ...existingDraft, items: draftItems } });
      }

      const orderItems = await storage.getSalesOrderItems(soId);
      const productItems = orderItems.filter(it => it.itemType === "product" && it.productId);
      if (productItems.length === 0) {
        return res.status(400).json({ message: "Order has no product line items" });
      }

      const dispatchedSoFar: Record<string, number> = {};
      const soChallans = allChallans.filter((c: any) => c.orderId === soId && !["cancelled", "draft"].includes(c.status));
      for (const challan of soChallans) {
        const cItems = await storage.getDeliveryChallanItems(challan.id);
        for (const ci of cItems) {
          const dispatched = Number(ci.qtyDispatched ?? ci.quantity);
          dispatchedSoFar[ci.productId] = (dispatchedSoFar[ci.productId] || 0) + dispatched;
        }
      }

      const pendingItems = productItems.filter(it => {
        const remaining = it.quantity - (dispatchedSoFar[it.productId!] || 0);
        return remaining > 0;
      });
      if (pendingItems.length === 0) {
        return res.status(400).json({ message: "All items have already been dispatched" });
      }

      const { vehicleNumber, driverName, notes, deliveryAddress } = req.body;
      const sourceType = "warehouse";
      let sourceId: string;
      if (order.warehouseId) {
        sourceId = order.warehouseId;
      } else {
        const allWarehouses = await storage.getWarehouses();
        if (allWarehouses.length > 0) {
          sourceId = allWarehouses[0].id;
        } else {
          return res.status(400).json({ message: "No warehouse configured for dispatch" });
        }
      }

      const year = new Date().getFullYear();
      const yearChallans = allChallans.filter((c: any) => c.challanNumber.startsWith(`DC-${year}`));
      const nextNum = yearChallans.length + 1;
      const challanNumber = `DC-${year}-${String(nextNum).padStart(4, "0")}`;

      const challanAddr = deliveryAddress || (order as any).deliveryAddress || null;
      const challan = await storage.createDeliveryChallan({
        challanNumber,
        orderId: soId,
        customerId: (order as any).customerId || null,
        sourceType,
        sourceId,
        status: "draft",
        vehicleNumber: vehicleNumber || null,
        driverName: driverName || null,
        notes: notes || null,
        deliveryAddress: challanAddr,
        dispatchBatchId: null,
        dispatchDate: null,
        deliveryDate: null,
        createdBy: req.user.id,
      } as any);

      const createdItems = [];
      for (const it of pendingItems) {
        const remaining = it.quantity - (dispatchedSoFar[it.productId!] || 0);
        const ci = await storage.createDeliveryChallanItem({
          challanId: challan.id,
          productId: it.productId!,
          description: it.description || null,
          quantity: remaining,
          unitPrice: it.unitPrice ?? null,
          qtyOrdered: String(it.quantity),
          qtyReserved: String(remaining),
          qtyToDispatch: String(remaining),
          qtyDispatched: "0",
        });
        createdItems.push(ci);
      }

      res.status(201).json({ ...challan, items: createdItems });
    } catch (error) {
      console.error("create-from-so error:", error);
      res.status(500).json({ message: "Failed to create challan from sales order" });
    }
  });

  app.patch("/api/delivery-challans/:id/items", authenticateToken, async (req: any, res) => {
    try {
      const challan = await storage.getDeliveryChallan(req.params.id);
      if (!challan) return res.status(404).json({ message: "Challan not found" });
      if (challan.status !== "draft") return res.status(400).json({ message: "Can only update items on draft challans" });

      const { items } = req.body;
      if (!Array.isArray(items)) return res.status(400).json({ message: "items must be an array" });

      const challanItems = await storage.getDeliveryChallanItems(challan.id);
      const updatedItems = [];

      for (const update of items) {
        const existing = challanItems.find(ci => ci.id === update.id);
        if (!existing) continue;
        const qtyToDispatch = Number(update.qtyToDispatch ?? update.quantity ?? 0);
        if (qtyToDispatch <= 0) return res.status(400).json({ message: "qtyToDispatch must be greater than 0" });
        const qtyReserved = Number(existing.qtyReserved ?? existing.qtyOrdered ?? existing.quantity);
        const alreadyDispatched = Number(existing.qtyDispatched ?? 0);
        const maxAllowed = qtyReserved - alreadyDispatched;
        if (qtyToDispatch > maxAllowed) {
          return res.status(400).json({ message: `qtyToDispatch (${qtyToDispatch}) exceeds remaining reserved quantity (${maxAllowed})` });
        }
        const updated = await storage.updateDeliveryChallanItem(existing.id, { qtyToDispatch: String(qtyToDispatch) });
        updatedItems.push(updated);
      }

      res.json(updatedItems);
    } catch (error) {
      console.error("patch challan items error:", error);
      res.status(500).json({ message: "Failed to update challan items" });
    }
  });

  app.get("/api/sales-orders/:id/dispatch-summary", authenticateToken, async (req: any, res) => {
    try {
      const order = await storage.getSalesOrder(req.params.id);
      if (!order) return res.status(404).json({ message: "Sales order not found" });

      const orderItems = await storage.getSalesOrderItems(req.params.id);
      const productItems = orderItems.filter(it => it.itemType === "product" && it.productId);

      const allChallans = await storage.getDeliveryChallans();
      const soChallans = allChallans.filter((c: any) => c.orderId === req.params.id && c.status !== "cancelled");

      const dispatchedMap: Record<string, number> = {};
      for (const challan of soChallans) {
        if (!["dispatched", "delivered", "partial"].includes(challan.status)) continue;
        const cItems = await storage.getDeliveryChallanItems(challan.id);
        for (const ci of cItems) {
          const dispatched = Number(ci.qtyDispatched ?? ci.quantity);
          dispatchedMap[ci.productId] = (dispatchedMap[ci.productId] || 0) + dispatched;
        }
      }

      const summary = productItems.map(it => ({
        productId: it.productId,
        description: it.description,
        qtyOrdered: it.quantity,
        qtyDispatched: dispatchedMap[it.productId!] || 0,
        qtyRemaining: Math.max(0, it.quantity - (dispatchedMap[it.productId!] || 0)),
      }));

      res.json({ orderId: req.params.id, orderNumber: (order as any).orderNumber, items: summary });
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch dispatch summary" });
    }
  });

  app.post("/api/delivery-challans/:id/dispatch", authenticateToken, async (req: any, res) => {
    try {
      const challan = await storage.getDeliveryChallan(req.params.id);
      if (!challan) return res.status(404).json({ message: "Challan not found" });
      if (challan.status !== "draft") return res.status(400).json({ message: "Only draft challans can be dispatched" });

      const items = await storage.getDeliveryChallanItems(challan.id);
      if (items.length === 0) return res.status(400).json({ message: "Challan has no items" });

      const dispatchQtys: Record<string, number> = {};
      for (const item of items) {
        const qty = Number(item.qtyToDispatch ?? item.quantity);
        const qtyReserved = Number(item.qtyReserved ?? item.qtyOrdered ?? item.quantity);
        const alreadyDispatched = Number(item.qtyDispatched ?? 0);
        const remaining = qtyReserved - alreadyDispatched;
        if (qty <= 0) {
          return res.status(400).json({ message: `qtyToDispatch must be greater than 0 for all items` });
        }
        if (qty > remaining) {
          return res.status(400).json({ message: `qtyToDispatch (${qty}) exceeds remaining reserved quantity (${remaining}) for item` });
        }
        dispatchQtys[item.id] = qty;
      }

      const batchId = crypto.randomUUID();

      // Pre-compute FIFO lots per product BEFORE entering the transaction (uses main DB pool).
      // This determines which GRN lots each dispatched unit is attributed to (for grn_id tracking).
      // Note: concurrency risk is low but acknowledged — a TODO for optimistic locking in future.
      const fifoLotsPerProduct: Record<string, FifoLot[]> = {};
      if (challan.sourceType === "warehouse") {
        for (const item of items) {
          try {
            fifoLotsPerProduct[item.productId] = await computeFifoLots(item.productId, { warehouseId: challan.sourceId });
          } catch (e) {
            console.error(`[FIFO][DISPATCH] computeFifoLots failed for productId=${item.productId} warehouseId=${challan.sourceId} challan=${challan.challanNumber}:`, (e as Error).message);
            fifoLotsPerProduct[item.productId] = [];
          }
        }
      }

      await db.transaction(async (tx) => {
        const [lockedChallan] = await tx.execute(sql`
          SELECT status FROM delivery_challans WHERE id = ${challan.id} FOR UPDATE
        `);
        if (!lockedChallan || (lockedChallan as any).status !== "draft") {
          throw new Error("Challan is no longer in draft status — concurrent dispatch may have already occurred");
        }

        if (challan.sourceType === "warehouse") {
          for (const item of items) {
            const qty = dispatchQtys[item.id];
            const [stockRow] = await tx.execute(sql`
              SELECT quantity FROM inventory_stock
              WHERE product_id = ${item.productId} AND warehouse_id = ${challan.sourceId}
              LIMIT 1
              FOR UPDATE
            `);
            const currentStock = stockRow ? Number((stockRow as any).quantity ?? 0) : 0;
            if (qty > currentStock) {
              throw new Error(`Insufficient stock for product. Available: ${currentStock}, Required: ${qty}`);
            }
          }
        }

        if (challan.sourceType === "warehouse") {
          for (const item of items) {
            const qty = dispatchQtys[item.id];
            const lots = fifoLotsPerProduct[item.productId] ?? [];
            let remaining = qty;

            // Create one movement per FIFO lot consumed so grn_id is correctly attributed
            for (const lot of lots) {
              if (remaining <= 0) break;
              const consumed = Math.min(remaining, Math.floor(lot.remainingQty));
              if (consumed <= 0) continue;
              await addLedgerEntry(tx, {
                productId: item.productId,
                warehouseId: challan.sourceId,
                movementType: "out",
                quantity: consumed,
                referenceType: "challan",
                referenceId: challan.id,
                grnId: lot.grnId,
                notes: `Dispatched via challan ${challan.challanNumber} (FIFO from GRN ${lot.grnNumber}, batch ${batchId})`,
                createdBy: req.user.id,
              });
              remaining -= consumed;
            }

            // If qty is not fully covered by known lots (e.g. manual stock adjustments), record remainder without grnId.
            // This is expected for stock that entered outside the GRN workflow (adjustments, opening balances).
            // Log a WARNING so data-integrity drift is visible in server logs.
            if (remaining > 0) {
              console.warn(`[FIFO][DISPATCH][FALLBACK] productId=${item.productId} warehouseId=${challan.sourceId} challan=${challan.challanNumber} unattributed_qty=${remaining} totalQty=${qty} — no matching GRN lots (manual/adjusted stock)`);
              await addLedgerEntry(tx, {
                productId: item.productId,
                warehouseId: challan.sourceId,
                movementType: "out",
                quantity: remaining,
                referenceType: "challan",
                referenceId: challan.id,
                notes: `Dispatched via challan ${challan.challanNumber} (no FIFO lot — manual/adjusted stock, batch ${batchId})`,
                createdBy: req.user.id,
              });
            }
          }
        }

        for (const item of items) {
          const qty = dispatchQtys[item.id];
          const prevDispatched = Number(item.qtyDispatched ?? 0);
          await tx.execute(sql`
            UPDATE delivery_challan_items
            SET qty_dispatched = ${prevDispatched + qty}
            WHERE id = ${item.id}
          `);
        }

        await tx.execute(sql`
          UPDATE delivery_challans
          SET status = 'dispatched', dispatch_date = now(), dispatch_batch_id = ${batchId}
          WHERE id = ${challan.id}
        `);
      });

      const updated = await storage.getDeliveryChallan(challan.id);

      if (challan.orderId) {
        try {
          await checkAndAdvanceSalesOrderOnChallan(challan.orderId, storage);
        } catch (e) {
          console.error("Failed to advance SO on challan dispatch:", e);
        }
      }

      res.json(updated);
    } catch (error: any) {
      console.error("dispatch error:", error);
      const msg = error?.message || "Failed to dispatch challan";
      res.status(msg.startsWith("Insufficient") ? 400 : 500).json({ message: msg });
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

  app.post("/api/grns/create-from-po/:poId", authenticateToken, async (req: any, res) => {
    try {
      const { poId } = req.params;
      const po = await storage.getPurchaseOrder(poId);
      if (!po) return res.status(404).json({ message: "Purchase order not found" });
      if (po.deliveryType !== "warehouse") return res.status(400).json({ message: "Only warehouse-type POs can have GRNs" });
      if (!["approved", "shipped", "partial"].includes(po.status)) return res.status(400).json({ message: "PO must be approved, shipped, or partially received to create a GRN" });

      const existingGrns = await storage.getGRNsByPO(poId);
      const draftGrn = existingGrns.find((g: any) => g.status === "draft");
      if (draftGrn) {
        return res.status(409).json({ message: "A draft GRN already exists for this PO", existingGrnId: draftGrn.id, existingGrnNumber: draftGrn.grnNumber });
      }

      const year = new Date().getFullYear();
      const allGrns = await storage.getGRNs();
      const yearGrns = allGrns.filter((g: any) => g.grnNumber.startsWith(`GRN-${year}`));
      const maxNum = yearGrns.reduce((max: number, g: any) => {
        const num = parseInt(g.grnNumber.split("-").pop() || "0", 10);
        return num > max ? num : max;
      }, 0);
      const grnNumber = `GRN-${year}-${String(maxNum + 1).padStart(4, "0")}`;

      const poItems = await storage.getPurchaseOrderItems(poId);
      const productItems = poItems.filter((it: any) => it.productId);
      const itemTotal = productItems.reduce((sum: number, it: any) => sum + Number(it.totalCost), 0);

      const warehouseId = req.body?.warehouseId;
      if (!warehouseId) return res.status(400).json({ message: "warehouseId is required to create a GRN" });

      const grn = await storage.createGRN({
        grnNumber,
        purchaseOrderId: poId,
        warehouseId,
        status: "draft",
        deliveryCost: null,
        totalAmount: String(itemTotal),
        receivedDate: new Date(),
        notes: null,
        createdBy: req.user.id,
      } as any);

      if (productItems.length > 0) {
        for (const it of productItems) {
          await storage.createGRNItem({
            grnId: grn.id,
            productId: it.productId!,
            description: it.description || null,
            orderedQuantity: it.quantity,
            receivedQuantity: it.quantity,
            buyingPrice: it.unitCost,
            totalCost: it.totalCost,
          } as any);
        }
      }

      await logAction(req.user.id, "create", "grn", `Created draft GRN ${grnNumber} from PO ${po.poNumber}`);
      res.status(201).json(grn);
    } catch (error) {
      console.error("Create GRN from PO error:", error);
      res.status(500).json({ message: "Failed to create GRN from PO" });
    }
  });

  app.post("/api/grns", authenticateToken, async (req: any, res) => {
    try {
      const po = await storage.getPurchaseOrder(req.body.purchaseOrderId);
      if (!po) return res.status(400).json({ message: "Purchase order not found" });
      if (po.deliveryType !== "warehouse") return res.status(400).json({ message: "Only warehouse-type POs can have GRNs" });
      if (!["approved", "shipped", "partial"].includes(po.status)) return res.status(400).json({ message: "PO must be approved, shipped, or partially received to create a GRN" });

      const poGrns = await storage.getGRNsByPO(req.body.purchaseOrderId);
      const draftGrn = poGrns.find((g: any) => g.status === "draft");
      if (draftGrn) return res.status(409).json({ message: "A draft GRN already exists for this PO", existingGrnId: draftGrn.id, existingGrnNumber: draftGrn.grnNumber });

      const year = new Date().getFullYear();
      const allGrns = await storage.getGRNs();
      const yearGrns = allGrns.filter(g => g.grnNumber.startsWith(`GRN-${year}`));
      const maxNum = yearGrns.reduce((max: number, g: any) => {
        const num = parseInt(g.grnNumber.split("-").pop() || "0", 10);
        return num > max ? num : max;
      }, 0);
      const grnNumber = `GRN-${year}-${String(maxNum + 1).padStart(4, "0")}`;

      const rawDate = req.body.supplierChallanDate;
      const body = {
        ...req.body,
        grnNumber,
        createdBy: req.user.id,
        supplierChallanDate: rawDate && rawDate !== "" ? new Date(rawDate) : undefined,
        supplierChallanNumber: req.body.supplierChallanNumber || undefined,
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

      const rawDate = req.body.supplierChallanDate;
      const body = {
        ...req.body,
        supplierChallanDate: rawDate && rawDate !== "" ? new Date(rawDate) : undefined,
        supplierChallanNumber: req.body.supplierChallanNumber || undefined,
      };

      const updated = await storage.updateGRN(req.params.id, body);
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

      // Over-receive validation: ensure no item exceeds remaining PO quantity
      const po = await storage.getPurchaseOrder(grn.purchaseOrderId);
      if (po) {
        const poItems = await storage.getPurchaseOrderItems(po.id);
        const allGrnsForPO = await storage.getGRNsByPO(po.id);
        const prevConfirmedGrns = allGrnsForPO.filter((g: any) => g.status === "confirmed");

        const receivedPerProduct: Record<string, number> = {};
        for (const cGrn of prevConfirmedGrns) {
          const cGrnItems = await storage.getGRNItems(cGrn.id);
          for (const ci of cGrnItems) {
            receivedPerProduct[ci.productId] = (receivedPerProduct[ci.productId] || 0) + ci.receivedQuantity;
          }
        }

        const orderedPerProduct: Record<string, number> = {};
        for (const pi of poItems) {
          if (pi.productId) {
            orderedPerProduct[pi.productId] = (orderedPerProduct[pi.productId] || 0) + pi.quantity;
          }
        }

        const overReceived: string[] = [];
        for (const grnItem of items) {
          if (!grnItem.productId) continue;
          const totalOrdered = orderedPerProduct[grnItem.productId];
          if (totalOrdered === undefined) continue;
          const alreadyReceived = receivedPerProduct[grnItem.productId] || 0;
          const remaining = totalOrdered - alreadyReceived;
          if (grnItem.receivedQuantity > remaining) {
            overReceived.push(`Product ${grnItem.productId}: trying to receive ${grnItem.receivedQuantity}, but only ${remaining} remaining on PO`);
          }
        }
        if (overReceived.length > 0) {
          return res.status(400).json({ message: "Over-receive detected", details: overReceived });
        }
      }

      const allStock = await storage.getInventoryStock();

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

      await db.transaction(async (tx) => {
        for (const item of items) {
          await addLedgerEntry(tx, {
            productId: item.productId,
            warehouseId: grn.warehouseId,
            movementType: "in",
            quantity: item.receivedQuantity,
            referenceType: "grn",
            referenceId: grn.id,
            notes: `Received via GRN ${grn.grnNumber}`,
            createdBy: req.user.id,
          });
        }

        for (const [productId, agg] of Object.entries(costAggregates)) {
          const existingStock = allStock
            .filter((s: any) => s.productId === productId)
            .reduce((sum: number, s: any) => sum + (s.quantity ?? 0), 0);
          const productResult = await tx.execute(sql`SELECT cost_price FROM products WHERE id = ${productId} LIMIT 1`);
          const product = productResult.rows[0] as { cost_price: string | null } | undefined;
          if (product !== undefined) {
            const existingCost = product.cost_price ? parseFloat(product.cost_price) : 0;
            const avgBuyingPrice = agg.totalQty > 0 ? agg.totalCost / agg.totalQty : 0;
            const totalQty = existingStock + agg.totalQty;
            const newCost = totalQty > 0
              ? ((existingStock * existingCost) + (agg.totalQty * avgBuyingPrice)) / totalQty
              : avgBuyingPrice;
            await tx.execute(sql`UPDATE products SET cost_price = ${newCost.toFixed(2)} WHERE id = ${productId}`);
          }
        }

        await tx.execute(sql`UPDATE goods_receipt_notes SET status = 'confirmed' WHERE id = ${grn.id}`);
      });

      const poForStatus = await storage.getPurchaseOrder(grn.purchaseOrderId);
      if (poForStatus) {
        const poItems = await storage.getPurchaseOrderItems(poForStatus.id);
        const allGrnsForPO = await storage.getGRNsByPO(poForStatus.id);
        const confirmedGrns = allGrnsForPO.filter((g: any) => g.status === "confirmed" || g.id === grn.id);

        let anyReceived = false;
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
          if (totalReceived > 0) anyReceived = true;
          if (totalReceived < poItem.quantity) {
            allFullyReceived = false;
          }
        }

        if (allFullyReceived) {
          await storage.updatePurchaseOrder(poForStatus.id, { status: "received" } as any);

          const allPRs = await storage.getPurchaseRequests();
          const linkedPR = allPRs.find((pr: any) => pr.purchaseOrderId === poForStatus.id);
          if (linkedPR?.salesOrderId) {
            try {
              await checkAndAdvanceSalesOrderFromProcurement(linkedPR.salesOrderId, storage);
            } catch (e) {
              console.error("Failed to advance SO from procurement after GRN:", e);
            }
          }
        } else if (anyReceived) {
          await storage.updatePurchaseOrder(poForStatus.id, { status: "partial" } as any);
        }
      }

      await logAction(req.user.id, "confirm", "grn", `Confirmed GRN ${grn.grnNumber}`);

      // Auto-create daily price sheets for products received in this GRN
      try {
        const today = new Date().toISOString().slice(0, 10);
        const uniqueProductIds = [...new Set(items.filter((i: any) => i.productId).map((i: any) => i.productId as string))];
        for (const pid of uniqueProductIds) {
          const existing = await storage.getDailyPriceSheetByProductDate(pid, today);
          if (existing) continue;
          const lots = await computeFifoLots(pid);
          if (lots.length === 0) continue;
          const totalRemainingQty = lots.reduce((s, l) => s + l.remainingQty, 0);
          const blendedCost = totalRemainingQty > 0
            ? lots.reduce((s, l) => s + l.landedCost * l.remainingQty, 0) / totalRemainingQty
            : 0;
          // globalFloor = blendedCost × (1 + minMarginPct/100) — fetched from product row
          const prodMarginRes = await db.execute(sql`SELECT min_margin_pct FROM products WHERE id = ${pid} LIMIT 1`);
          const minMarginPct = Number((prodMarginRes.rows[0] as any)?.min_margin_pct ?? 5);
          const globalFloorPrice = parseFloat((blendedCost * (1 + minMarginPct / 100)).toFixed(2));
          const strictFloorPrice = lots.reduce((max, l) => Math.max(max, l.floorPrice), 0);
          // blendedCost always comes from FIFO lot engine, never from product.costPrice (WAC)
          const sheet = await storage.createDailyPriceSheet({
            productId: pid,
            sheetDate: today,
            status: "draft",
            proposedPrice: null,
            blendedCost: blendedCost.toFixed(2),
            globalFloorPrice: globalFloorPrice.toFixed(2),
            strictFloorPrice: strictFloorPrice.toFixed(2),
            overrideRequired: false,
            overrideReason: null,
            rejectionNotes: null,
            notes: `Auto-created after GRN ${grn.grnNumber}`,
            createdBy: req.user.id,
            confirmedBy: null,
          });
          await storage.upsertDailyPriceSheetLots(sheet.id, lots.map(l => ({
            sheetId: sheet.id,
            grnId: l.grnId,
            grnNumber: l.grnNumber,
            lotDate: l.lotDate,
            remainingQty: l.remainingQty.toFixed(3),
            landedCost: l.landedCost.toFixed(2),
            floorPrice: l.floorPrice.toFixed(2),
            proposedPrice: null,
          })));
        }
      } catch (pricingErr) {
        console.error("Failed to auto-create price sheets from GRN:", pricingErr);
      }

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

      let challanId: string;
      await db.transaction(async (tx) => {
        const challanResult = await tx.execute(sql`
          INSERT INTO delivery_challans (id, challan_number, order_id, source_type, source_id, status, created_by, notes, created_at)
          VALUES (gen_random_uuid(), ${challanNumber}, ${order.id}, 'warehouse', ${pickupWarehouseId}, 'draft', ${req.user.id},
                  ${`Pickup confirmed for order ${order.orderNumber}`}, now())
          RETURNING id
        `);
        challanId = (challanResult.rows[0] as any).id;

        for (const item of productItems) {
          await tx.execute(sql`
            INSERT INTO delivery_challan_items (id, challan_id, product_id, description, quantity, unit_price)
            VALUES (gen_random_uuid(), ${challanId}, ${item.productId!}, ${item.description || null}, ${item.quantity}, ${item.unitPrice})
          `);
        }

        for (const item of productItems) {
          await addLedgerEntry(tx, {
            productId: item.productId!,
            warehouseId: pickupWarehouseId!,
            movementType: "out",
            quantity: item.quantity,
            referenceType: "challan",
            referenceId: challanId,
            notes: `Pickup of order ${order.orderNumber}`,
            createdBy: req.user.id,
          });
        }

        await tx.execute(sql`
          UPDATE delivery_challans
          SET status = 'delivered', dispatch_date = now(), delivery_date = now()
          WHERE id = ${challanId}
        `);

        await tx.execute(sql`
          UPDATE sales_orders SET status = 'delivered' WHERE id = ${order.id}
        `);
      });

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

  // Leave Requests
  app.get("/api/leave-requests", authenticateToken, async (req: any, res) => {
    try {
      if (req.user.role === "admin" || req.user.role === "hr_manager") {
        return res.json(await storage.getLeaveRequests());
      }
      const allEmps = await storage.getEmployees();
      const linked = allEmps.find(e => e.userId === req.user.id);
      if (!linked) return res.json([]);
      res.json(await storage.getLeaveRequestsByEmployee(linked.id));
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch leave requests" });
    }
  });

  app.post("/api/leave-requests", authenticateToken, async (req: any, res) => {
    try {
      const { type, startDate, endDate, reason, employeeId } = req.body;
      if (!type || !startDate || !endDate) return res.status(400).json({ message: "type, startDate, endDate are required" });
      let empId = employeeId;
      if (req.user.role !== "admin" && req.user.role !== "hr_manager") {
        const allEmps = await storage.getEmployees();
        const linked = allEmps.find(e => e.userId === req.user.id);
        if (!linked) return res.status(400).json({ message: "No employee record linked to your account" });
        empId = linked.id;
      }
      if (!empId) return res.status(400).json({ message: "employeeId is required" });
      const lr = await storage.createLeaveRequest({
        employeeId: empId,
        type,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        reason: reason || null,
        status: "pending",
        reviewedBy: null,
        reviewNote: null,
      });
      res.status(201).json(lr);
    } catch (error) {
      res.status(500).json({ message: "Failed to create leave request" });
    }
  });

  app.patch("/api/leave-requests/:id/approve", authenticateToken, async (req: any, res) => {
    try {
      if (req.user.role !== "admin" && req.user.role !== "hr_manager") return res.status(403).json({ message: "Forbidden" });
      const existing = (await storage.getLeaveRequests()).find(r => r.id === req.params.id);
      if (!existing) return res.status(404).json({ message: "Leave request not found" });
      if (existing.status !== "pending") return res.status(400).json({ message: "Only pending requests can be approved" });
      const lr = await storage.updateLeaveRequest(req.params.id, { status: "approved", reviewedBy: req.user.id, reviewNote: req.body.reviewNote || null });
      if (!lr) return res.status(404).json({ message: "Leave request not found" });
      await notifyEmployee(lr.employeeId, "leave_approved", "Leave Approved", `Your ${lr.type} leave from ${new Date(lr.startDate).toLocaleDateString("en-IN")} to ${new Date(lr.endDate).toLocaleDateString("en-IN")} has been approved.`, lr.id);
      res.json(lr);
    } catch (error) {
      res.status(500).json({ message: "Failed to approve leave request" });
    }
  });

  app.patch("/api/leave-requests/:id/reject", authenticateToken, async (req: any, res) => {
    try {
      if (req.user.role !== "admin" && req.user.role !== "hr_manager") return res.status(403).json({ message: "Forbidden" });
      const existing = (await storage.getLeaveRequests()).find(r => r.id === req.params.id);
      if (!existing) return res.status(404).json({ message: "Leave request not found" });
      if (existing.status !== "pending") return res.status(400).json({ message: "Only pending requests can be rejected" });
      const { reviewNote } = req.body;
      if (!reviewNote) return res.status(400).json({ message: "reviewNote (rejection reason) is required" });
      const lr = await storage.updateLeaveRequest(req.params.id, { status: "rejected", reviewedBy: req.user.id, reviewNote });
      if (!lr) return res.status(404).json({ message: "Leave request not found" });
      await notifyEmployee(lr.employeeId, "leave_rejected", "Leave Rejected", `Your ${lr.type} leave request was rejected — Reason: ${reviewNote}`, lr.id);
      res.json(lr);
    } catch (error) {
      res.status(500).json({ message: "Failed to reject leave request" });
    }
  });

  app.delete("/api/leave-requests/:id", authenticateToken, async (req: any, res) => {
    try {
      const all = await storage.getLeaveRequests();
      const lr = all.find(r => r.id === req.params.id);
      if (!lr) return res.status(404).json({ message: "Leave request not found" });
      if (req.user.role !== "admin" && req.user.role !== "hr_manager") {
        const allEmps = await storage.getEmployees();
        const linked = allEmps.find(e => e.userId === req.user.id);
        if (!linked || lr.employeeId !== linked.id) return res.status(403).json({ message: "Forbidden" });
        if (lr.status !== "pending" && lr.status !== "rejected") return res.status(400).json({ message: "Only pending or rejected requests can be withdrawn" });
      }
      await storage.deleteLeaveRequest(req.params.id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Failed to delete leave request" });
    }
  });

  app.patch("/api/notifications/:id/read", authenticateToken, async (req: any, res) => {
    try {
      const updated = await storage.markNotificationRead(req.params.id, req.user.id);
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

  // ── Supplier Invoice helpers ────────────────────────────────────────────────
  function calcDueDate(invoiceDate: Date, terms: string): Date {
    const d = new Date(invoiceDate);
    if (terms === "immediate") return d;
    if (terms === "net_30") { d.setDate(d.getDate() + 30); return d; }
    if (terms === "net_60") { d.setDate(d.getDate() + 60); return d; }
    return d;
  }

  async function recomputeInvoiceStatus(invoiceId: string): Promise<void> {
    const inv = await storage.getSupplierInvoice(invoiceId);
    if (!inv) return;
    const payments = await storage.getSupplierPaymentsByInvoice(invoiceId);
    const totalPaid = payments.reduce((sum, p) => sum + Number(p.amount), 0);
    const advance = inv.purchaseOrderId
      ? Number((await storage.getPurchaseOrder(inv.purchaseOrderId))?.advancePaid ?? 0)
      : 0;
    const effectivePaid = totalPaid + advance;
    const total = Number(inv.totalAmount);
    let status = "pending";
    if (effectivePaid >= total) status = "paid";
    else if (effectivePaid > 0) status = "partial_paid";
    await storage.updateSupplierInvoice(invoiceId, { status });
  }

  async function recomputeInvoicesForPO(poId: string): Promise<void> {
    const invoices = await storage.getSupplierInvoicesByPO(poId);
    for (const inv of invoices) {
      await recomputeInvoiceStatus(inv.id);
    }
  }

  // ── Supplier Invoices ───────────────────────────────────────────────────────
  app.get("/api/supplier-invoices", authenticateToken, async (_req, res) => {
    try {
      const invs = await storage.getSupplierInvoices();
      res.json(invs);
    } catch { res.status(500).json({ message: "Failed to fetch supplier invoices" }); }
  });

  app.get("/api/supplier-invoices/:id", authenticateToken, async (req, res) => {
    try {
      const inv = await storage.getSupplierInvoice(req.params.id);
      if (!inv) return res.status(404).json({ message: "Supplier invoice not found" });
      res.json(inv);
    } catch { res.status(500).json({ message: "Failed to fetch supplier invoice" }); }
  });

  app.post("/api/supplier-invoices", authenticateToken, async (req: any, res) => {
    try {
      const { invoiceNumber, supplierId, purchaseOrderId, grnId, invoiceDate, subtotal, taxAmount, paymentTerms, notes } = req.body;
      if (!invoiceNumber || !supplierId || !subtotal) return res.status(400).json({ message: "invoiceNumber, supplierId, and subtotal are required" });
      if (!purchaseOrderId) return res.status(400).json({ message: "purchaseOrderId is required — a supplier invoice must be linked to a purchase order" });
      if (!grnId) return res.status(400).json({ message: "grnId is required — a supplier invoice must be linked to a goods receipt note" });

      // Validate PO belongs to supplier
      const linkedPO = await storage.getPurchaseOrder(purchaseOrderId);
      if (!linkedPO) return res.status(404).json({ message: "Purchase order not found" });
      if (linkedPO.supplierId !== supplierId) return res.status(400).json({ message: "Purchase order does not belong to the selected supplier" });

      // Validate GRN belongs to the linked PO
      const linkedGRN = await storage.getGRN(grnId);
      if (!linkedGRN) return res.status(404).json({ message: "Goods receipt note not found" });
      if (linkedGRN.purchaseOrderId !== purchaseOrderId) return res.status(400).json({ message: "GRN does not belong to the selected purchase order" });
      if (linkedGRN.status !== "confirmed") return res.status(400).json({ message: "GRN must be confirmed before creating a supplier invoice" });

      // Duplicate check: same invoiceNumber + supplierId
      const existing = await storage.getSupplierInvoicesBySupplier(supplierId);
      if (existing.some(i => i.invoiceNumber === invoiceNumber)) {
        return res.status(409).json({ message: `Supplier invoice ${invoiceNumber} already exists for this supplier` });
      }

      const invDate = invoiceDate ? new Date(invoiceDate) : new Date();
      const terms = paymentTerms || "net_30";
      const dueDate = calcDueDate(invDate, terms);
      const sub = Number(subtotal);
      const tax = Number(taxAmount ?? 0);
      const totalAmount = String(sub + tax);

      const inv = await storage.createSupplierInvoice({
        invoiceNumber,
        supplierId,
        purchaseOrderId: purchaseOrderId || null,
        grnId: grnId || null,
        invoiceDate: invDate,
        subtotal: String(sub),
        taxAmount: String(tax),
        totalAmount,
        paymentTerms: terms,
        dueDate,
        status: "pending",
        notes: notes || null,
        createdBy: req.user.id,
      });

      // Immediately recompute status (advance may already exist)
      await recomputeInvoiceStatus(inv.id);
      const updated = await storage.getSupplierInvoice(inv.id);
      res.status(201).json(updated);
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Failed to create supplier invoice" });
    }
  });

  app.patch("/api/supplier-invoices/:id", authenticateToken, async (req: any, res) => {
    try {
      const inv = await storage.getSupplierInvoice(req.params.id);
      if (!inv) return res.status(404).json({ message: "Supplier invoice not found" });

      const allowed = ["status", "notes", "paymentTerms", "dueDate", "subtotal", "taxAmount", "totalAmount", "invoiceDate"];
      const validStatuses = ["pending", "partial_paid", "paid"];
      const validTerms = ["immediate", "net_30", "net_60"];

      const updates: Record<string, unknown> = {};
      for (const key of allowed) {
        if (req.body[key] !== undefined) updates[key] = req.body[key];
      }
      if (updates.status && !validStatuses.includes(updates.status as string)) {
        return res.status(400).json({ message: `Invalid status. Must be one of: ${validStatuses.join(", ")}` });
      }
      if (updates.paymentTerms && !validTerms.includes(updates.paymentTerms as string)) {
        return res.status(400).json({ message: `Invalid paymentTerms. Must be one of: ${validTerms.join(", ")}` });
      }
      if (updates.dueDate) updates.dueDate = new Date(updates.dueDate as string);
      if (updates.invoiceDate) updates.invoiceDate = new Date(updates.invoiceDate as string);

      const updated = await storage.updateSupplierInvoice(req.params.id, updates as any);
      res.json(updated);
    } catch { res.status(500).json({ message: "Failed to update supplier invoice" }); }
  });

  app.delete("/api/supplier-invoices/:id", authenticateToken, async (req, res) => {
    try {
      await storage.deleteSupplierInvoice(req.params.id);
      res.json({ success: true });
    } catch { res.status(500).json({ message: "Failed to delete supplier invoice" }); }
  });

  // ── Supplier Payments ───────────────────────────────────────────────────────
  app.get("/api/supplier-payments", authenticateToken, async (_req, res) => {
    try {
      const pays = await storage.getSupplierPayments();
      res.json(pays);
    } catch { res.status(500).json({ message: "Failed to fetch supplier payments" }); }
  });

  // Specific sub-routes must be registered BEFORE the generic :id route
  app.get("/api/supplier-payments/by-invoice/:invoiceId", authenticateToken, async (req, res) => {
    try {
      const pays = await storage.getSupplierPaymentsByInvoice(req.params.invoiceId);
      res.json(pays);
    } catch { res.status(500).json({ message: "Failed to fetch payments for invoice" }); }
  });

  app.get("/api/supplier-payments/by-po/:poId", authenticateToken, async (req, res) => {
    try {
      const pays = await storage.getSupplierPaymentsByPO(req.params.poId);
      res.json(pays);
    } catch { res.status(500).json({ message: "Failed to fetch payments for PO" }); }
  });

  app.get("/api/supplier-payments/:id", authenticateToken, async (req, res) => {
    try {
      const pay = await storage.getSupplierPayment(req.params.id);
      if (!pay) return res.status(404).json({ message: "Supplier payment not found" });
      res.json(pay);
    } catch { res.status(500).json({ message: "Failed to fetch supplier payment" }); }
  });

  app.patch("/api/supplier-payments/:id", authenticateToken, async (req: any, res) => {
    try {
      const pay = await storage.getSupplierPayment(req.params.id);
      if (!pay) return res.status(404).json({ message: "Supplier payment not found" });

      const { reference, paymentMethod, paymentDate, amount } = req.body;
      const updates: Partial<typeof pay> = {};

      if (reference !== undefined) updates.reference = reference;
      if (paymentMethod !== undefined) updates.paymentMethod = paymentMethod;
      if (paymentDate !== undefined) updates.paymentDate = new Date(paymentDate);

      // If amount is being changed, handle recomputation
      if (amount !== undefined && String(amount) !== String(pay.amount)) {
        const newAmount = Number(amount);
        if (isNaN(newAmount) || newAmount <= 0) return res.status(400).json({ message: "amount must be a positive number" });
        const oldAmount = Number(pay.amount);
        const diff = newAmount - oldAmount;

        // Overpayment guard for regular payment amount changes
        if (pay.paymentType === "regular" && pay.supplierInvoiceId) {
          const inv = await storage.getSupplierInvoice(pay.supplierInvoiceId);
          if (inv) {
            const existingPays = await storage.getSupplierPaymentsByInvoice(pay.supplierInvoiceId);
            // Exclude current payment from existing totals
            const alreadyPaid = existingPays.filter(p => p.id !== pay.id).reduce((sum, p) => sum + Number(p.amount), 0);
            const advance = inv.purchaseOrderId
              ? Number((await storage.getPurchaseOrder(inv.purchaseOrderId))?.advancePaid ?? 0)
              : 0;
            const balance = Number(inv.totalAmount) - advance - alreadyPaid;
            if (newAmount > balance + 0.01) {
              return res.status(400).json({ message: `Updated amount (₹${newAmount.toLocaleString()}) exceeds invoice balance (₹${balance.toLocaleString()})` });
            }
          }
        }

        if (pay.paymentType === "advance" && pay.purchaseOrderId) {
          const po = await storage.getPurchaseOrder(pay.purchaseOrderId);
          if (po) {
            const newAdvance = Math.max(0, Number(po.advancePaid ?? 0) + diff);
            await storage.updatePurchaseOrder(pay.purchaseOrderId, { advancePaid: String(newAdvance) });
          }
        }
        updates.amount = String(newAmount);
      }

      const updated = await storage.updateSupplierPayment(req.params.id, updates);

      // Recompute statuses after update
      if (pay.paymentType === "advance" && pay.purchaseOrderId) {
        await recomputeInvoicesForPO(pay.purchaseOrderId);
      }
      if (pay.paymentType === "regular" && pay.supplierInvoiceId) {
        await recomputeInvoiceStatus(pay.supplierInvoiceId);
      }

      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Failed to update supplier payment" });
    }
  });

  app.post("/api/supplier-payments", authenticateToken, async (req: any, res) => {
    try {
      const { supplierInvoiceId, purchaseOrderId, supplierId, amount, paymentType, paymentMethod, paymentDate, reference } = req.body;

      // Required fields
      if (!supplierId) return res.status(400).json({ message: "supplierId is required" });
      if (!amount) return res.status(400).json({ message: "amount is required" });
      if (!paymentType || !["advance", "regular"].includes(paymentType)) {
        return res.status(400).json({ message: "paymentType must be 'advance' or 'regular'" });
      }

      // Enforce linkage rules
      if (paymentType === "regular" && !supplierInvoiceId) {
        return res.status(400).json({ message: "Regular payments must be linked to a supplier invoice (supplierInvoiceId is required)" });
      }
      if (paymentType === "advance" && !purchaseOrderId) {
        return res.status(400).json({ message: "Advance payments must be linked to a purchase order (purchaseOrderId is required)" });
      }

      const amountNum = Number(amount);
      if (isNaN(amountNum) || amountNum <= 0) return res.status(400).json({ message: "amount must be a positive number" });

      // Validate linked records exist and belong to the given supplier
      if (paymentType === "advance") {
        const linkedPO = await storage.getPurchaseOrder(purchaseOrderId);
        if (!linkedPO) return res.status(404).json({ message: "Purchase order not found" });
        if (linkedPO.supplierId !== supplierId) return res.status(400).json({ message: "Purchase order does not belong to the selected supplier" });
      }

      // Overpayment validation + supplier consistency for regular payments
      if (paymentType === "regular") {
        const inv = await storage.getSupplierInvoice(supplierInvoiceId);
        if (!inv) return res.status(404).json({ message: "Supplier invoice not found" });
        if (inv.supplierId !== supplierId) return res.status(400).json({ message: "Invoice does not belong to the selected supplier" });
        const existingPays = await storage.getSupplierPaymentsByInvoice(supplierInvoiceId);
        const alreadyPaid = existingPays.reduce((sum, p) => sum + Number(p.amount), 0);
        const advance = inv.purchaseOrderId
          ? Number((await storage.getPurchaseOrder(inv.purchaseOrderId))?.advancePaid ?? 0)
          : 0;
        const balance = Number(inv.totalAmount) - advance - alreadyPaid;
        if (amountNum > balance + 0.01) {
          return res.status(400).json({ message: `Payment (₹${amountNum.toLocaleString()}) exceeds current invoice balance (₹${balance.toLocaleString()})` });
        }
      }

      const pay = await storage.createSupplierPayment({
        supplierInvoiceId: paymentType === "regular" ? supplierInvoiceId : null,
        purchaseOrderId: paymentType === "advance" ? purchaseOrderId : null,
        supplierId,
        amount: String(amountNum),
        paymentType,
        paymentMethod: paymentMethod || "bank_transfer",
        paymentDate: paymentDate ? new Date(paymentDate) : new Date(),
        reference: reference || null,
      });

      // Update PO advancePaid and recompute linked invoices
      if (paymentType === "advance") {
        const po = await storage.getPurchaseOrder(purchaseOrderId);
        if (po) {
          const newAdvance = Number(po.advancePaid ?? 0) + amountNum;
          await storage.updatePurchaseOrder(purchaseOrderId, { advancePaid: String(newAdvance) });
        }
        // Recompute any invoices linked to this PO (advance affects their balance)
        await recomputeInvoicesForPO(purchaseOrderId);
      }

      // Recompute the specific invoice status for regular payments
      if (paymentType === "regular" && supplierInvoiceId) {
        await recomputeInvoiceStatus(supplierInvoiceId);
      }

      res.status(201).json(pay);
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Failed to record supplier payment" });
    }
  });

  app.delete("/api/supplier-payments/:id", authenticateToken, async (req, res) => {
    try {
      const pay = await storage.getSupplierPayment(req.params.id);
      if (!pay) return res.status(404).json({ message: "Supplier payment not found" });

      await storage.deleteSupplierPayment(req.params.id);

      // For advance payments: decrement advancePaid on the PO, then recompute all invoices for that PO
      if (pay.paymentType === "advance" && pay.purchaseOrderId) {
        const po = await storage.getPurchaseOrder(pay.purchaseOrderId);
        if (po) {
          const newAdvance = Math.max(0, Number(po.advancePaid ?? 0) - Number(pay.amount));
          await storage.updatePurchaseOrder(pay.purchaseOrderId, { advancePaid: String(newAdvance) });
        }
        await recomputeInvoicesForPO(pay.purchaseOrderId);
      }

      // For regular payments: recompute the specific invoice status
      if (pay.paymentType === "regular" && pay.supplierInvoiceId) {
        await recomputeInvoiceStatus(pay.supplierInvoiceId);
      }

      res.json({ success: true });
    } catch { res.status(500).json({ message: "Failed to delete supplier payment" }); }
  });

  // AP Aging Report
  app.get("/api/reports/ap-aging", authenticateToken, async (req: any, res) => {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const allInvoices = await storage.getSupplierInvoices();
      const allPayments = await storage.getSupplierPayments();
      const allSuppliers = await storage.getSuppliers();
      const allPOs = await storage.getPurchaseOrders();

      const supplierMap = new Map(allSuppliers.map(s => [s.id, s]));
      const poMap = new Map(allPOs.map(p => [p.id, p]));

      const summary = { current: 0, days1_30: 0, days31_60: 0, days61_90: 0, days90plus: 0, totalOutstanding: 0 };

      const rows = allInvoices.map(inv => {
        const supplier = supplierMap.get(inv.supplierId);
        const po = inv.purchaseOrderId ? poMap.get(inv.purchaseOrderId) : undefined;

        // Sum regular payments for this invoice
        const regularPaid = allPayments
          .filter(p => p.supplierInvoiceId === inv.id && p.paymentType === "regular")
          .reduce((sum, p) => sum + Number(p.amount), 0);

        // Advance from the linked PO (applies per invoice)
        const advancePaid = po ? Number(po.advancePaid || 0) : 0;

        const totalPaid = Math.min(Number(inv.totalAmount), regularPaid + advancePaid);
        const balance = Math.max(0, Number(inv.totalAmount) - totalPaid);

        const dueDate = new Date(inv.dueDate);
        dueDate.setHours(0, 0, 0, 0);
        const diffMs = today.getTime() - dueDate.getTime();
        const daysOverdue = diffMs > 0 ? Math.floor(diffMs / 86400000) : 0;
        const isOverdue = diffMs > 0;

        let bucket: string;
        if (!isOverdue) {
          bucket = "current";
        } else if (daysOverdue <= 30) {
          bucket = "1-30";
        } else if (daysOverdue <= 60) {
          bucket = "31-60";
        } else if (daysOverdue <= 90) {
          bucket = "61-90";
        } else {
          bucket = "90+";
        }

        if (balance > 0) {
          summary.totalOutstanding += balance;
          if (bucket === "current") summary.current += balance;
          else if (bucket === "1-30") summary.days1_30 += balance;
          else if (bucket === "31-60") summary.days31_60 += balance;
          else if (bucket === "61-90") summary.days61_90 += balance;
          else summary.days90plus += balance;
        }

        return {
          invoiceId: inv.id,
          invoiceNumber: inv.invoiceNumber,
          supplierId: inv.supplierId,
          supplierName: supplier?.name ?? "Unknown",
          purchaseOrderId: inv.purchaseOrderId,
          poNumber: po?.poNumber ?? null,
          invoiceDate: inv.invoiceDate,
          dueDate: inv.dueDate,
          totalAmount: Number(inv.totalAmount),
          totalPaid,
          balance,
          daysOverdue,
          bucket,
          status: inv.status,
        };
      });

      // Sort by daysOverdue descending
      rows.sort((a, b) => b.daysOverdue - a.daysOverdue);

      res.json({ rows, summary });
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Failed to generate AP aging report" });
    }
  });

  // AR Aging Report
  app.get("/api/reports/ar-aging", authenticateToken, async (req: any, res) => {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const allInvoices = await storage.getSalesInvoices();
      const allPayments = await storage.getAllCustomerPayments();
      const allCustomers = await storage.getCustomers();

      const customerMap = new Map(allCustomers.map(c => [c.id, c]));

      const summary = { current: 0, days1_30: 0, days31_60: 0, days61_90: 0, days90plus: 0, totalOutstanding: 0 };

      const rows = allInvoices.map(inv => {
        const customer = customerMap.get(inv.customerId);

        const totalPaid = allPayments
          .filter(p => p.invoiceId === inv.id)
          .reduce((sum, p) => sum + Number(p.amount), 0);

        const balance = Math.max(0, Number(inv.grandTotal) - totalPaid);

        const dueDate = inv.dueDate ? new Date(inv.dueDate) : null;
        // daysOverdue: negative = not yet due (current), positive = overdue
        let daysOverdue = 0;
        let bucket = "current";

        if (dueDate) {
          dueDate.setHours(0, 0, 0, 0);
          const diffMs = today.getTime() - dueDate.getTime();
          // diffMs positive = past due, negative = future due
          daysOverdue = Math.floor(diffMs / 86400000); // can be negative for future dates
          if (diffMs > 0) {
            if (daysOverdue <= 30) bucket = "1-30";
            else if (daysOverdue <= 60) bucket = "31-60";
            else if (daysOverdue <= 90) bucket = "61-90";
            else bucket = "90+";
          }
          // daysOverdue <= 0 stays as "current"
        }

        if (balance > 0) {
          summary.totalOutstanding += balance;
          if (bucket === "current") summary.current += balance;
          else if (bucket === "1-30") summary.days1_30 += balance;
          else if (bucket === "31-60") summary.days31_60 += balance;
          else if (bucket === "61-90") summary.days61_90 += balance;
          else summary.days90plus += balance;
        }

        return {
          invoiceId: inv.id,
          invoiceNumber: inv.invoiceNumber,
          customerId: inv.customerId,
          customerName: customer?.name ?? "Unknown",
          customerType: inv.customerType,
          customerGSTIN: inv.customerGSTIN,
          invoiceDate: inv.invoiceDate,
          dueDate: inv.dueDate,
          grandTotal: Number(inv.grandTotal),
          totalPaid,
          balance,
          daysOverdue,
          bucket,
          status: inv.status,
        };
      });

      // Sort by daysOverdue descending (most overdue first, future due at bottom)
      rows.sort((a, b) => b.daysOverdue - a.daysOverdue);

      res.json({ rows, summary });
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Failed to generate AR aging report" });
    }
  });

  // ─── Pricing Summary Report ─────────────────────────────────────────────────
  app.get("/api/reports/pricing-summary", authenticateToken, requireRole("admin", "sales_manager", "accountant"), async (req: any, res) => {
    try {
      const today = new Date().toISOString().slice(0, 10);

      // Fetch all products and current stock
      const allProds = await db.execute(sql`
        SELECT p.id, p.name, p.sku, p.category, p.unit, p.unit_price, p.cost_price,
               p.min_stock_level, p.needs_pricing_review,
               COALESCE(SUM(s.quantity), 0)::numeric AS total_stock
        FROM products p
        LEFT JOIN inventory_stock s ON s.product_id = p.id
        WHERE p.type = 'product'
        GROUP BY p.id
      `);

      // Fetch today's confirmed sheet (7-day window)
      const sheetRes = await db.execute(sql`
        SELECT DISTINCT ON (product_id)
          product_id, sheet_date, proposed_price, blended_cost,
          global_floor_price, strict_floor_price, status
        FROM daily_price_sheets
        WHERE status = 'confirmed' AND proposed_price IS NOT NULL
          AND sheet_date::date >= (${today}::date - INTERVAL '6 days')
          AND sheet_date::date <= ${today}::date
        ORDER BY product_id, sheet_date DESC
      `);
      const sheetMap = new Map<string, any>();
      for (const r of sheetRes.rows as any[]) {
        sheetMap.set(r.product_id, r);
      }

      // Also check unconfirmed (draft/submitted) sheets for today
      const unconfirmedRes = await db.execute(sql`
        SELECT product_id FROM daily_price_sheets
        WHERE sheet_date::date = ${today}::date AND status IN ('draft', 'submitted')
      `);
      const unconfirmedSet = new Set((unconfirmedRes.rows as any[]).map(r => r.product_id));

      let portfolioTotalCost = 0;
      let portfolioRevenue = 0;
      let portfolioRequiredRevenue = 0;

      const products: any[] = [];
      for (const prod of allProds.rows as any[]) {
        const totalStock = Number(prod.total_stock);
        let lots: Awaited<ReturnType<typeof computeFifoLots>> = [];
        try { lots = await computeFifoLots(prod.id); } catch (e: any) {
          console.error(`[pricing-summary] computeFifoLots productId=${prod.id}: ${e.message}`);
        }

        const totalLotQty = lots.reduce((s, l) => s + l.remainingQty, 0);
        const blendedCost = totalLotQty > 0
          ? lots.reduce((s, l) => s + l.landedCost * l.remainingQty, 0) / totalLotQty
          : 0;
        const globalFloor = blendedCost > 0 ? blendedCost * 1.05 : 0;
        const strictFloor = lots.length > 0 ? Math.max(...lots.map(l => l.floorPrice)) : 0;

        const sheet = sheetMap.get(prod.id);
        const confirmedPrice = sheet ? Number(sheet.proposed_price) : Number(prod.unit_price);
        const sheetDate = sheet ? (typeof sheet.sheet_date === "string" ? sheet.sheet_date.slice(0, 10) : new Date(sheet.sheet_date).toISOString().slice(0, 10)) : null;
        const hasConfirmedToday = sheetDate === today;
        const hasConfirmedSheet = sheetDate !== null;
        const hasUnconfirmedSheet = unconfirmedSet.has(prod.id);

        const marginPct = confirmedPrice > 0 && blendedCost > 0
          ? ((confirmedPrice - blendedCost) / confirmedPrice) * 100
          : null;

        const pressureRatio = blendedCost > 0 && confirmedPrice > 0 ? blendedCost / confirmedPrice : null;
        const pressureLevel = pressureRatio === null ? "None"
          : pressureRatio > 0.9 ? "High Risk"
          : pressureRatio > 0.75 ? "Medium"
          : "Safe";

        const oldestLotDate = lots.length > 0
          ? new Date(Math.min(...lots.map(l => l.lotDate ? l.lotDate.getTime() : Date.now())))
          : null;
        const lotAgeDays = oldestLotDate ? Math.floor((Date.now() - oldestLotDate.getTime()) / 86400000) : null;
        const sellPriority = lotAgeDays !== null && lotAgeDays > 30 && totalStock > (Number(prod.min_stock_level) || 0);

        // Portfolio rollup (only products with cost data)
        if (blendedCost > 0 && totalStock > 0) {
          portfolioTotalCost += blendedCost * totalStock;
          portfolioRevenue += confirmedPrice * totalStock;
          portfolioRequiredRevenue += (blendedCost / (1 - 0.05)) * totalStock; // cost / (1 - minMargin)
        }

        products.push({
          productId: prod.id,
          productName: prod.name,
          sku: prod.sku,
          category: prod.category,
          unit: prod.unit,
          totalStock,
          blendedCost: blendedCost > 0 ? parseFloat(blendedCost.toFixed(2)) : null,
          globalFloor: globalFloor > 0 ? parseFloat(globalFloor.toFixed(2)) : null,
          strictFloor: strictFloor > 0 ? parseFloat(strictFloor.toFixed(2)) : null,
          confirmedPrice: parseFloat(confirmedPrice.toFixed(2)),
          sheetDate,
          hasConfirmedToday,
          hasConfirmedSheet,
          hasUnconfirmedSheet,
          marginPct: marginPct !== null ? parseFloat(marginPct.toFixed(2)) : null,
          pressureLevel,
          sellPriority,
          lotCount: lots.length,
          lotAgeDays,
          needsPricingReview: prod.needs_pricing_review,
        });
      }

      const portfolioStatus = portfolioRevenue >= portfolioRequiredRevenue ? "SAFE" : "AT RISK";

      res.json({
        products,
        portfolio: {
          totalInventoryCost: parseFloat(portfolioTotalCost.toFixed(2)),
          revenueAtConfirmedPrices: parseFloat(portfolioRevenue.toFixed(2)),
          requiredRevenueAtMinMargin: parseFloat(portfolioRequiredRevenue.toFixed(2)),
          portfolioMarginPct: portfolioRevenue > 0
            ? parseFloat(((portfolioRevenue - portfolioTotalCost) / portfolioRevenue * 100).toFixed(2))
            : null,
          portfolioStatus,
          productsAtRisk: products.filter(p => p.pressureLevel === "High Risk").length,
          productsNoSheet: products.filter(p => !p.hasConfirmedSheet).length,
          productsSellPriority: products.filter(p => p.sellPriority).length,
        },
      });
    } catch (err: any) {
      console.error("[pricing-summary]", err);
      res.status(500).json({ message: err.message || "Failed to generate pricing summary" });
    }
  });

  // ─── Sales Invoices ────────────────────────────────────────────────────────

  // GET all invoices
  app.get("/api/sales-invoices", authenticateToken, async (req: any, res) => {
    try {
      const invoiceList = await storage.getSalesInvoices();
      res.json(invoiceList);
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Failed to fetch sales invoices" });
    }
  });

  // GET single invoice with items and payments
  app.get("/api/sales-invoices/:id", authenticateToken, async (req: any, res) => {
    try {
      const inv = await storage.getSalesInvoice(req.params.id);
      if (!inv) return res.status(404).json({ message: "Sales invoice not found" });
      const items = await storage.getSalesInvoiceItems(inv.id);
      const pmts = await storage.getCustomerPayments(inv.id);
      const totalPaid = pmts.reduce((s, p) => s + Number(p.amount), 0);
      const creditedAmount = Number(inv.creditedAmount ?? 0);
      const balance = Math.max(0, Number(inv.grandTotal) - totalPaid - creditedAmount);
      res.json({ ...inv, items, payments: pmts, totalPaid, balance });
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Failed to fetch invoice" });
    }
  });

  // POST create from challan
  app.post("/api/sales-invoices/create-from-challan/:challanId", authenticateToken, async (req: any, res) => {
    try {
      const { challanId } = req.params;

      // Load challan
      const challanResult = await db.execute(sql`SELECT * FROM delivery_challans WHERE id = ${challanId} LIMIT 1`);
      const challanRow = challanResult.rows[0];
      if (!challanRow) return res.status(404).json({ message: "Delivery challan not found" });
      const challan = challanRow as any;

      // Must be dispatched
      if (challan.status !== "dispatched") {
        return res.status(422).json({ message: "Invoice can only be created after the challan is fully dispatched" });
      }

      // Enforce one invoice per challan
      const existing = await storage.getSalesInvoiceByChallan(challanId);
      if (existing) {
        return res.status(409).json({ message: `Invoice ${existing.invoiceNumber} already exists for this delivery challan`, invoiceId: existing.id });
      }

      // Load challan items
      const challanItemResult = await db.execute(sql`SELECT * FROM delivery_challan_items WHERE challan_id = ${challanId}`);
      const challanItems = challanItemResult.rows as any[];

      // Resolve customerId — challan may have it directly or it may be on the linked SO
      let resolvedCustomerId: string = challan.customer_id;
      if (!resolvedCustomerId && challan.order_id) {
        const soResult = await db.execute(sql`SELECT customer_id FROM sales_orders WHERE id = ${challan.order_id} LIMIT 1`);
        resolvedCustomerId = (soResult.rows[0] as any)?.customer_id ?? null;
      }
      if (!resolvedCustomerId) {
        return res.status(422).json({ message: "Could not determine customer for this challan" });
      }

      // Load customer
      const customerResult = await db.execute(sql`SELECT * FROM customers WHERE id = ${resolvedCustomerId} LIMIT 1`);
      const customer = customerResult.rows[0] as any;

      // Determine B2B vs B2C
      const customerGSTIN = customer?.gst_number || null;
      const customerType = customerGSTIN ? "B2B" : "B2C";
      const isInterState: boolean = req.body.isInterState ?? false;
      const dueDate = req.body.dueDate ? new Date(req.body.dueDate) : null;
      const notes = req.body.notes ?? null;

      // Build line items with GST
      const lineItems: Array<{
        productId: string | null;
        description: string;
        qty: number;
        unitPrice: number;
        hsnCode: string | null;
        gstRate: number;
        taxableAmount: number;
        cgst: number;
        sgst: number;
        igst: number;
        taxAmount: number;
        totalAmount: number;
      }> = [];

      for (const ci of challanItems) {
        // Use qtyDispatched if > 0, else qtyToDispatch if > 0, else fall back to quantity (legacy/seeded data)
        const qtyDispatched = Number(ci.qty_dispatched ?? 0);
        const qtyToDispatch = Number(ci.qty_to_dispatch ?? 0);
        const qtyFallback = Number(ci.quantity ?? 0);
        const qty = qtyDispatched > 0 ? qtyDispatched : qtyToDispatch > 0 ? qtyToDispatch : qtyFallback;
        if (qty <= 0) continue;

        // Look up product for HSN / GST rate
        const prodResult = await db.execute(sql`SELECT * FROM products WHERE id = ${ci.product_id} LIMIT 1`);
        const prod = prodResult.rows[0] as any;
        const unitPrice = Number(ci.unit_price ?? prod?.unit_price ?? 0);
        const hsnCode: string | null = prod?.hsn_code ?? null;
        const gstRate = Number(prod?.gst_rate ?? 0);
        const taxableAmount = qty * unitPrice;
        const tax = taxableAmount * gstRate / 100;
        const cgst = isInterState ? 0 : tax / 2;
        const sgst = isInterState ? 0 : tax / 2;
        const igst = isInterState ? tax : 0;
        const taxAmount = tax;
        const totalAmount = taxableAmount + taxAmount;

        lineItems.push({
          productId: ci.product_id ?? null,
          description: ci.description ?? prod?.name ?? "Product",
          qty,
          unitPrice,
          hsnCode,
          gstRate,
          taxableAmount,
          cgst,
          sgst,
          igst,
          taxAmount,
          totalAmount,
        });
      }

      const subtotal = lineItems.reduce((s, i) => s + i.taxableAmount, 0);
      const totalCgst = lineItems.reduce((s, i) => s + i.cgst, 0);
      const totalSgst = lineItems.reduce((s, i) => s + i.sgst, 0);
      const totalIgst = lineItems.reduce((s, i) => s + i.igst, 0);
      const totalTax = lineItems.reduce((s, i) => s + i.taxAmount, 0);
      const grandTotal = subtotal + totalTax;

      const invoiceNumber = await storage.generateSalesInvoiceNumber();

      const invoice = await storage.createSalesInvoice({
        invoiceNumber,
        invoiceDate: new Date(),
        customerId: resolvedCustomerId,
        soId: challan.order_id ?? null,
        challanId,
        customerType,
        customerGSTIN,
        isInterState,
        subtotal: String(subtotal),
        totalCgst: String(totalCgst),
        totalSgst: String(totalSgst),
        totalIgst: String(totalIgst),
        totalTax: String(totalTax),
        grandTotal: String(grandTotal),
        creditedAmount: "0",
        status: "pending",
        dueDate: dueDate ?? null,
        notes,
        createdBy: req.user.id,
      });

      for (const li of lineItems) {
        await storage.createSalesInvoiceItem({
          invoiceId: invoice.id,
          productId: li.productId,
          description: li.description,
          qty: String(li.qty),
          unitPrice: String(li.unitPrice),
          hsnCode: li.hsnCode,
          gstRate: String(li.gstRate),
          taxableAmount: String(li.taxableAmount),
          cgst: String(li.cgst),
          sgst: String(li.sgst),
          igst: String(li.igst),
          taxAmount: String(li.taxAmount),
          totalAmount: String(li.totalAmount),
        });
      }

      await logAction(req.user.id, "CREATE", "SalesInvoice", `Invoice ${invoiceNumber} created from challan ${challan.challan_number}`);
      res.status(201).json({ ...invoice, items: lineItems });
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Failed to create invoice from challan" });
    }
  });

  // PATCH update invoice (status, dueDate, notes)
  app.patch("/api/sales-invoices/:id", authenticateToken, async (req: any, res) => {
    try {
      const inv = await storage.getSalesInvoice(req.params.id);
      if (!inv) return res.status(404).json({ message: "Sales invoice not found" });
      const updated = await storage.updateSalesInvoice(req.params.id, req.body);
      await logAction(req.user.id, "UPDATE", "SalesInvoice", `Invoice ${inv.invoiceNumber} updated`);
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Failed to update invoice" });
    }
  });

  // ─── Customer Payments ──────────────────────────────────────────────────────

  // GET payments for an invoice
  app.get("/api/customer-payments", authenticateToken, async (req: any, res) => {
    try {
      const { invoiceId } = req.query as { invoiceId?: string };
      const pmts = invoiceId
        ? await storage.getCustomerPayments(invoiceId)
        : await storage.getAllCustomerPayments();
      res.json(pmts);
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Failed to fetch customer payments" });
    }
  });

  // POST record a customer payment
  app.post("/api/customer-payments", authenticateToken, async (req: any, res) => {
    try {
      const { invoiceId, customerId, amount, paymentDate, method, reference, notes } = req.body;
      if (!invoiceId || !amount) return res.status(400).json({ message: "invoiceId and amount are required" });

      const inv = await storage.getSalesInvoice(invoiceId);
      if (!inv) return res.status(404).json({ message: "Invoice not found" });

      const pmt = await storage.createCustomerPayment({
        invoiceId,
        customerId: customerId ?? inv.customerId,
        amount: String(amount),
        paymentDate: paymentDate ? new Date(paymentDate) : new Date(),
        method: method ?? "bank_transfer",
        reference: reference ?? null,
        notes: notes ?? null,
        createdBy: req.user.id,
      });

      // Recompute invoice status accounting for both payments and credit notes
      await storage.recomputeInvoiceCreditedAmount(invoiceId);

      await logAction(req.user.id, "CREATE", "CustomerPayment", `Payment ₹${amount} for invoice ${inv.invoiceNumber}`);
      res.status(201).json(pmt);
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Failed to record payment" });
    }
  });

  // ── Attachments ────────────────────────────────────────────────────────────
  const objectStorage = new ObjectStorageService();

  const ALLOWED_FILE_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/jpg"];
  const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_FILE_SIZE },
    fileFilter: (_req, file, cb) => {
      if (ALLOWED_FILE_TYPES.includes(file.mimetype)) {
        cb(null, true);
      } else {
        cb(new Error("Only PDF, JPG, and PNG files are allowed"));
      }
    },
  });

  // Primary single-step upload endpoint
  app.post("/api/attachments", authenticateToken, (req: any, res: any, next: any) => {
    upload.single("file")(req, res, (err: unknown) => {
      if (err instanceof multer.MulterError) {
        const msg = err.code === "LIMIT_FILE_SIZE" ? "File size must not exceed 10 MB" : err.message;
        return res.status(400).json({ message: msg });
      }
      if (err instanceof Error) {
        return res.status(400).json({ message: err.message });
      }
      next();
    });
  }, async (req: any, res) => {
    try {
      const file = req.file;
      if (!file) return res.status(400).json({ message: "No file provided" });

      const { entityType, entityId, documentType, module: mod } = req.body;
      if (!entityType || !entityId) {
        return res.status(400).json({ message: "entityType and entityId are required" });
      }

      // Validate entity exists
      if (entityType === "grn") {
        const grn = await storage.getGRN(entityId);
        if (!grn) return res.status(404).json({ message: "GRN not found" });
      } else if (entityType === "supplier_invoice") {
        const inv = await storage.getSupplierInvoice(entityId);
        if (!inv) return res.status(404).json({ message: "Supplier invoice not found" });
      } else if (entityType === "sales_return") {
        const sr = await storage.getSalesReturn(entityId);
        if (!sr) return res.status(404).json({ message: "Sales return not found" });
      } else {
        return res.status(400).json({ message: "Invalid entityType" });
      }

      // Compute SHA-256 hash of file buffer
      const { createHash } = await import("crypto");
      const fileHash = createHash("sha256").update(file.buffer).digest("hex");

      // Deduplication check
      const existing = await storage.getAttachmentByHash(entityType, entityId, fileHash);
      if (existing) return res.status(409).json({ message: "This file has already been uploaded for this record" });

      // Get signed upload URL and upload server-side
      const uploadURL = await objectStorage.getObjectEntityUploadURL();
      const objectPath = objectStorage.normalizeObjectEntityPath(uploadURL);

      const uploadRes = await fetch(uploadURL, {
        method: "PUT",
        headers: { "Content-Type": file.mimetype },
        body: file.buffer,
      });
      if (!uploadRes.ok) throw new Error("Failed to upload file to object storage");

      // Persist DB record
      const attachment = await storage.createAttachment({
        entityType,
        entityId,
        module: mod || "inventory",
        documentType: documentType || "other",
        fileUrl: objectPath,
        fileName: file.originalname,
        fileType: file.mimetype,
        fileSize: file.size,
        fileHash,
        uploadedBy: req.user.id,
      });

      res.status(201).json(attachment);
    } catch (err: unknown) {
      console.error("Attachment upload error:", err);
      const message = err instanceof Error ? err.message : "Failed to upload attachment";
      res.status(500).json({ message });
    }
  });

  // Step 1: validate + get signed upload URL
  app.post("/api/attachments/request-upload", authenticateToken, async (req: any, res) => {
    try {
      const { entityType, entityId, documentType, fileName, fileType, fileSize, fileHash, module: mod } = req.body;
      if (!entityType || !entityId || !fileName || !fileType || !fileSize || !fileHash) {
        return res.status(400).json({ message: "entityType, entityId, fileName, fileType, fileSize, fileHash are required" });
      }
      if (!ALLOWED_FILE_TYPES.includes(fileType)) {
        return res.status(400).json({ message: "Only PDF, JPG, and PNG files are allowed" });
      }
      if (Number(fileSize) > MAX_FILE_SIZE) {
        return res.status(400).json({ message: "File size must not exceed 10 MB" });
      }

      // Validate entity exists
      if (entityType === "grn") {
        const grn = await storage.getGRN(entityId);
        if (!grn) return res.status(404).json({ message: "GRN not found" });
      } else if (entityType === "supplier_invoice") {
        const inv = await storage.getSupplierInvoice(entityId);
        if (!inv) return res.status(404).json({ message: "Supplier invoice not found" });
      } else if (entityType === "sales_return") {
        const sr = await storage.getSalesReturn(entityId);
        if (!sr) return res.status(404).json({ message: "Sales return not found" });
      } else {
        return res.status(400).json({ message: "Invalid entityType" });
      }

      // Check for duplicate hash
      const existing = await storage.getAttachmentByHash(entityType, entityId, fileHash);
      if (existing) return res.status(409).json({ message: "This file has already been uploaded for this record" });

      const uploadURL = await objectStorage.getObjectEntityUploadURL();
      const objectPath = objectStorage.normalizeObjectEntityPath(uploadURL);

      res.json({ uploadURL, objectPath, documentType: documentType || "other", module: mod || "inventory" });
    } catch (err: unknown) {
      console.error("Attachment request-upload error:", err);
      res.status(500).json({ message: "Failed to generate upload URL" });
    }
  });

  // Step 2: confirm attachment after upload
  app.post("/api/attachments/confirm", authenticateToken, async (req: any, res) => {
    try {
      const { entityType, entityId, documentType, fileName, fileType, fileSize, fileHash, objectPath, module: mod } = req.body;
      if (!entityType || !entityId || !fileName || !fileType || !fileSize || !fileHash || !objectPath) {
        return res.status(400).json({ message: "All fields are required" });
      }

      // Validate file type and size (re-check at save time)
      if (!["application/pdf", "image/jpeg", "image/png", "image/jpg"].includes(fileType)) {
        return res.status(400).json({ message: "Only PDF, JPG, and PNG files are allowed" });
      }
      if (Number(fileSize) > MAX_FILE_SIZE) {
        return res.status(400).json({ message: "File size must not exceed 10 MB" });
      }

      // Validate entity exists (prevent orphan records)
      if (entityType === "grn") {
        const grn = await storage.getGRN(entityId);
        if (!grn) return res.status(404).json({ message: "GRN not found" });
      } else if (entityType === "supplier_invoice") {
        const inv = await storage.getSupplierInvoice(entityId);
        if (!inv) return res.status(404).json({ message: "Supplier invoice not found" });
      } else if (entityType === "sales_return") {
        const sr = await storage.getSalesReturn(entityId);
        if (!sr) return res.status(404).json({ message: "Sales return not found" });
      } else {
        return res.status(400).json({ message: "Invalid entityType" });
      }

      // Re-check duplicate (race condition safety)
      const existing = await storage.getAttachmentByHash(entityType, entityId, fileHash);
      if (existing) return res.status(409).json({ message: "This file has already been uploaded for this record" });

      const attachment = await storage.createAttachment({
        entityType,
        entityId,
        module: mod || "inventory",
        documentType: documentType || "other",
        fileUrl: objectPath,
        fileName,
        fileType,
        fileSize: Number(fileSize),
        fileHash,
        uploadedBy: req.user.id,
      });

      res.status(201).json(attachment);
    } catch (err: unknown) {
      console.error("Attachment confirm error:", err);
      res.status(500).json({ message: "Failed to save attachment" });
    }
  });

  app.get("/api/attachments/file/:id", authenticateToken, async (req: any, res) => {
    try {
      const { id } = req.params;
      const [found] = await db.select().from(attachmentsTable).where(eq(attachmentsTable.id, id));
      if (!found || found.isDeleted) return res.status(404).json({ message: "Attachment not found" });
      const objectStorage = new ObjectStorageService();
      const objectFile = await objectStorage.getObjectEntityFile(found.fileUrl);
      res.setHeader("Content-Type", found.fileType);
      res.setHeader("Content-Disposition", `inline; filename="${encodeURIComponent(found.fileName)}"`);
      await objectStorage.downloadObject(objectFile, res);
    } catch (err: unknown) {
      console.error("Attachment download error:", err);
      res.status(500).json({ message: "Failed to serve attachment" });
    }
  });

  app.get("/api/attachments/:entityType/:entityId", authenticateToken, async (req: any, res) => {
    try {
      const { entityType, entityId } = req.params;
      const items = await storage.getAttachments(entityType, entityId);
      res.json(items);
    } catch (err: unknown) {
      res.status(500).json({ message: "Failed to fetch attachments" });
    }
  });

  app.delete("/api/attachments/:id", authenticateToken, async (req: any, res) => {
    try {
      const { id } = req.params;
      const [found] = await db.select().from(attachmentsTable).where(eq(attachmentsTable.id, id));
      if (!found || found.isDeleted) return res.status(404).json({ message: "Attachment not found" });
      if (found.uploadedBy !== req.user.id && req.user.role !== "admin") {
        return res.status(403).json({ message: "Only the uploader or an admin can delete this attachment" });
      }
      await storage.softDeleteAttachment(id);
      res.json({ message: "Attachment deleted" });
    } catch (err: unknown) {
      console.error("Attachment delete error:", err);
      res.status(500).json({ message: "Failed to delete attachment" });
    }
  });

  // ─── Sales Returns ─────────────────────────────────────────────────────────

  // GET all sales returns (with customer name + invoice number)
  app.get("/api/sales-returns", authenticateToken, requireRole("admin", "sales_manager", "accountant"), async (req: any, res) => {
    try {
      const returns = await storage.getSalesReturns();
      const allCustomers = await storage.getCustomers();
      const allInvoices = await storage.getSalesInvoices();
      const customerLookup = new Map(allCustomers.map((c) => [c.id, c.name]));
      const invoiceLookup = new Map(allInvoices.map((i) => [i.id, i.invoiceNumber]));
      const result = returns.map((sr) => ({
        ...sr,
        customerName: customerLookup.get(sr.customerId) ?? null,
        invoiceNumber: invoiceLookup.get(sr.invoiceId) ?? null,
      }));
      res.json(result);
    } catch (err: unknown) {
      res.status(500).json({ message: "Failed to fetch sales returns" });
    }
  });

  // GET single sales return with items
  app.get("/api/sales-returns/:id", authenticateToken, requireRole("admin", "sales_manager", "accountant"), async (req: any, res) => {
    try {
      const sr = await storage.getSalesReturn(req.params.id);
      if (!sr) return res.status(404).json({ message: "Sales return not found" });
      const items = await storage.getSalesReturnItems(sr.id);
      const cns = await storage.getCreditNotesByInvoice(sr.invoiceId);
      const creditNote = cns.find((cn) => cn.salesReturnId === sr.id) ?? null;
      res.json({ ...sr, items, creditNote });
    } catch (err: unknown) {
      res.status(500).json({ message: "Failed to fetch sales return" });
    }
  });

  // POST create a sales return from an invoice (draft)
  app.post("/api/sales-returns/create-from-invoice/:invoiceId", authenticateToken, requireRole("admin", "sales_manager", "accountant"), async (req: any, res) => {
    try {
      const invoice = await storage.getSalesInvoice(req.params.invoiceId);
      if (!invoice) return res.status(404).json({ message: "Invoice not found" });

      const invItems = await storage.getSalesInvoiceItems(req.params.invoiceId);
      const productItems = invItems.filter((item) => item.productId != null);
      if (productItems.length === 0) {
        return res.status(400).json({ message: "No returnable product items found on this invoice" });
      }

      // Get all products to check type
      const allProducts = await storage.getProducts();
      const productMap = new Map(allProducts.map((p) => [p.id, p]));

      // Filter out service products
      const returnableItems = productItems.filter((item) => {
        const prod = productMap.get(item.productId!);
        return !prod || prod.type !== "service";
      });

      if (returnableItems.length === 0) {
        return res.status(400).json({ message: "All items are services and cannot be returned" });
      }

      // Generate return number
      const existingReturns = await storage.getSalesReturns();
      const now = new Date();
      const year = now.getFullYear();
      const maxNum = existingReturns
        .filter((r) => r.returnNumber.startsWith(`RET-${year}-`))
        .reduce((max, r) => {
          const num = parseInt(r.returnNumber.split("-")[2] ?? "0");
          return num > max ? num : max;
        }, 0);
      const returnNumber = `RET-${year}-${String(maxNum + 1).padStart(4, "0")}`;

      const sr = await storage.createSalesReturn({
        returnNumber,
        invoiceId: invoice.id,
        challanId: invoice.challanId ?? null,
        soId: invoice.soId ?? null,
        customerId: invoice.customerId,
        warehouseId: null,
        status: "draft",
        returnType: "customer_rejection",
        reason: null,
        returnDate: new Date(),
        createdBy: req.user.id,
      });

      // Compute qtyAlreadyReturned per invoice LINE ITEM (not per productId) from prior processed returns
      const priorReturns = await storage.getSalesReturnsByInvoice(invoice.id);
      const processedReturns = priorReturns.filter((r) => r.status === "processed" && r.id !== sr.id);
      const alreadyReturnedByInvoiceItem = new Map<string, number>();
      for (const pr of processedReturns) {
        const prItems = await storage.getSalesReturnItems(pr.id);
        for (const pri of prItems) {
          if (pri.invoiceItemId) {
            const prev = alreadyReturnedByInvoiceItem.get(pri.invoiceItemId) ?? 0;
            alreadyReturnedByInvoiceItem.set(pri.invoiceItemId, prev + Number(pri.qtyReturned));
          }
        }
      }

      // Create return items (one per invoice line, tracked by invoiceItemId)
      for (const item of returnableItems) {
        const qtyAlreadyReturned = alreadyReturnedByInvoiceItem.get(item.id) ?? 0;
        await storage.createSalesReturnItem({
          salesReturnId: sr.id,
          invoiceItemId: item.id,
          productId: item.productId ?? null,
          description: item.description,
          qtySold: item.qty,
          qtyAlreadyReturned: String(qtyAlreadyReturned),
          qtyReturned: "0",
          unitPrice: item.unitPrice,
          hsnCode: item.hsnCode ?? null,
          gstRate: item.gstRate,
          taxableAmount: "0",
          cgst: "0",
          sgst: "0",
          igst: "0",
          taxAmount: "0",
          totalAmount: "0",
        });
      }

      const items = await storage.getSalesReturnItems(sr.id);
      await logAction(req.user.id, "CREATE", "SalesReturn", `Created sales return ${returnNumber} from invoice ${invoice.invoiceNumber}`);
      res.status(201).json({ ...sr, items });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to create sales return";
      res.status(500).json({ message: msg });
    }
  });

  // PATCH update draft return (qty, reason, returnType, returnDate)
  app.patch("/api/sales-returns/:id", authenticateToken, requireRole("admin", "sales_manager", "accountant"), async (req: any, res) => {
    try {
      const sr = await storage.getSalesReturn(req.params.id);
      if (!sr) return res.status(404).json({ message: "Sales return not found" });
      if (sr.status !== "draft") return res.status(409).json({ message: "Only draft returns can be updated" });

      const { reason, returnType, returnDate, items: itemUpdates } = req.body;
      await storage.updateSalesReturn(sr.id, {
        reason: reason ?? sr.reason,
        returnType: returnType ?? sr.returnType,
        returnDate: returnDate ? new Date(returnDate) : sr.returnDate,
      });

      if (Array.isArray(itemUpdates)) {
        for (const iu of itemUpdates) {
          if (iu.id && typeof iu.qtyReturned !== "undefined") {
            await storage.updateSalesReturnItem(iu.id, { qtyReturned: String(iu.qtyReturned) });
          }
        }
      }

      const updated = await storage.getSalesReturn(sr.id);
      const items = await storage.getSalesReturnItems(sr.id);
      res.json({ ...updated, items });
    } catch (err: unknown) {
      res.status(500).json({ message: "Failed to update sales return" });
    }
  });

  // POST process a sales return (fully atomic DB transaction)
  app.post("/api/sales-returns/:id/process", authenticateToken, requireRole("admin", "sales_manager", "accountant"), async (req: any, res) => {
    try {
      const sr = await storage.getSalesReturn(req.params.id);
      if (!sr) return res.status(404).json({ message: "Sales return not found" });
      if (sr.status !== "draft") return res.status(409).json({ message: "This return has already been processed" });

      const items = await storage.getSalesReturnItems(sr.id);
      const invoice = await storage.getSalesInvoice(sr.invoiceId);
      if (!invoice) return res.status(404).json({ message: "Associated invoice not found" });

      // Load products for service/stock-tracking validation
      const allProducts = await storage.getProducts();
      const productMap = new Map(allProducts.map((p) => [p.id, p]));

      // Hard-reject: block if any item with qty > 0 belongs to a service product
      const returnItemsAll = items.filter((i) => Number(i.qtyReturned) > 0);
      for (const item of returnItemsAll) {
        if (item.productId) {
          const prod = productMap.get(item.productId);
          if (prod && prod.type === "service") {
            return res.status(400).json({ message: `Service items cannot be returned: ${item.description}` });
          }
        }
      }

      // Validate qty bounds
      for (const item of items) {
        const qtyReturned = Number(item.qtyReturned);
        const maxReturnable = Number(item.qtySold) - Number(item.qtyAlreadyReturned);
        if (qtyReturned < 0) return res.status(400).json({ message: `Invalid return qty for item: ${item.description}` });
        if (qtyReturned > maxReturnable) {
          return res.status(400).json({ message: `Return qty (${qtyReturned}) exceeds remaining returnable qty (${maxReturnable}) for: ${item.description}` });
        }
      }
      const returnItems = items.filter((i) => Number(i.qtyReturned) > 0);
      if (returnItems.length === 0) {
        return res.status(400).json({ message: "At least one item must have a return qty > 0" });
      }

      const isInterState = invoice.isInterState;

      // Compute per-item GST and totals (pre-transaction)
      let cnSubtotal = 0, cnTotalCgst = 0, cnTotalSgst = 0, cnTotalIgst = 0;
      const computedItems: Array<{
        item: typeof items[0];
        taxableAmt: number; cgst: number; sgst: number; igst: number; tax: number; total: number;
        isStockTracked: boolean;
      }> = [];

      for (const item of returnItems) {
        const qtyReturned = Number(item.qtyReturned);
        const unitPrice = Number(item.unitPrice);
        const gstRate = Number(item.gstRate);
        const taxableAmt = qtyReturned * unitPrice;
        const totalTax = (taxableAmt * gstRate) / 100;
        const cgst = isInterState ? 0 : totalTax / 2;
        const sgst = isInterState ? 0 : totalTax / 2;
        const igst = isInterState ? totalTax : 0;
        const total = taxableAmt + totalTax;
        cnSubtotal += taxableAmt;
        cnTotalCgst += cgst;
        cnTotalSgst += sgst;
        cnTotalIgst += igst;
        // Stock-tracked = has a productId AND product type !== "service"
        const prod = item.productId ? productMap.get(item.productId) : undefined;
        const isStockTracked = !!prod && prod.type !== "service";
        computedItems.push({ item, taxableAmt, cgst, sgst, igst, tax: totalTax, total, isStockTracked });
      }
      const cnTaxAmount = cnTotalCgst + cnTotalSgst + cnTotalIgst;
      const cnGrandTotal = cnSubtotal + cnTaxAmount;

      // Generate credit note number before transaction (serial read, safe)
      const creditNoteNumber = await storage.generateCreditNoteNumber();

      // ── Atomic DB transaction ─────────────────────────────────────────────
      let creditNote: any;
      await db.transaction(async (tx) => {
        // Step 1: Update return item computed fields
        for (const ci of computedItems) {
          await tx.update(salesReturnItems)
            .set({
              taxableAmount: ci.taxableAmt.toFixed(2),
              cgst: ci.cgst.toFixed(2),
              sgst: ci.sgst.toFixed(2),
              igst: ci.igst.toFixed(2),
              taxAmount: ci.tax.toFixed(2),
              totalAmount: ci.total.toFixed(2),
            })
            .where(eq(salesReturnItems.id, ci.item.id));
        }

        // Step 2: Stock ledger RETURN_IN for stock-tracked products only (raw SQL to avoid type coercion)
        for (const ci of computedItems) {
          if (!ci.isStockTracked || !ci.item.productId) continue;
          // stock_movements.quantity is INTEGER in schema; round to nearest whole unit (standard for discrete-UOM products)
          const qty = Math.round(Number(ci.item.qtyReturned));
          await tx.execute(sql`
            INSERT INTO stock_movements (id, product_id, warehouse_id, movement_type, quantity, reference_type, reference_id, notes, created_by, created_at)
            VALUES (gen_random_uuid(), ${ci.item.productId}, ${sr.warehouseId ?? null}, ${"RETURN_IN"}, ${qty},
                    ${"SALES_RETURN"}, ${sr.id}, ${`Sales return ${sr.returnNumber} from invoice ${invoice.invoiceNumber}`}, ${req.user.id}, now())
          `);
        }

        // Step 3: Create Credit Note (raw SQL to avoid decimal type coercion issues)
        const cnResult = await tx.execute(sql`
          INSERT INTO credit_notes (id, credit_note_number, invoice_id, sales_return_id, customer_id, is_inter_state,
            subtotal, total_cgst, total_sgst, total_igst, tax_amount, grand_total, status, created_by, created_at)
          VALUES (gen_random_uuid(), ${creditNoteNumber}, ${sr.invoiceId}, ${sr.id}, ${sr.customerId}, ${isInterState},
                  ${cnSubtotal.toFixed(2)}, ${cnTotalCgst.toFixed(2)}, ${cnTotalSgst.toFixed(2)}, ${cnTotalIgst.toFixed(2)},
                  ${cnTaxAmount.toFixed(2)}, ${cnGrandTotal.toFixed(2)}, ${"issued"}, ${req.user.id}, now())
          RETURNING *
        `);
        // Map snake_case raw SQL result to camelCase for frontend
        const cnRow = cnResult.rows[0] as Record<string, unknown>;
        creditNote = {
          id: cnRow.id,
          creditNoteNumber: cnRow.credit_note_number,
          invoiceId: cnRow.invoice_id,
          salesReturnId: cnRow.sales_return_id,
          customerId: cnRow.customer_id,
          isInterState: cnRow.is_inter_state,
          subtotal: cnRow.subtotal,
          totalCgst: cnRow.total_cgst,
          totalSgst: cnRow.total_sgst,
          totalIgst: cnRow.total_igst,
          taxAmount: cnRow.tax_amount,
          grandTotal: cnRow.grand_total,
          status: cnRow.status,
          createdBy: cnRow.created_by,
          createdAt: cnRow.created_at,
        };

        // Step 4: Recompute invoice creditedAmount and status (query all CNs within tx)
        const allCNsResult = await tx.execute(sql`
          SELECT grand_total FROM credit_notes WHERE invoice_id = ${sr.invoiceId}
        `);
        const totalCredited = (allCNsResult.rows as { grand_total: string }[])
          .reduce((s, c) => s + Number(c.grand_total), 0);
        const totalPaidResult = await storage.getCustomerPayments(sr.invoiceId);
        const totalPaid = totalPaidResult.reduce((s, p) => s + Number(p.amount), 0);
        const grandTotal = Number(invoice.grandTotal);
        const netOutstanding = grandTotal - totalPaid - totalCredited;
        const newStatus = netOutstanding <= 0 ? "paid" : totalPaid + totalCredited > 0 ? "partial_paid" : "pending";

        await tx.execute(sql`
          UPDATE sales_invoices
          SET credited_amount = ${totalCredited.toFixed(2)}, status = ${newStatus}
          WHERE id = ${sr.invoiceId}
        `);

        // Step 5: Mark return processed
        await tx.update(salesReturns)
          .set({ status: "processed" })
          .where(eq(salesReturns.id, sr.id));
      });

      await logAction(req.user.id, "UPDATE", "SalesReturn", `Processed sales return ${sr.returnNumber} — credit note ${creditNoteNumber} issued`);
      res.json({ status: "processed", creditNote });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to process sales return";
      res.status(500).json({ message: msg });
    }
  });

  // ─── Credit Notes ──────────────────────────────────────────────────────────

  app.get("/api/credit-notes", authenticateToken, requireRole("admin", "sales_manager", "accountant"), async (req: any, res) => {
    try {
      const cns = await storage.getCreditNotes();
      const allCustomers = await storage.getCustomers();
      const customerLookup = new Map(allCustomers.map((c) => [c.id, c.name]));
      const result = cns.map((cn) => ({
        ...cn,
        customerName: customerLookup.get(cn.customerId) ?? null,
      }));
      res.json(result);
    } catch (err: unknown) {
      res.status(500).json({ message: "Failed to fetch credit notes" });
    }
  });

  app.get("/api/credit-notes/:id", authenticateToken, requireRole("admin", "sales_manager", "accountant"), async (req: any, res) => {
    try {
      const cn = await storage.getCreditNote(req.params.id);
      if (!cn) return res.status(404).json({ message: "Credit note not found" });
      res.json(cn);
    } catch (err: unknown) {
      res.status(500).json({ message: "Failed to fetch credit note" });
    }
  });

  // ─── Daily Pricing Engine ─────────────────────────────────────────────────

  // GET effective-prices-today: batch endpoint returns map of productId → effective price + margin data
  // Includes ALL products (even those with no confirmed sheet) so the UI can show warnings for every product
  app.get("/api/daily-price-sheets/effective-prices-today", authenticateToken, async (req: any, res) => {
    try {
      const today = new Date().toISOString().slice(0, 10);
      // Fetch all products of type 'product'
      const allProducts = await db.execute(sql`
        SELECT id, unit_price FROM products WHERE type = 'product'
      `);
      // Fetch confirmed sheets (7-day window) for FIFO pricing
      const result = await db.execute(sql`
        SELECT DISTINCT ON (dps.product_id)
          dps.product_id,
          dps.sheet_date,
          dps.proposed_price,
          dps.blended_cost,
          dps.global_floor_price,
          dps.strict_floor_price
        FROM daily_price_sheets dps
        WHERE dps.status = 'confirmed'
          AND dps.proposed_price IS NOT NULL
          AND dps.sheet_date::date >= (${today}::date - INTERVAL '6 days')
          AND dps.sheet_date::date <= ${today}::date
        ORDER BY dps.product_id, dps.sheet_date DESC
      `);
      const priceMap: Record<string, {
        effectivePrice: string;
        sheetDate: string | null;
        noConfirmedPrice: boolean;
        hasConfirmedToday: boolean;
        blendedCost: string | null;
        globalFloorPrice: string | null;
        strictFloorPrice: string | null;
      }> = {};
      // Seed all products with noConfirmedPrice=true as baseline
      for (const prod of allProducts.rows as any[]) {
        priceMap[prod.id] = {
          effectivePrice: prod.unit_price ?? "0",
          sheetDate: null,
          noConfirmedPrice: true,
          hasConfirmedToday: false,
          blendedCost: null,
          globalFloorPrice: null,
          strictFloorPrice: null,
        };
      }
      // Overlay confirmed sheet data where it exists
      for (const row of result.rows as any[]) {
        const sheetDateStr = typeof row.sheet_date === "string"
          ? row.sheet_date.slice(0, 10)
          : new Date(row.sheet_date).toISOString().slice(0, 10);
        priceMap[row.product_id] = {
          effectivePrice: row.proposed_price,
          sheetDate: sheetDateStr,
          noConfirmedPrice: false,
          hasConfirmedToday: sheetDateStr === today,
          blendedCost: row.blended_cost ?? null,
          globalFloorPrice: row.global_floor_price ?? null,
          strictFloorPrice: row.strict_floor_price ?? null,
        };
      }
      res.json(priceMap);
    } catch (err) {
      res.status(500).json({ message: "Failed to get effective prices" });
    }
  });

  // GET effective-price MUST be before /:id to avoid route conflict
  app.get("/api/daily-price-sheets/effective-price", authenticateToken, async (req: any, res) => {
    try {
      const { productId, date } = req.query as { productId?: string; date?: string };
      if (!productId) return res.status(400).json({ message: "productId is required" });
      const d = date || new Date().toISOString().slice(0, 10);
      const result = await storage.getEffectivePriceForProduct(productId, d);
      if (!result) return res.status(404).json({ message: "Product not found" });
      res.json(result);
    } catch (err) {
      res.status(500).json({ message: "Failed to get effective price" });
    }
  });

  app.get("/api/daily-price-sheets", authenticateToken, requireRole("admin", "sales_manager", "accountant"), async (req: any, res) => {
    try {
      const { productId, sheetDate, date, status } = req.query as { productId?: string; sheetDate?: string; date?: string; status?: string };
      // Accept both `sheetDate` and `date` query params
      const dateFilter = sheetDate || date;
      const sheets = await storage.getDailyPriceSheets({ productId, sheetDate: dateFilter, status });
      const allProducts = await storage.getProducts();
      const prodMap = new Map(allProducts.map(p => [p.id, p]));
      // Include lot lines in each list item
      const result = await Promise.all(sheets.map(async s => {
        const lots = await storage.getDailyPriceSheetLots(s.id);
        return {
          ...s,
          lots,
          productName: prodMap.get(s.productId)?.name ?? null,
          productSku:  prodMap.get(s.productId)?.sku ?? null,
          needsPricingReview: prodMap.get(s.productId)?.needsPricingReview ?? false,
        };
      }));
      res.json(result);
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch price sheets" });
    }
  });

  app.post("/api/daily-price-sheets", authenticateToken, requireRole("admin", "sales_manager", "accountant"), async (req: any, res) => {
    try {
      const { productId, sheetDate, notes, proposedPrice, overrideReason } = req.body;
      if (!productId || !sheetDate) return res.status(400).json({ message: "productId and sheetDate are required" });

      const existing = await storage.getDailyPriceSheetByProductDate(productId, sheetDate);
      if (existing) return res.status(409).json({ message: "A price sheet already exists for this product on this date", sheetId: existing.id });

      const lots = await computeFifoLots(productId);
      const totalRemainingQty = lots.reduce((s, l) => s + l.remainingQty, 0);
      const blendedCost = totalRemainingQty > 0
        ? lots.reduce((s, l) => s + l.landedCost * l.remainingQty, 0) / totalRemainingQty
        : 0;
      // globalFloor = blendedCost × (1 + minMarginPct/100); per-product margin from computeFifoLots
      const prodMR = await db.execute(sql`SELECT min_margin_pct FROM products WHERE id = ${productId} LIMIT 1`);
      const minMarginPct = Number((prodMR.rows[0] as any)?.min_margin_pct ?? 5);
      const globalFloorPrice = parseFloat((blendedCost * (1 + minMarginPct / 100)).toFixed(2));
      const strictFloorPrice = lots.reduce((max, l) => Math.max(max, l.floorPrice), 0);

      // blendedCost always comes from FIFO lot engine, never from product.costPrice (WAC)
      const proposedPriceNum = proposedPrice != null ? parseFloat(proposedPrice) : null;
      if (proposedPriceNum !== null && (isNaN(proposedPriceNum) || proposedPriceNum < 0)) {
        return res.status(400).json({ message: "proposedPrice must be a non-negative number" });
      }
      const overrideRequired  = proposedPriceNum != null
        ? lots.some(l => proposedPriceNum < l.floorPrice)
        : false;

      const sheet = await storage.createDailyPriceSheet({
        productId,
        sheetDate,
        status: "draft",
        proposedPrice:  proposedPriceNum != null ? proposedPriceNum.toFixed(2) : null,
        blendedCost:    blendedCost.toFixed(2),
        globalFloorPrice: globalFloorPrice.toFixed(2),
        strictFloorPrice: strictFloorPrice.toFixed(2),
        overrideRequired,
        overrideReason:   overrideReason || null,
        rejectionNotes:   null,
        notes:            notes || null,
        createdBy:        req.user.id,
        confirmedBy:      null,
      });

      await storage.upsertDailyPriceSheetLots(sheet.id, lots.map(l => ({
        sheetId:       sheet.id,
        grnId:         l.grnId,
        grnNumber:     l.grnNumber,
        lotDate:       l.lotDate,
        remainingQty:  l.remainingQty.toFixed(3),
        landedCost:    l.landedCost.toFixed(2),
        floorPrice:    l.floorPrice.toFixed(2),
        proposedPrice: null,  // never pre-fill from sheet; user sets lot price explicitly via PATCH
      })));

      const sheetLots = await storage.getDailyPriceSheetLots(sheet.id);
      await logAction(req.user.id, "CREATE", "DailyPriceSheet", `Created price sheet for product ${productId} on ${sheetDate}`);
      res.status(201).json({ ...sheet, lots: sheetLots });
    } catch (err) {
      console.error("Create price sheet error:", err);
      res.status(500).json({ message: "Failed to create price sheet" });
    }
  });

  app.get("/api/daily-price-sheets/:id", authenticateToken, requireRole("admin", "sales_manager", "accountant"), async (req: any, res) => {
    try {
      const sheet = await storage.getDailyPriceSheet(req.params.id);
      if (!sheet) return res.status(404).json({ message: "Price sheet not found" });
      const lots = await storage.getDailyPriceSheetLots(sheet.id);
      const prodR = await db.execute(sql`SELECT name, sku, needs_pricing_review FROM products WHERE id = ${sheet.productId} LIMIT 1`);
      const prodRow = prodR.rows[0] as any;
      res.json({ ...sheet, lots, productName: prodRow?.name ?? null, productSku: prodRow?.sku ?? null });
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch price sheet" });
    }
  });

  app.patch("/api/daily-price-sheets/:id", authenticateToken, requireRole("admin", "sales_manager", "accountant"), async (req: any, res) => {
    try {
      const sheet = await storage.getDailyPriceSheet(req.params.id);
      if (!sheet) return res.status(404).json({ message: "Price sheet not found" });
      if (!["draft", "rejected"].includes(sheet.status)) return res.status(409).json({ message: "Can only edit draft or rejected sheets" });

      const { proposedPrice, overrideReason, notes, lots: lotsInput } = req.body;

      if (proposedPrice !== undefined) {
        const pp = parseFloat(proposedPrice);
        if (isNaN(pp) || pp < 0) return res.status(400).json({ message: "proposedPrice must be a non-negative number" });
      }
      const update: Record<string, any> = { rejectionNotes: null };
      if (proposedPrice !== undefined) update.proposedPrice = parseFloat(proposedPrice).toFixed(2);
      if (overrideReason !== undefined) update.overrideReason = overrideReason;
      if (notes !== undefined) update.notes = notes;

      // Apply lot-level proposedPrice edits first
      if (Array.isArray(lotsInput)) {
        for (const li of lotsInput) {
          if (li.id && li.proposedPrice !== undefined) {
            await db.execute(sql`
              UPDATE daily_price_sheet_lots SET proposed_price = ${li.proposedPrice}
              WHERE id = ${li.id} AND sheet_id = ${sheet.id}
            `);
          }
        }
      }

      // Recompute overrideRequired from updated lots and the effective sheet proposedPrice
      const currentLots = await storage.getDailyPriceSheetLots(sheet.id);
      const sheetPP = proposedPrice !== undefined ? parseFloat(proposedPrice) : parseFloat(sheet.proposedPrice ?? "0");
      update.overrideRequired = currentLots.some(l => {
        const effectivePP = l.proposedPrice ? parseFloat(l.proposedPrice) : sheetPP;
        return effectivePP < parseFloat(l.floorPrice);
      });

      const updated = await storage.updateDailyPriceSheet(sheet.id, update);
      const updatedLots = await storage.getDailyPriceSheetLots(sheet.id);
      res.json({ ...updated, lots: updatedLots });
    } catch (err) {
      console.error("Patch price sheet error:", err);
      res.status(500).json({ message: "Failed to update price sheet" });
    }
  });

  app.post("/api/daily-price-sheets/:id/submit", authenticateToken, requireRole("admin", "sales_manager", "accountant"), async (req: any, res) => {
    try {
      const sheet = await storage.getDailyPriceSheet(req.params.id);
      if (!sheet) return res.status(404).json({ message: "Price sheet not found" });
      if (!["draft", "rejected"].includes(sheet.status)) return res.status(409).json({ message: "Only draft or rejected sheets can be submitted" });
      if (!sheet.proposedPrice) return res.status(400).json({ message: "proposedPrice must be set before submitting" });

      const lots = await storage.getDailyPriceSheetLots(sheet.id);
      const sheetPP = parseFloat(sheet.proposedPrice);
      // Each lot uses its own proposedPrice if set; falls back to sheet-level proposedPrice
      // overrideRequired is computed and persisted here so admin/accountant can see the flag
      // at confirm time, but overrideReason is only enforced at confirm (not at submit)
      const overrideRequired = lots.some(l => {
        const effectivePP = l.proposedPrice ? parseFloat(l.proposedPrice) : sheetPP;
        return effectivePP < parseFloat(l.floorPrice);
      });

      const updated = await storage.updateDailyPriceSheet(sheet.id, { status: "submitted", overrideRequired });
      await logAction(req.user.id, "SUBMIT", "DailyPriceSheet", `Submitted price sheet ${sheet.id} for product ${sheet.productId}`);
      res.json(updated);
    } catch (err) {
      res.status(500).json({ message: "Failed to submit price sheet" });
    }
  });

  app.post("/api/daily-price-sheets/:id/confirm", authenticateToken, requireRole("admin", "accountant"), async (req: any, res) => {
    try {
      const sheet = await storage.getDailyPriceSheet(req.params.id);
      if (!sheet) return res.status(404).json({ message: "Price sheet not found" });
      if (sheet.status === "confirmed") return res.status(403).json({ message: "Sheet is already confirmed" });
      if (sheet.status !== "submitted") return res.status(409).json({ message: "Only submitted sheets can be confirmed" });
      if (!sheet.proposedPrice) return res.status(400).json({ message: "proposedPrice must be set before confirming" });

      const lots = await storage.getDailyPriceSheetLots(sheet.id);
      const sheetPP = parseFloat(sheet.proposedPrice);
      // Each lot uses its own proposedPrice if set; falls back to sheet-level proposedPrice
      const overrideRequired = lots.some(l => {
        const effectivePP = l.proposedPrice ? parseFloat(l.proposedPrice) : sheetPP;
        return effectivePP < parseFloat(l.floorPrice);
      });
      // When any lot's price is below floor, overrideReason MUST be supplied explicitly
      // in the confirm request body — stored sheet.overrideReason is not accepted
      const bodyOverrideReason = (req.body?.overrideReason ?? undefined) as string | undefined;
      if (overrideRequired && !bodyOverrideReason) {
        return res.status(400).json({ message: "overrideReason is required in the confirm request body when any lot's proposed price is below its floor" });
      }

      // NOTE: product.unitPrice is intentionally NOT overwritten — this sheet is pricing reference only
      const confirmUpdate: Record<string, any> = {
        status: "confirmed",
        confirmedBy: req.user.id,
        overrideRequired,  // always persist recomputed value (may be true or false)
      };
      if (bodyOverrideReason) {
        confirmUpdate.overrideReason = bodyOverrideReason;
      }
      const updated = await storage.updateDailyPriceSheet(sheet.id, confirmUpdate);
      await db.execute(sql`UPDATE products SET needs_pricing_review = false WHERE id = ${sheet.productId}`);
      await logAction(req.user.id, "CONFIRM", "DailyPriceSheet", `Confirmed price sheet ${sheet.id} — product ${sheet.productId} @ ₹${sheet.proposedPrice}`);
      res.json(updated);
    } catch (err) {
      res.status(500).json({ message: "Failed to confirm price sheet" });
    }
  });

  app.post("/api/daily-price-sheets/:id/reject", authenticateToken, requireRole("admin", "accountant"), async (req: any, res) => {
    try {
      const sheet = await storage.getDailyPriceSheet(req.params.id);
      if (!sheet) return res.status(404).json({ message: "Price sheet not found" });
      if (sheet.status !== "submitted") return res.status(409).json({ message: "Only submitted sheets can be rejected" });

      const rejectionNotes = req.body?.rejectionNotes;
      // Return to draft with rejection notes — submitter must revise and resubmit
      const updated = await storage.updateDailyPriceSheet(sheet.id, { status: "draft", rejectionNotes: rejectionNotes || null });
      await logAction(req.user.id, "REJECT", "DailyPriceSheet", `Rejected price sheet ${sheet.id} for product ${sheet.productId} — returned to draft`);
      res.json(updated);
    } catch (err) {
      res.status(500).json({ message: "Failed to reject price sheet" });
    }
  });

  return httpServer;
}
