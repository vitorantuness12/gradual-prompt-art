import { useState } from "react";
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
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency } from "@/lib/format";
import {
  EMPTY_BUILDER,
  FLAVOR_RULES,
  parseBuilder,
  quoteBuilder,
  type BuilderConfig,
  type BuilderIngredient,
  type BuilderOption,
  type BuilderSize,
  type FlavorRule,
} from "@/lib/montador";

interface ProductOption {
  id: string;
  name: string;
  builder_config: unknown;
}

const newId = () => Math.random().toString(36).slice(2, 9);

type OptionListKey = "flavors" | "crusts" | "doughs" | "extras";

/** Editor do montador (pizza e similares) para um item do catálogo. */
export function BuilderEditor({
  storeId,
  products,
}: {
  storeId: string;
  products: ProductOption[];
}) {
  const [productId, setProductId] = useState<string>(products[0]?.id ?? "");
  const [config, setConfig] = useState<BuilderConfig>(() =>
    parseBuilder(products[0]?.builder_config),
  );
  const [saving, setSaving] = useState(false);

  function selectProduct(id: string) {
    setProductId(id);
    setConfig(parseBuilder(products.find((product) => product.id === id)?.builder_config));
  }

  function update(patch: Partial<BuilderConfig>) {
    setConfig((current) => ({ ...current, ...patch }));
  }

  function addSize() {
    const size: BuilderSize = { id: newId(), label: "Novo tamanho", basePrice: 0, maxFlavors: 1 };
    update({ sizes: [...config.sizes, size] });
  }

  function updateSize(id: string, patch: Partial<BuilderSize>) {
    update({ sizes: config.sizes.map((size) => (size.id === id ? { ...size, ...patch } : size)) });
  }

  function addOption(list: OptionListKey) {
    const option: BuilderOption = { id: newId(), label: "Nova opção", price: 0 };
    update({ [list]: [...config[list], option] } as Partial<BuilderConfig>);
  }

  function updateOption(list: OptionListKey, id: string, patch: Partial<BuilderOption>) {
    update({
      [list]: config[list].map((option) => (option.id === id ? { ...option, ...patch } : option)),
    } as Partial<BuilderConfig>);
  }

  function removeFrom(list: OptionListKey | "sizes" | "ingredients", id: string) {
    if (list === "sizes") {
      update({ sizes: config.sizes.filter((size) => size.id !== id) });
      return;
    }
    if (list === "ingredients") {
      update({ ingredients: config.ingredients.filter((item) => item.id !== id) });
      return;
    }
    update({ [list]: config[list].filter((option) => option.id !== id) } as Partial<BuilderConfig>);
  }

  function addIngredient() {
    const ingredient: BuilderIngredient = { id: newId(), label: "Ingrediente", removable: true };
    update({ ingredients: [...config.ingredients, ingredient] });
  }

  async function save() {
    if (!productId) return;
    setSaving(true);
    const { error } = await supabase
      .from("products")
      .update({ builder_config: config as never, builder_kind: config.enabled ? "pizza" : null })
      .eq("id", productId)
      .eq("store_id", storeId);
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Montador salvo. O cliente já vê as opções na loja.");
  }

  // Prévia com a primeira combinação possível.
  const preview =
    config.sizes.length > 0 && config.flavors.length > 0
      ? quoteBuilder(config, {
          sizeId: config.sizes[0]!.id,
          flavorIds: config.flavors
            .slice(0, config.sizes[0]!.maxFlavors)
            .map((flavor) => flavor.id),
          crustId: config.crusts[0]?.id ?? null,
          doughId: config.doughs[0]?.id ?? null,
          extraIds: [],
          removedIngredientIds: [],
          quantity: 1,
        })
      : null;

  if (products.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Cadastre um item no catálogo para configurar o montador.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Montador configurável</CardTitle>
          <CardDescription>
            Defina tamanhos, sabores, bordas, massas, adicionais e ingredientes removíveis. A regra
            de preço decide como combinar vários sabores.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="builder-product">Item</Label>
              <Select value={productId} onValueChange={selectProduct}>
                <SelectTrigger id="builder-product">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {products.map((product) => (
                    <SelectItem key={product.id} value={product.id}>
                      {product.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="builder-rule">Regra de preço dos sabores</Label>
              <Select
                value={config.flavorRule}
                onValueChange={(value) => update({ flavorRule: value as FlavorRule })}
              >
                <SelectTrigger id="builder-rule">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FLAVOR_RULES.map((rule) => (
                    <SelectItem key={rule.key} value={rule.key}>
                      {rule.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="mt-1 text-xs text-muted-foreground">
                {FLAVOR_RULES.find((rule) => rule.key === config.flavorRule)?.help}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-4 rounded-xl border border-border/70 p-3">
            <label className="flex items-center gap-2 text-sm">
              <Switch
                checked={config.enabled}
                onCheckedChange={(checked) => update({ enabled: checked })}
              />
              Montador ativo neste item
            </label>
            <div className="flex items-center gap-2 text-sm">
              <Label htmlFor="builder-max-extras" className="mb-0">
                Máx. adicionais
              </Label>
              <Input
                id="builder-max-extras"
                className="w-20"
                type="number"
                min="0"
                max="20"
                value={config.maxExtras}
                onChange={(event) => update({ maxExtras: Number(event.target.value) || 0 })}
              />
            </div>
            <div className="flex items-center gap-2 text-sm">
              <Label htmlFor="builder-label" className="mb-0">
                Título
              </Label>
              <Input
                id="builder-label"
                className="w-52"
                value={config.label}
                onChange={(event) => update({ label: event.target.value })}
              />
            </div>
          </div>

          {/* Tamanhos */}
          <section>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-medium">Tamanhos</h3>
              <Button type="button" size="sm" variant="outline" onClick={addSize}>
                Adicionar tamanho
              </Button>
            </div>
            <div className="space-y-2">
              {config.sizes.map((size) => (
                <div key={size.id} className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <Input
                    aria-label="Nome do tamanho"
                    value={size.label}
                    onChange={(event) => updateSize(size.id, { label: event.target.value })}
                  />
                  <Input
                    aria-label="Preço base"
                    type="number"
                    step="0.01"
                    min="0"
                    value={size.basePrice}
                    onChange={(event) =>
                      updateSize(size.id, { basePrice: Number(event.target.value) || 0 })
                    }
                  />
                  <Input
                    aria-label="Máximo de sabores"
                    type="number"
                    min="1"
                    max="8"
                    value={size.maxFlavors}
                    onChange={(event) =>
                      updateSize(size.id, { maxFlavors: Number(event.target.value) || 1 })
                    }
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => removeFrom("sizes", size.id)}
                  >
                    Remover
                  </Button>
                </div>
              ))}
              {config.sizes.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nenhum tamanho: adicione ao menos um.
                </p>
              ) : null}
            </div>
          </section>

          {/* Listas de opções */}
          {(
            [
              { key: "flavors", label: "Sabores" },
              { key: "crusts", label: "Bordas" },
              { key: "doughs", label: "Massas" },
              { key: "extras", label: "Adicionais" },
            ] as { key: OptionListKey; label: string }[]
          ).map((list) => (
            <section key={list.key}>
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-medium">{list.label}</h3>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => addOption(list.key)}
                >
                  Adicionar
                </Button>
              </div>
              <div className="space-y-2">
                {config[list.key].map((option) => (
                  <div key={option.id} className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    <Input
                      aria-label={`Nome em ${list.label}`}
                      value={option.label}
                      onChange={(event) =>
                        updateOption(list.key, option.id, { label: event.target.value })
                      }
                    />
                    <Input
                      aria-label={`Preço em ${list.label}`}
                      type="number"
                      step="0.01"
                      min="0"
                      value={option.price}
                      onChange={(event) =>
                        updateOption(list.key, option.id, {
                          price: Number(event.target.value) || 0,
                        })
                      }
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => removeFrom(list.key, option.id)}
                    >
                      Remover
                    </Button>
                  </div>
                ))}
              </div>
            </section>
          ))}

          {/* Ingredientes */}
          <section>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-medium">Ingredientes que o cliente pode remover</h3>
              <Button type="button" size="sm" variant="outline" onClick={addIngredient}>
                Adicionar
              </Button>
            </div>
            <div className="space-y-2">
              {config.ingredients.map((ingredient) => (
                <div key={ingredient.id} className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  <Input
                    aria-label="Ingrediente"
                    value={ingredient.label}
                    onChange={(event) =>
                      update({
                        ingredients: config.ingredients.map((item) =>
                          item.id === ingredient.id ? { ...item, label: event.target.value } : item,
                        ),
                      })
                    }
                  />
                  <label className="flex items-center gap-2 text-sm">
                    <Switch
                      checked={ingredient.removable}
                      onCheckedChange={(checked) =>
                        update({
                          ingredients: config.ingredients.map((item) =>
                            item.id === ingredient.id ? { ...item, removable: checked } : item,
                          ),
                        })
                      }
                    />
                    Pode remover
                  </label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => removeFrom("ingredients", ingredient.id)}
                  >
                    Remover
                  </Button>
                </div>
              ))}
            </div>
          </section>

          <div className="flex flex-wrap items-center gap-3">
            <Button type="button" disabled={saving} onClick={save}>
              {saving ? "Salvando..." : "Salvar montador"}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setConfig({ ...EMPTY_BUILDER })}>
              Limpar
            </Button>
            {preview ? (
              <span className="text-sm text-muted-foreground">
                Prévia: {preview.description} = <strong>{formatCurrency(preview.unitPrice)}</strong>
              </span>
            ) : null}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
