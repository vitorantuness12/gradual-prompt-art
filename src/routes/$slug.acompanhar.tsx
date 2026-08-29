import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";

import { DemoBadge } from "@/components/brand/DemoBadge";
import { PixPayment } from "@/components/store/PixPayment";
import { ReviewForm } from "@/components/store/ReviewForm";
import { useStoreDocumentTitle } from "@/hooks/useStoreDocumentTitle";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useOrderHistory } from "@/hooks/useCart";
import { ORDER_STATUS_LABEL, ORDER_TYPE_LABEL, formatCurrency, formatDateTime } from "@/lib/format";
import { customerTimeline, statusLabel } from "@/lib/orders";
import { publicStoreQuery } from "@/lib/store-queries";
import { CheckoutThemeProvider } from "@/components/store/CheckoutThemeProvider";
import { checkoutStatusClass } from "@/lib/checkout-theme";
import { trackOrder, type TrackedOrder } from "@/lib/tracking.functions";

export const Route = createFileRoute("/$slug/acompanhar")({
  validateSearch: (search: Record<string, unknown>) => ({
    codigo: typeof search['codigo'] === "string" ? (search['codigo'] as string) : undefined,
  }),
  head: ({ params }) => ({
    meta: [
      { title: `Acompanhar pedido — ${params.slug} | O Seu Pedido` },
      {
        name: "description",
        content: "Consulte a situação do seu pedido nesta loja informando o código e o telefone da compra.",
      },
      { property: "og:title", content: "Acompanhar pedido" },
      { property: "og:description", content: "Veja em que etapa está o seu pedido, em tempo real." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: StoreTrackPage,
});

function StoreTrackPage() {
  const { slug } = Route.useParams();
  const { codigo } = Route.useSearch();
  const { data } = useQuery(publicStoreQuery(slug));
  useStoreDocumentTitle(data?.store.name, "Acompanhar pedido");

  const track = useServerFn(trackOrder);
  const history = useOrderHistory(slug, data?.store.id ?? null);
  const [loading, setLoading] = useState(false);
  const [order, setOrder] = useState<TrackedOrder | null>(null);
  const [searched, setSearched] = useState(false);
  const [lastPhone, setLastPhone] = useState("");

  /** Consulta direta a partir do histórico local desta loja. */
  async function lookup(code: string, phone: string) {
    setLoading(true);
    try {
      const result = await track({ data: { code, phone } });
      setOrder(result.order);
      setLastPhone(phone);
      setSearched(true);
      if (!result.order) toast.error("Pedido não encontrado com esses dados.");
    } catch {
      toast.error("Não foi possível consultar o pedido agora.");
    } finally {
      setLoading(false);
    }
  }


  // Vindo do checkout (?codigo=...): consulta automática usando o telefone salvo neste navegador.
  useEffect(() => {
    if (!codigo || order || loading) return;
    const entry = history.find((item) => item.code === codigo);
    if (entry) void lookup(entry.code, entry.phone);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [codigo, history]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const code = String(form.get("code") ?? "").trim();
    const phone = String(form.get("phone") ?? "").trim();

    if (code.length < 4 || phone.length < 8) {
      toast.error("Informe o código do pedido e o telefone usado na compra.");
      return;
    }

    await lookup(code, phone);
  }

  const steps = customerTimeline(order?.type ?? "delivery");
  const currentStep = order ? steps.indexOf(order.status as (typeof steps)[number]) : -1;
  const finished = order ? ["cancelled", "rejected", "completed"].includes(order.status) : false;

  return (
    <CheckoutThemeProvider className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border/70 bg-card">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-5 sm:px-6">
          <span className="text-base font-semibold tracking-tight text-foreground">{data?.store.name ?? ""}</span>

          <Link
            to="/$slug"
            params={{ slug }}
            className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            Voltar ao catálogo
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl space-y-6 px-4 py-8 sm:px-6">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Acompanhar pedido {data?.store ? `— ${data.store.name}` : ""}
          </h1>
          {data?.store.is_demo ? <DemoBadge /> : null}
        </div>

        <Card className="border-border/70 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">Consultar situação</CardTitle>
            <CardDescription>Use o código recebido ao finalizar o pedido e o telefone informado.</CardDescription>
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
              <Button type="submit" disabled={loading}>
                {loading ? "Consultando..." : "Consultar"}
              </Button>
            </form>
          </CardContent>
        </Card>

        {history.length > 0 ? (
          <Card className="border-border/70">
            <CardHeader>
              <CardTitle className="text-base">Seus pedidos nesta loja</CardTitle>
              <CardDescription>Guardamos apenas neste navegador, separados por loja.</CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="divide-y divide-border text-sm">
                {history.map((entry) => (
                  <li key={entry.code} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <span className="font-medium text-foreground">
                      {entry.code} · {formatCurrency(entry.total)}
                    </span>
                    <span className="text-muted-foreground">{formatDateTime(entry.createdAt)}</span>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={loading}
                      onClick={() => void lookup(entry.code, entry.phone)}
                    >
                      Ver situação
                    </Button>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ) : null}

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
              <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded-full border px-3 py-1 text-xs font-medium ${checkoutStatusClass(order.status)}`}>
                  {statusLabel(order.status)}
                </span>
                <Button type="button" size="sm" variant="outline" disabled={loading} onClick={() => void lookup(order.code, lastPhone)}>
                  Atualizar
                </Button>
              </div>

              {order.paymentStatus !== "paid" &&
              (order.paymentMethod === "pix" || order.paymentMethod === "card_online") &&
              !["cancelled", "rejected"].includes(order.status) ? (
                <PixPayment
                  storeSlug={slug}
                  orderCode={order.code}
                  phone={lastPhone}
                  method={order.paymentMethod === "pix" ? "pix" : "card_online"}
                  total={order.total}
                  onPaid={() => void lookup(order.code, lastPhone)}
                />
              ) : null}



              {finished ? null : (
                <ol className="space-y-3">
                  {steps.map((step, index) => {
                    const done = currentStep >= index;
                    return (
                      <li key={step} className="flex items-center gap-3">
                        <span aria-hidden="true" className={`size-3 rounded-full ${done ? "bg-success" : "bg-muted"}`} />
                        <span className={done ? "text-sm font-medium text-foreground" : "text-sm text-muted-foreground"}>
                          {ORDER_STATUS_LABEL[step]}
                        </span>
                      </li>
                    );
                  })}
                </ol>
              )}

              {order.timeline.length > 0 ? (
                <div>
                  <h3 className="text-sm font-medium text-foreground">Histórico</h3>
                  <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                    {order.timeline.map((entry, index) => (
                      <li key={`${entry.status}-${index}`}>
                        {formatDateTime(entry.createdAt)} — {statusLabel(entry.status)}
                        {entry.reason ? ` (${entry.reason})` : ""}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <div>
                <h3 className="text-sm font-medium text-foreground">Itens</h3>
                <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                  {order.items.map((item, index) => (
                    <li key={`${item.name}-${index}`}>
                      {item.quantity}× {item.name} — {formatCurrency(item.total)}
                      {item.notes ? ` · ${item.notes}` : ""}
                    </li>
                  ))}
                </ul>
              </div>

              <dl className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Subtotal</dt>
                  <dd>{formatCurrency(order.subtotal)}</dd>
                </div>
                {order.discount > 0 ? (
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Desconto</dt>
                    <dd>−{formatCurrency(order.discount)}</dd>
                  </div>
                ) : null}
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

        {order && ["delivered", "completed", "picked_up", "paid"].includes(order.status) ? (
          <ReviewForm storeId={order.storeId} orderId={order.id} defaultName={order.customerName} />
        ) : null}
      </main>
    </CheckoutThemeProvider>
  );
}
