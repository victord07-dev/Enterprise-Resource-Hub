import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Download, FileSpreadsheet, RefreshCw, ShoppingCart } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQuery as useCustomerQuery } from "@tanstack/react-query";

interface Customer { id: string; name: string; }
interface SalesRegisterRow {
  invoiceId: string; invoiceNumber: string; invoiceDate: string;
  customerName: string; customerGSTIN: string | null; customerType: string;
  subtotal: number; totalTax: number; grandTotal: number;
  paidAmount: number; outstanding: number; status: string;
}
interface SalesRegisterResult {
  period: { from: string | null; to: string | null };
  rows: SalesRegisterRow[];
  totals: { subtotal: number; totalTax: number; grandTotal: number; paidAmount: number; outstanding: number; count: number };
}

function fmtCur(v: number) { return "₹" + v.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function fmtShort(v: number) { if (v === 0) return "—"; return "₹" + v.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 0 }); }

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-amber-100 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400",
  paid: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400",
  partial: "bg-blue-100 text-blue-700 dark:bg-blue-950/30 dark:text-blue-400",
  overdue: "bg-red-100 text-red-700 dark:bg-red-950/30 dark:text-red-400",
  cancelled: "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400",
};

const thisMonth = new Date();
const defaultFrom = `${thisMonth.getFullYear()}-${String(thisMonth.getMonth() + 1).padStart(2, "0")}-01`;
const defaultTo = new Date().toISOString().slice(0, 10);

export function SalesRegister() {
  const { toast } = useToast();
  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(defaultTo);
  const [customerFilter, setCustomerFilter] = useState("__all__");
  const [statusFilter, setStatusFilter] = useState("__all__");
  const [exporting, setExporting] = useState<"csv" | "excel" | null>(null);

  const { data: customers } = useCustomerQuery<Customer[]>({ queryKey: ["/api/customers"] });

  const { data, isLoading, refetch } = useQuery<SalesRegisterResult>({
    queryKey: ["/api/reports/sales-register", from, to, customerFilter, statusFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      if (customerFilter !== "__all__") params.set("customerId", customerFilter);
      if (statusFilter !== "__all__") params.set("status", statusFilter);
      const res = await apiRequest("GET", `/api/reports/sales-register?${params}`);
      return res.json();
    },
    staleTime: 60_000,
  });

  async function handleCSV() {
    setExporting("csv");
    try {
      const rows = data?.rows ?? [];
      const headers = ["Invoice No", "Date", "Customer", "GSTIN", "Type", "Taxable", "Tax", "Grand Total", "Paid", "Outstanding", "Status"];
      const csvRows = rows.map(r => [r.invoiceNumber, r.invoiceDate, r.customerName, r.customerGSTIN ?? "", r.customerType, r.subtotal.toFixed(2), r.totalTax.toFixed(2), r.grandTotal.toFixed(2), r.paidAmount.toFixed(2), r.outstanding.toFixed(2), r.status]);
      if (data) csvRows.push(["TOTAL", "", "", "", "", data.totals.subtotal.toFixed(2), data.totals.totalTax.toFixed(2), data.totals.grandTotal.toFixed(2), data.totals.paidAmount.toFixed(2), data.totals.outstanding.toFixed(2), ""]);
      const csv = [headers, ...csvRows].map(r => r.map(v => /[,"\r\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : v).join(",")).join("\r\n");
      const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = `Sales-Register-${from}-${to}.csv`; a.click();
      URL.revokeObjectURL(url);
    } finally { setExporting(null); }
  }

  async function handleExcel() {
    setExporting("excel");
    try {
      const params = new URLSearchParams();
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      if (customerFilter !== "__all__") params.set("customerId", customerFilter);
      if (statusFilter !== "__all__") params.set("status", statusFilter);
      const res = await apiRequest("GET", `/api/reports/sales-register/excel?${params}`);
      if (!res.ok) throw new Error("Excel export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = `Sales-Register-${from}-${to}.xlsx`; a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast({ title: "Excel export failed", variant: "destructive" });
    } finally { setExporting(null); }
  }

  const t = data?.totals;

  return (
    <div className="space-y-4" data-testid="panel-sales-register">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground font-medium">From</label>
          <Input type="date" value={from} onChange={e => setFrom(e.target.value)} className="w-40 h-8 text-sm" data-testid="input-sales-register-from" />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground font-medium">To</label>
          <Input type="date" value={to} onChange={e => setTo(e.target.value)} className="w-40 h-8 text-sm" data-testid="input-sales-register-to" />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground font-medium">Customer</label>
          <Select value={customerFilter} onValueChange={setCustomerFilter}>
            <SelectTrigger className="w-48 h-8 text-sm" data-testid="select-sales-register-customer">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All Customers</SelectItem>
              {(customers ?? []).map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground font-medium">Status</label>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-36 h-8 text-sm" data-testid="select-sales-register-status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All Statuses</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="partial">Partial</SelectItem>
              <SelectItem value="paid">Paid</SelectItem>
              <SelectItem value="overdue">Overdue</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} className="h-8" data-testid="button-sales-register-refresh">
          <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Refresh
        </Button>
        <div className="ml-auto flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleCSV} disabled={!!exporting || isLoading} className="h-8" data-testid="button-sales-register-csv">
            <Download className="w-3.5 h-3.5 mr-1.5" />{exporting === "csv" ? "Exporting…" : "CSV"}
          </Button>
          <Button variant="outline" size="sm" onClick={handleExcel} disabled={!!exporting || isLoading} className="h-8" data-testid="button-sales-register-excel">
            <FileSpreadsheet className="w-3.5 h-3.5 mr-1.5" />{exporting === "excel" ? "Exporting…" : "Excel"}
          </Button>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {[
          { label: "Invoices", value: t?.count ?? 0, isCur: false, color: "text-slate-800 dark:text-slate-200" },
          { label: "Taxable Amount", value: t?.subtotal ?? 0, isCur: true, color: "text-slate-800 dark:text-slate-200" },
          { label: "Grand Total", value: t?.grandTotal ?? 0, isCur: true, color: "text-slate-800 dark:text-slate-200" },
          { label: "Collected", value: t?.paidAmount ?? 0, isCur: true, color: "text-emerald-700 dark:text-emerald-400" },
          { label: "Outstanding", value: t?.outstanding ?? 0, isCur: true, color: "text-red-600 dark:text-red-400" },
        ].map(card => (
          <Card key={card.label} className="border-border/60">
            <CardContent className="p-3">
              <p className="text-[11px] text-muted-foreground mb-1">{card.label}</p>
              {isLoading ? <Skeleton className="h-5 w-20" /> : (
                <p className={`text-sm font-semibold font-mono ${card.color}`}>
                  {card.isCur ? fmtShort(card.value as number) : card.value}
                </p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="pb-2 pt-4 px-4">
          <div className="flex items-center gap-2">
            <ShoppingCart className="w-4 h-4 text-muted-foreground" />
            <CardTitle className="text-sm font-semibold">
              Sales Register
              {data && <span className="ml-2 text-xs font-normal text-muted-foreground">({data.totals.count} invoices)</span>}
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b bg-muted/30">
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Invoice No</th>
                  <th className="text-left px-3 py-2.5 font-medium text-muted-foreground">Date</th>
                  <th className="text-left px-3 py-2.5 font-medium text-muted-foreground">Customer</th>
                  <th className="text-right px-3 py-2.5 font-medium text-muted-foreground">Taxable</th>
                  <th className="text-right px-3 py-2.5 font-medium text-muted-foreground">Tax</th>
                  <th className="text-right px-3 py-2.5 font-medium text-muted-foreground">Grand Total</th>
                  <th className="text-right px-3 py-2.5 font-medium text-muted-foreground">Paid</th>
                  <th className="text-right px-3 py-2.5 font-medium text-muted-foreground">Outstanding</th>
                  <th className="text-center px-4 py-2.5 font-medium text-muted-foreground">Status</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i} className="border-b">{Array.from({ length: 9 }).map((_, j) => <td key={j} className="px-3 py-2.5"><Skeleton className="h-4 w-full" /></td>)}</tr>
                )) : (data?.rows ?? []).length === 0 ? (
                  <tr><td colSpan={9} className="text-center py-12 text-muted-foreground">No sales invoices in this period.</td></tr>
                ) : (
                  (data?.rows ?? []).map(row => (
                    <tr key={row.invoiceId} className="border-b hover:bg-muted/20 transition-colors" data-testid={`row-sales-register-${row.invoiceId}`}>
                      <td className="px-4 py-2.5 font-mono">{row.invoiceNumber}</td>
                      <td className="px-3 py-2.5 text-muted-foreground">{row.invoiceDate}</td>
                      <td className="px-3 py-2.5">
                        <p className="font-medium">{row.customerName}</p>
                        {row.customerGSTIN && <p className="text-[10px] text-muted-foreground font-mono">{row.customerGSTIN}</p>}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono">{fmtShort(row.subtotal)}</td>
                      <td className="px-3 py-2.5 text-right font-mono text-muted-foreground">{fmtShort(row.totalTax)}</td>
                      <td className="px-3 py-2.5 text-right font-mono font-semibold">{fmtCur(row.grandTotal)}</td>
                      <td className="px-3 py-2.5 text-right font-mono text-emerald-700 dark:text-emerald-400">{row.paidAmount > 0 ? fmtShort(row.paidAmount) : "—"}</td>
                      <td className={`px-3 py-2.5 text-right font-mono ${row.outstanding > 0 ? "text-red-600 dark:text-red-400" : "text-muted-foreground"}`}>{row.outstanding > 0 ? fmtShort(row.outstanding) : "—"}</td>
                      <td className="px-4 py-2.5 text-center">
                        <Badge className={`${STATUS_COLORS[row.status] ?? STATUS_COLORS.pending} border-0 text-[10px]`}>{row.status}</Badge>
                      </td>
                    </tr>
                  ))
                )}
                {!isLoading && (data?.rows ?? []).length > 0 && t && (
                  <tr className="border-t-2 bg-blue-50/50 dark:bg-blue-950/10 font-semibold">
                    <td className="px-4 py-2.5" colSpan={3}>TOTAL ({t.count} invoices)</td>
                    <td className="px-3 py-2.5 text-right font-mono">{fmtCur(t.subtotal)}</td>
                    <td className="px-3 py-2.5 text-right font-mono">{fmtCur(t.totalTax)}</td>
                    <td className="px-3 py-2.5 text-right font-mono">{fmtCur(t.grandTotal)}</td>
                    <td className="px-3 py-2.5 text-right font-mono">{fmtCur(t.paidAmount)}</td>
                    <td className="px-3 py-2.5 text-right font-mono">{fmtCur(t.outstanding)}</td>
                    <td />
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
