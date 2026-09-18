import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Ban, Copy, RefreshCw, RotateCcw, UserPlus, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { PageHeader } from "@/components/painel/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useActiveStore } from "@/hooks/useMyStores";
import { supabase } from "@/integrations/supabase/client";
import { createCourierInvite, manageCourierLink } from "@/lib/couriers.functions";
import { formatCurrency } from "@/lib/format";
import { maskPhone } from "@/lib/masks";

export const Route = createFileRoute("/_authenticated/painel/entregadores")({
  head: () => ({ meta: [{ title: "Entregadores da loja — Pedi Um" }, { name: "description", content: "Cadastre, convide e gerencie os entregadores autorizados pela sua loja." }] }),
  component: StoreCouriersPage,
});

const STATUS_LABEL: Record<string, string> = { invited: "Convite enviado", pending: "Pendente", approved: "Ativo", blocked: "Bloqueado", removed: "Removido" };

function StoreCouriersPage() {
  const { active, isLoading: loadingStore } = useActiveStore();
  const queryClient = useQueryClient();
  const storeId = active?.storeId ?? null;
  const createInvite = useServerFn(createCourierInvite);
  const manageLink = useServerFn(manageCourierLink);
  const [form, setForm] = useState({ fullName: "", email: "", phone: "", vehicleType: "moto", plate: "", region: "", pixKey: "", commission: "0" });
  const update = (patch: Partial<typeof form>) => setForm((current) => ({ ...current, ...patch }));

  const linksQuery = useQuery({
    queryKey: ["store-couriers", storeId], enabled: Boolean(storeId),
    queryFn: async () => {
      const { data, error } = await supabase.from("store_couriers").select("*").eq("store_id", storeId!).order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  const invite = useMutation({
    mutationFn: async () => {
      if (!storeId) throw new Error("Selecione uma loja.");
      return createInvite({ data: { storeId, fullName: form.fullName, email: form.email, phone: form.phone,
        vehicleType: form.vehicleType as "moto" | "carro" | "bicicleta" | "outro", plate: form.plate || undefined,
        region: form.region || undefined, pixKey: form.pixKey, commissionAmount: Number(form.commission.replace(",", ".")) || 0 } });
    },
    onSuccess: (result) => {
      const url = `${window.location.origin}/entregadores?convite=${result.token}`;
      void navigator.clipboard?.writeText(url);
      toast.success(`${result.message} O link também foi copiado.`);
      setForm({ fullName: "", email: "", phone: "", vehicleType: "moto", plate: "", region: "", pixKey: "", commission: "0" });
      void queryClient.invalidateQueries({ queryKey: ["store-couriers", storeId] });
    }, onError: (error: Error) => toast.error(error.message),
  });

  const manage = useMutation({
    mutationFn: async ({ linkId, action }: { linkId: string; action: "block" | "reactivate" | "remove" | "resend" }) => {
      if (!storeId) throw new Error("Selecione uma loja.");
      return manageLink({ data: { storeId, linkId, action } });
    },
    onSuccess: (result) => { if (result.token) void navigator.clipboard?.writeText(`${window.location.origin}/entregadores?convite=${result.token}`); toast.success(result.message); void queryClient.invalidateQueries({ queryKey: ["store-couriers", storeId] }); },
    onError: (error: Error) => toast.error(error.message),
  });

  if (loadingStore) return <Skeleton className="h-64" />;
  return <div className="space-y-6">
    <PageHeader title="Entregadores" description="Cadastre os dados operacionais e envie um link para o entregador definir a própria senha." />
    <Card><CardHeader><CardTitle className="text-base">Cadastrar entregador</CardTitle><CardDescription>Não há análise de documentos. A autorização e o vínculo ficam sob responsabilidade da loja.</CardDescription></CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field id="courier-name" label="Nome completo"><Input id="courier-name" value={form.fullName} onChange={(e) => update({ fullName: e.target.value })} /></Field>
        <Field id="courier-email" label="E-mail"><Input id="courier-email" type="email" value={form.email} onChange={(e) => update({ email: e.target.value })} /></Field>
        <Field id="courier-phone" label="Telefone"><Input id="courier-phone" value={form.phone} onChange={(e) => update({ phone: maskPhone(e.target.value) })} /></Field>
        <Field id="courier-vehicle" label="Veículo"><Select value={form.vehicleType} onValueChange={(vehicleType) => update({ vehicleType })}><SelectTrigger id="courier-vehicle"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="moto">Moto</SelectItem><SelectItem value="carro">Carro</SelectItem><SelectItem value="bicicleta">Bicicleta</SelectItem><SelectItem value="outro">Outro</SelectItem></SelectContent></Select></Field>
        <Field id="courier-plate" label="Placa (opcional)"><Input id="courier-plate" value={form.plate} onChange={(e) => update({ plate: e.target.value.toUpperCase() })} /></Field>
        <Field id="courier-region" label="Região / bairros"><Input id="courier-region" value={form.region} onChange={(e) => update({ region: e.target.value })} /></Field>
        <Field id="courier-pix" label="Chave Pix"><Input id="courier-pix" value={form.pixKey} onChange={(e) => update({ pixKey: e.target.value })} /></Field>
        <Field id="courier-commission" label="Comissão por entrega (R$)"><Input id="courier-commission" inputMode="decimal" value={form.commission} onChange={(e) => update({ commission: e.target.value })} /></Field>
        <div className="sm:col-span-2 lg:col-span-4"><Button onClick={() => invite.mutate()} disabled={invite.isPending}><UserPlus className="mr-2 h-4 w-4" />{invite.isPending ? "Criando…" : "Cadastrar e enviar convite"}</Button></div>
      </CardContent>
    </Card>
    <Card><CardHeader><CardTitle className="text-base">Equipe de entrega</CardTitle><CardDescription>Cada autorização vale somente para esta loja.</CardDescription></CardHeader><CardContent className="space-y-3">
      {linksQuery.isLoading ? <Skeleton className="h-24" /> : linksQuery.data?.length ? linksQuery.data.map((link) => {
        const info = (link.invite_data ?? {}) as Record<string, unknown>;
        return <div key={link.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4"><div><div className="flex items-center gap-2"><p className="font-medium">{String(info["fullName"] ?? link.invite_email ?? "Entregador")}</p><Badge variant={link.status === "approved" ? "default" : "secondary"}>{STATUS_LABEL[link.status] ?? link.status}</Badge></div><p className="mt-1 text-sm text-muted-foreground">{link.invite_email} · {maskPhone(link.invite_phone ?? "")} · {formatCurrency(Number(link.commission_amount))}{link.region ? ` · ${link.region}` : ""}</p></div><div className="flex flex-wrap gap-2">
          {link.invite_token && ["invited", "pending"].includes(link.status) ? <><Button size="sm" variant="ghost" onClick={() => { void navigator.clipboard?.writeText(`${window.location.origin}/entregadores?convite=${link.invite_token}`); toast.success("Link copiado."); }}><Copy className="mr-2 h-4 w-4" />Link</Button><Button size="sm" variant="outline" onClick={() => manage.mutate({ linkId: link.id, action: "resend" })}><RefreshCw className="mr-2 h-4 w-4" />Reenviar</Button></> : null}
          {link.status === "approved" ? <Button size="sm" variant="outline" onClick={() => manage.mutate({ linkId: link.id, action: "block" })}><Ban className="mr-2 h-4 w-4" />Bloquear</Button> : link.status === "blocked" ? <Button size="sm" onClick={() => manage.mutate({ linkId: link.id, action: "reactivate" })}><RotateCcw className="mr-2 h-4 w-4" />Reativar</Button> : null}
          {link.status !== "removed" ? <Button size="sm" variant="ghost" onClick={() => manage.mutate({ linkId: link.id, action: "remove" })}><X className="mr-2 h-4 w-4" />Remover</Button> : null}
        </div></div>;
      }) : <p className="text-sm text-muted-foreground">Nenhum entregador cadastrado.</p>}
    </CardContent></Card>
  </div>;
}

function Field({ id, label, children }: { id: string; label: string; children: React.ReactNode }) { return <div className="space-y-2"><Label htmlFor={id}>{label}</Label>{children}</div>; }