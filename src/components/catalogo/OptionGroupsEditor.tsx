import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import type { OptionGroupRow, OptionRow } from "@/hooks/useCatalog";
import { supabase } from "@/integrations/supabase/client";
import { OPTION_GROUP_TYPES } from "@/lib/catalog";

interface OptionGroupsEditorProps {
  storeId: string;
  productId: string;
  groups: OptionGroupRow[];
  options: OptionRow[];
  onChanged: () => void;
}

/** Variações, tamanhos, sabores, adicionais e complementos de um item. */
export function OptionGroupsEditor({ storeId, productId, groups, options, onChanged }: OptionGroupsEditorProps) {
  const [busy, setBusy] = useState(false);

  async function run(action: () => Promise<{ error: { message: string } | null }>) {
    setBusy(true);
    const { error } = await action();
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    onChanged();
  }

  return (
    <div className="space-y-3">
      {groups.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nenhum grupo criado. Use grupos para tamanhos, sabores, adicionais ou complementos.
        </p>
      ) : null}

      {groups.map((group) => {
        const groupOptions = options.filter((option) => option.group_id === group.id);
        return (
          <Card key={group.id} className="border-border/70">
            <CardContent className="space-y-3 py-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor={`group-name-${group.id}`}>Nome do grupo</Label>
                  <Input
                    id={`group-name-${group.id}`}
                    defaultValue={group.name}
                    onBlur={(event) =>
                      void run(async () =>
                        supabase.from("product_option_groups").update({ name: event.target.value }).eq("id", group.id),
                      )
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`group-type-${group.id}`}>Tipo</Label>
                  <Select
                    defaultValue={group.group_type}
                    onValueChange={(value) =>
                      void run(async () =>
                        supabase.from("product_option_groups").update({ group_type: value }).eq("id", group.id),
                      )
                    }
                  >
                    <SelectTrigger id={`group-type-${group.id}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {OPTION_GROUP_TYPES.map((type) => (
                        <SelectItem key={type.value} value={type.value}>
                          {type.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`group-min-${group.id}`}>Mínimo de escolhas</Label>
                  <Input
                    id={`group-min-${group.id}`}
                    type="number"
                    min={0}
                    defaultValue={group.min_select}
                    onBlur={(event) =>
                      void run(async () =>
                        supabase
                          .from("product_option_groups")
                          .update({ min_select: Math.max(0, Number(event.target.value) || 0) })
                          .eq("id", group.id),
                      )
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`group-max-${group.id}`}>Máximo de escolhas</Label>
                  <Input
                    id={`group-max-${group.id}`}
                    type="number"
                    min={1}
                    defaultValue={group.max_select}
                    onBlur={(event) =>
                      void run(async () =>
                        supabase
                          .from("product_option_groups")
                          .update({ max_select: Math.max(1, Number(event.target.value) || 1) })
                          .eq("id", group.id),
                      )
                    }
                  />
                </div>
              </div>

              <div className="flex items-center justify-between gap-3 rounded-lg bg-muted/40 px-3 py-2">
                <Label htmlFor={`group-required-${group.id}`} className="text-sm">
                  Escolha obrigatória
                </Label>
                <Switch
                  id={`group-required-${group.id}`}
                  defaultChecked={group.is_required}
                  onCheckedChange={(checked) =>
                    void run(async () =>
                      supabase.from("product_option_groups").update({ is_required: checked }).eq("id", group.id),
                    )
                  }
                />
              </div>

              <div className="space-y-2">
                {groupOptions.map((option) => (
                  <div key={option.id} className="flex flex-wrap items-center gap-2">
                    <Input
                      aria-label="Nome da opção"
                      className="min-w-40 flex-1"
                      defaultValue={option.name}
                      onBlur={(event) =>
                        void run(async () =>
                          supabase.from("product_options").update({ name: event.target.value }).eq("id", option.id),
                        )
                      }
                    />
                    <Input
                      aria-label="Valor adicional em reais"
                      type="number"
                      step="0.01"
                      className="w-28"
                      defaultValue={Number(option.price_delta)}
                      onBlur={(event) =>
                        void run(async () =>
                          supabase
                            .from("product_options")
                            .update({ price_delta: Number(event.target.value) || 0 })
                            .eq("id", option.id),
                        )
                      }
                    />
                    <div className="flex items-center gap-2">
                      <Label htmlFor={`option-available-${option.id}`} className="text-xs text-muted-foreground">
                        Disponível
                      </Label>
                      <Switch
                        id={`option-available-${option.id}`}
                        defaultChecked={option.is_available}
                        onCheckedChange={(checked) =>
                          void run(async () =>
                            supabase.from("product_options").update({ is_available: checked }).eq("id", option.id),
                          )
                        }
                      />
                    </div>
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label={`Excluir opção ${option.name}`}
                      className="text-destructive hover:text-destructive"
                      onClick={() => void run(async () => supabase.from("product_options").delete().eq("id", option.id))}
                    >
                      <Trash2 className="size-4" aria-hidden="true" />
                    </Button>
                  </div>
                ))}

                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() =>
                      void run(async () =>
                        supabase.from("product_options").insert({
                          store_id: storeId,
                          group_id: group.id,
                          name: "Nova opção",
                          sort_order: groupOptions.length + 1,
                        }),
                      )
                    }
                  >
                    <Plus className="mr-1 size-3.5" aria-hidden="true" /> Adicionar opção
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive hover:text-destructive"
                    onClick={() =>
                      void run(async () => supabase.from("product_option_groups").delete().eq("id", group.id))
                    }
                  >
                    Excluir grupo
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}

      <Button
        variant="outline"
        disabled={busy}
        onClick={() =>
          void run(async () =>
            supabase.from("product_option_groups").insert({
              store_id: storeId,
              product_id: productId,
              name: "Novo grupo",
              sort_order: groups.length + 1,
            }),
          )
        }
      >
        <Plus className="mr-1 size-4" aria-hidden="true" /> Novo grupo de opções
      </Button>
    </div>
  );
}
