import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { useCurrentUser } from "@/lib/auth";
import { RefreshCw, TrendingUp, DollarSign, CheckCircle, Package, Flame, ShieldAlert, Plus, Pencil, Search, Download } from "lucide-react";
import type { Product } from "@shared/schema";
import { generatePricingModulePDF } from "@/lib/pricing-pdf";

type LastSoldEntry = { price: string; lastSoldAt: string };
type EffectivePriceEntry = {
  effectivePrice: string;
  source: "today" | "fallback" | "none";
  sheetDate: string;
  noConfirmedPrice: boolean;
  hasConfirmedToday: boolean;
  blendedCost?: string;
  globalFloorPrice?: string;
  strictFloorPrice?: string;
};

function fmtINR(val: number | string | null | undefined) {
  if (val === null || val === undefined || val === "") return "—";
  const n = Number(val);
  if (isNaN(n)) return "—";
  return `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtDate(iso: string | null | undefined) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", timeZone: "Asia/Kolkata" });
}

export default function Pricing() {
  const { toast } = useToast();
  const [location] = useLocation();
  const { data: currentUser } = useCurrentUser();
  const canManagePricing = ["admin", "sales_manager", "accountant"].includes(currentUser?.role ?? "");
  const canConfirmPricing = ["admin", "accountant"].includes(currentUser?.role ?? "");

  // Use IST date so the sheet date matches what the user sees on their calendar
  const todayStr = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });

  const { data: products } = useQuery<Product[]>({ queryKey: ["/api/products"] });

  // Phase 6.6 C6: primary supplier price per product (replaces stale product.costPrice).
  const { data: primarySupplierPrices } = useQuery<Record<string, { supplierId: string; supplierPrice: string; lastPriceUpdatedAt: string | null }>>({
    queryKey: ["/api/products/primary-supplier-prices"],
  });

  const { data: todaySheets, isLoading: sheetsLoading, refetch: refetchSheets } = useQuery<any[]>({
    queryKey: ["/api/daily-price-sheets", todayStr],
    queryFn: async () => {
      const res = await fetch(`/api/daily-price-sheets?sheetDate=${todayStr}`, {
        headers: { Authorization: `Bearer ${sessionStorage.getItem("token")}` },
      });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: canManagePricing,
  });

  const { data: effectivePrices } = useQuery<Record<string, EffectivePriceEntry>>({
    queryKey: ["/api/daily-price-sheets/effective-prices-today"],
    queryFn: async () => {
      const res = await fetch("/api/daily-price-sheets/effective-prices-today", {
        headers: { Authorization: `Bearer ${sessionStorage.getItem("token")}` },
      });
      if (!res.ok) return {};
      return res.json();
    },
    enabled: canManagePricing,
  });

  const { data: lastSoldPrices } = useQuery<Record<string, LastSoldEntry>>({
    queryKey: ["/api/products/last-sold-prices"],
  });

  const { data: inventoryStock } = useQuery<any[]>({ queryKey: ["/api/inventory-stock"] });

  const getProductTotalStock = (productId: string) => {
    if (!inventoryStock) return 0;
    return inventoryStock.filter((s: any) => s.productId === productId).reduce((sum: number, s: any) => sum + Number(s.quantity), 0);
  };

  // ─── Product search + grid filter ────────────────────────────────────────────
  const [productSearch, setProductSearch] = useState("");
  const [pricingGridFilter, setPricingGridFilter] = useState<string | null>(null);
  const [pricingPdfLoading, setPricingPdfLoading] = useState(false);

  // Bundle pricing — loaded when Sets filter is active
  const { data: bundlePricing } = useQuery<Record<string, {
    supplierPrice: string | null;
    blendedCost: string | null;
    effectivePrice: string;
    effectivePriceIncGst: string;
    gstRate: string;
    marginPct: string | null;
    dataStatus: string;
    sourceStatus: string;
  }>>({
    queryKey: ["/api/products/bundle-pricing"],
    queryFn: async () => {
      const res = await fetch("/api/products/bundle-pricing", {
        headers: { Authorization: `Bearer ${sessionStorage.getItem("token")}` },
      });
      if (!res.ok) return {};
      return res.json();
    },
    enabled: canManagePricing && pricingGridFilter === "__sets__",
  });

  const handleDownloadPricingPDF = async () => {
    setPricingPdfLoading(true);
    try {
      const filterLabel =
        pricingGridFilter === "on_grid"   ? "On Grid"
        : pricingGridFilter === "off_grid" ? "Off Grid"
        : pricingGridFilter === "hybrid"   ? "Hybrid"
        : pricingGridFilter === "others"   ? "Others"
        : pricingGridFilter === "__sets__" ? "Sets"
        : "All Products";

      const q = productSearch.trim().toLowerCase();
      const rows = ((products ?? []) as Product[])
        .filter(p => {
          if (pricingGridFilter === "__sets__") {
            if (p.type !== "bundle" && p.type !== "combo") return false;
          } else {
            if (p.type !== "product" && p.type !== "combo") return false;
            if (pricingGridFilter && (p as any).gridType !== pricingGridFilter) return false;
          }
          return !q || p.name.toLowerCase().includes(q) || (p.sku ?? "").toLowerCase().includes(q);
        })
        .map(p => {
          const sheet = (todaySheets ?? []).find((s: any) => s.productId === p.id);
          const ep    = effectivePrices?.[p.id];
          const psp   = primarySupplierPrices?.[p.id];
          const blendedCost  = sheet ? Number(sheet.blendedCost) : null;
          const supplierPrice = psp ? Number(psp.supplierPrice) : null;
          const effectivePrice = ep ? Number(ep.effectivePrice) : null;
          const proposed = sheet?.proposedPrice ? Number(sheet.proposedPrice) : null;
          const margin = (blendedCost && proposed && proposed > 0)
            ? ((proposed - blendedCost) / proposed * 100) : null;
          const pressureRatio = (blendedCost && proposed && proposed > 0) ? blendedCost / proposed : null;
          const pressureLevel = pressureRatio === null ? "None"
            : pressureRatio > 0.9 ? "High Risk"
            : pressureRatio > 0.75 ? "Medium" : "Safe";
          const status = ep?.hasConfirmedToday ? "Confirmed"
            : sheet ? "Pending" : "No Sheet";
          return {
            name: p.name,
            sku: p.sku ?? "",
            unit: p.unit ?? "",
            gridType: (p as any).gridType ?? "others",
            gstRate: Number(p.gstRate ?? 0),
            totalStock: getProductTotalStock(p.id),
            supplierPrice,
            blendedCost,
            effectivePrice,
            marginPct: margin,
            pressureLevel,
            status,
          };
        });

      const blob = await generatePricingModulePDF(rows, filterLabel, currentUser?.fullName ?? "Unknown");
      const href = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href     = href;
      a.download = `pricing-sheet-${filterLabel.toLowerCase().replace(/\s+/g, "-")}-${new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" })}.pdf`;
      a.click();
      URL.revokeObjectURL(href);
    } catch (e) {
      toast({ title: "PDF generation failed", variant: "destructive" });
    } finally {
      setPricingPdfLoading(false);
    }
  };

  // ─── Dialog state ────────────────────────────────────────────────────────────
  const [pricingDialogOpen, setPricingDialogOpen] = useState(false);
  const [pricingProduct, setPricingProduct] = useState<Product | null>(null);
  const [pricingSheet, setPricingSheet] = useState<any | null>(null);
  const [pricingProposed, setPricingProposed] = useState("");
  const [pricingOverrideReason, setPricingOverrideReason] = useState("");
  const [pricingNotes, setPricingNotes] = useState("");
  const [pricingRejectionNotes, setPricingRejectionNotes] = useState("");
  const [pricingSheetLoading, setPricingSheetLoading] = useState(false);
  const [pricingConfirmDialogOpen, setPricingConfirmDialogOpen] = useState(false);
  const [pricingRejectDialogOpen, setPricingRejectDialogOpen] = useState(false);
  const [pricingSimQty, setPricingSimQty] = useState("1");

  const openPricingDialog = async (product: Product) => {
    setPricingProduct(product);
    setPricingSheet(null);
    setPricingProposed("");
    setPricingOverrideReason("");
    setPricingNotes("");
    setPricingRejectionNotes("");
    setPricingSheetLoading(true);
    setPricingDialogOpen(true);
    try {
      const res = await fetch(`/api/daily-price-sheets?productId=${product.id}&sheetDate=${todayStr}`, {
        headers: { Authorization: `Bearer ${sessionStorage.getItem("token")}` },
      });
      const sheets = await res.json();
      if (Array.isArray(sheets) && sheets.length > 0) {
        const s = sheets[0];
        setPricingSheet(s);
        setPricingProposed(s.proposedPrice ?? "");
        setPricingOverrideReason(s.overrideReason ?? "");
        setPricingNotes(s.notes ?? "");
      }
    } catch {}
    setPricingSheetLoading(false);
  };

  // ─── Notification deep-link: ?sheet=<sheetId> ────────────────────────────
  const deepLinkHandled = useRef(false);
  useEffect(() => {
    if (deepLinkHandled.current || !products || !canManagePricing) return;
    const params = new URLSearchParams(window.location.search);
    const sheetId = params.get("sheet");
    if (!sheetId) return;
    deepLinkHandled.current = true;
    window.history.replaceState({}, "", "/pricing");
    (async () => {
      try {
        const res = await fetch(`/api/daily-price-sheets/${sheetId}`, {
          headers: { Authorization: `Bearer ${sessionStorage.getItem("token")}` },
        });
        if (!res.ok) return;
        const sheet = await res.json();
        const prod = (products ?? []).find((p: Product) => p.id === sheet.productId);
        if (!prod) return;
        setPricingProduct(prod);
        setPricingSheet(sheet);
        setPricingProposed(sheet.proposedPrice ?? "");
        setPricingOverrideReason(sheet.overrideReason ?? "");
        setPricingNotes(sheet.notes ?? "");
        setPricingDialogOpen(true);
      } catch {}
    })();
  }, [products, canManagePricing]);

  // ─── Mutations ───────────────────────────────────────────────────────────────
  const createPricingSheetMutation = useMutation({
    mutationFn: async (productId: string) => {
      const res = await apiRequest("POST", "/api/daily-price-sheets", { productId, sheetDate: todayStr });
      return res.json();
    },
    onSuccess: (sheet: any) => {
      setPricingSheet(sheet);
      setPricingProposed(sheet.proposedPrice ?? "");
      setPricingNotes(sheet.notes ?? "");
      queryClient.invalidateQueries({ queryKey: ["/api/daily-price-sheets", todayStr] });
      toast({ title: "Price sheet created", description: "Draft price sheet ready for pricing" });
    },
    onError: async (error: any) => {
      const msg = error?.message ?? "";
      try {
        const jsonStart = msg.indexOf("{");
        if (jsonStart !== -1) {
          const body = JSON.parse(msg.slice(jsonStart));
          if (body?.sheetId) {
            const res = await fetch(`/api/daily-price-sheets/${body.sheetId}`, { headers: { Authorization: `Bearer ${sessionStorage.getItem("token")}` } });
            if (res.ok) {
              const s = await res.json();
              setPricingSheet(s);
              setPricingProposed(s.proposedPrice ?? "");
              setPricingOverrideReason(s.overrideReason ?? "");
              setPricingNotes(s.notes ?? "");
              return;
            }
          }
        }
      } catch {}
      toast({ title: "Error", description: msg, variant: "destructive" });
    },
  });

  const savePricingDraftMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PATCH", `/api/daily-price-sheets/${pricingSheet.id}`, {
        proposedPrice: pricingProposed,
        overrideReason: pricingOverrideReason || undefined,
        notes: pricingNotes || undefined,
      });
      return res.json();
    },
    onSuccess: (sheet: any) => {
      setPricingSheet(sheet);
      queryClient.invalidateQueries({ queryKey: ["/api/daily-price-sheets", todayStr] });
      toast({ title: "Draft saved" });
    },
    onError: (error: Error) => toast({ title: "Error", description: error.message, variant: "destructive" }),
  });

  const submitPricingSheetMutation = useMutation({
    mutationFn: async () => {
      const saveRes = await apiRequest("PATCH", `/api/daily-price-sheets/${pricingSheet.id}`, {
        proposedPrice: pricingProposed,
        overrideReason: pricingOverrideReason || undefined,
        notes: pricingNotes || undefined,
      });
      await saveRes.json();
      const res = await apiRequest("POST", `/api/daily-price-sheets/${pricingSheet.id}/submit`);
      return res.json();
    },
    onSuccess: (sheet: any) => {
      setPricingSheet({ ...pricingSheet, ...sheet });
      queryClient.invalidateQueries({ queryKey: ["/api/daily-price-sheets", todayStr] });
      toast({ title: "Submitted for approval" });
    },
    onError: (error: Error) => toast({ title: "Error", description: error.message, variant: "destructive" }),
  });

  const confirmPricingSheetMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/daily-price-sheets/${pricingSheet.id}/confirm`, {
        overrideReason: pricingOverrideReason || undefined,
      });
      return res.json();
    },
    onSuccess: (sheet: any) => {
      setPricingSheet({ ...pricingSheet, ...sheet });
      setPricingConfirmDialogOpen(false);
      queryClient.invalidateQueries({ queryKey: ["/api/daily-price-sheets", todayStr] });
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      queryClient.invalidateQueries({ queryKey: ["/api/daily-price-sheets/effective-prices-today"] });
      toast({ title: "Price confirmed", description: `Confirmed price ${fmtINR(pricingProposed)} for ${pricingProduct?.name}` });
    },
    onError: (error: Error) => toast({ title: "Error", description: error.message, variant: "destructive" }),
  });

  const rejectPricingSheetMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/daily-price-sheets/${pricingSheet.id}/reject`, {
        rejectionNotes: pricingRejectionNotes || undefined,
      });
      return res.json();
    },
    onSuccess: (sheet: any) => {
      setPricingSheet({ ...pricingSheet, ...sheet });
      setPricingRejectDialogOpen(false);
      queryClient.invalidateQueries({ queryKey: ["/api/daily-price-sheets", todayStr] });
      toast({ title: "Sheet rejected", description: "Sheet rejected — submitter can revise and resubmit" });
    },
    onError: (error: Error) => toast({ title: "Error", description: error.message, variant: "destructive" }),
  });

  if (!canManagePricing) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2">
        <TrendingUp className="w-10 h-10 opacity-30" />
        <p>You don't have access to Daily Pricing.</p>
      </div>
    );
  }

  const statusColors: Record<string, string> = {
    draft: "bg-gray-100 text-gray-700 dark:bg-gray-950/40 dark:text-gray-400",
    submitted: "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400",
    confirmed: "bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-400",
    rejected: "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400",
  };

  const sourceBadge = (source: string | undefined) => {
    if (source === "today") return <span className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-400">🟢 Approved Today</span>;
    if (source === "fallback") return <span className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400">🟡 Prev Price</span>;
    return <span className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400">🔴 No Price</span>;
  };

  return (
    <div className="h-full overflow-y-auto p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-blue-500" />
            Daily Pricing — {new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kolkata" })}
          </h1>
          <p className="text-sm text-muted-foreground">Set and approve selling prices based on FIFO lot costs</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetchSheets()} data-testid="button-refresh-pricing">
          <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Refresh
        </Button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Draft", val: (todaySheets ?? []).filter((s: any) => s.status === "draft").length, color: "text-gray-600 dark:text-gray-400", bg: "bg-gray-50 dark:bg-gray-950/30" },
          { label: "Submitted", val: (todaySheets ?? []).filter((s: any) => s.status === "submitted").length, color: "text-amber-700 dark:text-amber-400", bg: "bg-amber-50 dark:bg-amber-950/30" },
          { label: "Confirmed", val: (todaySheets ?? []).filter((s: any) => s.status === "confirmed").length, color: "text-green-700 dark:text-green-400", bg: "bg-green-50 dark:bg-green-950/30" },
          { label: "Rejected", val: (todaySheets ?? []).filter((s: any) => s.status === "rejected").length, color: "text-red-700 dark:text-red-400", bg: "bg-red-50 dark:bg-red-950/30" },
        ].map(({ label, val, color, bg }) => (
          <Card key={label}>
            <CardContent className={`p-4 rounded-lg ${bg}`}>
              <p className={`text-2xl font-bold ${color}`} data-testid={`text-pricing-count-${label.toLowerCase()}`}>{val}</p>
              <p className="text-xs text-muted-foreground">{label} Today</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Search + grid filters + PDF */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search products by name or SKU…"
            className="pl-9"
            data-testid="input-search-pricing-products"
            value={productSearch}
            onChange={e => setProductSearch(e.target.value)}
          />
        </div>
        {([
          { label: "On Grid",  value: "on_grid"   },
          { label: "Off Grid", value: "off_grid"  },
          { label: "Hybrid",   value: "hybrid"    },
          { label: "Others",   value: "others"    },
          { label: "Sets",     value: "__sets__"  },
        ]).map(({ label, value }) => (
          <button
            key={value}
            type="button"
            onClick={() => setPricingGridFilter(pricingGridFilter === value ? null : value)}
            className={[
              "inline-flex items-center px-3 py-1.5 rounded-full text-xs font-medium border transition-colors",
              pricingGridFilter === value
                ? "bg-blue-600 text-white border-blue-600"
                : "bg-white dark:bg-muted text-muted-foreground border-border hover:border-blue-400 hover:text-blue-600 dark:hover:text-blue-400",
            ].join(" ")}
          >
            {label}
          </button>
        ))}
        {pricingGridFilter && (
          <button
            type="button"
            onClick={() => setPricingGridFilter(null)}
            className="inline-flex items-center gap-1 px-2 py-1.5 rounded-full text-xs font-medium border border-border text-muted-foreground hover:text-red-500 hover:border-red-400 transition-colors bg-white dark:bg-muted"
          >
            <svg className="w-3 h-3" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2"><line x1="2" y1="2" x2="10" y2="10"/><line x1="10" y1="2" x2="2" y2="10"/></svg>
          </button>
        )}
        <Button
          variant="outline"
          size="sm"
          onClick={handleDownloadPricingPDF}
          disabled={pricingPdfLoading}
          className="ml-auto"
        >
          <Download className="w-3.5 h-3.5 mr-1.5" />
          {pricingPdfLoading ? "Generating…" : "Download PDF"}
        </Button>
      </div>

      {/* Products table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30">
                  <th className="text-left p-3 font-medium text-muted-foreground">Product</th>
                  <th className="text-right p-3 font-medium text-muted-foreground">Stock</th>
                  <th className="text-right p-3 font-medium text-muted-foreground">Supplier Price</th>
                  <th className="text-right p-3 font-medium text-muted-foreground">Blended Cost</th>
                  <th className="text-right p-3 font-medium text-muted-foreground">Global Floor</th>
                  <th className="text-right p-3 font-medium text-muted-foreground">Strict Floor</th>
                  <th className="text-right p-3 font-medium text-muted-foreground">Proposed</th>
                  <th className="text-right p-3 font-medium text-muted-foreground">Effective Price (Ex GST)</th>
                  <th className="text-right p-3 font-medium text-muted-foreground">Effective Price (Inc GST)</th>
                  <th className="text-center p-3 font-medium text-muted-foreground">Margin</th>
                  <th className="text-center p-3 font-medium text-muted-foreground">Status / Source</th>
                  <th className="text-right p-3 font-medium text-muted-foreground">Action</th>
                </tr>
              </thead>
              <tbody>
                {sheetsLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i} className="border-b">
                      {Array.from({ length: 11 }).map((_, j) => (
                        <td key={j} className="p-3"><Skeleton className="h-4 w-16" /></td>
                      ))}
                    </tr>
                  ))
                ) : (() => {
                  const q = productSearch.trim().toLowerCase();
                  const filtered = (products ?? []).filter(p => {
                    if (pricingGridFilter === "__sets__") {
                      if (p.type !== "bundle" && p.type !== "combo") return false;
                    } else {
                      if (p.type !== "product" && p.type !== "combo") return false;
                      if (pricingGridFilter && (p as any).gridType !== pricingGridFilter) return false;
                    }
                    return !q || p.name.toLowerCase().includes(q) || (p.sku ?? "").toLowerCase().includes(q);
                  });
                  if (filtered.length === 0) return (
                    <tr>
                      <td colSpan={13} className="p-8 text-center text-muted-foreground">
                        {q ? `No products matching "${productSearch}"` : "No products found."}
                      </td>
                    </tr>
                  );
                  // Bundle rows for Sets filter
                  if (pricingGridFilter === "__sets__") {
                    return filtered.map((product) => {
                      const bp = bundlePricing?.[product.id];
                      const totalStock = getProductTotalStock(product.id);
                      const dataStatusCls = bp?.dataStatus === "Complete"
                        ? "bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-400"
                        : bp?.dataStatus === "Partial"
                        ? "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400"
                        : "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400";
                      const sourceCls = bp?.sourceStatus === "Confirmed"
                        ? "bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-400"
                        : bp?.sourceStatus === "Partial"
                        ? "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400"
                        : "bg-orange-100 text-orange-700 dark:bg-orange-950/40 dark:text-orange-400";
                      return (
                        <tr key={product.id} className="border-b hover:bg-muted/20 transition-colors">
                          <td className="p-3">
                            <div className="font-medium flex items-center gap-1.5">{product.name}</div>
                            <div className="text-xs text-muted-foreground">{product.sku}</div>
                          </td>
                          <td className="p-3 text-right"><span className="text-sm font-medium text-muted-foreground">{totalStock}</span></td>
                          <td className="p-3 text-right text-sm text-muted-foreground">{bp?.supplierPrice ? fmtINR(bp.supplierPrice) : <span className="text-xs">—</span>}</td>
                          <td className="p-3 text-right text-sm">{bp?.blendedCost ? fmtINR(bp.blendedCost) : <span className="text-xs text-muted-foreground">—</span>}</td>
                          <td className="p-3 text-right text-xs text-muted-foreground">—</td>
                          <td className="p-3 text-right text-xs text-muted-foreground">—</td>
                          <td className="p-3 text-right text-xs text-muted-foreground">—</td>
                          <td className="p-3 text-right text-sm font-medium">{bp ? fmtINR(bp.effectivePrice) : <span className="text-xs text-muted-foreground">—</span>}</td>
                          <td className="p-3 text-right text-sm font-medium text-blue-600 dark:text-blue-400">{bp ? fmtINR(bp.effectivePriceIncGst) : <span className="text-xs text-muted-foreground">—</span>}</td>
                          <td className="p-3 text-center">
                            {bp?.marginPct ? (
                              <span className={`text-xs font-semibold px-1.5 py-0.5 rounded ${Number(bp.marginPct) < 5 ? "text-red-600 bg-red-50" : Number(bp.marginPct) < 15 ? "text-amber-600 bg-amber-50" : "text-green-700 bg-green-50"}`}>
                                {bp.marginPct}%
                              </span>
                            ) : <span className="text-xs text-muted-foreground">—</span>}
                          </td>
                          <td className="p-3 text-center">
                            <div className="flex flex-col items-center gap-1">
                              {bp && <span className={`text-xs px-1.5 py-0.5 rounded-full ${sourceCls}`}>{bp.sourceStatus}</span>}
                              {bp && <span className={`text-xs px-1.5 py-0.5 rounded-full ${dataStatusCls}`}>{bp.dataStatus}</span>}
                            </div>
                          </td>
                          <td className="p-3 text-right text-xs text-muted-foreground">—</td>
                        </tr>
                      );
                    });
                  }

                  return filtered.map((product) => {
                  const sheet = (todaySheets ?? []).find((s: any) => s.productId === product.id);
                  const ep = effectivePrices?.[product.id];
                  const totalStock = getProductTotalStock(product.id);
                  const blendedCost = sheet ? Number(sheet.blendedCost) : null;
                  const globalFloor = sheet ? Number(sheet.globalFloorPrice) : null;
                  const strictFloor = sheet?.strictFloorPrice ? Number(sheet.strictFloorPrice) : null;
                  // Phase 6.6 C6: Supplier price now sourced from supplier_products (primary), not products.costPrice (WAC).
                  const psp = primarySupplierPrices?.[product.id];
                  const supplierPrice = psp ? Number(psp.supplierPrice) : null;
                  const proposed = sheet?.proposedPrice ? Number(sheet.proposedPrice) : null;
                  const effectivePrice = ep ? Number(ep.effectivePrice) : null;
                  const margin = (blendedCost && proposed && proposed > 0)
                    ? ((proposed - blendedCost) / proposed * 100)
                    : null;
                  const pressureRatio = (blendedCost && proposed && proposed > 0) ? blendedCost / proposed : null;
                  const pressureBadge = pressureRatio === null ? null
                    : pressureRatio > 0.9 ? { label: "High Risk", cls: "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400" }
                    : pressureRatio > 0.75 ? { label: "Medium", cls: "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400" }
                    : { label: "Safe", cls: "bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-400" };
                  const oldestLotDate = sheet?.lots?.length > 0
                    ? new Date(Math.min(...sheet.lots.map((l: any) => new Date(l.lotDate).getTime())))
                    : null;
                  const lotAgeDays = oldestLotDate ? Math.floor((Date.now() - oldestLotDate.getTime()) / 86400000) : null;
                  const isSellPriority = lotAgeDays !== null && lotAgeDays > 30 && totalStock > (product.minStockLevel ?? 0);

                  return (
                    <tr key={product.id} className="border-b hover:bg-muted/20 transition-colors" data-testid={`row-pricing-${product.id}`}>
                      <td className="p-3">
                        <div className="flex items-center gap-1.5 font-medium">
                          {product.name}
                          {isSellPriority && <Flame className="w-3.5 h-3.5 text-orange-500" title="Aged stock — prioritise selling" />}
                          {product.needsPricingReview && <ShieldAlert className="w-3.5 h-3.5 text-blue-500" title="Supplier price changed — review needed" />}
                        </div>
                        <div className="text-xs text-muted-foreground">{product.sku}</div>
                      </td>
                      <td className="p-3 text-right">
                        <span className={`text-sm font-medium ${totalStock === 0 ? "text-muted-foreground" : totalStock <= (product.minStockLevel ?? 0) ? "text-red-600" : ""}`}>
                          {totalStock}
                        </span>
                        <span className="text-xs text-muted-foreground ml-1">{product.unit}</span>
                      </td>
                      <td className="p-3 text-right text-sm text-muted-foreground">
                        {supplierPrice !== null ? fmtINR(supplierPrice) : <span className="text-xs">—</span>}
                      </td>
                      <td className="p-3 text-right text-sm">
                        {blendedCost !== null ? fmtINR(blendedCost) : <span className="text-muted-foreground text-xs">No sheet</span>}
                      </td>
                      <td className="p-3 text-right text-sm">
                        {globalFloor !== null ? fmtINR(globalFloor) : <span className="text-muted-foreground text-xs">—</span>}
                      </td>
                      <td className="p-3 text-right text-sm">
                        {strictFloor !== null
                          ? <span className="text-red-600 dark:text-red-400">{fmtINR(strictFloor)}</span>
                          : <span className="text-muted-foreground text-xs">—</span>}
                      </td>
                      <td className="p-3 text-right font-semibold">
                        {proposed !== null ? fmtINR(proposed) : <span className="text-muted-foreground text-xs font-normal">Not set</span>}
                      </td>
                      <td className="p-3 text-right text-sm">
                        {effectivePrice !== null
                          ? <span className={ep?.source === "none" ? "text-muted-foreground" : "font-medium"}>{fmtINR(effectivePrice)}</span>
                          : <span className="text-muted-foreground text-xs">—</span>}
                      </td>
                      <td className="p-3 text-right text-sm">
                        {effectivePrice !== null
                          ? <span className="font-medium text-blue-600 dark:text-blue-400">{fmtINR(effectivePrice * (1 + Number(product.gstRate ?? 0) / 100))}</span>
                          : <span className="text-muted-foreground text-xs">—</span>}
                      </td>
                      <td className="p-3 text-center">
                        {margin !== null ? (
                          <span className={`text-xs font-semibold px-1.5 py-0.5 rounded ${margin < 5 ? "text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30" : margin < 15 ? "text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30" : "text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-950/30"}`}>
                            {margin.toFixed(1)}%
                          </span>
                        ) : <span className="text-muted-foreground text-xs">—</span>}
                      </td>
                      <td className="p-3 text-center">
                        <div className="flex flex-col items-center gap-1">
                          {sheet && (
                            <div className="flex items-center gap-1">
                              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${statusColors[sheet.status] || statusColors.draft}`}>
                                {sheet.status.charAt(0).toUpperCase() + sheet.status.slice(1)}
                              </span>
                              {pressureBadge && (
                                <span className={`text-xs px-1.5 py-0.5 rounded-full ${pressureBadge.cls}`}>
                                  {pressureBadge.label}
                                </span>
                              )}
                            </div>
                          )}
                          {sourceBadge(ep?.source)}
                        </div>
                      </td>
                      <td className="p-3 text-right">
                        <Button size="sm" variant="outline" onClick={() => openPricingDialog(product)} data-testid={`button-pricing-open-${product.id}`}>
                          {sheet ? <Pencil className="w-3.5 h-3.5 mr-1" /> : <Plus className="w-3.5 h-3.5 mr-1" />}
                          {sheet ? "Edit" : "Add Sheet"}
                        </Button>
                      </td>
                    </tr>
                  );
                  });
                })()}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* ─── Pricing Dialog ─────────────────────────────────────────────────────── */}
      <Dialog open={pricingDialogOpen} onOpenChange={setPricingDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-blue-500" />
              Daily Pricing — {pricingProduct?.name}
            </DialogTitle>
            <DialogDescription>
              {pricingProduct?.sku} · {new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kolkata" })}
            </DialogDescription>
          </DialogHeader>

          {pricingSheetLoading ? (
            <div className="space-y-3 py-4">
              {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}
            </div>
          ) : !pricingSheet ? (
            <div className="py-10 text-center space-y-4">
              <DollarSign className="w-12 h-12 mx-auto text-muted-foreground/40" />
              <p className="text-muted-foreground">No price sheet for today. Create one to run the FIFO lot engine.</p>
              <Button
                onClick={() => pricingProduct && createPricingSheetMutation.mutate(pricingProduct.id)}
                disabled={createPricingSheetMutation.isPending}
                data-testid="button-create-pricing-sheet"
              >
                {createPricingSheetMutation.isPending ? "Creating..." : "Create Price Sheet"}
              </Button>
            </div>
          ) : (
            <div className="space-y-5">
              {/* Rejection alert */}
              {(pricingSheet.status === "rejected" || pricingSheet.rejectionNotes) && (
                <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-950/30 p-3 text-sm text-red-700 dark:text-red-400">
                  <strong>Rejected:</strong> {pricingSheet.rejectionNotes || "No reason provided — please revise and resubmit."}
                </div>
              )}

              {/* Lot breakdown */}
              <div>
                <p className="text-sm font-semibold mb-2">FIFO Lot Breakdown</p>
                {(pricingSheet.lots ?? []).length === 0 ? (
                  <p className="text-sm text-muted-foreground">No confirmed GRN lots found for this product.</p>
                ) : (
                  <div className="overflow-x-auto rounded-lg border">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b bg-muted/30">
                          <th className="text-left p-2 font-medium">GRN #</th>
                          <th className="text-left p-2 font-medium">Date</th>
                          <th className="text-right p-2 font-medium">Remaining Qty</th>
                          <th className="text-right p-2 font-medium">Landed Cost</th>
                          <th className="text-right p-2 font-medium">Floor Price (+{pricingProduct?.minMarginPct ?? 5}%)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(pricingSheet.lots ?? []).map((lot: any) => {
                          const pp = pricingProposed ? Number(pricingProposed) : null;
                          const belowFloor = pp !== null && pp < Number(lot.floorPrice);
                          return (
                            <tr key={lot.id} className={`border-b last:border-0 ${belowFloor ? "bg-red-50/60 dark:bg-red-950/20" : ""}`}>
                              <td className="p-2 font-medium">{lot.grnNumber}</td>
                              <td className="p-2 text-muted-foreground">{lot.lotDate ? new Date(lot.lotDate + "T00:00:00").toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" }) : "—"}</td>
                              <td className="p-2 text-right">{Number(lot.remainingQty).toLocaleString("en-IN")}</td>
                              <td className="p-2 text-right">{fmtINR(lot.landedCost)}</td>
                              <td className={`p-2 text-right font-medium ${belowFloor ? "text-red-600 dark:text-red-400" : "text-green-700 dark:text-green-400"}`}>
                                {fmtINR(lot.floorPrice)}
                                {belowFloor && <span className="ml-1 text-[10px]">⚠</span>}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* ─── 6-point reference panel ─────────────────────────────────────── */}
              {(() => {
                const ep = pricingProduct ? effectivePrices?.[pricingProduct.id] : undefined;
                const lastSold = pricingProduct ? lastSoldPrices?.[pricingProduct.id] : undefined;

                const lastApprovedLabel = ep?.source === "today"
                  ? `${fmtINR(ep.effectivePrice)} ✓ Today`
                  : ep?.source === "fallback" && ep.sheetDate
                  ? `${fmtINR(ep.effectivePrice)} · ${fmtDate(ep.sheetDate)}`
                  : "Not yet approved";

                const lastSoldLabel = lastSold
                  ? `${fmtINR(lastSold.price)} · ${fmtDate(lastSold.lastSoldAt)}`
                  : "—";

                return (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Reference Prices</p>
                    <div className="grid grid-cols-3 gap-2 text-xs">
                      {/* Row 1 — Cost & Safety */}
                      <div className="rounded-lg border bg-muted/20 p-3 text-center">
                        <p className="text-muted-foreground mb-1">Avg. Landed Cost</p>
                        <p className="text-base font-bold text-foreground">{fmtINR(pricingSheet.blendedCost)}</p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">All lots weighted</p>
                      </div>
                      <div className="rounded-lg border bg-amber-50 dark:bg-amber-950/20 p-3 text-center">
                        <p className="text-muted-foreground mb-1">Global Floor</p>
                        <p className="text-base font-bold text-amber-600 dark:text-amber-400">{fmtINR(pricingSheet.globalFloorPrice)}</p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">+{pricingProduct?.minMarginPct ?? 5}% min margin</p>
                      </div>
                      <div className="rounded-lg border bg-red-50 dark:bg-red-950/20 p-3 text-center">
                        <p className="text-muted-foreground mb-1">Strict Floor</p>
                        <p className="text-base font-bold text-red-600 dark:text-red-400">{fmtINR(pricingSheet.strictFloorPrice)}</p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">Highest lot floor</p>
                      </div>
                      {/* Row 2 — Market Reference */}
                      <div className="rounded-lg border bg-blue-50 dark:bg-blue-950/20 p-3 text-center">
                        <p className="text-muted-foreground mb-1">Last Sold Price</p>
                        <p className="text-sm font-bold text-blue-700 dark:text-blue-400">{lastSoldLabel}</p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">Most recent order/quote</p>
                      </div>
                      <div className={`rounded-lg border p-3 text-center ${ep?.source === "none" ? "bg-red-50 dark:bg-red-950/20" : ep?.source === "fallback" ? "bg-amber-50 dark:bg-amber-950/20" : "bg-green-50 dark:bg-green-950/20"}`}>
                        <p className="text-muted-foreground mb-1">Last Approved Price</p>
                        <p className={`text-sm font-bold ${ep?.source === "none" ? "text-red-600 dark:text-red-400" : ep?.source === "fallback" ? "text-amber-700 dark:text-amber-400" : "text-green-700 dark:text-green-400"}`}>
                          {lastApprovedLabel}
                        </p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">CEO confirmed price</p>
                      </div>
                      <div className="rounded-lg border bg-muted/20 p-3 text-center">
                        <p className="text-muted-foreground mb-1">Current List Price</p>
                        <p className="text-sm font-bold text-foreground">{fmtINR(pricingProduct?.unitPrice)}</p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">Catalog default</p>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Price input & simulation */}
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-sm font-semibold">Proposed Selling Price (₹)</Label>
                    {(() => {
                      const pp = pricingProposed ? Number(pricingProposed) : null;
                      const gFloor = pricingSheet.globalFloorPrice ? Number(pricingSheet.globalFloorPrice) : null;
                      const sFloor = pricingSheet.strictFloorPrice ? Number(pricingSheet.strictFloorPrice) : null;
                      const inputColorClass = pp === null ? ""
                        : (sFloor && pp < sFloor) ? "border-red-400 focus-visible:ring-red-400 text-red-600 bg-red-50 dark:bg-red-950/20"
                        : (gFloor && pp < gFloor) ? "border-amber-400 focus-visible:ring-amber-400 text-amber-700 bg-amber-50 dark:bg-amber-950/20"
                        : "";
                      return (
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          value={pricingProposed}
                          onChange={(e) => setPricingProposed(e.target.value)}
                          disabled={pricingSheet.status === "confirmed" || (pricingSheet.status === "submitted" && !canConfirmPricing)}
                          placeholder="Enter selling price..."
                          data-testid="input-proposed-price"
                          className={`mt-1 ${inputColorClass}`}
                        />
                      );
                    })()}
                  </div>
                  <div>
                    <Label className="text-sm font-semibold">Notes</Label>
                    <Input
                      value={pricingNotes}
                      onChange={(e) => setPricingNotes(e.target.value)}
                      disabled={pricingSheet.status === "confirmed"}
                      placeholder="Optional notes..."
                      data-testid="input-pricing-notes"
                      className="mt-1"
                    />
                  </div>
                </div>

                {/* Live margin + qty simulation */}
                {pricingProposed && Number(pricingProposed) > 0 && (
                  <div className="rounded-lg border p-3 bg-muted/10 space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Margin & Revenue Simulation</p>
                      <div className="flex items-center gap-2">
                        <Label className="text-xs text-muted-foreground">Simulate Qty:</Label>
                        <Input
                          type="number"
                          min="1"
                          step="1"
                          value={pricingSimQty}
                          onChange={(e) => setPricingSimQty(e.target.value)}
                          className="w-20 h-6 text-xs px-1.5"
                          data-testid="input-sim-qty"
                        />
                      </div>
                    </div>
                    {(() => {
                      const pp = Number(pricingProposed);
                      const qty = Math.max(1, Number(pricingSimQty) || 1);
                      const cost = pricingSheet.blendedCost ? Number(pricingSheet.blendedCost) : null;
                      const gFloor = pricingSheet.globalFloorPrice ? Number(pricingSheet.globalFloorPrice) : null;
                      const sFloor = pricingSheet.strictFloorPrice ? Number(pricingSheet.strictFloorPrice) : null;
                      const revenue = pp * qty;
                      const totalCost = cost !== null ? cost * qty : null;
                      const profit = totalCost !== null ? revenue - totalCost : null;
                      const margin = (cost !== null && pp > 0) ? ((pp - cost) / pp * 100) : null;
                      const belowGlobal = gFloor !== null && pp < gFloor;
                      const belowStrict = sFloor !== null && pp < sFloor;
                      return (
                        <div className="space-y-2">
                          <div className="grid grid-cols-3 gap-3">
                            {[
                              { label: "vs Blended Cost", val: margin !== null ? `${margin.toFixed(1)}%` : "—", warn: margin !== null && margin < 5, tip: cost !== null ? `Cost: ${fmtINR(cost)}` : undefined },
                              { label: "vs Global Floor (+5%)", val: gFloor !== null ? (belowGlobal ? `${fmtINR(gFloor)} ✗` : "✓ OK") : "—", warn: belowGlobal, tip: gFloor !== null ? `Floor: ${fmtINR(gFloor)}` : undefined },
                              { label: "vs Strict Floor", val: sFloor !== null ? (belowStrict ? `${fmtINR(sFloor)} ✗` : "✓ OK") : "—", warn: belowStrict, tip: sFloor !== null ? `Floor: ${fmtINR(sFloor)}` : undefined },
                            ].map(({ label, val, warn, tip }) => (
                              <div key={label} title={tip} className={`rounded p-2 text-center ${warn ? "bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800" : "bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800"}`}>
                                <p className="text-[10px] text-muted-foreground mb-1">{label}</p>
                                <p className={`font-bold text-sm ${warn ? "text-red-600 dark:text-red-400" : "text-green-700 dark:text-green-400"}`}>{val}</p>
                              </div>
                            ))}
                          </div>
                          <div className="grid grid-cols-3 gap-3 text-xs">
                            <div className="rounded p-2 bg-muted/20 text-center">
                              <p className="text-[10px] text-muted-foreground mb-0.5">Revenue ({qty} units)</p>
                              <p className="font-semibold">{fmtINR(revenue)}</p>
                            </div>
                            <div className="rounded p-2 bg-muted/20 text-center">
                              <p className="text-[10px] text-muted-foreground mb-0.5">Total Cost</p>
                              <p className="font-semibold">{totalCost !== null ? fmtINR(totalCost) : "—"}</p>
                            </div>
                            <div className={`rounded p-2 text-center ${profit !== null && profit >= 0 ? "bg-green-50 dark:bg-green-950/20" : "bg-red-50 dark:bg-red-950/20"}`}>
                              <p className="text-[10px] text-muted-foreground mb-0.5">Gross Profit</p>
                              <p className={`font-semibold ${profit !== null ? (profit >= 0 ? "text-green-700 dark:text-green-400" : "text-red-600 dark:text-red-400") : ""}`}>
                                {profit !== null ? fmtINR(profit) : "—"}
                              </p>
                            </div>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                )}

                {/* Override reason */}
                {pricingSheet.overrideRequired && (
                  <div>
                    <Label className="text-sm font-semibold text-red-600">Override Reason <span className="text-xs font-normal">(required — price is below floor)</span></Label>
                    <Textarea
                      value={pricingOverrideReason}
                      onChange={(e) => setPricingOverrideReason(e.target.value)}
                      disabled={pricingSheet.status === "confirmed"}
                      placeholder="Explain why selling below floor price..."
                      className="mt-1 text-sm"
                      rows={2}
                      data-testid="input-override-reason"
                    />
                  </div>
                )}
              </div>
            </div>
          )}

          <DialogFooter className="flex-wrap gap-2 pt-2">
            {pricingSheet && pricingSheet.status !== "confirmed" && (
              <>
                {(pricingSheet.status === "draft" || pricingSheet.status === "rejected") && (
                  <>
                    <Button variant="outline" onClick={() => savePricingDraftMutation.mutate()} disabled={savePricingDraftMutation.isPending || !pricingProposed} data-testid="button-save-draft">
                      {savePricingDraftMutation.isPending ? "Saving..." : "Save Draft"}
                    </Button>
                    <Button onClick={() => submitPricingSheetMutation.mutate()} disabled={submitPricingSheetMutation.isPending || !pricingProposed || (pricingSheet.overrideRequired && !pricingOverrideReason)} data-testid="button-submit-pricing">
                      {submitPricingSheetMutation.isPending ? "Submitting..." : "Submit for Approval"}
                    </Button>
                  </>
                )}
                {pricingSheet.status === "submitted" && canConfirmPricing && (
                  <>
                    <Button variant="outline" className="text-red-600 border-red-300 hover:bg-red-50" onClick={() => setPricingRejectDialogOpen(true)} data-testid="button-reject-pricing">
                      Reject
                    </Button>
                    <Button className="bg-green-600 hover:bg-green-700 text-white" onClick={() => setPricingConfirmDialogOpen(true)} data-testid="button-confirm-pricing">
                      <CheckCircle className="w-4 h-4 mr-1.5" /> Confirm Price
                    </Button>
                  </>
                )}
                {pricingSheet.status === "submitted" && !canConfirmPricing && (
                  <p className="text-sm text-muted-foreground italic">Awaiting admin/accountant approval</p>
                )}
              </>
            )}
            {pricingSheet?.status === "confirmed" && (
              <div className="flex items-center gap-2 text-green-700 dark:text-green-400 text-sm">
                <CheckCircle className="w-4 h-4" /> Price confirmed at {fmtINR(pricingSheet.proposedPrice)}
              </div>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Pricing confirm dialog */}
      <Dialog open={pricingConfirmDialogOpen} onOpenChange={setPricingConfirmDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Price Sheet</DialogTitle>
            <DialogDescription>
              This will set {fmtINR(pricingProposed)} as the confirmed selling price for {pricingProduct?.name} today.
              {pricingSheet?.overrideRequired && <span className="block mt-1 text-red-600 font-medium">⚠ This price is below the floor — override reason is required.</span>}
            </DialogDescription>
          </DialogHeader>
          {pricingSheet?.overrideRequired && (
            <div className="space-y-1">
              <Label>Override Reason</Label>
              <Textarea value={pricingOverrideReason} onChange={(e) => setPricingOverrideReason(e.target.value)} placeholder="Required: explain below-floor pricing..." rows={3} data-testid="input-confirm-override-reason" />
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPricingConfirmDialogOpen(false)}>Cancel</Button>
            <Button
              className="bg-green-600 hover:bg-green-700 text-white"
              onClick={() => confirmPricingSheetMutation.mutate()}
              disabled={confirmPricingSheetMutation.isPending || (pricingSheet?.overrideRequired && !pricingOverrideReason)}
              data-testid="button-confirm-pricing-final"
            >
              {confirmPricingSheetMutation.isPending ? "Confirming..." : "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Pricing reject dialog */}
      <Dialog open={pricingRejectDialogOpen} onOpenChange={setPricingRejectDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Price Sheet</DialogTitle>
            <DialogDescription>Provide a reason. The submitter will be notified and can revise and resubmit.</DialogDescription>
          </DialogHeader>
          <div className="space-y-1">
            <Label>Rejection Notes</Label>
            <Textarea value={pricingRejectionNotes} onChange={(e) => setPricingRejectionNotes(e.target.value)} placeholder="Explain what needs to be revised..." rows={3} data-testid="input-rejection-notes" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPricingRejectDialogOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={() => rejectPricingSheetMutation.mutate()} disabled={rejectPricingSheetMutation.isPending} data-testid="button-reject-pricing-final">
              {rejectPricingSheetMutation.isPending ? "Rejecting..." : "Reject"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
