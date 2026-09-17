import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { BellOff, BellRing, Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  getCustomerPushPreference,
  getPushPublicKey,
  removePushSubscription,
  savePushSubscription,
} from "@/lib/push.functions";
import { currentPushStatus, enablePush } from "@/lib/push";

export interface CustomerPushCardProps {
  storeSlug: string;
  compact?: boolean;
}

export function CustomerPushCard({ storeSlug, compact = false }: CustomerPushCardProps) {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const getPreference = useServerFn(getCustomerPushPreference);
  const getKey = useServerFn(getPushPublicKey);
  const save = useServerFn(savePushSubscription);
  const remove = useServerFn(removePushSubscription);
  const preference = useQuery({
    queryKey: ["customer-push-preference", storeSlug],
    queryFn: () => getPreference({ data: { storeSlug } }),
  });

  async function activate() {
    setBusy(true);
    try {
      const browserStatus = await currentPushStatus();
      if (browserStatus === "unsupported")
        throw new Error("Este aparelho não suporta notificações.");
      const { publicKey } = await getKey({});
      if (!publicKey) throw new Error("Serviço indisponível no momento.");
      const device = await enablePush(publicKey);
      await save({
        data: { ...device, storeId: preference.data?.storeId ?? null, audience: "cliente" },
      });
      toast.success("Notificações ativadas para esta loja.");
      await queryClient.invalidateQueries({ queryKey: ["customer-push-preference", storeSlug] });
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function deactivate() {
    if (!preference.data?.storeId) return;
    setBusy(true);
    try {
      await remove({
        data: {
          endpoint: preference.data.endpoint,
          storeId: preference.data.storeId,
          audience: "cliente",
        },
      });
      toast.success("Notificações desativadas para esta loja.");
      await queryClient.invalidateQueries({ queryKey: ["customer-push-preference", storeSlug] });
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const content = (
    <>
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <BellRing className="size-5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-medium text-foreground">Novidades desta loja</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Receba promoções e avisos no celular, mesmo com o app fechado.
          </p>
        </div>
      </div>
      {!preference.isLoading ? (
        <Button
          className="mt-4 w-full sm:w-auto"
          variant={preference.data?.active ? "outline" : "default"}
          disabled={busy || !preference.data?.marketingOptIn}
          onClick={() => void (preference.data?.active ? deactivate() : activate())}
        >
          {busy ? (
            <Loader2 className="mr-2 size-4 animate-spin" aria-hidden="true" />
          ) : preference.data?.active ? (
            <BellOff className="mr-2 size-4" aria-hidden="true" />
          ) : (
            <BellRing className="mr-2 size-4" aria-hidden="true" />
          )}
          {preference.data?.active ? "Desativar notificações" : "Ativar notificações"}
        </Button>
      ) : null}
      {preference.data && !preference.data.marketingOptIn ? (
        <p className="mt-2 text-xs text-muted-foreground">
          Ative “Quero receber novidades e promoções” nos seus dados primeiro.
        </p>
      ) : null}
    </>
  );
  if (compact) return <div className="rounded-lg border border-border bg-card p-4">{content}</div>;
  return (
    <Card className="rounded-lg">
      <CardHeader>
        <CardTitle className="text-lg">Notificações</CardTitle>
        <CardDescription>Você controla os avisos recebidos neste aparelho.</CardDescription>
      </CardHeader>
      <CardContent>{content}</CardContent>
    </Card>
  );
}
