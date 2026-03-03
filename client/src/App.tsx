import type { CSSProperties } from "react";
import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { isAuthenticated } from "@/lib/auth";
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

function Router() {
  return (
    <Switch>
      <Route path="/" component={Dashboard} />
      <Route path="/leads" component={Leads} />
      <Route path="/sales" component={Sales} />
      <Route path="/projects" component={Projects} />
      <Route path="/inventory" component={Inventory} />
      <Route path="/supply-chain" component={SupplyChain} />
      <Route path="/accounts" component={Accounts} />
      <Route path="/employees" component={Employees} />
      <Route path="/field-staff" component={FieldStaff} />
      <Route path="/reports" component={Reports} />
      <Route path="/audit-trail" component={AuditTrail} />
      <Route component={NotFound} />
    </Switch>
  );
}

function AuthenticatedLayout() {
  const style = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "3.5rem",
  };

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
