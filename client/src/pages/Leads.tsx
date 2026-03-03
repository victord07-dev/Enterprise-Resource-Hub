import { useState, useCallback, Fragment } from "react";
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
import {
  Plus, Search, Users, UserCheck, Trophy, XCircle, Pencil, Trash2, ArrowRightLeft,
  ChevronDown, ChevronRight, Phone, Mail, Users as UsersGroup, MapPin, MessageCircle, StickyNote,
  AlertTriangle, Clock, Check, ArrowUpDown, CalendarDays
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import type { Lead, Employee, LeadActivity, LeadFollowup } from "@shared/schema";

const STATUS_COLORS: Record<string, string> = {
  new: "bg-gray-100 text-gray-800 dark:bg-gray-950/40 dark:text-gray-400",
  contacted: "bg-blue-100 text-blue-800 dark:bg-blue-950/40 dark:text-blue-400",
  qualified: "bg-purple-100 text-purple-800 dark:bg-purple-950/40 dark:text-purple-400",
  quotation_sent: "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-400",
  won: "bg-green-100 text-green-800 dark:bg-green-950/40 dark:text-green-400",
  lost: "bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-400",
  dormant: "bg-slate-100 text-slate-700 dark:bg-slate-950/40 dark:text-slate-400",
};

const SOURCE_COLORS: Record<string, string> = {
  call: "bg-blue-100 text-blue-800 dark:bg-blue-950/40 dark:text-blue-400",
  website: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-400",
  referral: "bg-violet-100 text-violet-800 dark:bg-violet-950/40 dark:text-violet-400",
  walk_in: "bg-orange-100 text-orange-800 dark:bg-orange-950/40 dark:text-orange-400",
  other: "bg-gray-100 text-gray-800 dark:bg-gray-950/40 dark:text-gray-400",
};

const ACTIVITY_ICONS: Record<string, typeof Phone> = {
  call: Phone,
  email: Mail,
  meeting: UsersGroup,
  site_visit: MapPin,
  whatsapp: MessageCircle,
  note: StickyNote,
};

const PRIORITY_COLORS: Record<string, string> = {
  high: "bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-400",
  medium: "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-400",
  low: "bg-green-100 text-green-800 dark:bg-green-950/40 dark:text-green-400",
};

function formatStatus(s: string) {
  return s.split("_").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

function relativeTime(dateStr: string | Date) {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

function isOverdue(dueDate: string | Date) {
  const due = new Date(dueDate);
  due.setHours(23, 59, 59, 999);
  const now = new Date();
  return now > due;
}

function isToday(dueDate: string | Date) {
  const due = new Date(dueDate);
  const now = new Date();
  return due.toDateString() === now.toDateString();
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
  lossReason: string;
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
  lossReason: "",
});

interface FollowupsSummary {
  today: number;
  overdue: number;
  totalPending: number;
}

export default function Leads() {
  const { toast } = useToast();
  const { data: leads, isLoading } = useQuery<Lead[]>({ queryKey: ["/api/leads"] });
  const { data: employees } = useQuery<Employee[]>({ queryKey: ["/api/employees"] });
  const { data: followupsSummary } = useQuery<FollowupsSummary>({ queryKey: ["/api/followups/summary"] });

  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingLead, setEditingLead] = useState<Lead | null>(null);
  const [previousStatus, setPreviousStatus] = useState<string | null>(null);
  const [form, setForm] = useState<LeadForm>(emptyForm());
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingLead, setDeletingLead] = useState<Lead | null>(null);
  const [sortByFollowup, setSortByFollowup] = useState(false);

  const [expandedLeadId, setExpandedLeadId] = useState<string | null>(null);
  const [expandedActivities, setExpandedActivities] = useState<LeadActivity[]>([]);
  const [expandedFollowups, setExpandedFollowups] = useState<LeadFollowup[]>([]);
  const [activeExpandTab, setActiveExpandTab] = useState<"activities" | "followups">("activities");

  const [activityForm, setActivityForm] = useState({ activityType: "call", notes: "" });
  const [showActivityForm, setShowActivityForm] = useState(false);
  const [followupForm, setFollowupForm] = useState({ title: "", dueDate: "", priority: "medium" });
  const [showFollowupForm, setShowFollowupForm] = useState(false);

  const [allFollowups, setAllFollowups] = useState<Record<string, LeadFollowup[]>>({});

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

  const sortedLeads = (() => {
    if (!filteredLeads) return filteredLeads;
    if (!sortByFollowup) return filteredLeads;
    return [...filteredLeads].sort((a, b) => {
      const aFollowups = allFollowups[a.id];
      const bFollowups = allFollowups[b.id];
      const aPending = aFollowups?.filter(f => f.status === "pending").sort((x, y) => new Date(x.dueDate).getTime() - new Date(y.dueDate).getTime());
      const bPending = bFollowups?.filter(f => f.status === "pending").sort((x, y) => new Date(x.dueDate).getTime() - new Date(y.dueDate).getTime());
      const aDate = aPending?.[0]?.dueDate ? new Date(aPending[0].dueDate).getTime() : Infinity;
      const bDate = bPending?.[0]?.dueDate ? new Date(bPending[0].dueDate).getTime() : Infinity;
      return aDate - bDate;
    });
  })();

  const totalLeads = leads?.length ?? 0;
  const qualifiedCount = leads?.filter(l => l.status === "qualified").length ?? 0;
  const wonCount = leads?.filter(l => l.status === "won").length ?? 0;
  const lostCount = leads?.filter(l => l.status === "lost").length ?? 0;

  const toggleLeadExpand = useCallback(async (leadId: string) => {
    if (expandedLeadId === leadId) {
      setExpandedLeadId(null);
      return;
    }
    try {
      const token = localStorage.getItem("token");
      const headers = { Authorization: `Bearer ${token}` };
      const [activitiesRes, followupsRes] = await Promise.all([
        fetch(`/api/leads/${leadId}/activities`, { headers }),
        fetch(`/api/leads/${leadId}/followups`, { headers }),
      ]);
      const activities = await activitiesRes.json();
      const followups = await followupsRes.json();
      setExpandedActivities(activities);
      setExpandedFollowups(followups);
      setAllFollowups(prev => ({ ...prev, [leadId]: followups }));
      setExpandedLeadId(leadId);
      setShowActivityForm(false);
      setShowFollowupForm(false);
      setActivityForm({ activityType: "call", notes: "" });
      setFollowupForm({ title: "", dueDate: "", priority: "medium" });
    } catch {
      setExpandedLeadId(null);
    }
  }, [expandedLeadId]);

  const fetchFollowupsForLead = useCallback(async (leadId: string) => {
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`/api/leads/${leadId}/followups`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const followups = await res.json();
      setAllFollowups(prev => ({ ...prev, [leadId]: followups }));
    } catch { /* ignore */ }
  }, []);

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
        lossReason: data.status === "lost" ? (data.lossReason || null) : null,
      };
      if (editingLead) {
        await apiRequest("PATCH", `/api/leads/${editingLead.id}`, payload);
      } else {
        await apiRequest("POST", "/api/leads", payload);
      }
      return data;
    },
    onSuccess: (data: LeadForm) => {
      queryClient.invalidateQueries({ queryKey: ["/api/leads"] });
      queryClient.invalidateQueries({ queryKey: ["/api/followups/summary"] });
      const statusChanged = editingLead && previousStatus !== data.status;
      const changedToContacted = statusChanged && data.status === "contacted";

      toast({
        title: editingLead ? "Lead updated" : "Lead created",
        ...(changedToContacted && editingLead ? {
          description: "Schedule a follow-up?",
          action: (
            <Button
              variant="outline"
              size="sm"
              data-testid="button-schedule-followup-toast"
              onClick={() => {
                if (editingLead) {
                  toggleLeadExpand(editingLead.id);
                  setActiveExpandTab("followups");
                  setShowFollowupForm(true);
                }
              }}
            >
              <CalendarDays className="w-3 h-3 mr-1" />
              Schedule
            </Button>
          ),
        } : {}),
      });
      setDialogOpen(false);
      setEditingLead(null);
      setPreviousStatus(null);
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

  const activityMutation = useMutation({
    mutationFn: async ({ leadId, data }: { leadId: string; data: { activityType: string; notes: string } }) => {
      await apiRequest("POST", `/api/leads/${leadId}/activities`, data);
    },
    onSuccess: () => {
      if (expandedLeadId) {
        toggleLeadExpand(expandedLeadId).then(() => {
          if (expandedLeadId) toggleLeadExpand(expandedLeadId);
        });
      }
      setShowActivityForm(false);
      setActivityForm({ activityType: "call", notes: "" });
      toast({ title: "Activity logged" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const followupMutation = useMutation({
    mutationFn: async ({ leadId, data }: { leadId: string; data: { title: string; dueDate: string; priority: string } }) => {
      await apiRequest("POST", `/api/leads/${leadId}/followups`, {
        ...data,
        dueDate: new Date(data.dueDate).toISOString(),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/followups/summary"] });
      if (expandedLeadId) {
        const lid = expandedLeadId;
        setExpandedLeadId(null);
        setTimeout(() => toggleLeadExpand(lid), 100);
      }
      setShowFollowupForm(false);
      setFollowupForm({ title: "", dueDate: "", priority: "medium" });
      toast({ title: "Follow-up scheduled" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const completeFollowupMutation = useMutation({
    mutationFn: async (followupId: string) => {
      await apiRequest("POST", `/api/lead-followups/${followupId}/complete`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/followups/summary"] });
      if (expandedLeadId) {
        const lid = expandedLeadId;
        setExpandedLeadId(null);
        setTimeout(() => toggleLeadExpand(lid), 100);
      }
      toast({ title: "Follow-up completed" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const openNew = () => {
    setEditingLead(null);
    setPreviousStatus(null);
    setForm(emptyForm());
    setDialogOpen(true);
  };

  const openEdit = (lead: Lead) => {
    setEditingLead(lead);
    setPreviousStatus(lead.status);
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
      lossReason: (lead as any).lossReason || "",
    });
    setDialogOpen(true);
  };

  const openDelete = (lead: Lead) => {
    setDeletingLead(lead);
    setDeleteDialogOpen(true);
  };

  const getEmployeeName = (id: string) => employees?.find(e => e.id === id)?.name || "—";

  const getNextFollowup = (leadId: string): LeadFollowup | null => {
    const followups = allFollowups[leadId];
    if (!followups) return null;
    const pending = followups
      .filter(f => f.status === "pending")
      .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());
    return pending[0] || null;
  };

  const getFollowupDateClass = (dueDate: string | Date) => {
    if (isOverdue(dueDate)) return "text-red-600 dark:text-red-400 font-medium";
    if (isToday(dueDate)) return "text-amber-600 dark:text-amber-400 font-medium";
    return "text-muted-foreground";
  };

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

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
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
        <Card>
          <CardContent className="p-5 flex items-center gap-4">
            <div className="w-10 h-10 rounded-md bg-red-50 dark:bg-red-950/30 flex items-center justify-center">
              <AlertTriangle className="w-5 h-5 text-red-500" />
            </div>
            <div>
              <p className="text-2xl font-bold" data-testid="text-overdue-followups">{followupsSummary?.overdue ?? 0}</p>
              <p className="text-xs text-muted-foreground">Overdue</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5 flex items-center gap-4">
            <div className="w-10 h-10 rounded-md bg-amber-50 dark:bg-amber-950/30 flex items-center justify-center">
              <Clock className="w-5 h-5 text-amber-500" />
            </div>
            <div>
              <p className="text-2xl font-bold" data-testid="text-today-followups">{followupsSummary?.today ?? 0}</p>
              <p className="text-xs text-muted-foreground">Today</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
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
        <Button
          variant={sortByFollowup ? "default" : "outline"}
          size="sm"
          onClick={() => setSortByFollowup(!sortByFollowup)}
          data-testid="button-sort-followup"
        >
          <ArrowUpDown className="w-4 h-4 mr-1" />
          Sort by Follow-up
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="w-8 p-3"></th>
                  <th className="text-left p-3 font-medium text-muted-foreground">Name</th>
                  <th className="text-left p-3 font-medium text-muted-foreground">Company</th>
                  <th className="text-left p-3 font-medium text-muted-foreground">Source</th>
                  <th className="text-left p-3 font-medium text-muted-foreground">Status</th>
                  <th className="text-right p-3 font-medium text-muted-foreground">Est. Value</th>
                  <th className="text-left p-3 font-medium text-muted-foreground">Assigned To</th>
                  <th className="text-left p-3 font-medium text-muted-foreground">Next Follow-up</th>
                  <th className="text-left p-3 font-medium text-muted-foreground">Date</th>
                  <th className="text-right p-3 font-medium text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i} className="border-b">
                      {Array.from({ length: 10 }).map((_, j) => (
                        <td key={j} className="p-3"><Skeleton className="h-4 w-full" /></td>
                      ))}
                    </tr>
                  ))
                ) : !sortedLeads?.length ? (
                  <tr>
                    <td colSpan={10} className="p-8 text-center text-muted-foreground">
                      No leads found
                    </td>
                  </tr>
                ) : (
                  sortedLeads.map((lead) => {
                    const nextFollowup = getNextFollowup(lead.id);
                    return (
                      <Fragment key={lead.id}>
                        <tr
                          className="border-b cursor-pointer"
                          data-testid={`row-lead-${lead.id}`}
                          onClick={() => toggleLeadExpand(lead.id)}
                        >
                          <td className="p-3">
                            {expandedLeadId === lead.id
                              ? <ChevronDown className="w-4 h-4 text-muted-foreground" />
                              : <ChevronRight className="w-4 h-4 text-muted-foreground" />
                            }
                          </td>
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
                          <td className="p-3" data-testid={`text-lead-next-followup-${lead.id}`}>
                            {nextFollowup ? (
                              <span className={getFollowupDateClass(nextFollowup.dueDate)}>
                                {new Date(nextFollowup.dueDate).toLocaleDateString()}
                              </span>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </td>
                          <td className="p-3 text-muted-foreground" data-testid={`text-lead-date-${lead.id}`}>
                            {lead.createdAt ? new Date(lead.createdAt).toLocaleDateString() : "—"}
                          </td>
                          <td className="p-3 text-right" onClick={(e) => e.stopPropagation()}>
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
                        {expandedLeadId === lead.id && (
                          <tr>
                            <td colSpan={10} className="p-0">
                              <div className="bg-muted/30 p-4 border-b">
                                <div className="flex items-center gap-2 mb-4">
                                  <Button
                                    variant={activeExpandTab === "activities" ? "default" : "outline"}
                                    size="sm"
                                    onClick={() => setActiveExpandTab("activities")}
                                    data-testid="button-tab-activities"
                                  >
                                    Activity Log
                                  </Button>
                                  <Button
                                    variant={activeExpandTab === "followups" ? "default" : "outline"}
                                    size="sm"
                                    onClick={() => setActiveExpandTab("followups")}
                                    data-testid="button-tab-followups"
                                  >
                                    Follow-ups
                                  </Button>
                                </div>

                                {activeExpandTab === "activities" && (
                                  <div className="space-y-3">
                                    <div className="flex items-center justify-between gap-2 flex-wrap">
                                      <h3 className="text-sm font-semibold">Activity Log</h3>
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => setShowActivityForm(!showActivityForm)}
                                        data-testid="button-log-activity"
                                      >
                                        <Plus className="w-3 h-3 mr-1" />
                                        Log Activity
                                      </Button>
                                    </div>

                                    {showActivityForm && (
                                      <div className="border rounded-md p-3 space-y-2 bg-background">
                                        <div className="grid grid-cols-2 gap-2">
                                          <div className="space-y-1">
                                            <Label className="text-xs">Type</Label>
                                            <Select
                                              value={activityForm.activityType}
                                              onValueChange={(v) => setActivityForm({ ...activityForm, activityType: v })}
                                            >
                                              <SelectTrigger data-testid="select-activity-type">
                                                <SelectValue />
                                              </SelectTrigger>
                                              <SelectContent>
                                                <SelectItem value="call">Call</SelectItem>
                                                <SelectItem value="email">Email</SelectItem>
                                                <SelectItem value="meeting">Meeting</SelectItem>
                                                <SelectItem value="site_visit">Site Visit</SelectItem>
                                                <SelectItem value="whatsapp">WhatsApp</SelectItem>
                                                <SelectItem value="note">Note</SelectItem>
                                              </SelectContent>
                                            </Select>
                                          </div>
                                        </div>
                                        <div className="space-y-1">
                                          <Label className="text-xs">Notes</Label>
                                          <Textarea
                                            value={activityForm.notes}
                                            onChange={(e) => setActivityForm({ ...activityForm, notes: e.target.value })}
                                            placeholder="Describe the activity..."
                                            className="text-sm"
                                            data-testid="input-activity-notes"
                                          />
                                        </div>
                                        <div className="flex items-center gap-2">
                                          <Button
                                            size="sm"
                                            onClick={() => activityMutation.mutate({ leadId: lead.id, data: activityForm })}
                                            disabled={!activityForm.notes || activityMutation.isPending}
                                            data-testid="button-save-activity"
                                          >
                                            {activityMutation.isPending ? "Saving..." : "Save"}
                                          </Button>
                                          <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => setShowActivityForm(false)}
                                            data-testid="button-cancel-activity"
                                          >
                                            Cancel
                                          </Button>
                                        </div>
                                      </div>
                                    )}

                                    {expandedActivities.length === 0 ? (
                                      <p className="text-sm text-muted-foreground text-center py-4">No activities logged yet</p>
                                    ) : (
                                      <div className="space-y-2">
                                        {expandedActivities.map((activity) => {
                                          const IconComp = ACTIVITY_ICONS[activity.activityType] || StickyNote;
                                          return (
                                            <div
                                              key={activity.id}
                                              className="flex items-start gap-3 p-2 rounded-md bg-background"
                                              data-testid={`activity-item-${activity.id}`}
                                            >
                                              <div className="w-8 h-8 rounded-md bg-muted flex items-center justify-center shrink-0 mt-0.5">
                                                <IconComp className="w-4 h-4 text-muted-foreground" />
                                              </div>
                                              <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2 flex-wrap">
                                                  <span className="text-xs font-medium">{formatStatus(activity.activityType)}</span>
                                                  <span className="text-xs text-muted-foreground">{relativeTime(activity.createdAt)}</span>
                                                </div>
                                                <p className="text-sm text-muted-foreground mt-0.5">{activity.notes}</p>
                                              </div>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    )}
                                  </div>
                                )}

                                {activeExpandTab === "followups" && (
                                  <div className="space-y-3">
                                    <div className="flex items-center justify-between gap-2 flex-wrap">
                                      <h3 className="text-sm font-semibold">Follow-ups</h3>
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => setShowFollowupForm(!showFollowupForm)}
                                        data-testid="button-schedule-followup"
                                      >
                                        <Plus className="w-3 h-3 mr-1" />
                                        Schedule Follow-up
                                      </Button>
                                    </div>

                                    {showFollowupForm && (
                                      <div className="border rounded-md p-3 space-y-2 bg-background">
                                        <div className="space-y-1">
                                          <Label className="text-xs">Title</Label>
                                          <Input
                                            value={followupForm.title}
                                            onChange={(e) => setFollowupForm({ ...followupForm, title: e.target.value })}
                                            placeholder="Follow-up title..."
                                            data-testid="input-followup-title"
                                          />
                                        </div>
                                        <div className="grid grid-cols-2 gap-2">
                                          <div className="space-y-1">
                                            <Label className="text-xs">Due Date</Label>
                                            <Input
                                              type="date"
                                              value={followupForm.dueDate}
                                              onChange={(e) => setFollowupForm({ ...followupForm, dueDate: e.target.value })}
                                              data-testid="input-followup-date"
                                            />
                                          </div>
                                          <div className="space-y-1">
                                            <Label className="text-xs">Priority</Label>
                                            <Select
                                              value={followupForm.priority}
                                              onValueChange={(v) => setFollowupForm({ ...followupForm, priority: v })}
                                            >
                                              <SelectTrigger data-testid="select-followup-priority">
                                                <SelectValue />
                                              </SelectTrigger>
                                              <SelectContent>
                                                <SelectItem value="high">High</SelectItem>
                                                <SelectItem value="medium">Medium</SelectItem>
                                                <SelectItem value="low">Low</SelectItem>
                                              </SelectContent>
                                            </Select>
                                          </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                          <Button
                                            size="sm"
                                            onClick={() => followupMutation.mutate({ leadId: lead.id, data: followupForm })}
                                            disabled={!followupForm.title || !followupForm.dueDate || followupMutation.isPending}
                                            data-testid="button-save-followup"
                                          >
                                            {followupMutation.isPending ? "Saving..." : "Save"}
                                          </Button>
                                          <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => setShowFollowupForm(false)}
                                            data-testid="button-cancel-followup"
                                          >
                                            Cancel
                                          </Button>
                                        </div>
                                      </div>
                                    )}

                                    {expandedFollowups.length === 0 ? (
                                      <p className="text-sm text-muted-foreground text-center py-4">No follow-ups scheduled</p>
                                    ) : (
                                      <div className="space-y-2">
                                        {expandedFollowups.map((followup) => {
                                          const overdue = followup.status === "pending" && isOverdue(followup.dueDate);
                                          const today = followup.status === "pending" && isToday(followup.dueDate);
                                          return (
                                            <div
                                              key={followup.id}
                                              className={`flex items-center gap-3 p-2 rounded-md bg-background ${overdue ? "border border-red-200 dark:border-red-900" : ""}`}
                                              data-testid={`followup-item-${followup.id}`}
                                            >
                                              <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2 flex-wrap">
                                                  <span className={`text-sm font-medium ${followup.status === "completed" ? "line-through text-muted-foreground" : ""}`}>
                                                    {followup.title}
                                                  </span>
                                                  <Badge
                                                    variant="secondary"
                                                    className={`text-xs no-default-hover-elevate no-default-active-elevate ${PRIORITY_COLORS[followup.priority]}`}
                                                    data-testid={`badge-followup-priority-${followup.id}`}
                                                  >
                                                    {followup.priority.charAt(0).toUpperCase() + followup.priority.slice(1)}
                                                  </Badge>
                                                  {followup.status === "completed" ? (
                                                    <Badge variant="secondary" className="text-xs bg-green-100 text-green-800 dark:bg-green-950/40 dark:text-green-400 no-default-hover-elevate no-default-active-elevate">
                                                      Completed
                                                    </Badge>
                                                  ) : overdue ? (
                                                    <Badge variant="secondary" className="text-xs bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-400 no-default-hover-elevate no-default-active-elevate">
                                                      Overdue
                                                    </Badge>
                                                  ) : today ? (
                                                    <Badge variant="secondary" className="text-xs bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-400 no-default-hover-elevate no-default-active-elevate">
                                                      Today
                                                    </Badge>
                                                  ) : (
                                                    <Badge variant="secondary" className="text-xs no-default-hover-elevate no-default-active-elevate">
                                                      Pending
                                                    </Badge>
                                                  )}
                                                </div>
                                                <p className={`text-xs mt-0.5 ${overdue ? "text-red-600 dark:text-red-400" : today ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground"}`}>
                                                  Due: {new Date(followup.dueDate).toLocaleDateString()}
                                                  {followup.completedAt && ` · Completed: ${new Date(followup.completedAt).toLocaleDateString()}`}
                                                </p>
                                              </div>
                                              {followup.status === "pending" && (
                                                <Button
                                                  variant="ghost"
                                                  size="icon"
                                                  onClick={() => completeFollowupMutation.mutate(followup.id)}
                                                  disabled={completeFollowupMutation.isPending}
                                                  data-testid={`button-complete-followup-${followup.id}`}
                                                  title="Complete"
                                                >
                                                  <Check className="w-4 h-4 text-green-600" />
                                                </Button>
                                              )}
                                            </div>
                                          );
                                        })}
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })
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
                      <SelectItem value="dormant">Dormant</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
            {form.status === "lost" && editingLead && (
              <div className="space-y-1.5">
                <Label htmlFor="lead-loss-reason">Loss Reason *</Label>
                <Select
                  value={form.lossReason || "__custom__"}
                  onValueChange={(v) => setForm({ ...form, lossReason: v === "__custom__" ? "" : v })}
                >
                  <SelectTrigger data-testid="select-loss-reason">
                    <SelectValue placeholder="Select reason..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Went with competitor">Went with competitor</SelectItem>
                    <SelectItem value="Budget constraints">Budget constraints</SelectItem>
                    <SelectItem value="Timing/not now">Timing/not now</SelectItem>
                    <SelectItem value="No response">No response</SelectItem>
                    <SelectItem value="Other">Other</SelectItem>
                    <SelectItem value="__custom__">Custom reason...</SelectItem>
                  </SelectContent>
                </Select>
                {(form.lossReason === "" || !["Went with competitor", "Budget constraints", "Timing/not now", "No response", "Other"].includes(form.lossReason)) && (
                  <Textarea
                    id="lead-loss-reason"
                    value={form.lossReason}
                    onChange={(e) => setForm({ ...form, lossReason: e.target.value })}
                    placeholder="Describe the reason for losing this lead..."
                    data-testid="input-loss-reason"
                  />
                )}
              </div>
            )}
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
              disabled={
                !form.name || !form.phone || !form.address || !form.gstNumber || !form.source || !form.assignedTo || leadMutation.isPending ||
                (form.status === "lost" && !!editingLead && !form.lossReason)
              }
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
