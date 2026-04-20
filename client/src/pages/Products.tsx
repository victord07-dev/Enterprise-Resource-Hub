import { useState, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useCurrentUser } from "@/lib/auth";
import { Plus, Search, Package, Wrench, Pencil, Trash2, AlertCircle, Lock, TrendingUp, Calculator, X, AlertTriangle, Settings2, Upload, FileText, Download, CheckCircle2, XCircle } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import {
  type Product,
  type Brand,
  productCategoryValues,
  productCategoryDefaults,
  applicableRegionValues,
  productLifecycleValues,
  COST_VISIBLE_ROLES,
} from "@shared/schema";
import { SpecsEditor, type SpecsValue } from "@/components/SpecsEditor";
import { hasSpecTemplate } from "@/constants/categorySpecTemplates";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";

const LOGISTICS_DEFAULT_PCT = 0.02; // 2% of distributor price as fallback per-unit logistics estimate

const serviceCategories = ["Installation", "AMC", "Site Survey", "Repair", "Maintenance", "Custom"];

const PANEL_CATEGORY = "Solar Panel / PV Module";

type TierKey = "end_user" | "business";
const TIER_LABELS: Record<TierKey, string> = {
  end_user: "End User (retail)",
  business: "Business (GST-registered)",
};

type ProductForm = {
  name: string;
  sku: string;
  category: string;
  description: string;
  unitPrice: string;
  brand: string;            // legacy free-text fallback (kept for back-compat)
  brandId: string;          // FK to brands
  unit: string;
  minStockLevel: string;
  type: string;
  hsnCode: string;
  gstRate: string;
  minMarginPct: string;
  distributorPrice: string;
  warrantyPeriod: string;
  mrp: string;
  packSize: string;
  almm: boolean;
  dcrCompliant: boolean;
  modelSeries: string;
  lifecycleStatus: string;
  applicableRegions: string[];
  priceListVersion: string;
  customerTierPrice: Record<TierKey, string>;
  // Phase 2.5
  logisticsCost: string;
  targetMarginPct: string;
  productFamily: string;
  // Phase 4 — JSONB specs
  specs: SpecsValue;
};

const emptyProductForm = (): ProductForm => ({
  name: "", sku: "", category: "Solar Panel / PV Module", description: "",
  unitPrice: "", brand: "", brandId: "", unit: "pcs", minStockLevel: "10", type: "product",
  hsnCode: productCategoryDefaults["Solar Panel / PV Module"].hsnCode,
  gstRate: productCategoryDefaults["Solar Panel / PV Module"].gstRate,
  minMarginPct: "5.00",
  distributorPrice: "",
  warrantyPeriod: "",
  mrp: "",
  packSize: "",
  almm: false,
  dcrCompliant: false,
  modelSeries: "",
  lifecycleStatus: "active",
  applicableRegions: [],
  priceListVersion: "",
  customerTierPrice: { end_user: "", business: "" },
  logisticsCost: "",
  targetMarginPct: "",
  productFamily: "",
  specs: {},
});

const emptyServiceForm = (): ProductForm => ({
  ...emptyProductForm(),
  type: "service",
  category: "Installation",
  unit: "service",
  minStockLevel: "0",
  sku: `SVC-${Date.now().toString(36).toUpperCase()}`,
});

/**
 * Landed-cost-based auto pricing chain (Phase 2.5):
 *   landedExclGst  = distributorPrice + logisticsCost (default = 2% of distributorPrice)
 *   landedInclGst  = landedExclGst * (1 + gstRate/100)
 *   suggestedPrice = landedInclGst * (1 + targetMarginPct/100)
 * Returns numbers (or null) so the UI can render each line independently.
 */
function computeLandedChain(distributorPrice: string, logisticsCost: string, gstRate: string, targetMarginPct: string) {
  const D = parseFloat(distributorPrice);
  if (!isFinite(D) || D <= 0) return { D: null, L: null, gst: null, T: null, landedExcl: null, landedIncl: null, suggested: null, logisticsIsDefault: false };
  const Lraw = parseFloat(logisticsCost);
  const logisticsIsDefault = !isFinite(Lraw) || Lraw < 0;
  const L = logisticsIsDefault ? D * LOGISTICS_DEFAULT_PCT : Lraw;
  const gst = parseFloat(gstRate);
  const gstPct = isFinite(gst) ? gst : 0;
  const T = parseFloat(targetMarginPct);
  const Tpct = isFinite(T) ? T : null;
  const landedExcl = D + L;
  const landedIncl = landedExcl * (1 + gstPct / 100);
  const suggested = Tpct !== null ? landedIncl * (1 + Tpct / 100) : null;
  return { D, L, gst: gstPct, T: Tpct, landedExcl, landedIncl, suggested, logisticsIsDefault };
}

const formatINR = (n: number) => `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// ── CSV Template columns (in human-readable order) ────────────────────────
const CSV_TEMPLATE_HEADERS = [
  "name","sku","brand","category","type","description",
  "distributorPrice","logisticsCost","unitPrice","targetMarginPct","gstRate","hsnCode",
  "mrp","minMarginPct","minStockLevel","unit","packSize","warrantyPeriod",
  "lifecycleStatus","priceListVersion","productFamily","modelSeries",
  "almm","dcrCompliant","applicableRegions",
  "customerTierPrice","specs","supplierSku",
];

const CSV_VALID_CATEGORIES = productCategoryValues.join(" | ");

const EXAMPLE_ROW: Record<string, string> = {
  name: "Example Solar Panel 400W",
  sku: "ADN-SP-400W-MONO",
  brand: "Adani Solar",
  category: "Solar Panel / PV Module",
  type: "product",
  description: "Monocrystalline 400W panel with anti-reflective coating",
  distributorPrice: "8500",
  logisticsCost: "",
  unitPrice: "",
  targetMarginPct: "15",
  gstRate: "12",
  hsnCode: "85414011",
  mrp: "12000",
  minMarginPct: "8",
  minStockLevel: "10",
  unit: "pcs",
  packSize: "",
  warrantyPeriod: "25 years",
  lifecycleStatus: "active",
  priceListVersion: "PL-2025-Q2",
  productFamily: "Adani HiKu6",
  modelSeries: "HiKu6 Mono PERC",
  almm: "true",
  dcrCompliant: "true",
  applicableRegions: "Assam, Meghalaya",
  customerTierPrice: '{"end_user":11000,"business":10000}',
  specs: '{"wattage":"400Wp","efficiency":"20.9%","cellType":"Mono PERC"}',
  supplierSku: "ADN-SP400W",
};

function generateTemplateCsv(): string {
  const comment = `# Valid categories: ${CSV_VALID_CATEGORIES}`;
  const header = CSV_TEMPLATE_HEADERS.join(",");
  const exampleVals = CSV_TEMPLATE_HEADERS.map(h => {
    const v = EXAMPLE_ROW[h] ?? "";
    return v.includes(",") || v.startsWith("{") ? `"${v.replace(/"/g, '""')}"` : v;
  }).join(",");
  return `${comment}\n${header}\n${exampleVals}\n`;
}

function downloadCsv(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

type ImportDryRunResult = {
  mode: "dry_run";
  would_import: number;
  would_skip: number;
  errors: ImportErrorRow[];
  duplicates_within_file: { row_number: number; sku: string; first_occurrence_row: number }[];
  brands_to_auto_create: string[];
};

type ImportCommitResult = {
  mode: "commit";
  imported: number;
  skipped: number;
  errors: ImportErrorRow[];
  duplicates_within_file: { row_number: number; sku: string; first_occurrence_row: number }[];
};

type ImportErrorRow = {
  row_number: number; sku: string; product_name: string;
  error_type: string; error_message: string;
};

function ImportCSVDialog({ open, onClose, onSuccess }: { open: boolean; onClose: () => void; onSuccess: () => void }) {
  const { toast } = useToast();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [priceListVersion, setPriceListVersion] = useState("");
  const [defaultMargin, setDefaultMargin] = useState("");
  const [dryRunResult, setDryRunResult] = useState<ImportDryRunResult | null>(null);
  const [commitResult, setCommitResult] = useState<ImportCommitResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [fileInputEl, setFileInputEl] = useState<HTMLInputElement | null>(null);

  function reset() {
    setSelectedFile(null);
    setPriceListVersion("");
    setDefaultMargin("");
    setDryRunResult(null);
    setCommitResult(null);
    if (fileInputEl) fileInputEl.value = "";
  }

  async function runImport(mode: "dry_run" | "commit") {
    if (!selectedFile) { toast({ title: "No file selected", variant: "destructive" }); return; }
    setLoading(true);
    try {
      const fd = new FormData();
      fd.append("file", selectedFile);
      if (priceListVersion.trim()) fd.append("priceListVersion", priceListVersion.trim());
      if (defaultMargin.trim()) fd.append("defaultTargetMarginPct", defaultMargin.trim());
      const token = localStorage.getItem("token");
      const res = await fetch(`/api/products/import?mode=${mode}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      const json = await res.json();
      if (!res.ok) { toast({ title: "Import error", description: json.message, variant: "destructive" }); return; }
      if (mode === "dry_run") {
        setDryRunResult(json as ImportDryRunResult);
        setCommitResult(null);
      } else {
        setCommitResult(json as ImportCommitResult);
        setDryRunResult(null);
        toast({ title: `Imported ${json.imported} products successfully` });
        queryClient.invalidateQueries({ queryKey: ["/api/products"] });
        onSuccess();
      }
    } catch (e: any) {
      toast({ title: "Network error", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  function downloadErrorCsv(errors: ImportErrorRow[]) {
    const header = "row_number,sku,product_name,error_type,error_message";
    const rows = errors.map(e =>
      [e.row_number, e.sku, `"${e.product_name.replace(/"/g, '""')}"`, e.error_type, `"${e.error_message.replace(/"/g, '""')}"`].join(",")
    ).join("\n");
    downloadCsv("import_errors.csv", `${header}\n${rows}\n`);
  }

  const allErrors = (dryRunResult?.errors ?? commitResult?.errors ?? []);
  const hasDryRun = !!dryRunResult;
  const hasCommit = !!commitResult;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { reset(); onClose(); } }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="w-5 h-5" />
            Bulk Import Products from CSV
          </DialogTitle>
          <DialogDescription>
            Upload a CSV file to import multiple products at once. Run a dry-run preview first, then commit.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Template download */}
          <div className="flex items-center justify-between rounded-md border p-3 bg-muted/30">
            <div className="flex items-center gap-2 text-sm">
              <FileText className="w-4 h-4 text-muted-foreground" />
              <span>Download the CSV template with an example row</span>
            </div>
            <Button variant="outline" size="sm" data-testid="button-download-csv-template" onClick={() => downloadCsv("products_import_template.csv", generateTemplateCsv())}>
              <Download className="w-4 h-4 mr-1" />
              Template
            </Button>
          </div>

          {/* File picker */}
          <div className="space-y-1">
            <Label>CSV File <span className="text-destructive">*</span></Label>
            <div className="flex items-center gap-2">
              <input
                ref={(el) => setFileInputEl(el)}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                data-testid="input-csv-file-hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0] ?? null;
                  setSelectedFile(f);
                  setDryRunResult(null);
                  setCommitResult(null);
                }}
              />
              <Button variant="outline" className="flex-1" data-testid="button-choose-csv-file" onClick={() => fileInputEl?.click()}>
                <Upload className="w-4 h-4 mr-2" />
                {selectedFile ? selectedFile.name : "Choose .csv file…"}
              </Button>
              {selectedFile && (
                <Button variant="ghost" size="icon" data-testid="button-clear-csv-file" onClick={() => { setSelectedFile(null); if (fileInputEl) fileInputEl.value = ""; setDryRunResult(null); setCommitResult(null); }}>
                  <X className="w-4 h-4" />
                </Button>
              )}
            </div>
          </div>

          {/* Options row */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="import-plv">Price List Version <span className="text-muted-foreground text-xs">(optional global)</span></Label>
              <Input id="import-plv" data-testid="input-import-price-list-version" placeholder="e.g. PL-2025-Q2" value={priceListVersion} onChange={e => setPriceListVersion(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="import-margin">Default Target Margin % <span className="text-muted-foreground text-xs">(optional)</span></Label>
              <Input id="import-margin" data-testid="input-import-default-margin" type="number" placeholder="e.g. 15" value={defaultMargin} onChange={e => setDefaultMargin(e.target.value)} />
            </div>
          </div>

          {/* Action buttons */}
          {!hasCommit && (
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" data-testid="button-dry-run-import" disabled={!selectedFile || loading} onClick={() => runImport("dry_run")}>
                {loading && !hasDryRun ? <span className="animate-spin mr-2 w-4 h-4 border-2 border-current border-t-transparent rounded-full inline-block" /> : null}
                Preview (Dry Run)
              </Button>
              {hasDryRun && (
                <Button className="flex-1" data-testid="button-commit-import" disabled={loading || (dryRunResult?.would_import ?? 0) === 0} onClick={() => runImport("commit")}>
                  {loading ? <span className="animate-spin mr-2 w-4 h-4 border-2 border-current border-t-transparent rounded-full inline-block" /> : null}
                  Commit Import ({dryRunResult?.would_import ?? 0} rows)
                </Button>
              )}
            </div>
          )}

          {/* Dry run result panel */}
          {hasDryRun && !hasCommit && (
            <div className="rounded-md border p-4 space-y-3 bg-muted/20">
              <div className="flex items-center gap-2 font-medium text-sm">
                <CheckCircle2 className="w-4 h-4 text-green-500" />
                Dry Run Preview
              </div>
              <div className="grid grid-cols-3 gap-2 text-center text-sm">
                <div className="rounded bg-green-50 dark:bg-green-950 p-2">
                  <div className="text-2xl font-bold text-green-700 dark:text-green-400" data-testid="text-would-import-count">{dryRunResult!.would_import}</div>
                  <div className="text-muted-foreground">Would Import</div>
                </div>
                <div className="rounded bg-yellow-50 dark:bg-yellow-950 p-2">
                  <div className="text-2xl font-bold text-yellow-700 dark:text-yellow-400" data-testid="text-would-skip-count">{dryRunResult!.would_skip}</div>
                  <div className="text-muted-foreground">Would Skip</div>
                </div>
                <div className="rounded bg-red-50 dark:bg-red-950 p-2">
                  <div className="text-2xl font-bold text-red-700 dark:text-red-400" data-testid="text-error-count">{dryRunResult!.errors.length}</div>
                  <div className="text-muted-foreground">Errors</div>
                </div>
              </div>
              {dryRunResult!.brands_to_auto_create?.length > 0 && (
                <div className="text-sm text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-950 rounded p-2">
                  New brands to auto-create: {dryRunResult!.brands_to_auto_create.join(", ")}
                </div>
              )}
              {allErrors.length > 0 && (
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium text-destructive flex items-center gap-1"><XCircle className="w-3.5 h-3.5" /> Errors ({allErrors.length})</span>
                    <Button variant="ghost" size="sm" data-testid="button-download-error-csv" onClick={() => downloadErrorCsv(allErrors)}>
                      <Download className="w-3.5 h-3.5 mr-1" /> Download error CSV
                    </Button>
                  </div>
                  <div className="max-h-48 overflow-y-auto rounded border text-xs font-mono">
                    {allErrors.slice(0, 50).map((e, idx) => (
                      <div key={idx} className="flex gap-2 px-2 py-1 border-b last:border-0 hover:bg-muted/40">
                        <span className="text-muted-foreground w-10 shrink-0">row {e.row_number}</span>
                        <span className="text-destructive shrink-0">[{e.error_type}]</span>
                        <span className="truncate" title={e.error_message}>{e.error_message}</span>
                      </div>
                    ))}
                    {allErrors.length > 50 && <div className="px-2 py-1 text-muted-foreground">… and {allErrors.length - 50} more (download CSV to see all)</div>}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Commit result panel */}
          {hasCommit && (
            <div className="rounded-md border border-green-300 bg-green-50 dark:bg-green-950 p-4 space-y-2">
              <div className="flex items-center gap-2 font-semibold text-green-700 dark:text-green-400">
                <CheckCircle2 className="w-5 h-5" />
                Import Complete
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm text-center">
                <div>
                  <span className="text-2xl font-bold text-green-700 dark:text-green-400" data-testid="text-imported-count">{commitResult!.imported}</span>
                  <div className="text-muted-foreground">Imported</div>
                </div>
                <div>
                  <span className="text-2xl font-bold text-yellow-700 dark:text-yellow-400" data-testid="text-skipped-count">{commitResult!.skipped}</span>
                  <div className="text-muted-foreground">Skipped</div>
                </div>
              </div>
              {commitResult!.errors.length > 0 && (
                <Button variant="ghost" size="sm" data-testid="button-download-error-csv-commit" onClick={() => downloadErrorCsv(commitResult!.errors)}>
                  <Download className="w-3.5 h-3.5 mr-1" /> Download {commitResult!.errors.length} error rows
                </Button>
              )}
              <Button className="w-full mt-2" data-testid="button-import-done" onClick={() => { reset(); onClose(); }}>Done</Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function Products() {
  const { toast } = useToast();
  const { data: currentUser } = useCurrentUser();
  const canSeeCosts = !!currentUser && (COST_VISIBLE_ROLES as readonly string[]).includes(currentUser.role);
  const canImport = !!currentUser && (currentUser.role === "admin" || currentUser.role === "accountant");
  const { data: allProducts, isLoading: productsLoading } = useQuery<Product[]>({ queryKey: ["/api/products"] });
  const { data: brands } = useQuery<Brand[]>({ queryKey: ["/api/brands"] });
  const { data: lastSoldPrices } = useQuery<Record<string, { price: string; lastSoldAt: string }>>({ queryKey: ["/api/products/last-sold-prices"] });
  const { data: effectivePricesMap } = useQuery<Record<string, { effectivePrice: string; sheetDate: string; noConfirmedPrice: boolean; hasConfirmedToday: boolean; source: string; blendedCost: string | null; globalFloorPrice: string | null; strictFloorPrice: string | null }>>({
    queryKey: ["/api/daily-price-sheets/effective-prices-today"],
    queryFn: async () => {
      const res = await fetch("/api/daily-price-sheets/effective-prices-today", { headers: { Authorization: `Bearer ${localStorage.getItem("token")}` } });
      if (!res.ok) return {};
      return res.json();
    },
  });

  const brandsById = useMemo(() => {
    const m = new Map<string, Brand>();
    (brands ?? []).forEach((b) => m.set(b.id, b));
    return m;
  }, [brands]);

  const [activeTab, setActiveTab] = useState("products");
  const [searchQuery, setSearchQuery] = useState("");
  const [familyFilter, setFamilyFilter] = useState<string>("__all__");
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [productDialogOpen, setProductDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [productForm, setProductForm] = useState<ProductForm>(emptyProductForm());

  // Brand mini-dialog state
  const [brandDialogOpen, setBrandDialogOpen] = useState(false);
  const [newBrandName, setNewBrandName] = useState("");
  const [newBrandMargin, setNewBrandMargin] = useState("10.00");
  const [newBrandNotes, setNewBrandNotes] = useState("");

  const productsOnly = allProducts?.filter(p => p.type !== "service") ?? [];
  const servicesOnly = allProducts?.filter(p => p.type === "service") ?? [];

  const currentList = activeTab === "services" ? servicesOnly : productsOnly;

  const productFamilies = useMemo(() => {
    const set = new Set<string>();
    productsOnly.forEach(p => { if (p.productFamily) set.add(p.productFamily); });
    return Array.from(set).sort();
  }, [productsOnly]);

  const filteredItems = currentList.filter((p) => {
    if (familyFilter !== "__all__" && p.productFamily !== familyFilter) return false;
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    const brandName = (p.brandId ? brandsById.get(p.brandId)?.name : null) || p.brand;
    return (
      p.name.toLowerCase().includes(q) ||
      p.sku.toLowerCase().includes(q) ||
      (brandName && brandName.toLowerCase().includes(q)) ||
      p.category.toLowerCase().includes(q) ||
      (p.productFamily && p.productFamily.toLowerCase().includes(q))
    );
  });

  const noSellingPriceProducts = productsOnly.filter(p => !p.unitPrice || p.unitPrice === "0").length;
  const noSellingPriceServices = servicesOnly.filter(p => !p.unitPrice || p.unitPrice === "0").length;

  const productMutation = useMutation({
    mutationFn: async (data: any) => {
      if (editingProduct) {
        await apiRequest("PATCH", `/api/products/${editingProduct.id}`, data);
      } else {
        await apiRequest("POST", "/api/products", data);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      toast({ title: editingProduct ? (activeTab === "services" ? "Service updated" : "Product updated") : (activeTab === "services" ? "Service created" : "Product created") });
      setProductDialogOpen(false);
      setEditingProduct(null);
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const deleteProductMutation = useMutation({
    mutationFn: async (id: string) => { await apiRequest("DELETE", `/api/products/${id}`); },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      toast({ title: activeTab === "services" ? "Service deleted" : "Product deleted" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const brandMutation = useMutation({
    mutationFn: async (data: { name: string; defaultMarginPct: string; notes: string }) => {
      return await apiRequest("POST", "/api/brands", data);
    },
    onSuccess: async (response: any) => {
      const created = await response.json();
      queryClient.invalidateQueries({ queryKey: ["/api/brands"] });
      toast({ title: "Brand created", description: `${created.name} added` });
      setProductForm((f) => ({ ...f, brandId: created.id }));
      setBrandDialogOpen(false);
      setNewBrandName(""); setNewBrandMargin("10.00"); setNewBrandNotes("");
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const isService = productForm.type === "service";
  const isPanel = !isService && productForm.category === PANEL_CATEGORY;
  const landed = useMemo(
    () => computeLandedChain(productForm.distributorPrice, productForm.logisticsCost, productForm.gstRate, productForm.targetMarginPct),
    [productForm.distributorPrice, productForm.logisticsCost, productForm.gstRate, productForm.targetMarginPct],
  );
  // GST manual-override warning: did the user pick a GST rate that differs from the category's published default?
  const gstDefaultForCategory = productForm.category in productCategoryDefaults
    ? productCategoryDefaults[productForm.category as keyof typeof productCategoryDefaults].gstRate
    : null;
  const gstOverridden = !isService && gstDefaultForCategory && productForm.gstRate !== gstDefaultForCategory;

  const openNewItem = () => {
    setEditingProduct(null);
    setProductForm(activeTab === "services" ? emptyServiceForm() : emptyProductForm());
    setProductDialogOpen(true);
  };

  const openEditProduct = (p: Product) => {
    setEditingProduct(p);
    const tier = (p.customerTierPrice as Record<string, string> | null) ?? {};
    setProductForm({
      name: p.name,
      sku: p.sku,
      category: p.category,
      description: p.description || "",
      unitPrice: String(p.unitPrice ?? ""),
      brand: p.brand || "",
      brandId: p.brandId || "",
      unit: p.unit,
      minStockLevel: String(p.minStockLevel),
      type: p.type || "product",
      hsnCode: p.hsnCode || "",
      gstRate: p.gstRate ? String(p.gstRate) : "18",
      minMarginPct: p.minMarginPct ? String(p.minMarginPct) : "5.00",
      distributorPrice: p.distributorPrice ? String(p.distributorPrice) : "",
      warrantyPeriod: p.warrantyPeriod || "",
      mrp: p.mrp ? String(p.mrp) : "",
      packSize: p.packSize || "",
      almm: !!p.almm,
      dcrCompliant: !!p.dcrCompliant,
      modelSeries: p.modelSeries || "",
      lifecycleStatus: p.lifecycleStatus || "active",
      applicableRegions: (p.applicableRegions as string[] | null) ?? [],
      priceListVersion: p.priceListVersion || "",
      customerTierPrice: {
        end_user: String(tier.end_user ?? ""),
        business: String(tier.business ?? ""),
      },
      logisticsCost: p.logisticsCost ? String(p.logisticsCost) : "",
      targetMarginPct: p.targetMarginPct ? String(p.targetMarginPct) : "",
      productFamily: p.productFamily || "",
      specs: (p.specs as SpecsValue | null) ?? {},
    });
    setProductDialogOpen(true);
  };

  const handleTypeChange = (type: string) => {
    if (type === "service") {
      setProductForm({
        ...productForm,
        type: "service",
        category: "Installation",
        unit: "service",
        minStockLevel: "0",
        sku: productForm.sku || `SVC-${Date.now().toString(36).toUpperCase()}`,
      });
    } else {
      setProductForm({
        ...productForm,
        type: "product",
        category: "Solar Panel / PV Module",
        hsnCode: productCategoryDefaults["Solar Panel / PV Module"].hsnCode,
        gstRate: productCategoryDefaults["Solar Panel / PV Module"].gstRate,
        unit: "pcs",
        minStockLevel: "10",
      });
    }
  };

  const handleCategoryChange = (cat: string) => {
    const next: ProductForm = { ...productForm, category: cat };
    // Auto-fill HSN + GST defaults for product categories (only if user hasn't typed something custom)
    if (productForm.type === "product" && cat in productCategoryDefaults) {
      const def = productCategoryDefaults[cat as keyof typeof productCategoryDefaults];
      // Auto-fill HSN if empty OR if it currently equals the previous category default (i.e. unchanged from auto)
      const prevDefault = productForm.category in productCategoryDefaults
        ? productCategoryDefaults[productForm.category as keyof typeof productCategoryDefaults]
        : null;
      if (!productForm.hsnCode || (prevDefault && productForm.hsnCode === prevDefault.hsnCode)) {
        next.hsnCode = def.hsnCode;
      }
      if (!productForm.gstRate || productForm.gstRate === "0" || (prevDefault && productForm.gstRate === prevDefault.gstRate)) {
        next.gstRate = def.gstRate;
      }
      // Reset panel-only fields if leaving panel category
      if (cat !== PANEL_CATEGORY) {
        next.almm = false;
        next.dcrCompliant = false;
      }
    }
    setProductForm(next);
  };

  const applySuggestedPrice = () => {
    if (landed.suggested != null) {
      setProductForm({ ...productForm, unitPrice: landed.suggested.toFixed(2) });
    }
  };

  /**
   * Auto-population on distributor / target-margin / GST entry — but never overwrites a value the user has already typed.
   *  - If logisticsCost is blank, populate with 2% of distributor.
   *  - If unitPrice is blank and target margin is set, populate with the suggested landed price.
   * Preserves manual override: once any value is set by the user, this never touches it.
   */
  const handleDistributorPriceChange = (v: string) => {
    setProductForm((f) => {
      const next: ProductForm = { ...f, distributorPrice: v };
      const D = parseFloat(v);
      if (isFinite(D) && D > 0) {
        if (!f.logisticsCost) next.logisticsCost = (D * LOGISTICS_DEFAULT_PCT).toFixed(2);
        if (!f.unitPrice) {
          const chain = computeLandedChain(v, next.logisticsCost, f.gstRate, f.targetMarginPct);
          if (chain.suggested != null) next.unitPrice = chain.suggested.toFixed(2);
        }
      }
      return next;
    });
  };

  const handleTargetMarginChange = (v: string) => {
    setProductForm((f) => {
      const next: ProductForm = { ...f, targetMarginPct: v };
      if (!f.unitPrice) {
        const chain = computeLandedChain(f.distributorPrice, f.logisticsCost, f.gstRate, v);
        if (chain.suggested != null) next.unitPrice = chain.suggested.toFixed(2);
      }
      return next;
    });
  };

  const toggleRegion = (r: string) => {
    setProductForm((f) => ({
      ...f,
      applicableRegions: f.applicableRegions.includes(r)
        ? f.applicableRegions.filter((x) => x !== r)
        : [...f.applicableRegions, r],
    }));
  };

  const handleSubmitProduct = () => {
    const isProd = productForm.type === "product";

    // Phase 2.5 minimum-required-fields enforcement: name, category, brand (for products), unit
    if (!productForm.name.trim()) {
      toast({ title: "Name is required", variant: "destructive" }); return;
    }
    if (!productForm.category) {
      toast({ title: "Category is required", variant: "destructive" }); return;
    }
    if (!productForm.unit) {
      toast({ title: "Unit is required", variant: "destructive" }); return;
    }
    if (isProd && !productForm.brandId) {
      toast({ title: "Brand is required", description: "Select an existing brand or click + to add one.", variant: "destructive" }); return;
    }

    const tier: Record<string, number> = {};
    for (const k of ["end_user", "business"] as TierKey[]) {
      const v = parseFloat(productForm.customerTierPrice[k]);
      if (isFinite(v) && v > 0) tier[k] = v;
    }

    // Resolve brand display name from brandId for back-compat with `brand` text column
    const brandObj = productForm.brandId ? brandsById.get(productForm.brandId) : null;
    const brandText = brandObj?.name || productForm.brand || null;

    // Auto-generate SKU if blank — quotable products do not require a manually-entered SKU.
    const autoSku = isProd
      ? `${(brandText || "PRD").toString().slice(0, 4).toUpperCase().replace(/[^A-Z0-9]/g, "")}-${Date.now().toString(36).toUpperCase()}`
      : `SVC-${Date.now().toString(36).toUpperCase()}`;

    const data: any = {
      name: productForm.name.trim(),
      sku: productForm.sku.trim() || autoSku,
      category: productForm.category,
      description: productForm.description || null,
      unitPrice: productForm.unitPrice || "0",
      brand: brandText,
      brandId: productForm.brandId || null,
      unit: productForm.unit,
      minStockLevel: Number(productForm.minStockLevel) || 0,
      type: productForm.type,
      hsnCode: productForm.hsnCode || null,
      gstRate: productForm.gstRate || "0",
      minMarginPct: productForm.minMarginPct ? String(parseFloat(productForm.minMarginPct).toFixed(2)) : "5.00",
    };

    if (isProd) {
      data.distributorPrice = productForm.distributorPrice || null;
      data.warrantyPeriod = productForm.warrantyPeriod || null;
      data.mrp = productForm.mrp || null;
      data.packSize = productForm.packSize || null;
      data.almm = isPanel ? productForm.almm : false;
      data.dcrCompliant = isPanel ? productForm.dcrCompliant : false;
      data.modelSeries = productForm.modelSeries || null;
      data.lifecycleStatus = productForm.lifecycleStatus || "active";
      data.applicableRegions = productForm.applicableRegions.length > 0 ? productForm.applicableRegions : null;
      data.priceListVersion = productForm.priceListVersion || null;
      data.customerTierPrice = Object.keys(tier).length > 0 ? tier : null;
      // Phase 2.5
      data.logisticsCost = productForm.logisticsCost || null;
      data.targetMarginPct = productForm.targetMarginPct ? String(parseFloat(productForm.targetMarginPct).toFixed(2)) : null;
      data.productFamily = productForm.productFamily.trim() || null;
      // Phase 4 — Specs JSONB. Strip empty-string values so we never store noise.
      const cleanSpecs: SpecsValue = {};
      for (const [k, v] of Object.entries(productForm.specs)) {
        if (v === "" || v == null) continue;
        cleanSpecs[k.trim()] = v;
      }
      data.specs = Object.keys(cleanSpecs).length > 0 ? cleanSpecs : null;
    }

    productMutation.mutate(data);
  };

  const renderTable = (items: Product[], isServiceTab: boolean) => (
    <Card>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left p-3 font-medium text-muted-foreground">Name</th>
                {!isServiceTab && <th className="text-left p-3 font-medium text-muted-foreground">SKU</th>}
                <th className="text-left p-3 font-medium text-muted-foreground">Brand</th>
                <th className="text-left p-3 font-medium text-muted-foreground">Category</th>
                {!isServiceTab && <th className="text-left p-3 font-medium text-muted-foreground">Warranty</th>}
                {!isServiceTab && <th className="text-left p-3 font-medium text-muted-foreground">HSN</th>}
                <th className="text-right p-3 font-medium text-muted-foreground">GST %</th>
                {!isServiceTab && canSeeCosts && (
                  <>
                    <th className="text-right p-3 font-medium text-muted-foreground" data-testid="th-distributor-price">Distributor (₹)</th>
                    <th className="text-right p-3 font-medium text-muted-foreground" data-testid="th-landed-cost">Landed incl GST (₹)</th>
                  </>
                )}
                <th className="text-right p-3 font-medium text-muted-foreground">{isServiceTab ? "Service Charge (₹)" : "Selling Price (₹)"}</th>
                <th className="text-right p-3 font-medium text-muted-foreground">Last Sold (₹)</th>
                <th className="text-right p-3 font-medium text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody>
              {productsLoading ? (
                Array.from({ length: 4 }).map((_, i) => {
                  const cols = isServiceTab ? 7 : (10 + (canSeeCosts ? 2 : 0));
                  return (
                  <tr key={i} className="border-b">
                    {Array.from({ length: cols }).map((_, j) => (
                      <td key={j} className="p-3"><Skeleton className="h-4 w-16" /></td>
                    ))}
                  </tr>
                  );
                })
              ) : items.length > 0 ? (
                items.map((item) => {
                  // Fall back to legacy 'brand' text column if brandId is set but the brand record is missing/orphaned.
                  const brandName = (item.brandId ? brandsById.get(item.brandId)?.name : null) || item.brand;
                  return (
                  <tr
                    key={item.id}
                    className="border-b last:border-0"
                    data-testid={`row-${isServiceTab ? "service" : "product"}-${item.id}`}
                  >
                    <td className="p-3 font-medium" data-testid={`text-item-name-${item.id}`}>
                      <div className="flex items-center gap-2 flex-wrap">
                        {item.name}
                        {item.needsPricingReview && (
                          <Badge variant="outline" className="text-xs border-amber-400 text-amber-600 dark:text-amber-400" data-testid={`badge-pricing-review-${item.id}`}>
                            Pricing Review
                          </Badge>
                        )}
                        {!isServiceTab && item.lifecycleStatus && item.lifecycleStatus !== "active" && (
                          <Badge variant="outline" className={`text-xs ${item.lifecycleStatus === "discontinued" ? "border-red-400 text-red-600 dark:text-red-400" : item.lifecycleStatus === "replaced" ? "border-orange-400 text-orange-600 dark:text-orange-400" : "border-slate-400 text-slate-600 dark:text-slate-400"}`} data-testid={`badge-lifecycle-${item.id}`}>
                            {item.lifecycleStatus}
                          </Badge>
                        )}
                        {!isServiceTab && item.almm && (
                          <Badge variant="outline" className="text-xs border-emerald-500 text-emerald-700 dark:text-emerald-400" data-testid={`badge-almm-${item.id}`}>ALMM ✓</Badge>
                        )}
                        {!isServiceTab && item.dcrCompliant && (
                          <Badge variant="outline" className="text-xs border-blue-500 text-blue-700 dark:text-blue-400" data-testid={`badge-dcr-${item.id}`}>DCR ✓</Badge>
                        )}
                        {!isServiceTab && !!item.specs && typeof item.specs === "object" && Object.keys(item.specs as object).length > 0 ? (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Badge variant="outline" className="text-xs border-purple-400 text-purple-700 dark:text-purple-400 cursor-help inline-flex items-center gap-1" data-testid={`badge-specs-${item.id}`}>
                                  <Settings2 className="w-3 h-3" />
                                  Specs
                                </Badge>
                              </TooltipTrigger>
                              <TooltipContent side="top" className="max-w-xs">
                                <div className="space-y-0.5 text-xs">
                                  {Object.entries(item.specs as Record<string, unknown>).slice(0, 8).map(([k, v]) => (
                                    <div key={k}><span className="font-medium">{k}:</span> {String(v)}</div>
                                  ))}
                                  {Object.keys(item.specs as object).length > 8 && (
                                    <div className="text-muted-foreground italic">+ {Object.keys(item.specs as object).length - 8} more…</div>
                                  )}
                                </div>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        ) : null}
                      </div>
                    </td>
                    {!isServiceTab && <td className="p-3 text-muted-foreground" data-testid={`text-item-sku-${item.id}`}>{item.sku}</td>}
                    <td className="p-3 text-muted-foreground" data-testid={`text-item-brand-${item.id}`}>{brandName || "—"}</td>
                    <td className="p-3">
                      <Badge variant="secondary" className="no-default-active-elevate" data-testid={`badge-item-category-${item.id}`}>
                        {item.category}
                      </Badge>
                    </td>
                    {!isServiceTab && (
                      <td className="p-3 text-muted-foreground text-xs" data-testid={`text-item-warranty-${item.id}`}>
                        {item.warrantyPeriod || "—"}
                      </td>
                    )}
                    {!isServiceTab && (
                      <td className="p-3 text-muted-foreground text-xs" data-testid={`text-item-hsn-${item.id}`}>
                        {item.hsnCode || "—"}
                      </td>
                    )}
                    <td className="p-3 text-right" data-testid={`text-item-gst-${item.id}`}>
                      <Badge variant="outline" className="no-default-active-elevate text-xs">
                        {Number(item.gstRate || 0)}%
                      </Badge>
                    </td>
                    {!isServiceTab && canSeeCosts && (() => {
                      const D = parseFloat(item.distributorPrice ?? "");
                      const Lraw = parseFloat(item.logisticsCost ?? "");
                      const G = parseFloat(item.gstRate ?? "0");
                      let landedIncl: number | null = null;
                      if (isFinite(D) && D > 0) {
                        const L = isFinite(Lraw) && Lraw >= 0 ? Lraw : D * LOGISTICS_DEFAULT_PCT;
                        landedIncl = (D + L) * (1 + (isFinite(G) ? G : 0) / 100);
                      }
                      return (
                        <>
                          <td className="p-3 text-right text-muted-foreground" data-testid={`text-item-distributor-${item.id}`}>
                            {isFinite(D) && D > 0 ? `₹${D.toLocaleString("en-IN")}` : "—"}
                          </td>
                          <td className="p-3 text-right text-muted-foreground" data-testid={`text-item-landed-${item.id}`}>
                            {landedIncl != null ? `₹${landedIncl.toLocaleString("en-IN", { maximumFractionDigits: 0 })}` : "—"}
                          </td>
                        </>
                      );
                    })()}
                    <td className="p-3 text-right font-medium" data-testid={`text-item-price-${item.id}`}>
                      ₹{Number(item.unitPrice).toLocaleString()}
                    </td>
                    <td className="p-3 text-right" data-testid={`text-item-last-sold-${item.id}`}>
                      {lastSoldPrices && lastSoldPrices[item.id]
                        ? `₹${Number(lastSoldPrices[item.id].price).toLocaleString()}`
                        : "—"}
                    </td>
                    <td className="p-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button size="icon" variant="ghost" data-testid={`button-edit-item-${item.id}`} onClick={() => openEditProduct(item)}>
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button size="icon" variant="ghost" data-testid={`button-delete-item-${item.id}`} onClick={() => { if (confirm(`Delete this ${isServiceTab ? "service" : "product"}?`)) deleteProductMutation.mutate(item.id); }}>
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
                })
              ) : (
                <tr>
                  <td colSpan={isServiceTab ? 7 : (10 + (canSeeCosts ? 2 : 0))} className="p-8 text-center text-muted-foreground">
                    {searchQuery
                      ? `No ${isServiceTab ? "services" : "products"} match your search.`
                      : `No ${isServiceTab ? "services" : "products"} found. Add your first ${isServiceTab ? "service" : "product"}.`}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="p-6 space-y-6 overflow-auto h-full">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Products & Services</h1>
          <p className="text-muted-foreground text-sm mt-1">Manage your product catalog and service offerings</p>
        </div>
        <div className="flex items-center gap-2">
          {canImport && activeTab === "products" && (
            <Button variant="outline" data-testid="button-import-csv" onClick={() => setShowImportDialog(true)}>
              <Upload className="w-4 h-4 mr-2" />
              Import CSV
            </Button>
          )}
          {activeTab !== "prices" && (
            <Button data-testid="button-add-item" onClick={openNewItem}>
              <Plus className="w-4 h-4 mr-2" />
              {activeTab === "services" ? "Add Service" : "Add Product"}
            </Button>
          )}
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => { setActiveTab(v); setSearchQuery(""); }}>
        <TabsList data-testid="tabs-products-services">
          <TabsTrigger value="products" data-testid="tab-products" className="gap-1.5">
            <Package className="w-4 h-4" />
            Products ({productsOnly.length})
          </TabsTrigger>
          <TabsTrigger value="services" data-testid="tab-services" className="gap-1.5">
            <Wrench className="w-4 h-4" />
            Services ({servicesOnly.length})
          </TabsTrigger>
          <TabsTrigger value="prices" data-testid="tab-today-prices" className="gap-1.5">
            <TrendingUp className="w-4 h-4" />
            Today's Prices
          </TabsTrigger>
        </TabsList>

        <TabsContent value="products" className="space-y-4 mt-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Card>
              <CardContent className="p-5 flex items-center gap-4">
                <div className="w-10 h-10 rounded-md bg-blue-50 dark:bg-blue-950/30 flex items-center justify-center">
                  <Package className="w-5 h-5 text-blue-500" />
                </div>
                <div>
                  <p className="text-2xl font-bold" data-testid="text-stat-products">{productsOnly.length}</p>
                  <p className="text-xs text-muted-foreground">Total Products</p>
                </div>
              </CardContent>
            </Card>
            {noSellingPriceProducts > 0 && (
              <Card>
                <CardContent className="p-5 flex items-center gap-4">
                  <div className="w-10 h-10 rounded-md bg-red-50 dark:bg-red-950/30 flex items-center justify-center">
                    <AlertCircle className="w-5 h-5 text-red-500" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold" data-testid="text-stat-no-price-products">{noSellingPriceProducts}</p>
                    <p className="text-xs text-muted-foreground">Without Selling Price</p>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search by name, SKU, brand, category, family..."
                className="pl-9"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                data-testid="input-search-products"
              />
            </div>
            {productFamilies.length > 0 && (
              <Select value={familyFilter} onValueChange={setFamilyFilter}>
                <SelectTrigger className="w-60" data-testid="select-family-filter">
                  <SelectValue placeholder="Filter by family" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All families</SelectItem>
                  {productFamilies.map((f) => (
                    <SelectItem key={f} value={f} data-testid={`option-family-${f.replace(/[^a-zA-Z0-9]/g, "-")}`}>{f}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {renderTable(filteredItems, false)}
        </TabsContent>

        <TabsContent value="services" className="space-y-4 mt-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Card>
              <CardContent className="p-5 flex items-center gap-4">
                <div className="w-10 h-10 rounded-md bg-orange-50 dark:bg-orange-950/30 flex items-center justify-center">
                  <Wrench className="w-5 h-5 text-orange-500" />
                </div>
                <div>
                  <p className="text-2xl font-bold" data-testid="text-stat-services">{servicesOnly.length}</p>
                  <p className="text-xs text-muted-foreground">Total Services</p>
                </div>
              </CardContent>
            </Card>
            {noSellingPriceServices > 0 && (
              <Card>
                <CardContent className="p-5 flex items-center gap-4">
                  <div className="w-10 h-10 rounded-md bg-red-50 dark:bg-red-950/30 flex items-center justify-center">
                    <AlertCircle className="w-5 h-5 text-red-500" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold" data-testid="text-stat-no-price-services">{noSellingPriceServices}</p>
                    <p className="text-xs text-muted-foreground">Without Service Charge</p>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          <div className="flex items-center gap-2">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search by name, brand, category..."
                className="pl-9"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                data-testid="input-search-services"
              />
            </div>
          </div>

          {renderTable(filteredItems, true)}
        </TabsContent>

        <TabsContent value="prices" className="space-y-4 mt-4">
            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left p-3 font-medium text-muted-foreground">Product</th>
                        <th className="text-left p-3 font-medium text-muted-foreground">Unit</th>
                        <th className="text-right p-3 font-medium text-muted-foreground">Effective Price (₹)</th>
                        <th className="text-center p-3 font-medium text-muted-foreground">Source</th>
                        <th className="text-right p-3 font-medium text-muted-foreground">Floor Price (₹)</th>
                        <th className="text-right p-3 font-medium text-muted-foreground">Last Sold (₹)</th>
                        <th className="text-left p-3 font-medium text-muted-foreground">Last Sold Date</th>
                        <th className="text-center p-3 font-medium text-muted-foreground">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {!effectivePricesMap || productsLoading ? (
                        Array.from({ length: 5 }).map((_, i) => (
                          <tr key={i} className="border-b">
                            {Array.from({ length: 8 }).map((_, j) => (
                              <td key={j} className="p-3"><Skeleton className="h-4 w-20" /></td>
                            ))}
                          </tr>
                        ))
                      ) : productsOnly.length === 0 ? (
                        <tr><td colSpan={8} className="text-center py-8 text-muted-foreground">No products found</td></tr>
                      ) : (
                        productsOnly.map((product) => {
                          const ep = effectivePricesMap?.[product.id];
                          const ls = lastSoldPrices?.[product.id];
                          const source = ep?.source ?? "none";
                          const sourceBadge =
                            source === "today" ? <Badge className="bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-400 border-green-300 text-[10px] px-1.5 py-0.5">🟢 Confirmed Today</Badge> :
                            source === "fallback" ? <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400 border-amber-300 text-[10px] px-1.5 py-0.5">🟡 Prev Sheet ({ep?.sheetDate})</Badge> :
                            <Badge className="bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400 border-red-300 text-[10px] px-1.5 py-0.5">🔴 No Price</Badge>;
                          return (
                            <tr key={product.id} className="border-b last:border-0" data-testid={`row-price-${product.id}`}>
                              <td className="p-3 font-medium" data-testid={`text-price-name-${product.id}`}>
                                <div>
                                  <div>{product.name}</div>
                                  <div className="text-xs text-muted-foreground">{product.sku}</div>
                                </div>
                              </td>
                              <td className="p-3 text-muted-foreground text-xs" data-testid={`text-price-unit-${product.id}`}>
                                {product.unit || "—"}
                              </td>
                              <td className="p-3 text-right font-semibold" data-testid={`text-price-effective-${product.id}`}>
                                {ep ? `₹${Number(ep.effectivePrice).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—"}
                              </td>
                              <td className="p-3 text-center" data-testid={`badge-price-source-${product.id}`}>
                                {sourceBadge}
                              </td>
                              <td className="p-3 text-right text-muted-foreground" data-testid={`text-price-floor-${product.id}`}>
                                {ep?.globalFloorPrice ? `₹${Number(ep.globalFloorPrice).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—"}
                              </td>
                              <td className="p-3 text-right" data-testid={`text-price-lastsold-${product.id}`}>
                                {ls ? `₹${Number(ls.price).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—"}
                              </td>
                              <td className="p-3 text-xs text-muted-foreground" data-testid={`text-price-lastsold-date-${product.id}`}>
                                {ls?.lastSoldAt ? new Date(ls.lastSoldAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—"}
                              </td>
                              <td className="p-3 text-center">
                                {ep?.hasConfirmedToday ? (
                                  <Badge className="bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-400 text-[10px]" data-testid={`badge-price-status-${product.id}`}>Confirmed Today</Badge>
                                ) : ep && !ep.noConfirmedPrice ? (
                                  <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400 text-[10px]" data-testid={`badge-price-status-${product.id}`}>Prior Sheet</Badge>
                                ) : (
                                  <Badge className="bg-muted text-muted-foreground text-[10px]" data-testid={`badge-price-status-${product.id}`}>No Sheet</Badge>
                                )}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
      </Tabs>

      <Dialog open={productDialogOpen} onOpenChange={setProductDialogOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingProduct ? (isService ? "Edit Service" : "Edit Product") : (isService ? "Add Service" : "Add Product")}</DialogTitle>
            <DialogDescription>
              {isService ? "Service items for installation, maintenance, etc." : "Physical product or material"}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
            {/* Type */}
            <div className="space-y-2">
              <Label>Type</Label>
              <Select value={productForm.type} onValueChange={handleTypeChange}>
                <SelectTrigger data-testid="select-product-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="product"><span className="flex items-center gap-1"><Package className="w-3 h-3" /> Product</span></SelectItem>
                  <SelectItem value="service"><span className="flex items-center gap-1"><Wrench className="w-3 h-3" /> Service</span></SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Name + SKU */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="prodName">Name</Label>
                <Input id="prodName" data-testid="input-product-name" value={productForm.name} onChange={(e) => setProductForm({ ...productForm, name: e.target.value })} placeholder={isService ? "e.g. Solar Panel Installation" : "e.g. 400W Mono PERC Panel"} />
              </div>
              {!isService && (
                <div className="space-y-2">
                  <Label htmlFor="prodSku">SKU</Label>
                  <Input id="prodSku" data-testid="input-product-sku" value={productForm.sku} onChange={(e) => setProductForm({ ...productForm, sku: e.target.value })} />
                </div>
              )}
            </div>

            {/* Brand + Category */}
            <div className="grid grid-cols-2 gap-4">
              {!isService ? (
                <div className="space-y-2">
                  <Label>Brand</Label>
                  <div className="flex gap-2">
                    <Select value={productForm.brandId} onValueChange={(v) => setProductForm({ ...productForm, brandId: v })}>
                      <SelectTrigger className="flex-1" data-testid="select-product-brand">
                        <SelectValue placeholder="Select brand…" />
                      </SelectTrigger>
                      <SelectContent>
                        {(brands ?? []).map((b) => (
                          <SelectItem key={b.id} value={b.id} data-testid={`option-brand-${b.id}`}>{b.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button type="button" variant="outline" size="icon" data-testid="button-add-brand" onClick={() => setBrandDialogOpen(true)} title="Add new brand">
                      <Plus className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <Label htmlFor="prodBrand">Brand / Company</Label>
                  <Input id="prodBrand" data-testid="input-product-brand" value={productForm.brand} onChange={(e) => setProductForm({ ...productForm, brand: e.target.value })} placeholder="e.g. ITFI" />
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="prodCategory">Category</Label>
                <Select value={productForm.category} onValueChange={handleCategoryChange}>
                  <SelectTrigger data-testid="select-product-category">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(isService ? serviceCategories : productCategoryValues).map((c) => (
                      <SelectItem key={c} value={c} data-testid={`option-category-${c.replace(/[^a-zA-Z0-9]/g, "-")}`}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label htmlFor="prodDesc">Description</Label>
              <Input id="prodDesc" data-testid="input-product-description" value={productForm.description} onChange={(e) => setProductForm({ ...productForm, description: e.target.value })} />
            </div>

            {/* Cost & landed price block — admin/accountant only */}
            {!isService && canSeeCosts && (
              <div className="rounded-md border p-3 space-y-3 bg-muted/20" data-testid="section-cost-block">
                <Label className="text-xs uppercase tracking-wide text-muted-foreground">Cost & Landed Price (admin / accountant only)</Label>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="prodDistPrice">Distributor Price (₹)</Label>
                    <Input id="prodDistPrice" type="number" step="0.01" min="0" data-testid="input-product-distributor-price"
                      value={productForm.distributorPrice}
                      onChange={(e) => handleDistributorPriceChange(e.target.value)}
                      placeholder="From brand's published rate" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="prodLogistics">Logistics Cost / Unit (₹)</Label>
                    <Input id="prodLogistics" type="number" step="0.01" min="0" data-testid="input-product-logistics-cost"
                      value={productForm.logisticsCost}
                      onChange={(e) => setProductForm({ ...productForm, logisticsCost: e.target.value })}
                      placeholder={landed.D ? `est. 2% of distributor = ${formatINR(landed.D * LOGISTICS_DEFAULT_PCT)}` : "—"} />
                    {landed.D && landed.logisticsIsDefault && (
                      <p className="text-xs text-muted-foreground" data-testid="text-logistics-default-hint">
                        Using 2% default = {formatINR(landed.L!)} (override anytime)
                      </p>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="prodTargetMargin">Target Margin %</Label>
                    <Input id="prodTargetMargin" type="number" step="0.01" min="0" max="100" data-testid="input-product-target-margin"
                      value={productForm.targetMarginPct}
                      onChange={(e) => handleTargetMarginChange(e.target.value)}
                      placeholder="e.g. 18 (drives suggested selling price)" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="prodMinMargin">Min Margin % (floor)</Label>
                    <Input id="prodMinMargin" type="number" step="0.01" min="0" max="100" data-testid="input-product-min-margin"
                      value={productForm.minMarginPct}
                      onChange={(e) => setProductForm({ ...productForm, minMarginPct: e.target.value })}
                      placeholder="5.00" />
                  </div>
                </div>

                {/* Computed landed-cost display */}
                {landed.D != null && (
                  <div className="rounded-md bg-background border p-2.5 text-xs space-y-1" data-testid="display-landed-chain">
                    <div className="flex justify-between"><span className="text-muted-foreground">Landed Cost (excl. GST)</span><span className="font-mono" data-testid="text-landed-excl">{formatINR(landed.landedExcl!)}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Landed Cost (incl. {landed.gst}% GST)</span><span className="font-mono" data-testid="text-landed-incl">{formatINR(landed.landedIncl!)}</span></div>
                    {landed.suggested != null && (
                      <div className="flex justify-between pt-1 border-t">
                        <span className="text-muted-foreground">Suggested Selling Price (× {landed.T}% target margin)</span>
                        <span className="font-mono font-semibold text-blue-700 dark:text-blue-400" data-testid="text-suggested-price">{formatINR(landed.suggested)}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="prodSellingPrice" className="flex items-center gap-1.5">
                {isService ? "Service Charge (₹)" : "Selling Price / Unit Price (₹)"}
                {editingProduct && !isService && effectivePricesMap?.[editingProduct.id]?.hasConfirmedToday && (
                  <span className="inline-flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 px-1.5 py-0.5 rounded">
                    <Lock className="w-3 h-3" />
                    Locked — confirmed price sheet today
                  </span>
                )}
              </Label>
              <div className="relative">
                <Input
                  id="prodSellingPrice"
                  type="number"
                  data-testid="input-product-selling-price"
                  value={productForm.unitPrice}
                  onChange={(e) => setProductForm({ ...productForm, unitPrice: e.target.value })}
                  disabled={!!editingProduct && !isService && !!effectivePricesMap?.[editingProduct.id]?.hasConfirmedToday}
                  className={editingProduct && !isService && effectivePricesMap?.[editingProduct.id]?.hasConfirmedToday ? "bg-muted cursor-not-allowed" : ""}
                />
                {!isService && canSeeCosts && landed.suggested != null && (
                  <button type="button" onClick={applySuggestedPrice} data-testid="button-apply-suggested-price"
                    className="text-xs text-blue-600 dark:text-blue-400 hover:underline mt-1 flex items-center gap-1">
                    <Calculator className="w-3 h-3" />
                    Suggested: {formatINR(landed.suggested)} (landed incl. GST × {landed.T}% target margin) — click to apply
                  </button>
                )}
                {editingProduct && !isService && effectivePricesMap?.[editingProduct.id] && (
                  <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                    <TrendingUp className="w-3 h-3 text-blue-500" />
                    {effectivePricesMap[editingProduct.id].hasConfirmedToday
                      ? `Today's confirmed price: ₹${Number(effectivePricesMap[editingProduct.id].effectivePrice).toLocaleString("en-IN")}. To change, update via Daily Pricing.`
                      : `Last confirmed price (${effectivePricesMap[editingProduct.id].sheetDate}): ₹${Number(effectivePricesMap[editingProduct.id].effectivePrice).toLocaleString("en-IN")} — no sheet confirmed today.`
                    }
                  </p>
                )}
              </div>
            </div>

            {/* Tax */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="prodGstRate">GST Rate {!isService && <span className="text-xs text-muted-foreground">(auto from category)</span>}</Label>
                <Select value={productForm.gstRate} onValueChange={(v) => setProductForm({ ...productForm, gstRate: v })}>
                  <SelectTrigger data-testid="select-product-gst-rate">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {["0", "5", "12", "18", "28"].map((r) => (
                      <SelectItem key={r} value={r}>{r}%</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {gstOverridden && (
                  <p className="text-xs text-amber-700 dark:text-amber-400 flex items-start gap-1 mt-1" data-testid="warning-gst-override">
                    <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
                    Non-standard rate for this category (default is {gstDefaultForCategory}%). Make sure this is intentional.
                  </p>
                )}
              </div>
              {!isService && (
                <div className="space-y-2">
                  <Label htmlFor="prodHsn">HSN Code <span className="text-xs text-muted-foreground">(auto from category)</span></Label>
                  <Input id="prodHsn" data-testid="input-product-hsn" value={productForm.hsnCode} onChange={(e) => setProductForm({ ...productForm, hsnCode: e.target.value })} placeholder="e.g. 85414300" />
                </div>
              )}
            </div>

            {/* Product-only blocks below */}
            {!isService && (
              <>
                {/* MRP + Warranty */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="prodMrp">MRP (₹)</Label>
                    <Input id="prodMrp" type="number" step="0.01" min="0" data-testid="input-product-mrp"
                      value={productForm.mrp}
                      onChange={(e) => setProductForm({ ...productForm, mrp: e.target.value })}
                      placeholder="Manufacturer's published retail price" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="prodWarranty">Warranty Period</Label>
                    <Input id="prodWarranty" data-testid="input-product-warranty"
                      value={productForm.warrantyPeriod}
                      onChange={(e) => setProductForm({ ...productForm, warrantyPeriod: e.target.value })}
                      placeholder="e.g. 25 years / 2 years" />
                  </div>
                </div>

                {/* Pack size + Model series */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="prodPackSize">Pack Size</Label>
                    <Input id="prodPackSize" data-testid="input-product-pack-size"
                      value={productForm.packSize}
                      onChange={(e) => setProductForm({ ...productForm, packSize: e.target.value })}
                      placeholder="e.g. 10 / 1 box of 20" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="prodModelSeries">Model Series</Label>
                    <Input id="prodModelSeries" data-testid="input-product-model-series"
                      value={productForm.modelSeries}
                      onChange={(e) => setProductForm({ ...productForm, modelSeries: e.target.value })}
                      placeholder="e.g. EM-W3 / Solarverter Pro" />
                  </div>
                </div>

                {/* Product family — flat grouping label, optional */}
                <div className="space-y-2">
                  <Label htmlFor="prodFamily">Product Family <span className="text-xs text-muted-foreground">(optional grouping label)</span></Label>
                  <Input id="prodFamily" data-testid="input-product-family"
                    value={productForm.productFamily}
                    onChange={(e) => setProductForm({ ...productForm, productFamily: e.target.value })}
                    placeholder="e.g. Luminous OPTIMUS Series / Eastman Smart Series"
                    list="product-family-suggestions" />
                  <datalist id="product-family-suggestions">
                    {productFamilies.map((f) => <option key={f} value={f} />)}
                  </datalist>
                </div>

                {/* ALMM / DCR — panels only */}
                {isPanel && (
                  <div className="rounded-md border p-3 space-y-2 bg-blue-50/40 dark:bg-blue-950/10">
                    <Label className="text-xs uppercase tracking-wide text-blue-700 dark:text-blue-400">Solar Panel Compliance</Label>
                    <div className="flex items-center gap-6 flex-wrap">
                      <label className="flex items-center gap-2 text-sm cursor-pointer">
                        <Checkbox checked={productForm.almm} onCheckedChange={(v) => setProductForm({ ...productForm, almm: !!v })} data-testid="checkbox-almm" />
                        <span>ALMM-listed</span>
                      </label>
                      <label className="flex items-center gap-2 text-sm cursor-pointer">
                        <Checkbox checked={productForm.dcrCompliant} onCheckedChange={(v) => setProductForm({ ...productForm, dcrCompliant: !!v })} data-testid="checkbox-dcr" />
                        <span>DCR-compliant</span>
                      </label>
                    </div>
                  </div>
                )}

                {/* Lifecycle + Price List Version */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Lifecycle Status</Label>
                    <Select value={productForm.lifecycleStatus} onValueChange={(v) => setProductForm({ ...productForm, lifecycleStatus: v })}>
                      <SelectTrigger data-testid="select-product-lifecycle">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {productLifecycleValues.map((v) => (
                          <SelectItem key={v} value={v} data-testid={`option-lifecycle-${v}`}>{v}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="prodPriceListVer">Price List Version</Label>
                    <Input id="prodPriceListVer" data-testid="input-product-price-list-version"
                      value={productForm.priceListVersion}
                      onChange={(e) => setProductForm({ ...productForm, priceListVersion: e.target.value })}
                      placeholder="e.g. Eastman 2026-Q2" />
                  </div>
                </div>

                {/* Applicable regions */}
                <div className="space-y-2">
                  <Label>Applicable Regions</Label>
                  <div className="flex flex-wrap gap-2">
                    {applicableRegionValues.map((r) => {
                      const active = productForm.applicableRegions.includes(r);
                      return (
                        <button key={r} type="button" onClick={() => toggleRegion(r)} data-testid={`chip-region-${r}`}
                          className={`px-3 py-1 rounded-full text-xs border transition-colors ${active ? "bg-blue-600 text-white border-blue-600" : "bg-background border-border hover:border-blue-400"}`}>
                          {active && <X className="w-3 h-3 inline mr-1" />}
                          {r}
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-xs text-muted-foreground">Empty = applicable everywhere</p>
                </div>

                {/* Customer tier prices */}
                <div className="space-y-2">
                  <Label>Customer Tier Prices (₹) — optional</Label>
                  <div className="rounded-md border divide-y">
                    {(["end_user", "business"] as TierKey[]).map((tier) => (
                      <div key={tier} className="flex items-center gap-3 p-2.5">
                        <span className="text-sm w-48 text-muted-foreground">{TIER_LABELS[tier]}</span>
                        <Input type="number" step="0.01" min="0" className="h-8" data-testid={`input-tier-price-${tier}`}
                          value={productForm.customerTierPrice[tier]}
                          onChange={(e) => setProductForm({ ...productForm, customerTierPrice: { ...productForm.customerTierPrice, [tier]: e.target.value } })}
                          placeholder="(blank = use selling price)" />
                      </div>
                    ))}
                  </div>
                </div>

                {/* Phase 4 — Specifications */}
                <SpecsEditor
                  category={productForm.category}
                  value={productForm.specs}
                  onChange={(next) => setProductForm({ ...productForm, specs: next })}
                />

                {/* Inventory */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="prodUnit">Unit</Label>
                    <Select value={productForm.unit} onValueChange={(v) => setProductForm({ ...productForm, unit: v })}>
                      <SelectTrigger data-testid="select-product-unit">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {["pcs", "kg", "ltr", "mtr", "box"].map((u) => (
                          <SelectItem key={u} value={u}>{u}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="prodMinStock">Min Stock Level</Label>
                    <Input id="prodMinStock" type="number" data-testid="input-product-min-stock" value={productForm.minStockLevel} onChange={(e) => setProductForm({ ...productForm, minStockLevel: e.target.value })} />
                  </div>
                </div>
              </>
            )}
          </div>
          <DialogFooter>
            <Button data-testid="button-submit-product" disabled={productMutation.isPending} onClick={handleSubmitProduct}>
              {productMutation.isPending ? "Saving..." : editingProduct ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Brand mini-dialog */}
      <Dialog open={brandDialogOpen} onOpenChange={setBrandDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add New Brand</DialogTitle>
            <DialogDescription>Brands you onboard appear in the Brand selector across the catalog.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="newBrandName">Name</Label>
              <Input id="newBrandName" data-testid="input-new-brand-name" value={newBrandName} onChange={(e) => setNewBrandName(e.target.value)} placeholder="e.g. Vikram Solar" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="newBrandMargin">Default Margin %</Label>
              <Input id="newBrandMargin" type="number" step="0.01" min="0" max="100" data-testid="input-new-brand-margin" value={newBrandMargin} onChange={(e) => setNewBrandMargin(e.target.value)} />
              <p className="text-xs text-muted-foreground">Used as a fallback when products of this brand have no min-margin set.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="newBrandNotes">Notes (optional)</Label>
              <Textarea id="newBrandNotes" data-testid="input-new-brand-notes" value={newBrandNotes} onChange={(e) => setNewBrandNotes(e.target.value)} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBrandDialogOpen(false)} data-testid="button-cancel-brand">Cancel</Button>
            <Button data-testid="button-submit-brand" disabled={!newBrandName.trim() || brandMutation.isPending}
              onClick={() => brandMutation.mutate({ name: newBrandName.trim(), defaultMarginPct: newBrandMargin || "10.00", notes: newBrandNotes.trim() })}>
              {brandMutation.isPending ? "Adding..." : "Add Brand"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk CSV Import dialog */}
      <ImportCSVDialog
        open={showImportDialog}
        onClose={() => setShowImportDialog(false)}
        onSuccess={() => setShowImportDialog(false)}
      />
    </div>
  );
}
