import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Activity, AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, Inbox, RefreshCw, Trash2, XCircle } from "lucide-react";

interface WebhookStats {
  pending: number;
  processing: number;
  failed: number;
  deadLetter: number;
  lastJobAt: string | null;
}

interface WebhookConfig {
  url: string;
  baseUrlConfigured: boolean;
  tokenConfigured: boolean;
  secretConfigured: boolean;
  env: string;
}

interface RejectedPayload {
  id: string;
  reason: string;
  httpStatus: number;
  method: string;
  path: string;
  query: any;
  headers: any;
  rawBody: string | null;
  rawBodyTruncated: boolean;
  createdAt: string;
}

interface DeadLetterJob {
  id: string;
  jobType: string;
  payload: any;
  lastError: string | null;
  attempts: number;
  manualRetryAttempts: number;
  createdAt: string;
  deadLetteredAt: string;
}

interface DebugCapture {
  id: string;
  source: string;
  eventType: string;
  rawPayload: any;
  notes: string | null;
  createdAt: string;
}

interface DebugCaptureResponse {
  rows: DebugCapture[];
  captureEnabled: boolean;
  captureTypes: string[];
}

const SILENCE_HOURS = 6;
const BUSINESS_START_HOUR_IST = 9;
const BUSINESS_END_HOUR_IST = 19;

function formatRelative(iso: string | null): string {
  if (!iso) return "never";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "never";
  const diff = Date.now() - t;
  const sec = Math.round(diff / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const days = Math.round(hr / 24);
  return `${days}d ago`;
}

function isBusinessHoursIST(d = new Date()): boolean {
  const istHour = (d.getUTCHours() + 5) % 24 + (d.getUTCMinutes() >= 30 ? 0.5 : 0);
  const h = Math.floor(istHour);
  return h >= BUSINESS_START_HOUR_IST && h < BUSINESS_END_HOUR_IST;
}

function computeSilenceState(lastJobAt: string | null): { silent: boolean; hours: number } {
  if (!lastJobAt) return { silent: isBusinessHoursIST(), hours: Infinity };
  const diffH = (Date.now() - new Date(lastJobAt).getTime()) / 3_600_000;
  return { silent: diffH > SILENCE_HOURS && isBusinessHoursIST(), hours: diffH };
}

export function WebhookHealthCard() {
  const { toast } = useToast();
  const [showRejected, setShowRejected] = useState(false);
  const [showDeadLetter, setShowDeadLetter] = useState(false);
  const [showCaptures, setShowCaptures] = useState(false);
  const [expandedRejectedId, setExpandedRejectedId] = useState<string | null>(null);
  const [expandedDLId, setExpandedDLId] = useState<string | null>(null);
  const [expandedCaptureId, setExpandedCaptureId] = useState<string | null>(null);

  const statsQ = useQuery<WebhookStats>({
    queryKey: ["/api/whatsapp/webhook/stats"],
    refetchInterval: 30_000,
  });
  const configQ = useQuery<WebhookConfig>({
    queryKey: ["/api/whatsapp/webhook/config"],
    refetchInterval: 60_000,
  });
  const rejectedQ = useQuery<RejectedPayload[]>({
    queryKey: ["/api/whatsapp/webhook/rejected"],
    enabled: showRejected,
    refetchInterval: showRejected ? 30_000 : false,
  });
  const deadLetterQ = useQuery<DeadLetterJob[]>({
    queryKey: ["/api/whatsapp/webhook/dead-letter"],
    refetchInterval: 30_000,
  });
  const capturesQ = useQuery<DebugCaptureResponse>({
    queryKey: ["/api/whatsapp/debug-captures"],
    enabled: showCaptures,
    refetchInterval: showCaptures ? 30_000 : false,
  });

  const retryMutation = useMutation({
    mutationFn: async (id: string) => apiRequest("POST", `/api/whatsapp/webhook/dead-letter/${id}/retry`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/whatsapp/webhook/dead-letter"] });
      queryClient.invalidateQueries({ queryKey: ["/api/whatsapp/webhook/stats"] });
      toast({ title: "Job re-queued for retry" });
    },
    onError: (err: any) => toast({ title: "Retry failed", description: err?.message || "", variant: "destructive" }),
  });
  const discardMutation = useMutation({
    mutationFn: async (id: string) => apiRequest("DELETE", `/api/whatsapp/webhook/dead-letter/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/whatsapp/webhook/dead-letter"] });
      toast({ title: "Dead-letter job discarded" });
    },
    onError: (err: any) => toast({ title: "Discard failed", description: err?.message || "", variant: "destructive" }),
  });

  const stats = statsQ.data;
  const cfg = configQ.data;
  const silence = computeSilenceState(stats?.lastJobAt ?? null);
  const deadLetterCount = stats?.deadLetter ?? 0;
  const dlRows = deadLetterQ.data ?? [];

  return (
    <Card data-testid="card-webhook-health">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Activity className="w-4 h-4" />
          WhatsApp Webhook Health
          <Badge variant="outline" className="ml-auto text-xs font-normal">admin only</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Silence banner */}
        {silence.silent && (
          <div
            className="flex items-start gap-2 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-900 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200"
            data-testid="banner-webhook-silent"
          >
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
            <div>
              <div className="font-medium">
                WhatsApp webhook silent for {Number.isFinite(silence.hours) ? `${silence.hours.toFixed(1)}h` : "ever"} during business hours
              </div>
              <div className="text-xs opacity-80 mt-0.5">Check Interakt webhook configuration. Threshold: {SILENCE_HOURS}h, business hours 09:00–19:00 IST.</div>
            </div>
          </div>
        )}

        {/* Top row: 4 stat tiles */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatTile
            label="Last received"
            value={formatRelative(stats?.lastJobAt ?? null)}
            sub={stats?.lastJobAt ? new Date(stats.lastJobAt).toLocaleString() : ""}
            testId="stat-last-received"
          />
          <StatTile
            label="Pending / Processing"
            value={`${stats?.pending ?? 0} / ${stats?.processing ?? 0}`}
            sub="Active queue"
            testId="stat-queue"
          />
          <StatTile
            label="Failed (in queue)"
            value={String(stats?.failed ?? 0)}
            sub="Retrying"
            tone={stats?.failed && stats.failed > 0 ? "warn" : "ok"}
            testId="stat-failed"
          />
          <StatTile
            label="Dead-letter"
            value={String(deadLetterCount)}
            sub={deadLetterCount > 0 ? "Manual action needed" : "All clear"}
            tone={deadLetterCount > 0 ? "warn" : "ok"}
            testId="stat-dead-letter"
          />
        </div>

        {/* Webhook config */}
        <div className="rounded-md border p-3 text-xs space-y-1.5" data-testid="section-webhook-config">
          <div className="font-medium text-sm mb-1">Configuration</div>
          <ConfigRow label="URL" value={cfg?.url || "—"} testId="config-url" />
          <ConfigRow label="Environment" value={cfg?.env || "—"} testId="config-env" />
          <ConfigFlag label="Base URL set (WHATSAPP_WEBHOOK_BASE_URL)" ok={!!cfg?.baseUrlConfigured} />
          <ConfigFlag label="Token set (WHATSAPP_WEBHOOK_TOKEN)" ok={!!cfg?.tokenConfigured} />
          <ConfigFlag label="Signing secret set (INTERAKT_WEBHOOK_SECRET)" ok={!!cfg?.secretConfigured} />
        </div>

        {/* Dead-letter list */}
        <div className="rounded-md border" data-testid="section-dead-letter">
          <button
            type="button"
            onClick={() => setShowDeadLetter(v => !v)}
            className="w-full flex items-center justify-between p-3 text-sm font-medium hover:bg-muted/50"
            data-testid="button-toggle-dead-letter"
          >
            <span className="flex items-center gap-2">
              {showDeadLetter ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
              Dead-letter queue ({dlRows.length})
            </span>
            <Badge variant={deadLetterCount > 0 ? "destructive" : "secondary"} className="text-xs">
              {deadLetterCount > 0 ? "action needed" : "clear"}
            </Badge>
          </button>
          {showDeadLetter && (
            <div className="border-t divide-y">
              {dlRows.length === 0 ? (
                <div className="p-3 text-xs text-muted-foreground">No dead-letter jobs.</div>
              ) : (
                dlRows.map(row => {
                  const retryCapped = (row.manualRetryAttempts || 0) >= 3;
                  return (
                    <div key={row.id} className="p-3 text-xs space-y-1.5" data-testid={`row-dead-letter-${row.id}`}>
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="outline" className="text-xs font-mono">{row.jobType}</Badge>
                        <span className="text-muted-foreground">attempts: {row.attempts}</span>
                        <span className="text-muted-foreground">manual retries: {row.manualRetryAttempts || 0}/3</span>
                        <span className="text-muted-foreground ml-auto">{formatRelative(row.deadLetteredAt)}</span>
                      </div>
                      {row.lastError && (
                        <div className="text-red-700 dark:text-red-400 font-mono text-[11px] break-all" data-testid={`text-dl-error-${row.id}`}>
                          {row.lastError}
                        </div>
                      )}
                      <div className="flex items-center gap-2 pt-1">
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  disabled={retryCapped || retryMutation.isPending}
                                  onClick={() => retryMutation.mutate(row.id)}
                                  data-testid={`button-retry-dl-${row.id}`}
                                >
                                  <RefreshCw className="w-3 h-3 mr-1" />
                                  Retry
                                </Button>
                              </span>
                            </TooltipTrigger>
                            {retryCapped && (
                              <TooltipContent>
                                <p>Permanent failure — discard or escalate.</p>
                              </TooltipContent>
                            )}
                          </Tooltip>
                        </TooltipProvider>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={discardMutation.isPending}
                          onClick={() => discardMutation.mutate(row.id)}
                          data-testid={`button-discard-dl-${row.id}`}
                        >
                          <Trash2 className="w-3 h-3 mr-1" />
                          Discard
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setExpandedDLId(v => (v === row.id ? null : row.id))}
                          data-testid={`button-toggle-payload-dl-${row.id}`}
                        >
                          {expandedDLId === row.id ? "Hide payload" : "Show payload"}
                        </Button>
                      </div>
                      {expandedDLId === row.id && (
                        <pre className="bg-muted p-2 rounded text-[10px] overflow-auto max-h-64 mt-1" data-testid={`pre-dl-payload-${row.id}`}>
                          {JSON.stringify(row.payload, null, 2)}
                        </pre>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>

        {/* Rejected payload viewer */}
        <div className="rounded-md border" data-testid="section-rejected-payloads">
          <button
            type="button"
            onClick={() => setShowRejected(v => !v)}
            className="w-full flex items-center justify-between p-3 text-sm font-medium hover:bg-muted/50"
            data-testid="button-toggle-rejected"
          >
            <span className="flex items-center gap-2">
              {showRejected ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
              Rejected webhooks (last 20)
            </span>
            <Badge variant="outline" className="text-xs">redacted</Badge>
          </button>
          {showRejected && (
            <div className="border-t divide-y">
              {rejectedQ.isLoading ? (
                <div className="p-3 text-xs text-muted-foreground">Loading…</div>
              ) : !rejectedQ.data || rejectedQ.data.length === 0 ? (
                <div className="p-3 text-xs text-muted-foreground">No rejected webhooks captured.</div>
              ) : (
                rejectedQ.data.map(row => (
                  <div key={row.id} className="p-3 text-xs space-y-1" data-testid={`row-rejected-${row.id}`}>
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="destructive" className="text-xs font-mono">{row.reason}</Badge>
                      <span className="text-muted-foreground">HTTP {row.httpStatus}</span>
                      <span className="text-muted-foreground">{row.method} {row.path}</span>
                      <span className="text-muted-foreground ml-auto">{formatRelative(row.createdAt)}</span>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setExpandedRejectedId(v => (v === row.id ? null : row.id))}
                      data-testid={`button-toggle-rejected-${row.id}`}
                    >
                      {expandedRejectedId === row.id ? "Hide details" : "Show details"}
                    </Button>
                    {expandedRejectedId === row.id && (
                      <div className="space-y-1.5 mt-1">
                        <DetailBlock label="Headers" value={row.headers} />
                        <DetailBlock label="Query" value={row.query} />
                        <DetailBlock label={`Raw body${row.rawBodyTruncated ? " (truncated to 16 KB)" : ""}`} value={row.rawBody || "(empty)"} />
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* Debug payload captures */}
        <div className="rounded-md border" data-testid="section-debug-captures">
          <button
            type="button"
            onClick={() => setShowCaptures(v => !v)}
            className="w-full flex items-center justify-between p-3 text-sm font-medium hover:bg-muted/50"
            data-testid="button-toggle-captures"
          >
            <span className="flex items-center gap-2">
              {showCaptures ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
              Debug payload captures
              <Inbox className="w-3.5 h-3.5 text-muted-foreground" />
            </span>
            <Badge variant="outline" className="text-xs">
              {capturesQ.data?.captureEnabled
                ? `enabled: ${capturesQ.data.captureTypes.join(", ") || "—"}`
                : "disabled"}
            </Badge>
          </button>
          {showCaptures && (
            <div className="border-t">
              {!capturesQ.data?.captureEnabled && (
                <div className="p-3 text-xs text-muted-foreground border-b">
                  Set the env var <code className="bg-muted px-1 py-0.5 rounded">WHATSAPP_DEBUG_CAPTURE_TYPES</code> (comma-separated event types, e.g. <code className="bg-muted px-1 py-0.5 rounded">message_received</code>) to start capturing the first 5 real payloads of each type.
                </div>
              )}
              <div className="divide-y">
                {capturesQ.isLoading ? (
                  <div className="p-3 text-xs text-muted-foreground">Loading…</div>
                ) : !capturesQ.data?.rows || capturesQ.data.rows.length === 0 ? (
                  <div className="p-3 text-xs text-muted-foreground">No captures yet.</div>
                ) : (
                  capturesQ.data.rows.map(row => (
                    <div key={row.id} className="p-3 text-xs space-y-1" data-testid={`row-capture-${row.id}`}>
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="outline" className="text-xs font-mono">{row.source}</Badge>
                        <Badge variant="secondary" className="text-xs font-mono">{row.eventType}</Badge>
                        {row.notes && <span className="text-muted-foreground font-mono text-[11px]">{row.notes}</span>}
                        <span className="text-muted-foreground ml-auto">{formatRelative(row.createdAt)}</span>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setExpandedCaptureId(v => (v === row.id ? null : row.id))}
                        data-testid={`button-toggle-capture-${row.id}`}
                      >
                        {expandedCaptureId === row.id ? "Hide payload" : "Show payload"}
                      </Button>
                      {expandedCaptureId === row.id && (
                        <pre className="bg-muted p-2 rounded text-[10px] overflow-auto max-h-64 mt-1" data-testid={`pre-capture-payload-${row.id}`}>
                          {JSON.stringify(row.rawPayload, null, 2)}
                        </pre>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function StatTile({
  label, value, sub, tone, testId,
}: { label: string; value: string; sub?: string; tone?: "ok" | "warn"; testId: string }) {
  const toneCls =
    tone === "warn"
      ? "border-amber-300 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30"
      : "border-border";
  return (
    <div className={`rounded-md border p-3 ${toneCls}`} data-testid={testId}>
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold mt-0.5 break-all" data-testid={`${testId}-value`}>{value}</div>
      {sub && <div className="text-[11px] text-muted-foreground mt-0.5">{sub}</div>}
    </div>
  );
}

function ConfigRow({ label, value, testId }: { label: string; value: string; testId?: string }) {
  return (
    <div className="flex items-baseline gap-2" data-testid={testId}>
      <span className="text-muted-foreground shrink-0">{label}:</span>
      <span className="font-mono text-[11px] break-all">{value}</span>
    </div>
  );
}

function ConfigFlag({ label, ok }: { label: string; ok: boolean }) {
  return (
    <div className="flex items-center gap-2">
      {ok ? <CheckCircle2 className="w-3.5 h-3.5 text-green-600" /> : <XCircle className="w-3.5 h-3.5 text-red-600" />}
      <span className={ok ? "" : "text-red-700 dark:text-red-400"}>{label}</span>
    </div>
  );
}

function DetailBlock({ label, value }: { label: string; value: any }) {
  const text = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-0.5">{label}</div>
      <pre className="bg-muted p-2 rounded text-[10px] overflow-auto max-h-48 whitespace-pre-wrap break-all">{text}</pre>
    </div>
  );
}
