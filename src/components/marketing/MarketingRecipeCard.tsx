import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { AUTOMATION_CHANNELS } from "@/lib/automacoes";
import {
  initialFormState,
  normalizeCouponCode,
  type MarketingOverview,
  type MarketingRecipe,
} from "@/lib/marketing";
import { saveMarketingRecipe, sendMarketingTest } from "@/lib/marketing.functions";

export interface MarketingRecipeCardProps {
  storeId: string;
  recipe: MarketingRecipe;
  overview: MarketingOverview;
  onSaved: () => void;
}

/** Uma receita de marketing: liga/desliga, texto, cupom e envio de teste. */
export function MarketingRecipeCard({ storeId, recipe, overview, onSaved }: MarketingRecipeCardProps) {
  const saveFn = useServerFn(saveMarketingRecipe);
  const testFn = useServerFn(sendMarketingTest);

  const saved = overview.rules.find((row) => row.event === recipe.event);
  const stat = overview.stats.find((row) => row.event === recipe.event);
  const [form, setForm] = useState(() => initialFormState(recipe, overview));
  const [active, setActive] = useState(saved?.isActive ?? false);
  const [testContact, setTestContact] = useState("");

  const save = useMutation({
    mutationFn: async (nextActive: boolean) => {
      const result = await saveFn({
        data: {
          storeId,
          event: recipe.event,
          isActive: nextActive,
          channel: form.channel as "whatsapp" | "email",
          message: form.message,
          ...(recipe.suggestsCoupon && form.couponCode
            ? { couponCode: form.couponCode, discountPercent: form.discountPercent }
            : {}),
          ...(recipe.event === "inactive" ? { inactiveDays: form.inactiveDays } : {}),
          ...(recipe.event === "post_purchase" ? { delayMinutes: form.delayMinutes } : {}),
        },
      });
      if (!result.ok) throw new Error(result.message);
      return result.message;
    },
    onSuccess: (message) => {
      toast.success(message);
      onSaved();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const test = useMutation({
    mutationFn: async () => {
      const result = await testFn({
        data: {
          storeId,
          event: recipe.event,
          channel: form.channel as "whatsapp" | "email",
          contact: testContact,
          message: form.message,
          ...(form.couponCode ? { couponCode: form.couponCode } : {}),
        },
      });
      if (!result.ok) throw new Error(result.message);
      return result.message;
    },
    onSuccess: (message) => toast.success(message),
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <Card className="border-border/70 shadow-sm">
      <CardHeader className="gap-2">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">{recipe.title}</CardTitle>
            <CardDescription>{recipe.summary}</CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={active ? "default" : "secondary"}>{active ? "Ativa" : "Desligada"}</Badge>
            <Switch
              checked={active}
              onCheckedChange={(value) => {
                setActive(value);
                save.mutate(value);
              }}
              aria-label={`Ativar ${recipe.title}`}
            />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          {overview.audience[recipe.event] ?? 0} cliente(s) receberiam hoje · {stat?.sent ?? 0} enviada(s) nos
          últimos 30 dias
          {stat?.failed ? ` · ${stat.failed} falha(s)` : ""}
        </p>
      </CardHeader>

      <CardContent className="grid gap-4">
        <div className="grid gap-2">
          <Label>Mensagem</Label>
          <Textarea
            rows={3}
            value={form.message}
            onChange={(event) => setForm((prev) => ({ ...prev, message: event.target.value }))}
          />
          <p className="text-xs text-muted-foreground">
            Use {"{cliente}"}, {"{loja}"} e {"{cupom}"} — trocamos pelos dados reais no envio.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="grid gap-2">
            <Label>Enviar por</Label>
            <Select value={form.channel} onValueChange={(value) => setForm((prev) => ({ ...prev, channel: value }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {AUTOMATION_CHANNELS.map((item) => (
                  <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {recipe.suggestsCoupon && (
            <>
              <div className="grid gap-2">
                <Label>Cupom</Label>
                <Input
                  value={form.couponCode}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, couponCode: normalizeCouponCode(event.target.value) }))
                  }
                  placeholder="ANIVERSARIO"
                />
              </div>
              <div className="grid gap-2">
                <Label>Desconto (%)</Label>
                <Input
                  value={String(form.discountPercent)}
                  inputMode="numeric"
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, discountPercent: Number(event.target.value) || 0 }))
                  }
                />
              </div>
            </>
          )}

          {recipe.event === "inactive" && (
            <div className="grid gap-2">
              <Label>Dias sem comprar</Label>
              <Input
                value={String(form.inactiveDays)}
                inputMode="numeric"
                onChange={(event) => setForm((prev) => ({ ...prev, inactiveDays: Number(event.target.value) || 30 }))}
              />
            </div>
          )}

          {recipe.event === "post_purchase" && (
            <div className="grid gap-2">
              <Label>Esperar (minutos)</Label>
              <Input
                value={String(form.delayMinutes)}
                inputMode="numeric"
                onChange={(event) => setForm((prev) => ({ ...prev, delayMinutes: Number(event.target.value) || 0 }))}
              />
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-end gap-2">
          <Button onClick={() => save.mutate(active)} disabled={save.isPending}>
            {save.isPending ? "Salvando..." : "Salvar"}
          </Button>
          <Input
            className="w-52"
            value={testContact}
            onChange={(event) => setTestContact(event.target.value)}
            placeholder={form.channel === "email" ? "seu@email.com" : "WhatsApp com DDD"}
          />
          <Button variant="outline" onClick={() => test.mutate()} disabled={test.isPending || !testContact}>
            {test.isPending ? "Enviando..." : "Enviar teste"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
