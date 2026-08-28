import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Bell, Minus, Plus, Receipt, ShoppingBag } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { formatCurrency } from "@/lib/format";
import { publicTableCall, publicTableMenu, publicTableOrder } from "@/lib/salao.functions";

export const Route = createFileRoute("/mesa/$token")({
  component: TablePage,
  head: () => ({
    meta: [
      { title: "Peça da sua mesa | O Seu Pedido" },
      {
        name: "description",
        content: "Escaneou o QR Code da mesa? Veja o cardápio, faça seu pedido, chame o garçom e peça a conta sem instalar nada.",
      },
      { property: "og:title", content: "Peça da sua mesa" },
      { property: "og:description", content: "Cardápio da mesa: peça, chame o garçom e peça a conta pelo celular." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex" },
    ],
  }),
});

interface CartLine {
  productId: string;
  name: string;
  price: number;
  quantity: number;
  notes: string;
}

function TablePage() {
  const { token } = Route.useParams();
  const menuFn = useServerFn(publicTableMenu);
  const orderFn = useServerFn(publicTableOrder);
  const callFn = useServerFn(publicTableCall);

  const [cart, setCart] = useState<CartLine[]>([]);
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");
  const [category, setCategory] = useState<string>("todas");

  const menu = useQuery({
    queryKey: ["mesa", token],
    queryFn: () => menuFn({ data: { token } }),
  });

  const sendOrder = useMutation({
    mutationFn: () =>
      orderFn({
        data: {
          token,
          customerName: name.trim() || "Cliente da mesa",
          notes: notes.trim() || undefined,
          items: cart.map((line) => ({
            productId: line.productId,
            quantity: line.quantity,
            notes: line.notes.trim() || undefined,
          })),
        },
      }),
    onSuccess: (result) => {
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success(`${result.message} A cozinha já recebeu.`);
      setCart([]);
      setNotes("");
      void menu.refetch();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const call = useMutation({
    mutationFn: (kind: "waiter" | "bill") => callFn({ data: { token, kind } }),
    onSuccess: (result) => (result.ok ? toast.success(result.message) : toast.error(result.message)),
    onError: (error: Error) => toast.error(error.message),
  });

  function addItem(product: { id: string; name: string; price: number }) {
    setCart((current) => {
      const existing = current.find((line) => line.productId === product.id);
      if (existing) {
        return current.map((line) =>
          line.productId === product.id ? { ...line, quantity: line.quantity + 1 } : line,
        );
      }
      return [...current, { productId: product.id, name: product.name, price: product.price, quantity: 1, notes: "" }];
    });
  }

  if (menu.isLoading) {
    return (
      <main className="mx-auto max-w-xl px-4 py-10">
        <Skeleton className="h-40 rounded-2xl" />
      </main>
    );
  }

  if (!menu.data?.ok) {
    return (
      <main className="mx-auto max-w-xl px-4 py-20 text-center">
        <h1 className="text-2xl font-semibold text-foreground">Mesa indisponível</h1>
        <p className="mt-2 text-muted-foreground">{menu.data?.message ?? "Não encontramos esta mesa."}</p>
      </main>
    );
  }

  const products = menu.data.products ?? [];
  const categories = menu.data.categories ?? [];
  const filtered = category === "todas" ? products : products.filter((product) => product.categoryId === category);
  const total = cart.reduce((sum, line) => sum + line.price * line.quantity, 0);

  return (
    <main className="mx-auto max-w-xl px-4 pt-6 pb-40">
      <header className="mb-4">
        <p className="text-sm text-muted-foreground">{menu.data.storeName}</p>
        <h1 className="text-2xl font-semibold text-foreground">Mesa {menu.data.tableLabel}</h1>
        {menu.data.sessionCode ? (
          <Badge variant="secondary" className="mt-1">
            Comanda {menu.data.sessionCode}
          </Badge>
        ) : null}
      </header>

      <div className="mb-4 grid grid-cols-2 gap-2">
        <Button variant="outline" className="w-full min-w-0 px-2 text-sm" onClick={() => call.mutate("waiter")} disabled={call.isPending}>
          <Bell className="mr-1.5 size-4 shrink-0" aria-hidden="true" />
          <span className="truncate">Chamar garçom</span>
        </Button>
        <Button variant="outline" className="w-full min-w-0 px-2 text-sm" onClick={() => call.mutate("bill")} disabled={call.isPending}>
          <Receipt className="mr-1.5 size-4 shrink-0" aria-hidden="true" />
          <span className="truncate">Pedir a conta</span>
        </Button>
      </div>

      {categories.length > 0 ? (
        <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
          <button
            type="button"
            onClick={() => setCategory("todas")}
            className={`rounded-full px-3 py-1.5 text-sm whitespace-nowrap ${category === "todas" ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"}`}
          >
            Tudo
          </button>
          {categories.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setCategory(item.id)}
              className={`rounded-full px-3 py-1.5 text-sm whitespace-nowrap ${category === item.id ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"}`}
            >
              {item.name}
            </button>
          ))}
        </div>
      ) : null}

      <ul className="space-y-2">
        {filtered.map((product) => (
          <li key={product.id}>
            <button
              type="button"
              onClick={() => addItem(product)}
              className="flex w-full items-center justify-between gap-3 rounded-2xl border border-border bg-card p-4 text-left transition-colors hover:border-primary"
            >
              <span className="min-w-0">
                <span className="block font-medium text-foreground">{product.name}</span>
                {product.description ? (
                  <span className="line-clamp-2 block text-xs text-muted-foreground">{product.description}</span>
                ) : null}
              </span>
              <span className="flex shrink-0 items-center gap-2 font-semibold text-foreground">
                {formatCurrency(product.price)}
                <Plus className="size-4 text-primary" aria-hidden="true" />
              </span>
            </button>
          </li>
        ))}
      </ul>

      {cart.length > 0 ? (
        <section className="fixed inset-x-0 bottom-0 border-t border-border bg-background/95 p-4 backdrop-blur">
          <div className="mx-auto max-w-xl space-y-3">
            <ul className="max-h-44 space-y-2 overflow-y-auto">
              {cart.map((line) => (
                <li key={line.productId} className="space-y-1">
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <span className="min-w-0 truncate text-foreground">{line.name}</span>
                    <span className="flex items-center gap-1">
                      <Button
                        size="icon"
                        variant="outline"
                        className="size-8"
                        aria-label={`Diminuir ${line.name}`}
                        onClick={() =>
                          setCart((current) =>
                            current
                              .map((item) =>
                                item.productId === line.productId ? { ...item, quantity: item.quantity - 1 } : item,
                              )
                              .filter((item) => item.quantity > 0),
                          )
                        }
                      >
                        <Minus className="size-4" aria-hidden="true" />
                      </Button>
                      <span className="w-6 text-center font-semibold">{line.quantity}</span>
                      <Button
                        size="icon"
                        variant="outline"
                        className="size-8"
                        aria-label={`Aumentar ${line.name}`}
                        onClick={() => addItem({ id: line.productId, name: line.name, price: line.price })}
                      >
                        <Plus className="size-4" aria-hidden="true" />
                      </Button>
                    </span>
                  </div>
                  <Input
                    className="h-9 text-sm"
                    placeholder="Observação deste item (sem cebola, ponto da carne...)"
                    aria-label={`Observação de ${line.name}`}
                    value={line.notes}
                    onChange={(event) =>
                      setCart((current) =>
                        current.map((item) =>
                          item.productId === line.productId ? { ...item, notes: event.target.value } : item,
                        ),
                      )
                    }
                  />
                </li>
              ))}
            </ul>

            <div className="grid gap-2 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="mesa-nome" className="text-xs">
                  Seu nome
                </Label>
                <Input
                  id="mesa-nome"
                  className="h-10"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Como te chamamos?"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="mesa-obs" className="text-xs">
                  Observação do pedido
                </Label>
                <Textarea id="mesa-obs" rows={1} value={notes} onChange={(event) => setNotes(event.target.value)} />
              </div>
            </div>

            <Button
              size="lg"
              className="w-full bg-accent text-accent-foreground hover:bg-accent/90"
              disabled={sendOrder.isPending}
              onClick={() => sendOrder.mutate()}
            >
              <ShoppingBag className="mr-2 size-4" aria-hidden="true" />
              {sendOrder.isPending ? "Enviando..." : `Enviar pedido · ${formatCurrency(total)}`}
            </Button>
          </div>
        </section>
      ) : null}
    </main>
  );
}
