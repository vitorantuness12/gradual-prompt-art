import { useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { CalendarDays, Clock, Loader2, UserRound } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import {
  CheckoutShell,
  CustomerFields,
  PaymentChoice,
  emptyCustomer,
  type CustomerFormValue,
} from "@/components/store/CheckoutEspecializadoShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { getAgendaOptions, getAgendaSlots, submitAgendamento } from "@/lib/checkout-especializado.functions";
import { formatCurrency } from "@/lib/format";
import { normalizePhoneBR } from "@/lib/phone";
import { parsePaymentMethods } from "@/lib/store-config";
import { publicStoreQuery } from "@/lib/store-queries";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/$slug/checkout_/agendamento")({
  head: () => ({
    meta: [
      { title: "Agendar atendimento — O Seu Pedido" },
      {
        name: "description",
        content: "Escolha o serviço, o profissional, a data e o horário disponível e confirme seu agendamento.",
      },
      { property: "og:title", content: "Agendar atendimento" },
      { property: "og:description", content: "Agende com disponibilidade real, confirmada na hora." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AgendamentoCheckout,
});

function todayISO(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function AgendamentoCheckout() {
  const { slug } = Route.useParams();
  const navigate = useNavigate();

  const store = useQuery(publicStoreQuery(slug));
  const loadOptions = useServerFn(getAgendaOptions);
  const loadSlots = useServerFn(getAgendaSlots);
  const send = useServerFn(submitAgendamento);

  const options = useQuery({
    queryKey: ["agenda-options", slug],
    queryFn: () => loadOptions({ data: { slug } }),
  });

  const [serviceId, setServiceId] = useState("");
  const [professionalId, setProfessionalId] = useState("");
  const [unitId, setUnitId] = useState("");
  const [date, setDate] = useState(todayISO());
  const [startsAt, setStartsAt] = useState("");
  const [customer, setCustomer] = useState<CustomerFormValue>(emptyCustomer);
  const [payment, setPayment] = useState("");
  const [saving, setSaving] = useState(false);

  const service = useMemo(
    () => options.data?.services.find((item) => item.id === serviceId) ?? null,
    [options.data, serviceId],
  );

  // Profissionais que realmente atendem o serviço escolhido.
  const professionals = useMemo(() => {
    if (!options.data) return [];
    if (!service || service.professionalIds.length === 0) return options.data.professionals;
    return options.data.professionals.filter((item) => service.professionalIds.includes(item.id));
  }, [options.data, service]);

  const slots = useQuery({
    queryKey: ["agenda-slots", slug, serviceId, professionalId, date],
    enabled: Boolean(serviceId && date),
    queryFn: () =>
      loadSlots({
        data: { slug, productId: serviceId, professionalId: professionalId || null, date },
      }),
  });

  const methods = parsePaymentMethods(store.data?.store.payment_methods);

  const deposit = useMemo(() => {
    const config = options.data?.config;
    if (!service || !config?.require_deposit) return 0;
    return Math.round(service.price * (Math.min(100, Math.max(0, config.deposit_percent)) / 100) * 100) / 100;
  }, [options.data, service]);

  async function confirm() {
    if (!service) {
      toast.error("Escolha o serviço.");
      return;
    }
    if (!startsAt) {
      toast.error("Escolha um horário disponível.");
      return;
    }
    if (customer.name.trim().length < 3) {
      toast.error("Informe seu nome completo.");
      return;
    }
    const phone = normalizePhoneBR(customer.phone);
    if (!phone.ok) {
      toast.error(phone.message);
      return;
    }
    if (!payment) {
      toast.error("Escolha a forma de pagamento.");
      return;
    }

    setSaving(true);
    try {
      const result = await send({
        data: {
          slug,
          productId: service.id,
          professionalId: professionalId || null,
          unitId: unitId || null,
          startsAt,
          paymentMethod: payment,
          name: customer.name.trim(),
          phone: phone.e164,
          email: customer.email.trim() || null,
          notes: customer.notes.trim() || null,
        },
      });
      if (!result.ok) {
        toast.error(result.message);
        // O horário pode ter sido tomado por outra pessoa: recarrega a agenda.
        await slots.refetch();
        setStartsAt("");
        return;
      }
      toast.success(result.message);
      void navigate({
        to: "/$slug/acompanhar",
        params: { slug },
        search: { codigo: result.code },
      });
    } catch {
      toast.error("Não foi possível concluir o agendamento agora.");
    } finally {
      setSaving(false);
    }
  }

  if (store.isLoading || options.isLoading) {
    return (
      <div className="mx-auto max-w-3xl space-y-4 p-6">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  const data = options.data;
  if (!store.data || !data) {
    return (
      <div className="mx-auto max-w-xl p-8 text-center text-sm text-muted-foreground">
        Não encontramos esta loja ou ela não está aceitando agendamentos.
      </div>
    );
  }

  if (data.services.length === 0) {
    return (
      <CheckoutShell
        storeName={data.storeName}
        slug={slug}
        title="Agendar atendimento"
        description="Serviços indisponíveis no momento."
      >
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            Esta loja ainda não publicou serviços para agendamento.
          </CardContent>
        </Card>
      </CheckoutShell>
    );
  }

  return (
    <CheckoutShell
      storeName={data.storeName}
      slug={slug}
      title="Agendar atendimento"
      description="Disponibilidade confirmada no momento do agendamento."
      aside={
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Resumo</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Serviço</span>
              <span className="text-right font-medium">{service?.name ?? "—"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Duração</span>
              <span>{service ? `${service.durationMinutes} min` : "—"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Horário</span>
              <span>
                {startsAt
                  ? new Date(startsAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })
                  : "—"}
              </span>
            </div>
            <div className="flex justify-between border-t border-border pt-2 text-base font-semibold">
              <span>Valor</span>
              <span className="text-primary">{formatCurrency(service?.price ?? 0)}</span>
            </div>
            {deposit > 0 ? (
              <p className="rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
                Sinal de {formatCurrency(deposit)} para confirmar o horário.
              </p>
            ) : null}
            {data.cancellationPolicy ? (
              <p className="text-xs text-muted-foreground">{data.cancellationPolicy}</p>
            ) : null}
            <Button className="w-full" onClick={confirm} disabled={saving}>
              {saving ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
              Confirmar agendamento
            </Button>
          </CardContent>
        </Card>
      }
    >
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Serviço</CardTitle>
          <CardDescription>Escolha o atendimento desejado.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2 sm:grid-cols-2">
          {data.services.map((item) => {
            const active = item.id === serviceId;
            return (
              <button
                key={item.id}
                type="button"
                aria-pressed={active}
                onClick={() => {
                  setServiceId(item.id);
                  setProfessionalId("");
                  setStartsAt("");
                }}
                className={cn(
                  "rounded-xl border px-4 py-3 text-left text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  active ? "border-primary bg-primary/10" : "border-border bg-card hover:border-primary/50",
                )}
              >
                <span className="block font-medium">{item.name}</span>
                <span className="text-xs text-muted-foreground">
                  {item.durationMinutes} min · {formatCurrency(item.price)}
                </span>
              </button>
            );
          })}
        </CardContent>
      </Card>

      {professionals.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <UserRound className="size-4" /> Profissional
            </CardTitle>
            <CardDescription>Opcional: sem escolha, encaixamos em quem estiver livre.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2 sm:grid-cols-2">
            <button
              type="button"
              aria-pressed={professionalId === ""}
              onClick={() => {
                setProfessionalId("");
                setStartsAt("");
              }}
              className={cn(
                "rounded-xl border px-4 py-3 text-left text-sm transition",
                professionalId === "" ? "border-primary bg-primary/10" : "border-border bg-card",
              )}
            >
              Qualquer profissional
            </button>
            {professionals.map((item) => (
              <button
                key={item.id}
                type="button"
                aria-pressed={professionalId === item.id}
                onClick={() => {
                  setProfessionalId(item.id);
                  setStartsAt("");
                }}
                className={cn(
                  "rounded-xl border px-4 py-3 text-left text-sm transition",
                  professionalId === item.id ? "border-primary bg-primary/10" : "border-border bg-card",
                )}
              >
                <span className="block font-medium">{item.name}</span>
                {item.roleTitle ? (
                  <span className="text-xs text-muted-foreground">{item.roleTitle}</span>
                ) : null}
              </button>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {data.units.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Unidade</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2 sm:grid-cols-2">
            {data.units.map((item) => (
              <button
                key={item.id}
                type="button"
                aria-pressed={unitId === item.id}
                onClick={() => setUnitId(item.id)}
                className={cn(
                  "rounded-xl border px-4 py-3 text-left text-sm transition",
                  unitId === item.id ? "border-primary bg-primary/10" : "border-border bg-card",
                )}
              >
                {item.name}
              </button>
            ))}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <CalendarDays className="size-4" /> Data e horário
          </CardTitle>
          <CardDescription>Mostramos apenas horários realmente livres.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid max-w-xs gap-1.5">
            <Label htmlFor="agenda-date">Dia</Label>
            <Input
              id="agenda-date"
              type="date"
              min={todayISO()}
              value={date}
              onChange={(event) => {
                setDate(event.target.value);
                setStartsAt("");
              }}
            />
          </div>

          {!serviceId ? (
            <p className="text-sm text-muted-foreground">Escolha um serviço para ver os horários.</p>
          ) : slots.isLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Consultando disponibilidade…
            </div>
          ) : (slots.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Sem horários livres nesse dia. Tente outra data ou outro profissional.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {(slots.data ?? []).map((slot) => (
                <button
                  key={slot.startsAt}
                  type="button"
                  aria-pressed={startsAt === slot.startsAt}
                  onClick={() => setStartsAt(slot.startsAt)}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm transition",
                    startsAt === slot.startsAt
                      ? "border-primary bg-primary/10 font-medium"
                      : "border-border bg-card hover:border-primary/50",
                  )}
                >
                  <Clock className="size-3.5" />
                  {slot.label}
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <CustomerFields value={customer} onChange={setCustomer} notesLabel="Alguma observação para o atendimento?" />
      <PaymentChoice methods={methods} value={payment} onChange={setPayment} />
    </CheckoutShell>
  );
}
