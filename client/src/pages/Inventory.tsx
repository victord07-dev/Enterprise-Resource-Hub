import { useState } from "react";
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
import { Plus, Search, Package, Warehouse, AlertTriangle, ArrowUpDown, Pencil, Trash2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import type { Product, Warehouse as WarehouseType } from "@shared/schema";

export default function Inventory() {
  const { toast } = useToast();
  const { data: products, isLoading: productsLoading } = useQuery<Product[]>({ queryKey: ["/api/products"] });
  const { data: warehouses, isLoading: warehousesLoading } = useQuery<WarehouseType[]>({ queryKey: ["/api/warehouses"] });

  const [productDialogOpen, setProductDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [productForm, setProductForm] = useState({ name: "", sku: "", category: "Solar Panels", description: "", unitPrice: "", unit: "pcs", minStockLevel: "10" });

  const [warehouseDialogOpen, setWarehouseDialogOpen] = useState(false);
  const [editingWarehouse, setEditingWarehouse] = useState<WarehouseType | null>(null);
  const [warehouseForm, setWarehouseForm] = useState({ name: "", location: "", capacity: "" });

  const lowStockItems = products?.filter((p) => Number(p.minStockLevel) > 0) ?? [];

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

  const warehouseMutation = useMutation({
    mutationFn: async (data: any) => {
      if (editingWarehouse) {
        await apiRequest("PATCH", `/api/warehouses/${editingWarehouse.id}`, data);
      } else {
        await apiRequest("POST", "/api/warehouses", data);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/warehouses"] });
      toast({ title: editingWarehouse ? "Warehouse updated" : "Warehouse created" });
      setWarehouseDialogOpen(false);
      setEditingWarehouse(null);
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const deleteWarehouseMutation = useMutation({
    mutationFn: async (id: string) => { await apiRequest("DELETE", `/api/warehouses/${id}`); },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/warehouses"] });
      toast({ title: "Warehouse deleted" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const openNewProduct = () => {
    setEditingProduct(null);
    setProductForm({ name: "", sku: "", category: "Solar Panels", description: "", unitPrice: "", unit: "pcs", minStockLevel: "10" });
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
      unit: p.unit,
      minStockLevel: String(p.minStockLevel),
    });
    setProductDialogOpen(true);
  };

  const openNewWarehouse = () => {
    setEditingWarehouse(null);
    setWarehouseForm({ name: "", location: "", capacity: "" });
    setWarehouseDialogOpen(true);
  };

  const openEditWarehouse = (wh: WarehouseType) => {
    setEditingWarehouse(wh);
    setWarehouseForm({
      name: wh.name,
      location: wh.location || "",
      capacity: wh.capacity ? String(wh.capacity) : "",
    });
    setWarehouseDialogOpen(true);
  };

  return (
    <div className="p-6 space-y-6 overflow-auto h-full">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Inventory</h1>
          <p className="text-muted-foreground text-sm mt-1">Manage products, stock, and warehouses</p>
        </div>
        <Button data-testid="button-add-product" onClick={openNewProduct}>
          <Plus className="w-4 h-4 mr-2" />
          Add Product
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-5 flex items-center gap-4">
            <div className="w-10 h-10 rounded-md bg-blue-50 dark:bg-blue-950/30 flex items-center justify-center">
              <Package className="w-5 h-5 text-blue-500" />
            </div>
            <div>
              <p className="text-2xl font-bold">{products?.length ?? 0}</p>
              <p className="text-xs text-muted-foreground">Total Products</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5 flex items-center gap-4">
            <div className="w-10 h-10 rounded-md bg-emerald-50 dark:bg-emerald-950/30 flex items-center justify-center">
              <Warehouse className="w-5 h-5 text-emerald-500" />
            </div>
            <div>
              <p className="text-2xl font-bold">{warehouses?.length ?? 0}</p>
              <p className="text-xs text-muted-foreground">Warehouses</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5 flex items-center gap-4">
            <div className="w-10 h-10 rounded-md bg-red-50 dark:bg-red-950/30 flex items-center justify-center">
              <AlertTriangle className="w-5 h-5 text-red-500" />
            </div>
            <div>
              <p className="text-2xl font-bold">0</p>
              <p className="text-xs text-muted-foreground">Low Stock Alerts</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="products" className="space-y-4">
        <TabsList>
          <TabsTrigger value="products" data-testid="tab-products">Products</TabsTrigger>
          <TabsTrigger value="warehouses" data-testid="tab-warehouses">Warehouses</TabsTrigger>
          <TabsTrigger value="movements" data-testid="tab-movements">Stock Movements</TabsTrigger>
        </TabsList>

        <TabsContent value="products" className="space-y-4">
          <div className="flex items-center gap-2">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Search products..." className="pl-9" data-testid="input-search-products" />
            </div>
          </div>
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left p-3 font-medium text-muted-foreground">Product Name</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">SKU</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">Category</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">Unit</th>
                      <th className="text-right p-3 font-medium text-muted-foreground">Unit Price</th>
                      <th className="text-right p-3 font-medium text-muted-foreground">Min Stock</th>
                      <th className="text-right p-3 font-medium text-muted-foreground">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {productsLoading ? (
                      Array.from({ length: 3 }).map((_, i) => (
                        <tr key={i} className="border-b">
                          {Array.from({ length: 7 }).map((_, j) => (
                            <td key={j} className="p-3"><Skeleton className="h-4 w-20" /></td>
                          ))}
                        </tr>
                      ))
                    ) : products && products.length > 0 ? (
                      products.map((product) => (
                        <tr key={product.id} className="border-b last:border-0" data-testid={`row-product-${product.id}`}>
                          <td className="p-3 font-medium">{product.name}</td>
                          <td className="p-3 text-muted-foreground">{product.sku}</td>
                          <td className="p-3">
                            <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-950/40 dark:text-blue-400">
                              {product.category}
                            </span>
                          </td>
                          <td className="p-3 text-muted-foreground">{product.unit}</td>
                          <td className="p-3 text-right font-medium">₹{Number(product.unitPrice).toLocaleString()}</td>
                          <td className="p-3 text-right text-muted-foreground">{product.minStockLevel}</td>
                          <td className="p-3 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button size="icon" variant="ghost" data-testid={`button-edit-product-${product.id}`} onClick={() => openEditProduct(product)}>
                                <Pencil className="w-4 h-4" />
                              </Button>
                              <Button size="icon" variant="ghost" data-testid={`button-delete-product-${product.id}`} onClick={() => { if (confirm("Delete this product?")) deleteProductMutation.mutate(product.id); }}>
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={7} className="p-8 text-center text-muted-foreground">
                          No products found. Add your first product.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="warehouses" className="space-y-4">
          <Button size="sm" data-testid="button-add-warehouse" onClick={openNewWarehouse}>
            <Plus className="w-4 h-4 mr-2" />
            Add Warehouse
          </Button>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {warehousesLoading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <Card key={i}><CardContent className="p-5"><Skeleton className="h-20 w-full" /></CardContent></Card>
              ))
            ) : warehouses && warehouses.length > 0 ? (
              warehouses.map((wh) => (
                <Card key={wh.id} data-testid={`card-warehouse-${wh.id}`}>
                  <CardContent className="p-5">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-md bg-emerald-50 dark:bg-emerald-950/30 flex items-center justify-center">
                          <Warehouse className="w-5 h-5 text-emerald-500" />
                        </div>
                        <div>
                          <p className="font-semibold">{wh.name}</p>
                          <p className="text-xs text-muted-foreground">{wh.location || "No location set"}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button size="icon" variant="ghost" data-testid={`button-edit-warehouse-${wh.id}`} onClick={() => openEditWarehouse(wh)}>
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button size="icon" variant="ghost" data-testid={`button-delete-warehouse-${wh.id}`} onClick={() => { if (confirm("Delete this warehouse?")) deleteWarehouseMutation.mutate(wh.id); }}>
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                    <p className="text-sm text-muted-foreground mt-3">Capacity: {wh.capacity ?? "Unlimited"}</p>
                  </CardContent>
                </Card>
              ))
            ) : (
              <div className="col-span-full text-center text-muted-foreground p-8">
                No warehouses found. Add your first warehouse.
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="movements">
          <Card>
            <CardContent className="p-8 text-center text-muted-foreground">
              <ArrowUpDown className="w-12 h-12 mx-auto mb-3 text-muted-foreground/40" />
              <p className="font-medium">Stock Movements</p>
              <p className="text-sm mt-1">Track incoming and outgoing stock movements across warehouses.</p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={productDialogOpen} onOpenChange={setProductDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingProduct ? "Edit Product" : "Add Product"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="prodName">Name</Label>
              <Input id="prodName" data-testid="input-product-name" value={productForm.name} onChange={(e) => setProductForm({ ...productForm, name: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="prodSku">SKU</Label>
              <Input id="prodSku" data-testid="input-product-sku" value={productForm.sku} onChange={(e) => setProductForm({ ...productForm, sku: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="prodCategory">Category</Label>
              <Select value={productForm.category} onValueChange={(v) => setProductForm({ ...productForm, category: v })}>
                <SelectTrigger data-testid="select-product-category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {["Solar Panels", "Electronics", "Commodities", "Accessories"].map((c) => (
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
              <Label htmlFor="prodPrice">Unit Price</Label>
              <Input id="prodPrice" type="number" data-testid="input-product-unit-price" value={productForm.unitPrice} onChange={(e) => setProductForm({ ...productForm, unitPrice: e.target.value })} />
            </div>
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
          <DialogFooter>
            <Button data-testid="button-submit-product" disabled={productMutation.isPending} onClick={() => productMutation.mutate({ ...productForm, minStockLevel: Number(productForm.minStockLevel) })}>
              {productMutation.isPending ? "Saving..." : editingProduct ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={warehouseDialogOpen} onOpenChange={setWarehouseDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingWarehouse ? "Edit Warehouse" : "Add Warehouse"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="whName">Name</Label>
              <Input id="whName" data-testid="input-warehouse-name" value={warehouseForm.name} onChange={(e) => setWarehouseForm({ ...warehouseForm, name: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="whLocation">Location</Label>
              <Input id="whLocation" data-testid="input-warehouse-location" value={warehouseForm.location} onChange={(e) => setWarehouseForm({ ...warehouseForm, location: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="whCapacity">Capacity</Label>
              <Input id="whCapacity" type="number" data-testid="input-warehouse-capacity" value={warehouseForm.capacity} onChange={(e) => setWarehouseForm({ ...warehouseForm, capacity: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button data-testid="button-submit-warehouse" disabled={warehouseMutation.isPending} onClick={() => warehouseMutation.mutate({ ...warehouseForm, capacity: warehouseForm.capacity ? Number(warehouseForm.capacity) : null })}>
              {warehouseMutation.isPending ? "Saving..." : editingWarehouse ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
