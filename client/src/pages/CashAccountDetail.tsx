import { useState, useMemo } from "react";
import { useParams, useLocation, Redirect } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Landmark, Banknote, ArrowLeft, ArrowLeftRight, SlidersHorizontal, TrendingUp, TrendingDown, IndianRupee, ChevronLeft, ChevronRight, Pencil, Filter, X } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { getUser } from "@/lib/auth";
import type { CashAccount } from "@shared/schema";

interface AccountTransaction {
  id: string;
  transactionDate: string;
  type: "customer_payment" | "supplier_payment" | "expense" | "transfer_in" | "transfer_out" | "adjustment";
  description: string;
  reference: string | null;
  counterpartyName: string | null;
  amount: number;
  runningBalance: number;
  linkedEntityId: string | null;
  linkedEntityType: string | null;
  adjustedByName: string | null;
}

interface AccountStats {
  totalIn: number;
  totalOut: number;
  transactionCount: number;
  netChange: number;
  openingBalance: number;
  closingBalance: number;
}

const PAGE_SIZE = 25;

const TYPE_OPTIONS: { value: AccountTransaction["type"]; label: string }[] = [
  { value: "customer_payment", label: "Customer Payment" },
  { value: "supplier_payment", label: "Supplier Payment" },
  { value: "expense", label: "Expense" },
  { value: "transfer_in", label: "Transfer In" },
  { value: "transfer_out", label: "Transfer Out" },
  { value: "adjustment", label: "Adjustment" },
];

function fmt(n: number) {
  const abs = Math.abs(n).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return n < 0 ? `-₹${abs}` : `₹${abs}`;
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function moduleLabel(m: string) {
  const map: Record<string, string> = {
    customer_payment: "AR Payment",
    supplier_payment: "AP Payment",
    expense: "Expense",
    transfer_in: "Transfer In",
    transfer_out: "Transfer Out",
    adjustment: "Adjustment",
  };
  return map[m] ?? m;
}

export default function CashAccountDetail() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const role = getUser()?.role;
  const isAdmin = role === "admin";
  const canAdjust = role === "admin" || role === "accountant";
  const canAccess = role === "admin" || role === "accountant";

  const today = new Date().toISOString().split("T")[0];
  const monthStart = today.slice(0, 7) + "-01";
  const [fromDate, setFromDate] = useState(monthStart);
  const [toDate, setToDate] = useState(today);
  const [page, setPage] = useState(1);
  const [transferOpen, setTransferOpen] = useState(false);
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [typeFilter, setTypeFilter] = useState<Set<AccountTransaction["type"]>>(new Set());

  const { data: allAccounts } = useQuery<(CashAccount & { balance: number })[]>({
    queryKey: ["/api/cash-accounts"],
    enabled: canAccess,
  });

  const fetchAuth = async (url: string) => {
    const token = localStorage.getItem("token");
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error("Request failed");
    return res.json();
  };

  const { data: acctData, isLoading: acctLoading } = useQuery<CashAccount & { balance: number }>({
    queryKey: ["/api/cash-accounts", id],
    queryFn: () => fetchAuth(`/api/cash-accounts/${id}`),
    enabled: !!id && canAccess,
  });

  const { data: statsData, isLoading: statsLoading } = useQuery<AccountStats>({
    queryKey: ["/api/cash-accounts", id, "stats", fromDate, toDate],
    queryFn: () => fetchAuth(`/api/cash-accounts/${id}/stats?fromDate=${fromDate}&toDate=${toDate}`),
    enabled: !!id && canAccess,
  });

  const { data: txData, isLoading: txLoading } = useQuery<{ rows: AccountTransaction[]; total: number }>({
    queryKey: ["/api/cash-accounts", id, "transactions", fromDate, toDate],
    queryFn: () => fetchAuth(`/api/cash-accounts/${id}/transactions?fromDate=${fromDate}&toDate=${toDate}&limit=1000`),
    enabled: !!id && canAccess,
  });

  const isLoading = acctLoading || statsLoading || txLoading;
  const data = acctData ? { ...acctData, stats: statsData ?? { totalIn: 0, totalOut: 0, transactionCount: 0, netChange: 0, openingBalance: 0, closingBalance: 0 }, transactions: txData?.rows ?? [] } : null;

  // (qq) Apply type filter client-side. Empty set OR all 6 selected = show all.
  const filteredTxns = useMemo(() => {
    if (!data?.transactions) return [];
    if (typeFilter.size === 0 || typeFilter.size === TYPE_OPTIONS.length) return data.transactions;
    return data.transactions.filter(tx => typeFilter.has(tx.type));
  }, [data?.transactions, typeFilter]);

  const pagedTxns = useMemo(() => {
    return filteredTxns.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  }, [filteredTxns, page]);
  const totalPages = Math.max(1, Math.ceil(filteredTxns.length / PAGE_SIZE));

  const toggleTypeFilter = (t: AccountTransaction["type"]) => {
    setTypeFilter(prev => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t); else next.add(t);
      return next;
    });
    setPage(1);
  };

  // ── Transfer Dialog ─────────────────────────────────────────────────────
  const [tfForm, setTfForm] = useState({ toAccountId: "", amount: "", reference: "", transferDate: today, notes: "" });
  const transferMutation = useMutation({
    mutationFn: async (d: typeof tfForm) => {
      const res = await apiRequest("POST", "/api/account-transfers", {
        fromAccountId: id,
        toAccountId: d.toAccountId,
        amount: d.amount,
        reference: d.reference || null,
        transferDate: d.transferDate,
        notes: d.notes || null,
      });
      if (!res.ok) { const b = await res.json(); throw new Error(b.message || "Failed"); }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cash-accounts"] });
      setTransferOpen(false);
      toast({ title: "Transfer recorded" });
      setPage(1);
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  // ── Adjustment Dialog ───────────────────────────────────────────────────
  const [adjForm, setAdjForm] = useState({ type: "credit", amount: "", reason: "", adjustmentDate: today });
  const adjustMutation = useMutation({
    mutationFn: async (d: typeof adjForm) => {
      const res = await apiRequest("POST", "/api/balance-adjustments", {
        cashAccountId: id,
        adjustmentType: d.type,
        adjustmentAmount: d.amount,
        reason: d.reason,
        adjustmentDate: d.adjustmentDate,
      });
      if (!res.ok) { const b = await res.json(); throw new Error(b.message || "Failed"); }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cash-accounts"] });
      setAdjustOpen(false);
      toast({ title: "Adjustment recorded" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  if (!canAccess) {
    return <Redirect to="/accounts" />;
  }

  if (isLoading || !data) {
    return (
      <div className="p-6 space-y-4">
        <div className="h-6 w-48 bg-muted animate-pulse rounded" />
        <div className="h-32 bg-muted animate-pulse rounded" />
      </div>
    );
  }

  const otherAccounts = (allAccounts ?? []).filter(a => a.id !== id && a.isActive);
  const openingDateStr = (data as any).openingBalanceDate ? fmtDate((data as any).openingBalanceDate) : "—";

  // (rr) Row drill handler
  const handleRowClick = (tx: AccountTransaction) => {
    switch (tx.type) {
      case "customer_payment":
        if (tx.linkedEntityId) {
          setLocation(`/sales-invoices?highlight=${tx.linkedEntityId}`);
        } else {
          setLocation("/sales");
        }
        break;
      case "supplier_payment":
        setLocation(`/accounts?tab=supplier-payments${tx.linkedEntityId ? `&highlight=${tx.linkedEntityId}` : ""}`);
        break;
      case "expense":
        setLocation(`/accounts?tab=expenses${tx.linkedEntityId ? `&highlight=${tx.linkedEntityId}` : ""}`);
        break;
      case "transfer_in": {
        // counterpartyName is the FROM account; current is the TO account
        const lines = [
          `Transfer of ${fmt(tx.amount)}`,
          `From: ${tx.counterpartyName ?? "—"}`,
          `To: ${data.name}`,
          `Date: ${fmtDate(tx.transactionDate)}`,
          `Reference: ${tx.reference ?? "N/A"}`,
        ];
        toast({ title: "Transfer In", description: lines.join("\n") });
        break;
      }
      case "transfer_out": {
        // counterpartyName is the TO account; current is the FROM account
        const lines = [
          `Transfer of ${fmt(tx.amount)}`,
          `From: ${data.name}`,
          `To: ${tx.counterpartyName ?? "—"}`,
          `Date: ${fmtDate(tx.transactionDate)}`,
          `Reference: ${tx.reference ?? "N/A"}`,
        ];
        toast({ title: "Transfer Out", description: lines.join("\n") });
        break;
      }
      case "adjustment": {
        const direction = tx.amount >= 0 ? "Increase" : "Decrease";
        const lines = [
          `Balance ${direction} of ${fmt(tx.amount)}`,
          `On: ${data.name}`,
          `Date: ${fmtDate(tx.transactionDate)}`,
          `Reason: ${tx.description}`,
          `By: ${tx.adjustedByName ?? "—"}`,
        ];
        toast({ title: "Balance Adjustment", description: lines.join("\n") });
        break;
      }
    }
  };

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-5xl mx-auto">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <button onClick={() => setLocation("/accounts?tab=cash-position")} className="hover:text-foreground flex items-center gap-1">
          <ArrowLeft className="h-3.5 w-3.5" /> Accounts
        </button>
        <span>/</span>
        <button onClick={() => setLocation("/accounts?tab=cash-accounts")} className="hover:text-foreground">Cash Accounts</button>
        <span>/</span>
        <span className="text-foreground font-medium">{data.name}</span>
      </div>

      {/* (mm) Header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className={`h-12 w-12 rounded-full flex items-center justify-center ${data.type === "bank" ? "bg-blue-100 dark:bg-blue-950/40" : "bg-emerald-100 dark:bg-emerald-950/40"}`}>
            {data.type === "bank" ? <Landmark className="h-6 w-6 text-blue-600 dark:text-blue-400" /> : <Banknote className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />}
          </div>
          <div className="space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-bold" data-testid="text-account-name">{data.name}</h1>
              <Badge
                variant="outline"
                className={data.type === "bank"
                  ? "border-blue-300 text-blue-700 bg-blue-50 dark:border-blue-700 dark:text-blue-300 dark:bg-blue-950/30"
                  : "border-emerald-300 text-emerald-700 bg-emerald-50 dark:border-emerald-700 dark:text-emerald-300 dark:bg-emerald-950/30"
                }
                data-testid="badge-account-type"
              >
                {data.type === "bank" ? "Bank" : "Cash"}
              </Badge>
              <Badge variant={data.isActive ? "default" : "secondary"} data-testid="badge-account-status">
                {data.isActive ? "Active" : "Inactive"}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              {data.type === "bank" ? data.bankName ?? "Bank Account" : "Cash Drawer"}
              {data.accountNumber ? ` · ****${data.accountNumber.slice(-4)}` : ""}
              {data.ifscCode ? ` · ${data.ifscCode}` : ""}
            </p>
            <p className="text-xs text-muted-foreground" data-testid="text-opening-balance">
              Opening: <span className="font-medium text-foreground">₹{Number(data.openingBalance ?? 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span> on <span className="font-medium text-foreground">{openingDateStr}</span>
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {isAdmin && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setLocation(`/accounts?tab=cash-accounts&editId=${id}`)}
              data-testid="button-edit-account"
            >
              <Pencil className="h-4 w-4 mr-2" /> Edit
            </Button>
          )}
          {isAdmin && (
            <Button size="sm" variant="outline" onClick={() => { setTfForm({ toAccountId: "", amount: "", reference: "", transferDate: today, notes: "" }); setTransferOpen(true); }} data-testid="button-new-transfer">
              <ArrowLeftRight className="h-4 w-4 mr-2" /> Transfer
            </Button>
          )}
          {canAdjust && (
            <Button size="sm" variant="outline" onClick={() => { setAdjForm({ type: "credit", amount: "", reason: "", adjustmentDate: today }); setAdjustOpen(true); }} data-testid="button-new-adjustment">
              <SlidersHorizontal className="h-4 w-4 mr-2" /> Adjustment
            </Button>
          )}
        </div>
      </div>

      {/* Balance + Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card className="col-span-2 sm:col-span-1">
          <CardContent className="pt-5">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Current Balance</p>
            <p className={`text-2xl font-bold mt-1 ${Number(data.balance) < 0 ? "text-red-600" : ""}`} data-testid="text-current-balance">{fmt(data.balance)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center gap-1.5 mb-1">
              <TrendingUp className="h-4 w-4 text-green-500" />
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Money In</p>
            </div>
            <p className="text-lg font-semibold text-green-600">{fmt(data.stats.totalIn)}</p>
            <p className="text-xs text-muted-foreground">selected period</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center gap-1.5 mb-1">
              <TrendingDown className="h-4 w-4 text-red-500" />
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Money Out</p>
            </div>
            <p className="text-lg font-semibold text-red-600">{fmt(data.stats.totalOut)}</p>
            <p className="text-xs text-muted-foreground">selected period</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center gap-1.5 mb-1">
              <IndianRupee className="h-4 w-4 text-purple-500" />
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Transactions</p>
            </div>
            <p className="text-lg font-semibold">{data.stats.transactionCount}</p>
            <p className="text-xs text-muted-foreground">selected period</p>
          </CardContent>
        </Card>
      </div>

      {/* (nn) Date filter with Today/MTD/YTD/All presets */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Label className="text-xs">From</Label>
          <Input type="date" value={fromDate} onChange={e => { setFromDate(e.target.value); setPage(1); }} className="h-8 w-36 text-xs" data-testid="input-from-date" />
        </div>
        <div className="flex items-center gap-2">
          <Label className="text-xs">To</Label>
          <Input type="date" value={toDate} onChange={e => { setToDate(e.target.value); setPage(1); }} className="h-8 w-36 text-xs" data-testid="input-to-date" />
        </div>
        {["Today", "MTD", "YTD", "All"].map(label => (
          <Button
            key={label}
            size="sm"
            variant="outline"
            className="h-8 text-xs"
            data-testid={`button-preset-${label.toLowerCase()}`}
            onClick={() => {
              const y = new Date().getFullYear();
              const m = String(new Date().getMonth() + 1).padStart(2, "0");
              if (label === "Today") { setFromDate(today); setToDate(today); }
              else if (label === "MTD") { setFromDate(`${y}-${m}-01`); setToDate(today); }
              else if (label === "YTD") { setFromDate(`${y}-01-01`); setToDate(today); }
              else { setFromDate("2020-01-01"); setToDate(today); }
              setPage(1);
            }}
          >
            {label}
          </Button>
        ))}
      </div>

      {/* (qq) Type filter chips */}
      <div className="flex items-start gap-3 flex-wrap" data-testid="filter-type-chips">
        <div className="flex items-center gap-1.5 pt-1.5">
          <Filter className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">Type:</span>
        </div>
        {TYPE_OPTIONS.map(opt => {
          const active = typeFilter.has(opt.value);
          return (
            <Button
              key={opt.value}
              size="sm"
              variant={active ? "default" : "outline"}
              className="h-7 text-xs"
              data-testid={`chip-type-${opt.value}`}
              onClick={() => toggleTypeFilter(opt.value)}
            >
              {opt.label}
            </Button>
          );
        })}
        {typeFilter.size > 0 && typeFilter.size < TYPE_OPTIONS.length && (
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-xs"
            data-testid="button-clear-type-filter"
            onClick={() => { setTypeFilter(new Set()); setPage(1); }}
          >
            <X className="h-3 w-3 mr-1" /> Clear ({typeFilter.size} active)
          </Button>
        )}
      </div>

      {/* Ledger table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40">
                  <th className="text-left p-3 font-medium text-muted-foreground w-28">Date</th>
                  <th className="text-left p-3 font-medium text-muted-foreground w-24">Module</th>
                  <th className="text-left p-3 font-medium text-muted-foreground w-36">Counterparty</th>
                  <th className="text-left p-3 font-medium text-muted-foreground">Description</th>
                  <th className="text-left p-3 font-medium text-muted-foreground w-32">Ref.</th>
                  <th className="text-right p-3 font-medium text-green-600 w-28">Credit (+)</th>
                  <th className="text-right p-3 font-medium text-red-600 w-28">Debit (−)</th>
                  <th className="text-right p-3 font-medium text-muted-foreground w-32">Balance</th>
                </tr>
              </thead>
              <tbody>
                {pagedTxns.map((tx) => (
                  <tr
                    key={tx.id}
                    className="border-b hover:bg-muted/30 cursor-pointer transition-colors"
                    data-testid={`row-txn-${tx.id}`}
                    onClick={() => handleRowClick(tx)}
                    title="Click to view details"
                  >
                    <td className="p-3 text-muted-foreground">{new Date(tx.transactionDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "2-digit" })}</td>
                    <td className="p-3">
                      <Badge variant="outline" className="text-xs">{moduleLabel(tx.type)}</Badge>
                    </td>
                    <td className="p-3 text-sm" data-testid={`text-counterparty-${tx.id}`}>{tx.counterpartyName ?? "—"}</td>
                    <td className="p-3">{tx.description}</td>
                    <td className="p-3 text-muted-foreground text-xs">{tx.reference ?? "—"}</td>
                    <td className="p-3 text-right text-green-600 font-medium">{tx.amount > 0 ? fmt(tx.amount) : ""}</td>
                    <td className="p-3 text-right text-red-600 font-medium">{tx.amount < 0 ? fmt(tx.amount) : ""}</td>
                    <td className={`p-3 text-right font-semibold ${tx.runningBalance < 0 ? "text-red-600" : ""}`}>{fmt(tx.runningBalance)}</td>
                  </tr>
                ))}
                {pagedTxns.length === 0 && (
                  <tr><td colSpan={8} className="text-center p-8 text-muted-foreground">No transactions in the selected period{typeFilter.size > 0 && typeFilter.size < TYPE_OPTIONS.length ? " matching the active type filter" : ""}.</td></tr>
                )}
              </tbody>
            </table>
          </div>
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t">
              <p className="text-xs text-muted-foreground" data-testid="text-pagination-info">Page {page} of {totalPages} · {filteredTxns.length} rows</p>
              <div className="flex items-center gap-2">
                <Button size="icon" variant="outline" className="h-7 w-7" disabled={page <= 1} onClick={() => setPage(p => p - 1)} data-testid="button-prev-page">
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button size="icon" variant="outline" className="h-7 w-7" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} data-testid="button-next-page">
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Transfer Dialog */}
      <Dialog open={transferOpen} onOpenChange={setTransferOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Transfer Funds</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">From: <span className="font-medium text-foreground">{data.name}</span></p>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>To Account *</Label>
              <Select value={tfForm.toAccountId} onValueChange={v => setTfForm({ ...tfForm, toAccountId: v })}>
                <SelectTrigger data-testid="select-transfer-to"><SelectValue placeholder="Select destination" /></SelectTrigger>
                <SelectContent>
                  {otherAccounts.map(a => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.type === "bank" ? <Landmark className="inline mr-1 h-3 w-3" /> : <Banknote className="inline mr-1 h-3 w-3" />}
                      {a.name} — {fmt(Number(a.balance))}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Amount (₹) *</Label>
              <Input type="number" step="0.01" min="0.01" data-testid="input-transfer-amount" value={tfForm.amount} onChange={e => setTfForm({ ...tfForm, amount: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Date *</Label>
              <Input type="date" data-testid="input-transfer-date" value={tfForm.transferDate} onChange={e => setTfForm({ ...tfForm, transferDate: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Reference</Label>
              <Input data-testid="input-transfer-ref" value={tfForm.reference} onChange={e => setTfForm({ ...tfForm, reference: e.target.value })} placeholder="NEFT/RTGS ref number" />
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Input data-testid="input-transfer-notes" value={tfForm.notes} onChange={e => setTfForm({ ...tfForm, notes: e.target.value })} placeholder="Optional note" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTransferOpen(false)}>Cancel</Button>
            <Button data-testid="button-submit-transfer"
              disabled={transferMutation.isPending || !tfForm.toAccountId || !tfForm.amount || Number(tfForm.amount) <= 0}
              onClick={() => transferMutation.mutate(tfForm)}>
              {transferMutation.isPending ? "Transferring..." : "Record Transfer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Adjustment Dialog */}
      <Dialog open={adjustOpen} onOpenChange={setAdjustOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Balance Adjustment</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Manually add or remove balance for reconciliation purposes.</p>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Type *</Label>
              <Select value={adjForm.type} onValueChange={v => setAdjForm({ ...adjForm, type: v })}>
                <SelectTrigger data-testid="select-adj-type"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="credit">Credit (Add balance)</SelectItem>
                  <SelectItem value="debit">Debit (Remove balance)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Amount (₹) *</Label>
              <Input type="number" step="0.01" min="0.01" data-testid="input-adj-amount" value={adjForm.amount} onChange={e => setAdjForm({ ...adjForm, amount: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Date *</Label>
              <Input type="date" data-testid="input-adj-date" value={adjForm.adjustmentDate} onChange={e => setAdjForm({ ...adjForm, adjustmentDate: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Reason *</Label>
              <Input data-testid="input-adj-reason" value={adjForm.reason} onChange={e => setAdjForm({ ...adjForm, reason: e.target.value })} placeholder="e.g. Bank reconciliation, cash count" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAdjustOpen(false)}>Cancel</Button>
            <Button data-testid="button-submit-adjustment"
              disabled={adjustMutation.isPending || !adjForm.amount || Number(adjForm.amount) <= 0 || adjForm.reason.trim().length < 10}
              onClick={() => adjustMutation.mutate(adjForm)}>
              {adjustMutation.isPending ? "Saving..." : "Record Adjustment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
