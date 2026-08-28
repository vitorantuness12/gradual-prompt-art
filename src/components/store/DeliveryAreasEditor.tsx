import { Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DELIVERY_MODE_LABEL, type DeliveryArea, type DeliveryMode } from "@/lib/store-config";

export interface DeliveryAreasEditorProps {
  mode: DeliveryMode;
  onModeChange: (mode: DeliveryMode) => void;
  areas: DeliveryArea[];
  onAreasChange: (areas: DeliveryArea[]) => void;
  baseFee: number;
  onBaseFeeChange: (fee: number) => void;
}

function fieldLabels(mode: DeliveryMode): { from: string; to: string | null } {
  if (mode === "district") return { from: "Bairro", to: null };
  if (mode === "zip") return { from: "CEP inicial", to: "CEP final" };
  if (mode === "radius") return { from: "De (km)", to: "Até (km)" };
  return { from: "Descrição", to: null };
}

/** Configuração de áreas de entrega por bairro, CEP, distância ou taxa única. */
export function DeliveryAreasEditor({
  mode,
  onModeChange,
  areas,
  onAreasChange,
  baseFee,
  onBaseFeeChange,
}: DeliveryAreasEditorProps) {
  const labels = fieldLabels(mode);

  function update(index: number, patch: Partial<DeliveryArea>) {
    onAreasChange(areas.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="modo-entrega">Como calcular a entrega</Label>
          <Select value={mode} onValueChange={(next) => onModeChange(next as DeliveryMode)}>
            <SelectTrigger id="modo-entrega">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(DELIVERY_MODE_LABEL) as DeliveryMode[]).map((key) => (
                <SelectItem key={key} value={key}>
                  {DELIVERY_MODE_LABEL[key]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="taxa-padrao">Taxa padrão (R$)</Label>
          <Input
            id="taxa-padrao"
            type="number"
            min={0}
            step="0.01"
            value={baseFee}
            onChange={(event) => onBaseFeeChange(Number(event.target.value))}
          />
          <p className="text-xs text-muted-foreground">Usada quando o endereço não se encaixa em nenhuma faixa.</p>
        </div>
      </div>

      {mode === "fixed" ? (
        <p className="rounded-xl border border-border/70 bg-muted/40 p-3 text-sm text-muted-foreground">
          Todos os pedidos com entrega usarão a taxa padrão acima.
        </p>
      ) : (
        <div className="space-y-3">
          {areas.map((area, index) => (
            <div key={area.id} className="grid gap-2 rounded-xl border border-border/70 p-3 sm:grid-cols-6">
              <div className="space-y-1 sm:col-span-2">
                <Label className="text-xs">{labels.from}</Label>
                <Input value={area.from} onChange={(event) => update(index, { from: event.target.value })} />
              </div>
              {labels.to ? (
                <div className="space-y-1">
                  <Label className="text-xs">{labels.to}</Label>
                  <Input value={area.to} onChange={(event) => update(index, { to: event.target.value })} />
                </div>
              ) : null}
              <div className="space-y-1">
                <Label className="text-xs">Taxa (R$)</Label>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={area.fee}
                  onChange={(event) => update(index, { fee: Number(event.target.value) })}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Pedido mín. (R$)</Label>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={area.minOrder}
                  onChange={(event) => update(index, { minOrder: Number(event.target.value) })}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Prazo (min)</Label>
                <Input
                  type="number"
                  min={0}
                  value={area.minutes}
                  onChange={(event) => update(index, { minutes: Number(event.target.value) })}
                />
              </div>
              <div className="flex items-end">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => onAreasChange(areas.filter((_, i) => i !== index))}
                  aria-label="Remover área de entrega"
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            </div>
          ))}

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              onAreasChange([
                ...areas,
                { id: crypto.randomUUID(), label: "", from: "", to: "", fee: baseFee, minOrder: 0, minutes: 40 },
              ])
            }
          >
            <Plus className="mr-1 size-4" aria-hidden="true" />
            Adicionar área
          </Button>
        </div>
      )}
    </div>
  );
}
