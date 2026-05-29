/**
 * Phase 4D-B — Balance Sheet report component.
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
import { Download, FileSpreadsheet, FileText, CheckCircle2, AlertTriangle, ChevronDown, ChevronRight } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

// ── Types (mirrors BalanceSheetResult from financial-aggregations.ts) ─────────
interface BSChild  { label: string; amount: number; note?: string }
interface BSSection { label: string; amount: number; children: BSChild[] }

interface BalanceSheetData {
  asOf: string;
  assets: {
    nonCurrent:            BSSection[];
    current:               BSSection[];
    totalNonCurrentAssets: number;
    totalCurrentAssets:    number;
    totalAssets:           number;
  };
  liabilities: {
    current:                    BSSection[];
    nonCurrent:                 BSSection[];
    totalCurrentLiabilities:    number;
    totalNonCurrentLiabilities: number;
    totalLiabilities:           number;
  };
  equity: {
    lines:       { label: string; amount: number; note?: string }[];
    totalEquity: number;
  };
  totalLiabilitiesAndEquity: number;
  balanced: boolean;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function inr(n: number) {
  return "₹" + n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function SectionRow({ section }: { section: BSSection }) {
  const [open, setOpen] = useState(false);
  const hasChildren = section.children.length > 0;
  return (
    <>
      <tr
        className={`border-b ${hasChildren ? "cursor-pointer hover:bg-muted/30" : ""}`}
        onClick={() => hasChildren && setOpen(o => !o)}
      >
        <td className="p-2 pl-3 text-sm font-medium flex items-center gap-1">
          {hasChildren
            ? open ? <ChevronDown className="w-3 h-3 text-muted-foreground" /> : <ChevronRight className="w-3 h-3 text-muted-foreground" />
            : <span className="w-3" />}
          {section.label}
        </td>
        <td className="p-2 pr-3 text-right text-sm font-medium">{inr(section.amount)}</td>
      </tr>
      {open && section.children.map((c, i) => (
        <tr key={i} className="border-b bg-muted/10">
          <td className="p-2 pl-8 text-xs text-muted-foreground">
            {c.label}
            {c.note && <span className="ml-2 italic text-xs text-blue-500">{c.note}</span>}
          </td>
          <td className="p-2 pr-3 text-right text-xs">{inr(c.amount)}</td>
        </tr>
      ))}
    </>
  );
}

function TotalRow({ label, amount, highlight }: { label: string; amount: number; highlight?: boolean }) {
  return (
    <tr className={highlight ? "bg-blue-600" : "bg-muted/40 border-t-2 border-blue-200"}>
      <td className={`p-2 pl-3 text-sm font-bold ${highlight ? "text-white" : ""}`}>{label}</td>
      <td className={`p-2 pr-3 text-right text-sm font-bold ${highlight ? "text-white" : ""}`}>{inr(amount)}</td>
    </tr>
  );
}

function SubheadRow({ label }: { label: string }) {
  return (
    <tr className="bg-blue-50 dark:bg-blue-950/30">
      <td colSpan={2} className="p-2 pl-3 text-xs font-semibold uppercase tracking-wide text-blue-700 dark:text-blue-300">
        {label}
      </td>
    </tr>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function BalanceSheet() {
  const { toast } = useToast();
  const [asOf, setAsOf] = useState(new Date().toISOString().split("T")[0]);
  const [queryAsOf, setQueryAsOf] = useState(asOf);

  const { data, isLoading, error } = useQuery<BalanceSheetData>({
    queryKey: ["/api/reports/balance-sheet", queryAsOf],
    queryFn: () => apiRequest("GET", `/api/reports/balance-sheet?asOf=${queryAsOf}`).then(r => r.json()),
  });

  async function downloadExcel() {
    try {
      const res = await apiRequest("GET", `/api/reports/balance-sheet/excel?asOf=${queryAsOf}`);
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href = url; a.download = `Balance-Sheet-${queryAsOf}.xlsx`; a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  }

  async function downloadPdf() {
    try {
      const res = await apiRequest("GET", `/api/reports/balance-sheet/pdf?asOf=${queryAsOf}`);
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href = url; a.download = `Balance-Sheet-${queryAsOf}.pdf`; a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  }

  function downloadCsv() {
    if (!data) return;
    const rows: string[] = ["Section,Item,Amount"];
    const addRow = (section: string, label: string, amount: number | string) =>
      rows.push(`"${section}","${label}","${amount}"`);

    addRow("ASSETS", "", "");
    addRow("Non-Current Assets", "", "");
    data.assets.nonCurrent.forEach(s => {
      addRow("", s.label, s.amount);
      s.children.forEach(c => addRow("", `  ${c.label}`, c.amount));
    });
    addRow("Total Non-Current Assets", "", data.assets.totalNonCurrentAssets);
    addRow("Current Assets", "", "");
    data.assets.current.forEach(s => {
      addRow("", s.label, s.amount);
      s.children.forEach(c => addRow("", `  ${c.label}`, c.amount));
    });
    addRow("Total Current Assets", "", data.assets.totalCurrentAssets);
    addRow("TOTAL ASSETS", "", data.assets.totalAssets);
    addRow("", "", "");
    addRow("LIABILITIES", "", "");
    addRow("Current Liabilities", "", "");
    data.liabilities.current.forEach(s => {
      addRow("", s.label, s.amount);
      s.children.forEach(c => addRow("", `  ${c.label}`, c.amount));
    });
    addRow("Total Current Liabilities", "", data.liabilities.totalCurrentLiabilities);
    addRow("Non-Current Liabilities", "", "");
    data.liabilities.nonCurrent.forEach(s => {
      addRow("", s.label, s.amount);
      s.children.forEach(c => addRow("", `  ${c.label}`, c.amount));
    });
    addRow("Total Non-Current Liabilities", "", data.liabilities.totalNonCurrentLiabilities);
    addRow("TOTAL LIABILITIES", "", data.liabilities.totalLiabilities);
    addRow("", "", "");
    addRow("EQUITY", "", "");
    data.equity.lines.forEach(l => addRow("", l.label, l.amount));
    addRow("TOTAL EQUITY", "", data.equity.totalEquity);
    addRow("TOTAL LIABILITIES + EQUITY", "", data.totalLiabilitiesAndEquity);

    const blob = new Blob([rows.join("\n")], { type: "text/csv" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url; a.download = `Balance-Sheet-${queryAsOf}.csv`; a.click();
    URL.revokeObjectURL(url);
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
              data-testid="input-bs-as-of"
            />
          </div>
          <Button
            size="sm"
            onClick={() => setQueryAsOf(asOf)}
            data-testid="button-bs-run"
          >
            Run
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={downloadCsv} disabled={!data} data-testid="button-bs-csv">
            <Download className="w-4 h-4 mr-1" />CSV
          </Button>
          <Button variant="outline" size="sm" onClick={downloadExcel} disabled={!data} data-testid="button-bs-excel">
            <FileSpreadsheet className="w-4 h-4 mr-1" />Excel
          </Button>
          <Button variant="outline" size="sm" onClick={downloadPdf} disabled={!data} data-testid="button-bs-pdf">
            <FileText className="w-4 h-4 mr-1" />PDF
          </Button>
        </div>
      </div>

      {/* Balance indicator */}
      {data && (
        <div className={`flex items-center gap-2 rounded-md border px-3 py-2 text-sm ${data.balanced ? "border-green-200 bg-green-50 text-green-700 dark:bg-green-950/20 dark:border-green-800 dark:text-green-300" : "border-amber-200 bg-amber-50 text-amber-700 dark:bg-amber-950/20 dark:border-amber-800 dark:text-amber-300"}`}>
          {data.balanced
            ? <><CheckCircle2 className="w-4 h-4" /> Balance sheet balances — Assets = Liabilities + Equity</>
            : <><AlertTriangle className="w-4 h-4" /> Balance sheet does not balance — verify equity and opening balance entries</>}
        </div>
      )}

      {isLoading && (
        <div className="grid grid-cols-2 gap-4">
          {[0,1].map(i => (
            <Card key={i}><CardContent className="p-4 space-y-2">
              {Array.from({length: 8}).map((_, j) => <Skeleton key={j} className="h-5 w-full" />)}
            </CardContent></Card>
          ))}
        </div>
      )}

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          Failed to load balance sheet. Check server logs.
        </div>
      )}

      {data && !isLoading && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* ── LEFT: ASSETS ── */}
          <Card>
            <CardContent className="p-0">
              <table className="w-full">
                <tbody>
                  {/* Non-Current Assets */}
                  <SubheadRow label="Non-Current Assets" />
                  {data.assets.nonCurrent.map((s, i) => <SectionRow key={i} section={s} />)}
                  <TotalRow label="Total Non-Current Assets" amount={data.assets.totalNonCurrentAssets} />

                  {/* Current Assets */}
                  <SubheadRow label="Current Assets" />
                  {data.assets.current.map((s, i) => <SectionRow key={i} section={s} />)}
                  <TotalRow label="Total Current Assets" amount={data.assets.totalCurrentAssets} />

                  {/* TOTAL ASSETS */}
                  <TotalRow label="TOTAL ASSETS" amount={data.assets.totalAssets} highlight />
                </tbody>
              </table>
            </CardContent>
          </Card>

          {/* ── RIGHT: LIABILITIES + EQUITY ── */}
          <Card>
            <CardContent className="p-0">
              <table className="w-full">
                <tbody>
                  {/* Current Liabilities */}
                  <SubheadRow label="Current Liabilities" />
                  {data.liabilities.current.length === 0
                    ? <tr><td colSpan={2} className="p-2 pl-3 text-xs text-muted-foreground">Nil</td></tr>
                    : data.liabilities.current.map((s, i) => <SectionRow key={i} section={s} />)}
                  <TotalRow label="Total Current Liabilities" amount={data.liabilities.totalCurrentLiabilities} />

                  {/* Non-Current Liabilities */}
                  <SubheadRow label="Non-Current Liabilities" />
                  {data.liabilities.nonCurrent.length === 0
                    ? <tr><td colSpan={2} className="p-2 pl-3 text-xs text-muted-foreground">Nil</td></tr>
                    : data.liabilities.nonCurrent.map((s, i) => <SectionRow key={i} section={s} />)}
                  <TotalRow label="Total Non-Current Liabilities" amount={data.liabilities.totalNonCurrentLiabilities} />

                  {/* Total Liabilities */}
                  <tr className="bg-muted/40 border-t-2 border-blue-200">
                    <td className="p-2 pl-3 text-sm font-bold">TOTAL LIABILITIES</td>
                    <td className="p-2 pr-3 text-right text-sm font-bold">{inr(data.liabilities.totalLiabilities)}</td>
                  </tr>

                  {/* Equity */}
                  <SubheadRow label="Equity" />
                  {data.equity.lines.map((line, i) => (
                    <tr key={i} className={`border-b ${i % 2 === 0 ? "bg-muted/10" : ""}`}>
                      <td className="p-2 pl-3 text-sm">
                        {line.label}
                        {line.note && <div className="text-xs italic text-blue-500 mt-0.5">{line.note}</div>}
                      </td>
                      <td className="p-2 pr-3 text-right text-sm">{inr(line.amount)}</td>
                    </tr>
                  ))}
                  <TotalRow label="Total Equity" amount={data.equity.totalEquity} />

                  {/* TOTAL LIABILITIES + EQUITY */}
                  <TotalRow label="TOTAL LIABILITIES + EQUITY" amount={data.totalLiabilitiesAndEquity} highlight />
                </tbody>
              </table>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
