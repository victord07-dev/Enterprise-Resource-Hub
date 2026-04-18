import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Plus, Search, Pencil, Trash2, Filter, X, ArrowUpDown, Paperclip } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, LineChart, Line,
} from "recharts";
import ExpenseDialog from "@/components/ExpenseDialog";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { getUser } from "@/lib/auth";
import type { Expense, ExpenseCategory, User } from "@shared/schema";

const PAYMENT_METHODS = ["cash", "upi", "card", "bank_transfer", "cheque"] as const;
const PAYMENT_LABELS: Record<string, string> = {
  cash: "Cash", upi: "UPI", card: "Card", bank_transfer: "Bank Transfer", cheque: "Cheque",
};

interface SummaryResp {
  totalAmount: number;
  count: number;
  topCategory: { categoryId: string; categoryName: string; color: string; amount: number; count: number } | null;
  highestSingle: number;
  byCategory: Array<{ categoryId: string; categoryName: string; color: string; amount: number; count: number }>;
}

interface AnalyticsResp {
  byCategory: Array<{ categoryId: string; categoryName: string; color: string; amount: number; count: number }>;
  byPerson: Array<{ userId: string; userName: string; amount: number; count: number }>;
  dailyTrend: Array<{ date: string; amount: number; count: number }>;
  categoryShare: Array<{ categoryId: string; categoryName: string; color: string; share: number; amount: number }>;
}

function todayISO() { return new Date().toISOString().split("T")[0]; }
function daysAgoISO(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().split("T")[0];
}

type SortKey = "date" | "amount" | "category" | "paidBy" | "description";

export default function ExpensesTab() {
  const { toast } = useToast();
  const currentUser = getUser();
  const isAdmin = currentUser?.role === "admin";
  const isPrivileged = isAdmin || currentUser?.role === "accountant";

  const [location, setLocation] = useLocation();
  const initialParams = useMemo(() => new URLSearchParams(window.location.search), []);
  const [from, setFrom] = useState<string>(initialParams.get("from") ?? daysAgoISO(30));
  const [to, setTo] = useState<string>(initialParams.get("to") ?? todayISO());
  const [categoryIds, setCategoryIds] = useState<string[]>(initialParams.get("categoryId")?.split(",").filter(Boolean) ?? []);
  const [paidByIds, setPaidByIds] = useState<string[]>(initialParams.get("paidBy")?.split(",").filter(Boolean) ?? []);
  const [methods, setMethods] = useState<string[]>(initialParams.get("paymentMethod")?.split(",").filter(Boolean) ?? []);
  const [search, setSearch] = useState<string>(initialParams.get("search") ?? "");
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [subTab, setSubTab] = useState<string>(initialParams.get("sub") ?? "list");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  // Persist filter state in URL
  useEffect(() => {
    const params = new URLSearchParams();
    params.set("tab", "expenses");
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    if (categoryIds.length) params.set("categoryId", categoryIds.join(","));
    if (paidByIds.length) params.set("paidBy", paidByIds.join(","));
    if (methods.length) params.set("paymentMethod", methods.join(","));
    if (search.trim()) params.set("search", search.trim());
    if (subTab !== "list") params.set("sub", subTab);
    const next = `/accounts?${params.toString()}`;
    if (next !== location + window.location.search) {
      window.history.replaceState({}, "", next);
    }
  }, [from, to, categoryIds, paidByIds, methods, search, subTab, location]);

  const filterQS = useMemo(() => {
    const p = new URLSearchParams();
    if (from) p.set("from", from);
    if (to) p.set("to", to);
    if (categoryIds.length) p.set("categoryId", categoryIds.join(","));
    if (paidByIds.length) p.set("paidBy", paidByIds.join(","));
    if (methods.length) p.set("paymentMethod", methods.join(","));
    if (search.trim()) p.set("search", search.trim());
    return p.toString();
  }, [from, to, categoryIds, paidByIds, methods, search]);

  const { data: categories } = useQuery<ExpenseCategory[]>({ queryKey: ["/api/expense-categories", { includeInactive: true }], queryFn: async () => {
    const res = await fetch("/api/expense-categories?includeInactive=true", { credentials: "include" });
    if (!res.ok) throw new Error("Failed");
    return res.json();
  }});
  const { data: users } = useQuery<User[]>({ queryKey: ["/api/users"], enabled: isPrivileged });

  const { data: expenses, isLoading: listLoading } = useQuery<Expense[]>({
    queryKey: ["/api/expenses", filterQS],
    queryFn: async () => {
      const res = await fetch(`/api/expenses?${filterQS}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const { data: summary } = useQuery<SummaryResp>({
    queryKey: ["/api/expenses/summary", filterQS],
    queryFn: async () => {
      const res = await fetch(`/api/expenses/summary?${filterQS}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const { data: analytics } = useQuery<AnalyticsResp>({
    queryKey: ["/api/expenses/analytics", filterQS],
    queryFn: async () => {
      const res = await fetch(`/api/expenses/analytics?${filterQS}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: subTab === "analytics",
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("DELETE", `/api/expenses/${id}`);
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message || "Delete failed");
    },
    onSuccess: () => {
      toast({ title: "Expense deleted" });
      queryClient.invalidateQueries({ queryKey: ["/api/expenses"] });
      queryClient.invalidateQueries({ queryKey: ["/api/expenses/summary"] });
      queryClient.invalidateQueries({ queryKey: ["/api/expenses/analytics"] });
      setDeleteId(null);
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const catMap = useMemo(() => new Map((categories ?? []).map(c => [c.id, c])), [categories]);
  const userMap = useMemo(() => new Map((users ?? []).map(u => [u.id, u])), [users]);

  const sortedExpenses = useMemo(() => {
    const arr = [...(expenses ?? [])];
    arr.sort((a, b) => {
      let av: string | number = "", bv: string | number = "";
      switch (sortKey) {
        case "date": av = String(a.expenseDate); bv = String(b.expenseDate); break;
        case "amount": av = Number(a.amount); bv = Number(b.amount); break;
        case "category": av = catMap.get(a.categoryId)?.name ?? ""; bv = catMap.get(b.categoryId)?.name ?? ""; break;
        case "paidBy": av = userMap.get(a.paidByUserId)?.fullName ?? ""; bv = userMap.get(b.paidByUserId)?.fullName ?? ""; break;
        case "description": av = a.description; bv = b.description; break;
      }
      const cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return sortDir === "asc" ? cmp : -cmp;
    });
    return arr;
  }, [expenses, sortKey, sortDir, catMap, userMap]);

  const presetRange = (preset: string) => {
    if (preset === "today") { setFrom(todayISO()); setTo(todayISO()); }
    else if (preset === "7d") { setFrom(daysAgoISO(6)); setTo(todayISO()); }
    else if (preset === "30d") { setFrom(daysAgoISO(29)); setTo(todayISO()); }
    else if (preset === "mtd") { const d = new Date(); setFrom(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-01`); setTo(todayISO()); }
    else if (preset === "ytd") { const d = new Date(); setFrom(`${d.getFullYear()}-01-01`); setTo(todayISO()); }
  };

  const clearFilters = () => {
    setCategoryIds([]); setPaidByIds([]); setMethods([]); setSearch("");
    setFrom(daysAgoISO(30)); setTo(todayISO());
  };

  const toggleSort = (k: SortKey) => {
    if (sortKey === k) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else { setSortKey(k); setSortDir(k === "date" || k === "amount" ? "desc" : "asc"); }
  };

  const canEditRow = (e: Expense): boolean => {
    if (isPrivileged) return true;
    const isOwn = e.paidByUserId === currentUser?.id || e.createdByUserId === currentUser?.id;
    if (!isOwn) return false;
    const ageMs = Date.now() - new Date(e.createdAt).getTime();
    return ageMs <= 24 * 60 * 60 * 1000;
  };

  const activeFilterCount =
    (categoryIds.length ? 1 : 0) + (paidByIds.length ? 1 : 0) + (methods.length ? 1 : 0) + (search.trim() ? 1 : 0);

  return (
    <div className="space-y-4" data-testid="expenses-tab">
      <Tabs value={subTab} onValueChange={setSubTab} className="space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <TabsList>
            <TabsTrigger value="list" data-testid="subtab-list">List</TabsTrigger>
            <TabsTrigger value="analytics" data-testid="subtab-analytics">Analytics</TabsTrigger>
            {isAdmin && <TabsTrigger value="categories" data-testid="subtab-categories">Categories</TabsTrigger>}
          </TabsList>
          <Button onClick={() => { setEditingExpense(null); setDialogOpen(true); }} data-testid="button-new-expense">
            <Plus className="w-4 h-4 mr-1" /> Record Expense
          </Button>
        </div>

        <TabsContent value="list" className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <SummaryCard title="Total" value={`₹${(summary?.totalAmount ?? 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`} testid="card-total" />
            <SummaryCard title="Entries" value={String(summary?.count ?? 0)} testid="card-count" />
            <SummaryCard title="Top Category" value={summary?.topCategory ? `${summary.topCategory.categoryName} • ₹${summary.topCategory.amount.toLocaleString("en-IN")}` : "—"} testid="card-top-category" />
            <SummaryCard title="Highest Single" value={`₹${(summary?.highestSingle ?? 0).toLocaleString("en-IN")}`} testid="card-highest" />
          </div>

          <Card>
            <CardContent className="p-3 space-y-3">
              <div className="flex items-center gap-2 flex-wrap">
                <div className="flex items-center gap-1">
                  <Input type="date" value={from} onChange={e => setFrom(e.target.value)} className="w-[150px]" data-testid="input-filter-from" />
                  <span className="text-muted-foreground text-xs">to</span>
                  <Input type="date" value={to} onChange={e => setTo(e.target.value)} className="w-[150px]" data-testid="input-filter-to" />
                </div>
                <Select onValueChange={presetRange}>
                  <SelectTrigger className="w-[140px]" data-testid="select-preset"><SelectValue placeholder="Preset" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="today">Today</SelectItem>
                    <SelectItem value="7d">Last 7 days</SelectItem>
                    <SelectItem value="30d">Last 30 days</SelectItem>
                    <SelectItem value="mtd">Month to date</SelectItem>
                    <SelectItem value="ytd">Year to date</SelectItem>
                  </SelectContent>
                </Select>
                <MultiSelect
                  label="Category"
                  options={(categories ?? []).map(c => ({ value: c.id, label: c.name }))}
                  selected={categoryIds}
                  onChange={setCategoryIds}
                  testid="filter-category"
                />
                {isPrivileged && (
                  <MultiSelect
                    label="Paid By"
                    options={(users ?? []).map(u => ({ value: u.id, label: u.fullName }))}
                    selected={paidByIds}
                    onChange={setPaidByIds}
                    testid="filter-paid-by"
                  />
                )}
                <MultiSelect
                  label="Payment"
                  options={PAYMENT_METHODS.map(m => ({ value: m, label: PAYMENT_LABELS[m] }))}
                  selected={methods}
                  onChange={setMethods}
                  testid="filter-method"
                />
                <div className="relative">
                  <Search className="w-4 h-4 absolute left-2 top-2.5 text-muted-foreground" />
                  <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search..." className="pl-8 w-[200px]" data-testid="input-search" />
                </div>
                {activeFilterCount > 0 && (
                  <Button variant="ghost" size="sm" onClick={clearFilters} data-testid="button-clear-filters">
                    <X className="w-4 h-4 mr-1" /> Clear ({activeFilterCount})
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead><SortBtn k="date" current={sortKey} dir={sortDir} onClick={() => toggleSort("date")}>Date</SortBtn></TableHead>
                    <TableHead><SortBtn k="amount" current={sortKey} dir={sortDir} onClick={() => toggleSort("amount")}>Amount</SortBtn></TableHead>
                    <TableHead><SortBtn k="category" current={sortKey} dir={sortDir} onClick={() => toggleSort("category")}>Category</SortBtn></TableHead>
                    <TableHead><SortBtn k="paidBy" current={sortKey} dir={sortDir} onClick={() => toggleSort("paidBy")}>Paid By</SortBtn></TableHead>
                    <TableHead><SortBtn k="description" current={sortKey} dir={sortDir} onClick={() => toggleSort("description")}>Description</SortBtn></TableHead>
                    <TableHead>Linked</TableHead>
                    <TableHead className="w-10">Att.</TableHead>
                    <TableHead className="w-24 text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {listLoading ? (
                    <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">Loading...</TableCell></TableRow>
                  ) : sortedExpenses.length === 0 ? (
                    <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8" data-testid="text-empty">No expenses match the current filters.</TableCell></TableRow>
                  ) : sortedExpenses.map(e => {
                    const cat = catMap.get(e.categoryId);
                    const usr = userMap.get(e.paidByUserId);
                    return (
                      <TableRow key={e.id} data-testid={`row-expense-${e.id}`}>
                        <TableCell className="whitespace-nowrap">{String(e.expenseDate)}</TableCell>
                        <TableCell className="font-medium">₹{Number(e.amount).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</TableCell>
                        <TableCell>
                          {cat ? (
                            <span className="inline-flex items-center gap-1.5">
                              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: cat.color }} />
                              {cat.name}
                            </span>
                          ) : "—"}
                        </TableCell>
                        <TableCell>{usr?.fullName ?? (e.paidByUserId === currentUser?.id ? currentUser?.fullName : "—")}</TableCell>
                        <TableCell className="max-w-[260px] truncate" title={e.description}>{e.description}</TableCell>
                        <TableCell>
                          {e.linkedEntityType ? <Badge variant="outline" className="text-xs">{e.linkedEntityType.replace("_", " ")}</Badge> : "—"}
                        </TableCell>
                        <TableCell><AttachmentIndicator expenseId={e.id} /></TableCell>
                        <TableCell className="text-right">
                          <Button size="icon" variant="ghost" disabled={!canEditRow(e)} onClick={() => { setEditingExpense(e); setDialogOpen(true); }} data-testid={`button-edit-${e.id}`}>
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                          {isAdmin && (
                            <Button size="icon" variant="ghost" onClick={() => setDeleteId(e.id)} data-testid={`button-delete-${e.id}`}>
                              <Trash2 className="w-3.5 h-3.5 text-destructive" />
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="analytics" className="space-y-4">
          <AnalyticsView analytics={analytics} />
        </TabsContent>

        {isAdmin && (
          <TabsContent value="categories" className="space-y-4">
            <CategoriesPanel categories={categories ?? []} />
          </TabsContent>
        )}
      </Tabs>

      <ExpenseDialog open={dialogOpen} onOpenChange={(o) => { setDialogOpen(o); if (!o) setEditingExpense(null); }} expense={editingExpense} />

      <AlertDialog open={!!deleteId} onOpenChange={(o) => { if (!o) setDeleteId(null); }}>
        <AlertDialogContent data-testid="dialog-delete-expense">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this expense?</AlertDialogTitle>
            <AlertDialogDescription>This action cannot be undone. The audit trail will retain a deletion record.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteId && deleteMutation.mutate(deleteId)} data-testid="button-confirm-delete">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function SortBtn({ k, current, dir, onClick, children }: { k: SortKey; current: SortKey; dir: "asc" | "desc"; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="inline-flex items-center gap-1 hover-elevate active-elevate-2 px-1.5 py-0.5 -mx-1.5 rounded" data-testid={`sort-${k}`}>
      {children}
      <ArrowUpDown className={`w-3 h-3 ${current === k ? "opacity-100" : "opacity-30"}`} />
      {current === k && <span className="text-[10px]">{dir === "asc" ? "▲" : "▼"}</span>}
    </button>
  );
}

function SummaryCard({ title, value, testid }: { title: string; value: string; testid: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground">{title}</p>
        <p className="text-xl font-semibold mt-1" data-testid={testid}>{value}</p>
      </CardContent>
    </Card>
  );
}

function MultiSelect({ label, options, selected, onChange, testid }: { label: string; options: Array<{ value: string; label: string }>; selected: string[]; onChange: (v: string[]) => void; testid: string }) {
  const toggle = (v: string) => {
    if (selected.includes(v)) onChange(selected.filter(s => s !== v));
    else onChange([...selected, v]);
  };
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" data-testid={`button-${testid}`}>
          <Filter className="w-3.5 h-3.5 mr-1" /> {label}{selected.length > 0 ? ` (${selected.length})` : ""}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-2 max-h-[300px] overflow-y-auto">
        <div className="space-y-1">
          {options.length === 0 && <p className="text-xs text-muted-foreground p-2">No options</p>}
          {options.map(o => (
            <label key={o.value} className="flex items-center gap-2 cursor-pointer hover-elevate active-elevate-2 px-2 py-1 rounded" data-testid={`option-${testid}-${o.value}`}>
              <Checkbox checked={selected.includes(o.value)} onCheckedChange={() => toggle(o.value)} />
              <span className="text-sm truncate">{o.label}</span>
            </label>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function AttachmentIndicator({ expenseId }: { expenseId: string }) {
  const { data } = useQuery<Array<{ id: string }>>({
    queryKey: ["/api/attachments", "expense", expenseId],
    queryFn: async () => {
      const res = await fetch(`/api/attachments/expense/${expenseId}`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    staleTime: 60_000,
  });
  if (!data || data.length === 0) return <span className="text-muted-foreground/40">—</span>;
  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground" data-testid={`indicator-attachments-${expenseId}`}>
      <Paperclip className="w-3 h-3" />{data.length}
    </span>
  );
}

function AnalyticsView({ analytics }: { analytics: AnalyticsResp | undefined }) {
  const empty = !analytics || (analytics.byCategory.length === 0 && analytics.dailyTrend.length === 0);
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">By Category</CardTitle></CardHeader>
        <CardContent className="h-[280px]">
          {empty || analytics!.byCategory.length === 0 ? <EmptyChart /> : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={analytics!.byCategory} layout="vertical" margin={{ left: 80 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="categoryName" tick={{ fontSize: 11 }} width={120} />
                <Tooltip formatter={(v: number) => `₹${v.toLocaleString("en-IN")}`} />
                <Bar dataKey="amount">
                  {analytics!.byCategory.map((c, i) => <Cell key={i} fill={c.color} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">By Person</CardTitle></CardHeader>
        <CardContent className="h-[280px]">
          {empty || analytics!.byPerson.length === 0 ? <EmptyChart /> : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={analytics!.byPerson} layout="vertical" margin={{ left: 80 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="userName" tick={{ fontSize: 11 }} width={120} />
                <Tooltip formatter={(v: number) => `₹${v.toLocaleString("en-IN")}`} />
                <Bar dataKey="amount" fill="#3b82f6" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Daily Trend</CardTitle></CardHeader>
        <CardContent className="h-[280px]">
          {empty || analytics!.dailyTrend.length === 0 ? <EmptyChart /> : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={analytics!.dailyTrend}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v: number) => `₹${v.toLocaleString("en-IN")}`} />
                <Line type="monotone" dataKey="amount" stroke="#10b981" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Category Share</CardTitle></CardHeader>
        <CardContent className="h-[280px]">
          {empty || analytics!.categoryShare.length === 0 ? <EmptyChart /> : (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={analytics!.categoryShare} dataKey="amount" nameKey="categoryName" innerRadius={50} outerRadius={90} paddingAngle={2}>
                  {analytics!.categoryShare.map((c, i) => <Cell key={i} fill={c.color} />)}
                </Pie>
                <Tooltip formatter={(v: number) => `₹${(v as number).toLocaleString("en-IN")}`} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function EmptyChart() {
  return (
    <div className="h-full flex items-center justify-center text-sm text-muted-foreground" data-testid="text-empty-chart">
      No data for the current filters.
    </div>
  );
}

function CategoriesPanel({ categories }: { categories: ExpenseCategory[] }) {
  const { toast } = useToast();
  const [editing, setEditing] = useState<ExpenseCategory | null>(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [color, setColor] = useState("#94a3b8");
  const [icon, setIcon] = useState("Receipt");
  const [description, setDescription] = useState("");
  const [deactivating, setDeactivating] = useState<{ cat: ExpenseCategory; usage: number } | null>(null);

  const reset = () => { setEditing(null); setCreating(false); setName(""); setColor("#94a3b8"); setIcon("Receipt"); setDescription(""); };

  const startCreate = () => {
    reset();
    setCreating(true);
    const maxOrder = Math.max(0, ...categories.map(c => c.sortOrder));
    setName(""); setColor("#94a3b8"); setIcon("Receipt"); setDescription("");
    void maxOrder;
  };

  const startEdit = (c: ExpenseCategory) => {
    setEditing(c); setCreating(false);
    setName(c.name); setColor(c.color); setIcon(c.icon); setDescription(c.description ?? "");
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = { name: name.trim(), color, icon, description: description.trim() || null };
      if (editing) {
        const res = await apiRequest("PATCH", `/api/expense-categories/${editing.id}`, payload);
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message || "Failed");
      } else {
        const maxOrder = Math.max(0, ...categories.map(c => c.sortOrder));
        const res = await apiRequest("POST", "/api/expense-categories", { ...payload, sortOrder: maxOrder + 1, isActive: true });
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message || "Failed");
      }
    },
    onSuccess: () => {
      toast({ title: editing ? "Category updated" : "Category created" });
      queryClient.invalidateQueries({ queryKey: ["/api/expense-categories"] });
      reset();
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const checkDeactivate = async (c: ExpenseCategory) => {
    const res = await fetch(`/api/expenses?categoryId=${c.id}`, { credentials: "include" });
    const list = res.ok ? await res.json() as Expense[] : [];
    setDeactivating({ cat: c, usage: list.length });
  };

  const deactivateMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("PATCH", `/api/expense-categories/${id}/deactivate`);
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message || "Failed");
    },
    onSuccess: () => {
      toast({ title: "Category deactivated" });
      queryClient.invalidateQueries({ queryKey: ["/api/expense-categories"] });
      setDeactivating(null);
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const reactivateMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("PATCH", `/api/expense-categories/${id}`, { isActive: true });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message || "Failed");
    },
    onSuccess: () => {
      toast({ title: "Category reactivated" });
      queryClient.invalidateQueries({ queryKey: ["/api/expense-categories"] });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const sorted = [...categories].sort((a, b) => a.sortOrder - b.sortOrder);

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <Card className="md:col-span-2">
        <CardHeader className="flex-row items-center justify-between pb-2">
          <CardTitle className="text-base">Categories</CardTitle>
          <Button size="sm" onClick={startCreate} data-testid="button-new-category"><Plus className="w-4 h-4 mr-1" /> New</Button>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">#</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.map(c => (
                <TableRow key={c.id} data-testid={`row-category-${c.id}`}>
                  <TableCell className="text-muted-foreground">{c.sortOrder}</TableCell>
                  <TableCell>
                    <span className="inline-flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full" style={{ backgroundColor: c.color }} />
                      <span className="font-medium">{c.name}</span>
                    </span>
                    {c.description && <p className="text-xs text-muted-foreground mt-0.5">{c.description}</p>}
                  </TableCell>
                  <TableCell>
                    {c.isActive ? <Badge variant="outline" className="text-green-700 border-green-300">Active</Badge> : <Badge variant="outline" className="text-muted-foreground">Inactive</Badge>}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="ghost" onClick={() => startEdit(c)} data-testid={`button-edit-category-${c.id}`}>Rename</Button>
                    {c.isActive ? (
                      <Button size="sm" variant="ghost" onClick={() => checkDeactivate(c)} data-testid={`button-deactivate-${c.id}`}>Deactivate</Button>
                    ) : (
                      <Button size="sm" variant="ghost" onClick={() => reactivateMutation.mutate(c.id)} data-testid={`button-reactivate-${c.id}`}>Reactivate</Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {(editing || creating) && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">{editing ? "Edit category" : "New category"}</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div>
              <label className="text-xs text-muted-foreground">Name</label>
              <Input value={name} onChange={e => setName(e.target.value)} data-testid="input-category-name" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Description</label>
              <Input value={description} onChange={e => setDescription(e.target.value)} data-testid="input-category-description" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-muted-foreground">Color</label>
                <Input type="color" value={color} onChange={e => setColor(e.target.value)} className="h-9 p-1" data-testid="input-category-color" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Icon</label>
                <Input value={icon} onChange={e => setIcon(e.target.value)} placeholder="Receipt" data-testid="input-category-icon" />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" size="sm" onClick={reset} data-testid="button-cancel-category">Cancel</Button>
              <Button size="sm" disabled={!name.trim() || saveMutation.isPending} onClick={() => saveMutation.mutate()} data-testid="button-save-category">
                {saveMutation.isPending ? "Saving..." : (editing ? "Save changes" : "Create")}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <AlertDialog open={!!deactivating} onOpenChange={(o) => { if (!o) setDeactivating(null); }}>
        <AlertDialogContent data-testid="dialog-deactivate-category">
          <AlertDialogHeader>
            <AlertDialogTitle>Deactivate "{deactivating?.cat.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              {deactivating && deactivating.usage > 0
                ? `This category has ${deactivating.usage} expense${deactivating.usage === 1 ? "" : "s"} against it. Deactivate anyway? Existing entries will keep this category name.`
                : "It will be hidden from new expense entries. Existing entries keep this category name."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-deactivate">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => deactivating && deactivateMutation.mutate(deactivating.cat.id)} data-testid="button-confirm-deactivate">Deactivate</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
