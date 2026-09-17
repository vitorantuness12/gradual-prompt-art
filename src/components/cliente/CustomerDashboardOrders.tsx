import { Link } from "@tanstack/react-router";
import { ChevronRight, Clock3, History, RotateCcw, ShoppingBag } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ORDER_STATUS_LABEL, ORDER_TYPE_LABEL, formatCurrency, formatDateTime } from "@/lib/format";
import type { MyOrderSummary } from "@/lib/contas.functions";

const ACTIVE_STATUSES = new Set([
  "pending",
  "awaiting_payment",
  "paid",
  "confirmed",
  "preparing",
  "ready",
  "out_for_delivery",
]);

export function isActiveCustomerOrder(status: string): boolean {
  return ACTIVE_STATUSES.has(status);
}

interface CustomerDashboardOrdersProps {
  orders: MyOrderSummary[];
  mode: "active" | "history" | "all";
}

export function CustomerDashboardOrders({ orders, mode }: CustomerDashboardOrdersProps) {
  const visible = orders.filter(
    (order) => mode === "all" || isActiveCustomerOrder(order.status) === (mode === "active"),
  );

  if (visible.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-card px-5 py-10 text-center">
        <ShoppingBag className="mx-auto size-8 text-muted-foreground" aria-hidden="true" />
        <p className="mt-3 font-medium text-foreground">
          {mode === "active" ? "Nenhum pedido em andamento" : "Seu histórico está vazio"}
        </p>
        <p className="mt-1 text-sm text-muted-foreground">Seus próximos pedidos aparecerão aqui.</p>
        <Button asChild className="mt-4" size="sm">
          <Link to="/">Encontrar uma loja</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {visible.map((order) => {
        const active = isActiveCustomerOrder(order.status);
        return (
          <Card key={order.id} className="rounded-lg border-border/80 shadow-sm">
            <CardContent className="p-4 sm:p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-foreground">{order.storeName}</p>
                  <p className="mt-1 text-xs text-muted-foreground">Pedido #{order.code}</p>
                </div>
                <Badge
                  variant={
                    order.status === "cancelled" || order.status === "rejected"
                      ? "destructive"
                      : "secondary"
                  }
                >
                  {ORDER_STATUS_LABEL[order.status] ?? order.status}
                </Badge>
              </div>
              <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-sm text-muted-foreground">
                <span className="inline-flex items-center gap-1.5">
                  <Clock3 className="size-4" aria-hidden="true" />
                  {formatDateTime(order.createdAt)}
                </span>
                <span>{ORDER_TYPE_LABEL[order.type] ?? order.type}</span>
                <span className="font-semibold text-foreground">{formatCurrency(order.total)}</span>
              </div>
              <div className="mt-4 flex flex-wrap gap-2 border-t border-border pt-4">
                {active ? (
                  <Button asChild size="sm">
                    <Link to="/acompanhar" search={{ codigo: order.publicToken }}>
                      Acompanhar <ChevronRight className="ml-1 size-4" aria-hidden="true" />
                    </Link>
                  </Button>
                ) : null}
                {order.storeSlug ? (
                  <Button asChild size="sm" variant="outline">
                    <Link to="/$slug" params={{ slug: order.storeSlug }} search={{ repetir: true }}>
                      <RotateCcw className="mr-1.5 size-4" aria-hidden="true" />
                      Comprar novamente
                    </Link>
                  </Button>
                ) : null}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

export function CustomerOrderSectionTitle({ history = false }: { history?: boolean }) {
  const Icon = history ? History : Clock3;
  return (
    <span className="inline-flex items-center gap-2">
      <Icon className="size-4 text-primary" aria-hidden="true" />
      {history ? "Histórico" : "Em andamento"}
    </span>
  );
}
