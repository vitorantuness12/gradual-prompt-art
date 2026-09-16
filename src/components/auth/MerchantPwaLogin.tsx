import { Eye, EyeOff, KeyRound, Mail, Store } from "lucide-react";
import type { FormEvent } from "react";

import { Logo } from "@/components/brand/Logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export interface MerchantPwaLoginProps {
  identifier: string;
  password: string;
  otpCode: string;
  loading: boolean;
  recovering: boolean;
  otpSent: boolean;
  showPassword: boolean;
  onIdentifierChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onOtpCodeChange: (value: string) => void;
  onTogglePassword: () => void;
  onLogin: (event: FormEvent<HTMLFormElement>) => void;
  onRecover: (event: FormEvent<HTMLFormElement>) => void;
  onSetRecovering: (value: boolean) => void;
  onSendOtp: () => void;
  onVerifyOtp: () => void;
  onCreateAccount: () => void;
}

export function MerchantPwaLogin(props: MerchantPwaLoginProps) {
  return (
    <main className="min-h-dvh bg-background px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(2rem,env(safe-area-inset-top))]">
      <div className="mx-auto flex min-h-[calc(100dvh-3.5rem)] w-full max-w-sm flex-col">
        <header className="flex flex-col items-center pt-[8dvh] text-center motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2">
          <div className="grid size-16 place-items-center rounded-2xl bg-primary/10 shadow-sm ring-1 ring-primary/15">
            <Store className="size-8 text-primary" aria-hidden="true" />
          </div>
          <Logo context="merchant" className="mt-5" />
          <p className="mt-3 text-sm font-medium text-muted-foreground">Área do lojista</p>
          <h1 className="mt-1 text-2xl font-bold text-foreground">Sua operação na palma da mão</h1>
          <p className="mt-2 max-w-xs text-sm leading-relaxed text-muted-foreground">
            Entre para acompanhar pedidos, vendas e clientes.
          </p>
        </header>

        <section className="mt-10 flex flex-1 flex-col" aria-label="Acesso do lojista">
          {props.recovering ? (
            <form onSubmit={props.onRecover} className="flex flex-1 flex-col" noValidate>
              <div className="space-y-2">
                <Label htmlFor="pwa-recovery-email">E-mail cadastrado</Label>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                  <Input id="pwa-recovery-email" type="email" inputMode="email" autoComplete="email" autoCapitalize="none" value={props.identifier} onChange={(event) => props.onIdentifierChange(event.target.value)} className="h-14 rounded-2xl bg-card pl-12 text-base" placeholder="nome@loja.com" autoFocus required />
                </div>
                <p className="px-1 text-sm text-muted-foreground">Enviaremos um link seguro para criar uma nova senha.</p>
              </div>
              <div className="mt-auto space-y-3 pt-8">
                <Button type="submit" size="lg" className="h-14 w-full rounded-2xl text-base font-semibold active:scale-[0.98]" disabled={props.loading}>
                  {props.loading ? "Enviando…" : "Enviar link de recuperação"}
                </Button>
                <Button type="button" variant="ghost" size="lg" className="h-12 w-full" onClick={() => props.onSetRecovering(false)}>Voltar ao login</Button>
              </div>
            </form>
          ) : (
            <form onSubmit={props.onLogin} className="flex flex-1 flex-col" noValidate>
              <div className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="pwa-login-id">E-mail ou telefone</Label>
                  <div className="relative">
                    <Mail className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                    <Input id="pwa-login-id" inputMode="email" autoComplete="username" autoCapitalize="none" value={props.identifier} onChange={(event) => props.onIdentifierChange(event.target.value)} className="h-14 rounded-2xl bg-card pl-12 text-base" placeholder="Seu acesso" autoFocus required />
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
                    <Label htmlFor="pwa-login-password">Senha</Label>
                    <Button type="button" variant="link" className="h-auto shrink-0 p-0 text-xs" onClick={() => props.onSetRecovering(true)}>Esqueci a senha</Button>
                  </div>
                  <div className="relative">
                    <KeyRound className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                    <Input id="pwa-login-password" type={props.showPassword ? "text" : "password"} autoComplete="current-password" value={props.password} onChange={(event) => props.onPasswordChange(event.target.value)} className="h-14 rounded-2xl bg-card px-12 text-base" placeholder="Sua senha" required />
                    <Button type="button" variant="ghost" size="icon" className="absolute right-1 top-1/2 size-12 -translate-y-1/2 rounded-xl text-muted-foreground" onClick={props.onTogglePassword} aria-label={props.showPassword ? "Ocultar senha" : "Mostrar senha"}>
                      {props.showPassword ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
                    </Button>
                  </div>
                </div>

                {props.otpSent ? (
                  <div className="space-y-3 rounded-2xl border border-border bg-card p-4">
                    <Label htmlFor="pwa-otp">Código enviado por e-mail</Label>
                    <Input id="pwa-otp" inputMode="numeric" autoComplete="one-time-code" maxLength={8} value={props.otpCode} onChange={(event) => props.onOtpCodeChange(event.target.value)} className="h-12 rounded-xl text-center text-lg" placeholder="000000" />
                    <Button type="button" variant="outline" className="h-12 w-full rounded-xl" onClick={props.onVerifyOtp} disabled={props.loading}>Confirmar código</Button>
                  </div>
                ) : null}
              </div>

              <div className="mt-auto space-y-3 pt-8">
                <Button type="submit" size="lg" className="h-14 w-full rounded-2xl text-base font-semibold shadow-lg shadow-primary/15 active:scale-[0.98]" disabled={props.loading}>
                  {props.loading ? "Entrando…" : "Entrar na conta"}
                </Button>
                {!props.otpSent ? (
                  <Button type="button" variant="outline" size="lg" className="h-14 w-full rounded-2xl bg-card text-sm" onClick={props.onSendOtp} disabled={props.loading}>
                    <Mail className="size-5 text-primary" /> Entrar com código por e-mail
                  </Button>
                ) : null}
                <p className="pt-3 text-center text-sm text-muted-foreground">
                  Ainda não tem acesso?{" "}
                  <Button type="button" variant="link" className="h-auto p-0 font-semibold" onClick={props.onCreateAccount}>Criar conta agora</Button>
                </p>
              </div>
            </form>
          )}
        </section>
      </div>
    </main>
  );
}