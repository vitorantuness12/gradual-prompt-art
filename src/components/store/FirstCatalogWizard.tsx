import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, Package, Trash2 } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency } from "@/lib/format";

const NEW_CATEGORY = "__nova__";

const itemSchema = z.object({
  name: z.string().trim().min(2, "Informe o nome do produto ou serviço.").max(120, "Nome muito longo."),
  description: z.string().trim().max(300, "A descrição deve ter no máximo 300 caracteres."),
  price: z.number({ message: "Informe um preço válido." }).min(0, "O preço não pode ser negativo.").max(999999),
  duration: z.number().int().min(5, "Duração mínima de 5 minutos.").max(600).optional(),
  categoryName: z.string().trim().max(60).optional(),
});

interface Draft {
  name: string;
  description: string;
  price: string;
  isService: boolean;
  duration: string;
  categoryId: string;
  newCategory: string;
}

const EMPTY_DRAFT: Draft = {
  name: "",
  description: "",
  price: "",
  isService: false,
  duration: "30",
  categoryId: NEW_CATEGORY,
  newCategory: "",
};

function draftKey(storeId: string) {
  return `seu-pedido:onboarding-item:${storeId}`;
}

export interface FirstCatalogWizardProps {
  storeId: string;
  segment?: string | null;
  onBack: () => void;
  onDone: () => void | Promise<void>;
}

/** Assistente do primeiro produto/serviço, com validação, categoria e rascunho salvo automaticamente. */
export function FirstCatalogWizard({ storeId, segment, onBack, onDone }: FirstCatalogWizardProps) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [saving, setSaving] = useState(false);
  const [restored, setRestored] = useState(false);

  const categories = useQuery({
    queryKey: ["onboarding-categories", storeId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("categories")
        .select("id, name")
        .eq("store_id", storeId)
        .order("name");
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  const products = useQuery({
    queryKey: ["onboarding-products", storeId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, price, is_service")
        .eq("store_id", storeId)
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  /** Recupera o rascunho salvo automaticamente no navegador. */
  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = window.localStorage.getItem(draftKey(storeId));
    if (raw) {
      try {
        setDraft({ ...EMPTY_DRAFT, ...(JSON.parse(raw) as Partial<Draft>) });
      } catch {
        /* rascunho inválido é ignorado */
      }
    }
    setRestored(true);
  }, [storeId]);

  /** Salvamento automático a cada alteração, para o lojista poder continuar depois. */
  useEffect(() => {
    if (!restored || typeof window === "undefined") return;
    const timer = window.setTimeout(() => {
      window.localStorage.setItem(draftKey(storeId), JSON.stringify(draft));
    }, 400);
    return () => window.clearTimeout(timer);
  }, [draft, restored, storeId]);

  function patch(values: Partial<Draft>) {
    setDraft((current) => ({ ...current, ...values }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const parsed = itemSchema.safeParse({
      name: draft.name,
      description: draft.description,
      price: Number(draft.price.replace(/\./g, "").replace(",", ".")),
      duration: draft.isService ? Number(draft.duration) : undefined,
      categoryName: draft.categoryId === NEW_CATEGORY ? draft.newCategory : "",
    });

    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Verifique os dados informados.");
      return;
    }

    setSaving(true);
    try {
      let categoryId: string | null = draft.categoryId === NEW_CATEGORY ? null : draft.categoryId;

      if (draft.categoryId === NEW_CATEGORY && parsed.data.categoryName) {
        const { data: category, error: categoryError } = await supabase
          .from("categories")
          .insert({ store_id: storeId, name: parsed.data.categoryName })
          .select("id")
          .single();
        if (categoryError) throw new Error(categoryError.message);
        categoryId = category.id;
      }

      const { error } = await supabase.from("products").insert({
        store_id: storeId,
        category_id: categoryId,
        name: parsed.data.name,
        description: parsed.data.description || null,
        price: parsed.data.price,
        is_service: draft.isService,
        duration_minutes: draft.isService ? (parsed.data.duration ?? 30) : null,
      });
      if (error) throw new Error(error.message);

      if (typeof window !== "undefined") window.localStorage.removeItem(draftKey(storeId));
      setDraft(EMPTY_DRAFT);
      await Promise.all([categories.refetch(), products.refetch()]);
      await queryClient.invalidateQueries({ queryKey: ["products"] });
      toast.success("Item cadastrado no catálogo.");
    } catch {
      toast.error("Não foi possível cadastrar o item.");
    } finally {
      setSaving(false);
    }
  }

  async function removeItem(id: string) {
    const { error } = await supabase.from("products").delete().eq("id", id);
    if (error) {
      toast.error("Não foi possível remover o item.");
      return;
    }
    await products.refetch();
  }

  const list = products.data ?? [];

  return (
    <Card className="border-border/70 shadow-sm">
      <CardHeader>
        <CardTitle className="text-xl">Seu primeiro item</CardTitle>
        <CardDescription>
          Cadastre um produto ou serviço{segment ? ` do seu ${segment.toLowerCase()}` : ""} para a loja já nascer com
          catálogo. Salvamos o rascunho automaticamente — você pode continuar depois.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="item-nome">Nome</Label>
              <Input
                id="item-nome"
                value={draft.name}
                onChange={(event) => patch({ name: event.target.value })}
                maxLength={120}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="item-preco">Preço (R$)</Label>
              <Input
                id="item-preco"
                inputMode="decimal"
                placeholder="0,00"
                value={draft.price}
                onChange={(event) => patch({ price: event.target.value.replace(/[^\d,.]/g, "") })}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="item-categoria">Categoria</Label>
              <Select value={draft.categoryId} onValueChange={(value) => patch({ categoryId: value })}>
                <SelectTrigger id="item-categoria">
                  <SelectValue placeholder="Escolha ou crie" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NEW_CATEGORY}>Criar nova categoria</SelectItem>
                  {(categories.data ?? []).map((category) => (
                    <SelectItem key={category.id} value={category.id}>
                      {category.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {draft.categoryId === NEW_CATEGORY ? (
              <div className="space-y-2">
                <Label htmlFor="item-nova-categoria">Nome da nova categoria (opcional)</Label>
                <Input
                  id="item-nova-categoria"
                  value={draft.newCategory}
                  onChange={(event) => patch({ newCategory: event.target.value })}
                  placeholder="Ex.: Lanches, Cortes, Higiene"
                  maxLength={60}
                />
              </div>
            ) : null}
            <div className="flex items-center justify-between rounded-xl border border-border/70 p-3">
              <Label htmlFor="item-servico" className="cursor-pointer text-sm">
                É um serviço agendável
              </Label>
              <Switch
                id="item-servico"
                checked={draft.isService}
                onCheckedChange={(checked) => patch({ isService: checked })}
              />
            </div>
            {draft.isService ? (
              <div className="space-y-2">
                <Label htmlFor="item-duracao">Duração (minutos)</Label>
                <Input
                  id="item-duracao"
                  inputMode="numeric"
                  value={draft.duration}
                  onChange={(event) => patch({ duration: event.target.value.replace(/\D/g, "") })}
                />
              </div>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="item-descricao">Descrição (opcional)</Label>
            <Textarea
              id="item-descricao"
              rows={3}
              maxLength={300}
              value={draft.description}
              onChange={(event) => patch({ description: event.target.value })}
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="ghost" onClick={onBack}>
              <ArrowLeft className="mr-2 size-4" aria-hidden="true" />
              Voltar
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Salvando..." : "Adicionar ao catálogo"}
            </Button>
            <Button type="button" variant="outline" disabled={saving} onClick={() => void onDone()}>
              {list.length > 0 ? "Continuar" : "Pular por enquanto"}
              <ArrowRight className="ml-2 size-4" aria-hidden="true" />
            </Button>
          </div>
        </form>

        <div className="rounded-xl border border-border/70 p-4">
          <p className="flex items-center gap-2 text-sm font-medium text-foreground">
            <Package className="size-4" aria-hidden="true" />
            Itens já cadastrados ({list.length})
          </p>
          {list.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">Nenhum item ainda. Cadastre o primeiro acima.</p>
          ) : (
            <ul className="mt-2 divide-y divide-border text-sm">
              {list.map((item) => (
                <li key={item.id} className="flex items-center justify-between gap-2 py-2">
                  <span className="min-w-0 truncate text-foreground">
                    {item.name}
                    {item.is_service ? " · serviço" : ""}
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="text-muted-foreground">{formatCurrency(Number(item.price))}</span>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      aria-label={`Remover ${item.name}`}
                      onClick={() => void removeItem(item.id)}
                    >
                      <Trash2 className="size-4" aria-hidden="true" />
                    </Button>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
