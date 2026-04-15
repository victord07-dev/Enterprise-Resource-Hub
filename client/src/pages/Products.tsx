import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Plus, Search, Package, Wrench, Pencil, Trash2, AlertCircle, Lock, TrendingUp } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import type { Product } from "@shared/schema";

const productCategories = ["Solar Panels", "Electronics", "Commodities", "Accessories"];
const serviceCategories = ["Installation", "AMC", "Site Survey", "Repair", "Maintenance", "Custom"];

export default function Products() {
  const { toast } = useToast();
  const { data: allProducts, isLoading: productsLoading } = useQuery<Product[]>({ queryKey: ["/api/products"] });
  const { data: lastSoldPrices } = useQuery<Record<string, { price: string; lastSoldAt: string }>>({ queryKey: ["/api/products/last-sold-prices"] });
  const { data: effectivePricesMap } = useQuery<Record<string, { effectivePrice: string; sheetDate: string; noConfirmedPrice: boolean; hasConfirmedToday: boolean; source: string; blendedCost: string | null; globalFloorPrice: string | null; strictFloorPrice: string | null }>>({
    queryKey: ["/api/daily-price-sheets/effective-prices-today"],
    queryFn: async () => {
      const res = await fetch("/api/daily-price-sheets/effective-prices-today", { headers: { Authorization: `Bearer ${localStorage.getItem("token")}` } });
      if (!res.ok) return {};
      return res.json();
    },
  });

  const [activeTab, setActiveTab] = useState("products");
  const [searchQuery, setSearchQuery] = useState("");
  const [productDialogOpen, setProductDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [productForm, setProductForm] = useState({
    name: "", sku: "", category: "Solar Panels", description: "",
    unitPrice: "", brand: "", unit: "pcs", minStockLevel: "10", type: "product",
    hsnCode: "", gstRate: "18", minMarginPct: "5.00",
  });

  const productsOnly = allProducts?.filter(p => p.type !== "service") ?? [];
  const servicesOnly = allProducts?.filter(p => p.type === "service") ?? [];

  const currentList = activeTab === "services" ? servicesOnly : productsOnly;

  const filteredItems = currentList.filter((p) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      p.name.toLowerCase().includes(q) ||
      p.sku.toLowerCase().includes(q) ||
      (p.brand && p.brand.toLowerCase().includes(q)) ||
      p.category.toLowerCase().includes(q)
    );
  });

  const noSellingPriceProducts = productsOnly.filter(p => !p.unitPrice || p.unitPrice === "0").length;
  const noSellingPriceServices = servicesOnly.filter(p => !p.unitPrice || p.unitPrice === "0").length;

  const productMutation = useMutation({
    mutationFn: async (data: any) => {
      if (editingProduct) {
        await apiRequest("PATCH", `/api/products/${editingProduct.id}`, data);
      } else {
        await apiRequest("POST", "/api/products", data);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      toast({ title: editingProduct ? (activeTab === "services" ? "Service updated" : "Product updated") : (activeTab === "services" ? "Service created" : "Product created") });
      setProductDialogOpen(false);
      setEditingProduct(null);
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const deleteProductMutation = useMutation({
    mutationFn: async (id: string) => { await apiRequest("DELETE", `/api/products/${id}`); },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      toast({ title: activeTab === "services" ? "Service deleted" : "Product deleted" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const isService = productForm.type === "service";

  const openNewItem = () => {
    setEditingProduct(null);
    if (activeTab === "services") {
      setProductForm({
        name: "", sku: `SVC-${Date.now().toString(36).toUpperCase()}`, category: "Installation", description: "",
        unitPrice: "", brand: "", unit: "service", minStockLevel: "0", type: "service",
        hsnCode: "", gstRate: "18", minMarginPct: "5.00",
      });
    } else {
      setProductForm({
        name: "", sku: "", category: "Solar Panels", description: "",
        unitPrice: "", brand: "", unit: "pcs", minStockLevel: "10", type: "product",
        hsnCode: "", gstRate: "18", minMarginPct: "5.00",
      });
    }
    setProductDialogOpen(true);
  };

  const openEditProduct = (p: Product) => {
    setEditingProduct(p);
    setProductForm({
      name: p.name,
      sku: p.sku,
      category: p.category,
      description: p.description || "",
      unitPrice: String(p.unitPrice),
      brand: p.brand || "",
      unit: p.unit,
      minStockLevel: String(p.minStockLevel),
      type: p.type || "product",
      hsnCode: p.hsnCode || "",
      gstRate: p.gstRate ? String(p.gstRate) : "18",
      minMarginPct: p.minMarginPct ? String(p.minMarginPct) : "5.00",
    });
    setProductDialogOpen(true);
  };

  const handleTypeChange = (type: string) => {
    if (type === "service") {
      setProductForm({
        ...productForm,
        type: "service",
        category: "Installation",
        unit: "service",
        minStockLevel: "0",
        sku: productForm.sku || `SVC-${Date.now().toString(36).toUpperCase()}`,
      });
    } else {
      setProductForm({
        ...productForm,
        type: "product",
        category: "Solar Panels",
        unit: "pcs",
        minStockLevel: "10",
      });
    }
  };

  const handleSubmitProduct = () => {
    const data: any = {
      ...productForm,
      minStockLevel: Number(productForm.minStockLevel),
      brand: productForm.brand || null,
      hsnCode: productForm.hsnCode || null,
      gstRate: productForm.gstRate || "0",
      minMarginPct: productForm.minMarginPct ? String(parseFloat(productForm.minMarginPct).toFixed(2)) : "5.00",
    };
    if (data.type === "service" && !data.sku) {
      data.sku = `SVC-${Date.now().toString(36).toUpperCase()}`;
    }
    productMutation.mutate(data);
  };

  const renderTable = (items: Product[], isServiceTab: boolean) => (
    <Card>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left p-3 font-medium text-muted-foreground">Name</th>
                {!isServiceTab && <th className="text-left p-3 font-medium text-muted-foreground">SKU</th>}
                <th className="text-left p-3 font-medium text-muted-foreground">Brand</th>
                <th className="text-left p-3 font-medium text-muted-foreground">Category</th>
                {!isServiceTab && <th className="text-left p-3 font-medium text-muted-foreground">HSN</th>}
                <th className="text-right p-3 font-medium text-muted-foreground">GST %</th>
                <th className="text-right p-3 font-medium text-muted-foreground">{isServiceTab ? "Service Charge (₹)" : "Selling Price (₹)"}</th>
                <th className="text-right p-3 font-medium text-muted-foreground">Last Sold (₹)</th>
                <th className="text-right p-3 font-medium text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody>
              {productsLoading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <tr key={i} className="border-b">
                    {Array.from({ length: isServiceTab ? 7 : 9 }).map((_, j) => (
                      <td key={j} className="p-3"><Skeleton className="h-4 w-16" /></td>
                    ))}
                  </tr>
                ))
              ) : items.length > 0 ? (
                items.map((item) => (
                  <tr
                    key={item.id}
                    className="border-b last:border-0"
                    data-testid={`row-${isServiceTab ? "service" : "product"}-${item.id}`}
                  >
                    <td className="p-3 font-medium" data-testid={`text-item-name-${item.id}`}>
                      <div className="flex items-center gap-2 flex-wrap">
                        {item.name}
                        {item.needsPricingReview && (
                          <Badge variant="outline" className="text-xs border-amber-400 text-amber-600 dark:text-amber-400" data-testid={`badge-pricing-review-${item.id}`}>
                            Pricing Review
                          </Badge>
                        )}
                      </div>
                    </td>
                    {!isServiceTab && <td className="p-3 text-muted-foreground" data-testid={`text-item-sku-${item.id}`}>{item.sku}</td>}
                    <td className="p-3 text-muted-foreground" data-testid={`text-item-brand-${item.id}`}>{item.brand || "—"}</td>
                    <td className="p-3">
                      <Badge variant="secondary" className="no-default-active-elevate" data-testid={`badge-item-category-${item.id}`}>
                        {item.category}
                      </Badge>
                    </td>
                    {!isServiceTab && (
                      <td className="p-3 text-muted-foreground text-xs" data-testid={`text-item-hsn-${item.id}`}>
                        {item.hsnCode || "—"}
                      </td>
                    )}
                    <td className="p-3 text-right" data-testid={`text-item-gst-${item.id}`}>
                      <Badge variant="outline" className="no-default-active-elevate text-xs">
                        {Number(item.gstRate || 0)}%
                      </Badge>
                    </td>
                    <td className="p-3 text-right font-medium" data-testid={`text-item-price-${item.id}`}>
                      ₹{Number(item.unitPrice).toLocaleString()}
                    </td>
                    <td className="p-3 text-right" data-testid={`text-item-last-sold-${item.id}`}>
                      {lastSoldPrices && lastSoldPrices[item.id]
                        ? `₹${Number(lastSoldPrices[item.id].price).toLocaleString()}`
                        : "—"}
                    </td>
                    <td className="p-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button size="icon" variant="ghost" data-testid={`button-edit-item-${item.id}`} onClick={() => openEditProduct(item)}>
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button size="icon" variant="ghost" data-testid={`button-delete-item-${item.id}`} onClick={() => { if (confirm(`Delete this ${isServiceTab ? "service" : "product"}?`)) deleteProductMutation.mutate(item.id); }}>
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={isServiceTab ? 7 : 9} className="p-8 text-center text-muted-foreground">
                    {searchQuery
                      ? `No ${isServiceTab ? "services" : "products"} match your search.`
                      : `No ${isServiceTab ? "services" : "products"} found. Add your first ${isServiceTab ? "service" : "product"}.`}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="p-6 space-y-6 overflow-auto h-full">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Products & Services</h1>
          <p className="text-muted-foreground text-sm mt-1">Manage your product catalog and service offerings</p>
        </div>
        {activeTab !== "prices" && (
          <Button data-testid="button-add-item" onClick={openNewItem}>
            <Plus className="w-4 h-4 mr-2" />
            {activeTab === "services" ? "Add Service" : "Add Product"}
          </Button>
        )}
      </div>

      <Tabs value={activeTab} onValueChange={(v) => { setActiveTab(v); setSearchQuery(""); }}>
        <TabsList data-testid="tabs-products-services">
          <TabsTrigger value="products" data-testid="tab-products" className="gap-1.5">
            <Package className="w-4 h-4" />
            Products ({productsOnly.length})
          </TabsTrigger>
          <TabsTrigger value="services" data-testid="tab-services" className="gap-1.5">
            <Wrench className="w-4 h-4" />
            Services ({servicesOnly.length})
          </TabsTrigger>
          <TabsTrigger value="prices" data-testid="tab-today-prices" className="gap-1.5">
            <TrendingUp className="w-4 h-4" />
            Today's Prices
          </TabsTrigger>
        </TabsList>

        <TabsContent value="products" className="space-y-4 mt-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Card>
              <CardContent className="p-5 flex items-center gap-4">
                <div className="w-10 h-10 rounded-md bg-blue-50 dark:bg-blue-950/30 flex items-center justify-center">
                  <Package className="w-5 h-5 text-blue-500" />
                </div>
                <div>
                  <p className="text-2xl font-bold" data-testid="text-stat-products">{productsOnly.length}</p>
                  <p className="text-xs text-muted-foreground">Total Products</p>
                </div>
              </CardContent>
            </Card>
            {noSellingPriceProducts > 0 && (
              <Card>
                <CardContent className="p-5 flex items-center gap-4">
                  <div className="w-10 h-10 rounded-md bg-red-50 dark:bg-red-950/30 flex items-center justify-center">
                    <AlertCircle className="w-5 h-5 text-red-500" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold" data-testid="text-stat-no-price-products">{noSellingPriceProducts}</p>
                    <p className="text-xs text-muted-foreground">Without Selling Price</p>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          <div className="flex items-center gap-2">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search by name, SKU, brand, category..."
                className="pl-9"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                data-testid="input-search-products"
              />
            </div>
          </div>

          {renderTable(filteredItems, false)}
        </TabsContent>

        <TabsContent value="services" className="space-y-4 mt-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Card>
              <CardContent className="p-5 flex items-center gap-4">
                <div className="w-10 h-10 rounded-md bg-orange-50 dark:bg-orange-950/30 flex items-center justify-center">
                  <Wrench className="w-5 h-5 text-orange-500" />
                </div>
                <div>
                  <p className="text-2xl font-bold" data-testid="text-stat-services">{servicesOnly.length}</p>
                  <p className="text-xs text-muted-foreground">Total Services</p>
                </div>
              </CardContent>
            </Card>
            {noSellingPriceServices > 0 && (
              <Card>
                <CardContent className="p-5 flex items-center gap-4">
                  <div className="w-10 h-10 rounded-md bg-red-50 dark:bg-red-950/30 flex items-center justify-center">
                    <AlertCircle className="w-5 h-5 text-red-500" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold" data-testid="text-stat-no-price-services">{noSellingPriceServices}</p>
                    <p className="text-xs text-muted-foreground">Without Service Charge</p>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          <div className="flex items-center gap-2">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search by name, brand, category..."
                className="pl-9"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                data-testid="input-search-services"
              />
            </div>
          </div>

          {renderTable(filteredItems, true)}
        </TabsContent>

        <TabsContent value="prices" className="space-y-4 mt-4">
            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left p-3 font-medium text-muted-foreground">Product</th>
                        <th className="text-left p-3 font-medium text-muted-foreground">Unit</th>
                        <th className="text-right p-3 font-medium text-muted-foreground">Effective Price (₹)</th>
                        <th className="text-center p-3 font-medium text-muted-foreground">Source</th>
                        <th className="text-right p-3 font-medium text-muted-foreground">Floor Price (₹)</th>
                        <th className="text-right p-3 font-medium text-muted-foreground">Last Sold (₹)</th>
                        <th className="text-left p-3 font-medium text-muted-foreground">Last Sold Date</th>
                        <th className="text-center p-3 font-medium text-muted-foreground">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {!effectivePricesMap || productsLoading ? (
                        Array.from({ length: 5 }).map((_, i) => (
                          <tr key={i} className="border-b">
                            {Array.from({ length: 8 }).map((_, j) => (
                              <td key={j} className="p-3"><Skeleton className="h-4 w-20" /></td>
                            ))}
                          </tr>
                        ))
                      ) : productsOnly.length === 0 ? (
                        <tr><td colSpan={8} className="text-center py-8 text-muted-foreground">No products found</td></tr>
                      ) : (
                        productsOnly.map((product) => {
                          const ep = effectivePricesMap?.[product.id];
                          const ls = lastSoldPrices?.[product.id];
                          const source = ep?.source ?? "none";
                          const sourceBadge =
                            source === "today" ? <Badge className="bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-400 border-green-300 text-[10px] px-1.5 py-0.5">🟢 Confirmed Today</Badge> :
                            source === "fallback" ? <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400 border-amber-300 text-[10px] px-1.5 py-0.5">🟡 Prev Sheet ({ep?.sheetDate})</Badge> :
                            <Badge className="bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400 border-red-300 text-[10px] px-1.5 py-0.5">🔴 No Price</Badge>;
                          return (
                            <tr key={product.id} className="border-b last:border-0" data-testid={`row-price-${product.id}`}>
                              <td className="p-3 font-medium" data-testid={`text-price-name-${product.id}`}>
                                <div>
                                  <div>{product.name}</div>
                                  <div className="text-xs text-muted-foreground">{product.sku}</div>
                                </div>
                              </td>
                              <td className="p-3 text-muted-foreground text-xs" data-testid={`text-price-unit-${product.id}`}>
                                {product.unit || "—"}
                              </td>
                              <td className="p-3 text-right font-semibold" data-testid={`text-price-effective-${product.id}`}>
                                {ep ? `₹${Number(ep.effectivePrice).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—"}
                              </td>
                              <td className="p-3 text-center" data-testid={`badge-price-source-${product.id}`}>
                                {sourceBadge}
                              </td>
                              <td className="p-3 text-right text-muted-foreground" data-testid={`text-price-floor-${product.id}`}>
                                {ep?.globalFloorPrice ? `₹${Number(ep.globalFloorPrice).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—"}
                              </td>
                              <td className="p-3 text-right" data-testid={`text-price-lastsold-${product.id}`}>
                                {ls ? `₹${Number(ls.price).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—"}
                              </td>
                              <td className="p-3 text-xs text-muted-foreground" data-testid={`text-price-lastsold-date-${product.id}`}>
                                {ls?.lastSoldAt ? new Date(ls.lastSoldAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—"}
                              </td>
                              <td className="p-3 text-center">
                                {ep?.hasConfirmedToday ? (
                                  <Badge className="bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-400 text-[10px]" data-testid={`badge-price-status-${product.id}`}>Confirmed Today</Badge>
                                ) : ep && !ep.noConfirmedPrice ? (
                                  <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400 text-[10px]" data-testid={`badge-price-status-${product.id}`}>Prior Sheet</Badge>
                                ) : (
                                  <Badge className="bg-muted text-muted-foreground text-[10px]" data-testid={`badge-price-status-${product.id}`}>No Sheet</Badge>
                                )}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
      </Tabs>

      <Dialog open={productDialogOpen} onOpenChange={setProductDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingProduct ? (isService ? "Edit Service" : "Edit Product") : (isService ? "Add Service" : "Add Product")}</DialogTitle>
            <DialogDescription>
              {isService ? "Service items for installation, maintenance, etc." : "Physical product or material"}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
            <div className="space-y-2">
              <Label>Type</Label>
              <Select value={productForm.type} onValueChange={handleTypeChange}>
                <SelectTrigger data-testid="select-product-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="product"><span className="flex items-center gap-1"><Package className="w-3 h-3" /> Product</span></SelectItem>
                  <SelectItem value="service"><span className="flex items-center gap-1"><Wrench className="w-3 h-3" /> Service</span></SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="prodName">Name</Label>
              <Input id="prodName" data-testid="input-product-name" value={productForm.name} onChange={(e) => setProductForm({ ...productForm, name: e.target.value })} placeholder={isService ? "e.g. Solar Panel Installation" : "e.g. 400W Solar Panel"} />
            </div>
            {!isService && (
              <div className="space-y-2">
                <Label htmlFor="prodSku">SKU</Label>
                <Input id="prodSku" data-testid="input-product-sku" value={productForm.sku} onChange={(e) => setProductForm({ ...productForm, sku: e.target.value })} />
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="prodBrand">Brand / Company</Label>
              <Input id="prodBrand" data-testid="input-product-brand" value={productForm.brand} onChange={(e) => setProductForm({ ...productForm, brand: e.target.value })} placeholder="e.g. Havells, Luminous" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="prodCategory">Category</Label>
              <Select value={productForm.category} onValueChange={(v) => setProductForm({ ...productForm, category: v })}>
                <SelectTrigger data-testid="select-product-category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(isService ? serviceCategories : productCategories).map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="prodDesc">Description</Label>
              <Input id="prodDesc" data-testid="input-product-description" value={productForm.description} onChange={(e) => setProductForm({ ...productForm, description: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="prodSellingPrice" className="flex items-center gap-1.5">
                {isService ? "Service Charge (₹)" : "Selling Price (₹)"}
                {editingProduct && !isService && effectivePricesMap?.[editingProduct.id]?.hasConfirmedToday && (
                  <span className="inline-flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 px-1.5 py-0.5 rounded">
                    <Lock className="w-3 h-3" />
                    Locked — confirmed price sheet today
                  </span>
                )}
              </Label>
              <div className="relative">
                <Input
                  id="prodSellingPrice"
                  type="number"
                  data-testid="input-product-selling-price"
                  value={productForm.unitPrice}
                  onChange={(e) => setProductForm({ ...productForm, unitPrice: e.target.value })}
                  disabled={!!editingProduct && !isService && !!effectivePricesMap?.[editingProduct.id]?.hasConfirmedToday}
                  className={editingProduct && !isService && effectivePricesMap?.[editingProduct.id]?.hasConfirmedToday ? "bg-muted cursor-not-allowed" : ""}
                />
                {editingProduct && !isService && effectivePricesMap?.[editingProduct.id] && (
                  <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                    <TrendingUp className="w-3 h-3 text-blue-500" />
                    {effectivePricesMap[editingProduct.id].hasConfirmedToday
                      ? `Today's confirmed price: ₹${Number(effectivePricesMap[editingProduct.id].effectivePrice).toLocaleString("en-IN")}. To change, update via Daily Pricing.`
                      : `Last confirmed price (${effectivePricesMap[editingProduct.id].sheetDate}): ₹${Number(effectivePricesMap[editingProduct.id].effectivePrice).toLocaleString("en-IN")} — no sheet confirmed today.`
                    }
                  </p>
                )}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="prodGstRate">GST Rate</Label>
                <Select value={productForm.gstRate} onValueChange={(v) => setProductForm({ ...productForm, gstRate: v })}>
                  <SelectTrigger data-testid="select-product-gst-rate">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {["0", "5", "12", "18", "28"].map((r) => (
                      <SelectItem key={r} value={r}>{r}%</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {!isService && (
                <div className="space-y-2">
                  <Label htmlFor="prodHsn">HSN Code</Label>
                  <Input id="prodHsn" data-testid="input-product-hsn" value={productForm.hsnCode} onChange={(e) => setProductForm({ ...productForm, hsnCode: e.target.value })} placeholder="e.g. 85414011" />
                </div>
              )}
            </div>
            {!isService && (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="prodUnit">Unit</Label>
                  <Select value={productForm.unit} onValueChange={(v) => setProductForm({ ...productForm, unit: v })}>
                    <SelectTrigger data-testid="select-product-unit">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {["pcs", "kg", "ltr", "mtr", "box"].map((u) => (
                        <SelectItem key={u} value={u}>{u}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="prodMinStock">Min Stock Level</Label>
                  <Input id="prodMinStock" type="number" data-testid="input-product-min-stock" value={productForm.minStockLevel} onChange={(e) => setProductForm({ ...productForm, minStockLevel: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="prodMinMargin">Min Margin % (FIFO pricing floor)</Label>
                  <Input
                    id="prodMinMargin"
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    data-testid="input-product-min-margin"
                    value={productForm.minMarginPct}
                    onChange={(e) => setProductForm({ ...productForm, minMarginPct: e.target.value })}
                    placeholder="5.00"
                  />
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button data-testid="button-submit-product" disabled={productMutation.isPending} onClick={handleSubmitProduct}>
              {productMutation.isPending ? "Saving..." : editingProduct ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
