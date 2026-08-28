import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { Logo } from "@/components/brand/Logo";
import { EmptyState } from "@/components/painel/PageHeader";
import { PushNotificationsCard } from "@/components/painel/PushNotificationsCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { courierCanWork } from "@/lib/contas";
import { DELIVERY_STATUS_LABEL, isLate } from "@/lib/delivery";
import { formatKm, routeUrl } from "@/lib/geo";
import { ORDER_STATUS_LABEL, formatCurrency, formatDateTime } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/entregador")({
  beforeLoad: async () => {
    // Sem aprovação, o entregador vai para a tela de status do cadastro.
    const { data } = await supabase
      .from("delivery_profiles")
      .select("status")
      .maybeSingle();
    if (!data || !courierCanWork(data.status)) throw redirect({ to: "/entregador/status" });
  },
  component: CourierPage,
});

interface OccurrenceState {
  deliveryId: string;
  orderId: string;
  storeId: string;
}

function CourierPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [occurrence, setOccurrence] = useState<OccurrenceState | null>(null);
  const [occurrenceText, setOccurrenceText] = useState("");
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [customerNote, setCustomerNote] = useState("");
  const [deliverFor, setDeliverFor] = useState<OccurrenceState | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["courier-deliveries"],
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      if (!userId) return { deliveries: [], courier: null, userId: null };

      const [deliveries, courier] = await Promise.all([
        supabase
          .from("deliveries")
          .select("*, order:orders(*), store:stores(name)")
          .eq("delivery_person_id", userId)
          .order("created_at", { ascending: false })
          .limit(50),
        supabase.from("couriers").select("*").eq("user_id", userId).maybeSingle(),
      ]);
      if (deliveries.error) throw new Error(deliveries.error.message);
      return { deliveries: deliveries.data ?? [], courier: courier.data, userId };
    },
  });

  const deliveries = data?.deliveries ?? [];
  const courier = data?.courier;

  const toggleOnline = useMutation({
    mutationFn: async (value: boolean) => {
      if (!courier) throw new Error("Seu cadastro de entregador ainda não foi vinculado pela loja.");
      const { error } = await supabase.from("couriers").update({ is_online: value }).eq("id", courier.id);
      if (error) throw new Error(error.message);
    },
    onSuccess: async () => queryClient.invalidateQueries({ queryKey: ["courier-deliveries"] }),
    onError: (error: Error) => toast.error(error.message),
  });

  async function logEvent(storeId: string, deliveryId: string, event: string, notes?: string, photoUrl?: string) {
    await supabase.from("delivery_events").insert({
      store_id: storeId,
      delivery_id: deliveryId,
      event,
      notes: notes ?? null,
      photo_url: photoUrl ?? null,
      created_by: data?.userId ?? null,
    });
  }

  const accept = useMutation({
    mutationFn: async (item: OccurrenceState) => {
      const { error } = await supabase
        .from("deliveries")
        .update({ accepted_at: new Date().toISOString() })
        .eq("id", item.deliveryId);
      if (error) throw new Error(error.message);
      await logEvent(item.storeId, item.deliveryId, "accepted");
    },
    onSuccess: async () => {
      toast.success("Entrega aceita.");
      await queryClient.invalidateQueries({ queryKey: ["courier-deliveries"] });
    },
    onError: () => toast.error("Não foi possível aceitar a entrega."),
  });

  const startRoute = useMutation({
    mutationFn: async (item: OccurrenceState) => {
      const { error } = await supabase
        .from("deliveries")
        .update({ status: "picked_up", picked_up_at: new Date().toISOString() })
        .eq("id", item.deliveryId);
      if (error) throw new Error(error.message);
      await supabase.from("orders").update({ status: "out_for_delivery" }).eq("id", item.orderId);
      await logEvent(item.storeId, item.deliveryId, "started");
    },
    onSuccess: async () => {
      toast.success("Rota iniciada.");
      await queryClient.invalidateQueries({ queryKey: ["courier-deliveries"] });
    },
    onError: () => toast.error("Não foi possível iniciar a rota."),
  });

  async function uploadProof(storeId: string, deliveryId: string, file: File): Promise<string | null> {
    const extension = file.name.split(".").pop() ?? "jpg";
    const path = `${storeId}/entregas/${deliveryId}-${Date.now()}.${extension}`;
    const { error } = await supabase.storage.from("store-images").upload(path, file, { upsert: true });
    if (error) return null;
    const { data: signed } = await supabase.storage.from("store-images").createSignedUrl(path, 60 * 60 * 24 * 365);
    return signed?.signedUrl ?? null;
  }

  const markDelivered = useMutation({
    mutationFn: async (item: OccurrenceState) => {
      const proofUrl = proofFile ? await uploadProof(item.storeId, item.deliveryId, proofFile) : null;
      const { error } = await supabase
        .from("deliveries")
        .update({
          status: "delivered",
          delivered_at: new Date().toISOString(),
          proof_url: proofUrl,
          customer_note: customerNote.trim() || null,
        })
        .eq("id", item.deliveryId);
      if (error) throw new Error(error.message);
      await supabase.from("orders").update({ status: "delivered" }).eq("id", item.orderId);
      await logEvent(item.storeId, item.deliveryId, "delivered", customerNote.trim() || undefined, proofUrl ?? undefined);
    },
    onSuccess: async () => {
      toast.success("Entrega concluída.");
      setDeliverFor(null);
      setProofFile(null);
      setCustomerNote("");
      await queryClient.invalidateQueries({ queryKey: ["courier-deliveries"] });
    },
    onError: () => toast.error("Não foi possível concluir a entrega."),
  });

  const registerOccurrence = useMutation({
    mutationFn: async (item: OccurrenceState) => {
      if (occurrenceText.trim().length < 3) throw new Error("Descreva a ocorrência.");
      const current = deliveries.find((delivery) => delivery.id === item.deliveryId);
      const proofUrl = proofFile ? await uploadProof(item.storeId, item.deliveryId, proofFile) : null;
      const { error } = await supabase
        .from("deliveries")
        .update({
          status: "failed",
          failure_reason: occurrenceText.trim(),
          attempts: Number(current?.attempts ?? 0) + 1,
          proof_url: proofUrl,
        })
        .eq("id", item.deliveryId);
      if (error) throw new Error(error.message);
      await logEvent(item.storeId, item.deliveryId, "attempt_failed", occurrenceText.trim(), proofUrl ?? undefined);
    },
    onSuccess: async () => {
      toast.success("Ocorrência registrada. A loja foi avisada.");
      setOccurrence(null);
      setOccurrenceText("");
      setProofFile(null);
      await queryClient.invalidateQueries({ queryKey: ["courier-deliveries"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  async function handleSignOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    void navigate({ to: "/auth", search: { modo: "entrar" }, replace: true });
  }

  return (
    <div className="min-h-screen bg-secondary/30">
      <header className="border-b border-border/70 bg-card">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4 sm:px-6">
          <Link to="/" aria-label="Página inicial">
            <Logo withWordmark={false} />
          </Link>
          <h1 className="text-base font-semibold text-foreground">Área do entregador</h1>
          <Button variant="ghost" size="sm" onClick={handleSignOut}>
            Sair
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-3 px-4 py-6 sm:px-6">
        <Card className="border-border/70">
          <CardContent className="flex items-center justify-between gap-3 pt-6">
            <div>
              <p className="font-medium text-foreground">{courier?.name ?? "Entregador"}</p>
              <p className="text-sm text-muted-foreground">
                {courier ? (courier.is_online ? "Você está online" : "Você está offline") : "Cadastro ainda não vinculado pela loja"}
              </p>
            </div>
            <Switch
              checked={Boolean(courier?.is_online)}
              disabled={!courier || toggleOnline.isPending}
              onCheckedChange={(checked) => toggleOnline.mutate(checked)}
            />
          </CardContent>
        </Card>

        <Card className="border-border/70">
          <CardContent className="pt-6">
            <PushNotificationsCard
              storeId={deliveries[0]?.store_id ?? undefined}
              audience="entregador"
              compact
            />
          </CardContent>
        </Card>

        {isLoading ? (
          <Skeleton className="h-32 rounded-2xl" />
        ) : deliveries.length === 0 ? (
          <EmptyState
            title="Nenhuma entrega atribuída"
            description="Quando a loja designar uma entrega para você, ela aparece aqui."
          />
        ) : (
          deliveries.map((delivery) => {
            const order = delivery.order as {
              id: string;
              code: string;
              status: string;
              customer_name: string;
              customer_phone: string | null;
              address: unknown;
              total: number | string;
              created_at: string;
              payment_method: string | null;
              payment_status: string;
              delivery_lat: number | null;
              delivery_lng: number | null;
              distance_km: number | null;
            } | null;
            const store = delivery.store as { name: string } | null;
            const address = (order?.address ?? null) as
              | { street?: string; number?: string; district?: string; complement?: string; reference?: string }
              | null;
            const target: OccurrenceState = {
              deliveryId: delivery.id,
              orderId: delivery.order_id,
              storeId: delivery.store_id,
            };
            const late = isLate(delivery.due_at) && delivery.status !== "delivered";
            const addressText = address
              ? `${address.street ?? ""}, ${address.number ?? ""} — ${address.district ?? ""}`
              : "Endereço não informado";

            return (
              <Card key={delivery.id} className={late ? "border-destructive/60 shadow-sm" : "border-border/70 shadow-sm"}>
                <CardContent className="space-y-2 pt-6">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 className="font-semibold text-foreground">#{order?.code}</h2>
                    <div className="flex items-center gap-2">
                      {late ? <Badge variant="destructive">Atrasada</Badge> : null}
                      <Badge variant="secondary">{DELIVERY_STATUS_LABEL[delivery.status]}</Badge>
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {store?.name} · {formatDateTime(order?.created_at ?? delivery.created_at)} ·{" "}
                    {ORDER_STATUS_LABEL[order?.status ?? ""] ?? ""}
                  </p>
                  <p className="text-sm text-foreground">
                    {order?.customer_name} — {order?.customer_phone ?? "sem telefone"}
                  </p>
                  <p className="text-sm text-muted-foreground">{addressText}</p>
                  {order?.distance_km !== null && order?.distance_km !== undefined ? (
                    <p className="text-xs text-muted-foreground">
                      Distância estimada: {formatKm(Number(order.distance_km))}
                    </p>
                  ) : null}
                  {address?.complement ? (
                    <p className="text-xs text-muted-foreground">Complemento: {address.complement}</p>
                  ) : null}
                  {address?.reference ? <p className="text-xs text-muted-foreground">Ref.: {address.reference}</p> : null}
                  <p className="text-sm text-muted-foreground">
                    Pagamento: {order?.payment_method ?? "não informado"} ·{" "}
                    {order?.payment_status === "paid" ? "já pago" : "receber na entrega"}
                  </p>
                  {delivery.attempts > 0 ? (
                    <p className="text-xs text-warning-foreground">Tentativas: {delivery.attempts}</p>
                  ) : null}
                  {delivery.failure_reason ? (
                    <p className="text-xs text-destructive">Última ocorrência: {delivery.failure_reason}</p>
                  ) : null}

                  <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
                    <span className="font-semibold text-foreground">{formatCurrency(Number(order?.total ?? 0))}</span>
                    <div className="flex flex-wrap gap-2">
                      <Button variant="outline" size="sm" asChild>
                        <a
                          href={routeUrl(
                            null,
                            order?.delivery_lat !== null && order?.delivery_lat !== undefined && order?.delivery_lng !== null && order?.delivery_lng !== undefined
                              ? { lat: Number(order.delivery_lat), lng: Number(order.delivery_lng) }
                              : addressText,
                          )}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Ver rota no mapa
                        </a>
                      </Button>
                      {!delivery.accepted_at && delivery.status === "assigned" ? (
                        <Button size="sm" onClick={() => accept.mutate(target)} disabled={accept.isPending}>
                          Aceitar
                        </Button>
                      ) : null}
                      {delivery.accepted_at && delivery.status === "assigned" ? (
                        <Button size="sm" onClick={() => startRoute.mutate(target)} disabled={startRoute.isPending}>
                          Iniciar rota
                        </Button>
                      ) : null}
                      {delivery.status !== "delivered" ? (
                        <>
                          <Button
                            size="sm"
                            className="bg-success text-success-foreground hover:bg-success/90"
                            onClick={() => {
                              setProofFile(null);
                              setCustomerNote("");
                              setDeliverFor(target);
                            }}
                          >
                            Marcar entregue
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setProofFile(null);
                              setOccurrenceText("");
                              setOccurrence(target);
                            }}
                          >
                            Ocorrência
                          </Button>
                        </>
                      ) : null}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}

        <p className="text-xs text-muted-foreground">
          O rastreamento no mapa em tempo real é ativado quando a loja conectar uma integração de mapas e você
          autorizar o compartilhamento de localização.
        </p>
      </main>

      {/* Confirmação de entrega */}
      <Dialog open={Boolean(deliverFor)} onOpenChange={(open) => !open && setDeliverFor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar entrega</DialogTitle>
            <DialogDescription>Anexe o comprovante e registre a observação do cliente, se houver.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="proof">Foto do comprovante</Label>
              <Input
                id="proof"
                type="file"
                accept="image/*"
                capture="environment"
                onChange={(event) => setProofFile(event.target.files?.[0] ?? null)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="note">Observação do cliente</Label>
              <Textarea
                id="note"
                rows={3}
                value={customerNote}
                onChange={(event) => setCustomerNote(event.target.value)}
                placeholder="Ex.: entregue ao porteiro"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeliverFor(null)}>
              Cancelar
            </Button>
            <Button
              onClick={() => deliverFor && markDelivered.mutate(deliverFor)}
              disabled={markDelivered.isPending}
            >
              Confirmar entrega
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Ocorrência */}
      <Dialog open={Boolean(occurrence)} onOpenChange={(open) => !open && setOccurrence(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Registrar ocorrência</DialogTitle>
            <DialogDescription>Conte o que aconteceu. A tentativa fica registrada para a loja.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Textarea
              rows={3}
              value={occurrenceText}
              onChange={(event) => setOccurrenceText(event.target.value)}
              placeholder="Ex.: cliente ausente, endereço não localizado"
            />
            <div className="space-y-1.5">
              <Label htmlFor="occ-proof">Foto (opcional)</Label>
              <Input
                id="occ-proof"
                type="file"
                accept="image/*"
                capture="environment"
                onChange={(event) => setProofFile(event.target.files?.[0] ?? null)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOccurrence(null)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={() => occurrence && registerOccurrence.mutate(occurrence)}
              disabled={registerOccurrence.isPending}
            >
              Registrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
