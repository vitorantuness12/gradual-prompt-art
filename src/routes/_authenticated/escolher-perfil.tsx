import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Bike, Shield, Store, UserRound } from "lucide-react";

import { Logo } from "@/components/brand/Logo";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAccountKinds } from "@/hooks/useAccountKinds";
import { ACCOUNT_KINDS, courierCanWork, type AccountKind } from "@/lib/contas";

export const Route = createFileRoute("/_authenticated/escolher-perfil")({
  head: () => ({
    meta: [
      { title: "Escolher ambiente de acesso — O Seu Pedido" },
      {
        name: "description",
        content: "Escolha entre acessar como cliente, motoboy ou lojista usando a mesma conta.",
      },
      { property: "og:title", content: "Escolher ambiente de acesso" },
      { property: "og:description", content: "Uma conta, vários perfis: cliente, motoboy e lojista." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ChooseProfilePage,
});

const ICONS = {
  cliente: UserRound,
  motoboy: Bike,
  lojista: Store,
} as const;

function ChooseProfilePage() {
  const navigate = useNavigate();
  const { data, isLoading } = useAccountKinds();

  const available: AccountKind[] = [];
  if (data?.customer) available.push("cliente");
  if (data?.courier) available.push("motoboy");
  if (data?.merchant) available.push("lojista");

  function open(kind: AccountKind) {
    if (kind === "cliente") return void navigate({ to: "/minha-conta" });
    if (kind === "lojista") return void navigate({ to: "/painel" });
    void navigate({ to: courierCanWork(data?.courier_status) ? "/entregador" : "/entregador/status" });
  }

  return (
    <div className="min-h-screen bg-secondary/40">
      <header className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6">
        <Logo />
      </header>
      <main className="mx-auto w-full max-w-4xl px-4 pb-16 sm:px-6">
        <h1 className="text-2xl font-semibold sm:text-3xl">Escolha o ambiente de acesso</h1>
        <p className="mt-2 text-muted-foreground">
          Sua conta é única. Escolha por onde quer continuar agora.
        </p>

        {isLoading ? (
          <div className="mt-8 grid gap-4 sm:grid-cols-3">
            <Skeleton className="h-40" />
            <Skeleton className="h-40" />
            <Skeleton className="h-40" />
          </div>
        ) : available.length === 0 ? (
          <div className="mt-8 rounded-2xl border border-border/70 bg-card p-6">
            <p className="font-medium">Seu cadastro ainda não está completo.</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Finalize o cadastro para liberar o acesso.
            </p>
            <Button className="mt-4" onClick={() => void navigate({ to: "/completar-cadastro" })}>
              Completar cadastro
            </Button>
          </div>
        ) : (
          <div className="mt-8 grid gap-4 sm:grid-cols-3">
            {ACCOUNT_KINDS.filter((item) => available.includes(item.key)).map((item) => {
              const Icon = ICONS[item.key];
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => open(item.key)}
                  className="flex h-full flex-col rounded-2xl border border-border/70 bg-card p-5 text-left transition hover:border-primary hover:shadow-md"
                >
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <Icon className="h-5 w-5" aria-hidden />
                  </span>
                  <span className="mt-3 text-base font-semibold">{item.label}</span>
                  <span className="mt-1 text-sm text-muted-foreground">{item.description}</span>
                </button>
              );
            })}
            {data?.super_admin ? (
              <button
                type="button"
                onClick={() => void navigate({ to: "/admin" })}
                className="flex h-full flex-col rounded-2xl border border-border/70 bg-card p-5 text-left transition hover:border-primary hover:shadow-md"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Shield className="h-5 w-5" aria-hidden />
                </span>
                <span className="mt-3 text-base font-semibold">Superadmin</span>
                <span className="mt-1 text-sm text-muted-foreground">Administração da plataforma.</span>
              </button>
            ) : null}
          </div>
        )}

        <div className="mt-8">
          <Button variant="outline" onClick={() => void navigate({ to: "/completar-cadastro" })}>
            Adicionar outro perfil a esta conta
          </Button>
        </div>
      </main>
    </div>
  );
}
