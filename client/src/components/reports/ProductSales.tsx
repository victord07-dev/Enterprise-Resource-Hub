import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Download, FileSpreadsheet, FileText, RefreshCw, Package } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell,
} from "recharts";

interface Product { id: string; name: string; sku: string; }
interface ProductSalesRow {
  product_id: string;
  product_name: string;
  sku: string;
  category: string;
  qty_sold: number;
  total_sales: number;
  invoice_count: number;
}
interface ProductSalesResult {
  rows: ProductSalesRow[];
  summary: { total_sales: number; total_qty: number; product_count: number };
  period: { from: string | null; to: string | null };
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

const BAR_COLORS = [
  "#3B82F6", "#6366F1", "#8B5CF6", "#EC4899", "#F97316",
  "#EAB308", "#22C55E", "#14B8A6", "#06B6D4", "#64748B",
];

export function ProductSales() {
  const { toast } = useToast();
  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(today);
  const [productFilter, setProductFilter] = useState("__all__");
  const [exporting, setExporting] = useState<"csv" | "excel" | "pdf" | null>(null);

  const { data: products } = useQuery<Product[]>({ queryKey: ["/api/products"] });

  const params = new URLSearchParams();
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  if (productFilter !== "__all__") params.set("productId", productFilter);

  const { data, isLoading, refetch } = useQuery<ProductSalesResult>({
    queryKey: ["/api/reports/product-sales", from, to, productFilter],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/reports/product-sales?${params}`);
      return res.json();
    },
    staleTime: 60_000,
  });

  const top10 = (data?.rows ?? []).slice(0, 10);

  async function handleCSV() {
    setExporting("csv");
    try {
      const rows = data?.rows ?? [];
      const headers = ["Product", "SKU", "Category", "Qty Sold", "Total Sales", "Invoices"];
      const csvRows = rows.map(r => [r.product_name, r.sku, r.category, r.qty_sold, r.total_sales.toFixed(2), r.invoice_count]);
      if (data?.summary) csvRows.push(["TOTAL", "", "", data.summary.total_qty, data.summary.total_sales.toFixed(2), rows.reduce((s, r) => s + r.invoice_count, 0)]);
      const csv = [headers, ...csvRows]
        .map(r => r.map(v => /[,"\r\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : v).join(","))
        .join("\r\n");
      const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = `Product-Sales-${from}-${to}.csv`; a.click();
      URL.revokeObjectURL(url);
    } finally { setExporting(null); }
  }

  async function handleExcel() {
    setExporting("excel");
    try {
      const res = await apiRequest("GET", `/api/reports/product-sales/excel?${params}`);
      if (!res.ok) throw new Error("Excel export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = `Product-Sales-${from}-${to}.xlsx`; a.click();
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
        title: "Product Sales Report",
        bannerSubtitle: `${from ?? "All"} \u2192 ${to ?? "All"}`,
      });
      y += 4;

      const cols = [
        { header: "Product", w: 64, align: "left" as const },
        { header: "SKU", w: 30, align: "left" as const },
        { header: "Category", w: 34, align: "left" as const },
        { header: "Qty Sold", w: 22, align: "right" as const },
        { header: "Total Sales (\u20b9)", w: 44, align: "right" as const },
        { header: "Invoices", w: 18, align: "right" as const },
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

      doc.setFontSize(6.2); doc.setFont("helvetica", "normal"); doc.setTextColor(15, 23, 42);
      for (let i = 0; i < data.rows.length; i++) {
        if (y + RH > 210 - 12) { doc.addPage(); y = 20; }
        const r = data.rows[i];
        if (i % 2 === 1) { doc.setFillColor(248, 250, 252); doc.rect(M, y, TW, RH, "F"); }
        doc.setDrawColor(226, 232, 240); doc.rect(M, y, TW, RH, "S");
        let cx = M;
        const cells = [r.product_name, r.sku, r.category, String(r.qty_sold), fmtShort(r.total_sales), String(r.invoice_count)];
        cells.forEach((v, ci) => {
          const align = cols[ci].align;
          const px = align === "right" ? cx + cols[ci].w - 1 : cx + 1.5;
          const text = doc.splitTextToSize(v, cols[ci].w - 2)[0] ?? v;
          doc.text(text, px, y + RH - 1.8, { align });
          cx += cols[ci].w;
        });
        y += RH;
      }

      const s = data.summary;
      doc.setFillColor(239, 246, 255); doc.rect(M, y, TW, RH, "F");
      doc.setFont("helvetica", "bold");
      let tx2 = M;
      const totals = [`TOTAL (${s.product_count} products)`, "", "", String(s.total_qty), fmtShort(s.total_sales), ""];
      totals.forEach((v, ci) => {
        const align = cols[ci].align;
        const px = align === "right" ? tx2 + cols[ci].w - 1 : tx2 + 1.5;
        doc.text(v, px, y + RH - 1.8, { align });
        tx2 += cols[ci].w;
      });

      doc.save(`Product-Sales-${from}-${to}.pdf`);
    } catch {
      toast({ title: "PDF export failed", variant: "destructive" });
    } finally { setExporting(null); }
  }

  const s = data?.summary;

  return (
    <div className="space-y-4" data-testid="panel-product-sales">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground font-medium">From</label>
          <Input type="date" value={from} onChange={e => setFrom(e.target.value)} className="w-40 h-8 text-sm" data-testid="input-product-sales-from" />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground font-medium">To</label>
          <Input type="date" value={to} onChange={e => setTo(e.target.value)} className="w-40 h-8 text-sm" data-testid="input-product-sales-to" />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground font-medium">Product</label>
          <Select value={productFilter} onValueChange={setProductFilter}>
            <SelectTrigger className="w-52 h-8 text-sm" data-testid="select-product-sales-product">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All Products</SelectItem>
              {(products ?? []).filter(p => (p as any).type !== "bundle").map(p => (
                <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} className="h-8" data-testid="button-product-sales-refresh">
          <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Refresh
        </Button>
        <div className="ml-auto flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleCSV} disabled={!!exporting || isLoading} className="h-8" data-testid="button-product-sales-csv">
            <Download className="w-3.5 h-3.5 mr-1.5" />{exporting === "csv" ? "Exporting…" : "CSV"}
          </Button>
          <Button variant="outline" size="sm" onClick={handleExcel} disabled={!!exporting || isLoading} className="h-8" data-testid="button-product-sales-excel">
            <FileSpreadsheet className="w-3.5 h-3.5 mr-1.5" />{exporting === "excel" ? "Exporting…" : "Excel"}
          </Button>
          <Button variant="outline" size="sm" onClick={handlePDF} disabled={!!exporting || isLoading} className="h-8" data-testid="button-product-sales-pdf">
            <FileText className="w-3.5 h-3.5 mr-1.5" />{exporting === "pdf" ? "Exporting…" : "PDF"}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {[
          { label: "Total Sales", value: fmtShort(s?.total_sales ?? 0), color: "text-blue-700 dark:text-blue-400" },
          { label: "Total Qty Sold", value: (s?.total_qty ?? 0).toLocaleString("en-IN"), color: "text-slate-800 dark:text-slate-200" },
          { label: "Products", value: String(s?.product_count ?? 0), color: "text-slate-800 dark:text-slate-200" },
        ].map(card => (
          <Card key={card.label} className="border-border/60" data-testid={`card-product-sales-${card.label.toLowerCase().replace(/\s+/g, "-")}`}>
            <CardContent className="p-3">
              <p className="text-[11px] text-muted-foreground mb-1">{card.label}</p>
              {isLoading ? <Skeleton className="h-5 w-24" /> : (
                <p className={`text-sm font-semibold font-mono ${card.color}`}>{card.value}</p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {top10.length > 0 && (
        <Card className="border-border/60">
          <CardHeader className="pb-2 pt-4 px-4">
            <div className="flex items-center gap-2">
              <Package className="w-4 h-4 text-muted-foreground" />
              <CardTitle className="text-sm font-semibold">Top 10 Products by Sales</CardTitle>
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
                  formatter={(v: number) => [fmtCur(v), "Total Sales"]}
                  contentStyle={{ fontSize: 11, borderRadius: 6 }}
                />
                <Bar dataKey="total_sales" name="Total Sales" radius={[0, 3, 3, 0]}>
                  {top10.map((_, i) => <Cell key={i} fill={BAR_COLORS[i % BAR_COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      <Card className="border-border/60">
        <CardHeader className="pb-2 pt-4 px-4">
          <div className="flex items-center gap-2">
            <Package className="w-4 h-4 text-muted-foreground" />
            <CardTitle className="text-sm font-semibold">
              Product Detail
              {data && <span className="ml-2 text-xs font-normal text-muted-foreground">({data.rows.length} products)</span>}
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b bg-muted/30">
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Product</th>
                  <th className="text-left px-3 py-2.5 font-medium text-muted-foreground">SKU</th>
                  <th className="text-left px-3 py-2.5 font-medium text-muted-foreground">Category</th>
                  <th className="text-right px-3 py-2.5 font-medium text-muted-foreground">Qty Sold</th>
                  <th className="text-right px-3 py-2.5 font-medium text-muted-foreground">Total Sales</th>
                  <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Invoices</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i} className="border-b">{[1, 2, 3, 4, 5, 6].map(j => <td key={j} className="px-3 py-2.5"><Skeleton className="h-4 w-full" /></td>)}</tr>
                )) : (data?.rows ?? []).length === 0 ? (
                  <tr><td colSpan={6} className="text-center py-10 text-muted-foreground">No sales invoice items found for this period.</td></tr>
                ) : (
                  (data?.rows ?? []).map(r => (
                    <tr key={r.product_id} className="border-b hover:bg-muted/20 transition-colors" data-testid={`row-product-sales-${r.product_id}`}>
                      <td className="px-4 py-2.5 font-medium">{r.product_name}</td>
                      <td className="px-3 py-2.5 font-mono text-muted-foreground">{r.sku}</td>
                      <td className="px-3 py-2.5 text-muted-foreground">{r.category}</td>
                      <td className="px-3 py-2.5 text-right font-mono">{r.qty_sold.toLocaleString("en-IN")}</td>
                      <td className="px-3 py-2.5 text-right font-mono font-semibold">{fmtCur(r.total_sales)}</td>
                      <td className="px-4 py-2.5 text-right text-muted-foreground">{r.invoice_count}</td>
                    </tr>
                  ))
                )}
                {!isLoading && (data?.rows ?? []).length > 0 && s && (
                  <tr className="border-t-2 bg-blue-50/50 dark:bg-blue-950/10 font-semibold">
                    <td className="px-4 py-2.5" colSpan={3}>TOTAL ({s.product_count} products)</td>
                    <td className="px-3 py-2.5 text-right font-mono">{s.total_qty.toLocaleString("en-IN")}</td>
                    <td className="px-3 py-2.5 text-right font-mono">{fmtCur(s.total_sales)}</td>
                    <td className="px-4 py-2.5 text-right">{(data?.rows ?? []).reduce((a, r) => a + r.invoice_count, 0)}</td>
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
