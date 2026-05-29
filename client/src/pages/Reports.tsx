import { useState, lazy, Suspense } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { PageLoader } from "@/components/PageLoader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tooltip as UITooltip, TooltipContent as UITooltipContent, TooltipTrigger as UITooltipTrigger, TooltipProvider as UITooltipProvider } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import {
  BarChart3, Download, ShoppingCart, Package, CreditCard, Users,
  TrendingUp, FileText, AlertTriangle, Clock, CheckCircle2, AlertCircle,
  Flame, TrendingDown, Shield, Search, ChevronDown,
} from "lucide-react";
import { useCurrentUser, getUser } from "@/lib/auth";
import { generateAPAgingPDF, generateARAgingPDF, generatePricingPDF } from "@/lib/reports-pdf";

// Lazy-loaded so heavy code only downloads when the tab is opened.
const PLStatement = lazy(() => import("@/components/reports/PLStatement"));
const CashFlowStatement = lazy(() => import("@/components/reports/CashFlowStatement"));
const CustomerAging = lazy(() => import("@/components/reports/CustomerAging").then(m => ({ default: m.CustomerAging })));
const SupplierAging = lazy(() => import("@/components/reports/SupplierAging").then(m => ({ default: m.SupplierAging })));
const CashPosition = lazy(() => import("@/components/reports/CashPosition").then(m => ({ default: m.CashPosition })));
const AccountStatement = lazy(() => import("@/components/reports/AccountStatement").then(m => ({ default: m.AccountStatement })));
const ConsolidatedCash = lazy(() => import("@/components/reports/ConsolidatedCash").then(m => ({ default: m.ConsolidatedCash })));
const CashLedger = lazy(() => import("@/components/reports/CashLedger").then(m => ({ default: m.CashLedger })));
const TaxSummary = lazy(() => import("@/components/reports/TaxSummary").then(m => ({ default: m.TaxSummary })));
const SalesRegister  = lazy(() => import("@/components/reports/SalesRegister").then(m => ({ default: m.SalesRegister })));
const PeriodSales    = lazy(() => import("@/components/reports/PeriodSales").then(m => ({ default: m.PeriodSales })));
const PeriodProfit   = lazy(() => import("@/components/reports/PeriodProfit").then(m => ({ default: m.PeriodProfit })));
const ProductSales   = lazy(() => import("@/components/reports/ProductSales").then(m => ({ default: m.ProductSales })));
const ProductProfit  = lazy(() => import("@/components/reports/ProductProfit").then(m => ({ default: m.ProductProfit })));
const PurchaseRegister = lazy(() => import("@/components/reports/PurchaseRegister").then(m => ({ default: m.PurchaseRegister })));
const ExpenseReport = lazy(() => import("@/components/reports/ExpenseReport").then(m => ({ default: m.ExpenseReport })));
const BalanceSheet    = lazy(() => import("@/components/reports/BalanceSheet"));
const FinancialRatios = lazy(() => import("@/components/reports/FinancialRatios"));

// ─── Formatting helpers ───────────────────────────────────────────────────────

const fmt = (n: number) =>
  "₹" + n.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 0 });

const bucketLabel: Record<string, string> = {
  current: "Current",
  "1-30": "1–30 Days",
  "31-60": "31–60 Days",
  "61-90": "61–90 Days",
  "90+": "90+ Days",
};

const bucketColor: Record<string, string> = {
  current: "text-emerald-600",
  "1-30": "text-yellow-600",
  "31-60": "text-orange-600",
  "61-90": "text-red-500",
  "90+": "text-red-700",
};

const bucketBadge: Record<string, string> = {
  current: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300",
  "1-30": "bg-yellow-100 text-yellow-800 dark:bg-yellow-950/40 dark:text-yellow-300",
  "31-60": "bg-orange-100 text-orange-800 dark:bg-orange-950/40 dark:text-orange-300",
  "61-90": "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300",
  "90+": "bg-red-200 text-red-900 dark:bg-red-950/60 dark:text-red-200",
};

const rowTint: Record<string, string> = {
  current: "",
  "1-30": "",
  "31-60": "bg-orange-50/50 dark:bg-orange-950/10",
  "61-90": "bg-red-50/60 dark:bg-red-950/15",
  "90+": "bg-red-100/70 dark:bg-red-950/25",
};

// ─── Export helpers ───────────────────────────────────────────────────────────

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function downloadCSV(filename: string, headers: string[], rows: (string | number | null)[][]) {
  const escape = (v: string | number | null) => {
    const s = v == null ? "" : String(v);
    return s.includes(",") || s.includes('"') || s.includes("\n")
      ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [headers.map(escape).join(","), ...rows.map(r => r.map(escape).join(","))];
  const blob = new Blob(["\ufeff" + lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

function downloadPDF(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

// ─── Data types ───────────────────────────────────────────────────────────────

interface APAgingRow {
  invoiceId: string;
  invoiceNumber: string;
  supplierId: string;
  supplierName: string;
  purchaseOrderId: string | null;
  poNumber: string | null;
  invoiceDate: string;
  dueDate: string;
  totalAmount: number;
  totalPaid: number;
  balance: number;
  daysOverdue: number;
  bucket: string;
  status: string;
}

interface APAgingSummary {
  current: number;
  days1_30: number;
  days31_60: number;
  days61_90: number;
  days90plus: number;
  totalOutstanding: number;
}

interface APAgingResponse {
  rows: APAgingRow[];
  summary: APAgingSummary;
}

interface ARAgingRow {
  invoiceId: string;
  invoiceNumber: string;
  customerId: string;
  customerName: string;
  customerType: string;
  customerGSTIN: string | null;
  invoiceDate: string;
  dueDate: string | null;
  grandTotal: number;
  totalPaid: number;
  balance: number;
  daysOverdue: number;
  bucket: string;
  status: string;
}

interface ARAgingResponse {
  rows: ARAgingRow[];
  summary: APAgingSummary;
}

// ─── AP Aging Tab (Payables → Invoice Detail) ─────────────────────────────────

function APAgingTab() {
  const [supplierFilter, setSupplierFilter] = useState<string>("all");
  const [showPaid, setShowPaid] = useState(false);

  const { data, isLoading } = useQuery<APAgingResponse>({
    queryKey: ["/api/reports/ap-aging"],
  });

  const rows = data?.rows ?? [];

  const uniqueSuppliers = Array.from(new Map(rows.map(r => [r.supplierId, r.supplierName])).entries());

  const supplierFiltered = supplierFilter === "all" ? rows : rows.filter(r => r.supplierId === supplierFilter);

  const summary = supplierFiltered
    .filter(r => r.balance > 0)
    .reduce(
      (acc, r) => {
        acc.totalOutstanding += r.balance;
        if (r.bucket === "current") acc.current += r.balance;
        else if (r.bucket === "1-30") acc.days1_30 += r.balance;
        else if (r.bucket === "31-60") acc.days31_60 += r.balance;
        else if (r.bucket === "61-90") acc.days61_90 += r.balance;
        else acc.days90plus += r.balance;
        return acc;
      },
      { current: 0, days1_30: 0, days31_60: 0, days61_90: 0, days90plus: 0, totalOutstanding: 0 }
    );

  const filtered = supplierFiltered.filter(r => showPaid || r.balance > 0);

  const handleExportCSV = () => {
    downloadCSV(
      `he-ap-aging-${todayISO()}.csv`,
      ["Supplier", "Invoice #", "PO #", "Invoice Date", "Due Date", "Total (₹)", "Paid (₹)", "Balance (₹)", "Days Overdue", "Bucket", "Status"],
      filtered.map(r => [r.supplierName, r.invoiceNumber, r.poNumber ?? "", r.invoiceDate?.slice(0, 10) ?? "", r.dueDate?.slice(0, 10) ?? "", r.totalAmount, r.totalPaid, r.balance, r.daysOverdue > 0 ? r.daysOverdue : "Current", r.bucket, r.status])
    );
  };

  const handleExportPDF = async () => {
    const blob = await generateAPAgingPDF(filtered, summary, supplierFilter === "all" ? "All Suppliers" : (filtered[0]?.supplierName ?? ""));
    downloadPDF(`he-ap-aging-${todayISO()}.pdf`, blob);
  };

  const summaryCards = [
    { label: "Total Outstanding", value: summary.totalOutstanding, bucket: "90+", icon: AlertCircle, iconClass: "text-red-500" },
    { label: "Current (Not Due)", value: summary.current, bucket: "current", icon: CheckCircle2, iconClass: "text-emerald-500" },
    { label: "1–30 Days Overdue", value: summary.days1_30, bucket: "1-30", icon: Clock, iconClass: "text-yellow-500" },
    { label: "31–60 Days Overdue", value: summary.days31_60, bucket: "31-60", icon: AlertTriangle, iconClass: "text-orange-500" },
    { label: "61–90 Days Overdue", value: summary.days61_90, bucket: "61-90", icon: AlertTriangle, iconClass: "text-red-500" },
    { label: "90+ Days Overdue", value: summary.days90plus, bucket: "90+", icon: AlertTriangle, iconClass: "text-red-700" },
  ];

  return (
    <div className="space-y-5" data-testid="section-ap-aging">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {summaryCards.map(card => {
          const Icon = card.icon;
          return (
            <Card key={card.label} className="border" data-testid={`card-aging-${card.bucket}`}>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-1">
                  <Icon className={`w-4 h-4 ${card.iconClass}`} />
                  <span className="text-xs text-muted-foreground">{card.label}</span>
                </div>
                <p className={`text-lg font-bold ${bucketColor[card.bucket] ?? ""}`}>
                  {fmt(card.value)}
                </p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="flex items-center gap-4 flex-wrap">
        <Select value={supplierFilter} onValueChange={setSupplierFilter}>
          <SelectTrigger className="w-52" data-testid="select-supplier-filter">
            <SelectValue placeholder="Filter by supplier" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Suppliers</SelectItem>
            {uniqueSuppliers.map(([id, name]) => (
              <SelectItem key={id} value={id}>{name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex items-center gap-2">
          <Switch
            id="show-paid"
            checked={showPaid}
            onCheckedChange={setShowPaid}
            data-testid="switch-show-paid"
          />
          <Label htmlFor="show-paid" className="text-sm cursor-pointer">Show fully paid invoices</Label>
        </div>
        <span className="text-xs text-muted-foreground ml-auto">
          {filtered.length} invoice{filtered.length !== 1 ? "s" : ""}
        </span>
        <Button variant="outline" size="sm" onClick={handleExportPDF} disabled={filtered.length === 0} data-testid="button-ap-aging-pdf">
          <FileText className="w-3.5 h-3.5 mr-1.5" />PDF
        </Button>
        <Button variant="outline" size="sm" onClick={handleExportCSV} disabled={filtered.length === 0} data-testid="button-ap-aging-csv">
          <Download className="w-3.5 h-3.5 mr-1.5" />CSV
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground text-sm">Loading aging report…</div>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground text-sm">No outstanding payables found.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/40">
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Supplier</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Invoice #</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">PO #</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Invoice Date</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Due Date</th>
                    <th className="px-4 py-3 text-right font-medium text-muted-foreground">Total</th>
                    <th className="px-4 py-3 text-right font-medium text-muted-foreground">Paid</th>
                    <th className="px-4 py-3 text-right font-medium text-muted-foreground">Balance</th>
                    <th className="px-4 py-3 text-center font-medium text-muted-foreground">Days Overdue</th>
                    <th className="px-4 py-3 text-center font-medium text-muted-foreground">Bucket</th>
                    <th className="px-4 py-3 text-center font-medium text-muted-foreground">Flags</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(row => (
                    <tr
                      key={row.invoiceId}
                      className={`border-b last:border-0 hover:bg-muted/30 transition-colors ${rowTint[row.bucket] ?? ""}`}
                      data-testid={`row-aging-${row.invoiceId}`}
                    >
                      <td className="px-4 py-3 font-medium">{row.supplierName}</td>
                      <td className="px-4 py-3 font-mono text-xs">{(row as any).invoiceNumber ?? <span className="text-muted-foreground italic">Pending</span>}</td>
                      <td className="px-4 py-3 text-muted-foreground text-xs">{row.poNumber ?? "—"}</td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {new Date(row.invoiceDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {new Date(row.dueDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                      </td>
                      <td className="px-4 py-3 text-right">{fmt(row.totalAmount)}</td>
                      <td className="px-4 py-3 text-right text-emerald-600 dark:text-emerald-400">{fmt(row.totalPaid)}</td>
                      <td className="px-4 py-3 text-right font-semibold">
                        {row.balance === 0 ? (
                          <span className="text-muted-foreground">{fmt(0)}</span>
                        ) : (
                          <span className={bucketColor[row.bucket]}>{fmt(row.balance)}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {row.daysOverdue === 0 ? (
                          <span className="text-muted-foreground text-xs">Not due</span>
                        ) : (
                          <span className={`font-medium ${bucketColor[row.bucket]}`}>{row.daysOverdue}d</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <Badge className={`text-xs font-medium border-0 ${bucketBadge[row.bucket]}`}>
                          {bucketLabel[row.bucket]}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <div className="flex items-center justify-center gap-1 flex-wrap">
                          {(row as any).isCreditGrn && (
                            <UITooltipProvider>
                              <UITooltip>
                                <UITooltipTrigger asChild>
                                  <span
                                    className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-purple-100 text-purple-800 dark:bg-purple-950/40 dark:text-purple-400 cursor-help"
                                    data-testid={`badge-credit-grn-${row.invoiceId}`}
                                  >
                                    Credit GRN
                                  </span>
                                </UITooltipTrigger>
                                <UITooltipContent side="left" className="max-w-xs text-xs">
                                  {(row as any).creditReason ?? "Credit override approved"}
                                </UITooltipContent>
                              </UITooltip>
                            </UITooltipProvider>
                          )}
                          {(row as any).uploadStatus && (row as any).uploadStatus !== "recorded" && (
                            <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${
                              (row as any).uploadStatus === "pending_upload" ? "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-400"
                              : (row as any).uploadStatus === "uploaded" ? "bg-blue-100 text-blue-800 dark:bg-blue-950/40 dark:text-blue-400"
                              : "bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-400"
                            }`}>
                              {(row as any).uploadStatus === "pending_upload" ? "⚠ No Invoice" : (row as any).uploadStatus === "cancelled" ? "Cancelled" : "Uploaded"}
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
                {filtered.length > 1 && (
                  <tfoot>
                    <tr className="border-t-2 bg-muted/40 font-semibold">
                      <td colSpan={5} className="px-4 py-3">Total ({filtered.length} invoices)</td>
                      <td className="px-4 py-3 text-right">{fmt(filtered.reduce((s, r) => s + r.totalAmount, 0))}</td>
                      <td className="px-4 py-3 text-right text-emerald-600 dark:text-emerald-400">{fmt(filtered.reduce((s, r) => s + r.totalPaid, 0))}</td>
                      <td className="px-4 py-3 text-right">{fmt(filtered.reduce((s, r) => s + r.balance, 0))}</td>
                      <td colSpan={3} />
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── AR Aging Tab (Receivables → Invoice Detail) ──────────────────────────────

type ARSortKey = "daysOverdue" | "dueDate" | "balance" | "customerName" | "invoiceNumber";

function ARAgingTab() {
  const [customerFilter, setCustomerFilter] = useState<string>("all");
  const [showPaid, setShowPaid] = useState(false);
  const [sortKey, setSortKey] = useState<ARSortKey>("daysOverdue");
  const [sortAsc, setSortAsc] = useState(false);

  const { data, isLoading } = useQuery<ARAgingResponse>({
    queryKey: ["/api/reports/ar-aging"],
  });

  const rows = data?.rows ?? [];
  const uniqueCustomers = Array.from(new Map(rows.map(r => [r.customerId, r.customerName])).entries());
  const customerFiltered = customerFilter === "all" ? rows : rows.filter(r => r.customerId === customerFilter);

  const summary = customerFiltered
    .filter(r => r.balance > 0)
    .reduce(
      (acc, r) => {
        acc.totalOutstanding += r.balance;
        if (r.bucket === "current") acc.current += r.balance;
        else if (r.bucket === "1-30") acc.days1_30 += r.balance;
        else if (r.bucket === "31-60") acc.days31_60 += r.balance;
        else if (r.bucket === "61-90") acc.days61_90 += r.balance;
        else acc.days90plus += r.balance;
        return acc;
      },
      { current: 0, days1_30: 0, days31_60: 0, days61_90: 0, days90plus: 0, totalOutstanding: 0 }
    );

  const baseFiltered = customerFiltered.filter(r => showPaid || r.balance > 0);

  const filtered = [...baseFiltered].sort((a, b) => {
    let cmp = 0;
    if (sortKey === "daysOverdue") cmp = a.daysOverdue - b.daysOverdue;
    else if (sortKey === "dueDate") cmp = (a.dueDate ?? "").localeCompare(b.dueDate ?? "");
    else if (sortKey === "balance") cmp = a.balance - b.balance;
    else if (sortKey === "customerName") cmp = a.customerName.localeCompare(b.customerName);
    else if (sortKey === "invoiceNumber") cmp = a.invoiceNumber.localeCompare(b.invoiceNumber);
    return sortAsc ? cmp : -cmp;
  });

  const handleSort = (key: ARSortKey) => {
    if (sortKey === key) setSortAsc(p => !p);
    else { setSortKey(key); setSortAsc(false); }
  };

  const SortIcon = ({ k }: { k: ARSortKey }) => {
    if (sortKey !== k) return <span className="ml-1 text-muted-foreground/40">↕</span>;
    return <span className="ml-1">{sortAsc ? "↑" : "↓"}</span>;
  };

  const handleExportCSV = () => {
    downloadCSV(
      `he-ar-aging-${todayISO()}.csv`,
      ["Customer", "Type", "GSTIN", "Invoice #", "Invoice Date", "Due Date", "Grand Total (₹)", "Paid (₹)", "Balance (₹)", "Days Overdue", "Bucket", "Status"],
      filtered.map(r => [r.customerName, r.customerType, r.customerGSTIN ?? "", r.invoiceNumber, r.invoiceDate?.slice(0, 10) ?? "", r.dueDate?.slice(0, 10) ?? "", r.grandTotal, r.totalPaid, r.balance, r.daysOverdue > 0 ? r.daysOverdue : "Current", r.bucket, r.status])
    );
  };

  const handleExportPDF = async () => {
    const blob = await generateARAgingPDF(filtered, summary, customerFilter === "all" ? "All Customers" : (filtered[0]?.customerName ?? ""));
    downloadPDF(`he-ar-aging-${todayISO()}.pdf`, blob);
  };

  const summaryCards = [
    { label: "Total Outstanding", value: summary.totalOutstanding, bucket: "90+", icon: AlertCircle, iconClass: "text-red-500" },
    { label: "Current (Not Due)", value: summary.current, bucket: "current", icon: CheckCircle2, iconClass: "text-emerald-500" },
    { label: "1–30 Days Overdue", value: summary.days1_30, bucket: "1-30", icon: Clock, iconClass: "text-yellow-500" },
    { label: "31–60 Days Overdue", value: summary.days31_60, bucket: "31-60", icon: AlertTriangle, iconClass: "text-orange-500" },
    { label: "61–90 Days Overdue", value: summary.days61_90, bucket: "61-90", icon: AlertTriangle, iconClass: "text-red-500" },
    { label: "90+ Days Overdue", value: summary.days90plus, bucket: "90+", icon: AlertTriangle, iconClass: "text-red-700" },
  ];

  return (
    <div className="space-y-5" data-testid="section-ar-aging">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {summaryCards.map(card => {
          const Icon = card.icon;
          return (
            <Card key={card.label} className="border" data-testid={`card-ar-aging-${card.bucket}`}>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-1">
                  <Icon className={`w-4 h-4 ${card.iconClass}`} />
                  <span className="text-xs text-muted-foreground">{card.label}</span>
                </div>
                <p className={`text-lg font-bold ${bucketColor[card.bucket] ?? ""}`}>
                  {fmt(card.value)}
                </p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="flex items-center gap-4 flex-wrap">
        <Select value={customerFilter} onValueChange={setCustomerFilter}>
          <SelectTrigger className="w-52" data-testid="select-customer-filter">
            <SelectValue placeholder="Filter by customer" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Customers</SelectItem>
            {uniqueCustomers.map(([id, name]) => (
              <SelectItem key={id} value={id}>{name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex items-center gap-2">
          <Switch
            id="ar-show-paid"
            checked={showPaid}
            onCheckedChange={setShowPaid}
            data-testid="switch-ar-show-paid"
          />
          <Label htmlFor="ar-show-paid" className="text-sm cursor-pointer">Show fully paid invoices</Label>
        </div>
        <span className="text-xs text-muted-foreground ml-auto">
          {filtered.length} invoice{filtered.length !== 1 ? "s" : ""}
        </span>
        <Button variant="outline" size="sm" onClick={handleExportPDF} disabled={filtered.length === 0} data-testid="button-ar-aging-pdf">
          <FileText className="w-3.5 h-3.5 mr-1.5" />PDF
        </Button>
        <Button variant="outline" size="sm" onClick={handleExportCSV} disabled={filtered.length === 0} data-testid="button-ar-aging-csv">
          <Download className="w-3.5 h-3.5 mr-1.5" />CSV
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground text-sm">Loading aging report…</div>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground text-sm">No outstanding receivables found.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/40">
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground cursor-pointer select-none hover:text-foreground" onClick={() => handleSort("customerName")}>Customer<SortIcon k="customerName" /></th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground cursor-pointer select-none hover:text-foreground" onClick={() => handleSort("invoiceNumber")}>Invoice #<SortIcon k="invoiceNumber" /></th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Type</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Invoice Date</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground cursor-pointer select-none hover:text-foreground" onClick={() => handleSort("dueDate")}>Due Date<SortIcon k="dueDate" /></th>
                    <th className="px-4 py-3 text-right font-medium text-muted-foreground">Total</th>
                    <th className="px-4 py-3 text-right font-medium text-muted-foreground">Collected</th>
                    <th className="px-4 py-3 text-right font-medium text-muted-foreground cursor-pointer select-none hover:text-foreground" onClick={() => handleSort("balance")}>Balance<SortIcon k="balance" /></th>
                    <th className="px-4 py-3 text-center font-medium text-muted-foreground cursor-pointer select-none hover:text-foreground" onClick={() => handleSort("daysOverdue")}>Days Overdue<SortIcon k="daysOverdue" /></th>
                    <th className="px-4 py-3 text-center font-medium text-muted-foreground">Status</th>
                    <th className="px-4 py-3 text-center font-medium text-muted-foreground">Bucket</th>
                    <th className="px-4 py-3 text-center font-medium text-muted-foreground">Flags</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(row => (
                    <tr
                      key={row.invoiceId}
                      className={`border-b last:border-0 hover:bg-muted/30 transition-colors ${rowTint[row.bucket] ?? ""}`}
                      data-testid={`row-ar-aging-${row.invoiceId}`}
                    >
                      <td className="px-4 py-3 font-medium">{row.customerName}</td>
                      <td className="px-4 py-3 font-mono text-xs">{row.invoiceNumber}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${row.customerType === "B2B" ? "bg-blue-100 text-blue-800 dark:bg-blue-950/40 dark:text-blue-300" : "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300"}`}>
                          {row.customerType}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {new Date(row.invoiceDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {row.dueDate ? new Date(row.dueDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—"}
                      </td>
                      <td className="px-4 py-3 text-right">{fmt(row.grandTotal)}</td>
                      <td className="px-4 py-3 text-right text-emerald-600 dark:text-emerald-400">{fmt(row.totalPaid)}</td>
                      <td className="px-4 py-3 text-right font-semibold">
                        {row.balance === 0 ? (
                          <span className="text-muted-foreground">{fmt(0)}</span>
                        ) : (
                          <span className={bucketColor[row.bucket]}>{fmt(row.balance)}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {row.daysOverdue < 0 ? (
                          <span className="text-emerald-600 dark:text-emerald-400 text-xs">In {Math.abs(row.daysOverdue)}d</span>
                        ) : row.daysOverdue === 0 ? (
                          <span className="text-yellow-600 dark:text-yellow-400 text-xs font-medium">Due today</span>
                        ) : (
                          <span className={`font-medium ${bucketColor[row.bucket]}`}>{row.daysOverdue}d</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                          row.status === "paid" ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
                          : row.status === "partial_paid" ? "bg-blue-100 text-blue-800 dark:bg-blue-950/40 dark:text-blue-300"
                          : "bg-yellow-100 text-yellow-800 dark:bg-yellow-950/40 dark:text-yellow-300"
                        }`}>
                          {row.status === "paid" ? "Paid" : row.status === "partial_paid" ? "Partial" : "Pending"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <Badge className={`text-xs font-medium border-0 ${bucketBadge[row.bucket]}`}>
                          {bucketLabel[row.bucket]}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-center">
                        {(row as any).isCreditOverride && (
                          <UITooltipProvider>
                            <UITooltip>
                              <UITooltipTrigger asChild>
                                <span
                                  className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-400 cursor-help"
                                  data-testid={`badge-credit-sale-${row.invoiceId}`}
                                >
                                  Credit Sale
                                </span>
                              </UITooltipTrigger>
                              <UITooltipContent side="left" className="max-w-xs text-xs">
                                {(row as any).creditReason ?? "Credit override approved"}
                              </UITooltipContent>
                            </UITooltip>
                          </UITooltipProvider>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
                {filtered.length > 1 && (
                  <tfoot>
                    <tr className="border-t-2 bg-muted/40 font-semibold">
                      <td colSpan={5} className="px-4 py-3">Total ({filtered.length} invoices)</td>
                      <td className="px-4 py-3 text-right">{fmt(filtered.reduce((s, r) => s + r.grandTotal, 0))}</td>
                      <td className="px-4 py-3 text-right text-emerald-600 dark:text-emerald-400">{fmt(filtered.reduce((s, r) => s + r.totalPaid, 0))}</td>
                      <td className="px-4 py-3 text-right">{fmt(filtered.reduce((s, r) => s + r.balance, 0))}</td>
                      <td colSpan={4} />
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Daily Pricing Tab (Pricing) ──────────────────────────────────────────────

interface PricingProduct {
  productId: string;
  productName: string;
  sku: string;
  category: string;
  unit: string;
  totalStock: number;
  blendedCost: number | null;
  globalFloor: number | null;
  strictFloor: number | null;
  confirmedPrice: number;
  sheetDate: string | null;
  source: "today" | "fallback" | "none";
  hasConfirmedToday: boolean;
  hasConfirmedSheet: boolean;
  hasUnconfirmedSheet: boolean;
  marginPct: number | null;
  minMarginPct: number;
  pressureLevel: "High Risk" | "Medium" | "Safe" | "None";
  sellPriority: boolean;
  lotCount: number;
  lotAgeDays: number | null;
  needsPricingReview: boolean;
}

interface PricingSummary {
  products: PricingProduct[];
  portfolio: {
    totalInventoryCost: number;
    revenueAtConfirmedPrices: number;
    requiredRevenueAtMinMargin: number;
    portfolioMarginPct: number | null;
    portfolioStatus: "SAFE" | "AT RISK";
    productsAtRisk: number;
    productsNoSheet: number;
    productsWithoutPriceCount: number;
    productsSellPriority: number;
  };
}

const fmtCur = (v: number) => `₹${v.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtPct = (v: number | null) => v === null ? "—" : `${v.toFixed(1)}%`;

function PressureBadge({ level }: { level: PricingProduct["pressureLevel"] }) {
  if (level === "High Risk") return <Badge className="bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400 border-0 text-xs px-1.5 py-0.5">High Risk</Badge>;
  if (level === "Medium") return <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400 border-0 text-xs px-1.5 py-0.5">Medium</Badge>;
  if (level === "Safe") return <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 border-0 text-xs px-1.5 py-0.5">Safe</Badge>;
  return <Badge variant="outline" className="text-xs px-1.5 py-0.5">No Cost</Badge>;
}

function SourceBadge({ source, sheetDate }: { source: PricingProduct["source"]; sheetDate: string | null }) {
  if (source === "today") return <span className="text-emerald-600 dark:text-emerald-400 font-medium text-xs">🟢 Today</span>;
  if (source === "fallback") return <span className="text-amber-600 dark:text-amber-400 text-xs" title={sheetDate ?? ""}>🟡 {sheetDate ?? "Prev"}</span>;
  return <span className="text-red-500 dark:text-red-400 text-xs">🔴 No Price</span>;
}

type InsightFilter = null | "needsPricing" | "highRisk" | "sellPriority";

function DailyPricingTab() {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [atRiskOnly, setAtRiskOnly] = useState(false);
  const [activeInsight, setActiveInsight] = useState<InsightFilter>(null);

  const { data, isLoading } = useQuery<PricingSummary>({
    queryKey: ["/api/reports/pricing-summary"],
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground text-sm">
        Loading pricing data…
      </div>
    );
  }

  if (!data) return null;

  const { portfolio } = data;
  const categories = Array.from(new Set(data.products.map(p => p.category))).sort();

  const needsPricingProducts = data.products.filter(p => p.needsPricingReview || p.source === "none");
  const highRiskProducts = data.products.filter(p => p.pressureLevel === "High Risk");
  const sellPriorityProducts = data.products.filter(p => p.sellPriority);

  const toggleInsight = (key: InsightFilter) => {
    setActiveInsight(prev => prev === key ? null : key);
    setAtRiskOnly(false);
  };

  let filtered = data.products;

  if (activeInsight === "needsPricing") {
    filtered = needsPricingProducts;
  } else if (activeInsight === "highRisk") {
    filtered = highRiskProducts;
  } else if (activeInsight === "sellPriority") {
    filtered = sellPriorityProducts;
  } else {
    if (atRiskOnly) filtered = filtered.filter(p => p.pressureLevel === "High Risk" || p.pressureLevel === "Medium");
  }

  const pricingStatus = (p: PricingProduct) =>
    p.hasConfirmedToday ? "Confirmed" : p.hasUnconfirmedSheet ? "Pending" : "No Sheet";

  const handleExportCSV = () => {
    downloadCSV(
      `he-daily-pricing-${todayISO()}.csv`,
      ["Product", "SKU", "Category", "Stock", "Blended Cost (₹)", "Global Floor (₹)", "Strict Floor (₹)", "Confirmed Price (₹)", "Margin %", "Pressure Level", "Source", "Pricing Status", "Sell Priority"],
      filtered.map(p => [p.productName, p.sku, p.category, p.totalStock, p.blendedCost ?? "", p.globalFloor ?? "", p.strictFloor ?? "", p.confirmedPrice, p.marginPct != null ? p.marginPct.toFixed(1) : "", p.pressureLevel, p.source, pricingStatus(p), p.sellPriority ? "Yes" : "No"])
    );
  };

  const handleExportPDF = async () => {
    const blob = await generatePricingPDF(filtered, portfolio, search || category !== "all" || !!activeInsight ? "Filtered view" : "All Products");
    downloadPDF(`he-daily-pricing-${todayISO()}.pdf`, blob);
  };

  if (search) {
    const q = search.toLowerCase();
    filtered = filtered.filter(p =>
      p.productName.toLowerCase().includes(q) ||
      p.sku.toLowerCase().includes(q) ||
      p.category.toLowerCase().includes(q)
    );
  }
  if (category !== "all") filtered = filtered.filter(p => p.category === category);

  filtered = [...filtered].sort((a, b) => {
    const order = { "High Risk": 0, "Medium": 1, "Safe": 2, "None": 3 };
    const diff = (order[a.pressureLevel] ?? 3) - (order[b.pressureLevel] ?? 3);
    if (diff !== 0) return diff;
    if (a.marginPct === null && b.marginPct === null) return 0;
    if (a.marginPct === null) return 1;
    if (b.marginPct === null) return -1;
    return a.marginPct - b.marginPct;
  });

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card data-testid="card-portfolio-cost">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-md bg-blue-50 dark:bg-blue-950/30 flex items-center justify-center flex-shrink-0">
                <Package className="w-4 h-4 text-blue-500" />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground leading-tight">Total Inventory Cost</p>
                <p className="text-lg font-bold leading-tight mt-0.5" data-testid="text-portfolio-cost">{fmtCur(portfolio.totalInventoryCost)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card data-testid="card-portfolio-revenue">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-md bg-emerald-50 dark:bg-emerald-950/30 flex items-center justify-center flex-shrink-0">
                <TrendingUp className="w-4 h-4 text-emerald-500" />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground leading-tight">Revenue @ Confirmed Prices</p>
                <p className="text-lg font-bold leading-tight mt-0.5" data-testid="text-portfolio-revenue">{fmtCur(portfolio.revenueAtConfirmedPrices)}</p>
                {portfolio.portfolioMarginPct !== null && (
                  <p className="text-xs text-emerald-600 dark:text-emerald-400">{fmtPct(portfolio.portfolioMarginPct)} margin</p>
                )}
                {(portfolio.productsWithoutPriceCount ?? 0) > 0 && (
                  <p className="text-xs text-muted-foreground mt-0.5">{portfolio.productsWithoutPriceCount} unpriced excluded</p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
        <Card data-testid="card-portfolio-required">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-md bg-amber-50 dark:bg-amber-950/30 flex items-center justify-center flex-shrink-0">
                <Shield className="w-4 h-4 text-amber-500" />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground leading-tight">Required @ Min Margin</p>
                <p className="text-lg font-bold leading-tight mt-0.5" data-testid="text-portfolio-required">{fmtCur(portfolio.requiredRevenueAtMinMargin)}</p>
                <p className="text-xs text-muted-foreground mt-0.5">per-product floor</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card data-testid="card-portfolio-status">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <div className={`w-9 h-9 rounded-md flex items-center justify-center flex-shrink-0 ${portfolio.portfolioStatus === "SAFE" ? "bg-emerald-50 dark:bg-emerald-950/30" : "bg-red-50 dark:bg-red-950/30"}`}>
                {portfolio.portfolioStatus === "SAFE"
                  ? <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                  : <AlertTriangle className="w-4 h-4 text-red-500" />}
              </div>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground leading-tight">Portfolio Status</p>
                <p className={`text-lg font-bold leading-tight mt-0.5 ${portfolio.portfolioStatus === "SAFE" ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`} data-testid="text-portfolio-status">{portfolio.portfolioStatus}</p>
                <div className="flex gap-1 flex-wrap mt-0.5">
                  {portfolio.productsAtRisk > 0 && <span className="text-xs text-red-500">{portfolio.productsAtRisk} at risk</span>}
                  {portfolio.productsSellPriority > 0 && <span className="text-xs text-amber-500">{portfolio.productsSellPriority} 🔥</span>}
                  {portfolio.productsNoSheet > 0 && <span className="text-xs text-muted-foreground">{portfolio.productsNoSheet} unpriced</span>}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <button
          onClick={() => toggleInsight("needsPricing")}
          data-testid="card-insight-needs-pricing"
          className={`text-left rounded-lg border p-3.5 transition-all hover:shadow-sm ${activeInsight === "needsPricing" ? "border-amber-400 bg-amber-50 dark:bg-amber-950/20" : "border-border bg-card hover:border-amber-300"}`}
        >
          <div className="flex items-center gap-2 mb-1.5">
            <AlertCircle className="w-4 h-4 text-amber-500 flex-shrink-0" />
            <span className="text-sm font-semibold text-amber-700 dark:text-amber-400">Needs Pricing</span>
            <span className="ml-auto text-xl font-bold text-amber-600 dark:text-amber-400" data-testid="text-insight-needs-pricing-count">{needsPricingProducts.length}</span>
          </div>
          <div className="space-y-0.5">
            {needsPricingProducts.slice(0, 3).map(p => (
              <p key={p.productId} className="text-xs text-muted-foreground truncate">{p.productName}</p>
            ))}
            {needsPricingProducts.length === 0 && <p className="text-xs text-muted-foreground">All products are priced</p>}
            {needsPricingProducts.length > 3 && <p className="text-xs text-muted-foreground">+{needsPricingProducts.length - 3} more</p>}
          </div>
        </button>

        <button
          onClick={() => toggleInsight("highRisk")}
          data-testid="card-insight-high-risk"
          className={`text-left rounded-lg border p-3.5 transition-all hover:shadow-sm ${activeInsight === "highRisk" ? "border-red-400 bg-red-50 dark:bg-red-950/20" : "border-border bg-card hover:border-red-300"}`}
        >
          <div className="flex items-center gap-2 mb-1.5">
            <TrendingDown className="w-4 h-4 text-red-500 flex-shrink-0" />
            <span className="text-sm font-semibold text-red-700 dark:text-red-400">High Risk Products</span>
            <span className="ml-auto text-xl font-bold text-red-600 dark:text-red-400" data-testid="text-insight-high-risk-count">{highRiskProducts.length}</span>
          </div>
          <div className="space-y-0.5">
            {highRiskProducts.slice(0, 3).map(p => (
              <p key={p.productId} className="text-xs text-muted-foreground truncate">{p.productName} <span className="text-red-500">{fmtPct(p.marginPct)}</span></p>
            ))}
            {highRiskProducts.length === 0 && <p className="text-xs text-muted-foreground">No high-risk products</p>}
            {highRiskProducts.length > 3 && <p className="text-xs text-muted-foreground">+{highRiskProducts.length - 3} more</p>}
          </div>
        </button>

        <button
          onClick={() => toggleInsight("sellPriority")}
          data-testid="card-insight-sell-priority"
          className={`text-left rounded-lg border p-3.5 transition-all hover:shadow-sm ${activeInsight === "sellPriority" ? "border-orange-400 bg-orange-50 dark:bg-orange-950/20" : "border-border bg-card hover:border-orange-300"}`}
        >
          <div className="flex items-center gap-2 mb-1.5">
            <Flame className="w-4 h-4 text-orange-500 flex-shrink-0" />
            <span className="text-sm font-semibold text-orange-700 dark:text-orange-400">Old Stock Pressure</span>
            <span className="ml-auto text-xl font-bold text-orange-600 dark:text-orange-400" data-testid="text-insight-sell-priority-count">{sellPriorityProducts.length}</span>
          </div>
          <div className="space-y-0.5">
            {sellPriorityProducts.slice(0, 3).map(p => (
              <p key={p.productId} className="text-xs text-muted-foreground truncate">🔥 {p.productName} <span className="text-orange-500">{p.lotAgeDays}d</span></p>
            ))}
            {sellPriorityProducts.length === 0 && <p className="text-xs text-muted-foreground">No aged stock issues</p>}
            {sellPriorityProducts.length > 3 && <p className="text-xs text-muted-foreground">+{sellPriorityProducts.length - 3} more</p>}
          </div>
        </button>
      </div>
      {activeInsight && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>Showing filtered results for <strong>{activeInsight === "needsPricing" ? "Needs Pricing" : activeInsight === "highRisk" ? "High Risk" : "Old Stock Pressure"}</strong></span>
          <button onClick={() => setActiveInsight(null)} className="text-primary underline underline-offset-2">Clear filter</button>
        </div>
      )}

      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-40">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input placeholder="Search product, SKU, category…" value={search} onChange={e => setSearch(e.target.value)} className="pl-8 h-8 text-sm" data-testid="input-pricing-search" />
        </div>
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="w-44 h-8 text-sm" data-testid="select-pricing-category">
            <SelectValue placeholder="All Categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {categories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
        {!activeInsight && (
          <div className="flex items-center gap-2">
            <Switch id="at-risk-toggle" checked={atRiskOnly} onCheckedChange={setAtRiskOnly} data-testid="switch-at-risk" />
            <Label htmlFor="at-risk-toggle" className="text-sm cursor-pointer">Show only at-risk</Label>
          </div>
        )}
        <span className="text-xs text-muted-foreground ml-auto">{filtered.length} product{filtered.length !== 1 ? "s" : ""}</span>
        <Button variant="outline" size="sm" onClick={handleExportPDF} disabled={filtered.length === 0} data-testid="button-pricing-pdf">
          <FileText className="w-3.5 h-3.5 mr-1.5" />PDF
        </Button>
        <Button variant="outline" size="sm" onClick={handleExportCSV} disabled={filtered.length === 0} data-testid="button-pricing-csv">
          <Download className="w-3.5 h-3.5 mr-1.5" />CSV
        </Button>
      </div>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/30">
                <th className="text-left px-4 py-2.5 font-medium text-xs text-muted-foreground">Product</th>
                <th className="text-left px-3 py-2.5 font-medium text-xs text-muted-foreground">Category</th>
                <th className="text-right px-3 py-2.5 font-medium text-xs text-muted-foreground">Stock</th>
                <th className="text-right px-3 py-2.5 font-medium text-xs text-muted-foreground">Blended Cost</th>
                <th className="text-right px-3 py-2.5 font-medium text-xs text-muted-foreground">Global Floor</th>
                <th className="text-right px-3 py-2.5 font-medium text-xs text-muted-foreground">Strict Floor</th>
                <th className="text-right px-3 py-2.5 font-medium text-xs text-muted-foreground">Eff. Price</th>
                <th className="text-center px-3 py-2.5 font-medium text-xs text-muted-foreground">Source</th>
                <th className="text-right px-3 py-2.5 font-medium text-xs text-muted-foreground">Margin %</th>
                <th className="text-center px-3 py-2.5 font-medium text-xs text-muted-foreground">Risk</th>
                <th className="text-center px-3 py-2.5 font-medium text-xs text-muted-foreground">Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={11} className="text-center py-10 text-muted-foreground text-sm">No products match the current filter.</td>
                </tr>
              ) : filtered.map(p => (
                <tr key={p.productId} className="border-b hover:bg-muted/20 transition-colors" data-testid={`row-pricing-${p.productId}`}>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-1.5">
                      {p.sellPriority && <Flame className="w-3.5 h-3.5 text-orange-500 flex-shrink-0" />}
                      <div>
                        <p className="font-medium leading-tight">{p.productName}</p>
                        <p className="text-xs text-muted-foreground">{p.sku}</p>
                      </div>
                      {p.needsPricingReview && <Badge className="ml-1 bg-amber-100 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400 border-0 text-xs px-1 py-0">Review</Badge>}
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-muted-foreground text-xs">{p.category}</td>
                  <td className="px-3 py-2.5 text-right font-mono text-xs">{p.totalStock.toLocaleString()} {p.unit}</td>
                  <td className="px-3 py-2.5 text-right text-xs font-mono">{p.blendedCost !== null ? fmtCur(p.blendedCost) : <span className="text-muted-foreground">—</span>}</td>
                  <td className="px-3 py-2.5 text-right text-xs font-mono text-amber-600 dark:text-amber-400">{p.globalFloor !== null ? fmtCur(p.globalFloor) : <span className="text-muted-foreground">—</span>}</td>
                  <td className="px-3 py-2.5 text-right text-xs font-mono text-red-600 dark:text-red-400">{p.strictFloor !== null ? fmtCur(p.strictFloor) : <span className="text-muted-foreground">—</span>}</td>
                  <td className="px-3 py-2.5 text-right text-xs font-mono">
                    <div className="flex items-center justify-end gap-1">
                      <span className="font-medium">{fmtCur(p.confirmedPrice)}</span>
                      {p.hasUnconfirmedSheet && !p.hasConfirmedSheet && <span title="Draft/submitted sheet exists" className="text-amber-500 text-xs">◑</span>}
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    <SourceBadge source={p.source} sheetDate={p.sheetDate} />
                  </td>
                  <td className="px-3 py-2.5 text-right text-xs">
                    {p.marginPct !== null ? (
                      <span className={p.marginPct < p.minMarginPct ? "text-red-600 dark:text-red-400 font-semibold" : p.marginPct < (p.minMarginPct + 10) ? "text-amber-600 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400"}>
                        {fmtPct(p.marginPct)}
                      </span>
                    ) : <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="px-3 py-2.5 text-center"><PressureBadge level={p.pressureLevel} /></td>
                  <td className="px-3 py-2.5 text-center">
                    {p.hasConfirmedToday
                      ? <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400 border-0 text-xs">Confirmed</Badge>
                      : p.hasUnconfirmedSheet
                      ? <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400 border-0 text-xs">Pending</Badge>
                      : <Badge variant="outline" className="text-muted-foreground text-xs">No Sheet</Badge>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

// ─── Tab label map ────────────────────────────────────────────────────────────

const TAB_LABELS: Record<string, string> = {
  overview: "Overview",
  receivables: "Receivables",
  payables: "Payables",
  "cash-banking": "Cash & Banking",
  "sales-revenue": "Sales & Revenue",
  "tax-compliance": "Tax & Compliance",
  "financial-statements": "Financial Statements",
  pricing: "Pricing",
};

// ─── Main Reports page ────────────────────────────────────────────────────────

export default function Reports() {
  const { data: currentUser } = useCurrentUser();
  // getUser() reads synchronously from sessionStorage — safe to use in useState initialiser
  // so the correct default tab is set on the very first render before the query resolves.
  const initialRole = getUser()?.role ?? "";
  const isSalesManager = currentUser?.role === "sales_manager" || initialRole === "sales_manager";
  const canManagePricing = ["admin", "accountant"].includes(currentUser?.role ?? "");
  const isFinanceUser = ["admin", "accountant"].includes(currentUser?.role ?? "");
  const [activeTab, setActiveTab] = useState(initialRole === "sales_manager" ? "receivables" : "overview");
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const reportCards = [
    { title: "Sales Report", description: "Revenue, orders, and customer analytics", icon: ShoppingCart, color: "text-blue-500", bg: "bg-blue-50 dark:bg-blue-950/30", action: () => setActiveTab("sales-revenue") },
    { title: "Inventory Report", description: "Stock levels, movements, and alerts", icon: Package, color: "text-emerald-500", bg: "bg-emerald-50 dark:bg-emerald-950/30", action: () => navigate("/inventory") },
    { title: "Financial Report", description: "Income, expenses, and P&L statements", icon: CreditCard, color: "text-violet-500", bg: "bg-violet-50 dark:bg-violet-950/30", action: () => setActiveTab("financial-statements") },
    { title: "Staff Report", description: "Employee performance and attendance", icon: Users, color: "text-orange-500", bg: "bg-orange-50 dark:bg-orange-950/30", action: () => navigate("/employees") },
    { title: "Project Report", description: "Project status and timeline tracking", icon: TrendingUp, color: "text-pink-500", bg: "bg-pink-50 dark:bg-pink-950/30", action: () => navigate("/projects") },
    { title: "Tax Report", description: "GST, TDS, and tax compliance reports", icon: FileText, color: "text-indigo-500", bg: "bg-indigo-50 dark:bg-indigo-950/30", action: () => setActiveTab("tax-compliance") },
  ];

  const exportCurrentTab = () => {
    toast({
      title: "Use the in-tab export buttons",
      description: `Each panel in ${TAB_LABELS[activeTab] ?? "this tab"} has its own CSV and PDF export buttons.`,
    });
  };

  return (
    <div className="p-6 space-y-6 overflow-auto h-full">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Reports</h1>
          <p className="text-muted-foreground text-sm mt-1">Business analytics and exportable reports</p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" data-testid="button-export-all">
              <Download className="w-4 h-4 mr-2" />
              Export
              <ChevronDown className="w-3.5 h-3.5 ml-1.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => exportCurrentTab()} data-testid="dropdown-export-csv">
              <Download className="w-4 h-4 mr-2" />
              Export {TAB_LABELS[activeTab] ?? "Current Tab"} as CSV
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => exportCurrentTab()} data-testid="dropdown-export-pdf">
              <FileText className="w-4 h-4 mr-2" />
              Export {TAB_LABELS[activeTab] ?? "Current Tab"} as PDF
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="flex flex-wrap gap-1 h-auto" data-testid="tabs-reports">
          {/* sales_manager: Receivables and Payables only */}
          {!isSalesManager && <TabsTrigger value="overview" data-testid="tab-overview">Overview</TabsTrigger>}
          <TabsTrigger value="receivables" data-testid="tab-receivables">Receivables</TabsTrigger>
          {!isSalesManager && <TabsTrigger value="payables" data-testid="tab-payables">Payables</TabsTrigger>}
          {isFinanceUser && <TabsTrigger value="cash-banking" data-testid="tab-cash-banking">Cash &amp; Banking</TabsTrigger>}
          {isFinanceUser && <TabsTrigger value="sales-revenue" data-testid="tab-sales-revenue">Sales &amp; Revenue</TabsTrigger>}
          {isFinanceUser && <TabsTrigger value="tax-compliance" data-testid="tab-tax-compliance">Tax &amp; Compliance</TabsTrigger>}
          {isFinanceUser && <TabsTrigger value="financial-statements" data-testid="tab-financial-statements">Financial Statements</TabsTrigger>}
          {canManagePricing && <TabsTrigger value="pricing" data-testid="tab-pricing">Pricing</TabsTrigger>}
        </TabsList>

        {/* ── Tab 1: Overview ── */}
        <TabsContent value="overview" className="space-y-6 mt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {reportCards.map((report) => {
              const Icon = report.icon;
              return (
                <Card key={report.title} className="hover-elevate" data-testid={`card-report-${report.title.toLowerCase().replace(/\s+/g, "-")}`}>
                  <CardContent className="p-5">
                    <div className="flex items-center gap-4 mb-3">
                      <div className={`w-10 h-10 rounded-md flex items-center justify-center ${report.bg}`}>
                        <Icon className={`w-5 h-5 ${report.color}`} />
                      </div>
                      <div>
                        <p className="font-semibold">{report.title}</p>
                        <p className="text-xs text-muted-foreground">{report.description}</p>
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full"
                      onClick={report.action}
                      data-testid={`button-open-${report.title.toLowerCase().replace(/\s+/g, "-")}`}
                    >
                      <BarChart3 className="w-3.5 h-3.5 mr-2" />
                      View Report
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>

        {/* ── Tab 2: Receivables ── */}
        <TabsContent value="receivables" className="mt-4">
          <Tabs defaultValue={isFinanceUser ? "customer-summary" : "invoice-detail"}>
            <TabsList className="mb-4" data-testid="tablist-receivables">
              {isFinanceUser && (
                <TabsTrigger value="customer-summary" data-testid="tab-recv-customer-summary">Customer Summary</TabsTrigger>
              )}
              <TabsTrigger value="invoice-detail" data-testid="tab-recv-invoice-detail">Invoice Detail</TabsTrigger>
            </TabsList>
            {isFinanceUser && (
              <TabsContent value="customer-summary">
                <Suspense fallback={<PageLoader />}>
                  <CustomerAging />
                </Suspense>
              </TabsContent>
            )}
            <TabsContent value="invoice-detail">
              <ARAgingTab />
            </TabsContent>
          </Tabs>
        </TabsContent>

        {/* ── Tab 3: Payables ── */}
        <TabsContent value="payables" className="mt-4">
          <Tabs defaultValue={isFinanceUser ? "supplier-summary" : "invoice-detail"}>
            <TabsList className="mb-4" data-testid="tablist-payables">
              {isFinanceUser && (
                <TabsTrigger value="supplier-summary" data-testid="tab-pay-supplier-summary">Supplier Summary</TabsTrigger>
              )}
              <TabsTrigger value="invoice-detail" data-testid="tab-pay-invoice-detail">Invoice Detail</TabsTrigger>
            </TabsList>
            {isFinanceUser && (
              <TabsContent value="supplier-summary">
                <Suspense fallback={<PageLoader />}>
                  <SupplierAging />
                </Suspense>
              </TabsContent>
            )}
            <TabsContent value="invoice-detail">
              <APAgingTab />
            </TabsContent>
          </Tabs>
        </TabsContent>

        {/* ── Tab 4: Cash & Banking ── */}
        {isFinanceUser && (
          <TabsContent value="cash-banking" className="mt-4">
            <Tabs defaultValue="cash-position">
              <TabsList className="mb-4 flex flex-wrap gap-1 h-auto" data-testid="tablist-cash-banking">
                <TabsTrigger value="cash-position" className="text-xs" data-testid="tab-cb-cash-position">Cash Position</TabsTrigger>
                <TabsTrigger value="account-statement" className="text-xs" data-testid="tab-cb-account-statement">Account Statement</TabsTrigger>
                <TabsTrigger value="consolidated-cash" className="text-xs" data-testid="tab-cb-consolidated-cash">Consolidated Cash</TabsTrigger>
                <TabsTrigger value="cash-ledger" className="text-xs" data-testid="tab-cb-cash-ledger">Cash Ledger</TabsTrigger>
              </TabsList>
              <TabsContent value="cash-position">
                <Suspense fallback={<PageLoader />}><CashPosition /></Suspense>
              </TabsContent>
              <TabsContent value="account-statement">
                <Suspense fallback={<PageLoader />}><AccountStatement /></Suspense>
              </TabsContent>
              <TabsContent value="consolidated-cash">
                <Suspense fallback={<PageLoader />}><ConsolidatedCash /></Suspense>
              </TabsContent>
              <TabsContent value="cash-ledger">
                <Suspense fallback={<PageLoader />}><CashLedger /></Suspense>
              </TabsContent>
            </Tabs>
          </TabsContent>
        )}

        {/* ── Tab 5: Sales & Revenue ── */}
        {isFinanceUser && (
          <TabsContent value="sales-revenue" className="mt-4">
            <Tabs defaultValue="sales-register">
              <TabsList className="mb-4 flex flex-wrap gap-1 h-auto" data-testid="tablist-sales-revenue">
                <TabsTrigger value="sales-register"   className="text-xs" data-testid="tab-sr-sales-register">Sales Register</TabsTrigger>
                <TabsTrigger value="period-sales"     className="text-xs" data-testid="tab-sr-period-sales">Period Sales</TabsTrigger>
                <TabsTrigger value="period-profit"    className="text-xs" data-testid="tab-sr-period-profit">Period Profit</TabsTrigger>
                <TabsTrigger value="product-sales"    className="text-xs" data-testid="tab-sr-product-sales">Product Sales</TabsTrigger>
                <TabsTrigger value="product-profit"   className="text-xs" data-testid="tab-sr-product-profit">Product Profit</TabsTrigger>
              </TabsList>
              <TabsContent value="sales-register">
                <Suspense fallback={<PageLoader />}><SalesRegister /></Suspense>
              </TabsContent>
              <TabsContent value="period-sales">
                <Suspense fallback={<PageLoader />}><PeriodSales /></Suspense>
              </TabsContent>
              <TabsContent value="period-profit">
                <Suspense fallback={<PageLoader />}><PeriodProfit /></Suspense>
              </TabsContent>
              <TabsContent value="product-sales">
                <Suspense fallback={<PageLoader />}><ProductSales /></Suspense>
              </TabsContent>
              <TabsContent value="product-profit">
                <Suspense fallback={<PageLoader />}><ProductProfit /></Suspense>
              </TabsContent>
            </Tabs>
          </TabsContent>
        )}

        {/* ── Tab 6: Tax & Compliance ── */}
        {isFinanceUser && (
          <TabsContent value="tax-compliance" className="mt-4">
            <Tabs defaultValue="tax-summary">
              <TabsList className="mb-4 flex flex-wrap gap-1 h-auto" data-testid="tablist-tax-compliance">
                <TabsTrigger value="tax-summary" className="text-xs" data-testid="tab-tc-tax-summary">Tax Summary (GST)</TabsTrigger>
                <TabsTrigger value="expense-report" className="text-xs" data-testid="tab-tc-expense-report">Expense Report</TabsTrigger>
                <TabsTrigger value="purchase-register" className="text-xs" data-testid="tab-tc-purchase-register">Purchase Register</TabsTrigger>
              </TabsList>
              <TabsContent value="tax-summary">
                <Suspense fallback={<PageLoader />}><TaxSummary /></Suspense>
              </TabsContent>
              <TabsContent value="expense-report">
                <Suspense fallback={<PageLoader />}><ExpenseReport /></Suspense>
              </TabsContent>
              <TabsContent value="purchase-register">
                <Suspense fallback={<PageLoader />}><PurchaseRegister /></Suspense>
              </TabsContent>
            </Tabs>
          </TabsContent>
        )}

        {/* ── Tab 7: Financial Statements ── */}
        {isFinanceUser && (
          <TabsContent value="financial-statements" className="mt-4">
            <Tabs defaultValue="pl-statement">
              <TabsList className="mb-4" data-testid="tablist-financial-statements">
                <TabsTrigger value="pl-statement" data-testid="tab-fs-pl-statement">P&amp;L Statement</TabsTrigger>
                <TabsTrigger value="cash-flow" data-testid="tab-fs-cash-flow">Cash Flow</TabsTrigger>
                <TabsTrigger value="balance-sheet" data-testid="tab-fs-balance-sheet">Balance Sheet</TabsTrigger>
                <TabsTrigger value="financial-ratios" data-testid="tab-fs-financial-ratios">Financial Ratios</TabsTrigger>
              </TabsList>
              <TabsContent value="pl-statement">
                <Suspense fallback={<PageLoader />}><PLStatement /></Suspense>
              </TabsContent>
              <TabsContent value="cash-flow">
                <Suspense fallback={<PageLoader />}><CashFlowStatement /></Suspense>
              </TabsContent>
              <TabsContent value="balance-sheet">
                <Suspense fallback={<PageLoader />}><BalanceSheet /></Suspense>
              </TabsContent>
              <TabsContent value="financial-ratios">
                <Suspense fallback={<PageLoader />}><FinancialRatios /></Suspense>
              </TabsContent>
            </Tabs>
          </TabsContent>
        )}

        {/* ── Tab 8: Pricing ── */}
        {canManagePricing && (
          <TabsContent value="pricing" className="mt-4">
            <DailyPricingTab />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
