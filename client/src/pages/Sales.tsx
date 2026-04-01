import { useState, useCallback, useEffect, Fragment } from "react";
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
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useCurrentUser } from "@/lib/auth";
import { Plus, Search, ShoppingCart, FileText, Users as UsersIcon, Pencil, Trash2, X, ArrowRightLeft, ChevronDown, ChevronRight, Package, Wrench, CreditCard, Receipt, Download, Phone, Mail, MapPin, MessageCircle, StickyNote, Check, CalendarDays, Truck, Eye, Bell, AlertTriangle, BarChart3 } from "lucide-react";
import { generateQuotationPDF } from "@/lib/quotation-pdf";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import type { SalesOrder, SalesOrderItem, Customer, Quotation, QuotationItem, Product, QuotationActivity, QuotationFollowup, Warehouse, Supplier, DeliveryChallan } from "@shared/schema";

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
  return { itemType: "product", productId: "", description: "", quantity: 1, unitPrice: 0, totalPrice: 0, gstRate: 0, hsnCode: "", taxAmount: 0 };
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

type EffectivePriceEntry = {
  effectivePrice: string;
  sheetDate: string | null;
  noConfirmedPrice: boolean;
  hasConfirmedToday: boolean;
  blendedInventoryPrice: string | null;
  globalFloorPrice: string | null;
  strictFloorPrice: string | null;
};

function MarginSimPanel({ item, ep }: { item: LineItem; ep: EffectivePriceEntry }) {
  const price = item.unitPrice;
  const blended = ep.blendedInventoryPrice ? Number(ep.blendedInventoryPrice) : null;
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

function LineItemsEditor({ items, onChange, products, discount, onDiscountChange, effectivePrices }: {
  items: LineItem[];
  onChange: (items: LineItem[]) => void;
  products: Product[];
  discount?: DiscountState;
  onDiscountChange?: (d: DiscountState) => void;
  effectivePrices?: Record<string, EffectivePriceEntry>;
}) {
  const [expandedSim, setExpandedSim] = useState<Set<number>>(new Set());
  const productItems = products.filter(p => p.type === "product");
  const serviceItems = products.filter(p => p.type === "service");

  const updateItem = (index: number, field: string, value: any) => {
    const updated = [...items];
    const item = { ...updated[index], [field]: value };

    if (field === "productId" && value) {
      const prod = products.find(p => p.id === value);
      if (prod) {
        const ep = effectivePrices?.[prod.id];
        const priceToUse = ep && !ep.noConfirmedPrice ? Number(ep.effectivePrice) : Number(prod.unitPrice);
        item.unitPrice = priceToUse;
        item.description = prod.name;
        item.itemType = prod.type;
        item.gstRate = Number(prod.gstRate || 0);
        item.hsnCode = prod.hsnCode || "";
        const lineTotal = item.quantity * priceToUse;
        item.totalPrice = lineTotal;
        item.taxAmount = lineTotal * item.gstRate / 100;
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
    }
    updated[index] = item;
    onChange(updated);
  };

  const addItem = () => onChange([...items, emptyLineItem()]);
  const removeItem = (index: number) => onChange(items.filter((_, i) => i !== index));

  const subtotal = items.reduce((sum, it) => sum + (it.totalPrice || 0), 0);
  const totalTax = items.reduce((sum, it) => sum + (it.taxAmount || 0), 0);
  const discountAmount = discount ? calculateDiscount(subtotal, discount) : 0;
  const netTotal = subtotal - discountAmount + totalTax;

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
      {items.map((item, i) => (
        <div key={i} className="border rounded-lg p-3 space-y-2 bg-muted/30" data-testid={`line-item-${i}`}>
          <div className="flex items-center gap-2">
            <div className="flex-1 grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs text-muted-foreground">Type</Label>
                <Select value={item.itemType} onValueChange={(v) => updateItem(i, "itemType", v)}>
                  <SelectTrigger className="h-8 text-xs" data-testid={`select-item-type-${i}`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="product"><span className="flex items-center gap-1"><Package className="w-3 h-3" /> Product</span></SelectItem>
                    <SelectItem value="service"><span className="flex items-center gap-1"><Wrench className="w-3 h-3" /> Service</span></SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">{item.itemType === "product" ? "Product" : "Service"}</Label>
                <Select value={item.productId} onValueChange={(v) => updateItem(i, "productId", v)}>
                  <SelectTrigger className="h-8 text-xs" data-testid={`select-item-product-${i}`}>
                    <SelectValue placeholder={`Select ${item.itemType}...`} />
                  </SelectTrigger>
                  <SelectContent>
                    {(item.itemType === "product" ? productItems : serviceItems).map((p) => {
                      const ep = effectivePrices?.[p.id];
                      const displayPrice = (ep && !ep.noConfirmedPrice) ? Number(ep.effectivePrice) : Number(p.unitPrice);
                      const hasEP = ep && !ep.noConfirmedPrice;
                      return (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name} — ₹{displayPrice.toLocaleString()}{hasEP ? " ✓" : ""}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <Button type="button" variant="ghost" size="icon" className="shrink-0 mt-4" onClick={() => removeItem(i)} data-testid={`button-remove-item-${i}`}>
              <X className="w-4 h-4" />
            </Button>
          </div>
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
              <Input className="h-8 text-xs" type="number" min="0" step="0.01" value={item.unitPrice} onChange={(e) => updateItem(i, "unitPrice", parseFloat(e.target.value) || 0)} data-testid={`input-item-price-${i}`} />
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
          {/* Margin simulation toggle — only shown when product has pricing data */}
          {(() => {
            const ep = item.productId ? effectivePrices?.[item.productId] : undefined;
            if (!ep) return null;
            const isOpen = expandedSim.has(i);
            return (
              <div>
                <button
                  type="button"
                  className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                  onClick={() => setExpandedSim(prev => {
                    const next = new Set(prev);
                    if (next.has(i)) next.delete(i); else next.add(i);
                    return next;
                  })}
                  data-testid={`button-margin-sim-toggle-${i}`}
                >
                  <BarChart3 className="w-3 h-3" />
                  {isOpen ? "Hide" : "Show"} Margin Simulation
                  {ep.noConfirmedPrice && <AlertTriangle className="w-3 h-3 text-red-500 ml-0.5" title="No confirmed price sheet exists" />}
                  {!ep.noConfirmedPrice && !ep.hasConfirmedToday && <AlertTriangle className="w-3 h-3 text-amber-500 ml-0.5" title="No confirmed price sheet for today" />}
                </button>
                {isOpen && <MarginSimPanel item={item} ep={ep} />}
              </div>
            );
          })()}
        </div>
      ))}

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
          <div className="flex justify-between text-sm font-semibold border-t pt-1">
            <span>Grand Total</span>
            <span data-testid="text-line-items-total">₹{netTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
          </div>
        </div>
      )}
    </div>
  );
}

export default function Sales() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { data: currentUser } = useCurrentUser();
  const isReadOnly = currentUser?.role === "accountant";
  const canSeePricing = ["admin", "sales_manager", "accountant"].includes(currentUser?.role ?? "");
  const { data: orders, isLoading: ordersLoading } = useQuery<SalesOrder[]>({ queryKey: ["/api/sales-orders"] });
  const { data: customers, isLoading: customersLoading } = useQuery<Customer[]>({ queryKey: ["/api/customers"] });
  const { data: quotations, isLoading: quotationsLoading } = useQuery<Quotation[]>({ queryKey: ["/api/quotations"] });
  const { data: products } = useQuery<Product[]>({ queryKey: ["/api/products"] });
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
  const [orderForm, setOrderForm] = useState({ orderNumber: "", customerId: "", status: "pending", notes: "", paymentTerms: "", advanceAmount: "", expectedDeliveryDate: "", deliveryMethod: "pickup" as string, deliveryCost: "", deliveryAddress: "", warehouseId: "" });
  const [orderItems, setOrderItems] = useState<LineItem[]>([emptyLineItem()]);
  const [orderDiscount, setOrderDiscount] = useState<DiscountState>({ discountType: "none", discountValue: 0 });

  const [quoteDialogOpen, setQuoteDialogOpen] = useState(false);
  const [editingQuote, setEditingQuote] = useState<Quotation | null>(null);
  const [quoteForm, setQuoteForm] = useState({ quoteNumber: "", customerId: "", status: "draft", validUntil: "", notes: "", expectedDeliveryDate: "", deliveryMethod: "pickup" as string, deliveryCost: "", deliveryAddress: "" });
  const [quoteItems, setQuoteItems] = useState<LineItem[]>([emptyLineItem()]);
  const [quoteDiscount, setQuoteDiscount] = useState<DiscountState>({ discountType: "none", discountValue: 0 });

  const [customerDialogOpen, setCustomerDialogOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [customerForm, setCustomerForm] = useState({ name: "", email: "", phone: "", address: "", gstNumber: "", contactPerson: "" });

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
  const [paymentForm, setPaymentForm] = useState({ amount: "", method: "cash", reference: "" });

  const [orderChallansMap, setOrderChallansMap] = useState<Record<string, DeliveryChallan[]>>({});
  const [orderDispatchSummaryMap, setOrderDispatchSummaryMap] = useState<Record<string, Array<{ productId: string; description: string; qtyOrdered: number; qtyDispatched: number; qtyRemaining: number }>>>({});
  const [orderLotMarginsMap, setOrderLotMarginsMap] = useState<Record<string, Array<{ itemId: string; productId: string | null; blendedCost: number | null; estimatedMarginPct: number | null }>>>({});

  const [dispatchDialogOpen, setDispatchDialogOpen] = useState(false);
  const [dispatchOrderId, setDispatchOrderId] = useState<string | null>(null);
  const [dispatchSummary, setDispatchSummary] = useState<{ productId: string; description: string; qtyOrdered: number; qtyDispatched: number; qtyRemaining: number }[]>([]);
  const [dispatchForm, setDispatchForm] = useState({ sourceType: "warehouse", sourceId: "", vehicleNumber: "", driverName: "", notes: "" });
  const [dispatchSummaryLoading, setDispatchSummaryLoading] = useState(false);

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
      let orderId: string;
      if (editingOrder) {
        await apiRequest("PATCH", `/api/sales-orders/${editingOrder.id}`, orderData);
        orderId = editingOrder.id;
      } else {
        const res = await apiRequest("POST", "/api/sales-orders", orderData);
        const created = await res.json();
        orderId = created.id;
      }
      const validItems = orderItems.filter(it => it.description && it.quantity > 0);
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
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
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
      let quoteId: string;
      if (editingQuote) {
        await apiRequest("PATCH", `/api/quotations/${editingQuote.id}`, quoteData);
        quoteId = editingQuote.id;
      } else {
        const res = await apiRequest("POST", "/api/quotations", quoteData);
        const created = await res.json();
        quoteId = created.id;
      }
      const validItems = quoteItems.filter(it => it.description && it.quantity > 0);
      if (validItems.length > 0) {
        await apiRequest("POST", `/api/quotations/${quoteId}/items`, {
          items: validItems.map(it => ({
            productId: it.productId || null,
            description: it.description,
            itemType: it.itemType,
            quantity: it.quantity,
            unitPrice: String(it.unitPrice),
            totalPrice: String(it.totalPrice),
          })),
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/quotations"] });
      toast({ title: editingQuote ? "Quotation updated" : "Quotation created" });
      setQuoteDialogOpen(false);
      setEditingQuote(null);
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
    mutationFn: async (id: string) => {
      const res = await apiRequest("POST", `/api/quotations/${id}/convert-to-order`);
      return res.json();
    },
    onSuccess: (order: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/sales-orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/quotations"] });
      toast({ title: "Quotation converted to order", description: `Order ${order.orderNumber} created` });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
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
      setPaymentForm({ amount: "", method: "cash", reference: "" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

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
    const num = `SO-${Date.now().toString(36).toUpperCase()}`;
    setOrderForm({ orderNumber: num, customerId: "", status: "pending", notes: "", paymentTerms: "", advanceAmount: "", expectedDeliveryDate: "", deliveryMethod: "pickup", deliveryCost: "", deliveryAddress: "", warehouseId: "" });
    setOrderItems([emptyLineItem()]);
    setOrderDiscount({ discountType: "none", discountValue: 0 });
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
    });
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
    const num = `QT-${Date.now().toString(36).toUpperCase()}`;
    setQuoteForm({ quoteNumber: num, customerId: "", status: "draft", validUntil: "", notes: "", expectedDeliveryDate: "", deliveryMethod: "pickup", deliveryCost: "", deliveryAddress: "" });
    setQuoteItems([emptyLineItem()]);
    setQuoteDiscount({ discountType: "none", discountValue: 0 });
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
    try {
      const res = await fetch(`/api/quotations/${q.id}/items`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
      });
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        setQuoteItems(data.map((it: QuotationItem) => ({
          itemType: it.itemType || "product",
          productId: it.productId || "",
          description: it.description || "",
          quantity: it.quantity,
          unitPrice: Number(it.unitPrice),
          totalPrice: Number(it.totalPrice),
        })));
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
    setCustomerForm({ name: "", email: "", phone: "", address: "", gstNumber: "", contactPerson: "" });
    setCustomerDialogOpen(true);
  };

  const openEditCustomer = (c: Customer) => {
    setEditingCustomer(c);
    setCustomerForm({ name: c.name, email: c.email || "", phone: c.phone || "", address: c.address || "", gstNumber: c.gstNumber || "", contactPerson: c.contactPerson || "" });
    setCustomerDialogOpen(true);
  };

  const openRecordPayment = (orderId: string) => {
    setPaymentOrderId(orderId);
    setPaymentForm({ amount: "", method: "cash", reference: "" });
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
    setDispatchForm({ sourceType: "warehouse", sourceId: "", vehicleNumber: "", driverName: "", notes: "" });
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
      generateQuotationPDF(q, Array.isArray(qItems) ? qItems : [], customer);
      toast({ title: "PDF downloaded", description: q.quoteNumber });
    } catch {
      toast({ title: "Failed to generate PDF", variant: "destructive" });
    }
  };

  const getCustomerName = (id: string) => customers?.find(c => c.id === id)?.name || "—";

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

      <Tabs defaultValue="orders" className="space-y-4">
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
                            <td className="p-3 text-muted-foreground">{getCustomerName(order.customerId)}</td>
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
                                          {canSeePricing && <th className="text-right py-1 font-medium">Est. Margin</th>}
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {expandedOrderItems.map((it) => {
                                          const lotMargin = orderLotMarginsMap[order.id]?.find(m => m.itemId === it.id);
                                          return (
                                          <tr key={it.id} className="border-t border-muted">
                                            <td className="py-1.5">
                                              <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs ${it.itemType === "service" ? "bg-orange-100 text-orange-700 dark:bg-orange-950/40 dark:text-orange-400" : "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400"}`}>
                                                {it.itemType === "service" ? <Wrench className="w-3 h-3" /> : <Package className="w-3 h-3" />}
                                                {it.itemType === "service" ? "Service" : "Product"}
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
                                            {canSeePricing && (
                                              <td className="py-1.5 text-right">
                                                {lotMargin && lotMargin.estimatedMarginPct !== null ? (
                                                  <span className={`font-medium ${lotMargin.estimatedMarginPct < 5 ? "text-red-600 dark:text-red-400" : lotMargin.estimatedMarginPct < 15 ? "text-amber-600 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400"}`} title={`FIFO blended cost: ₹${lotMargin.blendedCost?.toLocaleString() ?? "—"}`}>
                                                    {lotMargin.estimatedMarginPct.toFixed(1)}%
                                                  </span>
                                                ) : it.itemType === "product" ? (
                                                  <span className="text-muted-foreground">—</span>
                                                ) : null}
                                              </td>
                                            )}
                                          </tr>
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
                                              <StatusBadge status={challan.status} />
                                              <span className="text-xs text-muted-foreground">
                                                {challan.sourceType === "warehouse" ? "Warehouse" : "Supplier"}: {getSourceName(challan.sourceType, challan.sourceId)}
                                              </span>
                                            </div>
                                            <div className="flex items-center gap-4 text-[10px] text-muted-foreground flex-wrap">
                                              {challan.dispatchDate && <span>Dispatched: {new Date(challan.dispatchDate).toLocaleDateString()}</span>}
                                              {challan.deliveryDate && <span>Delivered: {new Date(challan.deliveryDate).toLocaleDateString()}</span>}
                                              {challan.vehicleNumber && <span>Vehicle: {challan.vehicleNumber}</span>}
                                              {challan.driverName && <span>Driver: {challan.driverName}</span>}
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
                            <td className="p-3 text-muted-foreground">{getCustomerName(q.customerId)}</td>
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
                                    onClick={() => { if (confirm("Convert this quotation to an order?")) convertToOrderMutation.mutate(q.id); }}
                                    disabled={convertToOrderMutation.isPending}>
                                    <ArrowRightLeft className="w-4 h-4" />
                                  </Button>
                                )}
                                <Button size="icon" variant="ghost" title="Download PDF" data-testid={`button-download-quote-${q.id}`} onClick={() => downloadQuotePDF(q)}>
                                  <Download className="w-4 h-4" />
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
                                              <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs ${it.itemType === "service" ? "bg-orange-100 text-orange-700 dark:bg-orange-950/40 dark:text-orange-400" : "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400"}`}>
                                                {it.itemType === "service" ? <Wrench className="w-3 h-3" /> : <Package className="w-3 h-3" />}
                                                {it.itemType === "service" ? "Service" : "Product"}
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
          {!isReadOnly && (
            <div className="flex items-center gap-2">
              <Button size="sm" data-testid="button-new-customer" onClick={openNewCustomer}>
                <Plus className="w-4 h-4 mr-2" />
                New Customer
              </Button>
            </div>
          )}
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left p-3 font-medium text-muted-foreground">Name</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">Email</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">Phone</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">GST</th>
                      <th className="text-right p-3 font-medium text-muted-foreground">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {customersLoading ? (
                      <tr><td colSpan={5} className="p-3"><Skeleton className="h-4 w-full" /></td></tr>
                    ) : customers && customers.length > 0 ? (
                      customers.map((c) => (
                        <tr key={c.id} className="border-b last:border-0" data-testid={`row-customer-${c.id}`}>
                          <td className="p-3 font-medium">{c.name}</td>
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
                        <td colSpan={5} className="p-8 text-center text-muted-foreground">No customers found.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
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
            <LineItemsEditor items={orderItems} onChange={setOrderItems} products={products || []} discount={orderDiscount} onDiscountChange={setOrderDiscount} effectivePrices={effectivePrices} />
          </div>
          <DialogFooter>
            <Button data-testid="button-submit-order" disabled={orderMutation.isPending} onClick={() => orderMutation.mutate(orderForm)}>
              {orderMutation.isPending ? "Saving..." : editingOrder ? "Update Order" : "Create Order"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={quoteDialogOpen} onOpenChange={setQuoteDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingQuote ? "Edit Quotation" : "New Quotation"}</DialogTitle>
            <DialogDescription>Add products and services to this quotation</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="quoteNumber">Quote Number</Label>
                <Input id="quoteNumber" data-testid="input-quote-number" value={quoteForm.quoteNumber} onChange={(e) => setQuoteForm({ ...quoteForm, quoteNumber: e.target.value })} />
              </div>
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
            <LineItemsEditor items={quoteItems} onChange={setQuoteItems} products={products || []} discount={quoteDiscount} onDiscountChange={setQuoteDiscount} effectivePrices={effectivePrices} />
          </div>
          <DialogFooter>
            <Button data-testid="button-submit-quote" disabled={quoteMutation.isPending} onClick={() => quoteMutation.mutate(quoteForm)}>
              {quoteMutation.isPending ? "Saving..." : editingQuote ? "Update Quotation" : "Create Quotation"}
            </Button>
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
              <Select value={paymentForm.method} onValueChange={(v) => setPaymentForm({ ...paymentForm, method: v })}>
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
              <Label htmlFor="paymentReference">Reference</Label>
              <Input id="paymentReference" data-testid="input-payment-reference" placeholder="Transaction ID, cheque no., etc." value={paymentForm.reference} onChange={(e) => setPaymentForm({ ...paymentForm, reference: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button
              data-testid="button-submit-payment"
              disabled={recordPaymentMutation.isPending || !paymentForm.amount}
              onClick={() => {
                if (paymentOrderId) {
                  recordPaymentMutation.mutate({
                    orderId: paymentOrderId,
                    data: { amount: paymentForm.amount, method: paymentForm.method, reference: paymentForm.reference },
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
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="dispatchVehicle">Vehicle No. (optional)</Label>
                <Input id="dispatchVehicle" data-testid="input-dispatch-vehicle" value={dispatchForm.vehicleNumber} onChange={e => setDispatchForm({ ...dispatchForm, vehicleNumber: e.target.value })} placeholder="e.g. MH12AB1234" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="dispatchDriver">Driver (optional)</Label>
                <Input id="dispatchDriver" data-testid="input-dispatch-driver" value={dispatchForm.driverName} onChange={e => setDispatchForm({ ...dispatchForm, driverName: e.target.value })} placeholder="Driver name" />
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
              disabled={createFromSOMutation.isPending || dispatchSummary.every(i => i.qtyRemaining === 0)}
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
            <div className="space-y-2">
              <Label htmlFor="custContact">Contact Person</Label>
              <Input id="custContact" data-testid="input-customer-contact" value={customerForm.contactPerson} onChange={(e) => setCustomerForm({ ...customerForm, contactPerson: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button data-testid="button-submit-customer" disabled={customerMutation.isPending} onClick={() => customerMutation.mutate(customerForm)}>
              {customerMutation.isPending ? "Saving..." : editingCustomer ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
