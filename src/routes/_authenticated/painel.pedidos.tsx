import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";

import { DemoBadge } from "@/components/brand/DemoBadge";
import { OrderDetailDialog } from "@/components/painel/OrderDetailDialog";
import { EmptyState, PageHeader } from "@/components/painel/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useActiveStore } from "@/hooks/useMyStores";
import { supabase } from "@/integrations/supabase/client";
import { ORDER_TYPE_LABEL, PAYMENT_STATUS_LABEL, formatCurrency, formatDateTime } from "@/lib/format";
import { ALL_ORDER_STATUSES, KANBAN_COLUMNS, statusClass, statusLabel } from "@/lib/orders";
import { defaultPrintSettings, printOrder } from "@/lib/print";
import type { PanelOrder } from "@/lib/panel-orders";

export const Route = createFileRoute("/_authenticated/painel/pedidos")({
  component: OrdersPage,
});

const PERIODS = [
  { value: "today", label: "Hoje" },
  { value: "7", label: "Últimos 7 dias" },
  { value: "30", label: "Últimos 30 dias" },
  { value: "all", label: "Todo o período" },
] as const;

function periodStart(period: string): string | null {
  const now = new Date();
  if (period === "today") {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return start.toISOString();
  }
  if (period === "7" || period === "30") {
    const start = new Date(now.getTime() - Number(period) * 24 * 60 * 60 * 1000);
    return start.toISOString();
  }
  return null;
}

function OrdersPage() {
  const { active } = useActiveStore();
  const storeId = active?.storeId;

  const [period, setPeriod] = useState<string>("7");
  const [status, setStatus] = useState<string>("all");
  const [type, setType] = useState<string>("all");
  const [payment, setPayment] = useState<string>("all");
  const [courier, setCourier] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<PanelOrder | null>(null);
  const printedRef = useRef<Set<string>>(new Set());

  const { data, isLoading } = useQuery({
    queryKey: ["orders", storeId, period],
    enabled: Boolean(storeId),
    refetchInterval: 30_000,
    queryFn: async () => {
      let query = supabase
        .from("orders")
        .select("*, order_items(id, product_name, quantity, total, notes)")
        .eq("store_id", storeId!)
        .order("created_at", { ascending: false })
        .limit(300);
      const start = periodStart(period);
      if (start) query = query.gte("created_at", start);
      const { data: orders, error } = await query;
      if (error) throw new Error(error.message);
      return (orders ?? []) as unknown as PanelOrder[];
    },
  });

  const { data: couriers } = useQuery({
    queryKey: ["couriers", storeId],
    enabled: Boolean(storeId),
    queryFn: async () => {
      const { data: members, error } = await supabase
        .from("store_members")
        .select("user_id, role")
        .eq("store_id", storeId!)
        .eq("role", "delivery_person");
      if (error) throw new Error(error.message);
      const ids = (members ?? []).map((member) => member.user_id);
      if (ids.length === 0) return [];
      const { data: profiles } = await supabase.from("profiles").select("id, full_name").in("id", ids);
      return ids.map((id) => ({
        userId: id,
        name: profiles?.find((profile) => profile.id === id)?.full_name ?? "Entregador",
      }));
    },
  });

  const orders = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (data ?? []).filter((order) => {
      if (status !== "all" && order.status !== status) return false;
      if (type !== "all" && order.type !== type) return false;
      if (payment !== "all" && order.payment_status !== payment) return false;
      if (courier === "none" && order.delivery_person_id) return false;
      if (courier !== "all" && courier !== "none" && order.delivery_person_id !== courier) return false;
      if (!term) return true;
      return (
        order.code.toLowerCase().includes(term) ||
        order.customer_name.toLowerCase().includes(term) ||
        (order.customer_phone ?? "").toLowerCase().includes(term)
      );
    });
  }, [data, status, type, payment, courier, search]);

  const { data: printContext } = useQuery({
    queryKey: ["print-context", storeId],
    enabled: Boolean(storeId),
    queryFn: async () => {
      const [settings, store] = await Promise.all([
        supabase.from("print_settings").select("*").eq("store_id", storeId!).maybeSingle(),
        supabase
          .from("stores")
          .select("name, phone, address_street, address_number, address_district, address_city")
          .eq("id", storeId!)
          .maybeSingle(),
      ]);
      return { settings: settings.data, store: store.data };
    },
  });

  // Impressão automática dos pedidos que chegam com o painel aberto.
  useEffect(() => {
    const settings = printContext?.settings;
    if (!settings?.auto_print || !data) return;
    const fresh = data.filter((order) => !printedRef.current.has(order.id) && order.status === "pending");
    if (printedRef.current.size === 0) {
      data.forEach((order) => printedRef.current.add(order.id));
      return;
    }
    for (const order of fresh) {
      printedRef.current.add(order.id);
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
          items: (order.order_items ?? []).map((item) => ({
            product_name: item.product_name,
            quantity: item.quantity,
            unit_price: Number(item.total) / Math.max(1, item.quantity),
            total: item.total,
            notes: item.notes,
          })),
        },
        {
          name: printContext?.store?.name ?? "Loja",
          phone: printContext?.store?.phone ?? null,
          address_street: printContext?.store?.address_street ?? null,
          address_number: printContext?.store?.address_number ?? null,
          address_district: printContext?.store?.address_district ?? null,
          address_city: printContext?.store?.address_city ?? null,
        },
        {
          ...defaultPrintSettings(),
          mode: settings.mode === "common" ? "common" : "thermal",
          paper_width: settings.paper_width,
          copies: settings.copies,
          auto_print: settings.auto_print,
          printer_name: settings.printer_name,
          header_text: settings.header_text,
          footer_text: settings.footer_text,
          show_prices: settings.show_prices,
          show_customer: settings.show_customer,
          stations: settings.stations,
        },
      );
    }
  }, [data, printContext]);

  const selectedOrder = selected ? (orders.find((order) => order.id === selected.id) ?? selected) : null;

  return (
    <div>
      <PageHeader title="Pedidos" description="Acompanhe os pedidos em quadro ou em tabela e atualize cada etapa." />

      <Card className="mb-5 border-border/70 shadow-sm">
        <CardContent className="grid gap-3 pt-6 sm:grid-cols-2 lg:grid-cols-6">
          <div className="space-y-1.5 lg:col-span-2">
            <Label htmlFor="busca">Buscar</Label>
            <Input
              id="busca"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Código, cliente ou telefone"
            />
          </div>
          <FilterSelect label="Período" value={period} onChange={setPeriod} options={PERIODS.map((item) => [item.value, item.label])} />
          <FilterSelect
            label="Situação"
            value={status}
            onChange={setStatus}
            options={[["all", "Todas"], ...ALL_ORDER_STATUSES.map((item) => [item, statusLabel(item)] as [string, string])]}
          />
          <FilterSelect
            label="Atendimento"
            value={type}
            onChange={setType}
            options={[["all", "Todos"], ...Object.entries(ORDER_TYPE_LABEL)]}
          />
          <FilterSelect
            label="Pagamento"
            value={payment}
            onChange={setPayment}
            options={[["all", "Todos"], ...Object.entries(PAYMENT_STATUS_LABEL)]}
          />
          <FilterSelect
            label="Entregador"
            value={courier}
            onChange={setCourier}
            options={[
              ["all", "Todos"],
              ["none", "Sem entregador"],
              ...(couriers ?? []).map((item) => [item.userId, item.name] as [string, string]),
            ]}
          />
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((index) => (
            <Skeleton key={index} className="h-28 rounded-2xl" />
          ))}
        </div>
      ) : orders.length === 0 ? (
        <EmptyState title="Nenhum pedido encontrado" description="Ajuste os filtros ou aguarde o próximo pedido da loja." />
      ) : (
        <Tabs defaultValue="kanban">
          <TabsList className="mb-4">
            <TabsTrigger value="kanban">Quadro</TabsTrigger>
            <TabsTrigger value="tabela">Tabela</TabsTrigger>
          </TabsList>

          <TabsContent value="kanban">
            <div className="flex gap-4 overflow-x-auto pb-2">
              {KANBAN_COLUMNS.map((column) => {
                const columnOrders = orders.filter((order) => column.statuses.includes(order.status));
                return (
                  <section key={column.key} className="w-72 shrink-0">
                    <header className="mb-2 flex items-center justify-between">
                      <h2 className="text-sm font-semibold text-foreground">{column.title}</h2>
                      <span className="text-xs text-muted-foreground">{columnOrders.length}</span>
                    </header>
                    <div className="space-y-2">
                      {columnOrders.map((order) => (
                        <button
                          key={order.id}
                          type="button"
                          onClick={() => setSelected(order)}
                          className="w-full rounded-xl border border-border/70 bg-card p-3 text-left shadow-sm transition hover:border-primary/40"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-sm font-semibold text-foreground">#{order.code}</span>
                            <span className="text-sm font-medium">{formatCurrency(Number(order.total))}</span>
                          </div>
                          <p className="mt-1 truncate text-xs text-muted-foreground">
                            {order.customer_name} · {ORDER_TYPE_LABEL[order.type]}
                          </p>
                          <p className="text-xs text-muted-foreground">{formatDateTime(order.created_at)}</p>
                          <div className="mt-2 flex flex-wrap items-center gap-1">
                            <span className={`rounded-full border px-2 py-0.5 text-[11px] ${statusClass(order.status)}`}>
                              {statusLabel(order.status)}
                            </span>
                            {order.is_demo ? <DemoBadge /> : null}
                          </div>
                        </button>
                      ))}
                      {columnOrders.length === 0 ? (
                        <p className="rounded-xl border border-dashed border-border p-3 text-xs text-muted-foreground">
                          Nada por aqui.
                        </p>
                      ) : null}
                    </div>
                  </section>
                );
              })}
            </div>
          </TabsContent>

          <TabsContent value="tabela">
            <Card className="border-border/70 shadow-sm">
              <CardContent className="overflow-x-auto pt-6">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Pedido</TableHead>
                      <TableHead>Cliente</TableHead>
                      <TableHead>Atendimento</TableHead>
                      <TableHead>Situação</TableHead>
                      <TableHead>Pagamento</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {orders.map((order) => (
                      <TableRow key={order.id}>
                        <TableCell>
                          <span className="font-medium text-foreground">#{order.code}</span>
                          <span className="block text-xs text-muted-foreground">{formatDateTime(order.created_at)}</span>
                        </TableCell>
                        <TableCell className="text-sm">
                          {order.customer_name}
                          <span className="block text-xs text-muted-foreground">{order.customer_phone ?? "—"}</span>
                        </TableCell>
                        <TableCell className="text-sm">{ORDER_TYPE_LABEL[order.type]}</TableCell>
                        <TableCell>
                          <span className={`rounded-full border px-2 py-0.5 text-xs ${statusClass(order.status)}`}>
                            {statusLabel(order.status)}
                          </span>
                        </TableCell>
                        <TableCell className="text-sm">
                          {PAYMENT_STATUS_LABEL[order.payment_status] ?? order.payment_status}
                        </TableCell>
                        <TableCell className="text-right font-medium">{formatCurrency(Number(order.total))}</TableCell>
                        <TableCell className="text-right">
                          <Button size="sm" variant="outline" onClick={() => setSelected(order)}>
                            Abrir
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}

      <OrderDetailDialog
        order={selectedOrder}
        storeId={storeId}
        couriers={couriers ?? []}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
      />
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: (readonly [string, string])[];
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger aria-label={label}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map(([optionValue, optionLabel]) => (
            <SelectItem key={optionValue} value={optionValue}>
              {optionLabel}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
