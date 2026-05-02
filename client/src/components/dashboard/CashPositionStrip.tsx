/**
 * Phase 4C — One card per active cash account, plus a Total card.
 * Click an account to navigate to its detail page.
 */
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Banknote, Wallet, Layers } from "lucide-react";
import { useLocation } from "wouter";
import { fmtINR } from "@/lib/format";

export interface AccountBalance {
  accountId: string;
  accountName: string;
  accountType: "bank" | "cash";
  balance: number;
}

interface Props {
  data?: AccountBalance[];
  isLoading?: boolean;
}

export default function CashPositionStrip({ data, isLoading }: Props) {
  const [, setLocation] = useLocation();
  const total = (data ?? []).reduce((s, a) => s + a.balance, 0);

  return (
    <div className="space-y-2" data-testid="cash-position-strip">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-muted-foreground">Cash Position</h2>
        {!isLoading && (
          <span className="text-xs text-muted-foreground">
            Total across {data?.length ?? 0} accounts: <span className="font-semibold text-foreground tabular-nums" data-testid="text-cash-total">{fmtINR(total)}</span>
          </span>
        )}
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}><CardContent className="p-4"><Skeleton className="h-12 w-full" /></CardContent></Card>
          ))
        ) : (data ?? []).length === 0 ? (
          <Card className="col-span-full"><CardContent className="p-4 text-center text-sm text-muted-foreground">No active cash accounts</CardContent></Card>
        ) : (
          (data ?? []).map(a => {
            const Icon = a.accountType === "bank" ? Banknote : Wallet;
            const negative = a.balance < 0;
            return (
              <Card
                key={a.accountId}
                className="cursor-pointer hover-elevate active-elevate-2 transition-all"
                onClick={() => setLocation(`/accounts?tab=cash&id=${a.accountId}`)}
                data-testid={`card-account-${a.accountId}`}
              >
                <CardContent className="p-4">
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <Icon className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{a.accountType}</span>
                  </div>
                  <p className="text-xs text-muted-foreground truncate" title={a.accountName}>{a.accountName}</p>
                  <p className={`text-lg font-semibold tabular-nums mt-0.5 ${negative ? "text-red-600" : ""}`} data-testid={`text-balance-${a.accountId}`}>
                    {negative ? "−" : ""}{fmtINR(Math.abs(a.balance))}
                  </p>
                </CardContent>
              </Card>
            );
          })
        )}
        {!isLoading && (data ?? []).length > 0 && (
          <Card className="bg-muted/40 border-dashed">
            <CardContent className="p-4">
              <div className="flex items-center justify-between gap-2 mb-2">
                <Layers className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground">all</span>
              </div>
              <p className="text-xs text-muted-foreground">Total Cash on Hand</p>
              <p className={`text-lg font-bold tabular-nums mt-0.5 ${total < 0 ? "text-red-600" : ""}`}>
                {total < 0 ? "−" : ""}{fmtINR(Math.abs(total))}
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
