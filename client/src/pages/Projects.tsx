import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Plus, Search, FolderKanban, Clock, CheckCircle, AlertCircle, Pencil, Trash2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
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
  const { toast } = useToast();
  const { data: projects, isLoading } = useQuery<Project[]>({ queryKey: ["/api/projects"] });

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [form, setForm] = useState({ name: "", description: "", status: "planning", priority: "medium", startDate: "", endDate: "", budget: "" });

  const stats = {
    total: projects?.length ?? 0,
    inProgress: projects?.filter((p) => p.status === "in_progress").length ?? 0,
    completed: projects?.filter((p) => p.status === "completed").length ?? 0,
    onHold: projects?.filter((p) => p.status === "on_hold").length ?? 0,
  };

  const projectMutation = useMutation({
    mutationFn: async (data: any) => {
      if (editingProject) {
        await apiRequest("PATCH", `/api/projects/${editingProject.id}`, data);
      } else {
        await apiRequest("POST", "/api/projects", data);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      toast({ title: editingProject ? "Project updated" : "Project created" });
      setDialogOpen(false);
      setEditingProject(null);
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => { await apiRequest("DELETE", `/api/projects/${id}`); },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      toast({ title: "Project deleted" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const openNew = () => {
    setEditingProject(null);
    setForm({ name: "", description: "", status: "planning", priority: "medium", startDate: "", endDate: "", budget: "" });
    setDialogOpen(true);
  };

  const openEdit = (p: Project) => {
    setEditingProject(p);
    setForm({
      name: p.name,
      description: p.description || "",
      status: p.status,
      priority: p.priority,
      startDate: p.startDate ? new Date(p.startDate).toISOString().split("T")[0] : "",
      endDate: p.endDate ? new Date(p.endDate).toISOString().split("T")[0] : "",
      budget: p.budget ? String(p.budget) : "",
    });
    setDialogOpen(true);
  };

  return (
    <div className="p-6 space-y-6 overflow-auto h-full">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Project Management</h1>
          <p className="text-muted-foreground text-sm mt-1">Track and manage your projects</p>
        </div>
        <Button data-testid="button-new-project" onClick={openNew}>
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
                  <th className="text-right p-3 font-medium text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  Array.from({ length: 3 }).map((_, i) => (
                    <tr key={i} className="border-b">
                      {Array.from({ length: 7 }).map((_, j) => (
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
                      <td className="p-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button size="icon" variant="ghost" data-testid={`button-edit-project-${project.id}`} onClick={() => openEdit(project)}>
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button size="icon" variant="ghost" data-testid={`button-delete-project-${project.id}`} onClick={() => { if (confirm("Delete this project?")) deleteMutation.mutate(project.id); }}>
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-muted-foreground">
                      No projects found. Create your first project.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingProject ? "Edit Project" : "New Project"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="projectName">Name</Label>
              <Input id="projectName" data-testid="input-project-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="projectDesc">Description</Label>
              <Input id="projectDesc" data-testid="input-project-description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="projectStatus">Status</Label>
              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                <SelectTrigger data-testid="select-project-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {["planning", "in_progress", "on_hold", "completed", "cancelled"].map((s) => (
                    <SelectItem key={s} value={s}>{s.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase())}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="projectPriority">Priority</Label>
              <Select value={form.priority} onValueChange={(v) => setForm({ ...form, priority: v })}>
                <SelectTrigger data-testid="select-project-priority">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {["low", "medium", "high"].map((s) => (
                    <SelectItem key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="projectStart">Start Date</Label>
              <Input id="projectStart" type="date" data-testid="input-project-start-date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="projectEnd">End Date</Label>
              <Input id="projectEnd" type="date" data-testid="input-project-end-date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="projectBudget">Budget</Label>
              <Input id="projectBudget" type="number" data-testid="input-project-budget" value={form.budget} onChange={(e) => setForm({ ...form, budget: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button data-testid="button-submit-project" disabled={projectMutation.isPending} onClick={() => projectMutation.mutate(form)}>
              {projectMutation.isPending ? "Saving..." : editingProject ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
