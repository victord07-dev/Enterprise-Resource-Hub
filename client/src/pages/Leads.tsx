import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Plus, Search, Users, UserCheck, Trophy, XCircle, Pencil, Trash2, ArrowRightLeft } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import type { Lead, Employee } from "@shared/schema";

const STATUS_COLORS: Record<string, string> = {
  new: "bg-gray-100 text-gray-800 dark:bg-gray-950/40 dark:text-gray-400",
  contacted: "bg-blue-100 text-blue-800 dark:bg-blue-950/40 dark:text-blue-400",
  qualified: "bg-purple-100 text-purple-800 dark:bg-purple-950/40 dark:text-purple-400",
  quotation_sent: "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-400",
  won: "bg-green-100 text-green-800 dark:bg-green-950/40 dark:text-green-400",
  lost: "bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-400",
};

const SOURCE_COLORS: Record<string, string> = {
  call: "bg-blue-100 text-blue-800 dark:bg-blue-950/40 dark:text-blue-400",
  website: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-400",
  referral: "bg-violet-100 text-violet-800 dark:bg-violet-950/40 dark:text-violet-400",
  walk_in: "bg-orange-100 text-orange-800 dark:bg-orange-950/40 dark:text-orange-400",
  other: "bg-gray-100 text-gray-800 dark:bg-gray-950/40 dark:text-gray-400",
};

function formatStatus(s: string) {
  return s.split("_").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

interface LeadForm {
  name: string;
  email: string;
  phone: string;
  company: string;
  address: string;
  gstNumber: string;
  requirement: string;
  source: string;
  status: string;
  estimatedValue: string;
  assignedTo: string;
  notes: string;
}

const emptyForm = (): LeadForm => ({
  name: "",
  email: "",
  phone: "",
  company: "",
  address: "",
  gstNumber: "",
  requirement: "",
  source: "call",
  status: "new",
  estimatedValue: "",
  assignedTo: "",
  notes: "",
});

export default function Leads() {
  const { toast } = useToast();
  const { data: leads, isLoading } = useQuery<Lead[]>({ queryKey: ["/api/leads"] });
  const { data: employees } = useQuery<Employee[]>({ queryKey: ["/api/employees"] });

  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingLead, setEditingLead] = useState<Lead | null>(null);
  const [form, setForm] = useState<LeadForm>(emptyForm());
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingLead, setDeletingLead] = useState<Lead | null>(null);

  const filteredLeads = leads?.filter(l => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      l.name.toLowerCase().includes(q) ||
      (l.company || "").toLowerCase().includes(q) ||
      (l.email || "").toLowerCase().includes(q) ||
      (l.phone || "").toLowerCase().includes(q)
    );
  });

  const totalLeads = leads?.length ?? 0;
  const qualifiedCount = leads?.filter(l => l.status === "qualified").length ?? 0;
  const wonCount = leads?.filter(l => l.status === "won").length ?? 0;
  const lostCount = leads?.filter(l => l.status === "lost").length ?? 0;

  const leadMutation = useMutation({
    mutationFn: async (data: LeadForm) => {
      const payload: any = {
        name: data.name,
        email: data.email || null,
        phone: data.phone,
        company: data.company || null,
        address: data.address,
        gstNumber: data.gstNumber,
        requirement: data.requirement || null,
        source: data.source,
        status: data.status,
        assignedTo: data.assignedTo || null,
        estimatedValue: data.estimatedValue ? data.estimatedValue : null,
        notes: data.notes || null,
      };
      if (editingLead) {
        await apiRequest("PATCH", `/api/leads/${editingLead.id}`, payload);
      } else {
        await apiRequest("POST", "/api/leads", payload);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/leads"] });
      toast({ title: editingLead ? "Lead updated" : "Lead created" });
      setDialogOpen(false);
      setEditingLead(null);
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/leads/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/leads"] });
      toast({ title: "Lead deleted" });
      setDeleteDialogOpen(false);
      setDeletingLead(null);
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const convertMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("POST", `/api/leads/${id}/convert-to-quotation`);
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/leads"] });
      queryClient.invalidateQueries({ queryKey: ["/api/quotations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/customers"] });
      toast({
        title: "Lead converted to quotation",
        description: `Quotation ${data.quotation?.quoteNumber} created`,
      });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const openNew = () => {
    setEditingLead(null);
    setForm(emptyForm());
    setDialogOpen(true);
  };

  const openEdit = (lead: Lead) => {
    setEditingLead(lead);
    setForm({
      name: lead.name,
      email: lead.email || "",
      phone: lead.phone || "",
      company: lead.company || "",
      address: lead.address || "",
      gstNumber: lead.gstNumber || "",
      requirement: lead.requirement || "",
      source: lead.source,
      status: lead.status,
      estimatedValue: lead.estimatedValue ? String(lead.estimatedValue) : "",
      assignedTo: lead.assignedTo || "",
      notes: lead.notes || "",
    });
    setDialogOpen(true);
  };

  const openDelete = (lead: Lead) => {
    setDeletingLead(lead);
    setDeleteDialogOpen(true);
  };

  const getEmployeeName = (id: string) => employees?.find(e => e.id === id)?.name || "—";

  return (
    <div className="p-6 space-y-6 overflow-auto h-full">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Leads</h1>
          <p className="text-muted-foreground text-sm mt-1">Manage your sales pipeline and lead tracking</p>
        </div>
        <Button data-testid="button-new-lead" onClick={openNew}>
          <Plus className="w-4 h-4 mr-2" />
          New Lead
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-5 flex items-center gap-4">
            <div className="w-10 h-10 rounded-md bg-blue-50 dark:bg-blue-950/30 flex items-center justify-center">
              <Users className="w-5 h-5 text-blue-500" />
            </div>
            <div>
              <p className="text-2xl font-bold" data-testid="text-total-leads">{totalLeads}</p>
              <p className="text-xs text-muted-foreground">Total Leads</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5 flex items-center gap-4">
            <div className="w-10 h-10 rounded-md bg-purple-50 dark:bg-purple-950/30 flex items-center justify-center">
              <UserCheck className="w-5 h-5 text-purple-500" />
            </div>
            <div>
              <p className="text-2xl font-bold" data-testid="text-qualified-leads">{qualifiedCount}</p>
              <p className="text-xs text-muted-foreground">Qualified</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5 flex items-center gap-4">
            <div className="w-10 h-10 rounded-md bg-green-50 dark:bg-green-950/30 flex items-center justify-center">
              <Trophy className="w-5 h-5 text-green-500" />
            </div>
            <div>
              <p className="text-2xl font-bold" data-testid="text-won-leads">{wonCount}</p>
              <p className="text-xs text-muted-foreground">Won</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5 flex items-center gap-4">
            <div className="w-10 h-10 rounded-md bg-red-50 dark:bg-red-950/30 flex items-center justify-center">
              <XCircle className="w-5 h-5 text-red-500" />
            </div>
            <div>
              <p className="text-2xl font-bold" data-testid="text-lost-leads">{lostCount}</p>
              <p className="text-xs text-muted-foreground">Lost</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex items-center gap-2">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search leads..."
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            data-testid="input-search-leads"
          />
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left p-3 font-medium text-muted-foreground">Name</th>
                  <th className="text-left p-3 font-medium text-muted-foreground">Company</th>
                  <th className="text-left p-3 font-medium text-muted-foreground">Source</th>
                  <th className="text-left p-3 font-medium text-muted-foreground">Status</th>
                  <th className="text-right p-3 font-medium text-muted-foreground">Est. Value</th>
                  <th className="text-left p-3 font-medium text-muted-foreground">Assigned To</th>
                  <th className="text-left p-3 font-medium text-muted-foreground">Date</th>
                  <th className="text-right p-3 font-medium text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i} className="border-b">
                      {Array.from({ length: 8 }).map((_, j) => (
                        <td key={j} className="p-3"><Skeleton className="h-4 w-full" /></td>
                      ))}
                    </tr>
                  ))
                ) : !filteredLeads?.length ? (
                  <tr>
                    <td colSpan={8} className="p-8 text-center text-muted-foreground">
                      No leads found
                    </td>
                  </tr>
                ) : (
                  filteredLeads.map((lead) => (
                    <tr key={lead.id} className="border-b" data-testid={`row-lead-${lead.id}`}>
                      <td className="p-3 font-medium" data-testid={`text-lead-name-${lead.id}`}>{lead.name}</td>
                      <td className="p-3 text-muted-foreground" data-testid={`text-lead-company-${lead.id}`}>{lead.company || "—"}</td>
                      <td className="p-3">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium ${SOURCE_COLORS[lead.source] || SOURCE_COLORS.other}`}
                          data-testid={`badge-lead-source-${lead.id}`}
                        >
                          {formatStatus(lead.source)}
                        </span>
                      </td>
                      <td className="p-3">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium ${STATUS_COLORS[lead.status] || STATUS_COLORS.new}`}
                          data-testid={`badge-lead-status-${lead.id}`}
                        >
                          {formatStatus(lead.status)}
                        </span>
                      </td>
                      <td className="p-3 text-right" data-testid={`text-lead-value-${lead.id}`}>
                        {lead.estimatedValue ? `₹${Number(lead.estimatedValue).toLocaleString()}` : "—"}
                      </td>
                      <td className="p-3 text-muted-foreground" data-testid={`text-lead-assigned-${lead.id}`}>
                        {lead.assignedTo ? getEmployeeName(lead.assignedTo) : "—"}
                      </td>
                      <td className="p-3 text-muted-foreground" data-testid={`text-lead-date-${lead.id}`}>
                        {lead.createdAt ? new Date(lead.createdAt).toLocaleDateString() : "—"}
                      </td>
                      <td className="p-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {(lead.status === "qualified" || lead.status === "contacted") && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => convertMutation.mutate(lead.id)}
                              disabled={convertMutation.isPending}
                              data-testid={`button-convert-lead-${lead.id}`}
                              title="Convert to Quotation"
                            >
                              <ArrowRightLeft className="w-4 h-4" />
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => openEdit(lead)}
                            data-testid={`button-edit-lead-${lead.id}`}
                          >
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => openDelete(lead)}
                            data-testid={`button-delete-lead-${lead.id}`}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle data-testid="text-dialog-title">{editingLead ? "Edit Lead" : "New Lead"}</DialogTitle>
            <DialogDescription>
              {editingLead ? "Update lead details" : "Add a new lead to the pipeline"}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="lead-name">Name *</Label>
                <Input
                  id="lead-name"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Lead name"
                  data-testid="input-lead-name"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="lead-company">Company</Label>
                <Input
                  id="lead-company"
                  value={form.company}
                  onChange={(e) => setForm({ ...form, company: e.target.value })}
                  placeholder="Company name"
                  data-testid="input-lead-company"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="lead-email">Email</Label>
                <Input
                  id="lead-email"
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  placeholder="email@example.com"
                  data-testid="input-lead-email"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="lead-phone">Phone *</Label>
                <Input
                  id="lead-phone"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  placeholder="+91..."
                  data-testid="input-lead-phone"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="lead-address">Address *</Label>
                <Input
                  id="lead-address"
                  value={form.address}
                  onChange={(e) => setForm({ ...form, address: e.target.value })}
                  placeholder="Full address"
                  data-testid="input-lead-address"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="lead-gst">GST Number *</Label>
                <Input
                  id="lead-gst"
                  value={form.gstNumber}
                  onChange={(e) => setForm({ ...form, gstNumber: e.target.value })}
                  placeholder="e.g. 29ABCDE1234F1Z5"
                  data-testid="input-lead-gst"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lead-requirement">Requirement</Label>
              <Textarea
                id="lead-requirement"
                value={form.requirement}
                onChange={(e) => setForm({ ...form, requirement: e.target.value })}
                placeholder="Describe the requirement..."
                data-testid="input-lead-requirement"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Source *</Label>
                <Select value={form.source} onValueChange={(v) => setForm({ ...form, source: v })}>
                  <SelectTrigger data-testid="select-lead-source">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="call">Call</SelectItem>
                    <SelectItem value="website">Website</SelectItem>
                    <SelectItem value="referral">Referral</SelectItem>
                    <SelectItem value="walk_in">Walk In</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Estimated Value (₹)</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.estimatedValue}
                  onChange={(e) => setForm({ ...form, estimatedValue: e.target.value })}
                  placeholder="0.00"
                  data-testid="input-lead-estimated-value"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Assign To *</Label>
                <Select value={form.assignedTo} onValueChange={(v) => setForm({ ...form, assignedTo: v === "__none__" ? "" : v })}>
                  <SelectTrigger data-testid="select-lead-assigned-to">
                    <SelectValue placeholder="Select employee..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Unassigned</SelectItem>
                    {employees?.map((emp) => (
                      <SelectItem key={emp.id} value={emp.id}>{emp.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {editingLead && (
                <div className="space-y-1.5">
                  <Label>Status</Label>
                  <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                    <SelectTrigger data-testid="select-lead-status">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="new">New</SelectItem>
                      <SelectItem value="contacted">Contacted</SelectItem>
                      <SelectItem value="qualified">Qualified</SelectItem>
                      <SelectItem value="quotation_sent">Quotation Sent</SelectItem>
                      <SelectItem value="won">Won</SelectItem>
                      <SelectItem value="lost">Lost</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lead-notes">Notes</Label>
              <Textarea
                id="lead-notes"
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="Additional notes..."
                data-testid="input-lead-notes"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} data-testid="button-cancel-lead">
              Cancel
            </Button>
            <Button
              onClick={() => leadMutation.mutate(form)}
              disabled={!form.name || !form.phone || !form.address || !form.gstNumber || !form.source || !form.assignedTo || leadMutation.isPending}
              data-testid="button-save-lead"
            >
              {leadMutation.isPending ? "Saving..." : editingLead ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Lead</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete "{deletingLead?.name}"? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)} data-testid="button-cancel-delete">
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => deletingLead && deleteMutation.mutate(deletingLead.id)}
              disabled={deleteMutation.isPending}
              data-testid="button-confirm-delete"
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
