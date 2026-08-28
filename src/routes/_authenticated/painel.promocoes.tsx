import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { z } from "zod";

import { DemoBadge } from "@/components/brand/DemoBadge";
import { EmptyState, PageHeader } from "@/components/painel/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { useActiveStore } from "@/hooks/useMyStores";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/painel/promocoes")({
  component: PromotionsPage,
});

const promoSchema = z.object({
  code: z
    .string()
    .trim()
    .min(3, "O cupom deve ter ao menos 3 caracteres.")
    .regex(/^[A-Z0-9]+$/, "Use apenas letras maiúsculas e números."),
  description: z.string().trim().max(200).optional(),
  discountType: z.enum(["percent", "fixed"]),
  discountValue: z.number().positive("Informe um valor de desconto maior que zero."),
  minOrderValue: z.number().min(0),
});

function PromotionsPage() {
  const { active } = useActiveStore();
  const storeId = active?.storeId;
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [discountType, setDiscountType] = useState<"percent" | "fixed">("percent");

  const { data, isLoading } = useQuery({
    queryKey: ["promotions", storeId],
    enabled: Boolean(storeId),
    queryFn: async () => {
      const { data: rows, error } = await supabase
        .from("promotions")
        .select("*")
        .eq("store_id", storeId!)
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      return rows ?? [];
    },
  });

  const createPromo = useMutation({
    mutationFn: async (values: z.infer<typeof promoSchema>) => {
      const { error } = await supabase.from("promotions").insert({
        store_id: storeId!,
        code: values.code,
        description: values.description || null,
        discount_type: values.discountType,
        discount_value: values.discountValue,
        min_order_value: values.minOrderValue,
      });
      if (error) {
        throw new Error(error.code === "23505" ? "Já existe um cupom com esse código." : error.message);
      }
    },
    onSuccess: async () => {
      toast.success("Promoção criada.");
      setOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["promotions", storeId] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const toggleActive = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      const { error } = await supabase.from("promotions").update({ is_active: isActive }).eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: async () => queryClient.invalidateQueries({ queryKey: ["promotions", storeId] }),
    onError: () => toast.error("Não foi possível atualizar a promoção."),
  });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const parsed = promoSchema.safeParse({
      code: String(form.get("code") ?? "").toUpperCase(),
      description: String(form.get("description") ?? ""),
      discountType,
      discountValue: Number(String(form.get("discountValue") ?? "0").replace(",", ".")),
      minOrderValue: Number(String(form.get("minOrderValue") ?? "0").replace(",", ".")),
    });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Verifique os dados informados.");
      return;
    }
    createPromo.mutate(parsed.data);
  }

  const promotions = data ?? [];

  return (
    <div>
      <PageHeader
        title="Promoções"
        description="Cupons de desconto aplicáveis aos pedidos da sua loja."
        actions={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button className="bg-accent text-accent-foreground hover:bg-accent/90">Nova promoção</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Nova promoção</DialogTitle>
                <DialogDescription>Defina o cupom e o desconto concedido.</DialogDescription>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4" noValidate>
                <div className="space-y-2">
                  <Label htmlFor="promo-codigo">Código do cupom</Label>
                  <Input id="promo-codigo" name="code" placeholder="BEMVINDO10" required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="promo-descricao">Descrição</Label>
                  <Input id="promo-descricao" name="description" />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="promo-tipo">Tipo</Label>
                    <Select value={discountType} onValueChange={(value) => setDiscountType(value as typeof discountType)}>
                      <SelectTrigger id="promo-tipo">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="percent">Percentual (%)</SelectItem>
                        <SelectItem value="fixed">Valor fixo (R$)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="promo-valor">Desconto</Label>
                    <Input id="promo-valor" name="discountValue" inputMode="decimal" required />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="promo-minimo">Pedido mínimo (R$)</Label>
                  <Input id="promo-minimo" name="minOrderValue" inputMode="decimal" defaultValue="0" />
                </div>
                <Button type="submit" className="w-full" disabled={createPromo.isPending}>
                  {createPromo.isPending ? "Salvando..." : "Salvar promoção"}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        }
      />

      {isLoading ? (
        <Skeleton className="h-32 rounded-2xl" />
      ) : promotions.length === 0 ? (
        <EmptyState title="Nenhuma promoção criada" description="Crie cupons para incentivar novos pedidos." />
      ) : (
        <div className="space-y-3">
          {promotions.map((promo) => (
            <Card key={promo.id} className="border-border/70 shadow-sm">
              <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-6">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="font-mono font-medium text-foreground">{promo.code}</h2>
                    {promo.is_demo ? <DemoBadge /> : null}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {promo.discount_type === "percent"
                      ? `${Number(promo.discount_value)}% de desconto`
                      : `${formatCurrency(Number(promo.discount_value))} de desconto`}
                    {Number(promo.min_order_value) > 0
                      ? ` · pedido mínimo ${formatCurrency(Number(promo.min_order_value))}`
                      : ""}
                  </p>
                  {promo.description ? <p className="text-sm text-muted-foreground">{promo.description}</p> : null}
                </div>
                <div className="flex items-center gap-2">
                  <Label htmlFor={`promo-ativo-${promo.id}`} className="text-xs text-muted-foreground">
                    Ativa
                  </Label>
                  <Switch
                    id={`promo-ativo-${promo.id}`}
                    checked={promo.is_active}
                    onCheckedChange={(checked) => toggleActive.mutate({ id: promo.id, isActive: checked })}
                  />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
