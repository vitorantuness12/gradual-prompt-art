import { useState } from "react";

import { DemoBadge } from "@/components/brand/DemoBadge";
import { formatCurrency } from "@/lib/format";

interface DemoOrder {
  code: string;
  customer: string;
  items: string;
  total: number;
  status: "Novo" | "Em preparo" | "Saiu para entrega";
}

const TABS = ["Pedidos", "Agenda", "Resumo"] as const;
type Tab = (typeof TABS)[number];

const ORDERS: DemoOrder[] = [
  { code: "1042", customer: "Cliente Exemplo A", items: "2 itens", total: 68.9, status: "Novo" },
  { code: "1041", customer: "Cliente Exemplo B", items: "4 itens", total: 121.5, status: "Em preparo" },
  { code: "1040", customer: "Cliente Exemplo C", items: "1 item", total: 32, status: "Saiu para entrega" },
];

const AGENDA = [
  { time: "09:00", service: "Corte + barba", customer: "Cliente Exemplo D" },
  { time: "11:30", service: "Coloração", customer: "Cliente Exemplo E" },
  { time: "15:00", service: "Consultoria", customer: "Cliente Exemplo F" },
];

const STATUS_STYLE: Record<DemoOrder["status"], string> = {
  Novo: "bg-primary/15 text-primary",
  "Em preparo": "bg-warning/15 text-warning",
  "Saiu para entrega": "bg-success/15 text-success",
};

/** Prévia estática do painel. Nenhuma ação altera dados reais. */
export function DemoPanel() {
  const [tab, setTab] = useState<Tab>("Pedidos");

  return (
    <div className="overflow-hidden rounded-3xl border border-border bg-gradient-card shadow-card-soft">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-foreground">Painel da loja</span>
          <DemoBadge />
        </div>
        <div role="tablist" aria-label="Seções da demonstração" className="flex gap-1">
          {TABS.map((item) => (
            <button
              key={item}
              role="tab"
              type="button"
              aria-selected={tab === item}
              onClick={() => setTab(item)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                tab === item ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-secondary"
              }`}
            >
              {item}
            </button>
          ))}
        </div>
      </div>

      <div className="p-4">
        {tab === "Pedidos" ? (
          <ul className="space-y-2">
            {ORDERS.map((order) => (
              <li
                key={order.code}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-background/50 px-3 py-2.5"
              >
                <div>
                  <p className="text-sm font-medium text-foreground">
                    #{order.code} · {order.customer}
                  </p>
                  <p className="text-xs text-muted-foreground">{order.items}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_STYLE[order.status]}`}>
                    {order.status}
                  </span>
                  <span className="text-sm font-semibold text-foreground">{formatCurrency(order.total)}</span>
                </div>
              </li>
            ))}
          </ul>
        ) : null}

        {tab === "Agenda" ? (
          <ul className="space-y-2">
            {AGENDA.map((slot) => (
              <li
                key={slot.time}
                className="flex items-center justify-between rounded-xl border border-border bg-background/50 px-3 py-2.5"
              >
                <span className="text-sm font-semibold text-primary">{slot.time}</span>
                <span className="text-sm text-foreground">{slot.service}</span>
                <span className="text-xs text-muted-foreground">{slot.customer}</span>
              </li>
            ))}
          </ul>
        ) : null}

        {tab === "Resumo" ? (
          <div className="grid gap-3 sm:grid-cols-3">
            {[
              { label: "Pedidos hoje", value: "18" },
              { label: "Faturamento", value: formatCurrency(1284.4) },
              { label: "Ticket médio", value: formatCurrency(71.35) },
            ].map((item) => (
              <div key={item.label} className="rounded-xl border border-border bg-background/50 p-4">
                <p className="text-xs tracking-wide text-muted-foreground uppercase">{item.label}</p>
                <p className="mt-1 text-xl font-semibold text-foreground">{item.value}</p>
              </div>
            ))}
          </div>
        ) : null}

        <p className="mt-4 text-xs text-muted-foreground">
          Demonstração ilustrativa com dados de exemplo. Nenhum pedido real é criado aqui.
        </p>
      </div>
    </div>
  );
}
