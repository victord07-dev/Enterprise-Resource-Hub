import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Truck } from "lucide-react";
import { useLocation } from "wouter";
import { fmtINR } from "@/lib/format";

export interface TopSupplier {
  supplierId: string | null;
  supplierName: string;
  totalPaid: number;
  paymentCount: number;
}

interface Props {
  data?: TopSupplier[];
  isLoading?: boolean;
}

export default function TopSuppliersWidget({ data, isLoading }: Props) {
  const [, setLocation] = useLocation();
  return (
    <Card data-testid="widget-top-suppliers">
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <Truck className="w-4 h-4 text-orange-500" />
          Top Suppliers (period)
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}
          </div>
        ) : !data || data.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">No supplier payments in this period</p>
        ) : (
          <div className="space-y-1.5">
            {data.map((s, idx) => (
              <div
                key={s.supplierId ?? idx}
                className="flex items-center justify-between gap-3 px-2 py-1.5 rounded-md hover-elevate cursor-pointer"
                onClick={() => s.supplierId && setLocation(`/supply-chain?supplierId=${s.supplierId}`)}
                data-testid={`row-top-supplier-${s.supplierId ?? idx}`}
              >
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <span className="w-5 h-5 rounded-full bg-orange-100 dark:bg-orange-950/40 flex items-center justify-center text-[10px] font-semibold text-orange-700 dark:text-orange-400 flex-shrink-0">
                    {idx + 1}
                  </span>
                  <span className="text-sm truncate" title={s.supplierName}>{s.supplierName}</span>
                  <span className="text-[10px] text-muted-foreground flex-shrink-0">×{s.paymentCount}</span>
                </div>
                <span className="text-sm font-semibold tabular-nums">{fmtINR(s.totalPaid)}</span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
