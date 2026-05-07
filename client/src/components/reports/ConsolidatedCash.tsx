import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Download, FileSpreadsheet, FileText, RefreshCw, Layers } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface LedgerLine {
  txnDate: string; type: string; description: string;
  party: string; reference: string; debit: number; credit: number;
  accountId: string; accountName: string;
}
interface ConsolidatedCashResult {
  period: { from: string; to: string };
  lines: LedgerLine[];
  totalDebit: number; totalCredit: number; netChange: number;
}

function fmtCur(v: number) {
  return "₹" + v.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const TYPE_COLORS: Record<string, string> = {
  "Receipt": "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400",
  "Payment": "bg-red-100 text-red-700 dark:bg-red-950/30 dark:text-red-400",
  "Expense": "bg-orange-100 text-orange-700 dark:bg-orange-950/30 dark:text-orange-400",
  "Transfer In": "bg-blue-100 text-blue-700 dark:bg-blue-950/30 dark:text-blue-400",
  "Transfer Out": "bg-purple-100 text-purple-700 dark:bg-purple-950/30 dark:text-purple-400",
  "Adjustment": "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
};

function defaultDateRange() {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  const to = now.toISOString().slice(0, 10);
  return { from, to };
}

export function ConsolidatedCash() {
  const { toast } = useToast();
  const { from: defaultFrom, to: defaultTo } = defaultDateRange();
  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(defaultTo);
  const [typeFilter, setTypeFilter] = useState("__all__");
  const [accountFilter, setAccountFilter] = useState("__all__");
  const [exporting, setExporting] = useState<"csv" | "excel" | "pdf" | null>(null);

  const { data, isLoading, refetch } = useQuery<ConsolidatedCashResult>({
    queryKey: ["/api/reports/consolidated-cash", from, to],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/reports/consolidated-cash?from=${from}&to=${to}`);
      return res.json();
    },
    staleTime: 60_000,
  });

  const allTypes = [...new Set((data?.lines ?? []).map(l => l.type))].sort();
  const allAccounts = [...new Map((data?.lines ?? []).map(l => [l.accountId, l.accountName])).entries()];

  const filteredLines = (data?.lines ?? []).filter(l => {
    if (typeFilter !== "__all__" && l.type !== typeFilter) return false;
    if (accountFilter !== "__all__" && l.accountId !== accountFilter) return false;
    return true;
  });

  const totalDebit = filteredLines.reduce((s, l) => s + l.debit, 0);
  const totalCredit = filteredLines.reduce((s, l) => s + l.credit, 0);

  async function handleCSV() {
    setExporting("csv");
    try {
      const headers = ["Date", "Account", "Type", "Description", "Party", "Reference", "Debit", "Credit"];
      const rows = filteredLines.map(l => [l.txnDate, l.accountName, l.type, l.description, l.party, l.reference, l.debit > 0 ? l.debit.toFixed(2) : "", l.credit > 0 ? l.credit.toFixed(2) : ""]);
      rows.push(["TOTAL", "", "", "", "", "", totalDebit.toFixed(2), totalCredit.toFixed(2)]);
      const csv = [headers, ...rows].map(r => r.map(v => /[,"\r\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : v).join(",")).join("\r\n");
      const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = `Consolidated-Cash-${from}-${to}.csv`; a.click();
      URL.revokeObjectURL(url);
    } finally { setExporting(null); }
  }

  async function handleExcel() {
    setExporting("excel");
    try {
      const res = await apiRequest("GET", `/api/reports/consolidated-cash/excel?from=${from}&to=${to}`);
      if (!res.ok) throw new Error("Excel export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = `Consolidated-Cash-${from}-${to}.xlsx`; a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast({ title: "Excel export failed", variant: "destructive" });
    } finally { setExporting(null); }
  }

  async function handlePDF() {
    setExporting("pdf");
    try {
      const { generateConsolidatedCashPDF } = await import("@/lib/reports-pdf");
      const blob = await generateConsolidatedCashPDF(filteredLines, totalDebit, totalCredit, from, to);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = `Consolidated-Cash-${from}-${to}.pdf`; a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast({ title: "PDF export failed", description: String(e), variant: "destructive" });
    } finally { setExporting(null); }
  }

  return (
    <div className="space-y-4" data-testid="panel-consolidated-cash">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground font-medium">From</label>
          <Input type="date" value={from} onChange={e => setFrom(e.target.value)} className="w-38 h-8 text-sm" data-testid="input-consolidated-from" />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground font-medium">To</label>
          <Input type="date" value={to} onChange={e => setTo(e.target.value)} className="w-38 h-8 text-sm" data-testid="input-consolidated-to" />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground font-medium">Type</label>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-40 h-8 text-sm" data-testid="select-consolidated-type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All Types</SelectItem>
              {allTypes.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground font-medium">Account</label>
          <Select value={accountFilter} onValueChange={setAccountFilter}>
            <SelectTrigger className="w-48 h-8 text-sm" data-testid="select-consolidated-account">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All Accounts</SelectItem>
              {allAccounts.map(([id, name]) => <SelectItem key={id} value={id}>{name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} className="h-8" data-testid="button-consolidated-refresh">
          <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Refresh
        </Button>
        <div className="ml-auto flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleCSV} disabled={!!exporting || isLoading} className="h-8" data-testid="button-consolidated-csv">
            <Download className="w-3.5 h-3.5 mr-1.5" />{exporting === "csv" ? "Exporting…" : "CSV"}
          </Button>
          <Button variant="outline" size="sm" onClick={handleExcel} disabled={!!exporting || isLoading} className="h-8" data-testid="button-consolidated-excel">
            <FileSpreadsheet className="w-3.5 h-3.5 mr-1.5" />{exporting === "excel" ? "Exporting…" : "Excel"}
          </Button>
          <Button variant="outline" size="sm" onClick={handlePDF} disabled={!!exporting || isLoading} className="h-8" data-testid="button-consolidated-pdf">
            <FileText className="w-3.5 h-3.5 mr-1.5" />{exporting === "pdf" ? "Generating…" : "PDF"}
          </Button>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {[
          { label: "Total Inflows (Credits)", value: totalCredit, color: "text-emerald-700 dark:text-emerald-400" },
          { label: "Total Outflows (Debits)", value: totalDebit, color: "text-red-600 dark:text-red-400" },
          { label: "Net Change", value: totalCredit - totalDebit, color: (totalCredit - totalDebit) >= 0 ? "text-blue-700 dark:text-blue-400" : "text-red-600 dark:text-red-400" },
        ].map(card => (
          <Card key={card.label} className="border-border/60">
            <CardContent className="p-3">
              <p className="text-[11px] text-muted-foreground mb-1">{card.label}</p>
              {isLoading ? <Skeleton className="h-5 w-24" /> : <p className={`text-sm font-bold font-mono ${card.color}`}>{fmtCur(card.value)}</p>}
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="pb-2 pt-4 px-4">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-muted-foreground" />
            <CardTitle className="text-sm font-semibold">
              All Accounts — {from} to {to}
              {data && <span className="ml-2 text-xs font-normal text-muted-foreground">({filteredLines.length} transactions)</span>}
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b bg-muted/30">
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Date</th>
                  <th className="text-left px-3 py-2.5 font-medium text-muted-foreground">Account</th>
                  <th className="text-left px-3 py-2.5 font-medium text-muted-foreground">Type</th>
                  <th className="text-left px-3 py-2.5 font-medium text-muted-foreground">Description</th>
                  <th className="text-left px-3 py-2.5 font-medium text-muted-foreground">Party</th>
                  <th className="text-right px-3 py-2.5 font-medium text-muted-foreground">Debit (₹)</th>
                  <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Credit (₹)</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  Array.from({ length: 6 }).map((_, i) => (
                    <tr key={i} className="border-b">
                      {[1,2,3,4,5,6,7].map(j => <td key={j} className="px-3 py-2.5"><Skeleton className="h-4 w-full" /></td>)}
                    </tr>
                  ))
                ) : filteredLines.length === 0 ? (
                  <tr><td colSpan={7} className="text-center py-12 text-muted-foreground">No transactions found for this period.</td></tr>
                ) : (
                  filteredLines.map((line, idx) => (
                    <tr key={idx} className="border-b hover:bg-muted/20 transition-colors" data-testid={`row-consolidated-${idx}`}>
                      <td className="px-4 py-2.5 font-mono text-muted-foreground">{line.txnDate}</td>
                      <td className="px-3 py-2.5 text-muted-foreground max-w-[120px] truncate">{line.accountName}</td>
                      <td className="px-3 py-2.5">
                        <Badge className={`${TYPE_COLORS[line.type] ?? "bg-slate-100 text-slate-700"} border-0 text-[10px]`}>{line.type}</Badge>
                      </td>
                      <td className="px-3 py-2.5 max-w-[160px] truncate">{line.description}</td>
                      <td className="px-3 py-2.5 text-muted-foreground max-w-[120px] truncate">{line.party || "—"}</td>
                      <td className="px-3 py-2.5 text-right font-mono text-red-600 dark:text-red-400">{line.debit > 0 ? fmtCur(line.debit) : "—"}</td>
                      <td className="px-4 py-2.5 text-right font-mono text-emerald-600 dark:text-emerald-400">{line.credit > 0 ? fmtCur(line.credit) : "—"}</td>
                    </tr>
                  ))
                )}
                {!isLoading && filteredLines.length > 0 && (
                  <tr className="border-t-2 bg-blue-50/50 dark:bg-blue-950/10 font-semibold">
                    <td className="px-4 py-2.5" colSpan={5}>TOTAL</td>
                    <td className="px-3 py-2.5 text-right font-mono text-red-600 dark:text-red-400">{fmtCur(totalDebit)}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-emerald-600 dark:text-emerald-400">{fmtCur(totalCredit)}</td>
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
