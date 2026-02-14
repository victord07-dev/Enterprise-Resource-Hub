import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useQuery } from "@tanstack/react-query";
import { Search, FileSearch, Shield, Clock, User } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { AuditLog } from "@shared/schema";

function ModuleBadge({ module }: { module: string }) {
  const colors: Record<string, string> = {
    sales: "bg-blue-100 text-blue-800 dark:bg-blue-950/40 dark:text-blue-400",
    inventory: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-400",
    accounts: "bg-violet-100 text-violet-800 dark:bg-violet-950/40 dark:text-violet-400",
    employees: "bg-orange-100 text-orange-800 dark:bg-orange-950/40 dark:text-orange-400",
    projects: "bg-pink-100 text-pink-800 dark:bg-pink-950/40 dark:text-pink-400",
    supply_chain: "bg-indigo-100 text-indigo-800 dark:bg-indigo-950/40 dark:text-indigo-400",
    auth: "bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-400",
    system: "bg-gray-100 text-gray-800 dark:bg-gray-950/40 dark:text-gray-400",
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium ${colors[module] || colors.system}`}>
      {module.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())}
    </span>
  );
}

export default function AuditTrail() {
  const { data: logs, isLoading } = useQuery<AuditLog[]>({ queryKey: ["/api/audit-logs"] });

  return (
    <div className="p-6 space-y-6 overflow-auto h-full">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Audit Trail</h1>
          <p className="text-muted-foreground text-sm mt-1">Track all system activities and changes</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-5 flex items-center gap-4">
            <div className="w-10 h-10 rounded-md bg-blue-50 dark:bg-blue-950/30 flex items-center justify-center">
              <FileSearch className="w-5 h-5 text-blue-500" />
            </div>
            <div>
              <p className="text-2xl font-bold">{logs?.length ?? 0}</p>
              <p className="text-xs text-muted-foreground">Total Log Entries</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5 flex items-center gap-4">
            <div className="w-10 h-10 rounded-md bg-emerald-50 dark:bg-emerald-950/30 flex items-center justify-center">
              <Shield className="w-5 h-5 text-emerald-500" />
            </div>
            <div>
              <p className="text-2xl font-bold">{logs?.filter((l) => l.module === "auth").length ?? 0}</p>
              <p className="text-xs text-muted-foreground">Auth Events</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5 flex items-center gap-4">
            <div className="w-10 h-10 rounded-md bg-violet-50 dark:bg-violet-950/30 flex items-center justify-center">
              <Clock className="w-5 h-5 text-violet-500" />
            </div>
            <div>
              <p className="text-2xl font-bold">
                {logs && logs.length > 0
                  ? new Date(logs[0].timestamp).toLocaleDateString()
                  : "—"}
              </p>
              <p className="text-xs text-muted-foreground">Latest Activity</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search audit logs..." className="pl-9" data-testid="input-search-logs" />
        </div>
        <Select>
          <SelectTrigger className="w-40" data-testid="select-module-filter">
            <SelectValue placeholder="All Modules" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Modules</SelectItem>
            <SelectItem value="auth">Authentication</SelectItem>
            <SelectItem value="sales">Sales</SelectItem>
            <SelectItem value="inventory">Inventory</SelectItem>
            <SelectItem value="accounts">Accounts</SelectItem>
            <SelectItem value="employees">Employees</SelectItem>
            <SelectItem value="projects">Projects</SelectItem>
            <SelectItem value="supply_chain">Supply Chain</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left p-3 font-medium text-muted-foreground">Timestamp</th>
                  <th className="text-left p-3 font-medium text-muted-foreground">User</th>
                  <th className="text-left p-3 font-medium text-muted-foreground">Module</th>
                  <th className="text-left p-3 font-medium text-muted-foreground">Action</th>
                  <th className="text-left p-3 font-medium text-muted-foreground">Details</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i} className="border-b">
                      {Array.from({ length: 5 }).map((_, j) => (
                        <td key={j} className="p-3"><Skeleton className="h-4 w-20" /></td>
                      ))}
                    </tr>
                  ))
                ) : logs && logs.length > 0 ? (
                  logs.map((log) => (
                    <tr key={log.id} className="border-b last:border-0" data-testid={`row-log-${log.id}`}>
                      <td className="p-3 text-muted-foreground whitespace-nowrap">
                        {new Date(log.timestamp).toLocaleString()}
                      </td>
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          <User className="w-3.5 h-3.5 text-muted-foreground" />
                          <span className="text-sm">{log.userId}</span>
                        </div>
                      </td>
                      <td className="p-3"><ModuleBadge module={log.module} /></td>
                      <td className="p-3 font-medium">{log.action}</td>
                      <td className="p-3 text-muted-foreground max-w-xs truncate">{log.details || "—"}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-muted-foreground">
                      No audit logs recorded yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
