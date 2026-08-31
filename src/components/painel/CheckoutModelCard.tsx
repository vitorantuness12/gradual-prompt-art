import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, Info } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import {
  CHECKOUT_MODEL_DESCRIPTION,
  CHECKOUT_MODEL_LABEL,
  allowedCheckoutModels,
  hasDedicatedScreen,
  resolveCheckoutModel,
  type CheckoutModel,
  type CheckoutModelStore,
} from "@/lib/checkout-model";

export interface CheckoutModelCardProps {
  storeId: string;
  store: CheckoutModelStore;
  editable: boolean;
  onSaved?: () => void | Promise<unknown>;
}

/**
 * Escolha do modelo de checkout da loja. Só oferece modelos compatíveis com o
 * segmento — a lógica de decisão vive em `@/lib/checkout-model`.
 */
export function CheckoutModelCard({ storeId, store, editable, onSaved }: CheckoutModelCardProps) {
  const queryClient = useQueryClient();
  const options = allowedCheckoutModels(store);
  const current = resolveCheckoutModel(store);
  const automatic = !store.checkout_type;

  // Segmentos com um único modelo compatível (ex.: produtos digitais) não têm
  // escolha real — a troca de modelo não faz sentido e o card só confundiria.
  if (options.length <= 1) return null;

  const save = useMutation({
    mutationFn: async (model: CheckoutModel | null) => {
      const { error } = await supabase.from("stores").update({ checkout_type: model }).eq("id", storeId);
      if (error) throw new Error(error.message);
    },
    onSuccess: async () => {
      toast.success("Modelo de checkout atualizado.");
      await queryClient.invalidateQueries({ queryKey: ["my-stores"] });
      await onSaved?.();
    },
    onError: () => toast.error("Não foi possível atualizar o modelo de checkout."),
  });

  return (
    <Card className="border-border/70 shadow-sm">
      <CardHeader>
        <CardTitle className="text-base">Modelo de checkout</CardTitle>
        <CardDescription>
          Escolhemos automaticamente pelo seu ramo de atividade. Você pode trocar entre os modelos compatíveis.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          {options.map((model) => {
            const selected = current === model;
            return (
              <button
                key={model}
                type="button"
                disabled={!editable || save.isPending}
                onClick={() => save.mutate(model)}
                aria-pressed={selected}
                className={cn(
                  "rounded-xl border p-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-70",
                  selected ? "border-primary bg-primary/5" : "border-border/70 hover:border-primary/50",
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium">{CHECKOUT_MODEL_LABEL[model]}</span>
                  {selected ? <Check className="size-4 text-primary" aria-hidden="true" /> : null}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{CHECKOUT_MODEL_DESCRIPTION[model]}</p>
                {!hasDedicatedScreen(model) ? (
                  <Badge variant="outline" className="mt-2 text-[11px]">
                    Tela dedicada em preparação
                  </Badge>
                ) : null}
              </button>
            );
          })}
        </div>

        <p className="flex items-start gap-2 text-xs text-muted-foreground">
          <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          {automatic
            ? `Nenhum modelo fixado: usando ${CHECKOUT_MODEL_LABEL[current]} pelo seu segmento.`
            : `Modelo fixado manualmente: ${CHECKOUT_MODEL_LABEL[current]}.`}
        </p>

        {editable && !automatic ? (
          <button
            type="button"
            className="text-xs font-medium text-primary underline-offset-2 hover:underline"
            disabled={save.isPending}
            onClick={() => save.mutate(null)}
          >
            Voltar para a escolha automática pelo segmento
          </button>
        ) : null}
      </CardContent>
    </Card>
  );
}
