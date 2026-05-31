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
import { Plus, FileText, CreditCard, IndianRupee, TrendingUp, Trash2, AlertCircle, CheckCircle2, ChevronDown, ChevronRight, RotateCcw, Upload, Landmark, Building2, Banknote, Pencil, Power, ArrowLeftRight, SlidersHorizontal, Info as InfoIcon } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import type { SalesInvoice, CustomerPayment, Customer, Supplier, PurchaseOrder, GoodsReceiptNote, SupplierInvoice, SupplierPayment, CashAccount, Product, SalesOrder } from "@shared/schema";
import AttachmentsPanel from "@/components/AttachmentsPanel";
import { useLocation } from "wouter";
import ExpensesTab from "@/components/ExpensesTab";
import { getUser } from "@/lib/auth";

async function uploadSupplierInvoiceSignedCopy(file: File, invoiceId: string): Promise<string> {
  const token = sessionStorage.getItem("token"); // fix: token is in sessionStorage
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

  const [expandedAdvanceSOs, setExpandedAdvanceSOs] = useState<Set<string>>(new Set());
  const toggleAdvanceSO = (key: string) =>
    setExpandedAdvanceSOs(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });

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

  // Deep-link: ?highlight=INV_ID — highlight a supplier invoice row (from Supplier Aging expand)
  const [highlightedInvId] = useState<string | null>(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("highlight") || null;
  });
  useEffect(() => {
    if (!highlightedInvId) return;
    const timer = setTimeout(() => {
      const el = document.querySelector(`[data-si-id="${highlightedInvId}"]`);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 600);
    return () => clearTimeout(timer);
  }, [highlightedInvId]);

  // ── AR Queries ────────────────────────────────────────────────────────────
  const { data: salesInvoices, isLoading: invoicesLoading } = useQuery<SalesInvoice[]>({ queryKey: ["/api/sales-invoices"] });
  const { data: customerPayments, isLoading: paymentsLoading } = useQuery<CustomerPayment[]>({ queryKey: ["/api/customer-payments"] });
  const { data: customers } = useQuery<Customer[]>({ queryKey: ["/api/customers"] });
  const { data: salesOrders = [] } = useQuery<SalesOrder[]>({ queryKey: ["/api/sales-orders"] });
  const { data: creditNotes = [] } = useQuery<any[]>({ queryKey: ["/api/credit-notes"] });

  // ── Phase 4D-A Queries ────────────────────────────────────────────────────
  const isFinanceRole = role === "admin" || role === "accountant";
  const { data: fixedAssetsData = [], isLoading: faLoading } = useQuery<any[]>({ queryKey: ["/api/fixed-assets"], enabled: isFinanceRole });
  const { data: loansData = [], isLoading: loansLoading } = useQuery<any[]>({ queryKey: ["/api/loans"], enabled: isFinanceRole });
  const { data: equityData = [], isLoading: eqLoading } = useQuery<any[]>({ queryKey: ["/api/equity-accounts"], enabled: isFinanceRole });
  const { data: openingBalancesData = [], isLoading: obLoading } = useQuery<any[]>({ queryKey: ["/api/opening-balances"], enabled: isFinanceRole });

  // ── AP Queries ────────────────────────────────────────────────────────────
  const { data: supplierInvoices, isLoading: siLoading } = useQuery<SupplierInvoice[]>({ queryKey: ["/api/supplier-invoices"] });
  const { data: supplierPayments, isLoading: spLoading } = useQuery<SupplierPayment[]>({ queryKey: ["/api/supplier-payments"] });
  const { data: cashAccountsData } = useQuery<(CashAccount & { balance: number })[]>({ queryKey: ["/api/cash-accounts"] });
  // Phase 4B: legacy payments not yet attributed to a specific cash account
  const { data: unattributedSummary } = useQuery<{ count: number; totalAmount: number }>({ queryKey: ["/api/cash-accounts/unattributed-summary"] });
  const { data: suppliers } = useQuery<Supplier[]>({ queryKey: ["/api/suppliers"] });
  const { data: purchaseOrders } = useQuery<PurchaseOrder[]>({ queryKey: ["/api/purchase-orders"] });
  const { data: grns } = useQuery<GoodsReceiptNote[]>({ queryKey: ["/api/grns"] });
  const { data: allProducts } = useQuery<Product[]>({ queryKey: ["/api/products"] });

  // ── AR Summary (from sales_invoices + customer_payments) ─────────────────
  const customerMap = useMemo(() => new Map((customers ?? []).map(c => [c.id, c])), [customers]);
  const soOrderMap = useMemo(() => new Map(salesOrders.map(o => [o.id, o])), [salesOrders]);

  const paidPerSalesInvoice = useMemo(() => {
    const map: Record<string, number> = {};
    (customerPayments ?? []).forEach(p => {
      if (p.invoiceId) map[p.invoiceId] = (map[p.invoiceId] || 0) + Number(p.amount);
    });
    return map;
  }, [customerPayments]);

  // Advance payments — linked to an SO but not yet to any invoice (unearned revenue / liability)
  const soAdvancePayments = useMemo(() =>
    (customerPayments ?? []).filter(p => !p.invoiceId),
  [customerPayments]);

  const totalAdvances = useMemo(() =>
    soAdvancePayments.reduce((s, p) => s + Number(p.amount), 0),
  [soAdvancePayments]);

  // Group advances by Sales Order for the accordion UI
  type AdvanceGroup = {
    soId: string | null;
    soNumber: string;
    customerId: string;
    payments: typeof soAdvancePayments;
    total: number;
    latestDate: Date;
  };
  const advanceGroups = useMemo<AdvanceGroup[]>(() => {
    const map = new Map<string, AdvanceGroup>();
    soAdvancePayments.forEach(p => {
      const key = p.salesOrderId ?? "__no_so__";
      const so = p.salesOrderId ? soOrderMap.get(p.salesOrderId) : undefined;
      if (!map.has(key)) {
        map.set(key, {
          soId: p.salesOrderId ?? null,
          soNumber: so?.orderNumber ?? p.salesOrderId ?? "Unknown SO",
          customerId: p.customerId,
          payments: [],
          total: 0,
          latestDate: new Date(p.paymentDate),
        });
      }
      const g = map.get(key)!;
      g.payments.push(p);
      g.total += Number(p.amount);
      const d = new Date(p.paymentDate);
      if (d > g.latestDate) g.latestDate = d;
    });
    return Array.from(map.values()).sort((a, b) => b.latestDate.getTime() - a.latestDate.getTime());
  }, [soAdvancePayments, soOrderMap]);

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

  // SP tab: group payments by invoice (or PO for unlinked advances)
  const invoicePaymentGroups = useMemo(() => {
    type SpGroup = {
      type: "invoice" | "po_advance";
      key: string;
      label: string;
      supplierId: string;
      supplierName: string;
      invoiceDate?: string;
      dueDate?: string | null;
      total: number;
      paid: number;
      outstanding: number;
      status?: string;
      invoice?: SupplierInvoice;
      payments: SupplierPayment[];
      hasPreInvoicePayment: boolean;
    };

    const groups: SpGroup[] = [];
    const assignedPaymentIds = new Set<string>();

    // Group 1: all supplier invoices (with or without payments)
    (supplierInvoices ?? []).forEach(inv => {
      const invPayments = (supplierPayments ?? []).filter(p => p.supplierInvoiceId === inv.id);
      // Also pick up any advance payments still on the PO (B3 not yet run)
      const poAdvances = inv.purchaseOrderId
        ? (supplierPayments ?? []).filter(p => p.purchaseOrderId === inv.purchaseOrderId && !p.supplierInvoiceId)
        : [];
      const all = [...invPayments, ...poAdvances];
      all.forEach(p => assignedPaymentIds.add(p.id));

      const paid = all.reduce((s, p) => s + Number(p.amount), 0);
      const total = Number(inv.totalAmount ?? 0);
      const outstanding = Math.max(0, total - paid);

      // Detect advance: payment predates the invoice creation date
      const invCreatedAt = (inv as any).createdAt ? new Date((inv as any).createdAt) : null;
      const hasPreInvoicePayment = all.some(p => {
        if (p.paymentType === "advance") return true;
        if (invCreatedAt && new Date(p.paymentDate) < invCreatedAt) return true;
        return false;
      });

      groups.push({
        type: "invoice",
        key: inv.id,
        label: inv.invoiceNumber ?? `SI (PO: ${poMap.get(inv.purchaseOrderId ?? "")?.poNumber ?? "—"})`,
        supplierId: inv.supplierId,
        supplierName: supplierMap.get(inv.supplierId)?.name ?? "—",
        invoiceDate: inv.invoiceDate ? String(inv.invoiceDate) : undefined,
        dueDate: inv.dueDate ? String(inv.dueDate) : null,
        total,
        paid,
        outstanding,
        status: inv.status,
        invoice: inv,
        payments: [...all].sort((a, b) => new Date(a.paymentDate).getTime() - new Date(b.paymentDate).getTime()),
        hasPreInvoicePayment,
      });
    });

    // Group 2: advance payments not yet linked to any invoice, grouped by PO
    const unassigned = (supplierPayments ?? []).filter(p => !assignedPaymentIds.has(p.id));
    const byPo = new Map<string, SupplierPayment[]>();
    const noPo: SupplierPayment[] = [];
    unassigned.forEach(p => {
      if (p.purchaseOrderId) {
        if (!byPo.has(p.purchaseOrderId)) byPo.set(p.purchaseOrderId, []);
        byPo.get(p.purchaseOrderId)!.push(p);
      } else {
        noPo.push(p);
      }
    });
    byPo.forEach((pays, poId) => {
      const po = poMap.get(poId);
      const paid = pays.reduce((s, p) => s + Number(p.amount), 0);
      groups.push({
        type: "po_advance",
        key: `po:${poId}`,
        label: po?.poNumber ?? `PO #${poId.slice(0, 8)}`,
        supplierId: pays[0].supplierId,
        supplierName: supplierMap.get(pays[0].supplierId)?.name ?? "—",
        total: 0, paid, outstanding: 0,
        payments: [...pays].sort((a, b) => new Date(a.paymentDate).getTime() - new Date(b.paymentDate).getTime()),
        hasPreInvoicePayment: true,
      });
    });
    if (noPo.length > 0) {
      groups.push({
        type: "po_advance",
        key: "misc",
        label: "Unlinked Payments",
        supplierId: noPo[0].supplierId,
        supplierName: "—",
        total: 0,
        paid: noPo.reduce((s, p) => s + Number(p.amount), 0),
        outstanding: 0,
        payments: noPo,
        hasPreInvoicePayment: false,
      });
    }

    // Sort by invoice date descending (most recent first)
    groups.sort((a, b) => {
      const aD = a.invoiceDate ?? a.payments[0]?.paymentDate ?? "";
      const bD = b.invoiceDate ?? b.payments[0]?.paymentDate ?? "";
      return new Date(bD).getTime() - new Date(aD).getTime();
    });

    return groups;
  }, [supplierInvoices, supplierPayments, supplierMap, poMap]);

  // ── AR State ──────────────────────────────────────────────────────────────
  const [arPayDialogOpen, setArPayDialogOpen] = useState(false);
  const [arPayForm, setArPayForm] = useState({ invoiceId: "", amount: "", method: "bank_transfer", reference: "", paymentDate: new Date().toISOString().split("T")[0], cashAccountId: "" });

  // ── AP State ──────────────────────────────────────────────────────────────
  const [expandedSiIds, setExpandedSiIds] = useState<Set<string>>(new Set());
  const [grnItemsMap, setGrnItemsMap] = useState<Record<string, any[]>>({});
  const toggleSiExpanded = async (id: string) => {
    const wasExpanded = expandedSiIds.has(id);
    setExpandedSiIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
    if (!wasExpanded) {
      const inv = supplierInvoices?.find(si => si.id === id);
      const grnId = (inv as any)?.grnId || grns?.find(g => g.purchaseOrderId === inv?.purchaseOrderId)?.id;
      if (grnId && !grnItemsMap[grnId]) {
        try {
          const res = await fetch(`/api/grns/${grnId}/items`, { headers: { Authorization: `Bearer ${sessionStorage.getItem("token")}` } });
          const items = await res.json();
          setGrnItemsMap(prev => ({ ...prev, [grnId]: Array.isArray(items) ? items : [] }));
        } catch {
          setGrnItemsMap(prev => ({ ...prev, [grnId]: [] }));
        }
      }
    }
  };
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
  const [siRecordedFile, setSiRecordedFile] = useState<File | null>(null);
  const [siRecordedFileUrl, setSiRecordedFileUrl] = useState<string | null>(null);
  const [siRecordedUploading, setSiRecordedUploading] = useState(false);
  // F4: Cancel dialog
  const [siCancelId, setSiCancelId] = useState<string | null>(null);

  const [spDialogOpen, setSpDialogOpen] = useState(false);
  const [spForm, setSpForm] = useState({
    paymentType: "regular", supplierId: "", supplierInvoiceId: "",
    purchaseOrderId: "", amount: "", paymentMethod: "bank_transfer",
    paymentDate: new Date().toISOString().split("T")[0], reference: "", cashAccountId: "",
  });
  // SP tab redesign state
  const [expandedSpGroups, setExpandedSpGroups] = useState<Set<string>>(new Set());
  const [spSupplierFilter, setSpSupplierFilter] = useState<string>("all");
  const [spStatusFilter, setSpStatusFilter] = useState<string>("all");

  // ── Cash Accounts CRUD state (Phase 4B) ─────────────────────────────────
  const [caDialogOpen, setCaDialogOpen] = useState(false);
  const [caEditing, setCaEditing] = useState<CashAccount | null>(null);
  const [caForm, setCaForm] = useState({ name: "", type: "bank", bankName: "", accountNumber: "", ifscCode: "", openingBalance: "0", openingBalanceDate: new Date().toISOString().split("T")[0], notes: "" });
  const [caDeactivateId, setCaDeactivateId] = useState<string | null>(null);
  const [, setLocation] = useLocation();

  // Phase 4B (mm): auto-open Edit dialog when navigated from CashAccountDetail with ?editId=<id>
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const editId = params.get("editId");
    if (!editId || !cashAccountsData) return;
    const acct = cashAccountsData.find(a => a.id === editId);
    if (!acct) return;
    setActiveAccountsTab("cash-accounts");
    setCaEditing(acct);
    setCaForm({
      name: acct.name,
      type: acct.type,
      bankName: acct.bankName ?? "",
      accountNumber: acct.accountNumber ?? "",
      ifscCode: acct.ifscCode ?? "",
      openingBalance: String(acct.openingBalance ?? "0"),
      openingBalanceDate: (acct as any).openingBalanceDate
        ? new Date((acct as any).openingBalanceDate).toISOString().split("T")[0]
        : new Date().toISOString().split("T")[0],
      notes: (acct as any).notes ?? "",
    });
    setCaDialogOpen(true);
    // Strip the editId param so refresh / dialog-close won't re-open
    params.delete("editId");
    const newSearch = params.toString();
    const newUrl = window.location.pathname + (newSearch ? `?${newSearch}` : "") + window.location.hash;
    window.history.replaceState(null, "", newUrl);
  }, [cashAccountsData]);

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

  // ── Smart account filter helpers (Phase 4B) ─────────────────────────────
  // Determines which accounts to show based on payment method type
  function accountsForMethod(method: string): (CashAccount & { balance: number })[] {
    if (!cashAccountsData) return [];
    const isCashMethod = method === "cash";
    return cashAccountsData.filter(a => a.isActive && (isCashMethod ? a.type === "cash" : a.type === "bank"));
  }

  const arPayAccounts = useMemo(() => accountsForMethod(arPayForm.method), [cashAccountsData, arPayForm.method]);
  const spAccounts = useMemo(() => accountsForMethod(spForm.paymentMethod), [cashAccountsData, spForm.paymentMethod]);

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
      queryClient.invalidateQueries({ queryKey: ["/api/cash-accounts"] });
      toast({ title: "Payment recorded successfully" });
      setArPayDialogOpen(false);
      setArPayForm({ invoiceId: "", amount: "", method: "bank_transfer", reference: "", paymentDate: new Date().toISOString().split("T")[0], cashAccountId: "" });
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
    mutationFn: async ({ id, extInvoiceNumber, extInvoiceDate }: {
      id: string; extInvoiceNumber: string; extInvoiceDate: string;
    }) => {
      const res = await apiRequest("POST", `/api/supplier-invoices/${id}/mark-recorded`, {
        extInvoiceNumber, extInvoiceDate,
      });
      if (!res.ok) { const b = await res.json(); throw new Error(b.message || "Failed to mark as recorded"); }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/supplier-invoices"] });
      toast({ title: "Supplier invoice recorded" });
      setSiRecordedDialog(null);
      setSiRecordedNumber("");
      setSiRecordedDate(new Date().toISOString().split("T")[0]);
      setSiRecordedFile(null);
      setSiRecordedFileUrl(null);
    },
    onError: (err: Error) => { toast({ title: "Error", description: err.message, variant: "destructive" }); },
  });

  function handleMarkRecordedSubmit() {
    if (!siRecordedDialog) return;
    siMarkRecordedMutation.mutate({
      id: siRecordedDialog.id,
      extInvoiceNumber: siRecordedNumber,
      extInvoiceDate: siRecordedDate,
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
      queryClient.invalidateQueries({ queryKey: ["/api/cash-accounts"] });
      setSpForm({ paymentType: "regular", supplierId: "", supplierInvoiceId: "", purchaseOrderId: "", amount: "", paymentMethod: "bank_transfer", paymentDate: new Date().toISOString().split("T")[0], reference: "", cashAccountId: "" });
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

  // ── Cash Account CRUD mutations (Phase 4B) ──────────────────────────────
  const caMutation = useMutation({
    mutationFn: async (data: any) => {
      if (caEditing) {
        const res = await apiRequest("PATCH", `/api/cash-accounts/${caEditing.id}`, data);
        if (!res.ok) { const b = await res.json(); throw new Error(b.message || "Failed to update"); }
        return res.json();
      } else {
        const res = await apiRequest("POST", "/api/cash-accounts", data);
        if (!res.ok) { const b = await res.json(); throw new Error(b.message || "Failed to create"); }
        return res.json();
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cash-accounts"] });
      toast({ title: caEditing ? "Account updated" : "Account created" });
      setCaDialogOpen(false);
      setCaEditing(null);
      setCaForm({ name: "", type: "bank", bankName: "", accountNumber: "", ifscCode: "", openingBalance: "0", openingBalanceDate: new Date().toISOString().split("T")[0], notes: "" });
    },
    onError: (err: Error) => { toast({ title: "Error", description: err.message, variant: "destructive" }); },
  });

  const caDeactivateMutation = useMutation({
    mutationFn: async ({ id, activate }: { id: string; activate: boolean }) => {
      const res = await apiRequest("PATCH", `/api/cash-accounts/${id}/${activate ? "reactivate" : "deactivate"}`, {});
      if (!res.ok) { const b = await res.json(); throw new Error(b.message || "Failed"); }
      return res.json();
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ["/api/cash-accounts"] });
      toast({ title: vars.activate ? "Account reactivated" : "Account deactivated" });
      setCaDeactivateId(null);
    },
    onError: (err: Error) => { toast({ title: "Error", description: err.message, variant: "destructive" }); },
  });

  // ── Phase 4D-A: Fixed Assets state + mutations ────────────────────────────
  const faBlank = { name: "", category: "equipment", purchaseDate: new Date().toISOString().split("T")[0], purchaseValue: "", salvageValue: "0", usefulLifeYears: "5", depreciationMethod: "slm", notes: "" };
  const [faDialogOpen, setFaDialogOpen] = useState(false);
  const [faEditing, setFaEditing] = useState<any | null>(null);
  const [faForm, setFaForm] = useState<any>(faBlank);
  const [faDeactivateId, setFaDeactivateId] = useState<string | null>(null);

  const faMutation = useMutation({
    mutationFn: async (data: any) => {
      if (faEditing) {
        const res = await apiRequest("PATCH", `/api/fixed-assets/${faEditing.id}`, data);
        if (!res.ok) { const b = await res.json(); throw new Error(b.message || "Failed to update"); }
        return res.json();
      }
      const res = await apiRequest("POST", "/api/fixed-assets", data);
      if (!res.ok) { const b = await res.json(); throw new Error(b.message || "Failed to create"); }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/fixed-assets"] });
      toast({ title: faEditing ? "Asset updated" : "Asset added" });
      setFaDialogOpen(false); setFaEditing(null); setFaForm(faBlank);
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const faDeactivateMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("DELETE", `/api/fixed-assets/${id}`, {});
      if (!res.ok) { const b = await res.json(); throw new Error(b.message || "Failed"); }
      return res.json();
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/fixed-assets"] }); toast({ title: "Asset deactivated" }); setFaDeactivateId(null); },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  // ── Phase 4D-A: Loans state + mutations ──────────────────────────────────
  const loanBlank = { lenderName: "", sanctionedAmount: "", outstandingAmount: "", interestRatePct: "", disbursementDate: new Date().toISOString().split("T")[0], maturityDate: "", repaymentScheduleNotes: "", status: "active", notes: "" };
  const [loanDialogOpen, setLoanDialogOpen] = useState(false);
  const [loanEditing, setLoanEditing] = useState<any | null>(null);
  const [loanForm, setLoanForm] = useState<any>(loanBlank);
  const [loanCloseId, setLoanCloseId] = useState<string | null>(null);

  const loanMutation = useMutation({
    mutationFn: async (data: any) => {
      if (loanEditing) {
        const res = await apiRequest("PATCH", `/api/loans/${loanEditing.id}`, data);
        if (!res.ok) { const b = await res.json(); throw new Error(b.message || "Failed to update"); }
        return res.json();
      }
      const res = await apiRequest("POST", "/api/loans", data);
      if (!res.ok) { const b = await res.json(); throw new Error(b.message || "Failed to create"); }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/loans"] });
      toast({ title: loanEditing ? "Loan updated" : "Loan added" });
      setLoanDialogOpen(false); setLoanEditing(null); setLoanForm(loanBlank);
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const loanCloseMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("DELETE", `/api/loans/${id}`, {});
      if (!res.ok) { const b = await res.json(); throw new Error(b.message || "Failed"); }
      return res.json();
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/loans"] }); toast({ title: "Loan closed" }); setLoanCloseId(null); },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  // ── Phase 4D-A: Equity Accounts state + mutations ─────────────────────────
  const eqBlank = { name: "", accountType: "share_capital", openingBalance: "0", openingBalanceDate: new Date().toISOString().split("T")[0], notes: "" };
  const [eqDialogOpen, setEqDialogOpen] = useState(false);
  const [eqEditing, setEqEditing] = useState<any | null>(null);
  const [eqForm, setEqForm] = useState<any>(eqBlank);
  const [eqDeactivateId, setEqDeactivateId] = useState<string | null>(null);

  const eqMutation = useMutation({
    mutationFn: async (data: any) => {
      if (eqEditing) {
        const res = await apiRequest("PATCH", `/api/equity-accounts/${eqEditing.id}`, data);
        if (!res.ok) { const b = await res.json(); throw new Error(b.message || "Failed to update"); }
        return res.json();
      }
      const res = await apiRequest("POST", "/api/equity-accounts", data);
      if (!res.ok) { const b = await res.json(); throw new Error(b.message || "Failed to create"); }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/equity-accounts"] });
      toast({ title: eqEditing ? "Equity account updated" : "Equity account added" });
      setEqDialogOpen(false); setEqEditing(null); setEqForm(eqBlank);
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const eqDeactivateMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("DELETE", `/api/equity-accounts/${id}`, {});
      if (!res.ok) { const b = await res.json(); throw new Error(b.message || "Failed"); }
      return res.json();
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/equity-accounts"] }); toast({ title: "Equity account deactivated" }); setEqDeactivateId(null); },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  // ── Phase 4D-A: Opening Balances state + mutations ────────────────────────
  const obBlank = { accountType: "accounts_receivable", label: "", amount: "", asOfDate: new Date().toISOString().split("T")[0], notes: "" };
  const [obDialogOpen, setObDialogOpen] = useState(false);
  const [obEditing, setObEditing] = useState<any | null>(null);
  const [obForm, setObForm] = useState<any>(obBlank);
  const [obDeleteId, setObDeleteId] = useState<string | null>(null);

  const obMutation = useMutation({
    mutationFn: async (data: any) => {
      if (obEditing) {
        const res = await apiRequest("PATCH", `/api/opening-balances/${obEditing.id}`, data);
        if (!res.ok) { const b = await res.json(); throw new Error(b.message || "Failed to update"); }
        return res.json();
      }
      const res = await apiRequest("POST", "/api/opening-balances", data);
      if (!res.ok) { const b = await res.json(); throw new Error(b.message || "Failed to create"); }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/opening-balances"] });
      toast({ title: obEditing ? "Opening balance updated" : "Opening balance added" });
      setObDialogOpen(false); setObEditing(null); setObForm(obBlank);
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const obDeleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("DELETE", `/api/opening-balances/${id}`, {});
      if (!res.ok) { const b = await res.json(); throw new Error(b.message || "Failed"); }
      return res.json();
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/opening-balances"] }); toast({ title: "Opening balance deleted" }); setObDeleteId(null); },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  // ── Phase 4D-A: SLM depreciation helper ──────────────────────────────────
  function computeNetBookValue(asset: any): { accumulated: number; netBook: number; isOverride: boolean } {
    const pv = Number(asset.purchaseValue);
    const sv = Number(asset.salvageValue ?? 0);
    const life = Number(asset.usefulLifeYears);
    if (!pv || !life) return { accumulated: 0, netBook: pv, isOverride: false };
    const annualDep = (pv - sv) / life;
    const purchaseDate = new Date(asset.purchaseDate);
    const now = new Date();
    const monthsElapsed = (now.getFullYear() - purchaseDate.getFullYear()) * 12 + (now.getMonth() - purchaseDate.getMonth());
    const yearsElapsed = Math.min(monthsElapsed / 12, life);
    const calcAccumulated = Math.min(annualDep * yearsElapsed, pv - sv);
    if (asset.accumulatedDepOverride != null) {
      const override = Number(asset.accumulatedDepOverride);
      return { accumulated: override, netBook: pv - override, isOverride: true };
    }
    return { accumulated: calcAccumulated, netBook: pv - calcAccumulated, isOverride: false };
  }

  function classifyLoanType(maturityDate: string | null): string {
    if (!maturityDate) return "Short-term";
    const months = (new Date(maturityDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24 * 30.44);
    return months <= 12 ? "Short-term" : "Long-term";
  }

  const OB_TYPE_LABELS: Record<string, string> = {
    accounts_receivable: "Accounts Receivable",
    advance_to_suppliers: "Advance to Suppliers",
    prepaid_expenses: "Prepaid Expenses",
    other_current_asset: "Other Current Asset",
    accounts_payable: "Accounts Payable",
    advance_from_customers: "Advance from Customers",
    other_current_liability: "Other Current Liability",
  };

  // ── AR helpers ────────────────────────────────────────────────────────────
  const openArPayDialog = (invoiceId?: string) => {
    setArPayForm({ invoiceId: invoiceId ?? "", amount: "", method: "bank_transfer", reference: "", paymentDate: new Date().toISOString().split("T")[0], cashAccountId: "" });
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
          {!expensesOnly && (
            <TabsTrigger value="so-advances" data-testid="tab-so-advances" className="relative">
              SO Advances
              {soAdvancePayments.length > 0 && (
                <span className="ml-1.5 inline-flex items-center justify-center rounded-full bg-amber-500 text-white text-[10px] font-bold h-4 w-4">
                  {soAdvancePayments.length}
                </span>
              )}
            </TabsTrigger>
          )}
          {/* Credit Notes tab hidden — not in use: {!expensesOnly && <TabsTrigger value="credit-notes" data-testid="tab-credit-notes">Credit Notes</TabsTrigger>} */}
          {!expensesOnly && <TabsTrigger value="supplier-invoices" data-testid="tab-supplier-invoices">Supplier Invoices</TabsTrigger>}
          {!expensesOnly && <TabsTrigger value="supplier-payments" data-testid="tab-supplier-payments">Supplier Payments</TabsTrigger>}
          <TabsTrigger value="expenses" data-testid="tab-expenses">Expenses</TabsTrigger>
          {isFinanceRole && <TabsTrigger value="cash-position" data-testid="tab-cash-position">Cash Position</TabsTrigger>}
          {isFinanceRole && <TabsTrigger value="cash-accounts" data-testid="tab-cash-accounts">Cash Accounts</TabsTrigger>}
          {isFinanceRole && <TabsTrigger value="fixed-assets" data-testid="tab-fixed-assets">Fixed Assets</TabsTrigger>}
          {isFinanceRole && <TabsTrigger value="loans" data-testid="tab-loans">Loans</TabsTrigger>}
          {isFinanceRole && <TabsTrigger value="equity" data-testid="tab-equity">Equity</TabsTrigger>}
          {isFinanceRole && <TabsTrigger value="opening-balances" data-testid="tab-opening-balances">Opening Balances</TabsTrigger>}
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

        {/* ── SO Advances (Unearned Revenue / Liability) ─────────────────── */}
        <TabsContent value="so-advances" className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">
                {advanceGroups.length} sales order{advanceGroups.length !== 1 ? "s" : ""} with pending advances
                {soAdvancePayments.length !== advanceGroups.length && (
                  <span className="text-muted-foreground/60"> · {soAdvancePayments.length} payment{soAdvancePayments.length !== 1 ? "s" : ""} total</span>
                )}
              </p>
              <p className="text-xs text-amber-600 mt-0.5">
                These are advance receipts not yet linked to a tax invoice — they represent a liability (unearned revenue) until the challan is dispatched.
              </p>
            </div>
            {totalAdvances > 0 && (
              <div className="text-right">
                <p className="text-xs text-muted-foreground">Total Held</p>
                <p className="text-lg font-bold text-amber-600">₹{totalAdvances.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
              </div>
            )}
          </div>
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/40">
                      <th className="w-8 p-3" />
                      <th className="text-left p-3 font-medium text-muted-foreground">Sales Order</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">Customer</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">Payments</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">Latest Date</th>
                      <th className="text-right p-3 font-medium text-muted-foreground">Total Advance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paymentsLoading ? (
                      <tr><td colSpan={6} className="p-3"><Skeleton className="h-4 w-full" /></td></tr>
                    ) : advanceGroups.length > 0 ? (
                      advanceGroups.map((group) => {
                        const customer = customerMap.get(group.customerId);
                        const key = group.soId ?? "__no_so__";
                        const isExpanded = expandedAdvanceSOs.has(key);
                        const methods = [...new Set(group.payments.map(p => p.method.replace(/_/g, " ")))].join(", ");
                        return (
                          <Fragment key={key}>
                            {/* ── Group summary row (clickable) ── */}
                            <tr
                              className="border-b hover:bg-amber-50/40 dark:hover:bg-amber-950/10 cursor-pointer transition-colors"
                              onClick={() => toggleAdvanceSO(key)}
                              data-testid={`row-advance-group-${key}`}
                            >
                              <td className="p-3 text-center">
                                <ChevronRight className={`w-4 h-4 text-muted-foreground transition-transform duration-150 ${isExpanded ? "rotate-90" : ""}`} />
                              </td>
                              <td className="p-3 font-mono text-xs font-semibold">{group.soNumber}</td>
                              <td className="p-3 font-medium">{customer?.name ?? "—"}</td>
                              <td className="p-3 text-muted-foreground">
                                <span className="inline-flex items-center gap-1.5">
                                  <span className="inline-flex items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400 text-[10px] font-bold h-5 px-1.5">
                                    {group.payments.length}
                                  </span>
                                  <span className="capitalize text-xs">{methods}</span>
                                </span>
                              </td>
                              <td className="p-3 text-muted-foreground text-xs">
                                {group.latestDate.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                              </td>
                              <td className="p-3 text-right font-bold text-amber-600">
                                ₹{group.total.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </td>
                            </tr>

                            {/* ── Expanded individual payment rows ── */}
                            {isExpanded && group.payments.map((pay, pi) => (
                              <tr
                                key={pay.id}
                                className={`border-b bg-muted/20 dark:bg-muted/10 ${pi === group.payments.length - 1 ? "border-b-2 border-amber-200 dark:border-amber-800" : ""}`}
                                data-testid={`row-advance-${pay.id}`}
                              >
                                <td className="p-2 pl-6 text-center text-muted-foreground/40 text-xs">└</td>
                                <td className="p-2 font-mono text-[11px] text-muted-foreground">
                                  {new Date(pay.paymentDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                                </td>
                                <td className="p-2 text-muted-foreground text-xs">—</td>
                                <td className="p-2 capitalize text-xs text-muted-foreground">{pay.method.replace(/_/g, " ")}</td>
                                <td className="p-2 text-xs text-muted-foreground truncate max-w-[200px]">{pay.reference || "—"}</td>
                                <td className="p-2 text-right font-medium text-amber-600 text-xs">
                                  ₹{Number(pay.amount).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </td>
                              </tr>
                            ))}
                          </Fragment>
                        );
                      })
                    ) : (
                      <tr>
                        <td colSpan={6} className="p-8 text-center text-muted-foreground">
                          No pending advances — all advance receipts have been linked to invoices.
                        </td>
                      </tr>
                    )}
                  </tbody>
                  {advanceGroups.length > 0 && (
                    <tfoot>
                      <tr className="border-t bg-amber-50/60 dark:bg-amber-950/20">
                        <td colSpan={5} className="p-3 font-semibold text-amber-700 dark:text-amber-400 text-sm">Total Unearned Revenue (Liability)</td>
                        <td className="p-3 text-right font-bold text-amber-700 dark:text-amber-400">
                          ₹{totalAdvances.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                      </tr>
                    </tfoot>
                  )}
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
                            <tr
                              className={`border-b last:border-0 ${uploadStatus === "cancelled" ? "opacity-50" : ""} ${highlightedInvId === inv.id ? "ring-2 ring-inset ring-blue-400 bg-blue-50/60 dark:bg-blue-950/20" : ""}`}
                              data-testid={`row-supplier-invoice-${inv.id}`}
                              data-si-id={inv.id}
                            >
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
                                        setSiRecordedFile(null);
                                        setSiRecordedFileUrl((inv as any).signedCopyUrl ?? null);
                                      }}>
                                      <CheckCircle2 className="w-3 h-3 mr-1" /> Record
                                    </Button>
                                  )}
                                  {uploadStatus === "recorded" && (inv as any).signedCopyUrl && (
                                    <Button size="sm" variant="outline" className="h-7 text-xs" data-testid={`button-si-view-${inv.id}`}
                                      onClick={() => window.open((inv as any).signedCopyUrl, "_blank")}>
                                      <FileText className="w-3 h-3 mr-1" /> View
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
                            {isExpanded && (() => {
                              const grnId = (inv as any)?.grnId || grns?.find(g => g.purchaseOrderId === inv.purchaseOrderId)?.id;
                              const grnItems: any[] = grnId ? (grnItemsMap[grnId] ?? []) : [];
                              return (
                              <tr key={`${inv.id}-attach`} className="border-b last:border-0">
                                <td colSpan={11} className="p-0">
                                  <div className="bg-muted/30 px-6 py-4 ml-8 space-y-4">
                                    {grnItems.length > 0 && (
                                      <div>
                                        <p className="text-xs font-semibold text-muted-foreground mb-2">GRN Line Items</p>
                                        <div className="rounded-md border overflow-hidden">
                                          <table className="w-full text-xs">
                                            <thead>
                                              <tr className="bg-muted/40 border-b">
                                                <th className="text-left px-3 py-1.5 font-medium text-muted-foreground">Product</th>
                                                <th className="text-left px-3 py-1.5 font-medium text-muted-foreground">SKU</th>
                                                <th className="text-left px-3 py-1.5 font-medium text-muted-foreground">HSN</th>
                                                <th className="text-center px-3 py-1.5 font-medium text-muted-foreground">Qty Received</th>
                                                <th className="text-right px-3 py-1.5 font-medium text-muted-foreground">Buying Price</th>
                                                <th className="text-right px-3 py-1.5 font-medium text-muted-foreground">Total Cost</th>
                                              </tr>
                                            </thead>
                                            <tbody>
                                              {grnItems.map((gi: any, i: number) => {
                                                const prod = allProducts?.find(p => p.id === gi.productId);
                                                const qty = Number(gi.receivedQuantity ?? gi.quantity ?? 0);
                                                const price = Number(gi.buyingPrice ?? gi.unitCost ?? 0);
                                                const total = qty * price;
                                                return (
                                                  <tr key={i} className="border-b last:border-0" data-testid={`row-grn-item-${gi.id}`}>
                                                    <td className="px-3 py-1.5 font-medium">{prod?.name || gi.productId || "—"}</td>
                                                    <td className="px-3 py-1.5 text-muted-foreground">{(prod as any)?.sku || "—"}</td>
                                                    <td className="px-3 py-1.5 text-muted-foreground">{(prod as any)?.hsnCode || "—"}</td>
                                                    <td className="px-3 py-1.5 text-center">{qty}</td>
                                                    <td className="px-3 py-1.5 text-right">₹{price.toLocaleString("en-IN")}</td>
                                                    <td className="px-3 py-1.5 text-right font-medium">₹{total.toLocaleString("en-IN")}</td>
                                                  </tr>
                                                );
                                              })}
                                            </tbody>
                                          </table>
                                        </div>
                                      </div>
                                    )}

                                    {/* ── Invoice amount breakdown (Subtotal / GST / Grand Total) ── */}
                                    {(() => {
                                      const grandTotal  = Number(inv.totalAmount ?? 0);
                                      const taxAmt      = Number((inv as any).taxAmount ?? 0);
                                      const subtotalAmt = (inv as any).subtotal != null
                                        ? Number((inv as any).subtotal)
                                        : grandTotal - taxAmt;
                                      const fmt = (v: number) =>
                                        "₹" + v.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                                      return (
                                        <div className="flex justify-end">
                                          <div className="w-72 text-xs space-y-1.5 bg-background border rounded-md px-4 py-3">
                                            <div className="flex justify-between items-center">
                                              <span className="text-muted-foreground">Subtotal (excl. GST)</span>
                                              <span className="font-mono">{fmt(subtotalAmt)}</span>
                                            </div>
                                            <div className="flex justify-between items-center">
                                              <span className="text-muted-foreground">+ Total GST</span>
                                              <span className="font-mono text-amber-600 dark:text-amber-400">+ {fmt(taxAmt)}</span>
                                            </div>
                                            <div className="flex justify-between items-center border-t pt-1.5 font-semibold text-sm">
                                              <span>Grand Total</span>
                                              <span className="font-mono">{fmt(grandTotal)}</span>
                                            </div>
                                          </div>
                                        </div>
                                      );
                                    })()}

                                    <AttachmentsPanel entityType="supplier_invoice" entityId={inv.id} module="accounts" />
                                  </div>
                                </td>
                              </tr>
                              );
                            })()}
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
          {/* Header */}
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              {supplierPayments?.length ?? 0} payment(s) across {invoicePaymentGroups.filter(g => g.payments.length > 0).length} invoice(s)
            </p>
            <Button data-testid="button-record-supplier-payment" onClick={() => setSpDialogOpen(true)}>
              <CreditCard className="w-4 h-4 mr-2" />
              Record Payment
            </Button>
          </div>

          {/* Summary cards */}
          {(() => {
            const allPays = supplierPayments ?? [];
            const totalPaid = allPays.reduce((s, p) => s + Number(p.amount), 0);
            const advancePays = allPays.filter(p => p.paymentType === "advance");
            const advancePaid = advancePays.reduce((s, p) => s + Number(p.amount), 0);
            const regularPaid = totalPaid - advancePaid;
            const fmt = (v: number) => "₹" + v.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            return (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Card>
                  <CardContent className="p-4">
                    <p className="text-xs text-muted-foreground mb-1">Total Payments</p>
                    <p className="text-xl font-bold">{fmt(totalPaid)}</p>
                    <p className="text-xs text-muted-foreground">{allPays.length} transaction(s)</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4">
                    <p className="text-xs text-muted-foreground mb-1">Regular Payments</p>
                    <p className="text-xl font-bold">{fmt(regularPaid)}</p>
                    <p className="text-xs text-muted-foreground">{allPays.filter(p => p.paymentType !== "advance").length} transaction(s)</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4">
                    <p className="text-xs text-muted-foreground mb-1">Advance Payments</p>
                    <p className="text-xl font-bold text-amber-600 dark:text-amber-400">{fmt(advancePaid)}</p>
                    <p className="text-xs text-muted-foreground">{advancePays.length} transaction(s)</p>
                  </CardContent>
                </Card>
              </div>
            );
          })()}

          {/* Filters */}
          <div className="flex items-center gap-3 flex-wrap">
            <Select value={spSupplierFilter} onValueChange={setSpSupplierFilter}>
              <SelectTrigger className="w-52">
                <SelectValue placeholder="All Suppliers" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Suppliers</SelectItem>
                {(suppliers ?? []).map(s => (
                  <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={spStatusFilter} onValueChange={setSpStatusFilter}>
              <SelectTrigger className="w-44">
                <SelectValue placeholder="All Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="paid">Fully Paid</SelectItem>
                <SelectItem value="partial">Partially Paid</SelectItem>
                <SelectItem value="unpaid">Unpaid / Pending</SelectItem>
                <SelectItem value="advance">Has Advance</SelectItem>
              </SelectContent>
            </Select>
            {(spSupplierFilter !== "all" || spStatusFilter !== "all") && (
              <Button variant="ghost" size="sm" onClick={() => { setSpSupplierFilter("all"); setSpStatusFilter("all"); }}>
                Clear filters
              </Button>
            )}
          </div>

          {/* Invoice-grouped rows */}
          {(() => {
            const fmt = (v: number) => "₹" + v.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            const filteredGroups = invoicePaymentGroups.filter(g => {
              if (spSupplierFilter !== "all" && g.supplierId !== spSupplierFilter) return false;
              if (spStatusFilter === "paid") return g.status === "paid" || (g.type === "po_advance" && g.paid > 0);
              if (spStatusFilter === "partial") return g.status === "partial" || g.status === "partial_paid";
              if (spStatusFilter === "unpaid") return g.status === "unpaid" || g.status === "pending" || g.status === "overdue";
              if (spStatusFilter === "advance") return g.hasPreInvoicePayment || g.type === "po_advance";
              return true;
            });

            return (
              <Card>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-muted/30">
                          <th className="w-8 p-3"></th>
                          <th className="text-left p-3 font-medium text-muted-foreground">Invoice / Linked To</th>
                          <th className="text-left p-3 font-medium text-muted-foreground">Supplier</th>
                          <th className="text-left p-3 font-medium text-muted-foreground">Date</th>
                          <th className="text-left p-3 font-medium text-muted-foreground">Due Date</th>
                          <th className="text-right p-3 font-medium text-muted-foreground">Invoice Total</th>
                          <th className="text-right p-3 font-medium text-muted-foreground">Total Paid</th>
                          <th className="text-right p-3 font-medium text-muted-foreground">Outstanding</th>
                          <th className="text-left p-3 font-medium text-muted-foreground">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {spLoading ? (
                          <tr><td colSpan={9} className="p-3"><Skeleton className="h-4 w-full" /></td></tr>
                        ) : filteredGroups.length > 0 ? (
                          filteredGroups.map(group => (
                            <Fragment key={group.key}>
                              {/* Group header row */}
                              <tr
                                className={`border-b transition-colors ${group.payments.length > 0 ? "hover:bg-muted/30 cursor-pointer" : "opacity-60"}`}
                                onClick={() => {
                                  if (group.payments.length === 0) return;
                                  setExpandedSpGroups(prev => {
                                    const n = new Set(prev);
                                    n.has(group.key) ? n.delete(group.key) : n.add(group.key);
                                    return n;
                                  });
                                }}
                              >
                                <td className="p-3 text-muted-foreground">
                                  {group.payments.length > 0
                                    ? expandedSpGroups.has(group.key)
                                      ? <ChevronDown className="w-4 h-4" />
                                      : <ChevronRight className="w-4 h-4" />
                                    : null}
                                </td>
                                <td className="p-3">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="font-medium">{group.label}</span>
                                    {group.hasPreInvoicePayment && (
                                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-400">
                                        Advance Applied
                                      </span>
                                    )}
                                    {group.payments.length > 0 && (
                                      <span className="text-xs text-muted-foreground">
                                        {group.payments.length} payment{group.payments.length > 1 ? "s" : ""}
                                      </span>
                                    )}
                                  </div>
                                </td>
                                <td className="p-3 font-medium">{group.supplierName}</td>
                                <td className="p-3 text-muted-foreground">
                                  {group.invoiceDate ? new Date(group.invoiceDate).toLocaleDateString() : "—"}
                                </td>
                                <td className="p-3 text-muted-foreground">
                                  {group.dueDate ? new Date(group.dueDate).toLocaleDateString() : "—"}
                                </td>
                                <td className="p-3 text-right font-medium">
                                  {group.total > 0 ? fmt(group.total) : "—"}
                                </td>
                                <td className="p-3 text-right font-medium text-green-700 dark:text-green-400">
                                  {group.paid > 0 ? fmt(group.paid) : "—"}
                                </td>
                                <td className="p-3 text-right font-medium">
                                  {group.outstanding > 0
                                    ? <span className="text-red-600 dark:text-red-400">{fmt(group.outstanding)}</span>
                                    : group.total > 0
                                      ? <span className="text-green-600 dark:text-green-400">₹0.00</span>
                                      : "—"}
                                </td>
                                <td className="p-3">
                                  {group.type === "po_advance"
                                    ? <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-950/40 dark:text-blue-400">Advance</span>
                                    : group.status ? <StatusBadge status={group.status} /> : null}
                                </td>
                              </tr>

                              {/* Expanded payments sub-table */}
                              {expandedSpGroups.has(group.key) && group.payments.length > 0 && (
                                <tr className="border-b bg-muted/5">
                                  <td colSpan={9} className="p-0">
                                    <div className="mx-4 my-3 border rounded-md overflow-hidden">
                                      {group.hasPreInvoicePayment && (
                                        <div className="flex items-start gap-2 px-3 py-2 bg-amber-50 dark:bg-amber-950/20 text-amber-800 dark:text-amber-300 text-xs border-b">
                                          <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                                          <span>
                                            An advance payment was made against the purchase order before this invoice was generated — it has been automatically applied toward the invoice balance.
                                          </span>
                                        </div>
                                      )}
                                      <table className="w-full text-xs">
                                        <thead>
                                          <tr className="border-b bg-muted/20">
                                            <th className="text-left px-3 py-2 font-medium text-muted-foreground">Date</th>
                                            <th className="text-left px-3 py-2 font-medium text-muted-foreground">Type</th>
                                            <th className="text-left px-3 py-2 font-medium text-muted-foreground">Method</th>
                                            <th className="text-left px-3 py-2 font-medium text-muted-foreground">Reference</th>
                                            <th className="text-right px-3 py-2 font-medium text-muted-foreground">Amount</th>
                                            <th className="text-right px-3 py-2 font-medium text-muted-foreground">Actions</th>
                                          </tr>
                                        </thead>
                                        <tbody>
                                          {group.payments.map(pay => {
                                            const invCreated = group.invoice ? new Date((group.invoice as any).createdAt ?? (group.invoice as any).invoiceDate) : null;
                                            const isAdvance = pay.paymentType === "advance" || (invCreated !== null && new Date(pay.paymentDate) < invCreated);
                                            return (
                                              <tr key={pay.id} className="border-b last:border-0" data-testid={`row-supplier-payment-${pay.id}`}>
                                                <td className="px-3 py-2 text-muted-foreground">{new Date(pay.paymentDate).toLocaleDateString()}</td>
                                                <td className="px-3 py-2">
                                                  <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${isAdvance ? "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-400" : "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300"}`}>
                                                    {isAdvance ? "Advance" : "Regular"}
                                                  </span>
                                                </td>
                                                <td className="px-3 py-2 capitalize">{pay.paymentMethod.replace(/_/g, " ")}</td>
                                                <td className="px-3 py-2 text-muted-foreground">{pay.reference || "—"}</td>
                                                <td className="px-3 py-2 text-right font-medium">{fmt(Number(pay.amount))}</td>
                                                <td className="px-3 py-2 text-right">
                                                  <Button size="icon" variant="ghost" className="h-6 w-6"
                                                    data-testid={`button-delete-supplier-payment-${pay.id}`}
                                                    onClick={e => { e.stopPropagation(); if (confirm("Delete this payment?")) deleteSpMutation.mutate(pay.id); }}>
                                                    <Trash2 className="w-3 h-3" />
                                                  </Button>
                                                </td>
                                              </tr>
                                            );
                                          })}
                                        </tbody>
                                      </table>
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </Fragment>
                          ))
                        ) : (
                          <tr>
                            <td colSpan={9} className="p-8 text-center text-muted-foreground">
                              {supplierPayments && supplierPayments.length > 0
                                ? "No results match the current filters."
                                : "No supplier payments recorded."}
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            );
          })()}
        </TabsContent>

        {/* ── Cash Position Tab ─────────────────────────────────────────── */}
        {role === "admin" && (
          <TabsContent value="cash-position" className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">Live balances across all cash and bank accounts.</p>
              <Button size="sm" variant="outline" onClick={() => { setActiveAccountsTab("cash-accounts"); }} data-testid="button-manage-accounts">
                <SlidersHorizontal className="h-4 w-4 mr-2" /> Manage Accounts
              </Button>
            </div>
            {unattributedSummary && unattributedSummary.count > 0 && (
              <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200" data-testid="banner-unattributed-payments">
                <InfoIcon className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <div>
                  <span className="font-medium">₹{Number(unattributedSummary.totalAmount).toLocaleString()}</span> across <span className="font-medium">{unattributedSummary.count}</span> legacy payment{unattributedSummary.count === 1 ? "" : "s"} not attributed to a specific account. These rows pre-date account tracking and are excluded from the per-account balances above.
                </div>
              </div>
            )}

            {cashAccountsData && (() => {
              const totalBank = cashAccountsData.filter(a => a.type === "bank").reduce((s, a) => s + Number(a.balance), 0);
              const totalCash = cashAccountsData.filter(a => a.type === "cash").reduce((s, a) => s + Number(a.balance), 0);
              const netBalance = totalBank + totalCash;
              return (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <Card>
                    <CardContent className="pt-6">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-full bg-blue-100 dark:bg-blue-950/40 flex items-center justify-center">
                          <Landmark className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground uppercase tracking-wide">Bank Total</p>
                          <p className={`text-xl font-bold ${totalBank < 0 ? "text-red-600" : ""}`}>₹{totalBank.toLocaleString()}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-6">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-full bg-emerald-100 dark:bg-emerald-950/40 flex items-center justify-center">
                          <Banknote className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground uppercase tracking-wide">Cash Total</p>
                          <p className={`text-xl font-bold ${totalCash < 0 ? "text-red-600" : ""}`}>₹{totalCash.toLocaleString()}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-6">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-full bg-purple-100 dark:bg-purple-950/40 flex items-center justify-center">
                          <IndianRupee className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground uppercase tracking-wide">Net Position</p>
                          <p className={`text-xl font-bold ${netBalance < 0 ? "text-red-600" : "text-green-600"}`}>₹{netBalance.toLocaleString()}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              );
            })()}

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {(cashAccountsData ?? []).map(acct => (
                <Card key={acct.id} className={`cursor-pointer hover:border-blue-400 transition-colors ${!acct.isActive ? "opacity-50" : ""}`}
                  onClick={() => setLocation(`/accounts/cash-accounts/${acct.id}`)}
                  data-testid={`card-cash-account-${acct.id}`}>
                  <CardContent className="pt-5 pb-4">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2">
                        {acct.type === "bank" ? <Landmark className="h-5 w-5 text-blue-500" /> : <Banknote className="h-5 w-5 text-emerald-500" />}
                        <div>
                          <p className="font-semibold text-sm">{acct.name}</p>
                          <p className="text-xs text-muted-foreground">{acct.type === "bank" ? acct.bankName ?? "Bank" : "Cash"}</p>
                        </div>
                      </div>
                      <Badge variant={acct.isActive ? "default" : "secondary"} className="text-xs">{acct.isActive ? "Active" : "Inactive"}</Badge>
                    </div>
                    <div className="mt-4 flex items-end justify-between">
                      <p className="text-xs text-muted-foreground">Current Balance</p>
                      <p className={`text-xl font-bold ${Number(acct.balance) < 0 ? "text-red-600" : ""}`}>₹{Number(acct.balance).toLocaleString()}</p>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 text-right">Click to view ledger →</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>
        )}

        {/* ── Cash Accounts Tab (admin CRUD) ────────────────────────────── */}
        {role === "admin" && (
          <TabsContent value="cash-accounts" className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">{cashAccountsData?.length ?? 0} account(s). Manage cash drawers and bank accounts.</p>
              <Button size="sm" onClick={() => { setCaEditing(null); setCaForm({ name: "", type: "bank", bankName: "", accountNumber: "", ifscCode: "", openingBalance: "0", openingBalanceDate: new Date().toISOString().split("T")[0], notes: "" }); setCaDialogOpen(true); }} data-testid="button-new-cash-account">
                <Plus className="h-4 w-4 mr-2" /> New Account
              </Button>
            </div>
            <Card>
              <CardContent className="p-0">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/40">
                      <th className="text-left p-3 font-medium text-muted-foreground">Account</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">Type</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">Bank</th>
                      <th className="text-right p-3 font-medium text-muted-foreground">Opening Bal.</th>
                      <th className="text-right p-3 font-medium text-muted-foreground">Current Bal.</th>
                      <th className="text-center p-3 font-medium text-muted-foreground">Status</th>
                      <th className="text-right p-3 font-medium text-muted-foreground">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(cashAccountsData ?? []).map(acct => (
                      <tr key={acct.id} className="border-b hover:bg-muted/20 cursor-pointer" onClick={() => setLocation(`/accounts/cash-accounts/${acct.id}`)} data-testid={`row-cash-account-${acct.id}`}>
                        <td className="p-3 font-medium">{acct.name}</td>
                        <td className="p-3">
                          {acct.type === "bank" ? <span className="flex items-center gap-1"><Landmark className="h-3.5 w-3.5 text-blue-500" /> Bank</span>
                            : <span className="flex items-center gap-1"><Banknote className="h-3.5 w-3.5 text-emerald-500" /> Cash</span>}
                        </td>
                        <td className="p-3 text-muted-foreground">{acct.bankName ?? "—"}</td>
                        <td className="p-3 text-right">₹{Number(acct.openingBalance).toLocaleString()}</td>
                        <td className={`p-3 text-right font-semibold ${Number(acct.balance) < 0 ? "text-red-600" : ""}`}>₹{Number(acct.balance).toLocaleString()}</td>
                        <td className="p-3 text-center">
                          <Badge variant={acct.isActive ? "default" : "secondary"} className="text-xs">{acct.isActive ? "Active" : "Inactive"}</Badge>
                        </td>
                        <td className="p-3 text-right" onClick={e => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-1">
                            <Button size="icon" variant="ghost" title="Edit" data-testid={`button-edit-ca-${acct.id}`}
                              onClick={(e) => { e.stopPropagation(); setCaEditing(acct); setCaForm({ name: acct.name, type: acct.type, bankName: acct.bankName ?? "", accountNumber: acct.accountNumber ?? "", ifscCode: acct.ifscCode ?? "", openingBalance: String(acct.openingBalance ?? "0"), openingBalanceDate: (acct as any).openingBalanceDate ? new Date((acct as any).openingBalanceDate).toISOString().split("T")[0] : new Date().toISOString().split("T")[0], notes: (acct as any).notes ?? "" }); setCaDialogOpen(true); }}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button size="icon" variant="ghost" title={acct.isActive ? "Deactivate" : "Reactivate"} data-testid={`button-toggle-ca-${acct.id}`}
                              onClick={(e) => { e.stopPropagation(); if (acct.isActive) { setCaDeactivateId(acct.id); } else { caDeactivateMutation.mutate({ id: acct.id, activate: true }); } }}>
                              <Power className="h-4 w-4" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {(cashAccountsData ?? []).length === 0 && (
                      <tr><td colSpan={7} className="text-center p-8 text-muted-foreground">No accounts yet. Create one to get started.</td></tr>
                    )}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          </TabsContent>
        )}

        {/* ── Fixed Assets Tab ────────────────────────────────────────────── */}
        {isFinanceRole && (
          <TabsContent value="fixed-assets" className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">{fixedAssetsData.filter((a: any) => a.isActive).length} active asset(s)</p>
              <Button size="sm" onClick={() => { setFaEditing(null); setFaForm(faBlank); setFaDialogOpen(true); }} data-testid="button-add-asset">
                <Plus className="w-4 h-4 mr-2" />Add Asset
              </Button>
            </div>
            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/40">
                        <th className="text-left p-3 font-medium">Name</th>
                        <th className="text-left p-3 font-medium">Category</th>
                        <th className="text-left p-3 font-medium">Purchase Date</th>
                        <th className="text-right p-3 font-medium">Purchase Value</th>
                        <th className="text-left p-3 font-medium">Useful Life</th>
                        <th className="text-right p-3 font-medium">Net Book Value</th>
                        <th className="text-left p-3 font-medium">Status</th>
                        <th className="text-right p-3 font-medium">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {faLoading ? (
                        Array.from({ length: 3 }).map((_, i) => (
                          <tr key={i} className="border-b">
                            {Array.from({ length: 8 }).map((__, j) => <td key={j} className="p-3"><Skeleton className="h-4 w-full" /></td>)}
                          </tr>
                        ))
                      ) : fixedAssetsData.length === 0 ? (
                        <tr><td colSpan={8} className="text-center p-8 text-muted-foreground">No fixed assets yet. Add one to get started.</td></tr>
                      ) : fixedAssetsData.map((asset: any) => {
                        const { netBook, isOverride } = computeNetBookValue(asset);
                        return (
                          <tr key={asset.id} className="border-b hover:bg-muted/20">
                            <td className="p-3 font-medium">
                              {asset.name}
                              {isOverride && <Badge className="ml-2 text-xs bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-400">Auditor Override</Badge>}
                            </td>
                            <td className="p-3 capitalize">{asset.category}</td>
                            <td className="p-3">{asset.purchaseDate}</td>
                            <td className="p-3 text-right">₹{Number(asset.purchaseValue).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                            <td className="p-3">{asset.usefulLifeYears} yr</td>
                            <td className="p-3 text-right font-medium">₹{netBook.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                            <td className="p-3">
                              <Badge className={asset.isActive ? "bg-green-100 text-green-800 dark:bg-green-950/40 dark:text-green-400" : "bg-gray-100 text-gray-500"}>
                                {asset.isActive ? "Active" : "Inactive"}
                              </Badge>
                            </td>
                            <td className="p-3 text-right">
                              <div className="flex items-center justify-end gap-2">
                                <Button variant="ghost" size="sm" data-testid={`button-edit-asset-${asset.id}`} onClick={() => { setFaEditing(asset); setFaForm({ name: asset.name, category: asset.category, purchaseDate: asset.purchaseDate, purchaseValue: String(asset.purchaseValue), salvageValue: String(asset.salvageValue ?? 0), usefulLifeYears: String(asset.usefulLifeYears), depreciationMethod: asset.depreciationMethod, notes: asset.notes ?? "" }); setFaDialogOpen(true); }}><Pencil className="w-4 h-4" /></Button>
                                {asset.isActive && <Button variant="ghost" size="sm" data-testid={`button-deactivate-asset-${asset.id}`} onClick={() => setFaDeactivateId(asset.id)}><Power className="w-4 h-4 text-red-500" /></Button>}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        )}

        {/* ── Loans Tab ───────────────────────────────────────────────────── */}
        {isFinanceRole && (
          <TabsContent value="loans" className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">{loansData.filter((l: any) => l.status === "active").length} active loan(s)</p>
              <Button size="sm" onClick={() => { setLoanEditing(null); setLoanForm(loanBlank); setLoanDialogOpen(true); }} data-testid="button-add-loan">
                <Plus className="w-4 h-4 mr-2" />Add Loan
              </Button>
            </div>
            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/40">
                        <th className="text-left p-3 font-medium">Lender</th>
                        <th className="text-left p-3 font-medium">Type</th>
                        <th className="text-right p-3 font-medium">Sanctioned</th>
                        <th className="text-right p-3 font-medium">Outstanding</th>
                        <th className="text-right p-3 font-medium">Rate %</th>
                        <th className="text-left p-3 font-medium">Disbursement</th>
                        <th className="text-left p-3 font-medium">Maturity</th>
                        <th className="text-left p-3 font-medium">Status</th>
                        <th className="text-right p-3 font-medium">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {loansLoading ? (
                        Array.from({ length: 3 }).map((_, i) => (
                          <tr key={i} className="border-b">
                            {Array.from({ length: 9 }).map((__, j) => <td key={j} className="p-3"><Skeleton className="h-4 w-full" /></td>)}
                          </tr>
                        ))
                      ) : loansData.length === 0 ? (
                        <tr><td colSpan={9} className="text-center p-8 text-muted-foreground">No loans recorded yet.</td></tr>
                      ) : loansData.map((loan: any) => (
                        <tr key={loan.id} className="border-b hover:bg-muted/20">
                          <td className="p-3 font-medium">{loan.lenderName}</td>
                          <td className="p-3">
                            <Badge className={classifyLoanType(loan.maturityDate) === "Short-term" ? "bg-orange-100 text-orange-800 dark:bg-orange-950/40 dark:text-orange-400" : "bg-blue-100 text-blue-800 dark:bg-blue-950/40 dark:text-blue-400"}>
                              {classifyLoanType(loan.maturityDate)}
                            </Badge>
                          </td>
                          <td className="p-3 text-right">₹{Number(loan.sanctionedAmount).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                          <td className="p-3 text-right font-medium">₹{Number(loan.outstandingAmount).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                          <td className="p-3 text-right">{Number(loan.interestRatePct).toFixed(2)}%</td>
                          <td className="p-3">{loan.disbursementDate}</td>
                          <td className="p-3">{loan.maturityDate || "—"}</td>
                          <td className="p-3">
                            <Badge className={loan.status === "active" ? "bg-green-100 text-green-800 dark:bg-green-950/40 dark:text-green-400" : loan.status === "closed" ? "bg-gray-100 text-gray-500" : "bg-red-100 text-red-800"}>
                              {loan.status.charAt(0).toUpperCase() + loan.status.slice(1).replace("_", " ")}
                            </Badge>
                          </td>
                          <td className="p-3 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <Button variant="ghost" size="sm" data-testid={`button-edit-loan-${loan.id}`} onClick={() => { setLoanEditing(loan); setLoanForm({ lenderName: loan.lenderName, sanctionedAmount: String(loan.sanctionedAmount), outstandingAmount: String(loan.outstandingAmount), interestRatePct: String(loan.interestRatePct), disbursementDate: loan.disbursementDate, maturityDate: loan.maturityDate ?? "", repaymentScheduleNotes: loan.repaymentScheduleNotes ?? "", status: loan.status, notes: loan.notes ?? "" }); setLoanDialogOpen(true); }}><Pencil className="w-4 h-4" /></Button>
                              {loan.status === "active" && <Button variant="ghost" size="sm" data-testid={`button-close-loan-${loan.id}`} onClick={() => setLoanCloseId(loan.id)}><Power className="w-4 h-4 text-red-500" /></Button>}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        )}

        {/* ── Equity Tab ──────────────────────────────────────────────────── */}
        {isFinanceRole && (
          <TabsContent value="equity" className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">{equityData.filter((e: any) => e.isActive).length} active equity account(s)</p>
              <Button size="sm" onClick={() => { setEqEditing(null); setEqForm(eqBlank); setEqDialogOpen(true); }} data-testid="button-add-equity">
                <Plus className="w-4 h-4 mr-2" />Add Equity Account
              </Button>
            </div>
            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/40">
                        <th className="text-left p-3 font-medium">Name</th>
                        <th className="text-left p-3 font-medium">Type</th>
                        <th className="text-right p-3 font-medium">Opening Balance</th>
                        <th className="text-left p-3 font-medium">As Of</th>
                        <th className="text-left p-3 font-medium">Notes</th>
                        <th className="text-right p-3 font-medium">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {eqLoading ? (
                        Array.from({ length: 3 }).map((_, i) => (
                          <tr key={i} className="border-b">
                            {Array.from({ length: 6 }).map((__, j) => <td key={j} className="p-3"><Skeleton className="h-4 w-full" /></td>)}
                          </tr>
                        ))
                      ) : equityData.filter((e: any) => e.isActive).length === 0 ? (
                        <tr><td colSpan={6} className="text-center p-8 text-muted-foreground">No equity accounts yet.</td></tr>
                      ) : equityData.filter((e: any) => e.isActive).map((eq: any) => (
                        <tr key={eq.id} className="border-b hover:bg-muted/20">
                          <td className="p-3 font-medium">{eq.name}</td>
                          <td className="p-3 capitalize">{eq.accountType.replace(/_/g, " ")}</td>
                          <td className="p-3 text-right">₹{Number(eq.openingBalance).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                          <td className="p-3">{eq.openingBalanceDate}</td>
                          <td className="p-3 text-muted-foreground text-xs max-w-[200px] truncate">
                            {eq.accountType === "retained_earnings" ? <span className="italic text-blue-600 dark:text-blue-400">ERP P&amp;L added automatically on Balance Sheet</span> : eq.notes ?? "—"}
                          </td>
                          <td className="p-3 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <Button variant="ghost" size="sm" data-testid={`button-edit-equity-${eq.id}`} onClick={() => { setEqEditing(eq); setEqForm({ name: eq.name, accountType: eq.accountType, openingBalance: String(eq.openingBalance), openingBalanceDate: eq.openingBalanceDate, notes: eq.notes ?? "" }); setEqDialogOpen(true); }}><Pencil className="w-4 h-4" /></Button>
                              <Button variant="ghost" size="sm" data-testid={`button-deactivate-equity-${eq.id}`} onClick={() => setEqDeactivateId(eq.id)}><Trash2 className="w-4 h-4 text-red-500" /></Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        )}

        {/* ── Opening Balances Tab ─────────────────────────────────────────── */}
        {isFinanceRole && (
          <TabsContent value="opening-balances" className="space-y-4">
            <div className="rounded-md border border-blue-200 bg-blue-50 dark:bg-blue-950/20 dark:border-blue-800 p-3 flex items-start gap-2">
              <InfoIcon className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" />
              <p className="text-sm text-blue-700 dark:text-blue-300">Enter balances as at your ERP go-live date. These supplement live ERP data on the Balance Sheet.</p>
            </div>
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">{openingBalancesData.length} opening balance entry(s)</p>
              <Button size="sm" onClick={() => { setObEditing(null); setObForm(obBlank); setObDialogOpen(true); }} data-testid="button-add-opening-balance">
                <Plus className="w-4 h-4 mr-2" />Add Opening Balance
              </Button>
            </div>
            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/40">
                        <th className="text-left p-3 font-medium">Label</th>
                        <th className="text-left p-3 font-medium">Account Type</th>
                        <th className="text-right p-3 font-medium">Amount</th>
                        <th className="text-left p-3 font-medium">As Of Date</th>
                        <th className="text-left p-3 font-medium">Notes</th>
                        <th className="text-right p-3 font-medium">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {obLoading ? (
                        Array.from({ length: 3 }).map((_, i) => (
                          <tr key={i} className="border-b">
                            {Array.from({ length: 6 }).map((__, j) => <td key={j} className="p-3"><Skeleton className="h-4 w-full" /></td>)}
                          </tr>
                        ))
                      ) : openingBalancesData.length === 0 ? (
                        <tr><td colSpan={6} className="text-center p-8 text-muted-foreground">No opening balances yet.</td></tr>
                      ) : openingBalancesData.map((ob: any) => (
                        <tr key={ob.id} className="border-b hover:bg-muted/20">
                          <td className="p-3 font-medium">{ob.label}</td>
                          <td className="p-3">{OB_TYPE_LABELS[ob.accountType] ?? ob.accountType}</td>
                          <td className="p-3 text-right">₹{Number(ob.amount).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                          <td className="p-3">{ob.asOfDate}</td>
                          <td className="p-3 text-muted-foreground text-xs max-w-[200px] truncate">{ob.notes ?? "—"}</td>
                          <td className="p-3 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <Button variant="ghost" size="sm" data-testid={`button-edit-ob-${ob.id}`} onClick={() => { setObEditing(ob); setObForm({ accountType: ob.accountType, label: ob.label, amount: String(ob.amount), asOfDate: ob.asOfDate, notes: ob.notes ?? "" }); setObDialogOpen(true); }}><Pencil className="w-4 h-4" /></Button>
                              <Button variant="ghost" size="sm" data-testid={`button-delete-ob-${ob.id}`} onClick={() => setObDeleteId(ob.id)}><Trash2 className="w-4 h-4 text-red-500" /></Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        )}
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
            {arPayAccounts.length > 0 && (
              <div className="space-y-2">
                <Label>Account <span className="text-muted-foreground text-xs">(required)</span></Label>
                <Select value={arPayForm.cashAccountId} onValueChange={(v) => setArPayForm({ ...arPayForm, cashAccountId: v })}>
                  <SelectTrigger data-testid="select-ar-payment-account">
                    <SelectValue placeholder="Select account" />
                  </SelectTrigger>
                  <SelectContent>
                    {arPayAccounts.map(a => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.type === "cash" ? <Banknote className="inline mr-1 h-3 w-3" /> : <Landmark className="inline mr-1 h-3 w-3" />}
                        {a.name}{a.balance !== undefined ? ` — ₹${Number(a.balance).toLocaleString()}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
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
              disabled={arPayMutation.isPending || !arPayForm.invoiceId || !arPayForm.amount || !arPayForm.cashAccountId}
              onClick={() => {
                if (!arPayForm.cashAccountId) {
                  toast({ title: "Account required", description: "Select the account where this payment was received.", variant: "destructive" });
                  return;
                }
                arPayMutation.mutate({
                  invoiceId: arPayForm.invoiceId,
                  amount: arPayForm.amount,
                  method: arPayForm.method,
                  paymentDate: arPayForm.paymentDate,
                  reference: arPayForm.reference || null,
                  cashAccountId: arPayForm.cashAccountId,
                });
              }}
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
                    : filteredPOs.map(po => <SelectItem key={po.id} value={po.id}>{po.poNumber} — ₹{Number((po as any).grandTotal ?? po.totalAmount).toLocaleString()}</SelectItem>)
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
                !siRecordedFileUrl ||
                siMarkRecordedMutation.isPending
              }
              onClick={() => handleMarkRecordedSubmit()}
            >
              {siMarkRecordedMutation.isPending ? "Saving…" : "Mark as Recorded"}
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
        <DialogContent className="w-full max-w-[95vw] sm:max-w-xl md:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Record Supplier Payment</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Payment Type */}
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

            {/* Supplier */}
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

            {/* Invoice / PO — full width */}
            <div className="sm:col-span-2 space-y-2">
              {spForm.paymentType === "advance" ? (
                <>
                  <Label>Purchase Order *</Label>
                  <Select value={spForm.purchaseOrderId} onValueChange={v => setSpForm({ ...spForm, purchaseOrderId: v })} disabled={!spForm.supplierId}>
                    <SelectTrigger data-testid="select-sp-po">
                      <SelectValue placeholder={spForm.supplierId ? "Select PO" : "Select supplier first"} />
                    </SelectTrigger>
                    <SelectContent>
                      {supplierPOs.map(po => <SelectItem key={po.id} value={po.id}>{po.poNumber} — ₹{Number((po as any).grandTotal ?? po.totalAmount).toLocaleString()}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  {spForm.purchaseOrderId && (
                    <p className="text-xs text-muted-foreground">
                      Advance already paid: ₹{Number(poMap.get(spForm.purchaseOrderId)?.advancePaid ?? 0).toLocaleString()}
                    </p>
                  )}
                </>
              ) : (
                <>
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
                </>
              )}
            </div>

            {/* Amount */}
            <div className="space-y-2">
              <Label>Amount (₹) *</Label>
              <Input type="number" data-testid="input-sp-amount" value={spForm.amount} onChange={e => setSpForm({ ...spForm, amount: e.target.value })} placeholder="0" />
            </div>

            {/* Payment Method */}
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

            {/* Account */}
            {spAccounts.length > 0 && (
              <div className="space-y-2 sm:col-span-2">
                <Label>Account <span className="text-muted-foreground text-xs">(required)</span></Label>
                <Select value={spForm.cashAccountId} onValueChange={(v) => setSpForm({ ...spForm, cashAccountId: v })}>
                  <SelectTrigger data-testid="select-sp-account">
                    <SelectValue placeholder="Select account" />
                  </SelectTrigger>
                  <SelectContent>
                    {spAccounts.map(a => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.type === "cash" ? <Banknote className="inline mr-1 h-3 w-3" /> : <Landmark className="inline mr-1 h-3 w-3" />}
                        {a.name}{a.balance !== undefined ? ` — ₹${Number(a.balance).toLocaleString()}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Payment Date */}
            <div className="space-y-2">
              <Label>Payment Date</Label>
              <Input type="date" data-testid="input-sp-date" value={spForm.paymentDate} onChange={e => setSpForm({ ...spForm, paymentDate: e.target.value })} />
            </div>

            {/* Reference */}
            <div className="space-y-2">
              <Label>Reference</Label>
              <Input data-testid="input-sp-reference" value={spForm.reference} onChange={e => setSpForm({ ...spForm, reference: e.target.value })} placeholder="NEFT/Cheque number, etc." />
            </div>
          </div>
          <DialogFooter className="mt-4 flex-col sm:flex-row gap-2">
            <Button variant="outline" className="w-full sm:w-auto" onClick={() => setSpDialogOpen(false)}>Cancel</Button>
            <Button
              className="w-full sm:w-auto"
              data-testid="button-submit-supplier-payment"
              disabled={spMutation.isPending || !spForm.supplierId || !spForm.amount ||
                (spForm.paymentType === "regular" && !spForm.supplierInvoiceId) ||
                (spForm.paymentType === "advance" && !spForm.purchaseOrderId) ||
                !spForm.cashAccountId}
              onClick={() => {
                if (!spForm.cashAccountId) {
                  toast({ title: "Account required", description: "Select the account this payment was made from.", variant: "destructive" });
                  return;
                }
                spMutation.mutate({
                  paymentType: spForm.paymentType,
                  supplierId: spForm.supplierId,
                  supplierInvoiceId: spForm.paymentType === "regular" ? spForm.supplierInvoiceId : null,
                  purchaseOrderId: spForm.paymentType === "advance" ? spForm.purchaseOrderId : null,
                  amount: spForm.amount,
                  paymentMethod: spForm.paymentMethod,
                  paymentDate: spForm.paymentDate,
                  reference: spForm.reference || null,
                  cashAccountId: spForm.cashAccountId,
                });
              }}
            >
              {spMutation.isPending ? "Recording..." : "Record Payment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── duplicate sections removed ─── */}
      {/* ── Cash Account Create/Edit Dialog ─────────────────────────────── */}
      <Dialog open={caDialogOpen} onOpenChange={(o) => { setCaDialogOpen(o); if (!o) { setCaEditing(null); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{caEditing ? "Edit Account" : "New Cash / Bank Account"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Name *</Label>
              <Input data-testid="input-ca-name" value={caForm.name} onChange={e => setCaForm({ ...caForm, name: e.target.value })} placeholder="e.g. HDFC Bank, CEO Cash" />
            </div>
            <div className="space-y-2">
              <Label>Type *</Label>
              <Select value={caForm.type} onValueChange={v => setCaForm({ ...caForm, type: v })}>
                <SelectTrigger data-testid="select-ca-type"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="bank"><Landmark className="inline mr-1 h-3 w-3" /> Bank Account</SelectItem>
                  <SelectItem value="cash"><Banknote className="inline mr-1 h-3 w-3" /> Cash Drawer</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {caForm.type === "bank" && (
              <>
                <div className="space-y-2">
                  <Label>Bank Name</Label>
                  <Input data-testid="input-ca-bank-name" value={caForm.bankName} onChange={e => setCaForm({ ...caForm, bankName: e.target.value })} placeholder="e.g. HDFC Bank" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Account Number</Label>
                    <Input data-testid="input-ca-account-number" value={caForm.accountNumber} onChange={e => setCaForm({ ...caForm, accountNumber: e.target.value })} placeholder="••••1234" />
                  </div>
                  <div className="space-y-2">
                    <Label>IFSC Code</Label>
                    <Input data-testid="input-ca-ifsc" value={caForm.ifscCode} onChange={e => setCaForm({ ...caForm, ifscCode: e.target.value })} placeholder="HDFC0001234" />
                  </div>
                </div>
              </>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Opening Balance (₹)</Label>
                <Input type="number" data-testid="input-ca-opening-balance" value={caForm.openingBalance} onChange={e => setCaForm({ ...caForm, openingBalance: e.target.value })} placeholder="0" />
              </div>
              <div className="space-y-2">
                <Label>As of Date</Label>
                <Input type="date" data-testid="input-ca-opening-balance-date" value={caForm.openingBalanceDate} onChange={e => setCaForm({ ...caForm, openingBalanceDate: e.target.value })} />
              </div>
            </div>
            <p className="text-xs text-muted-foreground -mt-2">Balance at the time of first use. Use 0 if unknown. The "as of date" can be edited later for go-live reconciliation.</p>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea data-testid="textarea-ca-notes" value={caForm.notes} onChange={e => setCaForm({ ...caForm, notes: e.target.value })} placeholder="Optional notes about this account (e.g. signatory, branch, purpose)" rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCaDialogOpen(false)}>Cancel</Button>
            <Button data-testid="button-submit-ca" disabled={caMutation.isPending || !caForm.name || !caForm.type}
              onClick={() => caMutation.mutate({ name: caForm.name, type: caForm.type, bankName: caForm.bankName || null, accountNumber: caForm.accountNumber || null, ifscCode: caForm.ifscCode || null, openingBalance: caForm.openingBalance || "0", openingBalanceDate: caForm.openingBalanceDate, notes: caForm.notes || null })}>
              {caMutation.isPending ? "Saving..." : caEditing ? "Save Changes" : "Create Account"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Deactivate Confirm Dialog ────────────────────────────────────── */}
      <DeactivateAccountDialog
        accountId={caDeactivateId}
        onCancel={() => setCaDeactivateId(null)}
        onConfirm={() => caDeactivateId && caDeactivateMutation.mutate({ id: caDeactivateId, activate: false })}
        isPending={caDeactivateMutation.isPending}
      />

      {/* ── Fixed Asset Add/Edit Dialog ──────────────────────────────────── */}
      <Dialog open={faDialogOpen} onOpenChange={setFaDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{faEditing ? "Edit Asset" : "Add Fixed Asset"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1"><Label>Name *</Label><Input data-testid="input-fa-name" value={faForm.name} onChange={e => setFaForm({ ...faForm, name: e.target.value })} placeholder="e.g. Office Generator" /></div>
            <div className="space-y-1"><Label>Category *</Label>
              <Select value={faForm.category} onValueChange={v => setFaForm({ ...faForm, category: v })}>
                <SelectTrigger data-testid="select-fa-category"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["machinery","vehicle","equipment","furniture","other"].map(c => <SelectItem key={c} value={c} className="capitalize">{c.charAt(0).toUpperCase()+c.slice(1)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label>Purchase Date *</Label><Input type="date" data-testid="input-fa-purchase-date" value={faForm.purchaseDate} onChange={e => setFaForm({ ...faForm, purchaseDate: e.target.value })} /></div>
              <div className="space-y-1"><Label>Useful Life (years) *</Label><Input type="number" data-testid="input-fa-useful-life" value={faForm.usefulLifeYears} onChange={e => setFaForm({ ...faForm, usefulLifeYears: e.target.value })} min="1" /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label>Purchase Value (₹) *</Label><Input type="number" data-testid="input-fa-purchase-value" value={faForm.purchaseValue} onChange={e => setFaForm({ ...faForm, purchaseValue: e.target.value })} placeholder="0" /></div>
              <div className="space-y-1"><Label>Salvage Value (₹)</Label><Input type="number" data-testid="input-fa-salvage-value" value={faForm.salvageValue} onChange={e => setFaForm({ ...faForm, salvageValue: e.target.value })} placeholder="0" /></div>
            </div>
            <div className="space-y-1"><Label>Notes</Label><Textarea data-testid="input-fa-notes" value={faForm.notes} onChange={e => setFaForm({ ...faForm, notes: e.target.value })} rows={2} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFaDialogOpen(false)}>Cancel</Button>
            <Button data-testid="button-save-asset" disabled={faMutation.isPending} onClick={() => faMutation.mutate({ ...faForm, purchaseValue: faForm.purchaseValue, salvageValue: faForm.salvageValue || "0", usefulLifeYears: Number(faForm.usefulLifeYears) })}>
              {faMutation.isPending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Fixed Asset Deactivate Confirm */}
      <Dialog open={!!faDeactivateId} onOpenChange={o => { if (!o) setFaDeactivateId(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Deactivate Asset?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">This asset will be marked inactive and hidden from active lists. No data will be deleted.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFaDeactivateId(null)}>Cancel</Button>
            <Button variant="destructive" data-testid="button-confirm-deactivate-asset" disabled={faDeactivateMutation.isPending} onClick={() => faDeactivateId && faDeactivateMutation.mutate(faDeactivateId)}>
              {faDeactivateMutation.isPending ? "Deactivating..." : "Deactivate"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Loan Add/Edit Dialog ─────────────────────────────────────────── */}
      <Dialog open={loanDialogOpen} onOpenChange={setLoanDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{loanEditing ? "Edit Loan" : "Add Loan"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1"><Label>Lender Name *</Label><Input data-testid="input-loan-lender" value={loanForm.lenderName} onChange={e => setLoanForm({ ...loanForm, lenderName: e.target.value })} placeholder="e.g. HDFC Bank" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label>Sanctioned Amount (₹) *</Label><Input type="number" data-testid="input-loan-sanctioned" value={loanForm.sanctionedAmount} onChange={e => setLoanForm({ ...loanForm, sanctionedAmount: e.target.value })} placeholder="0" /></div>
              <div className="space-y-1"><Label>Outstanding Amount (₹) *</Label><Input type="number" data-testid="input-loan-outstanding" value={loanForm.outstandingAmount} onChange={e => setLoanForm({ ...loanForm, outstandingAmount: e.target.value })} placeholder="0" /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label>Interest Rate (%) *</Label><Input type="number" data-testid="input-loan-rate" value={loanForm.interestRatePct} onChange={e => setLoanForm({ ...loanForm, interestRatePct: e.target.value })} placeholder="0.000" step="0.001" /></div>
              <div className="space-y-1"><Label>Status</Label>
                <Select value={loanForm.status} onValueChange={v => setLoanForm({ ...loanForm, status: v })}>
                  <SelectTrigger data-testid="select-loan-status"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="closed">Closed</SelectItem>
                    <SelectItem value="written_off">Written Off</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label>Disbursement Date *</Label><Input type="date" data-testid="input-loan-disbursement" value={loanForm.disbursementDate} onChange={e => setLoanForm({ ...loanForm, disbursementDate: e.target.value })} /></div>
              <div className="space-y-1"><Label>Maturity Date</Label><Input type="date" data-testid="input-loan-maturity" value={loanForm.maturityDate} onChange={e => setLoanForm({ ...loanForm, maturityDate: e.target.value })} /></div>
            </div>
            <div className="space-y-1"><Label>Repayment Schedule Notes</Label><Textarea data-testid="input-loan-schedule-notes" value={loanForm.repaymentScheduleNotes} onChange={e => setLoanForm({ ...loanForm, repaymentScheduleNotes: e.target.value })} rows={2} placeholder="e.g. EMI ₹25,000/month" /></div>
            <div className="space-y-1"><Label>Notes</Label><Textarea data-testid="input-loan-notes" value={loanForm.notes} onChange={e => setLoanForm({ ...loanForm, notes: e.target.value })} rows={2} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLoanDialogOpen(false)}>Cancel</Button>
            <Button data-testid="button-save-loan" disabled={loanMutation.isPending} onClick={() => loanMutation.mutate(loanForm)}>
              {loanMutation.isPending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Loan Close Confirm */}
      <Dialog open={!!loanCloseId} onOpenChange={o => { if (!o) setLoanCloseId(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Close Loan?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">This will mark the loan as closed. History is preserved.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLoanCloseId(null)}>Cancel</Button>
            <Button variant="destructive" data-testid="button-confirm-close-loan" disabled={loanCloseMutation.isPending} onClick={() => loanCloseId && loanCloseMutation.mutate(loanCloseId)}>
              {loanCloseMutation.isPending ? "Closing..." : "Close Loan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Equity Account Add/Edit Dialog ───────────────────────────────── */}
      <Dialog open={eqDialogOpen} onOpenChange={setEqDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{eqEditing ? "Edit Equity Account" : "Add Equity Account"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1"><Label>Name *</Label><Input data-testid="input-eq-name" value={eqForm.name} onChange={e => setEqForm({ ...eqForm, name: e.target.value })} placeholder="e.g. Paid-up Share Capital" /></div>
            <div className="space-y-1"><Label>Account Type *</Label>
              <Select value={eqForm.accountType} onValueChange={v => setEqForm({ ...eqForm, accountType: v })}>
                <SelectTrigger data-testid="select-eq-type"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="share_capital">Share Capital</SelectItem>
                  <SelectItem value="retained_earnings">Retained Earnings</SelectItem>
                  <SelectItem value="owners_capital">Owner's Capital</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label>Opening Balance (₹) *</Label><Input type="number" data-testid="input-eq-opening-balance" value={eqForm.openingBalance} onChange={e => setEqForm({ ...eqForm, openingBalance: e.target.value })} placeholder="0" /></div>
              <div className="space-y-1"><Label>Opening Balance Date *</Label><Input type="date" data-testid="input-eq-opening-date" value={eqForm.openingBalanceDate} onChange={e => setEqForm({ ...eqForm, openingBalanceDate: e.target.value })} /></div>
            </div>
            {eqForm.accountType === "retained_earnings" && (
              <div className="rounded-md border border-blue-200 bg-blue-50 dark:bg-blue-950/20 p-2 text-xs text-blue-700 dark:text-blue-300">
                ERP P&amp;L will be added automatically on the Balance Sheet.
              </div>
            )}
            <div className="space-y-1"><Label>Notes</Label><Textarea data-testid="input-eq-notes" value={eqForm.notes} onChange={e => setEqForm({ ...eqForm, notes: e.target.value })} rows={2} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEqDialogOpen(false)}>Cancel</Button>
            <Button data-testid="button-save-equity" disabled={eqMutation.isPending} onClick={() => eqMutation.mutate(eqForm)}>
              {eqMutation.isPending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Equity Deactivate Confirm */}
      <Dialog open={!!eqDeactivateId} onOpenChange={o => { if (!o) setEqDeactivateId(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Deactivate Equity Account?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">This account will be hidden from active lists. No data will be deleted.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEqDeactivateId(null)}>Cancel</Button>
            <Button variant="destructive" data-testid="button-confirm-deactivate-equity" disabled={eqDeactivateMutation.isPending} onClick={() => eqDeactivateId && eqDeactivateMutation.mutate(eqDeactivateId)}>
              {eqDeactivateMutation.isPending ? "Deactivating..." : "Deactivate"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Opening Balance Add/Edit Dialog ──────────────────────────────── */}
      <Dialog open={obDialogOpen} onOpenChange={setObDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{obEditing ? "Edit Opening Balance" : "Add Opening Balance"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1"><Label>Label *</Label><Input data-testid="input-ob-label" value={obForm.label} onChange={e => setObForm({ ...obForm, label: e.target.value })} placeholder="e.g. Pre-ERP Trade Receivables" /></div>
            <div className="space-y-1"><Label>Account Type *</Label>
              <Select value={obForm.accountType} onValueChange={v => setObForm({ ...obForm, accountType: v })}>
                <SelectTrigger data-testid="select-ob-type"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(OB_TYPE_LABELS).map(([val, label]) => <SelectItem key={val} value={val}>{label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label>Amount (₹) *</Label><Input type="number" data-testid="input-ob-amount" value={obForm.amount} onChange={e => setObForm({ ...obForm, amount: e.target.value })} placeholder="0" /></div>
              <div className="space-y-1"><Label>As Of Date *</Label><Input type="date" data-testid="input-ob-date" value={obForm.asOfDate} onChange={e => setObForm({ ...obForm, asOfDate: e.target.value })} /></div>
            </div>
            <div className="space-y-1"><Label>Notes</Label><Textarea data-testid="input-ob-notes" value={obForm.notes} onChange={e => setObForm({ ...obForm, notes: e.target.value })} rows={2} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setObDialogOpen(false)}>Cancel</Button>
            <Button data-testid="button-save-ob" disabled={obMutation.isPending} onClick={() => obMutation.mutate(obForm)}>
              {obMutation.isPending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Opening Balance Delete Confirm */}
      <Dialog open={!!obDeleteId} onOpenChange={o => { if (!o) setObDeleteId(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Delete Opening Balance?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">This will permanently delete this opening balance entry. This action cannot be undone.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setObDeleteId(null)}>Cancel</Button>
            <Button variant="destructive" data-testid="button-confirm-delete-ob" disabled={obDeleteMutation.isPending} onClick={() => obDeleteId && obDeleteMutation.mutate(obDeleteId)}>
              {obDeleteMutation.isPending ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function DeactivateAccountDialog({ accountId, onCancel, onConfirm, isPending }: {
  accountId: string | null;
  onCancel: () => void;
  onConfirm: () => void;
  isPending: boolean;
}) {
  const { data: txCountData, isLoading } = useQuery<{ count: number }>({
    queryKey: ["/api/cash-accounts", accountId, "tx-count"],
    queryFn: () => fetch(`/api/cash-accounts/${accountId}/tx-count`, {
      headers: { Authorization: `Bearer ${sessionStorage.getItem("token") || ""}` },
    }).then(r => r.json()),
    enabled: !!accountId,
    staleTime: 0,
  });

  const count = txCountData?.count ?? 0;

  return (
    <Dialog open={!!accountId} onOpenChange={o => { if (!o) onCancel(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Deactivate Account?</DialogTitle></DialogHeader>
        {isLoading ? (
          <p className="text-sm text-muted-foreground" data-testid="text-deactivate-loading">Checking transaction history…</p>
        ) : count === 0 ? (
          <p className="text-sm text-muted-foreground" data-testid="text-deactivate-message">
            Account has 0 transactions. Continue?
          </p>
        ) : (
          <p className="text-sm text-muted-foreground" data-testid="text-deactivate-message">
            Account has {count} transaction{count === 1 ? "" : "s"}. Deactivating will hide it from new payment forms but preserve history. Continue?
          </p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>Cancel</Button>
          <Button variant="destructive" data-testid="button-confirm-deactivate-ca"
            disabled={isPending || isLoading}
            onClick={onConfirm}>
            {isPending ? "Deactivating..." : "Deactivate"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
