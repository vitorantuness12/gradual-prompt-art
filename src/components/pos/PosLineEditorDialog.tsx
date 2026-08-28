import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatCurrency } from "@/lib/format";
import { lineTotal, type PosLineOption, type PosSaleLine } from "@/lib/pos-sale";
import { Minus, Plus } from "lucide-react";
import { useEffect, useState } from "react";

export interface ProductOptionGroup {
  id: string;
  name: string;
  is_required: boolean;
  max_select: number;
  options: { id: string; name: string; price: number }[];
}

interface PosLineEditorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  line: PosSaleLine | null;
  optionGroups: ProductOptionGroup[];
  canDiscount: boolean;
  onSave: (patch: Partial<PosSaleLine>) => void;
  onRequestDiscountApproval: () => void;
}

/**
 * Edição do item já lançado: quantidade, adicionais/variações, observação e
 * desconto da linha. O desconto exige permissão (ou autorização de gerente).
 */
export function PosLineEditorDialog({
  open,
  onOpenChange,
  line,
  optionGroups,
  canDiscount,
  onSave,
  onRequestDiscountApproval,
}: PosLineEditorDialogProps) {
  const [quantity, setQuantity] = useState(1);
  const [notes, setNotes] = useState("");
  const [discount, setDiscount] = useState("");
  const [selected, setSelected] = useState<PosLineOption[]>([]);

  useEffect(() => {
    if (!open || !line) return;
    setQuantity(line.quantity);
    setNotes(line.notes);
    setDiscount(line.discount > 0 ? String(line.discount) : "");
    setSelected(line.options.map((option) => ({ ...option })));
  }, [open, line]);

  if (!line) return null;

  function toggleOption(option: { name: string; price: number }, checked: boolean) {
    setSelected((current) =>
      checked
        ? [...current.filter((item) => item.name !== option.name), { name: option.name, price: Number(option.price) }]
        : current.filter((item) => item.name !== option.name),
    );
  }

  const preview = lineTotal({ ...line, quantity, options: selected, discount: Number(discount.replace(",", ".")) || 0 });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{line.name}</DialogTitle>
          <DialogDescription>Ajuste quantidade, adicionais, observação e desconto deste item.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Quantidade</Label>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="icon"
                className="size-12"
                aria-label="Diminuir quantidade"
                onClick={() => setQuantity((value) => Math.max(1, value - 1))}
              >
                <Minus className="size-5" aria-hidden="true" />
              </Button>
              <Input
                className="h-12 w-20 text-center text-lg font-bold"
                inputMode="numeric"
                value={quantity}
                onChange={(event) => setQuantity(Math.max(1, Number(event.target.value.replace(/\D/g, "")) || 1))}
                aria-label="Quantidade"
              />
              <Button
                variant="outline"
                size="icon"
                className="size-12"
                aria-label="Aumentar quantidade"
                onClick={() => setQuantity((value) => value + 1)}
              >
                <Plus className="size-5" aria-hidden="true" />
              </Button>
            </div>
          </div>

          {optionGroups.length > 0 ? (
            <div className="space-y-3">
              {optionGroups.map((group) => (
                <fieldset key={group.id} className="space-y-2 rounded-xl border border-border p-3">
                  <legend className="px-1 text-sm font-semibold">
                    {group.name}
                    {group.is_required ? <span className="ml-1 text-destructive">*</span> : null}
                  </legend>
                  {group.options.map((option) => {
                    const checked = selected.some((item) => item.name === option.name);
                    return (
                      <label key={option.id} className="flex items-center gap-2 text-sm">
                        <Checkbox
                          checked={checked}
                          onCheckedChange={(value) => toggleOption(option, value === true)}
                          aria-label={option.name}
                        />
                        <span className="flex-1">{option.name}</span>
                        {Number(option.price) > 0 ? (
                          <span className="text-muted-foreground tabular-nums">+ {formatCurrency(Number(option.price))}</span>
                        ) : null}
                      </label>
                    );
                  })}
                </fieldset>
              ))}
            </div>
          ) : null}

          <div className="space-y-1.5">
            <Label htmlFor="linha-obs">Observação para a cozinha</Label>
            <Textarea
              id="linha-obs"
              rows={2}
              value={notes}
              onChange={(event) => setNotes(event.target.value.slice(0, 200))}
              placeholder="Sem cebola, ponto da carne, embalar separado..."
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="linha-desconto">Desconto neste item (R$)</Label>
            <div className="flex gap-2">
              <Input
                id="linha-desconto"
                className="h-11"
                inputMode="decimal"
                disabled={!canDiscount}
                value={discount}
                onChange={(event) => setDiscount(event.target.value)}
                placeholder={canDiscount ? "0,00" : "Requer autorização"}
              />
              {!canDiscount ? (
                <Button type="button" variant="outline" className="h-11" onClick={onRequestDiscountApproval}>
                  Autorizar
                </Button>
              ) : null}
            </div>
          </div>

          <p className="rounded-xl bg-secondary p-3 text-sm font-semibold">
            Total do item: <span className="tabular-nums">{formatCurrency(preview)}</span>
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={() => {
              onSave({
                quantity,
                notes: notes.trim(),
                options: selected,
                discount: Number(discount.replace(",", ".")) || 0,
              });
              onOpenChange(false);
            }}
          >
            Salvar item
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
