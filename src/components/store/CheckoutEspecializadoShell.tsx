import { Link } from "@tanstack/react-router";
import { ArrowLeft, CheckCircle2 } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CheckoutThemeProvider } from "@/components/store/CheckoutThemeProvider";
import { PAYMENT_METHOD_LABEL, type PaymentMethods } from "@/lib/store-config";
import { cn } from "@/lib/utils";

/**
 * Casca comum dos checkouts especializados (agendamento, digital e loja).
 * Mantém cabeçalho, tema padrão do fluxo de compra e os campos de contato
 * iguais nos três, para o cliente não reaprender a tela em cada segmento.
 */

export interface CustomerFormValue {
  name: string;
  phone: string;
  email: string;
  notes: string;
}

export const emptyCustomer: CustomerFormValue = { name: "", phone: "", email: "", notes: "" };

export function CheckoutShell({
  storeName,
  slug,
  title,
  description,
  children,
  aside,
}: {
  storeName: string;
  slug: string;
  title: string;
  description: string;
  children: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <CheckoutThemeProvider className="min-h-screen bg-background text-foreground">
      <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:py-10">
        <div className="mb-6 flex items-center gap-3">
          <Button asChild variant="ghost" size="icon" aria-label="Voltar para a loja">
            <Link to="/$slug" params={{ slug }}>
              <ArrowLeft className="size-4" />
            </Link>
          </Button>
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">{storeName}</p>
            <h1 className="text-xl font-semibold sm:text-2xl">{title}</h1>
            <p className="text-sm text-muted-foreground">{description}</p>
          </div>
        </div>
        <div className={cn("grid gap-6", aside ? "lg:grid-cols-[1fr_340px]" : "")}>
          <div className="space-y-4">{children}</div>
          {aside ? <div className="space-y-4 lg:sticky lg:top-6 lg:self-start">{aside}</div> : null}
        </div>
      </div>
    </CheckoutThemeProvider>
  );
}

/** Dados de contato usados nas confirmações por e-mail e WhatsApp. */
export function CustomerFields({
  value,
  onChange,
  requireEmail = false,
  notesLabel = "Observações (opcional)",
}: {
  value: CustomerFormValue;
  onChange: (next: CustomerFormValue) => void;
  requireEmail?: boolean;
  notesLabel?: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Seus dados</CardTitle>
        <CardDescription>
          {requireEmail
            ? "Usamos o e-mail para enviar o acesso e o WhatsApp para avisos."
            : "Usamos o WhatsApp para confirmar e avisar sobre o seu pedido."}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="ce-name">Nome completo</Label>
          <Input
            id="ce-name"
            value={value.name}
            autoComplete="name"
            onChange={(event) => onChange({ ...value, name: event.target.value })}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="ce-phone">WhatsApp</Label>
          <Input
            id="ce-phone"
            value={value.phone}
            inputMode="tel"
            autoComplete="tel"
            placeholder="(11) 99999-9999"
            onChange={(event) => onChange({ ...value, phone: event.target.value })}
          />
        </div>
        <div className="grid gap-1.5 sm:col-span-2">
          <Label htmlFor="ce-email">E-mail {requireEmail ? "" : "(opcional)"}</Label>
          <Input
            id="ce-email"
            type="email"
            value={value.email}
            autoComplete="email"
            onChange={(event) => onChange({ ...value, email: event.target.value })}
          />
        </div>
        <div className="grid gap-1.5 sm:col-span-2">
          <Label htmlFor="ce-notes">{notesLabel}</Label>
          <Textarea
            id="ce-notes"
            rows={2}
            value={value.notes}
            maxLength={500}
            onChange={(event) => onChange({ ...value, notes: event.target.value })}
          />
        </div>
      </CardContent>
    </Card>
  );
}

/** Seleção de forma de pagamento entre as habilitadas pela loja. */
export function PaymentChoice({
  methods,
  value,
  onChange,
  allow,
}: {
  methods: PaymentMethods;
  value: string;
  onChange: (method: string) => void;
  /** Restringe as opções (ex.: digital não aceita dinheiro). */
  allow?: readonly (keyof PaymentMethods)[];
}) {
  const options = (Object.keys(methods) as (keyof PaymentMethods)[]).filter(
    (key) => methods[key] && (!allow || allow.includes(key)),
  );

  if (options.length === 0) {
    return (
      <Card>
        <CardContent className="py-5 text-sm text-muted-foreground">
          A loja ainda não configurou formas de pagamento. Fale com a loja para concluir.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Pagamento</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-2 sm:grid-cols-2">
        {options.map((key) => {
          const active = value === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => onChange(key)}
              aria-pressed={active}
              className={cn(
                "flex items-center justify-between rounded-xl border px-4 py-3 text-left text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                active
                  ? "border-primary bg-primary/10 font-medium text-foreground"
                  : "border-border bg-card hover:border-primary/50",
              )}
            >
              <span>{PAYMENT_METHOD_LABEL[key]}</span>
              {active ? <CheckCircle2 className="size-4 text-primary" /> : null}
            </button>
          );
        })}
      </CardContent>
    </Card>
  );
}
