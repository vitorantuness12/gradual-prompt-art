import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { formatCurrency } from "@/lib/format";
import {
  quoteBuilder,
  type BuilderConfig,
  type BuilderQuote,
  type BuilderSelection,
} from "@/lib/montador";

/**
 * Montagem do item na loja pública (pizza e similares).
 * O preço mostrado aqui é o mesmo que o servidor recalcula ao gravar o pedido.
 */
export function BuilderPicker({
  config,
  quantity,
  onConfirm,
}: {
  config: BuilderConfig;
  quantity: number;
  onConfirm: (result: {
    unitPrice: number;
    description: string;
    selection: BuilderSelection;
  }) => void;
}) {
  const [sizeId, setSizeId] = useState(config.sizes[0]?.id ?? "");
  const [flavorIds, setFlavorIds] = useState<string[]>([]);
  const [crustId, setCrustId] = useState<string>("none");
  const [doughId, setDoughId] = useState<string>("none");
  const [extraIds, setExtraIds] = useState<string[]>([]);
  const [removed, setRemoved] = useState<string[]>([]);
  const [notes, setNotes] = useState("");

  const size = config.sizes.find((item) => item.id === sizeId) ?? null;

  const selection: BuilderSelection = useMemo(
    () => ({
      sizeId,
      flavorIds,
      crustId: crustId === "none" ? null : crustId,
      doughId: doughId === "none" ? null : doughId,
      extraIds,
      removedIngredientIds: removed,
      quantity,
      notes,
    }),
    [sizeId, flavorIds, crustId, doughId, extraIds, removed, quantity, notes],
  );

  const quote: BuilderQuote = useMemo(() => quoteBuilder(config, selection), [config, selection]);

  function toggle(list: string[], setList: (value: string[]) => void, id: string, limit?: number) {
    if (list.includes(id)) {
      setList(list.filter((item) => item !== id));
      return;
    }
    if (limit != null && list.length >= limit) return;
    setList([...list, id]);
  }

  const removableIngredients = config.ingredients.filter((item) => item.removable);

  return (
    <div className="space-y-4">
      <div>
        <Label htmlFor="builder-size">Tamanho</Label>
        <Select
          value={sizeId}
          onValueChange={(value) => {
            setSizeId(value);
            const next = config.sizes.find((item) => item.id === value);
            if (next) setFlavorIds((current) => current.slice(0, next.maxFlavors));
          }}
        >
          <SelectTrigger id="builder-size">
            <SelectValue placeholder="Escolha o tamanho" />
          </SelectTrigger>
          <SelectContent>
            {config.sizes.map((item) => (
              <SelectItem key={item.id} value={item.id}>
                {item.label} · {formatCurrency(item.basePrice)} · até {item.maxFlavors} sabor(es)
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <fieldset>
        <legend className="text-sm font-medium">
          Sabores {size ? `(até ${size.maxFlavors})` : ""}
        </legend>
        <div className="mt-2 space-y-2">
          {config.flavors.map((flavor) => (
            <label key={flavor.id} className="flex items-center justify-between gap-2 text-sm">
              <span className="flex items-center gap-2">
                <Checkbox
                  checked={flavorIds.includes(flavor.id)}
                  onCheckedChange={() =>
                    toggle(flavorIds, setFlavorIds, flavor.id, size?.maxFlavors)
                  }
                  aria-label={flavor.label}
                />
                {flavor.label}
              </span>
              <span className="text-muted-foreground">{formatCurrency(flavor.price)}</span>
            </label>
          ))}
        </div>
      </fieldset>

      {config.crusts.length > 0 ? (
        <div>
          <Label htmlFor="builder-crust">Borda</Label>
          <Select value={crustId} onValueChange={setCrustId}>
            <SelectTrigger id="builder-crust">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Sem borda recheada</SelectItem>
              {config.crusts.map((crust) => (
                <SelectItem key={crust.id} value={crust.id}>
                  {crust.label} · {formatCurrency(crust.priceBySize?.[sizeId] ?? crust.price)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}

      {config.doughs.length > 0 ? (
        <div>
          <Label htmlFor="builder-dough">Massa</Label>
          <Select value={doughId} onValueChange={setDoughId}>
            <SelectTrigger id="builder-dough">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Massa tradicional</SelectItem>
              {config.doughs.map((dough) => (
                <SelectItem key={dough.id} value={dough.id}>
                  {dough.label} · {formatCurrency(dough.price)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}

      {config.extras.length > 0 ? (
        <fieldset>
          <legend className="text-sm font-medium">Adicionais (até {config.maxExtras})</legend>
          <div className="mt-2 space-y-2">
            {config.extras.map((extra) => (
              <label key={extra.id} className="flex items-center justify-between gap-2 text-sm">
                <span className="flex items-center gap-2">
                  <Checkbox
                    checked={extraIds.includes(extra.id)}
                    onCheckedChange={() =>
                      toggle(extraIds, setExtraIds, extra.id, config.maxExtras)
                    }
                    aria-label={extra.label}
                  />
                  {extra.label}
                </span>
                <span className="text-muted-foreground">+{formatCurrency(extra.price)}</span>
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}

      {removableIngredients.length > 0 ? (
        <fieldset>
          <legend className="text-sm font-medium">Remover ingredientes</legend>
          <div className="mt-2 flex flex-wrap gap-3">
            {removableIngredients.map((ingredient) => (
              <label key={ingredient.id} className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={removed.includes(ingredient.id)}
                  onCheckedChange={() => toggle(removed, setRemoved, ingredient.id)}
                  aria-label={`Sem ${ingredient.label}`}
                />
                sem {ingredient.label}
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}

      {config.notesEnabled ? (
        <div>
          <Label htmlFor="builder-notes">Observação</Label>
          <Textarea
            id="builder-notes"
            rows={2}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="Ex.: bem assada, cortar em 8 pedaços"
          />
        </div>
      ) : null}

      <div className="rounded-xl bg-secondary/40 p-3 text-sm">
        {quote.lines.map((line) => (
          <div key={line.label} className="flex justify-between">
            <span className="text-muted-foreground">{line.label}</span>
            <span>{formatCurrency(line.value)}</span>
          </div>
        ))}
        <div className="mt-2 flex justify-between font-medium">
          <span>Total ({quantity}x)</span>
          <span>{formatCurrency(quote.total)}</span>
        </div>
      </div>

      {quote.errors.length > 0 ? (
        <ul className="space-y-1 text-sm text-destructive">
          {quote.errors.map((error) => (
            <li key={error}>{error}</li>
          ))}
        </ul>
      ) : null}

      <Button
        type="button"
        className="w-full"
        disabled={!quote.ok}
        onClick={() =>
          onConfirm({ unitPrice: quote.unitPrice, description: quote.description, selection })
        }
      >
        Adicionar ao carrinho · {formatCurrency(quote.total)}
      </Button>
    </div>
  );
}
