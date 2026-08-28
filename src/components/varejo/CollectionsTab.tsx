import { useMemo, useState } from "react";
import { Layers, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import type { ProductRow } from "@/hooks/useCatalog";
import {
  deleteCollection,
  setCollectionProducts,
  setRelatedProducts,
  upsertCollection,
  type CollectionItemRow,
  type CollectionRow,
  type RelatedRow,
} from "@/lib/varejo";

interface CollectionsTabProps {
  storeId: string;
  products: ProductRow[];
  collections: CollectionRow[];
  collectionItems: CollectionItemRow[];
  related: RelatedRow[];
  onChanged: () => void;
}

interface Draft {
  id?: string;
  name: string;
  description: string;
  coverUrl: string;
  isActive: boolean;
  productIds: string[];
}

/** Coleções (lookbook) da vitrine e sugestões de itens relacionados. */
export function CollectionsTab({
  storeId,
  products,
  collections,
  collectionItems,
  related,
  onChanged,
}: CollectionsTabProps) {
  const active = useMemo(() => products.filter((product) => !product.archived_at), [products]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [relatedFor, setRelatedFor] = useState<string>(active[0]?.id ?? "");
  const [savingRelated, setSavingRelated] = useState(false);

  const relatedIds = useMemo(
    () => related.filter((row) => row.product_id === relatedFor).map((row) => row.related_product_id),
    [related, relatedFor],
  );
  const [relatedDraft, setRelatedDraft] = useState<string[] | null>(null);
  const currentRelated = relatedDraft ?? relatedIds;

  async function saveCollection() {
    if (!draft) return;
    if (draft.name.trim().length < 2) {
      toast.error("Dê um nome à coleção.");
      return;
    }
    try {
      await upsertCollection({
        ...(draft.id ? { id: draft.id } : {}),
        storeId,
        name: draft.name,
        description: draft.description,
        coverUrl: draft.coverUrl,
        isActive: draft.isActive,
        sortOrder: collections.length + 1,
      });

      // A lista de produtos só é regravada quando a coleção já existe;
      // ao criar, buscamos o id recém-gerado pelo nome.
      const target =
        draft.id ??
        (
          await (
            await import("@/integrations/supabase/client")
          ).supabase
            .from("product_collections")
            .select("id")
            .eq("store_id", storeId)
            .eq("name", draft.name.trim())
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle()
        ).data?.id;

      if (target) await setCollectionProducts(storeId, target, draft.productIds);
      toast.success("Coleção salva.");
      setDraft(null);
      onChanged();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao salvar a coleção.");
    }
  }

  async function saveRelated() {
    setSavingRelated(true);
    try {
      await setRelatedProducts(storeId, relatedFor, currentRelated);
      toast.success("Itens relacionados atualizados.");
      setRelatedDraft(null);
      onChanged();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao salvar.");
    } finally {
      setSavingRelated(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle className="text-base">Coleções da vitrine</CardTitle>
            <CardDescription>
              Agrupe produtos por tema (ex.: “Verão”, “Presentes”) e mostre na loja como um lookbook.
            </CardDescription>
          </div>
          <Button
            onClick={() =>
              setDraft({ name: "", description: "", coverUrl: "", isActive: true, productIds: [] })
            }
          >
            Nova coleção
          </Button>
        </CardHeader>
        <CardContent className="space-y-2">
          {collections.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Nenhuma coleção criada ainda.
            </p>
          ) : (
            collections.map((collection) => {
              const items = collectionItems.filter((item) => item.collection_id === collection.id);
              return (
                <div
                  key={collection.id}
                  className="flex flex-wrap items-center gap-3 rounded-xl border border-border/70 p-3"
                >
                  <Layers className="size-4 text-muted-foreground" aria-hidden="true" />
                  <div className="min-w-40 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-foreground">{collection.name}</p>
                      {!collection.is_active ? <Badge variant="outline">Oculta</Badge> : null}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {items.length} item(ns) · {collection.description || "sem descrição"}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      setDraft({
                        id: collection.id,
                        name: collection.name,
                        description: collection.description ?? "",
                        coverUrl: collection.cover_url ?? "",
                        isActive: collection.is_active,
                        productIds: items.map((item) => item.product_id),
                      })
                    }
                  >
                    <Pencil className="mr-1 size-3.5" aria-hidden="true" /> Editar
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive hover:text-destructive"
                    onClick={() => {
                      if (!window.confirm(`Excluir a coleção "${collection.name}"?`)) return;
                      void deleteCollection(collection.id)
                        .then(onChanged)
                        .catch(() => toast.error("Falha ao excluir."));
                    }}
                  >
                    <Trash2 className="mr-1 size-3.5" aria-hidden="true" /> Excluir
                  </Button>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Itens relacionados</CardTitle>
          <CardDescription>
            Sugestões que aparecem no detalhe do produto na loja: “compre junto” e alternativas.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Select
            value={relatedFor}
            onValueChange={(value) => {
              setRelatedFor(value);
              setRelatedDraft(null);
            }}
          >
            <SelectTrigger className="max-w-sm" aria-label="Produto base">
              <SelectValue placeholder="Escolha o produto" />
            </SelectTrigger>
            <SelectContent>
              {active.map((product) => (
                <SelectItem key={product.id} value={product.id}>
                  {product.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="grid max-h-64 gap-1 overflow-y-auto rounded-xl border border-border/70 p-3 sm:grid-cols-2">
            {active
              .filter((product) => product.id !== relatedFor)
              .map((product) => (
                <label key={product.id} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={currentRelated.includes(product.id)}
                    onCheckedChange={(checked) =>
                      setRelatedDraft(
                        checked
                          ? [...currentRelated, product.id]
                          : currentRelated.filter((id) => id !== product.id),
                      )
                    }
                  />
                  {product.name}
                </label>
              ))}
          </div>

          <Button onClick={() => void saveRelated()} disabled={savingRelated || !relatedFor}>
            Salvar relacionados
          </Button>
        </CardContent>
      </Card>

      <Dialog open={Boolean(draft)} onOpenChange={(open) => !open && setDraft(null)}>
        <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{draft?.id ? "Editar coleção" : "Nova coleção"}</DialogTitle>
            <DialogDescription>Escolha o nome, a capa e os produtos exibidos.</DialogDescription>
          </DialogHeader>

          {draft ? (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="collection-name">Nome</Label>
                <Input
                  id="collection-name"
                  value={draft.name}
                  onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="collection-desc">Descrição</Label>
                <Textarea
                  id="collection-desc"
                  rows={2}
                  value={draft.description}
                  onChange={(event) => setDraft({ ...draft, description: event.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="collection-cover">Imagem de capa (URL)</Label>
                <Input
                  id="collection-cover"
                  value={draft.coverUrl}
                  onChange={(event) => setDraft({ ...draft, coverUrl: event.target.value })}
                  placeholder="https://..."
                />
              </div>
              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                <Switch
                  checked={draft.isActive}
                  onCheckedChange={(checked) => setDraft({ ...draft, isActive: checked })}
                  aria-label="Mostrar na loja"
                />
                Mostrar na loja
              </label>

              <div className="space-y-1.5">
                <Label>Produtos da coleção</Label>
                <div className="grid max-h-56 gap-1 overflow-y-auto rounded-xl border border-border/70 p-3">
                  {active.map((product) => (
                    <label key={product.id} className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={draft.productIds.includes(product.id)}
                        onCheckedChange={(checked) =>
                          setDraft({
                            ...draft,
                            productIds: checked
                              ? [...draft.productIds, product.id]
                              : draft.productIds.filter((id) => id !== product.id),
                          })
                        }
                      />
                      {product.name}
                    </label>
                  ))}
                </div>
              </div>
            </div>
          ) : null}

          <DialogFooter>
            <Button variant="outline" onClick={() => setDraft(null)}>
              Cancelar
            </Button>
            <Button onClick={() => void saveCollection()}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
