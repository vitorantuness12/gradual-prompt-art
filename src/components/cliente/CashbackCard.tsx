import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { customerCashback } from "@/lib/cashback-cliente.functions";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";

export interface CashbackCardProps extends React.ComponentPropsWithoutRef<"div"> {
  /** Sessão assinada do cliente (login por telefone). */
  session: string;
}

function formatDate(value: string | null) {
  if (!value) return null;
  return new Date(value).toLocaleDateString("pt-BR");
}

/**
 * Saldo de cashback do cliente por loja, com validade destacada quando estiver
 * perto de vencer e o extrato de créditos/resgates.
 */
export function CashbackCard({ session, className, ...props }: CashbackCardProps) {
  const fetchCashback = useServerFn(customerCashback);
  const query = useQuery({
    queryKey: ["cliente-cashback", session],
    queryFn: () => fetchCashback({ data: { session } }),
  });

  if (query.isPending) {
    return <Skeleton className={cn("h-32 w-full", className)} />;
  }

  const data = query.data;
  if (!data?.ok || data.stores.length === 0) return null;

  return (
    <div className={cn("space-y-3", className)} {...props}>
      <Card className="border-border/70">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Meu cashback</CardTitle>
          <CardDescription>
            Saldo total disponível: <strong>{formatCurrency(data.total)}</strong>. Use no checkout da
            loja onde foi acumulado.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {data.stores.map((store) => (
            <div key={store.storeId} className="space-y-2 rounded-lg border border-border/70 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-medium text-foreground">{store.storeName}</p>
                  <p className="text-lg font-semibold text-primary">
                    {formatCurrency(Math.max(0, store.balance))}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  {store.expiresAt ? (
                    <Badge variant={store.expiringSoon ? "destructive" : "secondary"}>
                      {store.expiringSoon ? "Vence em " : "Válido até "}
                      {formatDate(store.expiresAt)}
                    </Badge>
                  ) : null}

                  {store.storeSlug && store.balance > 0 ? (
                    <Button asChild size="sm">
                      <Link to="/$slug" params={{ slug: store.storeSlug }}>
                        Resgatar
                      </Link>
                    </Button>
                  ) : null}
                </div>
              </div>

              {store.entries.length ? (
                <ul className="space-y-1 border-t border-border/60 pt-2">
                  {store.entries.map((entry) => (
                    <li key={entry.id} className="flex items-center justify-between gap-3 text-xs">
                      <span className="min-w-0 truncate text-muted-foreground">
                        {formatDate(entry.createdAt)} · {entry.description}
                        {entry.orderCode ? ` · #${entry.orderCode}` : ""}
                      </span>
                      <span
                        className={cn(
                          "shrink-0 font-semibold",
                          entry.amount >= 0 ? "text-emerald-700" : "text-foreground",
                        )}
                      >
                        {entry.amount >= 0 ? "+" : "-"}
                        {formatCurrency(Math.abs(entry.amount))}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
