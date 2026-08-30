import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { UpsellSuggestion } from "@/lib/upsell";

export interface UpsellSuggestionsProps extends React.ComponentPropsWithoutRef<"section"> {
  suggestions: UpsellSuggestion[];
  /** Adiciona a sugestão ao carrinho (1 unidade). */
  onAdd: (suggestion: UpsellSuggestion) => void;
  title?: string;
  description?: string;
}

/**
 * Bloco "leve também": sugestões cadastradas pelo lojista para os itens que já
 * estão no carrinho. Cada card adiciona uma unidade com um clique, sem sair da
 * tela — o objetivo é aumentar o ticket sem atrapalhar a finalização.
 */
export function UpsellSuggestions({
  suggestions,
  onAdd,
  title = "Leve também",
  description = "Combina com o que você já escolheu.",
  className,
  ...props
}: UpsellSuggestionsProps) {
  if (suggestions.length === 0) return null;

  return (
    <section
      className={cn("space-y-3 rounded-xl border border-border/70 bg-muted/40 p-3", className)}
      aria-label={title}
      {...props}
    >
      <div>
        <p className="text-xs font-bold uppercase tracking-wide text-foreground">{title}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>

      <ul className="grid gap-2 sm:grid-cols-2">
        {suggestions.map((suggestion) => (
          <li
            key={suggestion.product.id}
            className="flex items-center gap-3 rounded-lg border border-border/70 bg-card p-2"
          >
            {suggestion.product.image_url ? (
              <img
                src={suggestion.product.image_url}
                alt={suggestion.product.name}
                loading="lazy"
                className="size-12 shrink-0 rounded-md object-cover"
              />
            ) : null}

            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-foreground">{suggestion.product.name}</p>
              <p className="text-xs font-semibold text-primary">{formatCurrency(suggestion.price)}</p>
            </div>

            <Button
              type="button"
              size="sm"
              variant="outline"
              className="shrink-0"
              aria-label={`Adicionar ${suggestion.product.name} ao pedido`}
              onClick={() => onAdd(suggestion)}
            >
              <Plus className="mr-1 size-3.5" aria-hidden="true" />
              Adicionar
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}
