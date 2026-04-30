import { useState, useMemo, useEffect, Fragment } from "react";
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
import { Plus, FileText, CreditCard, IndianRupee, TrendingUp, Trash2, AlertCircle, CheckCircle2, ChevronDown, ChevronRight, RotateCcw, Upload, AlertTriangle } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import type { SalesInvoice, CustomerPayment, Customer, Supplier, PurchaseOrder, GoodsReceiptNote, SupplierInvoice, SupplierPayment } from "@shared/schema";
import AttachmentsPanel from "@/components/AttachmentsPanel";
import ExpensesTab from "@/components/ExpensesTab";
import { getUser } from "@/lib/auth";

async function uploadSupplierInvoiceSignedCopy(file: File, invoiceId: string): Promise<string> {
  const token = localStorage.getItem("token");
  const formData = new FormData();
  formData.append("file", file);
  const res = await fetch(`/api/supplier-invoices/${invoiceId}/upload-signed-copy`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  });
  if (!res.ok) {
    const d = await res.json();
    throw new Error(d.message || "Upload failed");
  }
  const data = await res.json();
  return (data as any).signedCopyUrl as string;
}

function StatusBadge({ status }: { status: string }) {
  const variants: Record<string, string> = {
    unpaid: "bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-400",
    paid: "bg-green-100 text-green-800 dark:bg-green-950/40 dark:text-green-400",
    partial: "bg-yellow-100 text-yellow-800 dark:bg-yellow-950/40 dark:text-yellow-400",
    partial_paid: "bg-yellow-100 text-yellow-800 dark:bg-yellow-950/40 dark:text-yellow-400",
    overdue: "bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-400",
    completed: "bg-green-100 text-green-800 dark:bg-green-950/40 dark:text-green-400",
    pending: "bg-yellow-100 text-yellow-800 dark:bg-yellow-950/40 dark:text-yellow-400",
    failed: "bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-400",
  };
  const labels: Record<string, string> = {
    partial_paid: "Partial Paid",
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium ${variants[status] || variants.pending}`}>
      {labels[status] ?? (status.charAt(0).toUpperCase() + status.slice(1))}
    </span>
  );
}

export default function Accounts() {
  const { toast } = useToast();
  const role = getUser()?.role || "admin";
  const expensesOnly = role !== "admin" && role !== "accountant";

  const [activeAccountsTab, setActiveAccountsTab] = useState<string>(() => {
    const params = new URLSearchParams(window.location.search);
    const initial = params.get("tab") || (expensesOnly ? "expenses" : "invoices");
    return expensesOnly ? "expenses" : initial;
  });
  useEffect(() => {
    const onPop = () => {
      const params = new URLSearchParams(window.location.search);
      setActiveAccountsTab(params.get("tab") || "invoices");
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  // ── AR Queries ────────────────────────────────────────────────────────────
  const { data: salesInvoices, isLoading: invoicesLoading } = useQuery<SalesInvoice[]>({ queryKey: ["/api/sales-invoices"] });
  const { data: customerPayments, isLoading: paymentsLoading } = useQuery<CustomerPayment[]>({ queryKey: ["/api/customer-payments"] });
  const { data: customers } = useQuery<Customer[]>({ queryKey: ["/api/customers"] });
  const { data: creditNotes = [] } = useQuery<any[]>({ queryKey: ["/api/credit-notes"] });

  // ── AP Queries ────────────────────────────────────────────────────────────
  const { data: supplierInvoices, isLoading: siLoading } = useQuery<SupplierInvoice[]>({ queryKey: ["/api/supplier-invoices"] });
  const { data: supplierPayments, isLoading: spLoading } = useQuery<SupplierPayment[]>({ queryKey: ["/api/supplier-payments"] });
  const { data: suppliers } = useQuery<Supplier[]>({ queryKey: ["/api/suppliers"] });
  const { data: purchaseOrders } = useQuery<PurchaseOrder[]>({ queryKey: ["/api/purchase-orders"] });
  const { data: grns } = useQuery<GoodsReceiptNote[]>({ queryKey: ["/api/grns"] });

  // ── AR Summary (from sales_invoices + customer_payments) ─────────────────
  const customerMap = useMemo(() => new Map((customers ?? []).map(c => [c.id, c])), [customers]);

  const paidPerSalesInvoice = useMemo(() => {
    const map: Record<string, number> = {};
    (customerPayments ?? []).forEach(p => {
      map[p.invoiceId] = (map[p.invoiceId] || 0) + Number(p.amount);
    });
    return map;
  }, [customerPayments]);

  const arSummary = useMemo(() => {
    let totalReceivable = 0, totalCollected = 0, totalOutstanding = 0, totalCredited = 0;
    (salesInvoices ?? []).forEach(inv => {
      const grand = Number(inv.grandTotal);
      const paid = paidPerSalesInvoice[inv.id] ?? 0;
      const credited = Number(inv.creditedAmount ?? 0);
      totalReceivable += grand;
      totalCollected += Math.min(grand, paid);
      totalCredited += credited;
      const bal = Math.max(0, grand - paid - credited);
      if (bal > 0) totalOutstanding += bal;
    });
    return { totalReceivable, totalCollected, totalOutstanding, totalCredited };
  }, [salesInvoices, paidPerSalesInvoice]);

  // ── AP Computed values ────────────────────────────────────────────────────
  const supplierMap = useMemo(() => new Map((suppliers ?? []).map(s => [s.id, s])), [suppliers]);
  const poMap = useMemo(() => new Map((purchaseOrders ?? []).map(p => [p.id, p])), [purchaseOrders]);
  const grnMap = useMemo(() => new Map((grns ?? []).map(g => [g.id, g])), [grns]);

  const paidPerInvoice = useMemo(() => {
    const map: Record<string, number> = {};
    (supplierPayments ?? []).filter(p => p.paymentType === "regular" && p.supplierInvoiceId).forEach(p => {
      map[p.supplierInvoiceId!] = (map[p.supplierInvoiceId!] || 0) + Number(p.amount);
    });
    return map;
  }, [supplierPayments]);

  const apSummary = useMemo(() => {
    const now = new Date();
    // Total paid = sum of ALL supplier payments recorded (advances + regular)
    const totalPaid = (supplierPayments ?? []).reduce((sum, p) => sum + Number(p.amount), 0);
    let totalPayable = 0, totalOverdue = 0;
    (supplierInvoices ?? []).forEach(inv => {
      const advance = inv.purchaseOrderId ? Number(poMap.get(inv.purchaseOrderId)?.advancePaid ?? 0) : 0;
      const paid = (paidPerInvoice[inv.id] ?? 0) + advance;
      const balance = Number(inv.totalAmount) - paid;
      if (inv.status !== "paid" && balance > 0) {
        totalPayable += balance;
        if (inv.dueDate && new Date(inv.dueDate) < now) totalOverdue += balance;
      }
    });
    return { totalPayable, totalPaid, totalOverdue };
  }, [supplierInvoices, supplierPayments, paidPerInvoice, poMap]);

  // ── AR State ──────────────────────────────────────────────────────────────
  const [arPayDialogOpen, setArPayDialogOpen] = useState(false);
  const [arPayForm, setArPayForm] = useState({ invoiceId: "", amount: "", method: "bank_transfer", reference: "", paymentDate: new Date().toISOString().split("T")[0] });

  // ── AP State ──────────────────────────────────────────────────────────────
  const [expandedSiIds, setExpandedSiIds] = useState<Set<string>>(new Set());
  const toggleSiExpanded = (id: string) => setExpandedSiIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const [siDialogOpen, setSiDialogOpen] = useState(false);
  const [siForm, setSiForm] = useState({
    supplierId: "", purchaseOrderId: "", grnId: "", invoiceNumber: "",
    invoiceDate: new Date().toISOString().split("T")[0], subtotal: "",
    taxAmount: "0", paymentTerms: "net_30", notes: "",
  });
  // F2: Upload status filter
  const [siUploadFilter, setSiUploadFilter] = useState<string>("all");
  // F3: Mark as Recorded dialog
  const [siRecordedDialog, setSiRecordedDialog] = useState<{ id: string; systemTotal: number } | null>(null);
  const [siRecordedNumber, setSiRecordedNumber] = useState("");
  const [siRecordedDate, setSiRecordedDate] = useState(new Date().toISOString().split("T")[0]);
  const [siRecordedTotal, setSiRecordedTotal] = useState("");
  const [siRecordedGst, setSiRecordedGst] = useState("");
  const [siRecordedFile, setSiRecordedFile] = useState<File | null>(null);
  const [siRecordedFileUrl, setSiRecordedFileUrl] = useState<string | null>(null);
  const [siRecordedUploading, setSiRecordedUploading] = useState(false);
  const [siVarianceModal, setSiVarianceModal] = useState<{ extTotal: number; sysTotal: number; diff: number; invoiceId: string; invoiceNumber: string; extInvoiceNumber: string; extInvoiceDate: string; extGst: string } | null>(null);
  // F4: Cancel dialog
  const [siCancelId, setSiCancelId] = useState<string | null>(null);

  const [spDialogOpen, setSpDialogOpen] = useState(false);
  const [spForm, setSpForm] = useState({
    paymentType: "regular", supplierId: "", supplierInvoiceId: "",
    purchaseOrderId: "", amount: "", paymentMethod: "bank_transfer",
    paymentDate: new Date().toISOString().split("T")[0], reference: "",
  });

  // ── AR Computed helpers ───────────────────────────────────────────────────
  const siDueDate = useMemo(() => {
    if (!siForm.invoiceDate) return null;
    const d = new Date(siForm.invoiceDate);
    if (siForm.paymentTerms === "immediate") return d.toLocaleDateString();
    if (siForm.paymentTerms === "net_30") { d.setDate(d.getDate() + 30); return d.toLocaleDateString(); }
    if (siForm.paymentTerms === "net_60") { d.setDate(d.getDate() + 60); return d.toLocaleDateString(); }
    return null;
  }, [siForm.invoiceDate, siForm.paymentTerms]);

  const filteredPOs = useMemo(() =>
    (purchaseOrders ?? []).filter(po => !siForm.supplierId || po.supplierId === siForm.supplierId),
    [purchaseOrders, siForm.supplierId]);

  const filteredGRNs = useMemo(() =>
    (grns ?? []).filter(g => g.status === "confirmed" && (!siForm.purchaseOrderId || g.purchaseOrderId === siForm.purchaseOrderId)),
    [grns, siForm.purchaseOrderId]);

  const supplierPOs = useMemo(() =>
    (purchaseOrders ?? []).filter(po => !spForm.supplierId || po.supplierId === spForm.supplierId),
    [purchaseOrders, spForm.supplierId]);

  const supplierSIs = useMemo(() =>
    (supplierInvoices ?? []).filter(si => !spForm.supplierId || si.supplierId === spForm.supplierId),
    [supplierInvoices, spForm.supplierId]);

  const selectedSI = useMemo(() =>
    spForm.supplierInvoiceId ? supplierInvoices?.find(si => si.id === spForm.supplierInvoiceId) : null,
    [supplierInvoices, spForm.supplierInvoiceId]);

  const invoiceBalance = useMemo(() => {
    if (!selectedSI) return null;
    const advance = selectedSI.purchaseOrderId ? Number(poMap.get(selectedSI.purchaseOrderId)?.advancePaid ?? 0) : 0;
    const paid = paidPerInvoice[selectedSI.id] ?? 0;
    return Number(selectedSI.totalAmount) - advance - paid;
  }, [selectedSI, paidPerInvoice, poMap]);

  // ── AR Mutations ──────────────────────────────────────────────────────────
  const arPayMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/customer-payments", data);
      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.message || "Failed to record payment");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sales-invoices"] });
      queryClient.invalidateQueries({ queryKey: ["/api/customer-payments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/reports/ar-aging"] });
      toast({ title: "Payment recorded successfully" });
      setArPayDialogOpen(false);
      setArPayForm({ invoiceId: "", amount: "", method: "bank_transfer", reference: "", paymentDate: new Date().toISOString().split("T")[0] });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  // ── AP Mutations ──────────────────────────────────────────────────────────
  const siMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/supplier-invoices", data);
      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.message || "Failed to create supplier invoice");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/supplier-invoices"] });
      toast({ title: "Supplier invoice created" });
      setSiDialogOpen(false);
      setSiForm({ supplierId: "", purchaseOrderId: "", grnId: "", invoiceNumber: "", invoiceDate: new Date().toISOString().split("T")[0], subtotal: "", taxAmount: "0", paymentTerms: "net_30", notes: "" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const deleteSiMutation = useMutation({
    mutationFn: async (id: string) => { await apiRequest("DELETE", `/api/supplier-invoices/${id}`); },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/supplier-invoices"] });
      queryClient.invalidateQueries({ queryKey: ["/api/supplier-payments"] });
      toast({ title: "Supplier invoice deleted" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  // F3: Mark as Recorded
  const siMarkRecordedMutation = useMutation({
    mutationFn: async ({ id, extInvoiceNumber, extInvoiceDate, extTotalAmount, extGstAmount }: {
      id: string; extInvoiceNumber: string; extInvoiceDate: string; extTotalAmount: string; extGstAmount?: string;
    }) => {
      const res = await apiRequest("POST", `/api/supplier-invoices/${id}/mark-recorded`, {
        extInvoiceNumber, extInvoiceDate, extTotalAmount, extGstAmount: extGstAmount || undefined,
      });
      if (!res.ok) { const b = await res.json(); throw new Error(b.message || "Failed to mark as recorded"); }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/supplier-invoices"] });
      toast({ title: "Supplier invoice recorded", description: "Ext. invoice details saved." });
      setSiRecordedDialog(null);
      setSiVarianceModal(null);
      setSiRecordedNumber("");
      setSiRecordedDate(new Date().toISOString().split("T")[0]);
      setSiRecordedTotal("");
      setSiRecordedGst("");
      setSiRecordedFile(null);
      setSiRecordedFileUrl(null);
    },
    onError: (err: Error) => { toast({ title: "Error", description: err.message, variant: "destructive" }); },
  });

  function handleMarkRecordedSubmit(forceSubmit = false) {
    if (!siRecordedDialog) return;
    const extTotal = parseFloat(siRecordedTotal);
    const sysTotal = siRecordedDialog.systemTotal;
    const diff = Math.abs(extTotal - sysTotal);
    if (!forceSubmit && diff > 5) {
      setSiVarianceModal({
        extTotal, sysTotal, diff,
        invoiceId: siRecordedDialog.id,
        invoiceNumber: "",
        extInvoiceNumber: siRecordedNumber,
        extInvoiceDate: siRecordedDate,
        extGst: siRecordedGst,
      });
      return;
    }
    siMarkRecordedMutation.mutate({
      id: siRecordedDialog.id,
      extInvoiceNumber: siRecordedNumber,
      extInvoiceDate: siRecordedDate,
      extTotalAmount: siRecordedTotal,
      extGstAmount: siRecordedGst || undefined,
    });
  }

  // F4: Cancel supplier invoice
  const siCancelMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("PATCH", `/api/supplier-invoices/${id}`, { uploadStatus: "cancelled" });
      if (!res.ok) { const b = await res.json(); throw new Error(b.message || "Failed to cancel"); }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/supplier-invoices"] });
      toast({ title: "Supplier invoice cancelled" });
      setSiCancelId(null);
    },
    onError: (err: Error) => { toast({ title: "Error", description: err.message, variant: "destructive" }); },
  });

  const spMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/supplier-payments", data);
      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.message || "Failed to record payment");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/supplier-payments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/supplier-invoices"] });
      queryClient.invalidateQueries({ queryKey: ["/api/purchase-orders"] });
      toast({ title: "Payment recorded" });
      setSpDialogOpen(false);
      setSpForm({ paymentType: "regular", supplierId: "", supplierInvoiceId: "", purchaseOrderId: "", amount: "", paymentMethod: "bank_transfer", paymentDate: new Date().toISOString().split("T")[0], reference: "" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const deleteSpMutation = useMutation({
    mutationFn: async (id: string) => { await apiRequest("DELETE", `/api/supplier-payments/${id}`); },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/supplier-payments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/supplier-invoices"] });
      toast({ title: "Payment deleted" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  // ── AR helpers ────────────────────────────────────────────────────────────
  const openArPayDialog = (invoiceId?: string) => {
    setArPayForm({ invoiceId: invoiceId ?? "", amount: "", method: "bank_transfer", reference: "", paymentDate: new Date().toISOString().split("T")[0] });
    setArPayDialogOpen(true);
  };

  return (
    <div className="p-6 space-y-6 overflow-auto h-full">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Accounts</h1>
          <p className="text-muted-foreground text-sm mt-1">Manage invoices, payments, and finances</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" data-testid="button-record-ar-payment" onClick={() => openArPayDialog()}>
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
              <p className="text-2xl font-bold">{salesInvoices?.length ?? 0}</p>
              <p className="text-xs text-muted-foreground">AR Invoices</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5 flex items-center gap-4">
            <div className="w-10 h-10 rounded-md bg-emerald-50 dark:bg-emerald-950/30 flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-emerald-500" />
            </div>
            <div>
              <p className="text-2xl font-bold">₹{arSummary.totalReceivable.toLocaleString("en-IN", { maximumFractionDigits: 0 })}</p>
              <p className="text-xs text-muted-foreground">Total Receivable</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5 flex items-center gap-4">
            <div className="w-10 h-10 rounded-md bg-green-50 dark:bg-green-950/30 flex items-center justify-center">
              <CheckCircle2 className="w-5 h-5 text-green-500" />
            </div>
            <div>
              <p className="text-2xl font-bold">₹{arSummary.totalCollected.toLocaleString("en-IN", { maximumFractionDigits: 0 })}</p>
              <p className="text-xs text-muted-foreground">Collected</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5 flex items-center gap-4">
            <div className="w-10 h-10 rounded-md bg-red-50 dark:bg-red-950/30 flex items-center justify-center">
              <AlertCircle className="w-5 h-5 text-red-500" />
            </div>
            <div>
              <p className="text-2xl font-bold">₹{arSummary.totalOutstanding.toLocaleString("en-IN", { maximumFractionDigits: 0 })}</p>
              <p className="text-xs text-muted-foreground">Outstanding</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs
        value={activeAccountsTab}
        onValueChange={(v) => {
          setActiveAccountsTab(v);
          const params = new URLSearchParams(window.location.search);
          if (v === "invoices") params.delete("tab"); else params.set("tab", v);
          const qs = params.toString();
          window.history.replaceState({}, "", `/accounts${qs ? `?${qs}` : ""}`);
        }}
        className="space-y-4"
      >
        <TabsList>
          {!expensesOnly && <TabsTrigger value="invoices" data-testid="tab-invoices">Invoices</TabsTrigger>}
          {!expensesOnly && <TabsTrigger value="payments" data-testid="tab-payments">Payments</TabsTrigger>}
          {!expensesOnly && <TabsTrigger value="credit-notes" data-testid="tab-credit-notes">Credit Notes</TabsTrigger>}
          {!expensesOnly && <TabsTrigger value="supplier-invoices" data-testid="tab-supplier-invoices">Supplier Invoices</TabsTrigger>}
          {!expensesOnly && <TabsTrigger value="supplier-payments" data-testid="tab-supplier-payments">Supplier Payments</TabsTrigger>}
          <TabsTrigger value="expenses" data-testid="tab-expenses">Expenses</TabsTrigger>
        </TabsList>

        <TabsContent value="expenses" className="space-y-4">
          <ExpensesTab />
        </TabsContent>

        {/* ── AR: Invoices ───────────────────────────────────────────────── */}
        <TabsContent value="invoices" className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">{salesInvoices?.length ?? 0} GST invoice(s) — created automatically from dispatched delivery challans</p>
          </div>
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/40">
                      <th className="text-left p-3 font-medium text-muted-foreground">Invoice #</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">Customer</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">Type</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">Date</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">Due Date</th>
                      <th className="text-right p-3 font-medium text-muted-foreground">Total</th>
                      <th className="text-right p-3 font-medium text-muted-foreground">Collected</th>
                      <th className="text-right p-3 font-medium text-muted-foreground">Balance</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">Status</th>
                      <th className="text-right p-3 font-medium text-muted-foreground">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoicesLoading ? (
                      Array.from({ length: 3 }).map((_, i) => (
                        <tr key={i} className="border-b">
                          {Array.from({ length: 10 }).map((_, j) => (
                            <td key={j} className="p-3"><Skeleton className="h-4 w-16" /></td>
                          ))}
                        </tr>
                      ))
                    ) : salesInvoices && salesInvoices.length > 0 ? (
                      salesInvoices.map((inv) => {
                        const customer = customerMap.get(inv.customerId);
                        const paid = paidPerSalesInvoice[inv.id] ?? 0;
                        const credited = Number(inv.creditedAmount ?? 0);
                        const balance = Math.max(0, Number(inv.grandTotal) - paid - credited);
                        const isOverdue = inv.dueDate && new Date(inv.dueDate) < new Date() && inv.status !== "paid";
                        return (
                          <tr key={inv.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors" data-testid={`row-invoice-${inv.id}`}>
                            <td className="p-3 font-mono text-xs font-medium">
                              <span>{inv.invoiceNumber}</span>
                              {credited > 0 && (
                                <span className="ml-1 inline-flex items-center px-1 py-0.5 rounded text-[10px] font-medium bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300">
                                  <RotateCcw className="w-2.5 h-2.5 mr-0.5" />CN
                                </span>
                              )}
                            </td>
                            <td className="p-3 font-medium">{customer?.name ?? "—"}</td>
                            <td className="p-3">
                              <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${inv.customerType === "B2B" ? "bg-blue-100 text-blue-800 dark:bg-blue-950/40 dark:text-blue-300" : "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300"}`}>
                                {inv.customerType}
                              </span>
                            </td>
                            <td className="p-3 text-muted-foreground">{new Date(inv.invoiceDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</td>
                            <td className={`p-3 ${isOverdue ? "text-red-600 dark:text-red-400 font-medium" : "text-muted-foreground"}`}>
                              {inv.dueDate ? new Date(inv.dueDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—"}
                            </td>
                            <td className="p-3 text-right font-medium">₹{Number(inv.grandTotal).toLocaleString()}</td>
                            <td className="p-3 text-right text-emerald-600 dark:text-emerald-400">₹{paid.toLocaleString()}</td>
                            <td className={`p-3 text-right font-semibold ${balance > 0 ? "text-red-600 dark:text-red-400" : "text-muted-foreground"}`}>₹{balance.toLocaleString()}</td>
                            <td className="p-3">
                              <div className="flex flex-col gap-1">
                                <StatusBadge status={inv.status} />
                                {isOverdue && balance > 0 && (
                                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400 w-fit">
                                    Overdue
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="p-3 text-right">
                              {inv.status !== "paid" && (
                                <Button size="sm" variant="outline" data-testid={`button-pay-invoice-${inv.id}`} onClick={() => openArPayDialog(inv.id)}>
                                  <CreditCard className="w-3 h-3 mr-1" />
                                  Pay
                                </Button>
                              )}
                            </td>
                          </tr>
                        );
                      })
                    ) : (
                      <tr>
                        <td colSpan={10} className="p-8 text-center text-muted-foreground">No invoices found. Invoices are generated from dispatched delivery challans.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── AR: Payments ───────────────────────────────────────────────── */}
        <TabsContent value="payments" className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">{customerPayments?.length ?? 0} payment(s) received</p>
            <Button variant="outline" size="sm" data-testid="button-record-payment-tab" onClick={() => openArPayDialog()}>
              <Plus className="w-4 h-4 mr-2" />
              Record Payment
            </Button>
          </div>
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/40">
                      <th className="text-left p-3 font-medium text-muted-foreground">Date</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">Customer</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">Invoice #</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">Method</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">Reference</th>
                      <th className="text-right p-3 font-medium text-muted-foreground">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paymentsLoading ? (
                      <tr><td colSpan={6} className="p-3"><Skeleton className="h-4 w-full" /></td></tr>
                    ) : customerPayments && customerPayments.length > 0 ? (
                      customerPayments.map((pay) => {
                        const customer = customerMap.get(pay.customerId);
                        const invoice = salesInvoices?.find(i => i.id === pay.invoiceId);
                        return (
                          <tr key={pay.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors" data-testid={`row-payment-${pay.id}`}>
                            <td className="p-3 text-muted-foreground">{new Date(pay.paymentDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</td>
                            <td className="p-3 font-medium">{customer?.name ?? "—"}</td>
                            <td className="p-3 font-mono text-xs">{invoice?.invoiceNumber ?? "—"}</td>
                            <td className="p-3 capitalize">{pay.method.replace(/_/g, " ")}</td>
                            <td className="p-3 text-muted-foreground">{pay.reference || "—"}</td>
                            <td className="p-3 text-right font-medium text-emerald-600 dark:text-emerald-400">₹{Number(pay.amount).toLocaleString()}</td>
                          </tr>
                        );
                      })
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

        {/* ── Credit Notes ───────────────────────────────────────────────── */}
        <TabsContent value="credit-notes" className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">{creditNotes.length} credit note(s) issued from sales returns</p>
          </div>
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/40">
                      <th className="text-left p-3 font-medium text-muted-foreground">Credit Note #</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">Invoice #</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">Customer</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">Type</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">Date</th>
                      <th className="text-right p-3 font-medium text-muted-foreground">Subtotal</th>
                      <th className="text-right p-3 font-medium text-muted-foreground">GST</th>
                      <th className="text-right p-3 font-medium text-muted-foreground">Total Credit</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {creditNotes.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="p-8 text-center text-muted-foreground">No credit notes issued yet.</td>
                      </tr>
                    ) : (
                      creditNotes.map((cn: any) => {
                        const customer = customerMap.get(cn.customerId);
                        return (
                          <tr key={cn.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors" data-testid={`row-credit-note-${cn.id}`}>
                            <td className="p-3 font-mono text-xs font-medium text-blue-700 dark:text-blue-400">
                              <span className="flex items-center gap-1">
                                <RotateCcw className="w-3 h-3" />{cn.creditNoteNumber}
                              </span>
                            </td>
                            <td className="p-3 font-mono text-xs text-muted-foreground">{cn.invoiceId ?? "—"}</td>
                            <td className="p-3 font-medium">{customer?.name ?? "—"}</td>
                            <td className="p-3">
                              <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${cn.isInterState ? "bg-purple-100 text-purple-800 dark:bg-purple-950/40 dark:text-purple-300" : "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300"}`}>
                                {cn.isInterState ? "Inter-State" : "Intra-State"}
                              </span>
                            </td>
                            <td className="p-3 text-muted-foreground">
                              {cn.createdAt ? new Date(cn.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—"}
                            </td>
                            <td className="p-3 text-right">₹{Number(cn.subtotal).toLocaleString()}</td>
                            <td className="p-3 text-right text-blue-600 dark:text-blue-400">₹{Number(cn.taxAmount).toLocaleString()}</td>
                            <td className="p-3 text-right font-semibold text-green-700 dark:text-green-400">₹{Number(cn.grandTotal).toLocaleString()}</td>
                            <td className="p-3">
                              <StatusBadge status={cn.status} />
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

        {/* ── AP: Supplier Invoices ──────────────────────────────────────── */}
        <TabsContent value="supplier-invoices" className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card>
              <CardContent className="p-5 flex items-center gap-4">
                <div className="w-10 h-10 rounded-md bg-orange-50 dark:bg-orange-950/30 flex items-center justify-center">
                  <IndianRupee className="w-5 h-5 text-orange-500" />
                </div>
                <div>
                  <p className="text-xl font-bold">₹{apSummary.totalPayable.toLocaleString()}</p>
                  <p className="text-xs text-muted-foreground">Total Payable</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5 flex items-center gap-4">
                <div className="w-10 h-10 rounded-md bg-green-50 dark:bg-green-950/30 flex items-center justify-center">
                  <CheckCircle2 className="w-5 h-5 text-green-500" />
                </div>
                <div>
                  <p className="text-xl font-bold">₹{apSummary.totalPaid.toLocaleString()}</p>
                  <p className="text-xs text-muted-foreground">Total Paid</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5 flex items-center gap-4">
                <div className="w-10 h-10 rounded-md bg-red-50 dark:bg-red-950/30 flex items-center justify-center">
                  <AlertCircle className="w-5 h-5 text-red-500" />
                </div>
                <div>
                  <p className="text-xl font-bold">₹{apSummary.totalOverdue.toLocaleString()}</p>
                  <p className="text-xs text-muted-foreground">Total Overdue</p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* F2: Upload Status Filter Tabs */}
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex gap-1 flex-wrap">
              {[
                { key: "all", label: "All" },
                { key: "pending_upload", label: "Pending Upload" },
                { key: "uploaded", label: "Uploaded" },
                { key: "recorded", label: "Recorded" },
                { key: "cancelled", label: "Cancelled" },
              ].map(({ key, label }) => {
                const count = key === "all"
                  ? (supplierInvoices?.length ?? 0)
                  : (supplierInvoices?.filter(si => (si as any).uploadStatus === key).length ?? 0);
                return (
                  <button
                    key={key}
                    data-testid={`button-si-filter-${key}`}
                    onClick={() => setSiUploadFilter(key)}
                    className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                      siUploadFilter === key
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground hover:bg-muted/80"
                    }`}
                  >
                    {label} <span className="ml-1 opacity-70">({count})</span>
                  </button>
                );
              })}
            </div>
            <Button data-testid="button-new-supplier-invoice" onClick={() => setSiDialogOpen(true)}>
              <Plus className="w-4 h-4 mr-2" />
              New Supplier Invoice
            </Button>
          </div>

          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="w-8 p-3"></th>
                      <th className="text-left p-3 font-medium text-muted-foreground">Supplier</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">Invoice #</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">Date</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">Due Date</th>
                      <th className="text-right p-3 font-medium text-muted-foreground">Total</th>
                      <th className="text-right p-3 font-medium text-muted-foreground">Paid</th>
                      <th className="text-right p-3 font-medium text-muted-foreground">Balance</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">Status</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">Upload</th>
                      <th className="text-right p-3 font-medium text-muted-foreground">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {siLoading ? (
                      Array.from({ length: 3 }).map((_, i) => (
                        <tr key={i} className="border-b">
                          {Array.from({ length: 11 }).map((_, j) => (
                            <td key={j} className="p-3"><Skeleton className="h-4 w-16" /></td>
                          ))}
                        </tr>
                      ))
                    ) : (() => {
                      const filtered = (supplierInvoices ?? []).filter(inv =>
                        siUploadFilter === "all" || (inv as any).uploadStatus === siUploadFilter
                      );
                      if (filtered.length === 0) return (
                        <tr>
                          <td colSpan={11} className="p-8 text-center text-muted-foreground">No supplier invoices found.</td>
                        </tr>
                      );
                      return filtered.map((inv) => {
                        const advance = inv.purchaseOrderId ? Number(poMap.get(inv.purchaseOrderId)?.advancePaid ?? 0) : 0;
                        const paid = (paidPerInvoice[inv.id] ?? 0) + advance;
                        const balance = Number(inv.totalAmount) - paid;
                        const isOverdue = inv.dueDate && new Date(inv.dueDate) < new Date() && inv.status !== "paid";
                        const isExpanded = expandedSiIds.has(inv.id);
                        const uploadStatus = (inv as any).uploadStatus ?? "pending_upload";
                        const isCreditGrn = (inv as any).isCreditGrn;
                        const uploadBadgeClass: Record<string, string> = {
                          pending_upload: "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-400",
                          uploaded: "bg-blue-100 text-blue-800 dark:bg-blue-950/40 dark:text-blue-400",
                          recorded: "bg-green-100 text-green-800 dark:bg-green-950/40 dark:text-green-400",
                          cancelled: "bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-400",
                        };
                        return (
                          <Fragment key={inv.id}>
                            <tr className={`border-b last:border-0 ${uploadStatus === "cancelled" ? "opacity-50" : ""}`} data-testid={`row-supplier-invoice-${inv.id}`}>
                              <td className="p-3">
                                <button onClick={() => toggleSiExpanded(inv.id)} className="text-muted-foreground" data-testid={`button-expand-si-${inv.id}`}>
                                  {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                                </button>
                              </td>
                              <td className="p-3 font-medium">
                                {supplierMap.get(inv.supplierId)?.name ?? "—"}
                                {isCreditGrn && <span className="ml-1 text-xs bg-purple-100 text-purple-700 dark:bg-purple-950/40 dark:text-purple-400 px-1.5 py-0.5 rounded">Credit</span>}
                              </td>
                              <td className="p-3">{inv.invoiceNumber ?? <span className="text-muted-foreground italic text-xs">Pending</span>}</td>
                              <td className="p-3 text-muted-foreground">{new Date(inv.invoiceDate).toLocaleDateString()}</td>
                              <td className={`p-3 ${isOverdue ? "text-red-600 dark:text-red-400 font-medium" : "text-muted-foreground"}`}>
                                {inv.dueDate ? new Date(inv.dueDate).toLocaleDateString() : "—"}
                              </td>
                              <td className="p-3 text-right font-medium">₹{Number(inv.totalAmount).toLocaleString()}</td>
                              <td className="p-3 text-right text-green-600 dark:text-green-400">₹{paid.toLocaleString()}</td>
                              <td className="p-3 text-right font-semibold">₹{Math.max(0, balance).toLocaleString()}</td>
                              <td className="p-3"><StatusBadge status={inv.status} /></td>
                              <td className="p-3">
                                <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium ${uploadBadgeClass[uploadStatus] || uploadBadgeClass.pending_upload}`} data-testid={`badge-si-upload-${inv.id}`}>
                                  {uploadStatus === "pending_upload" ? "Pending Upload" : uploadStatus.charAt(0).toUpperCase() + uploadStatus.slice(1)}
                                </span>
                              </td>
                              <td className="p-3 text-right">
                                <div className="flex items-center justify-end gap-1">
                                  {(uploadStatus === "pending_upload" || uploadStatus === "uploaded") && (
                                    <Button size="sm" variant="outline" className="h-7 text-xs" data-testid={`button-si-record-${inv.id}`}
                                      onClick={() => {
                                        setSiRecordedDialog({ id: inv.id, systemTotal: Number(inv.totalAmount ?? 0) });
                                        setSiRecordedNumber("");
                                        setSiRecordedDate(new Date().toISOString().split("T")[0]);
                                        setSiRecordedTotal("");
                                        setSiRecordedGst("");
                                        setSiRecordedFile(null);
                                        setSiRecordedFileUrl((inv as any).signedCopyUrl ?? null);
                                      }}>
                                      <CheckCircle2 className="w-3 h-3 mr-1" /> Record
                                    </Button>
                                  )}
                                  {uploadStatus !== "cancelled" && uploadStatus !== "recorded" && (
                                    <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground" data-testid={`button-si-cancel-${inv.id}`}
                                      onClick={() => setSiCancelId(inv.id)}>
                                      <RotateCcw className="w-3.5 h-3.5" />
                                    </Button>
                                  )}
                                  <Button size="icon" variant="ghost" data-testid={`button-delete-supplier-invoice-${inv.id}`}
                                    onClick={() => { if (confirm("Delete this supplier invoice and its payments?")) deleteSiMutation.mutate(inv.id); }}>
                                    <Trash2 className="w-4 h-4" />
                                  </Button>
                                </div>
                              </td>
                            </tr>
                            {isExpanded && (
                              <tr key={`${inv.id}-attach`} className="border-b last:border-0">
                                <td colSpan={11} className="p-0">
                                  <div className="bg-muted/30 px-6 py-4 ml-8">
                                    <AttachmentsPanel entityType="supplier_invoice" entityId={inv.id} module="accounts" />
                                  </div>
                                </td>
                              </tr>
                            )}
                          </Fragment>
                        );
                      });
                    })()}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── AP: Supplier Payments ──────────────────────────────────────── */}
        <TabsContent value="supplier-payments" className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">{supplierPayments?.length ?? 0} payment(s)</p>
            <Button data-testid="button-record-supplier-payment" onClick={() => setSpDialogOpen(true)}>
              <CreditCard className="w-4 h-4 mr-2" />
              Record Payment
            </Button>
          </div>
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left p-3 font-medium text-muted-foreground">Date</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">Type</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">Method</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">Supplier</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">Linked To</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">Reference</th>
                      <th className="text-right p-3 font-medium text-muted-foreground">Amount</th>
                      <th className="text-right p-3 font-medium text-muted-foreground">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {spLoading ? (
                      <tr><td colSpan={8} className="p-3"><Skeleton className="h-4 w-full" /></td></tr>
                    ) : supplierPayments && supplierPayments.length > 0 ? (
                      supplierPayments.map((pay) => {
                        const linkedSI = pay.supplierInvoiceId ? supplierInvoices?.find(si => si.id === pay.supplierInvoiceId) : null;
                        const linkedPO = pay.purchaseOrderId ? poMap.get(pay.purchaseOrderId) : null;
                        return (
                          <tr key={pay.id} className="border-b last:border-0" data-testid={`row-supplier-payment-${pay.id}`}>
                            <td className="p-3 text-muted-foreground">{new Date(pay.paymentDate).toLocaleDateString()}</td>
                            <td className="p-3">
                              <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium ${pay.paymentType === "advance" ? "bg-blue-100 text-blue-800 dark:bg-blue-950/40 dark:text-blue-400" : "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300"}`}>
                                {pay.paymentType === "advance" ? "Advance" : "Regular"}
                              </span>
                            </td>
                            <td className="p-3 capitalize">{pay.paymentMethod.replace(/_/g, " ")}</td>
                            <td className="p-3 font-medium">{supplierMap.get(pay.supplierId)?.name ?? "—"}</td>
                            <td className="p-3 text-muted-foreground">
                              {linkedSI ? linkedSI.invoiceNumber : linkedPO ? linkedPO.poNumber : "—"}
                            </td>
                            <td className="p-3 text-muted-foreground">{pay.reference || "—"}</td>
                            <td className="p-3 text-right font-medium">₹{Number(pay.amount).toLocaleString()}</td>
                            <td className="p-3 text-right">
                              <Button size="icon" variant="ghost" data-testid={`button-delete-supplier-payment-${pay.id}`}
                                onClick={() => { if (confirm("Delete this payment?")) deleteSpMutation.mutate(pay.id); }}>
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </td>
                          </tr>
                        );
                      })
                    ) : (
                      <tr>
                        <td colSpan={8} className="p-8 text-center text-muted-foreground">No supplier payments recorded.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ── AR: Record Customer Payment Dialog ────────────────────────────── */}
      <Dialog open={arPayDialogOpen} onOpenChange={setArPayDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record Customer Payment</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Invoice *</Label>
              <Select value={arPayForm.invoiceId} onValueChange={(v) => setArPayForm({ ...arPayForm, invoiceId: v })}>
                <SelectTrigger data-testid="select-ar-payment-invoice">
                  <SelectValue placeholder="Select invoice" />
                </SelectTrigger>
                <SelectContent>
                  {(salesInvoices ?? []).filter(i => i.status !== "paid").map((inv) => {
                    const cust = customerMap.get(inv.customerId);
                    const balance = Math.max(0, Number(inv.grandTotal) - (paidPerSalesInvoice[inv.id] ?? 0));
                    return (
                      <SelectItem key={inv.id} value={inv.id}>
                        {inv.invoiceNumber} — {cust?.name ?? "?"} — ₹{balance.toLocaleString()} due
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
              {arPayForm.invoiceId && (() => {
                const inv = salesInvoices?.find(i => i.id === arPayForm.invoiceId);
                const balance = inv ? Math.max(0, Number(inv.grandTotal) - (paidPerSalesInvoice[inv.id] ?? 0)) : 0;
                return (
                  <div className="p-3 bg-muted/50 rounded-md text-sm flex justify-between">
                    <span className="text-muted-foreground">Outstanding Balance</span>
                    <span className="font-semibold text-red-600 dark:text-red-400">₹{balance.toLocaleString()}</span>
                  </div>
                );
              })()}
            </div>
            <div className="space-y-2">
              <Label>Amount (₹) *</Label>
              <Input type="number" data-testid="input-ar-payment-amount" value={arPayForm.amount} onChange={(e) => setArPayForm({ ...arPayForm, amount: e.target.value })} placeholder="0" />
            </div>
            <div className="space-y-2">
              <Label>Payment Method</Label>
              <Select value={arPayForm.method} onValueChange={(v) => setArPayForm({ ...arPayForm, method: v })}>
                <SelectTrigger data-testid="select-ar-payment-method">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {["bank_transfer", "cash", "cheque", "upi", "card"].map((m) => (
                    <SelectItem key={m} value={m}>{m.replace(/_/g, " ").replace(/^\w/, c => c.toUpperCase())}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Payment Date</Label>
              <Input type="date" data-testid="input-ar-payment-date" value={arPayForm.paymentDate} onChange={(e) => setArPayForm({ ...arPayForm, paymentDate: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Reference / UTR</Label>
              <Input data-testid="input-ar-payment-reference" value={arPayForm.reference} onChange={(e) => setArPayForm({ ...arPayForm, reference: e.target.value })} placeholder="NEFT/UPI reference, cheque number, etc." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setArPayDialogOpen(false)}>Cancel</Button>
            <Button
              data-testid="button-submit-ar-payment"
              disabled={arPayMutation.isPending || !arPayForm.invoiceId || !arPayForm.amount}
              onClick={() => arPayMutation.mutate({
                invoiceId: arPayForm.invoiceId,
                amount: arPayForm.amount,
                method: arPayForm.method,
                paymentDate: arPayForm.paymentDate,
                reference: arPayForm.reference || null,
              })}
            >
              {arPayMutation.isPending ? "Recording..." : "Record Payment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── AP: New Supplier Invoice Dialog ──────────────────────────────── */}
      <Dialog open={siDialogOpen} onOpenChange={setSiDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>New Supplier Invoice</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Supplier *</Label>
              <Select value={siForm.supplierId} onValueChange={(v) => setSiForm({ ...siForm, supplierId: v, purchaseOrderId: "", grnId: "" })}>
                <SelectTrigger data-testid="select-si-supplier">
                  <SelectValue placeholder="Select supplier" />
                </SelectTrigger>
                <SelectContent>
                  {(suppliers ?? []).map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Purchase Order *</Label>
              <Select value={siForm.purchaseOrderId} onValueChange={(v) => setSiForm({ ...siForm, purchaseOrderId: v, grnId: "" })} disabled={!siForm.supplierId}>
                <SelectTrigger data-testid="select-si-po">
                  <SelectValue placeholder={siForm.supplierId ? "Select PO" : "Select supplier first"} />
                </SelectTrigger>
                <SelectContent>
                  {filteredPOs.length === 0
                    ? <SelectItem value="_none" disabled>No POs for this supplier</SelectItem>
                    : filteredPOs.map(po => <SelectItem key={po.id} value={po.id}>{po.poNumber} — ₹{Number(po.totalAmount).toLocaleString()}</SelectItem>)
                  }
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>GRN *</Label>
              <Select value={siForm.grnId} onValueChange={(v) => setSiForm({ ...siForm, grnId: v })} disabled={!siForm.purchaseOrderId}>
                <SelectTrigger data-testid="select-si-grn">
                  <SelectValue placeholder={siForm.purchaseOrderId ? "Select confirmed GRN" : "Select PO first"} />
                </SelectTrigger>
                <SelectContent>
                  {filteredGRNs.length === 0
                    ? <SelectItem value="_none" disabled>No confirmed GRNs for this PO</SelectItem>
                    : filteredGRNs.map(g => <SelectItem key={g.id} value={g.id}>{g.grnNumber} — ₹{Number(g.totalAmount).toLocaleString()}</SelectItem>)
                  }
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Invoice Number *</Label>
              <Input data-testid="input-si-invoice-number" value={siForm.invoiceNumber} onChange={e => setSiForm({ ...siForm, invoiceNumber: e.target.value })} placeholder="e.g. SUP-INV-2026-001" />
            </div>
            <div className="space-y-2">
              <Label>Invoice Date</Label>
              <Input type="date" data-testid="input-si-invoice-date" value={siForm.invoiceDate} onChange={e => setSiForm({ ...siForm, invoiceDate: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Subtotal (₹) *</Label>
                <Input type="number" data-testid="input-si-subtotal" value={siForm.subtotal} onChange={e => setSiForm({ ...siForm, subtotal: e.target.value })} placeholder="0" />
              </div>
              <div className="space-y-2">
                <Label>Tax Amount (₹)</Label>
                <Input type="number" data-testid="input-si-tax" value={siForm.taxAmount} onChange={e => setSiForm({ ...siForm, taxAmount: e.target.value })} placeholder="0" />
              </div>
            </div>
            <div className="p-3 bg-muted/50 rounded-md text-sm flex justify-between">
              <span className="text-muted-foreground">Total Amount</span>
              <span className="font-semibold">₹{((Number(siForm.subtotal) || 0) + (Number(siForm.taxAmount) || 0)).toLocaleString()}</span>
            </div>
            <div className="space-y-2">
              <Label>Payment Terms</Label>
              <Select value={siForm.paymentTerms} onValueChange={v => setSiForm({ ...siForm, paymentTerms: v })}>
                <SelectTrigger data-testid="select-si-terms">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="immediate">Immediate</SelectItem>
                  <SelectItem value="net_30">Net 30 Days</SelectItem>
                  <SelectItem value="net_60">Net 60 Days</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {siDueDate && (
              <div className="p-3 bg-blue-50 dark:bg-blue-950/20 rounded-md text-sm flex justify-between">
                <span className="text-blue-700 dark:text-blue-300">Due Date</span>
                <span className="font-medium text-blue-800 dark:text-blue-200">{siDueDate}</span>
              </div>
            )}
            <div className="space-y-2">
              <Label>Notes</Label>
              <Input data-testid="input-si-notes" value={siForm.notes} onChange={e => setSiForm({ ...siForm, notes: e.target.value })} placeholder="Optional notes" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSiDialogOpen(false)}>Cancel</Button>
            <Button data-testid="button-submit-supplier-invoice"
              disabled={siMutation.isPending || !siForm.supplierId || !siForm.purchaseOrderId || !siForm.grnId || !siForm.invoiceNumber || !siForm.subtotal}
              onClick={() => siMutation.mutate({
                supplierId: siForm.supplierId,
                purchaseOrderId: siForm.purchaseOrderId,
                grnId: siForm.grnId,
                invoiceNumber: siForm.invoiceNumber,
                invoiceDate: siForm.invoiceDate,
                subtotal: siForm.subtotal,
                taxAmount: siForm.taxAmount || "0",
                paymentTerms: siForm.paymentTerms,
                notes: siForm.notes || null,
              })}>
              {siMutation.isPending ? "Creating..." : "Create Invoice"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* F3: Mark Supplier Invoice as Recorded */}
      <Dialog open={!!siRecordedDialog} onOpenChange={(o) => { if (!o) { setSiRecordedDialog(null); setSiRecordedFile(null); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Mark as Recorded</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-1">
            <p className="text-sm text-muted-foreground">Enter the details from the supplier's physical/digital invoice. System total: <span className="font-semibold text-foreground">₹{siRecordedDialog ? Number(siRecordedDialog.systemTotal).toLocaleString("en-IN") : "—"}</span></p>

            <div className="space-y-2">
              <Label>Supplier Invoice Number <span className="text-red-500">*</span></Label>
              <Input
                data-testid="input-si-recorded-number"
                value={siRecordedNumber}
                onChange={e => setSiRecordedNumber(e.target.value)}
                placeholder="e.g. SUP-INV-00123"
              />
            </div>

            <div className="space-y-2">
              <Label>Invoice Date <span className="text-red-500">*</span></Label>
              <Input
                type="date"
                data-testid="input-si-recorded-date"
                value={siRecordedDate}
                onChange={e => setSiRecordedDate(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>Ext. Total Amount (₹) <span className="text-red-500">*</span></Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                data-testid="input-si-recorded-total"
                value={siRecordedTotal}
                onChange={e => setSiRecordedTotal(e.target.value)}
                placeholder="0.00"
              />
            </div>

            <div className="space-y-2">
              <Label>Ext. GST Amount (₹) <span className="text-xs text-muted-foreground ml-1">optional</span></Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                data-testid="input-si-recorded-gst"
                value={siRecordedGst}
                onChange={e => setSiRecordedGst(e.target.value)}
                placeholder="0.00"
              />
            </div>

            <div className="space-y-2">
              <Label>Signed Copy <span className="text-red-500">*</span></Label>
              {siRecordedFileUrl ? (
                <div className="flex items-center gap-2 p-2 bg-green-50 dark:bg-green-950/20 rounded border border-green-200 dark:border-green-800">
                  <CheckCircle2 className="w-4 h-4 text-green-600" />
                  <span className="text-sm text-green-700 dark:text-green-400">Signed copy uploaded</span>
                  <Button size="sm" variant="ghost" className="h-6 text-xs ml-auto" onClick={() => { setSiRecordedFileUrl(null); setSiRecordedFile(null); }}>Replace</Button>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Input
                      type="file"
                      accept=".pdf,.jpg,.jpeg,.png"
                      data-testid="input-si-signed-copy"
                      className="text-sm"
                      onChange={e => setSiRecordedFile(e.target.files?.[0] ?? null)}
                    />
                  </div>
                  {siRecordedFile && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full"
                      data-testid="button-si-upload-signed-copy"
                      disabled={siRecordedUploading}
                      onClick={async () => {
                        if (!siRecordedDialog || !siRecordedFile) return;
                        setSiRecordedUploading(true);
                        try {
                          const url = await uploadSupplierInvoiceSignedCopy(siRecordedFile, siRecordedDialog.id);
                          setSiRecordedFileUrl(url);
                          queryClient.invalidateQueries({ queryKey: ["/api/supplier-invoices"] });
                          toast({ title: "Signed copy uploaded" });
                        } catch (err: any) {
                          toast({ title: "Upload failed", description: err.message, variant: "destructive" });
                        } finally {
                          setSiRecordedUploading(false);
                        }
                      }}
                    >
                      <Upload className="w-3.5 h-3.5 mr-1.5" />
                      {siRecordedUploading ? "Uploading…" : "Upload"}
                    </Button>
                  )}
                  <p className="text-xs text-muted-foreground">PDF, JPG, PNG — max 10 MB</p>
                </div>
              )}
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => { setSiRecordedDialog(null); setSiRecordedFile(null); }}>Cancel</Button>
            <Button
              data-testid="button-confirm-si-recorded"
              disabled={
                !siRecordedNumber.trim() ||
                !siRecordedDate ||
                !siRecordedTotal || parseFloat(siRecordedTotal) <= 0 ||
                !siRecordedFileUrl ||
                siMarkRecordedMutation.isPending
              }
              onClick={() => handleMarkRecordedSubmit(false)}
            >
              {siMarkRecordedMutation.isPending ? "Saving…" : "Mark as Recorded"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* F3: Variance confirmation modal */}
      <Dialog open={!!siVarianceModal} onOpenChange={(o) => { if (!o) setSiVarianceModal(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
              Amount Variance Detected
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <p className="text-sm text-muted-foreground">The entered amount differs from the system total by more than ₹5. Please confirm you want to proceed.</p>
            <div className="rounded-lg border bg-muted/40 p-3 space-y-1.5 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Ext. invoice total</span>
                <span className="font-semibold">₹{siVarianceModal ? Number(siVarianceModal.extTotal).toLocaleString("en-IN", { minimumFractionDigits: 2 }) : "—"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">System total (GRN)</span>
                <span className="font-semibold">₹{siVarianceModal ? Number(siVarianceModal.sysTotal).toLocaleString("en-IN", { minimumFractionDigits: 2 }) : "—"}</span>
              </div>
              <div className="border-t pt-1.5 flex justify-between font-semibold text-amber-700 dark:text-amber-400">
                <span>Difference</span>
                <span>₹{siVarianceModal ? Number(siVarianceModal.diff).toLocaleString("en-IN", { minimumFractionDigits: 2 }) : "—"}</span>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">Clicking Continue will record this invoice with the entered amounts. The variance will be noted in the audit log.</p>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" data-testid="button-variance-cancel" onClick={() => setSiVarianceModal(null)}>Cancel</Button>
            <Button
              data-testid="button-variance-continue"
              className="bg-amber-600 hover:bg-amber-700 text-white"
              disabled={siMarkRecordedMutation.isPending}
              onClick={() => handleMarkRecordedSubmit(true)}
            >
              {siMarkRecordedMutation.isPending ? "Saving…" : "Continue"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* F4: Cancel Supplier Invoice */}
      <Dialog open={!!siCancelId} onOpenChange={(o) => { if (!o) setSiCancelId(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Cancel Supplier Invoice</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">This will mark the invoice as cancelled. Any associated payments will remain but the invoice will be excluded from outstanding balances.</p>
          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={() => setSiCancelId(null)}>Keep</Button>
            <Button
              variant="destructive"
              data-testid="button-confirm-si-cancel"
              disabled={siCancelMutation.isPending}
              onClick={() => siCancelId && siCancelMutation.mutate(siCancelId)}
            >
              {siCancelMutation.isPending ? "Cancelling..." : "Cancel Invoice"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── AP: Record Supplier Payment Dialog ───────────────────────────── */}
      <Dialog open={spDialogOpen} onOpenChange={setSpDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Record Supplier Payment</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Payment Type *</Label>
              <Select value={spForm.paymentType} onValueChange={v => setSpForm({ ...spForm, paymentType: v, supplierInvoiceId: "", purchaseOrderId: "" })}>
                <SelectTrigger data-testid="select-sp-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="regular">Regular (against invoice)</SelectItem>
                  <SelectItem value="advance">Advance (against PO)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Supplier *</Label>
              <Select value={spForm.supplierId} onValueChange={v => setSpForm({ ...spForm, supplierId: v, supplierInvoiceId: "", purchaseOrderId: "" })}>
                <SelectTrigger data-testid="select-sp-supplier">
                  <SelectValue placeholder="Select supplier" />
                </SelectTrigger>
                <SelectContent>
                  {(suppliers ?? []).map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {spForm.paymentType === "advance" ? (
              <div className="space-y-2">
                <Label>Purchase Order *</Label>
                <Select value={spForm.purchaseOrderId} onValueChange={v => setSpForm({ ...spForm, purchaseOrderId: v })} disabled={!spForm.supplierId}>
                  <SelectTrigger data-testid="select-sp-po">
                    <SelectValue placeholder={spForm.supplierId ? "Select PO" : "Select supplier first"} />
                  </SelectTrigger>
                  <SelectContent>
                    {supplierPOs.map(po => <SelectItem key={po.id} value={po.id}>{po.poNumber} — ₹{Number(po.totalAmount).toLocaleString()}</SelectItem>)}
                  </SelectContent>
                </Select>
                {spForm.purchaseOrderId && (
                  <p className="text-xs text-muted-foreground">
                    Advance already paid: ₹{Number(poMap.get(spForm.purchaseOrderId)?.advancePaid ?? 0).toLocaleString()}
                  </p>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                <Label>Supplier Invoice *</Label>
                <Select value={spForm.supplierInvoiceId} onValueChange={v => setSpForm({ ...spForm, supplierInvoiceId: v })} disabled={!spForm.supplierId}>
                  <SelectTrigger data-testid="select-sp-invoice">
                    <SelectValue placeholder={spForm.supplierId ? "Select invoice" : "Select supplier first"} />
                  </SelectTrigger>
                  <SelectContent>
                    {supplierSIs.filter(si => si.status !== "paid").map(si => <SelectItem key={si.id} value={si.id}>{si.invoiceNumber} — ₹{Number(si.totalAmount).toLocaleString()}</SelectItem>)}
                  </SelectContent>
                </Select>
                {invoiceBalance !== null && (
                  <div className="p-3 bg-muted/50 rounded-md text-sm flex justify-between">
                    <span className="text-muted-foreground">Current Balance</span>
                    <span className={`font-semibold ${invoiceBalance <= 0 ? "text-green-600" : ""}`}>₹{Math.max(0, invoiceBalance).toLocaleString()}</span>
                  </div>
                )}
              </div>
            )}

            <div className="space-y-2">
              <Label>Amount (₹) *</Label>
              <Input type="number" data-testid="input-sp-amount" value={spForm.amount} onChange={e => setSpForm({ ...spForm, amount: e.target.value })} placeholder="0" />
            </div>
            <div className="space-y-2">
              <Label>Payment Method</Label>
              <Select value={spForm.paymentMethod} onValueChange={v => setSpForm({ ...spForm, paymentMethod: v })}>
                <SelectTrigger data-testid="select-sp-method">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {["bank_transfer", "cash", "cheque", "upi", "card"].map(m => (
                    <SelectItem key={m} value={m}>{m.replace(/_/g, " ").replace(/^\w/, c => c.toUpperCase())}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Payment Date</Label>
              <Input type="date" data-testid="input-sp-date" value={spForm.paymentDate} onChange={e => setSpForm({ ...spForm, paymentDate: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Reference</Label>
              <Input data-testid="input-sp-reference" value={spForm.reference} onChange={e => setSpForm({ ...spForm, reference: e.target.value })} placeholder="NEFT/Cheque number, etc." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSpDialogOpen(false)}>Cancel</Button>
            <Button
              data-testid="button-submit-supplier-payment"
              disabled={spMutation.isPending || !spForm.supplierId || !spForm.amount ||
                (spForm.paymentType === "regular" && !spForm.supplierInvoiceId) ||
                (spForm.paymentType === "advance" && !spForm.purchaseOrderId)}
              onClick={() => spMutation.mutate({
                paymentType: spForm.paymentType,
                supplierId: spForm.supplierId,
                supplierInvoiceId: spForm.paymentType === "regular" ? spForm.supplierInvoiceId : null,
                purchaseOrderId: spForm.paymentType === "advance" ? spForm.purchaseOrderId : null,
                amount: spForm.amount,
                paymentMethod: spForm.paymentMethod,
                paymentDate: spForm.paymentDate,
                reference: spForm.reference || null,
              })}
            >
              {spMutation.isPending ? "Recording..." : "Record Payment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
