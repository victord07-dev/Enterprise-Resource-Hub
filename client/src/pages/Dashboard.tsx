import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getUser, getToken } from "@/lib/auth";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  IndianRupee, ShoppingCart, FolderKanban, Users, RefreshCw, AlertTriangle,
  ArrowRight, CalendarClock, CheckCircle2, ExternalLink, Tv2,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import { useLocation } from "wouter";
import type { SalesOrder, AuditLog, PayrollStatus } from "@shared/schema";

import DateRangeFilter, { useDateRange } from "@/components/DateRangeFilter";
import MetricCardsRow, { type PeriodTotals } from "@/components/dashboard/MetricCardsRow";
import CashPositionStrip, { type AccountBalance } from "@/components/dashboard/CashPositionStrip";
import TopCustomersWidget, { type TopCustomer } from "@/components/dashboard/TopCustomersWidget";
import TopSuppliersWidget, { type TopSupplier } from "@/components/dashboard/TopSuppliersWidget";
import RecentActivityFeed, { type ActivityEvent } from "@/components/dashboard/RecentActivityFeed";
import PendingActionsWidget, { type PendingActions } from "@/components/dashboard/PendingActionsWidget";
import TodaySnapshotCards, { type TodaySnapshot } from "@/components/dashboard/TodaySnapshotCards";

const revenueData = [
  { day: "Mon", value: 2400 },
  { day: "Tue", value: 1398 },
  { day: "Wed", value: 3200 },
  { day: "Thu", value: 2780 },
  { day: "Fri", value: 1890 },
  { day: "Sat", value: 2390 },
  { day: "Sun", value: 3490 },
];

function getRelativeTime(timestamp: string | Date): string {
  const now = new Date();
  const date = new Date(timestamp);
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins} min ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? "s" : ""} ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays} day${diffDays > 1 ? "s" : ""} ago`;
}

const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

interface FinancialSnapshot {
  period: { from: string | null; to: string | null };
  periodTotals: PeriodTotals;
  cashPosition: AccountBalance[];
  topCustomers: TopCustomer[];
  topSuppliers: TopSupplier[];
  recentActivity: ActivityEvent[];
  pendingActions: PendingActions;
  todaySnapshot: TodaySnapshot;
}

const FINANCE_ROLES = ["admin", "accountant"] as const;

export default function Dashboard() {
  const user = getUser();
  const [, setLocation] = useLocation();
  const isFinanceUser = !!user && (FINANCE_ROLES as readonly string[]).includes(user.role);

  const dateRange = useDateRange("this_month");

  const today = new Date();
  const lastMonth = today.getMonth() === 0 ? 11 : today.getMonth() - 1;
  const lastMonthYear = today.getMonth() === 0 ? today.getFullYear() - 1 : today.getFullYear();

  const { data: payrollStatusData } = useQuery<PayrollStatus | null>({
    queryKey: ["/api/payroll-status", lastMonth, lastMonthYear],
  });

  const showPayrollAlert = today.getDate() >= 2 && payrollStatusData !== undefined && payrollStatusData !== null && payrollStatusData.status !== "disbursed";

  const { data: followupSummary } = useQuery<{ today: number; overdue: number; totalPending: number }>({
    queryKey: ["/api/followups/summary"],
  });

  const { data: todayFollowups, isLoading: followupsLoading } = useQuery<{ type: string; id: string; parentId: string; parentName: string; title: string; dueDate: string; priority: string; createdBy: string }[]>({
    queryKey: ["/api/followups/today"],
  });

  // Phase 4C — combined financial snapshot (admin/accountant only).
  // Refetches when date range changes (via query key) and every 60s while
  // mounted (for recent activity freshness). Also on window focus.
  const { data: snapshot, isLoading: snapshotLoading } = useQuery<FinancialSnapshot>({
    queryKey: ["/api/dashboard/snapshot", dateRange.fromIso ?? "", dateRange.toIso ?? ""],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (dateRange.fromIso) params.set("from", dateRange.fromIso);
      if (dateRange.toIso)   params.set("to",   dateRange.toIso);
      const url = `/api/dashboard/snapshot${params.toString() ? `?${params.toString()}` : ""}`;
      const res = await fetch(url, { credentials: "include", headers: authHeaders() });
      if (!res.ok) throw new Error("Failed to load snapshot");
      return res.json();
    },
    enabled: isFinanceUser,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });

  const { data: stats, isLoading } = useQuery<{
    totalRevenue: number;
    totalOrders: number;
    activeProjects: number;
    totalCustomers: number;
    totalStaff: number;
    pendingPayments: number;
    lowStockAlerts: number;
    recentOrders: SalesOrder[];
    recentActivities: AuditLog[];
  }>({
    queryKey: ["/api/dashboard/stats"],
  });

  // ── Countdown Display Settings ──────────────────────────────────────────
  interface MonthlyTargetData {
    month: string;
    salesTarget: string;
    salesAchieved: string;
    solarCustomersTarget: number;
    solarCustomersAchieved: number;
    updatedAt: string;
  }

  const { toast } = useToast();
  const qc = useQueryClient();
  const isCountdownManager = !!user && (user.role === "admin" || user.role === "sales_manager");

  const { data: ctdData } = useQuery<MonthlyTargetData>({
    queryKey: ["/api/monthly-targets/current"],
    enabled: isCountdownManager,
  });

  const [ctdForm, setCtdForm] = useState({
    salesTarget: "50000000",
    salesAchieved: "0",
    solarTarget: "35",
    solarAchieved: "0",
  });

  useEffect(() => {
    if (ctdData) {
      setCtdForm({
        salesTarget: ctdData.salesTarget,
        salesAchieved: ctdData.salesAchieved,
        solarTarget: String(ctdData.solarCustomersTarget),
        solarAchieved: String(ctdData.solarCustomersAchieved),
      });
    }
  }, [ctdData]);

  const ctdMutation = useMutation({
    mutationFn: async (payload: { salesTarget?: string; salesAchieved?: string; solarCustomersTarget?: number; solarCustomersAchieved?: number }) => {
      const token = getToken();
      const res = await fetch("/api/monthly-targets/current", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("Failed to save");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/monthly-targets/current"] });
      toast({ title: "Countdown updated", description: "Display will refresh within 5 minutes." });
    },
    onError: () => toast({ title: "Save failed", variant: "destructive" }),
  });

  const handleCtdSave = () => {
    ctdMutation.mutate({
      salesTarget: ctdForm.salesTarget,
      salesAchieved: ctdForm.salesAchieved,
      solarCustomersTarget: Number(ctdForm.solarTarget),
      solarCustomersAchieved: Number(ctdForm.solarAchieved),
    });
  };
  // ────────────────────────────────────────────────────────────────────────

  const metricCards = [
    {
      title: "Total Revenue",
      value: `₹${(stats?.totalRevenue ?? 0).toLocaleString()}`,
      subtitle: "Lifetime revenue",
      icon: IndianRupee,
      color: "text-green-500",
      bg: "bg-green-50 dark:bg-green-950/30",
    },
    {
      title: "Total Orders",
      value: stats?.totalOrders ?? 0,
      subtitle: "All sales orders",
      icon: ShoppingCart,
      color: "text-blue-500",
      bg: "bg-blue-50 dark:bg-blue-950/30",
    },
    {
      title: "Active Projects",
      value: stats?.activeProjects ?? 0,
      subtitle: "Projects in progress",
      icon: FolderKanban,
      color: "text-emerald-500",
      bg: "bg-emerald-50 dark:bg-emerald-950/30",
    },
    {
      title: "Total Customers",
      value: stats?.totalCustomers ?? 0,
      subtitle: "Registered customers",
      icon: Users,
      color: "text-violet-500",
      bg: "bg-violet-50 dark:bg-violet-950/30",
    },
  ];

  return (
    <div className="p-6 space-y-6 overflow-auto h-full">
      <div>
        <h1 className="text-2xl font-bold" data-testid="text-welcome">
          Welcome back, {user?.fullName || "Admin"}
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Here's what's happening in your business today.
        </p>
      </div>

      {showPayrollAlert && (
        <div className="flex items-center justify-between gap-4 flex-wrap p-4 rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800" data-testid="alert-payroll-pending">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-md flex items-center justify-center bg-amber-100 dark:bg-amber-900/50">
              <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <p className="font-semibold text-sm text-amber-900 dark:text-amber-200" data-testid="text-payroll-alert-title">
                Payroll Pending — {monthNames[lastMonth]} {lastMonthYear}
              </p>
              <p className="text-xs text-amber-700 dark:text-amber-400">
                {payrollStatusData?.totalAmount
                  ? `Total: \u20B9${Number(payrollStatusData.totalAmount).toLocaleString("en-IN")} pending disbursement`
                  : "Salary disbursement is pending for last month"}
              </p>
            </div>
          </div>
          <Button size="sm" variant="outline" className="border-amber-300 dark:border-amber-700" onClick={() => setLocation("/employees?tab=payroll")} data-testid="button-go-to-payroll">
            Go to Payroll <ArrowRight className="w-4 h-4 ml-1" />
          </Button>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {metricCards.map((card) => (
          <Card key={card.title} data-testid={`card-metric-${card.title.toLowerCase().replace(/\s+/g, "-")}`}>
            <CardContent className="p-5">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <p className="text-sm text-muted-foreground">{card.title}</p>
                <div className={`w-9 h-9 rounded-md flex items-center justify-center ${card.bg}`}>
                  <card.icon className={`w-4 h-4 ${card.color}`} />
                </div>
              </div>
              {isLoading ? (
                <Skeleton className="h-8 w-16 mt-2" />
              ) : (
                <p className="text-3xl font-bold mt-2" data-testid={`text-metric-${card.title.toLowerCase().replace(/\s+/g, "-")}`}>{card.value}</p>
              )}
              <p className="text-xs text-muted-foreground mt-1">{card.subtitle}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ────────── Phase 4C — Financial snapshot section (admin / accountant) ────────── */}
      {isFinanceUser && (
        <section className="space-y-4 pt-2 border-t" data-testid="section-financial-snapshot">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <h2 className="text-lg font-semibold">Financial Snapshot</h2>
              <p className="text-xs text-muted-foreground">
                Period totals, cash on hand, and pending actions across accounts.
              </p>
            </div>
            <DateRangeFilter
              value={{ from: dateRange.from, to: dateRange.to, presetKey: dateRange.presetKey }}
              onChange={dateRange.setRange}
              align="end"
            />
          </div>

          <TodaySnapshotCards data={snapshot?.todaySnapshot} isLoading={snapshotLoading} />

          <MetricCardsRow data={snapshot?.periodTotals} isLoading={snapshotLoading} />

          <CashPositionStrip data={snapshot?.cashPosition} isLoading={snapshotLoading} />

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <TopCustomersWidget data={snapshot?.topCustomers} isLoading={snapshotLoading} />
            <TopSuppliersWidget data={snapshot?.topSuppliers} isLoading={snapshotLoading} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <RecentActivityFeed data={snapshot?.recentActivity} isLoading={snapshotLoading} />
            <PendingActionsWidget data={snapshot?.pendingActions} isLoading={snapshotLoading} />
          </div>
        </section>
      )}

      {/* ────────── Existing widgets (all roles) ────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
            <CardTitle className="text-base font-semibold">Revenue Overview</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={revenueData}>
                  <defs>
                    <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(217, 91%, 60%)" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="hsl(217, 91%, 60%)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="day" className="text-xs" tick={{ fill: "hsl(215, 16%, 47%)" }} />
                  <YAxis className="text-xs" tick={{ fill: "hsl(215, 16%, 47%)" }} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(0, 0%, 100%)",
                      border: "1px solid hsl(214, 20%, 88%)",
                      borderRadius: "6px",
                      fontSize: "12px",
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="value"
                    stroke="hsl(217, 91%, 60%)"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#colorValue)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold">Audit Trail</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="flex items-start gap-3">
                    <Skeleton className="w-8 h-8 rounded-full flex-shrink-0" />
                    <div className="flex-1 space-y-1">
                      <Skeleton className="h-4 w-3/4" />
                      <Skeleton className="h-3 w-1/2" />
                    </div>
                  </div>
                ))
              ) : stats?.recentActivities && stats.recentActivities.length > 0 ? (
                stats.recentActivities.slice(0, 8).map((activity, idx) => (
                  <div key={activity.id || idx} className="flex items-start gap-3" data-testid={`activity-${activity.id || idx}`}>
                    <div className="w-8 h-8 rounded-full bg-blue-50 dark:bg-blue-950/30 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <RefreshCw className="w-3.5 h-3.5 text-blue-500" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">{activity.action}</p>
                      <p className="text-xs text-muted-foreground">
                        {activity.module} &middot; {getRelativeTime(activity.timestamp)}
                      </p>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground text-center py-4">No recent activity</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card data-testid="card-todays-followups">
        <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
          <div className="flex items-center gap-2">
            <CalendarClock className="w-4 h-4 text-amber-500" />
            <CardTitle className="text-base font-semibold">Today's Follow-ups</CardTitle>
          </div>
          {(followupSummary?.overdue ?? 0) > 0 && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400" data-testid="badge-overdue-count">
              <AlertTriangle className="w-3 h-3" />
              {followupSummary!.overdue} overdue
            </span>
          )}
        </CardHeader>
        <CardContent>
          {followupsLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3">
                  <Skeleton className="w-8 h-8 rounded-full flex-shrink-0" />
                  <div className="flex-1 space-y-1">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-3 w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          ) : todayFollowups && todayFollowups.length > 0 ? (
            <div className="space-y-3">
              {todayFollowups.map((f) => (
                <div
                  key={f.id}
                  className="flex items-center gap-3 p-2 rounded-md hover:bg-muted/50 cursor-pointer transition-colors"
                  data-testid={`followup-today-${f.id}`}
                  onClick={() => setLocation(f.type === "lead" ? "/leads" : "/sales")}
                >
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${f.type === "lead" ? "bg-purple-50 dark:bg-purple-950/30" : "bg-blue-50 dark:bg-blue-950/30"}`}>
                    {f.type === "lead" ? <Users className="w-3.5 h-3.5 text-purple-500" /> : <ShoppingCart className="w-3.5 h-3.5 text-blue-500" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{f.title}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      <span className={`inline-flex items-center px-1.5 py-0 rounded text-[10px] font-medium mr-1.5 ${f.type === "lead" ? "bg-purple-100 text-purple-700 dark:bg-purple-950/40 dark:text-purple-400" : "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400"}`}>
                        {f.type === "lead" ? "Lead" : "Quote"}
                      </span>
                      {f.parentName}
                    </p>
                  </div>
                  <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${f.priority === "high" ? "bg-red-500" : f.priority === "medium" ? "bg-amber-500" : "bg-green-500"}`} title={`${f.priority} priority`} />
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-6 text-center" data-testid="followups-empty">
              <CheckCircle2 className="w-10 h-10 text-green-400 mb-2" />
              <p className="text-sm font-medium text-muted-foreground">All clear for today!</p>
              <p className="text-xs text-muted-foreground mt-0.5">No follow-ups scheduled for today.</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Countdown Display Settings (admin / sales_manager only) ── */}
      {isCountdownManager && (
        <Card data-testid="card-countdown-settings">
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
            <div className="flex items-center gap-2">
              <Tv2 className="w-4 h-4 text-orange-500" />
              <CardTitle className="text-base font-semibold">Countdown Display Settings</CardTitle>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs gap-1"
              onClick={() => window.open("/countdown", "_blank")}
            >
              <ExternalLink className="w-3 h-3" />
              Open Display
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-xs text-muted-foreground -mt-1">
              Update the figures shown on the fullscreen TV countdown page (<code className="bg-muted px-1 rounded">/countdown</code>).
              {ctdData?.updatedAt && (
                <span className="ml-2 text-muted-foreground/70">
                  Last saved: {new Date(ctdData.updatedAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                </span>
              )}
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="ctd-sales-target" className="text-xs">Sales Target (₹)</Label>
                <Input
                  id="ctd-sales-target"
                  type="number"
                  min={0}
                  value={ctdForm.salesTarget}
                  onChange={e => setCtdForm(f => ({ ...f, salesTarget: e.target.value }))}
                  className="h-8 text-sm"
                  placeholder="50000000"
                />
                <p className="text-[10px] text-muted-foreground">
                  {Number(ctdForm.salesTarget) >= 1_00_00_000
                    ? `₹${(Number(ctdForm.salesTarget) / 1_00_00_000).toFixed(2)} Cr`
                    : Number(ctdForm.salesTarget) >= 1_00_000
                    ? `₹${(Number(ctdForm.salesTarget) / 1_00_000).toFixed(2)} L`
                    : ""}
                </p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="ctd-sales-achieved" className="text-xs">Sales Achieved (₹)</Label>
                <Input
                  id="ctd-sales-achieved"
                  type="number"
                  min={0}
                  value={ctdForm.salesAchieved}
                  onChange={e => setCtdForm(f => ({ ...f, salesAchieved: e.target.value }))}
                  className="h-8 text-sm"
                  placeholder="0"
                />
                <p className="text-[10px] text-muted-foreground">
                  {Number(ctdForm.salesTarget) > 0
                    ? `${Math.min(100, (Number(ctdForm.salesAchieved) / Number(ctdForm.salesTarget)) * 100).toFixed(1)}% of target`
                    : ""}
                </p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="ctd-solar-target" className="text-xs">Solar Customers Target</Label>
                <Input
                  id="ctd-solar-target"
                  type="number"
                  min={1}
                  value={ctdForm.solarTarget}
                  onChange={e => setCtdForm(f => ({ ...f, solarTarget: e.target.value }))}
                  className="h-8 text-sm"
                  placeholder="35"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="ctd-solar-achieved" className="text-xs">Solar Customers Achieved</Label>
                <Input
                  id="ctd-solar-achieved"
                  type="number"
                  min={0}
                  value={ctdForm.solarAchieved}
                  onChange={e => setCtdForm(f => ({ ...f, solarAchieved: e.target.value }))}
                  className="h-8 text-sm"
                  placeholder="0"
                />
                <p className="text-[10px] text-muted-foreground">
                  {Number(ctdForm.solarTarget) > 0
                    ? `${Number(ctdForm.solarAchieved)} / ${ctdForm.solarTarget} customers`
                    : ""}
                </p>
              </div>
            </div>

            <div className="flex justify-end">
              <Button
                size="sm"
                onClick={handleCtdSave}
                disabled={ctdMutation.isPending}
                className="h-8 text-sm px-4"
              >
                {ctdMutation.isPending ? "Saving…" : "Save & Publish"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// JWT auth header for fetch() calls (TanStack default fetcher already does this,
// but our custom queryFn needs it explicitly).
function authHeaders(): Record<string, string> {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}
