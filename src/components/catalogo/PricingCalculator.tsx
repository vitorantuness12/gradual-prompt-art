import { useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency } from "@/lib/format";
import {
  DEFAULT_COSTS,
  ROUNDING_OPTIONS,
  calculatePricing,
  marginForPrice,
  parsePricing,
  type CostInput,
  type RoundingMode,
} from "@/lib/precificacao";

interface ProductOption {
  id: string;
  name: string;
  price: number;
  promo_price: number | null;
  pricing: unknown;
}

/**
 * Calculadora de preço de venda.
 * Pode trabalhar solta (simulação) ou salvar a ficha de custos no produto.
 */
export function PricingCalculator({
  storeId,
  products,
}: {
  storeId: string;
  products: ProductOption[];
}) {
  const [productId, setProductId] = useState<string>("none");
  const [rounding, setRounding] = useState<RoundingMode>("none");
  const [costs, setCosts] = useState<CostInput>({ ...DEFAULT_COSTS, productCost: 10 });
  const [saving, setSaving] = useState(false);

  const selected = products.find((product) => product.id === productId) ?? null;
  const result = useMemo(() => calculatePricing(costs, rounding), [costs, rounding]);

  function set<K extends keyof CostInput>(key: K, value: string) {
    const parsed = Number(value.replace(",", "."));
    setCosts((current) => ({ ...current, [key]: Number.isFinite(parsed) ? parsed : 0 }));
  }

  function loadProduct(id: string) {
    setProductId(id);
    const product = products.find((item) => item.id === id);
    if (!product) return;
    const saved = parsePricing(product.pricing);
    setRounding(saved.rounding);
    setCosts({
      ...saved,
      ...(product.promo_price != null ? { promoPrice: Number(product.promo_price) } : {}),
      currentPrice: Number(product.price),
    });
  }

  async function saveToProduct(applyPrice: boolean) {
    if (!selected) return;
    setSaving(true);
    const payload = {
      pricing: { ...costs, rounding } as never,
      ...(applyPrice ? { price: result.recommendedPrice } : {}),
    };
    const { error } = await supabase
      .from("products")
      .update(payload)
      .eq("id", selected.id)
      .eq("store_id", storeId);
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(
      applyPrice ? "Ficha salva e preço atualizado." : "Ficha de custos salva no produto.",
    );
  }

  const fields: { key: keyof CostInput; label: string; suffix: string; help: string }[] = [
    {
      key: "productCost",
      label: "Custo do produto",
      suffix: "R$",
      help: "Insumos ou compra da mercadoria.",
    },
    {
      key: "packagingCost",
      label: "Embalagem",
      suffix: "R$",
      help: "Caixa, sacola, etiqueta, talheres.",
    },
    {
      key: "laborCost",
      label: "Mão de obra",
      suffix: "R$",
      help: "Tempo de preparo rateado por unidade.",
    },
    {
      key: "otherCost",
      label: "Outros custos",
      suffix: "R$",
      help: "Energia, gás, rateio de despesas fixas.",
    },
    {
      key: "deliveryCost",
      label: "Entrega assumida",
      suffix: "R$",
      help: "Parte do frete que a loja paga.",
    },
    { key: "taxPercent", label: "Impostos", suffix: "%", help: "Percentual sobre a venda." },
    {
      key: "gatewayPercent",
      label: "Taxa do gateway",
      suffix: "%",
      help: "Percentual do meio de pagamento.",
    },
    {
      key: "channelPercent",
      label: "Comissão do canal",
      suffix: "%",
      help: "Marketplace ou parceiro (opcional).",
    },
    {
      key: "marginPercent",
      label: "Margem desejada",
      suffix: "%",
      help: "Lucro sobre o preço final.",
    },
    {
      key: "maxDiscountPercent",
      label: "Desconto máximo",
      suffix: "%",
      help: "Maior desconto autorizado na venda.",
    },
  ];

  return (
    <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Componentes do preço</CardTitle>
          <CardDescription>
            Custos em reais entram por unidade; percentuais incidem sobre o preço final. Escolha um
            item para carregar e salvar a ficha de custos.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="pricing-product">Item do catálogo</Label>
              <Select value={productId} onValueChange={loadProduct}>
                <SelectTrigger id="pricing-product">
                  <SelectValue placeholder="Simulação avulsa" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Simulação avulsa</SelectItem>
                  {products.map((product) => (
                    <SelectItem key={product.id} value={product.id}>
                      {product.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="pricing-rounding">Arredondamento</Label>
              <Select
                value={rounding}
                onValueChange={(value) => setRounding(value as RoundingMode)}
              >
                <SelectTrigger id="pricing-rounding">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROUNDING_OPTIONS.map((option) => (
                    <SelectItem key={option.key} value={option.key}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="mt-1 text-xs text-muted-foreground">
                {ROUNDING_OPTIONS.find((option) => option.key === rounding)?.help}
              </p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {fields.map((field) => (
              <div key={String(field.key)}>
                <Label htmlFor={`pricing-${String(field.key)}`}>
                  {field.label} ({field.suffix})
                </Label>
                <Input
                  id={`pricing-${String(field.key)}`}
                  type="number"
                  step="0.01"
                  min="0"
                  value={String(costs[field.key] ?? 0)}
                  onChange={(event) => set(field.key, event.target.value)}
                />
                <p className="mt-1 text-xs text-muted-foreground">{field.help}</p>
              </div>
            ))}
            <div>
              <Label htmlFor="pricing-promo">Preço promocional (R$)</Label>
              <Input
                id="pricing-promo"
                type="number"
                step="0.01"
                min="0"
                value={String(costs.promoPrice ?? "")}
                onChange={(event) => set("promoPrice", event.target.value)}
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Conferimos se ainda sobra lucro nesse valor.
              </p>
            </div>
          </div>

          {selected ? (
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" disabled={saving} onClick={() => saveToProduct(false)}>
                Salvar ficha de custos
              </Button>
              <Button disabled={saving} onClick={() => saveToProduct(true)}>
                Salvar e aplicar {formatCurrency(result.recommendedPrice)}
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Resultado</CardTitle>
          <CardDescription>
            Preço que cobre todos os custos e entrega a margem desejada.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="rounded-2xl bg-secondary/40 p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              Preço recomendado
            </p>
            <p className="text-3xl font-semibold">{formatCurrency(result.recommendedPrice)}</p>
            {rounding !== "none" && result.rawPrice !== result.recommendedPrice ? (
              <p className="text-xs text-muted-foreground">
                Sem arredondar: {formatCurrency(result.rawPrice)}
              </p>
            ) : null}
          </div>

          <ul className="space-y-1">
            <li className="flex justify-between">
              <span className="text-muted-foreground">Custos fixos por unidade</span>
              <span>{formatCurrency(result.fixedCost)}</span>
            </li>
            <li className="flex justify-between">
              <span className="text-muted-foreground">Taxas sobre o preço</span>
              <span>{result.variablePercent}%</span>
            </li>
            <li className="flex justify-between">
              <span className="text-muted-foreground">Custo total</span>
              <span>{formatCurrency(result.totalCost)}</span>
            </li>
            <li className="flex justify-between font-medium">
              <span>Lucro bruto</span>
              <span className={result.grossProfit >= 0 ? "text-emerald-600" : "text-destructive"}>
                {formatCurrency(result.grossProfit)}
              </span>
            </li>
            <li className="flex justify-between font-medium">
              <span>Margem</span>
              <span>{result.marginPercent}%</span>
            </li>
            <li className="flex justify-between">
              <span className="text-muted-foreground">Preço mínimo com desconto</span>
              <span>
                {formatCurrency(result.minPrice)} ({result.minMarginPercent}%)
              </span>
            </li>
            {result.promo ? (
              <li className="flex justify-between">
                <span className="text-muted-foreground">
                  Promoção {formatCurrency(result.promo.price)}
                </span>
                <span className={result.promo.viable ? "text-emerald-600" : "text-destructive"}>
                  {formatCurrency(result.promo.profit)} ({result.promo.marginPercent}%)
                </span>
              </li>
            ) : null}
            {selected ? (
              <li className="flex justify-between">
                <span className="text-muted-foreground">Preço atual do item</span>
                <span>
                  {formatCurrency(Number(selected.price))} (
                  {marginForPrice(costs, Number(selected.price))}%)
                </span>
              </li>
            ) : null}
          </ul>

          {result.warnings.length > 0 ? (
            <ul className="space-y-1 rounded-xl border border-amber-500/40 bg-amber-500/5 p-3 text-xs">
              {result.warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          ) : null}

          <details className="rounded-xl border border-border/70 p-3">
            <summary className="cursor-pointer text-sm font-medium">
              O que entra em cada componente
            </summary>
            <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
              {result.breakdown.map((line) => (
                <li key={line.key}>
                  <strong>{line.label}:</strong> {line.help}{" "}
                  {line.kind === "fixed" ? formatCurrency(line.value) : `${line.value}%`}
                </li>
              ))}
            </ul>
          </details>
        </CardContent>
      </Card>
    </div>
  );
}
