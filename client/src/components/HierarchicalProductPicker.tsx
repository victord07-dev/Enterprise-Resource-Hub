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

export function HierarchicalProductPicker({
  lineIndex,
  products,
  effectivePrices,
  currentProductId,
  onProductSelect,
}: Props) {
  const [selectedType, setSelectedType] = useState<string>("");
  const [selectedBrandId, setSelectedBrandId] = useState<string>("");

  const { data: brands = [] } = useQuery<Brand[]>({ queryKey: ["/api/brands"] });

  const handleTypeChange = (type: string) => {
    setSelectedType(type);
    setSelectedBrandId("");
  };

  const handleBrandChange = (brandId: string) => {
    setSelectedBrandId(brandId);
  };

  const showBrandStep = !!selectedType && selectedType !== "service";
  const showProductStep = selectedType === "service" || (showBrandStep && !!selectedBrandId);

  const filteredProducts = products.filter((p) => {
    if (!selectedType) return false;
    const dbType = selectedType === "bundle" ? "bundle" : selectedType;
    if (p.type !== dbType) return false;
    if (selectedType !== "service" && selectedBrandId) {
      if ((p as any).brandId !== selectedBrandId) return false;
    }
    return true;
  });

  const productStepLabel =
    selectedType === "bundle" ? "Set" : selectedType === "service" ? "Service" : "Product";

  return (
    <div className="space-y-2">
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
                  No {productStepLabel.toLowerCase()}s found for this brand
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
