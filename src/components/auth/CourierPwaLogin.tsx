import { Eye, EyeOff, KeyRound, Mail } from "lucide-react";
import type { FormEvent } from "react";

import courierLogoAsset from "@/assets/pedium-entregadores-logo.webp.asset.json";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface CourierPwaLoginProps {
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
}

export function CourierPwaLogin(props: CourierPwaLoginProps) {
  return (
    <main className="min-h-dvh bg-[#fffaf5] px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(2rem,env(safe-area-inset-top))] text-slate-950">
      <div className="mx-auto flex min-h-[calc(100dvh-3.5rem)] w-full max-w-sm flex-col">
        <header className="flex flex-col items-center pt-[7dvh] text-center">
          <img
            src={courierLogoAsset.url}
            alt="Pedi Um Entregadores"
            width={320}
            height={320}
            className="size-20 rounded-[1.75rem] object-cover shadow-lg"
          />
          <p className="mt-5 text-lg font-black tracking-tight">Pedi Um <span className="text-orange-600">Entregadores</span></p>
          <h1 className="mt-4 text-3xl font-black tracking-tight">Suas entregas em um só lugar</h1>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">Acesso exclusivo para entregadores convidados por uma loja.</p>
        </header>

        <section className="mt-9 flex flex-1 flex-col" aria-label="Acesso do entregador">
          {props.recovering ? (
            <form onSubmit={props.onRecover} className="flex flex-1 flex-col" noValidate>
              <div className="space-y-2">
                <Label htmlFor="courier-recovery">E-mail cadastrado</Label>
                <div className="relative"><Mail className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-slate-400" />
                  <Input id="courier-recovery" type="email" autoComplete="email" value={props.identifier} onChange={(event) => props.onIdentifierChange(event.target.value)} className="h-14 rounded-2xl border-orange-100 bg-white pl-12 text-base" placeholder="voce@email.com" autoFocus required />
                </div>
              </div>
              <div className="mt-auto space-y-3 pt-8">
                <Button className="h-14 w-full rounded-2xl bg-orange-600 text-base hover:bg-orange-700" disabled={props.loading}>{props.loading ? "Enviando…" : "Enviar recuperação"}</Button>
                <Button type="button" variant="ghost" className="h-12 w-full" onClick={() => props.onSetRecovering(false)}>Voltar ao login</Button>
              </div>
            </form>
          ) : (
            <form onSubmit={props.onLogin} className="flex flex-1 flex-col" noValidate>
              <div className="space-y-5">
                <div className="space-y-2"><Label htmlFor="courier-login">E-mail ou telefone</Label>
                  <div className="relative"><Mail className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-slate-400" />
                    <Input id="courier-login" autoComplete="username" value={props.identifier} onChange={(event) => props.onIdentifierChange(event.target.value)} className="h-14 rounded-2xl border-orange-100 bg-white pl-12 text-base" placeholder="Seu acesso" autoFocus required />
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between"><Label htmlFor="courier-password">Senha</Label><Button type="button" variant="link" className="h-auto p-0 text-xs text-orange-700" onClick={() => props.onSetRecovering(true)}>Esqueci a senha</Button></div>
                  <div className="relative"><KeyRound className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-slate-400" />
                    <Input id="courier-password" type={props.showPassword ? "text" : "password"} autoComplete="current-password" value={props.password} onChange={(event) => props.onPasswordChange(event.target.value)} className="h-14 rounded-2xl border-orange-100 bg-white px-12 text-base" required />
                    <Button type="button" variant="ghost" size="icon" className="absolute right-1 top-1/2 size-12 -translate-y-1/2" onClick={props.onTogglePassword} aria-label={props.showPassword ? "Ocultar senha" : "Mostrar senha"}>{props.showPassword ? <EyeOff /> : <Eye />}</Button>
                  </div>
                </div>
                {props.otpSent ? <div className="space-y-3 rounded-2xl border border-orange-100 bg-white p-4"><Label htmlFor="courier-otp">Código enviado por e-mail</Label><Input id="courier-otp" inputMode="numeric" autoComplete="one-time-code" maxLength={8} value={props.otpCode} onChange={(event) => props.onOtpCodeChange(event.target.value)} className="h-12 text-center text-lg" /><Button type="button" variant="outline" className="h-12 w-full" onClick={props.onVerifyOtp}>Confirmar código</Button></div> : null}
              </div>
              <div className="mt-auto space-y-3 pt-8">
                <Button className="h-14 w-full rounded-2xl bg-orange-600 text-base font-bold hover:bg-orange-700" disabled={props.loading}>{props.loading ? "Entrando…" : "Entrar como entregador"}</Button>
                {!props.otpSent ? <Button type="button" variant="outline" className="h-14 w-full rounded-2xl border-orange-200 bg-white" onClick={props.onSendOtp}><Mail className="size-5 text-orange-600" /> Entrar com código por e-mail</Button> : null}
                <p className="pt-3 text-center text-xs text-slate-500">Ainda não tem acesso? Solicite um convite à loja parceira.</p>
              </div>
            </form>
          )}
        </section>
      </div>
    </main>
  );
}