import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Download, FileSpreadsheet, FileText, RefreshCw, Users } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface AgingSummary {
  totalOutstanding: number; current: number; days1_30: number;
  days31_60: number; days61_90: number; days90plus: number;
}
interface CustomerAgingRow {
  customerId: string; customerName: string; gstNumber: string | null;
  customerType: string | null; totalOutstanding: number; current: number;
  days1_30: number; days31_60: number; days61_90: number; days90plus: number;
  oldestInvoiceDate: string | null;
}
interface CustomerAgingResult {
  asOf: string; rows: CustomerAgingRow[]; summary: AgingSummary;
}

function fmtCur(v: number) {
  return "₹" + v.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtShort(v: number) {
  if (v === 0) return "—";
  return "₹" + v.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

const BUCKET_COLORS: Record<string, string> = {
  current: "text-emerald-700 dark:text-emerald-400",
  "1-30": "text-amber-600 dark:text-amber-400",
  "31-60": "text-orange-600 dark:text-orange-400",
  "61-90": "text-red-600 dark:text-red-400",
  "90+": "text-red-700 dark:text-red-500 font-bold",
};

function highestBucket(row: CustomerAgingRow): string {
  if (row.days90plus > 0) return "90+";
  if (row.days61_90 > 0) return "61-90";
  if (row.days31_60 > 0) return "31-60";
  if (row.days1_30 > 0) return "1-30";
  return "current";
}

export function CustomerAging() {
  const { toast } = useToast();
  const todayISO = new Date().toISOString().slice(0, 10);
  const [asOf, setAsOf] = useState(todayISO);
  const [customerFilter, setCustomerFilter] = useState("__all__");
  const [exporting, setExporting] = useState<"csv" | "excel" | "pdf" | null>(null);

  const { data, isLoading, refetch } = useQuery<CustomerAgingResult>({
    queryKey: ["/api/reports/customer-aging", asOf],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/reports/customer-aging?asOf=${asOf}`);
      return res.json();
    },
    staleTime: 60_000,
  });

  const filteredRows = customerFilter === "__all__"
    ? (data?.rows ?? [])
    : (data?.rows ?? []).filter(r => r.customerId === customerFilter);

  const displaySummary: AgingSummary = filteredRows.reduce(
    (acc, r) => {
      acc.totalOutstanding += r.totalOutstanding; acc.current += r.current;
      acc.days1_30 += r.days1_30; acc.days31_60 += r.days31_60;
      acc.days61_90 += r.days61_90; acc.days90plus += r.days90plus;
      return acc;
    },
    { totalOutstanding: 0, current: 0, days1_30: 0, days31_60: 0, days61_90: 0, days90plus: 0 }
  );

  async function handleCSV() {
    setExporting("csv");
    try {
      const headers = ["Customer", "GSTIN", "Type", "Current", "1-30 Days", "31-60 Days", "61-90 Days", "90+ Days", "Total Outstanding", "Oldest Invoice"];
      const rows = filteredRows.map(r => [
        r.customerName, r.gstNumber ?? "", r.customerType ?? "",
        r.current.toFixed(2), r.days1_30.toFixed(2), r.days31_60.toFixed(2),
        r.days61_90.toFixed(2), r.days90plus.toFixed(2), r.totalOutstanding.toFixed(2),
        r.oldestInvoiceDate ?? "",
      ]);
      rows.push(["TOTAL", "", "", displaySummary.current.toFixed(2), displaySummary.days1_30.toFixed(2), displaySummary.days31_60.toFixed(2), displaySummary.days61_90.toFixed(2), displaySummary.days90plus.toFixed(2), displaySummary.totalOutstanding.toFixed(2), ""]);
      const csv = [headers, ...rows].map(r => r.map(v => /[,"\r\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : v).join(",")).join("\r\n");
      const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = `Customer-Aging-${asOf}.csv`; a.click();
      URL.revokeObjectURL(url);
    } finally { setExporting(null); }
  }

  async function handleExcel() {
    setExporting("excel");
    try {
      const params = new URLSearchParams({ asOf });
      if (customerFilter !== "__all__") params.set("customerId", customerFilter);
      const res = await apiRequest("GET", `/api/reports/customer-aging/excel?${params}`);
      if (!res.ok) throw new Error("Excel export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = `Customer-Aging-${asOf}.xlsx`; a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast({ title: "Excel export failed", variant: "destructive" });
    } finally { setExporting(null); }
  }

  async function handlePDF() {
    setExporting("pdf");
    try {
      const { generateCustomerAgingPDF } = await import("@/lib/reports-pdf");
      const blob = await generateCustomerAgingPDF(filteredRows, displaySummary, asOf);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = `Customer-Aging-${asOf}.pdf`; a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast({ title: "PDF export failed", description: String(e), variant: "destructive" });
    } finally { setExporting(null); }
  }

  return (
    <div className="space-y-4" data-testid="panel-customer-aging">
      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground font-medium">As of Date</label>
          <Input type="date" value={asOf} onChange={e => setAsOf(e.target.value)} className="w-44 h-8 text-sm" data-testid="input-customer-aging-asof" />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground font-medium">Customer</label>
          <Select value={customerFilter} onValueChange={setCustomerFilter}>
            <SelectTrigger className="w-52 h-8 text-sm" data-testid="select-customer-aging-filter">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All Customers</SelectItem>
              {(data?.rows ?? []).map(r => (
                <SelectItem key={r.customerId} value={r.customerId}>{r.customerName}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} className="h-8" data-testid="button-customer-aging-refresh">
          <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Refresh
        </Button>
        <div className="ml-auto flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleCSV} disabled={!!exporting || isLoading} className="h-8" data-testid="button-customer-aging-csv">
            <Download className="w-3.5 h-3.5 mr-1.5" />{exporting === "csv" ? "Exporting…" : "CSV"}
          </Button>
          <Button variant="outline" size="sm" onClick={handleExcel} disabled={!!exporting || isLoading} className="h-8" data-testid="button-customer-aging-excel">
            <FileSpreadsheet className="w-3.5 h-3.5 mr-1.5" />{exporting === "excel" ? "Exporting…" : "Excel"}
          </Button>
          <Button variant="outline" size="sm" onClick={handlePDF} disabled={!!exporting || isLoading} className="h-8" data-testid="button-customer-aging-pdf">
            <FileText className="w-3.5 h-3.5 mr-1.5" />{exporting === "pdf" ? "Generating…" : "PDF"}
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { label: "Total Outstanding", value: displaySummary.totalOutstanding, color: "text-slate-800 dark:text-slate-200" },
          { label: "Current", value: displaySummary.current, color: BUCKET_COLORS.current },
          { label: "1–30 Days", value: displaySummary.days1_30, color: BUCKET_COLORS["1-30"] },
          { label: "31–60 Days", value: displaySummary.days31_60, color: BUCKET_COLORS["31-60"] },
          { label: "61–90 Days", value: displaySummary.days61_90, color: BUCKET_COLORS["61-90"] },
          { label: "90+ Days", value: displaySummary.days90plus, color: BUCKET_COLORS["90+"] },
        ].map(card => (
          <Card key={card.label} className="border-border/60">
            <CardContent className="p-3">
              <p className="text-[11px] text-muted-foreground mb-1">{card.label}</p>
              {isLoading
                ? <Skeleton className="h-5 w-20" />
                : <p className={`text-sm font-semibold font-mono ${card.color}`}>{fmtShort(card.value)}</p>
              }
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Table */}
      <Card>
        <CardHeader className="pb-2 pt-4 px-4">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-muted-foreground" />
            <CardTitle className="text-sm font-semibold">
              Customer Aging — As of {asOf}
              {data && <span className="ml-2 text-xs font-normal text-muted-foreground">({filteredRows.length} customers)</span>}
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b bg-muted/30">
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Customer</th>
                  <th className="text-left px-3 py-2.5 font-medium text-muted-foreground">Type</th>
                  <th className="text-right px-3 py-2.5 font-medium text-muted-foreground">Current</th>
                  <th className="text-right px-3 py-2.5 font-medium text-muted-foreground">1–30 Days</th>
                  <th className="text-right px-3 py-2.5 font-medium text-muted-foreground">31–60 Days</th>
                  <th className="text-right px-3 py-2.5 font-medium text-muted-foreground">61–90 Days</th>
                  <th className="text-right px-3 py-2.5 font-medium text-muted-foreground">90+ Days</th>
                  <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Total</th>
                  <th className="text-center px-3 py-2.5 font-medium text-muted-foreground">Risk</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i} className="border-b">
                      {Array.from({ length: 9 }).map((_, j) => (
                        <td key={j} className="px-3 py-2.5"><Skeleton className="h-4 w-full" /></td>
                      ))}
                    </tr>
                  ))
                ) : filteredRows.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="text-center py-12 text-muted-foreground">
                      No outstanding balances found.
                    </td>
                  </tr>
                ) : (
                  filteredRows.map(row => {
                    const bucket = highestBucket(row);
                    return (
                      <tr key={row.customerId} className="border-b hover:bg-muted/20 transition-colors" data-testid={`row-customer-aging-${row.customerId}`}>
                        <td className="px-4 py-2.5">
                          <p className="font-medium">{row.customerName}</p>
                          {row.gstNumber && <p className="text-[10px] text-muted-foreground font-mono">{row.gstNumber}</p>}
                        </td>
                        <td className="px-3 py-2.5 text-muted-foreground">{row.customerType ?? "—"}</td>
                        <td className={`px-3 py-2.5 text-right font-mono ${row.current > 0 ? BUCKET_COLORS.current : "text-muted-foreground"}`}>{row.current > 0 ? fmtShort(row.current) : "—"}</td>
                        <td className={`px-3 py-2.5 text-right font-mono ${row.days1_30 > 0 ? BUCKET_COLORS["1-30"] : "text-muted-foreground"}`}>{row.days1_30 > 0 ? fmtShort(row.days1_30) : "—"}</td>
                        <td className={`px-3 py-2.5 text-right font-mono ${row.days31_60 > 0 ? BUCKET_COLORS["31-60"] : "text-muted-foreground"}`}>{row.days31_60 > 0 ? fmtShort(row.days31_60) : "—"}</td>
                        <td className={`px-3 py-2.5 text-right font-mono ${row.days61_90 > 0 ? BUCKET_COLORS["61-90"] : "text-muted-foreground"}`}>{row.days61_90 > 0 ? fmtShort(row.days61_90) : "—"}</td>
                        <td className={`px-3 py-2.5 text-right font-mono ${row.days90plus > 0 ? BUCKET_COLORS["90+"] : "text-muted-foreground"}`}>{row.days90plus > 0 ? fmtShort(row.days90plus) : "—"}</td>
                        <td className="px-4 py-2.5 text-right font-mono font-semibold">{fmtCur(row.totalOutstanding)}</td>
                        <td className="px-3 py-2.5 text-center">
                          <Badge className={
                            bucket === "90+" ? "bg-red-100 text-red-700 dark:bg-red-950/30 dark:text-red-400 border-0 text-[10px]" :
                            bucket === "61-90" ? "bg-orange-100 text-orange-700 dark:bg-orange-950/30 dark:text-orange-400 border-0 text-[10px]" :
                            bucket === "31-60" ? "bg-amber-100 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400 border-0 text-[10px]" :
                            bucket === "1-30" ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-950/30 dark:text-yellow-400 border-0 text-[10px]" :
                            "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400 border-0 text-[10px]"
                          }>
                            {bucket === "current" ? "Current" : bucket}
                          </Badge>
                        </td>
                      </tr>
                    );
                  })
                )}
                {!isLoading && filteredRows.length > 0 && (
                  <tr className="border-t-2 bg-blue-50/50 dark:bg-blue-950/10 font-semibold">
                    <td className="px-4 py-2.5" colSpan={2}>TOTAL ({filteredRows.length} customers)</td>
                    <td className="px-3 py-2.5 text-right font-mono">{fmtShort(displaySummary.current)}</td>
                    <td className="px-3 py-2.5 text-right font-mono">{fmtShort(displaySummary.days1_30)}</td>
                    <td className="px-3 py-2.5 text-right font-mono">{fmtShort(displaySummary.days31_60)}</td>
                    <td className="px-3 py-2.5 text-right font-mono">{fmtShort(displaySummary.days61_90)}</td>
                    <td className="px-3 py-2.5 text-right font-mono">{fmtShort(displaySummary.days90plus)}</td>
                    <td className="px-4 py-2.5 text-right font-mono">{fmtCur(displaySummary.totalOutstanding)}</td>
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
