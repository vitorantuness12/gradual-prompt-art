import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Minus, Plus, ShoppingBag, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { CheckoutThemeProvider } from "@/components/store/CheckoutThemeProvider";
import { useCart } from "@/hooks/useCart";
import { useStoreDocumentTitle } from "@/hooks/useStoreDocumentTitle";
import { formatCurrency } from "@/lib/format";
import { publicStoreQuery } from "@/lib/store-queries";
import { storeAvailability } from "@/lib/store-config";

export const Route = createFileRoute("/$slug/carrinho")({
  head: ({ params }) => ({
    meta: [
      { title: `Carrinho — ${params.slug} | O Seu Pedido` },
      {
        name: "description",
        content: "Confira os itens do seu carrinho, ajuste quantidades e siga para finalizar o pedido.",
      },
      { property: "og:title", content: "Carrinho de compras" },
      { property: "og:description", content: "Revise tudo o que você adicionou antes de finalizar o pedido." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: StoreCartPage,
});

/** Página de conferência do carrinho, entre o catálogo e o checkout. */
function StoreCartPage() {
  const { slug } = Route.useParams();
  const { data, isLoading } = useQuery(publicStoreQuery(slug));
  const store = data?.store ?? null;
  useStoreDocumentTitle(store?.name, "Carrinho");

  const cart = useCart(slug, store?.id ?? null);
  const availability = store ? storeAvailability(store) : null;
  const canCheckout = Boolean(availability?.accepting) && cart.count > 0;

  if (isLoading) {
    return (
      <CheckoutThemeProvider className="min-h-screen bg-background text-foreground">
        <div className="mx-auto max-w-3xl space-y-4 px-4 py-10 sm:px-6">
          <Skeleton className="h-24 w-full rounded-2xl" />
          <Skeleton className="h-64 w-full rounded-2xl" />
        </div>
      </CheckoutThemeProvider>
    );
  }

  if (!store) {
    return (
      <CheckoutThemeProvider className="min-h-screen bg-background text-foreground">
        <div className="mx-auto max-w-xl px-4 py-20 text-center sm:px-6">
          <h1 className="text-2xl font-semibold text-foreground">Loja não encontrada</h1>
          <Button asChild className="mt-6">
            <Link to="/">Voltar ao início</Link>
          </Button>
        </div>
      </CheckoutThemeProvider>
    );
  }

  return (
    <CheckoutThemeProvider className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border/70 bg-card">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-5 sm:px-6">
          <span className="text-base font-semibold tracking-tight text-foreground">{store.name}</span>
          <Link
            to="/$slug"
            params={{ slug }}
            className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            Voltar ao catálogo
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-6 px-4 py-8 pb-32 sm:px-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Seu carrinho</h1>
          <p className="text-sm text-muted-foreground">
            Confira os itens, ajuste as quantidades e siga para o pagamento.
          </p>
        </div>

        {!cart.hydrated ? (
          <Skeleton className="h-56 w-full rounded-2xl" />
        ) : cart.items.length === 0 ? (
          <Card className="border-border/70 shadow-sm">
            <CardContent className="flex flex-col items-center gap-4 py-14 text-center">
              <span className="flex size-14 items-center justify-center rounded-full bg-muted">
                <ShoppingBag className="size-6 text-muted-foreground" aria-hidden="true" />
              </span>
              <div>
                <p className="text-base font-medium text-foreground">Seu carrinho está vazio</p>
                <p className="text-sm text-muted-foreground">Escolha os produtos no catálogo para começar.</p>
              </div>
              <Button asChild>
                <Link to="/$slug" params={{ slug }}>
                  Ver produtos
                </Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <>
            <Card className="border-border/70 shadow-sm">
              <CardHeader>
                <CardTitle className="text-lg">
                  {cart.count} {cart.count === 1 ? "item" : "itens"}
                </CardTitle>
                <CardDescription>Você pode alterar quantidades ou remover itens aqui.</CardDescription>
              </CardHeader>
              <CardContent className="divide-y divide-border/70 p-0">
                {cart.items.map((item) => {
                  const atLimit = item.maxQuantity ? item.quantity >= item.maxQuantity : false;
                  return (
                    <div key={item.lineId} className="flex flex-wrap items-start gap-4 px-6 py-4">
                      <div className="min-w-0 flex-1 space-y-1">
                        <p className="text-sm font-medium text-foreground">
                          {item.name}
                          {item.variantName ? ` · ${item.variantName}` : ""}
                        </p>

                        {item.options && item.options.length > 0 ? (
                          <ul className="space-y-0.5 text-xs text-muted-foreground">
                            {item.options.map((option, index) => (
                              <li key={`${option.groupName}-${option.optionName}-${index}`}>
                                {option.groupName}: {option.optionName}
                                {option.priceDelta ? ` (+${formatCurrency(option.priceDelta)})` : ""}
                              </li>
                            ))}
                          </ul>
                        ) : null}

                        {item.notes ? (
                          <p className="text-xs text-muted-foreground">Observação: {item.notes}</p>
                        ) : null}

                        <p className="text-xs text-muted-foreground">
                          {formatCurrency(item.unitPrice)} cada
                        </p>
                        {atLimit ? (
                          <p className="text-xs text-[color:var(--checkout-warning)]">
                            Quantidade máxima disponível em estoque.
                          </p>
                        ) : null}
                      </div>

                      <div className="flex items-center gap-3">
                        <div className="flex items-center gap-1 rounded-full border border-border bg-muted/60 p-1">
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="size-8 rounded-full"
                            aria-label={`Diminuir quantidade de ${item.name}`}
                            onClick={() => cart.setQuantity(item.lineId, item.quantity - 1)}
                          >
                            <Minus className="size-4" aria-hidden="true" />
                          </Button>
                          <span className="min-w-6 text-center text-sm font-medium text-foreground">
                            {item.quantity}
                          </span>
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="size-8 rounded-full"
                            disabled={atLimit}
                            aria-label={`Aumentar quantidade de ${item.name}`}
                            onClick={() => cart.setQuantity(item.lineId, item.quantity + 1)}
                          >
                            <Plus className="size-4" aria-hidden="true" />
                          </Button>
                        </div>

                        <div className="text-right">
                          <p className="text-sm font-semibold text-foreground">
                            {formatCurrency(item.unitPrice * item.quantity)}
                          </p>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            className="h-auto px-1 py-0 text-xs text-muted-foreground hover:text-destructive"
                            onClick={() => cart.remove(item.lineId)}
                          >
                            <Trash2 className="mr-1 size-3.5" aria-hidden="true" />
                            Remover
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>

            <Card className="border-border/70 shadow-sm">
              <CardContent className="space-y-3 py-6">
                <div className="flex items-center justify-between text-sm text-muted-foreground">
                  <span>Subtotal</span>
                  <span className="font-medium text-foreground">{formatCurrency(cart.subtotal)}</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Entrega, descontos e forma de pagamento são calculados na próxima etapa.
                </p>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="px-0 text-xs text-muted-foreground hover:text-destructive"
                  onClick={() => cart.clear()}
                >
                  Esvaziar carrinho
                </Button>
              </CardContent>
            </Card>
          </>
        )}
      </main>

      {cart.hydrated && cart.items.length > 0 ? (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 backdrop-blur">
          <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
            <div className="text-sm">
              <p className="text-muted-foreground">Subtotal</p>
              <p className="font-semibold text-foreground">{formatCurrency(cart.subtotal)}</p>
            </div>
            {canCheckout ? (
              <Button asChild size="lg">
                <Link to="/$slug/checkout" params={{ slug }}>
                  Ir para o pagamento
                </Link>
              </Button>
            ) : (
              <Button size="lg" disabled>
                Loja indisponível
              </Button>
            )}
          </div>
        </div>
      ) : null}
    </CheckoutThemeProvider>
  );
}
