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
import { Plus, Search, Package, Wrench, Pencil, Trash2, AlertCircle } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import type { Product } from "@shared/schema";

const productCategories = ["Solar Panels", "Electronics", "Commodities", "Accessories"];
const serviceCategories = ["Installation", "AMC", "Site Survey", "Repair", "Maintenance", "Custom"];

export default function Products() {
  const { toast } = useToast();
  const { data: allProducts, isLoading: productsLoading } = useQuery<Product[]>({ queryKey: ["/api/products"] });
  const { data: lastSoldPrices } = useQuery<Record<string, string>>({ queryKey: ["/api/products/last-sold-prices"] });

  const [activeTab, setActiveTab] = useState("products");
  const [searchQuery, setSearchQuery] = useState("");
  const [productDialogOpen, setProductDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [productForm, setProductForm] = useState({
    name: "", sku: "", category: "Solar Panels", description: "",
    unitPrice: "", brand: "", unit: "pcs", minStockLevel: "10", type: "product",
    hsnCode: "", gstRate: "18",
  });

  const productsOnly = allProducts?.filter(p => p.type !== "service") ?? [];
  const servicesOnly = allProducts?.filter(p => p.type === "service") ?? [];

  const currentList = activeTab === "products" ? productsOnly : servicesOnly;

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
        hsnCode: "", gstRate: "18",
      });
    } else {
      setProductForm({
        name: "", sku: "", category: "Solar Panels", description: "",
        unitPrice: "", brand: "", unit: "pcs", minStockLevel: "10", type: "product",
        hsnCode: "", gstRate: "18",
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
      hsnCode: (p as any).hsnCode || "",
      gstRate: (p as any).gstRate ? String((p as any).gstRate) : "18",
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
                    <td className="p-3 font-medium" data-testid={`text-item-name-${item.id}`}>{item.name}</td>
                    {!isServiceTab && <td className="p-3 text-muted-foreground" data-testid={`text-item-sku-${item.id}`}>{item.sku}</td>}
                    <td className="p-3 text-muted-foreground" data-testid={`text-item-brand-${item.id}`}>{item.brand || "—"}</td>
                    <td className="p-3">
                      <Badge variant="secondary" className="no-default-active-elevate" data-testid={`badge-item-category-${item.id}`}>
                        {item.category}
                      </Badge>
                    </td>
                    {!isServiceTab && (
                      <td className="p-3 text-muted-foreground text-xs" data-testid={`text-item-hsn-${item.id}`}>
                        {(item as any).hsnCode || "—"}
                      </td>
                    )}
                    <td className="p-3 text-right" data-testid={`text-item-gst-${item.id}`}>
                      <Badge variant="outline" className="no-default-active-elevate text-xs">
                        {Number((item as any).gstRate || 0)}%
                      </Badge>
                    </td>
                    <td className="p-3 text-right font-medium" data-testid={`text-item-price-${item.id}`}>
                      ₹{Number(item.unitPrice).toLocaleString()}
                    </td>
                    <td className="p-3 text-right" data-testid={`text-item-last-sold-${item.id}`}>
                      {lastSoldPrices && lastSoldPrices[item.id]
                        ? `₹${Number(lastSoldPrices[item.id]).toLocaleString()}`
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
        <Button data-testid="button-add-item" onClick={openNewItem}>
          <Plus className="w-4 h-4 mr-2" />
          {activeTab === "services" ? "Add Service" : "Add Product"}
        </Button>
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
              <Label htmlFor="prodSellingPrice">{isService ? "Service Charge (₹)" : "Selling Price (₹)"}</Label>
              <Input id="prodSellingPrice" type="number" data-testid="input-product-selling-price" value={productForm.unitPrice} onChange={(e) => setProductForm({ ...productForm, unitPrice: e.target.value })} />
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
