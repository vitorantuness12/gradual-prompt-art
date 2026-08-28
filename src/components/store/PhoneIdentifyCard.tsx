import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  confirmIdentifyCode,
  identifyPhone,
  requestIdentifyCode,
  type CheckoutSettings,
  type CustomerAddressOption,
  type IdentifyResult,
} from "@/lib/identificacao.functions";
import { maskPhone } from "@/lib/masks";

export interface IdentityConsent {
  acceptedTerms: boolean;
  marketingOptIn: boolean;
  createProfile: boolean;
}

export interface PhoneIdentifyCardProps {
  slug: string;
  phone: string;
  settings: CheckoutSettings;
  consent: IdentityConsent;
  onPhoneChange: (value: string) => void;
  onConsentChange: (value: IdentityConsent) => void;
  onApplyCustomer: (payload: {
    name: string | null;
    email: string | null;
    address: CustomerAddressOption | null;
  }) => void;
}

type Channel = "whatsapp" | "email";

/** Primeira etapa do checkout: identifica o cliente pelo telefone. */
export function PhoneIdentifyCard({
  slug,
  phone,
  settings,
  consent,
  onPhoneChange,
  onConsentChange,
  onApplyCustomer,
}: PhoneIdentifyCardProps) {
  const lookup = useServerFn(identifyPhone);
  const askCode = useServerFn(requestIdentifyCode);
  const confirmCode = useServerFn(confirmIdentifyCode);

  const [result, setResult] = useState<IdentifyResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [addressId, setAddressId] = useState<string | null>(null);
  const [channel, setChannel] = useState<Channel>("whatsapp");
  /** Canal pelo qual o último código foi realmente enviado. */
  const [sentChannel, setSentChannel] = useState<Channel | null>(null);
  const [code, setCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [sending, setSending] = useState(false);
  const [checking, setChecking] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [codeError, setCodeError] = useState<string | null>(null);
  /** Momento (epoch ms) em que o código enviado deixa de valer. */
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  /** Momento em que o reenvio volta a ser permitido. */
  const [resendAt, setResendAt] = useState<number | null>(null);
  const [resendLeft, setResendLeft] = useState(0);
  /** Momento em que o bloqueio por tentativas erradas termina. */
  const [lockedUntil, setLockedUntil] = useState<number | null>(null);
  const [lockLeft, setLockLeft] = useState(0);

  // Contador de validade: atualiza a cada segundo enquanto o código estiver ativo.
  useEffect(() => {
    if (!expiresAt) {
      setSecondsLeft(0);
      return;
    }
    const tick = () => setSecondsLeft(Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000)));
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [expiresAt]);

  // Contadores de reenvio e de bloqueio.
  useEffect(() => {
    if (!resendAt) {
      setResendLeft(0);
      return;
    }
    const tick = () => setResendLeft(Math.max(0, Math.ceil((resendAt - Date.now()) / 1000)));
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [resendAt]);

  useEffect(() => {
    if (!lockedUntil) {
      setLockLeft(0);
      return;
    }
    const tick = () => setLockLeft(Math.max(0, Math.ceil((lockedUntil - Date.now()) / 1000)));
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [lockedUntil]);

  const isLocked = lockLeft > 0;
  const lockCountdown = `${Math.floor(lockLeft / 60)}:${String(lockLeft % 60).padStart(2, "0")}`;
  const codeExpired = codeSent && expiresAt !== null && secondsLeft <= 0;
  const countdown = `${Math.floor(secondsLeft / 60)}:${String(secondsLeft % 60).padStart(2, "0")}`;

  /** Cliente já cadastrado: os aceites já foram dados em compras anteriores. */
  const isReturning = Boolean(result?.found);

  function selectFirstAddress(found: IdentifyResult) {
    const first =
      found.customer?.addresses.find((item) => item.isDefault) ?? found.customer?.addresses[0] ?? null;
    setAddressId(first?.id ?? null);
  }

  async function identify() {
    setLoading(true);
    setCodeSent(false);
    setSentChannel(null);
    setCode("");
    setExpiresAt(null);
    setResendAt(null);
    setLockedUntil(null);
    setFeedback(null);
    setCodeError(null);
    try {
      const found = await lookup({ data: { storeSlug: slug, phone } });
      setResult(found);
      selectFirstAddress(found);
      // Cliente conhecido: os aceites já existem do pedido anterior.
      if (found.found) onConsentChange({ ...consent, acceptedTerms: true, createProfile: true });
    } catch {
      setResult(null);
    } finally {
      setLoading(false);
    }
  }

  /** Envia o código pelo canal escolhido (ou por outro, quando o cliente não recebeu). */
  async function sendCode(target: Channel = channel) {
    setSending(true);
    setCodeError(null);
    try {
      const outcome = await askCode({ data: { storeSlug: slug, phone, channel: target } });
      if (!outcome.ok) {
        // Cooldown ou bloqueio: mantemos o código anterior na tela e avisamos a espera.
        setCodeError(outcome.message);
        setResendAt(outcome.retryAfterSeconds > 0 ? Date.now() + outcome.retryAfterSeconds * 1000 : null);
        return;
      }
      setChannel(target);
      setSentChannel(target);
      setFeedback(outcome.message);
      setCodeSent(true);
      setCode("");
      setExpiresAt(outcome.expiresInSeconds > 0 ? Date.now() + outcome.expiresInSeconds * 1000 : null);
      setResendAt(outcome.retryAfterSeconds > 0 ? Date.now() + outcome.retryAfterSeconds * 1000 : null);
    } catch {
      setFeedback("Não foi possível enviar o código agora. Tente novamente.");
    } finally {
      setSending(false);
    }
  }

  async function verify() {
    if (codeExpired) {
      setCodeError("Este código expirou. Toque em “Enviar outro código” para receber um novo.");
      return;
    }
    setChecking(true);
    setCodeError(null);
    try {
      const confirmed = await confirmCode({ data: { storeSlug: slug, phone, code } });
      if (confirmed.needsVerification || !confirmed.customer) {
        setCodeError(confirmed.message || "Código inválido.");
        if (confirmed.lockedForSeconds > 0) {
          setLockedUntil(Date.now() + confirmed.lockedForSeconds * 1000);
          setExpiresAt(null);
        }
        return;
      }
      setResult(confirmed);
      selectFirstAddress(confirmed);
      setFeedback(confirmed.message);
      setExpiresAt(null);
      setResendAt(null);
      setLockedUntil(null);
      setCodeSent(false);
    } catch {
      setCodeError("Não foi possível confirmar o código agora. Tente novamente.");
    } finally {
      setChecking(false);
    }
  }

  function confirm() {
    const customer = result?.customer;
    if (!customer) return;
    const address = customer.addresses.find((item) => item.id === addressId) ?? null;
    onApplyCustomer({ name: customer.name, email: customer.email, address });
  }

  return (
    <Card className="border-primary/40 bg-primary/5 shadow-sm">
      <CardHeader>
        <CardTitle className="text-base">Informe seu número de telefone</CardTitle>
        <CardDescription>
          Usaremos seu telefone para localizar seus dados, acompanhar este pedido e facilitar suas
          próximas compras.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-[200px] flex-1 space-y-2">
            <Label htmlFor="identificacao-telefone">Telefone (WhatsApp)</Label>
            <Input
              id="identificacao-telefone"
              inputMode="tel"
              autoComplete="tel"
              placeholder="(00) 00000-0000"
              value={maskPhone(phone)}
              onChange={(event) => onPhoneChange(maskPhone(event.target.value))}
            />
          </div>
          <Button type="button" onClick={() => void identify()} disabled={loading || phone.replace(/\D/g, "").length < 10}>
            {loading ? "Procurando…" : "Continuar"}
          </Button>
        </div>

        {result && !result.valid ? (
          <p className="text-sm text-destructive">{result.message}</p>
        ) : null}

        {result?.found && result.needsVerification ? (
          <div className="space-y-3 rounded-xl border border-border/70 bg-card p-3">
            <p className="text-sm font-medium text-foreground">
              {result.customer?.firstName
                ? `Encontramos um cadastro, ${result.customer.firstName}.`
                : "Encontramos um cadastro com este telefone."}{" "}
              Para confirmar que é você, enviaremos um código de 6 dígitos.
            </p>

            <div className="space-y-2">
              <Label>Como você quer receber o código?</Label>
              <div className="grid gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => setChannel("whatsapp")}
                  className={`rounded-lg border p-3 text-left text-sm transition ${
                    channel === "whatsapp" ? "border-primary bg-primary/10" : "border-border/70 bg-background"
                  }`}
                >
                  <span className="block font-medium text-foreground">WhatsApp</span>
                  <span className="text-muted-foreground">{maskPhone(phone)}</span>
                </button>
                <button
                  type="button"
                  disabled={!result.channels.email}
                  onClick={() => setChannel("email")}
                  className={`rounded-lg border p-3 text-left text-sm transition disabled:opacity-50 ${
                    channel === "email" ? "border-primary bg-primary/10" : "border-border/70 bg-background"
                  }`}
                >
                  <span className="block font-medium text-foreground">E-mail</span>
                  <span className="text-muted-foreground">
                    {result.emailMasked ?? "Sem e-mail salvo neste cadastro"}
                  </span>
                </button>
              </div>
            </div>

            <div className="flex flex-wrap items-end gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void sendCode()}
                disabled={sending || isLocked || resendLeft > 0}
              >
                {sending
                  ? "Enviando…"
                  : resendLeft > 0
                    ? `Reenviar em ${resendLeft}s`
                    : codeSent
                      ? "Reenviar código"
                      : "Enviar código"}
              </Button>
              {/* Não recebeu? Reenvia pelo outro canal disponível. */}
              {codeSent && sentChannel ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => void sendCode(sentChannel === "whatsapp" ? "email" : "whatsapp")}
                  disabled={
                    sending ||
                    isLocked ||
                    resendLeft > 0 ||
                    (sentChannel === "whatsapp" && !result.channels.email)
                  }
                >
                  {sentChannel === "whatsapp"
                    ? "Não recebi — enviar por e-mail"
                    : "Não recebi — enviar por WhatsApp"}
                </Button>
              ) : null}
              {codeSent ? (
                <div className="flex items-end gap-2">
                  <div className="space-y-1">
                    <Label htmlFor="identificacao-codigo">Código</Label>
                    <Input
                      id="identificacao-codigo"
                      inputMode="numeric"
                      maxLength={6}
                      className="w-28 tracking-widest"
                      placeholder="000000"
                      value={code}
                      disabled={isLocked}
                    onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                    />
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => void verify()}
                    disabled={checking || code.length !== 6 || codeExpired || isLocked}
                  >
                    {checking ? "Confirmando…" : "Confirmar"}
                  </Button>
                </div>
              ) : null}
            </div>

            {feedback ? <p className="text-sm text-muted-foreground">{feedback}</p> : null}
            {codeSent && !codeExpired ? (
              <p className="text-sm text-muted-foreground">
                O código expira em <span className="font-medium text-foreground">{countdown}</span>.
              </p>
            ) : null}
            {codeExpired ? (
              <p className="text-sm text-destructive">
                Este código expirou. Toque em “Enviar outro código” para receber um novo.
              </p>
            ) : null}
            {isLocked ? (
              <p className="text-sm text-destructive">
                Confirmação bloqueada por segurança. Tente novamente em{" "}
                <span className="font-medium">{lockCountdown}</span>.
              </p>
            ) : null}
            {resendLeft > 0 && !isLocked ? (
              <p className="text-sm text-muted-foreground">
                Você pode pedir outro código em {resendLeft} segundo(s). O código anterior é
                cancelado assim que um novo é enviado.
              </p>
            ) : null}
            {codeError ? <p className="text-sm text-destructive">{codeError}</p> : null}
          </div>
        ) : null}

        {result?.found && !result.needsVerification && result.customer ? (
          <div className="space-y-3 rounded-xl border border-border/70 bg-card p-3">
            <p className="text-sm font-medium text-foreground">
              {`Telefone confirmado, ${result.customer.firstName}. Confira seus dados para continuar.`}
            </p>
            {result.customer.addresses.length > 0 ? (
              <div className="space-y-2">
                <Label>Endereço de entrega</Label>
                {result.customer.addresses.map((item) => (
                  <label
                    key={item.id}
                    className="flex cursor-pointer items-start gap-2 rounded-lg border border-border/70 p-2 text-sm"
                  >
                    <input
                      type="radio"
                      name="endereco-salvo"
                      className="mt-1"
                      checked={addressId === item.id}
                      onChange={() => setAddressId(item.id)}
                    />
                    <span className="text-muted-foreground">
                      {[item.street, item.number, item.district].filter(Boolean).join(", ") || "Endereço salvo"}
                      {item.isDefault ? <Badge className="ml-2" variant="secondary">Principal</Badge> : null}
                    </span>
                  </label>
                ))}
              </div>
            ) : null}
            <Button type="button" variant="outline" size="sm" onClick={confirm}>
              Usar estes dados
            </Button>
          </div>
        ) : null}

        {result?.valid && !result.found ? (
          <p className="text-sm text-muted-foreground">
            Não localizamos um cadastro com este telefone nesta loja. Continue preenchendo seus dados
            abaixo — leva menos de um minuto.
          </p>
        ) : null}

        {/* Aceites só aparecem para cliente novo: quem já pediu antes já confirmou. */}
        {!isReturning ? (
          <div className="space-y-2 text-sm">
            <label className="flex cursor-pointer items-start gap-2">
              <input
                type="checkbox"
                className="mt-1"
                checked={consent.acceptedTerms}
                onChange={(event) => onConsentChange({ ...consent, acceptedTerms: event.target.checked })}
              />
              <span className="text-muted-foreground">
                Li e aceito os{" "}
                <Link to="/termos" target="_blank" className="underline">Termos de Uso</Link> e a{" "}
                <Link to="/privacidade" target="_blank" className="underline">Política de Privacidade</Link>.
              </span>
            </label>
            {settings.allowQuickRegister ? (
              <label className="flex cursor-pointer items-start gap-2">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={consent.createProfile}
                  onChange={(event) => onConsentChange({ ...consent, createProfile: event.target.checked })}
                />
                <span className="text-muted-foreground">
                  Criar ou atualizar meu cadastro nesta loja para acompanhar pedidos e repetir compras.
                </span>
              </label>
            ) : null}
            <label className="flex cursor-pointer items-start gap-2">
              <input
                type="checkbox"
                className="mt-1"
                checked={consent.marketingOptIn}
                onChange={(event) => onConsentChange({ ...consent, marketingOptIn: event.target.checked })}
              />
              <span className="text-muted-foreground">
                Quero receber promoções e novidades desta loja (opcional, você pode sair quando quiser).
              </span>
            </label>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
