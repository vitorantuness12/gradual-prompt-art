import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { CustomerOrderCard } from "@/components/cliente/CustomerOrderCard";
import { NotificationPrefsCard } from "@/components/cliente/NotificationPrefsCard";
import { PhoneLoginCard } from "@/components/cliente/PhoneLoginCard";
import { Logo } from "@/components/brand/Logo";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { buildLineId, seedCart, type CartItem } from "@/hooks/useCart";
import {
  customerHistory,
  prepareCustomerRepeat,
  type CustomerHistory,
  type RepeatPrepared,
} from "@/lib/cliente.functions";
import { formatCurrency } from "@/lib/format";

const SESSION_KEY = "seu-pedido:cliente-sessao";

export const Route = createFileRoute("/meus-pedidos")({
  head: () => ({
    meta: [
      { title: "Meus pedidos — área do cliente | O Seu Pedido" },
      {
        name: "description",
        content:
          "Entre com seu telefone para ver o histórico de pedidos, repetir uma compra em segundos e acompanhar tudo em tempo real.",
      },
      { property: "og:title", content: "Meus pedidos — área do cliente" },
      {
        property: "og:description",
        content: "Histórico, repetição de pedidos e acompanhamento ao vivo com login por telefone.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://oseupedido.com.br/meus-pedidos" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: "https://oseupedido.com.br/meus-pedidos" }],
  }),
  component: CustomerAreaPage,
});

type OrderRow = CustomerHistory["orders"][number];

function CustomerAreaPage() {
  const navigate = useNavigate();
  const fetchHistory = useServerFn(customerHistory);
  const prepareRepeat = useServerFn(prepareCustomerRepeat);

  const [session, setSession] = useState<string | null>(null);
  const [phoneMasked, setPhoneMasked] = useState("");
  const [repeat, setRepeat] = useState<(RepeatPrepared & { orderCode: string }) | null>(null);
  const [repeating, setRepeating] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = window.sessionStorage.getItem(SESSION_KEY);
    if (raw) setSession(raw);
  }, []);

  const history = useQuery({
    queryKey: ["cliente-historico", session],
    queryFn: () => fetchHistory({ data: { session: session as string } }),
    enabled: Boolean(session),
  });

  const signIn = useCallback((token: string, masked: string) => {
    setSession(token);
    setPhoneMasked(masked);
    if (typeof window !== "undefined") window.sessionStorage.setItem(SESSION_KEY, token);
  }, []);

  function signOut() {
    setSession(null);
    if (typeof window !== "undefined") window.sessionStorage.removeItem(SESSION_KEY);
  }

  async function openRepeat(order: OrderRow) {
    if (!session) return;
    setRepeating(true);
    try {
      const result = await prepareRepeat({ data: { session, orderId: order.id } });
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      setRepeat({ ...result, orderCode: order.code });
    } catch {
      toast.error("Não foi possível montar a repetição agora.");
    } finally {
      setRepeating(false);
    }
  }

  function confirmRepeat() {
    if (!repeat) return;
    const usable = repeat.lines.filter(
      (line) => line.issue !== "unavailable" && line.issue !== "removed",
    );
    if (usable.length === 0) {
      toast.error("Nenhum item deste pedido está disponível hoje.");
      return;
    }
    const items: CartItem[] = usable.map((line) => ({
      lineId: buildLineId({ productId: line.productId, options: line.options, notes: line.notes }),
      productId: line.productId,
      name: line.name,
      unitPrice: line.currentPrice,
      quantity: line.quantity,
      options: line.options,
      notes: line.notes,
      maxQuantity: line.maxQuantity,
    }));
    seedCart(repeat.storeSlug, repeat.storeId, items);
    setRepeat(null);
    void navigate({ to: "/$slug/checkout", params: { slug: repeat.storeSlug } });
  }

  const sessionExpired = Boolean(session) && history.data?.ok === false;
  useEffect(() => {
    if (sessionExpired) signOut();
  }, [sessionExpired]);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-4">
          <Link to="/" aria-label="Página inicial do O Seu Pedido">
            <Logo className="h-8 w-auto" />
          </Link>
          {session ? (
            <Button variant="ghost" size="sm" onClick={signOut}>
              Sair
            </Button>
          ) : (
            <Button asChild variant="ghost" size="sm">
              <Link to="/acompanhar" search={{ codigo: undefined }}>Acompanhar por código</Link>
            </Button>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-6 px-4 py-8">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold text-foreground">Meus pedidos</h1>
          <p className="text-sm text-muted-foreground">
            Histórico de todas as lojas onde você comprou com este telefone, com repetição de pedido
            e acompanhamento ao vivo.
            {phoneMasked ? ` Telefone confirmado: ${phoneMasked}.` : ""}
          </p>
        </div>

        {!session ? (
          <PhoneLoginCard onSession={signIn} />
        ) : history.isPending ? (
          <div className="space-y-3">
            <Skeleton className="h-28 w-full" />
            <Skeleton className="h-28 w-full" />
          </div>
        ) : (
          <div className="space-y-6">
            {history.data?.orders.length ? (
              <div className="space-y-3">
                {history.data.orders.map((order) => (
                  <CustomerOrderCard
                    key={order.id}
                    order={order}
                    session={session}
                    onRepeat={openRepeat}
                    repeating={repeating}
                  />
                ))}
              </div>
            ) : (
              <Card className="border-border/70">
                <CardHeader>
                  <CardTitle className="text-base">Nenhum pedido por aqui</CardTitle>
                  <CardDescription>
                    {history.data?.message ?? "Ainda não encontramos pedidos para este telefone."}
                  </CardDescription>
                </CardHeader>
              </Card>
            )}

            <NotificationPrefsCard
              session={session}
              stores={history.data?.stores ?? []}
              onSaved={() => void history.refetch()}
            />
          </div>
        )}
      </main>

      <Dialog open={Boolean(repeat)} onOpenChange={(open) => (open ? null : setRepeat(null))}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Repetir o pedido {repeat?.orderCode}</DialogTitle>
            <DialogDescription>
              Confira os itens com os preços de hoje. Nada vai para o carrinho antes de você
              confirmar.
            </DialogDescription>
          </DialogHeader>

          <ul className="space-y-2">
            {(repeat?.lines ?? []).map((line, index) => (
              <li
                key={`${line.productId}-${index}`}
                className="rounded-xl border border-border px-3 py-2 text-sm"
              >
                <div className="flex justify-between gap-3">
                  <span className="font-medium">
                    {line.quantity}× {line.name}
                  </span>
                  <span>{formatCurrency(line.currentPrice * line.quantity)}</span>
                </div>
                {line.message ? (
                  <p
                    className={
                      line.issue === "unavailable" || line.issue === "removed"
                        ? "mt-1 text-xs text-destructive"
                        : "mt-1 text-xs text-muted-foreground"
                    }
                  >
                    {line.message}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>

          <div className="flex justify-between border-t border-border pt-3 text-sm font-semibold">
            <span>Total estimado</span>
            <span>{formatCurrency(repeat?.total ?? 0)}</span>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setRepeat(null)}>
              Cancelar
            </Button>
            <Button onClick={confirmRepeat}>Colocar no carrinho e ir ao checkout</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
