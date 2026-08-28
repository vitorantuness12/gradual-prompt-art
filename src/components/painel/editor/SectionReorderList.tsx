import { ChevronDown, ChevronUp, Settings2 } from "lucide-react";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { blockByKey, type SectionScheduleRule, type StoreSectionDraft } from "@/lib/store-theme";

/**
 * Lista de blocos da loja: ordem, visibilidade, textos e regras de exibição.
 *
 * A reordenação usa botões de subir/descer, que funcionam com teclado e no
 * celular — não depende de arrastar.
 */
interface Props {
  sections: StoreSectionDraft[];
  onChange: (sections: StoreSectionDraft[]) => void;
}

const WEEK = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

export function SectionReorderList({ sections, onChange }: Props) {
  const [openKey, setOpenKey] = useState<string | null>(null);
  const ordered = [...sections].sort((a, b) => a.sort_order - b.sort_order);

  function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= ordered.length) return;
    const next = [...ordered];
    const current = next[index]!;
    next[index] = next[target]!;
    next[target] = current;
    onChange(next.map((section, position) => ({ ...section, sort_order: position })));
  }

  function update(blockKey: string, partial: Partial<StoreSectionDraft>) {
    onChange(ordered.map((section) => (section.block_key === blockKey ? { ...section, ...partial } : section)));
  }

  function updateRule(blockKey: string, partial: Partial<SectionScheduleRule>) {
    const section = ordered.find((item) => item.block_key === blockKey);
    if (!section) return;
    update(blockKey, { schedule_rule: { ...section.schedule_rule, ...partial } });
  }

  return (
    <ul className="space-y-2">
      {ordered.map((section, index) => {
        const definition = blockByKey(section.block_key);
        const required = definition?.required ?? false;
        const rule = section.schedule_rule ?? {};
        const isOpen = openKey === section.block_key;

        return (
          <li key={section.block_key} className="rounded-lg border border-border bg-card p-3">
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex flex-col">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-6"
                  onClick={() => move(index, -1)}
                  disabled={index === 0}
                  aria-label={`Mover ${definition?.label ?? section.block_key} para cima`}
                >
                  <ChevronUp className="size-4" aria-hidden="true" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-6"
                  onClick={() => move(index, 1)}
                  disabled={index === ordered.length - 1}
                  aria-label={`Mover ${definition?.label ?? section.block_key} para baixo`}
                >
                  <ChevronDown className="size-4" aria-hidden="true" />
                </Button>
              </div>

              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 text-sm font-medium text-foreground">
                  {definition?.label ?? section.block_key}
                  {required ? <Badge variant="secondary">Fixo</Badge> : null}
                </p>
                <p className="truncate text-xs text-muted-foreground">{definition?.description}</p>
              </div>

              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => setOpenKey(isOpen ? null : section.block_key)}
                aria-label={`Configurar ${definition?.label ?? section.block_key}`}
                aria-expanded={isOpen}
              >
                <Settings2 className="size-4" aria-hidden="true" />
              </Button>

              <Switch
                checked={section.is_visible}
                disabled={required}
                onCheckedChange={(checked) => update(section.block_key, { is_visible: checked })}
                aria-label={`Mostrar ${definition?.label ?? section.block_key}`}
              />
            </div>

            {isOpen ? (
              <div className="mt-3 space-y-3 border-t border-border pt-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Título</Label>
                    <Input
                      value={section.title ?? ""}
                      placeholder={definition?.defaultTitle ?? "Sem título"}
                      onChange={(event) => update(section.block_key, { title: event.target.value || null })}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Subtítulo</Label>
                    <Input
                      value={section.subtitle ?? ""}
                      onChange={(event) => update(section.block_key, { subtitle: event.target.value || null })}
                    />
                  </div>
                  <div className="space-y-1 sm:col-span-2">
                    <Label className="text-xs">Imagem do bloco (URL)</Label>
                    <Input
                      value={section.image_url ?? ""}
                      placeholder="https://..."
                      onChange={(event) => update(section.block_key, { image_url: event.target.value.trim() || null })}
                    />
                  </div>
                </div>

                <fieldset className="space-y-2">
                  <legend className="text-xs font-medium text-foreground">Mostrar apenas nestes dias</legend>
                  <div className="flex flex-wrap gap-1">
                    {WEEK.map((day, dayIndex) => {
                      const selected = (rule.days ?? []).includes(dayIndex);
                      return (
                        <Button
                          key={day}
                          type="button"
                          size="sm"
                          variant={selected ? "default" : "outline"}
                          onClick={() => {
                            const days = new Set(rule.days ?? []);
                            if (selected) days.delete(dayIndex);
                            else days.add(dayIndex);
                            updateRule(section.block_key, { days: [...days].sort() });
                          }}
                          aria-pressed={selected}
                        >
                          {day}
                        </Button>
                      );
                    })}
                  </div>
                  <p className="text-xs text-muted-foreground">Nenhum dia marcado = aparece todos os dias.</p>
                </fieldset>

                <div className="grid gap-3 sm:grid-cols-2">
                  <TimeField
                    label="A partir das"
                    value={rule.startTime ?? ""}
                    onChange={(value) => updateRule(section.block_key, { startTime: value || null })}
                  />
                  <TimeField
                    label="Até as"
                    value={rule.endTime ?? ""}
                    onChange={(value) => updateRule(section.block_key, { endTime: value || null })}
                  />
                  <DateField
                    label="Início da campanha"
                    value={rule.startDate ?? ""}
                    onChange={(value) => updateRule(section.block_key, { startDate: value || null })}
                  />
                  <DateField
                    label="Fim da campanha"
                    value={rule.endDate ?? ""}
                    onChange={(value) => updateRule(section.block_key, { endDate: value || null })}
                  />
                </div>
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

function TimeField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <Input type="time" value={value} onChange={(event) => onChange(event.target.value)} />
    </div>
  );
}

function DateField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <Input type="date" value={value} onChange={(event) => onChange(event.target.value)} />
    </div>
  );
}
