import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { ExclusiveShell, ExitConfirmDialog } from "@/components/pos/ExclusiveShell";
import { PosSettingsDialog } from "@/components/pos/PosSettingsDialog";
import { KdsOrderCard } from "@/components/kds/KdsOrderCard";
import { EmptyState } from "@/components/painel/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useFeatureGuard } from "@/hooks/useFeatureGuard";
import { useExclusiveShell, useOnlineStatus, useTicker } from "@/hooks/useExclusiveShell";
import { setAppTheme, useAppTheme } from "@/hooks/useAppTheme";
import { useActiveStore } from "@/hooks/useMyStores";
import { usePosKdsSettings } from "@/hooks/usePosKdsSettings";
import { useSession } from "@/hooks/useSession";
import { supabase } from "@/integrations/supabase/client";
import { formatDateTime } from "@/lib/format";
import {
  addKdsOrderNote,
  advanceKdsOrder,
  enqueueOrderPrint,
  rejectKdsOrder,
  setItemPrepStatus,
  setKdsPriority,
  updatePrintJob,
} from "@/lib/kds.functions";
import { hasPermission, normalizePermissions, type PermissionArea } from "@/lib/permissions";
import {
  KDS_COLUMNS,
  KDS_STATIONS,
  defaultKdsFilters,
  groupKdsOrders,
  kdsMetrics,
  matchesKdsFilters,
  nextKdsStatus,
  sortKdsOrders,
  type KdsFilters,
  type KdsItem,
  type KdsOrderLike,
} from "@/lib/pos-kds";
import { STATION_LABEL, groupItemsByStation } from "@/lib/salao";
import { StorePauseButton } from "@/components/painel/StorePauseButton";
import { setProductAvailability } from "@/lib/operacao.functions";
import { printOrderByStation } from "@/lib/print";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/kds")({
  component: KdsScreen,
  head: () => ({
    meta: [
      { title: "Monitor de preparo (KDS) | O Seu Pedido" },
      {
        name: "description",
        content: "Monitor de preparo em tela exclusiva com filas por setor, temporizador, prioridade e impressão setorizada.",
      },
    ],
  }),
});

const ACTIVE_STATUSES = ["pending", "confirmed", "preparing", "ready", "out_for_delivery"] as const;

function KdsScreen() {
  useFeatureGuard("kds");
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { active } = useActiveStore();
  const { user } = useSession();
  const storeId = active?.storeId;
  const online = useOnlineStatus();
  const now = useTicker(1000);

  const permissions = normalizePermissions((active as unknown as { permissions?: unknown } | null)?.permissions);
  const can = useCallback(
    (area: PermissionArea) => hasPermission(active?.role, permissions, area),
    [active?.role, permissions],
  );

  const { settings, hasTerminalOverride, save, resetTerminal, isSaving } = usePosKdsSettings(storeId, "kds");
  const [filters, setFilters] = useState<KdsFilters>(() => defaultKdsFilters());
  const [exitOpen, setExitOpen] = useState(false);
  const { theme } = useAppTheme();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [printQueueOpen, setPrintQueueOpen] = useState(false);
  const [detail, setDetail] = useState<KdsOrderLike | null>(null);
  const [note, setNote] = useState("");
  const knownIds = useRef<Set<string>>(new Set());

  // O setor configurado alimenta o filtro visual do monitor.
  useEffect(() => {
    setFilters((current) => ({ ...current, station: settings.station }));
  }, [settings.station]);

  const shell = useExclusiveShell({ onRequestExit: () => setExitOpen(true) });

  const ordersQuery = useQuery({
    queryKey: ["kds-orders", storeId],
    enabled: Boolean(storeId),
    refetchInterval: settings.autoRefreshSeconds * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select(
          "id, code, status, type, channel, priority, created_at, prep_started_at, scheduled_for, payment_status, delivery_person_id, table_number, customer_name, notes, order_items(id, product_id, product_name, quantity, notes, prep_station, prep_status, unit_price, total)",
        )
        .eq("store_id", storeId!)
        .in("status", [...ACTIVE_STATUSES])
        .order("created_at", { ascending: true })
        .limit(120);
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as KdsOrderLike[];
    },
  });

  const printJobsQuery = useQuery({
    queryKey: ["kds-print-jobs", storeId],
    enabled: Boolean(storeId) && printQueueOpen,
    refetchInterval: 15_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("print_jobs")
        .select("id, title, station, status, attempts, created_at, printed_at")
        .eq("store_id", storeId!)
        .order("created_at", { ascending: false })
        .limit(40);
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  const orders = ordersQuery.data ?? [];

  // Alerta de pedido novo: som opcional e aviso visual, sem duplicar eventos.
  useEffect(() => {
    if (orders.length === 0) return;
    const previous = knownIds.current;
    const fresh = orders.filter((order) => !previous.has(order.id));
    knownIds.current = new Set(orders.map((order) => order.id));
    if (previous.size === 0 || fresh.length === 0) return;
    toast.info(`${fresh.length} novo(s) pedido(s) na fila.`);
    if (!settings.soundEnabled || typeof window === "undefined") return;
    try {
      const context = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.frequency.value = 880;
      gain.gain.value = settings.soundVolume * 0.3;
      oscillator.connect(gain).connect(context.destination);
      oscillator.start();
      oscillator.stop(context.currentTime + 0.18);
    } catch {
      // Navegador sem permissão de áudio: o alerta visual já apareceu.
    }
  }, [orders, settings.soundEnabled, settings.soundVolume]);

  // Tempo real: qualquer mudança em pedidos recarrega a fila.
  useEffect(() => {
    if (!storeId) return;
    const channel = supabase
      .channel(`kds-${storeId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "orders", filter: `store_id=eq.${storeId}` }, () => {
        void queryClient.invalidateQueries({ queryKey: ["kds-orders", storeId] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "order_items", filter: `store_id=eq.${storeId}` }, () => {
        void queryClient.invalidateQueries({ queryKey: ["kds-orders", storeId] });
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [storeId, queryClient]);

  const advanceFn = useServerFn(advanceKdsOrder);
  const rejectFn = useServerFn(rejectKdsOrder);
  const priorityFn = useServerFn(setKdsPriority);
  const itemFn = useServerFn(setItemPrepStatus);
  const printFn = useServerFn(enqueueOrderPrint);
  const jobFn = useServerFn(updatePrintJob);
  const noteFn = useServerFn(addKdsOrderNote);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["kds-orders", storeId] });

  const availabilityFn = useServerFn(setProductAvailability);
  const pauseProduct = useMutation({
    mutationFn: (input: { productId: string; available: boolean }) => availabilityFn({ data: input }),
    onSuccess: (result) => {
      if (!result.ok) toast.error(result.message);
      else toast.success(result.message);
      void refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  /** Imprime uma via enxuta para cada setor do pedido (cozinha, bar, expedição). */
  function printStations(order: KdsOrderLike, onlyStation?: string) {
    const printed = printOrderByStation(
      {
        code: order.code,
        type: order.type,
        created_at: order.created_at,
        table_number: order.table_number ?? null,
        notes: order.notes ?? null,
        items: (order.order_items ?? []).map((item) => ({
          product_name: item.product_name,
          quantity: item.quantity,
          notes: item.notes ?? null,
          prep_station: item.prep_station ?? null,
        })),
      },
      active?.store.name ?? "Loja",
      {
        stationLabel: (station) => STATION_LABEL[station] ?? station,
        groupBy: (items) => groupItemsByStation(items).map((group) => ({ station: group.station, items: group.items })),
        onlyStation: onlyStation ?? (filters.station === "todas" ? undefined : filters.station),
      },
    );
    if (printed.length === 0) toast.info("Nenhum item para este setor.");
    else toast.success(`Via enviada: ${printed.join(", ")}.`);
  }

  const advance = useMutation({
    mutationFn: (order: KdsOrderLike) =>
      advanceFn({
        data: { orderId: order.id, expectedStatus: order.status, nextStatus: nextKdsStatus(order.status) ?? "completed" },
      }),
    onSuccess: (result) => {
      if (!result.ok) toast.error(result.message);
      else toast.success(result.message);
      void refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const itemStatus = useMutation({
    mutationFn: (input: { itemId: string; prepStatus: "pending" | "preparing" | "ready" | "paused" }) =>
      itemFn({ data: input }),
    onSuccess: (result) => {
      if (!result.ok) toast.error(result.message);
      void refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const priority = useMutation({
    mutationFn: (order: KdsOrderLike) => priorityFn({ data: { orderId: order.id, priority: order.priority > 0 ? 0 : 1 } }),
    onSuccess: (result) => {
      if (!result.ok) toast.error(result.message);
      void refresh();
    },
  });

  const reject = useMutation({
    mutationFn: (input: { orderId: string; reason: string }) => rejectFn({ data: input }),
    onSuccess: (result) => {
      if (!result.ok) toast.error(result.message);
      else toast.success(result.message);
      void refresh();
    },
  });

  const print = useMutation({
    mutationFn: (input: { orderId: string; station: string; reprint: boolean }) => printFn({ data: input }),
    onSuccess: (result) => {
      if (!result.ok) toast.error(result.message);
      else toast.success(result.message);
      void queryClient.invalidateQueries({ queryKey: ["kds-print-jobs", storeId] });
    },
  });

  const printJob = useMutation({
    mutationFn: (input: { jobId: string; action: "retry" | "done" | "failed" | "cancel" }) => jobFn({ data: input }),
    onSuccess: (result) => {
      if (!result.ok) toast.error(result.message);
      else toast.success(result.message);
      void queryClient.invalidateQueries({ queryKey: ["kds-print-jobs", storeId] });
    },
  });

  const addNote = useMutation({
    mutationFn: (input: { orderId: string; note: string }) => noteFn({ data: input }),
    onSuccess: (result) => {
      if (!result.ok) toast.error(result.message);
      else toast.success(result.message);
      setNote("");
    },
  });

  const filtered = useMemo(
    () => sortKdsOrders(orders.filter((order) => matchesKdsFilters(order, filters)), settings.kdsSort, now),
    [orders, filters, settings.kdsSort, now],
  );
  const metrics = useMemo(() => kdsMetrics(filtered, settings, now), [filtered, settings, now]);
  const groups = useMemo(() => groupKdsOrders(filtered, settings.kdsGroup), [filtered, settings.kdsGroup]);
  const isBusy = advance.isPending || itemStatus.isPending || priority.isPending || reject.isPending;

  function exit() {
    void navigate({ to: "/painel" });
  }

  if (!can("orders")) {
    return (
      <div className="p-6">
        <EmptyState
          title="Sem permissão para o monitor de preparo"
          description="Peça ao responsável pela loja para liberar a área de Pedidos no seu perfil de equipe."
        />
      </div>
    );
  }

  const cardProps = {
    settings,
    now,
    isBusy,
    canReject: can("pos_cancel"),
    onAdvance: (order: KdsOrderLike) => advance.mutate(order),
    onItemStatus: (item: KdsItem, status: "pending" | "preparing" | "ready" | "paused") =>
      itemStatus.mutate({ itemId: item.id, prepStatus: status }),
    onPriority: (order: KdsOrderLike) => priority.mutate(order),
    onPrint: (order: KdsOrderLike, reprint: boolean) =>
      print.mutate({ orderId: order.id, station: filters.station, reprint }),
    onReject: (order: KdsOrderLike) => {
      const reason = window.prompt("Motivo da recusa:");
      if (reason && reason.trim().length >= 3) reject.mutate({ orderId: order.id, reason: reason.trim() });
    },
    onDetails: (order: KdsOrderLike) => setDetail(order),
  };

  return (
    <ExclusiveShell
      storeName={active?.store.name ?? "Minha loja"}
      storeLogoUrl={active?.store.logo_url}
      moduleLabel="KDS · Monitor de preparo"
      station={settings.station === "todas" ? "Todos os setores" : (STATION_LABEL[settings.station] ?? settings.station)}
      operatorName={user?.email ?? "Operador"}
      online={online}
      clock={new Date(now).toLocaleTimeString("pt-BR", { timeStyle: "medium" })}
      isFullscreen={shell.isFullscreen}
      fullscreenSupported={shell.fullscreenSupported}
      onToggleFullscreen={shell.toggleFullscreen}
      onExit={() => setExitOpen(true)}
      theme={theme}
      onToggleTheme={() => {
        const next = theme === "dark" ? "light" : "dark";
        setAppTheme(next);
        save({ theme: next }, "terminal");
      }}
      toolbar={
        <>
          <StorePauseButton storeId={storeId} />
          <Button variant="outline" size="lg" className="h-11" onClick={() => setPrintQueueOpen(true)}>
            Fila de impressão
          </Button>
          <Button variant="outline" size="lg" className="h-11" onClick={() => setSettingsOpen(true)}>
            Configurações
          </Button>
        </>
      }
    >
      <div className="flex h-full min-h-0 flex-col">
        {/* Indicadores e filtros */}
        <div className="shrink-0 space-y-2 border-b border-border bg-card/60 p-2 sm:p-3">
          <div className="flex flex-wrap gap-2">
            <Metric label="Na tela" value={metrics.total} />
            <Metric label="Atrasados" value={metrics.late} tone={metrics.late > 0 ? "late" : undefined} />
            <Metric label="Tempo médio" value={`${metrics.averagePrepMinutes} min`} />
            <Metric label="Agendados" value={metrics.scheduled} />
            <Metric label="Meta" value={`${settings.maxPrepMinutes} min`} />
          </div>

          <ScrollArea className="w-full">
            <div className="flex items-center gap-2 pb-2">
              <Input
                className="h-10 w-48 shrink-0"
                value={filters.search}
                onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))}
                placeholder="Pedido, cliente ou item"
                aria-label="Buscar pedido"
              />
              <FilterSelect
                label="Setor"
                value={filters.station}
                onChange={(value) => setFilters((current) => ({ ...current, station: value }))}
                options={[{ value: "todas", label: "Todos os setores" }, ...KDS_STATIONS.map((s) => ({ value: s.value, label: s.label }))]}
              />
              <FilterSelect
                label="Visão"
                value={settings.kdsView}
                onChange={(value) => save({ kdsView: value as typeof settings.kdsView }, "terminal")}
                options={[
                  { value: "kanban", label: "Kanban" },
                  { value: "queue", label: "Fila" },
                  { value: "station", label: "Por setor" },
                  { value: "priority", label: "Por prioridade" },
                  { value: "compact", label: "Compacta" },
                ]}
              />
              <FilterSelect
                label="Canal"
                value={filters.channel}
                onChange={(value) => setFilters((current) => ({ ...current, channel: value }))}
                options={[
                  { value: "all", label: "Todos os canais" },
                  { value: "loja", label: "Loja online" },
                  { value: "pdv", label: "PDV" },
                  { value: "mesa", label: "Mesa" },
                  { value: "whatsapp", label: "WhatsApp" },
                ]}
              />
              <FilterSelect
                label="Tipo"
                value={filters.type}
                onChange={(value) => setFilters((current) => ({ ...current, type: value }))}
                options={[
                  { value: "all", label: "Todos os tipos" },
                  { value: "delivery", label: "Delivery" },
                  { value: "pickup", label: "Retirada" },
                  { value: "dine_in", label: "Mesa" },
                  { value: "counter", label: "Balcão" },
                ]}
              />
              <FilterSelect
                label="Prioridade"
                value={filters.priority}
                onChange={(value) => setFilters((current) => ({ ...current, priority: value as KdsFilters["priority"] }))}
                options={[
                  { value: "all", label: "Toda prioridade" },
                  { value: "priority", label: "Somente prioritários" },
                  { value: "normal", label: "Somente normais" },
                ]}
              />
              <FilterSelect
                label="Pagamento"
                value={filters.payment}
                onChange={(value) => setFilters((current) => ({ ...current, payment: value as KdsFilters["payment"] }))}
                options={[
                  { value: "all", label: "Pago e pendente" },
                  { value: "paid", label: "Somente pagos" },
                  { value: "pending", label: "Pagamento pendente" },
                ]}
              />
              <FilterSelect
                label="Agendamento"
                value={filters.scheduled}
                onChange={(value) => setFilters((current) => ({ ...current, scheduled: value as KdsFilters["scheduled"] }))}
                options={[
                  { value: "all", label: "Todos os horários" },
                  { value: "scheduled", label: "Somente agendados" },
                  { value: "now", label: "Somente imediatos" },
                ]}
              />
            </div>
            <ScrollBar orientation="horizontal" />
          </ScrollArea>
        </div>

        {/* Pedidos */}
        <div className="min-h-0 flex-1 overflow-auto p-2 sm:p-3">
          {ordersQuery.isLoading ? (
            <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-5">
              {Array.from({ length: 5 }).map((_, index) => (
                <Skeleton key={index} className="h-64 rounded-2xl" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState
              title="Nenhum pedido na fila"
              description="Pedidos da loja online, do PDV, do WhatsApp e das mesas aparecem aqui em tempo real."
            />
          ) : settings.kdsView === "kanban" ? (
            <div className="flex h-full gap-3 overflow-x-auto pb-2">
              {KDS_COLUMNS.filter((column) => column.status !== "completed").map((column) => {
                const list = filtered.filter((order) => order.status === column.status);
                return (
                  <section key={column.status} className="flex min-w-72 flex-1 flex-col rounded-2xl bg-secondary/40 p-2">
                    <header className="mb-2 flex items-center justify-between px-1">
                      <h2 className="text-xs font-bold tracking-wide uppercase">{column.label}</h2>
                      <Badge variant="secondary" className="tabular-nums">
                        {list.length}
                      </Badge>
                    </header>
                    <div className="min-h-0 flex-1 space-y-2 overflow-y-auto">
                      {list.map((order) => (
                        <KdsOrderCard key={order.id} order={order} {...cardProps} />
                      ))}
                    </div>
                  </section>
                );
              })}
            </div>
          ) : (
            <div className="space-y-4">
              {groups.map((group) => (
                <section key={group.key}>
                  {settings.kdsGroup !== "none" ? (
                    <h2 className="mb-2 text-sm font-bold tracking-wide uppercase">{group.label}</h2>
                  ) : null}
                  <div
                    className={cn(
                      "grid gap-3",
                      settings.kdsView === "queue"
                        ? "md:grid-cols-2 xl:grid-cols-3"
                        : settings.kdsView === "compact"
                          ? "sm:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-6"
                          : "md:grid-cols-2 xl:grid-cols-4",
                    )}
                  >
                    {group.orders.map((order) => (
                      <KdsOrderCard key={order.id} order={order} {...cardProps} />
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}
        </div>
      </div>

      <ExitConfirmDialog
        open={exitOpen}
        onOpenChange={setExitOpen}
        title={metrics.total > 0 ? "Há pedidos em preparo" : "Sair do KDS?"}
        description={
          metrics.total > 0
            ? `${metrics.total} pedido(s) continuam na fila e nada será alterado. Deseja sair mesmo assim?`
            : "Você voltará para o painel de pedidos."
        }
        onConfirm={exit}
      />

      <PosSettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        settings={settings}
        showKdsOptions
        hasTerminalOverride={hasTerminalOverride}
        isSaving={isSaving}
        onSave={(patch, scope) => {
          if (patch.theme) setAppTheme(patch.theme);
          save(patch, scope);
        }}
        onResetTerminal={resetTerminal}
      />

      {/* Fila de impressão */}
      <Dialog open={printQueueOpen} onOpenChange={setPrintQueueOpen}>
        <DialogContent className="max-h-[85dvh] sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Fila de impressão</DialogTitle>
            <DialogDescription>
              Vias por setor com horário, tentativas e falhas. Sem impressora configurada, a fila fica marcada como simulada.
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-96">
            {(printJobsQuery.data ?? []).length === 0 ? (
              <p className="p-4 text-center text-sm text-muted-foreground">Nenhum trabalho de impressão.</p>
            ) : (
              <ul className="divide-y divide-border text-sm">
                {(printJobsQuery.data ?? []).map((job) => (
                  <li key={job.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{job.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {STATION_LABEL[job.station] ?? job.station} · {formatDateTime(job.created_at)} · {job.attempts} tentativa(s)
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      <Badge
                        variant="outline"
                        className={cn(
                          job.status === "printed"
                            ? "border-emerald-500/50 text-emerald-700 dark:text-emerald-300"
                            : job.status === "failed"
                              ? "border-destructive/50 text-destructive"
                              : "",
                        )}
                      >
                        {job.status === "printed" ? "Impresso" : job.status === "failed" ? "Falha" : job.status === "cancelled" ? "Cancelado" : "Na fila"}
                      </Badge>
                      {job.status !== "printed" ? (
                        <>
                          <Button size="sm" variant="ghost" className="h-9" onClick={() => printJob.mutate({ jobId: job.id, action: "retry" })}>
                            Reenviar
                          </Button>
                          <Button size="sm" variant="ghost" className="h-9" onClick={() => printJob.mutate({ jobId: job.id, action: "done" })}>
                            Concluir
                          </Button>
                        </>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {/* Detalhes do pedido */}
      <Dialog open={Boolean(detail)} onOpenChange={(value) => !value && setDetail(null)}>
        <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Pedido #{detail?.code}</DialogTitle>
            <DialogDescription>
              {detail ? `${detail.customer_name} · ${formatDateTime(detail.created_at)}` : ""}
            </DialogDescription>
          </DialogHeader>
          <ul className="space-y-1 text-sm">
            {(detail?.order_items ?? []).map((item) => (
              <li key={item.id} className="flex items-start justify-between gap-2">
                <span>
                  <span className="font-bold tabular-nums">{item.quantity}x</span> {item.product_name}
                  {item.prep_station ? (
                    <Badge variant="outline" className="ml-2">
                      {STATION_LABEL[item.prep_station] ?? item.prep_station}
                    </Badge>
                  ) : null}
                  {item.notes ? <span className="block text-xs text-amber-700 dark:text-amber-300">{item.notes}</span> : null}
                </span>
                {item.product_id ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 shrink-0 text-xs"
                    disabled={pauseProduct.isPending}
                    onClick={() => pauseProduct.mutate({ productId: item.product_id!, available: false })}
                  >
                    Acabou
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
          <div className="space-y-1.5">
            <Input
              className="h-11"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Observação interna para a equipe"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => detail && printStations(detail, "todas")}>
              Imprimir por setor
            </Button>
            <Button
              variant="outline"
              onClick={() => detail && print.mutate({ orderId: detail.id, station: "todas", reprint: true })}
            >
              Reimprimir todas as vias
            </Button>
            <Button
              disabled={note.trim().length < 2 || addNote.isPending}
              onClick={() => detail && addNote.mutate({ orderId: detail.id, note: note.trim() })}
            >
              Salvar observação
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ExclusiveShell>
  );
}

function Metric({ label, value, tone }: { label: string; value: number | string; tone?: "late" | undefined }) {
  return (
    <div
      className={cn(
        "rounded-xl border px-3 py-1.5",
        tone === "late" ? "border-destructive/50 bg-destructive/10" : "border-border bg-card",
      )}
    >
      <p className="text-[11px] tracking-wide text-muted-foreground uppercase">{label}</p>
      <p className="text-lg leading-tight font-bold tabular-nums">{value}</p>
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
  options: { value: string; label: string }[];
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-10 w-44 shrink-0" aria-label={label}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
