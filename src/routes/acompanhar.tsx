import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";

import { DemoBadge } from "@/components/brand/DemoBadge";
import { Logo } from "@/components/brand/Logo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ORDER_STATUS_LABEL, ORDER_TYPE_LABEL, formatCurrency, formatDateTime } from "@/lib/format";
import { maskPhone } from "@/lib/masks";
import {
  TRACK_STEPS,
  trackStepIndex,
  type OrderSummaryView,
  type TrackedOrderDetail,
} from "@/lib/acompanhamento";
import { CheckoutThemeProvider } from "@/components/store/CheckoutThemeProvider";
import {
  listOrdersByPhone,
  requestTrackingCode,
  trackByCode,
  trackByToken,
} from "@/lib/acompanhamento.functions";

export const Route = createFileRoute("/acompanhar")({
  validateSearch: (search: Record<string, unknown>) => ({
    codigo: typeof search["codigo"] === "string" ? (search["codigo"] as string) : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Acompanhar pedido — O Seu Pedido" },
      {
        name: "description",
        content:
          "Consulte seu pedido pelo número e telefone da compra, pelo telefone com código de verificação ou pelo código público do link.",
      },
      { property: "og:title", content: "Acompanhar pedido — O Seu Pedido" },
      { property: "og:description", content: "Veja em que etapa está o seu pedido em tempo real." },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://oseupedido.com.br/acompanhar" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: "https://oseupedido.com.br/acompanhar" }],
  }),
  component: TrackPage,
});

function TrackPage() {
  const { codigo } = Route.useSearch();
  const byCode = useServerFn(trackByCode);
  const byToken = useServerFn(trackByToken);
  const askCode = useServerFn(requestTrackingCode);
  const listByPhone = useServerFn(listOrdersByPhone);

  const [order, setOrder] = useState<TrackedOrderDetail | null>(null);
  const [summaries, setSummaries] = useState<OrderSummaryView[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [emptyMessage, setEmptyMessage] = useState("");

  // Consulta por número do pedido + telefone
  const [code, setCode] = useState("");
  const [codePhone, setCodePhone] = useState("");

  // Consulta por telefone com código de verificação
  const [phone, setPhone] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [verifyCode, setVerifyCode] = useState("");
  const [sending, setSending] = useState(false);

  // Consulta pelo código público do link
  const [token, setToken] = useState(codigo ?? "");

  const openToken = useCallback(
    async (value: string) => {
      setLoading(true);
      setEmptyMessage("");
      try {
        const result = await byToken({ data: { token: value } });
        setOrder(result.order);
        setSummaries(null);
        if (!result.ok) setEmptyMessage(result.message);
      } catch {
        setEmptyMessage("Não foi possível consultar o pedido agora.");
      } finally {
        setLoading(false);
      }
    },
    [byToken],
  );

  // Link compartilhado: abre o pedido automaticamente.
  useEffect(() => {
    if (codigo && codigo.length >= 8) void openToken(codigo);
  }, [codigo, openToken]);

  async function submitCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setEmptyMessage("");
    try {
      const result = await byCode({ data: { code, phone: codePhone } });
      setOrder(result.order);
      setSummaries(null);
      if (!result.ok) setEmptyMessage(result.message);
    } catch {
      setEmptyMessage("Não foi possível consultar o pedido agora.");
    } finally {
      setLoading(false);
    }
  }

  async function sendVerification(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSending(true);
    try {
      const result = await askCode({ data: { phone } });
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      setCodeSent(true);
      toast.success(result.message);
    } catch {
      toast.error("Não foi possível enviar o código agora.");
    } finally {
      setSending(false);
    }
  }

  async function confirmVerification(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setEmptyMessage("");
    try {
      const result = await listByPhone({ data: { phone, code: verifyCode } });
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      setOrder(null);
      setSummaries(result.orders);
      if (result.orders.length === 0) setEmptyMessage(result.message);
    } catch {
      setEmptyMessage("Não foi possível consultar seus pedidos agora.");
    } finally {
      setLoading(false);
    }
  }

  async function submitToken(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await openToken(token.trim());
  }

  return (
    <CheckoutThemeProvider className="min-h-screen bg-background text-foreground">
      <header className="mx-auto flex w-full max-w-3xl items-center justify-between gap-3 px-4 py-6 sm:px-6">
        <Link to="/" aria-label="Voltar para a página inicial">
          <Logo />
        </Link>
        <Button asChild variant="outline" size="sm">
          <Link to="/meus-pedidos">Área do cliente</Link>
        </Button>
      </header>

      <main className="mx-auto w-full max-w-3xl space-y-6 px-4 pb-16 sm:px-6">
        <Card className="border-border/70 shadow-sm">
          <CardHeader>
            <CardTitle className="text-xl">
              <h1 className="text-xl font-semibold">Acompanhar pedido</h1>
            </CardTitle>

            <CardDescription>
              Escolha como quer consultar: pelo número do pedido, pelo seu telefone ou pelo código
              público que a loja enviou no link.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue={codigo ? "token" : "code"}>
              <TabsList className="grid w-full grid-cols-1 gap-1 sm:grid-cols-3">
                <TabsTrigger value="code">Número do pedido</TabsTrigger>
                <TabsTrigger value="phone">Meu telefone</TabsTrigger>
                <TabsTrigger value="token">Código público</TabsTrigger>
              </TabsList>

              <TabsContent value="code" className="pt-4">
                <form onSubmit={submitCode} className="grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end" noValidate>
                  <div className="space-y-2">
                    <Label htmlFor="codigo-pedido">Número do pedido</Label>
                    <Input
                      id="codigo-pedido"
                      value={code}
                      onChange={(event) => setCode(event.target.value.toUpperCase())}
                      placeholder="Ex.: A1B2C3D4"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="telefone-pedido">Telefone da compra</Label>
                    <Input
                      id="telefone-pedido"
                      inputMode="tel"
                      value={maskPhone(codePhone)}
                      onChange={(event) => setCodePhone(maskPhone(event.target.value))}
                      placeholder="(00) 90000-0000"
                      required
                    />
                  </div>
                  <Button type="submit" disabled={loading}>
                    {loading ? "Consultando..." : "Consultar"}
                  </Button>
                </form>
                <p className="pt-3 text-xs text-muted-foreground">
                  Pedimos o telefone junto do número do pedido para garantir que só você veja seus dados.
                </p>
              </TabsContent>

              <TabsContent value="phone" className="space-y-4 pt-4">
                <form onSubmit={sendVerification} className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end" noValidate>
                  <div className="space-y-2">
                    <Label htmlFor="telefone-historico">Telefone usado nos pedidos</Label>
                    <Input
                      id="telefone-historico"
                      inputMode="tel"
                      value={maskPhone(phone)}
                      onChange={(event) => setPhone(maskPhone(event.target.value))}
                      placeholder="(00) 90000-0000"
                      required
                    />
                  </div>
                  <Button type="submit" variant={codeSent ? "outline" : "default"} disabled={sending}>
                    {sending ? "Enviando..." : codeSent ? "Enviar novo código" : "Enviar código"}
                  </Button>
                </form>

                {codeSent ? (
                  <form onSubmit={confirmVerification} className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end" noValidate>
                    <div className="space-y-2">
                      <Label htmlFor="codigo-verificacao">Código de 6 dígitos</Label>
                      <Input
                        id="codigo-verificacao"
                        inputMode="numeric"
                        maxLength={6}
                        value={verifyCode}
                        onChange={(event) => setVerifyCode(event.target.value.replace(/\D/g, ""))}
                        placeholder="000000"
                        required
                      />
                    </div>
                    <Button type="submit" disabled={loading}>
                      {loading ? "Verificando..." : "Ver meus pedidos"}
                    </Button>
                  </form>
                ) : null}

                <p className="text-xs text-muted-foreground">
                  Enviamos o código pelo WhatsApp da loja. Ele vale por 10 minutos e permite até 5 tentativas.
                </p>
              </TabsContent>

              <TabsContent value="token" className="pt-4">
                <form onSubmit={submitToken} className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end" noValidate>
                  <div className="space-y-2">
                    <Label htmlFor="codigo-publico">Código público do pedido</Label>
                    <Input
                      id="codigo-publico"
                      value={token}
                      onChange={(event) => setToken(event.target.value.trim())}
                      placeholder="Cole aqui o código do link recebido"
                      required
                    />
                  </div>
                  <Button type="submit" disabled={loading}>
                    {loading ? "Abrindo..." : "Abrir pedido"}
                  </Button>
                </form>
                <p className="pt-3 text-xs text-muted-foreground">
                  O código público vem no link enviado pela loja e pode expirar conforme a configuração da loja.
                </p>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        {emptyMessage ? (
          <Card className="border-border/70">
            <CardContent className="py-8 text-center text-sm text-muted-foreground">{emptyMessage}</CardContent>
          </Card>
        ) : null}

        {summaries && summaries.length > 0 ? (
          <Card className="border-border/70 shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg">Seus pedidos</CardTitle>
              <CardDescription>Toque em um pedido para ver a linha do tempo completa.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {summaries.map((item) => (
                <button
                  key={item.publicToken}
                  type="button"
                  onClick={() => void openToken(item.publicToken)}
                  className="flex w-full flex-wrap items-center justify-between gap-2 rounded-xl border border-border px-4 py-3 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className="space-y-1">
                    <span className="block text-sm font-medium text-foreground">
                      Pedido {item.code} · {item.storeName}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {formatDateTime(item.createdAt)} · {ORDER_TYPE_LABEL[item.type] ?? item.type}
                    </span>
                  </span>
                  <span className="flex items-center gap-2">
                    <Badge variant="secondary">{ORDER_STATUS_LABEL[item.status] ?? item.status}</Badge>
                    <span className="text-sm font-semibold">{formatCurrency(item.total)}</span>
                  </span>
                </button>
              ))}
            </CardContent>
          </Card>
        ) : null}

        {order ? <OrderDetail order={order} /> : null}
      </main>
    </CheckoutThemeProvider>
  );
}

interface OrderDetailProps {
  order: TrackedOrderDetail;
}

function OrderDetail({ order }: OrderDetailProps) {
  const currentStep = trackStepIndex(order.status);
  const cancelled = order.status === "cancelled" || order.status === "rejected";

  return (
    <Card className="border-border/70 shadow-sm">
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle className="text-lg">Pedido {order.code}</CardTitle>
          {order.isDemo ? <DemoBadge /> : null}
          <Badge variant={cancelled ? "destructive" : "secondary"}>
            {ORDER_STATUS_LABEL[order.status] ?? order.status}
          </Badge>
        </div>
        <CardDescription>
          {order.storeName} · {ORDER_TYPE_LABEL[order.type] ?? order.type} · {formatDateTime(order.createdAt)}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {cancelled ? (
          <p className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            Este pedido foi encerrado sem conclusão. Fale com a loja se precisar de ajuda.
          </p>
        ) : (
          <ol className="space-y-3">
            {TRACK_STEPS.map((step, index) => {
              const done = currentStep >= index;
              const at = order.timeline.find((entry) => entry.status === step);
              return (
                <li key={step} className="flex items-center gap-3">
                  <span aria-hidden="true" className={`size-3 rounded-full ${done ? "bg-success" : "bg-muted"}`} />
                  <span className={done ? "text-sm font-medium text-foreground" : "text-sm text-muted-foreground"}>
                    {ORDER_STATUS_LABEL[step]}
                    {at ? <span className="ml-2 text-xs text-muted-foreground">{formatDateTime(at.createdAt)}</span> : null}
                  </span>
                </li>
              );
            })}
          </ol>
        )}

        <div className="rounded-xl border border-border">
          <table className="w-full text-sm">
            <caption className="sr-only">Itens do pedido</caption>
            <tbody>
              {order.items.map((item, index) => (
                <tr key={`${item.name}-${index}`} className="border-b border-border last:border-0">
                  <td className="px-3 py-2">
                    {item.quantity}× {item.name}
                    {item.notes ? <span className="block text-xs text-muted-foreground">{item.notes}</span> : null}
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
          {order.discount > 0 ? (
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Desconto</dt>
              <dd>-{formatCurrency(order.discount)}</dd>
            </div>
          ) : null}
          <div className="flex justify-between text-base font-semibold">
            <dt>Total</dt>
            <dd>{formatCurrency(order.total)}</dd>
          </div>
        </dl>

        {order.storeSlug ? (
          <Button asChild variant="outline">
            <Link to="/$slug" params={{ slug: order.storeSlug }}>
              Ver o catálogo de {order.storeName}
            </Link>
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}
