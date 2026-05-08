import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Download, FileSpreadsheet, RefreshCw, Receipt } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface TaxSummaryOutputRow {
  invoiceId: string; invoiceNumber: string; invoiceDate: string;
  customerName: string; customerGSTIN: string | null; customerType: string;
  isInterState: boolean; subtotal: number; cgst: number; sgst: number;
  igst: number; totalTax: number; grandTotal: number;
}
interface TaxSummaryResult {
  period: { from: string | null; to: string | null };
  output: { cgst: number; sgst: number; igst: number; totalTax: number; subtotal: number; grandTotal: number; invoiceCount: number; rows: TaxSummaryOutputRow[] };
  input: { totalTax: number; subtotal: number; totalAmount: number; invoiceCount: number };
  netTaxLiability: number;
}

function fmtCur(v: number) { return "₹" + v.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function fmtShort(v: number) { if (v === 0) return "—"; return "₹" + v.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 0 }); }

const thisMonth = new Date();
const defaultFrom = `${thisMonth.getFullYear()}-${String(thisMonth.getMonth() + 1).padStart(2, "0")}-01`;
const defaultTo = new Date().toISOString().slice(0, 10);

export function TaxSummary() {
  const { toast } = useToast();
  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(defaultTo);
  const [exporting, setExporting] = useState<"csv" | "excel" | null>(null);

  const { data, isLoading, refetch } = useQuery<TaxSummaryResult>({
    queryKey: ["/api/reports/tax-summary", from, to],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      const res = await apiRequest("GET", `/api/reports/tax-summary?${params}`);
      return res.json();
    },
    staleTime: 60_000,
  });

  async function handleCSV() {
    setExporting("csv");
    try {
      const rows = data?.output.rows ?? [];
      const headers = ["Invoice No", "Date", "Customer", "GSTIN", "Type", "Taxable", "CGST", "SGST", "IGST", "Total Tax", "Grand Total"];
      const csvRows = rows.map(r => [r.invoiceNumber, r.invoiceDate, r.customerName, r.customerGSTIN ?? "", r.customerType, r.subtotal.toFixed(2), r.cgst.toFixed(2), r.sgst.toFixed(2), r.igst.toFixed(2), r.totalTax.toFixed(2), r.grandTotal.toFixed(2)]);
      if (data) csvRows.push(["TOTAL", "", "", "", "", data.output.subtotal.toFixed(2), data.output.cgst.toFixed(2), data.output.sgst.toFixed(2), data.output.igst.toFixed(2), data.output.totalTax.toFixed(2), data.output.grandTotal.toFixed(2)]);
      const csv = [headers, ...csvRows].map(r => r.map(v => /[,"\r\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : v).join(",")).join("\r\n");
      const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = `Tax-Summary-${from}-${to}.csv`; a.click();
      URL.revokeObjectURL(url);
    } finally { setExporting(null); }
  }

  async function handleExcel() {
    setExporting("excel");
    try {
      const params = new URLSearchParams();
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      const res = await apiRequest("GET", `/api/reports/tax-summary/excel?${params}`);
      if (!res.ok) throw new Error("Excel export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = `Tax-Summary-${from}-${to}.xlsx`; a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast({ title: "Excel export failed", variant: "destructive" });
    } finally { setExporting(null); }
  }

  const netColor = (data?.netTaxLiability ?? 0) >= 0 ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400";

  return (
    <div className="space-y-4" data-testid="panel-tax-summary">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground font-medium">From</label>
          <Input type="date" value={from} onChange={e => setFrom(e.target.value)} className="w-40 h-8 text-sm" data-testid="input-tax-summary-from" />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground font-medium">To</label>
          <Input type="date" value={to} onChange={e => setTo(e.target.value)} className="w-40 h-8 text-sm" data-testid="input-tax-summary-to" />
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} className="h-8" data-testid="button-tax-summary-refresh">
          <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Refresh
        </Button>
        <div className="ml-auto flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleCSV} disabled={!!exporting || isLoading} className="h-8" data-testid="button-tax-summary-csv">
            <Download className="w-3.5 h-3.5 mr-1.5" />{exporting === "csv" ? "Exporting…" : "CSV"}
          </Button>
          <Button variant="outline" size="sm" onClick={handleExcel} disabled={!!exporting || isLoading} className="h-8" data-testid="button-tax-summary-excel">
            <FileSpreadsheet className="w-3.5 h-3.5 mr-1.5" />{exporting === "excel" ? "Exporting…" : "Excel"}
          </Button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { label: "Output Subtotal", value: data?.output.subtotal ?? 0, color: "text-slate-800 dark:text-slate-200" },
          { label: "Output CGST", value: data?.output.cgst ?? 0, color: "text-blue-700 dark:text-blue-400" },
          { label: "Output SGST", value: data?.output.sgst ?? 0, color: "text-blue-700 dark:text-blue-400" },
          { label: "Output IGST", value: data?.output.igst ?? 0, color: "text-violet-700 dark:text-violet-400" },
          { label: "Input Tax (ITC)", value: data?.input.totalTax ?? 0, color: "text-emerald-700 dark:text-emerald-400" },
          { label: "Net Liability", value: data?.netTaxLiability ?? 0, color: netColor },
        ].map(card => (
          <Card key={card.label} className="border-border/60">
            <CardContent className="p-3">
              <p className="text-[11px] text-muted-foreground mb-1">{card.label}</p>
              {isLoading ? <Skeleton className="h-5 w-20" /> : <p className={`text-sm font-semibold font-mono ${card.color}`}>{fmtShort(card.value)}</p>}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Net Tax Liability Summary */}
      {!isLoading && data && (
        <Card className="border-border/60">
          <CardContent className="p-4">
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div className="text-center">
                <p className="text-xs text-muted-foreground mb-1">Total Output Tax</p>
                <p className="font-semibold font-mono text-red-600 dark:text-red-400">{fmtCur(data.output.totalTax)}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">{data.output.invoiceCount} sales invoices</p>
              </div>
              <div className="text-center">
                <p className="text-xs text-muted-foreground mb-1">Input Tax Credit (ITC)</p>
                <p className="font-semibold font-mono text-emerald-600 dark:text-emerald-400">{fmtCur(data.input.totalTax)}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">{data.input.invoiceCount} supplier invoices</p>
              </div>
              <div className="text-center border-l pl-4">
                <p className="text-xs text-muted-foreground mb-1">Net GST Liability</p>
                <p className={`text-lg font-bold font-mono ${netColor}`}>{fmtCur(data.netTaxLiability)}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">{data.netTaxLiability >= 0 ? "Payable to govt" : "Excess ITC"}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Output tax invoice detail */}
      <Card>
        <CardHeader className="pb-2 pt-4 px-4">
          <div className="flex items-center gap-2">
            <Receipt className="w-4 h-4 text-muted-foreground" />
            <CardTitle className="text-sm font-semibold">
              Output Tax — Invoice-wise Detail
              {data && <span className="ml-2 text-xs font-normal text-muted-foreground">({data.output.invoiceCount} invoices)</span>}
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
                  <th className="text-center px-3 py-2.5 font-medium text-muted-foreground">Type</th>
                  <th className="text-right px-3 py-2.5 font-medium text-muted-foreground">Taxable</th>
                  <th className="text-right px-3 py-2.5 font-medium text-muted-foreground">CGST</th>
                  <th className="text-right px-3 py-2.5 font-medium text-muted-foreground">SGST</th>
                  <th className="text-right px-3 py-2.5 font-medium text-muted-foreground">IGST</th>
                  <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Total Tax</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-b">{Array.from({ length: 9 }).map((_, j) => <td key={j} className="px-3 py-2.5"><Skeleton className="h-4 w-full" /></td>)}</tr>
                )) : (data?.output.rows ?? []).length === 0 ? (
                  <tr><td colSpan={9} className="text-center py-12 text-muted-foreground">No sales invoices in this period.</td></tr>
                ) : (
                  (data?.output.rows ?? []).map(row => (
                    <tr key={row.invoiceId} className="border-b hover:bg-muted/20 transition-colors" data-testid={`row-tax-summary-${row.invoiceId}`}>
                      <td className="px-4 py-2.5 font-mono text-xs">{row.invoiceNumber}</td>
                      <td className="px-3 py-2.5 text-muted-foreground">{row.invoiceDate}</td>
                      <td className="px-3 py-2.5">
                        <p className="font-medium">{row.customerName}</p>
                        {row.customerGSTIN && <p className="text-[10px] text-muted-foreground font-mono">{row.customerGSTIN}</p>}
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <Badge variant="outline" className="text-[10px]">{row.isInterState ? "IGST" : row.customerType}</Badge>
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono">{fmtShort(row.subtotal)}</td>
                      <td className="px-3 py-2.5 text-right font-mono text-blue-700 dark:text-blue-400">{row.cgst > 0 ? fmtShort(row.cgst) : "—"}</td>
                      <td className="px-3 py-2.5 text-right font-mono text-blue-700 dark:text-blue-400">{row.sgst > 0 ? fmtShort(row.sgst) : "—"}</td>
                      <td className="px-3 py-2.5 text-right font-mono text-violet-700 dark:text-violet-400">{row.igst > 0 ? fmtShort(row.igst) : "—"}</td>
                      <td className="px-4 py-2.5 text-right font-mono font-semibold">{fmtShort(row.totalTax)}</td>
                    </tr>
                  ))
                )}
                {!isLoading && (data?.output.rows ?? []).length > 0 && data && (
                  <tr className="border-t-2 bg-blue-50/50 dark:bg-blue-950/10 font-semibold">
                    <td className="px-4 py-2.5" colSpan={4}>TOTAL ({data.output.invoiceCount} invoices)</td>
                    <td className="px-3 py-2.5 text-right font-mono">{fmtCur(data.output.subtotal)}</td>
                    <td className="px-3 py-2.5 text-right font-mono">{fmtCur(data.output.cgst)}</td>
                    <td className="px-3 py-2.5 text-right font-mono">{fmtCur(data.output.sgst)}</td>
                    <td className="px-3 py-2.5 text-right font-mono">{fmtCur(data.output.igst)}</td>
                    <td className="px-4 py-2.5 text-right font-mono">{fmtCur(data.output.totalTax)}</td>
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
