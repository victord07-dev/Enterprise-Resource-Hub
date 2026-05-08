import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Download, FileSpreadsheet, FileText, RefreshCw, BarChart2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from "recharts";

type Granularity = "daily" | "weekly" | "monthly" | "yearly";
type GranularityAuto = "auto" | Granularity;

interface PeriodProfitBucket {
  period_label: string;
  period_start: string;
  revenue: number;
  purchases: number;
  expenses: number;
  profit: number;
  margin_pct: number | null;
}
interface PeriodProfitResult {
  buckets: PeriodProfitBucket[];
  summary: { total_revenue: number; total_profit: number; avg_margin_pct: number | null };
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
function fmtPct(v: number | null) {
  if (v === null) return "\u2014";
  return v.toFixed(1) + "%";
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

export function PeriodProfit() {
  const { toast } = useToast();
  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(today);
  const [granularity, setGranularity] = useState<GranularityAuto>("auto");
  const [exporting, setExporting] = useState<"csv" | "excel" | "pdf" | null>(null);

  const params = new URLSearchParams();
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  if (granularity !== "auto") params.set("granularity", granularity);

  const { data, isLoading, refetch } = useQuery<PeriodProfitResult>({
    queryKey: ["/api/reports/period-profit", from, to, granularity],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/reports/period-profit?${params}`);
      return res.json();
    },
    staleTime: 60_000,
  });

  async function handleCSV() {
    setExporting("csv");
    try {
      const rows = data?.buckets ?? [];
      const headers = ["Period", "Revenue", "Purchases", "Expenses", "Profit", "Margin %"];
      const csvRows = rows.map(r => [
        r.period_label,
        r.revenue.toFixed(2),
        r.purchases.toFixed(2),
        r.expenses.toFixed(2),
        r.profit.toFixed(2),
        r.margin_pct != null ? r.margin_pct.toFixed(2) : "",
      ]);
      if (data?.summary) {
        const s = data.summary;
        csvRows.push(["TOTAL", s.total_revenue.toFixed(2), rows.reduce((a, b) => a + b.purchases, 0).toFixed(2), rows.reduce((a, b) => a + b.expenses, 0).toFixed(2), s.total_profit.toFixed(2), s.avg_margin_pct != null ? s.avg_margin_pct.toFixed(2) : ""]);
      }
      const csv = [headers, ...csvRows]
        .map(r => r.map(v => /[,"\r\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : v).join(","))
        .join("\r\n");
      const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = `Period-Profit-${from}-${to}.csv`; a.click();
      URL.revokeObjectURL(url);
    } finally { setExporting(null); }
  }

  async function handleExcel() {
    setExporting("excel");
    try {
      const res = await apiRequest("GET", `/api/reports/period-profit/excel?${params}`);
      if (!res.ok) throw new Error("Excel export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = `Period-Profit-${from}-${to}.xlsx`; a.click();
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
        pageWidth: PW, margin: M,
        title: "Period Profit Report",
        bannerSubtitle: `${from ?? "All"} \u2192 ${to ?? "All"} | Granularity: ${data.granularity}`,
      });
      y += 4;

      const cols = [
        { header: "Period", w: 44, align: "left" as const },
        { header: "Revenue (\u20b9)", w: 42, align: "right" as const },
        { header: "Purchases (\u20b9)", w: 42, align: "right" as const },
        { header: "Expenses (\u20b9)", w: 38, align: "right" as const },
        { header: "Profit (\u20b9)", w: 42, align: "right" as const },
        { header: "Margin %", w: 22, align: "right" as const },
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
        let cx = M;
        const cells = [
          { v: b.period_label, align: "left" as const },
          { v: fmtShort(b.revenue), align: "right" as const },
          { v: fmtShort(b.purchases), align: "right" as const },
          { v: fmtShort(b.expenses), align: "right" as const },
          { v: fmtShort(b.profit), align: "right" as const },
          { v: fmtPct(b.margin_pct), align: "right" as const },
        ];
        if (b.profit < 0) doc.setTextColor(220, 38, 38); else doc.setTextColor(15, 23, 42);
        cells.forEach((cell, ci) => {
          if (ci === 4 && b.profit < 0) doc.setTextColor(220, 38, 38);
          else if (ci === 4) doc.setTextColor(4, 120, 87);
          else doc.setTextColor(15, 23, 42);
          const tx = cell.align === "right" ? cx + cols[ci].w - 1 : cx + 1.5;
          doc.text(String(cell.v), tx, y + RH - 1.8, { align: cell.align });
          cx += cols[ci].w;
        });
        y += RH;
      }

      const s = data.summary;
      doc.setFillColor(239, 246, 255); doc.rect(M, y, TW, RH, "F");
      doc.setFont("helvetica", "bold"); doc.setTextColor(15, 23, 42);
      const totCells = [
        `TOTAL (${data.buckets.length})`,
        fmtShort(s.total_revenue),
        fmtShort(data.buckets.reduce((a, b) => a + b.purchases, 0)),
        fmtShort(data.buckets.reduce((a, b) => a + b.expenses, 0)),
        fmtShort(s.total_profit),
        fmtPct(s.avg_margin_pct),
      ];
      let tx2 = M;
      totCells.forEach((v, ci) => {
        const align = cols[ci].align;
        const px = align === "right" ? tx2 + cols[ci].w - 1 : tx2 + 1.5;
        doc.text(v, px, y + RH - 1.8, { align });
        tx2 += cols[ci].w;
      });

      doc.save(`Period-Profit-${from}-${to}.pdf`);
    } catch {
      toast({ title: "PDF export failed", variant: "destructive" });
    } finally { setExporting(null); }
  }

  const s = data?.summary;

  return (
    <div className="space-y-4" data-testid="panel-period-profit">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground font-medium">From</label>
          <Input type="date" value={from} onChange={e => setFrom(e.target.value)} className="w-40 h-8 text-sm" data-testid="input-period-profit-from" />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground font-medium">To</label>
          <Input type="date" value={to} onChange={e => setTo(e.target.value)} className="w-40 h-8 text-sm" data-testid="input-period-profit-to" />
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
                data-testid={`btn-period-profit-gran-${opt.value}`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} className="h-8" data-testid="button-period-profit-refresh">
          <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Refresh
        </Button>
        <div className="ml-auto flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleCSV} disabled={!!exporting || isLoading} className="h-8" data-testid="button-period-profit-csv">
            <Download className="w-3.5 h-3.5 mr-1.5" />{exporting === "csv" ? "Exporting…" : "CSV"}
          </Button>
          <Button variant="outline" size="sm" onClick={handleExcel} disabled={!!exporting || isLoading} className="h-8" data-testid="button-period-profit-excel">
            <FileSpreadsheet className="w-3.5 h-3.5 mr-1.5" />{exporting === "excel" ? "Exporting…" : "Excel"}
          </Button>
          <Button variant="outline" size="sm" onClick={handlePDF} disabled={!!exporting || isLoading} className="h-8" data-testid="button-period-profit-pdf">
            <FileText className="w-3.5 h-3.5 mr-1.5" />{exporting === "pdf" ? "Exporting…" : "PDF"}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {[
          { label: "Total Revenue", value: fmtShort(s?.total_revenue ?? 0), color: "text-blue-700 dark:text-blue-400" },
          { label: "Total Profit", value: fmtShort(s?.total_profit ?? 0), color: (s?.total_profit ?? 0) >= 0 ? "text-emerald-700 dark:text-emerald-400" : "text-red-600 dark:text-red-400" },
          { label: "Avg Margin %", value: fmtPct(s?.avg_margin_pct ?? null), color: "text-slate-800 dark:text-slate-200" },
        ].map(card => (
          <Card key={card.label} className="border-border/60" data-testid={`card-period-profit-${card.label.toLowerCase().replace(/\s+/g, "-")}`}>
            <CardContent className="p-3">
              <p className="text-[11px] text-muted-foreground mb-1">{card.label}</p>
              {isLoading ? <Skeleton className="h-5 w-24" /> : (
                <p className={`text-sm font-semibold font-mono ${card.color}`}>{card.value}</p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {(data?.buckets?.length ?? 0) > 0 && (
        <Card className="border-border/60">
          <CardHeader className="pb-2 pt-4 px-4">
            <div className="flex items-center gap-2">
              <BarChart2 className="w-4 h-4 text-muted-foreground" />
              <CardTitle className="text-sm font-semibold">Revenue vs Purchases vs Profit</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <ResponsiveContainer width="100%" height={230}>
              <BarChart data={data!.buckets} margin={{ top: 4, right: 8, left: 8, bottom: 24 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis
                  dataKey="period_label"
                  tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }}
                  angle={-35}
                  textAnchor="end"
                  interval="preserveStartEnd"
                />
                <YAxis
                  tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }}
                  tickFormatter={v => "\u20b9" + (v / 1000).toFixed(0) + "k"}
                />
                <Tooltip
                  formatter={(v: number, name: string) => [fmtCur(v), name]}
                  contentStyle={{ fontSize: 11, borderRadius: 6 }}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="revenue"   name="Revenue"   fill="#3B82F6" radius={[2, 2, 0, 0]} />
                <Bar dataKey="purchases" name="Purchases" fill="#F97316" radius={[2, 2, 0, 0]} />
                <Bar dataKey="profit"    name="Profit"    fill="#10B981" radius={[2, 2, 0, 0]} />
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
                  <th className="text-right px-3 py-2.5 font-medium text-muted-foreground">Revenue</th>
                  <th className="text-right px-3 py-2.5 font-medium text-muted-foreground">Purchases</th>
                  <th className="text-right px-3 py-2.5 font-medium text-muted-foreground">Expenses</th>
                  <th className="text-right px-3 py-2.5 font-medium text-muted-foreground">Profit</th>
                  <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Margin %</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-b">{[1, 2, 3, 4, 5, 6].map(j => <td key={j} className="px-3 py-2.5"><Skeleton className="h-4 w-full" /></td>)}</tr>
                )) : (data?.buckets ?? []).length === 0 ? (
                  <tr><td colSpan={6} className="text-center py-10 text-muted-foreground">No data found for this period.</td></tr>
                ) : (
                  (data?.buckets ?? []).map((b, i) => (
                    <tr key={i} className="border-b hover:bg-muted/20 transition-colors" data-testid={`row-period-profit-${i}`}>
                      <td className="px-4 py-2.5 font-medium">{b.period_label}</td>
                      <td className="px-3 py-2.5 text-right font-mono">{fmtShort(b.revenue)}</td>
                      <td className="px-3 py-2.5 text-right font-mono text-muted-foreground">{fmtShort(b.purchases)}</td>
                      <td className="px-3 py-2.5 text-right font-mono text-muted-foreground">{fmtShort(b.expenses)}</td>
                      <td className={`px-3 py-2.5 text-right font-mono font-semibold ${b.profit >= 0 ? "text-emerald-700 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
                        {fmtShort(b.profit)}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono text-muted-foreground">{fmtPct(b.margin_pct)}</td>
                    </tr>
                  ))
                )}
                {!isLoading && (data?.buckets ?? []).length > 0 && s && (
                  <tr className="border-t-2 bg-blue-50/50 dark:bg-blue-950/10 font-semibold">
                    <td className="px-4 py-2.5">TOTAL ({data!.buckets.length} periods)</td>
                    <td className="px-3 py-2.5 text-right font-mono">{fmtCur(s.total_revenue)}</td>
                    <td className="px-3 py-2.5 text-right font-mono">{fmtCur(data!.buckets.reduce((a, b) => a + b.purchases, 0))}</td>
                    <td className="px-3 py-2.5 text-right font-mono">{fmtCur(data!.buckets.reduce((a, b) => a + b.expenses, 0))}</td>
                    <td className={`px-3 py-2.5 text-right font-mono ${s.total_profit >= 0 ? "text-emerald-700 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>{fmtCur(s.total_profit)}</td>
                    <td className="px-4 py-2.5 text-right font-mono">{fmtPct(s.avg_margin_pct)}</td>
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
