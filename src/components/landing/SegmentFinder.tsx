import { Sparkles } from "lucide-react";
import { useMemo, useState } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface Suggestion {
  model: string;
  description: string;
  modules: string[];
}

const RULES: { keywords: string[]; suggestion: Suggestion }[] = [
  {
    keywords: ["restaurante", "lanchonete", "pizza", "hamb", "açai", "acai", "bar", "food", "comida", "marmita"],
    suggestion: {
      model: "Painel Delivery & Balcão",
      description: "Cardápio digital, gestor de pedidos em tempo real e taxa de entrega por região.",
      modules: ["Pedidos", "Cardápio", "Entregas", "Cupons", "Impressão"],
    },
  },
  {
    keywords: ["mercado", "hortifruti", "adega", "conveni", "distribuidora", "farm", "petshop", "pet shop", "loja"],
    suggestion: {
      model: "Painel Varejo",
      description: "Catálogo com estoque controlado, retirada na loja e entrega própria.",
      modules: ["Catálogo", "Estoque", "Pedidos", "Entregas", "Relatórios"],
    },
  },
  {
    keywords: ["salão", "salao", "barbe", "estét", "estet", "clínica", "clinica", "massa", "unha", "studio", "tatu"],
    suggestion: {
      model: "Painel Agenda & Serviços",
      description: "Serviços com duração, agenda por profissional e confirmação do cliente.",
      modules: ["Agendamentos", "Serviços", "Clientes", "Promoções", "Relatórios"],
    },
  },
  {
    keywords: ["curso", "aula", "mentoria", "assinatura", "clube", "consult", "encomenda", "ateliê", "atelie", "bolo"],
    suggestion: {
      model: "Painel Sob Encomenda",
      description: "Pedidos programados, sinal de pagamento e acompanhamento por etapa.",
      modules: ["Pedidos agendados", "Catálogo", "Clientes", "Pagamentos", "Atendimento"],
    },
  },
];

const FALLBACK: Suggestion = {
  model: "Painel Essencial",
  description: "Comece com catálogo, pedidos e clientes — e ative os demais módulos quando precisar.",
  modules: ["Catálogo", "Pedidos", "Clientes", "Relatórios"],
};

/** Sugere o modelo de painel a partir do segmento digitado pela pessoa. */
export function SegmentFinder() {
  const [value, setValue] = useState("");

  const suggestion = useMemo(() => {
    const term = value.trim().toLowerCase();
    if (term.length < 3) return null;
    const match = RULES.find((rule) => rule.keywords.some((keyword) => term.includes(keyword)));
    return match?.suggestion ?? FALLBACK;
  }, [value]);

  return (
    <div className="rounded-3xl border border-border bg-gradient-card p-6 shadow-card-soft sm:p-8">
      <Label htmlFor="segmento" className="text-base font-semibold text-foreground">
        Qual é o seu negócio?
      </Label>
      <p className="mt-1 text-sm text-muted-foreground">
        Digite o segmento (ex.: pizzaria, barbearia, mercado) e veja o modelo de painel sugerido.
      </p>
      <Input
        id="segmento"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder="Pizzaria, barbearia, pet shop..."
        className="mt-4 h-12 rounded-xl bg-background/70 text-base"
        autoComplete="off"
      />

      <div aria-live="polite" className="mt-4">
        {suggestion ? (
          <div className="rounded-2xl border border-primary/30 bg-primary/10 p-4 transition-opacity">
            <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <Sparkles className="size-4 text-primary" aria-hidden="true" />
              {suggestion.model}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">{suggestion.description}</p>
            <ul className="mt-3 flex flex-wrap gap-2">
              {suggestion.modules.map((module) => (
                <li
                  key={module}
                  className="rounded-full border border-border bg-card px-3 py-1 text-xs text-foreground"
                >
                  {module}
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">A sugestão aparece assim que você digitar o segmento.</p>
        )}
      </div>
    </div>
  );
}
