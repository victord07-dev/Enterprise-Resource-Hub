import { Fragment, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ChevronDown, ChevronRight, Download, ExternalLink, FileSpreadsheet, FileText, IndianRupee, RefreshCw, Truck } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface AgingSummary {
  totalOutstanding: number; current: number; days1_30: number;
  days31_60: number; days61_90: number; days90plus: number;
}
interface SupplierAgingRow {
  supplierId: string; supplierName: string; totalOutstanding: number;
  current: number; days1_30: number; days31_60: number;
  days61_90: number; days90plus: number; oldestInvoiceDate: string | null;
}
interface SupplierAgingResult {
  asOf: string; rows: SupplierAgingRow[]; summary: AgingSummary;
}
interface InvoiceDetailRow {
  id: string;
  invoiceNumber: string | null;
  purchaseOrderId: string | null;
  poNumber: string | null;
  grnId: string | null;
  grnNumber: string | null;
  invoiceDate: string | null;
  dueDate: string | null;
  totalAmount: number;
  paid: number;
  outstanding: number;
  bucket: string;
  status: string;
}

function fmtCur(v: number) {
  return "₹" + v.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtShort(v: number) {
  if (v === 0) return "—";
  return "₹" + v.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

const BUCKET_COLORS: Record<string, string> = {
  current: "text-emerald-700 dark:text-emerald-400",
  "1-30": "text-amber-600 dark:text-amber-400",
  "31-60": "text-orange-600 dark:text-orange-400",
  "61-90": "text-red-600 dark:text-red-400",
  "90+": "text-red-700 dark:text-red-500 font-bold",
};

const BUCKET_BADGE: Record<string, string> = {
  "90+":   "bg-red-100 text-red-700 dark:bg-red-950/30 dark:text-red-400 border-0 text-[10px]",
  "61-90": "bg-orange-100 text-orange-700 dark:bg-orange-950/30 dark:text-orange-400 border-0 text-[10px]",
  "31-60": "bg-amber-100 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400 border-0 text-[10px]",
  "1-30":  "bg-yellow-100 text-yellow-700 dark:bg-yellow-950/30 dark:text-yellow-400 border-0 text-[10px]",
  current: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400 border-0 text-[10px]",
};

function highestBucket(row: SupplierAgingRow): string {
  if (row.days90plus > 0) return "90+";
  if (row.days61_90 > 0) return "61-90";
  if (row.days31_60 > 0) return "31-60";
  if (row.days1_30 > 0) return "1-30";
  return "current";
}

// ── Sub-component: lazy-loaded invoice rows for one expanded supplier ─────────
function SupplierInvoiceRows({ supplierId, asOf, onNavigate }: {
  supplierId: string;
  asOf: string;
  onNavigate: (path: string) => void;
}) {
  const { data, isLoading, isError } = useQuery<{ rows: InvoiceDetailRow[] }>({
    queryKey: ["/api/reports/supplier-aging", supplierId, "invoices", asOf],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/reports/supplier-aging/${supplierId}/invoices?asOf=${asOf}`);
      return res.json();
    },
    staleTime: 0,          // always re-fetch on expand so filter changes are immediate
    gcTime: 30_000,        // keep in cache for 30 s in case of rapid collapse/expand
  });

  if (isLoading) {
    return (
      <tr>
        <td colSpan={10} className="px-4 py-3 bg-muted/10">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <RefreshCw className="w-3 h-3 animate-spin" /> Loading invoices…
          </div>
        </td>
      </tr>
    );
  }

  if (isError || !data?.rows?.length) {
    return (
      <tr>
        <td colSpan={10} className="px-4 py-3 bg-muted/10 text-xs text-muted-foreground italic">
          {isError ? "Failed to load invoices." : "No outstanding invoices found."}
        </td>
      </tr>
    );
  }

  return (
    <>
      {/* Sub-header */}
      <tr className="bg-slate-50 dark:bg-slate-900/30 border-b border-dashed border-border/60">
        <td className="pl-10 pr-3 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Invoice #</td>
        <td className="px-3 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">PO #</td>
        <td className="px-3 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">GRN #</td>
        <td className="px-3 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Inv. Date</td>
        <td className="px-3 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Due Date</td>
        <td className="px-3 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide text-right">Total</td>
        <td className="px-3 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide text-right">Paid</td>
        <td className="px-3 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide text-right">Outstanding</td>
        <td className="px-3 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide text-center">Bucket</td>
        <td className="px-3 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide text-center">Action</td>
      </tr>

      {data.rows.map((inv) => (
        <tr key={inv.id} className="border-b border-dashed border-border/40 bg-slate-50/60 dark:bg-slate-900/20 hover:bg-slate-100/80 dark:hover:bg-slate-800/30 transition-colors">
          {/* Invoice # — deep-links to Accounts → Supplier Invoices */}
          <td className="pl-10 pr-3 py-2 text-xs">
            <button
              onClick={() => onNavigate(`/accounts?tab=supplier-invoices&highlight=${inv.id}`)}
              className="text-blue-600 dark:text-blue-400 hover:underline font-mono flex items-center gap-1"
              title="Open in Accounts → Supplier Invoices"
            >
              {inv.invoiceNumber ?? <span className="italic text-muted-foreground">Auto</span>}
              <ExternalLink className="w-3 h-3 opacity-60" />
            </button>
          </td>

          {/* PO # — deep-links to Supply Chain → Purchase Orders */}
          <td className="px-3 py-2 text-xs">
            {inv.poNumber ? (
              <button
                onClick={() => onNavigate(`/supply-chain?tab=purchase-orders&expand=${inv.purchaseOrderId}`)}
                className="text-blue-600 dark:text-blue-400 hover:underline font-mono flex items-center gap-1"
                title="Open in Supply Chain → Purchase Orders"
              >
                {inv.poNumber}
                <ExternalLink className="w-3 h-3 opacity-60" />
              </button>
            ) : <span className="text-muted-foreground">—</span>}
          </td>

          {/* GRN # */}
          <td className="px-3 py-2 text-xs font-mono text-muted-foreground">
            {inv.grnNumber ?? "—"}
          </td>

          {/* Invoice Date */}
          <td className="px-3 py-2 text-xs text-muted-foreground">
            {inv.invoiceDate ?? "—"}
          </td>

          {/* Due Date */}
          <td className="px-3 py-2 text-xs text-muted-foreground">
            {inv.dueDate ? (
              <span className={inv.bucket !== "current" ? "text-red-600 dark:text-red-400 font-medium" : ""}>
                {inv.dueDate}
              </span>
            ) : "—"}
          </td>

          {/* Total */}
          <td className="px-3 py-2 text-xs text-right font-mono">{fmtCur(inv.totalAmount)}</td>

          {/* Paid */}
          <td className="px-3 py-2 text-xs text-right font-mono text-emerald-700 dark:text-emerald-400">
            {inv.paid > 0 ? fmtCur(inv.paid) : "—"}
          </td>

          {/* Outstanding */}
          <td className={`px-3 py-2 text-xs text-right font-mono font-semibold ${BUCKET_COLORS[inv.bucket] ?? ""}`}>
            {fmtCur(inv.outstanding)}
          </td>

          {/* Bucket badge */}
          <td className="px-3 py-2 text-center">
            <Badge className={BUCKET_BADGE[inv.bucket] ?? BUCKET_BADGE.current}>
              {inv.bucket === "current" ? "Current" : inv.bucket}
            </Badge>
          </td>

          {/* Pay Now */}
          <td className="px-3 py-2 text-center">
            {inv.purchaseOrderId ? (
              <Button
                size="sm"
                variant="outline"
                className="h-6 px-2 text-[10px]"
                onClick={() => onNavigate(`/supply-chain?tab=purchase-orders&expand=${inv.purchaseOrderId}`)}
                title="Go to PO to record payment"
              >
                <IndianRupee className="w-3 h-3 mr-1" />Pay
              </Button>
            ) : (
              <span className="text-[10px] text-muted-foreground">—</span>
            )}
          </td>
        </tr>
      ))}
    </>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export function SupplierAging() {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const todayISO = new Date().toISOString().slice(0, 10);
  const [asOf, setAsOf] = useState(todayISO);
  const [supplierFilter, setSupplierFilter] = useState("__all__");
  const [exporting, setExporting] = useState<"csv" | "excel" | "pdf" | null>(null);
  const [expandedSupplierId, setExpandedSupplierId] = useState<string | null>(null);

  const queryClient = useQueryClient();
  const { data, isLoading, refetch } = useQuery<SupplierAgingResult>({
    queryKey: ["/api/reports/supplier-aging", asOf],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/reports/supplier-aging?asOf=${asOf}`);
      return res.json();
    },
    staleTime: 60_000,
  });

  function handleRefresh() {
    // Collapse any expanded row so it re-fetches fresh data on next expand
    setExpandedSupplierId(null);
    // Invalidate ALL supplier aging queries — summary + every expanded detail cache
    queryClient.invalidateQueries({ queryKey: ["/api/reports/supplier-aging"] });
  }

  const filteredRows = supplierFilter === "__all__"
    ? (data?.rows ?? [])
    : (data?.rows ?? []).filter(r => r.supplierId === supplierFilter);

  const displaySummary: AgingSummary = filteredRows.reduce(
    (acc, r) => {
      acc.totalOutstanding += r.totalOutstanding; acc.current += r.current;
      acc.days1_30 += r.days1_30; acc.days31_60 += r.days31_60;
      acc.days61_90 += r.days61_90; acc.days90plus += r.days90plus;
      return acc;
    },
    { totalOutstanding: 0, current: 0, days1_30: 0, days31_60: 0, days61_90: 0, days90plus: 0 }
  );

  function toggleExpand(supplierId: string) {
    setExpandedSupplierId(prev => prev === supplierId ? null : supplierId);
  }

  async function handleCSV() {
    setExporting("csv");
    try {
      const headers = ["Supplier", "Current", "1-30 Days", "31-60 Days", "61-90 Days", "90+ Days", "Total Outstanding", "Oldest Invoice"];
      const rows = filteredRows.map(r => [
        r.supplierName, r.current.toFixed(2), r.days1_30.toFixed(2),
        r.days31_60.toFixed(2), r.days61_90.toFixed(2), r.days90plus.toFixed(2),
        r.totalOutstanding.toFixed(2), r.oldestInvoiceDate ?? "",
      ]);
      rows.push(["TOTAL", displaySummary.current.toFixed(2), displaySummary.days1_30.toFixed(2), displaySummary.days31_60.toFixed(2), displaySummary.days61_90.toFixed(2), displaySummary.days90plus.toFixed(2), displaySummary.totalOutstanding.toFixed(2), ""]);
      const csv = [headers, ...rows].map(r => r.map(v => /[,"\r\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : v).join(",")).join("\r\n");
      const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = `Supplier-Aging-${asOf}.csv`; a.click();
      URL.revokeObjectURL(url);
    } finally { setExporting(null); }
  }

  async function handleExcel() {
    setExporting("excel");
    try {
      const params = new URLSearchParams({ asOf });
      if (supplierFilter !== "__all__") params.set("supplierId", supplierFilter);
      const res = await apiRequest("GET", `/api/reports/supplier-aging/excel?${params}`);
      if (!res.ok) throw new Error("Excel export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = `Supplier-Aging-${asOf}.xlsx`; a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast({ title: "Excel export failed", variant: "destructive" });
    } finally { setExporting(null); }
  }

  async function handlePDF() {
    setExporting("pdf");
    try {
      const { generateSupplierAgingPDF } = await import("@/lib/reports-pdf");
      const blob = await generateSupplierAgingPDF(filteredRows, displaySummary, asOf);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = `Supplier-Aging-${asOf}.pdf`; a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast({ title: "PDF export failed", description: String(e), variant: "destructive" });
    } finally { setExporting(null); }
  }

  return (
    <div className="space-y-4" data-testid="panel-supplier-aging">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground font-medium">As of Date</label>
          <Input type="date" value={asOf} onChange={e => setAsOf(e.target.value)} className="w-44 h-8 text-sm" data-testid="input-supplier-aging-asof" />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground font-medium">Supplier</label>
          <Select value={supplierFilter} onValueChange={setSupplierFilter}>
            <SelectTrigger className="w-52 h-8 text-sm" data-testid="select-supplier-aging-filter">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All Suppliers</SelectItem>
              {(data?.rows ?? []).map(r => (
                <SelectItem key={r.supplierId} value={r.supplierId}>{r.supplierName}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button variant="outline" size="sm" onClick={handleRefresh} className="h-8" data-testid="button-supplier-aging-refresh">
          <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Refresh
        </Button>
        <div className="ml-auto flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleCSV} disabled={!!exporting || isLoading} className="h-8" data-testid="button-supplier-aging-csv">
            <Download className="w-3.5 h-3.5 mr-1.5" />{exporting === "csv" ? "Exporting…" : "CSV"}
          </Button>
          <Button variant="outline" size="sm" onClick={handleExcel} disabled={!!exporting || isLoading} className="h-8" data-testid="button-supplier-aging-excel">
            <FileSpreadsheet className="w-3.5 h-3.5 mr-1.5" />{exporting === "excel" ? "Exporting…" : "Excel"}
          </Button>
          <Button variant="outline" size="sm" onClick={handlePDF} disabled={!!exporting || isLoading} className="h-8" data-testid="button-supplier-aging-pdf">
            <FileText className="w-3.5 h-3.5 mr-1.5" />{exporting === "pdf" ? "Generating…" : "PDF"}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { label: "Total Outstanding", value: displaySummary.totalOutstanding, color: "text-slate-800 dark:text-slate-200" },
          { label: "Current", value: displaySummary.current, color: BUCKET_COLORS.current },
          { label: "1–30 Days", value: displaySummary.days1_30, color: BUCKET_COLORS["1-30"] },
          { label: "31–60 Days", value: displaySummary.days31_60, color: BUCKET_COLORS["31-60"] },
          { label: "61–90 Days", value: displaySummary.days61_90, color: BUCKET_COLORS["61-90"] },
          { label: "90+ Days", value: displaySummary.days90plus, color: BUCKET_COLORS["90+"] },
        ].map(card => (
          <Card key={card.label} className="border-border/60">
            <CardContent className="p-3">
              <p className="text-[11px] text-muted-foreground mb-1">{card.label}</p>
              {isLoading ? <Skeleton className="h-5 w-20" /> : <p className={`text-sm font-semibold font-mono ${card.color}`}>{fmtShort(card.value)}</p>}
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="pb-2 pt-4 px-4">
          <div className="flex items-center gap-2">
            <Truck className="w-4 h-4 text-muted-foreground" />
            <CardTitle className="text-sm font-semibold">
              Supplier Aging — As of {asOf}
              {data && <span className="ml-2 text-xs font-normal text-muted-foreground">({filteredRows.length} suppliers)</span>}
            </CardTitle>
            <span className="ml-auto text-[10px] text-muted-foreground italic">Click a row to expand invoices</span>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b bg-muted/30">
                  <th className="w-8 px-2 py-2.5"></th>
                  <th className="text-left px-3 py-2.5 font-medium text-muted-foreground">Supplier</th>
                  <th className="text-right px-3 py-2.5 font-medium text-muted-foreground">Current</th>
                  <th className="text-right px-3 py-2.5 font-medium text-muted-foreground">1–30 Days</th>
                  <th className="text-right px-3 py-2.5 font-medium text-muted-foreground">31–60 Days</th>
                  <th className="text-right px-3 py-2.5 font-medium text-muted-foreground">61–90 Days</th>
                  <th className="text-right px-3 py-2.5 font-medium text-muted-foreground">90+ Days</th>
                  <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Total</th>
                  <th className="text-center px-3 py-2.5 font-medium text-muted-foreground">Risk</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  Array.from({ length: 4 }).map((_, i) => (
                    <tr key={i} className="border-b">
                      {Array.from({ length: 9 }).map((_, j) => (
                        <td key={j} className="px-3 py-2.5"><Skeleton className="h-4 w-full" /></td>
                      ))}
                    </tr>
                  ))
                ) : filteredRows.length === 0 ? (
                  <tr><td colSpan={9} className="text-center py-12 text-muted-foreground">No outstanding balances found.</td></tr>
                ) : (
                  filteredRows.map(row => {
                    const bucket = highestBucket(row);
                    const isExpanded = expandedSupplierId === row.supplierId;
                    return (
                      <Fragment key={row.supplierId}>
                        {/* Summary row — clickable to expand */}
                        <tr
                          key={row.supplierId}
                          className={`border-b cursor-pointer hover:bg-muted/20 transition-colors ${isExpanded ? "bg-blue-50/40 dark:bg-blue-950/10" : ""}`}
                          onClick={() => toggleExpand(row.supplierId)}
                          data-testid={`row-supplier-aging-${row.supplierId}`}
                        >
                          <td className="px-2 py-2.5 text-muted-foreground">
                            {isExpanded
                              ? <ChevronDown className="w-3.5 h-3.5" />
                              : <ChevronRight className="w-3.5 h-3.5" />
                            }
                          </td>
                          <td className="px-3 py-2.5">
                            <p className="font-medium">{row.supplierName}</p>
                            {row.oldestInvoiceDate && <p className="text-[10px] text-muted-foreground">Since {row.oldestInvoiceDate}</p>}
                          </td>
                          <td className={`px-3 py-2.5 text-right font-mono ${row.current > 0 ? BUCKET_COLORS.current : "text-muted-foreground"}`}>{row.current > 0 ? fmtShort(row.current) : "—"}</td>
                          <td className={`px-3 py-2.5 text-right font-mono ${row.days1_30 > 0 ? BUCKET_COLORS["1-30"] : "text-muted-foreground"}`}>{row.days1_30 > 0 ? fmtShort(row.days1_30) : "—"}</td>
                          <td className={`px-3 py-2.5 text-right font-mono ${row.days31_60 > 0 ? BUCKET_COLORS["31-60"] : "text-muted-foreground"}`}>{row.days31_60 > 0 ? fmtShort(row.days31_60) : "—"}</td>
                          <td className={`px-3 py-2.5 text-right font-mono ${row.days61_90 > 0 ? BUCKET_COLORS["61-90"] : "text-muted-foreground"}`}>{row.days61_90 > 0 ? fmtShort(row.days61_90) : "—"}</td>
                          <td className={`px-3 py-2.5 text-right font-mono ${row.days90plus > 0 ? BUCKET_COLORS["90+"] : "text-muted-foreground"}`}>{row.days90plus > 0 ? fmtShort(row.days90plus) : "—"}</td>
                          <td className="px-4 py-2.5 text-right font-mono font-semibold">{fmtCur(row.totalOutstanding)}</td>
                          <td className="px-3 py-2.5 text-center">
                            <Badge className={BUCKET_BADGE[bucket] ?? BUCKET_BADGE.current}>
                              {bucket === "current" ? "Current" : bucket}
                            </Badge>
                          </td>
                        </tr>

                        {/* Expanded invoice rows — lazy-loaded */}
                        {isExpanded && (
                          <SupplierInvoiceRows
                            supplierId={row.supplierId}
                            asOf={asOf}
                            onNavigate={navigate}
                          />
                        )}
                      </Fragment>
                    );
                  })
                )}
                {!isLoading && filteredRows.length > 0 && (
                  <tr className="border-t-2 bg-blue-50/50 dark:bg-blue-950/10 font-semibold">
                    <td />
                    <td className="px-3 py-2.5">TOTAL ({filteredRows.length} suppliers)</td>
                    <td className="px-3 py-2.5 text-right font-mono">{fmtShort(displaySummary.current)}</td>
                    <td className="px-3 py-2.5 text-right font-mono">{fmtShort(displaySummary.days1_30)}</td>
                    <td className="px-3 py-2.5 text-right font-mono">{fmtShort(displaySummary.days31_60)}</td>
                    <td className="px-3 py-2.5 text-right font-mono">{fmtShort(displaySummary.days61_90)}</td>
                    <td className="px-3 py-2.5 text-right font-mono">{fmtShort(displaySummary.days90plus)}</td>
                    <td className="px-4 py-2.5 text-right font-mono">{fmtCur(displaySummary.totalOutstanding)}</td>
                    <td />
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
