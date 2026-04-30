import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import {
  BarChart3, Download, ShoppingCart, Package, CreditCard, Users,
  TrendingUp, FileText, AlertTriangle, Clock, CheckCircle2, AlertCircle,
  Flame, TrendingDown, Shield, Search, ChevronDown, Loader2,
} from "lucide-react";
import { useCurrentUser } from "@/lib/auth";
import { generateAPAgingPDF, generateARAgingPDF, generatePricingPDF, generateTaxReportPDF, generateInventoryPDF, generateStaffPDF, generateSalesReportPDF, generateFinancialReportPDF } from "@/lib/reports-pdf";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
} from "recharts";

const salesData = [
  { month: "Jan", sales: 4000 },
  { month: "Feb", sales: 3000 },
  { month: "Mar", sales: 5000 },
  { month: "Apr", sales: 4500 },
  { month: "May", sales: 6000 },
  { month: "Jun", sales: 5500 },
];

const categoryData = [
  { name: "Solar Panels", value: 40 },
  { name: "Electronics", value: 30 },
  { name: "Commodities", value: 20 },
  { name: "Accessories", value: 10 },
];

const COLORS = ["hsl(217, 91%, 60%)", "hsl(160, 60%, 45%)", "hsl(30, 80%, 55%)", "hsl(280, 65%, 60%)"];

const reportCards = [
  { title: "Sales Report", description: "Revenue, orders, and customer analytics", icon: ShoppingCart, color: "text-blue-500", bg: "bg-blue-50 dark:bg-blue-950/30" },
  { title: "Inventory Report", description: "Stock levels, movements, and alerts", icon: Package, color: "text-emerald-500", bg: "bg-emerald-50 dark:bg-emerald-950/30" },
  { title: "Financial Report", description: "Income, expenses, and P&L statements", icon: CreditCard, color: "text-violet-500", bg: "bg-violet-50 dark:bg-violet-950/30" },
  { title: "Staff Report", description: "Employee performance and attendance", icon: Users, color: "text-orange-500", bg: "bg-orange-50 dark:bg-orange-950/30" },
  { title: "Project Report", description: "Project status and timeline tracking", icon: TrendingUp, color: "text-pink-500", bg: "bg-pink-50 dark:bg-pink-950/30" },
  { title: "Tax Report", description: "GST, TDS, and tax compliance reports", icon: FileText, color: "text-indigo-500", bg: "bg-indigo-50 dark:bg-indigo-950/30" },
];

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

// ─── Export helpers ──────────────────────────────────────────────────────────

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

interface ProductRow {
  id: string;
  name: string;
  sku: string;
  category: string;
  unit: string;
  costPrice: string | null;
  unitPrice: string;
}

interface InventoryStockRow {
  productId: string;
  quantity: number;
}

interface EmployeeRow {
  id: string;
  userId?: string | null;
  name: string;
  email: string;
  department: string;
  designation: string;
  isActive: boolean;
  joinDate?: string | null;
}

interface UserRow {
  id: string;
  role: string;
}

interface CustomerRow {
  id: string;
  name: string;
}

interface SupplierRow {
  id: string;
  name: string;
}

interface SalesInvoiceRow {
  id: string;
  invoiceNumber: string;
  customerId: string;
  customerType: string;
  customerGSTIN?: string | null;
  invoiceDate: string;
  dueDate?: string | null;
  grandTotal: string;
  creditedAmount?: string | null;
  status: string;
}

interface CustomerPaymentRow {
  id: string;
  invoiceId: string;
  amount: string;
}

interface SupplierInvoiceRow {
  id: string;
  invoiceNumber: string;
  supplierId: string;
  invoiceDate: string;
  subtotal: string;
  taxAmount: string;
  totalAmount: string;
  status: string;
}

interface SupplierPaymentRow {
  id: string;
  supplierInvoiceId: string | null;
  amount: string;
}

function APAgingTab() {
  const [supplierFilter, setSupplierFilter] = useState<string>("all");
  const [showPaid, setShowPaid] = useState(false);

  const { data, isLoading } = useQuery<APAgingResponse>({
    queryKey: ["/api/reports/ap-aging"],
  });

  const rows = data?.rows ?? [];

  const uniqueSuppliers = Array.from(new Map(rows.map(r => [r.supplierId, r.supplierName])).entries());

  // Apply supplier filter (but always include all non-zero balance rows for summary)
  const supplierFiltered = supplierFilter === "all" ? rows : rows.filter(r => r.supplierId === supplierFilter);

  // Compute summary from supplier-filtered, non-zero rows only
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

  // Table rows: apply paid-invoice toggle on top of supplier filter
  const filtered = supplierFiltered.filter(r => showPaid || r.balance > 0);

  const handleExportCSV = () => {
    downloadCSV(
      `itfi-ap-aging-${todayISO()}.csv`,
      ["Supplier", "Invoice #", "PO #", "Invoice Date", "Due Date", "Total (₹)", "Paid (₹)", "Balance (₹)", "Days Overdue", "Bucket", "Status"],
      filtered.map(r => [r.supplierName, r.invoiceNumber, r.poNumber ?? "", r.invoiceDate?.slice(0, 10) ?? "", r.dueDate?.slice(0, 10) ?? "", r.totalAmount, r.totalPaid, r.balance, r.daysOverdue > 0 ? r.daysOverdue : "Current", r.bucket, r.status])
    );
  };

  const handleExportPDF = () => {
    const blob = generateAPAgingPDF(filtered, summary, supplierFilter === "all" ? "All Suppliers" : (filtered[0]?.supplierName ?? ""));
    downloadPDF(`itfi-ap-aging-${todayISO()}.pdf`, blob);
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
      {/* Summary cards */}
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

      {/* Filters */}
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

      {/* Table */}
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
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-purple-100 text-purple-800 dark:bg-purple-950/40 dark:text-purple-400" data-testid={`badge-credit-grn-${row.invoiceId}`}>
                              Credit GRN
                            </span>
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
                {/* Totals footer */}
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
      `itfi-ar-aging-${todayISO()}.csv`,
      ["Customer", "Type", "GSTIN", "Invoice #", "Invoice Date", "Due Date", "Grand Total (₹)", "Paid (₹)", "Balance (₹)", "Days Overdue", "Bucket", "Status"],
      filtered.map(r => [r.customerName, r.customerType, r.customerGSTIN ?? "", r.invoiceNumber, r.invoiceDate?.slice(0, 10) ?? "", r.dueDate?.slice(0, 10) ?? "", r.grandTotal, r.totalPaid, r.balance, r.daysOverdue > 0 ? r.daysOverdue : "Current", r.bucket, r.status])
    );
  };

  const handleExportPDF = () => {
    const blob = generateARAgingPDF(filtered, summary, customerFilter === "all" ? "All Customers" : (filtered[0]?.customerName ?? ""));
    downloadPDF(`itfi-ar-aging-${todayISO()}.pdf`, blob);
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

// ─── Daily Pricing Tab ──────────────────────────────────────────────────────

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

  // Insight bucket counts + top-3 lists
  const needsPricingProducts = data.products.filter(p => p.needsPricingReview || p.source === "none");
  const highRiskProducts = data.products.filter(p => p.pressureLevel === "High Risk");
  const sellPriorityProducts = data.products.filter(p => p.sellPriority);

  const toggleInsight = (key: InsightFilter) => {
    setActiveInsight(prev => prev === key ? null : key);
    setAtRiskOnly(false);
  };

  let filtered = data.products;

  // Insight quick-filter (overrides atRiskOnly when active)
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
      `itfi-daily-pricing-${todayISO()}.csv`,
      ["Product", "SKU", "Category", "Stock", "Blended Cost (₹)", "Global Floor (₹)", "Strict Floor (₹)", "Confirmed Price (₹)", "Margin %", "Pressure Level", "Source", "Pricing Status", "Sell Priority"],
      filtered.map(p => [p.productName, p.sku, p.category, p.totalStock, p.blendedCost ?? "", p.globalFloor ?? "", p.strictFloor ?? "", p.confirmedPrice, p.marginPct != null ? p.marginPct.toFixed(1) : "", p.pressureLevel, p.source, pricingStatus(p), p.sellPriority ? "Yes" : "No"])
    );
  };

  const handleExportPDF = () => {
    const blob = generatePricingPDF(filtered, portfolio, search || category !== "all" || !!activeInsight ? "Filtered view" : "All Products");
    downloadPDF(`itfi-daily-pricing-${todayISO()}.pdf`, blob);
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

  // Sort: High Risk first, then Medium, then by marginPct ascending
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
      {/* Portfolio cards */}
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

      {/* Actionable Insights */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {/* Needs Pricing */}
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

        {/* High Risk */}
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

        {/* Old Stock Pressure */}
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

      {/* Filters */}
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

      {/* Table */}
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

const TAB_LABELS: Record<string, string> = {
  overview: "Overview",
  "ap-aging": "AP Aging",
  "ar-aging": "AR Aging",
  "daily-pricing": "Daily Pricing",
};

const cardFormats: Record<string, ("csv" | "pdf")[]> = {
  "Sales Report": ["csv", "pdf"],
  "Inventory Report": ["csv", "pdf"],
  "Financial Report": ["csv", "pdf"],
  "Staff Report": ["csv", "pdf"],
  "Project Report": [],
  "Tax Report": ["pdf"],
};

export default function Reports() {
  const { data: currentUser } = useCurrentUser();
  const canManagePricing = ["admin", "sales_manager", "accountant"].includes(currentUser?.role ?? "");
  const [activeTab, setActiveTab] = useState("overview");
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [loadingCard, setLoadingCard] = useState<string | null>(null);

  // ── Shared AP/AR export functions (using query cache, full unfiltered data) ──

  const buildAPSummary = (rows: APAgingRow[]) =>
    rows.filter(r => r.balance > 0).reduce(
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

  const buildARSummary = (rows: ARAgingRow[]) =>
    rows.filter(r => r.balance > 0).reduce(
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

  const exportCurrentTab = (format: "csv" | "pdf") => {
    const apData = queryClient.getQueryData<APAgingResponse>(["/api/reports/ap-aging"]);
    const arData = queryClient.getQueryData<ARAgingResponse>(["/api/reports/ar-aging"]);
    const pricingData = queryClient.getQueryData<PricingSummary>(["/api/reports/pricing-summary"]);

    if (activeTab === "ap-aging") {
      if (!apData?.rows?.length) {
        toast({ title: "No AP Aging data", description: "Open the AP Aging tab to load data first." });
        return;
      }
      const outstandingRows = apData.rows.filter(r => r.balance > 0);
      const summary = buildAPSummary(outstandingRows);
      if (format === "csv") {
        downloadCSV(
          `itfi-ap-aging-${todayISO()}.csv`,
          ["Supplier", "Invoice #", "PO #", "Invoice Date", "Due Date", "Total (₹)", "Paid (₹)", "Balance (₹)", "Days Overdue", "Bucket", "Status"],
          outstandingRows.map(r => [r.supplierName, r.invoiceNumber, r.poNumber ?? "", r.invoiceDate?.slice(0, 10) ?? "", r.dueDate?.slice(0, 10) ?? "", r.totalAmount, r.totalPaid, r.balance, r.daysOverdue > 0 ? r.daysOverdue : "Current", r.bucket, r.status])
        );
      } else {
        downloadPDF(`itfi-ap-aging-${todayISO()}.pdf`, generateAPAgingPDF(outstandingRows, summary, "All Suppliers"));
      }
    } else if (activeTab === "ar-aging") {
      if (!arData?.rows?.length) {
        toast({ title: "No AR Aging data", description: "Open the AR Aging tab to load data first." });
        return;
      }
      const outstandingRows = arData.rows.filter(r => r.balance > 0);
      const summary = buildARSummary(outstandingRows);
      if (format === "csv") {
        downloadCSV(
          `itfi-ar-aging-${todayISO()}.csv`,
          ["Customer", "Type", "GSTIN", "Invoice #", "Invoice Date", "Due Date", "Grand Total (₹)", "Paid (₹)", "Balance (₹)", "Days Overdue", "Bucket", "Status"],
          outstandingRows.map(r => [r.customerName, r.customerType, r.customerGSTIN ?? "", r.invoiceNumber, r.invoiceDate?.slice(0, 10) ?? "", r.dueDate?.slice(0, 10) ?? "", r.grandTotal, r.totalPaid, r.balance, r.daysOverdue > 0 ? r.daysOverdue : "Current", r.bucket, r.status])
        );
      } else {
        downloadPDF(`itfi-ar-aging-${todayISO()}.pdf`, generateARAgingPDF(outstandingRows, summary, "All Customers"));
      }
    } else if (activeTab === "daily-pricing") {
      if (!pricingData?.products?.length) {
        toast({ title: "No Pricing data", description: "Open the Daily Pricing tab to load data first." });
        return;
      }
      const ps = (p: PricingProduct) => p.hasConfirmedToday ? "Confirmed" : p.hasUnconfirmedSheet ? "Pending" : "No Sheet";
      if (format === "csv") {
        downloadCSV(
          `itfi-daily-pricing-${todayISO()}.csv`,
          ["Product", "SKU", "Category", "Stock", "Blended Cost (₹)", "Global Floor (₹)", "Strict Floor (₹)", "Confirmed Price (₹)", "Margin %", "Pressure Level", "Source", "Pricing Status", "Sell Priority"],
          pricingData.products.map(p => [p.productName, p.sku, p.category, p.totalStock, p.blendedCost ?? "", p.globalFloor ?? "", p.strictFloor ?? "", p.confirmedPrice, p.marginPct != null ? p.marginPct.toFixed(1) : "", p.pressureLevel, p.source, ps(p), p.sellPriority ? "Yes" : "No"])
        );
      } else {
        downloadPDF(`itfi-daily-pricing-${todayISO()}.pdf`, generatePricingPDF(pricingData.products, pricingData.portfolio, "All Products"));
      }
    } else {
      toast({ title: "Switch to a data tab first", description: "Select AP Aging, AR Aging, or Daily Pricing to export." });
    }
  };

  const handleCardExport = async (title: string, format: "csv" | "pdf") => {
    if (title === "Project Report") { navigate("/projects"); return; }

    setLoadingCard(title);
    if (title === "Tax Report") {
      toast({ title: "⏳ Generating Tax Report…", description: "Fetching AP & AR aging data — download will start automatically." });
    }

    try {
      if (title === "Inventory Report") {
        const [products, inventoryStock] = await Promise.all([
          queryClient.fetchQuery<ProductRow[]>({ queryKey: ["/api/products"], staleTime: 30_000 }),
          queryClient.fetchQuery<InventoryStockRow[]>({ queryKey: ["/api/inventory-stock"], staleTime: 30_000 }),
        ]);
        const stockMap = new Map<string, number>();
        for (const s of inventoryStock) {
          stockMap.set(s.productId, (stockMap.get(s.productId) ?? 0) + s.quantity);
        }
        if (format === "csv") {
          downloadCSV(
            `itfi-inventory-${todayISO()}.csv`,
            ["Product", "SKU", "Category", "Unit", "Total Stock", "Cost Price (₹)", "List Price (₹)", "Stock Value (Cost ₹)"],
            products.map(p => {
              const qty = stockMap.get(p.id) ?? 0;
              const cost = Number(p.costPrice ?? 0);
              return [p.name, p.sku, p.category, p.unit, qty, cost || "", p.unitPrice, qty * cost];
            })
          );
        } else {
          downloadPDF(`itfi-inventory-${todayISO()}.pdf`, generateInventoryPDF(products, stockMap));
        }

      } else if (title === "Staff Report") {
        const [employees, users] = await Promise.all([
          queryClient.fetchQuery<EmployeeRow[]>({ queryKey: ["/api/employees"], staleTime: 30_000 }),
          queryClient.fetchQuery<UserRow[]>({ queryKey: ["/api/users"], staleTime: 30_000 }).catch(() => [] as UserRow[]),
        ]);
        const userRoleMap = new Map(users.map(u => [u.id, u.role]));
        const enriched = employees.map(e => ({
          ...e,
          role: e.userId ? (userRoleMap.get(e.userId) ?? "—") : "—",
        }));
        if (format === "csv") {
          downloadCSV(
            `itfi-staff-${todayISO()}.csv`,
            ["Name", "Employee ID", "Department", "Designation", "Role", "Status"],
            enriched.map(e => [e.name, e.id.slice(0, 8).toUpperCase(), e.department, e.designation, e.role, e.isActive ? "Active" : "Inactive"])
          );
        } else {
          downloadPDF(`itfi-staff-${todayISO()}.pdf`, generateStaffPDF(enriched));
        }

      } else if (title === "Sales Report") {
        const [invoices, customers, payments] = await Promise.all([
          queryClient.fetchQuery<SalesInvoiceRow[]>({ queryKey: ["/api/sales-invoices"], staleTime: 30_000 }),
          queryClient.fetchQuery<CustomerRow[]>({ queryKey: ["/api/customers"], staleTime: 30_000 }),
          queryClient.fetchQuery<CustomerPaymentRow[]>({ queryKey: ["/api/customer-payments"], staleTime: 30_000 }),
        ]);
        const customerMap = new Map(customers.map(c => [c.id, c.name]));
        const paidMap = new Map<string, number>();
        for (const p of payments) {
          paidMap.set(p.invoiceId, (paidMap.get(p.invoiceId) ?? 0) + Number(p.amount));
        }
        const rows = invoices.map(inv => {
          const totalPaid = paidMap.get(inv.id) ?? 0;
          const balance = Math.max(0, Number(inv.grandTotal) - totalPaid);
          return { ...inv, customerName: customerMap.get(inv.customerId) ?? inv.customerId, totalPaid, balance };
        });
        if (format === "csv") {
          downloadCSV(
            `itfi-sales-report-${todayISO()}.csv`,
            ["Invoice #", "Customer", "Type", "Invoice Date", "Due Date", "Grand Total (₹)", "Collected (₹)", "Balance (₹)", "Status"],
            rows.map(r => [r.invoiceNumber, r.customerName, r.customerType, r.invoiceDate?.slice(0, 10) ?? "", r.dueDate?.slice(0, 10) ?? "", r.grandTotal, r.totalPaid, r.balance, r.status])
          );
        } else {
          const pdfRows = rows.map(r => ({
            customerName: r.customerName,
            customerType: r.customerType,
            customerGSTIN: r.customerGSTIN ?? null,
            invoiceNumber: r.invoiceNumber,
            invoiceDate: r.invoiceDate,
            dueDate: r.dueDate ?? null,
            grandTotal: Number(r.grandTotal),
            totalPaid: r.totalPaid,
            balance: r.balance,
            daysOverdue: 0,
            bucket: "current",
            status: r.status,
          }));
          downloadPDF(`itfi-sales-report-${todayISO()}.pdf`, generateSalesReportPDF(pdfRows));
        }

      } else if (title === "Financial Report") {
        const [invoices, customers, payments, supplierInvoices, suppliers, supplierPayments] = await Promise.all([
          queryClient.fetchQuery<SalesInvoiceRow[]>({ queryKey: ["/api/sales-invoices"], staleTime: 30_000 }),
          queryClient.fetchQuery<CustomerRow[]>({ queryKey: ["/api/customers"], staleTime: 30_000 }),
          queryClient.fetchQuery<CustomerPaymentRow[]>({ queryKey: ["/api/customer-payments"], staleTime: 30_000 }),
          queryClient.fetchQuery<SupplierInvoiceRow[]>({ queryKey: ["/api/supplier-invoices"], staleTime: 30_000 }),
          queryClient.fetchQuery<SupplierRow[]>({ queryKey: ["/api/suppliers"], staleTime: 30_000 }),
          queryClient.fetchQuery<SupplierPaymentRow[]>({ queryKey: ["/api/supplier-payments"], staleTime: 30_000 }),
        ]);
        const customerMap = new Map(customers.map(c => [c.id, c.name]));
        const supplierMap = new Map(suppliers.map(s => [s.id, s.name]));
        const paidMap = new Map<string, number>();
        for (const p of payments) {
          paidMap.set(p.invoiceId, (paidMap.get(p.invoiceId) ?? 0) + Number(p.amount));
        }
        const apPaidMap = new Map<string, number>();
        for (const p of supplierPayments) {
          if (p.supplierInvoiceId) {
            apPaidMap.set(p.supplierInvoiceId, (apPaidMap.get(p.supplierInvoiceId) ?? 0) + Number(p.amount));
          }
        }
        const arRows = invoices.map(inv => {
          const totalPaid = paidMap.get(inv.id) ?? 0;
          const balance = Math.max(0, Number(inv.grandTotal) - totalPaid);
          return { ...inv, customerName: customerMap.get(inv.customerId) ?? inv.customerId, totalPaid, balance };
        });
        const apRows = supplierInvoices.map(inv => {
          const totalPaid = apPaidMap.get(inv.id) ?? 0;
          const balance = Math.max(0, Number(inv.totalAmount) - totalPaid);
          return {
            ...inv,
            supplierName: supplierMap.get(inv.supplierId) ?? inv.supplierId,
            totalPaid,
            balance,
            poNumber: null as string | null,
            daysOverdue: 0,
            bucket: "current",
          };
        });
        if (format === "csv") {
          const revenueRows = arRows.map(r => [r.invoiceNumber, r.customerName, "Income", r.invoiceDate?.slice(0, 10) ?? "", r.grandTotal, r.totalPaid, r.balance, r.status] as (string | number | null)[]);
          const expenseRows = apRows.map(r => [r.invoiceNumber, r.supplierName, "Expense", r.invoiceDate?.slice(0, 10) ?? "", r.totalAmount, r.totalPaid, r.balance, r.status] as (string | number | null)[]);
          downloadCSV(
            `itfi-financial-report-${todayISO()}.csv`,
            ["Invoice #", "Entity", "Type", "Date", "Total (₹)", "Paid (₹)", "Balance (₹)", "Status"],
            [...revenueRows, ...expenseRows]
          );
        } else {
          const arPdfRows = arRows.map(r => ({
            customerName: r.customerName, customerType: r.customerType,
            customerGSTIN: r.customerGSTIN ?? null, invoiceNumber: r.invoiceNumber,
            invoiceDate: r.invoiceDate, dueDate: r.dueDate ?? null,
            grandTotal: Number(r.grandTotal), totalPaid: r.totalPaid, balance: r.balance,
            daysOverdue: 0, bucket: "current", status: r.status,
          }));
          const apPdfRows = apRows.map(r => ({
            supplierName: r.supplierName, invoiceNumber: r.invoiceNumber, poNumber: r.poNumber,
            invoiceDate: r.invoiceDate, dueDate: null as string | null,
            totalAmount: Number(r.totalAmount), totalPaid: r.totalPaid, balance: r.balance,
            daysOverdue: 0, bucket: "current", status: r.status,
          }));
          downloadPDF(`itfi-financial-report-${todayISO()}.pdf`, generateFinancialReportPDF(arPdfRows, apPdfRows));
        }

      } else if (title === "Tax Report") {
        const [apData, arData] = await Promise.all([
          queryClient.fetchQuery<APAgingResponse>({ queryKey: ["/api/reports/ap-aging"], staleTime: 30_000 }),
          queryClient.fetchQuery<ARAgingResponse>({ queryKey: ["/api/reports/ar-aging"], staleTime: 30_000 }),
        ]);
        const apOutstanding = (apData?.rows ?? []).filter(r => r.balance > 0);
        const arOutstanding = (arData?.rows ?? []).filter(r => r.balance > 0);
        const apSummary = buildAPSummary(apOutstanding);
        const arSummary = buildARSummary(arOutstanding);
        const blob = generateTaxReportPDF(apOutstanding, apSummary, arOutstanding, arSummary);
        downloadPDF(`itfi-tax-report-${todayISO()}.pdf`, blob);
      }
    } catch {
      toast({ title: "Export failed", description: "Could not generate the report. Please try again.", variant: "destructive" });
    } finally {
      setLoadingCard(null);
    }
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
            <DropdownMenuItem onClick={() => exportCurrentTab("csv")} data-testid="dropdown-export-csv">
              <Download className="w-4 h-4 mr-2" />
              Export {TAB_LABELS[activeTab] ?? "Current Tab"} as CSV
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => exportCurrentTab("pdf")} data-testid="dropdown-export-pdf">
              <FileText className="w-4 h-4 mr-2" />
              Export {TAB_LABELS[activeTab] ?? "Current Tab"} as PDF
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList data-testid="tabs-reports">
          <TabsTrigger value="overview" data-testid="tab-overview">Overview</TabsTrigger>
          <TabsTrigger value="ap-aging" data-testid="tab-ap-aging">AP Aging</TabsTrigger>
          <TabsTrigger value="ar-aging" data-testid="tab-ar-aging">AR Aging</TabsTrigger>
          {canManagePricing && <TabsTrigger value="daily-pricing" data-testid="tab-daily-pricing">Daily Pricing</TabsTrigger>}
        </TabsList>

        <TabsContent value="overview" className="space-y-6 mt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {reportCards.map((report) => {
              const formats = cardFormats[report.title] ?? [];
              const isLoading = loadingCard === report.title;
              const testId = `button-generate-${report.title.toLowerCase().replace(/\s+/g, "-")}`;
              return (
                <Card key={report.title} className="hover-elevate" data-testid={`card-report-${report.title.toLowerCase().replace(/\s+/g, "-")}`}>
                  <CardContent className="p-5">
                    <div className="flex items-center gap-4 mb-3">
                      <div className={`w-10 h-10 rounded-md flex items-center justify-center ${report.bg}`}>
                        <report.icon className={`w-5 h-5 ${report.color}`} />
                      </div>
                      <div>
                        <p className="font-semibold">{report.title}</p>
                        <p className="text-xs text-muted-foreground">{report.description}</p>
                      </div>
                    </div>
                    {formats.length === 0 ? (
                      <Button variant="outline" size="sm" className="w-full" onClick={() => handleCardExport(report.title, "pdf")} data-testid={testId}>
                        <BarChart3 className="w-3.5 h-3.5 mr-2" />
                        Open Report
                      </Button>
                    ) : formats.length === 1 ? (
                      <Button variant="outline" size="sm" className="w-full" disabled={isLoading} onClick={() => handleCardExport(report.title, formats[0])} data-testid={testId}>
                        {isLoading ? <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" /> : <Download className="w-3.5 h-3.5 mr-2" />}
                        {isLoading ? "Generating…" : "Generate Report"}
                      </Button>
                    ) : (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="outline" size="sm" className="w-full" disabled={isLoading} data-testid={testId}>
                            {isLoading ? <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" /> : <Download className="w-3.5 h-3.5 mr-2" />}
                            {isLoading ? "Generating…" : "Generate Report"}
                            <ChevronDown className="w-3 h-3 ml-auto" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-40">
                          <DropdownMenuItem onClick={() => handleCardExport(report.title, "csv")} data-testid={`${testId}-csv`}>
                            <Download className="w-4 h-4 mr-2" />
                            Export CSV
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => handleCardExport(report.title, "pdf")} data-testid={`${testId}-pdf`}>
                            <FileText className="w-4 h-4 mr-2" />
                            Export PDF
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-semibold">Monthly Sales Trend</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={salesData}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                      <XAxis dataKey="month" tick={{ fill: "hsl(215, 16%, 47%)", fontSize: 12 }} />
                      <YAxis tick={{ fill: "hsl(215, 16%, 47%)", fontSize: 12 }} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "hsl(0, 0%, 100%)",
                          border: "1px solid hsl(214, 20%, 88%)",
                          borderRadius: "6px",
                          fontSize: "12px",
                        }}
                      />
                      <Bar dataKey="sales" fill="hsl(217, 91%, 60%)" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-semibold">Sales by Category</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-64 flex items-center justify-center">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={categoryData}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={90}
                        paddingAngle={2}
                        dataKey="value"
                      >
                        {categoryData.map((_, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex flex-wrap gap-4 justify-center mt-2">
                  {categoryData.map((item, index) => (
                    <div key={item.name} className="flex items-center gap-2 text-xs">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: COLORS[index] }} />
                      <span className="text-muted-foreground">{item.name} ({item.value}%)</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="ap-aging" className="mt-4">
          <APAgingTab />
        </TabsContent>

        <TabsContent value="ar-aging" className="mt-4">
          <ARAgingTab />
        </TabsContent>

        {canManagePricing && (
          <TabsContent value="daily-pricing" className="mt-4">
            <DailyPricingTab />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
