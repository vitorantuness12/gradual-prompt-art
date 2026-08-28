import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  identifyPhone,
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
  const [result, setResult] = useState<IdentifyResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [addressId, setAddressId] = useState<string | null>(null);

  async function identify() {
    setLoading(true);
    try {
      const found = await lookup({ data: { storeSlug: slug, phone } });
      setResult(found);
      const first = found.customer?.addresses.find((item) => item.isDefault) ?? found.customer?.addresses[0] ?? null;
      setAddressId(first?.id ?? null);
    } catch {
      setResult(null);
    } finally {
      setLoading(false);
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

        {result?.found && result.customer ? (
          <div className="space-y-3 rounded-xl border border-border/70 bg-card p-3">
            <p className="text-sm font-medium text-foreground">
              {result.needsVerification
                ? "Encontramos um cadastro. Confirme o código enviado para liberar seus dados."
                : `Encontramos seus dados, ${result.customer.firstName}. Confirme para continuar.`}
            </p>
            {!result.needsVerification && result.customer.addresses.length > 0 ? (
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
            {!result.needsVerification ? (
              <Button type="button" variant="outline" size="sm" onClick={confirm}>
                Usar estes dados
              </Button>
            ) : null}
          </div>
        ) : null}

        {result?.valid && !result.found ? (
          <p className="text-sm text-muted-foreground">
            Não localizamos um cadastro com este telefone nesta loja. Continue preenchendo seus dados
            abaixo — leva menos de um minuto.
          </p>
        ) : null}

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
      </CardContent>
    </Card>
  );
}
