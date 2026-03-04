import { useState, useCallback, Fragment } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Plus, Search, Package, Wrench, Pencil, Trash2, ChevronDown, ChevronRight, Box, AlertCircle, Star, Truck } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import type { Product, Supplier, SupplierProduct } from "@shared/schema";

const productCategories = ["Solar Panels", "Electronics", "Commodities", "Accessories"];
const serviceCategories = ["Installation", "AMC", "Site Survey", "Repair", "Maintenance", "Custom"];

interface SupplierProductWithName extends SupplierProduct {
  supplierName?: string;
}

export default function Products() {
  const { toast } = useToast();
  const { data: products, isLoading: productsLoading } = useQuery<Product[]>({ queryKey: ["/api/products"] });
  const { data: suppliers } = useQuery<Supplier[]>({ queryKey: ["/api/suppliers"] });
  const { data: lastSoldPrices } = useQuery<Record<string, string>>({ queryKey: ["/api/products/last-sold-prices"] });

  const [searchQuery, setSearchQuery] = useState("");
  const [productDialogOpen, setProductDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [productForm, setProductForm] = useState({
    name: "", sku: "", category: "Solar Panels", description: "",
    unitPrice: "", costPrice: "", brand: "", unit: "pcs", minStockLevel: "10", type: "product",
  });

  const [expandedProductId, setExpandedProductId] = useState<string | null>(null);
  const [expandedSuppliers, setExpandedSuppliers] = useState<SupplierProductWithName[]>([]);
  const [supplierDialogOpen, setSupplierDialogOpen] = useState(false);
  const [supplierForm, setSupplierForm] = useState({
    supplierId: "", supplierPrice: "", supplierSku: "", leadTimeDays: "", isPreferred: false,
  });
  const [addingSupplierForProductId, setAddingSupplierForProductId] = useState<string | null>(null);

  const filteredProducts = products?.filter((p) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      p.name.toLowerCase().includes(q) ||
      p.sku.toLowerCase().includes(q) ||
      (p.brand && p.brand.toLowerCase().includes(q)) ||
      p.category.toLowerCase().includes(q)
    );
  });

  const productCount = products?.filter(p => p.type !== "service").length ?? 0;
  const serviceCount = products?.filter(p => p.type === "service").length ?? 0;
  const noCostPriceCount = products?.filter(p => !p.costPrice || p.costPrice === "0").length ?? 0;
  const noSellingPriceCount = products?.filter(p => !p.unitPrice || p.unitPrice === "0").length ?? 0;

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
      toast({ title: editingProduct ? "Product updated" : "Product created" });
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
      toast({ title: "Product deleted" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const addSupplierMutation = useMutation({
    mutationFn: async (data: any) => {
      await apiRequest("POST", `/api/suppliers/${data.supplierId}/products`, {
        productId: data.productId,
        supplierPrice: data.supplierPrice,
        supplierSku: data.supplierSku || null,
        leadTimeDays: data.leadTimeDays ? Number(data.leadTimeDays) : null,
        isPreferred: data.isPreferred,
      });
    },
    onSuccess: () => {
      toast({ title: "Supplier added to product" });
      setSupplierDialogOpen(false);
      if (addingSupplierForProductId) {
        loadProductSuppliers(addingSupplierForProductId);
      }
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const deleteSupplierProductMutation = useMutation({
    mutationFn: async (id: string) => { await apiRequest("DELETE", `/api/supplier-products/${id}`); },
    onSuccess: () => {
      toast({ title: "Supplier removed from product" });
      if (expandedProductId) {
        loadProductSuppliers(expandedProductId);
      }
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const loadProductSuppliers = useCallback(async (productId: string) => {
    try {
      const res = await fetch(`/api/products/${productId}/suppliers`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
      });
      const data: SupplierProduct[] = await res.json();
      const enriched: SupplierProductWithName[] = data.map((sp) => ({
        ...sp,
        supplierName: suppliers?.find((s) => s.id === sp.supplierId)?.name || "Unknown",
      }));
      setExpandedSuppliers(enriched);
    } catch {
      setExpandedSuppliers([]);
    }
  }, [suppliers]);

  const toggleProductExpand = useCallback(async (productId: string) => {
    if (expandedProductId === productId) {
      setExpandedProductId(null);
      return;
    }
    setExpandedProductId(productId);
    await loadProductSuppliers(productId);
  }, [expandedProductId, loadProductSuppliers]);

  const isService = productForm.type === "service";

  const openNewProduct = () => {
    setEditingProduct(null);
    setProductForm({
      name: "", sku: "", category: "Solar Panels", description: "",
      unitPrice: "", costPrice: "", brand: "", unit: "pcs", minStockLevel: "10", type: "product",
    });
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
      costPrice: p.costPrice ? String(p.costPrice) : "",
      brand: p.brand || "",
      unit: p.unit,
      minStockLevel: String(p.minStockLevel),
      type: p.type || "product",
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
      costPrice: productForm.costPrice || null,
      brand: productForm.brand || null,
    };
    if (isService && !data.sku) {
      data.sku = `SVC-${Date.now().toString(36).toUpperCase()}`;
    }
    productMutation.mutate(data);
  };

  const openAddSupplier = (productId: string) => {
    setAddingSupplierForProductId(productId);
    setSupplierForm({ supplierId: "", supplierPrice: "", supplierSku: "", leadTimeDays: "", isPreferred: false });
    setSupplierDialogOpen(true);
  };

  const handleSubmitSupplier = () => {
    if (!addingSupplierForProductId || !supplierForm.supplierId || !supplierForm.supplierPrice) return;
    addSupplierMutation.mutate({
      supplierId: supplierForm.supplierId,
      productId: addingSupplierForProductId,
      supplierPrice: supplierForm.supplierPrice,
      supplierSku: supplierForm.supplierSku,
      leadTimeDays: supplierForm.leadTimeDays,
      isPreferred: supplierForm.isPreferred,
    });
  };

  const cheapestPrice = expandedSuppliers.length > 0
    ? Math.min(...expandedSuppliers.map(sp => Number(sp.supplierPrice)))
    : null;

  return (
    <div className="p-6 space-y-6 overflow-auto h-full">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Products</h1>
          <p className="text-muted-foreground text-sm mt-1">Product Master — manage all products, pricing, and supplier associations</p>
        </div>
        <Button data-testid="button-add-product" onClick={openNewProduct}>
          <Plus className="w-4 h-4 mr-2" />
          Add Product
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-5 flex items-center gap-4">
            <div className="w-10 h-10 rounded-md bg-blue-50 dark:bg-blue-950/30 flex items-center justify-center">
              <Package className="w-5 h-5 text-blue-500" />
            </div>
            <div>
              <p className="text-2xl font-bold" data-testid="text-stat-products">{productCount}</p>
              <p className="text-xs text-muted-foreground">Total Products</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5 flex items-center gap-4">
            <div className="w-10 h-10 rounded-md bg-orange-50 dark:bg-orange-950/30 flex items-center justify-center">
              <Wrench className="w-5 h-5 text-orange-500" />
            </div>
            <div>
              <p className="text-2xl font-bold" data-testid="text-stat-services">{serviceCount}</p>
              <p className="text-xs text-muted-foreground">Total Services</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5 flex items-center gap-4">
            <div className="w-10 h-10 rounded-md bg-amber-50 dark:bg-amber-950/30 flex items-center justify-center">
              <AlertCircle className="w-5 h-5 text-amber-500" />
            </div>
            <div>
              <p className="text-2xl font-bold" data-testid="text-stat-no-cost">{noCostPriceCount}</p>
              <p className="text-xs text-muted-foreground">Without Cost Price</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5 flex items-center gap-4">
            <div className="w-10 h-10 rounded-md bg-red-50 dark:bg-red-950/30 flex items-center justify-center">
              <AlertCircle className="w-5 h-5 text-red-500" />
            </div>
            <div>
              <p className="text-2xl font-bold" data-testid="text-stat-no-selling">{noSellingPriceCount}</p>
              <p className="text-xs text-muted-foreground">Without Selling Price</p>
            </div>
          </CardContent>
        </Card>
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

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="w-8 p-3"></th>
                  <th className="text-left p-3 font-medium text-muted-foreground">Name</th>
                  <th className="text-left p-3 font-medium text-muted-foreground">SKU</th>
                  <th className="text-left p-3 font-medium text-muted-foreground">Brand</th>
                  <th className="text-left p-3 font-medium text-muted-foreground">Category</th>
                  <th className="text-left p-3 font-medium text-muted-foreground">Type</th>
                  <th className="text-right p-3 font-medium text-muted-foreground">Selling Price (₹)</th>
                  <th className="text-right p-3 font-medium text-muted-foreground">Cost Price (₹)</th>
                  <th className="text-right p-3 font-medium text-muted-foreground">Last Sold (₹)</th>
                  <th className="text-center p-3 font-medium text-muted-foreground">Suppliers</th>
                  <th className="text-right p-3 font-medium text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody>
                {productsLoading ? (
                  Array.from({ length: 4 }).map((_, i) => (
                    <tr key={i} className="border-b">
                      {Array.from({ length: 11 }).map((_, j) => (
                        <td key={j} className="p-3"><Skeleton className="h-4 w-16" /></td>
                      ))}
                    </tr>
                  ))
                ) : filteredProducts && filteredProducts.length > 0 ? (
                  filteredProducts.map((product) => (
                    <Fragment key={product.id}>
                      <tr
                        className="border-b last:border-0 cursor-pointer"
                        data-testid={`row-product-${product.id}`}
                        onClick={() => toggleProductExpand(product.id)}
                      >
                        <td className="p-3">
                          {expandedProductId === product.id ? (
                            <ChevronDown className="w-4 h-4 text-muted-foreground" />
                          ) : (
                            <ChevronRight className="w-4 h-4 text-muted-foreground" />
                          )}
                        </td>
                        <td className="p-3 font-medium" data-testid={`text-product-name-${product.id}`}>{product.name}</td>
                        <td className="p-3 text-muted-foreground" data-testid={`text-product-sku-${product.id}`}>{product.type === "service" ? "—" : product.sku}</td>
                        <td className="p-3 text-muted-foreground" data-testid={`text-product-brand-${product.id}`}>{product.brand || "—"}</td>
                        <td className="p-3">
                          <Badge variant="secondary" className="no-default-active-elevate" data-testid={`badge-product-category-${product.id}`}>
                            {product.category}
                          </Badge>
                        </td>
                        <td className="p-3">
                          {product.type === "service" ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-orange-100 text-orange-700 dark:bg-orange-950/40 dark:text-orange-400">
                              <Wrench className="w-3 h-3" /> Service
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400">
                              <Package className="w-3 h-3" /> Product
                            </span>
                          )}
                        </td>
                        <td className="p-3 text-right font-medium" data-testid={`text-product-selling-price-${product.id}`}>
                          ₹{Number(product.unitPrice).toLocaleString()}
                        </td>
                        <td className="p-3 text-right" data-testid={`text-product-cost-price-${product.id}`}>
                          {product.costPrice ? `₹${Number(product.costPrice).toLocaleString()}` : "—"}
                        </td>
                        <td className="p-3 text-right" data-testid={`text-product-last-sold-${product.id}`}>
                          {lastSoldPrices && lastSoldPrices[product.id]
                            ? `₹${Number(lastSoldPrices[product.id]).toLocaleString()}`
                            : "—"}
                        </td>
                        <td className="p-3 text-center" data-testid={`text-product-suppliers-${product.id}`}>
                          <Badge variant="outline" className="no-default-active-elevate">
                            {expandedProductId === product.id ? expandedSuppliers.length : "—"}
                          </Badge>
                        </td>
                        <td className="p-3 text-right">
                          <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                            <Button size="icon" variant="ghost" data-testid={`button-edit-product-${product.id}`} onClick={() => openEditProduct(product)}>
                              <Pencil className="w-4 h-4" />
                            </Button>
                            <Button size="icon" variant="ghost" data-testid={`button-delete-product-${product.id}`} onClick={() => { if (confirm("Delete this product?")) deleteProductMutation.mutate(product.id); }}>
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                      {expandedProductId === product.id && (
                        <tr>
                          <td colSpan={11} className="p-0">
                            <div className="bg-muted/30 border-b p-4 space-y-3">
                              <div className="flex items-center justify-between gap-2 flex-wrap">
                                <h3 className="text-sm font-semibold flex items-center gap-2">
                                  <Truck className="w-4 h-4" />
                                  Suppliers for {product.name}
                                </h3>
                                <Button variant="outline" size="sm" data-testid={`button-add-supplier-${product.id}`} onClick={(e) => { e.stopPropagation(); openAddSupplier(product.id); }}>
                                  <Plus className="w-3 h-3 mr-1" /> Add Supplier
                                </Button>
                              </div>
                              {expandedSuppliers.length === 0 ? (
                                <p className="text-sm text-muted-foreground text-center py-3">No suppliers linked to this product yet.</p>
                              ) : (
                                <div className="overflow-x-auto">
                                  <table className="w-full text-sm">
                                    <thead>
                                      <tr className="border-b">
                                        <th className="text-left p-2 font-medium text-muted-foreground">Supplier</th>
                                        <th className="text-right p-2 font-medium text-muted-foreground">Price (₹)</th>
                                        <th className="text-left p-2 font-medium text-muted-foreground">Supplier SKU</th>
                                        <th className="text-center p-2 font-medium text-muted-foreground">Lead Time</th>
                                        <th className="text-center p-2 font-medium text-muted-foreground">Status</th>
                                        <th className="text-right p-2 font-medium text-muted-foreground">Actions</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {expandedSuppliers.map((sp) => {
                                        const isCheapest = cheapestPrice !== null && Number(sp.supplierPrice) === cheapestPrice;
                                        return (
                                          <tr
                                            key={sp.id}
                                            className={`border-b last:border-0 ${isCheapest ? "bg-emerald-50/50 dark:bg-emerald-950/20" : ""}`}
                                            data-testid={`row-supplier-product-${sp.id}`}
                                          >
                                            <td className="p-2 font-medium" data-testid={`text-supplier-name-${sp.id}`}>{sp.supplierName}</td>
                                            <td className="p-2 text-right font-medium" data-testid={`text-supplier-price-${sp.id}`}>
                                              <span className={isCheapest ? "text-emerald-600 dark:text-emerald-400" : ""}>
                                                ₹{Number(sp.supplierPrice).toLocaleString()}
                                              </span>
                                              {isCheapest && expandedSuppliers.length > 1 && (
                                                <Badge variant="secondary" className="ml-2 no-default-active-elevate text-emerald-700 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-950/40">
                                                  Lowest
                                                </Badge>
                                              )}
                                            </td>
                                            <td className="p-2 text-muted-foreground">{sp.supplierSku || "—"}</td>
                                            <td className="p-2 text-center text-muted-foreground">{sp.leadTimeDays ? `${sp.leadTimeDays} days` : "—"}</td>
                                            <td className="p-2 text-center">
                                              {sp.isPreferred && (
                                                <Badge variant="secondary" className="no-default-active-elevate">
                                                  <Star className="w-3 h-3 mr-1 fill-current" /> Preferred
                                                </Badge>
                                              )}
                                            </td>
                                            <td className="p-2 text-right">
                                              <Button
                                                size="icon"
                                                variant="ghost"
                                                data-testid={`button-delete-supplier-product-${sp.id}`}
                                                onClick={() => { if (confirm("Remove this supplier?")) deleteSupplierProductMutation.mutate(sp.id); }}
                                              >
                                                <Trash2 className="w-4 h-4" />
                                              </Button>
                                            </td>
                                          </tr>
                                        );
                                      })}
                                    </tbody>
                                  </table>
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
                    <td colSpan={11} className="p-8 text-center text-muted-foreground">
                      {searchQuery ? "No products match your search." : "No products found. Add your first product."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={productDialogOpen} onOpenChange={setProductDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingProduct ? "Edit Product" : "Add Product"}</DialogTitle>
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
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="prodSellingPrice">Selling Price (₹)</Label>
                <Input id="prodSellingPrice" type="number" data-testid="input-product-selling-price" value={productForm.unitPrice} onChange={(e) => setProductForm({ ...productForm, unitPrice: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="prodCostPrice">Cost Price (₹)</Label>
                <Input id="prodCostPrice" type="number" data-testid="input-product-cost-price" value={productForm.costPrice} onChange={(e) => setProductForm({ ...productForm, costPrice: e.target.value })} />
              </div>
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

      <Dialog open={supplierDialogOpen} onOpenChange={setSupplierDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Supplier to Product</DialogTitle>
            <DialogDescription>Link a supplier with their pricing for this product</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Supplier</Label>
              <Select value={supplierForm.supplierId} onValueChange={(v) => setSupplierForm({ ...supplierForm, supplierId: v })}>
                <SelectTrigger data-testid="select-supplier">
                  <SelectValue placeholder="Select supplier..." />
                </SelectTrigger>
                <SelectContent>
                  {suppliers?.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="spPrice">Supplier Price (₹)</Label>
              <Input id="spPrice" type="number" data-testid="input-supplier-price" value={supplierForm.supplierPrice} onChange={(e) => setSupplierForm({ ...supplierForm, supplierPrice: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="spSku">Supplier SKU (optional)</Label>
              <Input id="spSku" data-testid="input-supplier-sku" value={supplierForm.supplierSku} onChange={(e) => setSupplierForm({ ...supplierForm, supplierSku: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="spLeadTime">Lead Time (days)</Label>
                <Input id="spLeadTime" type="number" data-testid="input-supplier-lead-time" value={supplierForm.leadTimeDays} onChange={(e) => setSupplierForm({ ...supplierForm, leadTimeDays: e.target.value })} />
              </div>
              <div className="space-y-2 flex items-end gap-2">
                <label className="flex items-center gap-2 cursor-pointer" data-testid="checkbox-preferred-supplier">
                  <input
                    type="checkbox"
                    checked={supplierForm.isPreferred}
                    onChange={(e) => setSupplierForm({ ...supplierForm, isPreferred: e.target.checked })}
                    className="rounded"
                  />
                  <span className="text-sm">Preferred Supplier</span>
                </label>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button data-testid="button-submit-supplier" disabled={addSupplierMutation.isPending} onClick={handleSubmitSupplier}>
              {addSupplierMutation.isPending ? "Adding..." : "Add Supplier"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
