import { useState, useCallback, useEffect, Fragment } from "react";
import { HierarchicalProductPicker } from "@/components/HierarchicalProductPicker";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useLocation } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient, ApiError } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { ToastAction } from "@/components/ui/toast";
import { useCurrentUser } from "@/lib/auth";
import { Plus, Search, ShoppingCart, FileText, Users as UsersIcon, Pencil, Trash2, X, XCircle, ArrowRightLeft, ChevronDown, ChevronRight, Package, Wrench, CreditCard, Receipt, Download, Phone, Mail, MapPin, MessageCircle, StickyNote, Check, CalendarDays, Truck, Eye, Bell, AlertTriangle, BarChart3, Sun, ShieldCheck, Boxes, ExternalLink, CheckCircle2, Upload, Info as InfoIcon } from "lucide-react";
import { generateQuotationPDF } from "@/lib/quotation-pdf";
import logoPath from "@assets/ITFI-LOGO-FIN_1777273207283.png";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

/** Phase 7 — Bundle / Kit Engine.
 *  A single component row inside a bundle, as returned by GET /api/products/:id/bundle-items. */
type BundleItemRow = { componentProductId: string; quantity: number | string; unit: string };
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import type { SalesOrder, SalesOrderItem, Customer, Quotation, QuotationItem, Product, QuotationActivity, QuotationFollowup, Warehouse, Supplier, DeliveryChallan, CashAccount } from "@shared/schema";
import { Banknote, Landmark } from "lucide-react";
import { resolveMergeField, isCommonMergeField, mergeFieldSourceLabel, type MergeFieldDocumentContext } from "@shared/mergeFields";

/** Phase 5 constants */
const SOLAR_PANEL_CATEGORY = "Solar Panel / PV Module";
const SUBSIDY_SCHEMES = ["none", "PM Surya Ghar", "MNRE Rooftop", "KUSUM", "Other"] as const;

/** Phase 3: customer-type label + badge — uses existing Badge variants (no new colors invented). */
const customerTypeLabel = (t?: string | null) => (t === "business" ? "Business" : "End User");
function CustomerTypeBadge({ type }: { type?: string | null }) {
  const t = type === "business" ? "business" : "end_user";
  // Business -> default (primary, prominent); End User -> secondary (neutral). Existing variants only.
  const variant = t === "business" ? "default" : "secondary";
  return (
    <Badge variant={variant} className="text-xs no-default-active-elevate ml-2 shrink-0" data-testid={`badge-customer-type-${t}`}>
      {customerTypeLabel(t)}
    </Badge>
  );
}

interface LineItem {
  itemType: string;
  productId: string;
  description: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  gstRate: number;
  hsnCode: string;
  taxAmount: number;
  customComponents?: Array<{ componentProductId: string; quantity: number; unit: string }> | null;
}

const ORDER_STATUSES = [
  "pending", "awaiting_payment", "confirmed", "procurement",
  "ready_to_ship", "partial", "dispatched", "shipped", "delivered",
  "installed", "completed", "cancelled"
];

const INVOICE_ELIGIBLE_STATUSES = ["dispatched", "delivered", "installed", "completed"];

const FULFILLMENT_STEPS = ["pending", "confirmed", "procurement", "ready_to_ship", "dispatched", "delivered", "completed"];
const FULFILLMENT_STEP_LABELS: Record<string, string> = {
  pending: "Pending",
  confirmed: "Confirmed",
  procurement: "Procurement",
  ready_to_ship: "Ready to Ship",
  dispatched: "Dispatched",
  delivered: "Delivered",
  completed: "Completed",
};

function FulfillmentProgressBar({ status, deliveryMethod }: { status: string; deliveryMethod?: string }) {
  const steps = status === "procurement" || FULFILLMENT_STEPS.indexOf(status) >= FULFILLMENT_STEPS.indexOf("procurement")
    ? FULFILLMENT_STEPS
    : FULFILLMENT_STEPS.filter(s => s !== "procurement");

  const currentIdx = steps.indexOf(status);
  const progressSteps = ["cancelled", "awaiting_payment", "shipped", "installed"].includes(status) ? [] : steps;
  if (progressSteps.length === 0) return null;

  return (
    <div className="flex items-center gap-1 flex-wrap" data-testid="fulfillment-progress">
      {progressSteps.map((step, idx) => {
        const done = idx < currentIdx;
        const active = idx === currentIdx;
        return (
          <div key={step} className="flex items-center gap-1">
            <div className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium transition-colors ${
              done ? "bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-400" :
              active ? "bg-blue-100 text-blue-700 dark:bg-blue-950/30 dark:text-blue-400 ring-1 ring-blue-400 dark:ring-blue-600" :
              "bg-muted text-muted-foreground"
            }`}>
              {done && <Check className="w-2.5 h-2.5" />}
              {FULFILLMENT_STEP_LABELS[step] || step}
            </div>
            {idx < progressSteps.length - 1 && (
              <ChevronRight className={`w-3 h-3 ${done ? "text-green-500" : "text-muted-foreground/40"}`} />
            )}
          </div>
        );
      })}
      {deliveryMethod && (
        <span className="ml-2 text-[10px] text-muted-foreground border rounded-full px-1.5 py-0.5">
          {deliveryMethod === "pickup" ? "Pickup" : "Delivery"}
        </span>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const variants: Record<string, string> = {
    pending: "bg-yellow-100 text-yellow-800 dark:bg-yellow-950/40 dark:text-yellow-400",
    awaiting_payment: "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-400",
    confirmed: "bg-blue-100 text-blue-800 dark:bg-blue-950/40 dark:text-blue-400",
    procurement: "bg-purple-100 text-purple-800 dark:bg-purple-950/40 dark:text-purple-400",
    ready_to_ship: "bg-cyan-100 text-cyan-800 dark:bg-cyan-950/40 dark:text-cyan-400",
    partial: "bg-orange-100 text-orange-800 dark:bg-orange-950/40 dark:text-orange-400",
    ready: "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-400",
    do_issued: "bg-purple-100 text-purple-800 dark:bg-purple-950/40 dark:text-purple-400",
    dispatched: "bg-blue-100 text-blue-800 dark:bg-blue-950/40 dark:text-blue-400",
    shipped: "bg-indigo-100 text-indigo-800 dark:bg-indigo-950/40 dark:text-indigo-400",
    delivered: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-400",
    installed: "bg-teal-100 text-teal-800 dark:bg-teal-950/40 dark:text-teal-400",
    completed: "bg-green-100 text-green-800 dark:bg-green-950/40 dark:text-green-400",
    cancelled: "bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-400",
    draft: "bg-gray-100 text-gray-800 dark:bg-gray-950/40 dark:text-gray-400",
    sent: "bg-blue-100 text-blue-800 dark:bg-blue-950/40 dark:text-blue-400",
    accepted: "bg-green-100 text-green-800 dark:bg-green-950/40 dark:text-green-400",
    rejected: "bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-400",
  };
  const label = status.split("_").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium ${variants[status] || variants.pending}`} data-testid={`badge-status-${status}`}>
      {label}
    </span>
  );
}

function emptyLineItem(): LineItem {
  return { itemType: "product", productId: "", description: "", quantity: 1, unitPrice: 0, totalPrice: 0, gstRate: 0, hsnCode: "", taxAmount: 0, customComponents: null };
}

interface DiscountState {
  discountType: string;
  discountValue: number;
}

function calculateDiscount(subtotal: number, discount: DiscountState): number {
  if (discount.discountType === "percentage") {
    return subtotal * (discount.discountValue / 100);
  } else if (discount.discountType === "fixed") {
    return Math.min(discount.discountValue, subtotal);
  }
  return 0;
}

// Phase 6.5 E2 — Returns indices of touched lines whose product is a non-ALMM Solar Panel under an active subsidy scheme.
// These lines hard-block save until the operator either picks an ALMM panel or sets the subsidy scheme to "none".
function findAlmmHardBlockIndices(
  items: LineItem[],
  products: Product[] | undefined,
  subsidyScheme: string | undefined,
  touched: Set<number>,
): number[] {
  if (!subsidyScheme || subsidyScheme === "none" || !products?.length) return [];
  const blocked: number[] = [];
  items.forEach((it, idx) => {
    if (!touched.has(idx)) return;
    if (it.itemType !== "product" || !it.productId) return;
    const prod = products.find(p => p.id === it.productId) as any;
    if (!prod) return;
    if (prod.category !== SOLAR_PANEL_CATEGORY) return;
    if (!prod.almm) blocked.push(idx);
  });
  return blocked;
}

// Phase 5.5 — Returns details of touched lines whose unit price is below the strict floor price.
// source="none" lines are exempt (no floor known). Only applies to touched lines (C3).
function findBelowFloorBlockIndices(
  items: LineItem[],
  effectivePrices: Record<string, EffectivePriceEntryRaw> | undefined,
  touched: Set<number>,
): Array<{ idx: number; productName: string; unitPrice: number; floorPrice: number }> {
  if (!effectivePrices) return [];
  const blocked: Array<{ idx: number; productName: string; unitPrice: number; floorPrice: number }> = [];
  items.forEach((it, idx) => {
    if (!touched.has(idx)) return;
    if (!it.productId) return;
    const ep = effectivePrices[it.productId];
    if (!ep || ep.noConfirmedPrice) return; // C4: no floor known
    const sFloor = ep.strictFloorPrice ? Number(ep.strictFloorPrice) : null;
    if (sFloor === null || sFloor === 0) return;
    if (it.unitPrice < sFloor) {
      blocked.push({ idx, productName: it.description || "Line " + (idx + 1), unitPrice: it.unitPrice, floorPrice: sFloor });
    }
  });
  return blocked;
}

type EffectivePriceEntryRaw = {
  effectivePrice: string;
  sheetDate: string | null;
  noConfirmedPrice: boolean;
  source?: "today" | "fallback" | "none";
  hasConfirmedToday: boolean;
  blendedCost: string | null;
  globalFloorPrice: string | null;
  strictFloorPrice: string | null;
};
type EffectivePriceEntry = EffectivePriceEntryRaw;

function MarginSimPanel({ item, ep }: { item: LineItem; ep: EffectivePriceEntry }) {
  const price = item.unitPrice;
  const blended = ep.blendedCost ? Number(ep.blendedCost) : null;
  const gFloor = ep.globalFloorPrice ? Number(ep.globalFloorPrice) : null;
  const sFloor = ep.strictFloorPrice ? Number(ep.strictFloorPrice) : null;
  const margin = blended && price > 0 ? ((price - blended) / price * 100) : null;
  const belowGlobal = gFloor !== null && price < gFloor;
  const belowStrict = sFloor !== null && price < sFloor;
  const checks = [
    { label: "vs Blended Cost", val: blended, ok: blended === null || price >= blended, warn: belowGlobal },
    { label: "vs Global Floor (+5%)", val: gFloor, ok: !belowGlobal, warn: belowGlobal && !belowStrict },
    { label: "vs Strict Floor (highest lot)", val: sFloor, ok: !belowStrict, warn: false },
  ];
  return (
    <div className="mt-2 bg-muted/40 border border-dashed rounded-md p-2.5 text-xs space-y-1.5" data-testid="panel-margin-sim">
      <div className="flex items-center justify-between">
        <span className="font-semibold text-muted-foreground">Margin Simulation</span>
        {margin !== null && (
          <span className={`font-bold px-1.5 py-0.5 rounded ${margin < 5 ? "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400" : margin < 15 ? "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400" : "bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-400"}`}>
            {margin.toFixed(1)}% margin
          </span>
        )}
      </div>
      {ep.noConfirmedPrice && (
        <div className="flex items-center gap-1 text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 px-1.5 py-0.5 rounded text-[10px]">
          <AlertTriangle className="w-3 h-3 shrink-0" />
          No confirmed price sheet — using product list price
        </div>
      )}
      {!ep.noConfirmedPrice && !ep.hasConfirmedToday && (
        <div className="flex items-center gap-1 text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 px-1.5 py-0.5 rounded text-[10px]">
          <AlertTriangle className="w-3 h-3 shrink-0" />
          No confirmed price sheet for today — using last confirmed ({ep.sheetDate})
        </div>
      )}
      <div className="grid grid-cols-3 gap-1.5">
        {checks.map(({ label, val, ok, warn }) => val !== null && (
          <div key={label} className={`rounded px-1.5 py-1 ${!ok ? "bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800" : warn ? "bg-amber-50 dark:bg-amber-950/30" : "bg-muted/30"}`}>
            <div className="text-[10px] text-muted-foreground">{label}</div>
            <div className={`font-semibold ${!ok ? "text-red-600 dark:text-red-400" : warn ? "text-amber-600 dark:text-amber-400" : "text-green-700 dark:text-green-400"}`}>
              ₹{val.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
              <span className="ml-1">{!ok ? "✗ Below" : "✓ OK"}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Phase 5.5 — Floor price reference panel shown below the Unit Price field.
// Three cases: "today" (green), "fallback" (amber), "none" (grey/muted).
function FloorPriceRefPanel({ item, ep, touched }: { item: LineItem; ep: EffectivePriceEntry; touched: boolean }) {
  const src: "today" | "fallback" | "none" = ep.noConfirmedPrice ? "none" : ep.hasConfirmedToday ? "today" : "fallback";
  const effectivePrice = Number(ep.effectivePrice);
  const sFloor = ep.strictFloorPrice ? Number(ep.strictFloorPrice) : null;
  const price = item.unitPrice;

  const maxDiscount = sFloor !== null && effectivePrice > sFloor ? effectivePrice - sFloor : null;
  const maxDiscountPct = maxDiscount !== null && effectivePrice > 0 ? (maxDiscount / effectivePrice * 100) : null;
  const isBelowFloor = touched && sFloor !== null && sFloor > 0 && price < sFloor;
  const isAboveEffective = effectivePrice > 0 && price > effectivePrice;
  const shortBy = isBelowFloor && sFloor !== null ? sFloor - price : 0;

  if (src === "none") {
    return (
      <div className="mt-1 text-[10px] text-muted-foreground bg-muted/30 rounded px-1.5 py-1" data-testid="floor-panel-none">
        Catalog price: ₹{effectivePrice.toLocaleString("en-IN")} <span className="italic">(not yet reviewed today)</span>
      </div>
    );
  }

  const containerCls = src === "today"
    ? "bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800"
    : "bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800";
  const labelCls = src === "today" ? "text-green-700 dark:text-green-400" : "text-amber-700 dark:text-amber-400";

  return (
    <div className={`mt-1 rounded border px-1.5 py-1 text-[10px] space-y-0.5 ${containerCls}`} data-testid="floor-panel-ref">
      <div className={`flex items-center gap-2 flex-wrap font-medium ${labelCls}`}>
        <span>
          {src === "today" ? "Today's Price:" : `Last approved (${ep.sheetDate}):`}{" "}
          ₹{effectivePrice.toLocaleString("en-IN")}
        </span>
        {sFloor !== null && sFloor > 0 && (
          <span className="text-muted-foreground font-normal">Floor: ₹{sFloor.toLocaleString("en-IN")}</span>
        )}
      </div>
      {sFloor !== null && sFloor > 0 && (
        <div>
          {isBelowFloor ? (
            <span className="text-red-600 dark:text-red-400 font-semibold">
              Below floor — short by ₹{Math.round(shortBy).toLocaleString("en-IN")}
            </span>
          ) : isAboveEffective ? (
            <span className="text-muted-foreground">No discount needed</span>
          ) : maxDiscount !== null && maxDiscountPct !== null ? (
            <span className={labelCls}>
              Max discount: ₹{Math.round(maxDiscount).toLocaleString("en-IN")} or {maxDiscountPct.toFixed(1)}%
            </span>
          ) : null}
        </div>
      )}
    </div>
  );
}

function LineItemsEditor({ items, onChange, products, discount, onDiscountChange, effectivePrices, subsidyScheme, customer, touchedLineIndices, onLineTouched, bundleComponentsMap, loadBundleComponents, inventoryByProduct, deliveryCost, allowBundleCustomization = false }: {
  items: LineItem[];
  onChange: (items: LineItem[]) => void;
  products: Product[];
  discount?: DiscountState;
  onDiscountChange?: (d: DiscountState) => void;
  effectivePrices?: Record<string, EffectivePriceEntry>;
  /** Phase 5 — subsidy scheme for warning logic (orders only) */
  subsidyScheme?: string;
  /** Phase 5 — selected customer for MRP warning */
  customer?: Customer;
  /** Phase 5 — indices of lines the user has touched/edited after Phase 5 deploy */
  touchedLineIndices: Set<number>;
  /** Phase 5 — called when a line is edited/added (for warning gating) */
  onLineTouched: (idx: number) => void;
  /** Phase 7 — bundle component cache + loader + per-product physical stock totals */
  bundleComponentsMap: Record<string, BundleItemRow[]>;
  loadBundleComponents: (bundleId: string) => Promise<BundleItemRow[]>;
  inventoryByProduct: Map<string, number>;
  /** Delivery / logistics cost to include in Grand Total display */
  deliveryCost?: number;
  /** Phase 98 — enable per-line bundle component customization (quotations only; deferred for orders) */
  allowBundleCustomization?: boolean;
}) {
  const [marginDialogIdx, setMarginDialogIdx] = useState<number | null>(null);
  // Phase 7 — discontinued-component confirm dialog (when a bundle has a non-active component)
  const [discontinuedDialog, setDiscontinuedDialog] = useState<{
    lineIndex: number;
    bundleName: string;
    issues: Array<{ name: string; status: string }>;
  } | null>(null);
  // Collapsed rows: indices that have been confirmed and show as compact summary
  const [collapsedItems, setCollapsedItems] = useState<Set<number>>(new Set());
  // Bundle component edit mode state
  const [bundleEditMode, setBundleEditMode] = useState<Set<number>>(new Set());
  const [bundleAddSearch, setBundleAddSearch] = useState<Record<number, string>>({});
  const [bundleAddQty, setBundleAddQty] = useState<Record<number, number>>({});
  const [bundleAddUnit, setBundleAddUnit] = useState<Record<number, string>>({});
  const [bundleAddPopover, setBundleAddPopover] = useState<Record<number, boolean>>({});
  const [bundleAddPending, setBundleAddPending] = useState<Record<number, { productId: string; name: string } | null>>({});
  const { toast: lineToast } = useToast();

  /** Badge label + CSS class for component lifecycle status inside bundle panels. */
  const lifecycleLabel = (ls: string | undefined): { text: string; badgeCls: string } => {
    switch (ls) {
      case "draft":        return { text: "DRAFT",        badgeCls: "border-slate-400 text-slate-600 dark:text-slate-300" };
      case "discontinued": return { text: "DISCONTINUED", badgeCls: "border-red-400 text-red-700 dark:text-red-300" };
      case "replaced":     return { text: "REPLACED",     badgeCls: "border-amber-400 text-amber-700 dark:text-amber-300" };
      default:             return { text: "",             badgeCls: "" };
    }
  };

  const updateItem = (index: number, field: string, value: any) => {
    onLineTouched(index);
    const updated = [...items];
    const item = { ...updated[index], [field]: value };

    if (field === "productId" && value) {
      const prod = products.find(p => p.id === value);
      // Phase 6.5 F1+F2: hard-block non-active products at selection time.
      if (prod) {
        const ls = (prod as any).lifecycleStatus as string | undefined;
        if (ls && ls !== "active") {
          const replId: string | null = (prod as any).replacedByProductId || null;
          const replacement = replId ? products.find(p => p.id === replId) : null;
          const labelMap: Record<string, string> = { draft: "draft", discontinued: "discontinued", replaced: "replaced" };
          const label = labelMap[ls] || ls;
          lineToast({
            title: `Cannot add ${label} product`,
            description: ls === "replaced" && replacement
              ? `${prod.name} has been replaced by ${replacement.name}. Use the replacement instead.`
              : `${prod.name} is marked ${label} and cannot be sold. Pick an active product.`,
            variant: "destructive",
            action: ls === "replaced" && replacement
              ? (
                <ToastAction
                  altText="Switch to replacement"
                  onClick={() => updateItem(index, "productId", replacement.id)}
                  data-testid={`button-switch-replacement-${index}`}
                >
                  Switch to {replacement.name}
                </ToastAction>
              )
              : undefined,
          });
          return; // do not apply the selection
        }
      }
      if (prod) {
        const ep = effectivePrices?.[prod.id];
        // Phase 5: if customer has a known type and product has a matching tier price, use it.
        // Otherwise fall back to effective price sheet / list price.
        const tp = (prod as any)?.customerTierPrice as Record<string, number> | null | undefined;
        const ctype = customer?.customerType;
        const tierPrice = (tp && ctype && tp[ctype] != null) ? Number(tp[ctype]) : null;
        const priceToUse = tierPrice != null
          ? tierPrice
          : ep && !ep.noConfirmedPrice
            ? Number(ep.effectivePrice)
            : Number(prod.unitPrice);
        item.unitPrice = priceToUse;
        item.description = prod.name;
        // Phase 7: keep the actual product type (so itemType='bundle' for bundles).
        item.itemType = prod.type;
        item.gstRate = Number(prod.gstRate || 0);
        item.hsnCode = prod.hsnCode || "";
        const lineTotal = item.quantity * priceToUse;
        item.totalPrice = lineTotal;
        item.taxAmount = lineTotal * item.gstRate / 100;

        // Phase 7: bundle selected → load components, then surface a confirm dialog if any
        // component is non-active. Stock-shortage badges render inline in the row panel below.
        // Defer via rAF so the Select's focus-trap is fully released before triggering state updates.
        if (prod.type === "bundle") {
          requestAnimationFrame(() => {
            loadBundleComponents(prod.id).then((comps) => {
              const issues = comps
                .map((row) => {
                  const comp = products.find(p => p.id === row.componentProductId);
                  const ls = (comp as any)?.lifecycleStatus as string | undefined;
                  if (comp && ls && ls !== "active") return { name: comp.name, status: ls };
                  return null;
                })
                .filter(Boolean) as Array<{ name: string; status: string }>;
              if (issues.length > 0) {
                setDiscontinuedDialog({ lineIndex: index, bundleName: prod.name, issues });
              }
            });
          });
        }
      }
    }
    if (field === "quantity" || field === "unitPrice") {
      const qty = field === "quantity" ? Number(value) : item.quantity;
      const price = field === "unitPrice" ? Number(value) : item.unitPrice;
      item.totalPrice = qty * price;
      item.taxAmount = item.totalPrice * item.gstRate / 100;
    }
    if (field === "gstRate") {
      item.gstRate = Number(value);
      item.taxAmount = item.totalPrice * Number(value) / 100;
    }
    if (field === "itemType") {
      item.productId = "";
      item.description = "";
      item.unitPrice = 0;
      item.totalPrice = 0;
      item.gstRate = 0;
      item.hsnCode = "";
      item.taxAmount = 0;
      item.customComponents = null;
    }
    // Reset custom components when the bundle selection changes (prevents stale components leaking to a different bundle)
    if (field === "productId") {
      item.customComponents = null;
    }
    updated[index] = item;
    onChange(updated);
    // Auto-collapse the row once a valid product is confirmed — but keep bundle rows expanded so the components panel stays visible
    if (field === "productId" && value) {
      const selectedProd = products.find(p => p.id === value);
      if (selectedProd?.type !== "bundle") {
        setCollapsedItems(prev => { const next = new Set(prev); next.add(index); return next; });
      }
    }
  };

  const addItem = () => {
    onLineTouched(items.length);
    onChange([...items, emptyLineItem()]);
    // New items always start expanded
  };
  const removeItem = (index: number) => {
    // Reindex all per-line-index state: remove the deleted index, decrement all above it
    const reindexSet = (prev: Set<number>) => {
      const next = new Set<number>();
      prev.forEach(n => { if (n < index) next.add(n); else if (n > index) next.add(n - 1); });
      return next;
    };
    const reindexRecord = <T,>(prev: Record<number, T>) => {
      const next: Record<number, T> = {};
      Object.entries(prev).forEach(([k, v]) => {
        const n = Number(k);
        if (n < index) next[n] = v;
        else if (n > index) next[n - 1] = v;
      });
      return next;
    };
    setCollapsedItems(reindexSet);
    setBundleEditMode(reindexSet);
    setBundleAddSearch(reindexRecord);
    setBundleAddQty(reindexRecord);
    setBundleAddUnit(reindexRecord);
    setBundleAddPopover(reindexRecord);
    setBundleAddPending(reindexRecord);
    onChange(items.filter((_, i) => i !== index));
  };

  const subtotal = items.reduce((sum, it) => sum + (it.totalPrice || 0), 0);
  const totalTax = items.reduce((sum, it) => sum + (it.taxAmount || 0), 0);
  const discountAmount = discount ? calculateDiscount(subtotal, discount) : 0;
  const netTotal = subtotal - discountAmount + totalTax + (deliveryCost || 0);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-semibold">Line Items</Label>
        <Button type="button" variant="outline" size="sm" onClick={addItem} data-testid="button-add-line-item">
          <Plus className="w-3 h-3 mr-1" /> Add Item
        </Button>
      </div>
      {items.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-4">No items added. Click "Add Item" to start.</p>
      )}
      {items.map((item, i) => {
        const prod = item.productId ? products.find(p => p.id === item.productId) : null;
        if (collapsedItems.has(i)) {
          return (
            <div key={i} className="border rounded-lg px-3 py-2 bg-muted/30 flex items-center gap-2" data-testid={`line-item-${i}`}>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="text-sm font-medium truncate">{item.description || prod?.name || "Item"}</span>
                  {prod?.type === "bundle" && (
                    <Badge variant="outline" className="text-[10px] px-1 py-0 shrink-0">[Bundle]</Badge>
                  )}
                </div>
                <div className="text-xs text-muted-foreground flex items-center gap-2 mt-0.5 flex-wrap">
                  <span>{item.quantity} × ₹{item.unitPrice.toLocaleString("en-IN")}</span>
                  <span>·</span>
                  <span>GST {item.gstRate}%</span>
                  <span>·</span>
                  <span className="font-medium text-foreground">₹{(item.totalPrice + item.taxAmount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="shrink-0 h-7 w-7"
                onClick={() => setCollapsedItems(prev => { const next = new Set(prev); next.delete(i); return next; })}
                data-testid={`button-expand-item-${i}`}
              >
                <Pencil className="w-3.5 h-3.5" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="shrink-0 h-7 w-7"
                onClick={() => removeItem(i)}
                data-testid={`button-remove-item-${i}`}
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
          );
        }
        return (
        <div key={i} className="border rounded-lg p-3 space-y-2 bg-muted/30" data-testid={`line-item-${i}`}>
          <div className="flex items-start gap-2">
            <div className="flex-1">
              <HierarchicalProductPicker
                lineIndex={i}
                products={products}
                effectivePrices={effectivePrices}
                currentProductId={item.productId}
                onProductSelect={(pid) => updateItem(i, "productId", pid)}
              />
            </div>
            <Button type="button" variant="ghost" size="icon" className="shrink-0 mt-6" onClick={() => removeItem(i)} data-testid={`button-remove-item-${i}`}>
              <X className="w-4 h-4" />
            </Button>
          </div>
          {/* Phase 5 — ALMM / DCR status chips (Solar Panel lines only, always visible) */}
          {(() => {
            if (item.itemType !== "product" || !item.productId) return null;
            const prod = products.find(p => p.id === item.productId);
            if (!prod || (prod as any).category !== SOLAR_PANEL_CATEGORY) return null;
            const almmOk = !!(prod as any).almm;
            const dcrOk = !!(prod as any).dcrCompliant;
            return (
              <div className="flex items-center gap-2 flex-wrap" data-testid={`chips-almm-dcr-${i}`}>
                <Badge
                  variant="outline"
                  className={`text-xs px-2 py-0.5 inline-flex items-center gap-1 ${almmOk ? "border-emerald-500 text-emerald-700 dark:text-emerald-400" : "border-amber-500 text-amber-700 dark:text-amber-400"}`}
                  data-testid={`badge-almm-line-${i}`}
                >
                  <Sun className="w-3 h-3" />
                  ALMM {almmOk ? "✓" : "✗"}
                </Badge>
                <Badge
                  variant="outline"
                  className={`text-xs px-2 py-0.5 inline-flex items-center gap-1 ${dcrOk ? "border-emerald-500 text-emerald-700 dark:text-emerald-400" : "border-amber-500 text-amber-700 dark:text-amber-400"}`}
                  data-testid={`badge-dcr-line-${i}`}
                >
                  <ShieldCheck className="w-3 h-3" />
                  DCR {dcrOk ? "✓" : "✗"}
                </Badge>
              </div>
            );
          })()}
          {/* Phase 7/98 — Bundle components panel (editable per-quotation) */}
          {(() => {
            if (!item.productId) return null;
            const prod = products.find(p => p.id === item.productId);
            if (!prod || prod.type !== "bundle") return null;
            const masterComps = bundleComponentsMap[prod.id];
            // A custom override exists when customComponents is a non-null array (including empty = "all removed")
            const hasCustom = Array.isArray(item.customComponents);
            const effectiveComps: BundleItemRow[] = hasCustom
              ? (item.customComponents as Array<{ componentProductId: string; quantity: number; unit: string }>)
              : (masterComps ?? []);
            const isEditing = bundleEditMode.has(i);

            const enterEdit = () => {
              if (!allowBundleCustomization) return;
              if (!hasCustom) {
                const seed = (masterComps ?? []).map(c => ({
                  componentProductId: c.componentProductId,
                  quantity: Number(c.quantity) || 1,
                  unit: c.unit || "pcs",
                }));
                updateItem(i, "customComponents", seed);
              }
              setBundleEditMode(prev => { const n = new Set(prev); n.add(i); return n; });
            };
            const exitEdit = () => setBundleEditMode(prev => { const n = new Set(prev); n.delete(i); return n; });

            if (!masterComps && !hasCustom) {
              return (
                <div className="text-[11px] text-muted-foreground italic px-2" data-testid={`bundle-loading-${i}`}>
                  Loading bundle components…
                </div>
              );
            }

            if (!isEditing) {
              if (effectiveComps.length === 0) {
                return (
                  <div className="rounded border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/30 px-2 py-1.5 text-[11px] text-amber-800 dark:text-amber-300 flex items-center justify-between" data-testid={`bundle-empty-${i}`}>
                    <span>This bundle has no components configured.</span>
                    {allowBundleCustomization && (
                      <Button type="button" variant="ghost" size="sm" className="h-6 px-2 text-[10px]" onClick={enterEdit} data-testid={`button-customize-bundle-${i}`}>
                        <Pencil className="w-3 h-3 mr-1" /> Customize
                      </Button>
                    )}
                  </div>
                );
              }
              return (
                <div className="rounded border border-blue-200 dark:border-blue-900 bg-blue-50/40 dark:bg-blue-950/20 p-2 space-y-1" data-testid={`bundle-components-${i}`}>
                  <div className="flex items-center justify-between gap-1">
                    <div className="flex items-center gap-1 text-[11px] font-medium text-blue-700 dark:text-blue-300">
                      <Boxes className="w-3 h-3" /> Bundle components × {item.quantity || 1}
                      {hasCustom && <Badge variant="outline" className="text-[9px] px-1 py-0 border-blue-400 text-blue-600 dark:text-blue-400">Custom</Badge>}
                    </div>
                    {allowBundleCustomization && (
                      <Button type="button" variant="ghost" size="sm" className="h-6 px-2 text-[10px] text-blue-600 dark:text-blue-400" onClick={enterEdit} data-testid={`button-customize-bundle-${i}`}>
                        <Pencil className="w-3 h-3 mr-1" /> Customize
                      </Button>
                    )}
                  </div>
                  {effectiveComps.map((row) => {
                    const comp = products.find(p => p.id === row.componentProductId);
                    const compLs = (comp as any)?.lifecycleStatus as string | undefined;
                    const lc = lifecycleLabel(compLs);
                    const perUnit = Number(row.quantity) || 0;
                    const totalNeeded = perUnit * (Number(item.quantity) || 0);
                    const onHand = comp ? (inventoryByProduct.get(comp.id) ?? 0) : 0;
                    const short = comp ? totalNeeded > onHand : false;
                    return (
                      <div key={row.componentProductId} className="flex items-center gap-2 text-[11px] pl-3" data-testid={`bundle-comp-${i}-${row.componentProductId}`}>
                        <span className="text-muted-foreground">↳</span>
                        <span className="flex-1 truncate">{comp?.name ?? row.componentProductId}</span>
                        {lc.text && (
                          <Badge variant="outline" className={`text-[9px] px-1 py-0 leading-tight ${lc.badgeCls}`}>{lc.text}</Badge>
                        )}
                        <span className="text-muted-foreground">{totalNeeded} {row.unit}</span>
                        {comp && (short ? (
                          <Badge variant="outline" className="text-[9px] px-1 py-0 border-red-500 text-red-700 dark:text-red-400" data-testid={`bundle-comp-short-${i}-${comp.id}`}>Short ({onHand} on hand)</Badge>
                        ) : (
                          <Badge variant="outline" className="text-[9px] px-1 py-0 border-emerald-500 text-emerald-700 dark:text-emerald-400">OK ({onHand})</Badge>
                        ))}
                      </div>
                    );
                  })}
                  <div className="text-[10px] text-muted-foreground pl-3 italic">Invoiced as one line at the bundle GST rate.</div>
                </div>
              );
            }

            // ── Edit mode ──
            // editComps: use custom override if it exists (including empty = "all removed"), else seed from master
            const editComps: Array<{ componentProductId: string; quantity: number; unit: string }> =
              hasCustom
                ? (item.customComponents as Array<{ componentProductId: string; quantity: number; unit: string }>)
                : (masterComps ?? []).map(c => ({ componentProductId: c.componentProductId, quantity: Number(c.quantity) || 1, unit: c.unit || "pcs" }));

            const updateComp = (ci: number, field: "quantity" | "unit", value: any) => {
              const next = editComps.map((c, idx) => idx === ci ? { ...c, [field]: value } : c);
              updateItem(i, "customComponents", next);
            };
            const removeComp = (ci: number) => {
              const next = editComps.filter((_, idx) => idx !== ci);
              updateItem(i, "customComponents", next);
            };

            const addableProducts = products.filter(p => p.type !== "bundle" && p.type !== "service");
            const addSearch = bundleAddSearch[i] || "";
            const addSearchLc = addSearch.trim().toLowerCase();
            const filteredAddable = addSearchLc
              ? addableProducts.filter(p => p.name.toLowerCase().includes(addSearchLc) || (p.sku ?? "").toLowerCase().includes(addSearchLc))
              : addableProducts.slice(0, 30);

            return (
              <div className="rounded border border-blue-300 dark:border-blue-700 bg-blue-50/60 dark:bg-blue-950/30 p-2 space-y-1.5" data-testid={`bundle-edit-${i}`}>
                <div className="flex items-center justify-between gap-1">
                  <div className="flex items-center gap-1 text-[11px] font-medium text-blue-700 dark:text-blue-300">
                    <Boxes className="w-3 h-3" /> Customize components for this quote
                  </div>
                  <Button type="button" variant="ghost" size="sm" className="h-6 px-2 text-[10px] text-emerald-600 dark:text-emerald-400" onClick={exitEdit} data-testid={`button-done-bundle-edit-${i}`}>
                    Done
                  </Button>
                </div>
                {editComps.map((comp, ci) => {
                  const compProd = products.find(p => p.id === comp.componentProductId);
                  return (
                    <div key={ci} className="flex items-center gap-1.5 pl-2" data-testid={`bundle-edit-comp-${i}-${ci}`}>
                      <span className="flex-1 truncate text-[11px]">{compProd?.name ?? comp.componentProductId}</span>
                      <Input type="number" min="0.01" step="0.01" value={comp.quantity} onChange={e => updateComp(ci, "quantity", parseFloat(e.target.value) || 1)} className="h-6 w-16 text-xs px-1" data-testid={`input-bundle-comp-qty-${i}-${ci}`} />
                      <Input value={comp.unit} onChange={e => updateComp(ci, "unit", e.target.value)} className="h-6 w-14 text-xs px-1" placeholder="unit" data-testid={`input-bundle-comp-unit-${i}-${ci}`} />
                      <Button type="button" variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-red-600" onClick={() => removeComp(ci)} data-testid={`button-remove-bundle-comp-${i}-${ci}`}>
                        <X className="w-3 h-3" />
                      </Button>
                    </div>
                  );
                })}
                {/* Add component row: pick product → set qty/unit → click + to confirm */}
                <div className="space-y-1.5 pl-2 pt-1 border-t border-blue-200 dark:border-blue-800">
                  <div className="flex items-center gap-1.5">
                    <Popover open={!!bundleAddPopover[i]} onOpenChange={o => setBundleAddPopover(prev => ({ ...prev, [i]: o }))}>
                      <PopoverTrigger asChild>
                        <Button type="button" variant="outline" size="sm" className="flex-1 h-7 text-xs justify-start font-normal px-2" data-testid={`button-add-comp-picker-${i}`}>
                          {bundleAddPending[i]
                            ? <span className="truncate">{bundleAddPending[i]!.name}</span>
                            : <><Plus className="w-3 h-3 mr-1 opacity-50" /><span className="text-muted-foreground">Pick product…</span></>}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="p-0 w-64" align="start" onOpenAutoFocus={e => e.preventDefault()}>
                        <div className="p-2 border-b">
                          <Input value={addSearch} onChange={e => setBundleAddSearch(prev => ({ ...prev, [i]: e.target.value }))} placeholder="Search products…" className="h-7 text-xs" data-testid={`input-add-comp-search-${i}`} autoFocus />
                        </div>
                        <div className="max-h-48 overflow-y-auto">
                          {filteredAddable.length === 0 ? (
                            <div className="px-3 py-2 text-xs text-muted-foreground text-center">No products found</div>
                          ) : filteredAddable.map(p => (
                            <button key={p.id} type="button" className={`w-full text-left px-3 py-1.5 text-xs hover:bg-accent hover:text-accent-foreground cursor-pointer ${bundleAddPending[i]?.productId === p.id ? "bg-accent" : ""}`} data-testid={`option-add-comp-${p.id}`}
                              onClick={() => {
                                setBundleAddPending(prev => ({ ...prev, [i]: { productId: p.id, name: p.name } }));
                                setBundleAddSearch(prev => ({ ...prev, [i]: "" }));
                                setBundleAddPopover(prev => ({ ...prev, [i]: false }));
                              }}>
                              {p.name}{p.sku && <span className="text-muted-foreground ml-1 opacity-60 text-[10px]">{p.sku}</span>}
                            </button>
                          ))}
                        </div>
                      </PopoverContent>
                    </Popover>
                    <Input type="number" min="0.01" step="0.01" value={bundleAddQty[i] ?? 1} onChange={e => setBundleAddQty(prev => ({ ...prev, [i]: parseFloat(e.target.value) || 1 }))} className="h-7 w-16 text-xs px-1" placeholder="qty" data-testid={`input-add-comp-qty-${i}`} />
                    <Input value={bundleAddUnit[i] ?? "pcs"} onChange={e => setBundleAddUnit(prev => ({ ...prev, [i]: e.target.value }))} className="h-7 w-14 text-xs px-1" placeholder="unit" data-testid={`input-add-comp-unit-${i}`} />
                    <Button
                      type="button"
                      size="icon"
                      className="h-7 w-7 shrink-0 bg-blue-600 hover:bg-blue-700 text-white"
                      disabled={!bundleAddPending[i]}
                      data-testid={`button-confirm-add-comp-${i}`}
                      onClick={() => {
                        const pending = bundleAddPending[i];
                        if (!pending) return;
                        const qty = bundleAddQty[i] || 1;
                        const unit = bundleAddUnit[i] || "pcs";
                        const next = [...editComps, { componentProductId: pending.productId, quantity: qty, unit }];
                        updateItem(i, "customComponents", next);
                        setBundleAddPending(prev => ({ ...prev, [i]: null }));
                        setBundleAddQty(prev => ({ ...prev, [i]: 1 }));
                        setBundleAddUnit(prev => ({ ...prev, [i]: "pcs" }));
                      }}
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                  {!bundleAddPending[i] && (
                    <p className="text-[10px] text-muted-foreground pl-0.5">Pick a product, set qty/unit, then click + to add</p>
                  )}
                </div>
                <div className="text-[10px] text-muted-foreground pl-2 italic">Invoiced as one line at the bundle GST rate.</div>
              </div>
            );
          })()}
          <div>
            <Label className="text-xs text-muted-foreground">Description</Label>
            <Input className="h-8 text-xs" value={item.description} onChange={(e) => updateItem(i, "description", e.target.value)} placeholder="Item description" data-testid={`input-item-desc-${i}`} />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <Label className="text-xs text-muted-foreground">Qty</Label>
              <Input className="h-8 text-xs" type="number" min="1" value={item.quantity} onChange={(e) => updateItem(i, "quantity", parseInt(e.target.value) || 0)} data-testid={`input-item-qty-${i}`} />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Unit Price (₹)</Label>
              {/* Phase 5.5 — red border when below floor price (touched lines only) */}
              {(() => {
                const ep = item.productId ? effectivePrices?.[item.productId] : undefined;
                const sFloor = ep && !ep.noConfirmedPrice && ep.strictFloorPrice ? Number(ep.strictFloorPrice) : null;
                const isBelowFloor = touchedLineIndices.has(i) && sFloor !== null && sFloor > 0 && item.unitPrice < sFloor;
                return (
                  <Input
                    className={`h-8 text-xs${isBelowFloor ? " border-red-500 focus-visible:ring-red-500" : ""}`}
                    type="number" min="0" step="0.01"
                    value={item.unitPrice}
                    onChange={(e) => updateItem(i, "unitPrice", parseFloat(e.target.value) || 0)}
                    data-testid={`input-item-price-${i}`}
                  />
                );
              })()}
              {/* Phase 5.5 — Floor price reference panel */}
              {(() => {
                const ep = item.productId ? effectivePrices?.[item.productId] : undefined;
                if (!ep) return null;
                return <FloorPriceRefPanel item={item} ep={ep} touched={touchedLineIndices.has(i)} />;
              })()}
              {/* Phase 5 — Tier price reference panel (always visible when product has tier pricing) */}
              {(() => {
                if (!item.productId) return null;
                const prod = products.find(p => p.id === item.productId);
                const tp = (prod as any)?.customerTierPrice as Record<string, number> | null | undefined;
                if (!tp || typeof tp !== "object") return null;
                const euPrice = tp.end_user != null ? Number(tp.end_user) : null;
                const bPrice = tp.business != null ? Number(tp.business) : null;
                if (euPrice == null && bPrice == null) return null;
                const activeTier = customer?.customerType === "end_user" ? "end_user"
                  : customer?.customerType === "business" ? "business"
                  : null;
                const tierEntry = (key: "end_user" | "business", price: number | null) => {
                  if (price == null) return null;
                  const isActive = activeTier === key;
                  const label = key === "end_user" ? "End User" : "Business";
                  return (
                    <span
                      key={key}
                      className={isActive
                        ? "font-semibold text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/30 px-1 py-0.5 rounded"
                        : "text-muted-foreground opacity-60"
                      }
                      data-testid={`tier-price-${key}-${i}`}
                    >
                      {label}: ₹{price.toLocaleString("en-IN")}
                      {isActive && <span className="ml-0.5 text-[9px]">← active</span>}
                    </span>
                  );
                };
                return (
                  <div className="mt-1 flex items-center gap-1.5 text-[10px]" data-testid={`panel-tier-price-${i}`}>
                    <span className="text-muted-foreground shrink-0">Tier Ref:</span>
                    {tierEntry("end_user", euPrice)}
                    {euPrice != null && bPrice != null && <span className="text-muted-foreground">|</span>}
                    {tierEntry("business", bPrice)}
                  </div>
                );
              })()}
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">GST %</Label>
              <Select value={String(item.gstRate)} onValueChange={(v) => updateItem(i, "gstRate", v)}>
                <SelectTrigger className="h-8 text-xs" data-testid={`select-item-gst-${i}`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {["0", "5", "12", "18", "28"].map((r) => (
                    <SelectItem key={r} value={r}>{r}%</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          {/* Phase 5 — Subsidy + MRP warnings (gated: only touched lines) */}
          {touchedLineIndices.has(i) && (() => {
            if (item.itemType !== "product" || !item.productId) return null;
            const prod = products.find(p => p.id === item.productId);
            if (!prod) return null;
            const isPanel = (prod as any).category === SOLAR_PANEL_CATEGORY;
            const scheme = subsidyScheme || "none";
            const hasSubsidy = scheme !== "none";
            const isPmSuryaGhar = scheme === "PM Surya Ghar";

            // Phase 6.5 E2: ALMM violation on a subsidy-active panel is now a HARD BLOCK at save (red, not amber).
            const isAlmmHardBlock = isPanel && hasSubsidy && !(prod as any).almm;
            const showDcrWarn = isPanel && isPmSuryaGhar && !(prod as any).dcrCompliant;

            const mrp = (prod as any).mrp != null ? Number((prod as any).mrp) : null;
            const ctype = customer?.customerType;
            // Phase 6.5 E1: MRP soft-warn now fires for ALL customer types (was end_user only).
            const showMrpWarn = mrp != null && item.unitPrice > mrp;
            // Show MRP-info row for business/distributor customers when not exceeding (so the operator sees the reference).
            const showMrpInfo = mrp != null && !showMrpWarn && (ctype === "business" || ctype === "distributor");

            if (!isAlmmHardBlock && !showDcrWarn && !showMrpWarn && !showMrpInfo) return null;
            return (
              <div className="space-y-1.5" data-testid={`warnings-${i}`}>
                {isAlmmHardBlock && (
                  <div className="flex items-start gap-1.5 text-[11px] bg-red-50 dark:bg-red-950/30 border border-red-300 dark:border-red-800 rounded px-2 py-1.5 text-red-800 dark:text-red-300" data-testid={`block-almm-${i}`}>
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    <span><strong>Cannot save:</strong> Panel is not ALMM-listed but subsidy scheme is active. Either pick an ALMM panel or set the subsidy scheme to "None".</span>
                  </div>
                )}
                {showDcrWarn && (
                  <div className="flex items-start gap-1.5 text-[11px] bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded px-2 py-1.5 text-red-800 dark:text-red-300" data-testid={`warn-dcr-${i}`}>
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    <span>PM Surya Ghar subsidy requires DCR-compliant panels. This panel is not flagged as DCR-compliant.</span>
                  </div>
                )}
                {showMrpWarn && (
                  <div className="flex items-start gap-1.5 text-[11px] bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded px-2 py-1.5 text-amber-800 dark:text-amber-300" data-testid={`warn-mrp-${i}`}>
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    <span>Unit price ₹{item.unitPrice.toLocaleString("en-IN")} exceeds MRP ₹{mrp!.toLocaleString("en-IN")}.</span>
                  </div>
                )}
                {showMrpInfo && (
                  <div className="text-[10px] text-muted-foreground" data-testid={`info-mrp-${i}`}>
                    MRP is ₹{mrp!.toLocaleString("en-IN")}.
                  </div>
                )}
              </div>
            );
          })()}

          <div className="grid grid-cols-3 gap-2 text-xs text-muted-foreground">
            <div className="bg-muted/40 rounded px-2 py-1">
              <span className="block text-[10px] mb-0.5">Item Amount</span>
              <span className="font-medium text-foreground" data-testid={`text-item-amount-${i}`}>₹{item.totalPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </div>
            <div className="bg-blue-50 dark:bg-blue-950/30 rounded px-2 py-1">
              <span className="block text-[10px] mb-0.5">+ GST ({item.gstRate}%)</span>
              <span className="font-medium text-blue-600 dark:text-blue-400" data-testid={`text-item-tax-${i}`}>₹{item.taxAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </div>
            <div className="bg-green-50 dark:bg-green-950/30 rounded px-2 py-1">
              <span className="block text-[10px] mb-0.5">= Item Total (incl. GST)</span>
              <span className="font-semibold text-green-700 dark:text-green-400" data-testid={`input-item-total-${i}`}>₹{(item.totalPrice + item.taxAmount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </div>
          </div>
          {/* Check Margin button — hidden (task #82); code preserved for future use */}
          {false && (() => {
            const ep = item.productId ? effectivePrices?.[item.productId] : undefined;
            if (!ep) return null;
            return (
              <button
                type="button"
                className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                onClick={() => setMarginDialogIdx(i)}
                data-testid={`button-check-margin-${i}`}
              >
                <BarChart3 className="w-3 h-3" />
                Check Margin
                {ep.noConfirmedPrice && <AlertTriangle className="w-3 h-3 text-red-500 ml-0.5" aria-label="No confirmed price sheet exists" />}
                {!ep.noConfirmedPrice && !ep.hasConfirmedToday && <AlertTriangle className="w-3 h-3 text-amber-500 ml-0.5" aria-label="No confirmed price sheet for today" />}
              </button>
            );
          })()}
        </div>
        );
      })}

      <Button type="button" variant="outline" size="sm" onClick={addItem} className="w-full mt-1" data-testid="button-add-line-item-bottom">
        <Plus className="w-3 h-3 mr-1" /> Add Item
      </Button>

      {items.length > 0 && discount && onDiscountChange && (
        <div className="border rounded-lg p-3 space-y-3 bg-muted/10">
          <Label className="text-sm font-semibold">Discount</Label>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-muted-foreground">Discount Type</Label>
              <Select value={discount.discountType} onValueChange={(v) => onDiscountChange({ ...discount, discountType: v, discountValue: v === "none" ? 0 : discount.discountValue })}>
                <SelectTrigger className="h-8 text-xs" data-testid="select-discount-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  <SelectItem value="percentage">Percentage</SelectItem>
                  <SelectItem value="fixed">Fixed Amount</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {discount.discountType !== "none" && (
              <div>
                <Label className="text-xs text-muted-foreground">
                  {discount.discountType === "percentage" ? "Discount (%)" : "Discount Amount (₹)"}
                </Label>
                <Input
                  className="h-8 text-xs"
                  type="number"
                  min="0"
                  step={discount.discountType === "percentage" ? "1" : "0.01"}
                  max={discount.discountType === "percentage" ? "100" : undefined}
                  value={discount.discountValue}
                  onChange={(e) => onDiscountChange({ ...discount, discountValue: parseFloat(e.target.value) || 0 })}
                  data-testid="input-discount-value"
                />
              </div>
            )}
          </div>
        </div>
      )}

      {items.length > 0 && (
        <div className="border-t pt-2 space-y-1">
          <div className="flex justify-between text-sm text-muted-foreground">
            <span>Subtotal (excl. GST)</span>
            <span data-testid="text-subtotal">₹{subtotal.toLocaleString()}</span>
          </div>
          {discount && discountAmount > 0 && (
            <div className="flex justify-between text-sm text-red-600 dark:text-red-400">
              <span>Discount {discount.discountType === "percentage" ? `(${discount.discountValue}%)` : ""}</span>
              <span data-testid="text-discount-amount">- ₹{discountAmount.toLocaleString()}</span>
            </div>
          )}
          {totalTax > 0 && (
            <div className="flex justify-between text-sm text-blue-600 dark:text-blue-400">
              <span>Total GST</span>
              <span data-testid="text-total-gst">+ ₹{totalTax.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </div>
          )}
          {(deliveryCost || 0) > 0 && (
            <div className="flex justify-between text-sm text-orange-600 dark:text-orange-400">
              <span>Delivery Cost</span>
              <span data-testid="text-delivery-cost">+ ₹{(deliveryCost || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </div>
          )}
          <div className="flex justify-between text-sm font-semibold border-t pt-1">
            <span>Grand Total</span>
            <span data-testid="text-line-items-total">₹{netTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
          </div>
        </div>
      )}
      {/* Check Margin Dialog — hidden (task #82); code preserved for future use */}
      {false && marginDialogIdx !== null && (() => {
        const dialogItem = items[marginDialogIdx];
        const ep = dialogItem?.productId ? effectivePrices?.[dialogItem.productId] : undefined;
        if (!ep) return null;
        return (
          <Dialog open={true} onOpenChange={() => setMarginDialogIdx(null)}>
            <DialogContent className="max-w-sm">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <BarChart3 className="w-4 h-4" />
                  Margin Check
                </DialogTitle>
                <DialogDescription className="text-xs truncate">{dialogItem.description || "Line item"}</DialogDescription>
              </DialogHeader>
              <MarginSimPanel item={dialogItem} ep={ep} />
              <DialogFooter>
                <Button variant="outline" size="sm" onClick={() => setMarginDialogIdx(null)} data-testid="button-close-margin-dialog">Close</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        );
      })()}
      {/* Phase 7 — discontinued-component confirm dialog */}
      <AlertDialog open={!!discontinuedDialog} onOpenChange={(open) => { if (!open) setDiscontinuedDialog(null); }}>
        <AlertDialogContent data-testid="dialog-discontinued-component">
          <AlertDialogHeader>
            <AlertDialogTitle>Bundle has non-active components</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>
                  <span className="font-medium">{discontinuedDialog?.bundleName}</span> includes the following components
                  that are not currently active:
                </p>
                <ul className="list-disc pl-5 text-sm">
                  {discontinuedDialog?.issues.map((it, k) => (
                    <li key={k}>
                      <span className="font-medium">{it.name}</span> — <span className="capitalize">{it.status}</span>
                    </li>
                  ))}
                </ul>
                <p className="text-xs text-muted-foreground">
                  Continuing will keep this bundle on the line. Dispatch may fail later if these components remain unavailable.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              data-testid="button-discontinued-cancel"
              onClick={() => {
                if (discontinuedDialog) updateItem(discontinuedDialog.lineIndex, "productId", "");
                setDiscontinuedDialog(null);
              }}
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction data-testid="button-discontinued-continue" onClick={() => setDiscontinuedDialog(null)}>
              Continue anyway
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function CustomerOutstandingInline({ customerId }: { customerId: string }) {
  const { data, isLoading } = useQuery<{ outstanding: number; total: number; collected: number }>({
    queryKey: ["/api/customers", customerId, "outstanding"],
    queryFn: () => {
      const token = localStorage.getItem("token");
      return fetch(`/api/customers/${customerId}/outstanding`, { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json());
    },
    enabled: !!customerId,
  });
  if (isLoading || !data) return null;
  const { outstanding, total, collected } = data;
  if (outstanding <= 0) return (
    <div className="flex items-center gap-2 text-sm bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-900 rounded-md px-3 py-2 mb-2">
      <span className="text-green-700 dark:text-green-400 font-medium">No outstanding dues</span>
      <span className="text-muted-foreground">· Total invoiced ₹{total.toLocaleString("en-IN")}, fully collected</span>
    </div>
  );
  return (
    <div className="flex items-center gap-3 text-sm bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900 rounded-md px-3 py-2 mb-2" data-testid="panel-customer-outstanding">
      <span className="font-semibold text-amber-700 dark:text-amber-400">Outstanding: ₹{outstanding.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
      <span className="text-muted-foreground text-xs">· ₹{collected.toLocaleString("en-IN")} collected of ₹{total.toLocaleString("en-IN")} total</span>
    </div>
  );
}

export default function Sales() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  // Phase 4 Cleanup F — controlled top-level tabs with URL persistence
  // (?tab=orders|quotations|customers). Default tab is "orders".
  const [activeTab, setActiveTab] = useState<string>(() => {
    if (typeof window === "undefined") return "orders";
    const t = new URLSearchParams(window.location.search).get("tab");
    return t === "quotations" || t === "customers" ? t : "orders";
  });
  const { data: currentUser } = useCurrentUser();
  const isReadOnly = currentUser?.role === "accountant";
  const canSeePricing = ["admin", "sales_manager", "accountant"].includes(currentUser?.role ?? "");
  const isAdmin = currentUser?.role === "admin";
  const { data: orders, isLoading: ordersLoading } = useQuery<SalesOrder[]>({ queryKey: ["/api/sales-orders"] });
  const { data: customers, isLoading: customersLoading } = useQuery<Customer[]>({ queryKey: ["/api/customers"] });
  const { data: quotations, isLoading: quotationsLoading } = useQuery<Quotation[]>({ queryKey: ["/api/quotations"] });
  const { data: products } = useQuery<Product[]>({ queryKey: ["/api/products"] });
  // Phase 7 — total physical stock per product, summed across all warehouses (informational only).
  const { data: inventoryStockRaw } = useQuery<Array<{ productId: string; warehouseId: string; quantity: number }>>({
    queryKey: ["/api/inventory-stock"],
    staleTime: 60 * 1000,
  });
  const inventoryByProduct = useState(() => new Map<string, number>())[0];
  // recompute every render — cheap, dataset is tiny
  inventoryByProduct.clear();
  (inventoryStockRaw ?? []).forEach(row => {
    inventoryByProduct.set(row.productId, (inventoryByProduct.get(row.productId) ?? 0) + Number(row.quantity || 0));
  });
  // Phase 7 — bundle components cache (productId → component rows). Loaded lazily on bundle selection.
  const [bundleComponentsMap, setBundleComponentsMap] = useState<Record<string, BundleItemRow[]>>({});
  const loadBundleComponents = useCallback(async (bundleId: string): Promise<BundleItemRow[]> => {
    if (bundleComponentsMap[bundleId]) return bundleComponentsMap[bundleId];
    try {
      const res = await fetch(`/api/products/${bundleId}/bundle-items`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
      });
      if (!res.ok) return [];
      const items = await res.json();
      const list: BundleItemRow[] = (items ?? []).map((i: any) => ({
        componentProductId: i.componentProductId,
        quantity: i.quantity,
        unit: i.unit || "pcs",
      }));
      setBundleComponentsMap(prev => ({ ...prev, [bundleId]: list }));
      return list;
    } catch { return []; }
  }, [bundleComponentsMap]);
  const { data: warehouses } = useQuery<Warehouse[]>({ queryKey: ["/api/warehouses"] });
  const { data: suppliers } = useQuery<Supplier[]>({ queryKey: ["/api/suppliers"] });
  const { data: effectivePrices } = useQuery<Record<string, EffectivePriceEntry>>({
    queryKey: ["/api/daily-price-sheets/effective-prices-today"],
    queryFn: async () => {
      const res = await fetch("/api/daily-price-sheets/effective-prices-today", { headers: { Authorization: `Bearer ${localStorage.getItem("token")}` } });
      if (!res.ok) return {};
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
  });

  const [orderDialogOpen, setOrderDialogOpen] = useState(false);
  const [editingOrder, setEditingOrder] = useState<SalesOrder | null>(null);
  const [orderForm, setOrderForm] = useState({ orderNumber: "", customerId: "", status: "pending", notes: "", paymentTerms: "", advanceAmount: "", expectedDeliveryDate: "", deliveryMethod: "pickup" as string, deliveryCost: "", deliveryAddress: "", warehouseId: "", subsidyScheme: "none" });
  const [orderItems, setOrderItems] = useState<LineItem[]>([emptyLineItem()]);
  const [orderDiscount, setOrderDiscount] = useState<DiscountState>({ discountType: "none", discountValue: 0 });
  // Phase 5 — touched-line tracking: warnings only shown on lines edited after Phase 5 deploy
  const [orderTouchedLines, setOrderTouchedLines] = useState<Set<number>>(new Set());
  const handleOrderLineTouched = (idx: number) => setOrderTouchedLines(prev => { const s = new Set(prev); s.add(idx); return s; });

  const [quoteDialogOpen, setQuoteDialogOpen] = useState(false);
  const [editingQuote, setEditingQuote] = useState<Quotation | null>(null);
  const [quoteForm, setQuoteForm] = useState({ quoteNumber: "", customerId: "", status: "draft", validUntil: "", notes: "", expectedDeliveryDate: "", deliveryMethod: "pickup" as string, deliveryCost: "", deliveryAddress: "" });
  const [quoteItems, setQuoteItems] = useState<LineItem[]>([emptyLineItem()]);
  const [quoteDiscount, setQuoteDiscount] = useState<DiscountState>({ discountType: "none", discountValue: 0 });
  // Phase 5 — touched-line tracking for quotes
  const [quoteTouchedLines, setQuoteTouchedLines] = useState<Set<number>>(new Set());
  const handleQuoteLineTouched = (idx: number) => setQuoteTouchedLines(prev => { const s = new Set(prev); s.add(idx); return s; });

  // E4: Outstanding dues override dialog state
  const [duesOverrideDialog, setDuesOverrideDialog] = useState<{
    outstanding: number;
    pendingOrderData?: any;
    quotationId?: string;
    invoices?: Array<{ id: string; invoiceNumber: string; invoiceDate: string; grandTotal: number; balance: number }>;
    customerName?: string;
    newOrderTotal?: number;
  } | null>(null);
  const [duesOverrideReason, setDuesOverrideReason] = useState("");
  // Phase 4 Cleanup A — floor-price admin override reasons (advisory + override pattern)
  const [orderFloorOverrideReason, setOrderFloorOverrideReason] = useState("");
  const [quoteFloorOverrideReason, setQuoteFloorOverrideReason] = useState("");

  // E4-proactive: fetch outstanding for selected customer when SO dialog is open (new orders only)
  const { data: orderCustomerOutstanding } = useQuery<{
    outstanding: number;
    invoices: Array<{ id: string; invoiceNumber: string; invoiceDate: string; grandTotal: number; balance: number }>;
    total: number;
    collected: number;
  }>({
    queryKey: ["/api/customers", orderForm.customerId, "outstanding"],
    queryFn: () => fetch(`/api/customers/${orderForm.customerId}/outstanding`, {
      headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
    }).then((r) => r.json()),
    enabled: orderDialogOpen && !!orderForm.customerId && !editingOrder,
  });

  // kk-proactive: fetch outstanding for selected customer when QUOTE dialog is open (informational only)
  const { data: quoteCustomerOutstanding } = useQuery<{
    outstanding: number;
    invoices: Array<{ id: string; invoiceNumber: string; invoiceDate: string; grandTotal: number; balance: number }>;
    total: number;
    collected: number;
  }>({
    queryKey: ["/api/customers", quoteForm.customerId, "outstanding"],
    queryFn: () => fetch(`/api/customers/${quoteForm.customerId}/outstanding`, {
      headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
    }).then((r) => r.json()),
    enabled: quoteDialogOpen && !!quoteForm.customerId,
  });

  // ll-1: track which quotation is currently being checked for outstanding (to disable button during fetch)
  const [convertingQuoteId, setConvertingQuoteId] = useState<string | null>(null);

  const [customerDialogOpen, setCustomerDialogOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [customerForm, setCustomerForm] = useState({ name: "", email: "", phone: "", address: "", gstNumber: "", contactPerson: "", customerType: "end_user" as "end_user" | "business", paymentTerms: "immediate" });
  const [customerSearchQuery, setCustomerSearchQuery] = useState("");
  const [customerTypeFilter, setCustomerTypeFilter] = useState<string>("__all__");

  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);
  const [expandedQuoteId, setExpandedQuoteId] = useState<string | null>(null);
  const [expandedOrderItems, setExpandedOrderItems] = useState<SalesOrderItem[]>([]);
  const [expandedQuoteItems, setExpandedQuoteItems] = useState<QuotationItem[]>([]);
  const [expandedQuoteActivities, setExpandedQuoteActivities] = useState<QuotationActivity[]>([]);
  const [expandedQuoteFollowups, setExpandedQuoteFollowups] = useState<QuotationFollowup[]>([]);

  const [showQuoteActivityForm, setShowQuoteActivityForm] = useState(false);
  const [quoteActivityForm, setQuoteActivityForm] = useState({ activityType: "call", notes: "" });
  const [showQuoteFollowupForm, setShowQuoteFollowupForm] = useState(false);
  const [quoteFollowupForm, setQuoteFollowupForm] = useState({ title: "", dueDate: "", priority: "medium" });

  const [quoteFollowupsMap, setQuoteFollowupsMap] = useState<Record<string, QuotationFollowup[]>>({});

  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [paymentOrderId, setPaymentOrderId] = useState<string | null>(null);
  const [paymentForm, setPaymentForm] = useState({ amount: "", method: "cash", reference: "", cashAccountId: "" });

  const [orderChallansMap, setOrderChallansMap] = useState<Record<string, DeliveryChallan[]>>({});
  const [orderDispatchSummaryMap, setOrderDispatchSummaryMap] = useState<Record<string, Array<{ productId: string; description: string; qtyOrdered: number; qtyDispatched: number; qtyRemaining: number }>>>({});
  const [orderLotMarginsMap, setOrderLotMarginsMap] = useState<Record<string, Array<{ itemId: string; productId: string | null; blendedCost: number | null; estimatedMarginPct: number | null }>>>({});

  const [dispatchDialogOpen, setDispatchDialogOpen] = useState(false);
  const [dispatchOrderId, setDispatchOrderId] = useState<string | null>(null);
  const [dispatchSummary, setDispatchSummary] = useState<{ productId: string; description: string; qtyOrdered: number; qtyDispatched: number; qtyRemaining: number }[]>([]);
  const [dispatchForm, setDispatchForm] = useState({ sourceType: "warehouse", sourceId: "", physicalChallanNumber: "", vehicleNumber: "", vehicleOwnerName: "", driverName: "", driverPhone: "", notes: "" });
  const [dispatchPhoneError, setDispatchPhoneError] = useState("");
  const [dispatchSummaryLoading, setDispatchSummaryLoading] = useState(false);

  const INDIAN_MOBILE_RE = /^(\+91)?[6-9]\d{9}$/;
  const dispatchFormValid =
    dispatchForm.physicalChallanNumber.trim() &&
    dispatchForm.vehicleNumber.trim() &&
    dispatchForm.vehicleOwnerName.trim() &&
    dispatchForm.driverName.trim() &&
    INDIAN_MOBILE_RE.test(dispatchForm.driverPhone.trim());

  const toggleOrderExpand = useCallback(async (orderId: string) => {
    if (expandedOrderId === orderId) {
      setExpandedOrderId(null);
      return;
    }
    try {
      const headers = { Authorization: `Bearer ${localStorage.getItem("token")}` };
      const order = orders?.find(o => o.id === orderId);
      const isDispatchEligible = order && ["confirmed", "procurement", "ready_to_ship", "partial", "dispatched", "delivered", "installed", "completed"].includes(order.status);
      const fetches: Promise<any>[] = [
        fetch(`/api/sales-orders/${orderId}/items`, { headers }),
        fetch(`/api/delivery-challans/by-order/${orderId}`, { headers }),
        fetch(`/api/sales-orders/${orderId}/lot-margins`, { headers }),
      ];
      if (isDispatchEligible) {
        fetches.push(fetch(`/api/sales-orders/${orderId}/dispatch-summary`, { headers }));
      }
      const results = await Promise.all(fetches);
      const [itemsData, challansData, lotMarginsData] = await Promise.all([results[0].json(), results[1].json(), results[2].json()]);
      setExpandedOrderItems(itemsData);
      setOrderChallansMap(prev => ({ ...prev, [orderId]: Array.isArray(challansData) ? challansData : [] }));
      setOrderLotMarginsMap(prev => ({ ...prev, [orderId]: Array.isArray(lotMarginsData) ? lotMarginsData : [] }));
      // Phase 7: auto-populate bundle component map for any bundle lines already in this order
      (Array.isArray(itemsData) ? itemsData : [])
        .filter((it: any) => it.itemType === "bundle" && it.productId)
        .forEach((it: any) => loadBundleComponents(it.productId));
      if (isDispatchEligible && results[3]) {
        const summaryData = await results[3].json();
        setOrderDispatchSummaryMap(prev => ({ ...prev, [orderId]: Array.isArray(summaryData.items) ? summaryData.items : [] }));
      }
      setExpandedOrderId(orderId);
    } catch { setExpandedOrderId(null); }
  }, [expandedOrderId, orders]);

  const toggleQuoteExpand = useCallback(async (quoteId: string) => {
    if (expandedQuoteId === quoteId) {
      setExpandedQuoteId(null);
      setShowQuoteActivityForm(false);
      setShowQuoteFollowupForm(false);
      return;
    }
    try {
      const headers = { Authorization: `Bearer ${localStorage.getItem("token")}` };
      const [itemsRes, activitiesRes, followupsRes] = await Promise.all([
        fetch(`/api/quotations/${quoteId}/items`, { headers }),
        fetch(`/api/quotations/${quoteId}/activities`, { headers }),
        fetch(`/api/quotations/${quoteId}/followups`, { headers }),
      ]);
      const [items, activities, followups] = await Promise.all([
        itemsRes.json(),
        activitiesRes.json(),
        followupsRes.json(),
      ]);
      setExpandedQuoteItems(items);
      setExpandedQuoteActivities(activities);
      setExpandedQuoteFollowups(followups);
      // Phase 7: auto-populate bundle component map for any bundle lines in this quote
      (Array.isArray(items) ? items : [])
        .filter((it: any) => it.itemType === "bundle" && it.productId)
        .forEach((it: any) => loadBundleComponents(it.productId));
      setExpandedQuoteId(quoteId);
      setShowQuoteActivityForm(false);
      setShowQuoteFollowupForm(false);
    } catch { setExpandedQuoteId(null); }
  }, [expandedQuoteId]);

  const getNetTotal = (items: LineItem[], discount: DiscountState, deliveryCost?: number) => {
    const subtotal = items.reduce((s, it) => s + (it.totalPrice || 0), 0);
    const tax = items.reduce((s, it) => s + (it.taxAmount || 0), 0);
    const discountAmt = calculateDiscount(subtotal, discount);
    return subtotal - discountAmt + tax + (deliveryCost || 0);
  };

  const orderMutation = useMutation({
    mutationFn: async (data: any) => {
      const deliveryCostNum = data.deliveryMethod === "delivery" && data.deliveryCost ? Number(data.deliveryCost) : 0;
      const itemSubtotal = orderItems.reduce((s, it) => s + (it.totalPrice || 0), 0);
      const itemTotalTax = orderItems.reduce((s, it) => s + (it.taxAmount || 0), 0);
      const discountAmt = calculateDiscount(itemSubtotal, orderDiscount);
      const totalAmount = String(itemSubtotal - discountAmt + itemTotalTax + deliveryCostNum);
      const orderData = {
        ...data,
        totalAmount,
        subtotal: String(itemSubtotal),
        totalTax: String(itemTotalTax),
        discountType: orderDiscount.discountType === "none" ? null : orderDiscount.discountType,
        discountValue: orderDiscount.discountType === "none" ? null : String(orderDiscount.discountValue),
        paymentTerms: data.paymentTerms || null,
        advanceAmount: data.advanceAmount ? String(data.advanceAmount) : null,
        expectedDeliveryDate: data.expectedDeliveryDate ? new Date(data.expectedDeliveryDate).toISOString() : null,
        deliveryMethod: data.deliveryMethod || null,
        deliveryCost: data.deliveryMethod === "delivery" && data.deliveryCost ? String(data.deliveryCost) : null,
        deliveryAddress: data.deliveryMethod === "delivery" ? data.deliveryAddress || null : null,
        warehouseId: data.warehouseId || null,
      };
      // Pre-validate: block zero-price product lines BEFORE creating the header record
      // (prevents orphan empty orders when the items endpoint later returns 422)
      const validItems = orderItems.filter(it => it.description && it.quantity > 0);
      const zeroPriceOrderItems = validItems.filter(it => it.productId && (it.unitPrice ?? 0) <= 0);
      if (zeroPriceOrderItems.length > 0) {
        const names = zeroPriceOrderItems.map(it => {
          const prod = products?.find(p => p.id === it.productId);
          return prod ? `${prod.name} (${prod.sku})` : it.description;
        });
        throw new Error(
          `Cannot save: ${names.join(", ")} ${zeroPriceOrderItems.length === 1 ? "has" : "have"} no unit price set. ` +
          `Fill the unit price in Products & Services before adding to a sales order.`
        );
      }

      let orderId: string;
      if (editingOrder) {
        await apiRequest("PATCH", `/api/sales-orders/${editingOrder.id}`, orderData);
        orderId = editingOrder.id;
      } else {
        const res = await apiRequest("POST", "/api/sales-orders", orderData);
        const created = await res.json();
        orderId = created.id;
      }
      if (validItems.length > 0) {
        await apiRequest("POST", `/api/sales-orders/${orderId}/items`, {
          items: validItems.map(it => ({
            productId: it.productId || null,
            description: it.description,
            itemType: it.itemType,
            quantity: it.quantity,
            unitPrice: String(it.unitPrice),
            totalPrice: String(it.totalPrice),
            gstRate: String(it.gstRate || 0),
            hsnCode: it.hsnCode || null,
            taxAmount: String(it.taxAmount || 0),
          })),
          // Phase 4 Cleanup A — admin override reason for below-floor lines (server validates)
          ...(orderFloorOverrideReason.trim().length >= 10 ? { floorOverrideReason: orderFloorOverrideReason.trim() } : {}),
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sales-orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/inventory/reserved-stock"] });
      queryClient.invalidateQueries({ queryKey: ["/api/inventory/incoming-stock"] });
      toast({ title: editingOrder ? "Order updated" : "Order created" });
      setOrderDialogOpen(false);
      setEditingOrder(null);
      setDuesOverrideDialog(null);
      setDuesOverrideReason("");
      setOrderFloorOverrideReason("");
    },
    onError: (error: any, variables: any) => {
      if (error instanceof ApiError && error.status === 400 && error.body?.outstanding !== undefined) {
        setDuesOverrideDialog({
          outstanding: error.body.outstanding,
          pendingOrderData: variables,
          invoices: error.body.invoices ?? [],
          customerName: customers?.find((c) => c.id === (variables as any).customerId)?.name,
        });
        setDuesOverrideReason("");
      } else {
        toast({ title: "Error", description: error.message, variant: "destructive" });
      }
    },
  });

  const deleteOrderMutation = useMutation({
    mutationFn: async (id: string) => { await apiRequest("DELETE", `/api/sales-orders/${id}`); },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sales-orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/inventory/reserved-stock"] });
      toast({ title: "Order deleted" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const quoteMutation = useMutation({
    mutationFn: async (data: any) => {
      const deliveryCostNum = data.deliveryMethod === "delivery" && data.deliveryCost ? Number(data.deliveryCost) : 0;
      const totalAmount = String(getNetTotal(quoteItems, quoteDiscount, deliveryCostNum));
      const quoteData = {
        ...data,
        totalAmount,
        validUntil: data.validUntil ? new Date(data.validUntil).toISOString() : null,
        discountType: quoteDiscount.discountType === "none" ? null : quoteDiscount.discountType,
        discountValue: quoteDiscount.discountType === "none" ? null : String(quoteDiscount.discountValue),
        expectedDeliveryDate: data.expectedDeliveryDate ? new Date(data.expectedDeliveryDate).toISOString() : null,
        deliveryMethod: data.deliveryMethod || null,
        deliveryCost: data.deliveryMethod === "delivery" && data.deliveryCost ? String(data.deliveryCost) : null,
        deliveryAddress: data.deliveryMethod === "delivery" ? data.deliveryAddress || null : null,
      };
      // Pre-validate: block zero-price product lines BEFORE creating the header record
      // (prevents orphan empty quotations when the items endpoint later returns 422)
      const validItems = quoteItems.filter(it => it.description && it.quantity > 0);
      const zeroPriceQuoteItems = validItems.filter(it => it.productId && (it.unitPrice ?? 0) <= 0);
      if (zeroPriceQuoteItems.length > 0) {
        const names = zeroPriceQuoteItems.map(it => {
          const prod = products?.find(p => p.id === it.productId);
          return prod ? `${prod.name} (${prod.sku})` : it.description;
        });
        throw new Error(
          `Cannot save: ${names.join(", ")} ${zeroPriceQuoteItems.length === 1 ? "has" : "have"} no unit price set. ` +
          `Fill the unit price in Products & Services before adding to a quotation.`
        );
      }

      let quoteId: string;
      if (editingQuote) {
        await apiRequest("PATCH", `/api/quotations/${editingQuote.id}`, quoteData);
        quoteId = editingQuote.id;
      } else {
        const res = await apiRequest("POST", "/api/quotations", quoteData);
        const created = await res.json();
        quoteId = created.id;
      }
      if (validItems.length > 0) {
        await apiRequest("POST", `/api/quotations/${quoteId}/items`, {
          items: validItems.map(it => ({
            productId: it.productId || null,
            description: it.description,
            itemType: it.itemType,
            quantity: it.quantity,
            unitPrice: String(it.unitPrice),
            totalPrice: String(it.totalPrice),
            gstRate: String(it.gstRate || 0),
            hsnCode: it.hsnCode || null,
            taxAmount: String(it.taxAmount || 0),
            customComponents: it.customComponents || null,
          })),
          // Phase 4 Cleanup A — admin override reason for below-floor lines (server validates)
          ...(quoteFloorOverrideReason.trim().length >= 10 ? { floorOverrideReason: quoteFloorOverrideReason.trim() } : {}),
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/quotations"] });
      toast({ title: editingQuote ? "Quotation updated" : "Quotation created" });
      setQuoteDialogOpen(false);
      setEditingQuote(null);
      setQuoteFloorOverrideReason("");
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const deleteQuoteMutation = useMutation({
    mutationFn: async (id: string) => { await apiRequest("DELETE", `/api/quotations/${id}`); },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/quotations"] });
      toast({ title: "Quotation deleted" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const convertToOrderMutation = useMutation({
    mutationFn: async ({ id, duesOverride, duesOverrideReason }: { id: string; duesOverride?: boolean; duesOverrideReason?: string }) => {
      const body: any = {};
      if (duesOverride) { body.duesOverride = true; body.duesOverrideReason = duesOverrideReason; }
      const res = await apiRequest("POST", `/api/quotations/${id}/convert-to-order`, Object.keys(body).length ? body : undefined);
      return res.json();
    },
    onSuccess: (order: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/sales-orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/quotations"] });
      toast({ title: "Quotation converted to order", description: `Order ${order.orderNumber} created` });
      setDuesOverrideDialog(null);
      setDuesOverrideReason("");
    },
    onError: (error: any, variables: { id: string }) => {
      if (error instanceof ApiError && error.status === 400 && error.body?.outstanding !== undefined) {
        const quot = quotations?.find((q) => q.id === variables.id);
        setDuesOverrideDialog({
          outstanding: error.body.outstanding,
          quotationId: variables.id,
          invoices: error.body.invoices ?? [],
          customerName: customers?.find((c) => c.id === quot?.customerId)?.name,
          newOrderTotal: Number(quot?.totalAmount ?? 0),
        });
        setDuesOverrideReason("");
      } else {
        toast({ title: "Error", description: error.message, variant: "destructive" });
      }
    },
  });

  const recordPaymentMutation = useMutation({
    mutationFn: async ({ orderId, data }: { orderId: string; data: any }) => {
      const res = await apiRequest("POST", `/api/sales-orders/${orderId}/record-payment`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sales-orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/inventory/reserved-stock"] });
      toast({ title: "Payment recorded" });
      setPaymentDialogOpen(false);
      setPaymentOrderId(null);
      setPaymentForm({ amount: "", method: "cash", reference: "", cashAccountId: "" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  // Phase 4B: cash accounts list for Record Payment dropdown (smart-filtered by method)
  const { data: cashAccountsForPayment } = useQuery<(CashAccount & { balance?: number })[]>({ queryKey: ["/api/cash-accounts"] });
  const paymentAccounts = (cashAccountsForPayment ?? []).filter(a => a.isActive && (paymentForm.method === "cash" ? a.type === "cash" : a.type === "bank"));

  const generateInvoiceMutation = useMutation({
    mutationFn: async (orderId: string) => {
      const res = await apiRequest("POST", `/api/sales-orders/${orderId}/generate-invoice`);
      return res.json();
    },
    onSuccess: (invoice: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/sales-orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/invoices"] });
      toast({ title: "Invoice generated", description: `Invoice ${invoice.invoiceNumber} created` });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const confirmPickupMutation = useMutation({
    mutationFn: async (orderId: string) => {
      const res = await apiRequest("POST", `/api/sales-orders/${orderId}/confirm-pickup`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sales-orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/delivery-challans"] });
      queryClient.invalidateQueries({ queryKey: ["/api/inventory-stock"] });
      toast({ title: "Pickup confirmed", description: "Order marked as delivered and stock deducted." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const customerMutation = useMutation({
    mutationFn: async (data: any) => {
      if (editingCustomer) {
        await apiRequest("PATCH", `/api/customers/${editingCustomer.id}`, data);
      } else {
        await apiRequest("POST", "/api/customers", data);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/customers"] });
      toast({ title: editingCustomer ? "Customer updated" : "Customer created" });
      setCustomerDialogOpen(false);
      setEditingCustomer(null);
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const deleteCustomerMutation = useMutation({
    mutationFn: async (id: string) => { await apiRequest("DELETE", `/api/customers/${id}`); },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/customers"] });
      toast({ title: "Customer deleted" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const quoteActivityMutation = useMutation({
    mutationFn: async ({ quoteId, data }: { quoteId: string; data: { activityType: string; notes: string } }) => {
      await apiRequest("POST", `/api/quotations/${quoteId}/activities`, data);
      return quoteId;
    },
    onSuccess: async (quoteId: string) => {
      const headers = { Authorization: `Bearer ${localStorage.getItem("token")}` };
      const res = await fetch(`/api/quotations/${quoteId}/activities`, { headers });
      const data = await res.json();
      setExpandedQuoteActivities(data);
      setQuoteActivityForm({ activityType: "call", notes: "" });
      setShowQuoteActivityForm(false);
      toast({ title: "Activity logged" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const quoteFollowupMutation = useMutation({
    mutationFn: async ({ quoteId, data }: { quoteId: string; data: { title: string; dueDate: string; priority: string } }) => {
      await apiRequest("POST", `/api/quotations/${quoteId}/followups`, {
        ...data,
        dueDate: new Date(data.dueDate),
      });
      return quoteId;
    },
    onSuccess: async (quoteId: string) => {
      const headers = { Authorization: `Bearer ${localStorage.getItem("token")}` };
      const res = await fetch(`/api/quotations/${quoteId}/followups`, { headers });
      const data = await res.json();
      setExpandedQuoteFollowups(data);
      setQuoteFollowupsMap(prev => ({ ...prev, [quoteId]: data }));
      setQuoteFollowupForm({ title: "", dueDate: "", priority: "medium" });
      setShowQuoteFollowupForm(false);
      toast({ title: "Follow-up scheduled" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const completeQuoteFollowupMutation = useMutation({
    mutationFn: async ({ followupId, quoteId }: { followupId: string; quoteId: string }) => {
      await apiRequest("POST", `/api/quotation-followups/${followupId}/complete`);
      return quoteId;
    },
    onSuccess: async (quoteId: string) => {
      const headers = { Authorization: `Bearer ${localStorage.getItem("token")}` };
      const res = await fetch(`/api/quotations/${quoteId}/followups`, { headers });
      const data = await res.json();
      setExpandedQuoteFollowups(data);
      setQuoteFollowupsMap(prev => ({ ...prev, [quoteId]: data }));
      toast({ title: "Follow-up completed" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const ACTIVITY_ICONS: Record<string, any> = {
    call: Phone,
    email: Mail,
    meeting: UsersIcon,
    site_visit: MapPin,
    whatsapp: MessageCircle,
    note: StickyNote,
  };

  const PRIORITY_COLORS: Record<string, string> = {
    high: "bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-400",
    medium: "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-400",
    low: "bg-green-100 text-green-800 dark:bg-green-950/40 dark:text-green-400",
  };

  const isOverdue = (dueDate: string | Date) => {
    const due = new Date(dueDate);
    due.setHours(23, 59, 59, 999);
    return due < new Date();
  };

  const isToday = (dueDate: string | Date) => {
    const due = new Date(dueDate);
    const now = new Date();
    return due.toDateString() === now.toDateString();
  };

  const getRelativeTime = (date: string | Date) => {
    const d = new Date(date);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days < 7) return `${days}d ago`;
    return d.toLocaleDateString();
  };

  const getNextFollowup = (quoteId: string): QuotationFollowup | null => {
    const followups = quoteFollowupsMap[quoteId];
    if (!followups || followups.length === 0) return null;
    const pending = followups.filter(f => f.status === "pending").sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());
    return pending[0] || null;
  };

  const fetchAllQuoteFollowups = useCallback(async () => {
    if (!quotations || quotations.length === 0) return;
    const headers = { Authorization: `Bearer ${localStorage.getItem("token")}` };
    const map: Record<string, QuotationFollowup[]> = {};
    await Promise.all(
      quotations.map(async (q) => {
        try {
          const res = await fetch(`/api/quotations/${q.id}/followups`, { headers });
          map[q.id] = await res.json();
        } catch {
          map[q.id] = [];
        }
      })
    );
    setQuoteFollowupsMap(map);
  }, [quotations]);

  useEffect(() => {
    fetchAllQuoteFollowups();
  }, [fetchAllQuoteFollowups]);

  const openNewOrder = () => {
    setEditingOrder(null);
    setOrderForm({ orderNumber: "", customerId: "", status: "pending", notes: "", paymentTerms: "", advanceAmount: "", expectedDeliveryDate: "", deliveryMethod: "pickup", deliveryCost: "", deliveryAddress: "", warehouseId: "", subsidyScheme: "none" });
    setOrderItems([emptyLineItem()]);
    setOrderDiscount({ discountType: "none", discountValue: 0 });
    setOrderTouchedLines(new Set()); // Phase 5: fresh order — start empty, warn on any line the user touches
    setOrderDialogOpen(true);
  };

  const openEditOrder = async (order: SalesOrder) => {
    setEditingOrder(order);
    setOrderForm({
      orderNumber: order.orderNumber,
      customerId: order.customerId,
      status: order.status,
      notes: order.notes || "",
      paymentTerms: order.paymentTerms || "",
      advanceAmount: order.advanceAmount ? String(order.advanceAmount) : "",
      expectedDeliveryDate: (order as any).expectedDeliveryDate ? new Date((order as any).expectedDeliveryDate).toISOString().split("T")[0] : "",
      deliveryMethod: (order as any).deliveryMethod || "pickup",
      deliveryCost: (order as any).deliveryCost ? String((order as any).deliveryCost) : "",
      deliveryAddress: (order as any).deliveryAddress || "",
      warehouseId: order.warehouseId || "",
      subsidyScheme: (order as any).subsidyScheme || "none",
    });
    setOrderTouchedLines(new Set()); // Phase 5: editing existing order — pre-existing lines are untouched
    setOrderDiscount({
      discountType: order.discountType || "none",
      discountValue: order.discountValue ? Number(order.discountValue) : 0,
    });
    try {
      const res = await fetch(`/api/sales-orders/${order.id}/items`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
      });
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        setOrderItems(data.map((it: SalesOrderItem) => ({
          itemType: it.itemType || "product",
          productId: it.productId || "",
          description: it.description || "",
          quantity: it.quantity,
          unitPrice: Number(it.unitPrice),
          totalPrice: Number(it.totalPrice),
          gstRate: Number(it.gstRate || 0),
          hsnCode: it.hsnCode || "",
          taxAmount: Number(it.taxAmount || 0),
        })));
      } else {
        setOrderItems([emptyLineItem()]);
      }
    } catch {
      setOrderItems([emptyLineItem()]);
    }
    setOrderDialogOpen(true);
  };

  const openNewQuote = () => {
    setEditingQuote(null);
    setQuoteForm({ quoteNumber: "", customerId: "", status: "draft", validUntil: "", notes: "", expectedDeliveryDate: "", deliveryMethod: "pickup", deliveryCost: "", deliveryAddress: "" });
    setQuoteItems([emptyLineItem()]);
    setQuoteDiscount({ discountType: "none", discountValue: 0 });
    setQuoteTouchedLines(new Set()); // Phase 5: fresh quote — start empty
    setQuoteDialogOpen(true);
  };

  const openEditQuote = async (q: Quotation) => {
    setEditingQuote(q);
    setQuoteForm({
      quoteNumber: q.quoteNumber,
      customerId: q.customerId,
      status: q.status,
      validUntil: q.validUntil ? new Date(q.validUntil).toISOString().split("T")[0] : "",
      notes: q.notes || "",
      expectedDeliveryDate: q.expectedDeliveryDate ? new Date(q.expectedDeliveryDate).toISOString().split("T")[0] : "",
      deliveryMethod: (q as any).deliveryMethod || "pickup",
      deliveryCost: (q as any).deliveryCost ? String((q as any).deliveryCost) : "",
      deliveryAddress: (q as any).deliveryAddress || "",
    });
    setQuoteDiscount({
      discountType: q.discountType || "none",
      discountValue: q.discountValue ? Number(q.discountValue) : 0,
    });
    setQuoteTouchedLines(new Set()); // Phase 5: editing existing quote — pre-existing lines are untouched
    try {
      const res = await fetch(`/api/quotations/${q.id}/items`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
      });
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        const mapped = data.map((it: any) => ({
          itemType: it.itemType || "product",
          productId: it.productId || "",
          description: it.description || "",
          quantity: it.quantity,
          unitPrice: Number(it.unitPrice),
          totalPrice: Number(it.totalPrice),
          gstRate: Number(it.gstRate) || 0,
          hsnCode: it.hsnCode || "",
          taxAmount: Number(it.taxAmount) || 0,
          customComponents: it.customComponents || null,
        }));
        setQuoteItems(mapped);
        // Preload master bundle components for every bundle line that has no custom override,
        // so re-opened quotes never get stuck on "Loading bundle components…"
        mapped.forEach(it => {
          if (it.productId && it.customComponents === null) {
            const prod = (products || []).find((p: Product) => p.id === it.productId);
            if (prod && (prod as any).type === "bundle") {
              loadBundleComponents(it.productId);
            }
          }
        });
      } else {
        setQuoteItems([emptyLineItem()]);
      }
    } catch {
      setQuoteItems([emptyLineItem()]);
    }
    setQuoteDialogOpen(true);
  };

  const openNewCustomer = () => {
    setEditingCustomer(null);
    setCustomerForm({ name: "", email: "", phone: "", address: "", gstNumber: "", contactPerson: "", customerType: "end_user", paymentTerms: "immediate" });
    setCustomerDialogOpen(true);
  };

  const openEditCustomer = (c: Customer) => {
    setEditingCustomer(c);
    setCustomerForm({
      name: c.name,
      email: c.email || "",
      phone: c.phone || "",
      address: c.address || "",
      gstNumber: c.gstNumber || "",
      contactPerson: c.contactPerson || "",
      // Hydrate from migrated value; default to end_user if column is missing/empty for any reason
      customerType: (c.customerType === "business" ? "business" : "end_user"),
      paymentTerms: (c as any).paymentTerms || "immediate",
    });
    setCustomerDialogOpen(true);
  };

  const openRecordPayment = (orderId: string) => {
    setPaymentOrderId(orderId);
    setPaymentForm({ amount: "", method: "cash", reference: "", cashAccountId: "" });
    setPaymentDialogOpen(true);
  };

  const getSourceName = (sourceType: string, sourceId: string): string => {
    if (sourceType === "warehouse") {
      return warehouses?.find(w => w.id === sourceId)?.name || sourceId;
    }
    return suppliers?.find(s => s.id === sourceId)?.name || sourceId;
  };

  const CHALLAN_VIEW_ELIGIBLE = ["confirmed", "procurement", "ready_to_ship", "partial", "dispatched", "shipped", "delivered", "installed", "completed"];
  const CHALLAN_CREATE_ELIGIBLE = ["confirmed", "procurement", "ready_to_ship", "partial"];

  const openDispatchDialog = async (orderId: string) => {
    setDispatchOrderId(orderId);
    setDispatchForm({ sourceType: "warehouse", sourceId: "", physicalChallanNumber: "", vehicleNumber: "", vehicleOwnerName: "", driverName: "", driverPhone: "", notes: "" });
    setDispatchPhoneError("");
    setDispatchSummary([]);
    setDispatchDialogOpen(true);
    setDispatchSummaryLoading(true);
    try {
      const headers = { Authorization: `Bearer ${localStorage.getItem("token")}` };
      const res = await fetch(`/api/sales-orders/${orderId}/dispatch-summary`, { headers });
      const data = await res.json();
      setDispatchSummary(Array.isArray(data.items) ? data.items : []);
    } catch {
      setDispatchSummary([]);
    } finally {
      setDispatchSummaryLoading(false);
    }
  };

  const createFromSOMutation = useMutation({
    mutationFn: async ({ orderId, data }: { orderId: string; data: any }) => {
      const token = localStorage.getItem("token");
      const res = await fetch(`/api/delivery-challans/create-from-so/${orderId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify(data),
      });
      const body = await res.json();
      if (res.status === 409) {
        return { existing: true, challan: body.challan };
      }
      if (!res.ok) {
        throw new Error(body.message || "Failed to create challan");
      }
      return { existing: false, challan: body };
    },
    onSuccess: ({ existing, challan }: { existing: boolean; challan: any }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/sales-orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/delivery-challans"] });
      if (existing) {
        toast({ title: "Draft challan already exists", description: `${challan?.challanNumber || "Existing draft"} — Opening Inventory → Delivery Challans.` });
        setDispatchDialogOpen(false);
        setTimeout(() => navigate("/inventory?tab=challans"), 300);
      } else {
        toast({ title: "Dispatch challan created", description: `${challan.challanNumber} — Go to Inventory → Delivery Challans to dispatch.` });
      }
      setDispatchDialogOpen(false);
      if (expandedOrderId) {
        const headers = { Authorization: `Bearer ${localStorage.getItem("token")}` };
        fetch(`/api/delivery-challans/by-order/${expandedOrderId}`, { headers })
          .then(r => r.json())
          .then(d => setOrderChallansMap(prev => ({ ...prev, [expandedOrderId]: Array.isArray(d) ? d : [] })));
      }
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const downloadQuotePDF = async (q: Quotation) => {
    try {
      const res = await fetch(`/api/quotations/${q.id}/items`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
      });
      if (!res.ok) throw new Error("Failed to fetch items");
      const qItems: QuotationItem[] = await res.json();
      const customer = customers?.find(c => c.id === q.customerId);
      // Phase 7 — collect bundle component rows for any bundle line in this quotation,
      // resolving names + GST from the products list. Components are loaded lazily.
      // Phase 98: per-item custom components keyed by item.id take priority over master bundle
      const bundlePdfMap: Record<string, Array<{ name: string; quantity: number; unit: string; gstRate: number }>> = {};
      const bundleItems = (Array.isArray(qItems) ? qItems : []).filter(it => it.productId && products?.find(p => p.id === it.productId)?.type === "bundle");
      const bundleLineProductIds = Array.from(new Set(bundleItems.map(it => it.productId as string)));
      await Promise.all(bundleItems.map(async (it) => {
        // Use per-item custom override when it is a non-null array (including empty = "no components")
        const cc = it.customComponents;
        if (Array.isArray(cc)) {
          bundlePdfMap[it.id] = cc.map(c => {
            const comp = products?.find(p => p.id === c.componentProductId);
            return { name: comp?.name ?? c.componentProductId, quantity: Number(c.quantity) || 0, unit: c.unit || "pcs", gstRate: Number((comp as any)?.gstRate || 0) };
          });
        }
      }));
      await Promise.all(bundleLineProductIds.map(async (bid) => {
        if (!bundlePdfMap[bid]) {
          const comps = await loadBundleComponents(bid);
          bundlePdfMap[bid] = comps.map(row => {
            const comp = products?.find(p => p.id === row.componentProductId);
            return { name: comp?.name ?? row.componentProductId, quantity: Number(row.quantity) || 0, unit: row.unit || "pcs", gstRate: Number((comp as any)?.gstRate || 0) };
          });
        }
      }));
      let logoDataUrl: string | undefined;
      try {
        const resp = await fetch(logoPath);
        const blob = await resp.blob();
        logoDataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
      } catch { /* proceed without logo */ }
      await generateQuotationPDF(q, Array.isArray(qItems) ? qItems : [], customer, products || [], bundlePdfMap, logoDataUrl);
      toast({ title: "PDF downloaded", description: q.quoteNumber });
    } catch {
      toast({ title: "Failed to generate PDF", variant: "destructive" });
    }
  };

  const [waDialogOpen, setWaDialogOpen] = useState(false);
  const [waTargetPhone, setWaTargetPhone] = useState("");
  const [waMessage, setWaMessage] = useState("");
  const [waQuoteRef, setWaQuoteRef] = useState("");
  const [waSelectedTemplate, setWaSelectedTemplate] = useState<string>("");
  const [waConvWindow, setWaConvWindow] = useState<Date | null>(null);
  const [waDialogTitle, setWaDialogTitle] = useState("Send via WhatsApp");
  // Template variable values for preview and sending
  const [waTemplateVars, setWaTemplateVars] = useState<string[]>([]);
  // Per-variable provenance: "auto:<source>" when filled from document/customer
  // context, "manual" when the operator typed/edited it, undefined when empty.
  const [waVarSources, setWaVarSources] = useState<(string | undefined)[]>([]);
  const [waAutoContext, setWaAutoContext] = useState<Record<string, string>>({});
  const [waDocContext, setWaDocContext] = useState<MergeFieldDocumentContext | null>(null);
  const [waCustomerContext, setWaCustomerContext] = useState<{ name?: string | null; email?: string | null; phone?: string | null; address?: string | null; gstNumber?: string | null; contactPerson?: string | null } | null>(null);

  const { data: waTemplates = [] } = useQuery<{ id: string; name: string; interaktTemplateName: string; body: string; variables: string[] }[]>({
    queryKey: ["/api/whatsapp/templates"],
    enabled: waDialogOpen,
    select: (d: any[]) => d.filter(t => t.isActive === "approved"),
  });

  const openWaDialogForOrder = async (order: SalesOrder) => {
    const customer = customers?.find(c => c.id === order.customerId);
    setWaTargetPhone(customer?.phone || "");
    setWaMessage(`Hi${customer ? " " + customer.name : ""},\n\nYour sales order *${order.orderNumber}* is being processed.\n\nStatus: ${order.status}\nAmount: ₹${Number(order.totalAmount || 0).toLocaleString("en-IN")}\n\nThank you for your business!`);
    setWaQuoteRef(order.orderNumber || order.id);
    setWaSelectedTemplate("");
    setWaTemplateVars([]); setWaVarSources([]);
    setWaAutoContext({
      "1": customer?.name || "",
      "2": order.orderNumber || "",
      "3": order.status || "",
      "4": `₹${Number(order.totalAmount || 0).toLocaleString("en-IN")}`,
    });
    setWaCustomerContext(customer ? { name: customer.name, email: customer.email, phone: customer.phone, address: customer.address, gstNumber: customer.gstNumber, contactPerson: customer.contactPerson } : null);
    setWaDocContext({
      type: "order",
      orderNumber: order.orderNumber || null,
      amount: order.totalAmount ?? null,
      status: order.status || null,
    });
    setWaConvWindow(null);
    setWaDialogTitle("Send Order Update via WhatsApp");
    setWaDialogOpen(true);
    if (customer?.phone) {
      try {
        const convs = await fetch("/api/whatsapp/conversations", { headers: { Authorization: `Bearer ${localStorage.getItem("token")}` } });
        if (convs.ok) {
          const list = await convs.json();
          const phone = customer.phone.replace(/\D/g, "");
          const normPhone = phone.length === 10 && /^[6-9]/.test(phone) ? "91" + phone : phone;
          const match = list.find((c: any) => c.phoneNumber === normPhone);
          if (match?.windowExpiresAt) setWaConvWindow(new Date(match.windowExpiresAt));
        }
      } catch {}
    }
  };

  const openWaDialog = async (q: Quotation) => {
    const customer = customers?.find(c => c.id === q.customerId);
    setWaTargetPhone(customer?.phone || "");
    setWaMessage(`Hi${customer ? " " + customer.name : ""},\n\nPlease find your quotation *${q.quoteNumber}* attached.\n\nAmount: ₹${Number(q.totalAmount || 0).toLocaleString("en-IN")}\nValid until: ${q.validUntil ? new Date(q.validUntil).toLocaleDateString("en-IN") : "—"}\n\nThank you for your business!`);
    setWaQuoteRef(q.quoteNumber);
    setWaSelectedTemplate("");
    setWaTemplateVars([]); setWaVarSources([]);
    setWaAutoContext({
      "1": customer?.name || "",
      "2": q.quoteNumber || "",
      "3": `₹${Number(q.totalAmount || 0).toLocaleString("en-IN")}`,
      "4": q.validUntil ? new Date(q.validUntil).toLocaleDateString("en-IN") : "",
    });
    setWaCustomerContext(customer ? { name: customer.name, email: customer.email, phone: customer.phone, address: customer.address, gstNumber: customer.gstNumber, contactPerson: customer.contactPerson } : null);
    setWaDocContext({
      type: "quote",
      quoteNumber: q.quoteNumber || null,
      amount: q.totalAmount ?? null,
      dueDate: q.validUntil ?? null,
      status: q.status || null,
    });
    setWaConvWindow(null);
    setWaDialogTitle("Send Quotation via WhatsApp");
    setWaDialogOpen(true);
    // Check if there's an existing open conversation/window for this phone
    if (customer?.phone) {
      try {
        const convs = await fetch("/api/whatsapp/conversations", { headers: { Authorization: `Bearer ${localStorage.getItem("token")}` } });
        if (convs.ok) {
          const list = await convs.json();
          const phone = customer.phone.replace(/\D/g, "");
          const normPhone = phone.length === 10 && /^[6-9]/.test(phone) ? "91" + phone : phone;
          const match = list.find((c: any) => c.phoneNumber === normPhone);
          if (match?.windowExpiresAt) setWaConvWindow(new Date(match.windowExpiresAt));
        }
      } catch {}
    }
  };

  const windowIsOpen = waConvWindow && waConvWindow > new Date();

  const sendWaMutation = useMutation({
    mutationFn: async () => {
      let phone = waTargetPhone.replace(/\D/g, "");
      if (phone.length === 10 && /^[6-9]/.test(phone)) phone = "91" + phone;
      const convRes = await apiRequest("POST", "/api/whatsapp/conversations/get-or-create", { phone });
      if (!convRes.ok) { const e = await convRes.json(); throw new Error(e.message || "Failed to open conversation"); }
      const conv = await convRes.json();

      let payload: Record<string, any>;
      if (waSelectedTemplate && waSelectedTemplate !== "__none__") {
        const tpl = waTemplates.find(t => t.interaktTemplateName === waSelectedTemplate);
        payload = {
          type: "template",
          templateName: waSelectedTemplate,
          templateVariables: waTemplateVars,
          templateVariableNames: tpl?.variables || [],
          documentContext: waDocContext || undefined,
        };
      } else if (windowIsOpen) {
        payload = { type: "text", text: waMessage };
      } else {
        throw new Error("24-hour messaging window has expired. Please select an approved template to send.");
      }

      const sendRes = await apiRequest("POST", `/api/whatsapp/conversations/${conv.id}/send`, payload);
      if (!sendRes.ok) { const e = await sendRes.json(); throw new Error(e.message || "Failed to send message"); }
      return conv;
    },
    onSuccess: () => {
      toast({ title: "WhatsApp message sent", description: waQuoteRef });
      setWaDialogOpen(false);
    },
    onError: (e: Error) => toast({ title: "WhatsApp send failed", description: e.message, variant: "destructive" }),
  });

  const getCustomerName = (id: string) => customers?.find(c => c.id === id)?.name || "—";
  const getCustomer = (id: string) => customers?.find(c => c.id === id);

  return (
    <div className="p-6 space-y-6 overflow-auto h-full">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Sales</h1>
          <p className="text-muted-foreground text-sm mt-1">Manage orders, quotations, and customers</p>
        </div>
        {!isReadOnly && (
          <Button data-testid="button-new-order" onClick={openNewOrder}>
            <Plus className="w-4 h-4 mr-2" />
            New Order
          </Button>
        )}
        {isReadOnly && (
          <Badge variant="outline" className="text-muted-foreground no-default-hover-elevate no-default-active-elevate">View Only</Badge>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-5 flex items-center gap-4">
            <div className="w-10 h-10 rounded-md bg-blue-50 dark:bg-blue-950/30 flex items-center justify-center">
              <ShoppingCart className="w-5 h-5 text-blue-500" />
            </div>
            <div>
              <p className="text-2xl font-bold">{orders?.length ?? 0}</p>
              <p className="text-xs text-muted-foreground">Total Orders</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5 flex items-center gap-4">
            <div className="w-10 h-10 rounded-md bg-emerald-50 dark:bg-emerald-950/30 flex items-center justify-center">
              <FileText className="w-5 h-5 text-emerald-500" />
            </div>
            <div>
              <p className="text-2xl font-bold">{quotations?.length ?? 0}</p>
              <p className="text-xs text-muted-foreground">Quotations</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5 flex items-center gap-4">
            <div className="w-10 h-10 rounded-md bg-violet-50 dark:bg-violet-950/30 flex items-center justify-center">
              <UsersIcon className="w-5 h-5 text-violet-500" />
            </div>
            <div>
              <p className="text-2xl font-bold">{customers?.length ?? 0}</p>
              <p className="text-xs text-muted-foreground">Customers</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs
        value={activeTab}
        onValueChange={(v) => {
          setActiveTab(v);
          // Phase 4 Cleanup F — persist tab in URL; drop ?tab when on default ("orders")
          const params = new URLSearchParams(window.location.search);
          if (v === "orders") params.delete("tab"); else params.set("tab", v);
          const qs = params.toString();
          window.history.replaceState({}, "", `/sales${qs ? `?${qs}` : ""}`);
        }}
        className="space-y-4"
      >
        <TabsList>
          <TabsTrigger value="orders" data-testid="tab-orders">Orders</TabsTrigger>
          <TabsTrigger value="quotations" data-testid="tab-quotations">Quotations</TabsTrigger>
          <TabsTrigger value="customers" data-testid="tab-customers">Customers</TabsTrigger>
        </TabsList>

        <TabsContent value="orders" className="space-y-4">
          <div className="flex items-center gap-2">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Search orders..." className="pl-9" data-testid="input-search-orders" />
            </div>
          </div>
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left p-3 font-medium text-muted-foreground w-8"></th>
                      <th className="text-left p-3 font-medium text-muted-foreground">Order #</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">Customer</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">Date</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">Status</th>
                      <th className="text-right p-3 font-medium text-muted-foreground">Amount</th>
                      <th className="text-right p-3 font-medium text-muted-foreground">Paid</th>
                      <th className="text-right p-3 font-medium text-muted-foreground">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ordersLoading ? (
                      Array.from({ length: 3 }).map((_, i) => (
                        <tr key={i} className="border-b">
                          <td className="p-3"><Skeleton className="h-4 w-4" /></td>
                          <td className="p-3"><Skeleton className="h-4 w-24" /></td>
                          <td className="p-3"><Skeleton className="h-4 w-20" /></td>
                          <td className="p-3"><Skeleton className="h-4 w-20" /></td>
                          <td className="p-3"><Skeleton className="h-4 w-16" /></td>
                          <td className="p-3"><Skeleton className="h-4 w-16 ml-auto" /></td>
                          <td className="p-3"><Skeleton className="h-4 w-16 ml-auto" /></td>
                          <td className="p-3"><Skeleton className="h-4 w-16 ml-auto" /></td>
                        </tr>
                      ))
                    ) : orders && orders.length > 0 ? (
                      orders.map((order) => (
                        <Fragment key={order.id}>
                          <tr className="border-b last:border-0 hover:bg-muted/30 cursor-pointer" data-testid={`row-order-${order.id}`} onClick={() => toggleOrderExpand(order.id)}>
                            <td className="p-3">
                              {expandedOrderId === order.id ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
                            </td>
                            <td className="p-3 font-medium">{order.orderNumber}</td>
                            <td className="p-3 text-muted-foreground">
                              <span className="inline-flex items-center" data-testid={`text-order-customer-${order.id}`}>
                                {getCustomerName(order.customerId)}
                                <CustomerTypeBadge type={getCustomer(order.customerId)?.customerType} />
                              </span>
                            </td>
                            <td className="p-3 text-muted-foreground">{new Date(order.orderDate).toLocaleDateString()}</td>
                            <td className="p-3"><StatusBadge status={order.status} /></td>
                            <td className="p-3 text-right font-medium">₹{Number(order.totalAmount).toLocaleString()}</td>
                            <td className="p-3 text-right text-muted-foreground" data-testid={`text-paid-${order.id}`}>₹{Number(order.paidAmount || 0).toLocaleString()}</td>
                            <td className="p-3 text-right" onClick={(e) => e.stopPropagation()}>
                              {!isReadOnly && (
                                <div className="flex items-center justify-end gap-1">
                                  <Button size="icon" variant="ghost" data-testid={`button-edit-order-${order.id}`} onClick={() => openEditOrder(order)}>
                                    <Pencil className="w-4 h-4" />
                                  </Button>
                                  <Button size="icon" variant="ghost" data-testid={`button-delete-order-${order.id}`} onClick={() => { if (confirm("Delete this order?")) deleteOrderMutation.mutate(order.id); }}>
                                    <Trash2 className="w-4 h-4" />
                                  </Button>
                                </div>
                              )}
                            </td>
                          </tr>
                          {expandedOrderId === order.id && (
                            <tr key={`${order.id}-items`} className="border-b">
                              <td colSpan={8} className="p-0">
                                <div className="bg-muted/20 px-6 py-3 space-y-3">
                                  <div className="pb-1">
                                    <FulfillmentProgressBar status={order.status} deliveryMethod={(order as any).deliveryMethod} />
                                  </div>

                                  {expandedOrderItems.length > 0 ? (
                                    <table className="w-full text-xs">
                                      <thead>
                                        <tr className="text-muted-foreground">
                                          <th className="text-left py-1 font-medium">Type</th>
                                          <th className="text-left py-1 font-medium">Description</th>
                                          <th className="text-right py-1 font-medium">Qty</th>
                                          <th className="text-right py-1 font-medium">Unit Price</th>
                                          <th className="text-right py-1 font-medium">GST%</th>
                                          <th className="text-right py-1 font-medium">Tax (GST)</th>
                                          <th className="text-right py-1 font-medium">Item Total (incl. GST)</th>
                                          {canSeePricing && ["partial", "dispatched", "delivered", "installed", "completed"].includes(order.status) && (
                                            <th className="text-right py-1 font-medium">Est. Margin</th>
                                          )}
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {expandedOrderItems.map((it) => {
                                          const showMarginCol = canSeePricing && ["partial", "dispatched", "delivered", "installed", "completed"].includes(order.status);
                                          const lotMargin = showMarginCol ? orderLotMarginsMap[order.id]?.find(m => m.itemId === it.id) : undefined;
                                          const bundleComps = it.itemType === "bundle" && it.productId ? bundleComponentsMap[it.productId] : undefined;
                                          const colSpan = showMarginCol ? 8 : 7;
                                          return (
                                          <Fragment key={it.id}>
                                          <tr className="border-t border-muted">
                                            <td className="py-1.5">
                                              <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs ${it.itemType === "service" ? "bg-orange-100 text-orange-700 dark:bg-orange-950/40 dark:text-orange-400" : it.itemType === "bundle" ? "bg-purple-100 text-purple-700 dark:bg-purple-950/40 dark:text-purple-400" : "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400"}`}>
                                                {it.itemType === "service" ? <Wrench className="w-3 h-3" /> : it.itemType === "bundle" ? <Boxes className="w-3 h-3" /> : <Package className="w-3 h-3" />}
                                                {it.itemType === "service" ? "Service" : it.itemType === "bundle" ? "Bundle" : "Product"}
                                              </span>
                                            </td>
                                            <td className="py-1.5">{it.description || "—"}</td>
                                            <td className="py-1.5 text-right">{it.quantity}</td>
                                            <td className="py-1.5 text-right">₹{Number(it.unitPrice).toLocaleString()}</td>
                                            <td className="py-1.5 text-right text-muted-foreground">{Number(it.gstRate || 0)}%</td>
                                            <td className="py-1.5 text-right text-blue-600 dark:text-blue-400">
                                              {Number(it.taxAmount || 0) > 0 ? `₹${Number(it.taxAmount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—"}
                                            </td>
                                            <td className="py-1.5 text-right font-medium">₹{(Number(it.totalPrice) + Number(it.taxAmount || 0)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                            {showMarginCol && (
                                              <td className="py-1.5 text-right">
                                                {lotMargin && lotMargin.estimatedMarginPct !== null ? (
                                                  <span className={`font-medium ${lotMargin.estimatedMarginPct < 5 ? "text-red-600 dark:text-red-400" : lotMargin.estimatedMarginPct < 15 ? "text-amber-600 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400"}`} title={`FIFO cost @ dispatch: ₹${lotMargin.blendedCost?.toLocaleString() ?? "—"}`}>
                                                    {lotMargin.estimatedMarginPct.toFixed(1)}%
                                                  </span>
                                                ) : it.itemType === "product" ? (
                                                  <span className="text-muted-foreground">—</span>
                                                ) : null}
                                              </td>
                                            )}
                                          </tr>
                                          {it.itemType === "bundle" && it.productId && (
                                            <tr>
                                              <td colSpan={colSpan} className="pb-2 pt-0.5 pl-8 pr-2">
                                                {!bundleComps ? (
                                                  <div className="text-[11px] text-muted-foreground italic" data-testid={`bundle-loading-ro-${it.id}`}>Loading bundle components…</div>
                                                ) : bundleComps.length === 0 ? (
                                                  <div className="text-[11px] text-amber-700 dark:text-amber-300">This bundle has no components configured.</div>
                                                ) : (
                                                  <div className="rounded border border-blue-200 dark:border-blue-900 bg-blue-50/40 dark:bg-blue-950/20 p-2 space-y-1" data-testid={`bundle-components-ro-${it.id}`}>
                                                    <div className="flex items-center gap-1 text-[11px] font-medium text-blue-700 dark:text-blue-300">
                                                      <Boxes className="w-3 h-3" /> Bundle components × {it.quantity}
                                                    </div>
                                                    {bundleComps.map(row => {
                                                      const compProd = products?.find(p => p.id === row.componentProductId);
                                                      const compStock = inventoryByProduct.get(row.componentProductId) ?? 0;
                                                      const needed = Number(row.quantity) * Number(it.quantity);
                                                      const isShort = compStock < needed;
                                                      return (
                                                        <div key={row.componentProductId} className="flex items-center gap-2 text-[11px] pl-3">
                                                          <span className="text-muted-foreground">{Number(row.quantity)} {row.unit}</span>
                                                          <span>{compProd?.name || row.componentProductId}</span>
                                                          {isShort && (
                                                            <span className="text-red-600 dark:text-red-400 font-medium">(stock: {compStock})</span>
                                                          )}
                                                        </div>
                                                      );
                                                    })}
                                                    <div className="text-[10px] text-muted-foreground pl-3 italic">Invoiced as one line at the bundle GST rate.</div>
                                                  </div>
                                                )}
                                              </td>
                                            </tr>
                                          )}
                                          </Fragment>
                                          );
                                        })}
                                      </tbody>
                                    </table>
                                  ) : (
                                    <p className="text-xs text-muted-foreground">No line items for this order.</p>
                                  )}

                                  {(() => {
                                    // Use server-computed totals as authoritative source of truth
                                    const serverSubtotal = Number(order.subtotal) || 0;
                                    const serverTotalTax = Number(order.totalTax) || 0;
                                    // Fallback: derive from items if server fields are zero (pre-migration orders)
                                    const derivedSubtotal = expandedOrderItems.reduce((s, it) => s + Number(it.totalPrice || 0), 0);
                                    const derivedTax = expandedOrderItems.reduce((s, it) => s + Number(it.taxAmount || 0), 0);
                                    const orderSubtotal = serverSubtotal > 0 ? serverSubtotal : derivedSubtotal;
                                    const orderTax = serverTotalTax > 0 ? serverTotalTax : derivedTax;
                                    const orderDisc = order.discountType && order.discountValue
                                      ? (order.discountType === "percentage" ? orderSubtotal * Number(order.discountValue) / 100 : Math.min(Number(order.discountValue), orderSubtotal))
                                      : 0;
                                    const deliveryCostNum = Number((order as any).deliveryCost) || 0;
                                    return (
                                      <div className="text-xs space-y-0.5 pt-1 border-t mt-2">
                                        <div className="flex justify-between text-muted-foreground" data-testid={`text-order-subtotal-${order.id}`}>
                                          <span>Subtotal (excl. GST)</span>
                                          <span>₹{orderSubtotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                        </div>
                                        {orderDisc > 0 && (
                                          <div className="flex justify-between text-muted-foreground">
                                            <span>Discount ({order.discountType === "percentage" ? `${Number(order.discountValue)}%` : "fixed"})</span>
                                            <span className="text-red-600 dark:text-red-400">- ₹{orderDisc.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                          </div>
                                        )}
                                        {orderTax > 0 && (
                                          <div className="flex justify-between text-blue-600 dark:text-blue-400" data-testid={`text-order-gst-${order.id}`}>
                                            <span>Total GST</span>
                                            <span>+ ₹{orderTax.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                          </div>
                                        )}
                                        {deliveryCostNum > 0 && (
                                          <div className="flex justify-between text-muted-foreground">
                                            <span>Delivery Cost</span>
                                            <span>+ ₹{deliveryCostNum.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                          </div>
                                        )}
                                        <div className="flex justify-between font-semibold border-t pt-0.5" data-testid={`text-order-grand-total-${order.id}`}>
                                          <span>Grand Total</span>
                                          <span>₹{Number(order.totalAmount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                        </div>
                                        {order.warehouseId && warehouses && (
                                          <div className="flex justify-between text-muted-foreground pt-0.5">
                                            <span>Fulfillment Warehouse</span>
                                            <span className="font-medium">{warehouses.find(w => w.id === order.warehouseId)?.name || "—"}</span>
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })()}

                                  {(order as any).deliveryMethod === "delivery" && (
                                    <div className="flex items-start gap-2 p-2 bg-blue-50 dark:bg-blue-950/20 rounded-md mt-2" data-testid={`text-order-delivery-info-${order.id}`}>
                                      <Truck className="w-4 h-4 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
                                      <div className="text-xs">
                                        <span className="font-medium text-blue-700 dark:text-blue-300">Delivery</span>
                                        {(order as any).deliveryCost && Number((order as any).deliveryCost) > 0 && (
                                          <span className="text-blue-600 dark:text-blue-400 ml-2">Cost: ₹{Number((order as any).deliveryCost).toLocaleString()}</span>
                                        )}
                                        {(order as any).deliveryAddress && (
                                          <p className="text-blue-600 dark:text-blue-400 mt-1"><MapPin className="w-3 h-3 inline mr-1" />{(order as any).deliveryAddress}</p>
                                        )}
                                      </div>
                                    </div>
                                  )}

                                  <div className="border-t pt-3 flex flex-wrap items-center gap-4">
                                    <div className="flex items-center gap-4 text-xs">
                                      <span className="font-semibold" data-testid={`text-order-total-${order.id}`}>Total: ₹{Number(order.totalAmount).toLocaleString()}</span>
                                      <span className="text-green-600 dark:text-green-400 font-medium" data-testid={`text-order-paid-${order.id}`}>Paid: ₹{Number(order.paidAmount || 0).toLocaleString()}</span>
                                      <span className="text-amber-600 dark:text-amber-400 font-medium" data-testid={`text-order-balance-${order.id}`}>Balance: ₹{(Number(order.totalAmount) - Number(order.paidAmount || 0)).toLocaleString()}</span>
                                    </div>
                                    <div className="flex items-center gap-2 ml-auto" onClick={(e) => e.stopPropagation()}>
                                      {/* WhatsApp order update button */}
                                      <Button size="sm" variant="ghost" className="text-green-600 hover:text-green-700 hover:bg-green-50 dark:hover:bg-green-950/20" data-testid={`button-wa-order-${order.id}`} title="Send order update via WhatsApp" onClick={() => openWaDialogForOrder(order)}>
                                        <MessageCircle className="w-3.5 h-3.5 mr-1" /> WhatsApp
                                      </Button>
                                      {CHALLAN_CREATE_ELIGIBLE.includes(order.status) && !isReadOnly && (
                                        <Button size="sm" variant="outline" className="border-blue-400 text-blue-600 dark:text-blue-400 dark:border-blue-600" data-testid={`button-create-dispatch-challan-${order.id}`} onClick={() => openDispatchDialog(order.id)}>
                                          <Truck className="w-3 h-3 mr-1" /> Create Dispatch Challan
                                        </Button>
                                      )}
                                      {!isReadOnly && (
                                        <Button size="sm" variant="outline" data-testid={`button-record-payment-${order.id}`} onClick={() => openRecordPayment(order.id)}>
                                          <CreditCard className="w-3 h-3 mr-1" /> Record Payment
                                        </Button>
                                      )}
                                      {!isReadOnly && order.status === "ready_to_ship" && (order as any).deliveryMethod === "pickup" && (
                                        <Button
                                          size="sm"
                                          variant="default"
                                          className="bg-green-600 hover:bg-green-700 text-white"
                                          data-testid={`button-confirm-pickup-${order.id}`}
                                          disabled={confirmPickupMutation.isPending}
                                          onClick={() => { if (confirm("Confirm pickup? This will deduct stock and mark the order as delivered.")) confirmPickupMutation.mutate(order.id); }}
                                        >
                                          <Check className="w-3 h-3 mr-1" /> Confirm Pickup
                                        </Button>
                                      )}
                                      {INVOICE_ELIGIBLE_STATUSES.includes(order.status) && (
                                        <Button
                                          size="sm"
                                          variant="outline"
                                          data-testid={`button-generate-invoice-${order.id}`}
                                          disabled={generateInvoiceMutation.isPending}
                                          onClick={() => { if (confirm("Generate invoice for this order?")) generateInvoiceMutation.mutate(order.id); }}
                                        >
                                          <Receipt className="w-3 h-3 mr-1" /> Generate Invoice
                                        </Button>
                                      )}
                                    </div>
                                  </div>

                                  {order.paymentTerms && (
                                    <div className="text-xs text-muted-foreground">
                                      Payment Terms: {order.paymentTerms}
                                    </div>
                                  )}

                                  {(orderDispatchSummaryMap[order.id] || []).length > 0 && (orderDispatchSummaryMap[order.id] || []).some(i => i.qtyOrdered > 0) && (
                                    <div className="border-t pt-3 space-y-2">
                                      <h4 className="text-xs font-semibold flex items-center gap-2">
                                        <Truck className="w-3 h-3 text-muted-foreground" /> Dispatch Progress
                                      </h4>
                                      <div className="rounded-md border overflow-hidden">
                                        <table className="w-full text-xs">
                                          <thead>
                                            <tr className="bg-muted/40 border-b">
                                              <th className="text-left px-3 py-1.5 font-medium text-muted-foreground">Product</th>
                                              <th className="text-center px-3 py-1.5 font-medium text-muted-foreground">Ordered</th>
                                              <th className="text-center px-3 py-1.5 font-medium text-green-600 dark:text-green-400">Dispatched</th>
                                              <th className="text-center px-3 py-1.5 font-medium text-blue-600 dark:text-blue-400">Remaining</th>
                                            </tr>
                                          </thead>
                                          <tbody>
                                            {(orderDispatchSummaryMap[order.id] || []).map((item, i) => (
                                              <tr key={i} className="border-b last:border-0">
                                                <td className="px-3 py-1.5 font-medium">{item.description || item.productId}</td>
                                                <td className="px-3 py-1.5 text-center text-muted-foreground">{item.qtyOrdered}</td>
                                                <td className="px-3 py-1.5 text-center font-semibold text-green-600 dark:text-green-400">{item.qtyDispatched}</td>
                                                <td className="px-3 py-1.5 text-center font-semibold text-blue-600 dark:text-blue-400">{item.qtyRemaining}</td>
                                              </tr>
                                            ))}
                                          </tbody>
                                        </table>
                                      </div>
                                    </div>
                                  )}

                                  {(orderChallansMap[order.id] || []).length > 0 && (
                                    <div className="border-t pt-3 space-y-2">
                                      <h4 className="text-xs font-semibold flex items-center gap-1">
                                        <Truck className="w-3 h-3" /> Delivery Challans
                                      </h4>
                                      <div className="space-y-2">
                                        {(orderChallansMap[order.id] || []).map((challan: DeliveryChallan) => (
                                          <div key={challan.id} className="border rounded-md p-3 space-y-2 bg-background" data-testid={`challan-${challan.id}`}>
                                            <div className="flex items-center gap-2 flex-wrap">
                                              <span className="text-xs font-medium" data-testid={`text-challan-number-${challan.id}`}>{challan.challanNumber}</span>
                                              {(challan as any).physicalChallanNumber && (
                                                <span className="text-[10px] text-muted-foreground">({(challan as any).physicalChallanNumber})</span>
                                              )}
                                              <StatusBadge status={challan.status} />
                                              <span className="text-xs text-muted-foreground">
                                                {challan.sourceType === "warehouse" ? "Warehouse" : "Supplier"}: {getSourceName(challan.sourceType, challan.sourceId)}
                                              </span>
                                            </div>
                                            <div className="flex items-center gap-4 text-[10px] text-muted-foreground flex-wrap">
                                              {challan.dispatchDate && <span>Dispatched: {new Date(challan.dispatchDate).toLocaleDateString()}</span>}
                                              {challan.deliveryDate && <span>Delivered: {new Date(challan.deliveryDate).toLocaleDateString()}</span>}
                                              {challan.vehicleNumber && <span>Vehicle: {challan.vehicleNumber}</span>}
                                              {(challan as any).vehicleOwnerName && <span>Owner: {(challan as any).vehicleOwnerName}</span>}
                                              {challan.driverName && <span>Driver: {challan.driverName}</span>}
                                              {(challan as any).driverPhone && <span>Ph: {(challan as any).driverPhone}</span>}
                                            </div>
                                            {/* B9 Action row */}
                                            <div className="flex items-center gap-2 pt-1 border-t flex-wrap">
                                              <button
                                                className="text-[10px] text-blue-600 hover:underline flex items-center gap-0.5"
                                                data-testid={`link-view-challan-${challan.id}`}
                                                onClick={(e) => { e.stopPropagation(); navigate(`/inventory?tab=challans&challanId=${challan.id}`); }}
                                              >
                                                <ExternalLink className="w-3 h-3" />View
                                              </button>
                                              {challan.status === "ready" && currentUser?.role === "admin" && (
                                                <button
                                                  className="text-[10px] text-purple-600 hover:underline flex items-center gap-0.5"
                                                  data-testid={`button-issue-do-sales-${challan.id}`}
                                                  onClick={async (e) => {
                                                    e.stopPropagation();
                                                    if (!confirm(`Issue Delivery Order for Challan #${challan.challanNumber}?`)) return;
                                                    const res = await fetch(`/api/delivery-challans/${challan.id}/issue-delivery-order`, { method: "POST", headers: { Authorization: `Bearer ${localStorage.getItem("token")}`, "Content-Type": "application/json" } });
                                                    if (res.ok) {
                                                      const updated = await res.json();
                                                      setOrderChallansMap(prev => ({ ...prev, [order.id]: (prev[order.id] || []).map(c => c.id === challan.id ? updated : c) }));
                                                    }
                                                  }}
                                                >
                                                  <CheckCircle2 className="w-3 h-3" />Issue DO
                                                </button>
                                              )}
                                              {["draft", "ready", "do_issued"].includes(challan.status) && ["admin", "sales_manager"].includes(currentUser?.role ?? "") && (
                                                <button
                                                  className="text-[10px] text-red-500 hover:underline flex items-center gap-0.5"
                                                  data-testid={`button-cancel-sales-challan-${challan.id}`}
                                                  onClick={async (e) => {
                                                    e.stopPropagation();
                                                    const reason = window.prompt(`Cancel Challan #${challan.challanNumber}?\nEnter reason:`);
                                                    if (!reason?.trim()) return;
                                                    const res = await fetch(`/api/delivery-challans/${challan.id}/cancel`, { method: "POST", headers: { Authorization: `Bearer ${localStorage.getItem("token")}`, "Content-Type": "application/json" }, body: JSON.stringify({ cancellationReason: reason }) });
                                                    if (res.ok) {
                                                      const updated = await res.json();
                                                      setOrderChallansMap(prev => ({ ...prev, [order.id]: (prev[order.id] || []).map(c => c.id === challan.id ? updated : c) }));
                                                    }
                                                  }}
                                                >
                                                  <XCircle className="w-3 h-3" />Cancel
                                                </button>
                                              )}
                                              {(challan as any).signedCopyUrl && (
                                                <a
                                                  href={(challan as any).signedCopyUrl}
                                                  target="_blank"
                                                  rel="noreferrer"
                                                  className="text-[10px] text-emerald-600 hover:underline flex items-center gap-0.5"
                                                  data-testid={`link-challan-signed-${challan.id}`}
                                                  onClick={(e) => e.stopPropagation()}
                                                >
                                                  <CheckCircle2 className="w-3 h-3" />Signed Copy
                                                </a>
                                              )}
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={8} className="p-8 text-center text-muted-foreground">
                          No orders yet. Create your first order to get started.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="quotations" className="space-y-4">
          {!isReadOnly && (
            <div className="flex items-center gap-2">
              <Button size="sm" data-testid="button-new-quote" onClick={openNewQuote}>
                <Plus className="w-4 h-4 mr-2" />
                New Quote
              </Button>
            </div>
          )}
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left p-3 font-medium text-muted-foreground w-8"></th>
                      <th className="text-left p-3 font-medium text-muted-foreground">Quote #</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">Customer</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">Status</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">Valid Until</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">Next Follow-up</th>
                      <th className="text-right p-3 font-medium text-muted-foreground">Amount</th>
                      <th className="text-right p-3 font-medium text-muted-foreground">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {quotationsLoading ? (
                      <tr><td colSpan={8} className="p-3"><Skeleton className="h-4 w-full" /></td></tr>
                    ) : quotations && quotations.length > 0 ? (
                      quotations.map((q) => {
                        const nextFu = getNextFollowup(q.id);
                        const nextFuOverdue = nextFu ? isOverdue(nextFu.dueDate) : false;
                        const nextFuToday = nextFu ? isToday(nextFu.dueDate) : false;
                        return (
                        <Fragment key={q.id}>
                          <tr className="border-b last:border-0 hover:bg-muted/30 cursor-pointer" data-testid={`row-quote-${q.id}`} onClick={() => toggleQuoteExpand(q.id)}>
                            <td className="p-3">
                              {expandedQuoteId === q.id ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
                            </td>
                            <td className="p-3 font-medium">{q.quoteNumber}</td>
                            <td className="p-3 text-muted-foreground">
                              <span className="inline-flex items-center" data-testid={`text-quote-customer-${q.id}`}>
                                {getCustomerName(q.customerId)}
                                <CustomerTypeBadge type={getCustomer(q.customerId)?.customerType} />
                              </span>
                            </td>
                            <td className="p-3"><StatusBadge status={q.status} /></td>
                            <td className="p-3 text-muted-foreground">{q.validUntil ? new Date(q.validUntil).toLocaleDateString() : "—"}</td>
                            <td className="p-3" data-testid={`text-quote-next-followup-${q.id}`}>
                              {nextFu ? (
                                <span className={`text-xs font-medium ${nextFuOverdue ? "text-red-600 dark:text-red-400" : nextFuToday ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground"}`}>
                                  {new Date(nextFu.dueDate).toLocaleDateString()}
                                </span>
                              ) : (
                                <span className="text-muted-foreground text-xs">—</span>
                              )}
                            </td>
                            <td className="p-3 text-right font-medium">₹{Number(q.totalAmount).toLocaleString()}</td>
                            <td className="p-3 text-right" onClick={(e) => e.stopPropagation()}>
                              <div className="flex items-center justify-end gap-1">
                                {!isReadOnly && q.status !== "accepted" && (
                                  <Button size="icon" variant="ghost" title="Convert to Order" data-testid={`button-convert-quote-${q.id}`}
                                    disabled={convertToOrderMutation.isPending || convertingQuoteId === q.id}
                                    onClick={async () => {
                                      setConvertingQuoteId(q.id);
                                      try {
                                        const result = await fetch(`/api/customers/${q.customerId}/outstanding`, {
                                          headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
                                        }).then((r) => r.json());
                                        if (result.outstanding > 0) {
                                          if (isAdmin) {
                                            setDuesOverrideDialog({
                                              outstanding: result.outstanding,
                                              invoices: result.invoices ?? [],
                                              customerName: customers?.find((c) => c.id === q.customerId)?.name,
                                              quotationId: q.id,
                                              newOrderTotal: Number(q.totalAmount),
                                            });
                                            setDuesOverrideReason("");
                                          } else {
                                            toast({
                                              title: "Cannot Convert to Sales Order",
                                              description: `Customer has ₹${result.outstanding.toLocaleString("en-IN", { minimumFractionDigits: 2 })} outstanding. Contact admin to authorize.`,
                                              variant: "destructive",
                                            });
                                          }
                                        } else {
                                          convertToOrderMutation.mutate({ id: q.id });
                                        }
                                      } catch {
                                        convertToOrderMutation.mutate({ id: q.id });
                                      } finally {
                                        setConvertingQuoteId(null);
                                      }
                                    }}>
                                    <ArrowRightLeft className="w-4 h-4" />
                                  </Button>
                                )}
                                <Button size="icon" variant="ghost" title="Download PDF" data-testid={`button-download-quote-${q.id}`} onClick={() => downloadQuotePDF(q)}>
                                  <Download className="w-4 h-4" />
                                </Button>
                                <Button size="icon" variant="ghost" title="Send via WhatsApp" data-testid={`button-wa-quote-${q.id}`} className="text-green-600 hover:text-green-700 hover:bg-green-50 dark:hover:bg-green-950/20" onClick={() => openWaDialog(q)}>
                                  <MessageCircle className="w-4 h-4" />
                                </Button>
                                {!isReadOnly && (
                                  <Button size="icon" variant="ghost" data-testid={`button-edit-quote-${q.id}`} onClick={() => openEditQuote(q)}>
                                    <Pencil className="w-4 h-4" />
                                  </Button>
                                )}
                                {!isReadOnly && (
                                  <Button size="icon" variant="ghost" data-testid={`button-delete-quote-${q.id}`} onClick={() => { if (confirm("Delete this quotation?")) deleteQuoteMutation.mutate(q.id); }}>
                                    <Trash2 className="w-4 h-4" />
                                  </Button>
                                )}
                              </div>
                            </td>
                          </tr>
                          {expandedQuoteId === q.id && (
                            <tr key={`${q.id}-items`} className="border-b">
                              <td colSpan={8} className="p-0">
                                <div className="bg-muted/20 px-6 py-3 space-y-4">
                                  {expandedQuoteItems.length > 0 ? (
                                    <table className="w-full text-xs">
                                      <thead>
                                        <tr className="text-muted-foreground">
                                          <th className="text-left py-1 font-medium">Type</th>
                                          <th className="text-left py-1 font-medium">Description</th>
                                          <th className="text-right py-1 font-medium">Qty</th>
                                          <th className="text-right py-1 font-medium">Unit Price</th>
                                          <th className="text-right py-1 font-medium">Total</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {expandedQuoteItems.map((it) => (
                                          <tr key={it.id} className="border-t border-muted">
                                            <td className="py-1.5">
                                              <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs ${it.itemType === "service" ? "bg-orange-100 text-orange-700 dark:bg-orange-950/40 dark:text-orange-400" : it.itemType === "bundle" ? "bg-purple-100 text-purple-700 dark:bg-purple-950/40 dark:text-purple-400" : "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400"}`}>
                                                {it.itemType === "service" ? <Wrench className="w-3 h-3" /> : it.itemType === "bundle" ? <Boxes className="w-3 h-3" /> : <Package className="w-3 h-3" />}
                                                {it.itemType === "service" ? "Service" : it.itemType === "bundle" ? "Bundle" : "Product"}
                                              </span>
                                            </td>
                                            <td className="py-1.5">{it.description || "—"}</td>
                                            <td className="py-1.5 text-right">{it.quantity}</td>
                                            <td className="py-1.5 text-right">₹{Number(it.unitPrice).toLocaleString()}</td>
                                            <td className="py-1.5 text-right font-medium">₹{Number(it.totalPrice).toLocaleString()}</td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  ) : (
                                    <p className="text-xs text-muted-foreground">No line items for this quotation.</p>
                                  )}
                                  {q.discountType && q.discountValue && (
                                    <div className="text-xs text-muted-foreground">
                                      Discount: {q.discountType === "percentage" ? `${Number(q.discountValue)}%` : `₹${Number(q.discountValue).toLocaleString()}`}
                                    </div>
                                  )}

                                  {(q as any).deliveryMethod === "delivery" && (
                                    <div className="flex items-start gap-2 p-2 bg-blue-50 dark:bg-blue-950/20 rounded-md mt-2" data-testid={`text-quote-delivery-info-${q.id}`}>
                                      <Truck className="w-4 h-4 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
                                      <div className="text-xs">
                                        <span className="font-medium text-blue-700 dark:text-blue-300">Delivery</span>
                                        {(q as any).deliveryCost && Number((q as any).deliveryCost) > 0 && (
                                          <span className="text-blue-600 dark:text-blue-400 ml-2">Cost: ₹{Number((q as any).deliveryCost).toLocaleString()}</span>
                                        )}
                                        {(q as any).deliveryAddress && (
                                          <p className="text-blue-600 dark:text-blue-400 mt-1"><MapPin className="w-3 h-3 inline mr-1" />{(q as any).deliveryAddress}</p>
                                        )}
                                      </div>
                                    </div>
                                  )}

                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-t pt-4">
                                    <div className="space-y-3">
                                      <div className="flex items-center justify-between gap-2">
                                        <h4 className="text-xs font-semibold">Activity Log</h4>
                                        <Button
                                          size="sm"
                                          variant="outline"
                                          onClick={(e) => { e.stopPropagation(); setShowQuoteActivityForm(!showQuoteActivityForm); }}
                                          data-testid={`button-log-quote-activity-${q.id}`}
                                        >
                                          <Plus className="w-3 h-3 mr-1" /> Log Activity
                                        </Button>
                                      </div>

                                      {showQuoteActivityForm && (
                                        <div className="border rounded-md p-3 space-y-2 bg-background" onClick={(e) => e.stopPropagation()}>
                                          <div>
                                            <Label className="text-xs">Type</Label>
                                            <Select value={quoteActivityForm.activityType} onValueChange={(v) => setQuoteActivityForm({ ...quoteActivityForm, activityType: v })}>
                                              <SelectTrigger className="h-8 text-xs" data-testid={`select-quote-activity-type-${q.id}`}>
                                                <SelectValue />
                                              </SelectTrigger>
                                              <SelectContent>
                                                <SelectItem value="call">Call</SelectItem>
                                                <SelectItem value="email">Email</SelectItem>
                                                <SelectItem value="meeting">Meeting</SelectItem>
                                                <SelectItem value="site_visit">Site Visit</SelectItem>
                                                <SelectItem value="whatsapp">WhatsApp</SelectItem>
                                                <SelectItem value="note">Note</SelectItem>
                                              </SelectContent>
                                            </Select>
                                          </div>
                                          <div>
                                            <Label className="text-xs">Notes</Label>
                                            <Textarea
                                              className="text-xs resize-none"
                                              rows={2}
                                              value={quoteActivityForm.notes}
                                              onChange={(e) => setQuoteActivityForm({ ...quoteActivityForm, notes: e.target.value })}
                                              placeholder="Activity notes..."
                                              data-testid={`input-quote-activity-notes-${q.id}`}
                                            />
                                          </div>
                                          <div className="flex items-center gap-2 justify-end">
                                            <Button size="sm" variant="ghost" onClick={() => setShowQuoteActivityForm(false)} data-testid={`button-cancel-quote-activity-${q.id}`}>Cancel</Button>
                                            <Button
                                              size="sm"
                                              disabled={!quoteActivityForm.notes || quoteActivityMutation.isPending}
                                              onClick={() => quoteActivityMutation.mutate({ quoteId: q.id, data: quoteActivityForm })}
                                              data-testid={`button-save-quote-activity-${q.id}`}
                                            >
                                              {quoteActivityMutation.isPending ? "Saving..." : "Save"}
                                            </Button>
                                          </div>
                                        </div>
                                      )}

                                      <div className="space-y-2 max-h-48 overflow-y-auto">
                                        {expandedQuoteActivities.length === 0 ? (
                                          <p className="text-xs text-muted-foreground">No activities logged yet.</p>
                                        ) : (
                                          expandedQuoteActivities.map((act) => {
                                            const IconComp = ACTIVITY_ICONS[act.activityType] || StickyNote;
                                            return (
                                              <div key={act.id} className="flex items-start gap-2 text-xs" data-testid={`quote-activity-${act.id}`}>
                                                <div className="w-6 h-6 rounded-md bg-muted flex items-center justify-center shrink-0 mt-0.5">
                                                  <IconComp className="w-3 h-3 text-muted-foreground" />
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                  <p className="font-medium capitalize">{act.activityType.replace("_", " ")}</p>
                                                  <p className="text-muted-foreground">{act.notes}</p>
                                                  <p className="text-muted-foreground text-[10px]">{getRelativeTime(act.createdAt)}</p>
                                                </div>
                                              </div>
                                            );
                                          })
                                        )}
                                      </div>
                                    </div>

                                    <div className="space-y-3">
                                      <div className="flex items-center justify-between gap-2">
                                        <h4 className="text-xs font-semibold">Follow-ups</h4>
                                        <Button
                                          size="sm"
                                          variant="outline"
                                          onClick={(e) => { e.stopPropagation(); setShowQuoteFollowupForm(!showQuoteFollowupForm); }}
                                          data-testid={`button-schedule-quote-followup-${q.id}`}
                                        >
                                          <CalendarDays className="w-3 h-3 mr-1" /> Schedule
                                        </Button>
                                      </div>

                                      {showQuoteFollowupForm && (
                                        <div className="border rounded-md p-3 space-y-2 bg-background" onClick={(e) => e.stopPropagation()}>
                                          <div>
                                            <Label className="text-xs">Title</Label>
                                            <Input
                                              className="h-8 text-xs"
                                              value={quoteFollowupForm.title}
                                              onChange={(e) => setQuoteFollowupForm({ ...quoteFollowupForm, title: e.target.value })}
                                              placeholder="Follow-up title..."
                                              data-testid={`input-quote-followup-title-${q.id}`}
                                            />
                                          </div>
                                          <div className="grid grid-cols-2 gap-2">
                                            <div>
                                              <Label className="text-xs">Due Date</Label>
                                              <Input
                                                className="h-8 text-xs"
                                                type="date"
                                                value={quoteFollowupForm.dueDate}
                                                onChange={(e) => setQuoteFollowupForm({ ...quoteFollowupForm, dueDate: e.target.value })}
                                                data-testid={`input-quote-followup-date-${q.id}`}
                                              />
                                            </div>
                                            <div>
                                              <Label className="text-xs">Priority</Label>
                                              <Select value={quoteFollowupForm.priority} onValueChange={(v) => setQuoteFollowupForm({ ...quoteFollowupForm, priority: v })}>
                                                <SelectTrigger className="h-8 text-xs" data-testid={`select-quote-followup-priority-${q.id}`}>
                                                  <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                  <SelectItem value="high">High</SelectItem>
                                                  <SelectItem value="medium">Medium</SelectItem>
                                                  <SelectItem value="low">Low</SelectItem>
                                                </SelectContent>
                                              </Select>
                                            </div>
                                          </div>
                                          <div className="flex items-center gap-2 justify-end">
                                            <Button size="sm" variant="ghost" onClick={() => setShowQuoteFollowupForm(false)} data-testid={`button-cancel-quote-followup-${q.id}`}>Cancel</Button>
                                            <Button
                                              size="sm"
                                              disabled={!quoteFollowupForm.title || !quoteFollowupForm.dueDate || quoteFollowupMutation.isPending}
                                              onClick={() => quoteFollowupMutation.mutate({ quoteId: q.id, data: quoteFollowupForm })}
                                              data-testid={`button-save-quote-followup-${q.id}`}
                                            >
                                              {quoteFollowupMutation.isPending ? "Saving..." : "Save"}
                                            </Button>
                                          </div>
                                        </div>
                                      )}

                                      <div className="space-y-2 max-h-48 overflow-y-auto">
                                        {expandedQuoteFollowups.length === 0 ? (
                                          <p className="text-xs text-muted-foreground">No follow-ups scheduled.</p>
                                        ) : (
                                          expandedQuoteFollowups.map((fu) => {
                                            const fuOverdue = fu.status === "pending" && isOverdue(fu.dueDate);
                                            const fuToday = fu.status === "pending" && isToday(fu.dueDate);
                                            return (
                                              <div
                                                key={fu.id}
                                                className={`flex items-center gap-2 text-xs border rounded-md p-2 ${fuOverdue ? "border-red-300 bg-red-50 dark:border-red-800 dark:bg-red-950/20" : ""}`}
                                                data-testid={`quote-followup-${fu.id}`}
                                              >
                                                <div className="flex-1 min-w-0">
                                                  <div className="flex items-center gap-2 flex-wrap">
                                                    <span className={`font-medium ${fu.status === "completed" ? "line-through text-muted-foreground" : ""}`}>{fu.title}</span>
                                                    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${PRIORITY_COLORS[fu.priority] || PRIORITY_COLORS.medium}`}>
                                                      {fu.priority.charAt(0).toUpperCase() + fu.priority.slice(1)}
                                                    </span>
                                                    {fu.status === "completed" && (
                                                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0">Completed</Badge>
                                                    )}
                                                  </div>
                                                  <p className={`text-[10px] mt-0.5 ${fuOverdue ? "text-red-600 dark:text-red-400 font-medium" : fuToday ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground"}`}>
                                                    {fuOverdue ? "OVERDUE — " : fuToday ? "TODAY — " : ""}{new Date(fu.dueDate).toLocaleDateString()}
                                                  </p>
                                                </div>
                                                {fu.status === "pending" && (
                                                  <Button
                                                    size="icon"
                                                    variant="ghost"
                                                    className="shrink-0"
                                                    onClick={(e) => { e.stopPropagation(); completeQuoteFollowupMutation.mutate({ followupId: fu.id, quoteId: q.id }); }}
                                                    disabled={completeQuoteFollowupMutation.isPending}
                                                    data-testid={`button-complete-quote-followup-${fu.id}`}
                                                  >
                                                    <Check className="w-4 h-4 text-green-600" />
                                                  </Button>
                                                )}
                                              </div>
                                            );
                                          })
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </Fragment>
                        );
                      })
                    ) : (
                      <tr>
                        <td colSpan={8} className="p-8 text-center text-muted-foreground">No quotations found.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="customers" className="space-y-4">
          <div className="flex items-center gap-2 flex-wrap">
            {!isReadOnly && (
              <Button size="sm" data-testid="button-new-customer" onClick={openNewCustomer}>
                <Plus className="w-4 h-4 mr-2" />
                New Customer
              </Button>
            )}
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search by name, email, phone, GST..."
                className="pl-9"
                value={customerSearchQuery}
                onChange={(e) => setCustomerSearchQuery(e.target.value)}
                data-testid="input-search-customers"
              />
            </div>
            <Select value={customerTypeFilter} onValueChange={setCustomerTypeFilter}>
              <SelectTrigger className="w-48" data-testid="select-customer-type-filter">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__" data-testid="option-customer-filter-all">All Customers</SelectItem>
                <SelectItem value="end_user" data-testid="option-customer-filter-end_user">End User</SelectItem>
                <SelectItem value="business" data-testid="option-customer-filter-business">Business</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {(() => {
            const filteredCustomers = (customers ?? []).filter((c) => {
              const ct = c.customerType === "business" ? "business" : "end_user";
              if (customerTypeFilter !== "__all__" && ct !== customerTypeFilter) return false;
              if (!customerSearchQuery) return true;
              const q = customerSearchQuery.toLowerCase();
              return (
                c.name.toLowerCase().includes(q) ||
                (c.email || "").toLowerCase().includes(q) ||
                (c.phone || "").toLowerCase().includes(q) ||
                (c.gstNumber || "").toLowerCase().includes(q) ||
                (c.contactPerson || "").toLowerCase().includes(q)
              );
            });
            return (
              <Card>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left p-3 font-medium text-muted-foreground">Name</th>
                          <th className="text-left p-3 font-medium text-muted-foreground">Type</th>
                          <th className="text-left p-3 font-medium text-muted-foreground">Email</th>
                          <th className="text-left p-3 font-medium text-muted-foreground">Phone</th>
                          <th className="text-left p-3 font-medium text-muted-foreground">GST</th>
                          <th className="text-right p-3 font-medium text-muted-foreground">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {customersLoading ? (
                          <tr><td colSpan={6} className="p-3"><Skeleton className="h-4 w-full" /></td></tr>
                        ) : filteredCustomers.length > 0 ? (
                          filteredCustomers.map((c) => (
                            <tr key={c.id} className="border-b last:border-0" data-testid={`row-customer-${c.id}`}>
                              <td className="p-3 font-medium" data-testid={`text-customer-name-${c.id}`}>{c.name}</td>
                              <td className="p-3"><CustomerTypeBadge type={c.customerType} /></td>
                              <td className="p-3 text-muted-foreground">{c.email || "—"}</td>
                              <td className="p-3 text-muted-foreground">{c.phone || "—"}</td>
                              <td className="p-3 text-muted-foreground">{c.gstNumber || "—"}</td>
                              <td className="p-3 text-right">
                                {!isReadOnly && (
                                  <div className="flex items-center justify-end gap-1">
                                    <Button size="icon" variant="ghost" data-testid={`button-edit-customer-${c.id}`} onClick={() => openEditCustomer(c)}>
                                      <Pencil className="w-4 h-4" />
                                    </Button>
                                    <Button size="icon" variant="ghost" data-testid={`button-delete-customer-${c.id}`} onClick={() => { if (confirm("Delete this customer?")) deleteCustomerMutation.mutate(c.id); }}>
                                      <Trash2 className="w-4 h-4" />
                                    </Button>
                                  </div>
                                )}
                              </td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan={6} className="p-8 text-center text-muted-foreground">
                              {customerSearchQuery || customerTypeFilter !== "__all__" ? "No customers match your filters." : "No customers found."}
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            );
          })()}
        </TabsContent>
      </Tabs>

      <Dialog open={orderDialogOpen} onOpenChange={setOrderDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingOrder ? "Edit Order" : "New Order"}</DialogTitle>
            <DialogDescription>Add products and services to this order</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="orderNumber">Order Number</Label>
                <Input id="orderNumber" data-testid="input-order-number" value={orderForm.orderNumber} onChange={(e) => setOrderForm({ ...orderForm, orderNumber: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="orderCustomerId">Customer</Label>
                <Select value={orderForm.customerId} onValueChange={(v) => setOrderForm({ ...orderForm, customerId: v })}>
                  <SelectTrigger data-testid="select-order-customer">
                    <SelectValue placeholder="Select customer" />
                  </SelectTrigger>
                  <SelectContent>
                    {customers?.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="orderStatus">Status</Label>
                <Select value={orderForm.status} onValueChange={(v) => setOrderForm({ ...orderForm, status: v })}>
                  <SelectTrigger data-testid="select-order-status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ORDER_STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>{s.split("_").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ")}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="orderNotes">Notes</Label>
                <Input id="orderNotes" data-testid="input-order-notes" value={orderForm.notes} onChange={(e) => setOrderForm({ ...orderForm, notes: e.target.value })} />
              </div>
            </div>
            {/* Phase 5 — Subsidy Scheme */}
            <div className="space-y-2">
              <Label htmlFor="orderSubsidyScheme">Subsidy Scheme <span className="text-muted-foreground font-normal text-xs">(applies to entire order)</span></Label>
              <Select value={orderForm.subsidyScheme} onValueChange={(v) => setOrderForm({ ...orderForm, subsidyScheme: v })}>
                <SelectTrigger id="orderSubsidyScheme" data-testid="select-order-subsidy-scheme" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SUBSIDY_SCHEMES.map((s) => (
                    <SelectItem key={s} value={s}>{s === "none" ? "None (no subsidy)" : s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {orderForm.subsidyScheme !== "none" && (
                <p className="text-xs text-amber-700 dark:text-amber-400 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3 shrink-0" />
                  Subsidy active — ALMM/DCR requirements apply to Solar Panel lines below.
                </p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="orderPaymentTerms">Payment Terms</Label>
                <Input id="orderPaymentTerms" data-testid="input-order-payment-terms" placeholder="e.g. 50% advance, 30% delivery, 20% installation" value={orderForm.paymentTerms} onChange={(e) => setOrderForm({ ...orderForm, paymentTerms: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="orderAdvanceAmount">Advance Amount (₹)</Label>
                <Input id="orderAdvanceAmount" data-testid="input-order-advance-amount" type="number" min="0" step="0.01" value={orderForm.advanceAmount} onChange={(e) => setOrderForm({ ...orderForm, advanceAmount: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="orderExpectedDeliveryDate">Expected Delivery Date</Label>
                <Input id="orderExpectedDeliveryDate" data-testid="input-order-expected-delivery" type="date" value={orderForm.expectedDeliveryDate} onChange={(e) => setOrderForm({ ...orderForm, expectedDeliveryDate: e.target.value })} />
              </div>
            </div>
            <div className="space-y-3 rounded-lg border p-3">
              <Label className="text-sm font-semibold flex items-center gap-2"><Truck className="w-4 h-4" /> Delivery Method</Label>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" name="orderDeliveryMethod" data-testid="radio-order-pickup" value="pickup" checked={orderForm.deliveryMethod === "pickup"} onChange={() => setOrderForm({ ...orderForm, deliveryMethod: "pickup", deliveryCost: "", deliveryAddress: "" })} />
                  <span className="text-sm">Pickup (No delivery cost)</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" name="orderDeliveryMethod" data-testid="radio-order-delivery" value="delivery" checked={orderForm.deliveryMethod === "delivery"} onChange={() => setOrderForm({ ...orderForm, deliveryMethod: "delivery" })} />
                  <span className="text-sm">Delivery</span>
                </label>
              </div>
              {orderForm.deliveryMethod === "delivery" && (
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="orderDeliveryCost">Delivery / Logistics Cost (₹)</Label>
                    <Input id="orderDeliveryCost" type="number" min="0" step="0.01" data-testid="input-order-delivery-cost" value={orderForm.deliveryCost} onChange={(e) => setOrderForm({ ...orderForm, deliveryCost: e.target.value })} placeholder="0.00" />
                  </div>
                  <div className="space-y-2 col-span-2">
                    <Label htmlFor="orderDeliveryAddress">Delivery Address</Label>
                    <Textarea id="orderDeliveryAddress" data-testid="input-order-delivery-address" value={orderForm.deliveryAddress} onChange={(e) => setOrderForm({ ...orderForm, deliveryAddress: e.target.value })} placeholder="Enter delivery address" rows={2} />
                  </div>
                </div>
              )}
            </div>
            {warehouses && warehouses.length > 0 && (
              <div className="space-y-2">
                <Label htmlFor="orderWarehouse">Fulfillment Warehouse <span className="text-muted-foreground font-normal">(optional)</span></Label>
                <Select value={orderForm.warehouseId || "none"} onValueChange={(v) => setOrderForm({ ...orderForm, warehouseId: v === "none" ? "" : v })}>
                  <SelectTrigger data-testid="select-order-warehouse">
                    <SelectValue placeholder="Any warehouse" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Any warehouse</SelectItem>
                    {warehouses.map((w) => (
                      <SelectItem key={w.id} value={w.id}>{w.name}{w.location ? ` — ${w.location}` : ""}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <LineItemsEditor
              items={orderItems}
              onChange={setOrderItems}
              products={products || []}
              discount={orderDiscount}
              onDiscountChange={setOrderDiscount}
              effectivePrices={effectivePrices}
              subsidyScheme={orderForm.subsidyScheme}
              customer={customers?.find(c => c.id === orderForm.customerId)}
              touchedLineIndices={orderTouchedLines}
              onLineTouched={handleOrderLineTouched}
              bundleComponentsMap={bundleComponentsMap}
              loadBundleComponents={loadBundleComponents}
              inventoryByProduct={inventoryByProduct}
              deliveryCost={orderForm.deliveryMethod === "delivery" && orderForm.deliveryCost ? Number(orderForm.deliveryCost) : 0}
            />
          </div>
          {(() => {
            const almmBlocked = findAlmmHardBlockIndices(orderItems, products, orderForm.subsidyScheme, orderTouchedLines);
            const floorBlocked = findBelowFloorBlockIndices(orderItems, effectivePrices, orderTouchedLines);
            // Phase 4 Cleanup A — Path B: admin can override below-floor lines with a reason (≥10 chars)
            const floorReasonOk = orderFloorOverrideReason.trim().length >= 10;
            const adminCanOverrideFloor = isAdmin && floorReasonOk;
            const floorBlocksSave = floorBlocked.length > 0 && !adminCanOverrideFloor;
            const anySaveBlocked = almmBlocked.length > 0 || floorBlocksSave;

            // E4: dues gate — only for new orders (not edits)
            const duesAmt = !editingOrder ? (orderCustomerOutstanding?.outstanding ?? 0) : 0;
            const duesInvoices = !editingOrder ? (orderCustomerOutstanding?.invoices ?? []) : [];
            const hasDues = duesAmt > 0;
            const newOrderTotal = orderItems.reduce((s, it) => s + Number(it.unitPrice || 0) * Number(it.quantity || 0) * (1 + Number((it as any).gstRate || 0) / 100), 0);
            const selectedCustomer = customers?.find(c => c.id === orderForm.customerId);

            return (
              <>
                {almmBlocked.length > 0 && (
                  <div className="mt-2 flex items-start gap-2 text-xs bg-red-50 dark:bg-red-950/30 border border-red-300 dark:border-red-800 rounded px-3 py-2 text-red-800 dark:text-red-300" data-testid="banner-order-almm-block">
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>Cannot save: line{almmBlocked.length > 1 ? "s" : ""} {almmBlocked.map(i => `#${i + 1}`).join(", ")} use a non-ALMM panel under an active subsidy scheme. Pick an ALMM panel or set the subsidy scheme to "None".</span>
                  </div>
                )}
                {floorBlocked.length > 0 && (
                  <div
                    className={`mt-2 rounded border px-3 py-2 text-xs ${isAdmin
                      ? "bg-amber-50 dark:bg-amber-950/20 border-amber-300 dark:border-amber-800 text-amber-800 dark:text-amber-300"
                      : "bg-red-50 dark:bg-red-950/30 border-red-300 dark:border-red-800 text-red-800 dark:text-red-300"}`}
                    data-testid="banner-order-floor-block"
                  >
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                      <div className="space-y-0.5 flex-1">
                        <span className="font-semibold">
                          {isAdmin
                            ? `${floorBlocked.length} line${floorBlocked.length > 1 ? "s" : ""} below floor — admin override required.`
                            : "Cannot save: some lines are below floor price."}
                        </span>
                        {floorBlocked.map(b => (
                          <div key={b.idx}>
                            • {b.productName}: ₹{b.unitPrice.toLocaleString("en-IN")} (floor ₹{b.floorPrice.toLocaleString("en-IN")} — short by ₹{Math.round(b.floorPrice - b.unitPrice).toLocaleString("en-IN")})
                          </div>
                        ))}
                        {!isAdmin && (
                          <div className="mt-0.5 opacity-80">Adjust prices at or above floor before saving, or contact admin to override.</div>
                        )}
                      </div>
                    </div>
                    {isAdmin && (
                      <div className="mt-2 space-y-1">
                        <Label className="text-xs font-semibold">Override Reason <span className="font-normal opacity-75">(min 10 chars, required to save)</span></Label>
                        <Textarea
                          value={orderFloorOverrideReason}
                          onChange={(e) => setOrderFloorOverrideReason(e.target.value)}
                          placeholder="Explain why these lines are priced below floor (e.g. strategic loss-leader, customer-specific deal, clearance)..."
                          rows={2}
                          className="text-xs bg-white dark:bg-background"
                          data-testid="input-order-floor-override-reason"
                        />
                      </div>
                    )}
                  </div>
                )}

                {/* E4: Outstanding dues banner */}
                {hasDues && !editingOrder && (
                  <div
                    className={`mt-2 rounded border px-3 py-2 text-xs ${isAdmin
                      ? "bg-amber-50 dark:bg-amber-950/20 border-amber-300 dark:border-amber-800 text-amber-800 dark:text-amber-300"
                      : "bg-red-50 dark:bg-red-950/30 border-red-300 dark:border-red-800 text-red-800 dark:text-red-300"}`}
                    data-testid="banner-dues-block"
                  >
                    <div className="flex items-start gap-2 mb-2">
                      <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                      <span className="font-semibold">
                        {isAdmin
                          ? `Customer has ₹${duesAmt.toLocaleString("en-IN", { minimumFractionDigits: 2 })} in unpaid invoices. Override required to create order.`
                          : `⚠ Customer has ₹${duesAmt.toLocaleString("en-IN", { minimumFractionDigits: 2 })} in unpaid invoices. Cannot create new order until dues are cleared.`}
                      </span>
                    </div>
                    {duesInvoices.length > 0 && (
                      <table className="w-full text-xs border-collapse">
                        <thead>
                          <tr className="border-b border-current opacity-50">
                            <th className="text-left py-0.5 pr-2 font-medium">Invoice #</th>
                            <th className="text-left py-0.5 pr-2 font-medium">Date</th>
                            <th className="text-right py-0.5 font-medium">Balance</th>
                          </tr>
                        </thead>
                        <tbody>
                          {duesInvoices.map((inv) => (
                            <tr key={inv.id} className="border-b border-current opacity-30">
                              <td className="py-0.5 pr-2 font-mono">{inv.invoiceNumber}</td>
                              <td className="py-0.5 pr-2">{new Date(inv.invoiceDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</td>
                              <td className="py-0.5 text-right">₹{inv.balance.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                    {!isAdmin && (
                      <p className="mt-1 opacity-75">Contact admin to override this restriction.</p>
                    )}
                  </div>
                )}

                <DialogFooter>
                  {hasDues && !editingOrder && isAdmin ? (
                    <Button
                      data-testid="button-override-dues-order"
                      variant="outline"
                      className="border-amber-400 text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/30"
                      disabled={anySaveBlocked || orderMutation.isPending}
                      onClick={() => {
                        setDuesOverrideDialog({
                          outstanding: duesAmt,
                          pendingOrderData: orderForm,
                          invoices: duesInvoices,
                          customerName: selectedCustomer?.name,
                          newOrderTotal,
                        });
                        setDuesOverrideReason("");
                      }}
                    >
                      Create SO (Override Dues)
                    </Button>
                  ) : (
                    <span title={hasDues && !editingOrder && !isAdmin ? "Customer has outstanding dues. Contact admin for override." : undefined}>
                      <Button
                        data-testid="button-submit-order"
                        disabled={orderMutation.isPending || anySaveBlocked || (hasDues && !editingOrder && !isAdmin)}
                        onClick={() => orderMutation.mutate(orderForm)}
                      >
                        {orderMutation.isPending ? "Saving..." : editingOrder ? "Update Order" : "Create Order"}
                      </Button>
                    </span>
                  )}
                </DialogFooter>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>

      <Dialog open={quoteDialogOpen} onOpenChange={setQuoteDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingQuote ? `Edit Quotation — ${(editingQuote as any).quoteNumber}` : "New Quotation"}</DialogTitle>
            <DialogDescription>{editingQuote ? "Update the details of this quotation" : "Quote number is auto-assigned on save"}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="quoteCustomerId">Customer</Label>
                <Select value={quoteForm.customerId} onValueChange={(v) => setQuoteForm({ ...quoteForm, customerId: v })}>
                  <SelectTrigger data-testid="select-quote-customer">
                    <SelectValue placeholder="Select customer" />
                  </SelectTrigger>
                  <SelectContent>
                    {customers?.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="quoteStatus">Status</Label>
                <Select value={quoteForm.status} onValueChange={(v) => setQuoteForm({ ...quoteForm, status: v })}>
                  <SelectTrigger data-testid="select-quote-status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {["draft", "sent", "accepted", "rejected"].map((s) => (
                      <SelectItem key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="quoteValidUntil">Valid Until</Label>
                <Input id="quoteValidUntil" type="date" data-testid="input-quote-valid-until" value={quoteForm.validUntil} onChange={(e) => setQuoteForm({ ...quoteForm, validUntil: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="quoteExpectedDelivery">Expected Delivery Date</Label>
                <Input id="quoteExpectedDelivery" type="date" data-testid="input-quote-expected-delivery" value={quoteForm.expectedDeliveryDate} onChange={(e) => setQuoteForm({ ...quoteForm, expectedDeliveryDate: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="quoteNotes">Notes</Label>
                <Input id="quoteNotes" data-testid="input-quote-notes" value={quoteForm.notes} onChange={(e) => setQuoteForm({ ...quoteForm, notes: e.target.value })} />
              </div>
            </div>
            <div className="space-y-3 rounded-lg border p-3">
              <Label className="text-sm font-semibold flex items-center gap-2"><Truck className="w-4 h-4" /> Delivery Method</Label>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" name="quoteDeliveryMethod" data-testid="radio-quote-pickup" value="pickup" checked={quoteForm.deliveryMethod === "pickup"} onChange={() => setQuoteForm({ ...quoteForm, deliveryMethod: "pickup", deliveryCost: "", deliveryAddress: "" })} />
                  <span className="text-sm">Pickup (No delivery cost)</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" name="quoteDeliveryMethod" data-testid="radio-quote-delivery" value="delivery" checked={quoteForm.deliveryMethod === "delivery"} onChange={() => setQuoteForm({ ...quoteForm, deliveryMethod: "delivery" })} />
                  <span className="text-sm">Delivery</span>
                </label>
              </div>
              {quoteForm.deliveryMethod === "delivery" && (
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="quoteDeliveryCost">Delivery / Logistics Cost (₹)</Label>
                    <Input id="quoteDeliveryCost" type="number" min="0" step="0.01" data-testid="input-quote-delivery-cost" value={quoteForm.deliveryCost} onChange={(e) => setQuoteForm({ ...quoteForm, deliveryCost: e.target.value })} placeholder="0.00" />
                  </div>
                  <div className="space-y-2 col-span-2">
                    <Label htmlFor="quoteDeliveryAddress">Delivery Address</Label>
                    <Textarea id="quoteDeliveryAddress" data-testid="input-quote-delivery-address" value={quoteForm.deliveryAddress} onChange={(e) => setQuoteForm({ ...quoteForm, deliveryAddress: e.target.value })} placeholder="Enter delivery address" rows={2} />
                  </div>
                </div>
              )}
            </div>
            <LineItemsEditor
              items={quoteItems}
              onChange={setQuoteItems}
              products={products || []}
              discount={quoteDiscount}
              onDiscountChange={setQuoteDiscount}
              effectivePrices={effectivePrices}
              customer={customers?.find(c => c.id === quoteForm.customerId)}
              touchedLineIndices={quoteTouchedLines}
              onLineTouched={handleQuoteLineTouched}
              bundleComponentsMap={bundleComponentsMap}
              loadBundleComponents={loadBundleComponents}
              inventoryByProduct={inventoryByProduct}
              deliveryCost={quoteForm.deliveryMethod === "delivery" && quoteForm.deliveryCost ? Number(quoteForm.deliveryCost) : 0}
              allowBundleCustomization={true}
            />
          </div>
          {/* Phase 4 Cleanup A — Below-floor advisory + admin override for quotations */}
          {(() => {
            const floorBlocked = findBelowFloorBlockIndices(quoteItems, effectivePrices, quoteTouchedLines);
            if (floorBlocked.length === 0) return null;
            return (
              <div
                className={`rounded border px-3 py-2 text-xs ${isAdmin
                  ? "bg-amber-50 dark:bg-amber-950/20 border-amber-300 dark:border-amber-800 text-amber-800 dark:text-amber-300"
                  : "bg-red-50 dark:bg-red-950/30 border-red-300 dark:border-red-800 text-red-800 dark:text-red-300"}`}
                data-testid="banner-quote-floor-block"
              >
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <div className="space-y-0.5 flex-1">
                    <span className="font-semibold">
                      {isAdmin
                        ? `${floorBlocked.length} line${floorBlocked.length > 1 ? "s" : ""} below floor — admin override required.`
                        : "Cannot save: some lines are below floor price."}
                    </span>
                    {floorBlocked.map(b => (
                      <div key={b.idx}>
                        • {b.productName}: ₹{b.unitPrice.toLocaleString("en-IN")} (floor ₹{b.floorPrice.toLocaleString("en-IN")} — short by ₹{Math.round(b.floorPrice - b.unitPrice).toLocaleString("en-IN")})
                      </div>
                    ))}
                    {!isAdmin && (
                      <div className="mt-0.5 opacity-80">Adjust prices at or above floor before saving, or contact admin to override.</div>
                    )}
                  </div>
                </div>
                {isAdmin && (
                  <div className="mt-2 space-y-1">
                    <Label className="text-xs font-semibold">Override Reason <span className="font-normal opacity-75">(min 10 chars, required to save)</span></Label>
                    <Textarea
                      value={quoteFloorOverrideReason}
                      onChange={(e) => setQuoteFloorOverrideReason(e.target.value)}
                      placeholder="Explain why these lines are priced below floor..."
                      rows={2}
                      className="text-xs bg-white dark:bg-background"
                      data-testid="input-quote-floor-override-reason"
                    />
                  </div>
                )}
              </div>
            );
          })()}
          {/* kk: Outstanding dues informational banner in quote dialog */}
          {quoteCustomerOutstanding && quoteCustomerOutstanding.outstanding > 0 && (
            <div className="mt-2 rounded border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/20 px-3 py-2 text-xs text-amber-800 dark:text-amber-300" data-testid="banner-quote-dues-info">
              <div className="flex items-start gap-2 mb-2">
                <InfoIcon className="w-4 h-4 shrink-0 mt-0.5" />
                <span>
                  Customer has <strong>₹{quoteCustomerOutstanding.outstanding.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</strong> in unpaid invoices. You can still create a quotation, but the customer will need to clear dues before any resulting Sales Order can be confirmed.
                </span>
              </div>
              {quoteCustomerOutstanding.invoices.length > 0 && (
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="border-b border-amber-300 dark:border-amber-700 opacity-70">
                      <th className="text-left py-0.5 pr-2 font-medium">Invoice #</th>
                      <th className="text-left py-0.5 pr-2 font-medium">Date</th>
                      <th className="text-right py-0.5 font-medium">Balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {quoteCustomerOutstanding.invoices.map((inv) => (
                      <tr key={inv.id} className="border-b border-amber-200 dark:border-amber-900 opacity-80">
                        <td className="py-0.5 pr-2 font-mono">{inv.invoiceNumber}</td>
                        <td className="py-0.5 pr-2">{new Date(inv.invoiceDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</td>
                        <td className="py-0.5 text-right">₹{inv.balance.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          <DialogFooter>
            {(() => {
              const floorBlocked = findBelowFloorBlockIndices(quoteItems, effectivePrices, quoteTouchedLines);
              // Phase 4 Cleanup A — admin with valid reason can save despite breaches
              const quoteFloorReasonOk = quoteFloorOverrideReason.trim().length >= 10;
              const quoteFloorBlocksSave = floorBlocked.length > 0 && !(isAdmin && quoteFloorReasonOk);
              return (
                <Button data-testid="button-submit-quote" disabled={quoteMutation.isPending || quoteFloorBlocksSave} onClick={() => quoteMutation.mutate(quoteForm)}>
                  {quoteMutation.isPending ? "Saving..." : editingQuote ? "Update Quotation" : "Create Quotation"}
                </Button>
              );
            })()}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={paymentDialogOpen} onOpenChange={setPaymentDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Record Payment</DialogTitle>
            <DialogDescription>Enter payment details for this order</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="paymentAmount">Amount (₹)</Label>
              <Input id="paymentAmount" data-testid="input-payment-amount" type="number" min="0" step="0.01" value={paymentForm.amount} onChange={(e) => setPaymentForm({ ...paymentForm, amount: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="paymentMethod">Method</Label>
              <Select value={paymentForm.method} onValueChange={(v) => setPaymentForm({ ...paymentForm, method: v, cashAccountId: "" })}>
                <SelectTrigger data-testid="select-payment-method">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="cheque">Cheque</SelectItem>
                  <SelectItem value="upi">UPI</SelectItem>
                  <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="paymentAccount">Account *</Label>
              <Select value={paymentForm.cashAccountId} onValueChange={(v) => setPaymentForm({ ...paymentForm, cashAccountId: v })}>
                <SelectTrigger id="paymentAccount" data-testid="select-payment-account">
                  <SelectValue placeholder="Select account" />
                </SelectTrigger>
                <SelectContent>
                  {paymentAccounts.length === 0 ? (
                    <SelectItem value="__no_match__" disabled>No active {paymentForm.method === "cash" ? "cash" : "bank"} account — create one in Accounts → Cash Accounts</SelectItem>
                  ) : (
                    paymentAccounts.map(a => (
                      <SelectItem key={a.id} value={a.id} data-testid={`option-payment-account-${a.id}`}>
                        {a.type === "cash" ? <Banknote className="inline mr-1 h-3 w-3" /> : <Landmark className="inline mr-1 h-3 w-3" />}
                        {a.name}{a.balance !== undefined ? ` — ₹${Number(a.balance).toLocaleString()}` : ""}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
              {!paymentForm.cashAccountId && (
                <p className="text-xs text-muted-foreground" data-testid="text-payment-account-required">Required — pick the account where this payment was received.</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="paymentReference">Reference</Label>
              <Input id="paymentReference" data-testid="input-payment-reference" placeholder="Transaction ID, cheque no., etc." value={paymentForm.reference} onChange={(e) => setPaymentForm({ ...paymentForm, reference: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button
              data-testid="button-submit-payment"
              disabled={recordPaymentMutation.isPending || !paymentForm.amount || !paymentForm.cashAccountId}
              onClick={() => {
                if (!paymentForm.cashAccountId) {
                  toast({ title: "Account required", description: "Select the account where this payment was received.", variant: "destructive" });
                  return;
                }
                if (paymentOrderId) {
                  recordPaymentMutation.mutate({
                    orderId: paymentOrderId,
                    data: { amount: paymentForm.amount, method: paymentForm.method, reference: paymentForm.reference, cashAccountId: paymentForm.cashAccountId },
                  });
                }
              }}
            >
              {recordPaymentMutation.isPending ? "Recording..." : "Record Payment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dispatchDialogOpen} onOpenChange={setDispatchDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Create Dispatch Challan</DialogTitle>
            <DialogDescription>Create a delivery challan from this sales order to dispatch remaining items</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {dispatchSummaryLoading ? (
              <div className="space-y-2">{[1,2].map(i => <div key={i} className="h-8 bg-muted animate-pulse rounded" />)}</div>
            ) : dispatchSummary.length > 0 ? (
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground">Items to dispatch</p>
                <div className="border rounded-md overflow-hidden">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-muted/50 border-b">
                        <th className="text-left px-3 py-2 font-medium">Product</th>
                        <th className="text-center px-3 py-2 font-medium">Ordered</th>
                        <th className="text-center px-3 py-2 font-medium">Dispatched</th>
                        <th className="text-center px-3 py-2 font-medium text-blue-600 dark:text-blue-400">Remaining</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dispatchSummary.map((item, i) => (
                        <tr key={i} className="border-b last:border-0">
                          <td className="px-3 py-2">{item.description || item.productId}</td>
                          <td className="px-3 py-2 text-center">{item.qtyOrdered}</td>
                          <td className="px-3 py-2 text-center text-green-600 dark:text-green-400">{item.qtyDispatched}</td>
                          <td className="px-3 py-2 text-center font-medium text-blue-600 dark:text-blue-400">{item.qtyRemaining}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">All items have already been dispatched.</p>
            )}

            <div className="rounded-md bg-muted/50 border px-3 py-2 text-xs text-muted-foreground">
              Source warehouse is automatically derived from the sales order's assigned warehouse.
            </div>

            <div className="space-y-1">
              <Label htmlFor="dispatchChallanNo">
                Real Challan No. <span className="text-red-500">*</span>
              </Label>
              <Input
                id="dispatchChallanNo"
                data-testid="input-dispatch-challan-number"
                value={dispatchForm.physicalChallanNumber}
                onChange={e => setDispatchForm({ ...dispatchForm, physicalChallanNumber: e.target.value })}
                placeholder="Supplier / physical challan number"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="dispatchVehicle">
                  Vehicle No. <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="dispatchVehicle"
                  data-testid="input-dispatch-vehicle"
                  value={dispatchForm.vehicleNumber}
                  onChange={e => setDispatchForm({ ...dispatchForm, vehicleNumber: e.target.value })}
                  placeholder="e.g. AS01AB1234"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="dispatchVehicleOwner">
                  Vehicle Owner Name <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="dispatchVehicleOwner"
                  data-testid="input-dispatch-vehicle-owner"
                  value={dispatchForm.vehicleOwnerName}
                  onChange={e => setDispatchForm({ ...dispatchForm, vehicleOwnerName: e.target.value })}
                  placeholder="Owner's full name"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="dispatchDriver">
                  Driver Name <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="dispatchDriver"
                  data-testid="input-dispatch-driver"
                  value={dispatchForm.driverName}
                  onChange={e => setDispatchForm({ ...dispatchForm, driverName: e.target.value })}
                  placeholder="Driver's full name"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="dispatchDriverPhone">
                  Driver Phone <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="dispatchDriverPhone"
                  data-testid="input-dispatch-driver-phone"
                  value={dispatchForm.driverPhone}
                  onChange={e => {
                    const val = e.target.value;
                    setDispatchForm({ ...dispatchForm, driverPhone: val });
                    if (val && !INDIAN_MOBILE_RE.test(val.trim())) {
                      setDispatchPhoneError("Enter a valid Indian mobile number");
                    } else {
                      setDispatchPhoneError("");
                    }
                  }}
                  placeholder="e.g. 9876543210"
                />
                {dispatchPhoneError && (
                  <p className="text-xs text-red-500 mt-0.5">{dispatchPhoneError}</p>
                )}
              </div>
            </div>

            <div className="space-y-1">
              <Label htmlFor="dispatchNotes">Notes (optional)</Label>
              <Input id="dispatchNotes" data-testid="input-dispatch-notes" value={dispatchForm.notes} onChange={e => setDispatchForm({ ...dispatchForm, notes: e.target.value })} placeholder="Any special instructions" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDispatchDialogOpen(false)}>Cancel</Button>
            <Button
              data-testid="button-submit-dispatch-challan"
              disabled={createFromSOMutation.isPending || dispatchSummary.every(i => i.qtyRemaining === 0) || !dispatchFormValid}
              onClick={() => {
                if (!dispatchOrderId) return;
                createFromSOMutation.mutate({ orderId: dispatchOrderId, data: dispatchForm });
              }}
            >
              {createFromSOMutation.isPending ? "Creating..." : "Create Challan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={customerDialogOpen} onOpenChange={setCustomerDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingCustomer ? "Edit Customer" : "New Customer"}</DialogTitle>
            <DialogDescription>Customer details</DialogDescription>
          </DialogHeader>
          {editingCustomer && <CustomerOutstandingInline customerId={editingCustomer.id} />}
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="custName">Name</Label>
                <Input id="custName" data-testid="input-customer-name" value={customerForm.name} onChange={(e) => setCustomerForm({ ...customerForm, name: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="custEmail">Email</Label>
                <Input id="custEmail" data-testid="input-customer-email" value={customerForm.email} onChange={(e) => setCustomerForm({ ...customerForm, email: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="custPhone">Phone</Label>
                <Input id="custPhone" data-testid="input-customer-phone" value={customerForm.phone} onChange={(e) => setCustomerForm({ ...customerForm, phone: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="custGst">GST Number</Label>
                <Input id="custGst" data-testid="input-customer-gst" value={customerForm.gstNumber} onChange={(e) => setCustomerForm({ ...customerForm, gstNumber: e.target.value })} />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="custAddress">Address</Label>
              <Input id="custAddress" data-testid="input-customer-address" value={customerForm.address} onChange={(e) => setCustomerForm({ ...customerForm, address: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="custContact">Contact Person</Label>
                <Input id="custContact" data-testid="input-customer-contact" value={customerForm.contactPerson} onChange={(e) => setCustomerForm({ ...customerForm, contactPerson: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="custType">Customer Type <span className="text-destructive">*</span></Label>
                <Select
                  value={customerForm.customerType}
                  onValueChange={(v) => setCustomerForm({ ...customerForm, customerType: (v as "end_user" | "business") })}
                >
                  <SelectTrigger id="custType" data-testid="select-customer-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="end_user" data-testid="option-customer-type-end_user">End User</SelectItem>
                    <SelectItem value="business" data-testid="option-customer-type-business">Business</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="custPaymentTerms">Payment Terms</Label>
                <Select
                  value={(customerForm as any).paymentTerms || "immediate"}
                  onValueChange={(v) => setCustomerForm({ ...customerForm, paymentTerms: v } as any)}
                >
                  <SelectTrigger id="custPaymentTerms" data-testid="select-customer-payment-terms">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="immediate">Immediate (Cash/Advance)</SelectItem>
                    <SelectItem value="net_7">Net 7 days</SelectItem>
                    <SelectItem value="net_15">Net 15 days</SelectItem>
                    <SelectItem value="net_30">Net 30 days</SelectItem>
                    <SelectItem value="net_45">Net 45 days</SelectItem>
                    <SelectItem value="net_60">Net 60 days</SelectItem>
                    <SelectItem value="net_90">Net 90 days</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button data-testid="button-submit-customer" disabled={customerMutation.isPending} onClick={() => customerMutation.mutate(customerForm)}>
              {customerMutation.isPending ? "Saving..." : editingCustomer ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* E6: Outstanding Dues Override Dialog */}
      <Dialog open={!!duesOverrideDialog} onOpenChange={(o) => { if (!o) { setDuesOverrideDialog(null); setDuesOverrideReason(""); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Authorize SO Despite Outstanding Dues</DialogTitle>
            <DialogDescription>
              {duesOverrideDialog?.customerName && (
                <span><strong>Customer:</strong> {duesOverrideDialog.customerName}<br /></span>
              )}
              <span><strong>Outstanding Dues:</strong> ₹{duesOverrideDialog?.outstanding?.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
            </DialogDescription>
          </DialogHeader>

          {/* Unpaid invoice table */}
          {duesOverrideDialog?.invoices && duesOverrideDialog.invoices.length > 0 && (
            <div className="rounded border text-xs overflow-hidden">
              <table className="w-full border-collapse">
                <thead className="bg-muted text-muted-foreground">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium">Invoice #</th>
                    <th className="text-left px-3 py-2 font-medium">Date</th>
                    <th className="text-right px-3 py-2 font-medium">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {duesOverrideDialog.invoices.map((inv) => (
                    <tr key={inv.id} className="border-t">
                      <td className="px-3 py-1.5 font-mono">{inv.invoiceNumber}</td>
                      <td className="px-3 py-1.5">{new Date(inv.invoiceDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</td>
                      <td className="px-3 py-1.5 text-right text-red-600 dark:text-red-400 font-medium">₹{inv.balance.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* New order total */}
          {duesOverrideDialog?.newOrderTotal !== undefined && duesOverrideDialog.newOrderTotal > 0 && (
            <div className="flex justify-between text-sm font-medium border rounded px-3 py-2 bg-muted/40">
              <span>New Order Total</span>
              <span>₹{duesOverrideDialog.newOrderTotal.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="dues-override-reason">Override Reason <span className="text-red-500">*</span> <span className="text-muted-foreground text-xs">(min 10 chars)</span></Label>
            <Textarea
              id="dues-override-reason"
              data-testid="input-dues-override-reason"
              value={duesOverrideReason}
              onChange={(e) => setDuesOverrideReason(e.target.value)}
              placeholder="e.g. Customer agreed to pay outstanding before delivery. Approved by management."
              rows={3}
            />
          </div>

          <DialogFooter className="flex-col gap-2 sm:flex-row sm:gap-0">
            <Button variant="outline" onClick={() => { setDuesOverrideDialog(null); setDuesOverrideReason(""); }}>Cancel</Button>
            {isAdmin ? (
              <Button
                data-testid="button-confirm-dues-override"
                variant="outline"
                className="border-amber-400 text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/30"
                disabled={duesOverrideReason.trim().length < 10 || orderMutation.isPending || convertToOrderMutation.isPending}
                onClick={() => {
                  if (!duesOverrideDialog) return;
                  if (duesOverrideDialog.quotationId) {
                    convertToOrderMutation.mutate({
                      id: duesOverrideDialog.quotationId,
                      duesOverride: true,
                      duesOverrideReason: duesOverrideReason.trim(),
                    });
                  } else if (duesOverrideDialog.pendingOrderData) {
                    orderMutation.mutate({
                      ...duesOverrideDialog.pendingOrderData,
                      duesOverride: true,
                      duesOverrideReason: duesOverrideReason.trim(),
                    });
                  }
                }}
              >
                {(orderMutation.isPending || convertToOrderMutation.isPending)
                  ? "Processing..."
                  : duesOverrideDialog?.quotationId ? "Authorize & Convert to Order" : "Authorize & Create Order"}
              </Button>
            ) : (
              <div className="flex flex-col items-end gap-1">
                <Button data-testid="button-confirm-dues-override" disabled variant="outline" className="cursor-not-allowed opacity-60">
                  Admin Authorization Required
                </Button>
                <p className="text-xs text-muted-foreground">Contact admin to authorize this order despite outstanding dues.</p>
              </div>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* WhatsApp Send Dialog */}
      <Dialog open={waDialogOpen} onOpenChange={setWaDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageCircle className="w-5 h-5 text-green-500" />
              {waDialogTitle}
            </DialogTitle>
            <DialogDescription>Send details to the customer via WhatsApp</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Phone Number</Label>
              <Input
                value={waTargetPhone}
                onChange={e => setWaTargetPhone(e.target.value)}
                placeholder="+91 98765 43210"
                data-testid="input-wa-phone"
              />
              <p className="text-xs text-muted-foreground">10-digit Indian numbers will be auto-formatted</p>
            </div>

            {waTemplates.length > 0 && (
              <div className="space-y-1.5">
                <Label>Send via Template (recommended)</Label>
                <Select value={waSelectedTemplate} onValueChange={v => {
                  setWaSelectedTemplate(v);
                  // Auto-populate variable fields from context when template selected.
                  // Prefer resolving by named merge-field key (template.variables[i]) using
                  // the document/customer context. Fall back to position-based defaults.
                  const tpl = waTemplates.find(t => t.interaktTemplateName === v);
                  if (tpl?.body) {
                    const matches = tpl.body.match(/\{\{(\d+)\}\}/g) || [];
                    const tplVars = tpl.variables || [];
                    const autoVars: string[] = [];
                    const autoSources: (string | undefined)[] = [];
                    matches.forEach((_: string, i: number) => {
                      const key = tplVars[i];
                      if (key && isCommonMergeField(key)) {
                        const resolved = resolveMergeField(key, { customer: waCustomerContext, document: waDocContext });
                        if (resolved) {
                          autoVars.push(resolved);
                          autoSources.push(`auto:${mergeFieldSourceLabel(key, waDocContext?.type ?? null) || "context"}`);
                          return;
                        }
                      }
                      const fallback = waAutoContext[(i + 1).toString()] || "";
                      autoVars.push(fallback);
                      autoSources.push(fallback ? "auto:context" : undefined);
                    });
                    setWaTemplateVars(autoVars);
                    setWaVarSources(autoSources);
                  } else {
                    setWaTemplateVars([]); setWaVarSources([]);
                  }
                }}>
                  <SelectTrigger data-testid="select-wa-template">
                    <SelectValue placeholder="Select an approved template..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">No template (free text)</SelectItem>
                    {waTemplates.map(t => (
                      <SelectItem key={t.id} value={t.interaktTemplateName}>{t.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Template preview with variable inputs */}
            {waSelectedTemplate && waSelectedTemplate !== "__none__" && (() => {
              const tpl = waTemplates.find(t => t.interaktTemplateName === waSelectedTemplate);
              if (!tpl) return null;
              const matches = tpl.body?.match(/\{\{(\d+)\}\}/g) || [];
              const previewBody = matches.reduce((body: string, ph: string, i: number) => body.replace(ph, waTemplateVars[i] || ph), tpl.body || "");
              return (
                <div className="space-y-2">
                  {matches.length > 0 && (
                    <div className="space-y-1.5">
                      <Label className="text-xs">Template Variables</Label>
                      {matches.map((_: string, i: number) => {
                        const src = waVarSources[i];
                        const auto = src && src.startsWith("auto:") ? src.slice(5) : null;
                        return (
                          <div key={i} className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground w-16 shrink-0">{`{{${i + 1}}}`}</span>
                            <Input
                              className="h-7 text-xs"
                              value={waTemplateVars[i] || ""}
                              onChange={e => {
                                const v = [...waTemplateVars];
                                v[i] = e.target.value;
                                setWaTemplateVars(v);
                                const s = [...waVarSources];
                                s[i] = "manual";
                                setWaVarSources(s);
                              }}
                              placeholder={waAutoContext[(i + 1).toString()] || `Variable ${i + 1}`}
                              data-testid={`input-wa-var-${i + 1}`}
                            />
                            {auto ? (
                              <Badge
                                variant="secondary"
                                className="text-[10px] px-1.5 py-0 h-5 shrink-0 bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border-emerald-200 dark:border-emerald-900"
                                title={`Auto-filled from ${auto}`}
                                data-testid={`badge-wa-var-source-${i + 1}`}
                              >
                                auto · {auto}
                              </Badge>
                            ) : src === "manual" ? (
                              <Badge
                                variant="outline"
                                className="text-[10px] px-1.5 py-0 h-5 shrink-0"
                                title="Manual override"
                                data-testid={`badge-wa-var-source-${i + 1}`}
                              >
                                manual
                              </Badge>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  )}
                  <div className="bg-muted/50 rounded-md p-3 text-xs whitespace-pre-wrap border">
                    <p className="text-[10px] text-muted-foreground mb-1 font-medium">Preview</p>
                    {previewBody}
                  </div>
                </div>
              );
            })()}

            {(!waSelectedTemplate || waSelectedTemplate === "__none__") && (
              <>
                {!windowIsOpen && (
                  <div className="flex items-start gap-2 bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 px-3 py-2 rounded-md text-xs">
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>No active 24-hour messaging window. Only template messages can be sent to this contact. Select a template above.</span>
                  </div>
                )}
                <div className="space-y-1.5">
                  <Label>Custom Message</Label>
                  <Textarea
                    value={waMessage}
                    onChange={e => setWaMessage(e.target.value)}
                    className="min-h-[100px] text-sm resize-none"
                    disabled={!windowIsOpen}
                    placeholder={windowIsOpen ? "Type your message..." : "Select a template to send (no active window)"}
                    data-testid="textarea-wa-message"
                  />
                </div>
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setWaDialogOpen(false)}>Cancel</Button>
            <Button
              disabled={
                !waTargetPhone ||
                sendWaMutation.isPending ||
                ((!waSelectedTemplate || waSelectedTemplate === "__none__") && (!windowIsOpen || !waMessage))
              }
              onClick={() => sendWaMutation.mutate()}
              className="bg-green-600 hover:bg-green-700 text-white"
              data-testid="button-wa-send"
            >
              {sendWaMutation.isPending ? "Sending..." : "Send"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
