import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CheckCircle, XCircle, Send, Users, UserPlus, Phone, Tag, Loader2, Megaphone, Eye, AlertTriangle } from "lucide-react";
import type { WhatsappTemplate } from "@shared/schema";
import { MERGE_FIELD_BY_KEY, isCommonMergeField } from "@shared/mergeFields";

type PreviewVar = { index: number; fieldKey: string | null; label: string | null; value: string; source: "manual" | "auto" | "missing" };
type PreviewSample = { phone: string; contactName: string | null; renderedBody: string | null; variables: PreviewVar[]; missingFields: { index: number; fieldKey: string; label: string }[] };
type PreviewResponse = { totalRecipients: number; sample: PreviewSample[] };

const AUDIENCE_AUTOFILLABLE_KEYS: Record<string, Set<string>> = {
  customers: new Set(["customer_name", "contact_person", "phone", "email", "address", "gst_number"]),
  leads: new Set(["customer_name", "contact_person", "company_name", "phone", "email", "address", "gst_number"]),
};

type CampaignResult = { phone: string; customerId: string | null; contactName: string | null; status: "sent" | "failed" | "skipped"; messageId: string | null; error: string | null };

const AUDIENCE_OPTIONS = [
  { value: "customers", label: "All Customers", icon: Users },
  { value: "leads", label: "All Leads", icon: UserPlus },
  { value: "custom", label: "Custom Phone List", icon: Phone },
];

export default function Campaigns() {
  const { toast } = useToast();
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const [audience, setAudience] = useState<string>("customers");
  const [customPhones, setCustomPhones] = useState<string>("");
  const [templateVars, setTemplateVars] = useState<string[]>([]);
  const [results, setResults] = useState<CampaignResult[] | null>(null);
  const [sentCount, setSentCount] = useState(0);
  const [failedCount, setFailedCount] = useState(0);
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const { data: templates = [] } = useQuery<WhatsappTemplate[]>({
    queryKey: ["/api/whatsapp/templates"],
  });

  const approvedTemplates = templates.filter(t => t.isActive === "approved");
  const selectedTemplate = approvedTemplates.find(t => t.id === selectedTemplateId);

  const sendMutation = useMutation({
    mutationFn: async () => {
      const phones = audience === "custom"
        ? customPhones.split(/[\n,]/).map(p => p.trim()).filter(Boolean)
        : [];
      const res = await apiRequest("POST", "/api/whatsapp/campaigns/send", {
        templateName: selectedTemplate?.interaktTemplateName,
        variables: templateVars,
        variableNames: selectedTemplate?.variables || [],
        audience: audience !== "custom" ? audience : undefined,
        phones,
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.message); }
      return res.json();
    },
    onSuccess: (data: any) => {
      setResults(data.results || []);
      setSentCount(data.sent || 0);
      setFailedCount(data.failed || 0);
      toast({ title: `Campaign sent`, description: `${data.sent} sent, ${data.failed} failed` });
    },
    onError: (e: Error) => toast({ title: "Campaign failed", description: e.message, variant: "destructive" }),
  });

  const canSend = !!selectedTemplate && (audience !== "custom" || customPhones.trim().length > 0);

  useEffect(() => {
    if (!selectedTemplate) { setPreview(null); setPreviewError(null); return; }
    if (audience === "custom" && customPhones.trim().length === 0) { setPreview(null); setPreviewError(null); return; }
    let cancelled = false;
    const handle = setTimeout(async () => {
      setPreviewLoading(true);
      setPreviewError(null);
      try {
        const phones = audience === "custom"
          ? customPhones.split(/[\n,]/).map(p => p.trim()).filter(Boolean)
          : [];
        const res = await apiRequest("POST", "/api/whatsapp/campaigns/preview", {
          templateId: selectedTemplate.id,
          variables: templateVars,
          variableNames: selectedTemplate.variables || [],
          audience: audience !== "custom" ? audience : undefined,
          phones,
          limit: 3,
        });
        if (!res.ok) {
          const e = await res.json().catch(() => ({}));
          throw new Error(e.message || "Preview failed");
        }
        const data: PreviewResponse = await res.json();
        if (!cancelled) setPreview(data);
      } catch (e: any) {
        if (!cancelled) { setPreview(null); setPreviewError(e?.message || "Preview failed"); }
      } finally {
        if (!cancelled) setPreviewLoading(false);
      }
    }, 300);
    return () => { cancelled = true; clearTimeout(handle); };
  }, [selectedTemplateId, audience, customPhones, JSON.stringify(templateVars), JSON.stringify(selectedTemplate?.variables || [])]);

  return (
    <div className="p-6 space-y-6 overflow-auto h-full">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2" data-testid="text-page-title">
          <Megaphone className="w-6 h-6" />
          WhatsApp Campaigns
        </h1>
        <p className="text-muted-foreground text-sm mt-1">Send bulk template messages to customers or leads</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Campaign setup */}
        <div className="space-y-5">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Tag className="w-4 h-4" /> Select Template
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {approvedTemplates.length === 0 ? (
                <div className="text-sm text-muted-foreground bg-muted/50 rounded-md p-4 text-center">
                  No approved templates. Create templates in WhatsApp Templates.
                </div>
              ) : (
                <div className="space-y-2">
                  {approvedTemplates.map(t => (
                    <div
                      key={t.id}
                      className={`p-3 rounded-lg border cursor-pointer transition-colors ${selectedTemplateId === t.id ? "border-blue-500 bg-blue-50 dark:bg-blue-950/20" : "hover:bg-muted/50"}`}
                      onClick={() => {
                        setSelectedTemplateId(t.id);
                        setTemplateVars(new Array(t.variables?.length || 0).fill(""));
                      }}
                      data-testid={`template-option-${t.id}`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-sm font-medium">{t.name}</p>
                        <Badge variant="outline" className="text-[10px] no-default-hover-elevate no-default-active-elevate">{t.category}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">{t.body}</p>
                    </div>
                  ))}
                </div>
              )}

              {selectedTemplate && selectedTemplate.variables && selectedTemplate.variables.length > 0 && (
                <div className="space-y-2 border-t pt-3">
                  <p className="text-xs font-semibold text-muted-foreground">Template Variables</p>
                  {selectedTemplate.variables.map((varName, i) => {
                    const field = varName ? MERGE_FIELD_BY_KEY[varName] : undefined;
                    const audienceAutofillable = AUDIENCE_AUTOFILLABLE_KEYS[audience];
                    const canAutofill = !!field && !!audienceAutofillable && audienceAutofillable.has(field.key);
                    return (
                      <div key={i} className="space-y-1">
                        <Label className="text-xs flex items-center gap-2">
                          <span>{field ? field.label : (varName || `{{${i + 1}}}`)}</span>
                          {canAutofill && (
                            <Badge
                              variant="outline"
                              className="text-[9px] py-0 h-4 no-default-hover-elevate no-default-active-elevate"
                              data-testid={`badge-autofill-${i}`}
                            >
                              Auto-filled per recipient
                            </Badge>
                          )}
                          {field && !canAutofill && audience !== "custom" && (
                            <span className="text-[10px] text-muted-foreground">(known field)</span>
                          )}
                        </Label>
                        <Input
                          className="h-8 text-xs"
                          value={templateVars[i] || ""}
                          onChange={e => {
                            const updated = [...templateVars];
                            updated[i] = e.target.value;
                            setTemplateVars(updated);
                          }}
                          placeholder={canAutofill ? `Auto-filled from ${audience} record (override here)` : (field?.example || "")}
                          data-testid={`input-var-${i}`}
                        />
                      </div>
                    );
                  })}
                  {selectedTemplate.variables.some(v => isCommonMergeField(v)) && audience !== "custom" && (
                    <p className="text-[11px] text-muted-foreground" data-testid="text-autofill-help">
                      Variables matching common fields will be filled from each recipient's record. Type a value above to override for everyone.
                    </p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Users className="w-4 h-4" /> Audience
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-3 gap-2">
                {AUDIENCE_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    className={`flex flex-col items-center gap-2 p-3 rounded-lg border text-sm transition-colors ${audience === opt.value ? "border-blue-500 bg-blue-50 dark:bg-blue-950/20 text-blue-700 dark:text-blue-300" : "hover:bg-muted/50"}`}
                    onClick={() => setAudience(opt.value)}
                    data-testid={`audience-${opt.value}`}
                  >
                    <opt.icon className="w-5 h-5" />
                    <span className="text-xs font-medium">{opt.label}</span>
                  </button>
                ))}
              </div>

              {audience === "custom" && (
                <div className="space-y-1.5">
                  <Label className="text-xs">Phone Numbers (one per line or comma separated)</Label>
                  <Textarea
                    placeholder={"9876543210\n9123456789\n..."}
                    className="text-xs min-h-[100px] font-mono"
                    value={customPhones}
                    onChange={e => setCustomPhones(e.target.value)}
                    data-testid="textarea-custom-phones"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    {customPhones.split(/[\n,]/).map(p => p.trim()).filter(Boolean).length} numbers entered
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          <Button
            className="w-full"
            disabled={!canSend || sendMutation.isPending}
            onClick={() => sendMutation.mutate()}
            data-testid="button-send-campaign"
          >
            {sendMutation.isPending ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Sending...</>
            ) : (
              <><Send className="w-4 h-4 mr-2" /> Send Campaign</>
            )}
          </Button>
        </div>

        {/* Right: Preview + Results */}
        <div className="space-y-4">
          {selectedTemplate && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Eye className="w-4 h-4" /> Recipient Preview
                  {preview && (
                    <Badge variant="outline" className="text-[10px] no-default-hover-elevate no-default-active-elevate" data-testid="badge-preview-total">
                      {preview.totalRecipients} total · showing {preview.sample.length}
                    </Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {previewLoading && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground" data-testid="text-preview-loading">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" /> Building preview…
                  </div>
                )}
                {previewError && !previewLoading && (
                  <p className="text-xs text-red-600 dark:text-red-400" data-testid="text-preview-error">{previewError}</p>
                )}
                {!previewLoading && !previewError && preview && preview.sample.length === 0 && (
                  <p className="text-xs text-muted-foreground" data-testid="text-preview-empty">
                    {audience === "custom" ? "Enter at least one phone number to see a preview." : "No recipients match this audience yet."}
                  </p>
                )}
                {!previewLoading && !previewError && preview && preview.sample.map((s, i) => {
                  const hasMissing = s.missingFields.length > 0;
                  return (
                    <div key={i} className={`rounded-md border p-3 space-y-2 ${hasMissing ? "border-amber-300 bg-amber-50/60 dark:border-amber-900 dark:bg-amber-950/20" : "bg-muted/30"}`} data-testid={`preview-recipient-${i}`}>
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-xs font-medium truncate" data-testid={`preview-name-${i}`}>{s.contactName || "(no name)"}</p>
                          <p className="text-[11px] font-mono text-muted-foreground truncate" data-testid={`preview-phone-${i}`}>{s.phone}</p>
                        </div>
                        {hasMissing && (
                          <Badge variant="outline" className="text-[10px] gap-1 border-amber-400 text-amber-700 dark:text-amber-300 no-default-hover-elevate no-default-active-elevate" data-testid={`badge-missing-${i}`}>
                            <AlertTriangle className="w-3 h-3" />
                            {s.missingFields.length} missing
                          </Badge>
                        )}
                      </div>
                      {s.renderedBody && (
                        <pre className="text-[11px] whitespace-pre-wrap font-sans bg-background rounded p-2 border" data-testid={`preview-body-${i}`}>{s.renderedBody}</pre>
                      )}
                      {hasMissing && (
                        <div className="text-[11px] text-amber-700 dark:text-amber-300" data-testid={`preview-missing-list-${i}`}>
                          Missing: {s.missingFields.map(m => MERGE_FIELD_BY_KEY[m.fieldKey]?.label || m.label).join(", ")}
                        </div>
                      )}
                    </div>
                  );
                })}
                {preview && preview.sample.some(s => s.missingFields.length > 0) && (
                  <div className="space-y-1">
                    <p className="text-[11px] text-amber-700 dark:text-amber-400" data-testid="text-preview-warning">
                      Some recipients are missing values for required fields. Update those records or set a manual value above before sending.
                    </p>
                    <p className="text-[11px] text-muted-foreground" data-testid="text-preview-placeholder-note">
                      Note: <span className="font-mono">[missing: …]</span> markers are shown here as a warning — they are not sent in the actual message (the field is left blank).
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {results !== null && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Campaign Results</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-green-50 dark:bg-green-950/30 rounded-lg p-3 text-center">
                    <p className="text-2xl font-bold text-green-700 dark:text-green-400" data-testid="text-sent-count">{sentCount}</p>
                    <p className="text-xs text-muted-foreground">Sent</p>
                  </div>
                  <div className="bg-red-50 dark:bg-red-950/30 rounded-lg p-3 text-center">
                    <p className="text-2xl font-bold text-red-700 dark:text-red-400" data-testid="text-failed-count">{failedCount}</p>
                    <p className="text-xs text-muted-foreground">Failed</p>
                  </div>
                </div>
                <div className="max-h-[400px] overflow-y-auto space-y-1">
                  {results.map((r, i) => (
                    <div key={i} className={`text-xs px-3 py-2 rounded-md ${r.status === "sent" ? "bg-green-50 dark:bg-green-950/20" : "bg-red-50 dark:bg-red-950/20"}`} data-testid={`result-${i}`}>
                      <div className="flex items-center justify-between">
                        <span className="font-mono">{r.phone}</span>
                        <div className="flex items-center gap-1">
                          {r.status === "sent"
                            ? <CheckCircle className="w-3.5 h-3.5 text-green-600 dark:text-green-400" />
                            : <XCircle className="w-3.5 h-3.5 text-red-600 dark:text-red-400" />}
                          <span className={r.status === "sent" ? "text-green-700 dark:text-green-400" : "text-red-700 dark:text-red-400"}>{r.status}</span>
                        </div>
                      </div>
                      {r.contactName && <div className="text-muted-foreground truncate">{r.contactName}</div>}
                      {r.error && <div className="text-red-600 dark:text-red-400 truncate mt-0.5">Error: {r.error}</div>}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {results === null && (
            <div className="flex flex-col items-center justify-center h-64 text-muted-foreground gap-3 border rounded-lg">
              <Megaphone className="w-10 h-10 opacity-20" />
              <p className="text-sm">Campaign results will appear here</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
