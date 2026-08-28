import { useEffect, useState } from "react";
import { Check, Loader2, RotateCcw } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { useSaveStoreFeatures, type StoreFeaturesConfig } from "@/hooks/useStoreFeatures";
import {
  defaultFeaturesFor,
  ESSENTIAL_FEATURES,
  FEATURE_GROUPS,
  FEATURE_LABEL,
  SEGMENT_GROUPS,
  type FeatureKey,
  type SegmentGroupId,
} from "@/lib/painel-segmentos";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  storeId: string | undefined;
  config: StoreFeaturesConfig | undefined;
}

/** Modal para o lojista escolher o ramo e ajustar as funções visíveis no menu. */
export function BusinessSetupDialog({ open, onOpenChange, storeId, config }: Props) {
  const save = useSaveStoreFeatures(storeId);
  const [segment, setSegment] = useState<SegmentGroupId>(config?.segment ?? "alimentacao");
  const [features, setFeatures] = useState<FeatureKey[]>(config?.features ?? defaultFeaturesFor("alimentacao"));

  useEffect(() => {
    if (!open || !config) return;
    setSegment(config.segment);
    setFeatures(config.features);
  }, [open, config]);

  function chooseSegment(id: SegmentGroupId) {
    setSegment(id);
    setFeatures(defaultFeaturesFor(id));
  }

  function toggle(key: FeatureKey, value: boolean) {
    setFeatures((current) =>
      value ? Array.from(new Set([...current, key])) : current.filter((item) => item !== key),
    );
  }

  async function handleSave() {
    try {
      await save.mutateAsync({ segment, features });
      toast.success("Painel adaptado ao seu ramo de atividade.");
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível salvar.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Configurar funções do meu negócio</DialogTitle>
          <DialogDescription>
            Escolha o ramo de atividade para receber uma sugestão pronta e ajuste manualmente o que deve aparecer
            no menu.
          </DialogDescription>
        </DialogHeader>

        <section aria-label="Ramo de atividade">
          <h3 className="text-sm font-semibold text-foreground">1. Ramo de atividade</h3>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {SEGMENT_GROUPS.map((group) => {
              const selected = segment === group.id;
              return (
                <button
                  key={group.id}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => chooseSegment(group.id)}
                  className={`rounded-2xl border p-4 text-left transition-colors ${
                    selected
                      ? "border-primary bg-primary/10"
                      : "border-border bg-card hover:border-primary/40 hover:bg-secondary/60"
                  }`}
                >
                  <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
                    {selected ? <Check className="size-4 text-primary" aria-hidden="true" /> : null}
                    {group.label}
                  </span>
                  <span className="mt-1 block text-xs text-muted-foreground">{group.description}</span>
                  <span className="mt-2 block text-xs text-muted-foreground">{group.examples.join(" · ")}</span>
                </button>
              );
            })}
          </div>
        </section>

        <section aria-label="Funções do menu" className="mt-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-foreground">2. Funções ativas no menu</h3>
            <Button type="button" variant="ghost" size="sm" onClick={() => chooseSegment(segment)}>
              <RotateCcw className="mr-2 size-4" aria-hidden="true" />
              Restaurar sugestão
            </Button>
          </div>

          <div className="mt-3 space-y-4">
            {FEATURE_GROUPS.map((group) => (
              <div key={group.title}>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{group.title}</p>
                <ul className="mt-2 grid gap-2 sm:grid-cols-2">
                  {group.keys.map((key) => {
                    const essential = ESSENTIAL_FEATURES.includes(key);
                    return (
                      <li
                        key={key}
                        className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card px-3 py-2"
                      >
                        <span className="text-sm text-foreground">
                          {FEATURE_LABEL[key]}
                          {essential ? (
                            <span className="ml-2 text-xs text-muted-foreground">sempre ativo</span>
                          ) : null}
                        </span>
                        <Switch
                          checked={essential || features.includes(key)}
                          disabled={essential}
                          onCheckedChange={(value) => toggle(key, value)}
                          aria-label={FEATURE_LABEL[key]}
                        />
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        </section>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="button" onClick={handleSave} disabled={save.isPending || !storeId}>
            {save.isPending ? <Loader2 className="mr-2 size-4 animate-spin" aria-hidden="true" /> : null}
            Salvar configuração
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
