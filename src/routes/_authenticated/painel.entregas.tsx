import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";

import { EmptyState, PageHeader } from "@/components/painel/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useActiveStore } from "@/hooks/useMyStores";
import { supabase } from "@/integrations/supabase/client";
import { ORDER_STATUS_LABEL, formatCurrency, formatDateTime } from "@/lib/format";
import {
  DELIVERY_STATUS_LABEL,
  VEHICLE_LABEL,
  ZONE_RULE_LABEL,
  isLate,
  type CourierRow,
  type DeliveryZoneRow,
} from "@/lib/delivery";
import { estimateEtaMinutes, formatKm, routeUrl, sortByPriority } from "@/lib/geo";
import { routeForOrder, type OrderRoute } from "@/lib/geo.functions";
import { RouteMap } from "@/components/mapa/RouteMap";

export const Route = createFileRoute("/_authenticated/painel/entregas")({
  component: DeliveriesPage,
});

const EMPTY_COURIER = {
  name: "",
  phone: "",
  photo_url: "",
  vehicle: "moto",
  plate: "",
  document: "",
  areas: "",
};

const EMPTY_ZONE = {
  rule_type: "district",
  label: "",
  district: "",
  zip_start: "",
  zip_end: "",
  distance_min_km: 0,
  distance_max_km: 0,
  weight_max_grams: 0,
  fee: 0,
  min_order_value: 0,
  free_above: 0,
  eta_minutes: 40,
  price_per_km: 0,
  min_fee: 0,
};

function DeliveriesPage() {
  const { active } = useActiveStore();
  const storeId = active?.storeId;
  const queryClient = useQueryClient();
  const [courierForm, setCourierForm] = useState(EMPTY_COURIER);
  const [zoneForm, setZoneForm] = useState(EMPTY_ZONE);
  const [routes, setRoutes] = useState<Record<string, OrderRoute>>({});
  const [openMap, setOpenMap] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["deliveries", storeId],
    enabled: Boolean(storeId),
    queryFn: async () => {
      const [orders, couriers, zones, deliveries, store] = await Promise.all([
        supabase
          .from("orders")
          .select("*")
          .eq("store_id", storeId!)
          .eq("type", "delivery")
          .in("status", ["confirmed", "preparing", "ready", "out_for_delivery"])
          .order("created_at", { ascending: false }),
        supabase.from("couriers").select("*").eq("store_id", storeId!).order("name"),
        supabase.from("delivery_zones").select("*").eq("store_id", storeId!).order("sort_order"),
        supabase
          .from("deliveries")
          .select("*")
          .eq("store_id", storeId!)
          .order("created_at", { ascending: false })
          .limit(100),
        supabase
          .from("stores")
          .select("latitude, longitude, address_street, address_number, address_district, address_city")
          .eq("id", storeId!)
          .maybeSingle(),
      ]);
      if (orders.error) throw new Error(orders.error.message);
      return {
        orders: orders.data ?? [],
        couriers: (couriers.data ?? []) as CourierRow[],
        zones: (zones.data ?? []) as DeliveryZoneRow[],
        deliveries: deliveries.data ?? [],
        store: store.data ?? null,
      };
    },
  });

  const couriers = data?.couriers ?? [];
  const zones = data?.zones ?? [];
  const orders = data?.orders ?? [];
  const deliveries = data?.deliveries ?? [];
  const store = data?.store ?? null;
  const origin =
    store?.latitude !== null && store?.latitude !== undefined && store?.longitude !== null && store?.longitude !== undefined
      ? { lat: Number(store.latitude), lng: Number(store.longitude) }
      : null;

  // Fila priorizada: atrasadas primeiro, depois as mais antigas; entre iguais, as mais próximas.
  const prioritized = sortByPriority(
    orders.map((order) => {
      const delivery = deliveries.find((item) => item.order_id === order.id);
      return {
        ...order,
        createdAt: order.created_at,
        dueAt: delivery?.due_at ?? null,
        distanceKm: order.distance_km === null ? null : Number(order.distance_km),
      };
    }),
  );

  // Rotas reais (Google/Mapbox/OSRM) calculadas sob demanda e guardadas no pedido.
  const computeRoute = useServerFn(routeForOrder);
  const routeMutation = useMutation({
    mutationFn: async (orderId: string) => computeRoute({ data: { orderId } }),
    onSuccess: async (result) => {
      if (!result.destination) {
        toast.error("Não conseguimos localizar o endereço deste pedido no mapa.");
        return;
      }
      setRoutes((current) => ({ ...current, [result.orderId]: result }));
      setOpenMap(result.orderId);
      await queryClient.invalidateQueries({ queryKey: ["deliveries", storeId] });
    },
    onError: (error: Error) => toast.error(error.message || "Falha ao calcular a rota."),
  });

  const recalcAll = useMutation({
    mutationFn: async () => {
      for (const order of prioritized) {
        const result = await computeRoute({ data: { orderId: order.id } });
        setRoutes((current) => ({ ...current, [result.orderId]: result }));
      }
    },
    onSuccess: async () => {
      toast.success("Rotas e distâncias atualizadas.");
      await queryClient.invalidateQueries({ queryKey: ["deliveries", storeId] });
    },
    onError: (error: Error) => toast.error(error.message || "Falha ao recalcular as rotas."),
  });

  const assign = useMutation({
    mutationFn: async ({ orderId, courierId }: { orderId: string; courierId: string }) => {
      const courier = couriers.find((item) => item.id === courierId);
      if (!courier) throw new Error("Entregador não encontrado.");

      const order = orders.find((item) => item.id === orderId);
      const { error } = await supabase
        .from("orders")
        .update({ delivery_person_id: courier.user_id, status: "out_for_delivery" })
        .eq("id", orderId);
      if (error) throw new Error(error.message);

      const existing = deliveries.find((item) => item.order_id === orderId);
      const payload = {
        store_id: storeId!,
        order_id: orderId,
        courier_id: courier.id,
        delivery_person_id: courier.user_id,
        status: "assigned" as const,
        fee: Number(order?.delivery_fee ?? 0),
        distance_km: order?.distance_km ?? null,
        due_at: new Date(Date.now() + 45 * 60_000).toISOString(),
      };
      const result = existing
        ? await supabase.from("deliveries").update(payload).eq("id", existing.id).select("id").single()
        : await supabase.from("deliveries").insert(payload).select("id").single();
      if (result.error) throw new Error(result.error.message);

      await supabase.from("delivery_events").insert({
        store_id: storeId!,
        delivery_id: result.data.id,
        event: "assigned",
        notes: `Atribuída a ${courier.name}`,
      });
    },
    onSuccess: async () => {
      toast.success("Entrega atribuída.");
      await queryClient.invalidateQueries({ queryKey: ["deliveries", storeId] });
    },
    onError: (error: Error) => toast.error(error.message || "Não foi possível atribuir a entrega."),
  });

  /** Distribuição automática: escolhe o entregador online com menos entregas ativas. */
  const autoAssign = useMutation({
    mutationFn: async () => {
      const online = couriers.filter((courier) => courier.is_active && courier.is_online && courier.user_id);
      if (online.length === 0) throw new Error("Nenhum entregador online no momento.");
      const pending = prioritized.filter((order) => !order.delivery_person_id);
      if (pending.length === 0) throw new Error("Nenhum pedido aguardando entregador.");

      const load = new Map<string, number>();
      for (const courier of online) {
        load.set(
          courier.id,
          deliveries.filter((item) => item.courier_id === courier.id && item.status !== "delivered").length,
        );
      }
      for (const order of pending) {
        const chosen = [...online].sort((a, b) => (load.get(a.id) ?? 0) - (load.get(b.id) ?? 0))[0]!;
        load.set(chosen.id, (load.get(chosen.id) ?? 0) + 1);
        await assign.mutateAsync({ orderId: order.id, courierId: chosen.id });
      }
    },
    onSuccess: () => toast.success("Pedidos distribuídos entre os entregadores online."),
    onError: (error: Error) => toast.error(error.message),
  });

  const saveCourier = useMutation({
    mutationFn: async () => {
      if (courierForm.name.trim().length < 3) throw new Error("Informe o nome do entregador.");
      const { error } = await supabase.from("couriers").insert({
        store_id: storeId!,
        name: courierForm.name.trim(),
        phone: courierForm.phone.trim() || null,
        photo_url: courierForm.photo_url.trim() || null,
        vehicle: courierForm.vehicle,
        plate: courierForm.plate.trim() || null,
        document: courierForm.document.trim() || null,
        areas: courierForm.areas
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean),
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: async () => {
      toast.success("Entregador cadastrado.");
      setCourierForm(EMPTY_COURIER);
      await queryClient.invalidateQueries({ queryKey: ["deliveries", storeId] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const toggleCourier = useMutation({
    mutationFn: async ({ id, field, value }: { id: string; field: "is_online" | "is_active"; value: boolean }) => {
      const patch = field === "is_online" ? { is_online: value } : { is_active: value };
      const { error } = await supabase.from("couriers").update(patch).eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: async () => queryClient.invalidateQueries({ queryKey: ["deliveries", storeId] }),
  });

  const saveZone = useMutation({
    mutationFn: async () => {
      if (zoneForm.label.trim().length < 2) throw new Error("Dê um nome para a regra.");
      const { error } = await supabase.from("delivery_zones").insert({
        store_id: storeId!,
        rule_type: zoneForm.rule_type,
        label: zoneForm.label.trim(),
        district: zoneForm.district.trim() || null,
        zip_start: zoneForm.zip_start.trim() || null,
        zip_end: zoneForm.zip_end.trim() || null,
        distance_min_km: zoneForm.distance_min_km,
        distance_max_km: zoneForm.distance_max_km || null,
        weight_max_grams: zoneForm.weight_max_grams || null,
        fee: zoneForm.fee,
        min_order_value: zoneForm.min_order_value,
        free_above: zoneForm.free_above || null,
        eta_minutes: zoneForm.eta_minutes,
        price_per_km: zoneForm.price_per_km,
        min_fee: zoneForm.min_fee,
        sort_order: zones.length,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: async () => {
      toast.success("Regra de taxa criada.");
      setZoneForm(EMPTY_ZONE);
      await queryClient.invalidateQueries({ queryKey: ["deliveries", storeId] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const removeZone = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("delivery_zones").delete().eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: async () => queryClient.invalidateQueries({ queryKey: ["deliveries", storeId] }),
  });

  const cancelDelivery = useMutation({
    mutationFn: async (deliveryId: string) => {
      const { error } = await supabase
        .from("deliveries")
        .update({ status: "failed", failure_reason: "Cancelada pela loja" })
        .eq("id", deliveryId);
      if (error) throw new Error(error.message);
      await supabase.from("delivery_events").insert({
        store_id: storeId!,
        delivery_id: deliveryId,
        event: "cancelled",
        notes: "Cancelada pela loja",
      });
    },
    onSuccess: async () => {
      toast.success("Entrega cancelada.");
      await queryClient.invalidateQueries({ queryKey: ["deliveries", storeId] });
    },
  });

  return (
    <div>
      <PageHeader
        title="Entregas"
        description="Entregadores, taxas por região e acompanhamento das entregas em andamento."
      />

      <Tabs defaultValue="andamento" className="space-y-4">
        <TabsList className="flex-wrap">
          <TabsTrigger value="andamento">Em andamento</TabsTrigger>
          <TabsTrigger value="entregadores">Entregadores</TabsTrigger>
          <TabsTrigger value="taxas">Taxas e áreas</TabsTrigger>
        </TabsList>

        {/* ---------- Em andamento ---------- */}
        <TabsContent value="andamento" className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              onClick={() => recalcAll.mutate()}
              disabled={recalcAll.isPending || prioritized.length === 0}
            >
              {recalcAll.isPending ? "Calculando rotas..." : "Recalcular rotas"}
            </Button>
            <Button onClick={() => autoAssign.mutate()} disabled={autoAssign.isPending || couriers.length === 0}>
              Distribuir automaticamente
            </Button>

            <span className="text-xs text-muted-foreground">
              {couriers.filter((courier) => courier.is_online).length} entregador(es) online
            </span>
          </div>

          {couriers.length === 0 ? (
            <div className="rounded-xl border border-warning/40 bg-warning/10 p-3 text-sm text-foreground">
              Cadastre seus entregadores na aba “Entregadores” para começar a atribuir pedidos.
            </div>
          ) : null}

          {isLoading ? (
            <Skeleton className="h-32 rounded-2xl" />
          ) : orders.length === 0 ? (
            <EmptyState title="Nenhuma entrega em andamento" description="Pedidos para entrega aparecem aqui." />
          ) : (
            prioritized.map((order) => {
              const address = order.address as {
                street?: string;
                number?: string;
                district?: string;
                zip?: string;
              } | null;
              const addressText = address
                ? `${address.street ?? ""}, ${address.number ?? ""} — ${address.district ?? ""}`
                : "Sem endereço";
              const destination =
                order.delivery_lat !== null && order.delivery_lng !== null
                  ? { lat: Number(order.delivery_lat), lng: Number(order.delivery_lng) }
                  : null;
              const delivery = deliveries.find((item) => item.order_id === order.id);
              const late = isLate(delivery?.due_at ?? null) && delivery?.status !== "delivered";
              const courier = couriers.find((item) => item.id === delivery?.courier_id);
              return (
                <Card key={order.id} className={late ? "border-destructive/60" : "border-border/70"}>
                  <CardContent className="flex flex-wrap items-center justify-between gap-4 pt-6">
                    <div className="min-w-[240px]">
                      <div className="flex items-center gap-2">
                        <h2 className="font-medium text-foreground">
                          #{order.code} · {order.customer_name}
                        </h2>
                        {late ? <Badge variant="destructive">Atrasada</Badge> : null}
                        {delivery ? <Badge variant="secondary">{DELIVERY_STATUS_LABEL[delivery.status]}</Badge> : null}
                      </div>
                      <p className="text-sm text-muted-foreground">{addressText}</p>
                      <p className="text-sm text-muted-foreground">
                        Distância{routes[order.id]?.provider && routes[order.id]?.provider !== "estimado" ? " (rota)" : " estimada"}:{" "}
                        {formatKm(routes[order.id]?.distanceKm ?? order.distanceKm)}
                        {` · ETA ${
                          routes[order.id]?.durationMinutes
                            ? routes[order.id]!.durationMinutes! + 15
                            : order.distanceKm !== null
                              ? estimateEtaMinutes(order.distanceKm)
                              : 40
                        } min`}
                        {delivery?.due_at
                          ? ` · previsão ${new Date(delivery.due_at).toLocaleTimeString("pt-BR", {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}`
                          : ""}
                        {order.delivery_fee ? ` · frete ${formatCurrency(Number(order.delivery_fee))}` : ""}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {ORDER_STATUS_LABEL[order.status]} · {formatDateTime(order.created_at)} ·{" "}
                        {formatCurrency(Number(order.total))}
                        {delivery && delivery.attempts > 0 ? ` · ${delivery.attempts} tentativa(s)` : ""}
                      </p>
                      {courier ? <p className="text-sm text-foreground">Entregador: {courier.name}</p> : null}
                      {delivery?.failure_reason ? (
                        <p className="text-sm text-destructive">Ocorrência: {delivery.failure_reason}</p>
                      ) : null}
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={routeMutation.isPending}
                        onClick={() =>
                          openMap === order.id && routes[order.id]
                            ? setOpenMap(null)
                            : routes[order.id]
                              ? setOpenMap(order.id)
                              : routeMutation.mutate(order.id)
                        }
                      >
                        {openMap === order.id ? "Ocultar mapa" : "Mapa e rota"}
                      </Button>
                      <Button variant="outline" size="sm" asChild>
                        <a
                          href={routeUrl(
                            routes[order.id]?.origin ?? origin,
                            routes[order.id]?.destination ?? destination ?? addressText,
                          )}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Abrir rota no mapa
                        </a>
                      </Button>
                      <Select
                        value={courier?.id ?? ""}
                        onValueChange={(value) => assign.mutate({ orderId: order.id, courierId: value })}
                        disabled={couriers.length === 0}
                      >
                        <SelectTrigger className="w-48">
                          <SelectValue placeholder="Atribuir entregador" />
                        </SelectTrigger>
                        <SelectContent>
                          {couriers
                            .filter((item) => item.is_active)
                            .map((item) => (
                              <SelectItem key={item.id} value={item.id}>
                                {item.name} {item.is_online ? "· online" : ""}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                      {delivery && delivery.status !== "delivered" ? (
                        <Button variant="outline" size="sm" onClick={() => cancelDelivery.mutate(delivery.id)}>
                          Cancelar
                        </Button>
                      ) : null}
                    </div>
                    {openMap === order.id && routes[order.id]?.destination ? (
                      <div className="w-full space-y-1">
                        <RouteMap
                          origin={routes[order.id]?.origin ?? origin}
                          destination={routes[order.id]!.destination}
                          geometry={routes[order.id]?.geometry ?? []}
                        />
                        <p className="text-xs text-muted-foreground">
                          Rota calculada por {routes[order.id]?.provider === "estimado" ? "estimativa interna" : "OpenStreetMap (OSRM)"}
                          {routes[order.id]?.durationMinutes ? ` · ${routes[order.id]?.durationMinutes} min de deslocamento` : ""}
                        </p>
                      </div>
                    ) : null}
                  </CardContent>
                </Card>
              );
            })
          )}

          <p className="text-xs text-muted-foreground">
            Rotas, distâncias e mapas usam OpenStreetMap/OSRM — serviço gratuito e sem chave de API.
          </p>
        </TabsContent>

        {/* ---------- Entregadores ---------- */}
        <TabsContent value="entregadores" className="space-y-4">
          <Card className="border-border/70">
            <CardHeader>
              <CardTitle className="text-base">Novo entregador</CardTitle>
              <CardDescription>Vincule a conta depois adicionando o e-mail como entregador em Configurações.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="courier-name">Nome</Label>
                <Input
                  id="courier-name"
                  value={courierForm.name}
                  onChange={(event) => setCourierForm((old) => ({ ...old, name: event.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="courier-phone">Telefone</Label>
                <Input
                  id="courier-phone"
                  value={courierForm.phone}
                  onChange={(event) => setCourierForm((old) => ({ ...old, phone: event.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Veículo</Label>
                <Select
                  value={courierForm.vehicle}
                  onValueChange={(value) => setCourierForm((old) => ({ ...old, vehicle: value }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(VEHICLE_LABEL).map(([id, label]) => (
                      <SelectItem key={id} value={id}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="courier-plate">Placa</Label>
                <Input
                  id="courier-plate"
                  value={courierForm.plate}
                  onChange={(event) => setCourierForm((old) => ({ ...old, plate: event.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="courier-doc">Documento (CPF/CNH)</Label>
                <Input
                  id="courier-doc"
                  value={courierForm.document}
                  onChange={(event) => setCourierForm((old) => ({ ...old, document: event.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="courier-photo">Foto (URL)</Label>
                <Input
                  id="courier-photo"
                  value={courierForm.photo_url}
                  onChange={(event) => setCourierForm((old) => ({ ...old, photo_url: event.target.value }))}
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="courier-areas">Áreas de atuação (bairros separados por vírgula)</Label>
                <Input
                  id="courier-areas"
                  value={courierForm.areas}
                  onChange={(event) => setCourierForm((old) => ({ ...old, areas: event.target.value }))}
                />
              </div>
              <div className="sm:col-span-2">
                <Button onClick={() => saveCourier.mutate()} disabled={saveCourier.isPending || !storeId}>
                  Cadastrar entregador
                </Button>
              </div>
            </CardContent>
          </Card>

          {couriers.length === 0 ? (
            <EmptyState title="Nenhum entregador cadastrado" description="Cadastre a equipe de entrega acima." />
          ) : (
            <div className="space-y-2">
              {couriers.map((courier) => (
                <Card key={courier.id} className="border-border/70">
                  <CardContent className="flex flex-wrap items-center justify-between gap-4 pt-6">
                    <div>
                      <p className="font-medium text-foreground">{courier.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {VEHICLE_LABEL[courier.vehicle] ?? courier.vehicle}
                        {courier.plate ? ` · ${courier.plate}` : ""} · {courier.phone ?? "sem telefone"}
                      </p>
                      {courier.areas.length > 0 ? (
                        <p className="text-xs text-muted-foreground">Áreas: {courier.areas.join(", ")}</p>
                      ) : null}
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">Online</span>
                        <Switch
                          checked={courier.is_online}
                          onCheckedChange={(checked) =>
                            toggleCourier.mutate({ id: courier.id, field: "is_online", value: checked })
                          }
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">Ativo</span>
                        <Switch
                          checked={courier.is_active}
                          onCheckedChange={(checked) =>
                            toggleCourier.mutate({ id: courier.id, field: "is_active", value: checked })
                          }
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ---------- Taxas ---------- */}
        <TabsContent value="taxas" className="space-y-4">
          <Card className="border-border/70">
            <CardHeader>
              <CardTitle className="text-base">Nova regra de taxa</CardTitle>
              <CardDescription>Cobre por bairro, faixa de CEP, distância ou peso, com pedido mínimo.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Tipo de regra</Label>
                <Select value={zoneForm.rule_type} onValueChange={(value) => setZoneForm((old) => ({ ...old, rule_type: value }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(ZONE_RULE_LABEL).map(([id, label]) => (
                      <SelectItem key={id} value={id}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="zone-label">Nome da regra</Label>
                <Input
                  id="zone-label"
                  value={zoneForm.label}
                  onChange={(event) => setZoneForm((old) => ({ ...old, label: event.target.value }))}
                />
              </div>

              {zoneForm.rule_type === "district" ? (
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="zone-district">Bairro</Label>
                  <Input
                    id="zone-district"
                    value={zoneForm.district}
                    onChange={(event) => setZoneForm((old) => ({ ...old, district: event.target.value }))}
                  />
                </div>
              ) : null}

              {zoneForm.rule_type === "zip" ? (
                <>
                  <div className="space-y-1.5">
                    <Label htmlFor="zip-start">CEP inicial</Label>
                    <Input
                      id="zip-start"
                      value={zoneForm.zip_start}
                      onChange={(event) => setZoneForm((old) => ({ ...old, zip_start: event.target.value }))}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="zip-end">CEP final</Label>
                    <Input
                      id="zip-end"
                      value={zoneForm.zip_end}
                      onChange={(event) => setZoneForm((old) => ({ ...old, zip_end: event.target.value }))}
                    />
                  </div>
                </>
              ) : null}

              {zoneForm.rule_type === "distance" ? (
                <>
                  <div className="space-y-1.5">
                    <Label htmlFor="dist-min">Distância mínima (km)</Label>
                    <Input
                      id="dist-min"
                      type="number"
                      value={zoneForm.distance_min_km}
                      onChange={(event) => setZoneForm((old) => ({ ...old, distance_min_km: Number(event.target.value) }))}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="dist-max">Distância máxima (km)</Label>
                    <Input
                      id="dist-max"
                      type="number"
                      value={zoneForm.distance_max_km}
                      onChange={(event) => setZoneForm((old) => ({ ...old, distance_max_km: Number(event.target.value) }))}
                    />
                  </div>
                </>
              ) : null}

              {zoneForm.rule_type === "weight" ? (
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="weight-max">Peso máximo (gramas)</Label>
                  <Input
                    id="weight-max"
                    type="number"
                    value={zoneForm.weight_max_grams}
                    onChange={(event) => setZoneForm((old) => ({ ...old, weight_max_grams: Number(event.target.value) }))}
                  />
                </div>
              ) : null}

              <div className="space-y-1.5">
                <Label htmlFor="zone-fee">Taxa (R$)</Label>
                <Input
                  id="zone-fee"
                  type="number"
                  step="0.01"
                  value={zoneForm.fee}
                  onChange={(event) => setZoneForm((old) => ({ ...old, fee: Number(event.target.value) }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="zone-min">Pedido mínimo (R$)</Label>
                <Input
                  id="zone-min"
                  type="number"
                  step="0.01"
                  value={zoneForm.min_order_value}
                  onChange={(event) => setZoneForm((old) => ({ ...old, min_order_value: Number(event.target.value) }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="zone-free">Frete grátis acima de (R$)</Label>
                <Input
                  id="zone-free"
                  type="number"
                  step="0.01"
                  value={zoneForm.free_above}
                  onChange={(event) => setZoneForm((old) => ({ ...old, free_above: Number(event.target.value) }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="zone-per-km">Taxa por km (R$)</Label>
                <Input
                  id="zone-per-km"
                  type="number"
                  step="0.01"
                  value={zoneForm.price_per_km}
                  onChange={(event) => setZoneForm((old) => ({ ...old, price_per_km: Number(event.target.value) }))}
                />
                <p className="text-xs text-muted-foreground">Somada à taxa fixa conforme a distância calculada.</p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="zone-min-fee">Frete mínimo (R$)</Label>
                <Input
                  id="zone-min-fee"
                  type="number"
                  step="0.01"
                  value={zoneForm.min_fee}
                  onChange={(event) => setZoneForm((old) => ({ ...old, min_fee: Number(event.target.value) }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="zone-eta">Prazo estimado (min)</Label>
                <Input
                  id="zone-eta"
                  type="number"
                  value={zoneForm.eta_minutes}
                  onChange={(event) => setZoneForm((old) => ({ ...old, eta_minutes: Number(event.target.value) }))}
                />
              </div>
              <div className="sm:col-span-2">
                <Button onClick={() => saveZone.mutate()} disabled={saveZone.isPending || !storeId}>
                  Adicionar regra
                </Button>
              </div>
            </CardContent>
          </Card>

          {zones.length === 0 ? (
            <EmptyState title="Nenhuma regra cadastrada" description="Sem regras, vale a taxa padrão da loja." />
          ) : (
            <div className="space-y-2">
              {zones.map((zone) => (
                <Card key={zone.id} className="border-border/70">
                  <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-6">
                    <div>
                      <p className="font-medium text-foreground">
                        {zone.label} <Badge variant="secondary">{ZONE_RULE_LABEL[zone.rule_type]}</Badge>
                      </p>
                      <p className="text-sm text-muted-foreground">
                        Taxa {formatCurrency(Number(zone.fee))} · mínimo {formatCurrency(Number(zone.min_order_value))} ·{" "}
                        {zone.eta_minutes} min
                        {Number(zone.price_per_km) > 0 ? ` · ${formatCurrency(Number(zone.price_per_km))}/km` : ""}
                        {Number(zone.min_fee) > 0 ? ` · mínimo de frete ${formatCurrency(Number(zone.min_fee))}` : ""}
                        {zone.free_above ? ` · grátis acima de ${formatCurrency(Number(zone.free_above))}` : ""}
                      </p>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => removeZone.mutate(zone.id)}>
                      Remover
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
