import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Ban, Check, Copy, Link2, UserPlus, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { PageHeader } from "@/components/painel/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useActiveStore } from "@/hooks/useMyStores";
import { supabase } from "@/integrations/supabase/client";
import type { TablesUpdate } from "@/integrations/supabase/types";
import { COURIER_STATUS_LABEL } from "@/lib/contas";
import { formatCurrency } from "@/lib/format";
import { maskPhone, onlyDigits } from "@/lib/masks";

export const Route = createFileRoute("/_authenticated/painel/entregadores")({
  head: () => ({
    meta: [
      { title: "Entregadores da loja — O Seu Pedido" },
      {
        name: "description",
        content: "Convide motoboys, aprove vínculos, defina comissão por entrega e acompanhe a equipe de entrega.",
      },
      { property: "og:title", content: "Entregadores da loja" },
      { property: "og:description", content: "Convites, comissões e vínculos com motoboys." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: StoreCouriersPage,
});

function StoreCouriersPage() {
  const { active, isLoading: loadingStore } = useActiveStore();
  const queryClient = useQueryClient();
  const storeId = active?.storeId ?? null;

  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [commission, setCommission] = useState("0");
  const [region, setRegion] = useState("");

  const linksQuery = useQuery({
    queryKey: ["store-couriers", storeId],
    enabled: Boolean(storeId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("store_couriers")
        .select("*")
        .eq("store_id", storeId!)
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message);

      const ids = (data ?? []).map((row) => row.courier_user_id).filter(Boolean) as string[];
      const profiles = ids.length
        ? (
            await supabase
              .from("delivery_profiles")
              .select("user_id, full_name, phone, city, status, is_online")
              .in("user_id", ids)
          ).data ?? []
        : [];

      return (data ?? []).map((row) => ({
        ...row,
        courier: profiles.find((item) => item.user_id === row.courier_user_id) ?? null,
      }));
    },
  });

  const invite = useMutation({
    mutationFn: async () => {
      if (!storeId) throw new Error("Selecione uma loja.");
      if (!phone.trim() && !email.trim()) throw new Error("Informe telefone ou e-mail do motoboy.");
      const token = crypto.randomUUID().replace(/-/g, "").slice(0, 24);
      const { error } = await supabase.from("store_couriers").insert({
        store_id: storeId,
        invite_phone: onlyDigits(phone) || null,
        invite_email: email.trim().toLowerCase() || null,
        invite_token: token,
        commission_amount: Number(commission.replace(",", ".")) || 0,
        region: region.trim() || null,
        status: "invited",
      });
      if (error) throw new Error(error.message);
      return token;
    },
    onSuccess: (token) => {
      setPhone("");
      setEmail("");
      void navigator.clipboard?.writeText(`${window.location.origin}/auth?etapa=criar&perfil=motoboy&convite=${token}`);
      toast.success("Convite criado e link copiado.");
      void queryClient.invalidateQueries({ queryKey: ["store-couriers", storeId] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const updateLink = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: TablesUpdate<"store_couriers"> }) => {
      const { error } = await supabase.from("store_couriers").update(patch).eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Vínculo atualizado.");
      void queryClient.invalidateQueries({ queryKey: ["store-couriers", storeId] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (loadingStore) return <Skeleton className="h-64" />;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Entregadores"
        description="Convide motoboys, aprove vínculos e defina comissão e região de atendimento."
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Convidar motoboy</CardTitle>
          <CardDescription>
            Envie o convite por telefone, e-mail ou compartilhe o link gerado.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-4">
          <div className="space-y-2">
            <Label htmlFor="conv-tel">Telefone</Label>
            <Input id="conv-tel" value={phone} onChange={(e) => setPhone(maskPhone(e.target.value))} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="conv-email">E-mail</Label>
            <Input id="conv-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="conv-com">Comissão por entrega (R$)</Label>
            <Input id="conv-com" inputMode="decimal" value={commission} onChange={(e) => setCommission(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="conv-reg">Região</Label>
            <Input id="conv-reg" value={region} onChange={(e) => setRegion(e.target.value)} />
          </div>
          <div className="sm:col-span-4">
            <Button onClick={() => invite.mutate()} disabled={invite.isPending}>
              <UserPlus className="mr-2 h-4 w-4" aria-hidden /> Criar convite e copiar link
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Equipe de entrega</CardTitle>
          <CardDescription>Somente motoboys vinculados recebem os pedidos desta loja.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {linksQuery.isLoading ? (
            <Skeleton className="h-24" />
          ) : (linksQuery.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nenhum entregador vinculado ainda. Crie um convite acima.
            </p>
          ) : (
            (linksQuery.data ?? []).map((link) => {
              const courier = link.courier;
              return (
                <div
                  key={link.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border/70 p-3"
                >
                  <div className="text-sm">
                    <p className="font-medium">
                      {courier?.full_name ?? link.invite_email ?? maskPhone(link.invite_phone ?? "") ?? "Convite"}
                      {courier?.is_online ? (
                        <Badge className="ml-2" variant="default">
                          Online
                        </Badge>
                      ) : null}
                    </p>
                    <p className="text-muted-foreground">
                      {courier ? COURIER_STATUS_LABEL[courier.status] ?? courier.status : "Convite pendente"} ·
                      Comissão {formatCurrency(Number(link.commission_amount))}
                      {link.region ? ` · ${link.region}` : ""}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {link.invite_token ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          void navigator.clipboard?.writeText(
                            `${window.location.origin}/auth?etapa=criar&perfil=motoboy&convite=${link.invite_token}`,
                          );
                          toast.success("Link copiado.");
                        }}
                      >
                        <Copy className="mr-2 h-4 w-4" aria-hidden /> Link
                      </Button>
                    ) : null}
                    {link.status !== "approved" ? (
                      <Button
                        size="sm"
                        onClick={() => updateLink.mutate({ id: link.id, patch: { status: "approved" } })}
                      >
                        <Check className="mr-2 h-4 w-4" aria-hidden /> Aprovar
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          updateLink.mutate({
                            id: link.id,
                            patch: {
                              status: "blocked",
                              blocked_until: new Date(Date.now() + 86_400_000).toISOString(),
                            },
                          })
                        }
                      >
                        <Ban className="mr-2 h-4 w-4" aria-hidden /> Bloquear 24h
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => updateLink.mutate({ id: link.id, patch: { status: "removed" } })}
                    >
                      <X className="mr-2 h-4 w-4" aria-hidden /> Remover
                    </Button>
                  </div>
                </div>
              );
            })
          )}
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <Link2 className="h-3.5 w-3.5" aria-hidden />
            O motoboy precisa estar aprovado pela plataforma para ficar online.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
