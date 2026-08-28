import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { EmptyState, PageHeader } from "@/components/painel/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useActiveStore } from "@/hooks/useMyStores";
import { supabase } from "@/integrations/supabase/client";
import { ORDER_TYPE_LABEL, formatDateTime } from "@/lib/format";
import { elapsedMinutes } from "@/lib/delivery";
import { defaultPrintSettings, printOrder } from "@/lib/print";
import { PRINT_STATIONS, STATION_LABEL, stationForItem } from "@/lib/salao";

export const Route = createFileRoute("/_authenticated/painel/kds")({
  component: KdsPage,
});

const KDS_STATUSES = ["confirmed", "preparing", "ready"] as const;

function KdsPage() {
  const { active } = useActiveStore();
  const storeId = active?.storeId;
  const queryClient = useQueryClient();
  const [station, setStation] = useState("todas");
  const [tick, setTick] = useState(0);

  // Atualiza o tempo decorrido a cada 30 segundos.
  useEffect(() => {
    const timer = window.setInterval(() => setTick((value) => value + 1), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const { data, isLoading } = useQuery({
    queryKey: ["kds", storeId, tick],
    enabled: Boolean(storeId),
    refetchInterval: 20_000,
    queryFn: async () => {
      const [orders, settings, store] = await Promise.all([
        supabase
          .from("orders")
          .select("*, order_items(id, product_name, quantity, notes, prep_station)")
          .eq("store_id", storeId!)
          .in("status", [...KDS_STATUSES])
          .order("priority", { ascending: false })
          .order("created_at", { ascending: true })
          .limit(60),
        supabase.from("print_settings").select("*").eq("store_id", storeId!).maybeSingle(),
        supabase
          .from("stores")
          .select("name, phone, address_street, address_number, address_district, address_city")
          .eq("id", storeId!)
          .maybeSingle(),
      ]);
      if (orders.error) throw new Error(orders.error.message);
      return { orders: orders.data ?? [], settings: settings.data, store: store.data };
    },
  });

  const advance = useMutation({
    mutationFn: async ({ orderId, status }: { orderId: string; status: string }) => {
      const now = new Date().toISOString();
      const patch = {
        status: status as "preparing" | "ready",
        ...(status === "preparing" ? { prep_started_at: now } : {}),
        ...(status === "ready" ? { prep_ready_at: now } : {}),
      };
      const { error } = await supabase.from("orders").update(patch).eq("id", orderId);
      if (error) throw new Error(error.message);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["kds", storeId] });
    },
    onError: () => toast.error("Não foi possível atualizar o pedido."),
  });

  const bumpPriority = useMutation({
    mutationFn: async ({ orderId, priority }: { orderId: string; priority: number }) => {
      const { error } = await supabase.from("orders").update({ priority }).eq("id", orderId);
      if (error) throw new Error(error.message);
    },
    onSuccess: async () => queryClient.invalidateQueries({ queryKey: ["kds", storeId] }),
  });

  const settings = data?.settings;
  // Setores do salão (cozinha, bar, confeitaria, expedição) — o mesmo
  // roteamento usado na impressão setorizada.
  const stations = PRINT_STATIONS.filter((item) => item.value !== "caixa");
  const orders = (data?.orders ?? []).filter((order) => {
    if (station === "todas") return true;
    const items = (order.order_items ?? []) as { prep_station: string | null }[];
    return items.some((item) => stationForItem(item.prep_station) === station);
  });

  const columns = [
    { status: "confirmed", label: "Na fila", next: "preparing", action: "Iniciar preparo" },
    { status: "preparing", label: "Em preparo", next: "ready", action: "Marcar pronto" },
    { status: "ready", label: "Pronto", next: null, action: "" },
  ] as const;

  return (
    <div>
      <PageHeader
        title="Monitor de preparo (KDS)"
        description="Filas por estação, prioridade e tempo decorrido de cada pedido."
      />

      <Tabs value={station} onValueChange={setStation} className="mb-4">
        <TabsList className="flex-wrap">
          <TabsTrigger value="todas">Todas</TabsTrigger>
          {stations.map((item) => (
            <TabsTrigger key={item.value} value={item.value}>
              {item.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {isLoading ? (
        <Skeleton className="h-64 rounded-2xl" />
      ) : orders.length === 0 ? (
        <EmptyState title="Nenhum pedido na fila" description="Pedidos confirmados aparecem aqui automaticamente." />
      ) : (
        <div className="grid gap-4 lg:grid-cols-3">
          {columns.map((column) => {
            const list = orders.filter((order) => order.status === column.status);
            return (
              <div key={column.status} className="space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{column.label}</h2>
                  <Badge variant="secondary">{list.length}</Badge>
                </div>
                {list.map((order) => {
                  const minutes = elapsedMinutes(order.prep_started_at ?? order.created_at);
                  const late = minutes > 30;
                  const items = (order.order_items ?? []) as {
                    id: string;
                    product_name: string;
                    quantity: number;
                    notes: string | null;
                    prep_station: string | null;
                  }[];
                  return (
                    <Card
                      key={order.id}
                      className={late ? "border-destructive/60 shadow-sm" : "border-border/70 shadow-sm"}
                    >
                      <CardContent className="space-y-2 pt-5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold text-foreground">#{order.code}</span>
                          <span className={late ? "text-sm font-semibold text-destructive" : "text-sm text-muted-foreground"}>
                            {minutes} min
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {ORDER_TYPE_LABEL[order.type] ?? order.type} · {formatDateTime(order.created_at)}
                          {order.priority > 0 ? " · Prioritário" : ""}
                        </p>
                        <ul className="space-y-1 text-sm text-foreground">
                          {items
                            .filter((item) => station === "todas" || stationForItem(item.prep_station) === station)
                            .map((item) => (
                              <li key={item.id}>
                                <span className="font-medium">{item.quantity}x</span> {item.product_name}
                                {item.notes ? <span className="block text-xs text-muted-foreground">{item.notes}</span> : null}
                              </li>
                            ))}
                        </ul>
                        <div className="flex flex-wrap gap-2 pt-1">
                          {column.next ? (
                            <Button
                              size="sm"
                              onClick={() => advance.mutate({ orderId: order.id, status: column.next as string })}
                            >
                              {column.action}
                            </Button>
                          ) : null}
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => bumpPriority.mutate({ orderId: order.id, priority: order.priority > 0 ? 0 : 1 })}
                          >
                            {order.priority > 0 ? "Remover prioridade" : "Priorizar"}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() =>
                              printOrder(
                                {
                                  code: order.code,
                                  type: order.type,
                                  status: order.status,
                                  created_at: order.created_at,
                                  customer_name: order.customer_name,
                                  customer_phone: order.customer_phone,
                                  address: order.address,
                                  notes: order.notes,
                                  subtotal: order.subtotal,
                                  delivery_fee: order.delivery_fee,
                                  discount: order.discount,
                                  total: order.total,
                                  payment_method: order.payment_method,
                                  payment_status: order.payment_status,
                                  table_number: order.table_number,
                                  items: items.map((item) => ({
                                    product_name: item.product_name,
                                    quantity: item.quantity,
                                    unit_price: 0,
                                    total: 0,
                                    notes: item.notes,
                                  })),
                                },
                                {
                                  name: data?.store?.name ?? "Loja",
                                  phone: data?.store?.phone ?? null,
                                  address_street: data?.store?.address_street ?? null,
                                  address_number: data?.store?.address_number ?? null,
                                  address_district: data?.store?.address_district ?? null,
                                  address_city: data?.store?.address_city ?? null,
                                },
                                settings
                                  ? {
                                      ...defaultPrintSettings(),
                                      ...settings,
                                      mode: settings.mode === "common" ? "common" : "thermal",
                                      show_prices: false,
                                    }
                                  : { ...defaultPrintSettings(), show_prices: false },
                              )
                            }
                          >
                            Imprimir
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
