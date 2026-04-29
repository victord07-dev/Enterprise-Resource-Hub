import { useState, Fragment, useEffect, useMemo } from "react";
import { useLocation } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { ToastAction } from "@/components/ui/toast";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Search, Truck, Users, ClipboardList, Pencil, Trash2, X, ChevronDown, ChevronRight, Star, FileText, Check, ArrowRightCircle, AlertTriangle, Warehouse, Package, ShoppingCart, MapPin, Download, Ban, CheckCircle, PackagePlus } from "lucide-react";
import { HierarchicalProductPicker } from "@/components/HierarchicalProductPicker";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import type { Supplier, PurchaseOrder, Product, SupplierProduct, PurchaseOrderItem, Warehouse as WarehouseType, PurchaseRequest, PurchaseRequestItem, SalesOrder, GoodsReceiptNote, GoodsReceiptNoteItem } from "@shared/schema";

interface POLineItem {
  productId: string;
  description: string;
  quantity: number;
  unitCost: number;
  totalCost: number;
  _priceSource?: "supplier" | "distributor" | "fallback" | "manual" | "none";
  _priceLastUpdated?: string | null;
}

function formatRelative(ts: string | null | undefined): string {
  if (!ts) return "";
  const ms = Date.now() - new Date(ts).getTime();
  if (ms < 60_000) return "just now";
  const mins = Math.round(ms / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  return `${days}d ago`;
}

function StatusBadge({ status }: { status: string }) {
  const variants: Record<string, string> = {
    pending: "bg-yellow-100 text-yellow-800 dark:bg-yellow-950/40 dark:text-yellow-400",
    approved: "bg-blue-100 text-blue-800 dark:bg-blue-950/40 dark:text-blue-400",
    shipped: "bg-purple-100 text-purple-800 dark:bg-purple-950/40 dark:text-purple-400",
    partial: "bg-orange-100 text-orange-800 dark:bg-orange-950/40 dark:text-orange-400",
    received: "bg-green-100 text-green-800 dark:bg-green-950/40 dark:text-green-400",
    cancelled: "bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-400",
    cancellation_requested: "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-400",
    converted: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-400",
  };
  const labels: Record<string, string> = {
    cancellation_requested: "Cancel Requested",
    partial: "Partially Received",
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium ${variants[status] || variants.pending}`}>
      {labels[status] || status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

// Phase 6.5 C1: which required-for-issuance fields is this supplier missing?
function getSupplierMissingFields(s: Supplier): string[] {
  const missing: string[] = [];
  if (!s.gstNumber || String(s.gstNumber).trim() === "") missing.push("GST");
  if (!s.phone || String(s.phone).trim() === "") missing.push("Phone");
  if (!s.address || String(s.address).trim() === "") missing.push("Address");
  return missing;
}

// Phase 6.5 C2: parse `supplier_incomplete` error from apiRequest's "STATUS: BODY" message
function parseSupplierIncompleteError(err: unknown): { supplierId: string | null; supplierName: string | null; missing: string[]; message: string } | null {
  if (!err) return null;
  const msg = err instanceof Error ? err.message : String(err);
  if (!msg.startsWith("422")) return null;
  const idx = msg.indexOf("{");
  if (idx === -1) return null;
  try {
    const body = JSON.parse(msg.slice(idx));
    if (body?.code !== "supplier_incomplete") return null;
    return {
      supplierId: body.supplierId ?? null,
      supplierName: body.supplierName ?? null,
      missing: Array.isArray(body.missing) ? body.missing : [],
      message: body.message ?? "Supplier is missing required details.",
    };
  } catch {
    return null;
  }
}

function SupplierDropdown({ poLineItems, allSupplierProducts, suppliers, value, onChange }: {
  poLineItems: POLineItem[];
  allSupplierProducts: SupplierProduct[];
  suppliers: Supplier[];
  value: string;
  onChange: (v: string) => void;
}) {
  const selectedProductIds = useMemo(() => poLineItems.filter(it => it.productId).map(it => it.productId), [poLineItems]);
  const { toast } = useToast();

  const filteredSuppliers = useMemo(() => {
    if (selectedProductIds.length === 0 || !allSupplierProducts.length) return suppliers;
    return suppliers.filter(s => {
      const supplierProductIds = new Set(allSupplierProducts.filter(sp => sp.supplierId === s.id).map(sp => sp.productId));
      return selectedProductIds.every(pid => supplierProductIds.has(pid));
    });
  }, [selectedProductIds, allSupplierProducts, suppliers]);

  useEffect(() => {
    if (value && filteredSuppliers.length > 0 && !filteredSuppliers.find(s => s.id === value)) {
      onChange("");
      toast({ title: "Supplier cleared", description: "The selected supplier does not carry all chosen products." });
    }
  }, [filteredSuppliers, value]);

  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger data-testid="select-po-supplier">
        <SelectValue placeholder="Select supplier" />
      </SelectTrigger>
      <SelectContent>
        {filteredSuppliers.length > 0 ? filteredSuppliers.map((s) => (
          <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
        )) : (
          <div className="px-2 py-3 text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
            <AlertTriangle className="w-3.5 h-3.5" />
            No supplier carries all selected products
          </div>
        )}
      </SelectContent>
    </Select>
  );
}

function emptyLineItem(): POLineItem {
  return { productId: "", description: "", quantity: 1, unitCost: 0, totalCost: 0 };
}

function POLineItemsEditor({ items, onChange, products, supplierProducts, supplierProductsLoading, supplierSelected }: {
  items: POLineItem[];
  onChange: (items: POLineItem[]) => void;
  products: Product[];
  supplierProducts: SupplierProduct[];
  supplierProductsLoading: boolean;
  supplierSelected: boolean;
}) {
  const { toast: poToast } = useToast();
  const spMap = new Map<string, SupplierProduct>();
  for (const sp of supplierProducts) {
    spMap.set(sp.productId, sp);
  }

  const lifecycleSuffix = (ls: string | undefined): string => {
    switch (ls) {
      case "draft":        return "(Not selectable — draft)";
      case "discontinued": return "(Not selectable — discontinued)";
      case "replaced":     return "(Not selectable — replaced)";
      default:             return "";
    }
  };

  const updateItem = (index: number, field: string, value: any) => {
    const updated = [...items];
    const item = { ...updated[index], [field]: value };

    if (field === "productId" && value) {
      const prod = products.find(p => p.id === value);
      if (prod) {
        const ls = prod.lifecycleStatus as string | undefined;
        if (ls && ls !== "active") {
          const replId: string | null = prod.replacedByProductId || null;
          const replacement = replId ? products.find(p => p.id === replId) : null;
          const labelMap: Record<string, string> = { draft: "draft", discontinued: "discontinued", replaced: "replaced" };
          const label = labelMap[ls] || ls;
          poToast({
            title: `Cannot add ${label} product`,
            description: ls === "replaced" && replacement
              ? `${prod.name} has been replaced by ${replacement.name}. Use the replacement instead.`
              : `${prod.name} is marked ${label} and cannot be ordered. Pick an active product.`,
            variant: "destructive",
            action: ls === "replaced" && replacement
              ? (
                <ToastAction
                  altText="Switch to replacement"
                  onClick={() => updateItem(index, "productId", replacement.id)}
                  data-testid={`button-switch-po-replacement-${index}`}
                >
                  Switch to {replacement.name}
                </ToastAction>
              )
              : undefined,
          });
          return;
        }
        item.description = prod.name;
        const sp = spMap.get(value);
        // Phase 6.6 C2: prefer supplier_products.supplierPrice; fallback to products.distributorPrice (NOT costPrice).
        if (sp) {
          item.unitCost = Number(sp.supplierPrice);
          item._priceSource = "supplier";
          item._priceLastUpdated = sp.lastPriceUpdatedAt ? String(sp.lastPriceUpdatedAt) : null;
        } else if (prod.distributorPrice) {
          item.unitCost = Number(prod.distributorPrice);
          item._priceSource = "distributor";
          item._priceLastUpdated = null;
        } else {
          item.unitCost = prod.costPrice ? Number(prod.costPrice) : Number(prod.unitPrice);
          item._priceSource = "fallback";
          item._priceLastUpdated = null;
        }
        item.totalCost = item.quantity * item.unitCost;
      }
    }

    if (field === "unitCost") {
      item._priceSource = "manual";
      item._priceLastUpdated = null;
    }

    if (field === "quantity" || field === "unitCost") {
      const qty = field === "quantity" ? Number(value) : item.quantity;
      const cost = field === "unitCost" ? Number(value) : item.unitCost;
      item.totalCost = qty * cost;
    }

    updated[index] = item;
    onChange(updated);
  };

  const addItem = () => onChange([...items, emptyLineItem()]);
  const removeItem = (index: number) => {
    const updated = items.filter((_, i) => i !== index);
    onChange(updated.length === 0 ? [emptyLineItem()] : updated);
  };

  const grandTotal = items.reduce((sum, item) => sum + item.totalCost, 0);

  const supplierProductIds = new Set(supplierProducts.map(sp => sp.productId));
  const supplierCatalogProducts = products.filter(p => supplierProductIds.has(p.id));
  const otherProducts = products.filter(p => !supplierProductIds.has(p.id));

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <Label className="text-sm font-medium">Line Items</Label>
        <div className="flex items-center gap-2">
          {supplierSelected && supplierProductsLoading && (
            <span className="text-xs text-amber-600 dark:text-amber-400" data-testid="text-supplier-prices-loading">
              Loading supplier prices…
            </span>
          )}
          <Button type="button" size="sm" variant="outline" onClick={addItem} data-testid="button-add-po-line-item">
            <Plus className="w-3 h-3 mr-1" /> Add Item
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        {items.map((item, index) => (
          <div key={index} className="border rounded-lg p-3 space-y-2 bg-muted/30" data-testid={`po-line-item-${index}`}>
            {/* Row 1: Hierarchical picker + delete */}
            <div className="flex items-start gap-2">
              <div className="flex-1">
                <HierarchicalProductPicker
                  lineIndex={index}
                  products={products}
                  hidePrice={true}
                  currentProductId={item.productId}
                  onProductSelect={(pid) => updateItem(index, "productId", pid)}
                />
              </div>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="shrink-0 mt-6"
                onClick={() => removeItem(index)}
                data-testid={`button-remove-po-item-${index}`}
              >
                <X className="w-3 h-3" />
              </Button>
            </div>

            {/* Row 2: Description | Qty | Supplier Price | Total */}
            <div className="grid grid-cols-12 gap-2 items-end">
              <div className="col-span-5">
                <Label className="text-xs text-muted-foreground mb-1 block">Description</Label>
                <Input
                  value={item.description}
                  onChange={(e) => updateItem(index, "description", e.target.value)}
                  placeholder="Description"
                  data-testid={`input-po-item-desc-${index}`}
                />
              </div>
              <div className="col-span-2">
                <Label className="text-xs text-muted-foreground mb-1 block">Qty</Label>
                <Input
                  type="number"
                  min={1}
                  value={item.quantity}
                  onChange={(e) => updateItem(index, "quantity", parseInt(e.target.value) || 1)}
                  data-testid={`input-po-item-qty-${index}`}
                />
              </div>
              <div className="col-span-3">
                <Label className="text-xs text-muted-foreground mb-1 block">Supplier Price (₹)</Label>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={item.unitCost}
                  onChange={(e) => updateItem(index, "unitCost", parseFloat(e.target.value) || 0)}
                  data-testid={`input-po-item-cost-${index}`}
                />
              </div>
              <div className="col-span-2 text-right">
                <Label className="text-xs text-muted-foreground mb-1 block">Line Total</Label>
                <span className="text-sm font-semibold" data-testid={`text-po-item-total-${index}`}>
                  ₹{item.totalCost.toLocaleString("en-IN", { minimumFractionDigits: 0 })}
                </span>
              </div>
            </div>

            {/* Price source hint */}
            {item.productId && item._priceSource && (
              <div
                className={
                  "text-[10px] leading-tight " +
                  (item._priceSource === "supplier"
                    ? "text-green-700 dark:text-green-400"
                    : item._priceSource === "manual"
                    ? "text-blue-700 dark:text-blue-400"
                    : "text-amber-700 dark:text-amber-400")
                }
                data-testid={`text-price-source-${index}`}
              >
                {item._priceSource === "supplier" && (
                  <>Supplier price{item._priceLastUpdated ? ` · updated ${formatRelative(item._priceLastUpdated)}` : ""}</>
                )}
                {item._priceSource === "distributor" && <>Distributor price (no supplier-specific price)</>}
                {item._priceSource === "fallback" && <>Fallback (no supplier or distributor price)</>}
                {item._priceSource === "manual" && <>Manually edited</>}
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="flex justify-end pt-2 border-t">
        <div className="text-sm font-semibold" data-testid="text-po-grand-total">
          Grand Total: ₹{grandTotal.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
        </div>
      </div>
    </div>
  );
}

function SupplierProductCatalog({ supplierId, suppliers }: { supplierId: string; suppliers: Supplier[] }) {
  const { toast } = useToast();
  const { data: supplierProds, isLoading } = useQuery<SupplierProduct[]>({
    queryKey: ["/api/suppliers", supplierId, "products"],
    queryFn: () => apiRequest("GET", `/api/suppliers/${supplierId}/products`).then(r => r.json()),
  });
  const { data: allProducts } = useQuery<Product[]>({ queryKey: ["/api/products"] });

  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [editingSp, setEditingSp] = useState<SupplierProduct | null>(null);
  const [spForm, setSpForm] = useState({ productId: "", supplierPrice: "", supplierSku: "", leadTimeDays: "", isPreferred: false, notes: "" });

  const addMutation = useMutation({
    mutationFn: async (data: any) => {
      await apiRequest("POST", `/api/suppliers/${supplierId}/products`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/suppliers", supplierId, "products"] });
      toast({ title: "Product added to supplier catalog" });
      setAddDialogOpen(false);
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const editMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      await apiRequest("PATCH", `/api/supplier-products/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/suppliers", supplierId, "products"] });
      toast({ title: "Supplier product updated" });
      setEditingSp(null);
      setAddDialogOpen(false);
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/supplier-products/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/suppliers", supplierId, "products"] });
      toast({ title: "Product removed from supplier catalog" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const openAdd = () => {
    setEditingSp(null);
    setSpForm({ productId: "", supplierPrice: "", supplierSku: "", leadTimeDays: "", isPreferred: false, notes: "" });
    setAddDialogOpen(true);
  };

  const openEdit = (sp: SupplierProduct) => {
    setEditingSp(sp);
    setSpForm({
      productId: sp.productId,
      supplierPrice: String(sp.supplierPrice),
      supplierSku: sp.supplierSku || "",
      leadTimeDays: sp.leadTimeDays ? String(sp.leadTimeDays) : "",
      isPreferred: sp.isPreferred,
      notes: sp.notes || "",
    });
    setAddDialogOpen(true);
  };

  const handleSubmit = () => {
    const payload = {
      productId: spForm.productId,
      supplierPrice: spForm.supplierPrice,
      supplierSku: spForm.supplierSku || null,
      leadTimeDays: spForm.leadTimeDays ? parseInt(spForm.leadTimeDays) : null,
      isPreferred: spForm.isPreferred,
      notes: spForm.notes || null,
    };
    if (editingSp) {
      editMutation.mutate({ id: editingSp.id, data: payload });
    } else {
      addMutation.mutate(payload);
    }
  };

  const productMap = new Map<string, Product>();
  allProducts?.forEach(p => productMap.set(p.id, p));

  const existingProductIds = new Set(supplierProds?.map(sp => sp.productId) || []);
  const availableProducts = allProducts?.filter(p => !existingProductIds.has(p.id)) || [];

  const lowestPrice = supplierProds && supplierProds.length > 0
    ? Math.min(...supplierProds.map(sp => Number(sp.supplierPrice)))
    : 0;

  if (isLoading) {
    return <div className="p-4"><Skeleton className="h-16 w-full" /></div>;
  }

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <span className="text-sm font-medium text-muted-foreground">Product Catalog</span>
        <Button size="sm" variant="outline" onClick={openAdd} data-testid={`button-add-supplier-product-${supplierId}`}>
          <Plus className="w-3 h-3 mr-1" /> Add Product
        </Button>
      </div>

      {supplierProds && supplierProds.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left p-2 font-medium text-muted-foreground text-xs">Product</th>
                <th className="text-left p-2 font-medium text-muted-foreground text-xs">SKU</th>
                <th className="text-left p-2 font-medium text-muted-foreground text-xs">Supplier SKU</th>
                <th className="text-right p-2 font-medium text-muted-foreground text-xs">Price</th>
                <th className="text-center p-2 font-medium text-muted-foreground text-xs">Lead Time</th>
                <th className="text-center p-2 font-medium text-muted-foreground text-xs">Preferred</th>
                <th className="text-right p-2 font-medium text-muted-foreground text-xs">Actions</th>
              </tr>
            </thead>
            <tbody>
              {supplierProds.map((sp) => {
                const prod = productMap.get(sp.productId);
                const isCheapest = Number(sp.supplierPrice) === lowestPrice && supplierProds.length > 1;
                return (
                  <tr key={sp.id} className="border-b last:border-0" data-testid={`row-supplier-product-${sp.id}`}>
                    <td className="p-2 font-medium">{prod?.name || "Unknown"}</td>
                    <td className="p-2 text-muted-foreground">{prod?.sku || "—"}</td>
                    <td className="p-2 text-muted-foreground">{sp.supplierSku || "—"}</td>
                    <td className={`p-2 text-right font-medium ${isCheapest ? "text-green-600 dark:text-green-400" : ""}`}>
                      ₹{Number(sp.supplierPrice).toLocaleString()}
                      {isCheapest && <Badge variant="secondary" className="ml-1 text-[10px]">Lowest</Badge>}
                      {/* Phase 6.6 C4: hint when supplier price was updated by a PO save */}
                      {(sp as any).lastPriceUpdatedAt && (() => {
                        const ts = new Date((sp as any).lastPriceUpdatedAt);
                        const ageMs = Date.now() - ts.getTime();
                        const days = Math.floor(ageMs / 86400000);
                        const hint = days <= 0 ? "(updated just now)" : days === 1 ? "(updated 1 day ago)" : `(updated ${days} days ago)`;
                        return <div className="text-[10px] font-normal text-muted-foreground" data-testid={`text-supplier-price-updated-${sp.id}`}>{hint}</div>;
                      })()}
                    </td>
                    <td className="p-2 text-center text-muted-foreground">{sp.leadTimeDays ? `${sp.leadTimeDays} days` : "—"}</td>
                    <td className="p-2 text-center">
                      {sp.isPreferred && <Star className="w-4 h-4 text-yellow-500 inline" />}
                    </td>
                    <td className="p-2 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button size="icon" variant="ghost" onClick={() => openEdit(sp)} data-testid={`button-edit-sp-${sp.id}`}>
                          <Pencil className="w-3 h-3" />
                        </Button>
                        <Button size="icon" variant="ghost" onClick={() => { if (confirm("Remove this product from supplier catalog?")) deleteMutation.mutate(sp.id); }} data-testid={`button-delete-sp-${sp.id}`}>
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground text-center py-4">No products in this supplier's catalog.</p>
      )}

      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingSp ? "Edit Supplier Product" : "Add Product to Catalog"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Product</Label>
              {editingSp ? (
                <Input value={productMap.get(editingSp.productId)?.name || ""} disabled />
              ) : (
                <>
                <Select
                  value={spForm.productId}
                  onValueChange={(v) => {
                    const picked = productMap.get(v);
                    const dp = picked?.distributorPrice;
                    const autofill = !editingSp && dp != null && Number(dp) > 0 && !spForm.supplierPrice;
                    setSpForm({
                      ...spForm,
                      productId: v,
                      supplierPrice: autofill ? String(dp) : spForm.supplierPrice,
                    });
                  }}
                >
                  <SelectTrigger data-testid="select-sp-product">
                    <SelectValue placeholder="Select product" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableProducts.map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.name} ({p.sku})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {!editingSp && spForm.productId && productMap.get(spForm.productId)?.distributorPrice != null && Number(productMap.get(spForm.productId)?.distributorPrice) > 0 && (
                  <p className="text-xs text-muted-foreground" data-testid="text-sp-autofill-hint">
                    Auto-filled from product's distributor price (₹{Number(productMap.get(spForm.productId)?.distributorPrice).toLocaleString()}). Edit if this supplier charges differently.
                  </p>
                )}
                </>
              )}
            </div>
            <div className="space-y-2">
              <Label>Supplier Price (₹)</Label>
              <Input
                type="number"
                step="0.01"
                value={spForm.supplierPrice}
                onChange={(e) => setSpForm({ ...spForm, supplierPrice: e.target.value })}
                data-testid="input-sp-price"
              />
            </div>
            <div className="space-y-2">
              <Label>Supplier SKU</Label>
              <Input
                value={spForm.supplierSku}
                onChange={(e) => setSpForm({ ...spForm, supplierSku: e.target.value })}
                data-testid="input-sp-sku"
              />
            </div>
            <div className="space-y-2">
              <Label>Lead Time (days) <span className="text-xs text-muted-foreground font-normal">— optional</span></Label>
              <Input
                type="number"
                value={spForm.leadTimeDays}
                onChange={(e) => setSpForm({ ...spForm, leadTimeDays: e.target.value })}
                data-testid="input-sp-lead-time"
              />
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={spForm.isPreferred}
                onChange={(e) => setSpForm({ ...spForm, isPreferred: e.target.checked })}
                id="spPreferred"
                data-testid="checkbox-sp-preferred"
              />
              <Label htmlFor="spPreferred">Preferred Supplier</Label>
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Input
                value={spForm.notes}
                onChange={(e) => setSpForm({ ...spForm, notes: e.target.value })}
                data-testid="input-sp-notes"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              disabled={addMutation.isPending || editMutation.isPending}
              onClick={handleSubmit}
              data-testid="button-submit-sp"
            >
              {(addMutation.isPending || editMutation.isPending) ? "Saving..." : editingSp ? "Update" : "Add"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function POExpandedItems({ poId, linkedSalesOrder, deliveryType, deliveryAddress }: { poId: string; linkedSalesOrder?: { orderNumber: string; id: string } | null; deliveryType?: string; deliveryAddress?: string | null }) {
  const { data: items, isLoading } = useQuery<PurchaseOrderItem[]>({
    queryKey: ["/api/purchase-orders", poId, "items"],
    queryFn: () => apiRequest("GET", `/api/purchase-orders/${poId}/items`).then(r => r.json()),
  });
  const { data: allProducts } = useQuery<Product[]>({ queryKey: ["/api/products"] });
  const { data: poGrns } = useQuery<GoodsReceiptNote[]>({
    queryKey: ["/api/grns/by-po", poId],
    queryFn: () => apiRequest("GET", `/api/grns/by-po/${poId}`).then(r => r.json()),
  });

  const productMap = new Map<string, Product>();
  allProducts?.forEach(p => productMap.set(p.id, p));

  const confirmedGrns = (poGrns ?? []).filter(g => g.status === "confirmed");

  const [grnItemsCache, setGrnItemsCache] = useState<Record<string, GoodsReceiptNoteItem[]>>({});
  useEffect(() => {
    confirmedGrns.forEach(async (g) => {
      if (!grnItemsCache[g.id]) {
        try {
          const res = await apiRequest("GET", `/api/grns/${g.id}/items`);
          const its = await res.json();
          setGrnItemsCache(prev => ({ ...prev, [g.id]: Array.isArray(its) ? its : [] }));
        } catch { setGrnItemsCache(prev => ({ ...prev, [g.id]: [] })); }
      }
    });
  }, [confirmedGrns.map(g => g.id).join(",")]);

  const receivedPerProduct: Record<string, number> = {};
  Object.values(grnItemsCache).forEach(gItems => {
    gItems.forEach(gi => {
      receivedPerProduct[gi.productId] = (receivedPerProduct[gi.productId] || 0) + gi.receivedQuantity;
    });
  });

  if (isLoading) {
    return <div className="p-4"><Skeleton className="h-12 w-full" /></div>;
  }

  if (!items || items.length === 0) {
    return <div className="p-4 text-sm text-muted-foreground text-center">No line items for this PO.</div>;
  }

  return (
    <div className="p-4">
      {linkedSalesOrder && (
        <div className="mb-3 flex items-center gap-2" data-testid={`text-po-linked-so-${poId}`}>
          <span className="text-xs font-medium text-muted-foreground">Linked Sales Order:</span>
          <Badge variant={deliveryType === "direct_delivery" ? "default" : "secondary"} className="text-xs">
            <ShoppingCart className="w-3 h-3 mr-1" />
            {linkedSalesOrder.orderNumber}
          </Badge>
          {deliveryType === "direct_delivery" && (
            <span className="text-xs text-amber-600 dark:text-amber-400 font-medium">Direct to Customer</span>
          )}
        </div>
      )}
      {deliveryAddress && (
        <div className="mb-3 flex items-start gap-2 p-2 bg-blue-50 dark:bg-blue-950/20 rounded-md" data-testid={`text-po-delivery-address-${poId}`}>
          <MapPin className="w-4 h-4 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
          <div>
            <span className="text-xs font-medium text-blue-700 dark:text-blue-300">Delivery Address:</span>
            <p className="text-xs text-blue-600 dark:text-blue-400 mt-0.5">{deliveryAddress}</p>
          </div>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b">
              <th className="text-left p-2 font-medium text-muted-foreground text-xs">Product</th>
              <th className="text-left p-2 font-medium text-muted-foreground text-xs">Description</th>
              <th className="text-center p-2 font-medium text-muted-foreground text-xs">Ordered</th>
              <th className="text-center p-2 font-medium text-muted-foreground text-xs">Received</th>
              <th className="text-center p-2 font-medium text-muted-foreground text-xs">Outstanding</th>
              <th className="text-right p-2 font-medium text-muted-foreground text-xs">Supplier Price</th>
              <th className="text-right p-2 font-medium text-muted-foreground text-xs">Total</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => {
              const prod = item.productId ? productMap.get(item.productId) : null;
              const received = item.productId ? (receivedPerProduct[item.productId] ?? 0) : 0;
              const outstanding = Math.max(0, item.quantity - received);
              return (
                <tr key={item.id} className="border-b last:border-0" data-testid={`row-po-item-${item.id}`}>
                  <td className="p-2 font-medium">{prod?.name || "—"}</td>
                  <td className="p-2 text-muted-foreground">{item.description || "—"}</td>
                  <td className="p-2 text-center">{item.quantity}</td>
                  <td className="p-2 text-center">
                    <span className={`font-medium ${received >= item.quantity ? "text-green-600 dark:text-green-400" : "text-orange-600 dark:text-orange-400"}`} data-testid={`text-po-item-received-${item.id}`}>
                      {received}
                    </span>
                  </td>
                  <td className="p-2 text-center">
                    <span className={`font-medium ${outstanding === 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`} data-testid={`text-po-item-outstanding-${item.id}`}>
                      {outstanding}
                    </span>
                  </td>
                  <td className="p-2 text-right">₹{Number(item.unitCost).toLocaleString()}</td>
                  <td className="p-2 text-right font-medium">₹{Number(item.totalCost).toLocaleString()}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={6} className="p-2 text-right font-semibold text-xs">Grand Total:</td>
              <td className="p-2 text-right font-semibold" data-testid={`text-po-items-total-${poId}`}>
                ₹{items.reduce((sum, i) => sum + Number(i.totalCost), 0).toLocaleString()}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

function PRExpandedItems({ prId }: { prId: string }) {
  const { data: items, isLoading } = useQuery<PurchaseRequestItem[]>({
    queryKey: ["/api/purchase-requests", prId, "items"],
    queryFn: () => apiRequest("GET", `/api/purchase-requests/${prId}/items`).then(r => r.json()),
  });
  const { data: allProducts } = useQuery<Product[]>({ queryKey: ["/api/products"] });

  const productMap = new Map<string, Product>();
  allProducts?.forEach(p => productMap.set(p.id, p));

  if (isLoading) {
    return <div className="p-4"><Skeleton className="h-12 w-full" /></div>;
  }

  if (!items || items.length === 0) {
    return <div className="p-4 text-sm text-muted-foreground text-center">No items in this purchase request.</div>;
  }

  return (
    <div className="p-4">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b">
              <th className="text-left p-2 font-medium text-muted-foreground text-xs">Product</th>
              <th className="text-left p-2 font-medium text-muted-foreground text-xs">Description</th>
              <th className="text-center p-2 font-medium text-muted-foreground text-xs">Required Qty</th>
              <th className="text-center p-2 font-medium text-muted-foreground text-xs">Available Stock</th>
              <th className="text-center p-2 font-medium text-muted-foreground text-xs">Shortfall</th>
              <th className="text-right p-2 font-medium text-muted-foreground text-xs">Supplier Price</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => {
              const prod = productMap.get(item.productId);
              return (
                <tr key={item.id} className="border-b last:border-0" data-testid={`row-pr-item-${item.id}`}>
                  <td className="p-2 font-medium">{prod?.name || "—"}</td>
                  <td className="p-2 text-muted-foreground">{item.description || "—"}</td>
                  <td className="p-2 text-center">{item.requiredQuantity}</td>
                  <td className="p-2 text-center">{item.availableStock}</td>
                  <td className="p-2 text-center">
                    <span className="inline-flex items-center gap-1 text-red-600 font-medium">
                      <AlertTriangle className="w-3 h-3" />
                      {item.shortfallQuantity}
                    </span>
                  </td>
                  <td className="p-2 text-right">
                    {item.unitCost && Number(item.unitCost) > 0 ? (
                      `₹${Number(item.unitCost).toLocaleString()}`
                    ) : (
                      <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400 font-medium text-xs" data-testid={`badge-unit-cost-missing-${item.id}`}>
                        <AlertTriangle className="w-3 h-3" />
                        No unit cost
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function SupplyChain() {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const { data: suppliers, isLoading: suppliersLoading } = useQuery<Supplier[]>({ queryKey: ["/api/suppliers"] });
  const { data: purchaseOrders, isLoading: poLoading } = useQuery<PurchaseOrder[]>({ queryKey: ["/api/purchase-orders"] });
  const { data: allProducts } = useQuery<Product[]>({ queryKey: ["/api/products"] });
  const { data: purchaseRequests, isLoading: prLoading } = useQuery<PurchaseRequest[]>({ queryKey: ["/api/purchase-requests"] });
  const { data: salesOrders } = useQuery<SalesOrder[]>({ queryKey: ["/api/sales-orders"] });

  const [poDialogOpen, setPoDialogOpen] = useState(false);
  const [editingPo, setEditingPo] = useState<PurchaseOrder | null>(null);
  const [poForm, setPoForm] = useState({ poNumber: "", supplierId: "", status: "pending", deliveryType: "warehouse", expectedDelivery: "", notes: "" });
  const [poLineItems, setPoLineItems] = useState<POLineItem[]>([emptyLineItem()]);

  const [supplierDialogOpen, setSupplierDialogOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [supplierForm, setSupplierForm] = useState({ name: "", email: "", phone: "", address: "", gstNumber: "", contactPerson: "", category: "Solar Panels" });

  const [expandedPoId, setExpandedPoId] = useState<string | null>(null);
  const [expandedSupplierId, setExpandedSupplierId] = useState<string | null>(null);
  const [expandedPrId, setExpandedPrId] = useState<string | null>(null);
  const [poSearch, setPoSearch] = useState("");

  const [prDialogOpen, setPrDialogOpen] = useState(false);
  const [editingPr, setEditingPr] = useState<PurchaseRequest | null>(null);
  const [prForm, setPrForm] = useState({ supplierId: "", priority: "medium", notes: "" });
  const [prApproveMode, setPrApproveMode] = useState(false);
  const [prItemCosts, setPrItemCosts] = useState<Record<string, string>>({});
  const [prStatusFilter, setPrStatusFilter] = useState("all");
  const [prPriorityFilter, setPrPriorityFilter] = useState("all");

  const [convertDialogOpen, setConvertDialogOpen] = useState(false);
  const [convertPrId, setConvertPrId] = useState<string | null>(null);
  const [convertDeliveryType, setConvertDeliveryType] = useState<"warehouse" | "direct_delivery">("warehouse");

  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [cancelPoId, setCancelPoId] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState("");

  // Phase 6.5 C2: state for the "supplier incomplete" modal raised when PO issuance is blocked
  const [incompleteSupplierBlock, setIncompleteSupplierBlock] = useState<{
    supplierId: string | null;
    supplierName: string | null;
    missing: string[];
    message: string;
  } | null>(null);

  const { data: warehouses } = useQuery<WarehouseType[]>({ queryKey: ["/api/warehouses"] });
  const { data: allSupplierProducts } = useQuery<SupplierProduct[]>({ queryKey: ["/api/supplier-products"] });

  const selectedSupplierId = poForm.supplierId;
  const { data: supplierCatalog, isLoading: supplierCatalogLoading, isFetching: supplierCatalogFetching } = useQuery<SupplierProduct[]>({
    queryKey: ["/api/suppliers", selectedSupplierId, "products"],
    queryFn: () => apiRequest("GET", `/api/suppliers/${selectedSupplierId}/products`).then(r => r.json()),
    enabled: !!selectedSupplierId,
  });

  const poMutation = useMutation({
    mutationFn: async (data: any) => {
      const { lineItems, ...poData } = data;
      const grandTotal = lineItems.reduce((sum: number, item: POLineItem) => sum + item.totalCost, 0);
      const payload = { ...poData, totalAmount: String(grandTotal) };

      let po: any;
      if (editingPo) {
        const resp = await apiRequest("PATCH", `/api/purchase-orders/${editingPo.id}`, payload);
        po = await resp.json();
      } else {
        const { poNumber, ...createPayload } = payload;
        const resp = await apiRequest("POST", "/api/purchase-orders", createPayload);
        po = await resp.json();
      }

      const validItems = lineItems.filter((item: POLineItem) => item.productId || item.description);
      if (validItems.length > 0) {
        await apiRequest("POST", `/api/purchase-orders/${po.id}/items`, {
          items: validItems.map((item: POLineItem) => ({
            productId: item.productId || null,
            description: item.description,
            quantity: item.quantity,
            unitCost: String(item.unitCost),
          })),
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/purchase-orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/inventory/incoming-stock"] });
      toast({ title: editingPo ? "Purchase order updated" : "Purchase order created" });
      setPoDialogOpen(false);
      setEditingPo(null);
    },
    onError: (error: Error) => {
      // Phase 6.5 C2: convert structured supplier_incomplete error into modal instead of generic toast
      const parsed = parseSupplierIncompleteError(error);
      if (parsed) {
        setIncompleteSupplierBlock(parsed);
        return;
      }
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const deletePoMutation = useMutation({
    mutationFn: async (id: string) => { await apiRequest("DELETE", `/api/purchase-orders/${id}`); },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/purchase-orders"] });
      toast({ title: "Purchase order deleted" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const requestCancelMutation = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      await apiRequest("POST", `/api/purchase-orders/${id}/request-cancellation`, { reason });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/purchase-orders"] });
      toast({ title: "Cancellation requested", description: "Awaiting approval to finalize cancellation." });
      setCancelDialogOpen(false);
      setCancelPoId(null);
      setCancelReason("");
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const approveCancelMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("POST", `/api/purchase-orders/${id}/approve-cancellation`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/purchase-orders"] });
      toast({ title: "Cancellation approved", description: "Purchase order has been cancelled." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const [generatingChallanPoId, setGeneratingChallanPoId] = useState<string | null>(null);
  const generateChallanMutation = useMutation({
    mutationFn: async (poId: string) => {
      setGeneratingChallanPoId(poId);
      const res = await apiRequest("POST", `/api/purchase-orders/${poId}/generate-challan`);
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/delivery-challans"] });
      toast({ title: "Draft challan generated", description: `Challan ${data.challanNumber} created. View it in the Inventory module.` });
      setGeneratingChallanPoId(null);
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      setGeneratingChallanPoId(null);
    },
  });

  const [grnWarehouseDialogPoId, setGrnWarehouseDialogPoId] = useState<string | null>(null);
  const [grnSelectedWarehouseId, setGrnSelectedWarehouseId] = useState<string>("");
  const [grnSupplierChallan, setGrnSupplierChallan] = useState<string>("");
  const [creatingGrnPoId, setCreatingGrnPoId] = useState<string | null>(null);

  const createGrnFromPoMutation = useMutation({
    mutationFn: async ({ poId, warehouseId, supplierChallanNumber }: { poId: string; warehouseId: string; supplierChallanNumber: string }) => {
      setCreatingGrnPoId(poId);
      const token = localStorage.getItem("token");
      const res = await fetch(`/api/grns/create-from-po/${poId}`, {
        method: "POST",
        headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ warehouseId, supplierChallanNumber }),
      });
      const data = await res.json();
      return { status: res.status, data };
    },
    onSuccess: ({ status, data }: { status: number; data: any }) => {
      setCreatingGrnPoId(null);
      setGrnWarehouseDialogPoId(null);
      if (status === 409) {
        toast({ title: "Draft GRN already exists", description: `${data.existingGrnNumber} is already open. Find it in Inventory → GRN tab.`, variant: "destructive" });
        navigate(`/inventory?tab=grn&highlightGrn=${data.existingGrnId}`);
      } else if (status >= 400) {
        toast({ title: "Error", description: data.message || "Failed to create GRN", variant: "destructive" });
      } else {
        queryClient.invalidateQueries({ queryKey: ["/api/grns"] });
        queryClient.invalidateQueries({ queryKey: ["/api/purchase-orders"] });
        toast({ title: "Draft GRN created", description: `${data.grnNumber} created. Opening Inventory → GRN tab...` });
        navigate(`/inventory?tab=grn&highlightGrn=${data.id}`);
      }
    },
    onError: (error: any) => {
      setCreatingGrnPoId(null);
      toast({ title: "Error", description: error.message || "Failed to create GRN", variant: "destructive" });
    },
  });

  const [downloadingPoId, setDownloadingPoId] = useState<string | null>(null);
  const downloadPoPdf = async (po: PurchaseOrder) => {
    setDownloadingPoId(po.id);
    try {
      const res = await apiRequest("GET", `/api/purchase-orders/${po.id}/pdf`);
      if (!res.ok) throw new Error("Failed to generate PDF");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${po.poNumber}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Failed to generate PDF", variant: "destructive" });
    } finally {
      setDownloadingPoId(null);
    }
  };

  const updatePrMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      await apiRequest("PATCH", `/api/purchase-requests/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/purchase-requests"] });
      toast({ title: prApproveMode ? "Purchase request approved" : "Purchase request updated" });
      setPrDialogOpen(false);
      setEditingPr(null);
      setPrApproveMode(false);
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  // Saves updated item unit costs then updates the PR header fields (+ optional status)
  const savePrWithItems = async (approveStatus?: "approved") => {
    if (!editingPr || !prDialogItems) return;
    // Step 1: persist any edited unit costs
    const updatedItems = prDialogItems.map(item => ({
      ...item,
      unitCost: prItemCosts[item.id] ? prItemCosts[item.id] : item.unitCost,
    }));
    try {
      const itemsRes = await apiRequest("POST", `/api/purchase-requests/${editingPr.id}/items`, { items: updatedItems });
      if (!itemsRes.ok) {
        const err = await itemsRes.json().catch(() => ({}));
        toast({ title: "Failed to save item costs", description: err.message || "Please try again.", variant: "destructive" });
        return;
      }
    } catch {
      toast({ title: "Failed to save item costs", description: "Network error — please try again.", variant: "destructive" });
      return;
    }
    queryClient.invalidateQueries({ queryKey: ["/api/purchase-requests", editingPr.id, "items"] });
    // Step 2: update PR header + optional approve
    updatePrMutation.mutate({
      id: editingPr.id,
      data: {
        supplierId: prForm.supplierId || null,
        priority: prForm.priority,
        notes: prForm.notes || null,
        ...(approveStatus ? { status: approveStatus } : {}),
      },
    });
  };

  const deletePrMutation = useMutation({
    mutationFn: async (id: string) => { await apiRequest("DELETE", `/api/purchase-requests/${id}`); },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/purchase-requests"] });
      toast({ title: "Purchase request deleted" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const convertPrMutation = useMutation({
    mutationFn: async ({ id, deliveryType }: { id: string; deliveryType: string }) => {
      const resp = await apiRequest("POST", `/api/purchase-requests/${id}/convert-to-po`, { deliveryType });
      return resp.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/purchase-requests"] });
      queryClient.invalidateQueries({ queryKey: ["/api/purchase-orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/inventory/incoming-stock"] });
      toast({ title: "Purchase order created", description: `PO ${data.purchaseOrder?.poNumber || ""} created successfully.` });
      setConvertDialogOpen(false);
      setConvertPrId(null);
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  interface MatchingSupplier {
    supplierId: string;
    supplierName: string;
    matchedItemCount: number;
    totalItemCount: number;
    totalCost: string;
    items: Array<{ productId: string; productName: string; shortfallQuantity: number; supplierPrice: string | null; lineTotal: string | null; isPreferred: boolean }>;
  }

  const { data: matchingSuppliers, isLoading: matchingSuppliersLoading } = useQuery<MatchingSupplier[]>({
    queryKey: ["/api/purchase-requests", editingPr?.id, "matching-suppliers"],
    queryFn: () => editingPr ? apiRequest("GET", `/api/purchase-requests/${editingPr.id}/matching-suppliers`).then(r => r.json()) : Promise.resolve([]),
    enabled: !!editingPr && prDialogOpen,
  });

  const { data: prDialogItems } = useQuery<PurchaseRequestItem[]>({
    queryKey: ["/api/purchase-requests", editingPr?.id, "items"],
    queryFn: () => editingPr ? apiRequest("GET", `/api/purchase-requests/${editingPr.id}/items`).then(r => r.json()) : Promise.resolve([]),
    enabled: !!editingPr && prDialogOpen,
  });

  // Populate editable unit costs when PR items load (or when PR dialog opens fresh)
  useEffect(() => {
    if (prDialogItems && prDialogItems.length > 0) {
      const costs: Record<string, string> = {};
      for (const item of prDialogItems) {
        costs[item.id] = item.unitCost && parseFloat(item.unitCost) > 0 ? String(parseFloat(item.unitCost)) : "";
      }
      setPrItemCosts(costs);
    }
  }, [prDialogItems?.map(i => i.id).join(",")]);

  const selectedMatchingSupplier = matchingSuppliers?.find(ms => ms.supplierId === prForm.supplierId);

  // Auto-fill item costs from supplier catalog when dialog opens with a pre-assigned supplier
  // (handles case where PR was auto-generated with 0 unit costs but supplier is already known)
  useEffect(() => {
    if (!selectedMatchingSupplier || !prDialogItems) return;
    setPrItemCosts(prev => {
      const updated = { ...prev };
      let changed = false;
      for (const item of prDialogItems) {
        const existing = prev[item.id];
        if (!existing || parseFloat(existing) <= 0) {
          const catalogItem = selectedMatchingSupplier.items.find(i => i.productId === item.productId);
          if (catalogItem && catalogItem.supplierPrice && Number(catalogItem.supplierPrice) > 0) {
            updated[item.id] = String(Number(catalogItem.supplierPrice));
            changed = true;
          }
        }
      }
      return changed ? updated : prev;
    });
  }, [selectedMatchingSupplier?.supplierId, prDialogItems?.map(i => i.id).join(",")]);

  const openEditPr = (pr: PurchaseRequest, approveMode = false) => {
    setEditingPr(pr);
    setPrApproveMode(approveMode);
    setPrItemCosts({});
    setPrForm({
      supplierId: pr.supplierId || "",
      priority: pr.priority,
      notes: pr.notes || "",
    });
    setPrDialogOpen(true);
  };

  const supplierMutation = useMutation({
    mutationFn: async (data: any) => {
      if (editingSupplier) {
        await apiRequest("PATCH", `/api/suppliers/${editingSupplier.id}`, data);
      } else {
        await apiRequest("POST", "/api/suppliers", data);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/suppliers"] });
      toast({ title: editingSupplier ? "Supplier updated" : "Supplier created" });
      setSupplierDialogOpen(false);
      setEditingSupplier(null);
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const deleteSupplierMutation = useMutation({
    mutationFn: async (id: string) => { await apiRequest("DELETE", `/api/suppliers/${id}`); },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/suppliers"] });
      toast({ title: "Supplier deleted" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const openNewPo = () => {
    setEditingPo(null);
    setPoForm({ poNumber: "(Auto-generated)", supplierId: "", status: "pending", deliveryType: "warehouse", expectedDelivery: "", notes: "" });
    setPoLineItems([emptyLineItem()]);
    setPoDialogOpen(true);
  };

  const openEditPo = async (po: PurchaseOrder) => {
    setEditingPo(po);
    setPoForm({
      poNumber: po.poNumber,
      supplierId: po.supplierId,
      status: po.status,
      deliveryType: po.deliveryType || "warehouse",
      expectedDelivery: po.expectedDelivery ? new Date(po.expectedDelivery).toISOString().split("T")[0] : "",
      notes: po.notes || "",
    });
    try {
      const resp = await apiRequest("GET", `/api/purchase-orders/${po.id}/items`);
      const existingItems: PurchaseOrderItem[] = await resp.json();
      if (existingItems.length > 0) {
        setPoLineItems(existingItems.map(item => ({
          productId: item.productId || "",
          description: item.description || "",
          quantity: item.quantity,
          unitCost: Number(item.unitCost),
          totalCost: Number(item.totalCost),
        })));
      } else {
        setPoLineItems([emptyLineItem()]);
      }
    } catch {
      setPoLineItems([emptyLineItem()]);
    }
    setPoDialogOpen(true);
  };

  const openNewSupplier = () => {
    setEditingSupplier(null);
    setSupplierForm({ name: "", email: "", phone: "", address: "", gstNumber: "", contactPerson: "", category: "Solar Panels" });
    setSupplierDialogOpen(true);
  };

  const openEditSupplier = (s: Supplier) => {
    setEditingSupplier(s);
    setSupplierForm({
      name: s.name,
      email: s.email || "",
      phone: s.phone || "",
      address: s.address || "",
      gstNumber: s.gstNumber || "",
      contactPerson: s.contactPerson || "",
      category: s.category || "Solar Panels",
    });
    setSupplierDialogOpen(true);
  };

  const supplierMap = new Map<string, Supplier>();
  suppliers?.forEach(s => supplierMap.set(s.id, s));

  const salesOrderMap = new Map<string, SalesOrder>();
  salesOrders?.forEach(so => salesOrderMap.set(so.id, so));

  const pendingPrCount = purchaseRequests?.filter(pr => pr.status === "pending").length ?? 0;

  const filteredPRs = purchaseRequests?.filter(pr => {
    if (prStatusFilter !== "all" && pr.status !== prStatusFilter) return false;
    if (prPriorityFilter !== "all" && pr.priority !== prPriorityFilter) return false;
    return true;
  });

  const filteredPOs = purchaseOrders?.filter(po => {
    if (!poSearch) return true;
    const term = poSearch.toLowerCase();
    const supplier = supplierMap.get(po.supplierId);
    return po.poNumber.toLowerCase().includes(term) ||
      (supplier?.name || "").toLowerCase().includes(term);
  });

  return (
    <div className="p-6 space-y-6 overflow-auto h-full">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Supply Chain</h1>
          <p className="text-muted-foreground text-sm mt-1">Manage suppliers, purchase orders, and deliveries</p>
        </div>
        <Button data-testid="button-new-po" onClick={openNewPo}>
          <Plus className="w-4 h-4 mr-2" />
          New Purchase Order
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-5 flex items-center gap-4">
            <div className="w-10 h-10 rounded-md bg-amber-50 dark:bg-amber-950/30 flex items-center justify-center">
              <FileText className="w-5 h-5 text-amber-500" />
            </div>
            <div>
              <p className="text-2xl font-bold" data-testid="text-stat-pr-pending">{pendingPrCount}</p>
              <p className="text-xs text-muted-foreground">Pending Requests</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5 flex items-center gap-4">
            <div className="w-10 h-10 rounded-md bg-blue-50 dark:bg-blue-950/30 flex items-center justify-center">
              <Users className="w-5 h-5 text-blue-500" />
            </div>
            <div>
              <p className="text-2xl font-bold" data-testid="text-stat-suppliers">{suppliers?.length ?? 0}</p>
              <p className="text-xs text-muted-foreground">Total Suppliers</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5 flex items-center gap-4">
            <div className="w-10 h-10 rounded-md bg-emerald-50 dark:bg-emerald-950/30 flex items-center justify-center">
              <ClipboardList className="w-5 h-5 text-emerald-500" />
            </div>
            <div>
              <p className="text-2xl font-bold" data-testid="text-stat-pos">{purchaseOrders?.length ?? 0}</p>
              <p className="text-xs text-muted-foreground">Purchase Orders</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5 flex items-center gap-4">
            <div className="w-10 h-10 rounded-md bg-violet-50 dark:bg-violet-950/30 flex items-center justify-center">
              <Truck className="w-5 h-5 text-violet-500" />
            </div>
            <div>
              <p className="text-2xl font-bold" data-testid="text-stat-in-transit">{purchaseOrders?.filter((po) => po.status === "shipped").length ?? 0}</p>
              <p className="text-xs text-muted-foreground">In Transit</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="purchase-requests" className="space-y-4">
        <TabsList>
          <TabsTrigger value="purchase-requests" data-testid="tab-pr">
            Purchase Requests
            {pendingPrCount > 0 && (
              <span className="ml-1.5 inline-flex items-center justify-center w-5 h-5 text-[10px] font-bold rounded-full bg-amber-500 text-white">{pendingPrCount}</span>
            )}
          </TabsTrigger>
          <TabsTrigger value="purchase-orders" data-testid="tab-po">Purchase Orders</TabsTrigger>
          <TabsTrigger value="suppliers" data-testid="tab-suppliers">Suppliers</TabsTrigger>
        </TabsList>

        <TabsContent value="purchase-requests" className="space-y-4">
          <div className="flex items-center gap-2 flex-wrap">
            <Select value={prStatusFilter} onValueChange={setPrStatusFilter}>
              <SelectTrigger className="w-[140px]" data-testid="select-pr-status-filter">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="converted">Converted</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>
            <Select value={prPriorityFilter} onValueChange={setPrPriorityFilter}>
              <SelectTrigger className="w-[140px]" data-testid="select-pr-priority-filter">
                <SelectValue placeholder="Priority" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Priorities</SelectItem>
                <SelectItem value="low">Low</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="urgent">Urgent</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="w-8 p-3"></th>
                      <th className="text-left p-3 font-medium text-muted-foreground">Request #</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">Order #</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">Supplier</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">Priority</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">Status</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">Created</th>
                      <th className="text-right p-3 font-medium text-muted-foreground">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {prLoading ? (
                      Array.from({ length: 3 }).map((_, i) => (
                        <tr key={i} className="border-b">
                          {Array.from({ length: 8 }).map((_, j) => (
                            <td key={j} className="p-3"><Skeleton className="h-4 w-20" /></td>
                          ))}
                        </tr>
                      ))
                    ) : filteredPRs && filteredPRs.length > 0 ? (
                      filteredPRs.map((pr) => {
                        const isExpanded = expandedPrId === pr.id;
                        const supplier = pr.supplierId ? supplierMap.get(pr.supplierId) : null;
                        const so = pr.salesOrderId ? salesOrderMap.get(pr.salesOrderId) : null;
                        const priorityColors: Record<string, string> = {
                          low: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
                          medium: "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400",
                          high: "bg-orange-100 text-orange-700 dark:bg-orange-950/40 dark:text-orange-400",
                          urgent: "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400",
                        };
                        const statusColors: Record<string, string> = {
                          pending: "bg-yellow-100 text-yellow-800 dark:bg-yellow-950/40 dark:text-yellow-400",
                          approved: "bg-blue-100 text-blue-800 dark:bg-blue-950/40 dark:text-blue-400",
                          converted: "bg-green-100 text-green-800 dark:bg-green-950/40 dark:text-green-400",
                          cancelled: "bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-400",
                        };
                        return (
                          <Fragment key={pr.id}>
                            <tr
                              className="border-b last:border-0 cursor-pointer"
                              data-testid={`row-pr-${pr.id}`}
                              onClick={() => setExpandedPrId(isExpanded ? null : pr.id)}
                            >
                              <td className="p-3">
                                {isExpanded ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
                              </td>
                              <td className="p-3 font-medium" data-testid={`text-pr-number-${pr.id}`}>{pr.requestNumber}</td>
                              <td className="p-3 text-muted-foreground" data-testid={`text-pr-order-${pr.id}`}>{so?.orderNumber || "—"}</td>
                              <td className="p-3 text-muted-foreground">{supplier?.name || <span className="text-amber-500 text-xs font-medium">Not assigned</span>}</td>
                              <td className="p-3">
                                <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium ${priorityColors[pr.priority] || priorityColors.medium}`}>
                                  {pr.priority.charAt(0).toUpperCase() + pr.priority.slice(1)}
                                </span>
                              </td>
                              <td className="p-3">
                                <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium ${statusColors[pr.status] || statusColors.pending}`}>
                                  {pr.status.charAt(0).toUpperCase() + pr.status.slice(1)}
                                </span>
                              </td>
                              <td className="p-3 text-muted-foreground">{new Date(pr.createdAt).toLocaleDateString()}</td>
                              <td className="p-3 text-right" onClick={(e) => e.stopPropagation()}>
                                <div className="flex items-center justify-end gap-1">
                                  {(pr.status === "pending" || pr.status === "approved") && pr.supplierId && (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      data-testid={`button-convert-pr-${pr.id}`}
                                      disabled={convertPrMutation.isPending}
                                      onClick={() => { setConvertPrId(pr.id); setConvertDeliveryType("warehouse"); setConvertDialogOpen(true); }}
                                    >
                                      <ArrowRightCircle className="w-4 h-4 mr-1" />
                                      Convert to PO
                                    </Button>
                                  )}
                                  {pr.status === "pending" && (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="text-emerald-600 border-emerald-300 dark:text-emerald-400 dark:border-emerald-700"
                                      data-testid={`button-approve-pr-${pr.id}`}
                                      onClick={() => openEditPr(pr, true)}
                                    >
                                      <Check className="w-4 h-4 mr-1" />
                                      Approve
                                    </Button>
                                  )}
                                  {(pr.status === "pending" || pr.status === "approved") && (
                                    <Button size="icon" variant="ghost" data-testid={`button-edit-pr-${pr.id}`} onClick={() => openEditPr(pr)}>
                                      <Pencil className="w-4 h-4" />
                                    </Button>
                                  )}
                                  {pr.status === "pending" && (
                                    <Button size="icon" variant="ghost" data-testid={`button-delete-pr-${pr.id}`} onClick={() => { if (confirm("Delete this purchase request?")) deletePrMutation.mutate(pr.id); }}>
                                      <Trash2 className="w-4 h-4" />
                                    </Button>
                                  )}
                                  {(pr.status === "pending" || pr.status === "approved") && (
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      className="text-red-500 hover:text-red-700"
                                      data-testid={`button-cancel-pr-${pr.id}`}
                                      onClick={() => { if (confirm("Cancel this purchase request?")) updatePrMutation.mutate({ id: pr.id, data: { status: "cancelled" } }); }}
                                    >
                                      <X className="w-4 h-4" />
                                    </Button>
                                  )}
                                </div>
                              </td>
                            </tr>
                            {isExpanded && (
                              <tr>
                                <td colSpan={8} className="bg-muted/30 border-b">
                                  <PRExpandedItems prId={pr.id} />
                                </td>
                              </tr>
                            )}
                          </Fragment>
                        );
                      })
                    ) : (
                      <tr>
                        <td colSpan={8} className="p-8 text-center text-muted-foreground">No purchase requests found.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="purchase-orders" className="space-y-4">
          <div className="flex items-center gap-2">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search purchase orders..."
                className="pl-9"
                value={poSearch}
                onChange={(e) => setPoSearch(e.target.value)}
                data-testid="input-search-po"
              />
            </div>
          </div>
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="w-8 p-3"></th>
                      <th className="text-left p-3 font-medium text-muted-foreground">PO Number</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">Supplier</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">Date</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">Status</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">Delivery Type</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">Expected Delivery</th>
                      <th className="text-right p-3 font-medium text-muted-foreground">Amount</th>
                      <th className="text-right p-3 font-medium text-muted-foreground">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {poLoading ? (
                      Array.from({ length: 3 }).map((_, i) => (
                        <tr key={i} className="border-b">
                          {Array.from({ length: 9 }).map((_, j) => (
                            <td key={j} className="p-3"><Skeleton className="h-4 w-20" /></td>
                          ))}
                        </tr>
                      ))
                    ) : filteredPOs && filteredPOs.length > 0 ? (
                      filteredPOs.map((po) => {
                        const isExpanded = expandedPoId === po.id;
                        const supplier = supplierMap.get(po.supplierId);
                        return (
                          <Fragment key={po.id}>
                            <tr
                              className="border-b last:border-0 cursor-pointer"
                              data-testid={`row-po-${po.id}`}
                              onClick={() => setExpandedPoId(isExpanded ? null : po.id)}
                            >
                              <td className="p-3">
                                {isExpanded ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
                              </td>
                              <td className="p-3 font-medium" data-testid={`text-po-number-${po.id}`}>{po.poNumber}</td>
                              <td className="p-3 text-muted-foreground">{supplier?.name || "—"}</td>
                              <td className="p-3 text-muted-foreground">{new Date(po.orderDate).toLocaleDateString()}</td>
                              <td className="p-3"><StatusBadge status={po.status} /></td>
                              <td className="p-3" data-testid={`text-po-delivery-type-${po.id}`}>
                                {po.deliveryType === "direct_delivery" ? (
                                  <Badge variant="outline" className="text-xs">
                                    <Package className="w-3 h-3 mr-1" />
                                    Direct Delivery
                                  </Badge>
                                ) : (
                                  <Badge variant="secondary" className="text-xs">
                                    <Warehouse className="w-3 h-3 mr-1" />
                                    Warehouse Stock
                                  </Badge>
                                )}
                              </td>
                              <td className="p-3 text-muted-foreground">
                                {po.expectedDelivery ? new Date(po.expectedDelivery).toLocaleDateString() : "—"}
                              </td>
                              <td className="p-3 text-right font-medium" data-testid={`text-po-amount-${po.id}`}>₹{Number(po.totalAmount).toLocaleString()}</td>
                              <td className="p-3 text-right" onClick={(e) => e.stopPropagation()}>
                                <div className="flex items-center justify-end gap-1">
                                  {(po.status === "approved" || po.status === "shipped" || po.status === "partial") && po.deliveryType !== "direct_delivery" && (() => {
                                    const supplierPaid = Number((po as any).supplierPaidAmount ?? 0);
                                    const poTotal = Number(po.totalAmount ?? 0);
                                    const paymentComplete = poTotal === 0 || supplierPaid >= poTotal;
                                    return (
                                      <span title={!paymentComplete ? `Full supplier payment required (paid ₹${supplierPaid.toLocaleString()} of ₹${poTotal.toLocaleString()})` : undefined}>
                                        <Button
                                          size="sm"
                                          variant="link"
                                          className={`text-xs mr-1 p-0 h-auto ${paymentComplete ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground opacity-50 cursor-not-allowed"}`}
                                          data-testid={`button-create-grn-${po.id}`}
                                          disabled={creatingGrnPoId === po.id || !paymentComplete}
                                          onClick={() => {
                                            if (!paymentComplete) return;
                                            setGrnWarehouseDialogPoId(po.id);
                                            setGrnSelectedWarehouseId(warehouses?.[0]?.id || "");
                                            setGrnSupplierChallan("");
                                          }}
                                        >
                                          <PackagePlus className="w-3 h-3 mr-1" />
                                          {creatingGrnPoId === po.id ? "Creating..." : "Create GRN"}
                                        </Button>
                                      </span>
                                    );
                                  })()}
                                  {(po.status === "approved" || po.status === "shipped") && po.deliveryType === "direct_delivery" && (
                                    <Button
                                      size="sm"
                                      variant="link"
                                      className="text-xs text-blue-600 dark:text-blue-400 mr-1 p-0 h-auto"
                                      data-testid={`button-generate-challan-${po.id}`}
                                      disabled={generatingChallanPoId === po.id}
                                      onClick={() => generateChallanMutation.mutate(po.id)}
                                    >
                                      <FileText className="w-3 h-3 mr-1" />
                                      {generatingChallanPoId === po.id ? "Generating..." : "Generate Challan in Inventory"}
                                    </Button>
                                  )}
                                  {po.status === "pending" && (
                                    <>
                                      <Button size="icon" variant="ghost" data-testid={`button-edit-po-${po.id}`} onClick={() => openEditPo(po)}>
                                        <Pencil className="w-4 h-4" />
                                      </Button>
                                      <Button size="icon" variant="ghost" data-testid={`button-delete-po-${po.id}`} onClick={() => { if (confirm("Delete this purchase order?")) deletePoMutation.mutate(po.id); }}>
                                        <Trash2 className="w-4 h-4" />
                                      </Button>
                                    </>
                                  )}
                                  {(po.status === "approved" || po.status === "shipped" || po.status === "partial") && (
                                    <Button size="sm" variant="outline" className="text-red-600 border-red-300 dark:text-red-400 dark:border-red-700" data-testid={`button-request-cancel-po-${po.id}`} onClick={() => { setCancelPoId(po.id); setCancelReason(""); setCancelDialogOpen(true); }}>
                                      <Ban className="w-3 h-3 mr-1" /> Request Cancel
                                    </Button>
                                  )}
                                  {po.status === "cancellation_requested" && (
                                    <Button size="sm" variant="outline" className="text-amber-600 border-amber-300 dark:text-amber-400 dark:border-amber-700" data-testid={`button-approve-cancel-po-${po.id}`} onClick={() => { if (confirm("Approve this cancellation?")) approveCancelMutation.mutate(po.id); }}>
                                      <CheckCircle className="w-3 h-3 mr-1" /> Approve Cancel
                                    </Button>
                                  )}
                                  {["pending", "approved", "shipped", "partial", "received", "cancellation_requested", "cancelled"].includes(po.status) && (
                                    <Button size="icon" variant="ghost" data-testid={`button-download-po-${po.id}`} onClick={() => downloadPoPdf(po)} title="Download PDF" disabled={downloadingPoId === po.id}>
                                      <Download className={`w-4 h-4 ${downloadingPoId === po.id ? "animate-pulse" : ""}`} />
                                    </Button>
                                  )}
                                </div>
                              </td>
                            </tr>
                            {isExpanded && (() => {
                              const linkedPR = purchaseRequests?.find(pr => pr.purchaseOrderId === po.id);
                              const linkedSO = linkedPR?.salesOrderId ? salesOrders?.find(so => so.id === linkedPR.salesOrderId) : null;
                              return (
                                <tr>
                                  <td colSpan={9} className="bg-muted/30 border-b">
                                    {(po.status === "cancellation_requested" || po.status === "cancelled") && po.cancellationReason && (
                                      <div className={`mx-4 mt-3 p-3 rounded-md border ${po.status === "cancelled" ? "bg-red-50 border-red-200 dark:bg-red-950/30 dark:border-red-800" : "bg-amber-50 border-amber-200 dark:bg-amber-950/30 dark:border-amber-800"}`}>
                                        <div className="flex items-center gap-2 mb-1">
                                          <Ban className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                                          <span className="text-sm font-medium">{po.status === "cancelled" ? "Cancellation Reason" : "Cancellation Requested"}</span>
                                        </div>
                                        <p className="text-sm text-muted-foreground" data-testid={`text-cancel-reason-${po.id}`}>{po.cancellationReason}</p>
                                        {po.cancellationRequestedBy && (
                                          <p className="text-xs text-muted-foreground mt-1">Requested by: {po.cancellationRequestedBy} {po.cancellationRequestedAt ? `on ${new Date(po.cancellationRequestedAt).toLocaleDateString()}` : ""}</p>
                                        )}
                                      </div>
                                    )}
                                    <POExpandedItems
                                      poId={po.id}
                                      linkedSalesOrder={linkedSO ? { orderNumber: linkedSO.orderNumber, id: linkedSO.id } : null}
                                      deliveryType={po.deliveryType}
                                      deliveryAddress={po.deliveryAddress}
                                    />
                                  </td>
                                </tr>
                              );
                            })()}
                          </Fragment>
                        );
                      })
                    ) : (
                      <tr>
                        <td colSpan={9} className="p-8 text-center text-muted-foreground">No purchase orders found.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="suppliers" className="space-y-4">
          {/* Phase 6.5 C1: count banner of suppliers missing required-for-issuance fields */}
          {suppliers && (() => {
            const incomplete = suppliers.filter(s => getSupplierMissingFields(s).length > 0);
            if (incomplete.length === 0) return null;
            return (
              <div
                className="flex items-start gap-3 p-3 rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800"
                data-testid="banner-suppliers-incomplete"
              >
                <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
                <div className="flex-1 text-sm">
                  <p className="font-medium text-amber-900 dark:text-amber-200">
                    {incomplete.length} supplier{incomplete.length === 1 ? "" : "s"} missing GST, phone or address.
                  </p>
                  <p className="text-amber-800 dark:text-amber-300 text-xs mt-0.5">
                    Purchase orders cannot be approved/shipped/received against these suppliers until the profile is completed.
                  </p>
                </div>
              </div>
            );
          })()}
          <Button size="sm" data-testid="button-add-supplier" onClick={openNewSupplier}>
            <Plus className="w-4 h-4 mr-2" />
            Add Supplier
          </Button>
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="w-8 p-3"></th>
                      <th className="text-left p-3 font-medium text-muted-foreground">Name</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">Category</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">Contact</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">Phone</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">GST</th>
                      <th className="text-right p-3 font-medium text-muted-foreground">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {suppliersLoading ? (
                      <tr><td colSpan={7} className="p-3"><Skeleton className="h-4 w-full" /></td></tr>
                    ) : suppliers && suppliers.length > 0 ? (
                      suppliers.map((s) => {
                        const isExpanded = expandedSupplierId === s.id;
                        return (
                          <Fragment key={s.id}>
                            <tr
                              className="border-b last:border-0 cursor-pointer"
                              data-testid={`row-supplier-${s.id}`}
                              onClick={() => setExpandedSupplierId(isExpanded ? null : s.id)}
                            >
                              <td className="p-3">
                                {isExpanded ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
                              </td>
                              <td className="p-3 font-medium">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span>{s.name}</span>
                                  {(() => {
                                    const m = getSupplierMissingFields(s);
                                    if (m.length === 0) return null;
                                    return (
                                      <Badge
                                        variant="outline"
                                        className="border-amber-400 text-amber-700 dark:text-amber-300 dark:border-amber-700 text-[10px]"
                                        title={`Missing: ${m.join(", ")}`}
                                        data-testid={`badge-supplier-incomplete-${s.id}`}
                                      >
                                        <AlertTriangle className="w-3 h-3 mr-1" />
                                        Incomplete: {m.join(", ")}
                                      </Badge>
                                    );
                                  })()}
                                </div>
                              </td>
                              <td className="p-3 text-muted-foreground">{s.category || "—"}</td>
                              <td className="p-3 text-muted-foreground">{s.contactPerson || "—"}</td>
                              <td className="p-3 text-muted-foreground">{s.phone || "—"}</td>
                              <td className="p-3 text-muted-foreground">{s.gstNumber || "—"}</td>
                              <td className="p-3 text-right" onClick={(e) => e.stopPropagation()}>
                                <div className="flex items-center justify-end gap-1">
                                  <Button size="icon" variant="ghost" data-testid={`button-edit-supplier-${s.id}`} onClick={() => openEditSupplier(s)}>
                                    <Pencil className="w-4 h-4" />
                                  </Button>
                                  <Button size="icon" variant="ghost" data-testid={`button-delete-supplier-${s.id}`} onClick={() => { if (confirm("Delete this supplier?")) deleteSupplierMutation.mutate(s.id); }}>
                                    <Trash2 className="w-4 h-4" />
                                  </Button>
                                </div>
                              </td>
                            </tr>
                            {isExpanded && (
                              <tr>
                                <td colSpan={7} className="bg-muted/30 border-b">
                                  <SupplierProductCatalog supplierId={s.id} suppliers={suppliers || []} />
                                </td>
                              </tr>
                            )}
                          </Fragment>
                        );
                      })
                    ) : (
                      <tr>
                        <td colSpan={7} className="p-8 text-center text-muted-foreground">No suppliers found.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={poDialogOpen} onOpenChange={setPoDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingPo ? "Edit Purchase Order" : "New Purchase Order"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="poNumber">PO Number</Label>
                <Input id="poNumber" data-testid="input-po-number" value={poForm.poNumber} onChange={(e) => setPoForm({ ...poForm, poNumber: e.target.value })} readOnly className="bg-muted" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="poSupplier">Supplier</Label>
                <SupplierDropdown
                  poLineItems={poLineItems}
                  allSupplierProducts={allSupplierProducts || []}
                  suppliers={suppliers || []}
                  value={poForm.supplierId}
                  onChange={(v) => setPoForm({ ...poForm, supplierId: v })}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="poStatus">Status</Label>
                <Select value={poForm.status} onValueChange={(v) => setPoForm({ ...poForm, status: v })}>
                  <SelectTrigger data-testid="select-po-status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {["pending", "approved", "shipped", "received", "cancelled"].map((s) => (
                      <SelectItem key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="poDeliveryType">Delivery Type</Label>
                <Select value={poForm.deliveryType} onValueChange={(v) => setPoForm({ ...poForm, deliveryType: v })}>
                  <SelectTrigger data-testid="select-po-delivery-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="warehouse">
                      <span className="flex items-center gap-1.5">
                        <Warehouse className="w-3.5 h-3.5" />
                        Warehouse Stock
                      </span>
                    </SelectItem>
                    <SelectItem value="direct_delivery">
                      <span className="flex items-center gap-1.5">
                        <Package className="w-3.5 h-3.5" />
                        Direct Delivery
                      </span>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="poDelivery">Expected Delivery</Label>
                <Input id="poDelivery" type="date" data-testid="input-po-expected-delivery" value={poForm.expectedDelivery} onChange={(e) => setPoForm({ ...poForm, expectedDelivery: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="poNotes">Notes</Label>
                <Input id="poNotes" data-testid="input-po-notes" value={poForm.notes} onChange={(e) => setPoForm({ ...poForm, notes: e.target.value })} />
              </div>
            </div>

            <POLineItemsEditor
              items={poLineItems}
              onChange={setPoLineItems}
              products={allProducts || []}
              supplierProducts={supplierCatalog || []}
              supplierProductsLoading={!!selectedSupplierId && (supplierCatalogLoading || supplierCatalogFetching)}
              supplierSelected={!!selectedSupplierId}
            />
          </div>
          <DialogFooter>
            <Button
              data-testid="button-submit-po"
              disabled={poMutation.isPending}
              onClick={() => poMutation.mutate({ ...poForm, lineItems: poLineItems })}
            >
              {poMutation.isPending ? "Saving..." : editingPo ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={supplierDialogOpen} onOpenChange={setSupplierDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingSupplier ? "Edit Supplier" : "Add Supplier"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="supplierName">Name</Label>
              <Input id="supplierName" data-testid="input-supplier-name" value={supplierForm.name} onChange={(e) => setSupplierForm({ ...supplierForm, name: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="supplierEmail">Email</Label>
              <Input id="supplierEmail" type="email" data-testid="input-supplier-email" value={supplierForm.email} onChange={(e) => setSupplierForm({ ...supplierForm, email: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="supplierPhone">Phone</Label>
              <Input id="supplierPhone" data-testid="input-supplier-phone" value={supplierForm.phone} onChange={(e) => setSupplierForm({ ...supplierForm, phone: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="supplierAddress">Address</Label>
              <Input id="supplierAddress" data-testid="input-supplier-address" value={supplierForm.address} onChange={(e) => setSupplierForm({ ...supplierForm, address: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="supplierGst">GST Number</Label>
              <Input id="supplierGst" data-testid="input-supplier-gst" value={supplierForm.gstNumber} onChange={(e) => setSupplierForm({ ...supplierForm, gstNumber: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="supplierContact">Contact Person</Label>
              <Input id="supplierContact" data-testid="input-supplier-contact-person" value={supplierForm.contactPerson} onChange={(e) => setSupplierForm({ ...supplierForm, contactPerson: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="supplierCategory">Category</Label>
              <Select value={supplierForm.category} onValueChange={(v) => setSupplierForm({ ...supplierForm, category: v })}>
                <SelectTrigger data-testid="select-supplier-category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {["Solar Panels", "Electronics", "Raw Materials", "Logistics"].map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button data-testid="button-submit-supplier" disabled={supplierMutation.isPending} onClick={() => supplierMutation.mutate(supplierForm)}>
              {supplierMutation.isPending ? "Saving..." : editingSupplier ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={prDialogOpen} onOpenChange={(open) => { setPrDialogOpen(open); if (!open) { setEditingPr(null); setPrApproveMode(false); } }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {prApproveMode ? "Approve Purchase Request" : "Edit Purchase Request"}{" "}
              {editingPr?.requestNumber}
            </DialogTitle>
            {prApproveMode && (
              <p className="text-sm text-muted-foreground pt-1">
                Select a supplier and confirm all item prices, then click <strong>Approve &amp; Save</strong>.
              </p>
            )}
          </DialogHeader>

          <div className="space-y-4">
            {/* Zero-cost warning banner */}
            {prDialogItems && prDialogItems.some(item => !prItemCosts[item.id] || parseFloat(prItemCosts[item.id] || "0") <= 0) && (
              <div className="flex items-start gap-2 p-3 rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-700 text-amber-800 dark:text-amber-300 text-sm">
                <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>One or more items have no supplier price set. Enter prices below before approving.</span>
              </div>
            )}

            {/* Supplier selector */}
            <div className="space-y-2">
              <Label>Assign Supplier</Label>
              {matchingSuppliersLoading ? (
                <Skeleton className="h-10 w-full" />
              ) : matchingSuppliers && matchingSuppliers.length > 0 ? (
                <Select value={prForm.supplierId} onValueChange={(v) => {
                  setPrForm({ ...prForm, supplierId: v });
                  // Auto-fill item costs from supplier catalog when supplier is selected
                  const ms = matchingSuppliers?.find(s => s.supplierId === v);
                  if (ms && prDialogItems) {
                    setPrItemCosts(prev => {
                      const updated = { ...prev };
                      for (const item of prDialogItems) {
                        const catalogItem = ms.items.find(i => i.productId === item.productId);
                        if (catalogItem && catalogItem.supplierPrice && Number(catalogItem.supplierPrice) > 0) {
                          updated[item.id] = String(Number(catalogItem.supplierPrice));
                        }
                      }
                      return updated;
                    });
                  }
                }}>
                  <SelectTrigger data-testid="select-pr-supplier">
                    <SelectValue placeholder="Select supplier" />
                  </SelectTrigger>
                  <SelectContent>
                    {matchingSuppliers.map((ms, idx) => (
                      <SelectItem key={ms.supplierId} value={ms.supplierId}>
                        <span className="flex items-center gap-2">
                          {ms.supplierName}
                          <span className="text-xs text-muted-foreground">
                            — ₹{Number(ms.totalCost).toLocaleString("en-IN")}
                          </span>
                          {idx === 0 && <span className="text-[10px] font-semibold bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-400 px-1.5 py-0.5 rounded">Best Price</span>}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <div className="flex items-center gap-2 p-3 border rounded-md bg-amber-50 dark:bg-amber-950/20 text-amber-700 dark:text-amber-400 text-sm">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                  No supplier carries all items in this request.
                </div>
              )}

              {selectedMatchingSupplier && (
                <div className="mt-2 border rounded-md overflow-hidden">
                  <div className="px-3 py-2 bg-muted/50 text-xs font-medium text-muted-foreground">
                    {selectedMatchingSupplier.supplierName} — Price Breakdown
                  </div>
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left px-3 py-1.5 font-medium text-muted-foreground">Product</th>
                        <th className="text-center px-3 py-1.5 font-medium text-muted-foreground">Qty</th>
                        <th className="text-right px-3 py-1.5 font-medium text-muted-foreground">Unit Cost</th>
                        <th className="text-right px-3 py-1.5 font-medium text-muted-foreground">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedMatchingSupplier.items.map(item => (
                        <tr key={item.productId} className="border-b last:border-0">
                          <td className="px-3 py-1.5">
                            {item.productName}
                            {item.isPreferred && <Star className="inline w-3 h-3 ml-1 text-amber-500 fill-amber-500" />}
                          </td>
                          <td className="px-3 py-1.5 text-center">{item.shortfallQuantity}</td>
                          <td className="px-3 py-1.5 text-right">₹{Number(item.supplierPrice).toLocaleString("en-IN")}</td>
                          <td className="px-3 py-1.5 text-right font-medium">₹{Number(item.lineTotal).toLocaleString("en-IN")}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr>
                        <td colSpan={3} className="px-3 py-1.5 text-right font-semibold">Total:</td>
                        <td className="px-3 py-1.5 text-right font-semibold" data-testid="text-pr-supplier-total">₹{Number(selectedMatchingSupplier.totalCost).toLocaleString("en-IN")}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>

            {/* Editable item unit costs */}
            {prDialogItems && prDialogItems.length > 0 && (
              <div className="space-y-2">
                <Label>Item Unit Costs</Label>
                <div className="border rounded-md overflow-hidden">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b bg-muted/40">
                        <th className="text-left px-3 py-1.5 font-medium text-muted-foreground">Product</th>
                        <th className="text-center px-3 py-1.5 font-medium text-muted-foreground">Shortfall</th>
                        <th className="text-right px-3 py-1.5 font-medium text-muted-foreground">Unit Cost (₹)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {prDialogItems.map(item => {
                        const cost = prItemCosts[item.id] || "";
                        const missing = !cost || parseFloat(cost) <= 0;
                        return (
                          <tr key={item.id} className={`border-b last:border-0 ${missing ? "bg-amber-50 dark:bg-amber-950/20" : ""}`}>
                            <td className="px-3 py-1.5 font-medium">
                              {item.description}
                              {missing && <AlertTriangle className="inline w-3 h-3 ml-1 text-amber-500" />}
                            </td>
                            <td className="px-3 py-1.5 text-center">{item.shortfallQuantity}</td>
                            <td className="px-3 py-1.5 text-right">
                              <Input
                                type="number"
                                min="0"
                                step="0.01"
                                className="h-6 text-xs w-28 ml-auto text-right"
                                placeholder="0.00"
                                value={cost}
                                data-testid={`input-pr-item-cost-${item.id}`}
                                onChange={(e) => setPrItemCosts(prev => ({ ...prev, [item.id]: e.target.value }))}
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label>Priority</Label>
              <Select value={prForm.priority} onValueChange={(v) => setPrForm({ ...prForm, priority: v })}>
                <SelectTrigger data-testid="select-pr-priority">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {["low", "medium", "high", "urgent"].map((p) => (
                    <SelectItem key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea
                value={prForm.notes}
                onChange={(e) => setPrForm({ ...prForm, notes: e.target.value })}
                rows={3}
                data-testid="input-pr-notes"
              />
            </div>
          </div>

          <DialogFooter className="flex-col gap-2 sm:flex-row">
            {prApproveMode && (() => {
              const hasSupplier = !!prForm.supplierId;
              const allCostsFilled = !prDialogItems || prDialogItems.every(item => {
                const c = prItemCosts[item.id];
                return c && parseFloat(c) > 0;
              });
              const canApprove = hasSupplier && allCostsFilled;
              return (
                <Button
                  data-testid="button-approve-submit-pr"
                  disabled={updatePrMutation.isPending || !canApprove}
                  title={!hasSupplier ? "Select a supplier first" : !allCostsFilled ? "Enter all item unit costs first" : undefined}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white"
                  onClick={() => savePrWithItems("approved")}
                >
                  <Check className="w-4 h-4 mr-1" />
                  {updatePrMutation.isPending ? "Approving..." : "Approve & Save"}
                </Button>
              );
            })()}
            <Button
              data-testid="button-submit-pr"
              variant={prApproveMode ? "outline" : "default"}
              disabled={updatePrMutation.isPending}
              onClick={() => savePrWithItems()}
            >
              {updatePrMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={convertDialogOpen} onOpenChange={(open) => { setConvertDialogOpen(open); if (!open) setConvertPrId(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Convert to Purchase Order</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">Select the fulfillment type for this purchase order:</p>
            <div className="space-y-3">
              <label
                className={`flex items-start gap-3 p-3 rounded-md border cursor-pointer ${convertDeliveryType === "warehouse" ? "border-primary bg-primary/5" : ""}`}
                data-testid="radio-delivery-warehouse"
              >
                <input
                  type="radio"
                  name="deliveryType"
                  value="warehouse"
                  checked={convertDeliveryType === "warehouse"}
                  onChange={() => setConvertDeliveryType("warehouse")}
                  className="mt-1"
                />
                <div>
                  <div className="font-medium flex items-center gap-2 flex-wrap">
                    <Warehouse className="w-4 h-4" />
                    Warehouse Replenishment
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Supplier delivers goods to your warehouse. Stock is received via GRN and then dispatched to the customer.
                  </p>
                </div>
              </label>
              <label
                className={`flex items-start gap-3 p-3 rounded-md border cursor-pointer ${convertDeliveryType === "direct_delivery" ? "border-primary bg-primary/5" : ""}`}
                data-testid="radio-delivery-direct"
              >
                <input
                  type="radio"
                  name="deliveryType"
                  value="direct_delivery"
                  checked={convertDeliveryType === "direct_delivery"}
                  onChange={() => setConvertDeliveryType("direct_delivery")}
                  className="mt-1"
                />
                <div>
                  <div className="font-medium flex items-center gap-2 flex-wrap">
                    <Truck className="w-4 h-4" />
                    Direct Supplier Delivery (Drop Shipment)
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Supplier ships directly to the customer site. No warehouse stock movement required.
                  </p>
                </div>
              </label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setConvertDialogOpen(false); setConvertPrId(null); }} data-testid="button-cancel-convert">
              Cancel
            </Button>
            <Button
              disabled={convertPrMutation.isPending || !convertPrId}
              onClick={() => { if (convertPrId) convertPrMutation.mutate({ id: convertPrId, deliveryType: convertDeliveryType }); }}
              data-testid="button-confirm-convert"
            >
              {convertPrMutation.isPending ? "Converting..." : "Convert to PO"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Request Cancellation</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Please provide a reason for cancelling this purchase order. The cancellation will need to be approved before it takes effect.</p>
            <div className="space-y-2">
              <Label htmlFor="cancelReason">Reason</Label>
              <Textarea
                id="cancelReason"
                data-testid="input-cancel-reason"
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="Enter the reason for cancellation..."
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setCancelDialogOpen(false); setCancelPoId(null); setCancelReason(""); }} data-testid="button-cancel-cancel-dialog">
              Go Back
            </Button>
            <Button
              variant="destructive"
              disabled={!cancelReason.trim() || requestCancelMutation.isPending}
              onClick={() => { if (cancelPoId) requestCancelMutation.mutate({ id: cancelPoId, reason: cancelReason.trim() }); }}
              data-testid="button-submit-cancel-request"
            >
              {requestCancelMutation.isPending ? "Submitting..." : "Submit Request"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!grnWarehouseDialogPoId} onOpenChange={(open) => { if (!open) { setGrnWarehouseDialogPoId(null); setGrnSupplierChallan(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Draft GRN</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">Enter the supplier challan number and select the receiving warehouse.</p>
            <div className="space-y-2">
              <Label htmlFor="input-grn-supplier-challan">
                Supplier Challan No. <span className="text-red-500">*</span>
              </Label>
              <Input
                id="input-grn-supplier-challan"
                data-testid="input-grn-supplier-challan"
                value={grnSupplierChallan}
                onChange={e => setGrnSupplierChallan(e.target.value)}
                placeholder="e.g. SC-2026-001"
              />
            </div>
            <div className="space-y-2">
              <Label>Warehouse <span className="text-red-500">*</span></Label>
              <Select value={grnSelectedWarehouseId} onValueChange={setGrnSelectedWarehouseId}>
                <SelectTrigger data-testid="select-grn-warehouse">
                  <SelectValue placeholder="Select warehouse..." />
                </SelectTrigger>
                <SelectContent>
                  {(warehouses || []).map((w: any) => (
                    <SelectItem key={w.id} value={w.id}>{w.name} — {w.location}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setGrnWarehouseDialogPoId(null); setGrnSupplierChallan(""); }}>Cancel</Button>
            <Button
              data-testid="button-confirm-grn-warehouse"
              disabled={!grnSelectedWarehouseId || !grnSupplierChallan.trim() || createGrnFromPoMutation.isPending}
              onClick={() => {
                if (grnWarehouseDialogPoId && grnSelectedWarehouseId && grnSupplierChallan.trim())
                  createGrnFromPoMutation.mutate({ poId: grnWarehouseDialogPoId, warehouseId: grnSelectedWarehouseId, supplierChallanNumber: grnSupplierChallan.trim() });
              }}
            >
              {createGrnFromPoMutation.isPending ? "Creating..." : "Create Draft GRN"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Phase 6.5 C2: blocked-by-incomplete-supplier modal */}
      <Dialog open={!!incompleteSupplierBlock} onOpenChange={(o) => { if (!o) setIncompleteSupplierBlock(null); }}>
        <DialogContent data-testid="dialog-supplier-incomplete-block">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
              Supplier profile incomplete
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <p>
              {incompleteSupplierBlock?.supplierName ? (
                <>Cannot issue this purchase order to <span className="font-medium">{incompleteSupplierBlock.supplierName}</span>.</>
              ) : (
                <>Cannot issue this purchase order.</>
              )}
            </p>
            {incompleteSupplierBlock && incompleteSupplierBlock.missing.length > 0 && (
              <div>
                <p className="text-muted-foreground mb-1">Missing required fields:</p>
                <ul className="list-disc list-inside space-y-0.5">
                  {incompleteSupplierBlock.missing.map(f => (
                    <li key={f} className="font-medium" data-testid={`text-missing-field-${f}`}>{f.toUpperCase()}</li>
                  ))}
                </ul>
              </div>
            )}
            <p className="text-muted-foreground text-xs">
              Save the PO as <strong>Pending</strong> instead, or open the supplier and fill in the missing details before issuing.
            </p>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setIncompleteSupplierBlock(null)} data-testid="button-incomplete-cancel">
              Close
            </Button>
            {incompleteSupplierBlock?.supplierId && (
              <Button
                data-testid="button-incomplete-edit-supplier"
                onClick={() => {
                  const sid = incompleteSupplierBlock.supplierId;
                  const sup = suppliers?.find(s => s.id === sid);
                  setIncompleteSupplierBlock(null);
                  setPoDialogOpen(false);
                  if (sup) openEditSupplier(sup);
                }}
              >
                <Pencil className="w-4 h-4 mr-2" />
                Edit Supplier
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}
