import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
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
import { useActiveStore } from "@/hooks/useMyStores";
import { supabase } from "@/integrations/supabase/client";
import { ZONE_RULE_LABEL, type DeliveryZoneRow } from "@/lib/delivery";
import { formatCurrency } from "@/lib/format";
import { estimateEtaMinutes, formatKm, zoneFeeForDistance } from "@/lib/geo";
import { estimateDelivery, type DeliveryEstimate } from "@/lib/geo.functions";

export const Route = createFileRoute("/_authenticated/painel/frete")({
  component: FretePage,
});

const RULE_TYPES = ["district", "zip", "distance", "weight"] as const;

const EMPTY_ZONE = {
  rule_type: "district" as string,
  label: "",
  district: "",
  zip_start: "",
  zip_end: "",
  distance_min_km: 0,
  distance_max_km: 0,
  weight_max_grams: 0,
  fee: 0,
  price_per_km: 0,
  min_fee: 0,
  min_order_value: 0,
  free_above: 0,
  eta_minutes: 40,
};

type ZoneForm = typeof EMPTY_ZONE;

function zoneToForm(zone: DeliveryZoneRow): ZoneForm {
  return {
    rule_type: zone.rule_type,
    label: zone.label,
    district: zone.district ?? "",
    zip_start: zone.zip_start ?? "",
    zip_end: zone.zip_end ?? "",
    distance_min_km: Number(zone.distance_min_km ?? 0),
    distance_max_km: Number(zone.distance_max_km ?? 0),
    weight_max_grams: Number(zone.weight_max_grams ?? 0),
    fee: Number(zone.fee ?? 0),
    price_per_km: Number(zone.price_per_km ?? 0),
    min_fee: Number(zone.min_fee ?? 0),
    min_order_value: Number(zone.min_order_value ?? 0),
    free_above: Number(zone.free_above ?? 0),
    eta_minutes: Number(zone.eta_minutes ?? 40),
  };
}

function formToPayload(form: ZoneForm) {
  return {
    rule_type: form.rule_type,
    label: form.label.trim(),
    district: form.district.trim() || null,
    zip_start: form.zip_start.trim() || null,
    zip_end: form.zip_end.trim() || null,
    distance_min_km: form.distance_min_km,
    distance_max_km: form.distance_max_km || null,
    weight_max_grams: form.weight_max_grams || null,
    fee: form.fee,
    price_per_km: form.price_per_km,
    min_fee: form.min_fee,
    min_order_value: form.min_order_value,
    free_above: form.free_above || null,
    eta_minutes: form.eta_minutes,
  };
}

/** Formulário de regra: usado tanto para criar quanto para editar uma faixa. */
function ZoneFields({ form, onChange }: { form: ZoneForm; onChange: (patch: Partial<ZoneForm>) => void }) {
  const id = (name: string) => `${name}-${form.label || "novo"}`;
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <div className="space-y-1.5">
        <Label htmlFor={id("tipo")}>Tipo de regra</Label>
        <Select value={form.rule_type} onValueChange={(value) => onChange({ rule_type: value })}>
          <SelectTrigger id={id("tipo")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {RULE_TYPES.map((key) => (
              <SelectItem key={key} value={key}>
                {ZONE_RULE_LABEL[key]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={id("nome")}>Nome da região</Label>
        <Input
          id={id("nome")}
          value={form.label}
          onChange={(event) => onChange({ label: event.target.value })}
          placeholder="Ex.: Centro"
        />
      </div>

      {form.rule_type === "district" ? (
        <div className="space-y-1.5">
          <Label htmlFor={id("bairro")}>Bairro atendido</Label>
          <Input
            id={id("bairro")}
            value={form.district}
            onChange={(event) => onChange({ district: event.target.value })}
          />
        </div>
      ) : null}

      {form.rule_type === "zip" ? (
        <>
          <div className="space-y-1.5">
            <Label htmlFor={id("cep-ini")}>CEP inicial</Label>
            <Input
              id={id("cep-ini")}
              inputMode="numeric"
              value={form.zip_start}
              onChange={(event) => onChange({ zip_start: event.target.value })}
              placeholder="78000000"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={id("cep-fim")}>CEP final</Label>
            <Input
              id={id("cep-fim")}
              inputMode="numeric"
              value={form.zip_end}
              onChange={(event) => onChange({ zip_end: event.target.value })}
              placeholder="78099999"
            />
          </div>
        </>
      ) : null}

      {form.rule_type === "distance" ? (
        <>
          <div className="space-y-1.5">
            <Label htmlFor={id("km-min")}>De (km)</Label>
            <Input
              id={id("km-min")}
              type="number"
              step="0.1"
              value={form.distance_min_km}
              onChange={(event) => onChange({ distance_min_km: Number(event.target.value) })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={id("km-max")}>Até (km)</Label>
            <Input
              id={id("km-max")}
              type="number"
              step="0.1"
              value={form.distance_max_km}
              onChange={(event) => onChange({ distance_max_km: Number(event.target.value) })}
            />
          </div>
        </>
      ) : null}

      {form.rule_type === "weight" ? (
        <div className="space-y-1.5">
          <Label htmlFor={id("peso")}>Peso máximo (gramas)</Label>
          <Input
            id={id("peso")}
            type="number"
            value={form.weight_max_grams}
            onChange={(event) => onChange({ weight_max_grams: Number(event.target.value) })}
          />
        </div>
      ) : null}

      <div className="space-y-1.5">
        <Label htmlFor={id("taxa")}>Taxa fixa (R$)</Label>
        <Input
          id={id("taxa")}
          type="number"
          step="0.01"
          value={form.fee}
          onChange={(event) => onChange({ fee: Number(event.target.value) })}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={id("km")}>Tarifa por km (R$)</Label>
        <Input
          id={id("km")}
          type="number"
          step="0.01"
          value={form.price_per_km}
          onChange={(event) => onChange({ price_per_km: Number(event.target.value) })}
        />
        <p className="text-xs text-muted-foreground">Somada à taxa fixa conforme a distância calculada.</p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={id("minfrete")}>Frete mínimo (R$)</Label>
        <Input
          id={id("minfrete")}
          type="number"
          step="0.01"
          value={form.min_fee}
          onChange={(event) => onChange({ min_fee: Number(event.target.value) })}
        />
        <p className="text-xs text-muted-foreground">O cliente nunca paga menos que este valor nesta região.</p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={id("gratis")}>Frete grátis acima de (R$)</Label>
        <Input
          id={id("gratis")}
          type="number"
          step="0.01"
          value={form.free_above}
          onChange={(event) => onChange({ free_above: Number(event.target.value) })}
        />
        <p className="text-xs text-muted-foreground">Deixe 0 para não oferecer frete grátis.</p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={id("pedidomin")}>Pedido mínimo (R$)</Label>
        <Input
          id={id("pedidomin")}
          type="number"
          step="0.01"
          value={form.min_order_value}
          onChange={(event) => onChange({ min_order_value: Number(event.target.value) })}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={id("eta")}>Prazo estimado (min)</Label>
        <Input
          id={id("eta")}
          type="number"
          value={form.eta_minutes}
          onChange={(event) => onChange({ eta_minutes: Number(event.target.value) })}
        />
      </div>
    </div>
  );
}

function FretePage() {
  const { active } = useActiveStore();
  const storeId = active?.storeId;
  const queryClient = useQueryClient();
  const runEstimate = useServerFn(estimateDelivery);

  const [newZone, setNewZone] = useState<ZoneForm>(EMPTY_ZONE);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<ZoneForm>(EMPTY_ZONE);
  const [baseFee, setBaseFee] = useState(0);

  const [simZip, setSimZip] = useState("");
  const [simStreet, setSimStreet] = useState("");
  const [simDistrict, setSimDistrict] = useState("");
  const [simSubtotal, setSimSubtotal] = useState(60);
  const [simResult, setSimResult] = useState<DeliveryEstimate | null>(null);
  const [simulating, setSimulating] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["frete", storeId],
    enabled: Boolean(storeId),
    queryFn: async () => {
      const [zones, store] = await Promise.all([
        supabase.from("delivery_zones").select("*").eq("store_id", storeId!).order("sort_order"),
        supabase.from("stores").select("slug, delivery_fee, latitude, longitude").eq("id", storeId!).maybeSingle(),
      ]);
      if (zones.error) throw new Error(zones.error.message);
      return { zones: (zones.data ?? []) as DeliveryZoneRow[], store: store.data ?? null };
    },
  });

  const zones = data?.zones ?? [];
  const store = data?.store ?? null;

  useEffect(() => {
    if (store) setBaseFee(Number(store.delivery_fee ?? 0));
  }, [store]);

  const saveBaseFee = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("stores").update({ delivery_fee: baseFee }).eq("id", storeId!);
      if (error) throw new Error(error.message);
    },
    onSuccess: async () => {
      toast.success("Taxa padrão atualizada.");
      await queryClient.invalidateQueries({ queryKey: ["frete", storeId] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const createZone = useMutation({
    mutationFn: async () => {
      if (newZone.label.trim().length < 2) throw new Error("Dê um nome para a região.");
      const { error } = await supabase.from("delivery_zones").insert({
        store_id: storeId!,
        sort_order: zones.length,
        ...formToPayload(newZone),
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: async () => {
      toast.success("Regra de frete criada.");
      setNewZone(EMPTY_ZONE);
      await queryClient.invalidateQueries({ queryKey: ["frete", storeId] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const updateZone = useMutation({
    mutationFn: async (id: string) => {
      if (editForm.label.trim().length < 2) throw new Error("Dê um nome para a região.");
      const { error } = await supabase.from("delivery_zones").update(formToPayload(editForm)).eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: async () => {
      toast.success("Regra atualizada.");
      setEditingId(null);
      await queryClient.invalidateQueries({ queryKey: ["frete", storeId] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const toggleZone = useMutation({
    mutationFn: async ({ id, value }: { id: string; value: boolean }) => {
      const { error } = await supabase.from("delivery_zones").update({ is_active: value }).eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: async () => queryClient.invalidateQueries({ queryKey: ["frete", storeId] }),
  });

  const removeZone = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("delivery_zones").delete().eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: async () => {
      toast.success("Regra removida.");
      await queryClient.invalidateQueries({ queryKey: ["frete", storeId] });
    },
  });

  async function simulate() {
    if (!store?.slug) return;
    setSimulating(true);
    try {
      const result = await runEstimate({
        data: {
          storeSlug: store.slug,
          zip: simZip,
          street: simStreet,
          district: simDistrict,
          subtotal: simSubtotal,
        },
      });
      setSimResult(result);
    } catch {
      toast.error("Não foi possível simular agora.");
    } finally {
      setSimulating(false);
    }
  }

  function describeZone(zone: DeliveryZoneRow) {
    const parts: string[] = [];
    if (zone.rule_type === "district") parts.push(`Bairro: ${zone.district ?? "—"}`);
    if (zone.rule_type === "zip") parts.push(`CEP ${zone.zip_start ?? "—"} a ${zone.zip_end ?? zone.zip_start ?? "—"}`);
    if (zone.rule_type === "distance")
      parts.push(`${Number(zone.distance_min_km).toString()} a ${zone.distance_max_km ?? "∞"} km`);
    if (zone.rule_type === "weight") parts.push(`Até ${zone.weight_max_grams ?? 0} g`);
    parts.push(`Taxa ${formatCurrency(Number(zone.fee))}`);
    if (Number(zone.price_per_km) > 0) parts.push(`${formatCurrency(Number(zone.price_per_km))}/km`);
    if (Number(zone.min_fee) > 0) parts.push(`mínimo ${formatCurrency(Number(zone.min_fee))}`);
    if (zone.free_above) parts.push(`grátis acima de ${formatCurrency(Number(zone.free_above))}`);
    parts.push(`ETA ${zone.eta_minutes} min`);
    return parts.join(" · ");
  }

  return (
    <div>
      <PageHeader
        title="Frete e áreas de entrega"
        description="Defina tarifa por km, frete mínimo, frete grátis e prazo para cada região ou faixa de CEP."
      />

      <div className="space-y-4">
        <Card className="border-border/70">
          <CardHeader>
            <CardTitle className="text-base">Taxa padrão</CardTitle>
            <CardDescription>Usada quando o endereço não se encaixa em nenhuma regra abaixo.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap items-end gap-3">
            <div className="w-40 space-y-1.5">
              <Label htmlFor="taxa-padrao">Taxa padrão (R$)</Label>
              <Input
                id="taxa-padrao"
                type="number"
                step="0.01"
                value={baseFee}
                onChange={(event) => setBaseFee(Number(event.target.value))}
              />
            </div>
            <Button onClick={() => saveBaseFee.mutate()} disabled={saveBaseFee.isPending || !storeId}>
              Salvar taxa padrão
            </Button>
            {store && (store.latitude === null || store.longitude === null) ? (
              <p className="text-xs text-warning-foreground">
                A localização da loja ainda será calculada no primeiro pedido; confira o endereço em Configurações para
                que a distância saia correta.
              </p>
            ) : null}
          </CardContent>
        </Card>

        <Card className="border-border/70">
          <CardHeader>
            <CardTitle className="text-base">Nova regra de frete</CardTitle>
            <CardDescription>Bairro, faixa de CEP, distância ou peso — com tarifa por km e prazo.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <ZoneFields form={newZone} onChange={(patch) => setNewZone((old) => ({ ...old, ...patch }))} />
            <Button onClick={() => createZone.mutate()} disabled={createZone.isPending || !storeId}>
              Adicionar regra
            </Button>
          </CardContent>
        </Card>

        {isLoading ? (
          <Skeleton className="h-32 rounded-2xl" />
        ) : zones.length === 0 ? (
          <EmptyState
            title="Nenhuma regra cadastrada"
            description="Sem regras, todos os pedidos usam a taxa padrão acima."
          />
        ) : (
          <div className="space-y-2">
            {zones.map((zone) => (
              <Card key={zone.id} className="border-border/70">
                <CardContent className="space-y-3 pt-6">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2 font-medium text-foreground">
                        <span>{zone.label}</span>
                        <Badge variant="secondary">{ZONE_RULE_LABEL[zone.rule_type]}</Badge>
                        {zone.is_active ? null : <Badge variant="outline">Pausada</Badge>}
                      </div>
                      <p className="text-sm text-muted-foreground">{describeZone(zone)}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={zone.is_active}
                        onCheckedChange={(value) => toggleZone.mutate({ id: zone.id, value })}
                        aria-label="Ativar regra"
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          if (editingId === zone.id) {
                            setEditingId(null);
                            return;
                          }
                          setEditingId(zone.id);
                          setEditForm(zoneToForm(zone));
                        }}
                      >
                        {editingId === zone.id ? "Fechar" : "Editar"}
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => removeZone.mutate(zone.id)}>
                        Remover
                      </Button>
                    </div>
                  </div>

                  {editingId === zone.id ? (
                    <div className="space-y-3 rounded-xl border border-border/70 bg-muted/30 p-3">
                      <ZoneFields form={editForm} onChange={(patch) => setEditForm((old) => ({ ...old, ...patch }))} />
                      <p className="text-xs text-muted-foreground">
                        Exemplo a 5 km: cliente pagaria{" "}
                        {formatCurrency(
                          zoneFeeForDistance(
                            { ...zone, fee: editForm.fee, price_per_km: editForm.price_per_km, min_fee: editForm.min_fee },
                            5,
                          ),
                        )}{" "}
                        · prazo aproximado {Math.max(editForm.eta_minutes, estimateEtaMinutes(5))} min.
                      </p>
                      <Button onClick={() => updateZone.mutate(zone.id)} disabled={updateZone.isPending}>
                        Salvar alterações
                      </Button>
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        <Card className="border-border/70">
          <CardHeader>
            <CardTitle className="text-base">Simular frete de um endereço</CardTitle>
            <CardDescription>Veja o que o cliente verá no checkout: distância, prazo e valor.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-4">
              <div className="space-y-1.5">
                <Label htmlFor="sim-cep">CEP</Label>
                <Input id="sim-cep" value={simZip} onChange={(event) => setSimZip(event.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sim-rua">Rua</Label>
                <Input id="sim-rua" value={simStreet} onChange={(event) => setSimStreet(event.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sim-bairro">Bairro</Label>
                <Input id="sim-bairro" value={simDistrict} onChange={(event) => setSimDistrict(event.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sim-total">Valor do pedido (R$)</Label>
                <Input
                  id="sim-total"
                  type="number"
                  step="0.01"
                  value={simSubtotal}
                  onChange={(event) => setSimSubtotal(Number(event.target.value))}
                />
              </div>
            </div>
            <Button variant="outline" onClick={() => void simulate()} disabled={simulating || !store?.slug}>
              {simulating ? "Simulando…" : "Simular"}
            </Button>
            {simResult ? (
              <div className="rounded-xl border border-border/70 bg-muted/40 p-3 text-sm">
                <p className="text-foreground">
                  Distância {formatKm(simResult.distanceKm)} · prazo {simResult.etaMinutes} min · frete{" "}
                  {simResult.fee === 0 ? "grátis" : formatCurrency(simResult.fee)}
                  {simResult.zoneLabel ? ` · regra: ${simResult.zoneLabel}` : " · taxa padrão"}
                </p>
                {simResult.message ? <p className="text-xs text-muted-foreground">{simResult.message}</p> : null}
                {simResult.blockedReason ? (
                  <p className="text-xs text-destructive">{simResult.blockedReason}</p>
                ) : null}
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
