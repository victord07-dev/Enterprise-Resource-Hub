import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Package, Wrench, Boxes } from "lucide-react";
import type { Product } from "@shared/schema";

type EffectivePriceEntry = {
  effectivePrice: string;
  noConfirmedPrice: boolean;
  hasConfirmedToday: boolean;
  sheetDate: string | null;
  blendedCost?: string | null;
  globalFloorPrice?: string | null;
  strictFloorPrice?: string | null;
  source?: string;
};

type Brand = { id: string; name: string };

interface Props {
  lineIndex: number;
  products: Product[];
  effectivePrices?: Record<string, EffectivePriceEntry>;
  currentProductId: string;
  onProductSelect: (productId: string) => void;
}

const lifecycleSuffix = (ls: string | undefined): string => {
  switch (ls) {
    case "draft":        return "(Not selectable — draft)";
    case "discontinued": return "(Not selectable — discontinued)";
    case "replaced":     return "(Not selectable — replaced)";
    default:             return "";
  }
};

const GRID_TYPE_LABELS: Record<string, string> = {
  off_grid: "Off-Grid",
  on_grid:  "On-Grid",
  hybrid:   "Hybrid",
  others:   "Others",
};

export function HierarchicalProductPicker({
  lineIndex,
  products,
  effectivePrices,
  currentProductId,
  onProductSelect,
}: Props) {
  const [selectedType, setSelectedType]         = useState<string>("");
  const [selectedBrandId, setSelectedBrandId]   = useState<string>("");
  const [selectedGridType, setSelectedGridType] = useState<string>("__any__");  // "__any__" = no filter

  const { data: brands = [] } = useQuery<Brand[]>({ queryKey: ["/api/brands"] });

  const handleTypeChange = (type: string) => {
    setSelectedType(type);
    setSelectedBrandId("");
    setSelectedGridType("__any__");
  };

  const handleBrandChange = (brandId: string) => {
    setSelectedBrandId(brandId);
    setSelectedGridType("__any__");
  };

  // Brand step: products / bundles (not services)
  const showBrandStep    = !!selectedType && selectedType !== "service";
  // Grid Type step: shown after brand is chosen for products/bundles (not services)
  const showGridTypeStep = showBrandStep && !!selectedBrandId;
  // Product list step
  const showProductStep  = selectedType === "service" || (showBrandStep && !!selectedBrandId);

  // Products with that type (and brand for non-service)
  const typeFilteredProducts = products.filter((p) => {
    if (!selectedType) return false;
    if (p.type !== selectedType) return false;
    if (selectedType !== "service" && selectedBrandId) {
      if ((p as any).brandId !== selectedBrandId) return false;
    }
    return true;
  });

  // Derive which grid types actually exist for this type+brand combo
  const availableGridTypes = Array.from(
    new Set(typeFilteredProducts.map((p) => (p as any).gridType ?? "others"))
  ).sort();

  // Final product list — apply optional grid type filter (__any__ = no filter)
  const filteredProducts = typeFilteredProducts.filter((p) => {
    if (selectedGridType === "__any__") return true;
    return ((p as any).gridType ?? "others") === selectedGridType;
  });

  const productStepLabel =
    selectedType === "bundle" ? "Set" : selectedType === "service" ? "Service" : "Product";

  return (
    <div className="space-y-2">
      {/* Step 1: Type */}
      <div>
        <Label className="text-xs text-muted-foreground">Type</Label>
        <Select
          value={selectedType}
          onValueChange={handleTypeChange}
        >
          <SelectTrigger className="h-8 text-xs" data-testid={`select-item-type-${lineIndex}`}>
            <SelectValue placeholder="Select type…" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="product">
              <span className="flex items-center gap-1.5">
                <Package className="w-3 h-3" /> Product
              </span>
            </SelectItem>
            <SelectItem value="service">
              <span className="flex items-center gap-1.5">
                <Wrench className="w-3 h-3" /> Service
              </span>
            </SelectItem>
            <SelectItem value="bundle">
              <span className="flex items-center gap-1.5">
                <Boxes className="w-3 h-3" /> Set
              </span>
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Step 2: Brand (products + bundles only) */}
      {showBrandStep && (
        <div>
          <Label className="text-xs text-muted-foreground">Brand</Label>
          <Select
            value={selectedBrandId}
            onValueChange={handleBrandChange}
          >
            <SelectTrigger className="h-8 text-xs" data-testid={`select-item-brand-${lineIndex}`}>
              <SelectValue placeholder="Select brand…" />
            </SelectTrigger>
            <SelectContent>
              {brands.map((b) => (
                <SelectItem key={b.id} value={b.id}>
                  {b.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Step 3: Grid Type filter (products + bundles, after brand chosen) */}
      {showGridTypeStep && availableGridTypes.length > 1 && (
        <div>
          <Label className="text-xs text-muted-foreground">Grid Type <span className="font-normal opacity-60">(optional filter)</span></Label>
          <Select
            value={selectedGridType}
            onValueChange={setSelectedGridType}
          >
            <SelectTrigger className="h-8 text-xs" data-testid={`select-item-grid-type-${lineIndex}`}>
              <SelectValue placeholder="Any grid type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__any__" data-testid={`option-grid-type-any-${lineIndex}`}>
                Any grid type
              </SelectItem>
              {availableGridTypes.map((gt) => (
                <SelectItem key={gt} value={gt} data-testid={`option-grid-type-${gt}-${lineIndex}`}>
                  {GRID_TYPE_LABELS[gt] ?? gt}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Step 4: Product / Service / Set list */}
      {showProductStep && (
        <div>
          <Label className="text-xs text-muted-foreground">{productStepLabel}</Label>
          <Select
            value={currentProductId || ""}
            onValueChange={onProductSelect}
          >
            <SelectTrigger className="h-8 text-xs" data-testid={`select-item-product-${lineIndex}`}>
              <SelectValue placeholder={`Select ${productStepLabel.toLowerCase()}…`} />
            </SelectTrigger>
            <SelectContent>
              {filteredProducts.length === 0 ? (
                <div className="px-3 py-3 text-xs text-muted-foreground text-center">
                  No {productStepLabel.toLowerCase()}s found
                </div>
              ) : (
                filteredProducts.map((p) => {
                  const ep = effectivePrices?.[p.id];
                  const displayPrice = ep && !ep.noConfirmedPrice
                    ? Number(ep.effectivePrice)
                    : Number((p as any).unitPrice ?? 0);
                  const hasEP = ep && !ep.noConfirmedPrice;
                  const ls = (p as any).lifecycleStatus as string | undefined;
                  const suffix = lifecycleSuffix(ls);
                  const isInactive = !!suffix;
                  const gt = (p as any).gridType as string | undefined;
                  return (
                    <SelectItem
                      key={p.id}
                      value={p.id}
                      data-testid={`option-product-${p.id}`}
                    >
                      <span className="inline-flex items-center gap-1.5 flex-wrap">
                        <span>
                          {p.name}
                          {!isInactive
                            ? ` — ₹${displayPrice.toLocaleString()}${hasEP ? " ✓" : ""}`
                            : ""}
                        </span>
                        {gt && gt !== "others" && !isInactive && (
                          <span className="text-xs text-blue-600 dark:text-blue-400 opacity-70">
                            [{GRID_TYPE_LABELS[gt] ?? gt}]
                          </span>
                        )}
                        {isInactive && (
                          <span
                            className="text-xs text-red-600 dark:text-red-400"
                            data-testid={`text-lifecycle-${p.id}`}
                          >
                            {suffix}
                          </span>
                        )}
                      </span>
                    </SelectItem>
                  );
                })
              )}
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  );
}
