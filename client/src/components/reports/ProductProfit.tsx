import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Download, FileSpreadsheet, FileText, RefreshCw, AlertTriangle, TrendingUp } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell,
} from "recharts";

interface ProductWiseProfitRow {
  product_name: string;
  sku: string;
  qty_sold: number;
  revenue: number;
  cost: number;
  gross_profit: number;
  margin_pct: number | null;
  has_grn_data: boolean;
}
interface ProductWiseProfitResult {
  rows: ProductWiseProfitRow[];
  period: { from: string | null; to: string | null };
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

const BAR_COLORS = [
  "#3B82F6", "#6366F1", "#8B5CF6", "#EC4899", "#F97316",
  "#EAB308", "#22C55E", "#14B8A6", "#06B6D4", "#64748B",
];

export function ProductProfit() {
  const { toast } = useToast();
  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(today);
  const [exporting, setExporting] = useState<"csv" | "excel" | "pdf" | null>(null);

  const params = new URLSearchParams();
  if (from) params.set("from", from);
  if (to) params.set("to", to);

  const { data, isLoading, refetch } = useQuery<ProductWiseProfitResult>({
    queryKey: ["/api/reports/product-profit", from, to],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/reports/product-profit?${params}`);
      return res.json();
    },
    staleTime: 60_000,
  });

  const top10 = (data?.rows ?? []).slice(0, 10);
  const totalRevenue   = (data?.rows ?? []).reduce((s, r) => s + r.revenue, 0);
  const totalProfit    = (data?.rows ?? []).reduce((s, r) => s + r.gross_profit, 0);
  const avgMargin      = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : null;
  const missingGrn     = (data?.rows ?? []).filter(r => !r.has_grn_data).length;

  async function handleCSV() {
    setExporting("csv");
    try {
      const rows = data?.rows ?? [];
      const headers = ["Product", "SKU", "Qty Sold", "Revenue", "Cost", "Gross Profit", "Margin %", "GRN Status"];
      const csvRows = rows.map(r => [
        r.product_name, r.sku,
        r.qty_sold, r.revenue.toFixed(2), r.cost.toFixed(2), r.gross_profit.toFixed(2),
        r.margin_pct != null ? r.margin_pct.toFixed(2) : "",
        r.has_grn_data ? "Yes" : "No GRN cost data",
      ]);
      if (rows.length) {
        csvRows.push(["TOTAL", "", rows.reduce((s, r) => s + r.qty_sold, 0), totalRevenue.toFixed(2), rows.reduce((s, r) => s + r.cost, 0).toFixed(2), totalProfit.toFixed(2), avgMargin != null ? avgMargin.toFixed(2) : "", ""]);
      }
      const csv = [headers, ...csvRows]
        .map(r => r.map(v => /[,"\r\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : v).join(","))
        .join("\r\n");
      const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = `Product-Profit-${from}-${to}.csv`; a.click();
      URL.revokeObjectURL(url);
    } finally { setExporting(null); }
  }

  async function handleExcel() {
    setExporting("excel");
    try {
      const res = await apiRequest("GET", `/api/reports/product-profit/excel?${params}`);
      if (!res.ok) throw new Error("Excel export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = `Product-Profit-${from}-${to}.xlsx`; a.click();
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
        title: "Product Profit Report (FIFO)",
        bannerSubtitle: `${from ?? "All"} \u2192 ${to ?? "All"} | Bundle products excluded`,
      });
      y += 4;

      const cols = [
        { header: "Product", w: 56, align: "left" as const },
        { header: "SKU", w: 28, align: "left" as const },
        { header: "Qty", w: 16, align: "right" as const },
        { header: "Revenue (\u20b9)", w: 38, align: "right" as const },
        { header: "Cost (\u20b9)", w: 36, align: "right" as const },
        { header: "Gross Profit (\u20b9)", w: 40, align: "right" as const },
        { header: "Margin %", w: 20, align: "right" as const },
        { header: "GRN", w: 18, align: "center" as const },
      ];
      const TW = cols.reduce((s, c) => s + c.w, 0);
      const THH = 5.5; const RH = 6;

      doc.setFillColor(241, 245, 249);
      doc.rect(M, y, TW, THH, "F");
      doc.setFontSize(5.8); doc.setFont("helvetica", "bold"); doc.setTextColor(100, 116, 139);
      let x = M;
      for (const col of cols) {
        const align = col.align === "center" ? "center" : col.align;
        const tx = align === "right" ? x + col.w - 1 : align === "center" ? x + col.w / 2 : x + 1.5;
        doc.text(col.header.toUpperCase(), tx, y + THH - 1.5, { align });
        x += col.w;
      }
      y += THH;

      doc.setFontSize(6.2); doc.setFont("helvetica", "normal"); doc.setTextColor(15, 23, 42);
      for (let i = 0; i < data.rows.length; i++) {
        if (y + RH > 210 - 12) { doc.addPage(); y = 20; }
        const r = data.rows[i];
        if (i % 2 === 1) { doc.setFillColor(248, 250, 252); doc.rect(M, y, TW, RH, "F"); }
        doc.setDrawColor(226, 232, 240); doc.rect(M, y, TW, RH, "S");
        let cx = M;
        const cells = [
          { v: r.product_name, align: "left" as const },
          { v: r.sku, align: "left" as const },
          { v: String(r.qty_sold), align: "right" as const },
          { v: fmtShort(r.revenue), align: "right" as const },
          { v: fmtShort(r.cost), align: "right" as const },
          { v: fmtShort(r.gross_profit), align: "right" as const },
          { v: fmtPct(r.margin_pct), align: "right" as const },
          { v: r.has_grn_data ? "\u2713" : "!", align: "center" as const },
        ];
        cells.forEach((cell, ci) => {
          if (ci === 5) {
            doc.setTextColor(r.gross_profit >= 0 ? 4 : 220, r.gross_profit >= 0 ? 120 : 38, r.gross_profit >= 0 ? 87 : 38);
          } else if (!r.has_grn_data && ci === 7) {
            doc.setTextColor(180, 83, 9);
          } else {
            doc.setTextColor(15, 23, 42);
          }
          const px = cell.align === "right" ? cx + cols[ci].w - 1 : cell.align === "center" ? cx + cols[ci].w / 2 : cx + 1.5;
          const text = doc.splitTextToSize(String(cell.v), cols[ci].w - 2)[0] ?? cell.v;
          doc.text(text, px, y + RH - 1.8, { align: cell.align });
          cx += cols[ci].w;
        });
        y += RH;
      }

      doc.setFillColor(239, 246, 255); doc.rect(M, y, TW, RH, "F");
      doc.setFont("helvetica", "bold"); doc.setTextColor(15, 23, 42);
      let tx2 = M;
      const totals = [
        { v: `TOTAL (${data.rows.length} products)`, align: "left" as const },
        { v: "", align: "left" as const },
        { v: String(data.rows.reduce((s, r) => s + r.qty_sold, 0)), align: "right" as const },
        { v: fmtShort(totalRevenue), align: "right" as const },
        { v: fmtShort(data.rows.reduce((s, r) => s + r.cost, 0)), align: "right" as const },
        { v: fmtShort(totalProfit), align: "right" as const },
        { v: fmtPct(avgMargin), align: "right" as const },
        { v: "", align: "center" as const },
      ];
      totals.forEach((cell, ci) => {
        const px = cell.align === "right" ? tx2 + cols[ci].w - 1 : cell.align === "center" ? tx2 + cols[ci].w / 2 : tx2 + 1.5;
        doc.text(cell.v, px, y + RH - 1.8, { align: cell.align });
        tx2 += cols[ci].w;
      });

      doc.save(`Product-Profit-${from}-${to}.pdf`);
    } catch {
      toast({ title: "PDF export failed", variant: "destructive" });
    } finally { setExporting(null); }
  }

  return (
    <div className="space-y-4" data-testid="panel-product-profit">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground font-medium">From</label>
          <Input type="date" value={from} onChange={e => setFrom(e.target.value)} className="w-40 h-8 text-sm" data-testid="input-product-profit-from" />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground font-medium">To</label>
          <Input type="date" value={to} onChange={e => setTo(e.target.value)} className="w-40 h-8 text-sm" data-testid="input-product-profit-to" />
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} className="h-8" data-testid="button-product-profit-refresh">
          <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Refresh
        </Button>
        <div className="ml-auto flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleCSV} disabled={!!exporting || isLoading} className="h-8" data-testid="button-product-profit-csv">
            <Download className="w-3.5 h-3.5 mr-1.5" />{exporting === "csv" ? "Exporting…" : "CSV"}
          </Button>
          <Button variant="outline" size="sm" onClick={handleExcel} disabled={!!exporting || isLoading} className="h-8" data-testid="button-product-profit-excel">
            <FileSpreadsheet className="w-3.5 h-3.5 mr-1.5" />{exporting === "excel" ? "Exporting…" : "Excel"}
          </Button>
          <Button variant="outline" size="sm" onClick={handlePDF} disabled={!!exporting || isLoading} className="h-8" data-testid="button-product-profit-pdf">
            <FileText className="w-3.5 h-3.5 mr-1.5" />{exporting === "pdf" ? "Exporting…" : "PDF"}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {[
          { label: "Total Revenue", value: fmtShort(totalRevenue), color: "text-blue-700 dark:text-blue-400" },
          { label: "Total Gross Profit", value: fmtShort(totalProfit), color: totalProfit >= 0 ? "text-emerald-700 dark:text-emerald-400" : "text-red-600 dark:text-red-400" },
          { label: "Avg Margin %", value: fmtPct(avgMargin), color: "text-slate-800 dark:text-slate-200" },
        ].map(card => (
          <Card key={card.label} className="border-border/60" data-testid={`card-product-profit-${card.label.toLowerCase().replace(/\s+/g, "-")}`}>
            <CardContent className="p-3">
              <p className="text-[11px] text-muted-foreground mb-1">{card.label}</p>
              {isLoading ? <Skeleton className="h-5 w-24" /> : (
                <p className={`text-sm font-semibold font-mono ${card.color}`}>{card.value}</p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {missingGrn > 0 && (
        <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800/40 px-3 py-2.5 text-xs text-amber-800 dark:text-amber-400" data-testid="alert-missing-grn">
          <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
          <span>{missingGrn} product{missingGrn > 1 ? "s" : ""} have no confirmed GRN cost data — cost shown as ₹0 and margin suppressed. Receive a GRN for these products to enable FIFO costing.</span>
        </div>
      )}

      {top10.length > 0 && (
        <Card className="border-border/60">
          <CardHeader className="pb-2 pt-4 px-4">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-muted-foreground" />
              <CardTitle className="text-sm font-semibold">Top 10 Products by Gross Profit</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <ResponsiveContainer width="100%" height={Math.max(180, top10.length * 28)}>
              <BarChart
                data={top10}
                layout="vertical"
                margin={{ top: 4, right: 60, left: 4, bottom: 4 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                <XAxis
                  type="number"
                  tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }}
                  tickFormatter={v => "\u20b9" + (v / 1000).toFixed(0) + "k"}
                />
                <YAxis
                  type="category"
                  dataKey="product_name"
                  width={130}
                  tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }}
                  tickFormatter={(v: string) => v.length > 22 ? v.slice(0, 20) + "\u2026" : v}
                />
                <Tooltip
                  formatter={(v: number, name: string) => [fmtCur(v), name]}
                  contentStyle={{ fontSize: 11, borderRadius: 6 }}
                />
                <Bar dataKey="gross_profit" name="Gross Profit" radius={[0, 3, 3, 0]}>
                  {top10.map((r, i) => <Cell key={i} fill={r.gross_profit >= 0 ? BAR_COLORS[i % BAR_COLORS.length] : "#EF4444"} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      <Card className="border-border/60">
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-sm font-semibold">
            Product Detail
            {data && <span className="ml-2 text-xs font-normal text-muted-foreground">({data.rows.length} products)</span>}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b bg-muted/30">
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Product</th>
                  <th className="text-left px-3 py-2.5 font-medium text-muted-foreground">SKU</th>
                  <th className="text-right px-3 py-2.5 font-medium text-muted-foreground">Qty</th>
                  <th className="text-right px-3 py-2.5 font-medium text-muted-foreground">Revenue</th>
                  <th className="text-right px-3 py-2.5 font-medium text-muted-foreground">Cost</th>
                  <th className="text-right px-3 py-2.5 font-medium text-muted-foreground">Gross Profit</th>
                  <th className="text-right px-3 py-2.5 font-medium text-muted-foreground">Margin %</th>
                  <th className="text-center px-4 py-2.5 font-medium text-muted-foreground">GRN Status</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i} className="border-b">{[1, 2, 3, 4, 5, 6, 7, 8].map(j => <td key={j} className="px-3 py-2.5"><Skeleton className="h-4 w-full" /></td>)}</tr>
                )) : (data?.rows ?? []).length === 0 ? (
                  <tr><td colSpan={8} className="text-center py-10 text-muted-foreground">No dispatched items found for this period.</td></tr>
                ) : (
                  (data?.rows ?? []).map((r, i) => (
                    <tr key={i} className="border-b hover:bg-muted/20 transition-colors" data-testid={`row-product-profit-${i}`}>
                      <td className="px-4 py-2.5 font-medium">{r.product_name}</td>
                      <td className="px-3 py-2.5 font-mono text-muted-foreground">{r.sku}</td>
                      <td className="px-3 py-2.5 text-right font-mono">{r.qty_sold.toLocaleString("en-IN")}</td>
                      <td className="px-3 py-2.5 text-right font-mono">{fmtCur(r.revenue)}</td>
                      <td className="px-3 py-2.5 text-right font-mono text-muted-foreground">{r.has_grn_data ? fmtCur(r.cost) : "\u2014"}</td>
                      <td className={`px-3 py-2.5 text-right font-mono font-semibold ${r.has_grn_data ? (r.gross_profit >= 0 ? "text-emerald-700 dark:text-emerald-400" : "text-red-600 dark:text-red-400") : "text-muted-foreground"}`}>
                        {r.has_grn_data ? fmtCur(r.gross_profit) : "\u2014"}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono">{fmtPct(r.margin_pct)}</td>
                      <td className="px-4 py-2.5 text-center">
                        {r.has_grn_data ? (
                          <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400 text-[10px] font-medium">
                            ✓ GRN
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-400 text-[10px] font-medium" data-testid={`flag-no-grn-${i}`}>
                            <AlertTriangle className="w-3 h-3" /> No GRN cost data
                          </span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
                {!isLoading && (data?.rows ?? []).length > 0 && (
                  <tr className="border-t-2 bg-blue-50/50 dark:bg-blue-950/10 font-semibold">
                    <td className="px-4 py-2.5" colSpan={2}>TOTAL ({data!.rows.length} products)</td>
                    <td className="px-3 py-2.5 text-right font-mono">{data!.rows.reduce((s, r) => s + r.qty_sold, 0).toLocaleString("en-IN")}</td>
                    <td className="px-3 py-2.5 text-right font-mono">{fmtCur(totalRevenue)}</td>
                    <td className="px-3 py-2.5 text-right font-mono">{fmtCur(data!.rows.reduce((s, r) => s + r.cost, 0))}</td>
                    <td className={`px-3 py-2.5 text-right font-mono ${totalProfit >= 0 ? "text-emerald-700 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>{fmtCur(totalProfit)}</td>
                    <td className="px-3 py-2.5 text-right font-mono">{fmtPct(avgMargin)}</td>
                    <td />
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-2.5 border-t text-[11px] text-muted-foreground italic" data-testid="footer-bundle-note">
            Bundle products excluded — component-level costing deferred to Phase 4D.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
