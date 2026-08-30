import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Eye, ShoppingCart, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { formatCurrency } from "@/lib/format";
import { recoveryPanelData, saveRecoverySettings } from "@/lib/recuperacao.functions";

interface RecuperacaoCardProps {
  storeId: string | undefined;
}

/**
 * Painel de recuperação de carrinho + upsell.
 *
 * O lojista liga/desliga o lembrete, escolhe o cupom da mensagem, define as
 * regras de upsell e vê a prévia exata do que o cliente vai enxergar — assim
 * ninguém precisa "testar no cliente real" para entender o efeito.
 */
export function RecuperacaoCard({ storeId }: RecuperacaoCardProps) {
  const queryClient = useQueryClient();
  const load = useServerFn(recoveryPanelData);
  const save = useServerFn(saveRecoverySettings);

  const { data, isLoading } = useQuery({
    queryKey: ["recuperacao", storeId],
    enabled: Boolean(storeId),
    queryFn: () => load({ data: { storeId: storeId! } }),
  });

  const [form, setForm] = useState({
    abandonedCartEnabled: true,
    abandonedCartDelayMinutes: 30,
    abandonedCartCouponCode: "",
    upsellEnabled: true,
    upsellMaxItems: 4,
  });

  useEffect(() => {
    if (!data) return;
    setForm({
      abandonedCartEnabled: data.settings.abandonedCartEnabled,
      abandonedCartDelayMinutes: data.settings.abandonedCartDelayMinutes,
      abandonedCartCouponCode: data.settings.abandonedCartCouponCode ?? "",
      upsellEnabled: data.settings.upsellEnabled,
      upsellMaxItems: data.settings.upsellMaxItems,
    });
  }, [data]);

  const mutation = useMutation({
    mutationFn: () =>
      save({
        data: {
          storeId: storeId!,
          abandonedCartEnabled: form.abandonedCartEnabled,
          abandonedCartDelayMinutes: form.abandonedCartDelayMinutes,
          abandonedCartCouponCode: form.abandonedCartCouponCode.trim().toUpperCase() || undefined,
          upsellEnabled: form.upsellEnabled,
          upsellMaxItems: form.upsellMaxItems,
        },
      }),
    onSuccess: async (result) => {
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success(result.message);
      await queryClient.invalidateQueries({ queryKey: ["recuperacao", storeId] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (!storeId) return null;
  if (isLoading) return <Skeleton className="h-64 w-full" />;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="border-border/70 shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ShoppingCart className="size-4 text-primary" aria-hidden="true" />
            Carrinho abandonado
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <Label htmlFor="lembrete-ativo">Enviar lembrete no WhatsApp</Label>
              <p className="text-xs text-muted-foreground">
                Um único lembrete por carrinho, apenas para quem aceitou receber promoções.
              </p>
            </div>
            <Switch
              id="lembrete-ativo"
              checked={form.abandonedCartEnabled}
              onCheckedChange={(checked) =>
                setForm((current) => ({ ...current, abandonedCartEnabled: checked }))
              }
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="lembrete-delay">Esperar (minutos)</Label>
              <Input
                id="lembrete-delay"
                type="number"
                min={10}
                max={1440}
                value={form.abandonedCartDelayMinutes}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    abandonedCartDelayMinutes: Number(event.target.value),
                  }))
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lembrete-cupom">Cupom no lembrete (opcional)</Label>
              <Input
                id="lembrete-cupom"
                value={form.abandonedCartCouponCode}
                placeholder="VOLTA10"
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    abandonedCartCouponCode: event.target.value.toUpperCase(),
                  }))
                }
                list="cupons-ativos"
              />
              <datalist id="cupons-ativos">
                {(data?.coupons ?? []).map((coupon) => (
                  <option key={coupon.code} value={coupon.code}>
                    {coupon.description ?? coupon.code}
                  </option>
                ))}
              </datalist>
            </div>
          </div>

          <dl className="grid grid-cols-2 gap-3 rounded-lg bg-secondary/40 p-3 text-xs">
            <div>
              <dt className="text-muted-foreground">Carrinhos abertos (30 dias)</dt>
              <dd className="text-base font-semibold text-foreground">{data?.pending ?? 0}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Recuperados (30 dias)</dt>
              <dd className="text-base font-semibold text-foreground">{data?.recovered ?? 0}</dd>
            </div>
          </dl>

          <p className="text-xs text-muted-foreground">
            A rotina automática roda a cada 10 minutos.{" "}
            {data?.lastRunAt
              ? `Última execução: ${new Date(data.lastRunAt).toLocaleString("pt-BR")}.`
              : "Aguardando a primeira execução."}
          </p>
        </CardContent>
      </Card>

      <Card className="border-border/70 shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="size-4 text-primary" aria-hidden="true" />
            Upsell "leve também"
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <Label htmlFor="upsell-ativo">Sugerir produtos no carrinho e no checkout</Label>
              <p className="text-xs text-muted-foreground">
                Usa os produtos relacionados que você cadastrou no catálogo.
              </p>
            </div>
            <Switch
              id="upsell-ativo"
              checked={form.upsellEnabled}
              onCheckedChange={(checked) =>
                setForm((current) => ({ ...current, upsellEnabled: checked }))
              }
            />
          </div>

          <div className="space-y-1.5 sm:max-w-40">
            <Label htmlFor="upsell-max">Máximo de sugestões</Label>
            <Input
              id="upsell-max"
              type="number"
              min={1}
              max={8}
              value={form.upsellMaxItems}
              onChange={(event) =>
                setForm((current) => ({ ...current, upsellMaxItems: Number(event.target.value) }))
              }
            />
          </div>

          <div className="space-y-2">
            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <Eye className="size-3.5" aria-hidden="true" />
              Prévia das sugestões
            </p>
            {(data?.preview ?? []).length === 0 ? (
              <p className="text-xs text-muted-foreground">
                Cadastre produtos relacionados no catálogo para o upsell ter o que sugerir.
              </p>
            ) : (
              <ul className="space-y-2">
                {(data?.preview ?? []).map((line) => (
                  <li key={line.trigger} className="rounded-lg border border-border/70 p-3 text-xs">
                    <p className="font-medium text-foreground">Com “{line.trigger}” no carrinho:</p>
                    <p className="text-muted-foreground">
                      {line.suggestions
                        .map((item) => `${item.name} (${formatCurrency(item.price)})`)
                        .join(" · ")}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="lg:col-span-2">
        <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
          {mutation.isPending ? "Salvando..." : "Salvar recuperação e upsell"}
        </Button>
      </div>
    </div>
  );
}
