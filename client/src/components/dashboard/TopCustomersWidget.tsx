import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Users } from "lucide-react";
import { useLocation } from "wouter";
import { fmtINR } from "@/lib/format";

export interface TopCustomer {
  customerId: string | null;
  customerName: string;
  totalReceived: number;
  paymentCount: number;
}

interface Props {
  data?: TopCustomer[];
  isLoading?: boolean;
}

export default function TopCustomersWidget({ data, isLoading }: Props) {
  const [, setLocation] = useLocation();
  return (
    <Card data-testid="widget-top-customers">
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <Users className="w-4 h-4 text-violet-500" />
          Top Customers (period)
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}
          </div>
        ) : !data || data.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">No payments received in this period</p>
        ) : (
          <div className="space-y-1.5">
            {data.map((c, idx) => (
              <div
                key={c.customerId ?? idx}
                className="flex items-center justify-between gap-3 px-2 py-1.5 rounded-md hover-elevate cursor-pointer"
                onClick={() => c.customerId && setLocation(`/leads?customerId=${c.customerId}`)}
                data-testid={`row-top-customer-${c.customerId ?? idx}`}
              >
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <span className="w-5 h-5 rounded-full bg-violet-100 dark:bg-violet-950/40 flex items-center justify-center text-[10px] font-semibold text-violet-700 dark:text-violet-400 flex-shrink-0">
                    {idx + 1}
                  </span>
                  <span className="text-sm truncate" title={c.customerName}>{c.customerName}</span>
                  <span className="text-[10px] text-muted-foreground flex-shrink-0">×{c.paymentCount}</span>
                </div>
                <span className="text-sm font-semibold tabular-nums">{fmtINR(c.totalReceived)}</span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
