import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useQuery } from "@tanstack/react-query";
import { Plus, Search, FolderKanban, Clock, CheckCircle, AlertCircle } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import type { Project } from "@shared/schema";

function PriorityIndicator({ priority }: { priority: string }) {
  const colors: Record<string, string> = {
    high: "bg-red-500",
    medium: "bg-yellow-500",
    low: "bg-green-500",
  };
  return <span className={`inline-block w-2 h-2 rounded-full ${colors[priority] || colors.medium}`} />;
}

function StatusBadge({ status }: { status: string }) {
  const variants: Record<string, string> = {
    planning: "bg-gray-100 text-gray-800 dark:bg-gray-950/40 dark:text-gray-400",
    in_progress: "bg-blue-100 text-blue-800 dark:bg-blue-950/40 dark:text-blue-400",
    on_hold: "bg-yellow-100 text-yellow-800 dark:bg-yellow-950/40 dark:text-yellow-400",
    completed: "bg-green-100 text-green-800 dark:bg-green-950/40 dark:text-green-400",
    cancelled: "bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-400",
  };
  const label = status.replace(/_/g, " ");
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium ${variants[status] || variants.planning}`}>
      {label.charAt(0).toUpperCase() + label.slice(1)}
    </span>
  );
}

export default function Projects() {
  const { data: projects, isLoading } = useQuery<Project[]>({ queryKey: ["/api/projects"] });

  const stats = {
    total: projects?.length ?? 0,
    inProgress: projects?.filter((p) => p.status === "in_progress").length ?? 0,
    completed: projects?.filter((p) => p.status === "completed").length ?? 0,
    onHold: projects?.filter((p) => p.status === "on_hold").length ?? 0,
  };

  return (
    <div className="p-6 space-y-6 overflow-auto h-full">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Project Management</h1>
          <p className="text-muted-foreground text-sm mt-1">Track and manage your projects</p>
        </div>
        <Button data-testid="button-new-project">
          <Plus className="w-4 h-4 mr-2" />
          New Project
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        {[
          { label: "Total Projects", value: stats.total, icon: FolderKanban, color: "text-blue-500", bg: "bg-blue-50 dark:bg-blue-950/30" },
          { label: "In Progress", value: stats.inProgress, icon: Clock, color: "text-yellow-500", bg: "bg-yellow-50 dark:bg-yellow-950/30" },
          { label: "Completed", value: stats.completed, icon: CheckCircle, color: "text-green-500", bg: "bg-green-50 dark:bg-green-950/30" },
          { label: "On Hold", value: stats.onHold, icon: AlertCircle, color: "text-red-500", bg: "bg-red-50 dark:bg-red-950/30" },
        ].map((s) => (
          <Card key={s.label}>
            <CardContent className="p-5 flex items-center gap-4">
              <div className={`w-10 h-10 rounded-md flex items-center justify-center ${s.bg}`}>
                <s.icon className={`w-5 h-5 ${s.color}`} />
              </div>
              <div>
                <p className="text-2xl font-bold">{s.value}</p>
                <p className="text-xs text-muted-foreground">{s.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex items-center gap-2">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search projects..." className="pl-9" data-testid="input-search-projects" />
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left p-3 font-medium text-muted-foreground">Project Name</th>
                  <th className="text-left p-3 font-medium text-muted-foreground">Priority</th>
                  <th className="text-left p-3 font-medium text-muted-foreground">Status</th>
                  <th className="text-left p-3 font-medium text-muted-foreground">Start Date</th>
                  <th className="text-left p-3 font-medium text-muted-foreground">End Date</th>
                  <th className="text-right p-3 font-medium text-muted-foreground">Budget</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  Array.from({ length: 3 }).map((_, i) => (
                    <tr key={i} className="border-b">
                      {Array.from({ length: 6 }).map((_, j) => (
                        <td key={j} className="p-3"><Skeleton className="h-4 w-20" /></td>
                      ))}
                    </tr>
                  ))
                ) : projects && projects.length > 0 ? (
                  projects.map((project) => (
                    <tr key={project.id} className="border-b last:border-0" data-testid={`row-project-${project.id}`}>
                      <td className="p-3 font-medium">{project.name}</td>
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          <PriorityIndicator priority={project.priority} />
                          <span className="capitalize">{project.priority}</span>
                        </div>
                      </td>
                      <td className="p-3"><StatusBadge status={project.status} /></td>
                      <td className="p-3 text-muted-foreground">
                        {project.startDate ? new Date(project.startDate).toLocaleDateString() : "—"}
                      </td>
                      <td className="p-3 text-muted-foreground">
                        {project.endDate ? new Date(project.endDate).toLocaleDateString() : "—"}
                      </td>
                      <td className="p-3 text-right font-medium">
                        {project.budget ? `₹${Number(project.budget).toLocaleString()}` : "—"}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-muted-foreground">
                      No projects found. Create your first project.
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
