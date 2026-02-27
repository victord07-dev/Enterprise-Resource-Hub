import { useState, useEffect, useCallback, Fragment } from "react";
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
import { Plus, Search, ShoppingCart, FileText, Users as UsersIcon, Pencil, Trash2, X, ArrowRightLeft, ChevronDown, ChevronRight, Package, Wrench } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import type { SalesOrder, SalesOrderItem, Customer, Quotation, QuotationItem, Product } from "@shared/schema";

interface LineItem {
  itemType: string;
  productId: string;
  description: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
}

function StatusBadge({ status }: { status: string }) {
  const variants: Record<string, string> = {
    pending: "bg-yellow-100 text-yellow-800 dark:bg-yellow-950/40 dark:text-yellow-400",
    confirmed: "bg-blue-100 text-blue-800 dark:bg-blue-950/40 dark:text-blue-400",
    shipped: "bg-purple-100 text-purple-800 dark:bg-purple-950/40 dark:text-purple-400",
    delivered: "bg-green-100 text-green-800 dark:bg-green-950/40 dark:text-green-400",
    cancelled: "bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-400",
    draft: "bg-gray-100 text-gray-800 dark:bg-gray-950/40 dark:text-gray-400",
    sent: "bg-blue-100 text-blue-800 dark:bg-blue-950/40 dark:text-blue-400",
    accepted: "bg-green-100 text-green-800 dark:bg-green-950/40 dark:text-green-400",
    rejected: "bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-400",
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium ${variants[status] || variants.pending}`}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

function emptyLineItem(): LineItem {
  return { itemType: "product", productId: "", description: "", quantity: 1, unitPrice: 0, totalPrice: 0 };
}

function LineItemsEditor({ items, onChange, products }: { items: LineItem[]; onChange: (items: LineItem[]) => void; products: Product[] }) {
  const productItems = products.filter(p => p.type === "product");
  const serviceItems = products.filter(p => p.type === "service");

  const updateItem = (index: number, field: string, value: any) => {
    const updated = [...items];
    const item = { ...updated[index], [field]: value };

    if (field === "productId" && value) {
      const prod = products.find(p => p.id === value);
      if (prod) {
        item.unitPrice = Number(prod.unitPrice);
        item.description = prod.name;
        item.itemType = prod.type;
        item.totalPrice = item.quantity * Number(prod.unitPrice);
      }
    }
    if (field === "quantity" || field === "unitPrice") {
      const qty = field === "quantity" ? Number(value) : item.quantity;
      const price = field === "unitPrice" ? Number(value) : item.unitPrice;
      item.totalPrice = qty * price;
    }
    if (field === "itemType") {
      item.productId = "";
      item.description = "";
      item.unitPrice = 0;
      item.totalPrice = 0;
    }
    updated[index] = item;
    onChange(updated);
  };

  const addItem = () => onChange([...items, emptyLineItem()]);
  const removeItem = (index: number) => onChange(items.filter((_, i) => i !== index));

  const total = items.reduce((sum, it) => sum + (it.totalPrice || 0), 0);

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
                    {(item.itemType === "product" ? productItems : serviceItems).map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.name} — ₹{Number(p.unitPrice).toLocaleString()}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0 mt-4" onClick={() => removeItem(i)} data-testid={`button-remove-item-${i}`}>
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
              <Label className="text-xs text-muted-foreground">Total (₹)</Label>
              <Input className="h-8 text-xs bg-muted" readOnly value={item.totalPrice.toLocaleString()} data-testid={`input-item-total-${i}`} />
            </div>
          </div>
        </div>
      ))}
      {items.length > 0 && (
        <div className="flex justify-end border-t pt-2">
          <p className="text-sm font-semibold" data-testid="text-line-items-total">Grand Total: ₹{total.toLocaleString()}</p>
        </div>
      )}
    </div>
  );
}

export default function Sales() {
  const { toast } = useToast();
  const { data: orders, isLoading: ordersLoading } = useQuery<SalesOrder[]>({ queryKey: ["/api/sales-orders"] });
  const { data: customers, isLoading: customersLoading } = useQuery<Customer[]>({ queryKey: ["/api/customers"] });
  const { data: quotations, isLoading: quotationsLoading } = useQuery<Quotation[]>({ queryKey: ["/api/quotations"] });
  const { data: products } = useQuery<Product[]>({ queryKey: ["/api/products"] });

  const [orderDialogOpen, setOrderDialogOpen] = useState(false);
  const [editingOrder, setEditingOrder] = useState<SalesOrder | null>(null);
  const [orderForm, setOrderForm] = useState({ orderNumber: "", customerId: "", status: "pending", notes: "" });
  const [orderItems, setOrderItems] = useState<LineItem[]>([emptyLineItem()]);

  const [quoteDialogOpen, setQuoteDialogOpen] = useState(false);
  const [editingQuote, setEditingQuote] = useState<Quotation | null>(null);
  const [quoteForm, setQuoteForm] = useState({ quoteNumber: "", customerId: "", status: "draft", validUntil: "", notes: "" });
  const [quoteItems, setQuoteItems] = useState<LineItem[]>([emptyLineItem()]);

  const [customerDialogOpen, setCustomerDialogOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [customerForm, setCustomerForm] = useState({ name: "", email: "", phone: "", address: "", gstNumber: "", contactPerson: "" });

  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);
  const [expandedQuoteId, setExpandedQuoteId] = useState<string | null>(null);
  const [expandedOrderItems, setExpandedOrderItems] = useState<SalesOrderItem[]>([]);
  const [expandedQuoteItems, setExpandedQuoteItems] = useState<QuotationItem[]>([]);

  const toggleOrderExpand = useCallback(async (orderId: string) => {
    if (expandedOrderId === orderId) {
      setExpandedOrderId(null);
      return;
    }
    try {
      const res = await fetch(`/api/sales-orders/${orderId}/items`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
      });
      const data = await res.json();
      setExpandedOrderItems(data);
      setExpandedOrderId(orderId);
    } catch { setExpandedOrderId(null); }
  }, [expandedOrderId]);

  const toggleQuoteExpand = useCallback(async (quoteId: string) => {
    if (expandedQuoteId === quoteId) {
      setExpandedQuoteId(null);
      return;
    }
    try {
      const res = await fetch(`/api/quotations/${quoteId}/items`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
      });
      const data = await res.json();
      setExpandedQuoteItems(data);
      setExpandedQuoteId(quoteId);
    } catch { setExpandedQuoteId(null); }
  }, [expandedQuoteId]);

  const orderMutation = useMutation({
    mutationFn: async (data: any) => {
      const totalAmount = String(orderItems.reduce((s, it) => s + (it.totalPrice || 0), 0));
      const orderData = { ...data, totalAmount };
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
          })),
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sales-orders"] });
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
      toast({ title: "Order deleted" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const quoteMutation = useMutation({
    mutationFn: async (data: any) => {
      const totalAmount = String(quoteItems.reduce((s, it) => s + (it.totalPrice || 0), 0));
      const quoteData = { ...data, totalAmount, validUntil: data.validUntil ? new Date(data.validUntil) : null };
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

  const openNewOrder = () => {
    setEditingOrder(null);
    const num = `SO-${Date.now().toString(36).toUpperCase()}`;
    setOrderForm({ orderNumber: num, customerId: "", status: "pending", notes: "" });
    setOrderItems([emptyLineItem()]);
    setOrderDialogOpen(true);
  };

  const openEditOrder = async (order: SalesOrder) => {
    setEditingOrder(order);
    setOrderForm({ orderNumber: order.orderNumber, customerId: order.customerId, status: order.status, notes: order.notes || "" });
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
    setQuoteForm({ quoteNumber: num, customerId: "", status: "draft", validUntil: "", notes: "" });
    setQuoteItems([emptyLineItem()]);
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

  const getCustomerName = (id: string) => customers?.find(c => c.id === id)?.name || "—";

  return (
    <div className="p-6 space-y-6 overflow-auto h-full">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Sales</h1>
          <p className="text-muted-foreground text-sm mt-1">Manage orders, quotations, and customers</p>
        </div>
        <Button data-testid="button-new-order" onClick={openNewOrder}>
          <Plus className="w-4 h-4 mr-2" />
          New Order
        </Button>
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
                            <td className="p-3 text-right" onClick={(e) => e.stopPropagation()}>
                              <div className="flex items-center justify-end gap-1">
                                <Button size="icon" variant="ghost" data-testid={`button-edit-order-${order.id}`} onClick={() => openEditOrder(order)}>
                                  <Pencil className="w-4 h-4" />
                                </Button>
                                <Button size="icon" variant="ghost" data-testid={`button-delete-order-${order.id}`} onClick={() => { if (confirm("Delete this order?")) deleteOrderMutation.mutate(order.id); }}>
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              </div>
                            </td>
                          </tr>
                          {expandedOrderId === order.id && (
                            <tr key={`${order.id}-items`} className="border-b">
                              <td colSpan={7} className="p-0">
                                <div className="bg-muted/20 px-6 py-3">
                                  {expandedOrderItems.length > 0 ? (
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
                                        {expandedOrderItems.map((it) => (
                                          <tr key={it.id} className="border-t border-muted">
                                            <td className="py-1.5">
                                              <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs ${it.itemType === "service" ? "bg-orange-100 text-orange-700" : "bg-blue-100 text-blue-700"}`}>
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
                                    <p className="text-xs text-muted-foreground">No line items for this order.</p>
                                  )}
                                </div>
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={7} className="p-8 text-center text-muted-foreground">
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
          <div className="flex items-center gap-2">
            <Button size="sm" data-testid="button-new-quote" onClick={openNewQuote}>
              <Plus className="w-4 h-4 mr-2" />
              New Quote
            </Button>
          </div>
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
                      <th className="text-right p-3 font-medium text-muted-foreground">Amount</th>
                      <th className="text-right p-3 font-medium text-muted-foreground">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {quotationsLoading ? (
                      <tr><td colSpan={7} className="p-3"><Skeleton className="h-4 w-full" /></td></tr>
                    ) : quotations && quotations.length > 0 ? (
                      quotations.map((q) => (
                        <Fragment key={q.id}>
                          <tr className="border-b last:border-0 hover:bg-muted/30 cursor-pointer" data-testid={`row-quote-${q.id}`} onClick={() => toggleQuoteExpand(q.id)}>
                            <td className="p-3">
                              {expandedQuoteId === q.id ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
                            </td>
                            <td className="p-3 font-medium">{q.quoteNumber}</td>
                            <td className="p-3 text-muted-foreground">{getCustomerName(q.customerId)}</td>
                            <td className="p-3"><StatusBadge status={q.status} /></td>
                            <td className="p-3 text-muted-foreground">{q.validUntil ? new Date(q.validUntil).toLocaleDateString() : "—"}</td>
                            <td className="p-3 text-right font-medium">₹{Number(q.totalAmount).toLocaleString()}</td>
                            <td className="p-3 text-right" onClick={(e) => e.stopPropagation()}>
                              <div className="flex items-center justify-end gap-1">
                                {q.status !== "accepted" && (
                                  <Button size="icon" variant="ghost" title="Convert to Order" data-testid={`button-convert-quote-${q.id}`}
                                    onClick={() => { if (confirm("Convert this quotation to an order?")) convertToOrderMutation.mutate(q.id); }}
                                    disabled={convertToOrderMutation.isPending}>
                                    <ArrowRightLeft className="w-4 h-4" />
                                  </Button>
                                )}
                                <Button size="icon" variant="ghost" data-testid={`button-edit-quote-${q.id}`} onClick={() => openEditQuote(q)}>
                                  <Pencil className="w-4 h-4" />
                                </Button>
                                <Button size="icon" variant="ghost" data-testid={`button-delete-quote-${q.id}`} onClick={() => { if (confirm("Delete this quotation?")) deleteQuoteMutation.mutate(q.id); }}>
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              </div>
                            </td>
                          </tr>
                          {expandedQuoteId === q.id && (
                            <tr key={`${q.id}-items`} className="border-b">
                              <td colSpan={7} className="p-0">
                                <div className="bg-muted/20 px-6 py-3">
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
                                              <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs ${it.itemType === "service" ? "bg-orange-100 text-orange-700" : "bg-blue-100 text-blue-700"}`}>
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
                                </div>
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={7} className="p-8 text-center text-muted-foreground">No quotations found.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="customers" className="space-y-4">
          <div className="flex items-center gap-2">
            <Button size="sm" data-testid="button-new-customer" onClick={openNewCustomer}>
              <Plus className="w-4 h-4 mr-2" />
              New Customer
            </Button>
          </div>
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
                            <div className="flex items-center justify-end gap-1">
                              <Button size="icon" variant="ghost" data-testid={`button-edit-customer-${c.id}`} onClick={() => openEditCustomer(c)}>
                                <Pencil className="w-4 h-4" />
                              </Button>
                              <Button size="icon" variant="ghost" data-testid={`button-delete-customer-${c.id}`} onClick={() => { if (confirm("Delete this customer?")) deleteCustomerMutation.mutate(c.id); }}>
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
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
                    {["pending", "confirmed", "shipped", "delivered", "cancelled"].map((s) => (
                      <SelectItem key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="orderNotes">Notes</Label>
                <Input id="orderNotes" data-testid="input-order-notes" value={orderForm.notes} onChange={(e) => setOrderForm({ ...orderForm, notes: e.target.value })} />
              </div>
            </div>
            <LineItemsEditor items={orderItems} onChange={setOrderItems} products={products || []} />
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
                <Label htmlFor="quoteNotes">Notes</Label>
                <Input id="quoteNotes" data-testid="input-quote-notes" value={quoteForm.notes} onChange={(e) => setQuoteForm({ ...quoteForm, notes: e.target.value })} />
              </div>
            </div>
            <LineItemsEditor items={quoteItems} onChange={setQuoteItems} products={products || []} />
          </div>
          <DialogFooter>
            <Button data-testid="button-submit-quote" disabled={quoteMutation.isPending} onClick={() => quoteMutation.mutate(quoteForm)}>
              {quoteMutation.isPending ? "Saving..." : editingQuote ? "Update Quotation" : "Create Quotation"}
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
