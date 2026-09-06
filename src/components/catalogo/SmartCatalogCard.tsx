import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";

import { SmartSortSettings } from "@/components/catalogo/SmartSortSettings";
import { SmartUpsellSettings } from "@/components/catalogo/SmartUpsellSettings";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import {
  AUTOSORT_SCOPES,
  catalogIntelligenceKey,
  type CatalogIntelligenceOverview,
} from "@/lib/catalogo-inteligente";
import {
  generateUpsellSuggestions,
  saveCatalogIntelligence,
} from "@/lib/catalogo-inteligente.functions";

export interface SmartCatalogCardProps {
  storeId: string;
  overview: CatalogIntelligenceOverview;
}

/**
 * Escolha do lojista: usar ou não o catálogo inteligente e, quando usa,
 * decidir entre sugestões de "leve também", vitrine pelos mais vendidos ou as duas.
 */
export function SmartCatalogCard({ storeId, overview }: SmartCatalogCardProps) {
  const queryClient = useQueryClient();
  const saveFn = useServerFn(saveCatalogIntelligence);
  const generateFn = useServerFn(generateUpsellSuggestions);

  const [form, setForm] = useState({
    upsellAiEnabled: overview.settings.upsellAiEnabled,
    upsellMax: overview.settings.upsellMax,
    aiNotes: overview.settings.aiNotes,
    autosortEnabled: overview.settings.autosortEnabled,
    autosortWindowDays: overview.settings.autosortWindowDays,
    autosortScope: overview.settings.autosortScope,
  });
  // Ligado enquanto qualquer uma das duas partes estiver em uso.
  const [master, setMaster] = useState(
    overview.settings.upsellAiEnabled || overview.settings.autosortEnabled,
  );

  function refresh() {
    void queryClient.invalidateQueries({ queryKey: catalogIntelligenceKey(storeId) });
    void queryClient.invalidateQueries({ queryKey: ["catalog", storeId] });
    void queryClient.invalidateQueries({ queryKey: ["public-store"] });
  }

  const save = useMutation({
    mutationFn: () =>
      saveFn({
        data: {
          storeId,
          ...form,
          // Desligar o interruptor geral desliga as duas partes de uma vez.
          upsellAiEnabled: master && form.upsellAiEnabled,
          autosortEnabled: master && form.autosortEnabled,
        },
      }),
    onSuccess: () => {
      toast.success("Preferências salvas.");
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const generate = useMutation({
    mutationFn: () => generateFn({ data: { storeId } }),
    onSuccess: (result) => {
      if (result.ok) toast.success(result.message);
      else toast.error(result.message);
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  function toggleMaster(checked: boolean) {
    setMaster(checked);
    // Ao ligar pela primeira vez, deixamos as sugestões como escolha inicial.
    if (checked && !form.upsellAiEnabled && !form.autosortEnabled) {
      setForm((state) => ({ ...state, upsellAiEnabled: true }));
    }
  }

  const scopeHint = AUTOSORT_SCOPES.find((scope) => scope.value === form.autosortScope)?.hint;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Catálogo inteligente</CardTitle>
        <CardDescription>
          Use se quiser: você decide entre sugerir itens que combinam, deixar os mais vendidos no topo
          da vitrine, ou as duas coisas juntas.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex items-center justify-between gap-4 rounded-xl border border-border/70 p-3">
          <div>
            <p className="text-sm font-medium">Usar o catálogo inteligente</p>
            <p className="text-sm text-muted-foreground">
              Desligado, sua loja continua exatamente como você organizou na mão.
            </p>
          </div>
          <Switch
            checked={master}
            onCheckedChange={toggleMaster}
            aria-label="Usar o catálogo inteligente"
          />
        </div>

        {master ? (
          <div className="space-y-5">
            <div className="flex items-center justify-between gap-4 rounded-xl border border-border/70 p-3">
              <div>
                <p className="text-sm font-medium">Sugerir itens que combinam</p>
                <p className="text-sm text-muted-foreground">
                  {overview.productsWithSuggestions} de {overview.productCount} itens já têm combinação.
                </p>
              </div>
              <Switch
                checked={form.upsellAiEnabled}
                onCheckedChange={(checked) =>
                  setForm((state) => ({ ...state, upsellAiEnabled: checked }))
                }
                aria-label="Sugerir itens que combinam"
              />
            </div>

            {form.upsellAiEnabled ? (
              <SmartUpsellSettings
                upsellMax={form.upsellMax}
                aiNotes={form.aiNotes}
                aiAvailable={overview.aiAvailable}
                generating={generate.isPending}
                onChangeMax={(value) => setForm((state) => ({ ...state, upsellMax: value }))}
                onChangeNotes={(value) => setForm((state) => ({ ...state, aiNotes: value }))}
                onGenerate={() => generate.mutate()}
              />
            ) : null}

            <div className="flex items-center justify-between gap-4 rounded-xl border border-border/70 p-3">
              <div>
                <p className="text-sm font-medium">Deixar os mais vendidos no topo</p>
                <p className="text-sm text-muted-foreground">{scopeHint}</p>
              </div>
              <Switch
                checked={form.autosortEnabled}
                onCheckedChange={(checked) =>
                  setForm((state) => ({ ...state, autosortEnabled: checked }))
                }
                aria-label="Deixar os mais vendidos no topo"
              />
            </div>

            {form.autosortEnabled ? (
              <SmartSortSettings
                autosortWindowDays={form.autosortWindowDays}
                autosortScope={form.autosortScope}
                onChangeWindow={(value) =>
                  setForm((state) => ({ ...state, autosortWindowDays: value }))
                }
                onChangeScope={(value) => setForm((state) => ({ ...state, autosortScope: value }))}
              />
            ) : null}

            {!form.upsellAiEnabled && !form.autosortEnabled ? (
              <p className="text-sm text-muted-foreground">
                Escolha ao menos uma das duas opções acima para o catálogo inteligente fazer efeito.
              </p>
            ) : null}
          </div>
        ) : null}

        <Button onClick={() => save.mutate()} disabled={save.isPending}>
          {save.isPending ? "Salvando..." : "Salvar preferências"}
        </Button>
      </CardContent>
    </Card>
  );
}
