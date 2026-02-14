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
import { Plus, Search, FileText, CreditCard, IndianRupee, TrendingUp, Pencil, Trash2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import type { Invoice, Payment, Customer } from "@shared/schema";

function StatusBadge({ status }: { status: string }) {
  const variants: Record<string, string> = {
    unpaid: "bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-400",
    paid: "bg-green-100 text-green-800 dark:bg-green-950/40 dark:text-green-400",
    partial: "bg-yellow-100 text-yellow-800 dark:bg-yellow-950/40 dark:text-yellow-400",
    overdue: "bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-400",
    completed: "bg-green-100 text-green-800 dark:bg-green-950/40 dark:text-green-400",
    pending: "bg-yellow-100 text-yellow-800 dark:bg-yellow-950/40 dark:text-yellow-400",
    failed: "bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-400",
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium ${variants[status] || variants.pending}`}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

export default function Accounts() {
  const { toast } = useToast();
  const { data: invoices, isLoading: invoicesLoading } = useQuery<Invoice[]>({ queryKey: ["/api/invoices"] });
  const { data: payments, isLoading: paymentsLoading } = useQuery<Payment[]>({ queryKey: ["/api/payments"] });
  const { data: customers } = useQuery<Customer[]>({ queryKey: ["/api/customers"] });

  const totalRevenue = payments?.reduce((sum, p) => sum + Number(p.amount), 0) ?? 0;
  const pendingAmount = invoices?.filter((i) => i.status === "unpaid").reduce((sum, i) => sum + Number(i.amount), 0) ?? 0;

  const [invoiceDialogOpen, setInvoiceDialogOpen] = useState(false);
  const [editingInvoice, setEditingInvoice] = useState<Invoice | null>(null);
  const [invoiceForm, setInvoiceForm] = useState({ invoiceNumber: "", customerId: "", amount: "", status: "unpaid", dueDate: "" });

  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [editingPayment, setEditingPayment] = useState<Payment | null>(null);
  const [paymentForm, setPaymentForm] = useState({ invoiceId: "", amount: "", method: "bank_transfer", reference: "" });

  const invoiceMutation = useMutation({
    mutationFn: async (data: any) => {
      if (editingInvoice) {
        await apiRequest("PATCH", `/api/invoices/${editingInvoice.id}`, data);
      } else {
        await apiRequest("POST", "/api/invoices", data);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/invoices"] });
      toast({ title: editingInvoice ? "Invoice updated" : "Invoice created" });
      setInvoiceDialogOpen(false);
      setEditingInvoice(null);
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const deleteInvoiceMutation = useMutation({
    mutationFn: async (id: string) => { await apiRequest("DELETE", `/api/invoices/${id}`); },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/invoices"] });
      toast({ title: "Invoice deleted" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const paymentMutation = useMutation({
    mutationFn: async (data: any) => {
      if (editingPayment) {
        await apiRequest("PATCH", `/api/payments/${editingPayment.id}`, data);
      } else {
        await apiRequest("POST", "/api/payments", data);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/payments"] });
      toast({ title: editingPayment ? "Payment updated" : "Payment recorded" });
      setPaymentDialogOpen(false);
      setEditingPayment(null);
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const deletePaymentMutation = useMutation({
    mutationFn: async (id: string) => { await apiRequest("DELETE", `/api/payments/${id}`); },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/payments"] });
      toast({ title: "Payment deleted" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const openNewInvoice = () => {
    setEditingInvoice(null);
    setInvoiceForm({ invoiceNumber: "", customerId: "", amount: "", status: "unpaid", dueDate: "" });
    setInvoiceDialogOpen(true);
  };

  const openEditInvoice = (inv: Invoice) => {
    setEditingInvoice(inv);
    setInvoiceForm({
      invoiceNumber: inv.invoiceNumber,
      customerId: inv.customerId,
      amount: String(inv.amount),
      status: inv.status,
      dueDate: inv.dueDate ? new Date(inv.dueDate).toISOString().split("T")[0] : "",
    });
    setInvoiceDialogOpen(true);
  };

  const openNewPayment = () => {
    setEditingPayment(null);
    setPaymentForm({ invoiceId: "", amount: "", method: "bank_transfer", reference: "" });
    setPaymentDialogOpen(true);
  };

  const openEditPayment = (pay: Payment) => {
    setEditingPayment(pay);
    setPaymentForm({
      invoiceId: pay.invoiceId || "",
      amount: String(pay.amount),
      method: pay.method,
      reference: pay.reference || "",
    });
    setPaymentDialogOpen(true);
  };

  return (
    <div className="p-6 space-y-6 overflow-auto h-full">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Accounts</h1>
          <p className="text-muted-foreground text-sm mt-1">Manage invoices, payments, and finances</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button data-testid="button-new-invoice" onClick={openNewInvoice}>
            <Plus className="w-4 h-4 mr-2" />
            New Invoice
          </Button>
          <Button variant="outline" data-testid="button-record-payment" onClick={openNewPayment}>
            <CreditCard className="w-4 h-4 mr-2" />
            Record Payment
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-5 flex items-center gap-4">
            <div className="w-10 h-10 rounded-md bg-blue-50 dark:bg-blue-950/30 flex items-center justify-center">
              <FileText className="w-5 h-5 text-blue-500" />
            </div>
            <div>
              <p className="text-2xl font-bold">{invoices?.length ?? 0}</p>
              <p className="text-xs text-muted-foreground">Total Invoices</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5 flex items-center gap-4">
            <div className="w-10 h-10 rounded-md bg-emerald-50 dark:bg-emerald-950/30 flex items-center justify-center">
              <CreditCard className="w-5 h-5 text-emerald-500" />
            </div>
            <div>
              <p className="text-2xl font-bold">{payments?.length ?? 0}</p>
              <p className="text-xs text-muted-foreground">Payments</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5 flex items-center gap-4">
            <div className="w-10 h-10 rounded-md bg-green-50 dark:bg-green-950/30 flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-green-500" />
            </div>
            <div>
              <p className="text-2xl font-bold">₹{totalRevenue.toLocaleString()}</p>
              <p className="text-xs text-muted-foreground">Total Revenue</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5 flex items-center gap-4">
            <div className="w-10 h-10 rounded-md bg-red-50 dark:bg-red-950/30 flex items-center justify-center">
              <IndianRupee className="w-5 h-5 text-red-500" />
            </div>
            <div>
              <p className="text-2xl font-bold">₹{pendingAmount.toLocaleString()}</p>
              <p className="text-xs text-muted-foreground">Pending Amount</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="invoices" className="space-y-4">
        <TabsList>
          <TabsTrigger value="invoices" data-testid="tab-invoices">Invoices</TabsTrigger>
          <TabsTrigger value="payments" data-testid="tab-payments">Payments</TabsTrigger>
        </TabsList>

        <TabsContent value="invoices" className="space-y-4">
          <div className="flex items-center gap-2">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Search invoices..." className="pl-9" data-testid="input-search-invoices" />
            </div>
          </div>
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left p-3 font-medium text-muted-foreground">Invoice #</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">Date</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">Due Date</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">Status</th>
                      <th className="text-right p-3 font-medium text-muted-foreground">Amount</th>
                      <th className="text-right p-3 font-medium text-muted-foreground">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoicesLoading ? (
                      Array.from({ length: 3 }).map((_, i) => (
                        <tr key={i} className="border-b">
                          {Array.from({ length: 6 }).map((_, j) => (
                            <td key={j} className="p-3"><Skeleton className="h-4 w-20" /></td>
                          ))}
                        </tr>
                      ))
                    ) : invoices && invoices.length > 0 ? (
                      invoices.map((inv) => (
                        <tr key={inv.id} className="border-b last:border-0" data-testid={`row-invoice-${inv.id}`}>
                          <td className="p-3 font-medium">{inv.invoiceNumber}</td>
                          <td className="p-3 text-muted-foreground">{new Date(inv.issuedDate).toLocaleDateString()}</td>
                          <td className="p-3 text-muted-foreground">{inv.dueDate ? new Date(inv.dueDate).toLocaleDateString() : "—"}</td>
                          <td className="p-3"><StatusBadge status={inv.status} /></td>
                          <td className="p-3 text-right font-medium">₹{Number(inv.amount).toLocaleString()}</td>
                          <td className="p-3 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button size="icon" variant="ghost" data-testid={`button-edit-invoice-${inv.id}`} onClick={() => openEditInvoice(inv)}>
                                <Pencil className="w-4 h-4" />
                              </Button>
                              <Button size="icon" variant="ghost" data-testid={`button-delete-invoice-${inv.id}`} onClick={() => { if (confirm("Delete this invoice?")) deleteInvoiceMutation.mutate(inv.id); }}>
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={6} className="p-8 text-center text-muted-foreground">No invoices found.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="payments" className="space-y-4">
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left p-3 font-medium text-muted-foreground">Date</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">Method</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">Reference</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">Status</th>
                      <th className="text-right p-3 font-medium text-muted-foreground">Amount</th>
                      <th className="text-right p-3 font-medium text-muted-foreground">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paymentsLoading ? (
                      <tr><td colSpan={6} className="p-3"><Skeleton className="h-4 w-full" /></td></tr>
                    ) : payments && payments.length > 0 ? (
                      payments.map((pay) => (
                        <tr key={pay.id} className="border-b last:border-0" data-testid={`row-payment-${pay.id}`}>
                          <td className="p-3 text-muted-foreground">{new Date(pay.paymentDate).toLocaleDateString()}</td>
                          <td className="p-3 capitalize">{pay.method.replace(/_/g, " ")}</td>
                          <td className="p-3 text-muted-foreground">{pay.reference || "—"}</td>
                          <td className="p-3"><StatusBadge status={pay.status} /></td>
                          <td className="p-3 text-right font-medium">₹{Number(pay.amount).toLocaleString()}</td>
                          <td className="p-3 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button size="icon" variant="ghost" data-testid={`button-edit-payment-${pay.id}`} onClick={() => openEditPayment(pay)}>
                                <Pencil className="w-4 h-4" />
                              </Button>
                              <Button size="icon" variant="ghost" data-testid={`button-delete-payment-${pay.id}`} onClick={() => { if (confirm("Delete this payment?")) deletePaymentMutation.mutate(pay.id); }}>
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={6} className="p-8 text-center text-muted-foreground">No payments recorded.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={invoiceDialogOpen} onOpenChange={setInvoiceDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingInvoice ? "Edit Invoice" : "New Invoice"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="invNumber">Invoice Number</Label>
              <Input id="invNumber" data-testid="input-invoice-number" value={invoiceForm.invoiceNumber} onChange={(e) => setInvoiceForm({ ...invoiceForm, invoiceNumber: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="invCustomer">Customer</Label>
              <Select value={invoiceForm.customerId} onValueChange={(v) => setInvoiceForm({ ...invoiceForm, customerId: v })}>
                <SelectTrigger data-testid="select-invoice-customer">
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
              <Label htmlFor="invAmount">Amount</Label>
              <Input id="invAmount" type="number" data-testid="input-invoice-amount" value={invoiceForm.amount} onChange={(e) => setInvoiceForm({ ...invoiceForm, amount: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="invStatus">Status</Label>
              <Select value={invoiceForm.status} onValueChange={(v) => setInvoiceForm({ ...invoiceForm, status: v })}>
                <SelectTrigger data-testid="select-invoice-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {["unpaid", "paid", "partial", "overdue"].map((s) => (
                    <SelectItem key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="invDueDate">Due Date</Label>
              <Input id="invDueDate" type="date" data-testid="input-invoice-due-date" value={invoiceForm.dueDate} onChange={(e) => setInvoiceForm({ ...invoiceForm, dueDate: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button data-testid="button-submit-invoice" disabled={invoiceMutation.isPending} onClick={() => invoiceMutation.mutate(invoiceForm)}>
              {invoiceMutation.isPending ? "Saving..." : editingInvoice ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={paymentDialogOpen} onOpenChange={setPaymentDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingPayment ? "Edit Payment" : "Record Payment"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="payInvoice">Invoice</Label>
              <Select value={paymentForm.invoiceId} onValueChange={(v) => setPaymentForm({ ...paymentForm, invoiceId: v })}>
                <SelectTrigger data-testid="select-payment-invoice">
                  <SelectValue placeholder="Select invoice" />
                </SelectTrigger>
                <SelectContent>
                  {invoices?.map((inv) => (
                    <SelectItem key={inv.id} value={inv.id}>{inv.invoiceNumber}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="payAmount">Amount</Label>
              <Input id="payAmount" type="number" data-testid="input-payment-amount" value={paymentForm.amount} onChange={(e) => setPaymentForm({ ...paymentForm, amount: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="payMethod">Method</Label>
              <Select value={paymentForm.method} onValueChange={(v) => setPaymentForm({ ...paymentForm, method: v })}>
                <SelectTrigger data-testid="select-payment-method">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {["bank_transfer", "cash", "cheque", "upi", "card"].map((m) => (
                    <SelectItem key={m} value={m}>{m.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase())}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="payReference">Reference</Label>
              <Input id="payReference" data-testid="input-payment-reference" value={paymentForm.reference} onChange={(e) => setPaymentForm({ ...paymentForm, reference: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button data-testid="button-submit-payment" disabled={paymentMutation.isPending} onClick={() => paymentMutation.mutate(paymentForm)}>
              {paymentMutation.isPending ? "Saving..." : editingPayment ? "Update" : "Record"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
