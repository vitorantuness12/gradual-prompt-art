import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { INVOICE_MODELS, calcFiscalBase } from "@/lib/fiscal";
import { formatCurrency } from "@/lib/format";

export interface FiscalBaseValues {
  invoiceModel: string;
  deductionPercent: string;
  includeShippingInBase: boolean;
  discountReducesBase: boolean;
  taxRetained: boolean;
  taxPercent: string;
}

export interface FiscalBaseFieldsProps {
  values: FiscalBaseValues;
  onChange: <K extends keyof FiscalBaseValues>(key: K, value: FiscalBaseValues[K]) => void;
}

const toNumber = (value: string) => Number(value.replace(",", ".")) || 0;

/**
 * Modelo do documento e parâmetros da base de cálculo, com uma prévia em
 * cima de um pedido de exemplo (R$ 100 de itens + R$ 10 de entrega
 * - R$ 5 de desconto) para o lojista conferir antes de emitir.
 */
export function FiscalBaseFields({ values, onChange }: FiscalBaseFieldsProps) {
  const preview = calcFiscalBase(
    { subtotal: 100, deliveryFee: 10, discount: 5, total: 105 },
    {
      includeShipping: values.includeShippingInBase,
      discountReducesBase: values.discountReducesBase,
      deductionPercent: toNumber(values.deductionPercent),
      taxPercent: toNumber(values.taxPercent),
    },
  );

  return (
    <div className="grid gap-4 rounded-lg border border-border p-4">
      <div>
        <p className="text-sm font-medium text-foreground">Modelo e base de cálculo</p>
        <p className="text-xs text-muted-foreground">
          Define sobre qual valor o imposto da nota é calculado.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="grid gap-2">
          <Label>Modelo do documento</Label>
          <Select value={values.invoiceModel} onValueChange={(value) => onChange("invoiceModel", value)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {INVOICE_MODELS.map((item) => (
                <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-2">
          <Label>Dedução da base (%)</Label>
          <Input
            value={values.deductionPercent}
            onChange={(event) => onChange("deductionPercent", event.target.value)}
            inputMode="decimal"
            placeholder="0"
          />
          <p className="text-xs text-muted-foreground">Materiais ou subempreitada que saem da base.</p>
        </div>
      </div>

      <div className="grid gap-2">
        <label className="flex items-center justify-between gap-3 rounded-md border border-border p-3">
          <span className="text-sm text-foreground">Somar a entrega na base</span>
          <Switch
            checked={values.includeShippingInBase}
            onCheckedChange={(value) => onChange("includeShippingInBase", value)}
          />
        </label>
        <label className="flex items-center justify-between gap-3 rounded-md border border-border p-3">
          <span className="text-sm text-foreground">Descontos reduzem a base</span>
          <Switch
            checked={values.discountReducesBase}
            onCheckedChange={(value) => onChange("discountReducesBase", value)}
          />
        </label>
        <label className="flex items-center justify-between gap-3 rounded-md border border-border p-3">
          <span className="text-sm text-foreground">Imposto retido por quem contrata</span>
          <Switch checked={values.taxRetained} onCheckedChange={(value) => onChange("taxRetained", value)} />
        </label>
      </div>

      <p className="rounded-md bg-muted p-3 text-xs text-muted-foreground">
        Exemplo: pedido de {formatCurrency(105)} → dedução {formatCurrency(preview.deduction)} · base{" "}
        <span className="font-medium text-foreground">{formatCurrency(preview.base)}</span> · imposto{" "}
        <span className="font-medium text-foreground">{formatCurrency(preview.tax)}</span>.
      </p>
    </div>
  );
}
