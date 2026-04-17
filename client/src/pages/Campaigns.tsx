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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CheckCircle, XCircle, Send, Users, UserPlus, Phone, Tag, Loader2, Megaphone } from "lucide-react";
import type { WhatsappTemplate } from "@shared/schema";

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

  const { data: templates = [] } = useQuery<WhatsappTemplate[]>({
    queryKey: ["/api/whatsapp/templates"],
  });

  const approvedTemplates = templates.filter(t => t.status === "approved");
  const selectedTemplate = approvedTemplates.find(t => t.id === selectedTemplateId);

  const sendMutation = useMutation({
    mutationFn: async () => {
      const phones = audience === "custom"
        ? customPhones.split(/[\n,]/).map(p => p.trim()).filter(Boolean)
        : [];
      const res = await apiRequest("POST", "/api/whatsapp/campaigns/send", {
        templateName: selectedTemplate?.templateId,
        variables: templateVars,
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
                  {selectedTemplate.variables.map((varName, i) => (
                    <div key={i} className="space-y-1">
                      <Label className="text-xs">{varName || `{{${i + 1}}}`}</Label>
                      <Input
                        className="h-8 text-xs"
                        value={templateVars[i] || ""}
                        onChange={e => {
                          const updated = [...templateVars];
                          updated[i] = e.target.value;
                          setTemplateVars(updated);
                        }}
                        data-testid={`input-var-${i}`}
                      />
                    </div>
                  ))}
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

        {/* Right: Results */}
        <div className="space-y-4">
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
