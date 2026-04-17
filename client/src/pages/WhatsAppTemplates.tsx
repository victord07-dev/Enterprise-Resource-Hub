import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Pencil, Trash2, Tag, CheckCircle, XCircle, Clock } from "lucide-react";
import type { WhatsappTemplate } from "@shared/schema";

const STATUS_COLORS: Record<string, string> = {
  approved: "bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-400",
  pending_approval: "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400",
  rejected: "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400",
};

const STATUS_ICONS: Record<string, React.ElementType> = {
  approved: CheckCircle,
  pending_approval: Clock,
  rejected: XCircle,
};

const CATEGORY_OPTIONS = ["quotation", "invoice", "payment_reminder", "alert", "custom"];
const LANGUAGE_OPTIONS = [
  { value: "en", label: "English" },
  { value: "en_US", label: "English (US)" },
  { value: "hi", label: "Hindi" },
];

interface TemplateForm {
  name: string;
  interaktTemplateName: string;
  category: string;
  languageCode: string;
  body: string;
  variables: string;
  isActive: string;
}

const emptyForm = (): TemplateForm => ({
  name: "",
  interaktTemplateName: "",
  category: "quotation",
  languageCode: "en",
  body: "",
  variables: "",
  isActive: "approved",
});

export default function WhatsAppTemplates() {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<WhatsappTemplate | null>(null);
  const [form, setForm] = useState<TemplateForm>(emptyForm());
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const { data: templates = [], isLoading } = useQuery<WhatsappTemplate[]>({
    queryKey: ["/api/whatsapp/templates"],
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        name: form.name,
        interaktTemplateName: form.interaktTemplateName,
        category: form.category,
        languageCode: form.languageCode,
        body: form.body,
        variables: form.variables ? form.variables.split(",").map(v => v.trim()).filter(Boolean) : [],
        isActive: form.isActive,
      };
      if (editingTemplate) {
        const res = await apiRequest("PATCH", `/api/whatsapp/templates/${editingTemplate.id}`, payload);
        if (!res.ok) { const e = await res.json(); throw new Error(e.message); }
        return res.json();
      } else {
        const res = await apiRequest("POST", "/api/whatsapp/templates", payload);
        if (!res.ok) { const e = await res.json(); throw new Error(e.message); }
        return res.json();
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/whatsapp/templates"] });
      toast({ title: editingTemplate ? "Template updated" : "Template created" });
      setDialogOpen(false);
      setEditingTemplate(null);
      setForm(emptyForm());
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("DELETE", `/api/whatsapp/templates/${id}`);
      if (!res.ok) { const e = await res.json(); throw new Error(e.message); }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/whatsapp/templates"] });
      toast({ title: "Template deleted" });
      setDeleteDialogOpen(false);
      setDeletingId(null);
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const openNew = () => {
    setEditingTemplate(null);
    setForm(emptyForm());
    setDialogOpen(true);
  };

  const openEdit = (t: WhatsappTemplate) => {
    setEditingTemplate(t);
    setForm({
      name: t.name,
      interaktTemplateName: t.interaktTemplateName,
      category: t.category,
      languageCode: t.languageCode,
      body: t.body,
      variables: (t.variables || []).join(", "),
      isActive: t.isActive,
    });
    setDialogOpen(true);
  };

  const approvedCount = templates.filter(t => t.isActive === "approved").length;
  const pendingCount = templates.filter(t => t.isActive !== "approved").length;
  const rejectedCount = 0; // deprecated field

  return (
    <div className="p-6 space-y-6 overflow-auto h-full">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2" data-testid="text-page-title">
            <Tag className="w-6 h-6" />
            WhatsApp Templates
          </h1>
          <p className="text-muted-foreground text-sm mt-1">Manage approved message templates for outbound messaging</p>
        </div>
        <Button onClick={openNew} data-testid="button-new-template">
          <Plus className="w-4 h-4 mr-2" /> Add Template
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <CheckCircle className="w-8 h-8 text-green-500" />
            <div>
              <p className="text-xl font-bold" data-testid="text-approved-count">{approvedCount}</p>
              <p className="text-xs text-muted-foreground">Approved</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <Clock className="w-8 h-8 text-amber-500" />
            <div>
              <p className="text-xl font-bold" data-testid="text-pending-count">{pendingCount}</p>
              <p className="text-xs text-muted-foreground">Pending Review</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <XCircle className="w-8 h-8 text-red-500" />
            <div>
              <p className="text-xl font-bold" data-testid="text-rejected-count">{rejectedCount}</p>
              <p className="text-xs text-muted-foreground">Rejected</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Templates list */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-sm text-muted-foreground text-center">Loading templates...</div>
          ) : templates.length === 0 ? (
            <div className="p-8 text-sm text-muted-foreground text-center space-y-2">
              <Tag className="w-8 h-8 mx-auto opacity-30" />
              <p>No templates yet. Add your first template.</p>
            </div>
          ) : (
            <div className="divide-y">
              {templates.map(t => {
                const isActive = t.isActive === "approved";
                return (
                  <div key={t.id} className="flex items-start gap-4 p-4" data-testid={`template-row-${t.id}`}>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="font-medium text-sm">{t.name}</span>
                        <Badge variant="outline" className="text-[10px] no-default-hover-elevate no-default-active-elevate">{t.category}</Badge>
                        <Badge variant="outline" className="text-[10px] no-default-hover-elevate no-default-active-elevate">{t.languageCode}</Badge>
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium ${isActive ? STATUS_COLORS["approved"] : STATUS_COLORS["pending_approval"]}`}>
                          {isActive ? <CheckCircle className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
                          {isActive ? "Active" : "Inactive"}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground font-mono mb-1">Interakt Name: {t.interaktTemplateName}</p>
                      <p className="text-sm text-muted-foreground">{t.body}</p>
                      {t.variables && t.variables.length > 0 && (
                        <div className="flex items-center gap-1 mt-1 flex-wrap">
                          <span className="text-[10px] text-muted-foreground">Variables:</span>
                          {t.variables.map((v, i) => (
                            <span key={i} className="text-[10px] bg-muted px-1.5 py-0.5 rounded font-mono">{`{{${i + 1}}} ${v}`}</span>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button size="sm" variant="ghost" onClick={() => openEdit(t)} data-testid={`button-edit-template-${t.id}`}>
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/20"
                        onClick={() => { setDeletingId(t.id); setDeleteDialogOpen(true); }}
                        data-testid={`button-delete-template-${t.id}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingTemplate ? "Edit Template" : "Add Template"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Display Name *</Label>
                <Input
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Order Confirmation"
                  data-testid="input-template-name"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Interakt Template Name *</Label>
                <Input
                  value={form.interaktTemplateName}
                  onChange={e => setForm(f => ({ ...f, interaktTemplateName: e.target.value }))}
                  placeholder="e.g. order_confirmation"
                  data-testid="input-template-id"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Category</Label>
                <Select value={form.category} onValueChange={v => setForm(f => ({ ...f, category: v }))}>
                  <SelectTrigger data-testid="select-category"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CATEGORY_OPTIONS.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Language</Label>
                <Select value={form.languageCode} onValueChange={v => setForm(f => ({ ...f, languageCode: v }))}>
                  <SelectTrigger data-testid="select-language"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {LANGUAGE_OPTIONS.map(l => <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Template Body (preview) *</Label>
              <Textarea
                value={form.body}
                onChange={e => setForm(f => ({ ...f, body: e.target.value }))}
                placeholder="Hi {{1}}, your order {{2}} has been confirmed..."
                className="min-h-[80px] text-sm resize-none"
                data-testid="textarea-template-body"
              />
            </div>

            <div className="space-y-1.5">
              <Label>Variable Names (comma separated)</Label>
              <Input
                value={form.variables}
                onChange={e => setForm(f => ({ ...f, variables: e.target.value }))}
                placeholder="customerName, orderNumber, amount"
                data-testid="input-template-vars"
              />
              <p className="text-xs text-muted-foreground">Name each variable in order of appearance &#123;&#123;1&#125;&#125;, &#123;&#123;2&#125;&#125;, &hellip;</p>
            </div>

            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={form.isActive} onValueChange={v => setForm(f => ({ ...f, isActive: v }))}>
                <SelectTrigger data-testid="select-status"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="approved">Approved</SelectItem>
                  <SelectItem value="pending_approval">Pending Approval</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button
              disabled={!form.name || !form.interaktTemplateName || !form.body || saveMutation.isPending}
              onClick={() => saveMutation.mutate()}
              data-testid="button-save-template"
            >
              {saveMutation.isPending ? "Saving..." : editingTemplate ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Template</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">Are you sure you want to delete this template? This action cannot be undone.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={deleteMutation.isPending}
              onClick={() => deletingId && deleteMutation.mutate(deletingId)}
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
