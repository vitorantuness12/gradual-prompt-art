import { ArrowDown, ArrowUp, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import type { HighlightCampaignRow } from "@/lib/entry-popup-queries";
import { SELECTION_RULE_LABEL, type HighlightSelectionRule } from "@/lib/destaques";

/**
 * Editor da campanha de destaques: textos, cores, layout, regra de seleção
 * e escolha manual dos produtos com ordem.
 */
export interface CampaignDraft {
  campaign: HighlightCampaignRow;
  items: { product_id: string; badge: string | null; sort_order: number }[];
}

interface Props {
  draft: CampaignDraft;
  onChange: (draft: CampaignDraft) => void;
  products: { id: string; name: string }[];
  categories: { id: string; name: string }[];
}

const RULES = Object.keys(SELECTION_RULE_LABEL) as HighlightSelectionRule[];

export function HighlightCampaignEditor({ draft, onChange, products, categories }: Props) {
  const { campaign, items } = draft;
  const setCampaign = (patch: Partial<HighlightCampaignRow>) =>
    onChange({ ...draft, campaign: { ...campaign, ...patch } });
  const setItems = (next: CampaignDraft["items"]) =>
    onChange({ ...draft, items: next.map((item, index) => ({ ...item, sort_order: index })) });

  const available = products.filter((product) => !items.some((item) => item.product_id === product.id));

  return (
    <div className="space-y-5">
      <Separator />
      <p className="text-sm font-medium text-foreground">Conteúdo dos destaques</p>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="hl-title">Título</Label>
          <Input id="hl-title" value={campaign.title} onChange={(e) => setCampaign({ title: e.target.value })} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="hl-button">Texto do botão de adicionar</Label>
          <Input
            id="hl-button"
            value={campaign.add_button_text}
            onChange={(e) => setCampaign({ add_button_text: e.target.value })}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="hl-subtitle">Subtítulo</Label>
        <Textarea
          id="hl-subtitle"
          rows={2}
          value={campaign.subtitle}
          onChange={(e) => setCampaign({ subtitle: e.target.value })}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="hl-icon">Ícone ou imagem do cabeçalho (URL)</Label>
          <Input
            id="hl-icon"
            value={campaign.icon ?? ""}
            placeholder="Deixe vazio para usar o ícone padrão"
            onChange={(e) => setCampaign({ icon: e.target.value || null })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="hl-badge">Selo padrão dos produtos</Label>
          <Input
            id="hl-badge"
            value={campaign.badge ?? ""}
            placeholder="Ex.: Oferta do dia"
            onChange={(e) => setCampaign({ badge: e.target.value || null })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="hl-header-color">Cor do cabeçalho</Label>
          <Input
            id="hl-header-color"
            type="color"
            value={campaign.header_color ?? "#111827"}
            onChange={(e) => setCampaign({ header_color: e.target.value })}
          />
          <Button variant="ghost" size="sm" onClick={() => setCampaign({ header_color: null })}>
            Usar cor do tema
          </Button>
        </div>
        <div className="space-y-2">
          <Label htmlFor="hl-text-color">Cor do texto</Label>
          <Input
            id="hl-text-color"
            type="color"
            value={campaign.text_color ?? "#ffffff"}
            onChange={(e) => setCampaign({ text_color: e.target.value })}
          />
          <Button variant="ghost" size="sm" onClick={() => setCampaign({ text_color: null })}>
            Usar cor do tema
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>Layout</Label>
          <Select value={campaign.layout} onValueChange={(layout) => setCampaign({ layout })}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="list">Lista</SelectItem>
              <SelectItem value="grid">Grade</SelectItem>
              <SelectItem value="carousel">Carrossel</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="hl-max">Quantidade de produtos</Label>
          <Input
            id="hl-max"
            type="number"
            min={1}
            max={24}
            value={campaign.max_items}
            onChange={(e) => setCampaign({ max_items: Math.min(24, Math.max(1, Number(e.target.value) || 1)) })}
          />
        </div>
        <div className="space-y-2">
          <Label>Regra de seleção</Label>
          <Select value={campaign.selection_rule} onValueChange={(selection_rule) => setCampaign({ selection_rule })}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {RULES.map((rule) => (
                <SelectItem key={rule} value={rule}>
                  {SELECTION_RULE_LABEL[rule]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {campaign.selection_rule === "category" ? (
          <div className="space-y-2">
            <Label>Categoria</Label>
            <Select
              value={campaign.category_id ?? ""}
              onValueChange={(category_id) => setCampaign({ category_id })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Escolha a categoria" />
              </SelectTrigger>
              <SelectContent>
                {categories.map((category) => (
                  <SelectItem key={category.id} value={category.id}>
                    {category.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}
      </div>

      <div className="flex items-center justify-between gap-3">
        <Label htmlFor="hl-original" className="text-sm">
          Mostrar preço original riscado nas promoções
        </Label>
        <Switch
          id="hl-original"
          checked={campaign.show_original_price}
          onCheckedChange={(show_original_price) => setCampaign({ show_original_price })}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="hl-start">Campanha começa em</Label>
          <Input
            id="hl-start"
            type="datetime-local"
            value={campaign.starts_at ? campaign.starts_at.slice(0, 16) : ""}
            onChange={(e) => setCampaign({ starts_at: e.target.value ? new Date(e.target.value).toISOString() : null })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="hl-end">Campanha termina em</Label>
          <Input
            id="hl-end"
            type="datetime-local"
            value={campaign.ends_at ? campaign.ends_at.slice(0, 16) : ""}
            onChange={(e) => setCampaign({ ends_at: e.target.value ? new Date(e.target.value).toISOString() : null })}
          />
        </div>
      </div>

      {campaign.selection_rule === "manual" ? (
        <div className="space-y-3">
          <Label>Produtos selecionados</Label>
          {items.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum produto escolhido ainda.</p>
          ) : (
            <ul className="space-y-2">
              {items.map((item, index) => (
                <li
                  key={item.product_id}
                  className="flex flex-wrap items-center gap-2 rounded-[var(--radius)] border border-border p-2"
                >
                  <span className="flex-1 text-sm text-foreground">
                    {products.find((product) => product.id === item.product_id)?.name ?? "Produto removido"}
                  </span>
                  <Input
                    value={item.badge ?? ""}
                    placeholder="Selo"
                    className="w-32"
                    onChange={(e) => {
                      const next = [...items];
                      next[index] = { ...item, badge: e.target.value || null };
                      setItems(next);
                    }}
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    aria-label="Subir"
                    disabled={index === 0}
                    onClick={() => {
                      const next = [...items];
                      const previous = next[index - 1];
                      const current = next[index];
                      if (!previous || !current) return;
                      next[index - 1] = current;
                      next[index] = previous;
                      setItems(next);
                    }}
                  >
                    <ArrowUp className="size-4" aria-hidden="true" />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    aria-label="Descer"
                    disabled={index === items.length - 1}
                    onClick={() => {
                      const next = [...items];
                      const following = next[index + 1];
                      const current = next[index];
                      if (!following || !current) return;
                      next[index + 1] = current;
                      next[index] = following;
                      setItems(next);
                    }}
                  >
                    <ArrowDown className="size-4" aria-hidden="true" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Remover"
                    onClick={() => setItems(items.filter((_, position) => position !== index))}
                  >
                    <Trash2 className="size-4" aria-hidden="true" />
                  </Button>
                </li>
              ))}
            </ul>
          )}

          {available.length > 0 ? (
            <Select
              value=""
              onValueChange={(product_id) =>
                setItems([...items, { product_id, badge: null, sort_order: items.length }])
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Adicionar produto ao destaque" />
              </SelectTrigger>
              <SelectContent>
                {available.map((product) => (
                  <SelectItem key={product.id} value={product.id}>
                    {product.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
