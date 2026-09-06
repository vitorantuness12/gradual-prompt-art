import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Sparkles } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  AUTOSORT_SCOPES,
  AUTOSORT_WINDOWS,
  catalogIntelligenceKey,
  type AutosortScope,
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

/** Configuração das sugestões automáticas e da ordem da vitrine. */
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

  function refresh() {
    void queryClient.invalidateQueries({ queryKey: catalogIntelligenceKey(storeId) });
    void queryClient.invalidateQueries({ queryKey: ["catalog", storeId] });
    void queryClient.invalidateQueries({ queryKey: ["public-store"] });
  }

  const save = useMutation({
    mutationFn: () => saveFn({ data: { storeId, ...form } }),
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

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Sugestões de "leve também"</CardTitle>
        <CardDescription>
          A inteligência artificial olha o seu catálogo e monta combinações que aparecem na sacola do
          cliente. Você pode remover qualquer combinação depois, no próprio item.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex items-center justify-between gap-4 rounded-xl border border-border/70 p-3">
          <div>
            <p className="text-sm font-medium">Mostrar sugestões na sacola</p>
            <p className="text-sm text-muted-foreground">
              {overview.productsWithSuggestions} de {overview.productCount} itens já têm combinação.
            </p>
          </div>
          <Switch
            checked={form.upsellAiEnabled}
            onCheckedChange={(checked) => setForm((state) => ({ ...state, upsellAiEnabled: checked }))}
            aria-label="Mostrar sugestões na sacola"
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="upsell-max">Máximo de sugestões por item</Label>
            <Select
              value={String(form.upsellMax)}
              onValueChange={(value) => setForm((state) => ({ ...state, upsellMax: Number(value) }))}
            >
              <SelectTrigger id="upsell-max">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[1, 2, 3, 4, 5, 6, 8].map((value) => (
                  <SelectItem key={value} value={String(value)}>
                    {value} {value === 1 ? "sugestão" : "sugestões"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="autosort-window">Período de vendas analisado</Label>
            <Select
              value={String(form.autosortWindowDays)}
              onValueChange={(value) =>
                setForm((state) => ({ ...state, autosortWindowDays: Number(value) }))
              }
            >
              <SelectTrigger id="autosort-window">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {AUTOSORT_WINDOWS.map((option) => (
                  <SelectItem key={option.value} value={String(option.value)}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="ai-notes">Dicas para a inteligência artificial (opcional)</Label>
          <Textarea
            id="ai-notes"
            value={form.aiNotes}
            maxLength={600}
            placeholder="Ex.: sempre sugerir bebida com prato principal e sobremesa no fim."
            onChange={(event) => setForm((state) => ({ ...state, aiNotes: event.target.value }))}
          />
        </div>

        <div className="flex items-center justify-between gap-4 rounded-xl border border-border/70 p-3">
          <div>
            <p className="text-sm font-medium">Reorganizar a vitrine pelos mais vendidos</p>
            <p className="text-sm text-muted-foreground">
              {AUTOSORT_SCOPES.find((scope) => scope.value === form.autosortScope)?.hint}
            </p>
          </div>
          <Switch
            checked={form.autosortEnabled}
            onCheckedChange={(checked) => setForm((state) => ({ ...state, autosortEnabled: checked }))}
            aria-label="Reorganizar a vitrine pelos mais vendidos"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="autosort-scope">Onde reorganizar</Label>
          <Select
            value={form.autosortScope}
            onValueChange={(value) =>
              setForm((state) => ({ ...state, autosortScope: value as AutosortScope }))
            }
          >
            <SelectTrigger id="autosort-scope">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {AUTOSORT_SCOPES.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? "Salvando..." : "Salvar preferências"}
          </Button>
          <Button
            variant="outline"
            onClick={() => generate.mutate()}
            disabled={generate.isPending || !overview.aiAvailable}
          >
            <Sparkles className="mr-2 size-4" aria-hidden="true" />
            {generate.isPending ? "Montando combinações..." : "Gerar combinações com IA"}
          </Button>
        </div>
        {!overview.aiAvailable ? (
          <p className="text-sm text-destructive">
            A inteligência artificial ainda não está configurada nesta conta.
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
