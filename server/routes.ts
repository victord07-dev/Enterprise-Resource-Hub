import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { storage, IStorage, type ExpenseFilters } from "./storage";
import { getFinancialYear, nextDocNumberInTx } from "./lib/doc-numbers";
import { todayIST } from "@shared/datetime";
import { db } from "./db";
import { sql, eq } from "drizzle-orm";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import QRCode from "qrcode";
import {
  loginSchema, insertCustomerSchema, insertSupplierSchema, insertProductSchema,
  insertWarehouseSchema, insertSalesOrderSchema, insertSalesOrderItemSchema, insertQuotationSchema,
  insertQuotationItemSchema, insertProjectSchema, insertPurchaseOrderSchema, insertInvoiceSchema,
  insertPaymentSchema, insertEmployeeSchema, insertEmployeeAdvanceSchema, insertAttendanceSchema,
  insertFieldStaffActivitySchema, insertUserSchema, insertLeadSchema,
  insertLeadActivitySchema, insertLeadFollowupSchema, insertQuotationActivitySchema, insertQuotationFollowupSchema,
  insertSupplierProductSchema, insertPurchaseOrderItemSchema,
  insertStockMovementSchema, insertDeliveryChallanSchema, insertDeliveryChallanItemSchema,
  insertPurchaseRequestSchema, insertPurchaseRequestItemSchema,
  insertGoodsReceiptNoteItemSchema,
  insertSupplierInvoiceSchema, insertSupplierPaymentSchema,
  insertSalesInvoiceSchema, insertSalesInvoiceItemSchema, insertCustomerPaymentSchema,
  insertAttachmentSchema, attachments as attachmentsTable,
  salesReturns, salesReturnItems, stockMovements, creditNotes, salesInvoices, customers,
  salesOrders as salesOrdersTable, quotations as quotationsTable, purchaseOrders as purchaseOrdersTable,
  insertWhatsappConversationSchema, insertWhatsappMessageSchema, insertWhatsappTemplateSchema,
  insertExpenseSchema, insertExpenseCategorySchema, EXPENSE_LINKED_ENTITY_TYPES, type Expense,
  insertBrandSchema, COST_VISIBLE_ROLES, COST_FIELDS_TO_REDACT,
  insertLateArrivalRequestSchema,
  productSpecsSchema, customerTierPriceSchema, productCategorySchema,
  productCategoryValues, productCategoryDefaults, productLifecycleValues,
  brands as brandsTable, supplierProducts as supplierProductsTable,
} from "@shared/schema";
import { isCommonMergeField, resolveMergeField, MERGE_FIELD_BY_KEY } from "@shared/mergeFields";

const CAMPAIGN_MISSING_FIELD_BLOCK_THRESHOLD = (() => {
  const parsed = Number(process.env.CAMPAIGN_MISSING_FIELD_BLOCK_THRESHOLD);
  const v = Number.isFinite(parsed) ? parsed : 0.2;
  return Math.min(Math.max(v, 0), 1);
})();
import { generatePOPdfBuffer } from "./po-pdf";
import { generateGrnPdf } from "./grn-pdf";
import { registerObjectStorageRoutes } from "./replit_integrations/object_storage";
import { ObjectStorageService } from "./replit_integrations/object_storage/objectStorage";
import { normalisePhone, verifyInteraktSignature, sendTextMessage, sendTemplateMessage, sendDocumentMessage, checkRateLimit, syncInteraktTemplates, getTemplateSyncStatus, getWebhookUrl } from "./whatsapp";
import { broadcastWhatsappEvent } from "./wsHub";
import crypto from "crypto";
import multer from "multer";
import { parse as csvParse } from "csv-parse/sync";

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

async function notifyPricingReviewers(title: string, message: string, sheetId: string) {
  try {
    const allUsers = await storage.getUsers();
    const reviewers = allUsers.filter(u => ["admin", "accountant", "sales_manager"].includes(u.role) && u.isActive);
    for (const u of reviewers) {
      await storage.createNotification({ userId: u.id, type: "pricing", title, message, relatedId: sheetId });
    }
  } catch (e) {
    console.error("Pricing reviewer notification error:", e);
  }
}

async function notifyRoles(roles: string[], type: string, title: string, message: string, relatedId?: string) {
  try {
    const allUsers = await storage.getUsers();
    const targets = allUsers.filter((u: any) => roles.includes(u.role) && u.isActive);
    for (const u of targets) {
      await storage.createNotification({ userId: u.id, type, title, message, relatedId });
    }
  } catch (e) {
    console.error("notifyRoles error:", e);
  }
}

// Phase 4A G3 — compute invoice due date from payment terms.
// Phase 4 Cleanup G1: This is the single source of truth for due-date math
// across the AR pipeline (auto-invoice on dispatch, manual invoice creation,
// AR Aging Report). Customer-level `payment_terms` (immediate|net_15|net_30|
// net_45|net_60|net_90) drives the offset. Any new payment-term value MUST be
// added here AND in shared/schema.ts customers.paymentTerms enum to avoid
// silent fall-through to "immediate" (same-day due).
function computeDueDate(invoiceDate: Date, paymentTerms: string | null): Date {
  const d = new Date(invoiceDate);
  switch (paymentTerms) {
    case "net_15": d.setDate(d.getDate() + 15); break;
    case "net_30": d.setDate(d.getDate() + 30); break;
    case "net_45": d.setDate(d.getDate() + 45); break;
    case "net_60": d.setDate(d.getDate() + 60); break;
    case "net_90": d.setDate(d.getDate() + 90); break;
    default: break; // 'immediate' or null → same day
  }
  return d;
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
  // Phase 7: also handle bundle line items — expand to per-component shortfall checks
  const bundleLineItems = orderItems.filter(it => it.itemType === "bundle" && it.productId);
  const shortfallItems: Array<{ productId: string; description: string; required: number; available: number; shortfall: number; costPrice: string | null }> = [];

  const allStock = await storage.getInventoryStock();
  const allProds = await storage.getProducts();
  const prodMap = new Map(allProds.map(p => [p.id, p]));
  const otherReserved = await calculateReservedStockForOtherOrders(orderId, storage);

  // Phase 7: pre-load all bundle component lists so we can collect their product IDs
  const bundleComponentsCache = new Map<string, Awaited<ReturnType<typeof storage.getBundleItems>>>();
  for (const bundleLine of bundleLineItems) {
    const comps = await storage.getBundleItems(bundleLine.productId!);
    bundleComponentsCache.set(bundleLine.productId!, comps);
  }

  // Phase 6.6 C5 + Phase 7: pre-fetch primary supplier price per product so auto-PR unit cost
  // pulls from supplier_products instead of products.costPrice (WAC).
  // Collect ALL product IDs needed: product line items + bundle component products.
  const allProductIdsForPricing = new Set<string>();
  for (const it of productItems) { if (it.productId) allProductIdsForPricing.add(it.productId); }
  for (const comps of bundleComponentsCache.values()) {
    for (const c of comps) allProductIdsForPricing.add(c.componentProductId);
  }
  const productIdsToCheck = [...allProductIdsForPricing];
  const primarySupplierPriceMap = new Map<string, string>();
  if (productIdsToCheck.length > 0) {
    const idList = sql.join(productIdsToCheck.map(id => sql`${id}`), sql`, `);
    const sps = await db.execute(sql`
      SELECT DISTINCT ON (product_id) product_id, supplier_price
      FROM supplier_products
      WHERE product_id IN (${idList})
      ORDER BY product_id, is_primary DESC, supplier_price ASC
    `);
    for (const row of sps.rows as { product_id: string; supplier_price: string }[]) {
      primarySupplierPriceMap.set(row.product_id, row.supplier_price);
    }
  }

  // Phase 6.7 Fix 2: track products/components skipped because their lifecycle ≠ 'active'
  const skippedRetiredItems: Array<{ name: string; status: string; replacedByName?: string }> = [];

  for (const item of productItems) {
    const prod = item.productId ? prodMap.get(item.productId) : null;
    // Phase 6.7 Fix 2: skip retired SKUs in auto-PR generation
    if (prod && prod.lifecycleStatus && prod.lifecycleStatus !== "active") {
      const replacedBy = prod.replacedByProductId ? prodMap.get(prod.replacedByProductId) : null;
      skippedRetiredItems.push({
        name: prod.name || item.description || item.productId!,
        status: prod.lifecycleStatus,
        replacedByName: replacedBy?.name,
      });
      continue;
    }
    const totalStock = allStock
      .filter(s => s.productId === item.productId)
      .reduce((sum, s) => sum + (s.quantity ?? 0), 0);
    const reservedByOthers = otherReserved[item.productId!] || 0;
    const availableStock = Math.max(0, totalStock - reservedByOthers);
    if (availableStock < item.quantity) {
      const primarySupplierPrice = item.productId ? primarySupplierPriceMap.get(item.productId) : undefined;
      shortfallItems.push({
        productId: item.productId!,
        description: item.description || prod?.name || "",
        required: item.quantity,
        available: availableStock,
        shortfall: item.quantity - availableStock,
        // Phase 6.6 C5: prefer supplier_products.supplierPrice, fallback to product.costPrice (WAC) if no link.
        costPrice: primarySupplierPrice ?? prod?.costPrice ?? null,
      });
    }
  }

  // Phase 7: check stock for each bundle component scaled by bundle qty; merge duplicates
  for (const bundleLine of bundleLineItems) {
    const comps = bundleComponentsCache.get(bundleLine.productId!) ?? [];
    for (const comp of comps) {
      const compProd = prodMap.get(comp.componentProductId);
      // Phase 6.7 Fix 2: skip retired bundle components in auto-PR generation
      if (compProd && compProd.lifecycleStatus && compProd.lifecycleStatus !== "active") {
        const replacedBy = compProd.replacedByProductId ? prodMap.get(compProd.replacedByProductId) : null;
        const alreadySkipped = skippedRetiredItems.some(s => s.name === (compProd.name || comp.componentProductId));
        if (!alreadySkipped) {
          skippedRetiredItems.push({
            name: compProd.name || comp.componentProductId,
            status: compProd.lifecycleStatus,
            replacedByName: replacedBy?.name,
          });
        }
        continue;
      }
      const requiredQty = Number(comp.quantity) * bundleLine.quantity;
      const totalStock = allStock
        .filter(s => s.productId === comp.componentProductId)
        .reduce((sum, s) => sum + (s.quantity ?? 0), 0);
      const reservedByOthers = otherReserved[comp.componentProductId] || 0;
      const availableStock = Math.max(0, totalStock - reservedByOthers);
      if (availableStock < requiredQty) {
        const primarySupplierPrice = primarySupplierPriceMap.get(comp.componentProductId);
        const existing = shortfallItems.find(s => s.productId === comp.componentProductId);
        if (existing) {
          existing.required += requiredQty;
          existing.shortfall = Math.max(0, existing.required - existing.available);
        } else {
          shortfallItems.push({
            productId: comp.componentProductId,
            description: compProd?.name || comp.componentProductId,
            required: requiredQty,
            available: availableStock,
            shortfall: requiredQty - availableStock,
            costPrice: primarySupplierPrice ?? compProd?.costPrice ?? null,
          });
        }
      }
    }
  }

  if (shortfallItems.length > 0 || skippedRetiredItems.length > 0) {
    const year = new Date().getFullYear();
    const allPRs = await storage.getPurchaseRequests();
    const yearPRs = allPRs.filter(pr => pr.requestNumber.startsWith(`PR-${year}`));
    const maxNum = yearPRs.reduce((max, pr) => {
      const num = parseInt(pr.requestNumber.split("-").pop() || "0", 10);
      return num > max ? num : max;
    }, 0);
    const requestNumber = `PR-${year}-${String(maxNum + 1).padStart(4, "0")}`;

    // Only create PR if there are actual shortfall items to procure
    if (shortfallItems.length === 0) return false;

    const hasAdvance = Number(order.advanceAmount || 0) > 0 || Number(order.paidAmount || 0) > 0;
    const nullCostNames = shortfallItems.filter(i => !i.costPrice).map(i => i.description);
    const nullCostNote = nullCostNames.length > 0
      ? ` ⚠ Unit cost missing for: ${nullCostNames.join(", ")} — resolve in supplier catalog before converting to PO.`
      : "";
    // Phase 6.7 Fix 2: append skipped retired component notes
    const skippedNote = skippedRetiredItems.length > 0
      ? " ⚠ Skipped retired SKU(s): " + skippedRetiredItems.map(s =>
          `${s.name} is ${s.status}${s.replacedByName ? ` — consider replacement: ${s.replacedByName}` : ""}`
        ).join("; ") + "."
      : "";
    const pr = await storage.createPurchaseRequest({
      requestNumber,
      salesOrderId: order.id,
      supplierId: null,
      status: "pending",
      priority: hasAdvance ? "high" : "medium",
      notes: `Auto-generated from confirmed order ${order.orderNumber}. ${shortfallItems.length} product(s) have insufficient stock.${nullCostNote}${skippedNote}`,
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
/**
 * Cost source chain (reference only):
 * products.distributorPrice → supplier_products.supplierPrice (auto-linked on product create
 *                              or CSV import via Phase 6.5 backfill)
 * → po_items.unitCost (defaults from supplier_products.supplierPrice of primary link;
 *                      editable; saving a PO with a different cost UPDATES supplier_products
 *                      and sets needsPricingReview)
 * → grn_items.unitCost (locks on GRN confirm)
 * → FIFO lot consumption (this engine).
 *
 * Supplier price updates affect FUTURE POs/GRNs only. Existing lots preserve locked costs.
 * Phase 6.6 does not change engine behavior — only upstream plumbing.
 */

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

  // Seed default expense categories at startup (idempotent — only inserts missing names)
  try {
    await storage.seedDefaultExpenseCategories();
  } catch (err) {
    console.error("[startup] seedDefaultExpenseCategories failed:", err);
  }

  // Seed default cash/bank accounts at startup (idempotent — Phase 4B)
  try {
    const n = await storage.seedDefaultCashAccounts();
    if (n > 0) console.log(`[startup] seedDefaultCashAccounts: ${n} new accounts`);
  } catch (err) {
    console.error("[startup] seedDefaultCashAccounts failed:", err);
  }

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

  // Phase 4C — Financial dashboard combined snapshot (admin + accountant only).
  // Returns all 6 widget feeds in one round-trip, scoped to the requested
  // date range. Period-independent feeds (cash position, recent activity,
  // pending actions) ignore from/to; period-dependent feeds (period totals,
  // top customers, top suppliers) honor it.
  app.get(
    "/api/dashboard/snapshot",
    authenticateToken,
    requireRole("admin", "accountant"),
    async (req: any, res) => {
      try {
        const fromQ = typeof req.query.from === "string" ? req.query.from : undefined;
        const toQ   = typeof req.query.to   === "string" ? req.query.to   : undefined;
        const period = { from: fromQ, to: toQ };

        // 30-second in-memory TTL cache. Key includes role so a future
        // role-scoped variant can diverge cleanly. Snapshot data is a
        // summary view — small staleness window is acceptable and saves
        // ~7 SQL roundtrips per dashboard mount.
        const { getDashboardCache, setDashboardCache } = await import("./lib/dashboard-cache");
        const cacheKey = `snapshot:${req.user?.role ?? "anon"}:${fromQ ?? ""}:${toQ ?? ""}`;
        const cached = getDashboardCache<any>(cacheKey);
        if (cached) {
          res.setHeader("X-Cache", "HIT");
          return res.json(cached);
        }

        const {
          getCashPositionPerAccount,
          getPeriodTotals,
          getTopCustomers,
          getTopSuppliers,
          getRecentActivity,
          getPendingActions,
          getTodaySnapshot,
        } = await import("./lib/financial-aggregations");

        const [cashPosition, periodTotals, topCustomers, topSuppliers, recentActivity, pendingActions, todaySnapshot] =
          await Promise.all([
            getCashPositionPerAccount(),
            getPeriodTotals(period),
            getTopCustomers(period, 5),
            getTopSuppliers(period, 5),
            getRecentActivity(20),
            getPendingActions(),
            getTodaySnapshot(),
          ]);

        const payload = {
          period: { from: fromQ ?? null, to: toQ ?? null },
          periodTotals,
          cashPosition,
          topCustomers,
          topSuppliers,
          recentActivity,
          pendingActions,
          todaySnapshot,
        };
        setDashboardCache(cacheKey, payload);
        res.setHeader("X-Cache", "MISS");
        res.json(payload);
      } catch (error) {
        console.error("Dashboard snapshot error:", error);
        res.status(500).json({ message: "Failed to fetch dashboard snapshot" });
      }
    },
  );

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

  // ======================== BRANDS ========================
  app.get("/api/brands", authenticateToken, async (_req, res) => {
    try {
      const data = await storage.getBrands();
      res.json(data);
    } catch {
      res.status(500).json({ message: "Failed to fetch brands" });
    }
  });

  app.post("/api/brands", authenticateToken, requireRole("admin", "accountant", "sales_manager"), async (req: any, res) => {
    try {
      const parsed = insertBrandSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Validation error", errors: parsed.error.errors });
      const created = await storage.createBrand(parsed.data);
      await logAction(req.user.id, "create", "brands", `Created brand ${parsed.data.name}`);
      res.status(201).json(created);
    } catch (error: any) {
      if (error.code === "23505") return res.status(409).json({ message: "Brand name already exists" });
      res.status(500).json({ message: "Failed to create brand" });
    }
  });

  app.patch("/api/brands/:id", authenticateToken, requireRole("admin", "accountant", "sales_manager"), async (req: any, res) => {
    try {
      const parsed = insertBrandSchema.partial().safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Validation error", errors: parsed.error.errors });
      const updated = await storage.updateBrand(req.params.id, parsed.data);
      if (!updated) return res.status(404).json({ message: "Brand not found" });
      await logAction(req.user.id, "update", "brands", `Updated brand ${updated.name}`);
      res.json(updated);
    } catch (error: any) {
      if (error.code === "23505") return res.status(409).json({ message: "Brand name already exists" });
      res.status(500).json({ message: "Failed to update brand" });
    }
  });

  app.delete("/api/brands/:id", authenticateToken, requireRole("admin"), async (req: any, res) => {
    try {
      await storage.deleteBrand(req.params.id);
      await logAction(req.user.id, "delete", "brands", `Deleted brand ${req.params.id}`);
      res.json({ message: "Brand deleted" });
    } catch (error: any) {
      if (error.code === "23503") return res.status(409).json({ message: "Cannot delete: brand is in use by one or more products" });
      res.status(500).json({ message: "Failed to delete brand" });
    }
  });

  // ======================== PRODUCTS ========================
  app.get("/api/products", authenticateToken, async (req: any, res) => {
    try {
      const data = await storage.getProducts();
      const role = req.user?.role;
      const canSeeCosts = (COST_VISIBLE_ROLES as readonly string[]).includes(role);
      if (canSeeCosts) {
        res.json(data);
      } else {
        // Strip cost-sensitive fields for sales / warehouse / hr / field roles
        const redacted = data.map((p) => {
          const out: any = { ...p };
          for (const k of COST_FIELDS_TO_REDACT) delete out[k];
          return out;
        });
        res.json(redacted);
      }
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch products" });
    }
  });

  // ── Phase 6: Bulk CSV Import ───────────────────────────────────────────
  const csvUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
      if (file.mimetype === "text/csv" || file.mimetype === "application/vnd.ms-excel" || (file.originalname ?? "").toLowerCase().endsWith(".csv")) {
        cb(null, true);
      } else {
        cb(new Error("Only .csv files are accepted"));
      }
    },
  });

  function parseBoolCsv(val: string | undefined): boolean | null {
    if (!val || val.trim() === "") return null;
    const v = val.trim().toLowerCase();
    if (["true", "yes", "1"].includes(v)) return true;
    if (["false", "no", "0"].includes(v)) return false;
    return null;
  }

  app.post("/api/products/import", authenticateToken, requireRole("admin", "accountant"), (req: any, res: any) => {
    csvUpload.single("file")(req, res, async (err: any) => {
      if (err) return res.status(400).json({ message: err.message });
      if (!req.file) return res.status(400).json({ message: "CSV file is required (field name: file)" });

      const mode = req.query.mode === "commit" ? "commit" : "dry_run";
      const priceListVersionGlobal = ((req.body?.priceListVersion as string) ?? "").trim() || null;
      const defaultTargetMarginPct = req.body?.defaultTargetMarginPct ? Number(req.body.defaultTargetMarginPct) : null;

      try {
        // Bug 8: strip UTF-8 BOM that Excel adds (\uFEFF at start)
        const csvText = req.file.buffer.toString("utf-8").replace(/^\uFEFF/, "");

        // Bug 3: count preamble lines (comment / blank) so row numbers match the original file
        const rawLines = csvText.split(/\r?\n/);
        let preambleLineCount = 0;
        for (const line of rawLines) {
          if (line.trim() === "" || line.trim().startsWith("#")) preambleLineCount++;
          else break;
        }
        // rowNum = preambleLineCount (comments) + 1 (header) + (i + 1) = preambleLineCount + i + 2

        let records: Record<string, string>[];
        try {
          records = csvParse(csvText, { columns: true, skip_empty_lines: true, trim: true, relax_quotes: true, relax_column_count: true, comment: '#' }) as Record<string, string>[];
        } catch (e: any) {
          return res.status(400).json({ message: `CSV parse error: ${e.message}` });
        }
        if (records.length === 0) {
          return res.json({ mode, imported: 0, skipped: 0, would_import: 0, would_skip: 0, errors: [], duplicates_within_file: [] });
        }

        // ── Pre-fetch reference data ──────────────────────────────────────────
        const allBrandsRows = (await db.execute(sql`SELECT id, name FROM brands`)).rows as { id: string; name: string }[];
        const brandNameToId = new Map<string, string>(allBrandsRows.map(b => [b.name.toLowerCase(), b.id]));

        const allSuppliersRows = (await db.execute(sql`SELECT id, name FROM suppliers`)).rows as { id: string; name: string }[];
        const supplierNameToId = new Map<string, string>(allSuppliersRows.map(s => [s.name.toLowerCase(), s.id]));

        // Phase 6.6 A1: pre-fetch full product rows for UPDATE-mode diffing (was Set<sku> before).
        type ExistingProduct = {
          id: string; sku: string; name: string; brand_id: string | null; category: string;
          hsn_code: string | null; gst_rate: string | null;
          distributor_price: string | null; unit_price: string | null; mrp: string | null;
          specs: any; warranty_period: string | null; applicable_regions: string[] | null;
          almm: boolean | null; dcr_compliant: boolean | null; model_series: string | null;
          lifecycle_status: string | null; price_list_version: string | null; pack_size: string | null;
          logistics_cost: string | null; min_margin_pct: string | null; target_margin_pct: string | null;
          customer_tier_price: any; grid_type: string | null;
        };
        const existingProductRows = (await db.execute(sql`
          SELECT id, sku, name, brand_id, category, hsn_code, gst_rate,
                 distributor_price, unit_price, mrp, specs, warranty_period, applicable_regions,
                 almm, dcr_compliant, model_series, lifecycle_status, price_list_version, pack_size,
                 logistics_cost, min_margin_pct, target_margin_pct, customer_tier_price, grid_type
          FROM products WHERE sku IS NOT NULL
        `)).rows as ExistingProduct[];
        const existingProductBySku = new Map<string, ExistingProduct>(existingProductRows.map(r => [r.sku, r]));

        type ErrEntry = { row_number: number; sku: string; product_name: string; error_type: string; error_message: string };
        type DupEntry = { row_number: number; sku: string; first_occurrence_row: number };
        const errors: ErrEntry[] = [];
        const duplicatesWithinFile: DupEntry[] = [];
        const seenSkusInFile = new Map<string, number>();
        const brandsToAutoCreate = new Map<string, string>(); // lowerName → actual brand name
        // Phase 6.5 A1: track suppliers we'll auto-create from the brand column
        const suppliersToAutoCreate = new Map<string, string>(); // lowerName → actual supplier name

        type ValidRow = {
          rowNumber: number;
          name: string; sku: string | null; brandId: string | null; brandLowerName: string | null;
          brandActualName: string | null; brandRaw: string | null;
          category: string; description: string | null;
          distributorPrice: number | null; logisticsCost: number | null; unitPrice: number;
          targetMarginPct: number | null; gstRate: number; hsnCode: string | null; unit: string | null;
          minStockLevel: number | null; minMarginPct: number | null; warrantyPeriod: string | null;
          mrp: number | null; type: string; packSize: string | null; almm: boolean; dcrCompliant: boolean;
          modelSeries: string | null; lifecycleStatus: string; applicableRegions: string[] | null;
          priceListVersion: string | null; productFamily: string | null;
          customerTierPrice: Record<string, number> | null; specs: Record<string, any> | null;
          supplierSku: string | null; supplierIdForAutoLink: string | null;
          gridType: string;
          warnings: string[];
          // Phase 6.6 A1: UPDATE-mode bookkeeping
          isUpdate: boolean;
          existingProduct: ExistingProduct | null;
        };

        const validRows: ValidRow[] = [];

        for (let i = 0; i < records.length; i++) {
          const row = records[i];
          // Bug 3: row number accounts for preamble comment/blank lines
          const rowNum = preambleLineCount + i + 2;
          const rowName = (row["name"] ?? "").trim();

          // Bug 7: normalize em-dash (U+2014), en-dash (U+2013), and similar to ASCII hyphen
          const normalizeDashes = (s: string) => s.replace(/[\u2013\u2014\u2015\u2212]/g, "-");
          const rowCategoryRaw = normalizeDashes((row["category"] ?? "").trim());

          // Attempt fuzzy match for category — helps surface helpful error if no match after normalization
          const matchedCategory = (productCategoryValues as readonly string[]).find(
            c => normalizeDashes(c) === rowCategoryRaw
          ) ?? rowCategoryRaw;
          const rowCategory = matchedCategory;

          const rowSkuRaw = (row["sku"] ?? "").trim() || null;

          if (!rowName) {
            errors.push({ row_number: rowNum, sku: "", product_name: "", error_type: "missing_required", error_message: "name is required" });
            continue;
          }
          if (!rowCategory) {
            errors.push({ row_number: rowNum, sku: rowSkuRaw ?? "", product_name: rowName, error_type: "missing_required", error_message: "category is required" });
            continue;
          }
          if (!(productCategoryValues as readonly string[]).includes(rowCategory)) {
            // Bug 7: give a helpful hint if the only difference is a dash/em-dash variant
            const normInput = normalizeDashes(rowCategoryRaw);
            const suggestion = (productCategoryValues as readonly string[]).find(
              c => normalizeDashes(c).toLowerCase() === normInput.toLowerCase()
            );
            const hint = suggestion ? ` Did you mean "${suggestion}"? (check em-dash vs hyphen)` : "";
            errors.push({ row_number: rowNum, sku: rowSkuRaw ?? "", product_name: rowName, error_type: "invalid_category", error_message: `"${rowCategoryRaw}" is not a valid category.${hint}` });
            continue;
          }

          // ── SKU duplicate / existence checks ─────────────────────────────────
          let finalSku: string | null = rowSkuRaw;
          if (finalSku) {
            if (seenSkusInFile.has(finalSku)) {
              const firstRow = seenSkusInFile.get(finalSku)!;
              duplicatesWithinFile.push({ row_number: rowNum, sku: finalSku, first_occurrence_row: firstRow });
              errors.push({ row_number: rowNum, sku: finalSku, product_name: rowName, error_type: "duplicate_sku_in_file", error_message: `SKU "${finalSku}" already in this file at row ${firstRow} — only first row will import` });
              continue;
            }
            seenSkusInFile.set(finalSku, rowNum);
            // Phase 6.6 A1: SKU-exists no longer errors — row is routed into UPDATE mode below.
          }

          // ── Brand resolution ──────────────────────────────────────────────────
          const rowBrandRaw = (row["brand"] ?? "").trim();
          let resolvedBrandId: string | null = null;
          let brandLowerName: string | null = null;
          let brandActualName: string | null = null;
          if (rowBrandRaw) {
            const lb = rowBrandRaw.toLowerCase();
            brandLowerName = lb;
            if (brandNameToId.has(lb)) {
              resolvedBrandId = brandNameToId.get(lb)!;
            } else {
              brandsToAutoCreate.set(lb, rowBrandRaw);
              resolvedBrandId = `__new__${lb}`;
              brandActualName = rowBrandRaw;
            }
          }

          // ── Category defaults (must be before numeric fields) ─────────────────
          const catDefaults = productCategoryDefaults[rowCategory as keyof typeof productCategoryDefaults];

          // ── Numeric fields ────────────────────────────────────────────────────
          // Bug 2: helper — rejects non-finite values (NaN, Infinity) from bad input like "14,590" or "TBD"
          function parseNumericCsv(raw: string, fieldName: string): number | null | "error" {
            const s = raw.trim();
            if (!s) return null;
            const cleaned = s.replace(/,/g, ""); // tolerate thousands separators
            const n = Number(cleaned);
            if (!isFinite(n)) return "error";
            return n;
          }

          const dpRaw = (row["distributorPrice"] ?? "").trim();
          const distributorPriceResult = parseNumericCsv(dpRaw, "distributorPrice");
          if (distributorPriceResult === "error") {
            errors.push({ row_number: rowNum, sku: rowSkuRaw ?? "", product_name: rowName, error_type: "invalid_number", error_message: `distributorPrice "${dpRaw}" is not a valid number` });
            continue;
          }
          const distributorPrice: number | null = distributorPriceResult;

          const lcRaw = (row["logisticsCost"] ?? "").trim();
          const lcResult = parseNumericCsv(lcRaw, "logisticsCost");
          if (lcResult === "error") {
            errors.push({ row_number: rowNum, sku: rowSkuRaw ?? "", product_name: rowName, error_type: "invalid_number", error_message: `logisticsCost "${lcRaw}" is not a valid number` });
            continue;
          }
          const logisticsCost: number | null = lcResult ?? (distributorPrice != null ? distributorPrice * 0.02 : null);

          const mrpRaw = (row["mrp"] ?? "").trim();
          const mrpResult = parseNumericCsv(mrpRaw, "mrp");
          if (mrpResult === "error") {
            errors.push({ row_number: rowNum, sku: rowSkuRaw ?? "", product_name: rowName, error_type: "invalid_number", error_message: `mrp "${mrpRaw}" is not a valid number` });
            continue;
          }
          const mrp: number | null = mrpResult;

          // Bug 1: gstRate falls back to category default when blank; only hard-defaults to 0 if no category default
          const gstRaw = (row["gstRate"] ?? "").trim();
          const gstResult = parseNumericCsv(gstRaw, "gstRate");
          if (gstResult === "error") {
            errors.push({ row_number: rowNum, sku: rowSkuRaw ?? "", product_name: rowName, error_type: "invalid_number", error_message: `gstRate "${gstRaw}" is not a valid number` });
            continue;
          }
          const gstRate: number = gstResult ?? (catDefaults?.gstRate != null ? Number(catDefaults.gstRate) : 0);

          const targetMarginPct = (row["targetMarginPct"] ?? "").trim() ? Number(row["targetMarginPct"]) : defaultTargetMarginPct;

          let unitPrice: number;
          const rawUP = (row["unitPrice"] ?? "").trim();
          if (rawUP) {
            const upResult = parseNumericCsv(rawUP, "unitPrice");
            if (upResult === "error") {
              errors.push({ row_number: rowNum, sku: rowSkuRaw ?? "", product_name: rowName, error_type: "invalid_number", error_message: `unitPrice "${rawUP}" is not a valid number` });
              continue;
            }
            unitPrice = upResult ?? 0;
          } else if (distributorPrice != null && logisticsCost != null && targetMarginPct != null) {
            unitPrice = (distributorPrice + logisticsCost) * (1 + gstRate / 100) * (1 + targetMarginPct / 100);
          } else if (distributorPrice != null) {
            unitPrice = distributorPrice;
          } else {
            unitPrice = 0;
          }

          // ── applicableRegions ─────────────────────────────────────────────────
          const rawReg = (row["applicableRegions"] ?? "").trim();
          const ALL_INDIA_SYNONYMS = ["all india", "pan india", "all", "pan-india", "india"];
          let applicableRegions: string[] | null = null;
          if (rawReg && !ALL_INDIA_SYNONYMS.includes(rawReg.toLowerCase())) {
            applicableRegions = rawReg.split(",").map(r => r.trim()).filter(Boolean);
          }

          // ── customerTierPrice JSON ────────────────────────────────────────────
          const rawTier = (row["customerTierPrice"] ?? "").trim();
          let customerTierPrice: Record<string, number> | null = null;
          if (rawTier) {
            try {
              const parsed = JSON.parse(rawTier);
              const v = customerTierPriceSchema.safeParse(parsed);
              if (!v.success) {
                errors.push({ row_number: rowNum, sku: finalSku ?? "", product_name: rowName, error_type: "invalid_customer_tier_price", error_message: `customerTierPrice invalid: ${v.error.errors[0]?.message}` });
                continue;
              }
              customerTierPrice = parsed;
            } catch {
              errors.push({ row_number: rowNum, sku: finalSku ?? "", product_name: rowName, error_type: "invalid_json", error_message: "customerTierPrice is not valid JSON" });
              continue;
            }
          }

          // ── specs JSON ────────────────────────────────────────────────────────
          const rawSpecs = (row["specs"] ?? "").trim();
          let specs: Record<string, any> | null = null;
          if (rawSpecs && rawSpecs !== "{}") {
            // Try direct parse first; if it fails, attempt Excel double-quote normalization
            // ("" → ") which is a common artifact when Google Sheets / Excel saves JSON cells
            let parsedSpecs: any = null;
            const specsAttempts = [rawSpecs, rawSpecs.replace(/""/g, '"')];
            for (const attempt of specsAttempts) {
              try {
                const parsed = JSON.parse(attempt);
                if (typeof parsed === "object" && !Array.isArray(parsed)) {
                  parsedSpecs = parsed;
                  break;
                }
              } catch { /* try next */ }
            }
            if (!parsedSpecs) {
              errors.push({ row_number: rowNum, sku: finalSku ?? "", product_name: rowName, error_type: "invalid_json", error_message: "specs is not valid JSON (tried both raw and Excel-normalized forms)" });
              continue;
            }
            const v2 = productSpecsSchema.safeParse(parsedSpecs);
            if (!v2.success) {
              errors.push({ row_number: rowNum, sku: finalSku ?? "", product_name: rowName, error_type: "invalid_specs", error_message: `specs invalid: ${v2.error.errors[0]?.message}` });
              continue;
            }
            specs = parsedSpecs;
          }

          // ── Booleans, lifecycle, type ─────────────────────────────────────────
          const almm = parseBoolCsv(row["almm"]) ?? false;
          const dcrCompliant = parseBoolCsv(row["dcrCompliant"]) ?? false;
          const rawLifecycle = (row["lifecycleStatus"] ?? "").trim().toLowerCase();
          const lifecycleStatus = (productLifecycleValues as readonly string[]).includes(rawLifecycle) ? rawLifecycle : "active";
          // Bug 11: accept "product", "service", "bundle"; anything else defaults to "product"
          const rowType = (row["type"] ?? "").trim().toLowerCase();
          const productType = ["product", "service", "bundle"].includes(rowType) ? rowType : "product";
          // Ticket #78 Phase B: gridType column — valid values or default 'others'
          // CSV may use spaces ("on Grid", "off grid") — normalise to underscores before matching.
          const rawGridType = (row["gridType"] ?? "").trim().toLowerCase().replace(/\s+/g, "_");
          const gridType = ["off_grid", "on_grid", "hybrid", "others"].includes(rawGridType) ? rawGridType : "others";
          const plv = (row["priceListVersion"] ?? "").trim();
          const priceListVersion = plv || priceListVersionGlobal || null;

          // Bug 4: warn (non-blocking) when distributorPrice is blank — product will be stored at ₹0
          const warnings: string[] = [];
          if (distributorPrice == null) {
            warnings.push("distributorPrice is blank — product will be stored with unitPrice ₹0");
          }

          // Phase 6.5 A1: if brand is set but no supplier of the same name exists,
          // queue a supplier auto-creation and use a placeholder id.
          let supplierIdForAutoLink: string | null = null;
          if (rowBrandRaw) {
            const sLower = rowBrandRaw.toLowerCase();
            if (supplierNameToId.has(sLower)) {
              supplierIdForAutoLink = supplierNameToId.get(sLower)!;
            } else {
              suppliersToAutoCreate.set(sLower, rowBrandRaw);
              supplierIdForAutoLink = `__new_supplier__${sLower}`;
            }
          }

          // Phase 6.6 A1: detect UPDATE vs INSERT
          const existingProduct = finalSku ? (existingProductBySku.get(finalSku) ?? null) : null;
          const isUpdate = !!existingProduct;

          validRows.push({
            rowNumber: rowNum,
            name: rowName,
            sku: finalSku,
            brandId: resolvedBrandId,
            brandLowerName,
            brandActualName,
            brandRaw: rowBrandRaw || null,
            isUpdate,
            existingProduct,
            category: rowCategory,
            description: (row["description"] ?? "").trim() || null,
            distributorPrice,
            logisticsCost,
            unitPrice,
            targetMarginPct,
            gstRate,
            hsnCode: (row["hsnCode"] ?? "").trim() || catDefaults?.hsnCode || null,
            unit: (row["unit"] ?? "").trim() || null,
            minStockLevel: (row["minStockLevel"] ?? "").trim() ? Number(row["minStockLevel"]) : null,
            minMarginPct: (row["minMarginPct"] ?? "").trim() ? Number(row["minMarginPct"]) : null,
            warrantyPeriod: (row["warrantyPeriod"] ?? "").trim() || null,
            mrp,
            type: productType,
            packSize: (row["packSize"] ?? "").trim() || null,
            almm,
            dcrCompliant,
            modelSeries: (row["modelSeries"] ?? "").trim() || null,
            lifecycleStatus,
            applicableRegions,
            priceListVersion,
            productFamily: (row["productFamily"] ?? "").trim() || null,
            customerTierPrice,
            specs,
            supplierSku: (row["supplierSku"] ?? "").trim() || null,
            supplierIdForAutoLink,
            gridType,
            warnings,
          });
        }

        const skippedCount = records.length - validRows.length;

        // ── Phase 6.6 A1/A3: split into INSERT vs UPDATE buckets and compute diffs ──
        const updateRows = validRows.filter(r => r.isUpdate);
        const insertRows = validRows.filter(r => !r.isUpdate);

        // Updatable / immutable per spec
        const UPDATABLE_FIELDS: Array<{ key: string; rowVal: (r: ValidRow) => any; existVal: (e: ExistingProduct) => any }> = [
          { key: "distributorPrice", rowVal: r => r.distributorPrice, existVal: e => e.distributor_price != null ? Number(e.distributor_price) : null },
          { key: "unitPrice",        rowVal: r => r.unitPrice,        existVal: e => e.unit_price != null ? Number(e.unit_price) : null },
          { key: "mrp",              rowVal: r => r.mrp,              existVal: e => e.mrp != null ? Number(e.mrp) : null },
          { key: "specs",            rowVal: r => r.specs,            existVal: e => e.specs ?? null },
          { key: "warrantyPeriod",   rowVal: r => r.warrantyPeriod,   existVal: e => e.warranty_period },
          { key: "applicableRegions",rowVal: r => r.applicableRegions,existVal: e => e.applicable_regions },
          { key: "almm",             rowVal: r => r.almm,             existVal: e => !!e.almm },
          { key: "dcrCompliant",     rowVal: r => r.dcrCompliant,     existVal: e => !!e.dcr_compliant },
          { key: "modelSeries",      rowVal: r => r.modelSeries,      existVal: e => e.model_series },
          { key: "lifecycleStatus",  rowVal: r => r.lifecycleStatus,  existVal: e => e.lifecycle_status },
          { key: "priceListVersion", rowVal: r => r.priceListVersion, existVal: e => e.price_list_version },
          { key: "gridType",         rowVal: r => r.gridType,         existVal: e => e.grid_type ?? "others" },
          { key: "packSize",         rowVal: r => r.packSize,         existVal: e => e.pack_size },
          { key: "logisticsCost",    rowVal: r => r.logisticsCost,    existVal: e => e.logistics_cost != null ? Number(e.logistics_cost) : null },
          { key: "minMarginPct",     rowVal: r => r.minMarginPct,     existVal: e => e.min_margin_pct != null ? Number(e.min_margin_pct) : null },
          { key: "targetMarginPct",  rowVal: r => r.targetMarginPct,  existVal: e => e.target_margin_pct != null ? Number(e.target_margin_pct) : null },
          { key: "customerTierPrice",rowVal: r => r.customerTierPrice,existVal: e => e.customer_tier_price ?? null },
          { key: "supplierSku",      rowVal: r => r.supplierSku,      existVal: e => null }, // tracked at supplier_products, not products — info only
        ];
        const FLAG_FIELDS = new Set(["almm", "dcrCompliant"]);

        function valuesEqual(a: any, b: any): boolean {
          if (a === b) return true;
          if (a == null && b == null) return true;
          if (a == null || b == null) return false;
          if (Array.isArray(a) && Array.isArray(b)) {
            if (a.length !== b.length) return false;
            return a.every((v, i) => v === b[i]);
          }
          if (typeof a === "object" && typeof b === "object") {
            try { return JSON.stringify(a) === JSON.stringify(b); } catch { return false; }
          }
          if (typeof a === "number" || typeof b === "number") {
            return Number(a) === Number(b);
          }
          return String(a) === String(b);
        }

        type UpdateChange = { field: string; old_value: any; new_value: any };
        type WouldUpdateEntry = { row_number: number; sku: string; product_name: string; changes: UpdateChange[] };
        type FlagChangeEntry = { row_number: number; sku: string; product_name: string; field: string; old_value: any; new_value: any };
        type ImmutableWarning = { row_number: number; sku: string; product_name: string; field: string; old_value: any; new_value: any };

        const wouldUpdate: WouldUpdateEntry[] = [];
        const flagChanges: FlagChangeEntry[] = [];
        const immutableWarnings: ImmutableWarning[] = [];

        for (const r of updateRows) {
          const existing = r.existingProduct!;
          const changes: UpdateChange[] = [];
          // Updatable fields diff
          for (const f of UPDATABLE_FIELDS) {
            if (f.key === "supplierSku") continue; // not stored on products table
            const oldV = f.existVal(existing);
            const newV = f.rowVal(r);
            if (!valuesEqual(oldV, newV)) {
              changes.push({ field: f.key, old_value: oldV, new_value: newV });
              if (FLAG_FIELDS.has(f.key)) {
                flagChanges.push({ row_number: r.rowNumber, sku: r.sku ?? "", product_name: r.name, field: f.key, old_value: oldV, new_value: newV });
              }
            }
          }
          // Immutable-field warnings (CSV value differs from existing — field will be skipped)
          if (r.name && existing.name && r.name !== existing.name) {
            immutableWarnings.push({ row_number: r.rowNumber, sku: r.sku ?? "", product_name: r.name, field: "name", old_value: existing.name, new_value: r.name });
          }
          if (r.category && existing.category && r.category !== existing.category) {
            immutableWarnings.push({ row_number: r.rowNumber, sku: r.sku ?? "", product_name: r.name, field: "category", old_value: existing.category, new_value: r.category });
          }
          if (r.brandRaw && existing.brand_id) {
            // Compare incoming brand name vs existing brand id by reverse-lookup
            const existingBrandName = allBrandsRows.find(b => b.id === existing.brand_id)?.name;
            if (existingBrandName && r.brandRaw.toLowerCase() !== existingBrandName.toLowerCase()) {
              immutableWarnings.push({ row_number: r.rowNumber, sku: r.sku ?? "", product_name: r.name, field: "brand", old_value: existingBrandName, new_value: r.brandRaw });
            }
          }
          if (r.hsnCode && existing.hsn_code && r.hsnCode !== existing.hsn_code) {
            immutableWarnings.push({ row_number: r.rowNumber, sku: r.sku ?? "", product_name: r.name, field: "hsnCode", old_value: existing.hsn_code, new_value: r.hsnCode });
          }
          if (existing.gst_rate != null && Number(existing.gst_rate) !== r.gstRate) {
            immutableWarnings.push({ row_number: r.rowNumber, sku: r.sku ?? "", product_name: r.name, field: "gstRate", old_value: Number(existing.gst_rate), new_value: r.gstRate });
          }
          if (changes.length > 0) {
            wouldUpdate.push({ row_number: r.rowNumber, sku: r.sku ?? "", product_name: r.name, changes });
          }
        }

        // ── Phase 6.6 B1/B2: fuzzy-duplicate detection on NEW-SKU rows ──
        function normName(s: string): string {
          return s.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
        }
        function levRatio(a: string, b: string): number {
          if (!a && !b) return 1;
          if (!a || !b) return 0;
          const m = a.length, n = b.length;
          const dp: number[] = new Array(n + 1).fill(0);
          for (let j = 0; j <= n; j++) dp[j] = j;
          for (let i = 1; i <= m; i++) {
            let prev = dp[0];
            dp[0] = i;
            for (let j = 1; j <= n; j++) {
              const tmp = dp[j];
              if (a[i - 1] === b[j - 1]) dp[j] = prev;
              else dp[j] = 1 + Math.min(prev, dp[j - 1], dp[j]);
              prev = tmp;
            }
          }
          return 1 - dp[n] / Math.max(m, n);
        }
        type PossibleDuplicate = { row_number: number; incoming_sku: string; incoming_name: string; existing_sku: string; existing_name: string; similarity_pct: number };
        const possibleDuplicates: PossibleDuplicate[] = [];
        const brandIdToName = new Map(allBrandsRows.map(b => [b.id, b.name.toLowerCase()]));
        for (const r of insertRows) {
          if (!r.brandRaw) continue;
          const incomingBrandLower = r.brandRaw.toLowerCase();
          const incomingNorm = normName(r.name);
          if (!incomingNorm) continue;
          for (const e of existingProductRows) {
            if (e.category !== r.category) continue;
            const existingBrandLower = e.brand_id ? brandIdToName.get(e.brand_id) : undefined;
            const sameBrand =
              (r.brandId && r.brandId === e.brand_id) ||
              (existingBrandLower && existingBrandLower === incomingBrandLower);
            if (!sameBrand) continue;
            const ratio = levRatio(incomingNorm, normName(e.name));
            if (ratio >= 0.85) {
              possibleDuplicates.push({
                row_number: r.rowNumber,
                incoming_sku: r.sku ?? "",
                incoming_name: r.name,
                existing_sku: e.sku,
                existing_name: e.name,
                similarity_pct: Math.round(ratio * 100),
              });
            }
          }
        }

        // ── DRY RUN ───────────────────────────────────────────────────────────
        if (mode === "dry_run") {
          // Collect non-blocking warnings across all valid rows
          const allWarnings = validRows.flatMap(r =>
            r.warnings.map(w => ({ row_number: r.rowNumber, product_name: r.name, sku: r.sku ?? "", warning: w }))
          );
          return res.json({
            mode: "dry_run",
            would_import: insertRows.length,
            would_update: wouldUpdate,
            would_update_count: updateRows.length,
            would_skip: skippedCount,
            imported: 0,
            updated: 0,
            skipped: skippedCount,
            errors,
            warnings: allWarnings,
            flag_changes: flagChanges,
            immutable_field_warnings: immutableWarnings,
            possible_duplicates: possibleDuplicates,
            duplicates_within_file: duplicatesWithinFile,
            brands_to_auto_create: [...brandsToAutoCreate.values()],
            suppliers_to_auto_create: [...suppliersToAutoCreate.values()],
          });
        }

        // ── COMMIT MODE ───────────────────────────────────────────────────────
        // Bug 5: create brands INSIDE the transaction so they are rolled back on failure
        let importedCount = 0;
        let updatedCount = 0;
        await db.transaction(async (tx) => {
          // 1) Auto-create brands within transaction
          const newBrandIdMap = new Map<string, string>(); // lowerName → new id
          for (const [lb, actualName] of brandsToAutoCreate) {
            const [nb] = await tx.insert(brandsTable).values({ name: actualName, isActive: true }).returning();
            newBrandIdMap.set(lb, nb.id);
            brandNameToId.set(lb, nb.id);
          }

          // Phase 6.5 A1: auto-create suppliers within the same transaction
          const newSupplierIdMap = new Map<string, string>(); // lowerName → new id
          for (const [ls, actualName] of suppliersToAutoCreate) {
            const inserted = await tx.execute(sql`
              INSERT INTO suppliers (name) VALUES (${actualName}) RETURNING id
            `);
            const newId = (inserted.rows[0] as any).id as string;
            newSupplierIdMap.set(ls, newId);
            supplierNameToId.set(ls, newId);
          }

          for (const r of validRows) {
            // Resolve brand id (replace __new__ placeholder)
            let brandId = r.brandId;
            if (brandId?.startsWith("__new__") && r.brandLowerName) {
              brandId = newBrandIdMap.get(r.brandLowerName) ?? null;
            }

            // Phase 6.6 A3: UPDATE branch for existing SKUs.
            // Only updatable fields are written; immutable fields (sku/name/brand/category/hsnCode/gstRate)
            // are intentionally NOT in the SET clause — diffing them only emits warnings.
            if (r.isUpdate && r.existingProduct) {
              await tx.execute(sql`
                UPDATE products SET
                  distributor_price   = ${r.distributorPrice},
                  unit_price          = ${r.unitPrice},
                  mrp                 = ${r.mrp},
                  specs               = ${r.specs ? JSON.stringify(r.specs) : null}::jsonb,
                  warranty_period     = ${r.warrantyPeriod},
                  applicable_regions  = ${r.applicableRegions?.length ? sql`ARRAY[${sql.join(r.applicableRegions.map(v => sql`${v}`), sql`, `)}]::text[]` : sql`NULL::text[]`},
                  almm                = ${r.almm},
                  dcr_compliant       = ${r.dcrCompliant},
                  model_series        = ${r.modelSeries},
                  lifecycle_status    = ${r.lifecycleStatus},
                  price_list_version  = ${r.priceListVersion},
                  pack_size           = ${r.packSize},
                  logistics_cost      = ${r.logisticsCost},
                  min_margin_pct      = COALESCE(${r.minMarginPct}, min_margin_pct),
                  target_margin_pct   = ${r.targetMarginPct},
                  customer_tier_price = ${r.customerTierPrice ? JSON.stringify(r.customerTierPrice) : null}::jsonb,
                  grid_type           = ${r.gridType}
                WHERE id = ${r.existingProduct.id}
              `);
              updatedCount++;
              continue;
            }

            // Auto-generate SKU if blank (use brand name as prefix, fall back to "PRD")
            const brandPrefix = (r.brandActualName ?? r.brandLowerName ?? "prd").slice(0, 3).toUpperCase();
            const sku = r.sku ?? `${brandPrefix}-${(Date.now() + importedCount).toString(36).toUpperCase()}`;

            const inserted = await tx.execute(sql`
              INSERT INTO products (
                name, sku, brand_id, category, description,
                distributor_price, logistics_cost, unit_price,
                target_margin_pct, gst_rate, hsn_code, unit,
                min_stock_level, min_margin_pct, warranty_period, mrp,
                type, pack_size, almm, dcr_compliant, model_series,
                lifecycle_status, applicable_regions, price_list_version,
                product_family, customer_tier_price, specs, needs_pricing_review,
                grid_type
              ) VALUES (
                ${r.name}, ${sku}, ${brandId}, ${r.category}, ${r.description},
                ${r.distributorPrice}, ${r.logisticsCost}, ${r.unitPrice},
                ${r.targetMarginPct}, ${r.gstRate}, ${r.hsnCode},
                COALESCE(${r.unit}, 'pcs'),
                COALESCE(${r.minStockLevel}, 10), COALESCE(${r.minMarginPct}, 5),
                ${r.warrantyPeriod}, ${r.mrp},
                ${r.type}, ${r.packSize}, ${r.almm}, ${r.dcrCompliant}, ${r.modelSeries},
                ${r.lifecycleStatus},
                ${r.applicableRegions?.length ? sql`ARRAY[${sql.join(r.applicableRegions.map(v => sql`${v}`), sql`, `)}]::text[]` : sql`NULL::text[]`},
                ${r.priceListVersion}, ${r.productFamily},
                ${r.customerTierPrice ? JSON.stringify(r.customerTierPrice) : null}::jsonb,
                ${r.specs ? JSON.stringify(r.specs) : null}::jsonb,
                false,
                ${r.gridType}
              ) RETURNING id
            `);

            const productId = (inserted.rows[0] as any).id as string;
            importedCount++;

            // Supplier auto-link (Phase 6.5 A1: resolve __new_supplier__ placeholder)
            let supplierLinkId = r.supplierIdForAutoLink;
            if (supplierLinkId?.startsWith("__new_supplier__")) {
              const ls = supplierLinkId.slice("__new_supplier__".length);
              supplierLinkId = newSupplierIdMap.get(ls) ?? null;
            }
            if (supplierLinkId) {
              const existingPrimary = await tx.execute(sql`
                SELECT id FROM supplier_products WHERE supplier_id = ${supplierLinkId} AND product_id = ${productId} LIMIT 1
              `);
              if (existingPrimary.rows.length === 0) {
                // Check if any isPrimary already exists for this supplier
                const anyPrimary = await tx.execute(sql`
                  SELECT id FROM supplier_products WHERE supplier_id = ${supplierLinkId} AND is_primary = true LIMIT 1
                `);
                const isPrimary = anyPrimary.rows.length === 0;
                await tx.execute(sql`
                  INSERT INTO supplier_products (supplier_id, product_id, supplier_price, supplier_sku, is_primary)
                  VALUES (${supplierLinkId}, ${productId}, ${r.distributorPrice ?? r.unitPrice ?? 0}, ${r.supplierSku}, ${isPrimary})
                `);
              }
            }
          }
        });

        await logAction(req.user.id, "create", "products", `Bulk CSV import: ${importedCount} products imported, ${updatedCount} updated, ${skippedCount} skipped`);

        return res.json({
          mode: "commit",
          imported: importedCount,
          updated: updatedCount,
          skipped: skippedCount,
          errors,
          duplicates_within_file: duplicatesWithinFile,
        });

      } catch (e: any) {
        console.error("CSV import error:", e);
        return res.status(500).json({ message: `Import failed: ${e.message}` });
      }
    });
  });
  // ── End Phase 6 ───────────────────────────────────────────────────────────

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
      const priceMap: Record<string, { price: string; lastSoldAt: string }> = {};
      for (const row of result.rows as any[]) {
        priceMap[row.product_id] = {
          price: row.last_price,
          lastSoldAt: row.created_at ? new Date(row.created_at).toISOString() : "",
        };
      }
      res.json(priceMap);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch last sold prices" });
    }
  });

  // Phase 6.5 A3: list product IDs that have no supplier_products link.
  // MUST be registered before /api/products/:id so Express doesn't match "missing-supplier" as an :id.
  // Phase 6.6 C6: primary supplier price per product (used by Pricing page Supplier-Price column).
  // Picks isPrimary=true row first, else falls back to lowest supplierPrice row.
  app.get("/api/products/primary-supplier-prices", authenticateToken, async (_req, res) => {
    try {
      const rows = (await db.execute(sql`
        SELECT DISTINCT ON (product_id)
          product_id, supplier_id, supplier_price, last_price_updated_at
        FROM supplier_products
        ORDER BY product_id, is_primary DESC, supplier_price ASC
      `)).rows as { product_id: string; supplier_id: string; supplier_price: string; last_price_updated_at: string | null }[];
      const map: Record<string, { supplierId: string; supplierPrice: string; lastPriceUpdatedAt: string | null }> = {};
      for (const r of rows) {
        map[r.product_id] = { supplierId: r.supplier_id, supplierPrice: r.supplier_price, lastPriceUpdatedAt: r.last_price_updated_at };
      }
      res.json(map);
    } catch (e: any) {
      res.status(500).json({ message: "Failed to fetch primary supplier prices: " + e.message });
    }
  });

  app.get("/api/products/missing-supplier", authenticateToken, async (_req, res) => {
    try {
      const result = await db.execute(sql`
        SELECT p.id FROM products p
        LEFT JOIN supplier_products sp ON sp.product_id = p.id
        WHERE sp.id IS NULL
      `);
      res.json((result.rows as { id: string }[]).map(r => r.id));
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch products missing supplier" });
    }
  });

  app.get("/api/products/:id", authenticateToken, async (req: any, res) => {
    try {
      const data = await storage.getProduct(req.params.id);
      if (!data) return res.status(404).json({ message: "Product not found" });
      const canSeeCosts = (COST_VISIBLE_ROLES as readonly string[]).includes(req.user?.role);
      if (canSeeCosts) return res.json(data);
      const out: any = { ...data };
      for (const k of COST_FIELDS_TO_REDACT) delete out[k];
      res.json(out);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch product" });
    }
  });

  /**
   * Phase 4 — Validate JSONB fields (`specs`, `customerTierPrice`) and
   * compute the set of "custom" spec keys (anything not in the canonical
   * category template) for usage-stat tracking.
   */
  function validateProductJsonbFields(body: any): { ok: true } | { ok: false; message: string; errors?: any } {
    if (body.specs !== undefined && body.specs !== null) {
      const r = productSpecsSchema.safeParse(body.specs);
      if (!r.success) return { ok: false, message: "Invalid `specs` JSONB shape", errors: r.error.errors };
    }
    if (body.customerTierPrice !== undefined && body.customerTierPrice !== null) {
      const r = customerTierPriceSchema.safeParse(body.customerTierPrice);
      if (!r.success) return { ok: false, message: "Invalid `customerTierPrice` JSONB shape", errors: r.error.errors };
    }
    return { ok: true };
  }

  // Lazy-loaded category templates so the server knows which keys are "custom".
  // Mirrors `client/src/constants/categorySpecTemplates.ts`. Kept inline to avoid
  // a client-side import inside the server bundle.
  const SERVER_CATEGORY_TEMPLATE_KEYS: Record<string, string[]> = {
    "Solar PCU - Sine Wave": ["capacity_va", "battery_voltage", "waveform", "topology"],
    "Solar PCU - MPPT": ["capacity_va", "battery_voltage", "mppt_voltage_range", "max_pv_input_w"],
    "Grid Tie Inverter - 1 Phase": ["output_power_kw", "mppt_channels", "max_pv_input_v", "efficiency_pct"],
    "Grid Tie Inverter - 3 Phase": ["output_power_kw", "mppt_channels", "max_pv_input_v", "efficiency_pct"],
    "Hybrid Inverter": ["output_power_kw", "battery_voltage", "mppt_channels", "backup_capable"],
    "Home UPS / Inverter": ["capacity_va", "battery_voltage", "waveform"],
    "Solar Battery - Lead Acid": ["capacity_ah", "voltage_v", "c_rating", "warranty_cycles"],
    "Solar Battery - Lithium": ["capacity_ah", "voltage_v", "cycles", "chemistry", "dod_pct"],
    "Home Battery - Lead Acid": ["capacity_ah", "voltage_v", "battery_type"],
    "Rack / Wall Battery": ["capacity_kwh", "voltage_v", "chemistry", "cycles"],
    "Solar Panel / PV Module": ["wattage_w", "vmp_v", "imp_a", "cells", "cell_type", "efficiency_pct", "dimensions_mm"],
    "Solar Charge Controller": ["controller_type", "current_rating_a", "system_voltage_v", "max_pv_input_v"],
  };
  function customSpecKeysFor(category: string, specs: any): string[] {
    if (!specs || typeof specs !== "object") return [];
    const tpl = new Set(SERVER_CATEGORY_TEMPLATE_KEYS[category] ?? []);
    return Object.keys(specs).filter((k) => !tpl.has(k));
  }

  // Phase 6.5 A2: silent find-or-create supplier matching the brand, then ensure
  // a supplier_products link exists for the given product. Best-effort, non-fatal.
  async function ensureSupplierLinkFromBrand(productId: string, brandId: string | null | undefined, distributorPrice: any) {
    if (!brandId) return;
    try {
      const brandRow = (await db.execute(sql`SELECT name FROM brands WHERE id = ${brandId} LIMIT 1`)).rows[0] as { name: string } | undefined;
      if (!brandRow?.name) return;
      const brandName = brandRow.name;
      const sLower = brandName.toLowerCase();
      let supplierId: string | null = null;
      const existingSup = (await db.execute(sql`SELECT id FROM suppliers WHERE LOWER(name) = ${sLower} LIMIT 1`)).rows[0] as { id: string } | undefined;
      if (existingSup) {
        supplierId = existingSup.id;
      } else {
        const created = (await db.execute(sql`INSERT INTO suppliers (name) VALUES (${brandName}) RETURNING id`)).rows[0] as { id: string };
        supplierId = created.id;
      }
      if (!supplierId) return;
      const existingLink = (await db.execute(sql`SELECT id FROM supplier_products WHERE supplier_id = ${supplierId} AND product_id = ${productId} LIMIT 1`)).rows[0];
      if (existingLink) return;
      const anyPrimary = (await db.execute(sql`SELECT id FROM supplier_products WHERE supplier_id = ${supplierId} AND is_primary = true LIMIT 1`)).rows[0];
      const isPrimary = !anyPrimary;
      const dp = (distributorPrice != null && distributorPrice !== "") ? distributorPrice : 0;
      await db.execute(sql`
        INSERT INTO supplier_products (supplier_id, product_id, supplier_price, is_primary)
        VALUES (${supplierId}, ${productId}, ${dp}, ${isPrimary})
      `);
    } catch (e) {
      console.warn("ensureSupplierLinkFromBrand failed (non-fatal):", e);
    }
  }

  app.post("/api/products", authenticateToken, async (req: any, res) => {
    try {
      const jsonbCheck = validateProductJsonbFields(req.body);
      if (!jsonbCheck.ok) return res.status(400).json({ message: jsonbCheck.message, errors: jsonbCheck.errors });
      const parsed = insertProductSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Validation error", errors: parsed.error.errors });
      const created = await storage.createProduct(parsed.data as any);
      // Phase 4 — increment custom-field usage counts for any non-template keys
      const customKeys = customSpecKeysFor(created.category, created.specs);
      if (customKeys.length > 0) {
        // Phase 4 Cleanup C: log non-fatal failures so they're visible in workflow logs
        try { await storage.incrementCustomFieldUsage(created.category, customKeys); }
        catch (e) { console.warn("incrementCustomFieldUsage failed (non-fatal, product create):", e); }
      }
      // Phase 6.5 A2: silent supplier auto-link
      await ensureSupplierLinkFromBrand(created.id, (created as any).brandId, (created as any).distributorPrice);
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
      const jsonbCheck = validateProductJsonbFields(req.body);
      if (!jsonbCheck.ok) return res.status(400).json({ message: jsonbCheck.message, errors: jsonbCheck.errors });
      // Snapshot prior specs so we only count NEW custom keys introduced by this update.
      const before = req.body.specs !== undefined ? await storage.getProduct(req.params.id) : null;
      const updated = await storage.updateProduct(req.params.id, req.body);
      if (!updated) return res.status(404).json({ message: "Product not found" });
      if (req.body.specs !== undefined && updated.specs) {
        const beforeKeys = new Set(before?.specs && typeof before.specs === "object" ? Object.keys(before.specs as any) : []);
        const newCustomKeys = customSpecKeysFor(updated.category, updated.specs).filter((k) => !beforeKeys.has(k));
        if (newCustomKeys.length > 0) {
          // Phase 4 Cleanup C: log non-fatal failures so they're visible in workflow logs
          try { await storage.incrementCustomFieldUsage(updated.category, newCustomKeys); }
          catch (e) { console.warn("incrementCustomFieldUsage failed (non-fatal, product update):", e); }
        }
      }
      // Phase 6.5 A2: if brand was set/changed, ensure supplier link exists
      if (req.body.brandId !== undefined && (updated as any).brandId) {
        await ensureSupplierLinkFromBrand((updated as any).id, (updated as any).brandId, (updated as any).distributorPrice);
      }
      await logAction(req.user.id, "update", "products", `Updated product ${updated.name}`);
      res.json(updated);
    } catch (error) {
      res.status(500).json({ message: "Failed to update product" });
    }
  });

  app.get("/api/custom-field-suggestions", authenticateToken, async (req: any, res) => {
    try {
      const category = String(req.query.category || "").trim();
      if (!category) return res.json([]);
      const cat = productCategorySchema.safeParse(category);
      if (!cat.success) return res.json([]);
      const minCount = req.query.minCount ? Math.max(1, parseInt(String(req.query.minCount), 10) || 3) : 3;
      const suggestions = await storage.getCustomFieldSuggestions(cat.data, minCount);
      res.json(suggestions);
    } catch {
      res.status(500).json({ message: "Failed to fetch custom field suggestions" });
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

  // Phase 4A E1 — customer outstanding endpoint (used by frontend)
  app.get("/api/customers/:id/outstanding", authenticateToken, async (req, res) => {
    try {
      const result = await storage.getCustomerOutstanding(req.params.id);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Failed to fetch outstanding" });
    }
  });

  app.post("/api/sales-orders", authenticateToken, requireRole("admin", "sales_manager"), async (req: any, res) => {
    try {
      const body = { ...req.body };
      if (body.expectedDeliveryDate && typeof body.expectedDeliveryDate === "string") {
        body.expectedDeliveryDate = new Date(body.expectedDeliveryDate);
      }

      // E2: Outstanding dues block
      const { duesOverride = false, duesOverrideReason = "" } = body;
      delete body.duesOverride;
      delete body.duesOverrideReason;
      if (body.customerId) {
        const outstanding = await storage.getCustomerOutstanding(body.customerId);
        if (outstanding.outstanding > 0) {
          if (!duesOverride) {
            return res.status(400).json({
              message: `Customer has outstanding dues of ₹${outstanding.outstanding.toFixed(2)}. New SO blocked. Customer must clear dues OR admin must override.`,
              outstanding: outstanding.outstanding,
              invoices: outstanding.invoices,
            });
          }
          if (req.user.role !== "admin") {
            return res.status(403).json({ message: "Only admin can authorize SO despite outstanding dues" });
          }
          if (!duesOverrideReason || duesOverrideReason.trim().length < 10) {
            return res.status(400).json({ message: "Dues override reason must be at least 10 characters" });
          }
          body.isDuesOverride = true;
          body.duesOverrideAmount = String(outstanding.outstanding);
          body.duesOverrideBy = req.user.id;
          body.duesOverrideAt = new Date();
          body.duesOverrideReason = duesOverrideReason.trim();
        }
      }

      // Strip client-provided totals — server recomputes these authoritatively when items are saved
      delete body.subtotal;
      delete body.totalTax;
      delete body.totalAmount;
      // Validate payload first (with a placeholder) — bad requests never touch the sequence.
      const preCheck = insertSalesOrderSchema.safeParse({ ...body, orderNumber: "PLACEHOLDER" });
      if (!preCheck.success) return res.status(400).json({ message: "Validation error", errors: preCheck.error.errors });
      // Allocation + INSERT in one transaction: counter upsert + document insert share the same tx.
      // If INSERT fails the upsert rolls back → no number is burned → no gap.
      const fyStr = getFinancialYear(new Date());
      const created = await db.transaction(async (tx) => {
          const orderNumber = await nextDocNumberInTx(tx, "ITFI-SO", fyStr);
          const parsed = insertSalesOrderSchema.parse({ ...body, orderNumber });
          const [row] = await tx.insert(salesOrdersTable).values(parsed as any).returning();
          return row;
        });
      if ((body as any).isDuesOverride) {
        await logAction(req.user.id, "so_dues_override", "sales",
          `SO ${created.orderNumber} created despite ₹${body.duesOverrideAmount} outstanding from customer. Reason: ${body.duesOverrideReason}`);
      }
      await logAction(req.user.id, "create", "sales", `Created sales order ${created.orderNumber}`);
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
      // Validate payload first (with a placeholder) — bad requests never touch the sequence.
      const preCheck = insertQuotationSchema.safeParse({ ...body, quoteNumber: "PLACEHOLDER" });
      if (!preCheck.success) return res.status(400).json({ message: "Validation error", errors: preCheck.error.errors });
      // Allocation + INSERT in one transaction: counter upsert + document insert share the same tx.
      // If INSERT fails the upsert rolls back → no number is burned → no gap.
      const fyStr = getFinancialYear(new Date());
      const created = await db.transaction(async (tx) => {
          const quoteNumber = await nextDocNumberInTx(tx, "ITFI-Q", fyStr);
          const parsed = insertQuotationSchema.parse({ ...body, quoteNumber });
          const [row] = await tx.insert(quotationsTable).values(parsed as any).returning();
          return row;
        });
      await logAction(req.user.id, "create", "sales", `Created quotation ${created.quoteNumber}`);
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
      // Phase 6.5 D1: hard-block save when any product line refers to a product whose master unitPrice is null/zero.
      const productIds = items.filter((i: any) => i?.productId).map((i: any) => String(i.productId));
      const offenders = await findZeroPriceProducts(productIds, "unit_price");
      if (offenders.length > 0) {
        return res.status(422).json({
          code: "zero_price_products",
          message: "Cannot save: " + offenders.map(p => `${p.name} (${p.sku})`).join(", ") + " have no unit price set. Set a unit price on each product before adding it to a sales order.",
          products: offenders,
        });
      }

      // Phase 4 Cleanup A: floor-price advisory + admin override gate
      const floorOverrideReason: string = typeof req.body.floorOverrideReason === "string" ? req.body.floorOverrideReason.trim() : "";
      const breaches = await findFloorBreaches(items);
      const breachIdxSet = new Set(breaches.map(b => b.idx));
      if (breaches.length > 0) {
        if (req.user.role !== "admin") {
          return res.status(403).json({
            code: "floor_breach_no_admin",
            message: "Only admin can save lines below floor price. Adjust prices at or above floor before saving.",
            breaches,
          });
        }
        if (!floorOverrideReason || floorOverrideReason.length < 10) {
          return res.status(422).json({
            code: "floor_override_required",
            message: "Floor override reason is required (minimum 10 characters) for lines below floor price.",
            breaches,
          });
        }
      }

      await storage.deleteSalesOrderItems(req.params.id);
      const created = [];
      for (let idx = 0; idx < items.length; idx++) {
        const item = items[idx];
        const qty = Number(item.quantity) || 0;
        const unitPrice = Number(item.unitPrice) || 0;
        const gstRate = Number(item.gstRate) || 0;
        const serverTaxAmount = parseFloat((qty * unitPrice * gstRate / 100).toFixed(2));
        const isBreach = breachIdxSet.has(idx);
        const parsed = insertSalesOrderItemSchema.parse({
          ...item,
          orderId: req.params.id,
          taxAmount: serverTaxAmount.toString(),
          isFloorOverride: isBreach,
          floorOverrideReason: isBreach ? floorOverrideReason : null,
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
        const totalsPatch: any = {
          subtotal: subtotal.toFixed(2),
          totalTax: totalTax.toFixed(2),
          totalAmount: totalAmount.toFixed(2),
        };
        if (breaches.length > 0) {
          totalsPatch.floorOverrideBy = req.user.id;
          totalsPatch.floorOverrideAt = new Date();
        }
        await storage.updateSalesOrder(req.params.id, totalsPatch);
      }

      // Phase 4 Cleanup A4: audit-log floor override authorisation
      if (breaches.length > 0) {
        const summary = breaches.map(b => `${b.productName}: ₹${b.unitPrice.toFixed(2)} < floor ₹${b.floorPrice.toFixed(2)}`).join("; ");
        await logAction(req.user.id, "floor_override_authorized", "sales",
          `SO ${order?.orderNumber || req.params.id} saved with ${breaches.length} below-floor line(s). ${summary}. Reason: ${floorOverrideReason}`);
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
      // Phase 6.5 D1: hard-block save when any product line refers to a product whose master unitPrice is null/zero.
      const productIds = items.filter((i: any) => i?.productId).map((i: any) => String(i.productId));
      const offenders = await findZeroPriceProducts(productIds, "unit_price");
      if (offenders.length > 0) {
        return res.status(422).json({
          code: "zero_price_products",
          message: "Cannot save: " + offenders.map(p => `${p.name} (${p.sku})`).join(", ") + " have no unit price set. Set a unit price on each product before adding it to a quotation.",
          products: offenders,
        });
      }

      // Phase 4 Cleanup A: floor-price advisory + admin override gate
      const floorOverrideReason: string = typeof req.body.floorOverrideReason === "string" ? req.body.floorOverrideReason.trim() : "";
      const breaches = await findFloorBreaches(items);
      const breachIdxSet = new Set(breaches.map(b => b.idx));
      if (breaches.length > 0) {
        if (req.user.role !== "admin") {
          return res.status(403).json({
            code: "floor_breach_no_admin",
            message: "Only admin can save lines below floor price. Adjust prices at or above floor before saving.",
            breaches,
          });
        }
        if (!floorOverrideReason || floorOverrideReason.length < 10) {
          return res.status(422).json({
            code: "floor_override_required",
            message: "Floor override reason is required (minimum 10 characters) for lines below floor price.",
            breaches,
          });
        }
      }

      await storage.deleteQuotationItems(req.params.id);
      const created = [];
      for (let idx = 0; idx < items.length; idx++) {
        const item = items[idx];
        const isBreach = breachIdxSet.has(idx);
        const parsed = insertQuotationItemSchema.parse({
          ...item,
          quotationId: req.params.id,
          isFloorOverride: isBreach,
          floorOverrideReason: isBreach ? floorOverrideReason : null,
        });
        const c = await storage.createQuotationItem(parsed);
        created.push(c);
      }

      if (breaches.length > 0) {
        await storage.updateQuotation(req.params.id, {
          floorOverrideBy: req.user.id,
          floorOverrideAt: new Date(),
        } as any);
        const quote = await storage.getQuotation(req.params.id);
        const summary = breaches.map(b => `${b.productName}: ₹${b.unitPrice.toFixed(2)} < floor ₹${b.floorPrice.toFixed(2)}`).join("; ");
        await logAction(req.user.id, "floor_override_authorized", "sales",
          `Quotation ${quote?.quoteNumber || req.params.id} saved with ${breaches.length} below-floor line(s). ${summary}. Reason: ${floorOverrideReason}`);
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

      // E3: Outstanding dues block on quotation→SO conversion
      const { duesOverride: convDuesOverride = false, duesOverrideReason: convDuesReason = "" } = req.body ?? {};
      const duesResult = await storage.getCustomerOutstanding(quotation.customerId);
      const convDuesOverrideFields: any = {};
      if (duesResult.outstanding > 0) {
        if (!convDuesOverride) {
          return res.status(400).json({
            message: `Customer has outstanding dues of ₹${duesResult.outstanding.toFixed(2)}. SO conversion blocked.`,
            outstanding: duesResult.outstanding,
            invoices: duesResult.invoices,
          });
        }
        if (req.user.role !== "admin") {
          return res.status(403).json({ message: "Only admin can authorize SO despite outstanding dues" });
        }
        if (!convDuesReason || convDuesReason.trim().length < 10) {
          return res.status(400).json({ message: "Dues override reason must be at least 10 characters" });
        }
        convDuesOverrideFields.isDuesOverride = true;
        convDuesOverrideFields.duesOverrideAmount = String(duesResult.outstanding);
        convDuesOverrideFields.duesOverrideBy = req.user.id;
        convDuesOverrideFields.duesOverrideAt = new Date();
        convDuesOverrideFields.duesOverrideReason = convDuesReason.trim();
      }

      // Phase 4 Cleanup A C2: propagate floor-override metadata from quotation to SO
      const quoteFloorFields: any = {};
      if ((quotation as any).floorOverrideBy) {
        quoteFloorFields.floorOverrideBy = (quotation as any).floorOverrideBy;
        quoteFloorFields.floorOverrideAt = (quotation as any).floorOverrideAt || new Date();
      }

      const fyStr = getFinancialYear(new Date());
      // Allocation + INSERT in one transaction so a failed insert never burns a number.
      const order = await db.transaction(async (tx) => {
          const orderNumber = await nextDocNumberInTx(tx, "ITFI-SO", fyStr);
          const [row] = await tx.insert(salesOrdersTable).values({
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
            ...convDuesOverrideFields,
            ...quoteFloorFields,
          } as any).returning();
          return row;
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
          hsnCode: (qi as any).hsnCode ?? null,
          gstRate: (qi as any).gstRate ?? "0",
          taxAmount: (qi as any).taxAmount ?? "0",
          // Phase 4 Cleanup A C2: per-line override flag + reason
          isFloorOverride: (qi as any).isFloorOverride ?? false,
          floorOverrideReason: (qi as any).floorOverrideReason ?? null,
        });
      }

      await storage.updateQuotation(req.params.id, { status: "accepted" });
      if (convDuesOverrideFields.isDuesOverride) {
        await logAction(req.user.id, "so_dues_override", "sales",
          `SO ${order.orderNumber} (from quotation ${quotation.quoteNumber}) created despite ₹${convDuesOverrideFields.duesOverrideAmount} outstanding. Reason: ${convDuesOverrideFields.duesOverrideReason}`);
      }
      await logAction(req.user.id, "create", "sales", `Converted quotation ${quotation.quoteNumber} to order ${order.orderNumber}`);

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

      const fyStrQ = getFinancialYear(new Date());
      // Allocation + INSERT in one transaction so a failed insert never burns a number.
      const quotation = await db.transaction(async (tx) => {
          const quoteNumber = await nextDocNumberInTx(tx, "ITFI-Q", fyStrQ);
          const [row] = await tx.insert(quotationsTable).values({
            quoteNumber,
            customerId: customer.id,
            status: "draft",
            totalAmount: lead.estimatedValue || "0",
            validUntil: null,
            createdAt: new Date(),
            notes: lead.requirement || null,
            discountType: null,
            discountValue: null,
          } as any).returning();
          return row;
        });

      const updatedLead = await storage.updateLead(req.params.id, {
        status: "quotation_sent",
        quotationId: quotation.id,
      });

      await logAction(req.user.id, "create", "leads", `Converted lead ${lead.name} to quotation ${quotation.quoteNumber}`);

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

      const { amount, method, reference, cashAccountId } = req.body;
      if (!amount || !method) return res.status(400).json({ message: "Amount and method are required" });
      if (!cashAccountId) return res.status(400).json({ message: "cashAccountId is required — select the account where this payment was received" });

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
        cashAccountId,
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
      // Enrich each PO with supplier paid total so the frontend can gate "Create GRN"
      const enriched = await Promise.all(data.map(async (po: any) => {
        try {
          const payments = await storage.getSupplierPaymentsByPO(po.id);
          const supplierPaidAmount = payments.reduce((s: number, p: any) => s + Number(p.amount ?? 0), 0);
          return { ...po, supplierPaidAmount };
        } catch { return { ...po, supplierPaidAmount: 0 }; }
      }));
      res.json(enriched);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch purchase orders" });
    }
  });

  // Phase 6.5 D: find products from a given list whose master price (unitPrice or distributorPrice) is null/zero.
  // Used to hard-block sales/quotation save (D1) and PO issue (D2).
  async function findZeroPriceProducts(productIds: string[], priceField: "unit_price" | "distributor_price"): Promise<{ id: string; name: string; sku: string }[]> {
    const ids = productIds.filter(Boolean);
    if (ids.length === 0) return [];
    const rows = (await db.execute(sql`
      SELECT id, name, sku, unit_price, distributor_price
      FROM products
      WHERE id IN (${sql.join(ids.map(i => sql`${i}`), sql`, `)})
    `)).rows as any[];
    const offenders: { id: string; name: string; sku: string }[] = [];
    for (const r of rows) {
      const raw = priceField === "unit_price" ? r.unit_price : r.distributor_price;
      const v = raw == null ? null : Number(raw);
      if (v == null || isNaN(v) || v <= 0) {
        offenders.push({ id: r.id, name: r.name, sku: r.sku });
      }
    }
    return offenders;
  }

  // Phase 4 Cleanup A: helper — for a list of items, find lines whose unitPrice is below the
  // strict floor price (from today's confirmed daily_price_sheets, falling back to last 7 days).
  // Returns indices + breach details. Lines with no productId or no confirmed sheet are exempt.
  async function findFloorBreaches(items: any[]): Promise<Array<{ idx: number; productId: string; productName: string; unitPrice: number; floorPrice: number }>> {
    const today = new Date().toISOString().slice(0, 10);
    const productIds = Array.from(new Set(items.filter(i => i?.productId).map(i => String(i.productId))));
    if (productIds.length === 0) return [];
    const rows = (await db.execute(sql`
      SELECT DISTINCT ON (dps.product_id)
        dps.product_id, dps.strict_floor_price, p.name
      FROM daily_price_sheets dps
      JOIN products p ON p.id = dps.product_id
      WHERE dps.status = 'confirmed'
        AND dps.strict_floor_price IS NOT NULL
        AND dps.sheet_date::date >= (${today}::date - INTERVAL '6 days')
        AND dps.sheet_date::date <= ${today}::date
        AND dps.product_id IN (${sql.join(productIds.map(i => sql`${i}`), sql`, `)})
      ORDER BY dps.product_id, dps.sheet_date DESC
    `)).rows as any[];
    const floorMap = new Map<string, { floor: number; name: string }>();
    for (const r of rows) {
      const f = Number(r.strict_floor_price);
      if (!isNaN(f) && f > 0) floorMap.set(r.product_id, { floor: f, name: r.name });
    }
    const breaches: Array<{ idx: number; productId: string; productName: string; unitPrice: number; floorPrice: number }> = [];
    items.forEach((it, idx) => {
      if (!it?.productId) return;
      const pid = String(it.productId);
      const meta = floorMap.get(pid);
      if (!meta) return; // no confirmed sheet → exempt (matches client behaviour)
      const up = Number(it.unitPrice);
      if (isNaN(up)) return;
      if (up < meta.floor) {
        breaches.push({ idx, productId: pid, productName: meta.name, unitPrice: up, floorPrice: meta.floor });
      }
    });
    return breaches;
  }

  // Phase 6.5 C2: helper — does this supplier have GST + phone + address?
  async function getSupplierIncompleteness(supplierId: string | null | undefined) {
    if (!supplierId) return { incomplete: true, missing: ["supplier"] as string[], supplier: null as any };
    const row = (await db.execute(sql`SELECT id, name, gst_number, phone, address FROM suppliers WHERE id = ${supplierId} LIMIT 1`)).rows[0] as any;
    if (!row) return { incomplete: true, missing: ["supplier"], supplier: null };
    const missing: string[] = [];
    if (!row.gst_number || String(row.gst_number).trim() === "") missing.push("gst");
    if (!row.phone || String(row.phone).trim() === "") missing.push("phone");
    if (!row.address || String(row.address).trim() === "") missing.push("address");
    return { incomplete: missing.length > 0, missing, supplier: row };
  }

  // Phase 6.5 C2: statuses that constitute "issuing" the PO to the supplier (block if supplier incomplete)
  const PO_ISSUED_STATUSES = new Set(["issued", "approved", "shipped", "partial", "received"]);

  app.post("/api/purchase-orders", authenticateToken, async (req: any, res) => {
    try {
      // C2: block ALL PO creation when supplier profile is incomplete (GST, phone, address required)
      const check = await getSupplierIncompleteness(req.body?.supplierId);
      if (check.incomplete) {
        return res.status(422).json({
          code: "supplier_incomplete",
          message: "Supplier is missing required details (" + check.missing.join(", ") + "). Complete the supplier profile before creating a purchase order.",
          missing: check.missing,
          supplierId: check.supplier?.id || req.body?.supplierId || null,
          supplierName: check.supplier?.name || null,
        });
      }
      // D2: also block PO issue when any product line refers to a product whose master distributorPrice is null/zero.
      const incomingStatus = (req.body?.status || "pending") as string;
      if (PO_ISSUED_STATUSES.has(incomingStatus)) {
        const inlineItems = Array.isArray((req.body as any)?.lineItems) ? (req.body as any).lineItems : (Array.isArray((req.body as any)?.items) ? (req.body as any).items : []);
        const inlineProductIds = inlineItems.filter((i: any) => i?.productId).map((i: any) => String(i.productId));
        if (inlineProductIds.length > 0) {
          const dpOffenders = await findZeroPriceProducts(inlineProductIds, "distributor_price");
          if (dpOffenders.length > 0) {
            return res.status(422).json({
              code: "zero_distributor_price_products",
              message: "Cannot issue PO: " + dpOffenders.map(p => `${p.name} (${p.sku})`).join(", ") + " have no distributor price set. Save as Pending until distributor pricing is established.",
              products: dpOffenders,
            });
          }
        }
      }
      const manualPoNumber = (req.body.poNumber || "").trim();
      const payload = {
        ...req.body,
        poNumber: manualPoNumber || "PLACEHOLDER",
        expectedDelivery: req.body.expectedDelivery && req.body.expectedDelivery !== "" ? new Date(req.body.expectedDelivery) : null,
      };

      // Validate payload before allocating sequence number so bad requests never burn a number.
      const preCheck = insertPurchaseOrderSchema.safeParse(payload);
      if (!preCheck.success) return res.status(400).json({ message: "Validation error", errors: preCheck.error.errors });

      // Allocation + INSERT in one transaction so a failed insert never burns a number.
      // If user provided a manual PO number, use it directly (no sequence allocation).
      const fyPO = getFinancialYear(new Date());
      const created = manualPoNumber
        ? await (async () => {
            const parsed = insertPurchaseOrderSchema.parse({ ...payload, poNumber: manualPoNumber });
            return storage.createPurchaseOrder(parsed as any);
          })()
        : await db.transaction(async (tx) => {
              const poNumber = await nextDocNumberInTx(tx, "ITFI-PO", fyPO);
              const parsed = insertPurchaseOrderSchema.parse({ ...payload, poNumber });
              const [row] = await tx.insert(purchaseOrdersTable).values(parsed as any).returning();
              return row;
            });
      await logAction(req.user.id, "create", "supply_chain", `Created PO ${created.poNumber}`);
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
      // Phase 6.5 C2: block transitioning into an "issued" status when supplier is incomplete
      const targetStatus = updateData.status as string | undefined;
      if (targetStatus && PO_ISSUED_STATUSES.has(targetStatus)) {
        const existing = await storage.getPurchaseOrder(req.params.id);
        const wasIssued = existing && PO_ISSUED_STATUSES.has(existing.status as any);
        if (!wasIssued) {
          const supplierIdToCheck = (updateData.supplierId as string | undefined) || existing?.supplierId || null;
          const check = await getSupplierIncompleteness(supplierIdToCheck);
          if (check.incomplete) {
            return res.status(422).json({
              code: "supplier_incomplete",
              message: "Supplier is missing required details (" + check.missing.join(", ") + "). Keep PO as Pending or complete the supplier profile.",
              missing: check.missing,
              supplierId: check.supplier?.id || supplierIdToCheck,
              supplierName: check.supplier?.name || null,
            });
          }
          // Phase 6.5 D2: scan saved PO line items — block if any product has null/zero distributorPrice.
          const existingItems = await storage.getPurchaseOrderItems(req.params.id);
          const linePids = existingItems.map(it => it.productId).filter(Boolean) as string[];
          if (linePids.length > 0) {
            const dpOffenders = await findZeroPriceProducts(linePids, "distributor_price");
            if (dpOffenders.length > 0) {
              return res.status(422).json({
                code: "zero_distributor_price_products",
                message: "Cannot issue PO: " + dpOffenders.map(p => `${p.name} (${p.sku})`).join(", ") + " have no distributor price set. Keep PO as Pending until distributor pricing is established.",
                products: dpOffenders,
              });
            }
          }
        }
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
      // Phase 6.5 D2: if the parent PO is in an "issued" status, block when any line refers to
      // a product whose master distributor_price is null/zero. Run this BEFORE the validItems
      // filter — otherwise lines with auto-prefilled unitCost=0 get silently dropped and the
      // user sees the misleading "no valid line items" 400 instead of the real cause.
      const parentPo = await storage.getPurchaseOrder(req.params.id);
      if (parentPo && PO_ISSUED_STATUSES.has(parentPo.status as any)) {
        const productIds = items
          .filter((it: any) => it?.productId)
          .map((it: any) => String(it.productId));
        if (productIds.length > 0) {
          const dpOffenders = await findZeroPriceProducts(productIds, "distributor_price");
          if (dpOffenders.length > 0) {
            return res.status(422).json({
              code: "zero_distributor_price_products",
              message: "Cannot issue PO: " + dpOffenders.map(p => `${p.name} (${p.sku})`).join(", ") + " have no distributor price set. Save the PO as Pending until distributor pricing is established.",
              products: dpOffenders,
            });
          }
        }
      }
      const validItems = items.filter((item: any) => item.quantity > 0 && Number(item.unitCost) > 0 && (item.productId || item.description));
      if (validItems.length === 0) return res.status(400).json({ message: "At least one valid line item is required" });
      await storage.deletePurchaseOrderItems(req.params.id);
      const created = [];
      // H3: Recompute header GST totals from items
      let h3Subtotal = 0;
      let h3TotalTax = 0;
      for (const item of validItems) {
        const qty = Number(item.quantity);
        const uc = Number(item.unitCost);
        const gstRateItem = Number(item.gstRate ?? 0);
        const taxableAmt = qty * uc;
        const gstAmt = taxableAmt * gstRateItem / 100;
        const itemTotalWithGst = taxableAmt + gstAmt;
        h3Subtotal += taxableAmt;
        h3TotalTax += gstAmt;
        const parsed = insertPurchaseOrderItemSchema.safeParse({
          ...item,
          purchaseOrderId: req.params.id,
          taxableAmount: taxableAmt.toFixed(2),
          gstAmount: gstAmt.toFixed(2),
          totalCost: itemTotalWithGst.toFixed(2),
        });
        if (!parsed.success) return res.status(400).json({ message: "Validation error", errors: parsed.error.errors });
        const c = await storage.createPurchaseOrderItem(parsed.data as any);
        created.push(c);
      }
      const h3DeliveryCost = Number(parentPo ? (parentPo as any).deliveryCost ?? 0 : 0);
      const h3GrandTotal = h3Subtotal + h3TotalTax + h3DeliveryCost;
      await storage.updatePurchaseOrder(req.params.id, {
        totalAmount: h3Subtotal.toFixed(2),
        subtotal: h3Subtotal.toFixed(2),
        totalTax: h3TotalTax.toFixed(2),
        grandTotal: h3GrandTotal.toFixed(2),
      } as any);

      // Phase 6.6 C3: sync supplier_products.supplierPrice when PO line cost differs from current.
      // Sets lastPriceUpdatedAt, flips product.needsPricingReview, writes audit row.
      if (parentPo?.supplierId) {
        const supplierId = parentPo.supplierId;
        for (const it of validItems) {
          if (!it.productId) continue;
          const newCost = Number(it.unitCost);
          if (!isFinite(newCost) || newCost <= 0) continue;
          const existingSp = (await db.execute(sql`
            SELECT id, supplier_price FROM supplier_products
            WHERE supplier_id = ${supplierId} AND product_id = ${it.productId} LIMIT 1
          `)).rows[0] as { id: string; supplier_price: string } | undefined;
          if (existingSp) {
            const oldPrice = Number(existingSp.supplier_price);
            if (Math.abs(oldPrice - newCost) > 0.001) {
              await db.execute(sql`
                UPDATE supplier_products
                SET supplier_price = ${newCost}, last_price_updated_at = NOW()
                WHERE id = ${existingSp.id}
              `);
              await db.execute(sql`UPDATE products SET needs_pricing_review = true WHERE id = ${it.productId}`);
              await logAction(req.user.id, "supplier_price_updated", "supply_chain",
                JSON.stringify({ action: "supplier_price_updated", productId: it.productId, supplierId, oldPrice, newPrice: newCost, poId: req.params.id, updatedBy: req.user.id }));
            }
          } else {
            // Create the link if missing (defensive — backfill normally handles this)
            await db.execute(sql`
              INSERT INTO supplier_products (supplier_id, product_id, supplier_price, last_price_updated_at)
              VALUES (${supplierId}, ${it.productId}, ${newCost}, NOW())
            `);
            await db.execute(sql`UPDATE products SET needs_pricing_review = true WHERE id = ${it.productId}`);
            await logAction(req.user.id, "supplier_price_updated", "supply_chain",
              JSON.stringify({ action: "supplier_price_updated", productId: it.productId, supplierId, oldPrice: null, newPrice: newCost, poId: req.params.id, updatedBy: req.user.id }));
          }
        }
      }

      res.status(201).json(created);
    } catch (error) {
      res.status(500).json({ message: "Failed to save PO items" });
    }
  });

  // ── PO PDF Download ──────────────────────────────────────────────────────────
  app.get("/api/purchase-orders/:id/pdf",
    authenticateToken,
    requireRole("admin", "accountant", "sales_manager", "warehouse_manager"),
    async (req: any, res) => {
      try {
        const po = await storage.getPurchaseOrder(req.params.id);
        if (!po) return res.status(404).json({ message: "Purchase order not found" });

        const [items, suppliers, allProducts] = await Promise.all([
          storage.getPurchaseOrderItems(req.params.id),
          storage.getSuppliers(),
          storage.getProducts(),
        ]);

        const supplier = suppliers.find((s: any) => s.id === po.supplierId);

        const pdfBuffer = generatePOPdfBuffer(po as any, items as any, supplier as any, allProducts as any);

        await logAction(req.user.id, "po_pdf_downloaded", "supply_chain",
          JSON.stringify({ poId: po.id, poNumber: po.poNumber, downloadedBy: req.user.id }));

        res.set({
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="${po.poNumber}.pdf"`,
          "Content-Length": pdfBuffer.length,
        });
        res.send(pdfBuffer);
      } catch (error: any) {
        console.error("PO PDF generation error:", error);
        res.status(500).json({ message: "Failed to generate PDF" });
      }
    }
  );

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

        // Process all undeducted advances (from any prior month + current month)
        const pendingAdvances = await storage.listEmployeeAdvances({ isDeducted: false });
        if (pendingAdvances.length > 0) {
          const advanceIds = pendingAdvances.map(a => a.id);
          await storage.markAdvancesDeducted(advanceIds, payrollRecord.id);
          for (const adv of pendingAdvances) {
            const emp = allEmployees.find(e => e.id === adv.employeeId);
            await logAction(
              req.user.id,
              "advance_deducted",
              "employee_advances",
              `Advance ₹${Number(adv.amount).toLocaleString("en-IN")} for ${emp?.name || adv.employeeId} deducted in ${monthLabel} payroll (advance ID: ${adv.id})`
            );
          }
        }

        // Send salary disbursed notifications
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

  // Employee Advances
  app.get("/api/employee-advances", authenticateToken, requireRole("admin", "hr_manager", "accountant"), async (req: any, res) => {
    try {
      const { employeeId, isDeducted } = req.query;
      const filters: { employeeId?: string; isDeducted?: boolean } = {};
      if (employeeId) filters.employeeId = employeeId as string;
      if (isDeducted !== undefined) filters.isDeducted = isDeducted === "true";
      const data = await storage.listEmployeeAdvances(filters);
      res.json(data);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch advances" });
    }
  });

  app.post("/api/employee-advances", authenticateToken, requireRole("admin", "hr_manager"), async (req: any, res) => {
    try {
      const parsed = insertEmployeeAdvanceSchema.safeParse({
        ...req.body,
        createdBy: req.user.id,
        createdAt: new Date(),
        dateGiven: req.body.dateGiven ? new Date(req.body.dateGiven) : new Date(),
      });
      if (!parsed.success) return res.status(400).json({ message: "Validation error", errors: parsed.error.errors });
      const created = await storage.createEmployeeAdvance(parsed.data);
      const allEmployees = await storage.getEmployees();
      const emp = allEmployees.find(e => e.id === parsed.data.employeeId);
      await logAction(
        req.user.id,
        "advance_created",
        "employee_advances",
        `Advance of ₹${Number(parsed.data.amount).toLocaleString("en-IN")} recorded for ${emp?.name || parsed.data.employeeId} on ${new Date(parsed.data.dateGiven).toLocaleDateString("en-IN")}${parsed.data.reason ? ` — Reason: ${parsed.data.reason}` : ""}`
      );
      res.status(201).json(created);
    } catch (error) {
      res.status(500).json({ message: "Failed to create advance" });
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


  app.post("/api/stock-movements", authenticateToken, requireRole("admin"), async (req: any, res) => {
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
      const createDcRolesD = ["admin", "sales_manager", "warehouse_manager"];
      if (!createDcRolesD.includes(req.user.role)) {
        return res.status(403).json({ message: "Not authorized" });
      }
      const { items, ...challanData } = req.body;
      if (!items || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ message: "At least one item is required" });
      }

      // Phase 4 Cleanup D — mirror create-from-so 5-field transport gate so direct
      // challan creation cannot bypass the dispatch-fields enforcement.
      const physicalChallanNumber = (challanData.physicalChallanNumber ?? "").toString().trim();
      const vehicleNumber = (challanData.vehicleNumber ?? "").toString().trim();
      const vehicleOwnerName = (challanData.vehicleOwnerName ?? "").toString().trim();
      const driverName = (challanData.driverName ?? "").toString().trim();
      const driverPhone = (challanData.driverPhone ?? "").toString().trim();
      if (!physicalChallanNumber || !vehicleNumber || !vehicleOwnerName || !driverName || !driverPhone) {
        return res.status(400).json({
          message: "All transport fields are required: Real Challan No., Vehicle No., Vehicle Owner Name, Driver Name, Driver Phone",
        });
      }
      const indianMobileRe = /^(\+91)?[6-9]\d{9}$/;
      if (!indianMobileRe.test(driverPhone)) {
        return res.status(400).json({ message: "Driver Phone must be a valid Indian mobile number" });
      }
      challanData.physicalChallanNumber = physicalChallanNumber;
      challanData.vehicleNumber = vehicleNumber;
      challanData.vehicleOwnerName = vehicleOwnerName;
      challanData.driverName = driverName;
      challanData.driverPhone = driverPhone;

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

      await logAction(req.user.id, "challan_drafted", "sales", `Draft Challan ${challan.challanNumber} created`);
      notifyRoles(["warehouse_manager", "accountant", "admin"], "challan", `Draft Challan ${challan.challanNumber} Created`, `Draft Challan #${challan.challanNumber} created. Stock + payment review required.`, challan.id).catch(() => {});

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
      // Only sales, warehouse, and admin staff may create delivery challans
      const createDcRoles = ["admin", "sales_manager", "warehouse_manager"];
      if (!createDcRoles.includes(req.user.role)) {
        return res.status(403).json({ message: "Not authorized" });
      }

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
      const productItems = orderItems.filter(it => (it.itemType === "product" || it.itemType === "bundle") && it.productId);
      if (productItems.length === 0) {
        return res.status(400).json({ message: "Order has no dispatchable line items" });
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

      const { physicalChallanNumber, vehicleNumber, vehicleOwnerName, driverName, driverPhone, notes, deliveryAddress } = req.body;
      if (!physicalChallanNumber?.trim() || !vehicleNumber?.trim() || !vehicleOwnerName?.trim() || !driverName?.trim() || !driverPhone?.trim()) {
        return res.status(400).json({ message: "All transport fields are required: Real Challan No., Vehicle No., Vehicle Owner Name, Driver Name, Driver Phone" });
      }
      const indianMobileRe = /^(\+91)?[6-9]\d{9}$/;
      if (!indianMobileRe.test(driverPhone.trim())) {
        return res.status(400).json({ message: "Driver Phone must be a valid Indian mobile number" });
      }
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
        physicalChallanNumber: physicalChallanNumber.trim(),
        vehicleNumber: vehicleNumber.trim(),
        vehicleOwnerName: vehicleOwnerName.trim(),
        driverName: driverName.trim(),
        driverPhone: driverPhone.trim(),
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

      await logAction(req.user.id, "challan_drafted", "sales", `Draft Challan ${challanNumber} created from SO ${soId}`);
      notifyRoles(["warehouse_manager", "accountant", "admin"], "challan", `Draft Challan ${challanNumber} Created`, `Draft Challan #${challanNumber} created. Stock + payment review required.`, challan.id).catch(() => {});

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

  // ── B4: Mark Ready for Signature (draft → awaiting_signature) ─────────────
  app.post("/api/delivery-challans/:id/ready-for-signature", authenticateToken, async (req: any, res) => {
    try {
      const allowedRoles = ["warehouse_manager", "sales_manager", "admin"];
      if (!allowedRoles.includes(req.user.role)) return res.status(403).json({ message: "Not authorized" });

      const challan = await storage.getDeliveryChallan(req.params.id);
      if (!challan) return res.status(404).json({ message: "Challan not found" });
      if (challan.status !== "draft") return res.status(400).json({ message: "Only draft challans can be marked ready" });

      // Gate A: check stock for all items
      const items = await storage.getDeliveryChallanItems(challan.id);
      if (challan.sourceType === "warehouse") {
        const stockShortages: string[] = [];
        for (const item of items) {
          const qty = Number(item.qtyToDispatch ?? item.quantity);
          const stockRes = await db.execute(sql`
            SELECT quantity FROM inventory_stock
            WHERE product_id = ${item.productId} AND warehouse_id = ${challan.sourceId}
            LIMIT 1
          `);
          const available = Number((stockRes as any).rows?.[0]?.quantity ?? 0);
          if (qty > available) {
            const prod = await storage.getProduct(item.productId);
            stockShortages.push(`${prod?.name ?? item.productId}: need ${qty}, available ${available}`);
          }
        }
        if (stockShortages.length > 0) {
          return res.status(400).json({ message: "Insufficient stock", shortages: stockShortages });
        }
      }

      // Gate B: SO must be fully paid — or admin credit override (C1)
      const { creditOverride = false, creditReason = "" } = req.body ?? {};
      if (challan.orderId) {
        const so = await storage.getSalesOrder(challan.orderId);
        if (so) {
          const paid = Number((so as any).paidAmount ?? 0);
          const total = Number((so as any).totalAmount ?? 0);
          if (paid < total) {
            if (!creditOverride) {
              return res.status(400).json({
                message: "Customer payment incomplete",
                outstanding: total - paid,
              });
            }
            // Credit override path — admin only
            if (req.user.role !== "admin") {
              return res.status(403).json({ message: "Only admin can authorize credit dispatch" });
            }
            if (!creditReason || creditReason.trim().length < 10) {
              return res.status(400).json({ message: "Credit reason must be at least 10 characters" });
            }
            const creditAmount = total - paid;
            await db.execute(sql`
              UPDATE delivery_challans
              SET status = 'ready',
                  ready_for_signature_at = now(),
                  ready_for_signature_by = ${req.user.id},
                  is_credit_override = true,
                  credit_amount = ${creditAmount},
                  credit_approved_by = ${req.user.id},
                  credit_approved_at = now(),
                  credit_reason = ${creditReason.trim()}
              WHERE id = ${challan.id}
            `);
            await logAction(req.user.id, "challan_credit_override", "sales",
              `Challan ${challan.challanNumber} ready-for-signature with credit override of ₹${creditAmount.toFixed(2)}. Reason: ${creditReason.trim()}`);
            notifyRoles(["accountant"], "credit_override",
              `Credit dispatch approved: Challan ${challan.challanNumber}`,
              `Admin approved ₹${creditAmount.toFixed(2)} credit on Challan ${challan.challanNumber}. Reason: ${creditReason.trim()}`,
              challan.id).catch(() => {});
            const updated = await storage.getDeliveryChallan(challan.id);
            return res.json(updated);
          }
        }
      }

      await db.execute(sql`
        UPDATE delivery_challans
        SET status = 'ready',
            ready_for_signature_at = now(),
            ready_for_signature_by = ${req.user.id}
        WHERE id = ${challan.id}
      `);

      await logAction(req.user.id, "challan_ready", "sales", `Challan ${challan.challanNumber} marked ready for delivery order`);
      notifyRoles(["admin"], "challan", `Challan ${challan.challanNumber} Ready for Delivery Order`, `Challan #${challan.challanNumber} is ready. Vehicle: ${(challan as any).vehicleNumber ?? "TBD"}, Driver: ${(challan as any).driverName ?? "TBD"}`, challan.id).catch(() => {});

      const updated = await storage.getDeliveryChallan(challan.id);
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Failed to mark challan ready for signature" });
    }
  });

  // ── B5: Upload Signed Copy ─────────────────────────────────────────────────
  app.post("/api/delivery-challans/:id/upload-signed-copy", authenticateToken, async (req: any, res) => {
    try {
      const challan = await storage.getDeliveryChallan(req.params.id);
      if (!challan) return res.status(404).json({ message: "Challan not found" });
      if (!["ready", "do_issued", "dispatched"].includes(challan.status)) {
        return res.status(400).json({ message: "Signed copy can only be uploaded when challan is ready, do_issued, or dispatched" });
      }

      const { fileUrl } = req.body;
      if (!fileUrl) return res.status(400).json({ message: "fileUrl is required" });

      const prevUrl = (challan as any).signedCopyUrl;
      await db.execute(sql`
        UPDATE delivery_challans
        SET signed_copy_url = ${fileUrl},
            signed_copy_uploaded_by = ${req.user.id},
            signed_copy_uploaded_at = now()
        WHERE id = ${challan.id}
      `);

      await logAction(req.user.id, "challan_signed_copy_uploaded", "sales",
        `Signed copy uploaded for challan ${challan.challanNumber}${prevUrl ? ` (replaced previous)` : ""}`);

      const updated = await storage.getDeliveryChallan(challan.id);
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Failed to upload signed copy" });
    }
  });

  // ── B6: Issue Delivery Order (ready → do_issued, admin only) ──────────────
  app.post("/api/delivery-challans/:id/issue-delivery-order", authenticateToken, async (req: any, res) => {
    try {
      if (req.user.role !== "admin") return res.status(403).json({ message: "Only admin can issue delivery orders" });

      const challan = await storage.getDeliveryChallan(req.params.id);
      if (!challan) return res.status(404).json({ message: "Challan not found" });
      if (challan.status !== "ready") return res.status(400).json({ message: "Only ready challans can have a delivery order issued" });

      await db.execute(sql`
        UPDATE delivery_challans
        SET status = 'do_issued',
            do_issued_at = now(),
            do_issued_by = ${req.user.id}
        WHERE id = ${challan.id}
      `);

      await logAction(req.user.id, "delivery_order_issued", "sales", `Delivery order issued for challan ${challan.challanNumber}`);
      notifyRoles(["warehouse_manager", "sales_manager"], "challan", `Delivery Order Issued — Challan ${challan.challanNumber}`, `Delivery Order issued for Challan #${challan.challanNumber}. Proceed with dispatch.`, challan.id).catch(() => {});

      const updated = await storage.getDeliveryChallan(challan.id);
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Failed to issue delivery order" });
    }
  });

  // ── B8: Cancel Challan ─────────────────────────────────────────────────────
  app.post("/api/delivery-challans/:id/cancel", authenticateToken, async (req: any, res) => {
    try {
      const allowedRoles = ["sales_manager", "admin"];
      if (!allowedRoles.includes(req.user.role)) return res.status(403).json({ message: "Not authorized" });

      const challan = await storage.getDeliveryChallan(req.params.id);
      if (!challan) return res.status(404).json({ message: "Challan not found" });
      if (!["draft", "ready", "do_issued"].includes(challan.status)) {
        return res.status(400).json({ message: "Only draft, ready, or do_issued challans can be cancelled" });
      }

      const { cancellationReason } = req.body;
      if (!cancellationReason?.trim()) return res.status(400).json({ message: "Cancellation reason is required" });

      await db.execute(sql`
        UPDATE delivery_challans
        SET status = 'cancelled',
            cancelled_at = now(),
            cancelled_by = ${req.user.id},
            cancellation_reason = ${cancellationReason}
        WHERE id = ${challan.id}
      `);

      await logAction(req.user.id, "challan_cancelled", "sales",
        `Challan ${challan.challanNumber} cancelled. Reason: ${cancellationReason}`);

      const updated = await storage.getDeliveryChallan(challan.id);
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Failed to cancel challan" });
    }
  });

  app.post("/api/delivery-challans/:id/dispatch", authenticateToken, async (req: any, res) => {
    try {
      const challan = await storage.getDeliveryChallan(req.params.id);
      if (!challan) return res.status(404).json({ message: "Challan not found" });
      if (challan.status !== "do_issued") return res.status(400).json({ message: "Challan must have a delivery order issued before dispatch" });

      // Authorization — warehouse ops + sales_manager + admin may physically dispatch
      const allowedRoles = ["sales_manager", "admin", "warehouse_manager"];
      if (!allowedRoles.includes(req.user.role)) return res.status(403).json({ message: "Not authorized" });

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

      // Phase 7 — expand bundle items into per-component stock operations.
      // Each op consumes one productId × qty in the source warehouse. Regular (non-bundle) items
      // become a single op; bundles fan out to one op per component, qty = component.qty × bundle qty.
      type StockOp = {
        challanItemId: string;
        productId: string;
        qty: number;
        // bundle metadata (null for regular items)
        parentBundleProductId: string | null;
        parentBundleSku: string | null;
        parentBundleName: string | null;
      };
      const stockOps: StockOp[] = [];
      // Cache of product lookups so we don't re-fetch per loop iteration.
      const productCache: Record<string, any> = {};
      const getCachedProduct = async (pid: string) => {
        if (productCache[pid] !== undefined) return productCache[pid];
        const p = await storage.getProduct(pid);
        productCache[pid] = p ?? null;
        return p;
      };

      for (const item of items) {
        const prod = await getCachedProduct(item.productId);
        const qty = dispatchQtys[item.id];
        if (prod && prod.type === "bundle") {
          const components = await storage.getBundleItems(item.productId);
          if (components.length === 0) {
            return res.status(400).json({ message: `Bundle "${prod.name}" has no components configured — cannot dispatch.` });
          }
          for (const comp of components) {
            const compQty = Number(comp.quantity) * qty;
            stockOps.push({
              challanItemId: item.id,
              productId: comp.componentProductId,
              qty: compQty,
              parentBundleProductId: prod.id,
              parentBundleSku: prod.sku,
              parentBundleName: prod.name,
            });
          }
        } else {
          stockOps.push({
            challanItemId: item.id,
            productId: item.productId,
            qty,
            parentBundleProductId: null,
            parentBundleSku: null,
            parentBundleName: null,
          });
        }
      }

      // Pre-compute FIFO lots per UNIQUE productId BEFORE entering the transaction (uses main DB pool).
      // This determines which GRN lots each dispatched unit is attributed to (for grn_id tracking).
      const uniqueProductIds = Array.from(new Set(stockOps.map(o => o.productId)));
      const fifoLotsPerProduct: Record<string, FifoLot[]> = {};
      if (challan.sourceType === "warehouse") {
        for (const pid of uniqueProductIds) {
          try {
            fifoLotsPerProduct[pid] = await computeFifoLots(pid, { warehouseId: challan.sourceId });
          } catch (e) {
            console.error(`[FIFO][DISPATCH] computeFifoLots failed for productId=${pid} warehouseId=${challan.sourceId} challan=${challan.challanNumber}:`, (e as Error).message);
            fifoLotsPerProduct[pid] = [];
          }
        }
      }

      await db.transaction(async (tx) => {
        const lockedRes = await tx.execute(sql`
          SELECT status FROM delivery_challans WHERE id = ${challan.id} FOR UPDATE
        `);
        const lockedChallan = (lockedRes as any).rows?.[0];
        if (!lockedChallan || (lockedChallan as any).status !== "do_issued") {
          throw new Error("Challan is no longer do_issued — concurrent dispatch may have already occurred");
        }

        // Phase 7 — pre-check ALL component shortages and report every one,
        // not just the first. Required quantities are summed across ops (e.g. if the
        // same component appears in two bundles on the same challan).
        if (challan.sourceType === "warehouse") {
          const requiredByProduct: Record<string, number> = {};
          for (const op of stockOps) {
            requiredByProduct[op.productId] = (requiredByProduct[op.productId] || 0) + op.qty;
          }
          const shortages: Array<{ productId: string; productName: string; required: number; available: number; bundleContext: string[] }> = [];
          for (const pid of Object.keys(requiredByProduct)) {
            const required = requiredByProduct[pid];
            const stockRes = await tx.execute(sql`
              SELECT quantity FROM inventory_stock
              WHERE product_id = ${pid} AND warehouse_id = ${challan.sourceId}
              LIMIT 1
              FOR UPDATE
            `);
            const stockRow = (stockRes as any).rows?.[0];
            const available = stockRow ? Number(stockRow.quantity ?? 0) : 0;
            if (required > available) {
              const prod = await getCachedProduct(pid);
              const bundleContext = Array.from(new Set(
                stockOps.filter(o => o.productId === pid && o.parentBundleSku)
                  .map(o => `${o.parentBundleName} (${o.parentBundleSku})`)
              ));
              shortages.push({
                productId: pid,
                productName: prod?.name ?? pid,
                required,
                available,
                bundleContext,
              });
            }
          }
          if (shortages.length > 0) {
            const lines = shortages.map(s => {
              const ctx = s.bundleContext.length > 0 ? ` [from ${s.bundleContext.join(", ")}]` : "";
              return `  • ${s.productName}: need ${s.required}, have ${s.available}${ctx}`;
            }).join("\n");
            const err = new Error(`Insufficient stock for ${shortages.length} component(s):\n${lines}`);
            (err as any).shortages = shortages;
            throw err;
          }
        }

        if (challan.sourceType === "warehouse") {
          // Track lot consumption across ops sharing the same productId.
          // We deep-copy each lot so we can decrement remainingQty in-place during this loop only.
          const lotsCursor: Record<string, FifoLot[]> = {};
          for (const pid of uniqueProductIds) {
            lotsCursor[pid] = (fifoLotsPerProduct[pid] ?? []).map(l => ({ ...l }));
          }

          for (const op of stockOps) {
            const isBundleOp = op.parentBundleProductId !== null;
            const lots = lotsCursor[op.productId] ?? [];
            let remaining = op.qty;

            const refType = isBundleOp ? "bundle_dispatch" : "challan";
            const baseNote = isBundleOp
              ? `Dispatched via challan ${challan.challanNumber} as component of bundle ${op.parentBundleName} (${op.parentBundleSku}), challanItem=${op.challanItemId}`
              : `Dispatched via challan ${challan.challanNumber}`;

            // One movement per FIFO lot consumed so grn_id is correctly attributed.
            for (const lot of lots) {
              if (remaining <= 0) break;
              const available = Math.floor(lot.remainingQty);
              if (available <= 0) continue;
              const consumed = Math.min(remaining, available);
              await addLedgerEntry(tx, {
                productId: op.productId,
                warehouseId: challan.sourceId,
                movementType: "out",
                quantity: consumed,
                referenceType: refType,
                referenceId: challan.id,
                grnId: lot.grnId,
                notes: `${baseNote} (FIFO from GRN ${lot.grnNumber}, batch ${batchId})`,
                createdBy: req.user.id,
              });
              lot.remainingQty -= consumed;
              remaining -= consumed;
            }

            // Fallback for stock entered outside the GRN workflow (manual adjustments / opening balances).
            if (remaining > 0) {
              console.warn(`[FIFO][DISPATCH][FALLBACK] productId=${op.productId} warehouseId=${challan.sourceId} challan=${challan.challanNumber} unattributed_qty=${remaining} totalQty=${op.qty} bundle=${op.parentBundleSku ?? "-"} — no matching GRN lots (manual/adjusted stock)`);
              await addLedgerEntry(tx, {
                productId: op.productId,
                warehouseId: challan.sourceId,
                movementType: "out",
                quantity: remaining,
                referenceType: refType,
                referenceId: challan.id,
                notes: `${baseNote} (no FIFO lot — manual/adjusted stock, batch ${batchId})`,
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
          SET status = 'dispatched',
              dispatch_date = now(),
              dispatch_batch_id = ${batchId},
              dispatched_at = now(),
              dispatched_by = ${req.user.id}
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

      await logAction(req.user.id, "challan_dispatched", "sales", `Challan ${challan.challanNumber} dispatched`);

      // Auto-create sales invoice shell (upload_status = 'pending_upload')
      let autoInvoice: any = null;
      try {
        const existingInv = await storage.getSalesInvoiceByChallan(challan.id);
        if (!existingInv) {
          // Resolve customer
          let resolvedCustomerId: string = (challan as any).customerId;
          if (!resolvedCustomerId && challan.orderId) {
            const soRes = await db.execute(sql`SELECT customer_id FROM sales_orders WHERE id = ${challan.orderId} LIMIT 1`);
            resolvedCustomerId = (soRes.rows[0] as any)?.customer_id ?? null;
          }
          if (resolvedCustomerId) {
            const custRes = await db.execute(sql`SELECT * FROM customers WHERE id = ${resolvedCustomerId} LIMIT 1`);
            const cust = custRes.rows[0] as any;
            const customerGSTIN = cust?.gst_number || null;
            const customerType = customerGSTIN ? "B2B" : "B2C";
            // Build line items for GST totals
            const challanItemsForInv = await storage.getDeliveryChallanItems(challan.id);
            let subtotal = 0, totalCgst = 0, totalSgst = 0, totalIgst = 0, totalTax = 0;
            const lineItems: any[] = [];
            for (const ci of challanItemsForInv) {
              const qtyDispatched = Number(ci.qtyDispatched ?? 0);
              const qty = qtyDispatched > 0 ? qtyDispatched : Number(ci.qtyToDispatch ?? ci.quantity ?? 0);
              if (qty <= 0) continue;
              const prodRes = await db.execute(sql`SELECT * FROM products WHERE id = ${ci.productId} LIMIT 1`);
              const prod = prodRes.rows[0] as any;
              const unitPrice = Number(ci.unitPrice ?? prod?.unit_price ?? 0);
              const hsnCode = prod?.hsn_code ?? null;
              const gstRate = Number(prod?.gst_rate ?? 0);
              const isInterState = req.body?.isInterState ?? false;
              const taxableAmt = qty * unitPrice;
              const tax = taxableAmt * gstRate / 100;
              const cgst = isInterState ? 0 : tax / 2;
              const sgst = isInterState ? 0 : tax / 2;
              const igst = isInterState ? tax : 0;
              subtotal += taxableAmt;
              totalCgst += cgst; totalSgst += sgst; totalIgst += igst; totalTax += tax;
              lineItems.push({ productId: ci.productId, description: ci.description ?? prod?.name ?? "Product", qty, unitPrice, hsnCode, gstRate, taxableAmount: taxableAmt, cgst, sgst, igst, taxAmount: tax, totalAmount: taxableAmt + tax });
            }
            // G1: compute dueDate from customer payment_terms
            const invoiceDate = new Date();
            const invDueDate = computeDueDate(invoiceDate, cust?.payment_terms ?? null);
            const invoiceNumber = await storage.generateSalesInvoiceNumber();
            autoInvoice = await storage.createSalesInvoice({
              invoiceNumber,
              invoiceDate,
              customerId: resolvedCustomerId,
              soId: challan.orderId ?? null,
              challanId: challan.id,
              customerType,
              customerGSTIN,
              isInterState: req.body?.isInterState ?? false,
              subtotal: String(subtotal),
              totalCgst: String(totalCgst),
              totalSgst: String(totalSgst),
              totalIgst: String(totalIgst),
              totalTax: String(totalTax),
              grandTotal: String(subtotal + totalTax),
              creditedAmount: "0",
              status: "pending",
              dueDate: invDueDate,
              notes: null,
              createdBy: req.user.id,
              uploadStatus: "pending_upload",
            } as any);
            for (const li of lineItems) {
              await storage.createSalesInvoiceItem({ invoiceId: autoInvoice.id, productId: li.productId, description: li.description, qty: String(li.qty), unitPrice: String(li.unitPrice), hsnCode: li.hsnCode, gstRate: String(li.gstRate), taxableAmount: String(li.taxableAmount), cgst: String(li.cgst), sgst: String(li.sgst), igst: String(li.igst), taxAmount: String(li.taxAmount), totalAmount: String(li.totalAmount) });
            }
            await logAction(req.user.id, "sales_invoice_auto_created", "sales", `Invoice ${invoiceNumber} auto-created from dispatch of ${challan.challanNumber}`);
          }
        }
      } catch (invErr) {
        console.error("Auto-invoice creation failed (non-fatal):", invErr);
      }

      // Notify roles
      notifyRoles(["accountant", "admin"], "challan", `Challan ${challan.challanNumber} Dispatched`, `Challan #${challan.challanNumber} dispatched. Sales Invoice pending upload — record invoice details from Tally.`, challan.id).catch(() => {});
      notifyRoles(["sales_manager"], "challan", `Challan ${challan.challanNumber} Dispatched`, `Challan #${challan.challanNumber} has been dispatched.`, challan.id).catch(() => {});

      res.json({ ...updated, autoInvoiceId: autoInvoice?.id ?? null });
    } catch (error: any) {
      console.error("dispatch error:", error);
      const msg = error?.message || "Failed to dispatch challan";
      const shortages = (error as any)?.shortages;
      const status = msg.startsWith("Insufficient") ? 400 : 500;
      res.status(status).json(shortages ? { message: msg, shortages } : { message: msg });
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

      // Gate (t): Supplier must be fully paid before receiving goods (D1: gate uses grand_total)
      const supplierPaymentsRes = await db.execute(sql`
        SELECT COALESCE(SUM(amount), 0) as paid_amount
        FROM supplier_payments
        WHERE purchase_order_id = ${poId}
      `);
      const paidAmount = Number((supplierPaymentsRes as any).rows?.[0]?.paid_amount ?? 0);
      const gateAmount = Number((po as any).grandTotal ?? po.totalAmount ?? 0);
      const { creditOverride: grnCreditOverride = false, creditReason: grnCreditReason = "" } = req.body ?? {};
      if (gateAmount > 0 && paidAmount < gateAmount) {
        if (!grnCreditOverride) {
          return res.status(400).json({
            message: "Full supplier payment required before receiving goods",
            paidAmount,
            totalAmount: gateAmount,
            outstanding: gateAmount - paidAmount,
          });
        }
        if (!["admin", "accountant"].includes(req.user.role)) {
          return res.status(403).json({ message: "Only admin or accountant can authorize credit GRN" });
        }
        if (!grnCreditReason || grnCreditReason.trim().length < 10) {
          return res.status(400).json({ message: "Credit reason must be at least 10 characters" });
        }
      }

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

      const supplierChallanNumber = req.body?.supplierChallanNumber?.trim() || null;
      if (!supplierChallanNumber) return res.status(400).json({ message: "Supplier challan number is required to create a GRN" });

      const isCreditGrn = grnCreditOverride && gateAmount > 0 && paidAmount < gateAmount;
      const grn = await storage.createGRN({
        grnNumber,
        purchaseOrderId: poId,
        warehouseId,
        status: "draft",
        deliveryCost: null,
        totalAmount: String(itemTotal),
        receivedDate: new Date(),
        notes: req.body?.notes || null,
        createdBy: req.user.id,
        supplierChallanNumber,
        ...(isCreditGrn ? {
          isCreditOverride: true,
          creditAmount: String(gateAmount - paidAmount),
          creditApprovedBy: req.user.id,
          creditApprovedAt: new Date(),
          creditReason: grnCreditReason.trim(),
        } : {}),
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

      if (isCreditGrn) {
        await logAction(req.user.id, "grn_credit_override", "supply_chain",
          `GRN ${grnNumber} created with credit override of ₹${(gateAmount - paidAmount).toFixed(2)} on PO ${po.poNumber}. Reason: ${grnCreditReason.trim()}`);
        notifyRoles(["admin"], "credit_grn",
          `Credit GRN authorized: ${grnNumber}`,
          `${req.user.role === "accountant" ? "Accountant" : "Admin"} authorized credit GRN ${grnNumber} for ₹${(gateAmount - paidAmount).toFixed(2)} on PO ${po.poNumber}.`,
          grn.id).catch(() => {});
      }
      await logAction(req.user.id, "create", "grn", `Created draft GRN ${grnNumber} from PO ${po.poNumber}`);
      res.status(201).json(grn);
    } catch (error) {
      console.error("Create GRN from PO error:", error);
      res.status(500).json({ message: "Failed to create GRN from PO" });
    }
  });

  // POST /api/grns generic endpoint removed in Phase 4A —
  // use /api/grns/create-from-po/:poId for all GRN creation.
  // Inventory.tsx was the sole consumer and was migrated in Phase 4A cleanup.

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
      const allowedRoles = ["accountant", "admin", "warehouse_manager"];
      if (!allowedRoles.includes(req.user.role)) return res.status(403).json({ message: "Not authorized" });

      const grn = await storage.getGRN(req.params.id);
      if (!grn) return res.status(404).json({ message: "GRN not found" });
      if (grn.status !== "draft") return res.status(400).json({ message: "Only draft GRNs can be confirmed" });

      // Phase 3 C4: removed supplier_challan_url and signed_copy_url gates — not required for confirmation

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

        await tx.execute(sql`
          UPDATE goods_receipt_notes
          SET status = 'confirmed', confirmed_at = now(), confirmed_by = ${req.user.id}
          WHERE id = ${grn.id}
        `);
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

      await logAction(req.user.id, "grn_confirmed", "supply_chain", `GRN ${grn.grnNumber} confirmed. Stock updated.`);
      notifyRoles(["admin", "accountant"], "grn", `GRN ${grn.grnNumber} Confirmed`, `GRN #${grn.grnNumber} confirmed. Stock updated.`, grn.id).catch(() => {});

      // F1: Auto-create supplier invoice (pending_upload) if one doesn't already exist for this GRN
      try {
        const existingInvRes = await db.execute(sql`
          SELECT id FROM supplier_invoices WHERE grn_id = ${grn.id} AND upload_status != 'cancelled' LIMIT 1
        `);
        if ((existingInvRes as any).rows?.length === 0) {
          const grnPo = await storage.getPurchaseOrder(grn.purchaseOrderId);
          const grnTotalAmount = grn.totalAmount ? Number(grn.totalAmount) : 0;
          // Use PO grand_total as payable amount if available, else GRN total
          const payableAmount = grnPo
            ? Number((grnPo as any).grandTotal ?? grnPo.totalAmount ?? grnTotalAmount)
            : grnTotalAmount;
          const siYear = new Date().getFullYear();
          const siMaxRes = await db.execute(sql`
            SELECT invoice_number FROM supplier_invoices
            WHERE invoice_number LIKE ${"SI-" + siYear + "-%"}
            ORDER BY invoice_number DESC LIMIT 1
          `);
          const siMaxRow = (siMaxRes as any).rows?.[0] as { invoice_number?: string | null } | undefined;
          let siNextNum = 1;
          if (siMaxRow?.invoice_number) {
            const parts = siMaxRow.invoice_number.split("-");
            const lastNum = parseInt(parts[parts.length - 1], 10);
            if (!isNaN(lastNum)) siNextNum = lastNum + 1;
          }
          const siAutoNumber = `SI-${siYear}-${String(siNextNum).padStart(4, "0")}`;
          if (!grnPo?.supplierId) throw new Error(`F1: GRN ${grn.grnNumber} has no linked supplier — skipping auto-create`);
          await db.execute(sql`
            INSERT INTO supplier_invoices
              (id, supplier_id, purchase_order_id, grn_id, invoice_number, invoice_date,
               tax_amount, total_amount, payment_terms,
               status, upload_status, notes, created_by, created_at,
               is_credit_grn, credit_amount)
            VALUES
              (gen_random_uuid(), ${grnPo.supplierId}, ${grn.purchaseOrderId}, ${grn.id},
               ${siAutoNumber}, CURRENT_DATE,
               '0', ${payableAmount.toFixed(2)}, 'net_30',
               'pending', 'pending_upload', ${"Auto-created on GRN " + grn.grnNumber + " confirmation"},
               ${req.user.id}, now(),
               ${(grn as any).isCreditOverride ?? false}, ${(grn as any).creditAmount ?? null})
          `);
          await logAction(req.user.id, "supplier_invoice_auto_created", "supply_chain",
            `Auto-created supplier invoice ${siAutoNumber} (pending upload) for GRN ${grn.grnNumber}`);
          notifyRoles(["admin", "accountant"], "supplier_invoice",
            `Supplier Invoice Pending: ${siAutoNumber}`,
            `Invoice ${siAutoNumber} auto-created for GRN ${grn.grnNumber}. Please upload the supplier's signed invoice.`,
            grn.id).catch(() => {});
        }
      } catch (siErr) {
        console.error("F1 auto-create supplier invoice error:", siErr);
        // Non-fatal — GRN is confirmed regardless
      }

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
          const prodMarginRes = await db.execute(sql`SELECT min_margin_pct, name FROM products WHERE id = ${pid} LIMIT 1`);
          const minMarginPct = Number((prodMarginRes.rows[0] as any)?.min_margin_pct ?? 5);
          const grnProdName: string = (prodMarginRes.rows[0] as any)?.name ?? pid;
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
            rejectedBy: null,
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
          notifyPricingReviewers(
            "Price Sheet Awaiting Review",
            `A draft price sheet for ${grnProdName} on ${today} was auto-created after GRN ${grn.grnNumber}.`,
            sheet.id
          );
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

  // ── C6: GRN PDF Download ─────────────────────────────────────────────────────
  app.get("/api/grns/:id/pdf", authenticateToken, async (req: any, res) => {
    try {
      const allowedRoles = ["warehouse_manager", "accountant", "admin"];
      if (!allowedRoles.includes(req.user.role)) return res.status(403).json({ message: "Not authorized" });

      const grn = await storage.getGRN(req.params.id);
      if (!grn) return res.status(404).json({ message: "GRN not found" });

      const [po, items, warehouses] = await Promise.all([
        storage.getPurchaseOrder(grn.purchaseOrderId),
        storage.getGRNItems(grn.id),
        storage.getWarehouses(),
      ]);

      const supplier = po ? await storage.getSupplier(po.supplierId) : null;
      const warehouse = warehouses.find((w: any) => w.id === grn.warehouseId);
      const products = await storage.getProducts();
      const productMap = new Map(products.map((p: any) => [p.id, p]));

      const pdfData = {
        grnNumber: grn.grnNumber,
        status: grn.status,
        receivedDate: grn.receivedDate,
        supplierChallanNumber: grn.supplierChallanNumber,
        supplierChallanDate: grn.supplierChallanDate,
        notes: grn.notes,
        confirmedAt: (grn as any).confirmedAt,
        deliveryCost: grn.deliveryCost,
        totalAmount: grn.totalAmount,
        poNumber: po?.poNumber,
        poDate: po?.createdAt,
        supplierName: supplier?.name,
        supplierAddress: supplier?.address,
        supplierGstin: supplier?.gstin,
        warehouseName: warehouse?.name,
        items: items.map((it: any) => {
          const prod = productMap.get(it.productId);
          return {
            productId: it.productId,
            description: it.description,
            productName: prod?.name,
            hsnCode: prod?.hsnCode,
            orderedQuantity: it.orderedQuantity,
            receivedQuantity: it.receivedQuantity,
            buyingPrice: it.buyingPrice,
            totalCost: it.totalCost,
          };
        }),
      };

      const buffer = generateGrnPdf(pdfData);
      await logAction(req.user.id, "grn_pdf_downloaded", "supply_chain", `Downloaded PDF for GRN ${grn.grnNumber}`);

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${grn.grnNumber}.pdf"`);
      res.send(buffer);
    } catch (err: any) {
      console.error("GRN PDF error:", err);
      res.status(500).json({ message: err.message || "Failed to generate PDF" });
    }
  });

  // ── D1: Upload Supplier Challan Scan ─────────────────────────────────────────
  app.post("/api/grns/:id/upload-supplier-challan", authenticateToken, async (req: any, res) => {
    try {
      const grn = await storage.getGRN(req.params.id);
      if (!grn) return res.status(404).json({ message: "GRN not found" });
      if (grn.status === "cancelled") return res.status(400).json({ message: "Cannot upload to a cancelled GRN" });

      const { fileUrl } = req.body;
      if (!fileUrl) return res.status(400).json({ message: "fileUrl is required" });

      await db.execute(sql`
        UPDATE goods_receipt_notes
        SET supplier_challan_url = ${fileUrl},
            supplier_challan_uploaded_by = ${req.user.id},
            supplier_challan_uploaded_at = now()
        WHERE id = ${grn.id}
      `);

      await logAction(req.user.id, "grn_supplier_challan_uploaded", "supply_chain",
        `Supplier challan scan uploaded for GRN ${grn.grnNumber}`);

      const updated = await storage.getGRN(grn.id);
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Failed to upload supplier challan" });
    }
  });

  // ── D3: Upload Signed GRN Copy ─────────────────────────────────────────────
  app.post("/api/grns/:id/upload-signed-copy", authenticateToken, async (req: any, res) => {
    try {
      const grn = await storage.getGRN(req.params.id);
      if (!grn) return res.status(404).json({ message: "GRN not found" });
      if (grn.status === "cancelled") return res.status(400).json({ message: "Cannot upload to a cancelled GRN" });

      const { fileUrl } = req.body;
      if (!fileUrl) return res.status(400).json({ message: "fileUrl is required" });

      const prevUrl = (grn as any).signedCopyUrl;
      await db.execute(sql`
        UPDATE goods_receipt_notes
        SET signed_copy_url = ${fileUrl},
            signed_copy_uploaded_by = ${req.user.id},
            signed_copy_uploaded_at = now()
        WHERE id = ${grn.id}
      `);

      await logAction(req.user.id, "grn_signed_copy_uploaded", "supply_chain",
        `Signed copy uploaded for GRN ${grn.grnNumber}${prevUrl ? " (replaced)" : ""}`);

      const updated = await storage.getGRN(grn.id);
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Failed to upload signed GRN copy" });
    }
  });

  // ── D5: Upload Supplier Tax Invoice ───────────────────────────────────────
  app.post("/api/grns/:id/upload-supplier-invoice", authenticateToken, async (req: any, res) => {
    try {
      const allowedRoles = ["accountant", "admin"];
      if (!allowedRoles.includes(req.user.role)) return res.status(403).json({ message: "Not authorized" });

      const grn = await storage.getGRN(req.params.id);
      if (!grn) return res.status(404).json({ message: "GRN not found" });
      if (grn.status === "cancelled") return res.status(400).json({ message: "Cannot upload to a cancelled GRN" });

      const { fileUrl, supplierInvoiceNumber, supplierInvoiceDate } = req.body;
      if (!fileUrl && !supplierInvoiceNumber) return res.status(400).json({ message: "fileUrl or supplierInvoiceNumber is required" });

      await db.execute(sql`
        UPDATE goods_receipt_notes
        SET supplier_invoice_url = COALESCE(${fileUrl ?? null}, supplier_invoice_url),
            supplier_invoice_number = COALESCE(${supplierInvoiceNumber ?? null}, supplier_invoice_number),
            supplier_invoice_date = COALESCE(${supplierInvoiceDate ? new Date(supplierInvoiceDate) : null}, supplier_invoice_date),
            supplier_invoice_uploaded_by = ${req.user.id},
            supplier_invoice_uploaded_at = now()
        WHERE id = ${grn.id}
      `);

      await logAction(req.user.id, "grn_supplier_invoice_uploaded", "supply_chain",
        `Supplier invoice uploaded for GRN ${grn.grnNumber}. Ref: ${supplierInvoiceNumber ?? "n/a"}`);

      const updated = await storage.getGRN(grn.id);
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Failed to upload supplier invoice" });
    }
  });

  // ── D6: Cancel GRN ────────────────────────────────────────────────────────
  app.post("/api/grns/:id/cancel", authenticateToken, async (req: any, res) => {
    try {
      if (req.user.role !== "admin") return res.status(403).json({ message: "Only admins can cancel GRNs" });

      const grn = await storage.getGRN(req.params.id);
      if (!grn) return res.status(404).json({ message: "GRN not found" });
      if (grn.status !== "draft") return res.status(400).json({ message: "Only draft GRNs can be cancelled" });

      const { cancellationReason } = req.body;
      if (!cancellationReason?.trim()) return res.status(400).json({ message: "Cancellation reason is required" });

      await db.execute(sql`
        UPDATE goods_receipt_notes
        SET status = 'cancelled',
            cancelled_at = now(),
            cancelled_by = ${req.user.id},
            cancellation_reason = ${cancellationReason}
        WHERE id = ${grn.id}
      `);

      await logAction(req.user.id, "grn_cancelled", "supply_chain",
        `GRN ${grn.grnNumber} cancelled. Reason: ${cancellationReason}`);

      const updated = await storage.getGRN(grn.id);
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Failed to cancel GRN" });
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

      // Guard: approving requires a supplier and non-zero item costs
      if (updateData.status === "approved") {
        const existing = await storage.getPurchaseRequest(req.params.id);
        const effectiveSupplierId = updateData.supplierId !== undefined ? updateData.supplierId : existing?.supplierId;
        if (!effectiveSupplierId) {
          return res.status(400).json({ message: "A supplier must be assigned before approving a purchase request." });
        }
        const prItems = await storage.getPurchaseRequestItems(req.params.id);
        const zeroCostItems = prItems.filter(item => !item.unitCost || parseFloat(item.unitCost) === 0);
        if (zeroCostItems.length > 0) {
          const allProds = await storage.getProducts();
          const prodMap = new Map(allProds.map((p: any) => [p.id, p]));
          const names = zeroCostItems.map(i => prodMap.get(i.productId)?.name || i.description || i.productId).join(", ");
          return res.status(400).json({ message: `Cannot approve — the following items have no supplier price: ${names}. Enter unit costs before approving.` });
        }
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

      const supplierProds = await storage.getSupplierProducts(pr.supplierId);
      const allProducts = await storage.getProducts();
      const productMap = new Map(allProducts.map(p => [p.id, p]));

      // Block only when NO price source at all is available: no PR item cost, no supplier catalog
      // price, and no product cost price.  If any fallback provides a price, allow conversion.
      const trulyNoCostItems = prItems.filter(item => {
        const sp = supplierProds.find((s: any) => s.productId === item.productId);
        const product = productMap.get(item.productId);
        const hasItemCost = item.unitCost && parseFloat(item.unitCost) > 0;
        const hasSupplierCost = sp?.supplierPrice && parseFloat(sp.supplierPrice) > 0;
        const hasProductCost = product?.costPrice && parseFloat(product.costPrice) > 0;
        return !hasItemCost && !hasSupplierCost && !hasProductCost;
      });
      if (trulyNoCostItems.length > 0) {
        const names = trulyNoCostItems.map(item => productMap.get(item.productId)?.name || item.description || item.productId).join(", ");
        return res.status(400).json({ message: `Cannot convert to PO — no price found for: ${names}. Edit the purchase request to set unit costs, or add these products to the supplier's catalog.` });
      }

      // H1: Snapshot GST per item from product catalog (pure computation — no DB writes)
      let poSubtotal = 0;
      let poTotalTax = 0;
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
        const gstRate = parseFloat((product as any)?.gstRate ?? "0") || 0;
        const hsnCode = (product as any)?.hsnCode ?? null;
        const taxableAmt = unitCost * item.shortfallQuantity;
        const gstAmt = taxableAmt * gstRate / 100;
        const itemTotal = taxableAmt + gstAmt;
        poSubtotal += taxableAmt;
        poTotalTax += gstAmt;
        return {
          productId: item.productId,
          description: item.description || product?.name || "",
          quantity: item.shortfallQuantity,
          unitCost: unitCost.toFixed(2),
          totalCost: itemTotal.toFixed(2),
          gstRate: gstRate.toFixed(2),
          hsnCode,
          taxableAmount: taxableAmt.toFixed(2),
          gstAmount: gstAmt.toFixed(2),
        };
      });

      const poDeliveryCost = 0;
      const poGrandTotal = poSubtotal + poTotalTax + poDeliveryCost;

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

      // Allocation + INSERT in one transaction so a failed insert never burns a number.
      const fyPR = getFinancialYear(new Date());
      const po = await db.transaction(async (tx) => {
          const poNumber = await nextDocNumberInTx(tx, "ITFI-PO", fyPR);
          const [row] = await tx.insert(purchaseOrdersTable).values({
            poNumber,
            supplierId: pr.supplierId,
            status: "pending",
            deliveryType,
            totalAmount: poSubtotal.toFixed(2),
            expectedDelivery,
            notes: `Generated from purchase request ${pr.requestNumber}`,
            deliveryAddress,
            subtotal: poSubtotal.toFixed(2),
            totalTax: poTotalTax.toFixed(2),
            deliveryCost: "0",
            grandTotal: poGrandTotal.toFixed(2),
          } as any).returning();
          return row;
        });

      for (const poItem of poItemsData) {
        await storage.createPurchaseOrderItem({
          purchaseOrderId: po.id,
          ...poItem,
        } as any);
      }

      await storage.updatePurchaseRequest(pr.id, {
        status: "converted",
        purchaseOrderId: po.id,
      });

      await logAction(req.user.id, "create", "supply_chain", `Converted purchase request ${pr.requestNumber} to PO ${po.poNumber}`);
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

        // Check for an approved late arrival request for today (IST date) — if
        // one exists, override half_day → present and record a structured note.
        let status = isLate ? "half_day" : "present";
        let attendanceNotes: string | null = null;
        if (isLate) {
          const istToday = todayIST(); // YYYY-MM-DD in Asia/Kolkata — no UTC drift
          const approvedLAR = await storage.getApprovedLateArrivalForDate(employeeId, istToday);
          if (approvedLAR) {
            status = "present";
            attendanceNotes = JSON.stringify({
              lateArrivalApproved: true,
              approvedRequestId: approvedLAR.id,
              expectedArrivalTime: approvedLAR.expectedArrivalTime,
              reason: approvedLAR.reason,
            });
          }
        }

        const created = await storage.createAttendanceRecord({
          employeeId,
          date: today,
          checkIn: now,
          checkOut: null,
          lunchOut: null,
          lunchIn: null,
          teaOut: null,
          teaIn: null,
          fieldVisitOut: null,
          fieldVisitIn: null,
          status,
          selfieUrl: selfieUrl || null,
          location: location || null,
          notes: attendanceNotes,
        });
        const message = isLate && status === "half_day"
          ? "Checked in - Marked as Half Day (Late arrival)"
          : isLate && status === "present"
          ? "Checked in - Late arrival approved, marked as Present"
          : "Checked in successfully";
        return res.json({ type: "check_in", message, record: created, isLate: isLate && status === "half_day" });
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

      if (action === "field_visit_out") {
        if (todayRecord.fieldVisitOut) return res.status(400).json({ message: "Field visit already started" });
        const updated = await storage.updateAttendanceRecord(todayRecord.id, { fieldVisitOut: now, selfieUrl: selfieUrl || todayRecord.selfieUrl, location: location || todayRecord.location });
        return res.json({ type: "field_visit_out", message: "Field Visit Started", record: updated });
      }

      if (action === "field_visit_in") {
        if (!todayRecord.fieldVisitOut) return res.status(400).json({ message: "Field visit not started" });
        if (todayRecord.fieldVisitIn) return res.status(400).json({ message: "Already returned from field visit" });
        const updated = await storage.updateAttendanceRecord(todayRecord.id, { fieldVisitIn: now, selfieUrl: selfieUrl || todayRecord.selfieUrl, location: location || todayRecord.location });
        return res.json({ type: "field_visit_in", message: "Returned from Field Visit", record: updated });
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

  // ======================== LATE ARRIVAL REQUESTS ========================
  app.get("/api/late-arrival-requests", authenticateToken, async (req: any, res) => {
    try {
      if (req.user.role === "admin" || req.user.role === "hr_manager") {
        return res.json(await storage.getLateArrivalRequests());
      }
      const allEmps = await storage.getEmployees();
      const linked = allEmps.find(e => e.userId === req.user.id);
      if (!linked) return res.json([]);
      res.json(await storage.getLateArrivalRequestsByEmployee(linked.id));
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch late arrival requests" });
    }
  });

  app.post("/api/late-arrival-requests", authenticateToken, async (req: any, res) => {
    try {
      const { date, expectedArrivalTime, reason } = req.body;
      if (!date || !expectedArrivalTime || !reason?.trim()) {
        return res.status(400).json({ message: "date, expectedArrivalTime, and reason are required" });
      }
      const istToday = todayIST(); // IST-aware, matches kiosk check-in logic
      if (date < istToday) {
        return res.status(400).json({ message: "Date must be today or a future date" });
      }
      const allEmps = await storage.getEmployees();
      const linked = allEmps.find(e => e.userId === req.user.id);
      if (!linked) return res.status(400).json({ message: "No employee record linked to your account" });
      // Prevent duplicate pending/approved request for the same date
      const existing = await storage.getLateArrivalRequestsByEmployee(linked.id);
      const dup = existing.find(r => r.date === date && (r.status === "pending" || r.status === "approved"));
      if (dup) return res.status(400).json({ message: "A late arrival request already exists for this date" });
      const lar = await storage.createLateArrivalRequest({
        employeeId: linked.id,
        date,
        expectedArrivalTime,
        reason: reason.trim(),
        status: "pending",
        reviewedBy: null,
        reviewNote: null,
      });
      await logAction(req.user.id, "create", "late_arrival_requests", JSON.stringify({ id: lar.id, date, expectedArrivalTime }));
      // Notify HR managers and admins of the new pending request
      try {
        const allUsers = await storage.getUsers();
        const reviewers = allUsers.filter((u: any) => ["admin", "hr_manager"].includes(u.role) && u.isActive !== false);
        for (const reviewer of reviewers) {
          await storage.createNotification({
            userId: reviewer.id,
            type: "late_arrival_pending",
            title: "New Late Arrival Request",
            message: `${linked.name} has requested a late arrival for ${date} (expected ${expectedArrivalTime}). Reason: ${reason.trim()}`,
            relatedId: lar.id,
          });
        }
      } catch (e) {
        console.error("Reviewer notification error:", e);
      }
      res.status(201).json(lar);
    } catch (error) {
      res.status(500).json({ message: "Failed to create late arrival request" });
    }
  });

  app.patch("/api/late-arrival-requests/:id/approve", authenticateToken, async (req: any, res) => {
    try {
      if (req.user.role !== "admin" && req.user.role !== "hr_manager") return res.status(403).json({ message: "Forbidden" });
      const existing = await storage.getLateArrivalRequest(req.params.id);
      if (!existing) return res.status(404).json({ message: "Request not found" });
      if (existing.status !== "pending") return res.status(400).json({ message: "Only pending requests can be approved" });
      const lar = await storage.updateLateArrivalRequest(req.params.id, { status: "approved", reviewedBy: req.user.id, reviewNote: req.body.reviewNote || null });
      if (!lar) return res.status(404).json({ message: "Request not found" });
      await notifyEmployee(lar.employeeId, "late_arrival_approved", "Late Arrival Approved",
        `Your late arrival request for ${lar.date} (expected ${lar.expectedArrivalTime}) has been approved. Your check-in will be marked as Present.`, lar.id);
      await logAction(req.user.id, "approve", "late_arrival_requests", JSON.stringify({ id: lar.id, date: lar.date, employeeId: lar.employeeId }));
      res.json(lar);
    } catch (error) {
      res.status(500).json({ message: "Failed to approve request" });
    }
  });

  app.patch("/api/late-arrival-requests/:id/reject", authenticateToken, async (req: any, res) => {
    try {
      if (req.user.role !== "admin" && req.user.role !== "hr_manager") return res.status(403).json({ message: "Forbidden" });
      const existing = await storage.getLateArrivalRequest(req.params.id);
      if (!existing) return res.status(404).json({ message: "Request not found" });
      if (existing.status !== "pending") return res.status(400).json({ message: "Only pending requests can be rejected" });
      const { reviewNote } = req.body;
      if (!reviewNote?.trim()) return res.status(400).json({ message: "reviewNote (rejection reason) is required" });
      const lar = await storage.updateLateArrivalRequest(req.params.id, { status: "rejected", reviewedBy: req.user.id, reviewNote: reviewNote.trim() });
      if (!lar) return res.status(404).json({ message: "Request not found" });
      await notifyEmployee(lar.employeeId, "late_arrival_rejected", "Late Arrival Request Rejected",
        `Your late arrival request for ${lar.date} was rejected. Reason: ${reviewNote.trim()}`, lar.id);
      await logAction(req.user.id, "reject", "late_arrival_requests", JSON.stringify({ id: lar.id, date: lar.date, employeeId: lar.employeeId, reviewNote }));
      res.json(lar);
    } catch (error) {
      res.status(500).json({ message: "Failed to reject request" });
    }
  });

  app.delete("/api/late-arrival-requests/:id", authenticateToken, async (req: any, res) => {
    try {
      const existing = await storage.getLateArrivalRequest(req.params.id);
      if (!existing) return res.status(404).json({ message: "Request not found" });
      if (req.user.role !== "admin" && req.user.role !== "hr_manager") {
        const allEmps = await storage.getEmployees();
        const linked = allEmps.find(e => e.userId === req.user.id);
        if (!linked || existing.employeeId !== linked.id) return res.status(403).json({ message: "Forbidden" });
        if (existing.status !== "pending") return res.status(400).json({ message: "Only pending requests can be withdrawn" });
      }
      await storage.deleteLateArrivalRequest(req.params.id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Failed to delete request" });
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

      const allowed = ["status", "notes", "paymentTerms", "dueDate", "subtotal", "taxAmount", "totalAmount", "invoiceDate", "invoiceNumber", "uploadStatus", "cancelledAt"];
      const validStatuses = ["pending", "partial_paid", "paid"];
      const validUploadStatuses = ["pending_upload", "uploaded", "recorded", "cancelled"];
      const validTerms = ["immediate", "net_7", "net_15", "net_30", "net_45", "net_60", "net_90"];

      const updates: Record<string, unknown> = {};
      for (const key of allowed) {
        if (req.body[key] !== undefined) updates[key] = req.body[key];
      }
      if (updates.status && !validStatuses.includes(updates.status as string)) {
        return res.status(400).json({ message: `Invalid status. Must be one of: ${validStatuses.join(", ")}` });
      }
      if (updates.uploadStatus && !validUploadStatuses.includes(updates.uploadStatus as string)) {
        return res.status(400).json({ message: `Invalid uploadStatus. Must be one of: ${validUploadStatuses.join(", ")}` });
      }
      if (updates.uploadStatus === "cancelled") {
        updates.cancelledAt = new Date();
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

  // ── K9: Upload Signed Copy for Supplier Invoice ───────────────────────────
  app.post("/api/supplier-invoices/:id/upload-signed-copy", authenticateToken, (req: any, res: any, next: any) => {
    const siUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 }, fileFilter: (_r, f, cb) => { if (["application/pdf","image/jpeg","image/jpg","image/png"].includes(f.mimetype)) cb(null, true); else cb(new Error("Only PDF, JPG, PNG allowed")); } });
    siUpload.single("file")(req, res, (err: unknown) => {
      if (err instanceof multer.MulterError) return res.status(400).json({ message: err.code === "LIMIT_FILE_SIZE" ? "File must be ≤ 10 MB" : err.message });
      if (err instanceof Error) return res.status(400).json({ message: err.message });
      next();
    });
  }, async (req: any, res) => {
    try {
      const allowedRoles = ["accountant", "admin"];
      if (!allowedRoles.includes(req.user.role)) return res.status(403).json({ message: "Not authorized" });
      const inv = await storage.getSupplierInvoice(req.params.id);
      if (!inv) return res.status(404).json({ message: "Supplier invoice not found" });
      if ((inv as any).uploadStatus === "cancelled") return res.status(400).json({ message: "Cannot upload to a cancelled invoice" });
      let fileUrl: string | null = req.body?.fileUrl ?? null;
      if (req.file) {
        const os = new ObjectStorageService();
        const uploadURL = await os.getObjectEntityUploadURL();
        const objectPath = os.normalizeObjectEntityPath(uploadURL);
        const uploadRes = await fetch(uploadURL, { method: "PUT", headers: { "Content-Type": req.file.mimetype }, body: req.file.buffer });
        if (!uploadRes.ok) throw new Error("Failed to upload file to object storage");
        fileUrl = objectPath;
      }
      if (!fileUrl) return res.status(400).json({ message: "File or fileUrl is required" });
      const prevUrl = (inv as any).signedCopyUrl;
      await db.execute(sql`
        UPDATE supplier_invoices
        SET signed_copy_url = ${fileUrl},
            signed_copy_uploaded_by = ${req.user.id},
            signed_copy_uploaded_at = now()
        WHERE id = ${inv.id}
      `);
      await logAction(req.user.id, "supplier_invoice_signed_copy_uploaded", "accounts",
        `Signed copy uploaded for supplier invoice ${(inv as any).invoiceNumber}${prevUrl ? " (replaced)" : ""}`);
      const updated = await storage.getSupplierInvoice(inv.id);
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Failed to upload signed copy" });
    }
  });

  // ── K9: Mark Supplier Invoice as Recorded ─────────────────────────────────
  app.post("/api/supplier-invoices/:id/mark-recorded", authenticateToken, async (req: any, res) => {
    try {
      const allowedRoles = ["accountant", "admin"];
      if (!allowedRoles.includes(req.user.role)) return res.status(403).json({ message: "Not authorized" });
      const inv = await storage.getSupplierInvoice(req.params.id);
      if (!inv) return res.status(404).json({ message: "Supplier invoice not found" });
      if ((inv as any).uploadStatus === "recorded") return res.status(400).json({ message: "Invoice already recorded" });
      if ((inv as any).uploadStatus === "cancelled") return res.status(400).json({ message: "Cannot record a cancelled invoice" });
      const { extInvoiceNumber, extInvoiceDate, extTotalAmount, extGstAmount } = req.body;
      if (!extInvoiceNumber?.trim()) return res.status(400).json({ message: "Supplier invoice number is required" });
      if (!extInvoiceDate) return res.status(400).json({ message: "Invoice date is required" });
      if (!extTotalAmount) return res.status(400).json({ message: "Total amount is required" });
      if (!(inv as any).signedCopyUrl) return res.status(400).json({ message: "Upload signed copy before marking as recorded" });
      const extTotal = Number(extTotalAmount);
      const sysTotal = Number((inv as any).totalAmount ?? 0);
      const variance = Math.abs(extTotal - sysTotal);
      await db.execute(sql`
        UPDATE supplier_invoices
        SET upload_status = 'recorded',
            ext_invoice_number = ${extInvoiceNumber.trim()},
            ext_invoice_date = ${new Date(extInvoiceDate)},
            ext_total_amount = ${String(extTotal)},
            ext_gst_amount = ${extGstAmount ? String(Number(extGstAmount)) : null}
        WHERE id = ${inv.id}
      `);
      const varianceNote = variance > 0.01 ? ` Variance from system: ₹${variance.toFixed(2)}` : "";
      await logAction(req.user.id, "supplier_invoice_recorded", "accounts",
        `Supplier invoice ${(inv as any).invoiceNumber} recorded. Ext invoice: ${extInvoiceNumber} dated ${extInvoiceDate} for ₹${extTotal.toFixed(2)}.${varianceNote}`);
      const updated = await storage.getSupplierInvoice(inv.id);
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Failed to mark invoice as recorded" });
    }
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

      // K11-1: Audit log for supplier payment update
      await logAction((req as any).user?.id, "supplier_payment_updated", "supply_chain",
        `Supplier payment ${pay.id} updated — amount: ₹${updated?.amount ?? pay.amount}, method: ${updated?.paymentMethod ?? pay.paymentMethod}, ref: ${updated?.reference ?? pay.reference}`);

      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Failed to update supplier payment" });
    }
  });

  app.post("/api/supplier-payments", authenticateToken, async (req: any, res) => {
    try {
      const { supplierInvoiceId, purchaseOrderId, supplierId, amount, paymentType, paymentMethod, paymentDate, reference, cashAccountId } = req.body;

      // Required fields
      if (!supplierId) return res.status(400).json({ message: "supplierId is required" });
      if (!amount) return res.status(400).json({ message: "amount is required" });
      if (!cashAccountId) return res.status(400).json({ message: "cashAccountId is required — select the account this payment was made from" });
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
        cashAccountId,
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

      // I1: Audit log for supplier payment recording
      const payRef = paymentType === "advance"
        ? `advance on PO ${purchaseOrderId}`
        : `regular payment on invoice ${supplierInvoiceId}`;
      await logAction((req as any).user?.id, "supplier_payment_recorded", "supply_chain",
        `Supplier payment ₹${amountNum.toFixed(2)} (${paymentType}) recorded for supplier ${supplierId} — ${payRef}`);

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

      // K11-2: Audit log for supplier payment deletion
      await logAction((req as any).user?.id, "supplier_payment_deleted", "supply_chain",
        `Supplier payment ${pay.id} deleted — ₹${pay.amount} (${pay.paymentType}) for supplier ${pay.supplierId}`);

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
      // K12-C: fetch GRNs to get creditReason for credit GRN invoices
      const allGRNs = await storage.getGRNs();
      const grnMap = new Map(allGRNs.map(g => [g.id, g]));

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

        // K12-C: get creditReason from linked GRN for credit GRN invoices
        const grn = (inv as any).grnId ? grnMap.get((inv as any).grnId) : undefined;
        const creditReason = (inv as any).isCreditGrn ? ((grn as any)?.creditReason ?? null) : null;

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
          isCreditGrn: !!(inv as any).isCreditGrn,
          creditReason,
          uploadStatus: (inv as any).uploadStatus ?? "pending_upload",
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
      // K12-A: fetch challans to get credit-override info per invoice
      const allChallans = await storage.getDeliveryChallans();
      const challanMap = new Map(allChallans.map(dc => [dc.id, dc]));

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

        // K12-A: credit override info from linked delivery challan
        const challan = inv.challanId ? challanMap.get(inv.challanId) : undefined;
        const isCreditOverride = !!(challan as any)?.isCreditOverride;
        const creditReason = (challan as any)?.creditReason ?? null;

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
          isCreditOverride,
          creditReason,
        };
      });

      // Sort by daysOverdue descending (most overdue first, future due at bottom)
      rows.sort((a, b) => b.daysOverdue - a.daysOverdue);

      res.json({ rows, summary });
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Failed to generate AR aging report" });
    }
  });

  // ─── Phase 4C T7+T8 — Date param validator (post-architect-review fix) ─────
  // Reject empty/invalid date strings with 400 so reports never silently fall
  // back. `undefined` (param omitted) is allowed; helpers handle defaults.
  function validateReportDates(req: any, res: any): { from?: string; to?: string } | null {
    const isoRe = /^\d{4}-\d{2}-\d{2}$/;
    const fromQ = req.query.from;
    const toQ = req.query.to;
    const from = typeof fromQ === "string" && fromQ.length > 0 ? fromQ.trim() : undefined;
    const to = typeof toQ === "string" && toQ.length > 0 ? toQ.trim() : undefined;
    if (from !== undefined && !isoRe.test(from)) {
      res.status(400).json({ message: `Invalid 'from' date "${fromQ}" — expected YYYY-MM-DD` });
      return null;
    }
    if (to !== undefined && !isoRe.test(to)) {
      res.status(400).json({ message: `Invalid 'to' date "${toQ}" — expected YYYY-MM-DD` });
      return null;
    }
    if (from && to && from > to) {
      res.status(400).json({ message: `'from' (${from}) must be ≤ 'to' (${to})` });
      return null;
    }
    return { from, to };
  }

  // ─── Phase 4C T7 — P&L Statement (JSON) ─────────────────────────────────────
  app.get(
    "/api/reports/pl-statement",
    authenticateToken,
    requireRole("admin", "accountant"),
    async (req: any, res) => {
      try {
        const dates = validateReportDates(req, res); if (!dates) return;
        const { getPLStatement } = await import("./lib/financial-aggregations");
        const data = await getPLStatement(dates);
        res.json(data);
      } catch (err: any) {
        console.error("P&L statement error:", err);
        res.status(500).json({ message: err.message || "Failed to generate P&L statement" });
      }
    },
  );

  // ─── Phase 4C T7 — P&L Statement (Excel) ────────────────────────────────────
  app.get(
    "/api/reports/pl-statement/excel",
    authenticateToken,
    requireRole("admin", "accountant"),
    async (req: any, res) => {
      try {
        const dates = validateReportDates(req, res); if (!dates) return;
        const { getPLStatement } = await import("./lib/financial-aggregations");
        const { exportPLStatementExcel } = await import("./lib/pl-cashflow-excel");
        const { sendExcel } = await import("./lib/excel-export");
        const data = await getPLStatement(dates);
        const buf = await exportPLStatementExcel(data);
        sendExcel(res, buf, `PL-Statement-${dates.from ?? "all"}-to-${dates.to ?? "today"}.xlsx`);
      } catch (err: any) {
        console.error("P&L Excel error:", err);
        res.status(500).json({ message: err.message || "Failed to export P&L Excel" });
      }
    },
  );

  // ─── Phase 4C T8 — Cash Flow Statement (JSON) ───────────────────────────────
  app.get(
    "/api/reports/cash-flow",
    authenticateToken,
    requireRole("admin", "accountant"),
    async (req: any, res) => {
      try {
        const dates = validateReportDates(req, res); if (!dates) return;
        const { getCashFlowStatement } = await import("./lib/financial-aggregations");
        const data = await getCashFlowStatement(dates);
        res.json(data);
      } catch (err: any) {
        console.error("Cash flow error:", err);
        res.status(500).json({ message: err.message || "Failed to generate cash flow statement" });
      }
    },
  );

  // ─── Phase 4C T8 — Cash Flow Statement (Excel) ──────────────────────────────
  app.get(
    "/api/reports/cash-flow/excel",
    authenticateToken,
    requireRole("admin", "accountant"),
    async (req: any, res) => {
      try {
        const dates = validateReportDates(req, res); if (!dates) return;
        const { getCashFlowStatement } = await import("./lib/financial-aggregations");
        const { exportCashFlowStatementExcel } = await import("./lib/pl-cashflow-excel");
        const { sendExcel } = await import("./lib/excel-export");
        const data = await getCashFlowStatement(dates);
        const buf = await exportCashFlowStatementExcel(data);
        sendExcel(res, buf, `Cash-Flow-${dates.from ?? "all"}-to-${dates.to ?? "today"}.xlsx`);
      } catch (err: any) {
        console.error("Cash flow Excel error:", err);
        res.status(500).json({ message: err.message || "Failed to export cash flow Excel" });
      }
    },
  );

  // ─── Pricing Summary Report ─────────────────────────────────────────────────
  app.get("/api/reports/pricing-summary", authenticateToken, requireRole("admin", "sales_manager", "accountant"), async (req: any, res) => {
    try {
      const today = new Date().toISOString().slice(0, 10);

      // Fetch all products and current stock
      const allProds = await db.execute(sql`
        SELECT p.id, p.name, p.sku, p.category, p.unit, p.unit_price, p.cost_price,
               p.min_stock_level, p.needs_pricing_review, p.min_margin_pct,
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

        // Per-product minimum margin (from Task #26 — respects product-level setting)
        const minMarginPct = Number(prod.min_margin_pct ?? 5);

        const totalLotQty = lots.reduce((s, l) => s + l.remainingQty, 0);
        const blendedCost = totalLotQty > 0
          ? lots.reduce((s, l) => s + l.landedCost * l.remainingQty, 0) / totalLotQty
          : 0;
        // Fix #4: globalFloor uses per-product minMarginPct, not hardcoded 5%
        const globalFloor = blendedCost > 0 ? blendedCost * (1 + minMarginPct / 100) : 0;
        const strictFloor = lots.length > 0 ? Math.max(...lots.map(l => l.floorPrice)) : 0;

        const sheet = sheetMap.get(prod.id);
        const confirmedPrice = sheet ? Number(sheet.proposed_price) : Number(prod.unit_price);
        const sheetDate = sheet ? (typeof sheet.sheet_date === "string" ? sheet.sheet_date.slice(0, 10) : new Date(sheet.sheet_date).toISOString().slice(0, 10)) : null;
        const hasConfirmedToday = sheetDate === today;
        const hasConfirmedSheet = sheetDate !== null;
        const hasUnconfirmedSheet = unconfirmedSet.has(prod.id);

        // Fix #2: derive source field ("today" | "fallback" | "none")
        const source: "today" | "fallback" | "none" = hasConfirmedToday ? "today"
          : hasConfirmedSheet ? "fallback"
          : "none";

        const marginPct = confirmedPrice > 0 && blendedCost > 0
          ? ((confirmedPrice - blendedCost) / confirmedPrice) * 100
          : null;

        // Fix #5: pressureLevel uses per-product minMarginPct, not hardcoded 0.9/0.75 ratios
        const pressureLevel = marginPct === null ? "None"
          : marginPct < minMarginPct ? "High Risk"
          : marginPct < (minMarginPct + 10) ? "Medium"
          : "Safe";

        const oldestLotDate = lots.length > 0
          ? new Date(Math.min(...lots.map(l => l.lotDate ? l.lotDate.getTime() : Date.now())))
          : null;
        const lotAgeDays = oldestLotDate ? Math.floor((Date.now() - oldestLotDate.getTime()) / 86400000) : null;
        const sellPriority = lotAgeDays !== null && lotAgeDays > 30 && totalStock > (Number(prod.min_stock_level) || 0);

        // Portfolio rollup
        if (blendedCost > 0 && totalStock > 0) {
          // Always count cost (the inventory cost is real regardless of pricing status)
          portfolioTotalCost += blendedCost * totalStock;
          // Fix #3: only count revenue for products with a confirmed price (source != "none")
          if (source !== "none") {
            portfolioRevenue += confirmedPrice * totalStock;
          }
          // Fix #1: requiredRevenue uses per-product globalFloor × stock (not hardcoded cost/0.95)
          portfolioRequiredRevenue += globalFloor * totalStock;
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
          source,
          hasConfirmedToday,
          hasConfirmedSheet,
          hasUnconfirmedSheet,
          marginPct: marginPct !== null ? parseFloat(marginPct.toFixed(2)) : null,
          minMarginPct,
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
          productsWithoutPriceCount: products.filter(p => p.source === "none").length,
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

  // ── C2/C3: Mark Sales Invoice as Recorded ─────────────────────────────────
  app.post("/api/sales-invoices/:id/mark-recorded", authenticateToken, async (req: any, res) => {
    try {
      const allowedRoles = ["accountant", "admin"];
      if (!allowedRoles.includes(req.user.role)) return res.status(403).json({ message: "Not authorized" });

      const inv = await storage.getSalesInvoice(req.params.id);
      if (!inv) return res.status(404).json({ message: "Sales invoice not found" });
      if ((inv as any).uploadStatus === "recorded") return res.status(400).json({ message: "Invoice already recorded" });
      if ((inv as any).uploadStatus === "cancelled") return res.status(400).json({ message: "Cannot record a cancelled invoice" });

      // Required fields validation
      const { extInvoiceNumber, extInvoiceDate, extTotalAmount } = req.body;
      if (!extInvoiceNumber?.trim()) return res.status(400).json({ message: "Invoice number (from Tally) is required" });
      if (!extInvoiceDate) return res.status(400).json({ message: "Invoice date is required" });
      if (!extTotalAmount) return res.status(400).json({ message: "Total amount is required" });
      if (!(inv as any).signedCopyUrl) return res.status(400).json({ message: "Upload signed copy before marking as recorded" });

      // Optional dueDate override — validate if provided
      let overrideDueDate: Date | null = null;
      if (req.body.dueDate) {
        const parsed = new Date(req.body.dueDate);
        if (!isNaN(parsed.getTime())) overrideDueDate = parsed;
      }

      // Eway bill threshold warning (total >= 50000) is handled client-side; server does NOT block
      await db.execute(sql`
        UPDATE sales_invoices
        SET upload_status = 'recorded',
            ext_invoice_number = ${extInvoiceNumber},
            ext_invoice_date = ${new Date(extInvoiceDate)},
            ext_total_amount = ${String(extTotalAmount)},
            ext_gst_amount = ${req.body.extGstAmount ? String(req.body.extGstAmount) : null},
            upload_notes = ${req.body.uploadNotes ?? null},
            due_date = ${overrideDueDate ?? (inv as any).dueDate ?? null}
        WHERE id = ${inv.id}
      `);

      await logAction(req.user.id, "sales_invoice_recorded", "sales",
        `Invoice ${inv.invoiceNumber} marked as recorded. Ext#: ${extInvoiceNumber}, Amount: ${extTotalAmount}`);

      const updated = await storage.getSalesInvoice(inv.id);
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Failed to mark invoice as recorded" });
    }
  });

  // ── C2: Upload Sales Invoice Signed Copy ──────────────────────────────────
  app.post("/api/sales-invoices/:id/upload-signed-copy", authenticateToken, (req: any, res: any, next: any) => {
    const invUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 }, fileFilter: (_r, f, cb) => { if (["application/pdf","image/jpeg","image/jpg","image/png"].includes(f.mimetype)) cb(null, true); else cb(new Error("Only PDF, JPG, PNG allowed")); } });
    invUpload.single("file")(req, res, (err: unknown) => {
      if (err instanceof multer.MulterError) return res.status(400).json({ message: err.code === "LIMIT_FILE_SIZE" ? "File must be ≤ 10 MB" : err.message });
      if (err instanceof Error) return res.status(400).json({ message: err.message });
      next();
    });
  }, async (req: any, res) => {
    try {
      const allowedRoles = ["accountant", "admin"];
      if (!allowedRoles.includes(req.user.role)) return res.status(403).json({ message: "Not authorized" });

      const inv = await storage.getSalesInvoice(req.params.id);
      if (!inv) return res.status(404).json({ message: "Sales invoice not found" });
      if ((inv as any).uploadStatus === "cancelled") return res.status(400).json({ message: "Cannot upload to a cancelled invoice" });

      let fileUrl: string | null = req.body?.fileUrl ?? null;
      if (req.file) {
        const os = new ObjectStorageService();
        const uploadURL = await os.getObjectEntityUploadURL();
        const objectPath = os.normalizeObjectEntityPath(uploadURL);
        const uploadRes = await fetch(uploadURL, { method: "PUT", headers: { "Content-Type": req.file.mimetype }, body: req.file.buffer });
        if (!uploadRes.ok) throw new Error("Failed to upload file to object storage");
        fileUrl = objectPath;
      }
      if (!fileUrl) return res.status(400).json({ message: "File or fileUrl is required" });

      const prevUrl = (inv as any).signedCopyUrl;
      await db.execute(sql`
        UPDATE sales_invoices
        SET signed_copy_url = ${fileUrl},
            signed_copy_uploaded_by = ${req.user.id},
            signed_copy_uploaded_at = now()
        WHERE id = ${inv.id}
      `);

      await logAction(req.user.id, "sales_invoice_signed_copy_uploaded", "sales",
        `Signed copy uploaded for invoice ${inv.invoiceNumber}${prevUrl ? " (replaced)" : ""}`);

      const updated = await storage.getSalesInvoice(inv.id);
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Failed to upload signed copy" });
    }
  });

  // ── C2: Upload E-way Bill ─────────────────────────────────────────────────
  app.post("/api/sales-invoices/:id/upload-eway-bill", authenticateToken, (req: any, res: any, next: any) => {
    const ewayUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 }, fileFilter: (_r, f, cb) => { if (["application/pdf","image/jpeg","image/jpg","image/png"].includes(f.mimetype)) cb(null, true); else cb(new Error("Only PDF, JPG, PNG allowed")); } });
    ewayUpload.single("file")(req, res, (err: unknown) => {
      if (err instanceof multer.MulterError) return res.status(400).json({ message: err.code === "LIMIT_FILE_SIZE" ? "File must be ≤ 10 MB" : err.message });
      if (err instanceof Error) return res.status(400).json({ message: err.message });
      next();
    });
  }, async (req: any, res) => {
    try {
      const allowedRoles = ["accountant", "admin"];
      if (!allowedRoles.includes(req.user.role)) return res.status(403).json({ message: "Not authorized" });

      const inv = await storage.getSalesInvoice(req.params.id);
      if (!inv) return res.status(404).json({ message: "Sales invoice not found" });
      if ((inv as any).uploadStatus === "cancelled") return res.status(400).json({ message: "Cannot upload to a cancelled invoice" });

      let fileUrl: string | null = req.body?.fileUrl ?? null;
      const ewayBillNumber: string | null = req.body?.ewayBillNumber ?? null;
      const ewayBillDate: string | null = req.body?.ewayBillDate ?? null;

      if (req.file) {
        const os = new ObjectStorageService();
        const uploadURL = await os.getObjectEntityUploadURL();
        const objectPath = os.normalizeObjectEntityPath(uploadURL);
        const uploadRes = await fetch(uploadURL, { method: "PUT", headers: { "Content-Type": req.file.mimetype }, body: req.file.buffer });
        if (!uploadRes.ok) throw new Error("Failed to upload file to object storage");
        fileUrl = objectPath;
      }
      if (!fileUrl && !ewayBillNumber) return res.status(400).json({ message: "File or ewayBillNumber is required" });

      await db.execute(sql`
        UPDATE sales_invoices
        SET eway_bill_url = COALESCE(${fileUrl}, eway_bill_url),
            eway_bill_number = COALESCE(${ewayBillNumber}, eway_bill_number),
            eway_bill_date = COALESCE(${ewayBillDate ? new Date(ewayBillDate) : null}, eway_bill_date),
            eway_bill_uploaded_by = ${req.user.id},
            eway_bill_uploaded_at = now()
        WHERE id = ${inv.id}
      `);

      await logAction(req.user.id, "sales_invoice_eway_bill_uploaded", "sales",
        `E-way bill recorded for invoice ${inv.invoiceNumber}. EBN: ${ewayBillNumber ?? "n/a"}`);

      const updated = await storage.getSalesInvoice(inv.id);
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Failed to upload e-way bill" });
    }
  });

  // ── C4: Cancel Sales Invoice ──────────────────────────────────────────────
  app.post("/api/sales-invoices/:id/cancel", authenticateToken, async (req: any, res) => {
    try {
      const allowedRoles = ["accountant", "admin"];
      if (!allowedRoles.includes(req.user.role)) return res.status(403).json({ message: "Not authorized" });

      const inv = await storage.getSalesInvoice(req.params.id);
      if (!inv) return res.status(404).json({ message: "Sales invoice not found" });
      if ((inv as any).uploadStatus === "cancelled") return res.status(400).json({ message: "Invoice already cancelled" });

      const { cancellationReason } = req.body;
      if (!cancellationReason?.trim()) return res.status(400).json({ message: "Cancellation reason is required" });

      await db.execute(sql`
        UPDATE sales_invoices
        SET upload_status = 'cancelled',
            cancelled_at = now(),
            cancelled_by = ${req.user.id},
            cancellation_reason = ${cancellationReason}
        WHERE id = ${inv.id}
      `);

      await logAction(req.user.id, "sales_invoice_cancelled", "sales",
        `Invoice ${inv.invoiceNumber} cancelled. Reason: ${cancellationReason}`);

      const updated = await storage.getSalesInvoice(inv.id);
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Failed to cancel invoice" });
    }
  });

  // ── C5: Manual Create Sales Invoice ──────────────────────────────────────
  app.post("/api/sales-invoices/manual", authenticateToken, async (req: any, res) => {
    try {
      const allowedRoles = ["accountant", "admin"];
      if (!allowedRoles.includes(req.user.role)) return res.status(403).json({ message: "Not authorized" });

      const { challanId, soId } = req.body;
      if (!challanId) return res.status(400).json({ message: "challanId is required" });

      // Must be a dispatched challan
      const challanRes = await db.execute(sql`SELECT * FROM delivery_challans WHERE id = ${challanId} LIMIT 1`);
      const challanRow = challanRes.rows[0] as any;
      if (!challanRow) return res.status(404).json({ message: "Challan not found" });
      if (challanRow.status !== "dispatched") return res.status(400).json({ message: "Challan must be dispatched to create invoice" });

      // Resolve customer
      let resolvedCustomerId = challanRow.customer_id;
      if (!resolvedCustomerId && challanRow.order_id) {
        const soRes = await db.execute(sql`SELECT customer_id FROM sales_orders WHERE id = ${challanRow.order_id} LIMIT 1`);
        resolvedCustomerId = (soRes.rows[0] as any)?.customer_id ?? null;
      }
      if (!resolvedCustomerId) return res.status(422).json({ message: "Could not determine customer for this challan" });

      const custRes = await db.execute(sql`SELECT * FROM customers WHERE id = ${resolvedCustomerId} LIMIT 1`);
      const cust = custRes.rows[0] as any;
      const customerGSTIN = cust?.gst_number || null;
      const customerType = customerGSTIN ? "B2B" : "B2C";
      const isInterState = req.body.isInterState ?? false;

      const challanItemsRes = await db.execute(sql`SELECT * FROM delivery_challan_items WHERE challan_id = ${challanId}`);
      const challanItems = challanItemsRes.rows as any[];
      let subtotal = 0, totalCgst = 0, totalSgst = 0, totalIgst = 0, totalTax = 0;
      const lineItems: any[] = [];
      for (const ci of challanItems) {
        const qty = Number(ci.qty_dispatched ?? 0) > 0 ? Number(ci.qty_dispatched) : Number(ci.qty_to_dispatch ?? ci.quantity ?? 0);
        if (qty <= 0) continue;
        const prodRes = await db.execute(sql`SELECT * FROM products WHERE id = ${ci.product_id} LIMIT 1`);
        const prod = prodRes.rows[0] as any;
        const unitPrice = Number(ci.unit_price ?? prod?.unit_price ?? 0);
        const gstRate = Number(prod?.gst_rate ?? 0);
        const taxableAmt = qty * unitPrice;
        const tax = taxableAmt * gstRate / 100;
        subtotal += taxableAmt;
        totalCgst += isInterState ? 0 : tax / 2;
        totalSgst += isInterState ? 0 : tax / 2;
        totalIgst += isInterState ? tax : 0;
        totalTax += tax;
        lineItems.push({ productId: ci.product_id, description: ci.description ?? prod?.name ?? "Product", qty, unitPrice, hsnCode: prod?.hsn_code ?? null, gstRate, taxableAmount: taxableAmt, cgst: isInterState ? 0 : tax / 2, sgst: isInterState ? 0 : tax / 2, igst: isInterState ? tax : 0, taxAmount: tax, totalAmount: taxableAmt + tax });
      }

      const invoiceNumber = await storage.generateSalesInvoiceNumber();
      const invoice = await storage.createSalesInvoice({
        invoiceNumber, invoiceDate: new Date(), customerId: resolvedCustomerId,
        soId: soId ?? challanRow.order_id ?? null, challanId,
        customerType, customerGSTIN, isInterState,
        subtotal: String(subtotal), totalCgst: String(totalCgst), totalSgst: String(totalSgst),
        totalIgst: String(totalIgst), totalTax: String(totalTax), grandTotal: String(subtotal + totalTax),
        creditedAmount: "0", status: "pending", dueDate: null, notes: req.body.notes ?? null,
        createdBy: req.user.id, uploadStatus: "pending_upload",
      } as any);
      for (const li of lineItems) {
        await storage.createSalesInvoiceItem({ invoiceId: invoice.id, productId: li.productId, description: li.description, qty: String(li.qty), unitPrice: String(li.unitPrice), hsnCode: li.hsnCode, gstRate: String(li.gstRate), taxableAmount: String(li.taxableAmount), cgst: String(li.cgst), sgst: String(li.sgst), igst: String(li.igst), taxAmount: String(li.taxAmount), totalAmount: String(li.totalAmount) });
      }
      await logAction(req.user.id, "sales_invoice_manually_created", "sales", `Invoice ${invoiceNumber} manually created for challan ${challanRow.challan_number}`);
      res.status(201).json(invoice);
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Failed to create sales invoice" });
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
      const { invoiceId, customerId, amount, paymentDate, method, reference, notes, cashAccountId } = req.body;
      if (!invoiceId || !amount) return res.status(400).json({ message: "invoiceId and amount are required" });
      if (!cashAccountId) return res.status(400).json({ message: "cashAccountId is required — select the account where this payment was received" });

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
        cashAccountId,
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

  // Authz helper for expense-related attachment access. Mirrors the expense module's
  // role/scope rules so attachments cannot be used to bypass expense ACLs.
  // mode: "view" (list/download) or "mutate" (upload/confirm/delete).
  async function checkExpenseAttachmentAccess(
    req: any,
    expenseId: string,
    mode: "view" | "mutate",
  ): Promise<{ ok: true } | { ok: false; status: number; message: string }> {
    if (req.user?.role === "field_staff") {
      return { ok: false, status: 403, message: "Forbidden" };
    }
    const expense = await storage.getExpense(expenseId);
    if (!expense) return { ok: false, status: 404, message: "Expense not found" };
    const isPrivileged = req.user?.role === "admin" || req.user?.role === "accountant";
    if (isPrivileged) return { ok: true };
    const isOwn = expense.paidByUserId === req.user.id || expense.createdByUserId === req.user.id;
    if (!isOwn) return { ok: false, status: 403, message: "You can only access attachments on your own expenses" };
    if (mode === "mutate") {
      const ageMs = Date.now() - new Date(expense.createdAt).getTime();
      if (ageMs > 24 * 60 * 60 * 1000) {
        return { ok: false, status: 403, message: "Expense is older than 24 hours; ask an accountant to make changes" };
      }
    }
    return { ok: true };
  }

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
      } else if (entityType === "expense") {
        const check = await checkExpenseAttachmentAccess(req, entityId, "mutate");
        if (!check.ok) return res.status(check.status).json({ message: check.message });
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
      } else if (entityType === "expense") {
        const check = await checkExpenseAttachmentAccess(req, entityId, "mutate");
        if (!check.ok) return res.status(check.status).json({ message: check.message });
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
      } else if (entityType === "expense") {
        const check = await checkExpenseAttachmentAccess(req, entityId, "mutate");
        if (!check.ok) return res.status(check.status).json({ message: check.message });
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
      if (found.entityType === "expense") {
        const check = await checkExpenseAttachmentAccess(req, found.entityId, "view");
        if (!check.ok) return res.status(check.status).json({ message: check.message });
      }
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
      if (entityType === "expense") {
        const check = await checkExpenseAttachmentAccess(req, entityId, "view");
        if (!check.ok) return res.status(check.status).json({ message: check.message });
      }
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
      if (found.entityType === "expense") {
        const check = await checkExpenseAttachmentAccess(req, found.entityId, "mutate");
        if (!check.ok) return res.status(check.status).json({ message: check.message });
      }
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
        source: "today" | "fallback" | "none";
        hasConfirmedToday: boolean;
        blendedCost: string | null;
        globalFloorPrice: string | null;
        strictFloorPrice: string | null;
      }> = {};
      // Seed all products with noConfirmedPrice=true as baseline — unitPrice is last-resort fallback
      for (const prod of allProducts.rows as any[]) {
        priceMap[prod.id] = {
          effectivePrice: prod.unit_price ?? "0",
          sheetDate: null,
          noConfirmedPrice: true,
          source: "none",
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
        const isToday = sheetDateStr === today;
        priceMap[row.product_id] = {
          effectivePrice: row.proposed_price,
          sheetDate: sheetDateStr,
          noConfirmedPrice: false,
          source: isToday ? "today" : "fallback",
          hasConfirmedToday: isToday,
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

  // ─── Phase 7 — Bundle / Kit Engine ─────────────────────────────────────
  // GET bundle items (components) for a bundle product
  app.get("/api/products/:id/bundle-items", authenticateToken, async (req: any, res) => {
    try {
      const items = await storage.getBundleItems(req.params.id);
      res.json(items);
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch bundle items" });
    }
  });

  // PUT bundle items — replaces all components for a bundle.
  // Validates: parent must be type='bundle'; no nested bundles; no service components.
  app.put("/api/products/:id/bundle-items", authenticateToken, requireRole("admin", "sales_manager"), async (req: any, res) => {
    try {
      const bundleId = req.params.id;
      const parent = await storage.getProduct(bundleId);
      if (!parent) return res.status(404).json({ message: "Bundle product not found" });
      if (parent.type !== "bundle") {
        return res.status(400).json({ message: "Parent product must be of type 'bundle'" });
      }

      const items = Array.isArray(req.body?.items) ? req.body.items : [];
      // Validate each row
      const cleaned: Array<{ componentProductId: string; quantity: string; unit: string }> = [];
      for (const it of items) {
        if (!it?.componentProductId || it.componentProductId === bundleId) {
          return res.status(400).json({ message: "Invalid component (cannot reference self)" });
        }
        const comp = await storage.getProduct(it.componentProductId);
        if (!comp) return res.status(400).json({ message: `Component product ${it.componentProductId} not found` });
        if (comp.type === "bundle") {
          return res.status(400).json({ message: `Component "${comp.name}" is itself a bundle. Nested bundles are not allowed.` });
        }
        if (comp.type === "service") {
          return res.status(400).json({ message: `Component "${comp.name}" is a service. Services must be added as separate sales-order lines, not bundle components.` });
        }
        const qtyNum = Number(it.quantity);
        if (!Number.isFinite(qtyNum) || qtyNum <= 0) {
          return res.status(400).json({ message: `Quantity must be > 0 for component "${comp.name}"` });
        }
        cleaned.push({
          componentProductId: it.componentProductId,
          quantity: String(qtyNum),
          unit: it.unit || "pcs",
        });
      }

      const saved = await storage.replaceBundleItems(bundleId, cleaned as any);

      // If any component is non-active, flag bundle for pricing review
      const components = await Promise.all(cleaned.map(c => storage.getProduct(c.componentProductId)));
      const hasNonActive = components.some(c => c && c.lifecycleStatus !== "active");
      if (hasNonActive && !parent.needsPricingReview) {
        await storage.updateProduct(bundleId, { needsPricingReview: true } as any);
      }

      res.json({ items: saved, hasNonActiveComponent: hasNonActive });
    } catch (err) {
      console.error("[BUNDLE] PUT bundle-items failed:", err);
      res.status(500).json({ message: "Failed to save bundle items" });
    }
  });

  // GET computed auto-price for a bundle (Σ component effective price × qty).
  // Returns full breakdown for live preview in the form.
  app.get("/api/products/:id/bundle-effective-price", authenticateToken, async (req: any, res) => {
    try {
      const bundleId = req.params.id;
      const parent = await storage.getProduct(bundleId);
      if (!parent) return res.status(404).json({ message: "Bundle not found" });
      if (parent.type !== "bundle") {
        return res.status(400).json({ message: "Product is not a bundle" });
      }
      const date = (req.query.date as string) || new Date().toISOString().slice(0, 10);
      const result = await storage.computeBundleAutoPrice(bundleId, date);
      res.json(result);
    } catch (err) {
      console.error("[BUNDLE] effective-price failed:", err);
      res.status(500).json({ message: "Failed to compute bundle price" });
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
        rejectedBy:       null,
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
      const prodNameRes = await db.execute(sql`SELECT name FROM products WHERE id = ${productId} LIMIT 1`);
      const prodName = (prodNameRes.rows[0] as any)?.name ?? productId;
      notifyPricingReviewers(
        "Price Sheet Awaiting Review",
        `A draft price sheet for ${prodName} on ${sheetDate} is ready for review.`,
        sheet.id
      );
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
      const updated = await storage.updateDailyPriceSheet(sheet.id, {
        status: "rejected",
        rejectedBy: req.user.id,
        rejectionNotes: rejectionNotes || null,
      });
      await logAction(req.user.id, "REJECT", "DailyPriceSheet", `Rejected price sheet ${sheet.id} for product ${sheet.productId} — status set to rejected`);
      res.json(updated);
    } catch (err) {
      res.status(500).json({ message: "Failed to reject price sheet" });
    }
  });

  // ── WhatsApp Webhook (Task #67 Phase 1+2: slim handler) ────────────────────
  // Handler ONLY validates and enqueues. All DB processing is done by the
  // worker loop in server/index.ts via processWhatsappWebhookJob (single
  // source of truth). Goal: return 200 to Interakt in <500ms so a slow DB
  // never causes Interakt to back off and silently stop deliveries.
  //
  // Phase 2: explicit reason codes on every reject + rolling-20 capture of
  // rejected payloads (with secrets redacted) so admins can diagnose
  // misconfiguration without log access.
  function redactHeaders(h: Record<string, any>): Record<string, any> {
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(h || {})) {
      const lk = k.toLowerCase();
      if (lk === "authorization" || lk === "x-interakt-signature" || lk === "cookie" || lk === "set-cookie" || /token|secret|api[-_]?key/i.test(k)) {
        out[k] = "[REDACTED]";
      } else {
        out[k] = v;
      }
    }
    return out;
  }
  function redactQuery(q: Record<string, any>): Record<string, any> {
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(q || {})) {
      out[k] = /token|secret|signature|api[-_]?key/i.test(k) ? "[REDACTED]" : v;
    }
    return out;
  }
  async function captureRejection(req: any, status: number, reason: string) {
    try {
      const rawBody = (req.rawBody as Buffer | undefined)?.toString("utf8") ?? null;
      await storage.recordWhatsappWebhookRejection({
        reason,
        httpStatus: status,
        method: req.method,
        path: req.path,
        query: redactQuery(req.query || {}),
        headers: redactHeaders(req.headers || {}),
        rawBody,
      });
    } catch (err) {
      console.error("[WA WEBHOOK] Failed to record rejection:", err);
    }
  }

  app.post("/api/whatsapp/webhook", async (req: any, res) => {
    try {
      // 1) Token check
      const token = req.query.token as string;
      const expectedToken = process.env.WHATSAPP_WEBHOOK_TOKEN;
      if (!expectedToken || token !== expectedToken) {
        console.warn(`[WA WEBHOOK] reject reason=token_mismatch ip=${req.ip}`);
        await captureRejection(req, 401, "token_mismatch");
        return res.status(401).json({ message: "Invalid webhook token", reason: "token_mismatch" });
      }

      // 2) Fail-closed secret check (prod posture; dev mirrors prod here so behaviour is identical).
      const secret = process.env.INTERAKT_WEBHOOK_SECRET;
      if (!secret) {
        console.warn(`[WA WEBHOOK] reject reason=secret_missing — INTERAKT_WEBHOOK_SECRET not set`);
        await captureRejection(req, 503, "secret_missing");
        return res.status(503).json({ message: "Webhook secret not configured", reason: "secret_missing" });
      }

      // 3) HMAC signature check
      // Interakt sends `interakt-signature` (no x- prefix). Accept both for forward-compat.
      const signature = (req.headers["interakt-signature"] || req.headers["x-interakt-signature"]) as string;
      const rawBody = req.rawBody as Buffer;
      if (!signature || !rawBody) {
        console.warn(`[WA WEBHOOK] reject reason=hmac_missing`);
        await captureRejection(req, 401, "hmac_missing");
        return res.status(401).json({ message: "Missing HMAC signature", reason: "hmac_missing" });
      }
      if (!verifyInteraktSignature(rawBody, signature)) {
        console.warn(`[WA WEBHOOK] reject reason=hmac_mismatch`);
        await captureRejection(req, 401, "hmac_mismatch");
        return res.status(401).json({ message: "Invalid signature", reason: "hmac_mismatch" });
      }

      // 4) Parse check (req.body should already be parsed by express.json; rawBody is the source of truth for hashing)
      if (!req.body || typeof req.body !== "object") {
        console.warn(`[WA WEBHOOK] reject reason=parse_error`);
        await captureRejection(req, 400, "parse_error");
        return res.status(400).json({ message: "Invalid JSON payload", reason: "parse_error" });
      }

      // 5) Idempotency by payload hash. Echo the existing jobId so a re-delivered
      // webhook receives the same identifier as the original — useful for the
      // idempotency smoke and any caller correlating ids across retries.
      const payloadHash = crypto.createHash("sha256").update(rawBody).digest("hex");
      const existingJobId = await storage.getWhatsappWebhookJobIdByPayloadHash(payloadHash);
      if (existingJobId) {
        const eventType = (req.body as any)?.type || "unknown";
        console.log(`[WA WEBHOOK] accept type=${eventType} duplicate=true jobId=${existingJobId} hash=${payloadHash.slice(0, 12)}`);
        return res.json({ ok: true, duplicate: true, jobId: existingJobId });
      }

      // 6) Enqueue
      const job = await storage.enqueueWhatsappWebhookJob("process_inbound", req.body, payloadHash);
      const eventType = (req.body as any)?.type || "unknown";
      console.log(`[WA WEBHOOK] accept type=${eventType} jobId=${job.id}`);

      // 6a) Optional debug capture (Task #67 Phase 2 task 10a — generalised).
      // Captures the first 5 real payloads of any event_type listed in
      // WHATSAPP_DEBUG_CAPTURE_TYPES (comma-separated). Fire-and-forget;
      // never blocks the accept response.
      const captureCsv = process.env.WHATSAPP_DEBUG_CAPTURE_TYPES;
      if (captureCsv) {
        const wanted = captureCsv.split(",").map(s => s.trim()).filter(Boolean);
        if (wanted.includes(eventType)) {
          storage.captureDebugPayload({
            source: "whatsapp_webhook",
            eventType,
            rawPayload: req.body,
            notes: `jobId=${job.id} hash=${payloadHash.slice(0, 12)}`,
          }).catch(err => console.error("[WA DEBUG CAPTURE] failed:", err?.message || err));
        }
      }

      res.json({ ok: true, jobId: job.id });
    } catch (err: any) {
      console.error(`[WA WEBHOOK] reject reason=enqueue_error:`, err?.message || err);
      await captureRejection(req, 500, "enqueue_error");
      res.status(500).json({ message: "Webhook enqueue error", reason: "enqueue_error" });
    }
  });

  // Webhook GET verification (Interakt may send a GET to verify the endpoint)
  app.get("/api/whatsapp/webhook", (req: any, res) => {
    const token = req.query.token as string;
    if (token === process.env.WHATSAPP_WEBHOOK_TOKEN) {
      return res.send(req.query["hub.challenge"] || "OK");
    }
    res.status(401).send("Forbidden");
  });

  // ── WhatsApp Webhook diagnostics (Task #67 Phase 1) ────────────────────────
  // Admin-only. Returns queue stats and dead-letter rows for the Health card.
  app.get("/api/whatsapp/webhook/stats", authenticateToken, async (req: any, res) => {
    if (req.user?.role !== "admin") return res.status(403).json({ message: "Admin only" });
    try {
      const stats = await storage.getWhatsappWebhookJobStats();
      res.json(stats);
    } catch (err: any) {
      console.error("[WA WEBHOOK STATS] error:", err);
      res.status(500).json({ message: err?.message || "Failed to fetch stats" });
    }
  });

  app.get("/api/whatsapp/webhook/dead-letter", authenticateToken, async (req: any, res) => {
    if (req.user?.role !== "admin") return res.status(403).json({ message: "Admin only" });
    try {
      const rows = await storage.getWhatsappWebhookJobsDeadLetter();
      res.json(rows);
    } catch (err: any) {
      console.error("[WA WEBHOOK DLQ] list error:", err);
      res.status(500).json({ message: err?.message || "Failed to fetch dead-letter queue" });
    }
  });

  app.post("/api/whatsapp/webhook/dead-letter/:id/retry", authenticateToken, async (req: any, res) => {
    if (req.user?.role !== "admin") return res.status(403).json({ message: "Admin only" });
    try {
      // 3-strike manual retry cap.
      const all = await storage.getWhatsappWebhookJobsDeadLetter();
      const row = all.find(r => r.id === req.params.id);
      if (!row) return res.status(404).json({ message: "Dead-letter job not found" });
      if ((row.manualRetryAttempts || 0) >= 3) {
        return res.status(409).json({ message: "Manual retry cap (3) reached for this dead-letter job; discard or fix root cause." });
      }
      const newCount = await storage.incrementWhatsappWebhookDeadLetterManualRetries(req.params.id);
      const job = await storage.retryWhatsappWebhookDeadLetterJob(req.params.id);
      if (!job) return res.status(404).json({ message: "Dead-letter job not found" });
      res.json({ ok: true, jobId: job.id, manualRetryAttempts: newCount });
    } catch (err: any) {
      console.error("[WA WEBHOOK DLQ] retry error:", err);
      res.status(500).json({ message: err?.message || "Retry failed" });
    }
  });

  app.delete("/api/whatsapp/webhook/dead-letter/:id", authenticateToken, async (req: any, res) => {
    if (req.user?.role !== "admin") return res.status(403).json({ message: "Admin only" });
    try {
      const ok = await storage.deleteWhatsappWebhookDeadLetterJob(req.params.id);
      if (!ok) return res.status(404).json({ message: "Dead-letter job not found" });
      res.json({ ok: true });
    } catch (err: any) {
      console.error("[WA WEBHOOK DLQ] delete error:", err);
      res.status(500).json({ message: err?.message || "Delete failed" });
    }
  });

  // Rejected-payload viewer (rolling 20). Phase 3 Health card consumes this.
  app.get("/api/whatsapp/webhook/rejected", authenticateToken, async (req: any, res) => {
    if (req.user?.role !== "admin") return res.status(403).json({ message: "Admin only" });
    try {
      const limit = Math.min(parseInt(req.query.limit as string) || 20, 20);
      const rows = await storage.getWhatsappWebhookRejectedPayloads(limit);
      res.json(rows);
    } catch (err: any) {
      console.error("[WA WEBHOOK REJECTED] list error:", err);
      res.status(500).json({ message: err?.message || "Failed to fetch rejected payloads" });
    }
  });

  // Debug payload captures (Task #67 Phase 2 task 10a — generalised). Admin-only.
  // Returns the rolling N captures for an optional source/eventType filter.
  app.get("/api/whatsapp/debug-captures", authenticateToken, async (req: any, res) => {
    if (req.user?.role !== "admin") return res.status(403).json({ message: "Admin only" });
    try {
      const source = (req.query.source as string) || undefined;
      const eventType = (req.query.eventType as string) || undefined;
      const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
      const rows = await storage.getDebugPayloadCaptures({ source, eventType, limit });
      const captureCsv = process.env.WHATSAPP_DEBUG_CAPTURE_TYPES || "";
      res.json({
        rows,
        captureEnabled: !!captureCsv,
        captureTypes: captureCsv.split(",").map(s => s.trim()).filter(Boolean),
      });
    } catch (err: any) {
      console.error("[WA DEBUG CAPTURE] list error:", err);
      res.status(500).json({ message: err?.message || "Failed to fetch debug captures" });
    }
  });

  // Recent failed outbound messages (Task #67 Phase 4). Admin-only.
  // Powers the "Failed sends (24h)" section of the Webhook Health card.
  app.get("/api/whatsapp/messages/recent-failed", authenticateToken, async (req: any, res) => {
    if (req.user?.role !== "admin") return res.status(403).json({ message: "Admin only" });
    try {
      const lookbackHours = Math.min(parseInt(req.query.hours as string) || 24, 168);
      const limit = Math.min(parseInt(req.query.limit as string) || 20, 50);
      const rows = await storage.getRecentFailedOutboundMessages({ lookbackHours, limit });
      res.json({ rows, lookbackHours });
    } catch (err: any) {
      console.error("[WA FAILED-OUT] list error:", err);
      res.status(500).json({ message: err?.message || "Failed to fetch failed outbound messages" });
    }
  });

  // Webhook config (URL + secret/token configured flags). Admin-only. Phase 3 Health card uses this.
  app.get("/api/whatsapp/webhook/config", authenticateToken, async (req: any, res) => {
    if (req.user?.role !== "admin") return res.status(403).json({ message: "Admin only" });
    const cfg = getWebhookUrl();
    res.json({
      url: cfg.url,
      baseUrlConfigured: cfg.configured,
      tokenConfigured: cfg.tokenConfigured,
      secretConfigured: !!process.env.INTERAKT_WEBHOOK_SECRET,
      env: process.env.NODE_ENV || "development",
    });
  });

  // ── WhatsApp Conversations ─────────────────────────────────────────────────
  const WHATSAPP_ROLES = ["admin", "sales_manager", "field_staff"];
  function requireWhatsappRole(req: any, res: any, next: any) {
    if (!WHATSAPP_ROLES.includes(req.user?.role)) {
      return res.status(403).json({ message: "WhatsApp inbox is restricted to admin, sales_manager, and field_staff" });
    }
    next();
  }

  function requireAdminForConvCreation(req: any, res: any, next: any) {
    if (req.user?.role !== "admin") {
      return res.status(403).json({ message: "Only admins can create new WhatsApp conversations" });
    }
    next();
  }

  app.get("/api/whatsapp/conversations", authenticateToken, requireWhatsappRole, async (req: any, res) => {
    try {
      const conversations = await storage.getWhatsappConversations();
      // Enrich with customer/lead name
      const allCustomers = await storage.getCustomers();
      const allLeads = await storage.getLeads();
      const enriched = conversations.map(c => ({
        ...c,
        customerName: c.customerId ? allCustomers.find(cu => cu.id === c.customerId)?.name : null,
        leadName: c.leadId ? allLeads.find(l => l.id === c.leadId)?.name : null,
      }));
      res.json(enriched);
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch conversations" });
    }
  });

  // Get-or-create open conversation for send flow (accessible to all WhatsApp roles)
  // Used by Sales "Send via WhatsApp" — creates conversation only if no open one exists
  app.post("/api/whatsapp/conversations/get-or-create", authenticateToken, requireWhatsappRole, async (req: any, res) => {
    try {
      const { phone, contactName, customerId } = req.body;
      if (!phone) return res.status(400).json({ message: "phone required" });
      const normPhone = normalisePhone(String(phone));
      const allCustomers = await storage.getCustomers();
      const matchedCustomer = customerId ? allCustomers.find(c => c.id === customerId) : allCustomers.find(c => c.phone && normalisePhone(c.phone) === normPhone);
      let conv = await storage.getWhatsappConversationByPhoneOrCustomer(normPhone, matchedCustomer?.id);
      if (conv) return res.json(conv);
      const allLeads = await storage.getLeads();
      const matchedLead = allLeads.find(l => l.phone && normalisePhone(l.phone) === normPhone);
      conv = await storage.createWhatsappConversation({
        phoneNumber: normPhone,
        contactName: contactName || matchedCustomer?.name || matchedLead?.name || null,
        customerId: matchedCustomer?.id || null,
        leadId: matchedLead?.id || null,
        status: "open",
        windowExpiresAt: null,
      });
      res.status(201).json(conv);
    } catch (err) {
      res.status(500).json({ message: "Failed to get or create conversation" });
    }
  });

  app.post("/api/whatsapp/conversations", authenticateToken, requireAdminForConvCreation, async (req: any, res) => {
    try {
      const { phone, contactName, customerId, leadId } = req.body;
      if (!phone) return res.status(400).json({ message: "phone required" });
      const normPhone = normalisePhone(String(phone));

      const allCustomers = await storage.getCustomers();
      const allLeads = await storage.getLeads();
      const matchedCustomer = customerId ? allCustomers.find(c => c.id === customerId) : allCustomers.find(c => c.phone && normalisePhone(c.phone) === normPhone);

      // Match by (customerId OR phone) to prevent duplicate conversations
      let conv = await storage.getWhatsappConversationByPhoneOrCustomer(normPhone, matchedCustomer?.id);
      if (conv) return res.json(conv);
      const matchedLead = leadId ? allLeads.find(l => l.id === leadId) : allLeads.find(l => l.phone && normalisePhone(l.phone) === normPhone);

      conv = await storage.createWhatsappConversation({
        phoneNumber: normPhone,
        contactName: contactName || matchedCustomer?.name || matchedLead?.name || null,
        customerId: matchedCustomer?.id || null,
        leadId: matchedLead?.id || null,
        status: "open",
        windowExpiresAt: null,
      });
      res.status(201).json(conv);
    } catch (err) {
      res.status(500).json({ message: "Failed to create conversation" });
    }
  });

  app.patch("/api/whatsapp/conversations/:id", authenticateToken, requireWhatsappRole, async (req: any, res) => {
    try {
      const conv = await storage.getWhatsappConversation(req.params.id);
      if (!conv) return res.status(404).json({ message: "Conversation not found" });
      const { status, tag, tags, assignedTo, assignedEmployeeId, contactName, customerId, leadId } = req.body;
      const updates: any = {};
      if (status !== undefined) {
        if (conv.status === "closed" && status === "open") {
          return res.status(409).json({ message: "Closed conversations cannot be reopened" });
        }
        updates.status = status;
        if (status === "closed") updates.windowExpiresAt = null;
      }
      // Support both old (tag) and new (tags) field names; DB stores as single text
      if (tags !== undefined) updates.tags = Array.isArray(tags) ? (tags[0] || null) : (tags || null);
      else if (tag !== undefined) updates.tags = tag || null;
      // Support both old (assignedTo) and new (assignedEmployeeId) field names
      if (assignedEmployeeId !== undefined) updates.assignedEmployeeId = assignedEmployeeId;
      else if (assignedTo !== undefined) updates.assignedEmployeeId = assignedTo;
      if (contactName !== undefined) updates.contactName = contactName;
      if (customerId !== undefined) updates.customerId = customerId;
      if (leadId !== undefined) updates.leadId = leadId;
      if (req.body.unreadCount !== undefined) updates.unreadCount = req.body.unreadCount;
      const updated = await storage.updateWhatsappConversation(conv.id, updates);
      res.json(updated);
    } catch (err) {
      res.status(500).json({ message: "Failed to update conversation" });
    }
  });

  // ── WhatsApp Messages ──────────────────────────────────────────────────────
  app.get("/api/whatsapp/conversations/:id/messages", authenticateToken, requireWhatsappRole, async (req: any, res) => {
    try {
      const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
      const before = req.query.before as string | undefined; // ISO timestamp cursor
      const messages = await storage.getWhatsappMessages(req.params.id, { limit, before });
      res.json({ messages, hasMore: messages.length === limit });
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch messages" });
    }
  });

  app.post("/api/whatsapp/conversations/:id/send", authenticateToken, requireWhatsappRole, async (req: any, res) => {
    try {
      const conv = await storage.getWhatsappConversation(req.params.id);
      if (!conv) return res.status(404).json({ message: "Conversation not found" });
      if (conv.status === "closed") return res.status(409).json({ message: "Cannot send to a closed conversation" });

      if (!checkRateLimit(conv.id)) {
        return res.status(429).json({ message: "Rate limit exceeded (20 messages per minute)" });
      }

      const { type, text, body, messageType: rawMessageType, templateName, templateVariables, templateVariableNames, templateLanguage, documentContext, mediaUrl, filename } = req.body;
      const msgType = type || rawMessageType || "text";
      const msgText = text || body;

      // Resolve any unfilled named template variables from the document/customer context.
      // This lets one-off template sends from order/invoice/quote pages auto-fill
      // fields like order_number, amount, due_date, payment_link, etc.
      let resolvedTemplateVariables: string[] | undefined;
      if (msgType === "template" && Array.isArray(templateVariables)) {
        const names: string[] = Array.isArray(templateVariableNames) ? templateVariableNames : [];
        if (names.length > 0 || documentContext) {
          let convCustomer: any = null;
          let convLead: any = null;
          try {
            if (conv.customerId) convCustomer = await storage.getCustomer(conv.customerId);
            if (conv.leadId) convLead = await storage.getLead(conv.leadId);
          } catch {}
          const ctx = { customer: convCustomer, lead: convLead, document: documentContext || null };
          resolvedTemplateVariables = (templateVariables as string[]).map((val, idx) => {
            const fieldKey = names[idx];
            const manual = (val || "").trim();
            if (manual) return manual;
            if (fieldKey && isCommonMergeField(fieldKey)) {
              const resolved = resolveMergeField(fieldKey, ctx);
              if (resolved) return resolved;
            }
            return val ?? "";
          });
        }
      }

      // Enforce 24h messaging window for non-template messages
      const windowOpen = conv.windowExpiresAt && new Date(conv.windowExpiresAt) > new Date();
      if (msgType !== "template" && !windowOpen) {
        return res.status(409).json({ message: "24-hour messaging window has expired. Send a template message to re-engage." });
      }

      let interaktMessageId: string | null = null;
      let msgBody = msgText || "";
      let sendError: string | null = null;

      try {
        if (msgType === "template" && templateName) {
          interaktMessageId = await sendTemplateMessage(conv.phoneNumber, templateName, resolvedTemplateVariables || templateVariables || [], templateLanguage || "en");
        } else if (msgType === "document" && mediaUrl) {
          interaktMessageId = await sendDocumentMessage(conv.phoneNumber, mediaUrl, filename || "document.pdf");
          msgBody = filename || "Document";
        } else {
          if (!msgText) return res.status(400).json({ message: "body required for text messages" });
          interaktMessageId = await sendTextMessage(conv.phoneNumber, msgText);
        }
      } catch (interaktErr: unknown) {
        sendError = interaktErr instanceof Error ? interaktErr.message : String(interaktErr);
        console.error("[WA] Interakt send failure:", sendError);
        // Persist the message as failed so the conversation has a record
      }

      const msg = await storage.createWhatsappMessage({
        conversationId: conv.id,
        direction: "outbound",
        body: msgBody,
        type: msgType,
        interaktMessageId,
        status: interaktMessageId ? "sent" : "failed",
        mediaUrl: mediaUrl || null,
        sentBy: req.user.id,
      });

      await storage.updateWhatsappConversation(conv.id, { lastMessageAt: new Date() });

      broadcastWhatsappEvent({
        type: "message",
        conversationId: conv.id,
        message: msg,
      });

      if (sendError) {
        // Return 502 so the client knows the upstream send actually failed
        return res.status(502).json({ message: `Interakt send failed: ${sendError}`, msg });
      }
      res.status(201).json(msg);
    } catch (err) {
      res.status(500).json({ message: "Failed to send message" });
    }
  });

  app.post("/api/whatsapp/conversations/:id/note", authenticateToken, requireWhatsappRole, async (req: any, res) => {
    try {
      const { body } = req.body;
      if (!body) return res.status(400).json({ message: "body required" });
      const msg = await storage.createWhatsappMessage({
        conversationId: req.params.id,
        direction: "outbound",
        body,
        type: "note",
        interaktMessageId: null,
        status: "note",
        sentBy: req.user.id,
        isNote: true,
      });
      res.status(201).json(msg);
    } catch (err) {
      res.status(500).json({ message: "Failed to add note" });
    }
  });

  app.post("/api/whatsapp/conversations/:id/create-lead", authenticateToken, requireWhatsappRole, async (req: any, res) => {
    try {
      const conv = await storage.getWhatsappConversation(req.params.id);
      if (!conv) return res.status(404).json({ message: "Conversation not found" });
      if (conv.leadId) return res.status(409).json({ message: "Conversation already linked to a lead" });

      const { name, source = "whatsapp" } = req.body;
      const lead = await storage.createLead({
        name: name || conv.contactName || conv.phoneNumber,
        phone: conv.phoneNumber,
        source,
        status: "new",
        email: null, company: null, address: null, gstNumber: null,
        requirement: null, assignedTo: null, estimatedValue: null, notes: null, lossReason: null, quotationId: null,
      });
      await storage.updateWhatsappConversation(conv.id, {
        leadId: lead.id,
        contactName: conv.contactName || lead.name,
      });
      await logAction(req.user.id, "CREATE", "Lead", `Created lead ${lead.id} from WhatsApp conversation ${conv.id}`);
      res.status(201).json({ lead, conversation: await storage.getWhatsappConversation(conv.id) });
    } catch (err) {
      res.status(500).json({ message: "Failed to create lead" });
    }
  });

  // ── WhatsApp Generate PDF (upload base64 PDF to object storage, return URL) ──
  app.post("/api/whatsapp/generate-pdf", authenticateToken, requireWhatsappRole, async (req: any, res) => {
    try {
      const { entityType, entityId, pdfBase64, filename } = req.body;
      if (!entityType || !entityId) {
        return res.status(400).json({ message: "entityType and entityId required" });
      }
      if (!pdfBase64) {
        // No PDF provided — return metadata only (caller will use client-side jsPDF)
        return res.json({ ok: true, entityType, entityId, url: null });
      }

      // Decode the base64 PDF and store in object storage
      const buf = Buffer.from(pdfBase64, "base64");
      const safeFilename = (filename || `${entityType}-${entityId}-${Date.now()}.pdf`).replace(/[^a-zA-Z0-9._-]/g, "_");
      const objectStorage = new ObjectStorageService();
      const uploadURL = await objectStorage.getObjectEntityUploadURL();
      const objectPath = objectStorage.normalizeObjectEntityPath(uploadURL);

      // Upload the PDF buffer
      await fetch(uploadURL, {
        method: "PUT",
        headers: { "Content-Type": "application/pdf", "Content-Length": String(buf.length) },
        body: buf,
      });

      // Build a download URL using the attachment download route pattern
      const publicUrl = `/api/attachments/download?path=${encodeURIComponent(objectPath)}&filename=${encodeURIComponent(safeFilename)}`;
      res.json({ ok: true, entityType, entityId, url: publicUrl, objectPath });
    } catch (err) {
      console.error("[WA] generate-pdf error:", err);
      res.status(500).json({ message: "Failed to store PDF" });
    }
  });

  // ── WhatsApp Templates ─────────────────────────────────────────────────────
  app.get("/api/whatsapp/templates", authenticateToken, async (req: any, res) => {
    try {
      res.json(await storage.getWhatsappTemplates());
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch templates" });
    }
  });

  app.post("/api/whatsapp/templates", authenticateToken, async (req: any, res) => {
    try {
      if (req.user.role !== "admin") {
        return res.status(403).json({ message: "Only admin may manage WhatsApp templates" });
      }
      const parsed = insertWhatsappTemplateSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
      const tmpl = await storage.createWhatsappTemplate(parsed.data);
      await logAction(req.user.id, "CREATE", "WhatsappTemplate", `Created template ${tmpl.id}: ${tmpl.name}`);
      res.status(201).json(tmpl);
    } catch (err) {
      res.status(500).json({ message: "Failed to create template" });
    }
  });

  app.patch("/api/whatsapp/templates/:id", authenticateToken, async (req: any, res) => {
    try {
      if (req.user.role !== "admin") {
        return res.status(403).json({ message: "Only admin may manage WhatsApp templates" });
      }
      const before = await storage.getWhatsappTemplate(req.params.id);
      const tmpl = await storage.updateWhatsappTemplate(req.params.id, req.body);
      if (!tmpl) return res.status(404).json({ message: "Template not found" });
      if (before && before.isActive !== tmpl.isActive) {
        try {
          await storage.createWhatsappTemplateStatusHistory({
            templateId: tmpl.id,
            previousStatus: before.isActive,
            newStatus: tmpl.isActive,
            source: "manual_edit",
            changedBy: req.user.id,
          });
        } catch (e) {
          console.error("[WA] Failed to record manual status change:", e);
        }
      }
      res.json(tmpl);
    } catch (err) {
      res.status(500).json({ message: "Failed to update template" });
    }
  });

  app.get("/api/whatsapp/templates/:id/history", authenticateToken, async (req: any, res) => {
    try {
      const tmpl = await storage.getWhatsappTemplate(req.params.id);
      if (!tmpl) return res.status(404).json({ message: "Template not found" });
      const history = await storage.getWhatsappTemplateStatusHistory(req.params.id);
      res.json(history);
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch template history" });
    }
  });

  app.get("/api/whatsapp/templates/sync-status", authenticateToken, async (_req: any, res) => {
    try {
      const status = await getTemplateSyncStatus(storage);
      res.json(status);
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch sync status" });
    }
  });

  app.post("/api/whatsapp/templates/sync", authenticateToken, async (req: any, res) => {
    try {
      if (req.user.role !== "admin") {
        return res.status(403).json({ message: "Only admin may sync WhatsApp templates" });
      }
      let triggeredByName: string | null = req.user?.username || null;
      try {
        const dbUser = req.user?.id ? await storage.getUser(req.user.id) : null;
        if (dbUser?.fullName) triggeredByName = dbUser.fullName;
      } catch {
        // fall back to username
      }
      const result = await syncInteraktTemplates(storage, "manual", {
        userId: req.user?.id ?? null,
        name: triggeredByName,
      });
      await logAction(req.user.id, "SYNC", "WhatsappTemplate", `Synced templates from Interakt: ${result.created} created, ${result.updated} updated, ${result.skipped} skipped`);
      res.json({ ok: true, ...result });
    } catch (err: any) {
      res.status(500).json({ message: err?.message || "Failed to sync templates" });
    }
  });

  app.delete("/api/whatsapp/templates/:id", authenticateToken, async (req: any, res) => {
    try {
      if (req.user.role !== "admin") {
        return res.status(403).json({ message: "Only admin may manage WhatsApp templates" });
      }
      const ok = await storage.deleteWhatsappTemplate(req.params.id);
      if (!ok) return res.status(404).json({ message: "Template not found" });
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ message: "Failed to delete template" });
    }
  });

  // ── WhatsApp Campaigns ─────────────────────────────────────────────────────
  app.post("/api/whatsapp/campaigns/preview", authenticateToken, async (req: any, res) => {
    try {
      if (!["admin", "sales_manager"].includes(req.user.role)) {
        return res.status(403).json({ message: "Only admin or sales_manager may preview campaigns" });
      }
      const { templateId, variables = [], variableNames = [], audience, phones = [], limit = 3 } = req.body;
      const previewLimit = Math.min(Math.max(Number(limit) || 3, 1), 10);

      type PreviewTarget = { phone: string; contactName?: string | null; customer?: any; lead?: any };
      let targets: PreviewTarget[] = (phones as string[]).map(p => ({ phone: normalisePhone(p) }));

      if (audience === "customers") {
        const allCustomers = await storage.getCustomers();
        targets = allCustomers
          .filter(c => c.phone)
          .map(c => ({ phone: normalisePhone(c.phone!), contactName: c.name, customer: c }));
      } else if (audience === "leads") {
        const allLeads = await storage.getLeads();
        targets = allLeads
          .filter(l => l.phone)
          .map(l => ({ phone: normalisePhone(l.phone!), contactName: l.name, lead: l }));
      }

      const seen = new Set<string>();
      targets = targets.filter(t => { if (!t.phone || t.phone.length < 10 || seen.has(t.phone)) return false; seen.add(t.phone); return true; });
      const totalRecipients = targets.length;

      let templateBody: string | null = null;
      if (templateId) {
        const tpl = await storage.getWhatsappTemplate(templateId);
        if (tpl) templateBody = tpl.body || null;
      }

      const resolveTargetMissing = (target: PreviewTarget) => {
        const resolvedVars: Array<{ index: number; fieldKey: string | null; label: string | null; value: string; source: "manual" | "auto" | "missing" }> = [];
        const missingFields: Array<{ index: number; fieldKey: string; label: string }> = [];
        (variables as string[]).forEach((val, idx) => {
          const fieldKey = (variableNames as string[])[idx] || null;
          const manualOverride = (val || "").trim();
          if (manualOverride) {
            resolvedVars.push({ index: idx, fieldKey, label: fieldKey, value: manualOverride, source: "manual" });
            return;
          }
          if (fieldKey && isCommonMergeField(fieldKey)) {
            const resolved = resolveMergeField(fieldKey, { customer: target.customer, lead: target.lead });
            if (resolved) {
              resolvedVars.push({ index: idx, fieldKey, label: fieldKey, value: resolved, source: "auto" });
            } else {
              resolvedVars.push({ index: idx, fieldKey, label: fieldKey, value: "", source: "missing" });
              missingFields.push({ index: idx, fieldKey, label: fieldKey });
            }
          } else {
            resolvedVars.push({ index: idx, fieldKey, label: fieldKey, value: val || "", source: manualOverride ? "manual" : "missing" });
            if (!manualOverride) missingFields.push({ index: idx, fieldKey: fieldKey || `{{${idx + 1}}}`, label: fieldKey || `Variable ${idx + 1}` });
          }
        });
        return { resolvedVars, missingFields };
      };

      // Aggregate missing-field counts across the ENTIRE audience
      const missingCountByField = new Map<string, { fieldKey: string; label: string; count: number }>();
      let recipientsMissingAny = 0;
      for (const target of targets) {
        const { missingFields } = resolveTargetMissing(target);
        if (missingFields.length > 0) recipientsMissingAny++;
        const seenForRecipient = new Set<string>();
        for (const m of missingFields) {
          if (seenForRecipient.has(m.fieldKey)) continue;
          seenForRecipient.add(m.fieldKey);
          const label = MERGE_FIELD_BY_KEY[m.fieldKey]?.label || m.label;
          const existing = missingCountByField.get(m.fieldKey);
          if (existing) existing.count++;
          else missingCountByField.set(m.fieldKey, { fieldKey: m.fieldKey, label, count: 1 });
        }
      }
      const missingByField = Array.from(missingCountByField.values()).sort((a, b) => b.count - a.count);

      const sample = targets.slice(0, previewLimit).map(target => {
        const { resolvedVars, missingFields } = resolveTargetMissing(target);
        let renderedBody = templateBody;
        if (renderedBody) {
          renderedBody = renderedBody.replace(/\{\{\s*(\d+)\s*\}\}/g, (_m, n) => {
            const idx = Number(n) - 1;
            const v = resolvedVars[idx];
            if (!v) return `{{${n}}}`;
            return v.value || `[missing: ${v.label || `var ${n}`}]`;
          });
        }
        return {
          phone: target.phone,
          contactName: target.contactName || null,
          renderedBody,
          variables: resolvedVars,
          missingFields,
        };
      });

      const threshold = CAMPAIGN_MISSING_FIELD_BLOCK_THRESHOLD;
      const missingRatio = totalRecipients > 0 ? recipientsMissingAny / totalRecipients : 0;
      const requiresConfirmation = totalRecipients > 0 && missingRatio >= threshold;

      res.json({
        totalRecipients,
        recipientsMissingAny,
        missingByField,
        threshold,
        requiresConfirmation,
        sample,
      });
    } catch (err) {
      console.error("[WA Campaign Preview] error:", err);
      res.status(500).json({ message: "Failed to build campaign preview" });
    }
  });

  app.post("/api/whatsapp/campaigns/send", authenticateToken, async (req: any, res) => {
    try {
      if (!["admin", "sales_manager"].includes(req.user.role)) {
        return res.status(403).json({ message: "Only admin or sales_manager may send campaigns" });
      }
      const { templateId, templateName, variables = [], variableNames = [], audience, phones = [], confirmSendWithMissing = false } = req.body;
      if (!templateName) return res.status(400).json({ message: "templateName required" });

      type CampaignTarget = {
        phone: string;
        contactName?: string | null;
        customerId?: string | null;
        leadId?: string | null;
        customer?: any;
        lead?: any;
      };
      type CampaignResult = { phone: string; customerId: string | null; contactName: string | null; status: "sent" | "failed" | "skipped"; messageId: string | null; error: string | null };

      let targets: CampaignTarget[] = phones.map((p: string) => ({ phone: normalisePhone(p) }));

      if (audience === "customers") {
        const allCustomers = await storage.getCustomers();
        targets = allCustomers
          .filter(c => c.phone)
          .map(c => ({ phone: normalisePhone(c.phone!), contactName: c.name, customerId: c.id, leadId: null, customer: c }));
      } else if (audience === "leads") {
        const allLeads = await storage.getLeads();
        targets = allLeads
          .filter(l => l.phone)
          .map(l => ({ phone: normalisePhone(l.phone!), contactName: l.name, customerId: null, leadId: l.id, lead: l }));
      }

      // Deduplicate by phone
      const seen = new Set<string>();
      targets = targets.filter(t => { if (!t.phone || t.phone.length < 10 || seen.has(t.phone)) return false; seen.add(t.phone); return true; });

      // Guard: block when too many recipients are missing required merge-field values
      const missingCountByField = new Map<string, { fieldKey: string; label: string; count: number }>();
      let recipientsMissingAny = 0;
      for (const target of targets) {
        const missingForRecipient = new Set<string>();
        (variables as string[]).forEach((val, idx) => {
          const fieldKey = (variableNames as string[])[idx] || null;
          const manualOverride = (val || "").trim();
          if (manualOverride) return;
          let isMissing = false;
          let key = fieldKey || `__var_${idx + 1}`;
          let label = fieldKey || `Variable ${idx + 1}`;
          if (fieldKey && isCommonMergeField(fieldKey)) {
            const resolved = resolveMergeField(fieldKey, { customer: target.customer, lead: target.lead });
            if (!resolved) { isMissing = true; label = MERGE_FIELD_BY_KEY[fieldKey]?.label || fieldKey; }
          } else {
            isMissing = true;
          }
          if (isMissing && !missingForRecipient.has(key)) {
            missingForRecipient.add(key);
            const existing = missingCountByField.get(key);
            if (existing) existing.count++;
            else missingCountByField.set(key, { fieldKey: key, label, count: 1 });
          }
        });
        if (missingForRecipient.size > 0) recipientsMissingAny++;
      }
      const missingByField = Array.from(missingCountByField.values()).sort((a, b) => b.count - a.count);
      const threshold = CAMPAIGN_MISSING_FIELD_BLOCK_THRESHOLD;
      const missingRatio = targets.length > 0 ? recipientsMissingAny / targets.length : 0;
      const requiresConfirmation = targets.length > 0 && missingRatio >= threshold;
      if (requiresConfirmation && !confirmSendWithMissing) {
        return res.status(409).json({
          message: "Confirmation required: too many recipients are missing required merge-field values.",
          code: "MISSING_FIELDS_THRESHOLD_EXCEEDED",
          totalRecipients: targets.length,
          recipientsMissingAny,
          missingByField,
          threshold,
          requiresConfirmation,
        });
      }

      const results: CampaignResult[] = [];
      const BATCH = 10;
      for (let i = 0; i < targets.length; i += BATCH) {
        const batch = targets.slice(i, i + BATCH);
        await Promise.all(batch.map(async target => {
          let messageId: string | null = null;
          let error: string | null = null;
          let status: "sent" | "failed" = "failed";
          try {
            const perRecipientVars = (variables as string[]).map((val, idx) => {
              const fieldKey = (variableNames as string[])[idx];
              if (!fieldKey || !isCommonMergeField(fieldKey)) return val;
              const manualOverride = (val || "").trim();
              if (manualOverride) return manualOverride;
              const resolved = resolveMergeField(fieldKey, { customer: target.customer, lead: target.lead });
              return resolved ?? val ?? "";
            });
            messageId = await sendTemplateMessage(target.phone, templateName, perRecipientVars);
            status = messageId ? "sent" : "failed";
            if (!messageId) error = "No message ID returned from Interakt";
          } catch (e: any) {
            error = e?.message || "Send error";
            console.warn(`[WA Campaign] Failed to send to ${target.phone}:`, error);
          }

          results.push({ phone: target.phone, customerId: target.customerId || null, contactName: target.contactName || null, status, messageId, error });

          // Create/find conversation and log message
          try {
            let conv = await storage.getWhatsappConversationByPhone(target.phone);
            if (!conv) {
              conv = await storage.createWhatsappConversation({
                phoneNumber: target.phone,
                contactName: target.contactName || null,
                customerId: target.customerId || null,
                leadId: target.leadId || null,
                status: "open",
                windowExpiresAt: null,
              });
            }
            await storage.createWhatsappMessage({
              conversationId: conv.id,
              direction: "outbound",
              body: `[Campaign] ${templateName}`,
              type: "template",
              interaktMessageId: messageId,
              status,
              sentBy: req.user.id,
            });
            await storage.updateWhatsappConversation(conv.id, { lastMessageAt: new Date() });
          } catch (logErr) {
            console.warn(`[WA Campaign] Failed to log message for ${target.phone}:`, logErr);
          }
        }));
        if (i + BATCH < targets.length) {
          await new Promise(r => setTimeout(r, 100));
        }
      }

      const sentCount = results.filter(r => r.status === "sent").length;
      const failedCount = results.filter(r => r.status === "failed").length;
      await logAction(req.user.id, "SEND", "WhatsappCampaign", `Sent campaign '${templateName}' to ${targets.length} contacts: ${sentCount} sent, ${failedCount} failed`);
      res.json({ sent: sentCount, failed: failedCount, total: targets.length, results });
    } catch (err) {
      res.status(500).json({ message: "Failed to send campaign" });
    }
  });

  // ── Expenses (Task #69) ────────────────────────────────────────────────
  // Default categories are seeded eagerly at server startup (see top of registerRoutes).
  // Operational expense module: explicit allow-list per spec.
  // Field staff and kiosk are excluded entirely.
  const EXPENSE_ALLOWED_ROLES = ["admin", "accountant", "sales_manager", "hr_manager", "warehouse_manager"] as const;
  const denyFieldStaff = (req: any, res: any, next: any) => {
    if (!req.user || !EXPENSE_ALLOWED_ROLES.includes(req.user.role)) {
      return res.status(403).json({ message: "Forbidden" });
    }
    next();
  };

  function diffExpense(before: Expense, after: Partial<Expense>): Record<string, { from: unknown; to: unknown }> {
    const diff: Record<string, { from: unknown; to: unknown }> = {};
    const keys: (keyof Expense)[] = ["expenseDate", "categoryId", "amount", "paymentMethod", "description", "vendorName", "paidByUserId", "linkedEntityType", "linkedEntityId", "notes"];
    for (const k of keys) {
      const next = after[k];
      if (next === undefined) continue;
      const prev = before[k];
      if (String(prev ?? "") !== String(next ?? "")) {
        diff[k as string] = { from: prev, to: next };
      }
    }
    return diff;
  }

  app.get("/api/expense-categories", authenticateToken, denyFieldStaff, async (req: any, res) => {
    try {

      const includeInactive = req.query.includeInactive === "true";
      const cats = await storage.getExpenseCategories(includeInactive);
      res.json(cats);
    } catch (err: any) {
      res.status(500).json({ message: err?.message || "Failed to fetch expense categories" });
    }
  });

  app.post("/api/expense-categories", authenticateToken, requireRole("admin"), async (req: any, res) => {
    try {
      const parsed = insertExpenseCategorySchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Invalid input", errors: parsed.error.flatten() });
      const created = await storage.createExpenseCategory(parsed.data);
      await logAction(req.user.id, "create", "expense_categories", JSON.stringify({ id: created.id, name: created.name }));
      res.status(201).json(created);
    } catch (err: any) {
      res.status(500).json({ message: err?.message || "Failed to create category" });
    }
  });

  app.patch("/api/expense-categories/reorder", authenticateToken, requireRole("admin"), async (req: any, res) => {
    try {
      const { orderedIds } = req.body;
      if (!Array.isArray(orderedIds) || orderedIds.some((x) => typeof x !== "string")) {
        return res.status(400).json({ message: "orderedIds must be an array of category IDs" });
      }
      await storage.reorderExpenseCategories(orderedIds);
      await logAction(req.user.id, "reorder", "expense_categories", JSON.stringify({ orderedIds }));
      const updated = await storage.getExpenseCategories(true);
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ message: err?.message || "Failed to reorder categories" });
    }
  });

  app.patch("/api/expense-categories/:id", authenticateToken, requireRole("admin"), async (req: any, res) => {
    try {
      const before = await storage.getExpenseCategory(req.params.id);
      if (!before) return res.status(404).json({ message: "Category not found" });
      const parsed = insertExpenseCategorySchema.partial().safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Invalid input", errors: parsed.error.flatten() });
      const updated = await storage.updateExpenseCategory(req.params.id, parsed.data);
      const diff: Record<string, { from: any; to: any }> = {};
      for (const k of Object.keys(parsed.data) as Array<keyof typeof parsed.data>) {
        if (String((before as any)[k] ?? "") !== String((parsed.data as any)[k] ?? "")) {
          diff[k as string] = { from: (before as any)[k], to: (parsed.data as any)[k] };
        }
      }
      await logAction(req.user.id, "update", "expense_categories", JSON.stringify({ id: req.params.id, diff }));
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ message: err?.message || "Failed to update category" });
    }
  });

  app.patch("/api/expense-categories/:id/deactivate", authenticateToken, requireRole("admin"), async (req: any, res) => {
    try {
      const before = await storage.getExpenseCategory(req.params.id);
      if (!before) return res.status(404).json({ message: "Category not found" });
      const usage = await storage.countExpensesByCategory(req.params.id);
      const updated = await storage.deactivateExpenseCategory(req.params.id);
      await logAction(req.user.id, "deactivate", "expense_categories", JSON.stringify({ id: req.params.id, name: before.name, usageCount: usage }));
      res.json({ ...updated, usageCount: usage });
    } catch (err: any) {
      res.status(500).json({ message: err?.message || "Failed to deactivate category" });
    }
  });

  function parseExpenseFilters(req: any): ExpenseFilters {
    const q = req.query;
    const f: ExpenseFilters = {};
    if (q.scope === "today") {
      const today = todayIST();
      f.from = today; f.to = today;
    } else {
      if (q.from) f.from = String(q.from);
      if (q.to) f.to = String(q.to);
    }
    if (q.categoryId) f.categoryIds = Array.isArray(q.categoryId) ? q.categoryId.map(String) : String(q.categoryId).split(",").filter(Boolean);
    if (q.paidBy) f.paidByUserIds = Array.isArray(q.paidBy) ? q.paidBy.map(String) : String(q.paidBy).split(",").filter(Boolean);
    if (q.paymentMethod) f.paymentMethods = Array.isArray(q.paymentMethod) ? q.paymentMethod.map(String) : String(q.paymentMethod).split(",").filter(Boolean);
    if (q.search) f.search = String(q.search);
    if (q.linkedEntityType) f.linkedEntityType = String(q.linkedEntityType);
    if (q.linkedEntityId) f.linkedEntityId = String(q.linkedEntityId);
    // Non-admin/non-accountant users see only their own expenses (paid_by OR created_by)
    if (!["admin", "accountant"].includes(req.user.role)) {
      f.scopeUserId = req.user.id;
    }
    return f;
  }

  app.get("/api/expenses", authenticateToken, denyFieldStaff, async (req: any, res) => {
    try {

      const rows = await storage.getExpenses(parseExpenseFilters(req));
      res.json(rows);
    } catch (err: any) {
      res.status(500).json({ message: err?.message || "Failed to fetch expenses" });
    }
  });

  app.get("/api/expenses/summary", authenticateToken, denyFieldStaff, async (req: any, res) => {
    try {

      const summary = await storage.getExpensesSummary(parseExpenseFilters(req));
      res.json(summary);
    } catch (err: any) {
      res.status(500).json({ message: err?.message || "Failed to fetch summary" });
    }
  });

  app.get("/api/expenses/analytics", authenticateToken, denyFieldStaff, async (req: any, res) => {
    try {

      const a = await storage.getExpensesAnalytics(parseExpenseFilters(req));
      res.json(a);
    } catch (err: any) {
      res.status(500).json({ message: err?.message || "Failed to fetch analytics" });
    }
  });

  app.get("/api/expenses/:id", authenticateToken, denyFieldStaff, async (req: any, res) => {
    try {
      const exp = await storage.getExpense(req.params.id);
      if (!exp) return res.status(404).json({ message: "Expense not found" });
      const privileged = ["admin", "accountant"].includes(req.user.role);
      if (!privileged && exp.paidByUserId !== req.user.id && exp.createdByUserId !== req.user.id) {
        return res.status(403).json({ message: "Access denied" });
      }
      res.json(exp);
    } catch (err: any) {
      res.status(500).json({ message: err?.message || "Failed to fetch expense" });
    }
  });

  app.post("/api/expenses", authenticateToken, denyFieldStaff, async (req: any, res) => {
    try {

      const parsed = insertExpenseSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Invalid input", errors: parsed.error.flatten() });
      const cat = await storage.getExpenseCategory(parsed.data.categoryId);
      if (!cat || !cat.isActive) return res.status(400).json({ message: "Invalid or inactive category" });
      // Default paid-by to current user when omitted
      const paidByUserId = parsed.data.paidByUserId || req.user.id;
      // Non-privileged users can only set paidBy = themselves
      const privileged = ["admin", "accountant"].includes(req.user.role);
      if (!privileged && paidByUserId !== req.user.id) {
        return res.status(403).json({ message: "You can only record expenses paid by yourself" });
      }
      const created = await storage.createExpense({ ...parsed.data, paidByUserId, createdByUserId: req.user.id });
      await logAction(req.user.id, "create", "expenses", JSON.stringify({ id: created.id, category: cat.name, amount: created.amount, paidBy: paidByUserId, date: created.expenseDate }));
      res.status(201).json(created);
    } catch (err: any) {
      res.status(500).json({ message: err?.message || "Failed to create expense" });
    }
  });

  app.patch("/api/expenses/:id", authenticateToken, denyFieldStaff, async (req: any, res) => {
    try {
      const exp = await storage.getExpense(req.params.id);
      if (!exp) return res.status(404).json({ message: "Expense not found" });
      const privileged = ["admin", "accountant"].includes(req.user.role);
      if (!privileged) {
        const isOwn = exp.paidByUserId === req.user.id || exp.createdByUserId === req.user.id;
        if (!isOwn) return res.status(403).json({ message: "You can only edit your own expenses" });
        const ageMs = Date.now() - new Date(exp.createdAt).getTime();
        if (ageMs > 24 * 60 * 60 * 1000) return res.status(403).json({ message: "Edit window has expired (24h)" });
      }
      const parsed = insertExpenseSchema.partial().safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Invalid input", errors: parsed.error.flatten() });
      // Non-privileged users may not change paidBy to someone else
      if (!privileged && parsed.data.paidByUserId && parsed.data.paidByUserId !== req.user.id) {
        return res.status(403).json({ message: "Cannot reassign paid-by to another user" });
      }
      const diff = diffExpense(exp, parsed.data as Partial<Expense>);
      const updated = await storage.updateExpense(req.params.id, parsed.data);
      await logAction(req.user.id, "update", "expenses", JSON.stringify({ id: req.params.id, diff }));
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ message: err?.message || "Failed to update expense" });
    }
  });

  app.delete("/api/expenses/:id", authenticateToken, requireRole("admin"), async (req: any, res) => {
    try {
      const exp = await storage.getExpense(req.params.id);
      if (!exp) return res.status(404).json({ message: "Expense not found" });
      await storage.deleteExpense(req.params.id);
      await logAction(req.user.id, "delete", "expenses", JSON.stringify({ id: req.params.id, amount: exp.amount, date: exp.expenseDate, category: exp.categoryId }));
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ message: err?.message || "Failed to delete expense" });
    }
  });

  // ── Cash Accounts (Phase 4B) ────────────────────────────────────────────────

  app.get("/api/cash-accounts", authenticateToken, async (req: any, res) => {
    try {
      const includeInactive = req.query.includeInactive === "true";
      const accounts = await storage.getCashAccounts(includeInactive);
      if (req.user.role !== "admin") {
        return res.json(accounts.map(a => ({
          id: a.id,
          name: a.name,
          type: a.type,
          isActive: a.isActive,
        })));
      }
      const withBalances = await Promise.all(accounts.map(async (a) => ({
        ...a,
        balance: await storage.computeAccountBalance(a.id),
      })));
      res.json(withBalances);
    } catch (err: any) {
      res.status(500).json({ message: err?.message || "Failed to fetch accounts" });
    }
  });

  // Phase 4B: footnote source for Cash Position page — total of legacy payments not yet attributed to an account
  app.get("/api/cash-accounts/unattributed-summary", authenticateToken, requireRole("admin"), async (_req, res) => {
    try {
      const result = await db.execute(sql`
        SELECT COUNT(*)::int AS count, COALESCE(SUM(amount::numeric), 0) AS total
        FROM payments WHERE cash_account_id IS NULL AND status = 'completed'
      `);
      const row = result.rows[0] as any;
      res.json({ count: Number(row?.count ?? 0), totalAmount: Number(row?.total ?? 0) });
    } catch (err: any) {
      res.status(500).json({ message: err?.message || "Failed to compute unattributed summary" });
    }
  });

  app.get("/api/cash-accounts/:id", authenticateToken, requireRole("admin", "accountant"), async (req, res) => {
    try {
      const account = await storage.getCashAccount(req.params.id);
      if (!account) return res.status(404).json({ message: "Account not found" });
      const balance = await storage.computeAccountBalance(account.id);
      res.json({ ...account, balance });
    } catch (err: any) {
      res.status(500).json({ message: err?.message || "Failed to fetch account" });
    }
  });

  app.post("/api/cash-accounts", authenticateToken, requireRole("admin"), async (req: any, res) => {
    try {
      const account = await storage.createCashAccount(req.body);
      await logAction(req.user.id, "create", "cash_accounts", JSON.stringify({ id: account.id, name: account.name, type: account.type }));
      res.status(201).json(account);
    } catch (err: any) {
      res.status(500).json({ message: err?.message || "Failed to create account" });
    }
  });

  app.patch("/api/cash-accounts/:id", authenticateToken, requireRole("admin"), async (req: any, res) => {
    try {
      const account = await storage.updateCashAccount(req.params.id, req.body);
      if (!account) return res.status(404).json({ message: "Account not found" });
      await logAction(req.user.id, "update", "cash_accounts", JSON.stringify({ id: account.id, changes: req.body }));
      res.json(account);
    } catch (err: any) {
      res.status(500).json({ message: err?.message || "Failed to update account" });
    }
  });

  app.patch("/api/cash-accounts/:id/deactivate", authenticateToken, requireRole("admin"), async (req: any, res) => {
    try {
      const account = await storage.deactivateCashAccount(req.params.id);
      if (!account) return res.status(404).json({ message: "Account not found" });
      await logAction(req.user.id, "deactivate", "cash_accounts", JSON.stringify({ id: account.id, name: account.name }));
      res.json(account);
    } catch (err: any) {
      res.status(500).json({ message: err?.message || "Failed to deactivate account" });
    }
  });

  app.patch("/api/cash-accounts/:id/reactivate", authenticateToken, requireRole("admin"), async (req: any, res) => {
    try {
      const account = await storage.reactivateCashAccount(req.params.id);
      if (!account) return res.status(404).json({ message: "Account not found" });
      await logAction(req.user.id, "reactivate", "cash_accounts", JSON.stringify({ id: account.id, name: account.name }));
      res.json(account);
    } catch (err: any) {
      res.status(500).json({ message: err?.message || "Failed to reactivate account" });
    }
  });

  app.get("/api/cash-accounts/:id/balance", authenticateToken, requireRole("admin", "accountant"), async (req, res) => {
    try {
      const { asOfDate } = req.query as { asOfDate?: string };
      const balance = await storage.computeAccountBalance(req.params.id, asOfDate);
      res.json({ balance });
    } catch (err: any) {
      res.status(500).json({ message: err?.message || "Failed to compute balance" });
    }
  });

  app.get("/api/cash-accounts/:id/stats", authenticateToken, requireRole("admin", "accountant"), async (req, res) => {
    try {
      const { fromDate, toDate } = req.query as { fromDate: string; toDate: string };
      if (!fromDate || !toDate) return res.status(400).json({ message: "fromDate and toDate required" });
      const stats = await storage.getAccountStats(req.params.id, fromDate, toDate);
      res.json(stats);
    } catch (err: any) {
      res.status(500).json({ message: err?.message || "Failed to compute stats" });
    }
  });

  app.get("/api/cash-accounts/:id/transactions", authenticateToken, requireRole("admin", "accountant"), async (req, res) => {
    try {
      const { fromDate, toDate, limit, offset } = req.query as Record<string, string>;
      const result = await storage.getAccountTransactions(
        req.params.id,
        fromDate,
        toDate,
        limit ? Number(limit) : 50,
        offset ? Number(offset) : 0
      );
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ message: err?.message || "Failed to fetch transactions" });
    }
  });

  app.get("/api/cash-accounts/:id/tx-count", authenticateToken, requireRole("admin", "accountant"), async (req, res) => {
    try {
      const result = await storage.getAccountTransactions(req.params.id, undefined, undefined, 1, 0);
      res.json({ count: result.total });
    } catch (err: any) {
      res.status(500).json({ message: err?.message || "Failed to count transactions" });
    }
  });

  // Account Transfers
  app.get("/api/account-transfers", authenticateToken, requireRole("admin"), async (req, res) => {
    try {
      const { accountId } = req.query as { accountId?: string };
      const transfers = await storage.getAccountTransfers(accountId);
      res.json(transfers);
    } catch (err: any) {
      res.status(500).json({ message: err?.message || "Failed to fetch transfers" });
    }
  });

  app.post("/api/account-transfers", authenticateToken, requireRole("admin"), async (req: any, res) => {
    try {
      const { fromAccountId, toAccountId, amount, reference } = req.body;
      if (fromAccountId === toAccountId) {
        return res.status(400).json({ message: "Cannot transfer to the same account" });
      }
      if (Number(amount) <= 0) {
        return res.status(400).json({ message: "Amount must be positive" });
      }
      const [fromAcct, toAcct] = await Promise.all([
        storage.getCashAccount(fromAccountId),
        storage.getCashAccount(toAccountId),
      ]);
      if (!fromAcct || !toAcct) {
        return res.status(404).json({ message: "Source or destination account not found" });
      }
      const transfer = await storage.createAccountTransfer({ ...req.body, createdBy: req.user.id });
      const fromName = fromAcct.name;
      const toName = toAcct.name;
      const amountStr = `₹${Number(amount).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      const refClause = reference && String(reference).trim() ? ` Reference: ${String(reference).trim()}` : "";
      const description = `Transfer of ${amountStr} from ${fromName} to ${toName}.${refClause}`;
      await logAction(req.user.id, "transfer_recorded", "account_transfers", JSON.stringify({
        id: transfer.id,
        fromAccountId,
        fromAccountName: fromName,
        toAccountId,
        toAccountName: toName,
        amount: Number(amount),
        reference: reference ?? null,
        description,
      }));
      res.status(201).json(transfer);
    } catch (err: any) {
      res.status(500).json({ message: err?.message || "Failed to create transfer" });
    }
  });

  app.delete("/api/account-transfers/:id", authenticateToken, requireRole("admin"), async (req: any, res) => {
    try {
      await storage.deleteAccountTransfer(req.params.id);
      await logAction(req.user.id, "delete", "account_transfers", JSON.stringify({ id: req.params.id }));
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ message: err?.message || "Failed to delete transfer" });
    }
  });

  // Balance Adjustments
  app.get("/api/balance-adjustments", authenticateToken, requireRole("admin"), async (req, res) => {
    try {
      const { accountId } = req.query as { accountId?: string };
      const adjustments = await storage.getBalanceAdjustments(accountId);
      res.json(adjustments);
    } catch (err: any) {
      res.status(500).json({ message: err?.message || "Failed to fetch adjustments" });
    }
  });

  app.post("/api/balance-adjustments", authenticateToken, requireRole("admin", "accountant"), async (req: any, res) => {
    try {
      const { cashAccountId, adjustmentType, adjustmentAmount, adjustmentDate, reason } = req.body;
      const rawAmt = Number(adjustmentAmount);
      if (!Number.isFinite(rawAmt) || rawAmt <= 0) {
        return res.status(400).json({ message: "Adjustment amount must be a positive number" });
      }
      if (!cashAccountId || !adjustmentDate || !reason || !String(reason).trim()) {
        return res.status(400).json({ message: "cashAccountId, adjustmentDate, and reason are required" });
      }
      if (String(reason).trim().length < 10) {
        return res.status(400).json({ message: "Reason must be at least 10 characters" });
      }
      const account = await storage.getCashAccount(cashAccountId);
      if (!account) {
        return res.status(404).json({ message: "Cash account not found" });
      }
      // Sign translation: 'debit' => negative, anything else (incl. default 'credit') => positive.
      const type: "credit" | "debit" = adjustmentType === "debit" ? "debit" : "credit";
      const signedAmount = (type === "debit" ? -1 : 1) * Math.abs(rawAmt);

      const adjustment = await storage.createBalanceAdjustment({
        cashAccountId,
        adjustmentAmount: signedAmount.toFixed(2),
        adjustmentDate,
        reason: String(reason).trim(),
        adjustedBy: req.user.id,
      });

      const verb = type === "debit" ? "decrease" : "increase";
      const amtStr = `₹${Math.abs(rawAmt).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      const description = `Balance ${verb} of ${amtStr} on ${account.name}. Reason: ${String(reason).trim()}`;
      await logAction(req.user.id, "adjustment_recorded", "balance_adjustments", JSON.stringify({
        id: adjustment.id,
        cashAccountId,
        accountName: account.name,
        type,
        amount: Math.abs(rawAmt),
        signedAmount,
        reason: String(reason).trim(),
        adjustmentDate,
        description,
      }));
      res.status(201).json(adjustment);
    } catch (err: any) {
      res.status(500).json({ message: err?.message || "Failed to create adjustment" });
    }
  });

  return httpServer;
}
