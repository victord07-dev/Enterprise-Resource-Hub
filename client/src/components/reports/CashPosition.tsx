import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Download, FileSpreadsheet, FileText, RefreshCw, Landmark } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface CashPositionAccount {
  accountId: string; accountName: string; accountType: string; balance: number;
}
interface CashPositionResult {
  asOf: string; accounts: CashPositionAccount[];
  totalBalance: number; totalBank: number; totalCash: number;
}

function fmtCur(v: number) {
  return "₹" + v.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function CashPosition() {
  const { toast } = useToast();
  const todayISO = new Date().toISOString().slice(0, 10);
  const [asOf, setAsOf] = useState(todayISO);
  const [exporting, setExporting] = useState<"csv" | "excel" | "pdf" | null>(null);

  const { data, isLoading, refetch } = useQuery<CashPositionResult>({
    queryKey: ["/api/reports/cash-position", asOf],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/reports/cash-position?asOf=${asOf}`);
      return res.json();
    },
    staleTime: 60_000,
  });

  async function handleCSV() {
    setExporting("csv");
    try {
      const accounts = data?.accounts ?? [];
      const headers = ["Account", "Type", "Balance"];
      const rows = accounts.map(a => [a.accountName, a.accountType, a.balance.toFixed(2)]);
      rows.push(["TOTAL", "", (data?.totalBalance ?? 0).toFixed(2)]);
      const csv = [headers, ...rows].map(r => r.map(v => /[,"\r\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : v).join(",")).join("\r\n");
      const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = `Cash-Position-${asOf}.csv`; a.click();
      URL.revokeObjectURL(url);
    } finally { setExporting(null); }
  }

  async function handleExcel() {
    setExporting("excel");
    try {
      const res = await apiRequest("GET", `/api/reports/cash-position/excel?asOf=${asOf}`);
      if (!res.ok) throw new Error("Excel export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = `Cash-Position-${asOf}.xlsx`; a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast({ title: "Excel export failed", variant: "destructive" });
    } finally { setExporting(null); }
  }

  async function handlePDF() {
    setExporting("pdf");
    try {
      const { generateCashPositionPDF } = await import("@/lib/reports-pdf");
      const blob = await generateCashPositionPDF(data?.accounts ?? [], data?.totalBalance ?? 0, data?.totalBank ?? 0, data?.totalCash ?? 0, asOf);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = `Cash-Position-${asOf}.pdf`; a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast({ title: "PDF export failed", description: String(e), variant: "destructive" });
    } finally { setExporting(null); }
  }

  const bankAccounts = (data?.accounts ?? []).filter(a => a.accountType === "bank");
  const cashAccounts = (data?.accounts ?? []).filter(a => a.accountType === "cash");

  return (
    <div className="space-y-4" data-testid="panel-cash-position">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground font-medium">As of Date</label>
          <Input type="date" value={asOf} onChange={e => setAsOf(e.target.value)} className="w-44 h-8 text-sm" data-testid="input-cash-position-asof" />
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} className="h-8" data-testid="button-cash-position-refresh">
          <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Refresh
        </Button>
        <div className="ml-auto flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleCSV} disabled={!!exporting || isLoading} className="h-8" data-testid="button-cash-position-csv">
            <Download className="w-3.5 h-3.5 mr-1.5" />{exporting === "csv" ? "Exporting…" : "CSV"}
          </Button>
          <Button variant="outline" size="sm" onClick={handleExcel} disabled={!!exporting || isLoading} className="h-8" data-testid="button-cash-position-excel">
            <FileSpreadsheet className="w-3.5 h-3.5 mr-1.5" />{exporting === "excel" ? "Exporting…" : "Excel"}
          </Button>
          <Button variant="outline" size="sm" onClick={handlePDF} disabled={!!exporting || isLoading} className="h-8" data-testid="button-cash-position-pdf">
            <FileText className="w-3.5 h-3.5 mr-1.5" />{exporting === "pdf" ? "Generating…" : "PDF"}
          </Button>
        </div>
      </div>

      {/* Summary tiles */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {[
          { label: "Total Cash & Bank", value: data?.totalBalance ?? 0, color: "text-slate-800 dark:text-slate-200", icon: "💰" },
          { label: "Bank Accounts", value: data?.totalBank ?? 0, color: "text-blue-700 dark:text-blue-400", icon: "🏦" },
          { label: "Cash in Hand", value: data?.totalCash ?? 0, color: "text-emerald-700 dark:text-emerald-400", icon: "💵" },
        ].map(card => (
          <Card key={card.label} className="border-border/60">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <span className="text-2xl">{card.icon}</span>
                <div>
                  <p className="text-xs text-muted-foreground">{card.label}</p>
                  {isLoading ? <Skeleton className="h-6 w-28 mt-1" /> : <p className={`text-lg font-bold font-mono ${card.color}`}>{fmtCur(card.value)}</p>}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Account tables */}
      {[{ label: "Bank Accounts", rows: bankAccounts, type: "bank" }, { label: "Cash in Hand", rows: cashAccounts, type: "cash" }].map(group => (
        <Card key={group.type}>
          <CardHeader className="pb-2 pt-4 px-4">
            <div className="flex items-center gap-2">
              <Landmark className="w-4 h-4 text-muted-foreground" />
              <CardTitle className="text-sm font-semibold">{group.label} — As of {asOf}</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Account</th>
                    <th className="text-center px-3 py-2.5 font-medium text-muted-foreground">Type</th>
                    <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Balance (₹)</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading ? (
                    Array.from({ length: 2 }).map((_, i) => (
                      <tr key={i} className="border-b">
                        {[1, 2, 3].map(j => <td key={j} className="px-3 py-2.5"><Skeleton className="h-4 w-full" /></td>)}
                      </tr>
                    ))
                  ) : group.rows.length === 0 ? (
                    <tr><td colSpan={3} className="text-center py-8 text-muted-foreground">No {group.label.toLowerCase()} configured.</td></tr>
                  ) : (
                    group.rows.map(acct => (
                      <tr key={acct.accountId} className="border-b hover:bg-muted/20 transition-colors" data-testid={`row-cash-position-${acct.accountId}`}>
                        <td className="px-4 py-2.5 font-medium">{acct.accountName}</td>
                        <td className="px-3 py-2.5 text-center">
                          <Badge variant="outline" className="text-[10px]">{acct.accountType === "bank" ? "Bank" : "Cash"}</Badge>
                        </td>
                        <td className={`px-4 py-2.5 text-right font-mono font-semibold ${acct.balance >= 0 ? "text-emerald-700 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
                          {fmtCur(acct.balance)}
                        </td>
                      </tr>
                    ))
                  )}
                  {!isLoading && group.rows.length > 0 && (
                    <tr className="border-t-2 bg-blue-50/50 dark:bg-blue-950/10 font-semibold">
                      <td className="px-4 py-2.5" colSpan={2}>Subtotal</td>
                      <td className="px-4 py-2.5 text-right font-mono">{fmtCur(group.rows.reduce((s, a) => s + a.balance, 0))}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
