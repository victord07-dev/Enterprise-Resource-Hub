/**
 * Phase 4D-C — Financial Ratios report component.
 * Lazy-loaded from Reports.tsx > Financial Statements tab.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { FileText, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

// ── Types ─────────────────────────────────────────────────────────────────────
interface FinancialRatiosData {
  asOf:            string;
  generatedAt:     string;
  currentRatio:    number | null;
  debtEquityRatio: number | null;
  inputs: {
    currentAssets:      number;
    currentLiabilities: number;
    totalLiabilities:   number;
    totalEquity:        number;
  };
  interpretation: {
    currentRatio:    "healthy" | "warning" | "critical" | "no_liabilities";
    debtEquityRatio: "healthy" | "warning" | "high"     | "no_equity";
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function inr(n: number) {
  return "₹" + n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtRatio(n: number | null) {
  return n === null ? "N/A" : n.toFixed(2) + "x";
}

type InterpKey = "healthy" | "warning" | "critical" | "high" | "no_liabilities" | "no_equity";

const INTERP_CONFIG: Record<InterpKey, { label: string; variant: "default" | "secondary" | "destructive" | "outline"; color: string }> = {
  healthy:        { label: "Healthy",              variant: "default",     color: "text-green-700 dark:text-green-400" },
  warning:        { label: "Caution",              variant: "secondary",   color: "text-amber-700 dark:text-amber-400" },
  critical:       { label: "Below Safe Threshold", variant: "destructive", color: "text-red-700 dark:text-red-400" },
  high:           { label: "High Leverage",        variant: "destructive", color: "text-red-700 dark:text-red-400" },
  no_liabilities: { label: "No Current Liabilities", variant: "outline",  color: "text-muted-foreground" },
  no_equity:      { label: "No Equity Recorded",   variant: "outline",    color: "text-muted-foreground" },
};

const RATIO_BG: Record<InterpKey, string> = {
  healthy:        "border-green-200 bg-green-50 dark:bg-green-950/20 dark:border-green-800",
  warning:        "border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800",
  critical:       "border-red-200 bg-red-50 dark:bg-red-950/20 dark:border-red-800",
  high:           "border-red-200 bg-red-50 dark:bg-red-950/20 dark:border-red-800",
  no_liabilities: "border-border bg-muted/20",
  no_equity:      "border-border bg-muted/20",
};

function InterpIcon({ k }: { k: InterpKey }) {
  if (k === "healthy")        return <TrendingUp  className="w-5 h-5 text-green-600" />;
  if (k === "warning")        return <Minus       className="w-5 h-5 text-amber-600" />;
  return                             <TrendingDown className="w-5 h-5 text-red-600" />;
}

// ── Ratio Card ────────────────────────────────────────────────────────────────
function RatioCard({
  title, formula, value, interpKey, benchmark,
}: {
  title:     string;
  formula:   string;
  value:     number | null;
  interpKey: InterpKey;
  benchmark: string;
}) {
  const cfg = INTERP_CONFIG[interpKey];
  return (
    <Card className={`border-2 ${RATIO_BG[interpKey]}`}>
      <CardContent className="p-5 space-y-3">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm font-semibold text-foreground">{title}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{formula}</p>
          </div>
          <InterpIcon k={interpKey} />
        </div>

        <div className="flex items-end gap-3">
          <span className={`text-4xl font-bold tracking-tight ${cfg.color}`}>
            {fmtRatio(value)}
          </span>
          <Badge variant={cfg.variant} className="mb-1 text-xs">
            {cfg.label}
          </Badge>
        </div>

        <p className="text-xs text-muted-foreground border-t pt-2">{benchmark}</p>
      </CardContent>
    </Card>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function FinancialRatios() {
  const { toast } = useToast();
  const [asOf, setAsOf]           = useState(new Date().toISOString().split("T")[0]);
  const [queryAsOf, setQueryAsOf] = useState(asOf);

  const { data, isLoading, error } = useQuery<FinancialRatiosData>({
    queryKey: ["/api/reports/financial-ratios", queryAsOf],
    queryFn:  () => apiRequest("GET", `/api/reports/financial-ratios?asOf=${queryAsOf}`).then(r => r.json()),
  });

  async function downloadPdf() {
    try {
      const res = await apiRequest("GET", `/api/reports/financial-ratios/pdf?asOf=${queryAsOf}`);
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href = url; a.download = `Financial-Ratios-${queryAsOf}.pdf`; a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  }

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex flex-wrap items-end gap-4 justify-between">
        <div className="flex items-end gap-3">
          <div className="space-y-1">
            <Label className="text-xs">As of Date</Label>
            <Input
              type="date"
              value={asOf}
              onChange={e => setAsOf(e.target.value)}
              className="w-40"
              data-testid="input-fr-as-of"
            />
          </div>
          <Button size="sm" onClick={() => setQueryAsOf(asOf)} data-testid="button-fr-run">
            Run
          </Button>
        </div>
        <Button variant="outline" size="sm" onClick={downloadPdf} disabled={!data} data-testid="button-fr-pdf">
          <FileText className="w-4 h-4 mr-1" />PDF
        </Button>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {[0, 1].map(i => (
            <Card key={i}><CardContent className="p-5 space-y-3">
              {Array.from({ length: 4 }).map((_, j) => <Skeleton key={j} className="h-6 w-full" />)}
            </CardContent></Card>
          ))}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          Failed to load financial ratios. Check server logs.
        </div>
      )}

      {data && !isLoading && (
        <>
          {/* Ratio Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <RatioCard
              title="Current Ratio"
              formula="Current Assets ÷ Current Liabilities"
              value={data.currentRatio}
              interpKey={data.interpretation.currentRatio as InterpKey}
              benchmark="≥ 1.5 healthy · 1.0–1.49 caution · < 1.0 critical"
            />
            <RatioCard
              title="Total Liabilities / Total Equity"
              formula="Total Liabilities ÷ Total Equity"
              value={data.debtEquityRatio}
              interpKey={data.interpretation.debtEquityRatio as InterpKey}
              benchmark="≤ 1.0 healthy · 1.01–2.0 caution · > 2.0 high leverage"
            />
          </div>

          {/* Input Breakdown Table */}
          <Card>
            <CardContent className="p-0">
              <div className="px-4 py-2 bg-muted/40 border-b">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Input Breakdown — All figures as of {data.asOf}
                </p>
              </div>
              <table className="w-full">
                <thead>
                  <tr className="border-b bg-muted/20">
                    <th className="p-2 pl-4 text-left text-xs font-medium text-muted-foreground">Line Item</th>
                    <th className="p-2 text-left text-xs font-medium text-muted-foreground">Used In</th>
                    <th className="p-2 pr-4 text-right text-xs font-medium text-muted-foreground">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b">
                    <td className="p-2 pl-4 text-sm">Current Assets</td>
                    <td className="p-2 text-xs text-muted-foreground">Current Ratio (numerator)</td>
                    <td className="p-2 pr-4 text-right text-sm font-medium">{inr(data.inputs.currentAssets)}</td>
                  </tr>
                  <tr className="border-b bg-muted/10">
                    <td className="p-2 pl-4 text-sm">Current Liabilities</td>
                    <td className="p-2 text-xs text-muted-foreground">Current Ratio (denominator)</td>
                    <td className="p-2 pr-4 text-right text-sm font-medium">{inr(data.inputs.currentLiabilities)}</td>
                  </tr>
                  <tr className="border-b">
                    <td className="p-2 pl-4 text-sm font-semibold">Total Liabilities</td>
                    <td className="p-2 text-xs text-muted-foreground">Total Liabilities / Total Equity (numerator)</td>
                    <td className="p-2 pr-4 text-right text-sm font-semibold">{inr(data.inputs.totalLiabilities)}</td>
                  </tr>
                  <tr className="border-b bg-muted/10">
                    <td className="p-2 pl-4 text-sm font-semibold">Total Equity</td>
                    <td className="p-2 text-xs text-muted-foreground">Total Liabilities / Total Equity (denominator)</td>
                    <td className="p-2 pr-4 text-right text-sm font-semibold">{inr(data.inputs.totalEquity)}</td>
                  </tr>
                </tbody>
              </table>
              <div className="px-4 py-2 border-t">
                <p className="text-xs text-muted-foreground">
                  Generated at {new Date(data.generatedAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} IST
                </p>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
