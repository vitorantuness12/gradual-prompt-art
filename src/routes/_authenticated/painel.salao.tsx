import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Bell, Copy, LayoutGrid, Pencil, Plus, Printer, QrCode, RotateCcw, Trash2, Users } from "lucide-react";
import QRCode from "qrcode";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { toast } from "sonner";

import { EmptyState, PageHeader, StatCard } from "@/components/painel/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useActiveStore } from "@/hooks/useMyStores";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency, formatDateTime } from "@/lib/format";
import {
  CALL_LABEL,
  PRINT_STATIONS,
  STATION_LABEL,
  TABLE_STATUSES,
  TABLE_STATUS_LABEL,
  TABLE_STATUS_TONE,
  TEMPLATE_LABEL,
  billTotals,
  splitBill,
  type TableStatus,
} from "@/lib/salao";
import {
  applySessionDiscount,
  closeSession,
  markPrintJob,
  mergeSessions,
  openTableSession,
  requestSessionBill,
  resolveTableCall,
  setTableStatus,
  transferTable,
} from "@/lib/salao.functions";

export const Route = createFileRoute("/_authenticated/painel/salao")({
  component: SalaoPage,
  head: () => ({
    meta: [
      { title: "Salão e mesas | O Seu Pedido" },
      {
        name: "description",
        content: "Mapa visual de mesas e balcões, comandas por mesa, chamados de garçom e fila de impressão por setor.",
      },
    ],
  }),
});

function SalaoPage() {
  const { active } = useActiveStore();
  const storeId = active?.storeId;
  const queryClient = useQueryClient();
  const [qrTable, setQrTable] = useState<{ label: string; token: string } | null>(null);
  const [sessionDialog, setSessionDialog] = useState<string | null>(null);
  const [editingAreaId, setEditingAreaId] = useState<string | null>(null);
  const [editingAreaName, setEditingAreaName] = useState("");

  /* ---------- Consultas ---------- */

  const areasQuery = useQuery({
    queryKey: ["dining-areas", storeId],
    enabled: Boolean(storeId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dining_areas")
        .select("id, name, sort_order, is_active")
        .eq("store_id", storeId!)
        .order("sort_order");
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  const tablesQuery = useQuery({
    queryKey: ["dining-tables", storeId],
    enabled: Boolean(storeId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dining_tables")
        .select("id, area_id, label, seats, shape, pos_x, pos_y, status, qr_token, is_active")
        .eq("store_id", storeId!)
        .order("label");
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  const sessionsQuery = useQuery({
    queryKey: ["table-sessions", storeId],
    enabled: Boolean(storeId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("table_sessions")
        .select("id, code, label, guests, status, discount, service_fee_percent, table_id, opened_at")
        .eq("store_id", storeId!)
        .in("status", ["open", "awaiting_payment"])
        .order("opened_at");
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  const callsQuery = useQuery({
    queryKey: ["table-calls", storeId],
    enabled: Boolean(storeId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("table_calls")
        .select("id, kind, note, status, created_at, table_id")
        .eq("store_id", storeId!)
        .eq("status", "open")
        .order("created_at");
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  const jobsQuery = useQuery({
    queryKey: ["print-jobs", storeId],
    enabled: Boolean(storeId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("print_jobs")
        .select("id, station, template, title, content, status, attempts, printed_at, created_at")
        .eq("store_id", storeId!)
        .order("created_at", { ascending: false })
        .limit(40);
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  // Tempo real: mesas, comandas, chamados e fila.
  useEffect(() => {
    if (!storeId) return;
    const channel = supabase
      .channel(`salao-${storeId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "dining_tables", filter: `store_id=eq.${storeId}` }, () => {
        void queryClient.invalidateQueries({ queryKey: ["dining-tables", storeId] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "table_sessions", filter: `store_id=eq.${storeId}` }, () => {
        void queryClient.invalidateQueries({ queryKey: ["table-sessions", storeId] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "table_calls", filter: `store_id=eq.${storeId}` }, (payload) => {
        const call = payload.new as { kind?: string; status?: string } | null;
        if (payload.eventType === "INSERT" && call?.kind) toast.info(CALL_LABEL[call.kind] ?? "Novo chamado");
        void queryClient.invalidateQueries({ queryKey: ["table-calls", storeId] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "print_jobs", filter: `store_id=eq.${storeId}` }, () => {
        void queryClient.invalidateQueries({ queryKey: ["print-jobs", storeId] });
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [storeId, queryClient]);

  /* ---------- Mutations ---------- */

  const statusFn = useServerFn(setTableStatus);
  const openFn = useServerFn(openTableSession);
  const callFn = useServerFn(resolveTableCall);
  const jobFn = useServerFn(markPrintJob);

  function handleResult(result: { ok: boolean; message: string }) {
    if (!result.ok) {
      toast.error(result.message);
      return false;
    }
    toast.success(result.message);
    return true;
  }

  const changeStatus = useMutation({
    mutationFn: (input: { tableId: string; status: TableStatus; expectedStatus: string }) => statusFn({ data: input }),
    onSuccess: (result) => {
      handleResult(result);
      void queryClient.invalidateQueries({ queryKey: ["dining-tables", storeId] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const openSession = useMutation({
    mutationFn: (tableId: string) => openFn({ data: { tableId, guests: 2 } }),
    onSuccess: (result) => {
      if (handleResult(result) && result.sessionId) setSessionDialog(result.sessionId);
      void queryClient.invalidateQueries({ queryKey: ["table-sessions", storeId] });
      void queryClient.invalidateQueries({ queryKey: ["dining-tables", storeId] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const resolveCall = useMutation({
    mutationFn: (callId: string) => callFn({ data: { callId } }),
    onSuccess: (result) => {
      handleResult(result);
      void queryClient.invalidateQueries({ queryKey: ["table-calls", storeId] });
    },
  });

  const printJob = useMutation({
    mutationFn: (input: { jobId: string; action: "printed" | "reprint" | "cancel" }) => jobFn({ data: input }),
    onSuccess: (result) => {
      handleResult(result);
      void queryClient.invalidateQueries({ queryKey: ["print-jobs", storeId] });
    },
  });

  const createArea = useMutation({
    mutationFn: async (name: string) => {
      const { error } = await supabase.from("dining_areas").insert({ store_id: storeId!, name });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Área criada.");
      void queryClient.invalidateQueries({ queryKey: ["dining-areas", storeId] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const renameArea = useMutation({
    mutationFn: async (input: { id: string; name: string }) => {
      const { error } = await supabase.from("dining_areas").update({ name: input.name }).eq("id", input.id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Área atualizada.");
      setEditingAreaId(null);
      void queryClient.invalidateQueries({ queryKey: ["dining-areas", storeId] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const removeArea = useMutation({
    mutationFn: async (id: string) => {
      const { error: unlinkError } = await supabase.from("dining_tables").update({ area_id: null }).eq("area_id", id);
      if (unlinkError) throw new Error(unlinkError.message);
      const { error } = await supabase.from("dining_areas").delete().eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Área removida. As mesas ficaram sem área.");
      void queryClient.invalidateQueries({ queryKey: ["dining-areas", storeId] });
      void queryClient.invalidateQueries({ queryKey: ["dining-tables", storeId] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const createTable = useMutation({
    mutationFn: async (input: { label: string; seats: number; areaId: string | null; shape: string }) => {
      const tables = tablesQuery.data ?? [];
      const { error } = await supabase.from("dining_tables").insert({
        store_id: storeId!,
        label: input.label,
        seats: input.seats,
        area_id: input.areaId,
        shape: input.shape,
        pos_x: (tables.length % 6) * 120,
        pos_y: Math.floor(tables.length / 6) * 120,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Mesa criada.");
      void queryClient.invalidateQueries({ queryKey: ["dining-tables", storeId] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const updateTable = useMutation({
    mutationFn: async (input: { id: string; patch: Record<string, unknown> }) => {
      const { error } = await supabase.from("dining_tables").update(input.patch as never).eq("id", input.id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["dining-tables", storeId] }),
    onError: (error: Error) => toast.error(error.message),
  });

  const removeTable = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("dining_tables").delete().eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Mesa removida.");
      void queryClient.invalidateQueries({ queryKey: ["dining-tables", storeId] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const tables = tablesQuery.data ?? [];
  const sessions = sessionsQuery.data ?? [];
  const calls = callsQuery.data ?? [];
  const jobs = jobsQuery.data ?? [];
  const sessionByTable = new Map(sessions.map((session) => [session.table_id, session]));
  const callsByTable = new Map<string, number>();
  for (const call of calls) {
    if (call.table_id) callsByTable.set(call.table_id, (callsByTable.get(call.table_id) ?? 0) + 1);
  }

  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const table of tables) map.set(table.status, (map.get(table.status) ?? 0) + 1);
    return map;
  }, [tables]);

  if (tablesQuery.isLoading) return <Skeleton className="h-96 rounded-2xl" />;

  return (
    <div>
      <PageHeader
        title="Salão"
        description="Mapa das mesas em tempo real, comandas, chamados e fila de impressão por setor."
      />

      {calls.length > 0 ? (
        <div className="mb-4 space-y-2" role="status" aria-live="polite">
          {calls.map((call) => {
            const table = tables.find((item) => item.id === call.table_id);
            return (
              <div
                key={call.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm"
              >
                <span className="flex items-center gap-2 font-medium text-foreground">
                  <Bell className="size-4" aria-hidden="true" />
                  Mesa {table?.label ?? "—"}: {CALL_LABEL[call.kind] ?? call.kind}
                  {call.note ? ` — ${call.note}` : ""}
                </span>
                <Button size="sm" variant="outline" onClick={() => resolveCall.mutate(call.id)}>
                  Atender
                </Button>
              </div>
            );
          })}
        </div>
      ) : null}

      <div className="mb-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {TABLE_STATUSES.map((status) => (
          <StatCard key={status.value} label={status.label} value={String(counts.get(status.value) ?? 0)} />
        ))}
      </div>

      <Tabs defaultValue="mapa">
        <TabsList className="flex w-full flex-wrap justify-start">
          <TabsTrigger value="mapa">Mapa</TabsTrigger>
          <TabsTrigger value="comandas">Comandas ({sessions.length})</TabsTrigger>
          <TabsTrigger value="impressao">Fila de impressão</TabsTrigger>
          <TabsTrigger value="cadastro">Áreas e mesas</TabsTrigger>
        </TabsList>

        {/* -------- Mapa -------- */}
        <TabsContent value="mapa" className="mt-6">
          {tables.length === 0 ? (
            <EmptyState title="Nenhuma mesa cadastrada" description="Crie as áreas e mesas na aba Áreas e mesas." />
          ) : (
            <div className="space-y-6">
              {[...(areasQuery.data ?? []), { id: null, name: "Sem área", sort_order: 999, is_active: true }].map((area) => {
                const areaTables = tables.filter((table) => table.area_id === area.id);
                if (areaTables.length === 0) return null;
                return (
                  <section key={area.id ?? "none"}>
                    <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
                      <LayoutGrid className="size-4 text-primary" aria-hidden="true" />
                      {area.name}
                    </h2>
                    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                      {areaTables.map((table) => {
                        const session = sessionByTable.get(table.id);
                        const pendingCalls = callsByTable.get(table.id) ?? 0;
                        return (
                          <li key={table.id}>
                            <div
                              className={`flex h-full flex-col justify-between rounded-2xl border-2 p-3 ${
                                TABLE_STATUS_TONE[table.status] ?? "border-border"
                              } ${table.shape === "round" ? "rounded-full py-6" : ""}`}
                            >
                              <div className="flex items-start justify-between gap-1">
                                <span className="text-lg font-semibold">{table.label}</span>
                                {pendingCalls > 0 ? (
                                  <Badge className="bg-amber-500 text-white">
                                    <Bell className="mr-1 size-3" aria-hidden="true" />
                                    {pendingCalls}
                                  </Badge>
                                ) : null}
                              </div>
                              <p className="flex items-center gap-1 text-xs">
                                <Users className="size-3" aria-hidden="true" />
                                {table.seats} lugares
                              </p>
                              <p className="text-xs font-medium">{TABLE_STATUS_LABEL[table.status]}</p>
                              {session ? (
                                <p className="text-xs">Comanda {session.code}</p>
                              ) : null}
                              <div className="mt-2 flex flex-wrap gap-1">
                                {session ? (
                                  <Button size="sm" variant="secondary" className="h-8" onClick={() => setSessionDialog(session.id)}>
                                    Abrir comanda
                                  </Button>
                                ) : (
                                  <Button
                                    size="sm"
                                    className="h-8"
                                    disabled={table.status === "maintenance"}
                                    onClick={() => openSession.mutate(table.id)}
                                  >
                                    Ocupar
                                  </Button>
                                )}
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-8"
                                  aria-label={`QR Code da mesa ${table.label}`}
                                  onClick={() => setQrTable({ label: table.label, token: table.qr_token })}
                                >
                                  <QrCode className="size-4" aria-hidden="true" />
                                </Button>
                                <Select
                                  value={table.status}
                                  onValueChange={(value) =>
                                    changeStatus.mutate({
                                      tableId: table.id,
                                      status: value as TableStatus,
                                      expectedStatus: table.status,
                                    })
                                  }
                                >
                                  <SelectTrigger className="h-8 w-28 text-xs" aria-label={`Situação da mesa ${table.label}`}>
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {TABLE_STATUSES.map((status) => (
                                      <SelectItem key={status.value} value={status.value}>
                                        {status.label}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </section>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* -------- Comandas -------- */}
        <TabsContent value="comandas" className="mt-6">
          {sessions.length === 0 ? (
            <EmptyState title="Nenhuma comanda aberta" />
          ) : (
            <ul className="grid gap-3 lg:grid-cols-2">
              {sessions.map((session) => {
                const table = tables.find((item) => item.id === session.table_id);
                return (
                  <li key={session.id}>
                    <Card className="border-border/70 shadow-sm">
                      <CardHeader className="flex flex-row items-center justify-between">
                        <CardTitle className="text-base">
                          Comanda {session.code} · mesa {table?.label ?? "—"}
                        </CardTitle>
                        <Badge variant="secondary">{session.status === "open" ? "Aberta" : "Aguardando pagamento"}</Badge>
                      </CardHeader>
                      <CardContent className="space-y-2 text-sm text-muted-foreground">
                        <p>
                          {session.guests} pessoa(s) · aberta em {formatDateTime(session.opened_at)}
                          {session.label ? ` · ${session.label}` : ""}
                        </p>
                        <Button size="sm" onClick={() => setSessionDialog(session.id)}>
                          Gerenciar comanda
                        </Button>
                      </CardContent>
                    </Card>
                  </li>
                );
              })}
            </ul>
          )}
        </TabsContent>

        {/* -------- Fila de impressão -------- */}
        <TabsContent value="impressao" className="mt-6">
          <Card className="border-border/70 shadow-sm">
            <CardHeader>
              <CardTitle className="text-base">
                Fila por setor · {jobs.filter((job) => job.status === "queued").length} aguardando
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Sem impressora conectada, os cupons ficam nesta fila simulada. Marque como impresso ou reimprima quando
                precisar.
              </p>
            </CardHeader>
            <CardContent>
              {jobs.length === 0 ? (
                <EmptyState title="Nada na fila" description="Os cupons aparecem aqui assim que um pedido é lançado." />
              ) : (
                <ul className="space-y-2">
                  {jobs.map((job) => (
                    <li key={job.id} className="rounded-xl border border-border p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="text-sm font-medium text-foreground">
                            {job.title}
                            <Badge variant="secondary" className="ml-2">
                              {STATION_LABEL[job.station] ?? job.station}
                            </Badge>
                            <Badge variant="outline" className="ml-1">
                              {TEMPLATE_LABEL[job.template as keyof typeof TEMPLATE_LABEL] ?? job.template}
                            </Badge>
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {job.status === "printed"
                              ? `Impresso em ${formatDateTime(job.printed_at ?? job.created_at)}`
                              : job.status === "queued"
                                ? `Na fila desde ${formatDateTime(job.created_at)}`
                                : job.status}
                            {job.attempts > 0 ? ` · ${job.attempts} tentativa(s)` : ""}
                          </p>
                        </div>
                        <div className="flex gap-1">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              const win = window.open("", "_blank", "width=380,height=600");
                              if (win) {
                                win.document.write(`<pre style="font-family:monospace;font-size:12px">${job.content.replace(/</g, "&lt;")}</pre>`);
                                win.document.close();
                                win.print();
                              }
                              printJob.mutate({ jobId: job.id, action: "printed" });
                            }}
                          >
                            <Printer className="mr-1 size-4" aria-hidden="true" />
                            Imprimir
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => printJob.mutate({ jobId: job.id, action: "reprint" })}>
                            <RotateCcw className="mr-1 size-4" aria-hidden="true" />
                            Reimprimir
                          </Button>
                        </div>
                      </div>
                      <pre className="mt-2 max-h-32 overflow-auto rounded-lg bg-secondary p-2 font-mono text-xs whitespace-pre-wrap text-muted-foreground">
                        {job.content}
                      </pre>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* -------- Cadastro -------- */}
        <TabsContent value="cadastro" className="mt-6">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="border-border/70 shadow-sm">
              <CardHeader>
                <CardTitle className="text-base">Áreas</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <form
                  className="flex gap-2"
                  onSubmit={(event: FormEvent<HTMLFormElement>) => {
                    event.preventDefault();
                    const form = new FormData(event.currentTarget);
                    const name = String(form.get("area") ?? "").trim();
                    if (name) createArea.mutate(name);
                    event.currentTarget.reset();
                  }}
                >
                  <Label htmlFor="nova-area" className="sr-only">
                    Nome da área
                  </Label>
                  <Input id="nova-area" name="area" placeholder="Salão, varanda, balcão..." required />
                  <Button type="submit">
                    <Plus className="size-4" aria-hidden="true" />
                  </Button>
                </form>
                <ul className="divide-y divide-border text-sm">
                  {(areasQuery.data ?? []).map((area) => (
                    <li key={area.id} className="flex items-center gap-2 py-2 text-foreground">
                      {editingAreaId === area.id ? (
                        <>
                          <Input
                            value={editingAreaName}
                            onChange={(event) => setEditingAreaName(event.target.value)}
                            aria-label="Nome da área"
                            className="h-8"
                          />
                          <Button
                            type="button"
                            size="sm"
                            disabled={!editingAreaName.trim() || renameArea.isPending}
                            onClick={() => renameArea.mutate({ id: area.id, name: editingAreaName.trim() })}
                          >
                            Salvar
                          </Button>
                          <Button type="button" size="sm" variant="ghost" onClick={() => setEditingAreaId(null)}>
                            Cancelar
                          </Button>
                        </>
                      ) : (
                        <>
                          <span className="flex-1 truncate">{area.name}</span>
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            aria-label={`Editar área ${area.name}`}
                            onClick={() => {
                              setEditingAreaId(area.id);
                              setEditingAreaName(area.name);
                            }}
                          >
                            <Pencil className="size-4" aria-hidden="true" />
                          </Button>
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            aria-label={`Apagar área ${area.name}`}
                            disabled={removeArea.isPending}
                            onClick={() => {
                              if (window.confirm(`Apagar a área "${area.name}"? As mesas dela ficarão sem área.`)) {
                                removeArea.mutate(area.id);
                              }
                            }}
                          >
                            <Trash2 className="size-4" aria-hidden="true" />
                          </Button>
                        </>
                      )}
                    </li>
                  ))}
                  {(areasQuery.data ?? []).length === 0 ? (
                    <li className="py-2 text-muted-foreground">Nenhuma área cadastrada.</li>
                  ) : null}
                </ul>
              </CardContent>
            </Card>

            <Card className="border-border/70 shadow-sm">
              <CardHeader>
                <CardTitle className="text-base">Mesas e balcões</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <form
                  className="grid gap-2 sm:grid-cols-2"
                  onSubmit={(event: FormEvent<HTMLFormElement>) => {
                    event.preventDefault();
                    const form = new FormData(event.currentTarget);
                    createTable.mutate({
                      label: String(form.get("label") ?? "").trim(),
                      seats: Number(form.get("seats") ?? 4) || 4,
                      areaId: (String(form.get("area") ?? "") || null) as string | null,
                      shape: String(form.get("shape") ?? "square"),
                    });
                    event.currentTarget.reset();
                  }}
                >
                  <div className="space-y-1.5">
                    <Label htmlFor="mesa-nome">Nome</Label>
                    <Input id="mesa-nome" name="label" placeholder="Mesa 1" required />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="mesa-lugares">Capacidade</Label>
                    <Input id="mesa-lugares" name="seats" type="number" min={1} max={40} defaultValue={4} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="mesa-area">Área</Label>
                    <select
                      id="mesa-area"
                      name="area"
                      className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    >
                      <option value="">Sem área</option>
                      {(areasQuery.data ?? []).map((area) => (
                        <option key={area.id} value={area.id}>
                          {area.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="mesa-formato">Formato</Label>
                    <select
                      id="mesa-formato"
                      name="shape"
                      className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    >
                      <option value="square">Mesa quadrada</option>
                      <option value="round">Mesa redonda</option>
                      <option value="counter">Balcão</option>
                    </select>
                  </div>
                  <Button type="submit" className="sm:col-span-2">
                    <Plus className="mr-2 size-4" aria-hidden="true" />
                    Adicionar
                  </Button>
                </form>

                <ul className="divide-y divide-border text-sm">
                  {tables.map((table) => (
                    <li key={table.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                      <span className="text-foreground">
                        {table.label} · {table.seats} lugares · {TABLE_STATUS_LABEL[table.status]}
                      </span>
                      <div className="flex items-center gap-1">
                        <Input
                          className="h-8 w-16"
                          type="number"
                          aria-label={`Posição X da ${table.label}`}
                          defaultValue={table.pos_x}
                          onBlur={(event) => updateTable.mutate({ id: table.id, patch: { pos_x: Number(event.target.value) || 0 } })}
                        />
                        <Input
                          className="h-8 w-16"
                          type="number"
                          aria-label={`Posição Y da ${table.label}`}
                          defaultValue={table.pos_y}
                          onBlur={(event) => updateTable.mutate({ id: table.id, patch: { pos_y: Number(event.target.value) || 0 } })}
                        />
                        <Button
                          size="icon"
                          variant="ghost"
                          className="size-8"
                          aria-label={`QR Code da ${table.label}`}
                          onClick={() => setQrTable({ label: table.label, token: table.qr_token })}
                        >
                          <QrCode className="size-4" aria-hidden="true" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="size-8"
                          aria-label={`Remover ${table.label}`}
                          onClick={() => removeTable.mutate(table.id)}
                        >
                          <Trash2 className="size-4" aria-hidden="true" />
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
                <p className="text-xs text-muted-foreground">
                  Setores disponíveis para impressão: {PRINT_STATIONS.map((station) => station.label).join(", ")}. Defina o
                  setor de cada item no catálogo.
                </p>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      <QrDialog table={qrTable} onClose={() => setQrTable(null)} />
      <SessionDialog
        sessionId={sessionDialog}
        storeId={storeId}
        tables={tables}
        sessions={sessions}
        onClose={() => setSessionDialog(null)}
      />
    </div>
  );
}

/* ---------------- QR Code da mesa ---------------- */

function QrDialog({ table, onClose }: { table: { label: string; token: string } | null; onClose: () => void }) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const url = table ? `${typeof window !== "undefined" ? window.location.origin : ""}/mesa/${table.token}` : "";

  useEffect(() => {
    if (!table) {
      setDataUrl(null);
      return;
    }
    void QRCode.toDataURL(url, { width: 480, margin: 1 }).then(setDataUrl);
  }, [table, url]);

  return (
    <Dialog open={Boolean(table)} onOpenChange={(open) => (open ? null : onClose())}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>QR Code · {table?.label}</DialogTitle>
          <DialogDescription>O cliente escaneia, abre o cardápio e pede direto da mesa.</DialogDescription>
        </DialogHeader>
        {dataUrl ? (
          <img src={dataUrl} alt={`QR Code da ${table?.label}`} className="mx-auto w-64 rounded-xl bg-white p-3" />
        ) : (
          <Skeleton className="mx-auto h-64 w-64 rounded-xl" />
        )}
        <div className="flex gap-2">
          <Input readOnly value={url} aria-label="Endereço da mesa" />
          <Button
            variant="outline"
            onClick={() => {
              void navigator.clipboard.writeText(url);
              toast.success("Link copiado.");
            }}
          >
            <Copy className="size-4" aria-hidden="true" />
          </Button>
        </div>
        <Button variant="outline" onClick={() => window.print()}>
          <Printer className="mr-2 size-4" aria-hidden="true" />
          Imprimir para colar na mesa
        </Button>
      </DialogContent>
    </Dialog>
  );
}

/* ---------------- Comanda ---------------- */

function SessionDialog({
  sessionId,
  storeId,
  tables,
  sessions,
  onClose,
}: {
  sessionId: string | null;
  storeId: string | undefined;
  tables: { id: string; label: string; status: string }[];
  sessions: { id: string; code: string; table_id: string | null }[];
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [discount, setDiscount] = useState("");
  const [reason, setReason] = useState("");
  const [service, setService] = useState("10");
  const [targetTable, setTargetTable] = useState("");
  const [mergeTarget, setMergeTarget] = useState("");
  const [people, setPeople] = useState(1);

  const detailQuery = useQuery({
    queryKey: ["table-session-detail", sessionId],
    enabled: Boolean(sessionId),
    queryFn: async () => {
      const [{ data: session }, { data: orders }] = await Promise.all([
        supabase
          .from("table_sessions")
          .select("id, code, label, guests, status, discount, service_fee_percent, table_id")
          .eq("id", sessionId!)
          .maybeSingle(),
        supabase
          .from("orders")
          .select("id, code, status, created_at, order_items(id, product_name, quantity, unit_price, notes, prep_station)")
          .eq("table_session_id", sessionId!)
          .order("created_at"),
      ]);
      return { session, orders: orders ?? [] };
    },
  });

  const discountFn = useServerFn(applySessionDiscount);
  const billFn = useServerFn(requestSessionBill);
  const closeFn = useServerFn(closeSession);
  const transferFn = useServerFn(transferTable);
  const mergeFn = useServerFn(mergeSessions);

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: ["table-session-detail", sessionId] });
    void queryClient.invalidateQueries({ queryKey: ["table-sessions", storeId] });
    void queryClient.invalidateQueries({ queryKey: ["dining-tables", storeId] });
    void queryClient.invalidateQueries({ queryKey: ["print-jobs", storeId] });
  }

  function run<T extends { ok: boolean; message: string }>(promise: Promise<T>, closeAfter = false) {
    void promise
      .then((result) => {
        if (!result.ok) {
          toast.error(result.message);
          return;
        }
        toast.success(result.message);
        invalidate();
        if (closeAfter) onClose();
      })
      .catch((error: Error) => toast.error(error.message));
  }

  const session = detailQuery.data?.session;
  const orders = detailQuery.data?.orders ?? [];
  const items = orders.flatMap((order) =>
    (order.order_items ?? []).map((item) => ({
      id: item.id,
      name: item.product_name,
      quantity: item.quantity,
      unitPrice: Number(item.unit_price),
      station: item.prep_station,
      notes: item.notes,
    })),
  );
  useEffect(() => {
    if (session?.guests) setPeople(Math.max(1, Number(session.guests)));
  }, [session?.guests]);

  const totals = billTotals(items, {
    discount: Number(session?.discount ?? 0),
    serviceFeePercent: Number(session?.service_fee_percent ?? 0),
    guests: session?.guests ?? 1,
  });

  return (
    <Dialog open={Boolean(sessionId)} onOpenChange={(open) => (open ? null : onClose())}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Comanda {session?.code ?? ""}</DialogTitle>
          <DialogDescription>Itens lançados, conta, transferência e junção de comandas.</DialogDescription>
        </DialogHeader>

        {detailQuery.isLoading ? (
          <Skeleton className="h-48 rounded-xl" />
        ) : (
          <div className="space-y-4">
            {items.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum item lançado ainda.</p>
            ) : (
              <ul className="divide-y divide-border text-sm">
                {items.map((item) => (
                  <li key={item.id} className="flex items-center justify-between gap-2 py-2">
                    <span className="text-foreground">
                      {item.quantity}x {item.name}
                      {item.station ? <Badge variant="outline" className="ml-2">{STATION_LABEL[item.station] ?? item.station}</Badge> : null}
                      {item.notes ? <span className="block text-xs text-muted-foreground">{item.notes}</span> : null}
                    </span>
                    <span className="text-muted-foreground">{formatCurrency(item.unitPrice * item.quantity)}</span>
                  </li>
                ))}
              </ul>
            )}

            <dl className="space-y-1 rounded-xl bg-secondary p-3 text-sm">
              <div className="flex justify-between">
                <dt>Subtotal</dt>
                <dd>{formatCurrency(totals.subtotal)}</dd>
              </div>
              {totals.discount > 0 ? (
                <div className="flex justify-between">
                  <dt>Desconto</dt>
                  <dd>− {formatCurrency(totals.discount)}</dd>
                </div>
              ) : null}
              {totals.serviceFee > 0 ? (
                <div className="flex justify-between">
                  <dt>Serviço</dt>
                  <dd>{formatCurrency(totals.serviceFee)}</dd>
                </div>
              ) : null}
              <div className="flex justify-between text-base font-semibold text-foreground">
                <dt>Total</dt>
                <dd>{formatCurrency(totals.total)}</dd>
              </div>
              <div className="flex justify-between text-xs text-muted-foreground">
                <dt>Por pessoa ({session?.guests ?? 1})</dt>
                <dd>{formatCurrency(totals.perGuest)}</dd>
              </div>
            </dl>

            <div className="grid gap-2 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="comanda-desconto">Desconto (R$)</Label>
                <Input id="comanda-desconto" inputMode="decimal" value={discount} onChange={(event) => setDiscount(event.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="comanda-motivo">Motivo</Label>
                <Input id="comanda-motivo" value={reason} onChange={(event) => setReason(event.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="comanda-servico">Serviço (%)</Label>
                <Input id="comanda-servico" inputMode="numeric" value={service} onChange={(event) => setService(event.target.value)} />
              </div>
            </div>
            <Button
              variant="outline"
              onClick={() =>
                run(
                  discountFn({
                    data: {
                      sessionId: sessionId!,
                      discount: Number(discount.replace(",", ".")) || 0,
                      reason: reason || undefined,
                      serviceFeePercent: Number(service) || 0,
                    },
                  }),
                )
              }
            >
              Aplicar desconto e serviço
            </Button>

            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-muted-foreground">Taxa de serviço:</span>
              {[0, 10, 12, 13].map((percent) => (
                <Button
                  key={percent}
                  type="button"
                  size="sm"
                  variant={Number(service) === percent ? "default" : "outline"}
                  onClick={() => {
                    setService(String(percent));
                    run(
                      discountFn({
                        data: {
                          sessionId: sessionId!,
                          discount: Number(session?.discount ?? 0),
                          serviceFeePercent: percent,
                        },
                      }),
                    );
                  }}
                >
                  {percent === 0 ? "Sem taxa" : `${percent}%`}
                </Button>
              ))}
            </div>

            <div className="space-y-2 rounded-xl border border-border p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Label htmlFor="comanda-pessoas" className="text-sm font-semibold">
                  Dividir conta por pessoa
                </Label>
                <div className="flex items-center gap-2">
                  <Button type="button" variant="outline" size="icon" className="size-9" aria-label="Menos pessoas" onClick={() => setPeople((value) => Math.max(1, value - 1))}>
                    −
                  </Button>
                  <Input
                    id="comanda-pessoas"
                    inputMode="numeric"
                    className="w-16 text-center"
                    value={String(people)}
                    onChange={(event) => setPeople(Math.max(1, Number(event.target.value.replace(/\D/g, "")) || 1))}
                  />
                  <Button type="button" variant="outline" size="icon" className="size-9" aria-label="Mais pessoas" onClick={() => setPeople((value) => value + 1)}>
                    +
                  </Button>
                </div>
              </div>
              <ul className="grid gap-1 sm:grid-cols-2">
                {splitBill(totals.total, people).map((value, index) => (
                  <li key={index} className="flex justify-between rounded-lg bg-secondary px-3 py-1.5 text-sm">
                    <span>Pessoa {index + 1}</span>
                    <span className="font-semibold tabular-nums">{formatCurrency(value)}</span>
                  </li>
                ))}
              </ul>
              <p className="text-xs text-muted-foreground">
                Total {formatCurrency(totals.total)} dividido em {people} parte(s), com taxa de serviço já incluída.
              </p>
            </div>


            <div className="grid gap-2 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="comanda-transferir">Transferir para a mesa</Label>
                <div className="flex gap-2">
                  <Select value={targetTable} onValueChange={setTargetTable}>
                    <SelectTrigger id="comanda-transferir">
                      <SelectValue placeholder="Escolha a mesa" />
                    </SelectTrigger>
                    <SelectContent>
                      {tables
                        .filter((table) => table.id !== session?.table_id)
                        .map((table) => (
                          <SelectItem key={table.id} value={table.id}>
                            {table.label}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                  <Button
                    variant="outline"
                    disabled={!targetTable}
                    onClick={() => run(transferFn({ data: { sessionId: sessionId!, targetTableId: targetTable } }))}
                  >
                    Transferir
                  </Button>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="comanda-juntar">Juntar com a comanda</Label>
                <div className="flex gap-2">
                  <Select value={mergeTarget} onValueChange={setMergeTarget}>
                    <SelectTrigger id="comanda-juntar">
                      <SelectValue placeholder="Escolha a comanda" />
                    </SelectTrigger>
                    <SelectContent>
                      {sessions
                        .filter((item) => item.id !== sessionId)
                        .map((item) => (
                          <SelectItem key={item.id} value={item.id}>
                            {item.code}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                  <Button
                    variant="outline"
                    disabled={!mergeTarget}
                    onClick={() => run(mergeFn({ data: { sourceId: sessionId!, targetId: mergeTarget } }), true)}
                  >
                    Juntar
                  </Button>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-2 border-t border-border pt-3">
              <Button variant="outline" onClick={() => run(billFn({ data: { sessionId: sessionId! } }))}>
                <Printer className="mr-2 size-4" aria-hidden="true" />
                Enviar conta ao caixa
              </Button>
              <Button
                className="bg-accent text-accent-foreground hover:bg-accent/90"
                onClick={() => run(closeFn({ data: { sessionId: sessionId!, paymentMethod: "cash" } }), true)}
              >
                Fechar atendimento
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
