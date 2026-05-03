import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Download, FileSpreadsheet, AlertTriangle, TrendingUp, TrendingDown } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { generatePLStatementPDF } from "@/lib/reports-pdf";

interface PLOpexLine {
  categoryId: string | null;
  categoryName: string;
  total: number;
}

interface PLStatementData {
  period: { from: string | null; to: string | null };
  revenue: {
    salesRevenue: number;
    salesReturns: number;
    netRevenue: number;
    salesInvoiceCount: number;
    creditNoteCount: number;
  };
  cogs: {
    purchases: number;
    label: string;
    caveat: string;
    supplierInvoiceCount: number;
  };
  grossProfit: number;
  operatingExpenses: {
    byCategory: PLOpexLine[];
    total: number;
    expenseCount: number;
  };
  netProfitBeforeTax: number;
  notes: string[];
}

const fmt = (n: number) =>
  "₹" + n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function fyStart(): string {
  const today = new Date();
  const y = today.getMonth() >= 3 ? today.getFullYear() : today.getFullYear() - 1;
  return `${y}-04-01`;
}

export default function PLStatement() {
  const [from, setFrom] = useState(fyStart());
  const [to, setTo] = useState(todayISO());
  const [downloadingExcel, setDownloadingExcel] = useState(false);
  const { toast } = useToast();

  const { data, isLoading, error } = useQuery<PLStatementData>({
    queryKey: ["/api/reports/pl-statement", from, to],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/reports/pl-statement?from=${from}&to=${to}`);
      return res.json();
    },
  });

  const handlePDF = () => {
    if (!data) return;
    try {
      const blob = generatePLStatementPDF(data);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `PL-Statement-${from}-to-${to}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      toast({ title: "PDF generation failed", description: String(e?.message ?? e), variant: "destructive" });
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
            <Button variant="outline" size="sm" onClick={handlePDF} data-testid="button-pl-pdf">
              <Download className="w-4 h-4 mr-2" /> PDF
            </Button>
            <Button variant="outline" size="sm" onClick={handleExcel} disabled={downloadingExcel} data-testid="button-pl-excel">
              <FileSpreadsheet className="w-4 h-4 mr-2" /> {downloadingExcel ? "Downloading…" : "Excel"}
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
            <SubTotal label="Net Revenue" amount={data.revenue.netRevenue} testId="line-pl-net-revenue" />
          </Section>

          {/* PURCHASES (COGS proxy) */}
          <Section title={data.cogs.label.toUpperCase()}>
            <Line label="Purchases" amount={-data.cogs.purchases} count={`${data.cogs.supplierInvoiceCount} supplier invoices`} testId="line-pl-purchases" />
          </Section>

          {/* GROSS PROFIT */}
          <SubTotal label="GROSS PROFIT" amount={data.grossProfit} prominent testId="line-pl-gross-profit" />

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
