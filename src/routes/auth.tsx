import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Bike, Eye, EyeOff, LogIn, Store, UserRound, UserPlus } from "lucide-react";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { toast } from "sonner";
import { z } from "zod";

import { Logo } from "@/components/brand/Logo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";
import { fetchAccountKinds } from "@/hooks/useAccountKinds";
import { ACCOUNT_KINDS, VEHICLE_TYPES, redirectForAccount, type AccountKind } from "@/lib/contas";
import { persistProfile, savePendingProfile, type PendingProfile } from "@/lib/contas-pending";
import { recordLoginAttempt, resolveLoginEmail } from "@/lib/contas.functions";
import { isValidDocument, isValidPhone, maskDocument, maskPhone, onlyDigits } from "@/lib/masks";
import { authGuard } from "@/lib/orders.functions";

const searchSchema = z.object({
  etapa: z.enum(["inicio", "entrar", "criar"]).optional().catch(undefined),
  perfil: z.enum(["cliente", "motoboy", "lojista"]).optional().catch(undefined),
  modo: z.enum(["entrar", "criar", "recuperar"]).optional().catch(undefined),
  redirect: z.string().optional().catch(undefined),
});

const TITLE = "Entrar ou criar conta — O Seu Pedido";

export const Route = createFileRoute("/auth")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: TITLE },
      {
        name: "description",
        content:
          "Entre ou crie sua conta no O Seu Pedido como cliente, motoboy ou lojista e acesse o painel certo para você.",
      },
      { property: "og:title", content: "Acesso à plataforma O Seu Pedido" },
      {
        property: "og:description",
        content: "Escolha seu perfil — cliente, motoboy ou lojista — e acesse a plataforma.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AuthPage,
});

const KIND_ICON: Record<AccountKind, ReactNode> = {
  cliente: <UserRound className="h-5 w-5" aria-hidden />,
  motoboy: <Bike className="h-5 w-5" aria-hidden />,
  lojista: <Store className="h-5 w-5" aria-hidden />,
};

interface FormState {
  identifier: string;
  password: string;
  fullName: string;
  email: string;
  phone: string;
  confirmPassword: string;
  birthDate: string;
  document: string;
  cpf: string;
  city: string;
  region: string;
  vehicleType: string;
  vehicleBrand: string;
  vehicleModel: string;
  plate: string;
  cnhNumber: string;
  pixKey: string;
  pixKeyType: string;
  terms: boolean;
  marketing: boolean;
}

const EMPTY_FORM: FormState = {
  identifier: "",
  password: "",
  fullName: "",
  email: "",
  phone: "",
  confirmPassword: "",
  birthDate: "",
  document: "",
  cpf: "",
  city: "",
  region: "",
  vehicleType: "moto",
  vehicleBrand: "",
  vehicleModel: "",
  plate: "",
  cnhNumber: "",
  pixKey: "",
  pixKeyType: "telefone",
  terms: false,
  marketing: false,
};

function AuthPage() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [recovering, setRecovering] = useState(search.modo === "recuperar");
  const [otpSent, setOtpSent] = useState(false);
  const [otpCode, setOtpCode] = useState("");
  const [checkEmail, setCheckEmail] = useState(false);

  const etapa = search.etapa && search.etapa !== "inicio" ? search.etapa : search.modo === "criar" ? "criar" : search.modo ? "entrar" : "inicio";
  const perfil = search.perfil ?? null;

  function update(patch: Partial<FormState>) {
    setForm((current) => ({ ...current, ...patch }));
  }

  function go(next: Partial<z.infer<typeof searchSchema>>) {
    void navigate({
      to: "/auth",
      search: { etapa, perfil: search.perfil, redirect: search.redirect, ...next },
      replace: true,
    });
  }

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) return;
      const kinds = await fetchAccountKinds();
      void navigate({ to: redirectForAccount(kinds, perfil, search.redirect), replace: true });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Depois de autenticar, decide o destino conforme os perfis da conta. */
  async function routeAfterLogin(chosen: AccountKind | null) {
    const kinds = await fetchAccountKinds();
    const available = [
      kinds.customer ? "cliente" : null,
      kinds.courier ? "motoboy" : null,
      kinds.merchant ? "lojista" : null,
    ].filter(Boolean) as AccountKind[];

    if (chosen && available.length && !available.includes(chosen)) {
      toast.error(
        `Sua conta não tem acesso à área de ${chosen}. Você pode criar esse cadastro sem perder a conta atual.`,
      );
      void navigate({ to: "/escolher-perfil", replace: true });
      return;
    }
    if (available.length > 1 && !chosen) {
      void navigate({ to: "/escolher-perfil", replace: true });
      return;
    }
    void navigate({ to: redirectForAccount(kinds, chosen, search.redirect), replace: true });
  }

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form.identifier.trim() || !form.password) {
      toast.error("Informe seu e-mail ou telefone e a senha.");
      return;
    }
    setLoading(true);
    const resolved = await resolveLoginEmail({ data: { identifier: form.identifier } });
    if (!resolved.ok || !resolved.email) {
      setLoading(false);
      toast.error(resolved.message ?? "Não foi possível identificar sua conta.");
      return;
    }
    const guard = await authGuard({ data: { email: resolved.email, kind: "login" } });
    if (!guard.ok) {
      setLoading(false);
      toast.error(guard.message);
      return;
    }
    const { error } = await supabase.auth.signInWithPassword({
      email: resolved.email,
      password: form.password,
    });
    if (error) {
      await recordLoginAttempt({
        data: { identifier: resolved.email, success: false, profileKind: perfil ?? undefined },
      });
      setLoading(false);
      toast.error(
        error.message.includes("Invalid login credentials")
          ? "E-mail, telefone ou senha incorretos."
          : "Não foi possível entrar. Tente novamente.",
      );
      return;
    }
    await recordLoginAttempt({
      data: { identifier: resolved.email, success: true, profileKind: perfil ?? undefined },
    });
    if (!remember && typeof window !== "undefined") {
      window.sessionStorage.setItem("osp:session-only", "1");
    }
    toast.success("Bem-vindo de volta!");
    await routeAfterLogin(perfil);
    setLoading(false);
  }

  async function handleSendOtp() {
    const resolved = await resolveLoginEmail({ data: { identifier: form.identifier } });
    if (!resolved.ok || !resolved.email) {
      toast.error(resolved.message ?? "Informe um e-mail válido para receber o código.");
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.signInWithOtp({
      email: resolved.email,
      options: { shouldCreateUser: false },
    });
    setLoading(false);
    if (error) {
      toast.error("Não foi possível enviar o código agora. Tente entrar com sua senha.");
      return;
    }
    setOtpSent(true);
    toast.success("Enviamos um código de acesso para o seu e-mail.");
  }

  async function handleVerifyOtp() {
    const resolved = await resolveLoginEmail({ data: { identifier: form.identifier } });
    if (!resolved.ok || !resolved.email) return;
    setLoading(true);
    const { error } = await supabase.auth.verifyOtp({
      email: resolved.email,
      token: otpCode.trim(),
      type: "email",
    });
    setLoading(false);
    if (error) {
      toast.error("Código inválido ou expirado.");
      return;
    }
    await routeAfterLogin(perfil);
  }

  async function handleRecover(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const email = form.identifier.trim();
    if (!z.string().email().safeParse(email).success) {
      toast.error("Informe o e-mail cadastrado.");
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/redefinir-senha`,
    });
    setLoading(false);
    if (error) {
      toast.error("Não foi possível enviar o e-mail de recuperação.");
      return;
    }
    toast.success("Enviamos um link de recuperação para o seu e-mail.");
  }

  /** Validação comum a todos os cadastros. */
  function validateBase(): string | null {
    if (form.fullName.trim().length < 3) return "Informe seu nome completo.";
    if (!z.string().email().safeParse(form.email.trim()).success) return "Informe um e-mail válido.";
    if (!isValidPhone(form.phone)) return "Informe um telefone válido com DDD.";
    if (form.password.length < 8) return "A senha deve ter ao menos 8 caracteres.";
    if (form.password !== form.confirmPassword) return "As senhas não conferem.";
    if (!form.terms) return "É necessário aceitar os termos e a política de privacidade.";
    return null;
  }

  async function handleSignUp(event: FormEvent<HTMLFormElement>, kind: AccountKind) {
    event.preventDefault();
    let problem = validateBase();
    if (!problem && kind === "motoboy") {
      if (!isValidDocument(form.cpf)) problem = "Informe um CPF válido.";
      else if (!form.birthDate) problem = "Informe sua data de nascimento.";
      else if (!form.city.trim()) problem = "Informe a cidade de atuação.";
      else if (!form.pixKey.trim()) problem = "Informe a chave Pix para recebimento.";
    }
    if (!problem && kind === "lojista" && !isValidDocument(form.document)) {
      problem = "Informe um CPF ou CNPJ válido.";
    }
    if (problem) {
      toast.error(problem);
      return;
    }

    const pending: PendingProfile = {
      kind,
      fullName: form.fullName.trim(),
      email: form.email.trim().toLowerCase(),
      phone: onlyDigits(form.phone),
      birthDate: form.birthDate || null,
      marketingOptIn: form.marketing,
      document: onlyDigits(form.document) || null,
      cpf: onlyDigits(form.cpf) || null,
      city: form.city.trim() || null,
      region: form.region.trim() || null,
      vehicleType: form.vehicleType,
      vehicleBrand: form.vehicleBrand.trim() || null,
      vehicleModel: form.vehicleModel.trim() || null,
      plate: form.plate.trim().toUpperCase() || null,
      cnhNumber: form.cnhNumber.trim() || null,
      pixKey: form.pixKey.trim() || null,
      pixKeyType: form.pixKeyType,
    };

    setLoading(true);
    const guard = await authGuard({ data: { email: pending.email, kind: "signup" } });
    if (!guard.ok) {
      setLoading(false);
      toast.error(guard.message);
      return;
    }

    const { data, error } = await supabase.auth.signUp({
      email: pending.email,
      password: form.password,
      options: {
        emailRedirectTo: `${window.location.origin}/completar-cadastro`,
        data: {
          full_name: pending.fullName,
          phone: pending.phone,
          account_kind: kind,
          terms_accepted_at: new Date().toISOString(),
        },
      },
    });

    if (error) {
      setLoading(false);
      const raw = error.message.toLowerCase();
      toast.error(
        raw.includes("already registered") || raw.includes("already been registered")
          ? "Este e-mail já possui cadastro. Entre e adicione o novo perfil pela tela de perfis."
          : raw.includes("weak") || raw.includes("pwned")
            ? "Essa senha é muito comum. Escolha uma senha mais forte."
            : raw.includes("rate limit") || raw.includes("too many")
              ? "Muitas tentativas seguidas. Aguarde alguns minutos."
              : "Não foi possível criar a conta. Tente novamente.",
      );
      return;
    }

    savePendingProfile(pending);

    if (!data.session || !data.user) {
      setLoading(false);
      setCheckEmail(true);
      toast.success("Confirme seu e-mail para ativar a conta.");
      return;
    }

    await persistProfile(data.user.id, pending);
    setLoading(false);
    if (typeof window !== "undefined") window.localStorage.removeItem("osp:pending-profile");

    if (kind === "lojista") {
      void navigate({ to: "/onboarding", replace: true });
      return;
    }
    if (kind === "motoboy") {
      void navigate({ to: "/entregador/status", replace: true });
      return;
    }
    void navigate({
      to: search.redirect && search.redirect.startsWith("/") ? search.redirect : "/minha-conta",
      replace: true,
    });
  }

  const kindInfo = ACCOUNT_KINDS.find((item) => item.key === perfil);

  return (
    <div className="flex min-h-screen flex-col bg-secondary/40">
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-4 py-6 sm:px-6">
        <Link to="/" aria-label="Voltar para a página inicial">
          <Logo />
        </Link>
        {etapa !== "inicio" || perfil ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => (perfil ? go({ perfil: undefined }) : go({ etapa: "inicio" }))}
          >
            <ArrowLeft className="mr-2 h-4 w-4" aria-hidden /> Voltar
          </Button>
        ) : null}
      </header>

      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center px-4 pb-16 sm:px-6">
        {etapa === "inicio" ? (
          <section className="w-full">
            <h1 className="text-center text-2xl font-semibold sm:text-3xl">Entrar ou criar conta</h1>
            <p className="mt-2 text-center text-muted-foreground">
              Escolha como você quer continuar. Leva menos de um minuto.
            </p>
            <div className="mt-8 grid gap-4 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => go({ etapa: "entrar" })}
                className="rounded-2xl border border-border/70 bg-card p-6 text-left transition hover:border-primary hover:shadow-md"
              >
                <LogIn className="h-6 w-6 text-primary" aria-hidden />
                <p className="mt-3 text-lg font-semibold">Já tenho uma conta</p>
                <p className="mt-1 text-sm text-muted-foreground">Entrar na plataforma.</p>
              </button>
              <button
                type="button"
                onClick={() => go({ etapa: "criar" })}
                className="rounded-2xl border border-border/70 bg-card p-6 text-left transition hover:border-accent hover:shadow-md"
              >
                <UserPlus className="h-6 w-6 text-accent" aria-hidden />
                <p className="mt-3 text-lg font-semibold">Ainda não tenho conta</p>
                <p className="mt-1 text-sm text-muted-foreground">Criar cadastro gratuito.</p>
              </button>
            </div>
          </section>
        ) : null}

        {etapa !== "inicio" && !perfil ? (
          <section className="w-full">
            <h1 className="text-center text-2xl font-semibold sm:text-3xl">
              {etapa === "entrar" ? "Como você quer entrar?" : "Qual é o seu perfil?"}
            </h1>
            <p className="mt-2 text-center text-muted-foreground">
              Escolha o tipo de acesso. Seus dados preenchidos são mantidos se você voltar.
            </p>
            <div className="mt-8 grid gap-4 sm:grid-cols-3">
              {ACCOUNT_KINDS.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => go({ perfil: item.key })}
                  className="flex h-full flex-col rounded-2xl border border-border/70 bg-card p-5 text-left transition hover:border-primary hover:shadow-md"
                >
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    {KIND_ICON[item.key]}
                  </span>
                  <span className="mt-3 text-base font-semibold">
                    {etapa === "entrar" ? `Entrar como ${item.label}` : `Sou ${item.label}`}
                  </span>
                  <span className="mt-1 text-sm text-muted-foreground">{item.description}</span>
                </button>
              ))}
            </div>
          </section>
        ) : null}

        {etapa !== "inicio" && perfil ? (
          <Card className="w-full max-w-md border-border/70 shadow-sm">
            <CardHeader>
              <Badge variant="secondary" className="w-fit">
                {kindInfo?.label}
              </Badge>
              <CardTitle className="text-xl">
                <h1 className="text-xl font-semibold">
                  {etapa === "entrar" ? `Entrar como ${kindInfo?.label}` : `Criar conta de ${kindInfo?.label}`}
                </h1>
              </CardTitle>
              <CardDescription>{kindInfo?.description}</CardDescription>
              {etapa === "criar" ? (
                <Progress value={perfil === "motoboy" ? 50 : 66} className="mt-2 h-1.5" />
              ) : null}
            </CardHeader>
            <CardContent>
              {checkEmail ? (
                <div className="mb-4 rounded-xl border border-success/40 bg-success/10 p-4 text-sm">
                  <p className="font-medium">Confirme seu e-mail</p>
                  <p className="mt-1 text-muted-foreground">
                    Enviamos um link de confirmação. Ao confirmar, finalizamos seu cadastro
                    automaticamente.
                  </p>
                </div>
              ) : null}

              {etapa === "entrar" ? (
                recovering ? (
                  <form onSubmit={handleRecover} className="space-y-4" noValidate>
                    <div className="space-y-2">
                      <Label htmlFor="rec-email">E-mail cadastrado</Label>
                      <Input
                        id="rec-email"
                        type="email"
                        value={form.identifier}
                        onChange={(event) => update({ identifier: event.target.value })}
                        required
                      />
                    </div>
                    <Button type="submit" className="w-full" disabled={loading}>
                      {loading ? "Enviando..." : "Enviar link de recuperação"}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      className="w-full"
                      onClick={() => setRecovering(false)}
                    >
                      Voltar ao login
                    </Button>
                  </form>
                ) : (
                  <form onSubmit={handleLogin} className="space-y-4" noValidate>
                    <div className="space-y-2">
                      <Label htmlFor="login-id">E-mail ou telefone</Label>
                      <Input
                        id="login-id"
                        value={form.identifier}
                        onChange={(event) => update({ identifier: event.target.value })}
                        autoComplete="username"
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="login-pass">Senha</Label>
                      <div className="relative">
                        <Input
                          id="login-pass"
                          type={showPassword ? "text" : "password"}
                          value={form.password}
                          onChange={(event) => update({ password: event.target.value })}
                          autoComplete="current-password"
                          className="pr-10"
                          required
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword((value) => !value)}
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground"
                          aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                        >
                          {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <label className="flex items-center gap-2 text-muted-foreground">
                        <Checkbox
                          checked={remember}
                          onCheckedChange={(value) => setRemember(value === true)}
                        />
                        Lembrar acesso
                      </label>
                      <button
                        type="button"
                        className="text-foreground underline underline-offset-4"
                        onClick={() => setRecovering(true)}
                      >
                        Esqueci minha senha
                      </button>
                    </div>
                    <Button type="submit" className="w-full" disabled={loading}>
                      {loading ? "Entrando..." : "Entrar"}
                    </Button>

                    <Separator />

                    {otpSent ? (
                      <div className="space-y-2">
                        <Label htmlFor="otp">Código recebido</Label>
                        <Input
                          id="otp"
                          inputMode="numeric"
                          value={otpCode}
                          onChange={(event) => setOtpCode(event.target.value)}
                        />
                        <Button
                          type="button"
                          variant="outline"
                          className="w-full"
                          onClick={() => void handleVerifyOtp()}
                          disabled={loading}
                        >
                          Confirmar código
                        </Button>
                      </div>
                    ) : (
                      <Button
                        type="button"
                        variant="outline"
                        className="w-full"
                        onClick={() => void handleSendOtp()}
                        disabled={loading}
                      >
                        Entrar com código por e-mail
                      </Button>
                    )}

                    <p className="text-center text-sm text-muted-foreground">
                      Ainda não tem conta?{" "}
                      <button
                        type="button"
                        className="text-foreground underline underline-offset-4"
                        onClick={() => go({ etapa: "criar" })}
                      >
                        Criar cadastro
                      </button>
                    </p>
                  </form>
                )
              ) : (
                <form onSubmit={(event) => void handleSignUp(event, perfil)} className="space-y-4" noValidate>
                  <div className="space-y-2">
                    <Label htmlFor="nome">Nome completo</Label>
                    <Input
                      id="nome"
                      value={form.fullName}
                      onChange={(event) => update({ fullName: event.target.value })}
                      autoComplete="name"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email">E-mail</Label>
                    <Input
                      id="email"
                      type="email"
                      value={form.email}
                      onChange={(event) => update({ email: event.target.value })}
                      autoComplete="email"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="tel">Telefone com DDD</Label>
                    <Input
                      id="tel"
                      inputMode="tel"
                      placeholder="(11) 90000-0000"
                      value={form.phone}
                      onChange={(event) => update({ phone: maskPhone(event.target.value) })}
                      required
                    />
                  </div>

                  {perfil === "cliente" ? (
                    <div className="space-y-2">
                      <Label htmlFor="nasc">Data de nascimento (opcional)</Label>
                      <Input
                        id="nasc"
                        type="date"
                        value={form.birthDate}
                        onChange={(event) => update({ birthDate: event.target.value })}
                      />
                    </div>
                  ) : null}

                  {perfil === "lojista" ? (
                    <div className="space-y-2">
                      <Label htmlFor="doc">CPF ou CNPJ do responsável</Label>
                      <Input
                        id="doc"
                        inputMode="numeric"
                        value={form.document}
                        onChange={(event) => update({ document: maskDocument(event.target.value) })}
                        required
                      />
                    </div>
                  ) : null}

                  {perfil === "motoboy" ? (
                    <>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-2">
                          <Label htmlFor="cpf">CPF</Label>
                          <Input
                            id="cpf"
                            inputMode="numeric"
                            value={form.cpf}
                            onChange={(event) => update({ cpf: maskDocument(event.target.value) })}
                            required
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="nasc-m">Data de nascimento</Label>
                          <Input
                            id="nasc-m"
                            type="date"
                            value={form.birthDate}
                            onChange={(event) => update({ birthDate: event.target.value })}
                            required
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="cidade">Cidade de atuação</Label>
                          <Input
                            id="cidade"
                            value={form.city}
                            onChange={(event) => update({ city: event.target.value })}
                            required
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="regiao">Região / bairros</Label>
                          <Input
                            id="regiao"
                            value={form.region}
                            onChange={(event) => update({ region: event.target.value })}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="veiculo">Tipo de veículo</Label>
                          <Select
                            value={form.vehicleType}
                            onValueChange={(value) => update({ vehicleType: value })}
                          >
                            <SelectTrigger id="veiculo">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {VEHICLE_TYPES.map((item) => (
                                <SelectItem key={item.value} value={item.value}>
                                  {item.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="placa">Placa (se aplicável)</Label>
                          <Input
                            id="placa"
                            value={form.plate}
                            onChange={(event) => update({ plate: event.target.value.toUpperCase() })}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="marca">Marca do veículo</Label>
                          <Input
                            id="marca"
                            value={form.vehicleBrand}
                            onChange={(event) => update({ vehicleBrand: event.target.value })}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="modelo">Modelo</Label>
                          <Input
                            id="modelo"
                            value={form.vehicleModel}
                            onChange={(event) => update({ vehicleModel: event.target.value })}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="cnh">CNH (se aplicável)</Label>
                          <Input
                            id="cnh"
                            value={form.cnhNumber}
                            onChange={(event) => update({ cnhNumber: event.target.value })}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="pix">Chave Pix</Label>
                          <Input
                            id="pix"
                            value={form.pixKey}
                            onChange={(event) => update({ pixKey: event.target.value })}
                            required
                          />
                        </div>
                      </div>
                      <p className="rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">
                        Depois do cadastro você envia os documentos (CNH, identificação, veículo e
                        comprovante) e sua conta fica <strong>aguardando aprovação</strong>. As entregas
                        são liberadas somente após a análise.
                      </p>
                    </>
                  ) : null}

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="senha">Senha</Label>
                      <div className="relative">
                        <Input
                          id="senha"
                          type={showPassword ? "text" : "password"}
                          value={form.password}
                          onChange={(event) => update({ password: event.target.value })}
                          autoComplete="new-password"
                          minLength={8}
                          className="pr-10"
                          required
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword((value) => !value)}
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground"
                          aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                        >
                          {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="senha2">Confirmar senha</Label>
                      <Input
                        id="senha2"
                        type="password"
                        value={form.confirmPassword}
                        onChange={(event) => update({ confirmPassword: event.target.value })}
                        autoComplete="new-password"
                        minLength={8}
                        required
                      />
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <Checkbox
                      id="termos"
                      className="mt-0.5"
                      checked={form.terms}
                      onCheckedChange={(value) => update({ terms: value === true })}
                    />
                    <Label htmlFor="termos" className="text-sm font-normal leading-snug text-muted-foreground">
                      Li e aceito os{" "}
                      <Link to="/termos" className="text-foreground underline underline-offset-4">
                        Termos de uso
                      </Link>{" "}
                      e a{" "}
                      <Link to="/privacidade" className="text-foreground underline underline-offset-4">
                        Política de privacidade
                      </Link>
                      {perfil === "motoboy" ? ", incluindo as regras de entrega" : ""}.
                    </Label>
                  </div>

                  <div className="flex items-start gap-3">
                    <Checkbox
                      id="mkt"
                      className="mt-0.5"
                      checked={form.marketing}
                      onCheckedChange={(value) => update({ marketing: value === true })}
                    />
                    <Label htmlFor="mkt" className="text-sm font-normal leading-snug text-muted-foreground">
                      Quero receber novidades e promoções (opcional).
                    </Label>
                  </div>

                  <Button
                    type="submit"
                    className="w-full bg-accent text-accent-foreground hover:bg-accent/90"
                    disabled={loading}
                  >
                    {loading ? "Criando conta..." : "Criar conta"}
                  </Button>

                  <p className="text-center text-sm text-muted-foreground">
                    Já tem conta?{" "}
                    <button
                      type="button"
                      className="text-foreground underline underline-offset-4"
                      onClick={() => go({ etapa: "entrar" })}
                    >
                      Entrar
                    </button>
                  </p>
                </form>
              )}
            </CardContent>
          </Card>
        ) : null}
      </main>
    </div>
  );
}
