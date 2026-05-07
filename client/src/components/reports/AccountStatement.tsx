import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Download, FileSpreadsheet, FileText, RefreshCw, BookOpen } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface CashAccount { id: string; name: string; accountType: string; }
interface LedgerLine {
  txnDate: string; type: string; description: string;
  party: string; reference: string; debit: number; credit: number;
  accountId: string; accountName: string;
}
interface AccountStatementResult {
  accountId: string; accountName: string;
  period: { from: string; to: string };
  openingBalance: number; lines: LedgerLine[];
  totalDebit: number; totalCredit: number; closingBalance: number;
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

export function AccountStatement() {
  const { toast } = useToast();
  const { from: defaultFrom, to: defaultTo } = defaultDateRange();
  const [accountId, setAccountId] = useState("");
  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(defaultTo);
  const [exporting, setExporting] = useState<"csv" | "excel" | "pdf" | null>(null);

  const { data: accounts } = useQuery<CashAccount[]>({
    queryKey: ["/api/cash-accounts"],
    staleTime: 300_000,
  });

  const { data, isLoading, refetch } = useQuery<AccountStatementResult>({
    queryKey: ["/api/reports/account-statement", accountId, from, to],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/reports/account-statement?accountId=${accountId}&from=${from}&to=${to}`);
      return res.json();
    },
    enabled: !!accountId,
    staleTime: 60_000,
  });

  async function handleCSV() {
    if (!data) return;
    setExporting("csv");
    try {
      const headers = ["Date", "Type", "Description", "Party", "Reference", "Debit", "Credit"];
      const rows = data.lines.map(l => [l.txnDate, l.type, l.description, l.party, l.reference, l.debit > 0 ? l.debit.toFixed(2) : "", l.credit > 0 ? l.credit.toFixed(2) : ""]);
      rows.push(["TOTAL", "", "", "", "", data.totalDebit.toFixed(2), data.totalCredit.toFixed(2)]);
      const csv = [headers, ...rows].map(r => r.map(v => /[,"\r\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : v).join(",")).join("\r\n");
      const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = `Account-Statement-${data.accountName.replace(/\s+/g, "-")}-${from}-${to}.csv`; a.click();
      URL.revokeObjectURL(url);
    } finally { setExporting(null); }
  }

  async function handleExcel() {
    if (!accountId) return;
    setExporting("excel");
    try {
      const res = await apiRequest("GET", `/api/reports/account-statement/excel?accountId=${accountId}&from=${from}&to=${to}`);
      if (!res.ok) throw new Error("Excel export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = `Account-Statement-${from}-${to}.xlsx`; a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast({ title: "Excel export failed", variant: "destructive" });
    } finally { setExporting(null); }
  }

  async function handlePDF() {
    if (!data) return;
    setExporting("pdf");
    try {
      const { generateAccountStatementPDF } = await import("@/lib/reports-pdf");
      const blob = await generateAccountStatementPDF(data);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = `Account-Statement-${data.accountName.replace(/\s+/g, "-")}-${from}-${to}.pdf`; a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast({ title: "PDF export failed", description: String(e), variant: "destructive" });
    } finally { setExporting(null); }
  }

  return (
    <div className="space-y-4" data-testid="panel-account-statement">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground font-medium">Account</label>
          <Select value={accountId} onValueChange={setAccountId}>
            <SelectTrigger className="w-60 h-8 text-sm" data-testid="select-account-statement-account">
              <SelectValue placeholder="Select account…" />
            </SelectTrigger>
            <SelectContent>
              {(accounts ?? []).map(a => (
                <SelectItem key={a.id} value={a.id}>{a.name} ({a.accountType})</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground font-medium">From</label>
          <Input type="date" value={from} onChange={e => setFrom(e.target.value)} className="w-38 h-8 text-sm" data-testid="input-account-statement-from" />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground font-medium">To</label>
          <Input type="date" value={to} onChange={e => setTo(e.target.value)} className="w-38 h-8 text-sm" data-testid="input-account-statement-to" />
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={!accountId} className="h-8" data-testid="button-account-statement-refresh">
          <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Refresh
        </Button>
        <div className="ml-auto flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleCSV} disabled={!!exporting || isLoading || !data} className="h-8" data-testid="button-account-statement-csv">
            <Download className="w-3.5 h-3.5 mr-1.5" />{exporting === "csv" ? "Exporting…" : "CSV"}
          </Button>
          <Button variant="outline" size="sm" onClick={handleExcel} disabled={!!exporting || !accountId} className="h-8" data-testid="button-account-statement-excel">
            <FileSpreadsheet className="w-3.5 h-3.5 mr-1.5" />{exporting === "excel" ? "Exporting…" : "Excel"}
          </Button>
          <Button variant="outline" size="sm" onClick={handlePDF} disabled={!!exporting || isLoading || !data} className="h-8" data-testid="button-account-statement-pdf">
            <FileText className="w-3.5 h-3.5 mr-1.5" />{exporting === "pdf" ? "Generating…" : "PDF"}
          </Button>
        </div>
      </div>

      {!accountId ? (
        <Card><CardContent className="py-16 text-center text-muted-foreground text-sm">Select an account to view its statement.</CardContent></Card>
      ) : (
        <>
          {/* Summary band */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "Opening Balance", value: data?.openingBalance ?? 0 },
              { label: "Total Receipts", value: data?.totalCredit ?? 0, color: "text-emerald-700 dark:text-emerald-400" },
              { label: "Total Payments", value: data?.totalDebit ?? 0, color: "text-red-600 dark:text-red-400" },
              { label: "Closing Balance", value: data?.closingBalance ?? 0, color: (data?.closingBalance ?? 0) >= 0 ? "text-blue-700 dark:text-blue-400" : "text-red-600 dark:text-red-400" },
            ].map(card => (
              <Card key={card.label} className="border-border/60">
                <CardContent className="p-3">
                  <p className="text-[11px] text-muted-foreground mb-1">{card.label}</p>
                  {isLoading ? <Skeleton className="h-5 w-24" /> : <p className={`text-sm font-bold font-mono ${card.color ?? "text-slate-800 dark:text-slate-200"}`}>{fmtCur(card.value)}</p>}
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Transactions */}
          <Card>
            <CardHeader className="pb-2 pt-4 px-4">
              <div className="flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-muted-foreground" />
                <CardTitle className="text-sm font-semibold">
                  {data ? `${data.accountName} — ${from} to ${to}` : "Account Statement"}
                  {data && <span className="ml-2 text-xs font-normal text-muted-foreground">({data.lines.length} transactions)</span>}
                </CardTitle>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b bg-muted/30">
                      <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Date</th>
                      <th className="text-left px-3 py-2.5 font-medium text-muted-foreground">Type</th>
                      <th className="text-left px-3 py-2.5 font-medium text-muted-foreground">Description</th>
                      <th className="text-left px-3 py-2.5 font-medium text-muted-foreground">Party</th>
                      <th className="text-left px-3 py-2.5 font-medium text-muted-foreground">Reference</th>
                      <th className="text-right px-3 py-2.5 font-medium text-muted-foreground">Debit (₹)</th>
                      <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Credit (₹)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {isLoading ? (
                      Array.from({ length: 5 }).map((_, i) => (
                        <tr key={i} className="border-b">
                          {[1, 2, 3, 4, 5, 6, 7].map(j => <td key={j} className="px-3 py-2.5"><Skeleton className="h-4 w-full" /></td>)}
                        </tr>
                      ))
                    ) : !data || data.lines.length === 0 ? (
                      <tr><td colSpan={7} className="text-center py-12 text-muted-foreground">No transactions in this period.</td></tr>
                    ) : (
                      data.lines.map((line, idx) => (
                        <tr key={idx} className="border-b hover:bg-muted/20 transition-colors" data-testid={`row-account-statement-${idx}`}>
                          <td className="px-4 py-2.5 font-mono text-muted-foreground">{line.txnDate}</td>
                          <td className="px-3 py-2.5">
                            <Badge className={`${TYPE_COLORS[line.type] ?? "bg-slate-100 text-slate-700"} border-0 text-[10px]`}>{line.type}</Badge>
                          </td>
                          <td className="px-3 py-2.5 max-w-[180px] truncate">{line.description}</td>
                          <td className="px-3 py-2.5 text-muted-foreground max-w-[140px] truncate">{line.party || "—"}</td>
                          <td className="px-3 py-2.5 text-muted-foreground font-mono">{line.reference || "—"}</td>
                          <td className="px-3 py-2.5 text-right font-mono text-red-600 dark:text-red-400">{line.debit > 0 ? fmtCur(line.debit) : "—"}</td>
                          <td className="px-4 py-2.5 text-right font-mono text-emerald-600 dark:text-emerald-400">{line.credit > 0 ? fmtCur(line.credit) : "—"}</td>
                        </tr>
                      ))
                    )}
                    {!isLoading && data && data.lines.length > 0 && (
                      <tr className="border-t-2 bg-blue-50/50 dark:bg-blue-950/10 font-semibold">
                        <td className="px-4 py-2.5" colSpan={5}>TOTAL</td>
                        <td className="px-3 py-2.5 text-right font-mono text-red-600 dark:text-red-400">{fmtCur(data.totalDebit)}</td>
                        <td className="px-4 py-2.5 text-right font-mono text-emerald-600 dark:text-emerald-400">{fmtCur(data.totalCredit)}</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
