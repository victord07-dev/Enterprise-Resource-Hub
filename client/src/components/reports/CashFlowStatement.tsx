import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Download, FileSpreadsheet, AlertTriangle, ArrowUpRight, ArrowDownRight, Wallet } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { generateCashFlowStatementPDF } from "@/lib/reports-pdf";

interface CashFlowAccountLine {
  accountId: string;
  accountName: string;
  accountType: "bank" | "cash";
  opening: number;
  inflows: number;
  outflows: number;
  closing: number;
  netChange: number;
}

interface CashFlowAdjustment {
  reason: string;
  amount: number;
}

interface CashFlowStatementData {
  period: { from: string | null; to: string | null };
  operating: {
    customerPaymentsReceived: number;
    supplierPaymentsMade: number;
    operatingExpenses: number;
    netOperating: number;
  };
  internal: {
    transfersGross: number;
    transfersNet: number;
    adjustments: { byReason: CashFlowAdjustment[]; net: number };
    netInternal: number;
  };
  netChangeInCash: number;
  perAccount: CashFlowAccountLine[];
  totals: {
    opening: number;
    inflows: number;
    outflows: number;
    closing: number;
    netChange: number;
  };
  notes: {
    legacyReceiptsExcluded: { count: number; amount: number };
    info: string[];
  };
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

export default function CashFlowStatement() {
  const [from, setFrom] = useState(fyStart());
  const [to, setTo] = useState(todayISO());
  const [downloadingExcel, setDownloadingExcel] = useState(false);
  const { toast } = useToast();

  const { data, isLoading, error } = useQuery<CashFlowStatementData>({
    queryKey: ["/api/reports/cash-flow", from, to],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/reports/cash-flow?from=${from}&to=${to}`);
      return res.json();
    },
  });

  const handlePDF = () => {
    if (!data) return;
    try {
      const blob = generateCashFlowStatementPDF(data);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Cash-Flow-${from}-to-${to}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      toast({ title: "PDF failed", description: String(e?.message ?? e), variant: "destructive" });
    }
  };

  const handleExcel = async () => {
    setDownloadingExcel(true);
    try {
      const res = await apiRequest("GET", `/api/reports/cash-flow/excel?from=${from}&to=${to}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Cash-Flow-${from}-to-${to}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      toast({ title: "Excel failed", description: String(e?.message ?? e), variant: "destructive" });
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
          Failed to load Cash Flow statement: {String((error as any)?.message ?? "unknown")}
        </CardContent>
      </Card>
    );
  }

  const positiveChange = data.netChangeInCash >= 0;

  return (
    <div className="space-y-4" data-testid="cashflow-statement">
      {/* Filter + Actions */}
      <Card>
        <CardContent className="p-4 flex flex-wrap items-end gap-3 justify-between">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="text-xs text-muted-foreground block mb-1">From</label>
              <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="border rounded px-2 py-1 text-sm bg-background" data-testid="input-cf-from" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">To</label>
              <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="border rounded px-2 py-1 text-sm bg-background" data-testid="input-cf-to" />
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handlePDF} data-testid="button-cf-pdf">
              <Download className="w-4 h-4 mr-2" /> PDF
            </Button>
            <Button variant="outline" size="sm" onClick={handleExcel} disabled={downloadingExcel} data-testid="button-cf-excel">
              <FileSpreadsheet className="w-4 h-4 mr-2" /> {downloadingExcel ? "Downloading…" : "Excel"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Legacy receipts warning */}
      {data.notes.legacyReceiptsExcluded.count > 0 && (
        <Card className="border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/20">
          <CardContent className="p-3 flex items-start gap-2 text-xs text-amber-900 dark:text-amber-200">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
            <div>
              <strong>{data.notes.legacyReceiptsExcluded.count} legacy receipt(s) totalling {fmt(data.notes.legacyReceiptsExcluded.amount)}</strong> excluded from this report — recorded against deprecated payments table without account attribution. See Cash Position Report for unattributed footnote.
            </div>
          </CardContent>
        </Card>
      )}

      {/* Statement Body */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Cash Flow Statement (Direct Method)</span>
            <Badge variant="outline" className="font-mono text-xs">
              {data.period.from} → {data.period.to}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-1">
          {/* OPERATING ACTIVITIES */}
          <Section title="OPERATING ACTIVITIES">
            <Line label="Customer Payments Received" amount={data.operating.customerPaymentsReceived} icon={<ArrowDownRight className="w-3 h-3 text-emerald-600" />} testId="line-cf-cust-in" />
            <Line label="Supplier Payments Made" amount={-data.operating.supplierPaymentsMade} icon={<ArrowUpRight className="w-3 h-3 text-red-600" />} testId="line-cf-supp-out" />
            <Line label="Operating Expenses" amount={-data.operating.operatingExpenses} icon={<ArrowUpRight className="w-3 h-3 text-red-600" />} testId="line-cf-exp-out" />
            <SubTotal label="Net Operating Cash Flow" amount={data.operating.netOperating} testId="line-cf-net-op" />
          </Section>

          {/* INTERNAL MOVEMENTS */}
          <Section title="INTERNAL MOVEMENTS">
            <Line
              label={`Transfers (gross ${fmt(data.internal.transfersGross)} both legs)`}
              amount={data.internal.transfersNet}
              icon={<Wallet className="w-3 h-3 text-muted-foreground" />}
              testId="line-cf-transfers"
              note="Net to ₹0 by definition"
            />
            {data.internal.adjustments.byReason.length === 0 ? (
              <div className="text-sm text-muted-foreground italic px-3 py-1">No balance adjustments in period.</div>
            ) : (
              data.internal.adjustments.byReason.map((a, i) => (
                <Line key={i} label={`Adjustment: ${a.reason}`} amount={a.amount} testId={`line-cf-adj-${i}`} />
              ))
            )}
            <SubTotal label="Net Internal Movement" amount={data.internal.netInternal} testId="line-cf-net-internal" />
          </Section>

          {/* NET CHANGE IN CASH */}
          <div className={`flex items-center justify-between py-3 px-3 rounded-md ${positiveChange ? "bg-emerald-50 dark:bg-emerald-950/30" : "bg-red-50 dark:bg-red-950/30"} border-t-2 border-foreground mt-3`}>
            <div className="font-bold text-base">NET CHANGE IN CASH</div>
            <div className={`font-bold text-lg font-mono ${positiveChange ? "text-emerald-700 dark:text-emerald-400" : "text-red-700 dark:text-red-400"}`} data-testid="text-cf-net-change">
              {fmt(data.netChangeInCash)}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Per-Account Reconciliation */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Per-Account Reconciliation</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left py-2 px-3 font-semibold">Account</th>
                  <th className="text-right py-2 px-3 font-semibold">Opening</th>
                  <th className="text-right py-2 px-3 font-semibold">Inflows</th>
                  <th className="text-right py-2 px-3 font-semibold">Outflows</th>
                  <th className="text-right py-2 px-3 font-semibold">Closing</th>
                  <th className="text-right py-2 px-3 font-semibold">Δ</th>
                </tr>
              </thead>
              <tbody>
                {data.perAccount.map((a) => (
                  <tr key={a.accountId} className="border-b hover:bg-muted/30" data-testid={`row-cf-acct-${a.accountId}`}>
                    <td className="py-2 px-3">
                      {a.accountName} <Badge variant="outline" className="ml-1 text-xs">{a.accountType}</Badge>
                    </td>
                    <td className="text-right py-2 px-3 font-mono tabular-nums">{fmt(a.opening)}</td>
                    <td className="text-right py-2 px-3 font-mono tabular-nums text-emerald-700 dark:text-emerald-400">{fmt(a.inflows)}</td>
                    <td className="text-right py-2 px-3 font-mono tabular-nums text-red-700 dark:text-red-400">{fmt(a.outflows)}</td>
                    <td className="text-right py-2 px-3 font-mono tabular-nums">{fmt(a.closing)}</td>
                    <td className={`text-right py-2 px-3 font-mono tabular-nums font-semibold ${a.netChange >= 0 ? "text-emerald-700 dark:text-emerald-400" : "text-red-700 dark:text-red-400"}`}>
                      {fmt(a.netChange)}
                    </td>
                  </tr>
                ))}
                <tr className="bg-muted font-bold border-t-2">
                  <td className="py-2 px-3">TOTAL</td>
                  <td className="text-right py-2 px-3 font-mono tabular-nums">{fmt(data.totals.opening)}</td>
                  <td className="text-right py-2 px-3 font-mono tabular-nums">{fmt(data.totals.inflows)}</td>
                  <td className="text-right py-2 px-3 font-mono tabular-nums">{fmt(data.totals.outflows)}</td>
                  <td className="text-right py-2 px-3 font-mono tabular-nums">{fmt(data.totals.closing)}</td>
                  <td className={`text-right py-2 px-3 font-mono tabular-nums ${data.totals.netChange >= 0 ? "text-emerald-700 dark:text-emerald-400" : "text-red-700 dark:text-red-400"}`}>{fmt(data.totals.netChange)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Footer notes */}
      {data.notes.info.length > 0 && (
        <Card>
          <CardContent className="p-3 text-xs text-muted-foreground space-y-1">
            {data.notes.info.map((n, i) => (
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

function Line({ label, amount, icon, note, testId }: { label: string; amount: number; icon?: React.ReactNode; note?: string; testId?: string }) {
  return (
    <div className="flex items-center justify-between px-3 py-1.5 text-sm hover:bg-muted/50 rounded" data-testid={testId}>
      <div className="flex items-center gap-2 flex-1">
        {icon}
        <span>{label}</span>
        {note && <span className="ml-2 text-xs text-muted-foreground italic">({note})</span>}
      </div>
      <div className="font-mono tabular-nums">{fmt(amount)}</div>
    </div>
  );
}

function SubTotal({ label, amount, testId }: { label: string; amount: number; testId?: string }) {
  return (
    <div className="flex items-center justify-between px-3 py-2 border-t font-semibold text-sm" data-testid={testId}>
      <span>{label}</span>
      <span className="font-mono tabular-nums">{fmt(amount)}</span>
    </div>
  );
}
