import { Link } from "@tanstack/react-router";
import { Check, Minus } from "lucide-react";

import { Button } from "@/components/ui/button";

interface Plan {
  name: string;
  price: string;
  note: string;
  highlight?: boolean;
  summary: string;
}

const PLANS: Plan[] = [
  { name: "Início", price: "R$ 0", note: "para começar", summary: "Catálogo e pedidos essenciais." },
  {
    name: "Profissional",
    price: "R$ 89",
    note: "por mês",
    highlight: true,
    summary: "Delivery, agenda, cupons e relatórios.",
  },
  { name: "Avançado", price: "R$ 189", note: "por mês", summary: "Multiunidade, fidelidade e integrações." },
];

const FEATURES: { label: string; values: [boolean, boolean, boolean] }[] = [
  { label: "Loja própria com link e QR Code", values: [true, true, true] },
  { label: "Gestor de pedidos", values: [true, true, true] },
  { label: "Catálogo com estoque", values: [false, true, true] },
  { label: "Agendamentos", values: [false, true, true] },
  { label: "Entregas e entregadores", values: [false, true, true] },
  { label: "Cupons e promoções", values: [false, true, true] },
  { label: "Relatórios avançados", values: [false, true, true] },
  { label: "Programa de fidelidade", values: [false, false, true] },
  { label: "Múltiplas unidades", values: [false, false, true] },
];

/** Planos com comparação de recursos. Valores exibidos são referenciais. */
export function PricingSection() {
  return (
    <section id="planos" aria-labelledby="planos-titulo" className="border-t border-border py-16 sm:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <h2 id="planos-titulo" className="text-2xl font-bold tracking-tight text-foreground sm:text-4xl">
          Planos que crescem com o seu negócio
        </h2>
        <p className="mt-3 max-w-2xl text-muted-foreground">
          Sem comissão por pedido. Você paga pelo plano e fica com o valor integral das suas vendas.
        </p>

        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {PLANS.map((plan) => (
            <div
              key={plan.name}
              className={`rounded-3xl border p-6 transition-transform hover:-translate-y-1 ${
                plan.highlight
                  ? "border-primary/60 bg-gradient-card shadow-glow"
                  : "border-border bg-card shadow-card-soft"
              }`}
            >
              {plan.highlight ? (
                <span className="rounded-full bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground">
                  Mais escolhido
                </span>
              ) : null}
              <h3 className="mt-3 text-lg font-semibold text-foreground">{plan.name}</h3>
              <p className="mt-2 text-3xl font-bold text-foreground">
                {plan.price}
                <span className="ml-1 text-sm font-normal text-muted-foreground">{plan.note}</span>
              </p>
              <p className="mt-2 text-sm text-muted-foreground">{plan.summary}</p>
              <Button
                asChild
                className={`mt-5 w-full ${plan.highlight ? "bg-gradient-primary text-primary-foreground" : ""}`}
                variant={plan.highlight ? "default" : "outline"}
              >
                <Link to="/auth" search={{ modo: "criar" }}>
                  Criar minha loja grátis
                </Link>
              </Button>
            </div>
          ))}
        </div>

        <div className="mt-10 overflow-x-auto rounded-3xl border border-border bg-card">
          <table className="w-full min-w-[36rem] text-sm">
            <caption className="sr-only">Comparação de recursos entre os planos</caption>
            <thead>
              <tr className="border-b border-border text-left">
                <th scope="col" className="px-4 py-3 font-medium text-muted-foreground">
                  Recurso
                </th>
                {PLANS.map((plan) => (
                  <th key={plan.name} scope="col" className="px-4 py-3 text-center font-medium text-foreground">
                    {plan.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {FEATURES.map((feature) => (
                <tr key={feature.label} className="border-b border-border last:border-0">
                  <th scope="row" className="px-4 py-3 text-left font-normal text-foreground">
                    {feature.label}
                  </th>
                  {feature.values.map((included, index) => (
                    <td key={`${feature.label}-${PLANS[index]?.name}`} className="px-4 py-3 text-center">
                      {included ? (
                        <Check className="mx-auto size-4 text-success" aria-label="Incluído" />
                      ) : (
                        <Minus className="mx-auto size-4 text-muted-foreground" aria-label="Não incluído" />
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
