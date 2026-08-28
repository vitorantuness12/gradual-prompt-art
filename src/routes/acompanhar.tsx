import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";

import { DemoBadge } from "@/components/brand/DemoBadge";
import { Logo } from "@/components/brand/Logo";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ORDER_STATUS_LABEL, ORDER_TYPE_LABEL, formatCurrency, formatDateTime } from "@/lib/format";
import { trackOrder, type TrackedOrder } from "@/lib/tracking.functions";

export const Route = createFileRoute("/acompanhar")({
  head: () => ({
    meta: [
      { title: "Acompanhar pedido — O Seu Pedido" },
      {
        name: "description",
        content: "Consulte a situação do seu pedido informando o código recebido e o telefone usado na compra.",
      },
      { property: "og:title", content: "Acompanhar pedido — O Seu Pedido" },
      { property: "og:description", content: "Veja em que etapa está o seu pedido em tempo real." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: TrackPage,
});

const STEPS = ["pending", "confirmed", "preparing", "ready", "out_for_delivery", "delivered"] as const;

function TrackPage() {
  const track = useServerFn(trackOrder);
  const [loading, setLoading] = useState(false);
  const [order, setOrder] = useState<TrackedOrder | null>(null);
  const [searched, setSearched] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const code = String(form.get("code") ?? "").trim();
    const phone = String(form.get("phone") ?? "").trim();

    if (code.length < 4 || phone.length < 8) {
      toast.error("Informe o código do pedido e o telefone usado na compra.");
      return;
    }

    setLoading(true);
    try {
      const result = await track({ data: { code, phone } });
      setOrder(result.order);
      setSearched(true);
      if (!result.order) toast.error("Pedido não encontrado com esses dados.");
    } catch {
      toast.error("Não foi possível consultar o pedido agora.");
    } finally {
      setLoading(false);
    }
  }

  const currentStep = order ? STEPS.indexOf(order.status as (typeof STEPS)[number]) : -1;

  return (
    <div className="min-h-screen bg-secondary/40">
      <header className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6">
        <Link to="/" aria-label="Voltar para a página inicial">
          <Logo />
        </Link>
      </header>

      <main className="mx-auto w-full max-w-3xl space-y-6 px-4 pb-16 sm:px-6">
        <Card className="border-border/70 shadow-sm">
          <CardHeader>
            <CardTitle className="text-xl">
              <h1 className="text-xl font-semibold">Acompanhar pedido</h1>
            </CardTitle>
            <CardDescription>
              Informe o código do pedido e o telefone usado na compra para ver a situação atual.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end" noValidate>
              <div className="space-y-2">
                <Label htmlFor="codigo">Código do pedido</Label>
                <Input id="codigo" name="code" placeholder="Ex.: A1B2C3D4" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="telefone">Telefone</Label>
                <Input id="telefone" name="phone" inputMode="tel" placeholder="(00) 90000-0000" required />
              </div>
              <Button type="submit" disabled={loading} className="sm:mb-0">
                {loading ? "Consultando..." : "Consultar"}
              </Button>
            </form>
          </CardContent>
        </Card>

        {searched && !order ? (
          <Card className="border-border/70">
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              Nenhum pedido encontrado. Verifique o código e o telefone informados.
            </CardContent>
          </Card>
        ) : null}

        {order ? (
          <Card className="border-border/70 shadow-sm">
            <CardHeader>
              <div className="flex flex-wrap items-center gap-2">
                <CardTitle className="text-lg">Pedido {order.code}</CardTitle>
                {order.isDemo ? <DemoBadge /> : null}
              </div>
              <CardDescription>
                {order.storeName} · {ORDER_TYPE_LABEL[order.type] ?? order.type} · {formatDateTime(order.createdAt)}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <ol className="space-y-3">
                {STEPS.map((step, index) => {
                  const done = currentStep >= index;
                  return (
                    <li key={step} className="flex items-center gap-3">
                      <span
                        aria-hidden="true"
                        className={`size-3 rounded-full ${done ? "bg-success" : "bg-muted"}`}
                      />
                      <span className={done ? "text-sm font-medium text-foreground" : "text-sm text-muted-foreground"}>
                        {ORDER_STATUS_LABEL[step]}
                      </span>
                    </li>
                  );
                })}
              </ol>

              <div className="rounded-xl border border-border">
                <table className="w-full text-sm">
                  <caption className="sr-only">Itens do pedido</caption>
                  <tbody>
                    {order.items.map((item, index) => (
                      <tr key={`${item.name}-${index}`} className="border-b border-border last:border-0">
                        <td className="px-3 py-2">
                          {item.quantity}× {item.name}
                        </td>
                        <td className="px-3 py-2 text-right">{formatCurrency(item.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <dl className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Subtotal</dt>
                  <dd>{formatCurrency(order.subtotal)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Entrega</dt>
                  <dd>{formatCurrency(order.deliveryFee)}</dd>
                </div>
                <div className="flex justify-between text-base font-semibold">
                  <dt>Total</dt>
                  <dd>{formatCurrency(order.total)}</dd>
                </div>
              </dl>
            </CardContent>
          </Card>
        ) : null}
      </main>
    </div>
  );
}
