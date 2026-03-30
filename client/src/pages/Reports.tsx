import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  BarChart3, Download, ShoppingCart, Package, CreditCard, Users,
  TrendingUp, FileText, AlertTriangle, Clock, CheckCircle2, AlertCircle,
} from "lucide-react";
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
                      <td className="px-4 py-3 font-mono text-xs">{row.invoiceNumber}</td>
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
                      <td colSpan={2} />
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

export default function Reports() {
  return (
    <div className="p-6 space-y-6 overflow-auto h-full">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Reports</h1>
          <p className="text-muted-foreground text-sm mt-1">Business analytics and exportable reports</p>
        </div>
        <Button variant="outline" data-testid="button-export-all">
          <Download className="w-4 h-4 mr-2" />
          Export All
        </Button>
      </div>

      <Tabs defaultValue="overview">
        <TabsList data-testid="tabs-reports">
          <TabsTrigger value="overview" data-testid="tab-overview">Overview</TabsTrigger>
          <TabsTrigger value="ap-aging" data-testid="tab-ap-aging">AP Aging</TabsTrigger>
          <TabsTrigger value="ar-aging" data-testid="tab-ar-aging">AR Aging</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6 mt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {reportCards.map((report) => (
              <Card key={report.title} className="hover-elevate cursor-pointer" data-testid={`card-report-${report.title.toLowerCase().replace(/\s+/g, "-")}`}>
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
                  <Button variant="outline" size="sm" className="w-full">
                    <Download className="w-3.5 h-3.5 mr-2" />
                    Generate Report
                  </Button>
                </CardContent>
              </Card>
            ))}
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
      </Tabs>
    </div>
  );
}
