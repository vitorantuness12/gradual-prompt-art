import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Check } from "lucide-react";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency } from "@/lib/format";
import {
  FEATURE_KEYS,
  LIMIT_KEYS,
  formatFeature,
  formatLimit,
  planFeature,
  planLimit,
  planPrice,
  type PlanRow,
} from "@/lib/plans";

export const Route = createFileRoute("/planos")({
  component: PublicPlansPage,
  head: () => ({
    meta: [
      { title: "Planos e preços | O Seu Pedido" },
      {
        name: "description",
        content:
          "Compare os planos Free, Start, Pro e Premium do O Seu Pedido: usuários, produtos, pedidos, automações, KDS e domínio próprio.",
      },
      { property: "og:title", content: "Planos e preços | O Seu Pedido" },
      {
        property: "og:description",
        content: "Escolha o plano ideal para a sua loja: sem comissão por pedido e com teste grátis nos planos pagos.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://oseupedido.com.br/planos" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: "https://oseupedido.com.br/planos" }],

  }),
});

function PublicPlansPage() {
  const [period, setPeriod] = useState<"month" | "year">("month");

  const { data: plans = [] } = useQuery({
    queryKey: ["public-plans"],
    queryFn: async (): Promise<PlanRow[]> => {
      const { data, error } = await supabase.from("plans").select("*").eq("is_active", true).order("sort_order");
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  return (
    <main className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
      <header className="text-center">
        <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
          Planos que acompanham o seu crescimento
        </h1>
        <p className="mx-auto mt-3 max-w-2xl text-muted-foreground">
          Sem comissão por pedido e sem fidelidade. Comece grátis e mude de plano quando quiser.
        </p>
        <div className="mt-6 inline-flex rounded-xl border border-border p-1 text-sm">
          {(["month", "year"] as const).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setPeriod(option)}
              className={`rounded-lg px-4 py-1.5 font-medium transition-colors ${
                period === option ? "bg-primary text-primary-foreground" : "text-muted-foreground"
              }`}
            >
              {option === "month" ? "Mensal" : "Anual"}
            </button>
          ))}
        </div>
      </header>

      <section className="mt-10 grid gap-4 lg:grid-cols-4">
        {plans.map((plan) => {
          const price = planPrice(plan, period);
          return (
            <article
              key={plan.id}
              className={`flex flex-col rounded-2xl border bg-card p-6 shadow-sm ${
                plan.is_highlighted ? "border-primary ring-2 ring-primary/30" : "border-border"
              }`}
            >
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-foreground">{plan.name}</h2>
                {plan.is_highlighted ? <Badge>Mais escolhido</Badge> : null}
              </div>
              <p className="mt-1 text-sm text-muted-foreground">{plan.tagline}</p>
              <p className="mt-4 text-3xl font-semibold text-foreground">
                {price === 0 ? "Grátis" : formatCurrency(price)}
                <span className="text-sm font-normal text-muted-foreground">
                  {price === 0 ? "" : period === "year" ? " /ano" : " /mês"}
                </span>
              </p>
              {plan.trial_days > 0 ? (
                <p className="mt-1 text-xs text-primary">{plan.trial_days} dias de teste grátis</p>
              ) : null}

              <ul className="mt-5 space-y-2 text-sm">
                {plan.highlights.map((item) => (
                  <li key={item} className="flex items-start gap-2 text-muted-foreground">
                    <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
                    {item}
                  </li>
                ))}
              </ul>

              <Button asChild className="mt-6 w-full">
                <Link to="/auth" search={{ modo: "criar" }}>
                  {price === 0 ? "Começar grátis" : "Assinar agora"}
                </Link>
              </Button>
            </article>
          );
        })}
      </section>

      <section className="mt-14 overflow-x-auto">
        <h2 className="mb-4 text-xl font-semibold text-foreground">Comparativo completo</h2>
        <table className="w-full min-w-3xl border-collapse text-sm">
          <thead>
            <tr className="border-b border-border text-left">
              <th className="py-3 pr-4 font-medium text-muted-foreground">Recurso</th>
              {plans.map((plan) => (
                <th key={plan.id} className="py-3 pr-4 font-semibold text-foreground">
                  {plan.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {LIMIT_KEYS.map((item) => (
              <tr key={item.key} className="border-b border-border/60">
                <td className="py-2.5 pr-4 text-muted-foreground">{item.label}</td>
                {plans.map((plan) => (
                  <td key={plan.id} className="py-2.5 pr-4 text-foreground">
                    {formatLimit(planLimit(plan, item.key))}
                  </td>
                ))}
              </tr>
            ))}
            {FEATURE_KEYS.map((item) => (
              <tr key={item.key} className="border-b border-border/60">
                <td className="py-2.5 pr-4 text-muted-foreground">{item.label}</td>
                {plans.map((plan) => (
                  <td key={plan.id} className="py-2.5 pr-4 text-foreground">
                    {formatFeature(planFeature(plan, item.key))}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <p className="mt-10 text-center text-sm text-muted-foreground">
        Já tem conta?{" "}
        <Link to="/auth" search={{ modo: "entrar" }} className="text-primary underline-offset-4 hover:underline">
          Entrar no painel
        </Link>
      </p>
    </main>
  );
}
