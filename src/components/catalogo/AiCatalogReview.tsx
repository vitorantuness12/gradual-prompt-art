import { Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PRODUCT_KINDS, type ProductKind } from "@/lib/catalog";

export interface ReviewItem {
  key: string;
  selected: boolean;
  name: string;
  description: string;
  categoryName: string;
  kind: ProductKind;
  price: string;
  promoPrice: string;
  unit: string;
  durationMinutes: string;
}

interface AiCatalogReviewProps {
  items: ReviewItem[];
  /** Tipos oferecidos, conforme o ramo de atividade da loja. */
  kinds?: ProductKind[];
  /** Exibe o campo de duração (ramos de serviço). */
  showDuration?: boolean;
  onChange: (key: string, patch: Partial<ReviewItem>) => void;
  onRemove: (key: string) => void;
}

/** Tabela editável com os itens detectados pela IA antes de salvar no catálogo. */
export function AiCatalogReview({ items, kinds, showDuration, onChange, onRemove }: AiCatalogReviewProps) {
  const kindOptions = kinds?.length
    ? PRODUCT_KINDS.filter((kind) => kinds.includes(kind.value))
    : PRODUCT_KINDS;
  return (
    <div className="space-y-2">
      {items.map((item) => (
        <div
          key={item.key}
          className={`grid gap-2 rounded-xl border border-border/70 bg-card p-3 md:items-center ${
            showDuration
              ? "md:grid-cols-[auto_2fr_1.2fr_1fr_1fr_1fr_0.8fr_auto]"
              : "md:grid-cols-[auto_2fr_1.2fr_1fr_1fr_1fr_auto]"
          }`}
        >
          <Checkbox
            checked={item.selected}
            onCheckedChange={(checked) => onChange(item.key, { selected: checked === true })}
            aria-label={`Incluir ${item.name}`}
          />
          <Input
            value={item.name}
            onChange={(event) => onChange(item.key, { name: event.target.value })}
            aria-label="Nome do item"
            placeholder="Nome"
          />
          <Input
            value={item.categoryName}
            onChange={(event) => onChange(item.key, { categoryName: event.target.value })}
            aria-label="Categoria"
            placeholder="Categoria"
          />
          <Select
            value={item.kind}
            onValueChange={(value) => onChange(item.key, { kind: value as ProductKind })}
          >
            <SelectTrigger aria-label="Tipo do item">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {kindOptions.map((kind) => (
                <SelectItem key={kind.value} value={kind.value}>
                  {kind.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            value={item.price}
            onChange={(event) => onChange(item.key, { price: event.target.value })}
            aria-label="Preço"
            inputMode="decimal"
            placeholder="0,00"
          />
          <Input
            value={item.promoPrice}
            onChange={(event) => onChange(item.key, { promoPrice: event.target.value })}
            aria-label="Preço promocional"
            inputMode="decimal"
            placeholder="Promo"
          />
          {showDuration ? (
            <Input
              value={item.durationMinutes}
              onChange={(event) => onChange(item.key, { durationMinutes: event.target.value })}
              aria-label="Duração em minutos"
              inputMode="numeric"
              placeholder="min"
            />
          ) : null}
          <Button
            size="icon"
            variant="ghost"
            onClick={() => onRemove(item.key)}
            aria-label={`Remover ${item.name}`}
          >
            <Trash2 className="size-4" aria-hidden="true" />
          </Button>
          <Input
            value={item.description}
            onChange={(event) => onChange(item.key, { description: event.target.value })}
            aria-label="Descrição"
            placeholder="Descrição (opcional)"
            className={showDuration ? "md:col-span-8" : "md:col-span-7"}
          />
        </div>
      ))}
    </div>
  );
}
