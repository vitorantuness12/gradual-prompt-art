import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { type FormEvent } from "react";
import { toast } from "sonner";
import { z } from "zod";

import { EmptyState, PageHeader } from "@/components/painel/PageHeader";
import { StorePublicSettings } from "@/components/painel/StorePublicSettings";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { canManage, useActiveStore } from "@/hooks/useMyStores";
import { supabase } from "@/integrations/supabase/client";
import { ROLE_LABEL, formatDateTime } from "@/lib/format";
import { storePublicUrl } from "@/lib/store-url";


export const Route = createFileRoute("/_authenticated/painel/configuracoes")({
  component: SettingsPage,
});

const settingsSchema = z.object({
  name: z.string().trim().min(3, "Informe o nome do negócio."),
  description: z.string().trim().max(500).optional(),
  phone: z.string().trim().optional(),
  whatsapp: z.string().trim().optional(),
  street: z.string().trim().optional(),
  number: z.string().trim().optional(),
  district: z.string().trim().optional(),
  city: z.string().trim().optional(),
  state: z.string().trim().max(2).optional(),
  deliveryFee: z.number().min(0),
  minOrderValue: z.number().min(0),
});

type StoreFlag = "accepts_delivery" | "accepts_pickup" | "accepts_scheduling" | "is_active";

function SettingsPage() {
  const { active, refetch } = useActiveStore();
  const queryClient = useQueryClient();
  const storeId = active?.storeId;
  const editable = canManage(active?.role);

  const team = useQuery({
    queryKey: ["team", storeId],
    enabled: Boolean(storeId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("store_members")
        .select("id, user_id, role, created_at")
        .eq("store_id", storeId!)
        .order("created_at");
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  const audit = useQuery({
    queryKey: ["audit", storeId],
    enabled: Boolean(storeId) && editable,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("audit_logs")
        .select("id, action, entity, created_at")
        .eq("store_id", storeId!)
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  const save = useMutation({
    mutationFn: async (values: z.infer<typeof settingsSchema>) => {
      const { error } = await supabase
        .from("stores")
        .update({
          name: values.name,
          description: values.description || null,
          phone: values.phone || null,
          whatsapp: values.whatsapp || null,
          address_street: values.street || null,
          address_number: values.number || null,
          address_district: values.district || null,
          address_city: values.city || null,
          address_state: values.state || null,
          delivery_fee: values.deliveryFee,
          min_order_value: values.minOrderValue,
        })
        .eq("id", storeId!);
      if (error) throw new Error(error.message);
    },
    onSuccess: async () => {
      toast.success("Configurações salvas.");
      await queryClient.invalidateQueries({ queryKey: ["my-stores"] });
      await refetch();
    },
    onError: () => toast.error("Não foi possível salvar as configurações."),
  });

  const toggleFlag = useMutation({
    mutationFn: async ({ field, value }: { field: StoreFlag; value: boolean }) => {
      const patch: Partial<Record<StoreFlag, boolean>> = { [field]: value };
      const { error } = await supabase.from("stores").update(patch).eq("id", storeId!);
      if (error) throw new Error(error.message);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["my-stores"] });
      await refetch();
    },
    onError: () => toast.error("Não foi possível atualizar a configuração."),
  });

  if (!active) return <Skeleton className="h-64 rounded-2xl" />;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const parsed = settingsSchema.safeParse({
      name: String(form.get("name") ?? ""),
      description: String(form.get("description") ?? ""),
      phone: String(form.get("phone") ?? ""),
      whatsapp: String(form.get("whatsapp") ?? ""),
      street: String(form.get("street") ?? ""),
      number: String(form.get("number") ?? ""),
      district: String(form.get("district") ?? ""),
      city: String(form.get("city") ?? ""),
      state: String(form.get("state") ?? "").toUpperCase(),
      deliveryFee: Number(String(form.get("deliveryFee") ?? "0").replace(",", ".")),
      minOrderValue: Number(String(form.get("minOrderValue") ?? "0").replace(",", ".")),
    });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Verifique os dados informados.");
      return;
    }
    save.mutate(parsed.data);
  }

  const store = active.store;

  return (
    <div className="space-y-6">
      <PageHeader title="Configurações" description={`Endereço público: ${storePublicUrl(store.slug)}`} />

      {!editable ? (
        <div className="rounded-xl border border-border bg-card p-3 text-sm text-muted-foreground">
          Seu papel atual ({ROLE_LABEL[active.role]}) permite apenas visualizar estas configurações.
        </div>
      ) : null}

      <StorePublicSettings store={store} editable={editable} onSaved={refetch} />


      <Card className="border-border/70 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Dados da loja</CardTitle>
          <CardDescription>Informações exibidas na página pública.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <fieldset disabled={!editable} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="loja-nome">Nome</Label>
                <Input id="loja-nome" name="name" defaultValue={store.name} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="loja-descricao">Descrição</Label>
                <Textarea id="loja-descricao" name="description" rows={3} defaultValue={store.description ?? ""} />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="loja-telefone">Telefone</Label>
                  <Input id="loja-telefone" name="phone" defaultValue={store.phone ?? ""} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="loja-whatsapp">WhatsApp</Label>
                  <Input id="loja-whatsapp" name="whatsapp" defaultValue={store.whatsapp ?? ""} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="loja-rua">Rua</Label>
                  <Input id="loja-rua" name="street" defaultValue={store.address_street ?? ""} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="loja-numero">Número</Label>
                  <Input id="loja-numero" name="number" defaultValue={store.address_number ?? ""} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="loja-bairro">Bairro</Label>
                  <Input id="loja-bairro" name="district" defaultValue={store.address_district ?? ""} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="loja-cidade">Cidade</Label>
                  <Input id="loja-cidade" name="city" defaultValue={store.address_city ?? ""} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="loja-uf">UF</Label>
                  <Input id="loja-uf" name="state" maxLength={2} defaultValue={store.address_state ?? ""} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="loja-taxa">Taxa de entrega (R$)</Label>
                  <Input id="loja-taxa" name="deliveryFee" inputMode="decimal" defaultValue={String(store.delivery_fee)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="loja-minimo">Pedido mínimo (R$)</Label>
                  <Input
                    id="loja-minimo"
                    name="minOrderValue"
                    inputMode="decimal"
                    defaultValue={String(store.min_order_value)}
                  />
                </div>
              </div>
              <Button type="submit" disabled={save.isPending}>
                {save.isPending ? "Salvando..." : "Salvar alterações"}
              </Button>
            </fieldset>
          </form>
        </CardContent>
      </Card>

      <Card className="border-border/70 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Modos de atendimento</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {[
            { field: "accepts_delivery" as const, label: "Aceitar entrega", value: store.accepts_delivery },
            { field: "accepts_pickup" as const, label: "Aceitar retirada", value: store.accepts_pickup },
            { field: "accepts_scheduling" as const, label: "Aceitar agendamentos", value: store.accepts_scheduling },
            { field: "is_active" as const, label: "Loja ativa na plataforma", value: store.is_active },
          ].map((item) => (
            <div key={item.field} className="flex items-center justify-between rounded-xl border border-border p-3">
              <Label htmlFor={`flag-${item.field}`}>{item.label}</Label>
              <Switch
                id={`flag-${item.field}`}
                checked={item.value}
                disabled={!editable}
                onCheckedChange={(checked) => toggleFlag.mutate({ field: item.field, value: checked })}
              />
            </div>
          ))}
        </CardContent>
      </Card>

      <Card className="border-border/70 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Equipe</CardTitle>
          <CardDescription>Papéis definem o que cada pessoa pode fazer na loja.</CardDescription>
        </CardHeader>
        <CardContent>
          {(team.data ?? []).length === 0 ? (
            <EmptyState title="Nenhum integrante cadastrado" />
          ) : (
            <ul className="divide-y divide-border text-sm">
              {(team.data ?? []).map((member) => (
                <li key={member.id} className="flex items-center justify-between py-2">
                  <span className="font-mono text-muted-foreground">{member.user_id.slice(0, 8)}</span>
                  <span className="font-medium text-foreground">{ROLE_LABEL[member.role]}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {editable ? (
        <Card className="border-border/70 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">Registros de auditoria</CardTitle>
            <CardDescription>Últimas ações registradas nesta loja.</CardDescription>
          </CardHeader>
          <CardContent>
            {(audit.data ?? []).length === 0 ? (
              <EmptyState title="Nenhum registro ainda" />
            ) : (
              <ul className="divide-y divide-border text-sm">
                {(audit.data ?? []).map((log) => (
                  <li key={log.id} className="flex items-center justify-between py-2">
                    <span className="text-foreground">
                      {log.action} · {log.entity}
                    </span>
                    <span className="text-muted-foreground">{formatDateTime(log.created_at)}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
