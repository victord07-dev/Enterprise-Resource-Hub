import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useQuery } from "@tanstack/react-query";
import { Plus, Search, Truck, Users, ClipboardList, Package } from "lucide-react";
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
  const { data: suppliers, isLoading: suppliersLoading } = useQuery<Supplier[]>({ queryKey: ["/api/suppliers"] });
  const { data: purchaseOrders, isLoading: poLoading } = useQuery<PurchaseOrder[]>({ queryKey: ["/api/purchase-orders"] });

  return (
    <div className="p-6 space-y-6 overflow-auto h-full">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Supply Chain</h1>
          <p className="text-muted-foreground text-sm mt-1">Manage suppliers, purchase orders, and deliveries</p>
        </div>
        <Button data-testid="button-new-po">
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
                    </tr>
                  </thead>
                  <tbody>
                    {poLoading ? (
                      Array.from({ length: 3 }).map((_, i) => (
                        <tr key={i} className="border-b">
                          {Array.from({ length: 5 }).map((_, j) => (
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
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={5} className="p-8 text-center text-muted-foreground">No purchase orders found.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="suppliers" className="space-y-4">
          <Button size="sm" data-testid="button-add-supplier">
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
                    </tr>
                  </thead>
                  <tbody>
                    {suppliersLoading ? (
                      <tr><td colSpan={5} className="p-3"><Skeleton className="h-4 w-full" /></td></tr>
                    ) : suppliers && suppliers.length > 0 ? (
                      suppliers.map((s) => (
                        <tr key={s.id} className="border-b last:border-0" data-testid={`row-supplier-${s.id}`}>
                          <td className="p-3 font-medium">{s.name}</td>
                          <td className="p-3 text-muted-foreground">{s.category || "—"}</td>
                          <td className="p-3 text-muted-foreground">{s.contactPerson || "—"}</td>
                          <td className="p-3 text-muted-foreground">{s.phone || "—"}</td>
                          <td className="p-3 text-muted-foreground">{s.gstNumber || "—"}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={5} className="p-8 text-center text-muted-foreground">No suppliers found.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
