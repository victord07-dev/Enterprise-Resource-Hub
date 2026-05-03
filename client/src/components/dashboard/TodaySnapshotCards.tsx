/**
 * Phase 4C — FIX 2: Today snapshot row (5 point-in-time cards).
 *
 * Sits above the period-scoped MetricCardsRow. Always reflects "right now":
 *   • Outstanding Receivables  — sum of open AR via canonical helper
 *   • Outstanding Payables     — sum of open AP via canonical helper
 *   • Net Working Capital      — cash on hand + AR - AP
 *   • Today In                 — customer_payments + legacy payments(today)
 *   • Today Out                — supplier_payments + expenses(today)
 *
 * totalCashPosition card intentionally skipped — Cash Position strip's TOTAL
 * line is the canonical cash display (operator decision 3). Transfers and
 * balance adjustments excluded from todayIn/Out (operator decision 2).
 */
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowDownCircle, ArrowUpCircle, Banknote, ReceiptText, Scale } from "lucide-react";
import { fmtINR } from "@/lib/format";

export interface TodaySnapshot {
  outstandingReceivables: number;
  outstandingPayables: number;
  netWorkingCapital: number;
  todayIn: number;
  todayOut: number;
}

interface Props {
  data?: TodaySnapshot;
  isLoading?: boolean;
}

export default function TodaySnapshotCards({ data, isLoading }: Props) {
  const cards = [
    { key: "outstandingReceivables", title: "Outstanding Receivables", value: data?.outstandingReceivables ?? 0,
      icon: ReceiptText, color: "text-blue-600",   bg: "bg-blue-50 dark:bg-blue-950/30" },
    { key: "outstandingPayables",    title: "Outstanding Payables",    value: data?.outstandingPayables ?? 0,
      icon: ReceiptText, color: "text-orange-600", bg: "bg-orange-50 dark:bg-orange-950/30" },
    { key: "netWorkingCapital",      title: "Net Working Capital",     value: data?.netWorkingCapital ?? 0,
      icon: Scale, isNet: true,
      color: (data?.netWorkingCapital ?? 0) >= 0 ? "text-emerald-600" : "text-red-600",
      bg:    (data?.netWorkingCapital ?? 0) >= 0 ? "bg-emerald-50 dark:bg-emerald-950/30" : "bg-red-50 dark:bg-red-950/30" },
    { key: "todayIn",                title: "Today In",                value: data?.todayIn ?? 0,
      icon: ArrowDownCircle, color: "text-green-600", bg: "bg-green-50 dark:bg-green-950/30" },
    { key: "todayOut",               title: "Today Out",               value: data?.todayOut ?? 0,
      icon: ArrowUpCircle,   color: "text-rose-600",  bg: "bg-rose-50 dark:bg-rose-950/30" },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3" data-testid="today-snapshot-cards">
      {cards.map(c => {
        const Icon = c.icon;
        const sign = c.isNet && c.value !== 0 ? (c.value > 0 ? "+" : "−") : "";
        const display = sign + fmtINR(Math.abs(c.value));
        return (
          <Card key={c.key} data-testid={`card-today-${c.key}`}>
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
                   data-testid={`text-today-${c.key}`}>
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
