import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Download, FileSpreadsheet, RefreshCw, CreditCard } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface ExpenseCategory { id: string; name: string; }
interface CashAccount { id: string; name: string; }
interface ExpenseReportRow {
  id: string; expenseDate: string; categoryName: string; description: string;
  vendorName: string | null; amount: number; paymentMethod: string;
  accountName: string | null; notes: string | null;
}
interface ExpenseByCategoryRow { categoryId: string | null; categoryName: string; total: number; count: number; }
interface ExpenseReportResult {
  period: { from: string | null; to: string | null };
  rows: ExpenseReportRow[];
  byCategory: ExpenseByCategoryRow[];
  grandTotal: number;
}

function fmtCur(v: number) { return "₹" + v.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function fmtShort(v: number) { if (v === 0) return "—"; return "₹" + v.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 0 }); }

const thisMonth = new Date();
const defaultFrom = `${thisMonth.getFullYear()}-${String(thisMonth.getMonth() + 1).padStart(2, "0")}-01`;
const defaultTo = new Date().toISOString().slice(0, 10);

export function ExpenseReport() {
  const { toast } = useToast();
  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(defaultTo);
  const [categoryFilter, setCategoryFilter] = useState("__all__");
  const [accountFilter, setAccountFilter] = useState("__all__");
  const [exporting, setExporting] = useState<"csv" | "excel" | null>(null);

  const { data: categories } = useQuery<ExpenseCategory[]>({ queryKey: ["/api/expense-categories"] });
  const { data: cashAccounts } = useQuery<CashAccount[]>({ queryKey: ["/api/cash-accounts"] });

  const { data, isLoading, refetch } = useQuery<ExpenseReportResult>({
    queryKey: ["/api/reports/expense-report", from, to, categoryFilter, accountFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      if (categoryFilter !== "__all__") params.set("categoryId", categoryFilter);
      if (accountFilter !== "__all__") params.set("accountId", accountFilter);
      const res = await apiRequest("GET", `/api/reports/expense-report?${params}`);
      return res.json();
    },
    staleTime: 60_000,
  });

  async function handleCSV() {
    setExporting("csv");
    try {
      const rows = data?.rows ?? [];
      const headers = ["Date", "Category", "Description", "Vendor", "Amount", "Payment Method", "Account", "Notes"];
      const csvRows = rows.map(r => [r.expenseDate, r.categoryName, r.description, r.vendorName ?? "", r.amount.toFixed(2), r.paymentMethod, r.accountName ?? "", r.notes ?? ""]);
      if (data) csvRows.push(["", "TOTAL", "", "", data.grandTotal.toFixed(2), "", "", ""]);
      const csv = [headers, ...csvRows].map(r => r.map(v => /[,"\r\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : v).join(",")).join("\r\n");
      const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = `Expense-Report-${from}-${to}.csv`; a.click();
      URL.revokeObjectURL(url);
    } finally { setExporting(null); }
  }

  async function handleExcel() {
    setExporting("excel");
    try {
      const params = new URLSearchParams();
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      if (categoryFilter !== "__all__") params.set("categoryId", categoryFilter);
      if (accountFilter !== "__all__") params.set("accountId", accountFilter);
      const res = await apiRequest("GET", `/api/reports/expense-report/excel?${params}`);
      if (!res.ok) throw new Error("Excel export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = `Expense-Report-${from}-${to}.xlsx`; a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast({ title: "Excel export failed", variant: "destructive" });
    } finally { setExporting(null); }
  }

  return (
    <div className="space-y-4" data-testid="panel-expense-report">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground font-medium">From</label>
          <Input type="date" value={from} onChange={e => setFrom(e.target.value)} className="w-40 h-8 text-sm" data-testid="input-expense-report-from" />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground font-medium">To</label>
          <Input type="date" value={to} onChange={e => setTo(e.target.value)} className="w-40 h-8 text-sm" data-testid="input-expense-report-to" />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground font-medium">Category</label>
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-44 h-8 text-sm" data-testid="select-expense-report-category">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All Categories</SelectItem>
              {(categories ?? []).map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground font-medium">Account</label>
          <Select value={accountFilter} onValueChange={setAccountFilter}>
            <SelectTrigger className="w-44 h-8 text-sm" data-testid="select-expense-report-account">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All Accounts</SelectItem>
              {(cashAccounts ?? []).map(a => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} className="h-8" data-testid="button-expense-report-refresh">
          <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Refresh
        </Button>
        <div className="ml-auto flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleCSV} disabled={!!exporting || isLoading} className="h-8" data-testid="button-expense-report-csv">
            <Download className="w-3.5 h-3.5 mr-1.5" />{exporting === "csv" ? "Exporting…" : "CSV"}
          </Button>
          <Button variant="outline" size="sm" onClick={handleExcel} disabled={!!exporting || isLoading} className="h-8" data-testid="button-expense-report-excel">
            <FileSpreadsheet className="w-3.5 h-3.5 mr-1.5" />{exporting === "excel" ? "Exporting…" : "Excel (2 sheets)"}
          </Button>
        </div>
      </div>

      {/* Grand total card */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {[
          { label: "Total Expenses", value: data?.grandTotal ?? 0, color: "text-red-600 dark:text-red-400" },
          { label: "Transactions", value: data?.rows.length ?? 0, isCnt: true, color: "text-slate-800 dark:text-slate-200" },
          { label: "Categories", value: data?.byCategory.length ?? 0, isCnt: true, color: "text-slate-800 dark:text-slate-200" },
        ].map(card => (
          <Card key={card.label} className="border-border/60">
            <CardContent className="p-3">
              <p className="text-[11px] text-muted-foreground mb-1">{card.label}</p>
              {isLoading ? <Skeleton className="h-5 w-20" /> : (
                <p className={`text-sm font-semibold font-mono ${card.color}`}>
                  {(card as any).isCnt ? card.value : fmtShort(card.value as number)}
                </p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs defaultValue="by-category">
        <TabsList className="mb-3">
          <TabsTrigger value="by-category" className="text-xs" data-testid="tab-expense-by-category">By Category</TabsTrigger>
          <TabsTrigger value="transactions" className="text-xs" data-testid="tab-expense-transactions">Transactions</TabsTrigger>
        </TabsList>

        <TabsContent value="by-category">
          <Card>
            <CardHeader className="pb-2 pt-4 px-4">
              <div className="flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-muted-foreground" />
                <CardTitle className="text-sm font-semibold">Expenses by Category</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b bg-muted/30">
                      <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Category</th>
                      <th className="text-center px-3 py-2.5 font-medium text-muted-foreground">Transactions</th>
                      <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Total (₹)</th>
                      <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">% of Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {isLoading ? Array.from({ length: 5 }).map((_, i) => (
                      <tr key={i} className="border-b">{[1,2,3,4].map(j => <td key={j} className="px-3 py-2.5"><Skeleton className="h-4 w-full" /></td>)}</tr>
                    )) : (data?.byCategory ?? []).length === 0 ? (
                      <tr><td colSpan={4} className="text-center py-12 text-muted-foreground">No expenses in this period.</td></tr>
                    ) : (
                      (data?.byCategory ?? []).map((cat, i) => {
                        const pct = data?.grandTotal ? (cat.total / data.grandTotal) * 100 : 0;
                        return (
                          <tr key={i} className="border-b hover:bg-muted/20 transition-colors" data-testid={`row-expense-category-${i}`}>
                            <td className="px-4 py-2.5 font-medium">{cat.categoryName}</td>
                            <td className="px-3 py-2.5 text-center text-muted-foreground">{cat.count}</td>
                            <td className="px-4 py-2.5 text-right font-mono font-semibold">{fmtCur(cat.total)}</td>
                            <td className="px-4 py-2.5 text-right text-muted-foreground">
                              <div className="flex items-center justify-end gap-2">
                                <div className="w-20 h-1.5 bg-muted rounded-full overflow-hidden">
                                  <div className="h-full bg-primary rounded-full" style={{ width: `${pct}%` }} />
                                </div>
                                {pct.toFixed(1)}%
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                    {!isLoading && (data?.byCategory ?? []).length > 0 && data && (
                      <tr className="border-t-2 bg-blue-50/50 dark:bg-blue-950/10 font-semibold">
                        <td className="px-4 py-2.5">TOTAL ({data.byCategory.length} categories)</td>
                        <td className="px-3 py-2.5 text-center">{data.rows.length}</td>
                        <td className="px-4 py-2.5 text-right font-mono">{fmtCur(data.grandTotal)}</td>
                        <td className="px-4 py-2.5 text-right">100%</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="transactions">
          <Card>
            <CardHeader className="pb-2 pt-4 px-4">
              <div className="flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-muted-foreground" />
                <CardTitle className="text-sm font-semibold">
                  All Transactions
                  {data && <span className="ml-2 text-xs font-normal text-muted-foreground">({data.rows.length} entries)</span>}
                </CardTitle>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b bg-muted/30">
                      <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Date</th>
                      <th className="text-left px-3 py-2.5 font-medium text-muted-foreground">Category</th>
                      <th className="text-left px-3 py-2.5 font-medium text-muted-foreground">Description</th>
                      <th className="text-left px-3 py-2.5 font-medium text-muted-foreground">Vendor</th>
                      <th className="text-right px-3 py-2.5 font-medium text-muted-foreground">Amount</th>
                      <th className="text-left px-3 py-2.5 font-medium text-muted-foreground">Method</th>
                      <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Account</th>
                    </tr>
                  </thead>
                  <tbody>
                    {isLoading ? Array.from({ length: 8 }).map((_, i) => (
                      <tr key={i} className="border-b">{[1,2,3,4,5,6,7].map(j => <td key={j} className="px-3 py-2.5"><Skeleton className="h-4 w-full" /></td>)}</tr>
                    )) : (data?.rows ?? []).length === 0 ? (
                      <tr><td colSpan={7} className="text-center py-12 text-muted-foreground">No expenses in this period.</td></tr>
                    ) : (
                      (data?.rows ?? []).map(row => (
                        <tr key={row.id} className="border-b hover:bg-muted/20 transition-colors" data-testid={`row-expense-txn-${row.id}`}>
                          <td className="px-4 py-2.5 text-muted-foreground">{row.expenseDate}</td>
                          <td className="px-3 py-2.5 text-muted-foreground">{row.categoryName}</td>
                          <td className="px-3 py-2.5 font-medium max-w-[180px] truncate" title={row.description}>{row.description}</td>
                          <td className="px-3 py-2.5 text-muted-foreground">{row.vendorName ?? "—"}</td>
                          <td className="px-3 py-2.5 text-right font-mono font-semibold text-red-600 dark:text-red-400">{fmtCur(row.amount)}</td>
                          <td className="px-3 py-2.5 text-muted-foreground capitalize">{row.paymentMethod.replace(/_/g, " ")}</td>
                          <td className="px-4 py-2.5 text-muted-foreground">{row.accountName ?? "—"}</td>
                        </tr>
                      ))
                    )}
                    {!isLoading && (data?.rows ?? []).length > 0 && data && (
                      <tr className="border-t-2 bg-blue-50/50 dark:bg-blue-950/10 font-semibold">
                        <td className="px-4 py-2.5" colSpan={4}>TOTAL ({data.rows.length} expenses)</td>
                        <td className="px-3 py-2.5 text-right font-mono">{fmtCur(data.grandTotal)}</td>
                        <td colSpan={2} />
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
