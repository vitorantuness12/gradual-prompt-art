import { useState, type FormEvent } from "react";
import { Archive, Copy, GripVertical, Pencil, RotateCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { SortableList } from "@/components/catalogo/SortableList";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { persistOrder, type CategoryRow } from "@/hooks/useCatalog";
import { supabase } from "@/integrations/supabase/client";

interface CategoryManagerProps {
  storeId: string;
  categories: CategoryRow[];
  productCount: (categoryId: string) => number;
  onChanged: () => void;
}

/** CRUD completo de categorias: criar, editar, duplicar, arquivar, restaurar, excluir e reordenar. */
export function CategoryManager({ storeId, categories, productCount, onChanged }: CategoryManagerProps) {
  const [editing, setEditing] = useState<CategoryRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);

  const active = categories.filter((category) => !category.archived_at);
  const archived = categories.filter((category) => category.archived_at);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const name = String(form.get("name") ?? "").trim();
    const description = String(form.get("description") ?? "").trim();

    if (name.length < 2) {
      toast.error("Informe um nome com pelo menos 2 caracteres.");
      return;
    }

    setSaving(true);
    try {
      if (editing) {
        const { error } = await supabase
          .from("categories")
          .update({ name, description: description || null })
          .eq("id", editing.id);
        if (error) throw new Error(error.message);
        toast.success("Categoria atualizada.");
      } else {
        const { error } = await supabase.from("categories").insert({
          store_id: storeId,
          name,
          description: description || null,
          sort_order: active.length + 1,
        });
        if (error) throw new Error(error.message);
        toast.success("Categoria criada.");
      }
      setEditing(null);
      setCreating(false);
      onChanged();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível salvar a categoria.");
    } finally {
      setSaving(false);
    }
  }

  async function duplicate(category: CategoryRow) {
    const { error } = await supabase.from("categories").insert({
      store_id: storeId,
      name: `${category.name} (cópia)`,
      description: category.description,
      sort_order: active.length + 1,
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Categoria duplicada.");
    onChanged();
  }

  async function toggleArchive(category: CategoryRow) {
    const { error } = await supabase
      .from("categories")
      .update({
        archived_at: category.archived_at ? null : new Date().toISOString(),
        is_active: Boolean(category.archived_at),
      })
      .eq("id", category.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(category.archived_at ? "Categoria restaurada." : "Categoria arquivada.");
    onChanged();
  }

  async function remove(category: CategoryRow) {
    if (productCount(category.id) > 0) {
      toast.error("Mova ou exclua os itens desta categoria antes de removê-la.");
      return;
    }
    if (!window.confirm(`Excluir a categoria "${category.name}"? Esta ação não pode ser desfeita.`)) return;
    const { error } = await supabase.from("categories").delete().eq("id", category.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Categoria excluída.");
    onChanged();
  }

  async function reorder(ids: string[]) {
    await persistOrder("categories", ids);
    onChanged();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">Arraste para definir a ordem que o cliente verá.</p>
        <Button onClick={() => setCreating(true)}>Nova categoria</Button>
      </div>

      {active.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Nenhuma categoria criada ainda.
          </CardContent>
        </Card>
      ) : (
        <SortableList
          items={active}
          getId={(category) => category.id}
          onReorder={(ids) => void reorder(ids)}
          renderItem={(category, dragProps) => (
            <Card className="border-border/70">
              <CardContent className="flex flex-wrap items-center gap-3 py-4">
                <span {...dragProps} className="cursor-grab text-muted-foreground" aria-label="Arrastar para reordenar">
                  <GripVertical className="size-4" aria-hidden="true" />
                </span>
                <div className="min-w-40 flex-1">
                  <p className="font-medium text-foreground">{category.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {productCount(category.id)} {productCount(category.id) === 1 ? "item" : "itens"}
                    {category.description ? ` · ${category.description}` : ""}
                  </p>
                </div>
                <div className="flex flex-wrap gap-1">
                  <Button size="sm" variant="ghost" onClick={() => setEditing(category)}>
                    <Pencil className="mr-1 size-3.5" aria-hidden="true" /> Editar
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => void duplicate(category)}>
                    <Copy className="mr-1 size-3.5" aria-hidden="true" /> Duplicar
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => void toggleArchive(category)}>
                    <Archive className="mr-1 size-3.5" aria-hidden="true" /> Arquivar
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive hover:text-destructive"
                    onClick={() => void remove(category)}
                  >
                    <Trash2 className="mr-1 size-3.5" aria-hidden="true" /> Excluir
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        />
      )}

      {archived.length > 0 ? (
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-muted-foreground">Arquivadas</h3>
          {archived.map((category) => (
            <Card key={category.id} className="border-dashed">
              <CardContent className="flex flex-wrap items-center gap-3 py-3">
                <span className="font-medium text-muted-foreground">{category.name}</span>
                <Badge variant="secondary">Arquivada</Badge>
                <div className="ml-auto flex gap-1">
                  <Button size="sm" variant="ghost" onClick={() => void toggleArchive(category)}>
                    <RotateCcw className="mr-1 size-3.5" aria-hidden="true" /> Restaurar
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive hover:text-destructive"
                    onClick={() => void remove(category)}
                  >
                    <Trash2 className="mr-1 size-3.5" aria-hidden="true" /> Excluir
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : null}

      <Dialog
        open={creating || editing !== null}
        onOpenChange={(open) => {
          if (!open) {
            setCreating(false);
            setEditing(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Editar categoria" : "Nova categoria"}</DialogTitle>
            <DialogDescription>Agrupe seus itens para facilitar a navegação do cliente.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <div className="space-y-2">
              <Label htmlFor="category-name">Nome</Label>
              <Input id="category-name" name="name" defaultValue={editing?.name ?? ""} required maxLength={60} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="category-description">Descrição (opcional)</Label>
              <Textarea
                id="category-description"
                name="description"
                defaultValue={editing?.description ?? ""}
                maxLength={200}
                rows={3}
              />
            </div>
            <Button type="submit" disabled={saving} className="w-full">
              {saving ? "Salvando..." : "Salvar categoria"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
