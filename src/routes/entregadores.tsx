import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Download, Eye, EyeOff, KeyRound, Mail } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { z } from "zod";

import courierLogoAsset from "@/assets/pedium-entregadores-logo.webp.asset.json";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { usePwaInstall } from "@/hooks/usePwaInstall";
import { acceptCourierInvite, activateNewCourierInvite, previewCourierInvite, type CourierInvitePreview } from "@/lib/couriers.functions";

const searchSchema = z.object({ convite: z.string().optional().catch(undefined), origem: z.enum(["app"]).optional().catch(undefined) });

export const Route = createFileRoute("/entregadores")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "Acesso — Pedi Um Entregadores" },
      { name: "description", content: "Ative seu convite ou entre diretamente no aplicativo Pedi Um Entregadores." },
      { name: "application-name", content: "Pedi Um Entregadores" },
      { name: "apple-mobile-web-app-title", content: "Entregador" },
      { name: "theme-color", content: "#ff0018" },
    ],
    links: [
      { rel: "manifest", href: "/api/public/manifest?entregador=1" },
      { rel: "icon", type: "image/png", href: "/pedium-entregadores-favicon.png" },
      { rel: "apple-touch-icon", href: "/pedium-entregadores-apple-touch-icon.png" },
    ],
  }),
  component: CouriersAccessPage,
});

function CouriersAccessPage() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const install = usePwaInstall();
  const previewInvite = useServerFn(previewCourierInvite);
  const activateInvite = useServerFn(activateNewCourierInvite);
  const acceptInvite = useServerFn(acceptCourierInvite);
  const [preview, setPreview] = useState<CourierInvitePreview | null>(null);
  const [loading, setLoading] = useState(Boolean(search.convite));
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    if (!search.convite && search.origem === "app") {
      void navigate({ to: "/auth", search: { etapa: "entrar", perfil: "motoboy", origem: "app", redirect: "/entregador" }, replace: true });
      return undefined;
    }
    if (!search.convite) return undefined;
    void previewInvite({ data: { token: search.convite } }).then(setPreview).finally(() => setLoading(false));
    return undefined;
  }, [search.convite]);

  async function activate(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (!search.convite) return;
    if (password.length < 8) { toast.error("Use uma senha com pelo menos 8 caracteres."); return; }
    if (password !== confirmPassword) { toast.error("As senhas não conferem."); return; }
    setLoading(true);
    try {
      const result = await activateInvite({ data: { token: search.convite, password } });
      if (!result.ok) {
        toast.info(result.message);
        void navigate({ to: "/auth", search: { etapa: "entrar", perfil: "motoboy", origem: "app", redirect: `/entregadores?convite=${search.convite}` } });
        return;
      }
      const { error } = await supabase.auth.signInWithPassword({ email: result.email, password });
      if (error) throw error;
      toast.success(result.message);
      void navigate({ to: "/entregador", replace: true });
    } catch (error) { toast.error(error instanceof Error ? error.message : "Não foi possível ativar o acesso."); }
    finally { setLoading(false); }
  }

  async function acceptExisting() {
    if (!search.convite) return;
    setLoading(true);
    try {
      const { data } = await supabase.auth.getUser();
      if (!data.user) {
        void navigate({ to: "/auth", search: { etapa: "entrar", perfil: "motoboy", origem: "app", redirect: `/entregadores?convite=${search.convite}` } });
        return;
      }
      const result = await acceptInvite({ data: { token: search.convite } });
      toast.success(result.message);
      void navigate({ to: "/entregador", replace: true });
    } catch (error) { toast.error(error instanceof Error ? error.message : "Não foi possível aceitar o convite."); }
    finally { setLoading(false); }
  }

  if (!search.convite) {
    return <main className="grid min-h-dvh place-items-center bg-background px-5 py-10"><Card className="w-full max-w-md border-primary/20 shadow-xl"><CardContent className="space-y-6 p-7 text-center"><img src={courierLogoAsset.url} alt="Pedi Um Entregadores" width={320} height={320} className="mx-auto size-20 rounded-[1.75rem] object-cover shadow-lg" /><div><p className="text-lg font-black">Pedi Um <span className="text-primary">Entregadores</span></p><h1 className="mt-4 text-3xl font-black">Acesso do entregador</h1><p className="mt-2 text-sm text-muted-foreground">Entre para receber e acompanhar entregas das lojas que convidaram você.</p></div><Button className="h-14 w-full rounded-2xl text-base font-bold" onClick={() => navigate({ to: "/auth", search: { etapa: "entrar", perfil: "motoboy", origem: "app", redirect: "/entregador" } })}><KeyRound className="size-5" /> Login direto</Button>{install.canInstall ? <Button variant="outline" className="h-12 w-full rounded-2xl border-primary/30" onClick={() => void install.install()}><Download className="size-5" /> Instalar aplicativo</Button> : null}<p className="text-xs text-muted-foreground">Novos acessos são criados somente por convite de uma loja.</p></CardContent></Card></main>;
  }

  return <main className="grid min-h-dvh place-items-center bg-background px-5 py-10"><Card className="w-full max-w-md border-primary/20 shadow-xl"><CardContent className="space-y-5 p-7"><div className="text-center"><img src={courierLogoAsset.url} alt="Pedi Um Entregadores" width={320} height={320} className="mx-auto size-16 rounded-2xl object-cover shadow-md" /><h1 className="mt-5 text-2xl font-black">Ativar acesso</h1></div>{loading && !preview ? <p className="text-center text-sm">Verificando convite…</p> : preview?.ok ? <>{<div className="rounded-2xl bg-primary/5 p-4 text-sm"><p className="font-semibold">Olá, {preview.fullName}</p><p className="mt-1 text-muted-foreground">Você foi convidado pela loja <strong>{preview.storeName}</strong>.</p><p className="mt-1 flex items-center gap-2 text-xs text-muted-foreground"><Mail className="size-4" /> {preview.email}</p></div>}{preview.existingAccount ? <Button className="h-14 w-full rounded-2xl" onClick={() => void acceptExisting()} disabled={loading}>Entrar e aceitar convite</Button> : <form className="space-y-4" onSubmit={activate}><div className="space-y-2"><Label htmlFor="new-pass">Crie sua senha</Label><div className="relative"><Input id="new-pass" type={showPassword ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} className="h-12 pr-11" minLength={8} required /><Button type="button" variant="ghost" size="icon" className="absolute right-0 top-0 h-12" onClick={() => setShowPassword(!showPassword)}>{showPassword ? <EyeOff /> : <Eye />}</Button></div></div><div className="space-y-2"><Label htmlFor="confirm-pass">Confirme a senha</Label><Input id="confirm-pass" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className="h-12" minLength={8} required /></div><Button className="h-14 w-full rounded-2xl font-bold" disabled={loading}>{loading ? "Ativando…" : "Ativar e entrar"}</Button></form>}</> : <div className="text-center"><p className="font-semibold">Convite indisponível</p><p className="mt-2 text-sm text-muted-foreground">{preview?.message ?? "Não foi possível verificar este convite."}</p></div>}</CardContent></Card></main>;
}