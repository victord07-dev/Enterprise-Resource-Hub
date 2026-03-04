import { useLocation, Link } from "wouter";
import { getUser, logout } from "@/lib/auth";
import {
  LayoutDashboard,
  ShoppingCart,
  FolderKanban,
  Package,
  Truck,
  MapPin,
  CreditCard,
  Users,
  BarChart3,
  FileSearch,
  LogOut,
  UserPlus,
  Box,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarFooter,
  SidebarHeader,
} from "@/components/ui/sidebar";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Shield } from "lucide-react";

const menuItems = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard },
  { title: "Products & Services", url: "/products", icon: Box },
  { title: "Leads", url: "/leads", icon: UserPlus },
  { title: "Sales", url: "/sales", icon: ShoppingCart },
  { title: "Projects", url: "/projects", icon: FolderKanban },
  { title: "Inventory", url: "/inventory", icon: Package },
  { title: "Supply Chain", url: "/supply-chain", icon: Truck },
  { title: "Field Staff", url: "/field-staff", icon: MapPin },
  { title: "Accounts", url: "/accounts", icon: CreditCard },
  { title: "Employees", url: "/employees", icon: Users },
  { title: "Reports", url: "/reports", icon: BarChart3 },
  { title: "Audit Trail", url: "/audit-trail", icon: FileSearch },
];

export function AppSidebar() {
  const [location] = useLocation();
  const user = getUser();

  const isActive = (url: string) => {
    if (url === "/") return location === "/";
    return location.startsWith(url);
  };

  return (
    <Sidebar>
      <SidebarHeader className="p-4 pb-2">
        <div className="flex items-center gap-3">
          <img src="/favicon.png" alt="ITFI Group" className="w-9 h-9 rounded-md object-contain" />
          <div>
            <h2 className="text-sm font-bold text-sidebar-foreground" data-testid="text-sidebar-brand">ITFI Group</h2>
            <p className="text-xs text-sidebar-foreground/60">Enterprise Solution</p>
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent className="px-2">
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {menuItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    asChild
                    isActive={isActive(item.url)}
                    data-testid={`nav-${item.title.toLowerCase().replace(/\s+/g, "-")}`}
                  >
                    <Link href={item.url}>
                      <item.icon className="w-4 h-4" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="p-3">
        <div className="flex items-center gap-3 px-2 mb-2">
          <Avatar className="w-8 h-8">
            <AvatarFallback className="bg-sidebar-accent text-sidebar-accent-foreground text-xs">
              {user?.fullName?.charAt(0)?.toUpperCase() || "A"}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-sidebar-foreground truncate" data-testid="text-user-name">
              {user?.fullName || "Admin"}
            </p>
            <p className="text-xs text-sidebar-foreground/60 truncate" data-testid="text-user-email">
              {user?.email || "admin@itfi.co.in"}
            </p>
          </div>
        </div>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={logout} data-testid="button-logout">
              <LogOut className="w-4 h-4" />
              <span>Sign Out</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
