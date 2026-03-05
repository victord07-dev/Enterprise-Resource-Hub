import { useState, Fragment, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Search, Package, Warehouse, AlertTriangle, ArrowUpDown, Pencil, Trash2, Wrench, ArrowDownCircle, ArrowUpCircle, RefreshCw, Calendar, ChevronDown, ChevronRight, Truck, Send, CheckCircle, FileText, PackagePlus, ShoppingCart, MapPin } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import type { Product, Warehouse as WarehouseType, StockMovement, InventoryStock, DeliveryChallan, DeliveryChallanItem, SalesOrder, SalesOrderItem, Supplier, PurchaseOrder, PurchaseOrderItem, GoodsReceiptNote, GoodsReceiptNoteItem } from "@shared/schema";

const productCategories = ["Solar Panels", "Electronics", "Commodities", "Accessories"];
const serviceCategories = ["Installation", "AMC", "Site Survey", "Repair", "Maintenance", "Custom"];

export default function Inventory() {
  const { toast } = useToast();
  const { data: products, isLoading: productsLoading } = useQuery<Product[]>({ queryKey: ["/api/products"] });
  const { data: warehouses, isLoading: warehousesLoading } = useQuery<WarehouseType[]>({ queryKey: ["/api/warehouses"] });

  const [productDialogOpen, setProductDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [productForm, setProductForm] = useState({ name: "", sku: "", category: "Solar Panels", description: "", costPrice: "", brand: "", unit: "pcs", minStockLevel: "10", type: "product" });

  const [warehouseDialogOpen, setWarehouseDialogOpen] = useState(false);
  const [editingWarehouse, setEditingWarehouse] = useState<WarehouseType | null>(null);
  const [warehouseForm, setWarehouseForm] = useState({ name: "", location: "", capacity: "" });

  const [adjustmentDialogOpen, setAdjustmentDialogOpen] = useState(false);
  const [adjustmentForm, setAdjustmentForm] = useState({ productId: "", warehouseId: "", movementType: "in", quantity: "", notes: "" });
  const [movementFilterProduct, setMovementFilterProduct] = useState("all");
  const [movementFilterWarehouse, setMovementFilterWarehouse] = useState("all");
  const [movementFilterType, setMovementFilterType] = useState("all");
  const [movementFilterDateFrom, setMovementFilterDateFrom] = useState("");
  const [movementFilterDateTo, setMovementFilterDateTo] = useState("");

  const { data: stockMovements, isLoading: movementsLoading } = useQuery<StockMovement[]>({ queryKey: ["/api/stock-movements"] });
  const { data: inventoryStockData } = useQuery<InventoryStock[]>({ queryKey: ["/api/inventory-stock"] });
  const { data: reservedStockData } = useQuery<Record<string, { total: number; orders: Array<{ orderId: string; orderNumber: string; quantity: number; expectedDeliveryDate: string | null; reservationStatus: string }> }>>({ queryKey: ["/api/inventory/reserved-stock"] });
  const { data: incomingStockData } = useQuery<Record<string, { total: number; orders: Array<{ poId: string; poNumber: string; quantity: number; expectedDate: string | null }> }>>({ queryKey: ["/api/inventory/incoming-stock"] });

  const [expandedProductIds, setExpandedProductIds] = useState<Set<string>>(new Set());
  const [expandedReservedIds, setExpandedReservedIds] = useState<Set<string>>(new Set());
  const [expandedIncomingIds, setExpandedIncomingIds] = useState<Set<string>>(new Set());

  const toggleReservedExpanded = (id: string) => {
    setExpandedReservedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleIncomingExpanded = (id: string) => {
    setExpandedIncomingIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleProductExpanded = (id: string) => {
    setExpandedProductIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const getProductTotalStock = (productId: string) => {
    if (!inventoryStockData) return 0;
    return inventoryStockData
      .filter(s => s.productId === productId)
      .reduce((sum, s) => sum + (s.quantity ?? 0), 0);
  };

  const getProductStockByWarehouse = (productId: string) => {
    if (!inventoryStockData || !warehouses) return [];
    const stockEntries = inventoryStockData.filter(s => s.productId === productId && s.quantity > 0);
    return stockEntries.map(s => {
      const wh = warehouses.find(w => w.id === s.warehouseId);
      return { warehouseId: s.warehouseId, warehouseName: wh?.name || "Unknown", quantity: s.quantity };
    });
  };

  const lowStockProducts = products?.filter(p => {
    if (p.type === "service") return false;
    const totalStock = getProductTotalStock(p.id);
    const reserved = reservedStockData?.[p.id]?.total ?? 0;
    const available = Math.max(0, totalStock - reserved);
    return available < (p.minStockLevel ?? 0);
  }) ?? [];

  const adjustmentMutation = useMutation({
    mutationFn: async (data: any) => {
      await apiRequest("POST", "/api/stock-movements", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/stock-movements"] });
      queryClient.invalidateQueries({ queryKey: ["/api/inventory-stock"] });
      queryClient.invalidateQueries({ queryKey: ["/api/inventory/reserved-stock"] });
      queryClient.invalidateQueries({ queryKey: ["/api/inventory/incoming-stock"] });
      toast({ title: "Stock adjustment recorded" });
      setAdjustmentDialogOpen(false);
      setAdjustmentForm({ productId: "", warehouseId: "", movementType: "in", quantity: "", notes: "" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const filteredMovements = (stockMovements ?? []).filter((m) => {
    if (movementFilterProduct !== "all" && m.productId !== movementFilterProduct) return false;
    if (movementFilterWarehouse !== "all" && m.warehouseId !== movementFilterWarehouse) return false;
    if (movementFilterType !== "all" && m.movementType !== movementFilterType) return false;
    if (movementFilterDateFrom && m.createdAt && new Date(m.createdAt) < new Date(movementFilterDateFrom)) return false;
    if (movementFilterDateTo && m.createdAt && new Date(m.createdAt) > new Date(movementFilterDateTo + "T23:59:59")) return false;
    return true;
  }).sort((a, b) => new Date(b.createdAt!).getTime() - new Date(a.createdAt!).getTime());

  const runningBalance = movementFilterProduct !== "all"
    ? filteredMovements.reduceRight((acc, m) => {
        const qty = m.movementType === "out" ? -Math.abs(m.quantity) : m.quantity;
        acc.push((acc.length > 0 ? acc[acc.length - 1] : 0) + qty);
        return acc;
      }, [] as number[]).reverse()
    : null;

  const productCount = products?.filter(p => p.type !== "service").length ?? 0;
  const serviceCount = products?.filter(p => p.type === "service").length ?? 0;

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
      toast({ title: editingProduct ? "Item updated" : "Item created" });
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
      toast({ title: "Item deleted" });
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

  const { data: deliveryChallans, isLoading: challansLoading } = useQuery<DeliveryChallan[]>({ queryKey: ["/api/delivery-challans"] });
  const { data: salesOrders } = useQuery<SalesOrder[]>({ queryKey: ["/api/sales-orders"] });
  const { data: suppliers } = useQuery<Supplier[]>({ queryKey: ["/api/suppliers"] });

  const [challanDialogOpen, setChallanDialogOpen] = useState(false);
  const [challanForm, setChallanForm] = useState({ orderId: "", sourceType: "warehouse", sourceId: "", vehicleNumber: "", driverName: "", notes: "" });
  const [challanItems, setChallanItems] = useState<Array<{ productId: string; description: string; quantity: number; unitPrice: number; maxQty: number }>>([]);
  const [challanStockAvailability, setChallanStockAvailability] = useState<Record<string, InventoryStock[]>>({});
  const [challanFilterStatus, setChallanFilterStatus] = useState("all");
  const [challanFilterSourceType, setChallanFilterSourceType] = useState("all");
  const [expandedChallanIds, setExpandedChallanIds] = useState<Set<string>>(new Set());
  const [challanItemsMap, setChallanItemsMap] = useState<Record<string, DeliveryChallanItem[]>>({});

  const CHALLAN_ELIGIBLE_STATUSES = ["confirmed", "procurement", "ready_to_ship", "dispatched", "shipped", "delivered", "installed", "completed"];

  const eligibleSalesOrders = (salesOrders ?? []).filter(o => CHALLAN_ELIGIBLE_STATUSES.includes(o.status));

  const filteredChallans = (deliveryChallans ?? []).filter((c) => {
    if (challanFilterStatus !== "all" && c.status !== challanFilterStatus) return false;
    if (challanFilterSourceType !== "all" && c.sourceType !== challanFilterSourceType) return false;
    return true;
  }).sort((a, b) => new Date(b.createdAt!).getTime() - new Date(a.createdAt!).getTime());

  const getOrderNumber = (orderId: string) => {
    const order = salesOrders?.find(o => o.id === orderId);
    return order?.orderNumber || orderId.slice(0, 8);
  };

  const getSourceName = (sourceType: string, sourceId: string) => {
    if (sourceType === "warehouse") {
      return warehouses?.find(w => w.id === sourceId)?.name || sourceId.slice(0, 8);
    }
    return suppliers?.find(s => s.id === sourceId)?.name || sourceId.slice(0, 8);
  };

  const getChallanStockForProduct = (productId: string, warehouseId: string): number => {
    const stocks = challanStockAvailability[productId] || [];
    const match = stocks.find(s => s.warehouseId === warehouseId);
    return match ? match.quantity : 0;
  };

  const toggleChallanExpanded = useCallback(async (challanId: string) => {
    setExpandedChallanIds(prev => {
      const next = new Set(prev);
      if (next.has(challanId)) {
        next.delete(challanId);
      } else {
        next.add(challanId);
      }
      return next;
    });
    if (!challanItemsMap[challanId]) {
      try {
        const headers = { Authorization: `Bearer ${localStorage.getItem("token")}` };
        const res = await fetch(`/api/delivery-challans/${challanId}/items`, { headers });
        const items = await res.json();
        setChallanItemsMap(prev => ({ ...prev, [challanId]: Array.isArray(items) ? items : [] }));
      } catch {
        setChallanItemsMap(prev => ({ ...prev, [challanId]: [] }));
      }
    }
  }, [challanItemsMap]);

  const openCreateChallan = () => {
    setChallanForm({ orderId: "", sourceType: "warehouse", sourceId: "", vehicleNumber: "", driverName: "", notes: "" });
    setChallanItems([]);
    setChallanStockAvailability({});
    setChallanDialogOpen(true);
  };

  const loadOrderItems = async (orderId: string) => {
    const headers = { Authorization: `Bearer ${localStorage.getItem("token")}` };
    try {
      const [itemsRes, remainingRes] = await Promise.all([
        fetch(`/api/sales-orders/${orderId}/items`, { headers }),
        fetch(`/api/sales-orders/${orderId}/remaining-quantities`, { headers }),
      ]);
      const items: SalesOrderItem[] = await itemsRes.json();
      const remaining: Record<string, number> = await remainingRes.json();
      const productItems = items.filter(it => it.itemType === "product" && it.productId);
      const stockMap: Record<string, InventoryStock[]> = {};
      await Promise.all(productItems.map(async (it) => {
        if (it.productId) {
          try {
            const stockRes = await fetch(`/api/inventory-stock/by-product/${it.productId}`, { headers });
            stockMap[it.productId] = await stockRes.json();
          } catch { stockMap[it.productId!] = []; }
        }
      }));
      setChallanStockAvailability(stockMap);
      setChallanItems(productItems.map(it => ({
        productId: it.productId || "",
        description: it.description || products?.find(p => p.id === it.productId)?.name || "",
        quantity: Math.min(it.quantity, remaining[it.productId || ""] ?? it.quantity),
        unitPrice: Number(it.unitPrice),
        maxQty: remaining[it.productId || ""] ?? it.quantity,
      })).filter(it => it.maxQty > 0));
    } catch {
      setChallanItems([]);
    }
  };

  const createChallanMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/delivery-challans", data);
      return res.json();
    },
    onSuccess: (challan: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/delivery-challans"] });
      queryClient.invalidateQueries({ queryKey: ["/api/inventory-stock"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stock-movements"] });
      toast({ title: "Challan created", description: `Challan ${challan.challanNumber} created` });
      setChallanDialogOpen(false);
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const dispatchChallanMutation = useMutation({
    mutationFn: async (challanId: string) => {
      const res = await apiRequest("POST", `/api/delivery-challans/${challanId}/dispatch`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/delivery-challans"] });
      queryClient.invalidateQueries({ queryKey: ["/api/inventory-stock"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stock-movements"] });
      queryClient.invalidateQueries({ queryKey: ["/api/inventory/reserved-stock"] });
      queryClient.invalidateQueries({ queryKey: ["/api/inventory/incoming-stock"] });
      toast({ title: "Challan dispatched" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const deliverChallanMutation = useMutation({
    mutationFn: async (challanId: string) => {
      const res = await apiRequest("POST", `/api/delivery-challans/${challanId}/deliver`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/delivery-challans"] });
      queryClient.invalidateQueries({ queryKey: ["/api/inventory/reserved-stock"] });
      toast({ title: "Challan delivered" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const { data: purchaseOrders } = useQuery<PurchaseOrder[]>({ queryKey: ["/api/purchase-orders"] });
  const { data: grns, isLoading: grnsLoading } = useQuery<GoodsReceiptNote[]>({ queryKey: ["/api/grns"] });

  const [grnDialogOpen, setGrnDialogOpen] = useState(false);
  const [grnForm, setGrnForm] = useState({ purchaseOrderId: "", warehouseId: "", deliveryCost: "", notes: "" });
  const [grnLineItems, setGrnLineItems] = useState<Array<{ productId: string; description: string; orderedQuantity: number; receivedQuantity: number; buyingPrice: number }>>([]);
  const [grnFilterStatus, setGrnFilterStatus] = useState("all");
  const [expandedGrnIds, setExpandedGrnIds] = useState<Set<string>>(new Set());
  const [grnItemsMap, setGrnItemsMap] = useState<Record<string, GoodsReceiptNoteItem[]>>({});

  const warehouseEligiblePOs = (purchaseOrders ?? []).filter(po =>
    po.deliveryType === "warehouse" && ["approved", "shipped"].includes(po.status)
  );

  const supplierMap = new Map((suppliers ?? []).map(s => [s.id, s]));
  const productMap = new Map((products ?? []).map(p => [p.id, p]));

  const filteredGrns = (grns ?? []).filter(g => {
    if (grnFilterStatus !== "all" && g.status !== grnFilterStatus) return false;
    return true;
  }).sort((a, b) => new Date(b.createdAt!).getTime() - new Date(a.createdAt!).getTime());

  const toggleGrnExpanded = useCallback(async (grnId: string) => {
    setExpandedGrnIds(prev => {
      const next = new Set(prev);
      if (next.has(grnId)) next.delete(grnId);
      else next.add(grnId);
      return next;
    });
    if (!grnItemsMap[grnId]) {
      try {
        const headers = { Authorization: `Bearer ${localStorage.getItem("token")}` };
        const res = await fetch(`/api/grns/${grnId}/items`, { headers });
        const items = await res.json();
        setGrnItemsMap(prev => ({ ...prev, [grnId]: Array.isArray(items) ? items : [] }));
      } catch {
        setGrnItemsMap(prev => ({ ...prev, [grnId]: [] }));
      }
    }
  }, [grnItemsMap]);

  const loadPOItemsForGRN = async (poId: string) => {
    const headers = { Authorization: `Bearer ${localStorage.getItem("token")}` };
    try {
      const res = await fetch(`/api/purchase-orders/${poId}/items`, { headers });
      const items: PurchaseOrderItem[] = await res.json();
      setGrnLineItems(items.filter(it => it.productId).map(it => ({
        productId: it.productId || "",
        description: it.description || productMap.get(it.productId || "")?.name || "",
        orderedQuantity: it.quantity,
        receivedQuantity: it.quantity,
        buyingPrice: Number(it.unitCost) || 0,
      })));
    } catch {
      setGrnLineItems([]);
    }
  };

  const openCreateGrn = () => {
    setGrnForm({ purchaseOrderId: "", warehouseId: "", deliveryCost: "", notes: "" });
    setGrnLineItems([]);
    setGrnDialogOpen(true);
  };

  const grnMutation = useMutation({
    mutationFn: async (data: any) => {
      const { lineItems, ...grnData } = data;
      const itemTotal = lineItems.reduce((sum: number, it: any) => sum + (it.receivedQuantity * it.buyingPrice), 0);
      const deliveryCostNum = Number(grnData.deliveryCost) || 0;
      const totalAmount = itemTotal + deliveryCostNum;
      const payload = {
        ...grnData,
        deliveryCost: deliveryCostNum > 0 ? String(deliveryCostNum) : null,
        totalAmount: String(totalAmount),
      };
      const res = await apiRequest("POST", "/api/grns", payload);
      const grn = await res.json();
      if (lineItems.length > 0) {
        await apiRequest("POST", `/api/grns/${grn.id}/items`, {
          items: lineItems.map((it: any) => ({
            productId: it.productId,
            description: it.description,
            orderedQuantity: it.orderedQuantity,
            receivedQuantity: it.receivedQuantity,
            buyingPrice: String(it.buyingPrice),
          })),
        });
      }
      return grn;
    },
    onSuccess: (grn: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/grns"] });
      toast({ title: "GRN created", description: `GRN ${grn.grnNumber} created as draft` });
      setGrnDialogOpen(false);
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const confirmGrnMutation = useMutation({
    mutationFn: async (grnId: string) => {
      const res = await apiRequest("POST", `/api/grns/${grnId}/confirm`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/grns"] });
      queryClient.invalidateQueries({ queryKey: ["/api/purchase-orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/inventory-stock"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stock-movements"] });
      queryClient.invalidateQueries({ queryKey: ["/api/inventory/reserved-stock"] });
      queryClient.invalidateQueries({ queryKey: ["/api/inventory/incoming-stock"] });
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      toast({ title: "GRN confirmed", description: "Goods received and inventory updated" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const deleteGrnMutation = useMutation({
    mutationFn: async (grnId: string) => {
      await apiRequest("DELETE", `/api/grns/${grnId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/grns"] });
      toast({ title: "GRN deleted" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const isService = productForm.type === "service";

  const openNewProduct = () => {
    setEditingProduct(null);
    setProductForm({ name: "", sku: "", category: "Solar Panels", description: "", costPrice: "", brand: "", unit: "pcs", minStockLevel: "10", type: "product" });
    setProductDialogOpen(true);
  };

  const openNewService = () => {
    setEditingProduct(null);
    setProductForm({ name: "", sku: "", category: "Installation", description: "", costPrice: "", brand: "", unit: "service", minStockLevel: "0", type: "service" });
    setProductDialogOpen(true);
  };

  const openEditProduct = (p: Product) => {
    setEditingProduct(p);
    setProductForm({
      name: p.name,
      sku: p.sku,
      category: p.category,
      description: p.description || "",
      costPrice: p.costPrice ? String(p.costPrice) : "",
      brand: p.brand || "",
      unit: p.unit,
      minStockLevel: String(p.minStockLevel),
      type: p.type || "product",
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
    const data: any = { ...productForm, minStockLevel: Number(productForm.minStockLevel) };
    if (isService && !data.sku) {
      data.sku = `SVC-${Date.now().toString(36).toUpperCase()}`;
    }
    if (!editingProduct) {
      data.unitPrice = data.costPrice || "0";
    } else {
      if (!data.unitPrice) {
        data.unitPrice = editingProduct.unitPrice || data.costPrice || "0";
      }
    }
    productMutation.mutate(data);
  };

  return (
    <div className="p-6 space-y-6 overflow-auto h-full">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Inventory</h1>
          <p className="text-muted-foreground text-sm mt-1">Manage products, services, stock, and warehouses</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" data-testid="button-add-service" onClick={openNewService}>
            <Wrench className="w-4 h-4 mr-2" />
            Add Service
          </Button>
          <Button data-testid="button-add-product" onClick={openNewProduct}>
            <Plus className="w-4 h-4 mr-2" />
            Add Product
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-5 flex items-center gap-4">
            <div className="w-10 h-10 rounded-md bg-blue-50 dark:bg-blue-950/30 flex items-center justify-center">
              <Package className="w-5 h-5 text-blue-500" />
            </div>
            <div>
              <p className="text-2xl font-bold">{productCount}</p>
              <p className="text-xs text-muted-foreground">Products</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5 flex items-center gap-4">
            <div className="w-10 h-10 rounded-md bg-orange-50 dark:bg-orange-950/30 flex items-center justify-center">
              <Wrench className="w-5 h-5 text-orange-500" />
            </div>
            <div>
              <p className="text-2xl font-bold">{serviceCount}</p>
              <p className="text-xs text-muted-foreground">Services</p>
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
              <p className="text-2xl font-bold" data-testid="text-low-stock-count">{lowStockProducts.length}</p>
              <p className="text-xs text-muted-foreground">Low Stock Alerts</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="products" className="space-y-4">
        <TabsList>
          <TabsTrigger value="products" data-testid="tab-products">Products & Services</TabsTrigger>
          <TabsTrigger value="warehouses" data-testid="tab-warehouses">Warehouses</TabsTrigger>
          <TabsTrigger value="movements" data-testid="tab-movements">Stock Movements</TabsTrigger>
          <TabsTrigger value="challans" data-testid="tab-challans">
            Challans
            {(deliveryChallans?.filter(c => c.status === "draft").length ?? 0) > 0 && (
              <span className="ml-1.5 inline-flex items-center justify-center w-5 h-5 text-[10px] font-bold rounded-full bg-blue-500 text-white" data-testid="badge-draft-challans-count">
                {deliveryChallans?.filter(c => c.status === "draft").length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="grn" data-testid="tab-grn">GRN</TabsTrigger>
        </TabsList>

        <TabsContent value="products" className="space-y-4">
          <div className="flex items-center gap-2">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Search products & services..." className="pl-9" data-testid="input-search-products" />
            </div>
          </div>
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="w-8 p-3"></th>
                      <th className="text-left p-3 font-medium text-muted-foreground">Type</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">Name</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">SKU</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">Brand</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">Category</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">Unit</th>
                      <th className="text-right p-3 font-medium text-muted-foreground">Cost Price</th>
                      <th className="text-right p-3 font-medium text-muted-foreground">Total Stock</th>
                      <th className="text-right p-3 font-medium text-muted-foreground">Reserved</th>
                      <th className="text-right p-3 font-medium text-muted-foreground">Available</th>
                      <th className="text-right p-3 font-medium text-muted-foreground">Incoming</th>
                      <th className="text-right p-3 font-medium text-muted-foreground">Min Stock</th>
                      <th className="text-right p-3 font-medium text-muted-foreground">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {productsLoading ? (
                      Array.from({ length: 3 }).map((_, i) => (
                        <tr key={i} className="border-b">
                          {Array.from({ length: 14 }).map((_, j) => (
                            <td key={j} className="p-3"><Skeleton className="h-4 w-20" /></td>
                          ))}
                        </tr>
                      ))
                    ) : products && products.length > 0 ? (
                      products.map((product) => {
                        const isProduct = product.type !== "service";
                        const totalStock = isProduct ? getProductTotalStock(product.id) : null;
                        const reservedInfo = isProduct ? reservedStockData?.[product.id] : null;
                        const reservedStock = reservedInfo?.total ?? 0;
                        const availableStock = isProduct && totalStock !== null ? Math.max(0, totalStock - reservedStock) : null;
                        const incomingInfo = isProduct ? incomingStockData?.[product.id] : null;
                        const incomingStock = incomingInfo?.total ?? 0;
                        const isLowStock = isProduct && availableStock !== null && availableStock < (product.minStockLevel ?? 0);
                        const isExpanded = expandedProductIds.has(product.id);
                        const isReservedExpanded = expandedReservedIds.has(product.id);
                        const isIncomingExpanded = expandedIncomingIds.has(product.id);
                        const warehouseBreakdown = isExpanded && isProduct ? getProductStockByWarehouse(product.id) : [];

                        return (
                          <Fragment key={product.id}>
                            <tr className={`border-b last:border-0 ${isLowStock ? "bg-red-50/50 dark:bg-red-950/10" : ""}`} data-testid={`row-product-${product.id}`}>
                              <td className="p-3">
                                {isProduct ? (
                                  <button
                                    onClick={() => toggleProductExpanded(product.id)}
                                    className="text-muted-foreground"
                                    data-testid={`button-expand-product-${product.id}`}
                                  >
                                    {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                                  </button>
                                ) : null}
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
                              <td className="p-3 font-medium">{product.name}</td>
                              <td className="p-3 text-muted-foreground">{product.type === "service" ? "—" : product.sku}</td>
                              <td className="p-3 text-muted-foreground" data-testid={`text-product-brand-${product.id}`}>{product.brand || "—"}</td>
                              <td className="p-3">
                                <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300">
                                  {product.category}
                                </span>
                              </td>
                              <td className="p-3 text-muted-foreground">{product.unit}</td>
                              <td className="p-3 text-right font-medium" data-testid={`text-product-cost-price-${product.id}`}>{product.costPrice ? `₹${Number(product.costPrice).toLocaleString()}` : "—"}</td>
                              <td className="p-3 text-right" data-testid={`text-product-stock-${product.id}`}>
                                {isProduct ? (
                                  <span className="font-medium">{totalStock}</span>
                                ) : "—"}
                              </td>
                              <td className="p-3 text-right" data-testid={`text-product-reserved-${product.id}`}>
                                {isProduct ? (
                                  reservedStock > 0 ? (
                                    <button
                                      onClick={() => toggleReservedExpanded(product.id)}
                                      className="inline-flex items-center gap-1 font-medium text-amber-600 dark:text-amber-400 hover:underline"
                                      data-testid={`button-expand-reserved-${product.id}`}
                                    >
                                      {reservedStock}
                                      {isReservedExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                                    </button>
                                  ) : (
                                    <span className="text-muted-foreground">0</span>
                                  )
                                ) : "—"}
                              </td>
                              <td className="p-3 text-right" data-testid={`text-product-available-${product.id}`}>
                                {isProduct && availableStock !== null ? (
                                  <span className={`font-medium ${availableStock <= 0 ? "text-red-600 dark:text-red-400" : isLowStock ? "text-amber-600 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400"}`}>
                                    {availableStock}
                                    {isLowStock && (
                                      <AlertTriangle className="w-3.5 h-3.5 inline-block ml-1" />
                                    )}
                                  </span>
                                ) : "—"}
                              </td>
                              <td className="p-3 text-right" data-testid={`text-product-incoming-${product.id}`}>
                                {isProduct ? (
                                  incomingStock > 0 ? (
                                    <button
                                      onClick={() => toggleIncomingExpanded(product.id)}
                                      className="inline-flex items-center gap-1 font-medium text-blue-600 dark:text-blue-400 hover:underline"
                                      data-testid={`button-expand-incoming-${product.id}`}
                                    >
                                      {incomingStock}
                                      {isIncomingExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                                    </button>
                                  ) : (
                                    <span className="text-muted-foreground">0</span>
                                  )
                                ) : "—"}
                              </td>
                              <td className="p-3 text-right text-muted-foreground">{product.type === "service" ? "—" : product.minStockLevel}</td>
                              <td className="p-3 text-right">
                                <div className="flex items-center justify-end gap-1">
                                  <Button size="icon" variant="ghost" data-testid={`button-edit-product-${product.id}`} onClick={() => openEditProduct(product)}>
                                    <Pencil className="w-4 h-4" />
                                  </Button>
                                  <Button size="icon" variant="ghost" data-testid={`button-delete-product-${product.id}`} onClick={() => { if (confirm("Delete this item?")) deleteProductMutation.mutate(product.id); }}>
                                    <Trash2 className="w-4 h-4" />
                                  </Button>
                                </div>
                              </td>
                            </tr>
                            {isExpanded && isProduct && (
                              <tr key={`${product.id}-stock`} className="border-b last:border-0">
                                <td colSpan={14} className="p-0">
                                  <div className="bg-muted/30 px-6 py-3 ml-8">
                                    <p className="text-xs font-medium text-muted-foreground mb-2">Stock by Warehouse</p>
                                    {warehouseBreakdown.length > 0 ? (
                                      <div className="space-y-1">
                                        {warehouseBreakdown.map((entry) => (
                                          <div key={entry.warehouseId} className="flex items-center justify-between gap-4 text-sm" data-testid={`text-stock-warehouse-${product.id}-${entry.warehouseId}`}>
                                            <span className="flex items-center gap-2">
                                              <Warehouse className="w-3.5 h-3.5 text-muted-foreground" />
                                              {entry.warehouseName}
                                            </span>
                                            <span className="font-medium">{entry.quantity} {product.unit}</span>
                                          </div>
                                        ))}
                                      </div>
                                    ) : (
                                      <p className="text-sm text-muted-foreground">No stock in any warehouse</p>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            )}
                            {isReservedExpanded && isProduct && reservedInfo && reservedInfo.orders.length > 0 && (
                              <tr key={`${product.id}-reserved`} className="border-b last:border-0">
                                <td colSpan={14} className="p-0">
                                  <div className="bg-amber-50/50 dark:bg-amber-950/10 px-6 py-3 ml-8">
                                    <p className="text-xs font-medium text-amber-700 dark:text-amber-400 mb-2">Reserved for Sales Orders</p>
                                    <div className="space-y-1">
                                      {reservedInfo.orders.map((entry) => (
                                        <div key={entry.orderId} className="flex items-center gap-4 text-sm" data-testid={`text-reserved-order-${product.id}-${entry.orderId}`}>
                                          <span className="flex items-center gap-2 min-w-[140px]">
                                            <ShoppingCart className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                                            <span className="font-medium">{entry.orderNumber}</span>
                                          </span>
                                          <span className="font-medium text-amber-700 dark:text-amber-400 min-w-[80px]">{entry.quantity} {product.unit}</span>
                                          <span className="text-muted-foreground text-xs min-w-[120px]">
                                            {entry.expectedDeliveryDate ? `Delivery: ${new Date(entry.expectedDeliveryDate).toLocaleDateString()}` : "No delivery date"}
                                          </span>
                                          <Badge variant="outline" className="text-xs capitalize">
                                            {entry.reservationStatus.replace(/_/g, " ")}
                                          </Badge>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                </td>
                              </tr>
                            )}
                            {isIncomingExpanded && isProduct && incomingInfo && incomingInfo.orders.length > 0 && (
                              <tr key={`${product.id}-incoming`} className="border-b last:border-0">
                                <td colSpan={14} className="p-0">
                                  <div className="bg-blue-50/50 dark:bg-blue-950/10 px-6 py-3 ml-8">
                                    <p className="text-xs font-medium text-blue-700 dark:text-blue-400 mb-2">Incoming from Purchase Orders</p>
                                    <div className="space-y-1">
                                      {incomingInfo.orders.map((entry) => (
                                        <div key={entry.poId} className="flex items-center gap-4 text-sm" data-testid={`text-incoming-po-${product.id}-${entry.poId}`}>
                                          <span className="flex items-center gap-2 min-w-[140px]">
                                            <Truck className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                                            <span className="font-medium">{entry.poNumber}</span>
                                          </span>
                                          <span className="font-medium text-blue-700 dark:text-blue-400 min-w-[80px]">{entry.quantity} {product.unit}</span>
                                          <span className="text-muted-foreground text-xs">
                                            {entry.expectedDate ? `Expected: ${new Date(entry.expectedDate).toLocaleDateString()}` : "No ETA"}
                                          </span>
                                        </div>
                                      ))}
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
                        <td colSpan={14} className="p-8 text-center text-muted-foreground">
                          No products or services found. Add your first item.
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

        <TabsContent value="movements" className="space-y-4">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-2 flex-wrap">
              <Select value={movementFilterProduct} onValueChange={setMovementFilterProduct}>
                <SelectTrigger className="w-[180px]" data-testid="select-filter-product">
                  <SelectValue placeholder="All Products" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Products</SelectItem>
                  {(products ?? []).filter(p => p.type !== "service").map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={movementFilterWarehouse} onValueChange={setMovementFilterWarehouse}>
                <SelectTrigger className="w-[180px]" data-testid="select-filter-warehouse">
                  <SelectValue placeholder="All Warehouses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Warehouses</SelectItem>
                  {(warehouses ?? []).map((w) => (
                    <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={movementFilterType} onValueChange={setMovementFilterType}>
                <SelectTrigger className="w-[160px]" data-testid="select-filter-type">
                  <SelectValue placeholder="All Types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="in">Stock In</SelectItem>
                  <SelectItem value="out">Stock Out</SelectItem>
                  <SelectItem value="adjustment">Adjustment</SelectItem>
                </SelectContent>
              </Select>
              <div className="flex items-center gap-1">
                <Input type="date" className="w-[140px]" value={movementFilterDateFrom} onChange={(e) => setMovementFilterDateFrom(e.target.value)} data-testid="input-filter-date-from" />
                <span className="text-muted-foreground text-xs">to</span>
                <Input type="date" className="w-[140px]" value={movementFilterDateTo} onChange={(e) => setMovementFilterDateTo(e.target.value)} data-testid="input-filter-date-to" />
              </div>
            </div>
            <Button data-testid="button-manual-adjustment" onClick={() => setAdjustmentDialogOpen(true)}>
              <RefreshCw className="w-4 h-4 mr-2" />
              Manual Adjustment
            </Button>
          </div>

          {movementFilterProduct !== "all" && runningBalance && (
            <Card>
              <CardContent className="p-4 flex items-center gap-4">
                <div className="w-10 h-10 rounded-md bg-blue-50 dark:bg-blue-950/30 flex items-center justify-center">
                  <Package className="w-5 h-5 text-blue-500" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Running Balance for {products?.find(p => p.id === movementFilterProduct)?.name}</p>
                  <p className="text-2xl font-bold" data-testid="text-running-balance">{runningBalance[0] ?? 0} units</p>
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left p-3 font-medium text-muted-foreground">Date</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">Product</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">Warehouse</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">Type</th>
                      <th className="text-right p-3 font-medium text-muted-foreground">Quantity</th>
                      {runningBalance && <th className="text-right p-3 font-medium text-muted-foreground">Balance</th>}
                      <th className="text-left p-3 font-medium text-muted-foreground">Reference</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">Notes</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">Created By</th>
                    </tr>
                  </thead>
                  <tbody>
                    {movementsLoading ? (
                      Array.from({ length: 5 }).map((_, i) => (
                        <tr key={i} className="border-b">
                          {Array.from({ length: runningBalance ? 9 : 8 }).map((_, j) => (
                            <td key={j} className="p-3"><Skeleton className="h-4 w-20" /></td>
                          ))}
                        </tr>
                      ))
                    ) : filteredMovements.length > 0 ? (
                      filteredMovements.map((m, idx) => {
                        const product = products?.find(p => p.id === m.productId);
                        const warehouse = warehouses?.find(w => w.id === m.warehouseId);
                        const displayQty = m.movementType === "out" ? -Math.abs(m.quantity) : m.quantity;
                        const refLabel = m.referenceType === "purchase_order" ? `PO` :
                                         m.referenceType === "sales_order" ? `SO` :
                                         m.referenceType === "challan" ? `DC` : "Manual";

                        return (
                          <tr key={m.id} className="border-b last:border-0" data-testid={`row-movement-${m.id}`}>
                            <td className="p-3 text-muted-foreground whitespace-nowrap">
                              {m.createdAt ? new Date(m.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—"}
                            </td>
                            <td className="p-3 font-medium" data-testid={`text-movement-product-${m.id}`}>{product?.name ?? m.productId}</td>
                            <td className="p-3 text-muted-foreground" data-testid={`text-movement-warehouse-${m.id}`}>{warehouse?.name ?? (m.warehouseId ? m.warehouseId : "—")}</td>
                            <td className="p-3">
                              {m.movementType === "in" && (
                                <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-800" data-testid={`badge-type-${m.id}`}>
                                  <ArrowDownCircle className="w-3 h-3 mr-1" /> IN
                                </Badge>
                              )}
                              {m.movementType === "out" && (
                                <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200 dark:bg-red-950/30 dark:text-red-400 dark:border-red-800" data-testid={`badge-type-${m.id}`}>
                                  <ArrowUpCircle className="w-3 h-3 mr-1" /> OUT
                                </Badge>
                              )}
                              {m.movementType === "adjustment" && (
                                <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-800" data-testid={`badge-type-${m.id}`}>
                                  <RefreshCw className="w-3 h-3 mr-1" /> ADJ
                                </Badge>
                              )}
                            </td>
                            <td className={`p-3 text-right font-medium ${m.movementType === "in" ? "text-emerald-600 dark:text-emerald-400" : m.movementType === "out" ? "text-red-600 dark:text-red-400" : "text-amber-600 dark:text-amber-400"}`} data-testid={`text-movement-qty-${m.id}`}>
                              {displayQty > 0 ? `+${displayQty}` : displayQty}
                            </td>
                            {runningBalance && (
                              <td className="p-3 text-right font-medium" data-testid={`text-movement-balance-${m.id}`}>{runningBalance[idx]}</td>
                            )}
                            <td className="p-3 text-muted-foreground" data-testid={`text-movement-ref-${m.id}`}>
                              {m.referenceId ? `${refLabel} #${m.referenceId.slice(0, 8)}` : refLabel}
                            </td>
                            <td className="p-3 text-muted-foreground max-w-[200px] truncate" data-testid={`text-movement-notes-${m.id}`}>{m.notes || "—"}</td>
                            <td className="p-3 text-muted-foreground" data-testid={`text-movement-creator-${m.id}`}>{m.createdBy?.slice(0, 8) || "—"}</td>
                          </tr>
                        );
                      })
                    ) : (
                      <tr>
                        <td colSpan={runningBalance ? 9 : 8} className="p-8 text-center text-muted-foreground">
                          <ArrowUpDown className="w-10 h-10 mx-auto mb-2 text-muted-foreground/40" />
                          <p className="font-medium">No stock movements found</p>
                          <p className="text-sm mt-1">Stock movements will appear here when inventory is received or dispatched.</p>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="challans" className="space-y-4">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-2 flex-wrap">
              <Select value={challanFilterStatus} onValueChange={setChallanFilterStatus}>
                <SelectTrigger className="w-[160px]" data-testid="select-challan-filter-status">
                  <SelectValue placeholder="All Statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="dispatched">Dispatched</SelectItem>
                  <SelectItem value="delivered">Delivered</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
              <Select value={challanFilterSourceType} onValueChange={setChallanFilterSourceType}>
                <SelectTrigger className="w-[180px]" data-testid="select-challan-filter-source-type">
                  <SelectValue placeholder="All Sources" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Sources</SelectItem>
                  <SelectItem value="warehouse">Warehouse</SelectItem>
                  <SelectItem value="supplier">Supplier</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button data-testid="button-create-challan" onClick={openCreateChallan}>
              <Plus className="w-4 h-4 mr-2" />
              Create Challan
            </Button>
          </div>

          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="w-8 p-3"></th>
                      <th className="text-left p-3 font-medium text-muted-foreground">Challan #</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">Order #</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">Source Type</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">Source Name</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">Status</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">Dispatch Date</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">Delivery Date</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">Vehicle</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">Driver</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">Created At</th>
                      <th className="text-right p-3 font-medium text-muted-foreground">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {challansLoading ? (
                      Array.from({ length: 3 }).map((_, i) => (
                        <tr key={i} className="border-b">
                          {Array.from({ length: 12 }).map((_, j) => (
                            <td key={j} className="p-3"><Skeleton className="h-4 w-20" /></td>
                          ))}
                        </tr>
                      ))
                    ) : filteredChallans.length > 0 ? (
                      filteredChallans.map((challan) => {
                        const isExpanded = expandedChallanIds.has(challan.id);
                        const items = challanItemsMap[challan.id] || [];
                        return (
                          <Fragment key={challan.id}>
                            <tr className="border-b last:border-0" data-testid={`row-challan-${challan.id}`}>
                              <td className="p-3">
                                <button
                                  onClick={() => toggleChallanExpanded(challan.id)}
                                  className="text-muted-foreground"
                                  data-testid={`button-expand-challan-${challan.id}`}
                                >
                                  {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                                </button>
                              </td>
                              <td className="p-3 font-medium" data-testid={`text-challan-number-${challan.id}`}>{challan.challanNumber}</td>
                              <td className="p-3 text-muted-foreground" data-testid={`text-challan-order-${challan.id}`}>{getOrderNumber(challan.orderId)}</td>
                              <td className="p-3">
                                <Badge variant="outline" className="text-xs" data-testid={`badge-challan-source-type-${challan.id}`}>
                                  {challan.sourceType === "warehouse" ? "Warehouse" : "Supplier"}
                                </Badge>
                              </td>
                              <td className="p-3 text-muted-foreground" data-testid={`text-challan-source-${challan.id}`}>{getSourceName(challan.sourceType, challan.sourceId)}</td>
                              <td className="p-3" data-testid={`badge-challan-status-${challan.id}`}>
                                {challan.status === "draft" && (
                                  <Badge variant="outline" className="bg-gray-100 text-gray-700 border-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700">Draft</Badge>
                                )}
                                {challan.status === "dispatched" && (
                                  <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/30 dark:text-blue-400 dark:border-blue-800">Dispatched</Badge>
                                )}
                                {challan.status === "delivered" && (
                                  <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-800">Delivered</Badge>
                                )}
                                {challan.status === "cancelled" && (
                                  <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200 dark:bg-red-950/30 dark:text-red-400 dark:border-red-800">Cancelled</Badge>
                                )}
                              </td>
                              <td className="p-3 text-muted-foreground whitespace-nowrap">{challan.dispatchDate ? new Date(challan.dispatchDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—"}</td>
                              <td className="p-3 text-muted-foreground whitespace-nowrap">{challan.deliveryDate ? new Date(challan.deliveryDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—"}</td>
                              <td className="p-3 text-muted-foreground">{challan.vehicleNumber || "—"}</td>
                              <td className="p-3 text-muted-foreground">{challan.driverName || "—"}</td>
                              <td className="p-3 text-muted-foreground whitespace-nowrap">{challan.createdAt ? new Date(challan.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—"}</td>
                              <td className="p-3 text-right">
                                <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                                  {challan.status === "draft" && (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      data-testid={`button-dispatch-challan-${challan.id}`}
                                      disabled={dispatchChallanMutation.isPending}
                                      onClick={() => { if (confirm("Dispatch this challan? Stock will be deducted if source is a warehouse.")) dispatchChallanMutation.mutate(challan.id); }}
                                    >
                                      <Send className="w-3 h-3 mr-1" /> Dispatch
                                    </Button>
                                  )}
                                  {challan.status === "dispatched" && (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      data-testid={`button-deliver-challan-${challan.id}`}
                                      disabled={deliverChallanMutation.isPending}
                                      onClick={() => deliverChallanMutation.mutate(challan.id)}
                                    >
                                      <CheckCircle className="w-3 h-3 mr-1" /> Mark Delivered
                                    </Button>
                                  )}
                                </div>
                              </td>
                            </tr>
                            {isExpanded && (
                              <tr key={`${challan.id}-items`} className="border-b last:border-0">
                                <td colSpan={12} className="p-0">
                                  <div className="bg-muted/30 px-6 py-3 ml-8">
                                    {(challan as any).deliveryAddress && (
                                      <div className="mb-3 flex items-start gap-2 p-2 bg-blue-50 dark:bg-blue-950/20 rounded-md" data-testid={`text-challan-delivery-address-${challan.id}`}>
                                        <MapPin className="w-4 h-4 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
                                        <div>
                                          <span className="text-xs font-medium text-blue-700 dark:text-blue-300">Delivery Address:</span>
                                          <p className="text-xs text-blue-600 dark:text-blue-400 mt-0.5">{(challan as any).deliveryAddress}</p>
                                        </div>
                                      </div>
                                    )}
                                    <p className="text-xs font-medium text-muted-foreground mb-2">Line Items</p>
                                    {items.length > 0 ? (
                                      <div className="space-y-1">
                                        {items.map((item) => {
                                          const product = products?.find(p => p.id === item.productId);
                                          return (
                                            <div key={item.id} className="flex items-center justify-between gap-4 text-sm" data-testid={`text-challan-item-${item.id}`}>
                                              <span className="flex items-center gap-2">
                                                <Package className="w-3.5 h-3.5 text-muted-foreground" />
                                                <span className="font-medium">{product?.name || item.productId}</span>
                                                {item.description && <span className="text-muted-foreground text-xs">({item.description})</span>}
                                              </span>
                                              <span className="flex items-center gap-4 text-muted-foreground">
                                                <span>Qty: {item.quantity}</span>
                                                {item.unitPrice && <span>@ ₹{Number(item.unitPrice).toLocaleString()}</span>}
                                              </span>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    ) : (
                                      <p className="text-sm text-muted-foreground">Loading items...</p>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            )}
                          </Fragment>
                        );
                      })
                    ) : (
                      <tr>
                        <td colSpan={12} className="p-8 text-center text-muted-foreground">
                          <Truck className="w-10 h-10 mx-auto mb-2 text-muted-foreground/40" />
                          <p className="font-medium">No delivery challans found</p>
                          <p className="text-sm mt-1">Create a challan to dispatch items for a sales order.</p>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="grn" className="space-y-4">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-2 flex-wrap">
              <Select value={grnFilterStatus} onValueChange={setGrnFilterStatus}>
                <SelectTrigger className="w-[160px]" data-testid="select-grn-filter-status">
                  <SelectValue placeholder="All Statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="confirmed">Confirmed</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button data-testid="button-create-grn" onClick={openCreateGrn}>
              <Plus className="w-4 h-4 mr-2" />
              Create GRN
            </Button>
          </div>

          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="w-8 p-3"></th>
                      <th className="text-left p-3 font-medium text-muted-foreground">GRN #</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">PO #</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">Supplier</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">Warehouse</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">Status</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">Received Date</th>
                      <th className="text-right p-3 font-medium text-muted-foreground">Delivery Cost</th>
                      <th className="text-right p-3 font-medium text-muted-foreground">Total Amount</th>
                      <th className="text-right p-3 font-medium text-muted-foreground">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {grnsLoading ? (
                      Array.from({ length: 3 }).map((_, i) => (
                        <tr key={i} className="border-b">
                          {Array.from({ length: 10 }).map((_, j) => (
                            <td key={j} className="p-3"><Skeleton className="h-4 w-20" /></td>
                          ))}
                        </tr>
                      ))
                    ) : filteredGrns.length > 0 ? (
                      filteredGrns.map((grn) => {
                        const isExpanded = expandedGrnIds.has(grn.id);
                        const items = grnItemsMap[grn.id] || [];
                        const po = purchaseOrders?.find(p => p.id === grn.purchaseOrderId);
                        const supplier = po ? supplierMap.get(po.supplierId) : undefined;
                        const wh = warehouses?.find(w => w.id === grn.warehouseId);
                        return (
                          <Fragment key={grn.id}>
                            <tr className="border-b last:border-0" data-testid={`row-grn-${grn.id}`}>
                              <td className="p-3">
                                <button onClick={() => toggleGrnExpanded(grn.id)} className="text-muted-foreground" data-testid={`button-expand-grn-${grn.id}`}>
                                  {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                                </button>
                              </td>
                              <td className="p-3 font-medium" data-testid={`text-grn-number-${grn.id}`}>{grn.grnNumber}</td>
                              <td className="p-3 text-muted-foreground" data-testid={`text-grn-po-${grn.id}`}>{po?.poNumber || "—"}</td>
                              <td className="p-3 text-muted-foreground">{supplier?.name || "—"}</td>
                              <td className="p-3 text-muted-foreground">{wh?.name || "—"}</td>
                              <td className="p-3" data-testid={`badge-grn-status-${grn.id}`}>
                                {grn.status === "draft" && (
                                  <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-800">Draft</Badge>
                                )}
                                {grn.status === "confirmed" && (
                                  <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-800">Confirmed</Badge>
                                )}
                              </td>
                              <td className="p-3 text-muted-foreground whitespace-nowrap">{grn.receivedDate ? new Date(grn.receivedDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—"}</td>
                              <td className="p-3 text-right text-muted-foreground">{grn.deliveryCost ? `₹${Number(grn.deliveryCost).toLocaleString("en-IN")}` : "—"}</td>
                              <td className="p-3 text-right font-medium" data-testid={`text-grn-total-${grn.id}`}>₹{Number(grn.totalAmount).toLocaleString("en-IN")}</td>
                              <td className="p-3 text-right">
                                <div className="flex items-center justify-end gap-1">
                                  {grn.status === "draft" && (
                                    <>
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        data-testid={`button-confirm-grn-${grn.id}`}
                                        disabled={confirmGrnMutation.isPending}
                                        onClick={() => { if (confirm("Confirm this GRN? Stock will be added to the warehouse.")) confirmGrnMutation.mutate(grn.id); }}
                                      >
                                        <CheckCircle className="w-3 h-3 mr-1" /> Confirm
                                      </Button>
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        data-testid={`button-delete-grn-${grn.id}`}
                                        disabled={deleteGrnMutation.isPending}
                                        onClick={() => { if (confirm("Delete this draft GRN?")) deleteGrnMutation.mutate(grn.id); }}
                                      >
                                        <Trash2 className="w-3 h-3" />
                                      </Button>
                                    </>
                                  )}
                                </div>
                              </td>
                            </tr>
                            {isExpanded && (
                              <tr key={`${grn.id}-items`} className="border-b last:border-0">
                                <td colSpan={10} className="p-0">
                                  <div className="bg-muted/30 px-6 py-3 ml-8">
                                    <p className="text-xs font-medium text-muted-foreground mb-2">Received Items</p>
                                    {items.length > 0 ? (
                                      <table className="w-full text-xs">
                                        <thead>
                                          <tr className="border-b">
                                            <th className="text-left py-1 font-medium text-muted-foreground">Product</th>
                                            <th className="text-center py-1 font-medium text-muted-foreground">Ordered Qty</th>
                                            <th className="text-center py-1 font-medium text-muted-foreground">Received Qty</th>
                                            <th className="text-right py-1 font-medium text-muted-foreground">Buying Price</th>
                                            <th className="text-right py-1 font-medium text-muted-foreground">Total Cost</th>
                                          </tr>
                                        </thead>
                                        <tbody>
                                          {items.map(item => {
                                            const prod = productMap.get(item.productId);
                                            return (
                                              <tr key={item.id} className="border-b last:border-0" data-testid={`text-grn-item-${item.id}`}>
                                                <td className="py-1.5">{prod?.name || item.description || item.productId}</td>
                                                <td className="py-1.5 text-center">{item.orderedQuantity}</td>
                                                <td className="py-1.5 text-center font-medium">{item.receivedQuantity}</td>
                                                <td className="py-1.5 text-right">₹{Number(item.buyingPrice).toLocaleString("en-IN")}</td>
                                                <td className="py-1.5 text-right font-medium">₹{Number(item.totalCost).toLocaleString("en-IN")}</td>
                                              </tr>
                                            );
                                          })}
                                        </tbody>
                                      </table>
                                    ) : (
                                      <p className="text-sm text-muted-foreground">Loading items...</p>
                                    )}
                                    {grn.notes && <p className="text-xs text-muted-foreground mt-2">Notes: {grn.notes}</p>}
                                  </div>
                                </td>
                              </tr>
                            )}
                          </Fragment>
                        );
                      })
                    ) : (
                      <tr>
                        <td colSpan={10} className="p-8 text-center text-muted-foreground">
                          <FileText className="w-10 h-10 mx-auto mb-2 text-muted-foreground/40" />
                          <p className="font-medium">No Goods Receipt Notes found</p>
                          <p className="text-sm mt-1">Create a GRN to receive goods from a Purchase Order into a warehouse.</p>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={grnDialogOpen} onOpenChange={setGrnDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create Goods Receipt Note</DialogTitle>
            <DialogDescription>Receive goods from a Purchase Order into a warehouse</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Purchase Order</Label>
              <Select
                value={grnForm.purchaseOrderId}
                onValueChange={(v) => {
                  setGrnForm({ ...grnForm, purchaseOrderId: v });
                  loadPOItemsForGRN(v);
                }}
              >
                <SelectTrigger data-testid="select-grn-po">
                  <SelectValue placeholder="Select purchase order..." />
                </SelectTrigger>
                <SelectContent>
                  {warehouseEligiblePOs.map((po) => {
                    const supplier = supplierMap.get(po.supplierId);
                    return (
                      <SelectItem key={po.id} value={po.id}>
                        {po.poNumber} — {supplier?.name || "Unknown"} (₹{Number(po.totalAmount).toLocaleString("en-IN")})
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Receiving Warehouse</Label>
                <Select value={grnForm.warehouseId} onValueChange={(v) => setGrnForm({ ...grnForm, warehouseId: v })}>
                  <SelectTrigger data-testid="select-grn-warehouse">
                    <SelectValue placeholder="Select warehouse..." />
                  </SelectTrigger>
                  <SelectContent>
                    {(warehouses ?? []).map(w => (
                      <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="grnDeliveryCost">Delivery Cost (optional)</Label>
                <Input
                  id="grnDeliveryCost"
                  type="number"
                  min="0"
                  data-testid="input-grn-delivery-cost"
                  value={grnForm.deliveryCost}
                  onChange={(e) => setGrnForm({ ...grnForm, deliveryCost: e.target.value })}
                  placeholder="₹0"
                />
              </div>
            </div>

            {grnLineItems.length > 0 && (
              <div className="space-y-2">
                <Label>Line Items</Label>
                <div className="border rounded-md overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="text-left px-3 py-2 font-medium text-muted-foreground">Product</th>
                        <th className="text-center px-3 py-2 font-medium text-muted-foreground">Ordered</th>
                        <th className="text-center px-3 py-2 font-medium text-muted-foreground">Received</th>
                        <th className="text-right px-3 py-2 font-medium text-muted-foreground">Buying Price</th>
                        <th className="text-right px-3 py-2 font-medium text-muted-foreground">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {grnLineItems.map((item, idx) => {
                        const prod = productMap.get(item.productId);
                        return (
                          <tr key={idx} className="border-b last:border-0" data-testid={`row-grn-line-item-${idx}`}>
                            <td className="px-3 py-2">{prod?.name || item.description}</td>
                            <td className="px-3 py-2 text-center text-muted-foreground">{item.orderedQuantity}</td>
                            <td className="px-3 py-2 text-center">
                              <Input
                                type="number"
                                min="0"
                                max={item.orderedQuantity}
                                className="w-20 h-8 text-center mx-auto"
                                data-testid={`input-grn-received-qty-${idx}`}
                                value={item.receivedQuantity}
                                onChange={(e) => {
                                  const updated = [...grnLineItems];
                                  updated[idx] = { ...updated[idx], receivedQuantity: Math.min(Number(e.target.value) || 0, item.orderedQuantity) };
                                  setGrnLineItems(updated);
                                }}
                              />
                            </td>
                            <td className="px-3 py-2 text-right">
                              <Input
                                type="number"
                                min="0"
                                className="w-28 h-8 text-right ml-auto"
                                data-testid={`input-grn-buying-price-${idx}`}
                                value={item.buyingPrice}
                                onChange={(e) => {
                                  const updated = [...grnLineItems];
                                  updated[idx] = { ...updated[idx], buyingPrice: Number(e.target.value) || 0 };
                                  setGrnLineItems(updated);
                                }}
                              />
                            </td>
                            <td className="px-3 py-2 text-right font-medium">₹{(item.receivedQuantity * item.buyingPrice).toLocaleString("en-IN")}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="border-t">
                        <td colSpan={4} className="px-3 py-2 text-right font-medium text-muted-foreground">Items Total:</td>
                        <td className="px-3 py-2 text-right font-medium">
                          ₹{grnLineItems.reduce((sum, it) => sum + (it.receivedQuantity * it.buyingPrice), 0).toLocaleString("en-IN")}
                        </td>
                      </tr>
                      {Number(grnForm.deliveryCost) > 0 && (
                        <tr>
                          <td colSpan={4} className="px-3 py-1 text-right text-sm text-muted-foreground">+ Delivery Cost:</td>
                          <td className="px-3 py-1 text-right text-sm">₹{Number(grnForm.deliveryCost).toLocaleString("en-IN")}</td>
                        </tr>
                      )}
                      <tr className="bg-muted/30">
                        <td colSpan={4} className="px-3 py-2 text-right font-semibold">Grand Total:</td>
                        <td className="px-3 py-2 text-right font-semibold" data-testid="text-grn-grand-total">
                          ₹{(grnLineItems.reduce((sum, it) => sum + (it.receivedQuantity * it.buyingPrice), 0) + (Number(grnForm.deliveryCost) || 0)).toLocaleString("en-IN")}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="grnNotes">Notes</Label>
              <Textarea
                id="grnNotes"
                data-testid="input-grn-notes"
                value={grnForm.notes}
                onChange={(e) => setGrnForm({ ...grnForm, notes: e.target.value })}
                placeholder="Optional notes..."
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setGrnDialogOpen(false)}>Cancel</Button>
            <Button
              data-testid="button-submit-grn"
              disabled={!grnForm.purchaseOrderId || !grnForm.warehouseId || grnLineItems.length === 0 || grnMutation.isPending}
              onClick={() => grnMutation.mutate({ ...grnForm, lineItems: grnLineItems })}
            >
              {grnMutation.isPending ? "Creating..." : "Create GRN"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={challanDialogOpen} onOpenChange={setChallanDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create Delivery Challan</DialogTitle>
            <DialogDescription>Create a delivery challan linked to a sales order</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Sales Order</Label>
              <Select
                value={challanForm.orderId}
                onValueChange={(v) => {
                  setChallanForm({ ...challanForm, orderId: v });
                  loadOrderItems(v);
                }}
              >
                <SelectTrigger data-testid="select-challan-order">
                  <SelectValue placeholder="Select sales order..." />
                </SelectTrigger>
                <SelectContent>
                  {eligibleSalesOrders.map((o) => (
                    <SelectItem key={o.id} value={o.id}>{o.orderNumber} — ₹{Number(o.totalAmount).toLocaleString()} ({o.status})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Source Type</Label>
                <Select value={challanForm.sourceType} onValueChange={(v) => setChallanForm({ ...challanForm, sourceType: v, sourceId: "" })}>
                  <SelectTrigger data-testid="select-challan-source-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="warehouse">Warehouse</SelectItem>
                    <SelectItem value="supplier">Supplier (Direct Delivery)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{challanForm.sourceType === "warehouse" ? "Warehouse" : "Supplier"}</Label>
                <Select value={challanForm.sourceId} onValueChange={(v) => setChallanForm({ ...challanForm, sourceId: v })}>
                  <SelectTrigger data-testid="select-challan-source">
                    <SelectValue placeholder={`Select ${challanForm.sourceType}...`} />
                  </SelectTrigger>
                  <SelectContent>
                    {challanForm.sourceType === "warehouse"
                      ? (warehouses || []).map((w) => (
                        <SelectItem key={w.id} value={w.id}>{w.name}{w.location ? ` — ${w.location}` : ""}</SelectItem>
                      ))
                      : (suppliers || []).map((s) => (
                        <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                      ))
                    }
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Vehicle Number</Label>
                <Input data-testid="input-challan-vehicle" placeholder="e.g. KA-01-AB-1234" value={challanForm.vehicleNumber} onChange={(e) => setChallanForm({ ...challanForm, vehicleNumber: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Driver Name</Label>
                <Input data-testid="input-challan-driver" placeholder="Driver name" value={challanForm.driverName} onChange={(e) => setChallanForm({ ...challanForm, driverName: e.target.value })} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea data-testid="input-challan-notes" className="resize-none text-sm" rows={2} placeholder="Delivery notes..." value={challanForm.notes} onChange={(e) => setChallanForm({ ...challanForm, notes: e.target.value })} />
            </div>

            <div className="space-y-3">
              <Label className="text-sm font-semibold">Items</Label>
              {!challanForm.orderId ? (
                <p className="text-sm text-muted-foreground text-center py-4">Select a sales order to load items.</p>
              ) : challanItems.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">No remaining product items for this order.</p>
              ) : (
                <div className="space-y-2">
                  {challanItems.map((item, i) => {
                    const stockQty = challanForm.sourceType === "warehouse" && challanForm.sourceId
                      ? getChallanStockForProduct(item.productId, challanForm.sourceId)
                      : null;
                    return (
                      <div key={i} className="border rounded-md p-3 space-y-1 bg-muted/30" data-testid={`challan-item-${i}`}>
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <span className="text-xs font-medium">{item.description || products?.find(p => p.id === item.productId)?.name}</span>
                          {stockQty !== null && (
                            <span className={`text-[10px] font-medium ${stockQty > 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`} data-testid={`text-stock-available-${i}`}>
                              Stock: {stockQty}
                            </span>
                          )}
                        </div>
                        <div className="grid grid-cols-3 gap-2">
                          <div>
                            <Label className="text-[10px] text-muted-foreground">Qty (remaining {item.maxQty})</Label>
                            <Input
                              className="h-8 text-xs"
                              type="number"
                              min="1"
                              max={item.maxQty}
                              value={item.quantity}
                              onChange={(e) => {
                                const updated = [...challanItems];
                                updated[i] = { ...updated[i], quantity: Math.min(parseInt(e.target.value) || 1, item.maxQty) };
                                setChallanItems(updated);
                              }}
                              data-testid={`input-challan-item-qty-${i}`}
                            />
                          </div>
                          <div>
                            <Label className="text-[10px] text-muted-foreground">Unit Price</Label>
                            <Input className="h-8 text-xs bg-muted" readOnly value={`₹${item.unitPrice.toLocaleString()}`} />
                          </div>
                          <div>
                            <Label className="text-[10px] text-muted-foreground">Total</Label>
                            <Input className="h-8 text-xs bg-muted" readOnly value={`₹${(item.quantity * item.unitPrice).toLocaleString()}`} />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button
              data-testid="button-submit-challan"
              disabled={createChallanMutation.isPending || !challanForm.orderId || !challanForm.sourceId || challanItems.length === 0}
              onClick={() => {
                createChallanMutation.mutate({
                  orderId: challanForm.orderId,
                  sourceType: challanForm.sourceType,
                  sourceId: challanForm.sourceId,
                  vehicleNumber: challanForm.vehicleNumber || null,
                  driverName: challanForm.driverName || null,
                  notes: challanForm.notes || null,
                  items: challanItems.filter(it => it.quantity > 0).map(it => ({
                    productId: it.productId,
                    description: it.description,
                    quantity: it.quantity,
                    unitPrice: String(it.unitPrice),
                  })),
                });
              }}
            >
              {createChallanMutation.isPending ? "Creating..." : "Create Challan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={productDialogOpen} onOpenChange={setProductDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingProduct ? "Edit Item" : isService ? "Add Service" : "Add Product"}</DialogTitle>
            <DialogDescription>{isService ? "Service items for installation, maintenance, etc." : "Physical product or material"}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
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
              <Label htmlFor="prodBrand">Brand / Company</Label>
              <Input id="prodBrand" data-testid="input-product-brand" value={productForm.brand} onChange={(e) => setProductForm({ ...productForm, brand: e.target.value })} placeholder="e.g. Havells, Luminous" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="prodCostPrice">Cost Price (₹)</Label>
                <Input id="prodCostPrice" type="number" data-testid="input-product-cost-price" value={productForm.costPrice} onChange={(e) => setProductForm({ ...productForm, costPrice: e.target.value })} />
              </div>
              {!isService && (
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
              )}
            </div>
            {!isService && (
              <div className="space-y-2">
                <Label htmlFor="prodMinStock">Min Stock Level</Label>
                <Input id="prodMinStock" type="number" data-testid="input-product-min-stock" value={productForm.minStockLevel} onChange={(e) => setProductForm({ ...productForm, minStockLevel: e.target.value })} />
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

      <Dialog open={warehouseDialogOpen} onOpenChange={setWarehouseDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingWarehouse ? "Edit Warehouse" : "Add Warehouse"}</DialogTitle>
            <DialogDescription>Warehouse location details</DialogDescription>
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

      <Dialog open={adjustmentDialogOpen} onOpenChange={setAdjustmentDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Manual Stock Adjustment</DialogTitle>
            <DialogDescription>Record a manual stock in, out, or adjustment</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Product</Label>
              <Select value={adjustmentForm.productId} onValueChange={(v) => setAdjustmentForm({ ...adjustmentForm, productId: v })}>
                <SelectTrigger data-testid="select-adjustment-product">
                  <SelectValue placeholder="Select product" />
                </SelectTrigger>
                <SelectContent>
                  {(products ?? []).filter(p => p.type !== "service").map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name} ({p.sku})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Warehouse</Label>
              <Select value={adjustmentForm.warehouseId} onValueChange={(v) => setAdjustmentForm({ ...adjustmentForm, warehouseId: v })}>
                <SelectTrigger data-testid="select-adjustment-warehouse">
                  <SelectValue placeholder="Select warehouse" />
                </SelectTrigger>
                <SelectContent>
                  {(warehouses ?? []).map((w) => (
                    <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Movement Type</Label>
              <Select value={adjustmentForm.movementType} onValueChange={(v) => setAdjustmentForm({ ...adjustmentForm, movementType: v })}>
                <SelectTrigger data-testid="select-adjustment-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="in">Stock In</SelectItem>
                  <SelectItem value="out">Stock Out</SelectItem>
                  <SelectItem value="adjustment">Adjustment</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="adjQty">Quantity</Label>
              <Input id="adjQty" type="number" min="1" data-testid="input-adjustment-quantity" value={adjustmentForm.quantity} onChange={(e) => setAdjustmentForm({ ...adjustmentForm, quantity: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="adjNotes">Reason / Notes</Label>
              <Textarea id="adjNotes" data-testid="input-adjustment-notes" value={adjustmentForm.notes} onChange={(e) => setAdjustmentForm({ ...adjustmentForm, notes: e.target.value })} placeholder="Reason for adjustment..." />
            </div>
          </div>
          <DialogFooter>
            <Button
              data-testid="button-submit-adjustment"
              disabled={adjustmentMutation.isPending || !adjustmentForm.productId || !adjustmentForm.warehouseId || !adjustmentForm.quantity}
              onClick={() => adjustmentMutation.mutate({
                productId: adjustmentForm.productId,
                warehouseId: adjustmentForm.warehouseId,
                movementType: adjustmentForm.movementType,
                quantity: Number(adjustmentForm.quantity),
                referenceType: "manual",
                notes: adjustmentForm.notes || undefined,
              })}
            >
              {adjustmentMutation.isPending ? "Recording..." : "Record Adjustment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
