import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Activity, ArrowDown, ArrowUp, ArrowLeftRight, Receipt, Settings } from "lucide-react";
import { fmtINR, fmtDateTime } from "@/lib/format";

export type ActivityEventType =
  | "customer_payment"
  | "supplier_payment"
  | "expense"
  | "transfer"
  | "adjustment";

export interface ActivityEvent {
  type: ActivityEventType;
  id: string;
  occurredAt: string;
  amount: number; // signed: + inflow, − outflow
  label: string;
  ref?: string | null;
}

const ICONS: Record<ActivityEventType, any> = {
  customer_payment: ArrowDown,
  supplier_payment: ArrowUp,
  expense: Receipt,
  transfer: ArrowLeftRight,
  adjustment: Settings,
};

const ICON_COLORS: Record<ActivityEventType, { fg: string; bg: string }> = {
  customer_payment: { fg: "text-green-600",  bg: "bg-green-50 dark:bg-green-950/40" },
  supplier_payment: { fg: "text-orange-600", bg: "bg-orange-50 dark:bg-orange-950/40" },
  expense:          { fg: "text-rose-600",   bg: "bg-rose-50 dark:bg-rose-950/40" },
  transfer:         { fg: "text-blue-600",   bg: "bg-blue-50 dark:bg-blue-950/40" },
  adjustment:       { fg: "text-violet-600", bg: "bg-violet-50 dark:bg-violet-950/40" },
};

interface Props {
  data?: ActivityEvent[];
  isLoading?: boolean;
}

export default function RecentActivityFeed({ data, isLoading }: Props) {
  return (
    <Card data-testid="widget-recent-activity">
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <Activity className="w-4 h-4 text-blue-500" />
          Recent Activity
          <span className="text-[10px] font-normal text-muted-foreground ml-auto">auto-refresh 60s</span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
          </div>
        ) : !data || data.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">No recent activity</p>
        ) : (
          <div className="space-y-1 max-h-96 overflow-auto">
            {data.map((ev) => {
              const Icon = ICONS[ev.type] ?? Activity;
              const colors = ICON_COLORS[ev.type] ?? { fg: "text-muted-foreground", bg: "bg-muted" };
              const negative = ev.amount < 0;
              const sign = ev.amount === 0 ? "" : negative ? "−" : "+";
              return (
                <div
                  key={`${ev.type}-${ev.id}`}
                  className="flex items-center gap-3 px-2 py-1.5 rounded-md"
                  data-testid={`activity-${ev.type}-${ev.id}`}
                >
                  <div className={`w-7 h-7 rounded-full ${colors.bg} flex items-center justify-center flex-shrink-0`}>
                    <Icon className={`w-3.5 h-3.5 ${colors.fg}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm truncate" title={ev.label}>{ev.label}</p>
                    <p className="text-[11px] text-muted-foreground">{fmtDateTime(ev.occurredAt)}</p>
                  </div>
                  {ev.amount !== 0 && (
                    <span className={`text-sm font-semibold tabular-nums flex-shrink-0 ${negative ? "text-red-600" : "text-green-600"}`}>
                      {sign}{fmtINR(Math.abs(ev.amount))}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
