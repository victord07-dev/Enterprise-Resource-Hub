/**
 * Phase 4C — Pending Actions widget.
 *
 * Per scratchpad refinement, the supplier-side row is split:
 *   - "Supplier invoices to upload" (uploadStatus = pending_upload)
 *   - "Supplier payments overdue" (status NOT IN (paid,cancelled) AND due < today)
 * to avoid conflating two different operational queues.
 */
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertTriangle, FileText, Upload, AlertCircle, Clock } from "lucide-react";
import { useLocation } from "wouter";
import { fmtINR } from "@/lib/format";

export interface PendingActions {
  grnDrafts: number;
  supplierInvoicesPendingUpload: number;
  overdueCustomerInvoices: { count: number; amount: number };
  overdueSupplierInvoices: { count: number; amount: number };
  quotationsExpiringThisWeek: number;
}

interface Props {
  data?: PendingActions;
  isLoading?: boolean;
}

export default function PendingActionsWidget({ data, isLoading }: Props) {
  const [, setLocation] = useLocation();

  const items = [
    { key: "grn",       icon: FileText,    color: "text-amber-600",  count: data?.grnDrafts ?? 0,
      label: "GRN drafts to finalize", target: "/supply-chain?tab=grn" },
    { key: "supupload", icon: Upload,      color: "text-blue-600",   count: data?.supplierInvoicesPendingUpload ?? 0,
      label: "Supplier invoices to upload", target: "/accounts?tab=supplier-invoices" },
    { key: "overcust",  icon: AlertCircle, color: "text-red-600",    count: data?.overdueCustomerInvoices.count ?? 0,
      amount: data?.overdueCustomerInvoices.amount ?? 0,
      label: "Customer invoices overdue", target: "/accounts?tab=ar-aging" },
    { key: "oversup",   icon: AlertCircle, color: "text-orange-600", count: data?.overdueSupplierInvoices.count ?? 0,
      amount: data?.overdueSupplierInvoices.amount ?? 0,
      label: "Supplier payments overdue", target: "/accounts?tab=ap-aging" },
    { key: "quoteexp",  icon: Clock,       color: "text-violet-600", count: data?.quotationsExpiringThisWeek ?? 0,
      label: "Quotations expiring this week", target: "/sales?tab=quotations" },
  ];

  const totalPending = items.reduce((s, i) => s + i.count, 0);

  return (
    <Card data-testid="widget-pending-actions">
      <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-500" />
          Pending Actions
        </CardTitle>
        {!isLoading && totalPending > 0 && (
          <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 font-medium" data-testid="badge-pending-total">
            {totalPending} item{totalPending !== 1 ? "s" : ""}
          </span>
        )}
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
          </div>
        ) : (
          <div className="space-y-1">
            {items.map(item => {
              const Icon = item.icon;
              const muted = item.count === 0;
              return (
                <div
                  key={item.key}
                  className={`flex items-center justify-between gap-3 px-2 py-2 rounded-md transition-colors ${muted ? "opacity-50" : "hover-elevate cursor-pointer"}`}
                  onClick={muted ? undefined : () => setLocation(item.target)}
                  data-testid={`row-pending-${item.key}`}
                >
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <Icon className={`w-4 h-4 flex-shrink-0 ${muted ? "text-muted-foreground" : item.color}`} />
                    <span className={`text-sm ${muted ? "text-muted-foreground" : ""}`}>{item.label}</span>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {item.amount !== undefined && item.amount > 0 && (
                      <span className="text-xs text-muted-foreground tabular-nums">{fmtINR(item.amount)}</span>
                    )}
                    <span className={`text-sm font-semibold tabular-nums ${muted ? "" : item.color}`} data-testid={`count-pending-${item.key}`}>
                      {item.count}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
