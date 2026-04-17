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
import { Plus, Pencil, Trash2, Tag, CheckCircle, XCircle, Clock, RefreshCw, AlertCircle, History } from "lucide-react";
import type { WhatsappTemplate, WhatsappTemplateStatusHistory } from "@shared/schema";
import { COMMON_MERGE_FIELDS, MERGE_FIELD_BY_KEY } from "@shared/mergeFields";

interface TemplateSyncHistoryEntry {
  id: string;
  attemptAt: string;
  trigger: "manual" | "scheduled";
  success: boolean;
  errorMessage: string | null;
  total: number;
  created: number;
  updated: number;
  skipped: number;
  statusChangesCount: number;
}

interface TemplateSyncStatus {
  lastAttemptAt: string | null;
  lastSuccessAt: string | null;
  lastError: string | null;
  lastResult: { total: number; created: number; updated: number; skipped: number } | null;
  lastTrigger: "manual" | "scheduled" | null;
  history: TemplateSyncHistoryEntry[];
}

function formatRelativeTime(iso: string | null): string {
  if (!iso) return "never";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "never";
  const diffMs = Date.now() - then;
  const sec = Math.round(diffMs / 1000);
  if (sec < 5) return "just now";
  if (sec < 60) return `${sec}s ago`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min} min ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr} hr ago`;
  const day = Math.round(hr / 24);
  if (day < 30) return `${day} day${day === 1 ? "" : "s"} ago`;
  return new Date(iso).toLocaleDateString();
}

function formatExactTime(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString();
}

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
  variables: string[];
  examples: string[];
  isActive: string;
}

const emptyForm = (): TemplateForm => ({
  name: "",
  interaktTemplateName: "",
  category: "quotation",
  languageCode: "en",
  body: "",
  variables: [],
  examples: [],
  isActive: "approved",
});

function placeholderNumbers(body: string): number[] {
  const re = /\{\{\s*(\d+)\s*\}\}/g;
  const set = new Set<number>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    const n = parseInt(m[1], 10);
    if (n > 0) set.add(n);
  }
  return Array.from(set).sort((a, b) => a - b);
}

function isContiguousFromOne(nums: number[]): boolean {
  if (nums.length === 0) return true;
  for (let i = 0; i < nums.length; i++) {
    if (nums[i] !== i + 1) return false;
  }
  return true;
}

function exampleFor(name: string, index: number): string {
  const n = (name || "").toLowerCase();
  if (!n) return `Sample ${index + 1}`;
  if (n.includes("customer") || (n.includes("name") && !n.includes("file"))) return "Jane Doe";
  if (n.includes("order")) return "ORD-1024";
  if (n.includes("invoice")) return "INV-2026-001";
  if (n.includes("quote") || n.includes("quotation")) return "QT-2026-014";
  if (n.includes("amount") || n.includes("price") || n.includes("total") || n.includes("balance")) return "₹5,000";
  if (n.includes("date") || n.includes("day")) return "15 Apr 2026";
  if (n.includes("time")) return "3:30 PM";
  if (n.includes("phone") || n.includes("mobile")) return "+91 98765 43210";
  if (n.includes("email")) return "jane@example.com";
  if (n.includes("link") || n.includes("url")) return "https://example.com/link";
  if (n.includes("company")) return "Acme Pvt Ltd";
  if (n.includes("product") || n.includes("item")) return "Steel Pipe 1\"";
  if (n.includes("address")) return "12 MG Road, Bengaluru";
  if (n.includes("status")) return "Confirmed";
  return `Sample ${index + 1}`;
}

function renderPreview(body: string, variables: string[], examples: string[]): string {
  return body.replace(/\{\{\s*(\d+)\s*\}\}/g, (_m, num) => {
    const i = parseInt(num, 10) - 1;
    const explicit = examples[i]?.trim();
    if (explicit) return explicit;
    return exampleFor(variables[i] || "", i);
  });
}

export default function WhatsAppTemplates() {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<WhatsappTemplate | null>(null);
  const [form, setForm] = useState<TemplateForm>(emptyForm());
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [historyTemplate, setHistoryTemplate] = useState<WhatsappTemplate | null>(null);

  const { data: history = [], isLoading: historyLoading } = useQuery<WhatsappTemplateStatusHistory[]>({
    queryKey: ["/api/whatsapp/templates", historyTemplate?.id, "history"],
    enabled: !!historyTemplate,
  });

  const { data: templates = [], isLoading } = useQuery<WhatsappTemplate[]>({
    queryKey: ["/api/whatsapp/templates"],
  });

  const { data: syncStatus } = useQuery<TemplateSyncStatus>({
    queryKey: ["/api/whatsapp/templates/sync-status"],
    refetchInterval: 60_000,
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        name: form.name,
        interaktTemplateName: form.interaktTemplateName,
        category: form.category,
        languageCode: form.languageCode,
        body: form.body,
        variables: (() => {
          const nums = placeholderNumbers(form.body);
          const max = nums.length > 0 ? nums[nums.length - 1] : form.variables.length;
          const out: string[] = [];
          for (let i = 0; i < max; i++) out.push((form.variables[i] || "").trim());
          while (out.length > 0 && out[out.length - 1] === "") out.pop();
          return out;
        })(),
        exampleValues: (() => {
          const nums = placeholderNumbers(form.body);
          const max = nums.length > 0 ? nums[nums.length - 1] : form.examples.length;
          const out: string[] = [];
          for (let i = 0; i < max; i++) out.push((form.examples[i] || "").trim());
          while (out.length > 0 && out[out.length - 1] === "") out.pop();
          return out;
        })(),
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

  const syncMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/whatsapp/templates/sync");
      if (!res.ok) { const e = await res.json(); throw new Error(e.message); }
      return res.json() as Promise<{ total: number; created: number; updated: number; skipped: number }>;
    },
    onSuccess: (r) => {
      queryClient.invalidateQueries({ queryKey: ["/api/whatsapp/templates"] });
      queryClient.invalidateQueries({ queryKey: ["/api/whatsapp/templates/sync-status"] });
      toast({
        title: "Templates synced from Interakt",
        description: `${r.created} created, ${r.updated} updated${r.skipped ? `, ${r.skipped} skipped` : ""}.`,
      });
    },
    onError: (e: Error) => {
      queryClient.invalidateQueries({ queryKey: ["/api/whatsapp/templates/sync-status"] });
      toast({ title: "Sync failed", description: e.message, variant: "destructive" });
    },
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
      variables: [...(t.variables || [])],
      examples: [...(t.exampleValues || [])],
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
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => syncMutation.mutate()}
            disabled={syncMutation.isPending}
            data-testid="button-sync-templates"
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${syncMutation.isPending ? "animate-spin" : ""}`} />
            {syncMutation.isPending ? "Syncing..." : "Sync from Interakt"}
          </Button>
          <Button onClick={openNew} data-testid="button-new-template">
            <Plus className="w-4 h-4 mr-2" /> Add Template
          </Button>
        </div>
      </div>

      {/* Sync status */}
      {syncStatus && (syncStatus.lastAttemptAt || syncStatus.lastSuccessAt) && (() => {
        const failed = !!syncStatus.lastError &&
          (!syncStatus.lastSuccessAt ||
            (syncStatus.lastAttemptAt && new Date(syncStatus.lastAttemptAt).getTime() > new Date(syncStatus.lastSuccessAt).getTime()));
        const successAtLabel = syncStatus.lastSuccessAt ? formatRelativeTime(syncStatus.lastSuccessAt) : "never";
        const successAtExact = syncStatus.lastSuccessAt ? formatExactTime(syncStatus.lastSuccessAt) : "";
        const triggerLabel = syncStatus.lastTrigger === "scheduled" ? "scheduled" : "manual";
        return (
          <div
            className={`rounded-md border p-3 text-sm flex items-start gap-3 ${
              failed
                ? "border-red-300 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300"
                : "border-muted bg-muted/40 text-muted-foreground"
            }`}
            data-testid="status-template-sync"
          >
            {failed ? (
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            ) : (
              <CheckCircle className="w-4 h-4 mt-0.5 shrink-0 text-green-600 dark:text-green-400" />
            )}
            <div className="flex-1 min-w-0 space-y-0.5">
              <div>
                <span className="font-medium" data-testid="text-last-sync-time" title={successAtExact}>
                  Last successful sync: {successAtLabel}
                </span>
                {syncStatus.lastSuccessAt && (
                  <span className="ml-2 text-xs opacity-75">({successAtExact})</span>
                )}
                {syncStatus.lastResult && (
                  <span className="ml-2 text-xs">
                    · {syncStatus.lastResult.total} fetched, {syncStatus.lastResult.created} created, {syncStatus.lastResult.updated} updated
                    {syncStatus.lastResult.skipped ? `, ${syncStatus.lastResult.skipped} skipped` : ""}
                  </span>
                )}
              </div>
              {failed && (
                <div className="text-xs" data-testid="text-last-sync-error">
                  Last attempt ({triggerLabel}, {formatRelativeTime(syncStatus.lastAttemptAt)}) failed: {syncStatus.lastError}
                </div>
              )}
              {!failed && syncStatus.lastTrigger && (
                <div className="text-xs opacity-75">Triggered by {triggerLabel} sync.</div>
              )}
            </div>
          </div>
        );
      })()}

      {/* Sync history */}
      {syncStatus?.history && syncStatus.history.length > 0 && (
        <Card data-testid="card-sync-history">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Clock className="w-4 h-4" /> Recent sync attempts
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y text-xs">
              {syncStatus.history.map(h => (
                <div
                  key={h.id}
                  className="flex items-start gap-3 px-4 py-2"
                  data-testid={`row-sync-history-${h.id}`}
                >
                  {h.success ? (
                    <CheckCircle className="w-4 h-4 mt-0.5 shrink-0 text-green-600 dark:text-green-400" />
                  ) : (
                    <AlertCircle className="w-4 h-4 mt-0.5 shrink-0 text-red-600 dark:text-red-400" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium" title={formatExactTime(h.attemptAt)}>
                        {formatRelativeTime(h.attemptAt)}
                      </span>
                      <span className="text-muted-foreground">({formatExactTime(h.attemptAt)})</span>
                      <Badge variant="outline" className="text-[10px] no-default-hover-elevate no-default-active-elevate">
                        {h.trigger}
                      </Badge>
                      {h.success ? (
                        <span className="text-muted-foreground">
                          {h.total} fetched · {h.created} created · {h.updated} updated
                          {h.skipped ? ` · ${h.skipped} skipped` : ""}
                          {h.statusChangesCount ? ` · ${h.statusChangesCount} status change${h.statusChangesCount === 1 ? "" : "s"}` : ""}
                        </span>
                      ) : (
                        <span className="text-red-600 dark:text-red-400">Failed</span>
                      )}
                    </div>
                    {!h.success && h.errorMessage && (
                      <div
                        className="text-red-600 dark:text-red-400 mt-0.5 break-words"
                        data-testid={`text-sync-history-error-${h.id}`}
                      >
                        {h.errorMessage}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

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
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setHistoryTemplate(t)}
                        title="Status history"
                        data-testid={`button-history-template-${t.id}`}
                      >
                        <History className="w-4 h-4" />
                      </Button>
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
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
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
              <Label>Template Body *</Label>
              <Textarea
                value={form.body}
                onChange={e => setForm(f => ({ ...f, body: e.target.value }))}
                placeholder="Hi {{1}}, your order {{2}} has been confirmed..."
                className="min-h-[80px] text-sm resize-none font-mono"
                data-testid="textarea-template-body"
              />
              <p className="text-xs text-muted-foreground">Use &#123;&#123;1&#125;&#125;, &#123;&#123;2&#125;&#125;, &hellip; as placeholders. Name each one below.</p>
            </div>

            {(() => {
              const nums = placeholderNumbers(form.body);
              if (nums.length === 0) {
                return (
                  <div className="text-xs text-muted-foreground border border-dashed rounded-md p-3" data-testid="text-no-placeholders">
                    No placeholders detected. Add &#123;&#123;1&#125;&#125;, &#123;&#123;2&#125;&#125;, &hellip; in the body to define variables.
                  </div>
                );
              }
              const contiguous = isContiguousFromOne(nums);
              const blankExampleNums = nums.filter(num => !(form.examples[num - 1] || "").trim());
              const canSuggest = blankExampleNums.length > 0;
              return (
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <Label>Variables &amp; Examples</Label>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={!canSuggest}
                      onClick={() => setForm(f => {
                        const max = nums[nums.length - 1];
                        const nextEx = [...f.examples];
                        while (nextEx.length < max) nextEx.push("");
                        for (const num of nums) {
                          const idx = num - 1;
                          if (!(nextEx[idx] || "").trim()) {
                            nextEx[idx] = exampleFor(f.variables[idx] || "", idx);
                          }
                        }
                        return { ...f, examples: nextEx };
                      })}
                      data-testid="button-suggest-examples"
                      title={canSuggest
                        ? `Fill ${blankExampleNums.length} blank example${blankExampleNums.length === 1 ? "" : "s"} with suggested values`
                        : "All examples are already filled"}
                    >
                      Use suggested values
                      {canSuggest ? ` (${blankExampleNums.length})` : ""}
                    </Button>
                  </div>
                  {!contiguous && (
                    <p className="text-xs text-amber-600 dark:text-amber-400" data-testid="text-noncontiguous-warning">
                      Placeholders should be numbered &#123;&#123;1&#125;&#125;, &#123;&#123;2&#125;&#125;, &#123;&#123;3&#125;&#125; &hellip; without gaps. Found: {nums.map(n => `{{${n}}}`).join(", ")}.
                    </p>
                  )}
                  <div className="space-y-2">
                    {nums.map(num => {
                      const i = num - 1;
                      const varName = form.variables[i] || "";
                      const exampleVal = form.examples[i] || "";
                      const generatedExample = exampleFor(varName, i);
                      const matchedField = MERGE_FIELD_BY_KEY[varName];
                      return (
                        <div
                          key={num}
                          className="grid grid-cols-[auto_180px_1fr_1fr] gap-2 items-center"
                          data-testid={`row-variable-${num}`}
                        >
                          <span className="text-xs font-mono bg-muted px-2 py-1.5 rounded shrink-0" data-testid={`label-placeholder-${num}`}>
                            {`{{${num}}}`}
                          </span>
                          <Select
                            value={matchedField ? varName : ""}
                            onValueChange={key => setForm(f => {
                              const field = MERGE_FIELD_BY_KEY[key];
                              if (!field) return f;
                              const nextVars = [...f.variables];
                              const nextEx = [...f.examples];
                              while (nextVars.length < num) nextVars.push("");
                              while (nextEx.length < num) nextEx.push("");
                              nextVars[i] = field.key;
                              nextEx[i] = field.example;
                              return { ...f, variables: nextVars, examples: nextEx };
                            })}
                          >
                            <SelectTrigger className="text-xs h-9" data-testid={`select-merge-field-${num}`}>
                              <SelectValue placeholder="Common field…" />
                            </SelectTrigger>
                            <SelectContent>
                              {COMMON_MERGE_FIELDS.map(f => (
                                <SelectItem key={f.key} value={f.key}>{f.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Input
                            value={varName}
                            onChange={e => setForm(f => {
                              const next = [...f.variables];
                              while (next.length < num) next.push("");
                              next[i] = e.target.value;
                              return { ...f, variables: next };
                            })}
                            placeholder={`var${num}`}
                            className="text-sm"
                            data-testid={`input-variable-name-${num}`}
                          />
                          <Input
                            value={exampleVal}
                            onChange={e => setForm(f => {
                              const next = [...f.examples];
                              while (next.length < num) next.push("");
                              next[i] = e.target.value;
                              return { ...f, examples: next };
                            })}
                            placeholder={generatedExample}
                            className="text-sm"
                            data-testid={`input-variable-example-${num}`}
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}

            <div className="space-y-1.5">
              <Label>Live Preview</Label>
              <div
                className="rounded-md border bg-[#dcf8c6] dark:bg-green-950/30 text-sm text-foreground p-3 whitespace-pre-wrap min-h-[60px]"
                data-testid="text-template-preview"
              >
                {form.body
                  ? renderPreview(form.body, form.variables, form.examples)
                  : <span className="text-muted-foreground italic">Type a body above to see the preview&hellip;</span>}
              </div>
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

      {/* Status History Dialog */}
      <Dialog open={!!historyTemplate} onOpenChange={(open) => { if (!open) setHistoryTemplate(null); }}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Status History{historyTemplate ? `: ${historyTemplate.name}` : ""}</DialogTitle>
          </DialogHeader>
          <div className="py-2">
            {historyLoading ? (
              <div className="text-sm text-muted-foreground text-center py-6">Loading history...</div>
            ) : history.length === 0 ? (
              <div className="text-sm text-muted-foreground text-center py-6 space-y-1" data-testid="text-history-empty">
                <History className="w-8 h-8 mx-auto opacity-30" />
                <p>No status changes recorded yet.</p>
                <p className="text-xs">Future syncs will record any status transitions here.</p>
              </div>
            ) : (
              <ol className="relative border-l border-muted-foreground/30 ml-3 space-y-4" data-testid="list-history">
                {history.map((h) => {
                  const Icon = STATUS_ICONS[h.newStatus] || Clock;
                  const colorClass = STATUS_COLORS[h.newStatus] || STATUS_COLORS["pending_approval"];
                  const sourceLabel = h.source === "scheduled"
                    ? "daily sync"
                    : h.source === "manual"
                      ? "manual sync"
                      : h.source === "manual_edit"
                        ? "manual edit"
                        : h.source;
                  return (
                    <li key={h.id} className="ml-4" data-testid={`history-entry-${h.id}`}>
                      <span className={`absolute -left-[9px] flex items-center justify-center w-4 h-4 rounded-full ${colorClass}`}>
                        <Icon className="w-2.5 h-2.5" />
                      </span>
                      <div className="text-xs text-muted-foreground" title={formatExactTime(h.createdAt as unknown as string)}>
                        {formatRelativeTime(h.createdAt as unknown as string)} · via {sourceLabel}
                      </div>
                      <div className="text-sm flex items-center gap-2 flex-wrap mt-0.5">
                        {h.previousStatus ? (
                          <>
                            <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium ${STATUS_COLORS[h.previousStatus] || STATUS_COLORS["pending_approval"]}`}>
                              {h.previousStatus.replace(/_/g, " ")}
                            </span>
                            <span aria-hidden>→</span>
                          </>
                        ) : (
                          <span className="text-xs text-muted-foreground">created as</span>
                        )}
                        <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium ${colorClass}`}>
                          {h.newStatus.replace(/_/g, " ")}
                        </span>
                      </div>
                      <div className="text-[11px] text-muted-foreground/80 mt-0.5">{formatExactTime(h.createdAt as unknown as string)}</div>
                    </li>
                  );
                })}
              </ol>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setHistoryTemplate(null)} data-testid="button-close-history">Close</Button>
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
