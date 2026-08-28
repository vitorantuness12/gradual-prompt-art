import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState, type FormEvent } from "react";
import { toast } from "sonner";

import { EmptyState, PageHeader } from "@/components/painel/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useActiveStore } from "@/hooks/useMyStores";
import { supabase } from "@/integrations/supabase/client";
import {
  MISSION_GOALS,
  REWARD_KINDS,
  RULE_KINDS,
  SEGMENTS,
  SEGMENT_LABEL,
  RULE_KIND_LABEL,
  REWARD_KIND_LABEL,
  missionProgressPercent,
} from "@/lib/fidelidade";
import {
  adjustLoyaltyPoints,
  blockCustomer,
  redeemReward,
  runCampaign,
  saveLoyaltySettings,
  unblockCustomer,
} from "@/lib/fidelidade.functions";
import { formatCurrency, formatDate } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/painel/fidelidade")({
  component: LoyaltyPage,
  head: () => ({
    meta: [
      { title: "Fidelidade e CRM | O Seu Pedido" },
      {
        name: "description",
        content:
          "Configure pontos, níveis, missões, recompensas, campanhas segmentadas e bloqueios de clientes.",
      },
    ],
  }),
});

const numberOr = (value: FormDataEntryValue | null, fallback = 0) => {
  const parsed = Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : fallback;
};

function LoyaltyPage() {
  const { active } = useActiveStore();
  const storeId = active?.storeId;
  const queryClient = useQueryClient();

  const invalidate = async (key: string) => {
    await queryClient.invalidateQueries({ queryKey: [key, storeId] });
  };

  return (
    <div>
      <PageHeader
        title="Fidelidade e CRM"
        description="Pontos, níveis, missões, recompensas, campanhas segmentadas e gestão de bloqueios — sempre com consentimento e transparência para o cliente."
      />

      {!storeId ? (
        <EmptyState
          title="Escolha uma loja"
          description="Selecione a loja no topo do painel para configurar o programa."
        />
      ) : (
        <Tabs defaultValue="programa">
          <TabsList className="mb-4 flex flex-wrap">
            <TabsTrigger value="programa">Programa</TabsTrigger>
            <TabsTrigger value="niveis">Níveis</TabsTrigger>
            <TabsTrigger value="regras">Regras</TabsTrigger>
            <TabsTrigger value="recompensas">Recompensas</TabsTrigger>
            <TabsTrigger value="missoes">Missões</TabsTrigger>
            <TabsTrigger value="campanhas">Campanhas</TabsTrigger>
            <TabsTrigger value="carteiras">Carteiras</TabsTrigger>
            <TabsTrigger value="bloqueios">Bloqueios</TabsTrigger>
          </TabsList>

          <TabsContent value="programa">
            <SettingsTab storeId={storeId} onSaved={() => invalidate("loyalty-settings")} />
          </TabsContent>
          <TabsContent value="niveis">
            <TiersTab storeId={storeId} />
          </TabsContent>
          <TabsContent value="regras">
            <RulesTab storeId={storeId} />
          </TabsContent>
          <TabsContent value="recompensas">
            <RewardsTab storeId={storeId} />
          </TabsContent>
          <TabsContent value="missoes">
            <MissionsTab storeId={storeId} />
          </TabsContent>
          <TabsContent value="campanhas">
            <CampaignsTab storeId={storeId} />
          </TabsContent>
          <TabsContent value="carteiras">
            <WalletsTab storeId={storeId} />
          </TabsContent>
          <TabsContent value="bloqueios">
            <BlocksTab storeId={storeId} />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}

/** ---------- Programa ---------- */

function SettingsTab({ storeId, onSaved }: { storeId: string; onSaved: () => void }) {
  const save = useServerFn(saveLoyaltySettings);
  const [enabled, setEnabled] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["loyalty-settings", storeId],
    queryFn: async () => {
      const { data: row, error } = await supabase
        .from("loyalty_settings")
        .select("*")
        .eq("store_id", storeId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (row) setEnabled(row.is_enabled);
      return row;
    },
  });

  const mutation = useMutation({
    mutationFn: async (form: HTMLFormElement) => {
      const fd = new FormData(form);
      const result = await save({
        data: {
          storeId,
          isEnabled: enabled,
          pointsPerCurrency: numberOr(fd.get("pointsPerCurrency"), 1),
          currencyPerPoint: numberOr(fd.get("currencyPerPoint"), 0.05),
          cashbackPercent: numberOr(fd.get("cashbackPercent")),
          pointsExpirationDays: Math.round(numberOr(fd.get("pointsExpirationDays"), 365)),
          minOrderValue: numberOr(fd.get("minOrderValue")),
          birthdayBonusPoints: Math.round(numberOr(fd.get("birthdayBonusPoints"))),
          referralPoints: Math.round(numberOr(fd.get("referralPoints"))),
          referredPoints: Math.round(numberOr(fd.get("referredPoints"))),
          firstOrderPoints: Math.round(numberOr(fd.get("firstOrderPoints"))),
          frequentOrdersThreshold: Math.round(numberOr(fd.get("frequentOrdersThreshold"), 5)),
          frequentBonusPoints: Math.round(numberOr(fd.get("frequentBonusPoints"))),
          inactiveDays: Math.round(numberOr(fd.get("inactiveDays"), 60)),
          winbackPoints: Math.round(numberOr(fd.get("winbackPoints"))),
          terms: String(fd.get("terms") ?? ""),
        },
      });
      if (!result.ok) throw new Error(result.message);
      return result.message;
    },
    onSuccess: (message) => {
      toast.success(message);
      onSaved();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (isLoading) return <Skeleton className="h-72 rounded-2xl" />;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Como o cliente ganha</CardTitle>
        <CardDescription>
          Essas regras valem para todos os pedidos. Regras específicas por categoria ou campanha
          ficam na aba Regras.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="space-y-6"
          onSubmit={(event: FormEvent<HTMLFormElement>) => {
            event.preventDefault();
            mutation.mutate(event.currentTarget);
          }}
        >
          <div className="flex items-center gap-3 rounded-xl border border-border/70 p-4">
            <Switch id="enabled" checked={enabled} onCheckedChange={setEnabled} />
            <Label htmlFor="enabled">Programa de fidelidade ativo</Label>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field
              name="pointsPerCurrency"
              label="Pontos por R$ 1,00"
              defaultValue={data?.points_per_currency ?? 1}
              step="0.01"
            />
            <Field
              name="currencyPerPoint"
              label="Valor de 1 ponto (R$)"
              defaultValue={data?.currency_per_point ?? 0.05}
              step="0.001"
            />
            <Field
              name="cashbackPercent"
              label="Cashback (%)"
              defaultValue={data?.cashback_percent ?? 0}
              step="0.1"
            />
            <Field
              name="minOrderValue"
              label="Valor mínimo do pedido (R$)"
              defaultValue={data?.min_order_value ?? 0}
              step="0.01"
            />
            <Field
              name="pointsExpirationDays"
              label="Validade dos pontos (dias)"
              defaultValue={data?.points_expiration_days ?? 365}
            />
            <Field
              name="firstOrderPoints"
              label="Bônus de primeira compra"
              defaultValue={data?.first_order_points ?? 0}
            />
            <Field
              name="frequentOrdersThreshold"
              label="Pedidos para cliente frequente"
              defaultValue={data?.frequent_orders_threshold ?? 5}
            />
            <Field
              name="frequentBonusPoints"
              label="Bônus de cliente frequente"
              defaultValue={data?.frequent_bonus_points ?? 0}
            />
            <Field
              name="birthdayBonusPoints"
              label="Bônus de aniversário"
              defaultValue={data?.birthday_bonus_points ?? 0}
            />
            <Field
              name="referralPoints"
              label="Bônus para quem indica"
              defaultValue={data?.referral_points ?? 0}
            />
            <Field
              name="referredPoints"
              label="Bônus para o indicado"
              defaultValue={data?.referred_points ?? 0}
            />
            <Field
              name="inactiveDays"
              label="Dias sem comprar = inativo"
              defaultValue={data?.inactive_days ?? 60}
            />
            <Field
              name="winbackPoints"
              label="Bônus de recuperação"
              defaultValue={data?.winback_points ?? 0}
            />
          </div>

          <div>
            <Label htmlFor="terms">Regras exibidas ao cliente</Label>
            <Textarea
              id="terms"
              name="terms"
              rows={4}
              defaultValue={data?.terms ?? ""}
              placeholder="Explique de forma simples como ganhar e usar pontos, validade e limites."
            />
          </div>

          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? "Salvando..." : "Salvar programa"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function Field({
  name,
  label,
  defaultValue,
  step = "1",
}: {
  name: string;
  label: string;
  defaultValue: number | string;
  step?: string;
}) {
  return (
    <div>
      <Label htmlFor={name}>{label}</Label>
      <Input
        id={name}
        name={name}
        type="number"
        step={step}
        min="0"
        defaultValue={String(defaultValue)}
      />
    </div>
  );
}

/** ---------- Níveis ---------- */

function TiersTab({ storeId }: { storeId: string }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["loyalty-tiers", storeId],
    queryFn: async () => {
      const { data: rows, error } = await supabase
        .from("loyalty_tiers")
        .select("*")
        .eq("store_id", storeId)
        .order("min_points");
      if (error) throw new Error(error.message);
      return rows ?? [];
    },
  });

  const create = useMutation({
    mutationFn: async (fd: FormData) => {
      const { error } = await supabase.from("loyalty_tiers").insert({
        store_id: storeId,
        name: String(fd.get("name") ?? "").trim(),
        min_points: Math.round(numberOr(fd.get("minPoints"))),
        discount_percent: numberOr(fd.get("discountPercent")),
        points_multiplier: numberOr(fd.get("multiplier"), 1),
        benefits: String(fd.get("benefits") ?? "").trim() || null,
        color: String(fd.get("color") ?? "#f59e0b"),
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: async () => {
      toast.success("Nível criado.");
      setOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["loyalty-tiers", storeId] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("loyalty_tiers").delete().eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: async () => {
      toast.success("Nível removido.");
      await queryClient.invalidateQueries({ queryKey: ["loyalty-tiers", storeId] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <div className="space-y-4">
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button>Novo nível</Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo nível de cliente</DialogTitle>
            <DialogDescription>
              O nível é definido pelo total de pontos acumulados pelo cliente.
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              create.mutate(new FormData(event.currentTarget));
            }}
          >
            <div>
              <Label htmlFor="tier-name">Nome</Label>
              <Input id="tier-name" name="name" required placeholder="Ouro" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field name="minPoints" label="Pontos mínimos" defaultValue={0} />
              <Field name="discountPercent" label="Desconto (%)" defaultValue={0} step="0.1" />
              <Field
                name="multiplier"
                label="Multiplicador de pontos"
                defaultValue={1}
                step="0.1"
              />
              <div>
                <Label htmlFor="color">Cor</Label>
                <Input id="color" name="color" type="color" defaultValue="#f59e0b" />
              </div>
            </div>
            <div>
              <Label htmlFor="benefits">Benefícios</Label>
              <Textarea
                id="benefits"
                name="benefits"
                rows={2}
                placeholder="Frete grátis acima de R$ 50, brinde mensal..."
              />
            </div>
            <Button type="submit" disabled={create.isPending}>
              Criar nível
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {isLoading ? (
        <Skeleton className="h-32 rounded-2xl" />
      ) : (data ?? []).length === 0 ? (
        <EmptyState
          title="Nenhum nível criado"
          description="Crie níveis como Bronze, Prata e Ouro para reconhecer os melhores clientes."
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {(data ?? []).map((tier) => (
            <Card key={tier.id}>
              <CardContent className="flex items-start justify-between gap-3 pt-6">
                <div>
                  <div className="flex items-center gap-2">
                    <span
                      className="h-3 w-3 rounded-full"
                      style={{ backgroundColor: tier.color }}
                      aria-hidden
                    />
                    <h3 className="font-medium">{tier.name}</h3>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    A partir de {tier.min_points} pontos · {tier.discount_percent}% de desconto ·
                    multiplicador {tier.points_multiplier}x
                  </p>
                  {tier.benefits ? (
                    <p className="mt-1 text-sm text-muted-foreground">{tier.benefits}</p>
                  ) : null}
                </div>
                <Button variant="ghost" size="sm" onClick={() => remove.mutate(tier.id)}>
                  Remover
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

/** ---------- Regras ---------- */

function RulesTab({ storeId }: { storeId: string }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<string>("purchase");

  const { data: categories } = useQuery({
    queryKey: ["categories-simple", storeId],
    queryFn: async () => {
      const { data: rows } = await supabase
        .from("categories")
        .select("id, name")
        .eq("store_id", storeId)
        .order("name");
      return rows ?? [];
    },
  });

  const { data, isLoading } = useQuery({
    queryKey: ["loyalty-rules", storeId],
    queryFn: async () => {
      const { data: rows, error } = await supabase
        .from("loyalty_rules")
        .select("*")
        .eq("store_id", storeId)
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      return rows ?? [];
    },
  });

  const create = useMutation({
    mutationFn: async (fd: FormData) => {
      const list = (value: FormDataEntryValue | null) =>
        String(value ?? "")
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean);
      const categoryId = String(fd.get("categoryId") ?? "");
      const { error } = await supabase.from("loyalty_rules").insert({
        store_id: storeId,
        name: String(fd.get("name") ?? "").trim(),
        kind,
        points: Math.round(numberOr(fd.get("points"))),
        multiplier: numberOr(fd.get("multiplier"), 1),
        category_id: categoryId && categoryId !== "none" ? categoryId : null,
        min_order_value: numberOr(fd.get("minOrderValue")),
        channels: list(fd.get("channels")),
        districts: list(fd.get("districts")),
        order_types: list(fd.get("orderTypes")),
        usage_limit: fd.get("usageLimit") ? Math.round(numberOr(fd.get("usageLimit"))) : null,
        per_customer_limit: fd.get("perCustomerLimit")
          ? Math.round(numberOr(fd.get("perCustomerLimit")))
          : null,
        starts_at: fd.get("startsAt") ? new Date(String(fd.get("startsAt"))).toISOString() : null,
        ends_at: fd.get("endsAt") ? new Date(String(fd.get("endsAt"))).toISOString() : null,
        description: String(fd.get("description") ?? "").trim() || null,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: async () => {
      toast.success("Regra criada.");
      setOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["loyalty-rules", storeId] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const toggle = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      const { error } = await supabase
        .from("loyalty_rules")
        .update({ is_active: isActive })
        .eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: async () => queryClient.invalidateQueries({ queryKey: ["loyalty-rules", storeId] }),
  });

  return (
    <div className="space-y-4">
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button>Nova regra</Button>
        </DialogTrigger>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nova regra de pontuação</DialogTitle>
            <DialogDescription>
              Defina validade, limites, valor mínimo, canais e regiões elegíveis.
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              create.mutate(new FormData(event.currentTarget));
            }}
          >
            <div>
              <Label htmlFor="rule-name">Nome da regra</Label>
              <Input id="rule-name" name="name" required placeholder="Dobro de pontos nas pizzas" />
            </div>
            <div>
              <Label>Tipo</Label>
              <Select value={kind} onValueChange={setKind}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RULE_KINDS.map((item) => (
                    <SelectItem key={item.key} value={item.key}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="mt-1 text-xs text-muted-foreground">
                {RULE_KINDS.find((r) => r.key === kind)?.help}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field name="points" label="Pontos fixos" defaultValue={0} />
              <Field name="multiplier" label="Multiplicador" defaultValue={1} step="0.1" />
              <Field name="minOrderValue" label="Valor mínimo (R$)" defaultValue={0} step="0.01" />
              <div>
                <Label htmlFor="categoryId">Categoria elegível</Label>
                <Select name="categoryId" defaultValue="none">
                  <SelectTrigger id="categoryId">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Todas</SelectItem>
                    {(categories ?? []).map((category) => (
                      <SelectItem key={category.id} value={category.id}>
                        {category.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="channels">Canais (separados por vírgula)</Label>
                <Input id="channels" name="channels" placeholder="loja, pdv" />
              </div>
              <div>
                <Label htmlFor="districts">Bairros</Label>
                <Input id="districts" name="districts" placeholder="Centro, Jardim" />
              </div>
              <div>
                <Label htmlFor="orderTypes">Tipos de pedido</Label>
                <Input id="orderTypes" name="orderTypes" placeholder="delivery, pickup" />
              </div>
              <Field name="usageLimit" label="Limite total de usos" defaultValue={""} />
              <Field name="perCustomerLimit" label="Limite por cliente" defaultValue={""} />
              <div>
                <Label htmlFor="startsAt">Início</Label>
                <Input id="startsAt" name="startsAt" type="datetime-local" />
              </div>
              <div>
                <Label htmlFor="endsAt">Fim</Label>
                <Input id="endsAt" name="endsAt" type="datetime-local" />
              </div>
            </div>
            <div>
              <Label htmlFor="description">Descrição</Label>
              <Textarea id="description" name="description" rows={2} />
            </div>
            <Button type="submit" disabled={create.isPending}>
              Criar regra
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {isLoading ? (
        <Skeleton className="h-32 rounded-2xl" />
      ) : (data ?? []).length === 0 ? (
        <EmptyState
          title="Nenhuma regra criada"
          description="As regras somam pontos extras além da configuração geral do programa."
        />
      ) : (
        <div className="space-y-3">
          {(data ?? []).map((rule) => (
            <Card key={rule.id}>
              <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-6">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-medium">{rule.name}</h3>
                    <Badge variant="secondary">{RULE_KIND_LABEL[rule.kind] ?? rule.kind}</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {rule.points} pts · multiplicador {rule.multiplier}x · mínimo{" "}
                    {formatCurrency(Number(rule.min_order_value))}
                    {rule.usage_limit != null
                      ? ` · ${rule.used_count}/${rule.usage_limit} usos`
                      : ""}
                  </p>
                  {rule.ends_at ? (
                    <p className="text-xs text-muted-foreground">
                      Válida até {formatDate(rule.ends_at)}
                    </p>
                  ) : null}
                </div>
                <Switch
                  checked={rule.is_active}
                  onCheckedChange={(checked) => toggle.mutate({ id: rule.id, isActive: checked })}
                  aria-label={`Ativar regra ${rule.name}`}
                />
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

/** ---------- Recompensas ---------- */

function RewardsTab({ storeId }: { storeId: string }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState("discount");

  const { data, isLoading } = useQuery({
    queryKey: ["loyalty-rewards", storeId],
    queryFn: async () => {
      const { data: rows, error } = await supabase
        .from("loyalty_rewards")
        .select("*")
        .eq("store_id", storeId)
        .order("points_cost");
      if (error) throw new Error(error.message);
      return rows ?? [];
    },
  });

  const create = useMutation({
    mutationFn: async (fd: FormData) => {
      const { error } = await supabase.from("loyalty_rewards").insert({
        store_id: storeId,
        name: String(fd.get("name") ?? "").trim(),
        description: String(fd.get("description") ?? "").trim() || null,
        kind,
        points_cost: Math.round(numberOr(fd.get("pointsCost"))),
        discount_type: String(fd.get("discountType") ?? "fixed"),
        discount_value: numberOr(fd.get("discountValue")),
        min_order_value: numberOr(fd.get("minOrderValue")),
        stock: fd.get("stock") ? Math.round(numberOr(fd.get("stock"))) : null,
        per_customer_limit: fd.get("perCustomerLimit")
          ? Math.round(numberOr(fd.get("perCustomerLimit")))
          : null,
        valid_days: Math.round(numberOr(fd.get("validDays"), 30)),
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: async () => {
      toast.success("Recompensa criada.");
      setOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["loyalty-rewards", storeId] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <div className="space-y-4">
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button>Nova recompensa</Button>
        </DialogTrigger>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nova recompensa</DialogTitle>
            <DialogDescription>O cliente troca pontos por esta recompensa.</DialogDescription>
          </DialogHeader>
          <form
            className="space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              create.mutate(new FormData(event.currentTarget));
            }}
          >
            <div>
              <Label htmlFor="reward-name">Nome</Label>
              <Input id="reward-name" name="name" required placeholder="R$ 10 de desconto" />
            </div>
            <div>
              <Label>Tipo</Label>
              <Select value={kind} onValueChange={setKind}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {REWARD_KINDS.map((item) => (
                    <SelectItem key={item.key} value={item.key}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field name="pointsCost" label="Custo em pontos" defaultValue={100} />
              <div>
                <Label htmlFor="discountType">Desconto</Label>
                <Select name="discountType" defaultValue="fixed">
                  <SelectTrigger id="discountType">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="fixed">Valor fixo</SelectItem>
                    <SelectItem value="percent">Percentual</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Field name="discountValue" label="Valor" defaultValue={10} step="0.01" />
              <Field name="minOrderValue" label="Pedido mínimo (R$)" defaultValue={0} step="0.01" />
              <Field name="stock" label="Estoque (vazio = ilimitado)" defaultValue={""} />
              <Field name="perCustomerLimit" label="Limite por cliente" defaultValue={""} />
              <Field name="validDays" label="Validade do resgate (dias)" defaultValue={30} />
            </div>
            <div>
              <Label htmlFor="reward-description">Descrição</Label>
              <Textarea id="reward-description" name="description" rows={2} />
            </div>
            <Button type="submit" disabled={create.isPending}>
              Criar recompensa
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {isLoading ? (
        <Skeleton className="h-32 rounded-2xl" />
      ) : (data ?? []).length === 0 ? (
        <EmptyState
          title="Nenhuma recompensa"
          description="Crie prêmios que o cliente possa trocar pelos pontos acumulados."
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {(data ?? []).map((reward) => (
            <Card key={reward.id}>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="font-medium">{reward.name}</h3>
                  <Badge>{reward.points_cost} pts</Badge>
                </div>
                <p className="text-sm text-muted-foreground">
                  {REWARD_KIND_LABEL[reward.kind]} ·{" "}
                  {reward.discount_type === "percent"
                    ? `${reward.discount_value}%`
                    : formatCurrency(Number(reward.discount_value))}
                  {reward.stock != null ? ` · ${reward.stock} disponíveis` : ""}
                </p>
                {reward.description ? (
                  <p className="mt-1 text-sm text-muted-foreground">{reward.description}</p>
                ) : null}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

/** ---------- Missões ---------- */

function MissionsTab({ storeId }: { storeId: string }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [goalKind, setGoalKind] = useState("orders");

  const { data, isLoading } = useQuery({
    queryKey: ["loyalty-missions", storeId],
    queryFn: async () => {
      const { data: rows, error } = await supabase
        .from("loyalty_missions")
        .select("*, loyalty_mission_progress(progress, completed_at)")
        .eq("store_id", storeId)
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      return rows ?? [];
    },
  });

  const create = useMutation({
    mutationFn: async (fd: FormData) => {
      const { error } = await supabase.from("loyalty_missions").insert({
        store_id: storeId,
        title: String(fd.get("title") ?? "").trim(),
        description: String(fd.get("description") ?? "").trim() || null,
        goal_kind: goalKind,
        goal_value: numberOr(fd.get("goalValue"), 1),
        reward_points: Math.round(numberOr(fd.get("rewardPoints"))),
        starts_at: fd.get("startsAt") ? new Date(String(fd.get("startsAt"))).toISOString() : null,
        ends_at: fd.get("endsAt") ? new Date(String(fd.get("endsAt"))).toISOString() : null,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: async () => {
      toast.success("Missão criada.");
      setOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["loyalty-missions", storeId] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <div className="space-y-4">
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button>Nova missão</Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nova missão</DialogTitle>
            <DialogDescription>
              O cliente cumpre uma meta e ganha pontos automaticamente.
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              create.mutate(new FormData(event.currentTarget));
            }}
          >
            <div>
              <Label htmlFor="mission-title">Título</Label>
              <Input id="mission-title" name="title" required placeholder="Peça 3 vezes no mês" />
            </div>
            <div>
              <Label>Meta</Label>
              <Select value={goalKind} onValueChange={setGoalKind}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MISSION_GOALS.map((item) => (
                    <SelectItem key={item.key} value={item.key}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field name="goalValue" label="Valor da meta" defaultValue={3} step="0.01" />
              <Field name="rewardPoints" label="Pontos de recompensa" defaultValue={100} />
              <div>
                <Label htmlFor="mission-start">Início</Label>
                <Input id="mission-start" name="startsAt" type="datetime-local" />
              </div>
              <div>
                <Label htmlFor="mission-end">Fim</Label>
                <Input id="mission-end" name="endsAt" type="datetime-local" />
              </div>
            </div>
            <div>
              <Label htmlFor="mission-description">Descrição</Label>
              <Textarea id="mission-description" name="description" rows={2} />
            </div>
            <Button type="submit" disabled={create.isPending}>
              Criar missão
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {isLoading ? (
        <Skeleton className="h-32 rounded-2xl" />
      ) : (data ?? []).length === 0 ? (
        <EmptyState
          title="Nenhuma missão"
          description="Missões incentivam o cliente a voltar mais vezes."
        />
      ) : (
        <div className="space-y-3">
          {(data ?? []).map((mission) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const progress = ((mission as any).loyalty_mission_progress ?? []) as {
              completed_at: string | null;
            }[];
            const completed = progress.filter((row) => row.completed_at).length;
            return (
              <Card key={mission.id}>
                <CardContent className="pt-6">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="font-medium">{mission.title}</h3>
                    <Badge variant="secondary">{mission.reward_points} pts</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Meta: {mission.goal_value} (
                    {MISSION_GOALS.find((g) => g.key === mission.goal_kind)?.label}) ·{" "}
                    {progress.length} participando · {completed} concluíram
                  </p>
                  <Progress
                    className="mt-2"
                    value={missionProgressPercent(progress.length || 1, completed)}
                  />
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** ---------- Campanhas ---------- */

function CampaignsTab({ storeId }: { storeId: string }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [segment, setSegment] = useState<string>("inactive");
  const [channels, setChannels] = useState<string[]>(["whatsapp"]);
  const dispatch = useServerFn(runCampaign);

  const { data, isLoading } = useQuery({
    queryKey: ["crm-campaigns", storeId],
    queryFn: async () => {
      const { data: rows, error } = await supabase
        .from("crm_campaigns")
        .select("*")
        .eq("store_id", storeId)
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      return rows ?? [];
    },
  });

  const create = useMutation({
    mutationFn: async (fd: FormData) => {
      const config: Record<string, number | string[]> = {
        days: Math.round(numberOr(fd.get("days"), 30)),
        minOrders: Math.round(numberOr(fd.get("minOrders"), 3)),
        minTicket: numberOr(fd.get("minTicket"), 100),
        districts: String(fd.get("districts") ?? "")
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean),
        tags: String(fd.get("tags") ?? "")
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean),
      };
      const { error } = await supabase.from("crm_campaigns").insert({
        store_id: storeId,
        name: String(fd.get("name") ?? "").trim(),
        segment,
        segment_config: config,
        channels,
        message_body: String(fd.get("body") ?? "").trim(),
        bonus_points: Math.round(numberOr(fd.get("bonusPoints"))),
        frequency_cap_days: Math.round(numberOr(fd.get("frequencyCapDays"), 7)),
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: async () => {
      toast.success("Campanha criada.");
      setOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["crm-campaigns", storeId] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const run = useMutation({
    mutationFn: async ({ campaignId, preview }: { campaignId: string; preview: boolean }) =>
      dispatch({ data: { storeId, campaignId, preview } }),
    onSuccess: async (result) => {
      toast[result.ok ? "success" : "error"](result.message);
      await queryClient.invalidateQueries({ queryKey: ["crm-campaigns", storeId] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const toggleChannel = (channel: string) =>
    setChannels((current) =>
      current.includes(channel)
        ? current.filter((item) => item !== channel)
        : [...current, channel],
    );

  return (
    <div className="space-y-4">
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button>Nova campanha</Button>
        </DialogTrigger>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nova campanha segmentada</DialogTitle>
            <DialogDescription>
              O disparo respeita consentimento, opt-out e limite de frequência de cada contato.
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              create.mutate(new FormData(event.currentTarget));
            }}
          >
            <div>
              <Label htmlFor="campaign-name">Nome</Label>
              <Input
                id="campaign-name"
                name="name"
                required
                placeholder="Volta, sentimos sua falta"
              />
            </div>
            <div>
              <Label>Público</Label>
              <Select value={segment} onValueChange={setSegment}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SEGMENTS.map((item) => (
                    <SelectItem key={item.key} value={item.key}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="mt-1 text-xs text-muted-foreground">
                {SEGMENTS.find((s) => s.key === segment)?.help}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field name="days" label="Dias de referência" defaultValue={60} />
              <Field name="minOrders" label="Pedidos mínimos" defaultValue={3} />
              <Field
                name="minTicket"
                label="Ticket médio mínimo (R$)"
                defaultValue={100}
                step="0.01"
              />
              <Field name="bonusPoints" label="Pontos de bônus" defaultValue={0} />
              <Field
                name="frequencyCapDays"
                label="Intervalo mínimo entre envios (dias)"
                defaultValue={7}
              />
              <div>
                <Label htmlFor="campaign-districts">Bairros</Label>
                <Input id="campaign-districts" name="districts" placeholder="Centro, Jardim" />
              </div>
              <div>
                <Label htmlFor="campaign-tags">Marcadores</Label>
                <Input id="campaign-tags" name="tags" placeholder="vegetariano, sem lactose" />
              </div>
            </div>
            <div>
              <Label>Canais</Label>
              <div className="mt-2 flex gap-2">
                {["whatsapp", "email", "push"].map((channel) => (
                  <Button
                    key={channel}
                    type="button"
                    size="sm"
                    variant={channels.includes(channel) ? "default" : "outline"}
                    onClick={() => toggleChannel(channel)}
                  >
                    {channel}
                  </Button>
                ))}
              </div>
            </div>
            <div>
              <Label htmlFor="campaign-body">Mensagem</Label>
              <Textarea
                id="campaign-body"
                name="body"
                rows={3}
                required
                placeholder="Oi {{cliente}}! A {{loja}} preparou uma novidade pra você: {{catalogo}}"
              />
            </div>
            <Button type="submit" disabled={create.isPending}>
              Criar campanha
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {isLoading ? (
        <Skeleton className="h-32 rounded-2xl" />
      ) : (data ?? []).length === 0 ? (
        <EmptyState
          title="Nenhuma campanha"
          description="Crie campanhas para clientes novos, frequentes, inativos ou por bairro."
        />
      ) : (
        <div className="space-y-3">
          {(data ?? []).map((campaign) => (
            <Card key={campaign.id}>
              <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-6">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-medium">{campaign.name}</h3>
                    <Badge variant="secondary">
                      {SEGMENT_LABEL[campaign.segment] ?? campaign.segment}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {campaign.channels.join(", ")} · {campaign.sent_count} enviados ·{" "}
                    {campaign.skipped_count} ignorados
                    {campaign.last_run_at
                      ? ` · último disparo em ${formatDate(campaign.last_run_at)}`
                      : ""}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={run.isPending}
                    onClick={() => run.mutate({ campaignId: campaign.id, preview: true })}
                  >
                    Ver público
                  </Button>
                  <Button
                    size="sm"
                    disabled={run.isPending}
                    onClick={() => run.mutate({ campaignId: campaign.id, preview: false })}
                  >
                    Disparar
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

/** ---------- Carteiras ---------- */

function WalletsTab({ storeId }: { storeId: string }) {
  const queryClient = useQueryClient();
  const adjust = useServerFn(adjustLoyaltyPoints);
  const redeem = useServerFn(redeemReward);
  const [selected, setSelected] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["loyalty-accounts", storeId],
    queryFn: async () => {
      const { data: rows, error } = await supabase
        .from("loyalty_accounts")
        .select("*, customers(name, phone), loyalty_tiers(name, color)")
        .eq("store_id", storeId)
        .order("points_balance", { ascending: false })
        .limit(100);
      if (error) throw new Error(error.message);
      return rows ?? [];
    },
  });

  const { data: rewards } = useQuery({
    queryKey: ["loyalty-rewards-simple", storeId],
    queryFn: async () => {
      const { data: rows } = await supabase
        .from("loyalty_rewards")
        .select("id, name, points_cost")
        .eq("store_id", storeId)
        .eq("is_active", true)
        .order("points_cost");
      return rows ?? [];
    },
  });

  const { data: statement } = useQuery({
    queryKey: ["loyalty-statement", storeId, selected],
    enabled: Boolean(selected),
    queryFn: async () => {
      const { data: rows } = await supabase
        .from("loyalty_transactions")
        .select("*")
        .eq("store_id", storeId)
        .eq("customer_id", selected!)
        .order("created_at", { ascending: false })
        .limit(40);
      return rows ?? [];
    },
  });

  const adjustMutation = useMutation({
    mutationFn: async ({
      customerId,
      points,
      reason,
    }: {
      customerId: string;
      points: number;
      reason: string;
    }) => adjust({ data: { storeId, customerId, points, reason } }),
    onSuccess: async (result) => {
      toast[result.ok ? "success" : "error"](result.message);
      await queryClient.invalidateQueries({ queryKey: ["loyalty-accounts", storeId] });
      await queryClient.invalidateQueries({ queryKey: ["loyalty-statement", storeId, selected] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const redeemMutation = useMutation({
    mutationFn: async ({ customerId, rewardId }: { customerId: string; rewardId: string }) =>
      redeem({ data: { storeId, customerId, rewardId } }),
    onSuccess: async (result) => {
      toast[result.ok ? "success" : "error"](result.message);
      await queryClient.invalidateQueries({ queryKey: ["loyalty-accounts", storeId] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (isLoading) return <Skeleton className="h-40 rounded-2xl" />;
  if ((data ?? []).length === 0) {
    return (
      <EmptyState
        title="Nenhuma carteira ainda"
        description="As carteiras são criadas quando os clientes fazem pedidos."
      />
    );
  }

  return (
    <div className="space-y-3">
      {(data ?? []).map((account) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const customer = (account as any).customers as {
          name: string;
          phone: string | null;
        } | null;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const tier = (account as any).loyalty_tiers as { name: string; color: string } | null;
        const isOpen = selected === account.customer_id;
        return (
          <Card key={account.id}>
            <CardContent className="pt-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-medium">{customer?.name ?? "Cliente"}</h3>
                    {tier ? (
                      <Badge style={{ backgroundColor: tier.color, color: "#111" }}>
                        {tier.name}
                      </Badge>
                    ) : null}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {account.points_balance} pontos · cashback{" "}
                    {formatCurrency(Number(account.cashback_balance))} · {account.orders_count}{" "}
                    pedidos · código de indicação {account.referral_code ?? "—"}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setSelected(isOpen ? null : account.customer_id)}
                  >
                    {isOpen ? "Fechar extrato" : "Ver extrato"}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const raw = window.prompt(
                        "Quantos pontos ajustar? (use valor negativo para retirar)",
                      );
                      if (!raw) return;
                      const points = Math.round(Number(raw));
                      if (!Number.isFinite(points) || points === 0) return;
                      const reason = window.prompt("Motivo do ajuste") ?? "";
                      if (reason.trim().length < 3) {
                        toast.error("Informe o motivo do ajuste.");
                        return;
                      }
                      adjustMutation.mutate({ customerId: account.customer_id, points, reason });
                    }}
                  >
                    Ajustar pontos
                  </Button>
                  {(rewards ?? []).length > 0 ? (
                    <Select
                      onValueChange={(rewardId) =>
                        redeemMutation.mutate({ customerId: account.customer_id, rewardId })
                      }
                    >
                      <SelectTrigger className="w-44" aria-label="Resgatar recompensa">
                        <SelectValue placeholder="Resgatar" />
                      </SelectTrigger>
                      <SelectContent>
                        {(rewards ?? []).map((reward) => (
                          <SelectItem key={reward.id} value={reward.id}>
                            {reward.name} ({reward.points_cost} pts)
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : null}
                </div>
              </div>

              {isOpen ? (
                <ul className="mt-4 space-y-2 border-t border-border/60 pt-3">
                  {(statement ?? []).length === 0 ? (
                    <li className="text-sm text-muted-foreground">Sem movimentações ainda.</li>
                  ) : (
                    (statement ?? []).map((row) => (
                      <li key={row.id} className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">
                          {formatDate(row.created_at)} · {row.description ?? row.kind}
                        </span>
                        <span className={row.points >= 0 ? "text-emerald-600" : "text-destructive"}>
                          {row.points > 0 ? "+" : ""}
                          {row.points} pts
                        </span>
                      </li>
                    ))
                  )}
                </ul>
              ) : null}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

/** ---------- Bloqueios ---------- */

function BlocksTab({ storeId }: { storeId: string }) {
  const queryClient = useQueryClient();
  const block = useServerFn(blockCustomer);
  const unblock = useServerFn(unblockCustomer);
  const [open, setOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["customer-blocks", storeId],
    queryFn: async () => {
      const { data: rows, error } = await supabase
        .from("customer_blocks")
        .select("*")
        .eq("store_id", storeId)
        .order("blocked_at", { ascending: false });
      if (error) throw new Error(error.message);
      return rows ?? [];
    },
  });

  const active = useMemo(() => (data ?? []).filter((row) => row.is_active), [data]);
  const history = useMemo(() => (data ?? []).filter((row) => !row.is_active), [data]);

  const createBlock = useMutation({
    mutationFn: async (fd: FormData) =>
      block({
        data: {
          storeId,
          phone: String(fd.get("phone") ?? ""),
          reason: String(fd.get("reason") ?? ""),
          durationDays: Math.round(numberOr(fd.get("durationDays"))),
        },
      }),
    onSuccess: async (result) => {
      toast[result.ok ? "success" : "error"](result.message);
      if (result.ok) setOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["customer-blocks", storeId] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const removeBlock = useMutation({
    mutationFn: async ({ blockId, reason }: { blockId: string; reason: string }) =>
      unblock({ data: { storeId, blockId, reason } }),
    onSuccess: async (result) => {
      toast[result.ok ? "success" : "error"](result.message);
      await queryClient.invalidateQueries({ queryKey: ["customer-blocks", storeId] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <div className="space-y-4">
      <Card className="border-amber-500/40 bg-amber-500/5">
        <CardContent className="pt-6 text-sm text-muted-foreground">
          O bloqueio é sempre manual e exige motivo registrado. Ele impede novos pedidos com aquele
          telefone, mas o histórico do cliente continua disponível para consulta e revisão. Não use
          bloqueio com base em características pessoais — apenas em fatos objetivos do
          relacionamento com a loja.
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button variant="destructive">Bloquear telefone</Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Bloquear cliente</DialogTitle>
            <DialogDescription>
              Registre o motivo e, se quiser, uma duração para revisão automática.
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              createBlock.mutate(new FormData(event.currentTarget));
            }}
          >
            <div>
              <Label htmlFor="block-phone">Telefone</Label>
              <Input id="block-phone" name="phone" required placeholder="(65) 90000-0000" />
            </div>
            <div>
              <Label htmlFor="block-reason">Motivo</Label>
              <Textarea
                id="block-reason"
                name="reason"
                rows={3}
                required
                placeholder="Trotes recorrentes em pedidos de entrega."
              />
            </div>
            <Field name="durationDays" label="Duração em dias (0 = sem prazo)" defaultValue={0} />
            <Button type="submit" variant="destructive" disabled={createBlock.isPending}>
              Confirmar bloqueio
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {isLoading ? (
        <Skeleton className="h-32 rounded-2xl" />
      ) : (
        <>
          <section>
            <h2 className="mb-2 text-sm font-medium text-muted-foreground">Bloqueios ativos</h2>
            {active.length === 0 ? (
              <EmptyState
                title="Nenhum bloqueio ativo"
                description="Todos os clientes podem concluir pedidos."
              />
            ) : (
              <div className="space-y-3">
                {active.map((row) => (
                  <Card key={row.id}>
                    <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-6">
                      <div>
                        <h3 className="font-medium">{row.phone}</h3>
                        <p className="text-sm text-muted-foreground">{row.reason}</p>
                        <p className="text-xs text-muted-foreground">
                          Desde {formatDate(row.blocked_at)}
                          {row.expires_at
                            ? ` · revisão em ${formatDate(row.expires_at)}`
                            : " · sem prazo definido"}
                        </p>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          const reason = window.prompt("Motivo do desbloqueio") ?? "";
                          if (reason.trim().length < 3) {
                            toast.error("Informe o motivo do desbloqueio.");
                            return;
                          }
                          removeBlock.mutate({ blockId: row.id, reason });
                        }}
                      >
                        Desbloquear
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </section>

          {history.length > 0 ? (
            <section>
              <h2 className="mb-2 text-sm font-medium text-muted-foreground">Histórico revisado</h2>
              <div className="space-y-2">
                {history.map((row) => (
                  <Card key={row.id} className="opacity-80">
                    <CardContent className="pt-6 text-sm">
                      <p className="font-medium">{row.phone}</p>
                      <p className="text-muted-foreground">
                        {row.reason} · desbloqueado em{" "}
                        {row.unblocked_at ? formatDate(row.unblocked_at) : "—"}
                        {row.unblock_reason ? ` (${row.unblock_reason})` : ""}
                      </p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}
