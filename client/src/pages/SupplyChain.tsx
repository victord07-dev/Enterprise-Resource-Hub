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
import { Plus, Search, Truck, Users, ClipboardList, Package, Pencil, Trash2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import type { Supplier, PurchaseOrder } from "@shared/schema";

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

export default function SupplyChain() {
  const { toast } = useToast();
  const { data: suppliers, isLoading: suppliersLoading } = useQuery<Supplier[]>({ queryKey: ["/api/suppliers"] });
  const { data: purchaseOrders, isLoading: poLoading } = useQuery<PurchaseOrder[]>({ queryKey: ["/api/purchase-orders"] });

  const [poDialogOpen, setPoDialogOpen] = useState(false);
  const [editingPo, setEditingPo] = useState<PurchaseOrder | null>(null);
  const [poForm, setPoForm] = useState({ poNumber: "", supplierId: "", status: "pending", totalAmount: "", expectedDelivery: "", notes: "" });

  const [supplierDialogOpen, setSupplierDialogOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [supplierForm, setSupplierForm] = useState({ name: "", email: "", phone: "", address: "", gstNumber: "", contactPerson: "", category: "Solar Panels" });

  const poMutation = useMutation({
    mutationFn: async (data: any) => {
      if (editingPo) {
        await apiRequest("PATCH", `/api/purchase-orders/${editingPo.id}`, data);
      } else {
        await apiRequest("POST", "/api/purchase-orders", data);
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
    setPoForm({ poNumber: "", supplierId: "", status: "pending", totalAmount: "", expectedDelivery: "", notes: "" });
    setPoDialogOpen(true);
  };

  const openEditPo = (po: PurchaseOrder) => {
    setEditingPo(po);
    setPoForm({
      poNumber: po.poNumber,
      supplierId: po.supplierId,
      status: po.status,
      totalAmount: String(po.totalAmount),
      expectedDelivery: po.expectedDelivery ? new Date(po.expectedDelivery).toISOString().split("T")[0] : "",
      notes: po.notes || "",
    });
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

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-5 flex items-center gap-4">
            <div className="w-10 h-10 rounded-md bg-blue-50 dark:bg-blue-950/30 flex items-center justify-center">
              <Users className="w-5 h-5 text-blue-500" />
            </div>
            <div>
              <p className="text-2xl font-bold">{suppliers?.length ?? 0}</p>
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
              <p className="text-2xl font-bold">{purchaseOrders?.length ?? 0}</p>
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
              <p className="text-2xl font-bold">{purchaseOrders?.filter((po) => po.status === "shipped").length ?? 0}</p>
              <p className="text-xs text-muted-foreground">In Transit</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="purchase-orders" className="space-y-4">
        <TabsList>
          <TabsTrigger value="purchase-orders" data-testid="tab-po">Purchase Orders</TabsTrigger>
          <TabsTrigger value="suppliers" data-testid="tab-suppliers">Suppliers</TabsTrigger>
        </TabsList>

        <TabsContent value="purchase-orders" className="space-y-4">
          <div className="flex items-center gap-2">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Search purchase orders..." className="pl-9" data-testid="input-search-po" />
            </div>
          </div>
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left p-3 font-medium text-muted-foreground">PO Number</th>
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
                          {Array.from({ length: 6 }).map((_, j) => (
                            <td key={j} className="p-3"><Skeleton className="h-4 w-20" /></td>
                          ))}
                        </tr>
                      ))
                    ) : purchaseOrders && purchaseOrders.length > 0 ? (
                      purchaseOrders.map((po) => (
                        <tr key={po.id} className="border-b last:border-0" data-testid={`row-po-${po.id}`}>
                          <td className="p-3 font-medium">{po.poNumber}</td>
                          <td className="p-3 text-muted-foreground">{new Date(po.orderDate).toLocaleDateString()}</td>
                          <td className="p-3"><StatusBadge status={po.status} /></td>
                          <td className="p-3 text-muted-foreground">
                            {po.expectedDelivery ? new Date(po.expectedDelivery).toLocaleDateString() : "—"}
                          </td>
                          <td className="p-3 text-right font-medium">₹{Number(po.totalAmount).toLocaleString()}</td>
                          <td className="p-3 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button size="icon" variant="ghost" data-testid={`button-edit-po-${po.id}`} onClick={() => openEditPo(po)}>
                                <Pencil className="w-4 h-4" />
                              </Button>
                              <Button size="icon" variant="ghost" data-testid={`button-delete-po-${po.id}`} onClick={() => { if (confirm("Delete this purchase order?")) deletePoMutation.mutate(po.id); }}>
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={6} className="p-8 text-center text-muted-foreground">No purchase orders found.</td>
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
                      <tr><td colSpan={6} className="p-3"><Skeleton className="h-4 w-full" /></td></tr>
                    ) : suppliers && suppliers.length > 0 ? (
                      suppliers.map((s) => (
                        <tr key={s.id} className="border-b last:border-0" data-testid={`row-supplier-${s.id}`}>
                          <td className="p-3 font-medium">{s.name}</td>
                          <td className="p-3 text-muted-foreground">{s.category || "—"}</td>
                          <td className="p-3 text-muted-foreground">{s.contactPerson || "—"}</td>
                          <td className="p-3 text-muted-foreground">{s.phone || "—"}</td>
                          <td className="p-3 text-muted-foreground">{s.gstNumber || "—"}</td>
                          <td className="p-3 text-right">
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
                      ))
                    ) : (
                      <tr>
                        <td colSpan={6} className="p-8 text-center text-muted-foreground">No suppliers found.</td>
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
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingPo ? "Edit Purchase Order" : "New Purchase Order"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="poNumber">PO Number</Label>
              <Input id="poNumber" data-testid="input-po-number" value={poForm.poNumber} onChange={(e) => setPoForm({ ...poForm, poNumber: e.target.value })} />
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
              <Label htmlFor="poAmount">Total Amount</Label>
              <Input id="poAmount" type="number" data-testid="input-po-amount" value={poForm.totalAmount} onChange={(e) => setPoForm({ ...poForm, totalAmount: e.target.value })} />
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
          <DialogFooter>
            <Button data-testid="button-submit-po" disabled={poMutation.isPending} onClick={() => poMutation.mutate(poForm)}>
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
    </div>
  );
}
