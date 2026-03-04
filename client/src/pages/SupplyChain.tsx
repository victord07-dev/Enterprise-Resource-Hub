import { useState, Fragment } from "react";
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
import { Textarea } from "@/components/ui/textarea";
import { Plus, Search, Truck, Users, ClipboardList, Pencil, Trash2, X, ChevronDown, ChevronRight, Star, PackageCheck, FileText, Check, ArrowRightCircle, AlertTriangle } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import type { Supplier, PurchaseOrder, Product, SupplierProduct, PurchaseOrderItem, Warehouse, PurchaseRequest, PurchaseRequestItem, SalesOrder } from "@shared/schema";

interface POLineItem {
  productId: string;
  description: string;
  quantity: number;
  unitCost: number;
  totalCost: number;
}

function StatusBadge({ status }: { status: string }) {
  const variants: Record<string, string> = {
    pending: "bg-yellow-100 text-yellow-800 dark:bg-yellow-950/40 dark:text-yellow-400",
    approved: "bg-blue-100 text-blue-800 dark:bg-blue-950/40 dark:text-blue-400",
    shipped: "bg-purple-100 text-purple-800 dark:bg-purple-950/40 dark:text-purple-400",
    received: "bg-green-100 text-green-800 dark:bg-green-950/40 dark:text-green-400",
    cancelled: "bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-400",
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium ${variants[status] || variants.pending}`}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

function emptyLineItem(): POLineItem {
  return { productId: "", description: "", quantity: 1, unitCost: 0, totalCost: 0 };
}

function POLineItemsEditor({ items, onChange, products, supplierProducts }: {
  items: POLineItem[];
  onChange: (items: POLineItem[]) => void;
  products: Product[];
  supplierProducts: SupplierProduct[];
}) {
  const spMap = new Map<string, SupplierProduct>();
  for (const sp of supplierProducts) {
    spMap.set(sp.productId, sp);
  }

  const updateItem = (index: number, field: string, value: any) => {
    const updated = [...items];
    const item = { ...updated[index], [field]: value };

    if (field === "productId" && value) {
      const prod = products.find(p => p.id === value);
      if (prod) {
        item.description = prod.name;
        const sp = spMap.get(value);
        if (sp) {
          item.unitCost = Number(sp.supplierPrice);
        } else {
          item.unitCost = prod.costPrice ? Number(prod.costPrice) : Number(prod.unitPrice);
        }
        item.totalCost = item.quantity * item.unitCost;
      }
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
        <Button type="button" size="sm" variant="outline" onClick={addItem} data-testid="button-add-po-line-item">
          <Plus className="w-3 h-3 mr-1" /> Add Item
        </Button>
      </div>

      <div className="space-y-2">
        {items.map((item, index) => (
          <div key={index} className="grid grid-cols-12 gap-2 items-end">
            <div className="col-span-4">
              {index === 0 && <Label className="text-xs text-muted-foreground mb-1 block">Product</Label>}
              <Select value={item.productId} onValueChange={(v) => updateItem(index, "productId", v)}>
                <SelectTrigger data-testid={`select-po-item-product-${index}`}>
                  <SelectValue placeholder="Select product" />
                </SelectTrigger>
                <SelectContent>
                  {supplierCatalogProducts.length > 0 && (
                    <>
                      <div className="px-2 py-1 text-xs text-muted-foreground font-medium">Supplier Catalog</div>
                      {supplierCatalogProducts.map((p) => (
                        <SelectItem key={p.id} value={p.id}>{p.name} ({p.sku})</SelectItem>
                      ))}
                    </>
                  )}
                  {otherProducts.length > 0 && (
                    <>
                      <div className="px-2 py-1 text-xs text-muted-foreground font-medium">All Products</div>
                      {otherProducts.map((p) => (
                        <SelectItem key={p.id} value={p.id}>{p.name} ({p.sku})</SelectItem>
                      ))}
                    </>
                  )}
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-3">
              {index === 0 && <Label className="text-xs text-muted-foreground mb-1 block">Description</Label>}
              <Input
                value={item.description}
                onChange={(e) => updateItem(index, "description", e.target.value)}
                placeholder="Description"
                data-testid={`input-po-item-desc-${index}`}
              />
            </div>
            <div className="col-span-1">
              {index === 0 && <Label className="text-xs text-muted-foreground mb-1 block">Qty</Label>}
              <Input
                type="number"
                min={1}
                value={item.quantity}
                onChange={(e) => updateItem(index, "quantity", parseInt(e.target.value) || 1)}
                data-testid={`input-po-item-qty-${index}`}
              />
            </div>
            <div className="col-span-2">
              {index === 0 && <Label className="text-xs text-muted-foreground mb-1 block">Unit Cost</Label>}
              <Input
                type="number"
                min={0}
                step="0.01"
                value={item.unitCost}
                onChange={(e) => updateItem(index, "unitCost", parseFloat(e.target.value) || 0)}
                data-testid={`input-po-item-cost-${index}`}
              />
            </div>
            <div className="col-span-1 flex items-center gap-1">
              {index === 0 && <Label className="text-xs text-muted-foreground mb-1 block invisible">Total</Label>}
              <span className="text-sm font-medium whitespace-nowrap" data-testid={`text-po-item-total-${index}`}>
                {item.totalCost.toLocaleString("en-IN", { minimumFractionDigits: 0 })}
              </span>
              <Button type="button" size="icon" variant="ghost" onClick={() => removeItem(index)} data-testid={`button-remove-po-item-${index}`}>
                <X className="w-3 h-3" />
              </Button>
            </div>
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
                <Select value={spForm.productId} onValueChange={(v) => setSpForm({ ...spForm, productId: v })}>
                  <SelectTrigger data-testid="select-sp-product">
                    <SelectValue placeholder="Select product" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableProducts.map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.name} ({p.sku})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
              <Label>Lead Time (days)</Label>
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

function POExpandedItems({ poId }: { poId: string }) {
  const { data: items, isLoading } = useQuery<PurchaseOrderItem[]>({
    queryKey: ["/api/purchase-orders", poId, "items"],
    queryFn: () => apiRequest("GET", `/api/purchase-orders/${poId}/items`).then(r => r.json()),
  });
  const { data: allProducts } = useQuery<Product[]>({ queryKey: ["/api/products"] });

  const productMap = new Map<string, Product>();
  allProducts?.forEach(p => productMap.set(p.id, p));

  if (isLoading) {
    return <div className="p-4"><Skeleton className="h-12 w-full" /></div>;
  }

  if (!items || items.length === 0) {
    return <div className="p-4 text-sm text-muted-foreground text-center">No line items for this PO.</div>;
  }

  return (
    <div className="p-4">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b">
              <th className="text-left p-2 font-medium text-muted-foreground text-xs">Product</th>
              <th className="text-left p-2 font-medium text-muted-foreground text-xs">Description</th>
              <th className="text-center p-2 font-medium text-muted-foreground text-xs">Qty</th>
              <th className="text-right p-2 font-medium text-muted-foreground text-xs">Unit Cost</th>
              <th className="text-right p-2 font-medium text-muted-foreground text-xs">Total</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => {
              const prod = item.productId ? productMap.get(item.productId) : null;
              return (
                <tr key={item.id} className="border-b last:border-0" data-testid={`row-po-item-${item.id}`}>
                  <td className="p-2 font-medium">{prod?.name || "—"}</td>
                  <td className="p-2 text-muted-foreground">{item.description || "—"}</td>
                  <td className="p-2 text-center">{item.quantity}</td>
                  <td className="p-2 text-right">₹{Number(item.unitCost).toLocaleString()}</td>
                  <td className="p-2 text-right font-medium">₹{Number(item.totalCost).toLocaleString()}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={4} className="p-2 text-right font-semibold text-xs">Grand Total:</td>
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
              <th className="text-right p-2 font-medium text-muted-foreground text-xs">Unit Cost</th>
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
                  <td className="p-2 text-right">{item.unitCost ? `₹${Number(item.unitCost).toLocaleString()}` : "—"}</td>
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
  const { data: suppliers, isLoading: suppliersLoading } = useQuery<Supplier[]>({ queryKey: ["/api/suppliers"] });
  const { data: purchaseOrders, isLoading: poLoading } = useQuery<PurchaseOrder[]>({ queryKey: ["/api/purchase-orders"] });
  const { data: allProducts } = useQuery<Product[]>({ queryKey: ["/api/products"] });
  const { data: purchaseRequests, isLoading: prLoading } = useQuery<PurchaseRequest[]>({ queryKey: ["/api/purchase-requests"] });
  const { data: salesOrders } = useQuery<SalesOrder[]>({ queryKey: ["/api/sales-orders"] });

  const [poDialogOpen, setPoDialogOpen] = useState(false);
  const [editingPo, setEditingPo] = useState<PurchaseOrder | null>(null);
  const [poForm, setPoForm] = useState({ poNumber: "", supplierId: "", status: "pending", expectedDelivery: "", notes: "" });
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
  const [prStatusFilter, setPrStatusFilter] = useState("all");
  const [prPriorityFilter, setPrPriorityFilter] = useState("all");

  const [receiveDialogOpen, setReceiveDialogOpen] = useState(false);
  const [receivingPo, setReceivingPo] = useState<PurchaseOrder | null>(null);
  const [receiveWarehouseId, setReceiveWarehouseId] = useState("");

  const { data: warehouses } = useQuery<Warehouse[]>({ queryKey: ["/api/warehouses"] });

  const selectedSupplierId = poForm.supplierId;
  const { data: supplierCatalog } = useQuery<SupplierProduct[]>({
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
      toast({ title: editingPo ? "Purchase order updated" : "Purchase order created" });
      setPoDialogOpen(false);
      setEditingPo(null);
    },
    onError: (error: Error) => {
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

  const receiveMutation = useMutation({
    mutationFn: async ({ poId, warehouseId }: { poId: string; warehouseId: string }) => {
      await apiRequest("POST", `/api/purchase-orders/${poId}/receive`, { warehouseId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/purchase-orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stock-movements"] });
      queryClient.invalidateQueries({ queryKey: ["/api/inventory-stock"] });
      toast({ title: "Goods received", description: "PO marked as received and inventory updated." });
      setReceiveDialogOpen(false);
      setReceivingPo(null);
      setReceiveWarehouseId("");
    },
    onError: (error: Error) => {
      toast({ title: "Error receiving goods", description: error.message, variant: "destructive" });
    },
  });

  const updatePrMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      await apiRequest("PATCH", `/api/purchase-requests/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/purchase-requests"] });
      toast({ title: "Purchase request updated" });
      setPrDialogOpen(false);
      setEditingPr(null);
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

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
    mutationFn: async (id: string) => {
      const resp = await apiRequest("POST", `/api/purchase-requests/${id}/convert-to-po`);
      return resp.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/purchase-requests"] });
      queryClient.invalidateQueries({ queryKey: ["/api/purchase-orders"] });
      toast({ title: "Purchase order created", description: `PO ${data.purchaseOrder?.poNumber || ""} created successfully.` });
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

  const selectedMatchingSupplier = matchingSuppliers?.find(ms => ms.supplierId === prForm.supplierId);

  const openEditPr = (pr: PurchaseRequest) => {
    setEditingPr(pr);
    setPrForm({
      supplierId: pr.supplierId || "",
      priority: pr.priority,
      notes: pr.notes || "",
    });
    setPrDialogOpen(true);
  };

  const openReceiveDialog = (po: PurchaseOrder) => {
    setReceivingPo(po);
    setReceiveWarehouseId("");
    setReceiveDialogOpen(true);
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
    setPoForm({ poNumber: "(Auto-generated)", supplierId: "", status: "pending", expectedDelivery: "", notes: "" });
    setPoLineItems([emptyLineItem()]);
    setPoDialogOpen(true);
  };

  const openEditPo = async (po: PurchaseOrder) => {
    setEditingPo(po);
    setPoForm({
      poNumber: po.poNumber,
      supplierId: po.supplierId,
      status: po.status,
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
                                      onClick={() => { if (confirm("Convert this purchase request to a purchase order?")) convertPrMutation.mutate(pr.id); }}
                                    >
                                      <ArrowRightCircle className="w-4 h-4 mr-1" />
                                      Convert to PO
                                    </Button>
                                  )}
                                  {pr.status === "pending" && (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      data-testid={`button-approve-pr-${pr.id}`}
                                      onClick={() => updatePrMutation.mutate({ id: pr.id, data: { status: "approved" } })}
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
                      <th className="text-left p-3 font-medium text-muted-foreground">Expected Delivery</th>
                      <th className="text-right p-3 font-medium text-muted-foreground">Amount</th>
                      <th className="text-right p-3 font-medium text-muted-foreground">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {poLoading ? (
                      Array.from({ length: 3 }).map((_, i) => (
                        <tr key={i} className="border-b">
                          {Array.from({ length: 8 }).map((_, j) => (
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
                              <td className="p-3 text-muted-foreground">
                                {po.expectedDelivery ? new Date(po.expectedDelivery).toLocaleDateString() : "—"}
                              </td>
                              <td className="p-3 text-right font-medium" data-testid={`text-po-amount-${po.id}`}>₹{Number(po.totalAmount).toLocaleString()}</td>
                              <td className="p-3 text-right" onClick={(e) => e.stopPropagation()}>
                                <div className="flex items-center justify-end gap-1">
                                  {(po.status === "approved" || po.status === "shipped") && (
                                    <Button size="sm" variant="outline" data-testid={`button-receive-po-${po.id}`} onClick={() => openReceiveDialog(po)}>
                                      <PackageCheck className="w-4 h-4 mr-1" />
                                      Receive
                                    </Button>
                                  )}
                                  <Button size="icon" variant="ghost" data-testid={`button-edit-po-${po.id}`} onClick={() => openEditPo(po)}>
                                    <Pencil className="w-4 h-4" />
                                  </Button>
                                  <Button size="icon" variant="ghost" data-testid={`button-delete-po-${po.id}`} onClick={() => { if (confirm("Delete this purchase order?")) deletePoMutation.mutate(po.id); }}>
                                    <Trash2 className="w-4 h-4" />
                                  </Button>
                                </div>
                              </td>
                            </tr>
                            {isExpanded && (
                              <tr>
                                <td colSpan={8} className="bg-muted/30 border-b">
                                  <POExpandedItems poId={po.id} />
                                </td>
                              </tr>
                            )}
                          </Fragment>
                        );
                      })
                    ) : (
                      <tr>
                        <td colSpan={8} className="p-8 text-center text-muted-foreground">No purchase orders found.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="suppliers" className="space-y-4">
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
                              <td className="p-3 font-medium">{s.name}</td>
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
                <Select value={poForm.supplierId} onValueChange={(v) => setPoForm({ ...poForm, supplierId: v })}>
                  <SelectTrigger data-testid="select-po-supplier">
                    <SelectValue placeholder="Select supplier" />
                  </SelectTrigger>
                  <SelectContent>
                    {suppliers?.map((s) => (
                      <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
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

      <Dialog open={prDialogOpen} onOpenChange={setPrDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Purchase Request {editingPr?.requestNumber}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Assign Supplier</Label>
              {matchingSuppliersLoading ? (
                <Skeleton className="h-10 w-full" />
              ) : matchingSuppliers && matchingSuppliers.length > 0 ? (
                <Select value={prForm.supplierId} onValueChange={(v) => setPrForm({ ...prForm, supplierId: v })}>
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
                        <th className="text-right px-3 py-1.5 font-medium text-muted-foreground">Unit Price</th>
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
          <DialogFooter>
            <Button
              data-testid="button-submit-pr"
              disabled={updatePrMutation.isPending}
              onClick={() => editingPr && updatePrMutation.mutate({
                id: editingPr.id,
                data: {
                  supplierId: prForm.supplierId || null,
                  priority: prForm.priority,
                  notes: prForm.notes || null,
                },
              })}
            >
              {updatePrMutation.isPending ? "Saving..." : "Update"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={receiveDialogOpen} onOpenChange={setReceiveDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Receive Goods</DialogTitle>
          </DialogHeader>
          {receivingPo && (
            <div className="space-y-4">
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Purchase Order</p>
                <p className="font-medium" data-testid="text-receive-po-number">{receivingPo.poNumber}</p>
              </div>
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Supplier</p>
                <p className="font-medium" data-testid="text-receive-supplier">{supplierMap.get(receivingPo.supplierId)?.name || "—"}</p>
              </div>
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Total Amount</p>
                <p className="font-medium" data-testid="text-receive-amount">₹{Number(receivingPo.totalAmount).toLocaleString()}</p>
              </div>
              <div className="space-y-2">
                <Label>Receive Into Warehouse</Label>
                <Select value={receiveWarehouseId} onValueChange={setReceiveWarehouseId}>
                  <SelectTrigger data-testid="select-receive-warehouse">
                    <SelectValue placeholder="Select warehouse" />
                  </SelectTrigger>
                  <SelectContent>
                    {warehouses?.map((w) => (
                      <SelectItem key={w.id} value={w.id}>{w.name}{w.location ? ` (${w.location})` : ""}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <POExpandedItems poId={receivingPo.id} />
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setReceiveDialogOpen(false)} data-testid="button-cancel-receive">
              Cancel
            </Button>
            <Button
              disabled={!receiveWarehouseId || receiveMutation.isPending}
              onClick={() => receivingPo && receiveMutation.mutate({ poId: receivingPo.id, warehouseId: receiveWarehouseId })}
              data-testid="button-confirm-receive"
            >
              {receiveMutation.isPending ? "Receiving..." : "Confirm Receipt"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
