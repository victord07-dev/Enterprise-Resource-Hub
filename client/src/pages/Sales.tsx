import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Plus, Search, ShoppingCart, FileText, Users as UsersIcon, Pencil, Trash2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import type { SalesOrder, Customer, Quotation } from "@shared/schema";

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

export default function Sales() {
  const { toast } = useToast();
  const { data: orders, isLoading: ordersLoading } = useQuery<SalesOrder[]>({ queryKey: ["/api/sales-orders"] });
  const { data: customers, isLoading: customersLoading } = useQuery<Customer[]>({ queryKey: ["/api/customers"] });
  const { data: quotations, isLoading: quotationsLoading } = useQuery<Quotation[]>({ queryKey: ["/api/quotations"] });

  const [orderDialogOpen, setOrderDialogOpen] = useState(false);
  const [editingOrder, setEditingOrder] = useState<SalesOrder | null>(null);
  const [orderForm, setOrderForm] = useState({ orderNumber: "", customerId: "", status: "pending", totalAmount: "", notes: "" });

  const [quoteDialogOpen, setQuoteDialogOpen] = useState(false);
  const [editingQuote, setEditingQuote] = useState<Quotation | null>(null);
  const [quoteForm, setQuoteForm] = useState({ quoteNumber: "", customerId: "", status: "draft", totalAmount: "", validUntil: "", notes: "" });

  const [customerDialogOpen, setCustomerDialogOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [customerForm, setCustomerForm] = useState({ name: "", email: "", phone: "", address: "", gstNumber: "", contactPerson: "" });

  const orderMutation = useMutation({
    mutationFn: async (data: any) => {
      if (editingOrder) {
        await apiRequest("PATCH", `/api/sales-orders/${editingOrder.id}`, data);
      } else {
        await apiRequest("POST", "/api/sales-orders", data);
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
      if (editingQuote) {
        await apiRequest("PATCH", `/api/quotations/${editingQuote.id}`, data);
      } else {
        await apiRequest("POST", "/api/quotations", data);
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
    setOrderForm({ orderNumber: "", customerId: "", status: "pending", totalAmount: "", notes: "" });
    setOrderDialogOpen(true);
  };

  const openEditOrder = (order: SalesOrder) => {
    setEditingOrder(order);
    setOrderForm({
      orderNumber: order.orderNumber,
      customerId: order.customerId,
      status: order.status,
      totalAmount: String(order.totalAmount),
      notes: order.notes || "",
    });
    setOrderDialogOpen(true);
  };

  const openNewQuote = () => {
    setEditingQuote(null);
    setQuoteForm({ quoteNumber: "", customerId: "", status: "draft", totalAmount: "", validUntil: "", notes: "" });
    setQuoteDialogOpen(true);
  };

  const openEditQuote = (q: Quotation) => {
    setEditingQuote(q);
    setQuoteForm({
      quoteNumber: q.quoteNumber,
      customerId: q.customerId,
      status: q.status,
      totalAmount: String(q.totalAmount),
      validUntil: q.validUntil ? new Date(q.validUntil).toISOString().split("T")[0] : "",
      notes: q.notes || "",
    });
    setQuoteDialogOpen(true);
  };

  const openNewCustomer = () => {
    setEditingCustomer(null);
    setCustomerForm({ name: "", email: "", phone: "", address: "", gstNumber: "", contactPerson: "" });
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
    });
    setCustomerDialogOpen(true);
  };

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
                      <th className="text-left p-3 font-medium text-muted-foreground">Order #</th>
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
                          <td className="p-3"><Skeleton className="h-4 w-24" /></td>
                          <td className="p-3"><Skeleton className="h-4 w-20" /></td>
                          <td className="p-3"><Skeleton className="h-4 w-16" /></td>
                          <td className="p-3"><Skeleton className="h-4 w-16 ml-auto" /></td>
                          <td className="p-3"><Skeleton className="h-4 w-16 ml-auto" /></td>
                        </tr>
                      ))
                    ) : orders && orders.length > 0 ? (
                      orders.map((order) => (
                        <tr key={order.id} className="border-b last:border-0" data-testid={`row-order-${order.id}`}>
                          <td className="p-3 font-medium">{order.orderNumber}</td>
                          <td className="p-3 text-muted-foreground">{new Date(order.orderDate).toLocaleDateString()}</td>
                          <td className="p-3"><StatusBadge status={order.status} /></td>
                          <td className="p-3 text-right font-medium">₹{Number(order.totalAmount).toLocaleString()}</td>
                          <td className="p-3 text-right">
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
                      ))
                    ) : (
                      <tr>
                        <td colSpan={5} className="p-8 text-center text-muted-foreground">
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
                      <th className="text-left p-3 font-medium text-muted-foreground">Quote #</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">Status</th>
                      <th className="text-right p-3 font-medium text-muted-foreground">Amount</th>
                      <th className="text-right p-3 font-medium text-muted-foreground">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {quotationsLoading ? (
                      <tr><td colSpan={4} className="p-3"><Skeleton className="h-4 w-full" /></td></tr>
                    ) : quotations && quotations.length > 0 ? (
                      quotations.map((q) => (
                        <tr key={q.id} className="border-b last:border-0" data-testid={`row-quote-${q.id}`}>
                          <td className="p-3 font-medium">{q.quoteNumber}</td>
                          <td className="p-3"><StatusBadge status={q.status} /></td>
                          <td className="p-3 text-right font-medium">₹{Number(q.totalAmount).toLocaleString()}</td>
                          <td className="p-3 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button size="icon" variant="ghost" data-testid={`button-edit-quote-${q.id}`} onClick={() => openEditQuote(q)}>
                                <Pencil className="w-4 h-4" />
                              </Button>
                              <Button size="icon" variant="ghost" data-testid={`button-delete-quote-${q.id}`} onClick={() => { if (confirm("Delete this quotation?")) deleteQuoteMutation.mutate(q.id); }}>
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={4} className="p-8 text-center text-muted-foreground">No quotations found.</td>
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
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingOrder ? "Edit Order" : "New Order"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
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
              <Label htmlFor="orderAmount">Total Amount</Label>
              <Input id="orderAmount" type="number" data-testid="input-order-amount" value={orderForm.totalAmount} onChange={(e) => setOrderForm({ ...orderForm, totalAmount: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="orderNotes">Notes</Label>
              <Input id="orderNotes" data-testid="input-order-notes" value={orderForm.notes} onChange={(e) => setOrderForm({ ...orderForm, notes: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button data-testid="button-submit-order" disabled={orderMutation.isPending} onClick={() => orderMutation.mutate(orderForm)}>
              {orderMutation.isPending ? "Saving..." : editingOrder ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={quoteDialogOpen} onOpenChange={setQuoteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingQuote ? "Edit Quotation" : "New Quotation"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
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
              <Label htmlFor="quoteAmount">Total Amount</Label>
              <Input id="quoteAmount" type="number" data-testid="input-quote-amount" value={quoteForm.totalAmount} onChange={(e) => setQuoteForm({ ...quoteForm, totalAmount: e.target.value })} />
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
          <DialogFooter>
            <Button data-testid="button-submit-quote" disabled={quoteMutation.isPending} onClick={() => quoteMutation.mutate(quoteForm)}>
              {quoteMutation.isPending ? "Saving..." : editingQuote ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={customerDialogOpen} onOpenChange={setCustomerDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingCustomer ? "Edit Customer" : "New Customer"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="customerName">Name</Label>
              <Input id="customerName" data-testid="input-customer-name" value={customerForm.name} onChange={(e) => setCustomerForm({ ...customerForm, name: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="customerEmail">Email</Label>
              <Input id="customerEmail" type="email" data-testid="input-customer-email" value={customerForm.email} onChange={(e) => setCustomerForm({ ...customerForm, email: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="customerPhone">Phone</Label>
              <Input id="customerPhone" data-testid="input-customer-phone" value={customerForm.phone} onChange={(e) => setCustomerForm({ ...customerForm, phone: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="customerAddress">Address</Label>
              <Input id="customerAddress" data-testid="input-customer-address" value={customerForm.address} onChange={(e) => setCustomerForm({ ...customerForm, address: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="customerGst">GST Number</Label>
              <Input id="customerGst" data-testid="input-customer-gst" value={customerForm.gstNumber} onChange={(e) => setCustomerForm({ ...customerForm, gstNumber: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="customerContact">Contact Person</Label>
              <Input id="customerContact" data-testid="input-customer-contact-person" value={customerForm.contactPerson} onChange={(e) => setCustomerForm({ ...customerForm, contactPerson: e.target.value })} />
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
