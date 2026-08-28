import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Bell, Minus, Plus, Receipt, Search, Send, Utensils } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Logo } from "@/components/brand/Logo";
import { EmptyState } from "@/components/painel/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useActiveStore } from "@/hooks/useMyStores";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency } from "@/lib/format";
import { statusLabel } from "@/lib/orders";
import {
  CALL_LABEL,
  STATION_LABEL,
  TABLE_STATUS_LABEL,
  TABLE_STATUS_TONE,
  billTotals,
  matchesTable,
} from "@/lib/salao";
import {
  addSessionOrder,
  closeSession,
  openTableSession,
  requestSessionBill,
  resolveTableCall,
} from "@/lib/salao.functions";

export const Route = createFileRoute("/_authenticated/garcom")({
  component: WaiterPage,
  head: () => ({
    meta: [
      { title: "Área do garçom | O Seu Pedido" },
      { name: "description", content: "Mesas, lançamento de itens, acompanhamento de preparo e chamados na palma da mão." },
    ],
  }),
});

function WaiterPage() {
  const { active } = useActiveStore();
  const storeId = active?.storeId;
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState<{ productId: string; name: string; price: number; quantity: number; notes: string }[]>([]);

  const tablesQuery = useQuery({
    queryKey: ["waiter-tables", storeId],
    enabled: Boolean(storeId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dining_tables")
        .select("id, label, seats, status")
        .eq("store_id", storeId!)
        .eq("is_active", true)
        .order("label");
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  const sessionsQuery = useQuery({
    queryKey: ["waiter-sessions", storeId],
    enabled: Boolean(storeId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("table_sessions")
        .select("id, code, status, guests, discount, service_fee_percent, table_id")
        .eq("store_id", storeId!)
        .in("status", ["open", "awaiting_payment"]);
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  const callsQuery = useQuery({
    queryKey: ["waiter-calls", storeId],
    enabled: Boolean(storeId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("table_calls")
        .select("id, kind, note, table_id, created_at")
        .eq("store_id", storeId!)
        .eq("status", "open")
        .order("created_at");
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  const productsQuery = useQuery({
    queryKey: ["waiter-products", storeId],
    enabled: Boolean(storeId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, price, promo_price, prep_station")
        .eq("store_id", storeId!)
        .eq("is_active", true)
        .is("archived_at", null)
        .order("name");
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  const session = (sessionsQuery.data ?? []).find((item) => item.table_id === selected) ?? null;

  const detailQuery = useQuery({
    queryKey: ["waiter-session-detail", session?.id],
    enabled: Boolean(session?.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("id, code, status, created_at, order_items(id, product_name, quantity, unit_price, prep_station, notes)")
        .eq("table_session_id", session!.id)
        .order("created_at");
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  useEffect(() => {
    if (!storeId) return;
    const channel = supabase
      .channel(`garcom-${storeId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "dining_tables", filter: `store_id=eq.${storeId}` }, () =>
        queryClient.invalidateQueries({ queryKey: ["waiter-tables", storeId] }),
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "table_sessions", filter: `store_id=eq.${storeId}` }, () =>
        queryClient.invalidateQueries({ queryKey: ["waiter-sessions", storeId] }),
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "table_calls", filter: `store_id=eq.${storeId}` }, (payload) => {
        const call = payload.new as { kind?: string } | null;
        if (payload.eventType === "INSERT" && call?.kind) toast.info(CALL_LABEL[call.kind] ?? "Novo chamado");
        void queryClient.invalidateQueries({ queryKey: ["waiter-calls", storeId] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "orders", filter: `store_id=eq.${storeId}` }, () =>
        queryClient.invalidateQueries({ queryKey: ["waiter-session-detail"] }),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [storeId, queryClient]);

  const openFn = useServerFn(openTableSession);
  const orderFn = useServerFn(addSessionOrder);
  const billFn = useServerFn(requestSessionBill);
  const closeFn = useServerFn(closeSession);
  const callFn = useServerFn(resolveTableCall);

  function refresh() {
    void queryClient.invalidateQueries({ queryKey: ["waiter-tables", storeId] });
    void queryClient.invalidateQueries({ queryKey: ["waiter-sessions", storeId] });
    void queryClient.invalidateQueries({ queryKey: ["waiter-session-detail", session?.id] });
    void queryClient.invalidateQueries({ queryKey: ["waiter-calls", storeId] });
  }

  function handle<T extends { ok: boolean; message: string }>(promise: Promise<T>, after?: () => void) {
    void promise
      .then((result) => {
        if (!result.ok) {
          toast.error(result.message);
          return;
        }
        toast.success(result.message);
        refresh();
        after?.();
      })
      .catch((error: Error) => toast.error(error.message));
  }

  const sendOrder = useMutation({
    mutationFn: () =>
      orderFn({
        data: {
          sessionId: session!.id,
          items: cart.map((line) => ({
            productId: line.productId,
            quantity: line.quantity,
            notes: line.notes.trim() || undefined,
          })),
        },
      }),
    onSuccess: (result) => {
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success(`${result.message} Cupons enviados aos setores.`);
      setCart([]);
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const tables = tablesQuery.data ?? [];
  const calls = callsQuery.data ?? [];
  const products = (productsQuery.data ?? []).filter((product) => matchesTable(product.name, search)).slice(0, 40);
  const orders = detailQuery.data ?? [];
  const items = orders.flatMap((order) =>
    (order.order_items ?? []).map((item) => ({
      id: item.id,
      name: item.product_name,
      quantity: item.quantity,
      unitPrice: Number(item.unit_price),
    })),
  );
  const totals = billTotals(items, {
    discount: Number(session?.discount ?? 0),
    serviceFeePercent: Number(session?.service_fee_percent ?? 0),
    guests: session?.guests ?? 1,
  });

  if (tablesQuery.isLoading) {
    return (
      <div className="mx-auto max-w-md p-4">
        <Skeleton className="h-72 rounded-2xl" />
      </div>
    );
  }

  /* -------- Lista de mesas -------- */
  if (!selected) {
    return (
      <div className="mx-auto min-h-screen max-w-md bg-secondary/30 pb-10">
        <header className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-border bg-background px-4 py-3">
          <Logo withWordmark={false} />
          <h1 className="text-base font-semibold text-foreground">Área do garçom</h1>
          <Button variant="ghost" size="sm" asChild>
            <Link to="/painel">Painel</Link>
          </Button>
        </header>

        <main className="space-y-4 p-4">
          {calls.length > 0 ? (
            <section aria-label="Chamados" className="space-y-2">
              {calls.map((call) => {
                const table = tables.find((item) => item.id === call.table_id);
                return (
                  <div
                    key={call.id}
                    className="flex items-center justify-between gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm"
                  >
                    <span className="font-medium text-foreground">
                      <Bell className="mr-1 inline size-4" aria-hidden="true" />
                      Mesa {table?.label ?? "—"} · {CALL_LABEL[call.kind] ?? call.kind}
                    </span>
                    <Button size="sm" variant="outline" onClick={() => handle(callFn({ data: { callId: call.id } }))}>
                      Atender
                    </Button>
                  </div>
                );
              })}
            </section>
          ) : null}

          {tables.length === 0 ? (
            <EmptyState title="Nenhuma mesa cadastrada" description="O responsável cadastra as mesas em Painel → Salão." />
          ) : (
            <ul className="grid grid-cols-2 gap-3">
              {tables.map((table) => {
                const tableSession = (sessionsQuery.data ?? []).find((item) => item.table_id === table.id);
                const pending = calls.filter((call) => call.table_id === table.id).length;
                return (
                  <li key={table.id}>
                    <button
                      type="button"
                      onClick={() => setSelected(table.id)}
                      className={`flex min-h-28 w-full flex-col justify-between rounded-2xl border-2 p-3 text-left ${
                        TABLE_STATUS_TONE[table.status] ?? "border-border"
                      }`}
                    >
                      <span className="flex items-center justify-between">
                        <span className="text-lg font-semibold">{table.label}</span>
                        {pending > 0 ? <Badge className="bg-amber-500 text-white">{pending}</Badge> : null}
                      </span>
                      <span className="text-xs">{TABLE_STATUS_LABEL[table.status]}</span>
                      {tableSession ? <span className="text-xs">Comanda {tableSession.code}</span> : null}
                      <span className="text-xs opacity-80">{table.seats} lugares</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </main>
      </div>
    );
  }

  /* -------- Mesa selecionada -------- */
  const table = tables.find((item) => item.id === selected);

  return (
    <div className="mx-auto min-h-screen max-w-md bg-secondary/30 pb-44">
      <header className="sticky top-0 z-10 flex items-center gap-2 border-b border-border bg-background px-3 py-3">
        <Button variant="ghost" size="icon" aria-label="Voltar para as mesas" onClick={() => setSelected(null)}>
          <ArrowLeft className="size-5" aria-hidden="true" />
        </Button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-base font-semibold text-foreground">Mesa {table?.label}</h1>
          <p className="text-xs text-muted-foreground">
            {TABLE_STATUS_LABEL[table?.status ?? "free"]}
            {session ? ` · comanda ${session.code}` : ""}
          </p>
        </div>
      </header>

      <main className="space-y-4 p-4">
        {!session ? (
          <Button
            size="lg"
            className="w-full"
            onClick={() => handle(openFn({ data: { tableId: selected, guests: 2 } }))}
          >
            <Utensils className="mr-2 size-4" aria-hidden="true" />
            Abrir comanda nesta mesa
          </Button>
        ) : (
          <>
            <section>
              <Label htmlFor="garcom-busca" className="sr-only">
                Buscar item
              </Label>
              <div className="relative">
                <Search className="absolute top-1/2 left-3 size-5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                <Input
                  id="garcom-busca"
                  className="h-12 pl-11"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Buscar item do cardápio"
                />
              </div>
              <ul className="mt-3 grid grid-cols-2 gap-2">
                {products.map((product) => {
                  const price = Number(product.promo_price ?? 0) > 0 ? Number(product.promo_price) : Number(product.price);
                  return (
                    <li key={product.id}>
                      <button
                        type="button"
                        className="flex h-full min-h-20 w-full flex-col justify-between rounded-xl border border-border bg-card p-3 text-left hover:border-primary"
                        onClick={() =>
                          setCart((current) => {
                            const existing = current.find((line) => line.productId === product.id);
                            if (existing) {
                              return current.map((line) =>
                                line.productId === product.id ? { ...line, quantity: line.quantity + 1 } : line,
                              );
                            }
                            return [...current, { productId: product.id, name: product.name, price, quantity: 1, notes: "" }];
                          })
                        }
                      >
                        <span className="line-clamp-2 text-sm font-medium text-foreground">{product.name}</span>
                        <span className="mt-1 flex items-center justify-between text-xs">
                          <span className="font-semibold text-foreground">{formatCurrency(price)}</span>
                          {product.prep_station ? (
                            <span className="text-muted-foreground">{STATION_LABEL[product.prep_station] ?? product.prep_station}</span>
                          ) : null}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>

            <section aria-label="Itens lançados" className="rounded-2xl border border-border bg-card p-3">
              <h2 className="mb-2 text-sm font-semibold text-foreground">Já lançado ({items.length})</h2>
              {orders.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhum item ainda.</p>
              ) : (
                <ul className="space-y-2 text-sm">
                  {orders.map((order) => (
                    <li key={order.id}>
                      <p className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>#{order.code}</span>
                        <Badge variant="secondary">{statusLabel(order.status)}</Badge>
                      </p>
                      <ul className="mt-1 space-y-0.5">
                        {(order.order_items ?? []).map((item) => (
                          <li key={item.id} className="flex justify-between text-foreground">
                            <span>
                              {item.quantity}x {item.product_name}
                              {item.notes ? <span className="block text-xs text-muted-foreground">{item.notes}</span> : null}
                            </span>
                            <span className="text-muted-foreground">
                              {formatCurrency(Number(item.unit_price) * item.quantity)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-3 flex items-center justify-between border-t border-border pt-2 text-base font-semibold text-foreground">
                <span>Total</span>
                <span>{formatCurrency(totals.total)}</span>
              </p>
            </section>

            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => handle(billFn({ data: { sessionId: session.id } }))}>
                <Receipt className="mr-2 size-4" aria-hidden="true" />
                Enviar conta
              </Button>
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => handle(closeFn({ data: { sessionId: session.id, paymentMethod: "cash" } }), () => setSelected(null))}
              >
                Fechar mesa
              </Button>
            </div>
          </>
        )}
      </main>

      {cart.length > 0 && session ? (
        <div className="fixed inset-x-0 bottom-0 mx-auto max-w-md border-t border-border bg-background/95 p-3 backdrop-blur">
          <ul className="mb-2 max-h-40 space-y-2 overflow-y-auto">
            {cart.map((line) => (
              <li key={line.productId} className="space-y-1">
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span className="min-w-0 truncate text-foreground">{line.name}</span>
                  <span className="flex items-center gap-1">
                    <Button
                      size="icon"
                      variant="outline"
                      className="size-9"
                      aria-label={`Diminuir ${line.name}`}
                      onClick={() =>
                        setCart((current) =>
                          current
                            .map((item) => (item.productId === line.productId ? { ...item, quantity: item.quantity - 1 } : item))
                            .filter((item) => item.quantity > 0),
                        )
                      }
                    >
                      <Minus className="size-4" aria-hidden="true" />
                    </Button>
                    <span className="w-6 text-center font-semibold">{line.quantity}</span>
                    <Button
                      size="icon"
                      variant="outline"
                      className="size-9"
                      aria-label={`Aumentar ${line.name}`}
                      onClick={() =>
                        setCart((current) =>
                          current.map((item) => (item.productId === line.productId ? { ...item, quantity: item.quantity + 1 } : item)),
                        )
                      }
                    >
                      <Plus className="size-4" aria-hidden="true" />
                    </Button>
                  </span>
                </div>
                <Input
                  className="h-9 text-sm"
                  placeholder="Observação"
                  aria-label={`Observação de ${line.name}`}
                  value={line.notes}
                  onChange={(event) =>
                    setCart((current) =>
                      current.map((item) => (item.productId === line.productId ? { ...item, notes: event.target.value } : item)),
                    )
                  }
                />
              </li>
            ))}
          </ul>
          <Button
            size="lg"
            className="w-full bg-accent text-accent-foreground hover:bg-accent/90"
            disabled={sendOrder.isPending}
            onClick={() => sendOrder.mutate()}
          >
            <Send className="mr-2 size-4" aria-hidden="true" />
            {sendOrder.isPending ? "Lançando..." : "Lançar na comanda"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
