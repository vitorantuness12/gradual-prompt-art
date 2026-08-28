import { useEffect, useMemo, useState } from "react";
import { Scale, Stethoscope } from "lucide-react";

import { Button } from "@/components/ui/button";
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
import { formatCurrency } from "@/lib/format";
import { formatWeight, parseWeightInput, weightLineTotal } from "@/lib/peso";
import { unitPriceOf, type PosProductLike } from "@/lib/pos-kds";

export interface WeightSaleProduct extends PosProductLike {
  sold_by_weight?: boolean;
  unit_label?: string | null;
  requires_prescription?: boolean;
}

/**
 * Lançamento de item vendido por peso (balança) e/ou de venda controlada.
 * O operador digita o peso, o valor em reais, ou a etiqueta já preenche tudo.
 */
export function PosWeightDialog({
  product,
  suggestedWeight,
  onClose,
  onConfirm,
}: {
  product: WeightSaleProduct | null;
  suggestedWeight?: number;
  onClose: () => void;
  onConfirm: (input: { weight: number; unitLabel: string; prescriptionInfo: string }) => void;
}) {
  const [weight, setWeight] = useState("");
  const [amount, setAmount] = useState("");
  const [prescription, setPrescription] = useState("");

  const unit = product?.unit_label && product.unit_label !== "un" ? product.unit_label : "kg";
  const price = product ? unitPriceOf(product) : 0;
  const byWeight = Boolean(product?.sold_by_weight);

  useEffect(() => {
    if (!product) return;
    setWeight(suggestedWeight && suggestedWeight > 0 ? String(suggestedWeight).replace(".", ",") : "");
    setAmount("");
    setPrescription("");
  }, [product, suggestedWeight]);

  const parsedWeight = useMemo(() => {
    if (!byWeight) return 1;
    const direct = parseWeightInput(weight);
    if (direct > 0) return direct;
    const money = parseWeightInput(amount);
    if (money > 0 && price > 0) return Math.round((money / price) * 1000) / 1000;
    return 0;
  }, [byWeight, weight, amount, price]);

  const total = byWeight ? weightLineTotal(parsedWeight, price) : price;
  const missingPrescription = Boolean(product?.requires_prescription) && prescription.trim().length < 3;
  const canConfirm = (!byWeight || parsedWeight > 0) && !missingPrescription;

  return (
    <Dialog open={Boolean(product)} onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {byWeight ? <Scale className="size-4" aria-hidden="true" /> : <Stethoscope className="size-4" aria-hidden="true" />}
            {product?.name}
          </DialogTitle>
          <DialogDescription>
            {byWeight
              ? `Item vendido por ${unit} — ${formatCurrency(price)} por ${unit}. Digite o peso ou o valor, ou passe a etiqueta da balança.`
              : "Item de venda controlada: registre os dados da receita para concluir."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {byWeight ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="pos-weight">Peso ({unit})</Label>
                <Input
                  id="pos-weight"
                  autoFocus
                  inputMode="decimal"
                  placeholder="0,000"
                  value={weight}
                  onChange={(event) => {
                    setWeight(event.target.value);
                    setAmount("");
                  }}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pos-weight-amount">Ou valor (R$)</Label>
                <Input
                  id="pos-weight-amount"
                  inputMode="decimal"
                  placeholder="0,00"
                  value={amount}
                  onChange={(event) => {
                    setAmount(event.target.value);
                    setWeight("");
                  }}
                />
              </div>
            </div>
          ) : null}

          {product?.requires_prescription ? (
            <div className="space-y-1.5">
              <Label htmlFor="pos-prescription">Receita / registro do profissional</Label>
              <Input
                id="pos-prescription"
                placeholder="Ex.: CRM 12345 - Dra. Ana / receita 08/2026"
                value={prescription}
                onChange={(event) => setPrescription(event.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Obrigatório para itens controlados. Fica registrado no pedido.
              </p>
            </div>
          ) : null}

          <div className="rounded-xl border border-border bg-secondary/40 px-3 py-2 text-sm">
            <span className="text-muted-foreground">
              {byWeight ? `${formatWeight(parsedWeight, unit)} · ` : ""}Total da linha
            </span>{" "}
            <strong className="text-base">{formatCurrency(total)}</strong>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            disabled={!canConfirm}
            onClick={() =>
              onConfirm({
                weight: byWeight ? parsedWeight : 0,
                unitLabel: byWeight ? unit : "un",
                prescriptionInfo: prescription.trim(),
              })
            }
          >
            Adicionar à venda
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
