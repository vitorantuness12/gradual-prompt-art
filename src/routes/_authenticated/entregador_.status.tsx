import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Bike, CheckCircle2, Clock, LogOut, Store } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/entregador_/status")({
  head: () => ({ meta: [{ title: "Meus vínculos — Pedi Um Entregadores" }, { name: "description", content: "Veja as lojas que autorizaram seu acesso de entregador." }], links: [{ rel: "manifest", href: "/api/public/manifest?entregador=1" }, { rel: "apple-touch-icon", href: "/pedium-entregadores-apple-touch-icon.png" }] }),
  component: CourierStatusPage,
});

const LINK_STATUS: Record<string, string> = { invited: "Convite enviado", pending: "Pendente", approved: "Autorizado", blocked: "Bloqueado", removed: "Encerrado" };

function CourierStatusPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const profileQuery = useQuery({ queryKey: ["delivery-profile"], queryFn: async () => (await supabase.from("delivery_profiles").select("*").maybeSingle()).data });
  const linksQuery = useQuery({ queryKey: ["courier-store-links"], queryFn: async () => { const { data, error } = await supabase.from("store_couriers").select("*, store:stores(name, slug)").order("created_at", { ascending: false }); if (error) throw error; return data ?? []; } });

  async function handleSignOut() { await queryClient.cancelQueries(); queryClient.clear(); await supabase.auth.signOut(); void navigate({ to: "/entregadores", replace: true }); }
  const activeLinks = (linksQuery.data ?? []).filter((link) => link.status === "approved");
  return <div className="min-h-dvh bg-[#fffaf5]"><header className="mx-auto flex w-full max-w-4xl items-center justify-between px-4 py-6"><div className="flex items-center gap-3"><div className="grid size-11 place-items-center rounded-xl bg-orange-500"><Bike className="size-6 text-white" /></div><span className="font-black">Pedi Um Entregadores</span></div><Button variant="ghost" size="sm" onClick={() => void handleSignOut()}><LogOut className="mr-2 h-4 w-4" />Sair</Button></header>
    <main className="mx-auto w-full max-w-4xl space-y-6 px-4 pb-16"><div><h1 className="text-2xl font-bold">Seu acesso de entregador</h1><p className="mt-1 text-muted-foreground">Cada loja controla e autoriza o próprio vínculo com você.</p></div>
      {profileQuery.isLoading || linksQuery.isLoading ? <Skeleton className="h-36" /> : <Card><CardHeader><CardTitle className="text-base">Situação atual</CardTitle><CardDescription>{activeLinks.length ? `Você está autorizado em ${activeLinks.length} ${activeLinks.length === 1 ? "loja" : "lojas"}.` : "Você ainda não possui um vínculo ativo."}</CardDescription></CardHeader><CardContent>{activeLinks.length ? <Button asChild className="bg-orange-600 hover:bg-orange-700"><Link to="/entregador"><CheckCircle2 className="mr-2 h-4 w-4" />Ir para minhas entregas</Link></Button> : <div className="flex items-center gap-3 rounded-xl bg-orange-50 p-4 text-sm"><Clock className="h-5 w-5 text-orange-600" />Aguarde a loja enviar ou reativar seu convite.</div>}</CardContent></Card>}
      <Card><CardHeader><CardTitle className="text-base">Lojas vinculadas</CardTitle><CardDescription>Documentos não são exigidos pelo Pedi Um. A autorização é responsabilidade de cada loja.</CardDescription></CardHeader><CardContent className="space-y-3">{linksQuery.data?.length ? linksQuery.data.map((link) => <div key={link.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4"><div className="flex items-center gap-3"><Store className="h-5 w-5 text-orange-600" /><div><p className="font-medium">{(link.store as { name: string } | null)?.name ?? "Loja"}</p><p className="text-sm text-muted-foreground">Comissão: {formatCurrency(Number(link.commission_amount))}{link.region ? ` · ${link.region}` : ""}</p></div></div><Badge variant={link.status === "approved" ? "default" : "secondary"}>{LINK_STATUS[link.status] ?? link.status}</Badge></div>) : <p className="text-sm text-muted-foreground">Nenhum vínculo encontrado. O cadastro é iniciado exclusivamente por convite de uma loja.</p>}</CardContent></Card>
      {profileQuery.data ? <Card><CardHeader><CardTitle className="text-base">Dados operacionais</CardTitle></CardHeader><CardContent className="grid gap-3 text-sm sm:grid-cols-2"><p><span className="text-muted-foreground">Nome:</span> {profileQuery.data.full_name}</p><p><span className="text-muted-foreground">Telefone:</span> {profileQuery.data.phone ?? "—"}</p><p><span className="text-muted-foreground">Veículo:</span> {profileQuery.data.vehicle_type ?? "—"}{profileQuery.data.plate ? ` · ${profileQuery.data.plate}` : ""}</p><p><span className="text-muted-foreground">Região:</span> {profileQuery.data.region ?? "—"}</p></CardContent></Card> : null}
    </main></div>;
}