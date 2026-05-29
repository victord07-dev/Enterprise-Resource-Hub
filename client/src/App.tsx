import type { CSSProperties } from "react";
import { useState, lazy, Suspense } from "react";
import { Switch, Route, useLocation, Redirect } from "wouter";
import { queryClient, apiRequest } from "./lib/queryClient";
import { QueryClientProvider, useQuery, useMutation } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar, isRouteAllowedForRole } from "@/components/app-sidebar";
import { isAuthenticated, getUser } from "@/lib/auth";
import { useInactivityLogout } from "@/hooks/use-inactivity-logout";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Bell, CheckCheck } from "lucide-react";
import { NotificationContext } from "@/lib/notification-context";
import type { Notification } from "@shared/schema";
import NotFound from "@/pages/not-found";
import Login from "@/pages/Login";
import { PageLoader } from "@/components/PageLoader";

// Route-level code splitting — every non-auth page is lazy-loaded so the
// initial bundle stays small. Login + NotFound stay eager (no Suspense
// boundary covers them) so the auth screen and 404 fallback are instant.
const Dashboard = lazy(() => import("@/pages/Dashboard"));
const Sales = lazy(() => import("@/pages/Sales"));
const Projects = lazy(() => import("@/pages/Projects"));
const Inventory = lazy(() => import("@/pages/Inventory"));
const SupplyChain = lazy(() => import("@/pages/SupplyChain"));
const Accounts = lazy(() => import("@/pages/Accounts"));
const Employees = lazy(() => import("@/pages/Employees"));
const FieldStaff = lazy(() => import("@/pages/FieldStaff"));
const Reports = lazy(() => import("@/pages/Reports"));
const AuditTrail = lazy(() => import("@/pages/AuditTrail"));
const Kiosk = lazy(() => import("@/pages/Kiosk"));
const Leads = lazy(() => import("@/pages/Leads"));
const Products = lazy(() => import("@/pages/Products"));
const MyPortal = lazy(() => import("@/pages/MyPortal"));
const SalesInvoices = lazy(() => import("@/pages/SalesInvoices"));
const Pricing = lazy(() => import("@/pages/Pricing"));
const Inbox = lazy(() => import("@/pages/Inbox"));
const Campaigns = lazy(() => import("@/pages/Campaigns"));
const WhatsAppTemplates = lazy(() => import("@/pages/WhatsAppTemplates"));
const CashAccountDetail = lazy(() => import("@/pages/CashAccountDetail"));
const Countdown = lazy(() => import("@/pages/Countdown"));

interface NotificationBellProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function NotificationBell({ open, onOpenChange }: NotificationBellProps) {
  const { data: notifications = [] } = useQuery<Notification[]>({
    queryKey: ["/api/notifications"],
    refetchInterval: 60000,
  });

  const unreadCount = notifications.filter(n => !n.isRead).length;

  const markReadMutation = useMutation({
    mutationFn: (id: string) => apiRequest("PATCH", `/api/notifications/${id}/read`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/notifications"] }),
  });

  const markAllReadMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/notifications/read-all"),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/notifications"] }),
  });

  const typeIcon: Record<string, string> = {
    expense_approved: "✅",
    expense_rejected: "❌",
    payroll_disbursed: "💰",
    pricing: "📊",
    leave_approved: "✅",
    leave_rejected: "❌",
  };

  const handleNotificationClick = (n: Notification) => {
    if (!n.isRead) markReadMutation.mutate(n.id);
    if (n.type === "pricing" && n.relatedId) {
      onOpenChange(false);
      window.history.pushState({}, "", `/pricing?sheet=${n.relatedId}`);
      window.dispatchEvent(new PopStateEvent("popstate"));
    } else if (n.type === "challan" && n.relatedId) {
      onOpenChange(false);
      window.history.pushState({}, "", `/inventory?tab=challans&challanId=${n.relatedId}`);
      window.dispatchEvent(new PopStateEvent("popstate"));
    } else if (n.type === "grn" && n.relatedId) {
      onOpenChange(false);
      window.history.pushState({}, "", `/inventory?tab=grn&highlightGrn=${n.relatedId}`);
      window.dispatchEvent(new PopStateEvent("popstate"));
    }
  };

  function timeAgo(dateStr: string) {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "Just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  }

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative h-8 w-8"
          data-testid="button-notification-bell"
        >
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <span
              data-testid="badge-notification-count"
              className="absolute -top-0.5 -right-0.5 bg-red-500 text-white text-[10px] font-bold rounded-full h-4 w-4 flex items-center justify-center"
            >
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0" data-testid="popover-notifications">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <span className="font-semibold text-sm">Notifications</span>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs gap-1"
              data-testid="button-mark-all-read"
              onClick={() => markAllReadMutation.mutate()}
              disabled={markAllReadMutation.isPending}
            >
              <CheckCheck className="h-3 w-3" />
              Mark all read
            </Button>
          )}
        </div>
        <ScrollArea className="h-[340px]">
          {notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-24 text-sm text-muted-foreground gap-1">
              <Bell className="h-5 w-5 opacity-40" />
              <span>No notifications</span>
            </div>
          ) : (
            <div className="divide-y">
              {notifications.map(n => (
                <div
                  key={n.id}
                  data-testid={`notification-item-${n.id}`}
                  className={`px-4 py-3 flex gap-3 cursor-pointer hover:bg-muted/50 transition-colors ${!n.isRead ? "bg-blue-50/60 dark:bg-blue-950/20" : ""}`}
                  onClick={() => handleNotificationClick(n)}
                >
                  <span className="text-base mt-0.5 shrink-0">{typeIcon[n.type] ?? "🔔"}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-1">
                      <p className={`text-sm font-medium leading-tight ${!n.isRead ? "text-foreground" : "text-muted-foreground"}`}>
                        {n.title}
                      </p>
                      {!n.isRead && <span className="shrink-0 h-2 w-2 rounded-full bg-blue-500 mt-1.5" />}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 leading-snug">{n.message}</p>
                    <p className="text-[10px] text-muted-foreground/70 mt-1">{timeAgo(String(n.createdAt))}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}

function ProtectedRoute({ component: Component, path }: { component: React.ComponentType; path: string }) {
  const user = getUser();
  const role = user?.role || "admin";
  if (role === "kiosk") return <Redirect to="/kiosk" />;
  if (!isRouteAllowedForRole(role, path)) {
    return <Redirect to="/my-portal?denied=1" />;
  }
  return <Component />;
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={() => <ProtectedRoute component={Dashboard} path="/" />} />
      <Route path="/my-portal" component={MyPortal} />
      <Route path="/products" component={() => <ProtectedRoute component={Products} path="/products" />} />
      <Route path="/leads" component={() => <ProtectedRoute component={Leads} path="/leads" />} />
      <Route path="/sales" component={() => <ProtectedRoute component={Sales} path="/sales" />} />
      <Route path="/projects" component={() => <ProtectedRoute component={Projects} path="/projects" />} />
      <Route path="/inventory" component={() => <ProtectedRoute component={Inventory} path="/inventory" />} />
      <Route path="/supply-chain" component={() => <ProtectedRoute component={SupplyChain} path="/supply-chain" />} />
      <Route path="/accounts/cash-accounts/:id" component={() => <ProtectedRoute component={CashAccountDetail} path="/accounts/cash-accounts/:id" />} />
      <Route path="/accounts" component={() => <ProtectedRoute component={Accounts} path="/accounts" />} />
      <Route path="/employees" component={() => <ProtectedRoute component={Employees} path="/employees" />} />
      <Route path="/field-staff" component={() => <ProtectedRoute component={FieldStaff} path="/field-staff" />} />
      <Route path="/reports" component={() => <ProtectedRoute component={Reports} path="/reports" />} />
      <Route path="/audit-trail" component={() => <ProtectedRoute component={AuditTrail} path="/audit-trail" />} />
      <Route path="/sales-invoices" component={() => <ProtectedRoute component={SalesInvoices} path="/sales-invoices" />} />
      <Route path="/pricing" component={() => <ProtectedRoute component={Pricing} path="/pricing" />} />
      <Route path="/inbox" component={() => <ProtectedRoute component={Inbox} path="/inbox" />} />
      <Route path="/campaigns" component={() => <ProtectedRoute component={Campaigns} path="/campaigns" />} />
      <Route path="/whatsapp-templates" component={() => <ProtectedRoute component={WhatsAppTemplates} path="/whatsapp-templates" />} />
      <Route path="/settings/whatsapp-templates" component={() => <ProtectedRoute component={WhatsAppTemplates} path="/settings/whatsapp-templates" />} />
      <Route component={NotFound} />
    </Switch>
  );
}

function AuthenticatedLayout() {
  const [location] = useLocation();
  const user = getUser();
  const role = user?.role || "admin";
  const [bellOpen, setBellOpen] = useState(false);

  const style = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "3.5rem",
  };

  if (role === "kiosk") {
    return <Redirect to="/kiosk" />;
  }

  if (location === "/" && role !== "admin") {
    return <Redirect to="/my-portal" />;
  }

  return (
    <NotificationContext.Provider value={{ openBell: () => setBellOpen(true) }}>
      <SidebarProvider style={style as CSSProperties}>
        <div className="flex h-screen w-full">
          <AppSidebar />
          <div className="flex flex-col flex-1 min-w-0">
            <header className="flex items-center gap-2 p-2 border-b h-12 flex-shrink-0">
              <SidebarTrigger
                data-testid="button-sidebar-toggle"
                className="h-10 w-10 [&>svg]:w-5 [&>svg]:h-5 sm:h-7 sm:w-7 sm:[&>svg]:w-4 sm:[&>svg]:h-4"
              />
              <div className="flex-1" />
              <NotificationBell open={bellOpen} onOpenChange={setBellOpen} />
            </header>
            <main className="flex-1 overflow-hidden">
              <Suspense fallback={<PageLoader />}>
                <Router />
              </Suspense>
            </main>
          </div>
        </div>
      </SidebarProvider>
    </NotificationContext.Provider>
  );
}

function App() {
  const [location] = useLocation();
  const authenticated = isAuthenticated();

  // Auto-logout after 30 minutes of inactivity
  useInactivityLogout();

  if (location === "/countdown") {
    return (
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <Toaster />
          <Suspense fallback={<PageLoader />}>
            <Countdown />
          </Suspense>
        </TooltipProvider>
      </QueryClientProvider>
    );
  }

  if (location === "/kiosk") {
    return (
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <Toaster />
          <Suspense fallback={<PageLoader />}>
            <Kiosk />
          </Suspense>
        </TooltipProvider>
      </QueryClientProvider>
    );
  }

  if (location === "/login" || !authenticated) {
    return (
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <Toaster />
          <Login />
        </TooltipProvider>
      </QueryClientProvider>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <AuthenticatedLayout />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
