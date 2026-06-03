import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as ReTooltip, Legend,
  PieChart, Pie, Cell, ResponsiveContainer,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Download, FileSpreadsheet, FileText, AlertTriangle, TrendingUp, TrendingDown } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { generatePLStatementPDF } from "@/lib/reports-pdf";
import { generatePLStatementCSV, downloadCSV } from "@/lib/reports-csv";
import { findRechartsSvg, svgNodeToPngDataUrl } from "@/lib/chart-to-image";

interface PLOpexLine {
  categoryId: string | null;
  categoryName: string;
  total: number;
}

interface PLTrendPoint {
  month: string;
  revenue: number;
  expense: number;
  netProfit: number;
}

interface PLStatementData {
  period: { from: string | null; to: string | null };
  revenue: {
    salesRevenue: number;
    salesReturns: number;
    netProductRevenue: number;
    fleetServiceRevenue?: number;
    totalNetRevenue?: number;
    salesInvoiceCount: number;
    tripInvoiceCount?: number;
    creditNoteCount: number;
  };
  cogs: {
    amount: number;
    label: string;
    caveat: string;
    challanCount: number;
    productCount: number;
  };
  grossProfit: number;
  operatingExpenses: {
    byCategory: PLOpexLine[];
    total: number;
    expenseCount: number;
  };
  netProfitBeforeTax: number;
  trend: PLTrendPoint[];
  trendWindow: { from: string; to: string };
  notes: string[];
}

const fmt = (n: number) =>
  "\u20b9" + n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtCompact = (n: number) => {
  const abs = Math.abs(n);
  if (abs >= 10000000) return `\u20b9${(n / 10000000).toFixed(1)}Cr`;
  if (abs >= 100000) return `\u20b9${(n / 100000).toFixed(1)}L`;
  if (abs >= 1000) return `\u20b9${(n / 1000).toFixed(0)}k`;
  return `\u20b9${n.toFixed(0)}`;
};

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function fyStart(): string {
  const today = new Date();
  const y = today.getMonth() >= 3 ? today.getFullYear() : today.getFullYear() - 1;
  return `${y}-04-01`;
}

const DONUT_COLORS = ["#1e3a8a", "#0ea5e9", "#10b981", "#f59e0b", "#6366f1", "#ec4899", "#84cc16", "#06b6d4"];

export default function PLStatement() {
  const [from, setFrom] = useState(fyStart());
  const [to, setTo] = useState(todayISO());
  const [downloadingExcel, setDownloadingExcel] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const { toast } = useToast();

  const trendChartRef = useRef<HTMLDivElement>(null);
  const donutChartRef = useRef<HTMLDivElement>(null);

  const { data, isLoading, error } = useQuery<PLStatementData>({
    queryKey: ["/api/reports/pl-statement", from, to],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/reports/pl-statement?from=${from}&to=${to}`);
      return res.json();
    },
  });

  const captureChart = async (ref: React.RefObject<HTMLDivElement>) => {
    if (!ref.current) return undefined;
    const svg = findRechartsSvg(ref.current);
    if (!svg) return undefined;
    try {
      return await svgNodeToPngDataUrl(svg, { scale: 2, format: "jpeg", quality: 0.92 });
    } catch (err) {
      // Architect-flagged HIGH: degrade gracefully — let PDF generate without
      // this chart instead of hanging the user's PDF button.
      console.warn("[PL PDF] chart capture failed; PDF will skip this chart:", err);
      return undefined;
    }
  };

  const handlePDF = async () => {
    if (!data) return;
    setDownloadingPdf(true);
    try {
      // Capture both charts. captureChart absorbs failures, so this Promise.all
      // can never hang on a stalled SVG load.
      const [trendImage, expenseImage] = await Promise.all([
        captureChart(trendChartRef),
        captureChart(donutChartRef),
      ]);
      const blob = await generatePLStatementPDF(data, { trendImage, expenseImage });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `PL-Statement-${from}-to-${to}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      toast({ title: "PDF generation failed", description: String(e?.message ?? e), variant: "destructive" });
    } finally {
      setDownloadingPdf(false);
    }
  };

  const handleExcel = async () => {
    setDownloadingExcel(true);
    try {
      const res = await apiRequest("GET", `/api/reports/pl-statement/excel?from=${from}&to=${to}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `PL-Statement-${from}-to-${to}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      toast({ title: "Excel download failed", description: String(e?.message ?? e), variant: "destructive" });
    } finally {
      setDownloadingExcel(false);
    }
  };

  const handleCSV = () => {
    if (!data) return;
    try {
      const csv = generatePLStatementCSV(data);
      downloadCSV(`PL-Statement-${from}-to-${to}.csv`, csv);
    } catch (e: any) {
      toast({ title: "CSV download failed", description: String(e?.message ?? e), variant: "destructive" });
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  if (error || !data) {
    return (
      <Card>
        <CardContent className="p-6 text-destructive">
          Failed to load P&amp;L statement: {String((error as any)?.message ?? "unknown")}
        </CardContent>
      </Card>
    );
  }

  const isProfitable = data.netProfitBeforeTax >= 0;
  const trendData = data.trend.map((p) => ({
    ...p,
    monthLabel: (() => {
      const [y, m] = p.month.split("-");
      const dt = new Date(Number(y), Number(m) - 1, 1);
      return dt.toLocaleDateString("en-IN", { month: "short", year: "2-digit" });
    })(),
  }));
  const donutData = data.operatingExpenses.byCategory.map((c) => ({
    name: c.categoryName,
    value: c.total,
  }));

  return (
    <div className="space-y-4" data-testid="pl-statement">
      {/* Filter + Actions Bar */}
      <Card>
        <CardContent className="p-4 flex flex-wrap items-end gap-3 justify-between">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="text-xs text-muted-foreground block mb-1">From</label>
              <input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="border rounded px-2 py-1 text-sm bg-background"
                data-testid="input-pl-from"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">To</label>
              <input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="border rounded px-2 py-1 text-sm bg-background"
                data-testid="input-pl-to"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleCSV} data-testid="button-pl-csv">
              <FileText className="w-4 h-4 mr-2" /> CSV
            </Button>
            <Button variant="outline" size="sm" onClick={handleExcel} disabled={downloadingExcel} data-testid="button-pl-excel">
              <FileSpreadsheet className="w-4 h-4 mr-2" /> {downloadingExcel ? "Downloading…" : "Excel"}
            </Button>
            <Button variant="outline" size="sm" onClick={handlePDF} disabled={downloadingPdf} data-testid="button-pl-pdf">
              <Download className="w-4 h-4 mr-2" /> {downloadingPdf ? "Generating…" : "PDF"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Caveat banner for D1 COGS proxy */}
      <Card className="border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/20">
        <CardContent className="p-3 flex items-start gap-2 text-xs text-amber-900 dark:text-amber-200">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <div>
            <strong>{data.cogs.label}:</strong> {data.cogs.caveat}
          </div>
        </CardContent>
      </Card>

      {/* Statement Body */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Profit &amp; Loss Statement</span>
            <Badge variant="outline" className="font-mono text-xs">
              {data.period.from} → {data.period.to}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-1">
          {/* REVENUE */}
          <Section title="REVENUE">
            <Line label="Sales Revenue (ex-GST)" amount={data.revenue.salesRevenue} count={`${data.revenue.salesInvoiceCount} invoices`} testId="line-pl-sales-revenue" />
            <Line label="Less: Sales Returns" amount={-data.revenue.salesReturns} count={`${data.revenue.creditNoteCount} CN`} testId="line-pl-sales-returns" muted />
            <SubTotal label="Net Product Revenue" amount={data.revenue.netProductRevenue} testId="line-pl-net-revenue" />
            {(data.revenue.fleetServiceRevenue ?? 0) > 0 && (
              <Line label="Fleet Service Revenue (ex-GST)" amount={data.revenue.fleetServiceRevenue ?? 0} count={`${data.revenue.tripInvoiceCount ?? 0} trip invoices`} testId="line-pl-fleet-revenue" />
            )}
            {(data.revenue.fleetServiceRevenue ?? 0) > 0 && (
              <SubTotal label="Total Net Revenue" amount={data.revenue.totalNetRevenue ?? data.revenue.netProductRevenue} testId="line-pl-total-revenue" />
            )}
          </Section>

          {/* COGS — finalized dispatch-based actual cost */}
          <Section title={data.cogs.label.toUpperCase()}>
            <Line label="Cost of Goods Sold" amount={-data.cogs.amount} count={`${data.cogs.challanCount} challans · ${data.cogs.productCount} products`} testId="line-pl-cogs" />
          </Section>

          {/* GROSS PROFIT */}
          <SubTotal label="GROSS PROFIT (Product)" amount={data.grossProfit} prominent testId="line-pl-gross-profit" />
          {(data.revenue.fleetServiceRevenue ?? 0) > 0 && (
            <SubTotal label="TOTAL GROSS PROFIT" amount={(data as any).totalGrossProfit ?? data.grossProfit} prominent testId="line-pl-total-gross-profit" />
          )}

          {/* OPERATING EXPENSES */}
          <Section title="OPERATING EXPENSES">
            {data.operatingExpenses.byCategory.length === 0 ? (
              <div className="text-sm text-muted-foreground italic px-2 py-1">No expenses in period.</div>
            ) : (
              data.operatingExpenses.byCategory.map((c) => (
                <Line key={c.categoryId ?? c.categoryName} label={c.categoryName} amount={-c.total} testId={`line-pl-opex-${c.categoryId ?? "uncat"}`} />
              ))
            )}
            <SubTotal label="Total Operating Expenses" amount={-data.operatingExpenses.total} testId="line-pl-total-opex" />
          </Section>

          {/* NET PROFIT */}
          <div className={`flex items-center justify-between py-3 px-3 rounded-md ${isProfitable ? "bg-emerald-50 dark:bg-emerald-950/30" : "bg-red-50 dark:bg-red-950/30"} border-t-2 border-foreground mt-3`}>
            <div className="flex items-center gap-2 font-bold text-base">
              {isProfitable ? <TrendingUp className="w-5 h-5 text-emerald-600" /> : <TrendingDown className="w-5 h-5 text-red-600" />}
              <span>NET PROFIT BEFORE TAX</span>
            </div>
            <div className={`font-bold text-lg font-mono ${isProfitable ? "text-emerald-700 dark:text-emerald-400" : "text-red-700 dark:text-red-400"}`} data-testid="text-pl-net-profit">
              {fmt(data.netProfitBeforeTax)}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Visual Summary: Trend chart + Expense breakdown ───────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4" data-testid="pl-charts-row">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">12-Month Trend</CardTitle>
            <p className="text-xs text-muted-foreground">
              Trend: 12 months ending {data.trendWindow.to}
              <span className="ml-2 italic">(decoupled from period filter)</span>
            </p>
          </CardHeader>
          <CardContent>
            <div ref={trendChartRef} style={{ width: "100%", height: 300 }} data-testid="chart-pl-trend">
              <ResponsiveContainer>
                <BarChart data={trendData} margin={{ top: 10, right: 20, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="monthLabel" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={fmtCompact} />
                  <ReTooltip formatter={(v: any) => fmt(Number(v))} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="revenue" fill="#10b981" name="Revenue" />
                  <Bar dataKey="expense" fill="#ef4444" name="Expense" />
                  <Bar dataKey="netProfit" fill="#1e3a8a" name="Net Profit" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Operating Expenses by Category</CardTitle>
            <p className="text-xs text-muted-foreground">
              {data.operatingExpenses.expenseCount} record(s) totalling {fmt(data.operatingExpenses.total)}
            </p>
          </CardHeader>
          <CardContent>
            <div ref={donutChartRef} style={{ width: "100%", height: 300 }} data-testid="chart-pl-opex-donut">
              {donutData.length === 0 ? (
                <div className="flex items-center justify-center h-full text-sm text-muted-foreground italic">
                  No expense data in period.
                </div>
              ) : (
                <ResponsiveContainer>
                  <PieChart>
                    <Pie
                      data={donutData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={45}
                      outerRadius={85}
                      label={(p: any) => fmtCompact(Number(p.value))}
                    >
                      {donutData.map((_, i) => (
                        <Cell key={i} fill={DONUT_COLORS[i % DONUT_COLORS.length]} />
                      ))}
                    </Pie>
                    <ReTooltip formatter={(v: any) => fmt(Number(v))} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Footer notes */}
      {data.notes.length > 0 && (
        <Card>
          <CardContent className="p-3 text-xs text-muted-foreground space-y-1">
            {data.notes.map((n, i) => (
              <div key={i}>• {n}</div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="py-2">
      <div className="text-xs font-semibold text-muted-foreground tracking-wider uppercase mb-1 px-2">{title}</div>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

function Line({ label, amount, count, testId, muted }: { label: string; amount: number; count?: string; testId?: string; muted?: boolean }) {
  return (
    <div className={`flex items-center justify-between px-3 py-1.5 text-sm hover:bg-muted/50 rounded ${muted ? "text-muted-foreground" : ""}`} data-testid={testId}>
      <div className="flex-1">
        <span>{label}</span>
        {count && <span className="ml-2 text-xs text-muted-foreground">({count})</span>}
      </div>
      <div className="font-mono tabular-nums">{fmt(amount)}</div>
    </div>
  );
}

function SubTotal({ label, amount, prominent, testId }: { label: string; amount: number; prominent?: boolean; testId?: string }) {
  return (
    <div className={`flex items-center justify-between px-3 py-2 border-t ${prominent ? "border-t-2 font-bold text-base" : "font-semibold text-sm"}`} data-testid={testId}>
      <span>{label}</span>
      <span className="font-mono tabular-nums">{fmt(amount)}</span>
    </div>
  );
}
