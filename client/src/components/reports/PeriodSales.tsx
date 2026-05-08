import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Download, FileSpreadsheet, FileText, RefreshCw, TrendingUp } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from "recharts";

type Granularity = "daily" | "weekly" | "monthly" | "yearly";
type GranularityAuto = "auto" | Granularity;

interface PeriodSalesBucket {
  period_label: string;
  period_start: string;
  total_sales: number;
  invoice_count: number;
}
interface PeriodSalesResult {
  buckets: PeriodSalesBucket[];
  summary: { grand_total: number; avg_per_bucket: number; peak_label: string; peak_amount: number };
  period: { from: string | null; to: string | null };
  granularity: Granularity;
}

function fmtCur(v: number) {
  return "\u20b9" + v.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtShort(v: number) {
  if (v === 0) return "\u2014";
  return "\u20b9" + v.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

const today = new Date().toISOString().slice(0, 10);
const fyStart = `${today.slice(0, 4)}-04-01`;
const defaultFrom = today < fyStart ? `${Number(today.slice(0, 4)) - 1}-04-01` : fyStart;

const GRAN_OPTIONS: { label: string; value: GranularityAuto }[] = [
  { label: "Auto", value: "auto" },
  { label: "Daily", value: "daily" },
  { label: "Weekly", value: "weekly" },
  { label: "Monthly", value: "monthly" },
  { label: "Yearly", value: "yearly" },
];

export function PeriodSales() {
  const { toast } = useToast();
  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(today);
  const [granularity, setGranularity] = useState<GranularityAuto>("auto");
  const [exporting, setExporting] = useState<"csv" | "excel" | "pdf" | null>(null);

  const params = new URLSearchParams();
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  if (granularity !== "auto") params.set("granularity", granularity);

  const { data, isLoading, refetch } = useQuery<PeriodSalesResult>({
    queryKey: ["/api/reports/period-sales", from, to, granularity],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/reports/period-sales?${params}`);
      return res.json();
    },
    staleTime: 60_000,
  });

  async function handleCSV() {
    setExporting("csv");
    try {
      const rows = data?.buckets ?? [];
      const headers = ["Period", "Total Sales", "Invoice Count"];
      const csvRows = rows.map(r => [r.period_label, r.total_sales.toFixed(2), r.invoice_count]);
      if (data) csvRows.push(["TOTAL", data.summary.grand_total.toFixed(2), rows.reduce((s, r) => s + r.invoice_count, 0)]);
      const csv = [headers, ...csvRows]
        .map(r => r.map(v => /[,"\r\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : v).join(","))
        .join("\r\n");
      const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = `Period-Sales-${from}-${to}.csv`; a.click();
      URL.revokeObjectURL(url);
    } finally { setExporting(null); }
  }

  async function handleExcel() {
    setExporting("excel");
    try {
      const res = await apiRequest("GET", `/api/reports/period-sales/excel?${params}`);
      if (!res.ok) throw new Error("Excel export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = `Period-Sales-${from}-${to}.xlsx`; a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast({ title: "Excel export failed", variant: "destructive" });
    } finally { setExporting(null); }
  }

  async function handlePDF() {
    if (!data) return;
    setExporting("pdf");
    try {
      const mod = await import("jspdf");
      const JsPDF = mod.default || (mod as any).jsPDF;
      const { ensureNotoSansRegistered } = await import("@/lib/pdf-fonts");
      const { drawLetterhead } = await import("@shared/pdf-letterhead");

      const doc = new JsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
      await ensureNotoSansRegistered(doc);

      const PW = 297; const M = 10;
      let y = drawLetterhead(doc, {
        pageWidth: PW,
        margin: M,
        title: "Period Sales Report",
        bannerSubtitle: `${from ?? "All"} → ${to ?? "All"} | Granularity: ${data.granularity}`,
      });
      y += 4;

      const cols = [
        { header: "Period", w: 50, align: "left" as const },
        { header: "Total Sales (\u20b9)", w: 55, align: "right" as const },
        { header: "Invoice Count", w: 35, align: "right" as const },
      ];
      const TW = cols.reduce((s, c) => s + c.w, 0);
      const THH = 5.5; const RH = 6;

      doc.setFillColor(241, 245, 249);
      doc.rect(M, y, TW, THH, "F");
      doc.setFontSize(5.8); doc.setFont("helvetica", "bold"); doc.setTextColor(100, 116, 139);
      let x = M;
      for (const col of cols) {
        const tx = col.align === "right" ? x + col.w - 1 : x + 1.5;
        doc.text(col.header.toUpperCase(), tx, y + THH - 1.5, { align: col.align });
        x += col.w;
      }
      y += THH;

      doc.setFontSize(6.5); doc.setFont("helvetica", "normal"); doc.setTextColor(15, 23, 42);
      for (let i = 0; i < data.buckets.length; i++) {
        if (y + RH > 210 - 12) { doc.addPage(); y = 20; }
        const b = data.buckets[i];
        if (i % 2 === 1) { doc.setFillColor(248, 250, 252); doc.rect(M, y, TW, RH, "F"); }
        doc.setDrawColor(226, 232, 240); doc.rect(M, y, TW, RH, "S");
        doc.text(b.period_label, M + 1.5, y + RH - 1.8);
        doc.text(fmtCur(b.total_sales), M + cols[0].w + cols[1].w - 1, y + RH - 1.8, { align: "right" });
        doc.text(String(b.invoice_count), M + TW - 1, y + RH - 1.8, { align: "right" });
        y += RH;
      }

      doc.setFillColor(239, 246, 255); doc.rect(M, y, TW, RH, "F");
      doc.setFont("helvetica", "bold");
      doc.text(`TOTAL (${data.buckets.length} periods)`, M + 1.5, y + RH - 1.8);
      doc.text(fmtCur(data.summary.grand_total), M + cols[0].w + cols[1].w - 1, y + RH - 1.8, { align: "right" });
      doc.text(String(data.buckets.reduce((s, b) => s + b.invoice_count, 0)), M + TW - 1, y + RH - 1.8, { align: "right" });

      doc.save(`Period-Sales-${from}-${to}.pdf`);
    } catch {
      toast({ title: "PDF export failed", variant: "destructive" });
    } finally { setExporting(null); }
  }

  const s = data?.summary;

  return (
    <div className="space-y-4" data-testid="panel-period-sales">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground font-medium">From</label>
          <Input type="date" value={from} onChange={e => setFrom(e.target.value)} className="w-40 h-8 text-sm" data-testid="input-period-sales-from" />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground font-medium">To</label>
          <Input type="date" value={to} onChange={e => setTo(e.target.value)} className="w-40 h-8 text-sm" data-testid="input-period-sales-to" />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground font-medium">Granularity</label>
          <div className="flex rounded-md border border-input overflow-hidden h-8">
            {GRAN_OPTIONS.map(opt => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setGranularity(opt.value)}
                className={`px-2.5 text-xs font-medium transition-colors border-r last:border-r-0 border-input
                  ${granularity === opt.value
                    ? "bg-primary text-primary-foreground"
                    : "bg-background text-muted-foreground hover:bg-muted"}`}
                data-testid={`btn-period-sales-gran-${opt.value}`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} className="h-8" data-testid="button-period-sales-refresh">
          <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Refresh
        </Button>
        <div className="ml-auto flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleCSV} disabled={!!exporting || isLoading} className="h-8" data-testid="button-period-sales-csv">
            <Download className="w-3.5 h-3.5 mr-1.5" />{exporting === "csv" ? "Exporting…" : "CSV"}
          </Button>
          <Button variant="outline" size="sm" onClick={handleExcel} disabled={!!exporting || isLoading} className="h-8" data-testid="button-period-sales-excel">
            <FileSpreadsheet className="w-3.5 h-3.5 mr-1.5" />{exporting === "excel" ? "Exporting…" : "Excel"}
          </Button>
          <Button variant="outline" size="sm" onClick={handlePDF} disabled={!!exporting || isLoading} className="h-8" data-testid="button-period-sales-pdf">
            <FileText className="w-3.5 h-3.5 mr-1.5" />{exporting === "pdf" ? "Exporting…" : "PDF"}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {[
          { label: "Total Sales", value: s?.grand_total ?? 0, isCur: true, color: "text-blue-700 dark:text-blue-400" },
          { label: "Avg per Period", value: s?.avg_per_bucket ?? 0, isCur: true, color: "text-slate-800 dark:text-slate-200" },
          { label: "Peak Period", value: s?.peak_label ?? "—", sub: s?.peak_amount != null ? fmtShort(s.peak_amount) : undefined, isCur: false, color: "text-emerald-700 dark:text-emerald-400" },
        ].map(card => (
          <Card key={card.label} className="border-border/60" data-testid={`card-period-sales-${card.label.toLowerCase().replace(/\s+/g, "-")}`}>
            <CardContent className="p-3">
              <p className="text-[11px] text-muted-foreground mb-1">{card.label}</p>
              {isLoading ? <Skeleton className="h-5 w-24" /> : (
                <>
                  <p className={`text-sm font-semibold font-mono ${card.color}`}>
                    {card.isCur ? fmtCur(card.value as number) : String(card.value)}
                  </p>
                  {card.sub && <p className="text-xs text-muted-foreground font-mono mt-0.5">{card.sub}</p>}
                </>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {(data?.buckets?.length ?? 0) > 0 && (
        <Card className="border-border/60">
          <CardHeader className="pb-2 pt-4 px-4">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-muted-foreground" />
              <CardTitle className="text-sm font-semibold">Sales by Period</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={data!.buckets} margin={{ top: 4, right: 8, left: 8, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis
                  dataKey="period_label"
                  tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                  angle={-35}
                  textAnchor="end"
                  interval="preserveStartEnd"
                />
                <YAxis
                  tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                  tickFormatter={v => "\u20b9" + (v / 1000).toFixed(0) + "k"}
                />
                <Tooltip
                  formatter={(v: number) => [fmtCur(v), "Total Sales"]}
                  contentStyle={{ fontSize: 11, borderRadius: 6 }}
                />
                <Bar dataKey="total_sales" fill="#3B82F6" radius={[3, 3, 0, 0]} name="Total Sales" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      <Card className="border-border/60">
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-sm font-semibold">
            Period Detail
            {data && <span className="ml-2 text-xs font-normal text-muted-foreground">({data.buckets.length} periods)</span>}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b bg-muted/30">
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Period</th>
                  <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Total Sales</th>
                  <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Invoice Count</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-b">{[1, 2, 3].map(j => <td key={j} className="px-4 py-2.5"><Skeleton className="h-4 w-full" /></td>)}</tr>
                )) : (data?.buckets ?? []).length === 0 ? (
                  <tr><td colSpan={3} className="text-center py-10 text-muted-foreground">No sales invoices found for this period.</td></tr>
                ) : (
                  (data?.buckets ?? []).map((b, i) => (
                    <tr key={i} className="border-b hover:bg-muted/20 transition-colors" data-testid={`row-period-sales-${i}`}>
                      <td className="px-4 py-2.5 font-medium">{b.period_label}</td>
                      <td className="px-4 py-2.5 text-right font-mono">{fmtCur(b.total_sales)}</td>
                      <td className="px-4 py-2.5 text-right text-muted-foreground">{b.invoice_count}</td>
                    </tr>
                  ))
                )}
                {!isLoading && (data?.buckets ?? []).length > 0 && s && (
                  <tr className="border-t-2 bg-blue-50/50 dark:bg-blue-950/10 font-semibold">
                    <td className="px-4 py-2.5">TOTAL ({data!.buckets.length} periods)</td>
                    <td className="px-4 py-2.5 text-right font-mono">{fmtCur(s.grand_total)}</td>
                    <td className="px-4 py-2.5 text-right">{data!.buckets.reduce((acc, b) => acc + b.invoice_count, 0)}</td>
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
