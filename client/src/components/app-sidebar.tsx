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
  User,
  FileText,
  TrendingUp,
  MessageCircle,
  Megaphone,
  Tag,
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
  useSidebar,
} from "@/components/ui/sidebar";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";

type NavItem = { title: string; url: string; icon: React.ElementType };

const ALL_ITEMS: NavItem[] = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard },
  { title: "Products & Services", url: "/products", icon: Box },
  { title: "Leads", url: "/leads", icon: UserPlus },
  { title: "Sales", url: "/sales", icon: ShoppingCart },
  { title: "Pricing", url: "/pricing", icon: TrendingUp },
  { title: "Projects", url: "/projects", icon: FolderKanban },
  { title: "Inventory", url: "/inventory", icon: Package },
  { title: "Supply Chain", url: "/supply-chain", icon: Truck },
  { title: "Field Staff", url: "/field-staff", icon: MapPin },
  { title: "Sales Invoices", url: "/sales-invoices", icon: FileText },
  { title: "Accounts", url: "/accounts", icon: CreditCard },
  { title: "Employees", url: "/employees", icon: Users },
  { title: "WhatsApp Inbox", url: "/inbox", icon: MessageCircle },
  { title: "Campaigns", url: "/campaigns", icon: Megaphone },
  { title: "WA Templates", url: "/settings/whatsapp-templates", icon: Tag },
  { title: "Reports", url: "/reports", icon: BarChart3 },
  { title: "Audit Trail", url: "/audit-trail", icon: FileSearch },
];

const ROLE_NAV: Record<string, string[]> = {
  admin: ALL_ITEMS.map(i => i.url),
  hr_manager: ["/my-portal", "/employees", "/field-staff", "/reports", "/accounts"],
  field_staff: ["/my-portal", "/field-staff", "/inbox"],
  sales_manager: ["/my-portal", "/leads", "/sales", "/products", "/pricing", "/sales-invoices", "/inbox", "/campaigns", "/reports", "/accounts", "/inventory", "/supply-chain"],
  warehouse_manager: ["/my-portal", "/inventory", "/supply-chain", "/reports", "/accounts"],
  accountant: ["/my-portal", "/accounts", "/sales", "/sales-invoices", "/pricing", "/reports", "/supply-chain", "/inventory"],
};

const MY_PORTAL_ITEM: NavItem = { title: "My Portal", url: "/my-portal", icon: User };

export function getNavItemsForRole(role: string): NavItem[] {
  const allowedUrls = ROLE_NAV[role] || ROLE_NAV["admin"];
  if (role === "admin") return ALL_ITEMS;

  const items: NavItem[] = [MY_PORTAL_ITEM];
  for (const url of allowedUrls) {
    if (url === "/my-portal") continue;
    const found = ALL_ITEMS.find(i => i.url === url);
    if (found) items.push(found);
  }
  return items;
}

export function isRouteAllowedForRole(role: string, path: string): boolean {
  if (role === "admin") return true;
  if (path === "/my-portal") return true;
  if (path === "/login" || path === "/kiosk") return true;
  const allowed = ROLE_NAV[role] || [];
  return allowed.includes(path) || allowed.some(u => path.startsWith(u) && u !== "/");
}

const roleLabels: Record<string, string> = {
  admin: "Admin",
  hr_manager: "HR Manager",
  field_staff: "Field Staff",
  sales_manager: "Sales Manager",
  warehouse_manager: "Warehouse Mgr",
  accountant: "Accountant",
};

export function AppSidebar() {
  const [location] = useLocation();
  const user = getUser();
  const role = user?.role || "admin";
  const menuItems = getNavItemsForRole(role);
  const { isMobile, setOpenMobile } = useSidebar();

  const isActive = (url: string) => {
    if (url === "/") return location === "/";
    return location.startsWith(url);
  };

  const closeOnMobile = () => {
    if (isMobile) setOpenMobile(false);
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
                    onClick={closeOnMobile}
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
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 mt-0.5 border-sidebar-border text-sidebar-foreground/60 no-default-hover-elevate no-default-active-elevate">
              {roleLabels[role] || role}
            </Badge>
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
