/**
 * Phase 4C — Period-aware metric cards: Revenue, Invoiced Sales, Expenses,
 * Supplier Paid, Net Cash Flow.
 *
 * "Revenue" = customer payments actually received in period (cash basis).
 * "Invoiced Sales" = sales_invoices.grand_total raised in period (accrual basis).
 * Both are useful for Indian SME ops (cash for liquidity, accrual for GST).
 */
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { IndianRupee, FileText, Receipt, TrendingDown, TrendingUp, Wallet } from "lucide-react";
import { fmtINR } from "@/lib/format";

export interface PeriodTotals {
  revenue: number;
  invoicedSales: number;
  expenses: number;
  supplierPaid: number;
  netCashFlow: number;
}

interface Props {
  data?: PeriodTotals;
  isLoading?: boolean;
}

export default function MetricCardsRow({ data, isLoading }: Props) {
  const cards = [
    { key: "revenue",       title: "Revenue Received",  value: data?.revenue ?? 0,       icon: IndianRupee,  color: "text-green-600",  bg: "bg-green-50 dark:bg-green-950/30" },
    { key: "invoicedSales", title: "Invoiced Sales",    value: data?.invoicedSales ?? 0, icon: FileText,     color: "text-blue-600",   bg: "bg-blue-50 dark:bg-blue-950/30" },
    { key: "expenses",      title: "Expenses",          value: data?.expenses ?? 0,      icon: Receipt,      color: "text-rose-600",   bg: "bg-rose-50 dark:bg-rose-950/30" },
    { key: "supplierPaid",  title: "Paid to Suppliers", value: data?.supplierPaid ?? 0,  icon: TrendingDown, color: "text-orange-600", bg: "bg-orange-50 dark:bg-orange-950/30" },
    { key: "netCashFlow",   title: "Net Cash Flow",     value: data?.netCashFlow ?? 0,   icon: Wallet,
      color: (data?.netCashFlow ?? 0) >= 0 ? "text-emerald-600" : "text-red-600",
      bg:    (data?.netCashFlow ?? 0) >= 0 ? "bg-emerald-50 dark:bg-emerald-950/30" : "bg-red-50 dark:bg-red-950/30",
      isNet: true },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3" data-testid="metric-cards-row">
      {cards.map(c => {
        const Icon = c.icon;
        const sign = c.key === "netCashFlow" && c.value !== 0 ? (c.value > 0 ? "+" : "−") : "";
        const display = sign + fmtINR(Math.abs(c.value));
        return (
          <Card key={c.key} data-testid={`card-period-${c.key}`}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs text-muted-foreground truncate">{c.title}</p>
                <div className={`w-7 h-7 rounded-md flex items-center justify-center ${c.bg}`}>
                  <Icon className={`w-3.5 h-3.5 ${c.color}`} />
                </div>
              </div>
              {isLoading ? (
                <Skeleton className="h-7 w-20 mt-2" />
              ) : (
                <p className={`text-xl font-semibold mt-1 tabular-nums ${c.isNet ? c.color : ""}`}
                   data-testid={`text-period-${c.key}`}>
                  {display}
                </p>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
