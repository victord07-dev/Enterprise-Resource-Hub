import type { CSSProperties } from "react";
import { Switch, Route, useLocation, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar, isRouteAllowedForRole } from "@/components/app-sidebar";
import { isAuthenticated, getUser } from "@/lib/auth";
import NotFound from "@/pages/not-found";
import Login from "@/pages/Login";
import Dashboard from "@/pages/Dashboard";
import Sales from "@/pages/Sales";
import Projects from "@/pages/Projects";
import Inventory from "@/pages/Inventory";
import SupplyChain from "@/pages/SupplyChain";
import Accounts from "@/pages/Accounts";
import Employees from "@/pages/Employees";
import FieldStaff from "@/pages/FieldStaff";
import Reports from "@/pages/Reports";
import AuditTrail from "@/pages/AuditTrail";
import Kiosk from "@/pages/Kiosk";
import Leads from "@/pages/Leads";
import Products from "@/pages/Products";
import MyPortal from "@/pages/MyPortal";

function ProtectedRoute({ component: Component, path }: { component: React.ComponentType; path: string }) {
  const user = getUser();
  const role = user?.role || "admin";
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
      <Route path="/accounts" component={() => <ProtectedRoute component={Accounts} path="/accounts" />} />
      <Route path="/employees" component={() => <ProtectedRoute component={Employees} path="/employees" />} />
      <Route path="/field-staff" component={() => <ProtectedRoute component={FieldStaff} path="/field-staff" />} />
      <Route path="/reports" component={() => <ProtectedRoute component={Reports} path="/reports" />} />
      <Route path="/audit-trail" component={() => <ProtectedRoute component={AuditTrail} path="/audit-trail" />} />
      <Route component={NotFound} />
    </Switch>
  );
}

function AuthenticatedLayout() {
  const [location] = useLocation();
  const user = getUser();
  const role = user?.role || "admin";

  const style = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "3.5rem",
  };

  if (location === "/" && role !== "admin") {
    return <Redirect to="/my-portal" />;
  }

  return (
    <SidebarProvider style={style as CSSProperties}>
      <div className="flex h-screen w-full">
        <AppSidebar />
        <div className="flex flex-col flex-1 min-w-0">
          <header className="flex items-center gap-2 p-2 border-b h-12 flex-shrink-0">
            <SidebarTrigger data-testid="button-sidebar-toggle" />
          </header>
          <main className="flex-1 overflow-hidden">
            <Router />
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}

function App() {
  const [location] = useLocation();
  const authenticated = isAuthenticated();

  if (location === "/kiosk") {
    return (
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <Toaster />
          <Kiosk />
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
