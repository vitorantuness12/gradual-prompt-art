import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BellRing, BellOff, Loader2, Smartphone } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  getPushPublicKey,
  removePushSubscription,
  savePushSubscription,
  sendTestPush,
} from "@/lib/push.functions";
import {
  currentPushStatus,
  disablePush,
  enablePush,
  type PushAudience,
  type PushStatus,
} from "@/lib/push";

interface Props {
  storeId: string | undefined;
  audience?: PushAudience;
  compact?: boolean;
}

const STATUS_TEXT: Record<PushStatus, string> = {
  unsupported: "Este navegador não suporta notificações no aparelho.",
  denied: "As notificações foram bloqueadas nas configurações do navegador.",
  off: "Receba um aviso no celular assim que entrar um pedido, mesmo com o app fechado.",
  on: "Notificações ativas neste aparelho.",
};

/** Ativa/desativa as notificações no celular para o aparelho atual. */
export function PushNotificationsCard({ storeId, audience = "lojista", compact }: Props) {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);

  const fetchKey = useServerFn(getPushPublicKey);
  const save = useServerFn(savePushSubscription);
  const remove = useServerFn(removePushSubscription);
  const test = useServerFn(sendTestPush);

  const { data: status = "off" } = useQuery({
    queryKey: ["push-status"],
    queryFn: () => currentPushStatus(),
  });

  async function activate() {
    setBusy(true);
    try {
      const { publicKey } = await fetchKey({});
      if (!publicKey) throw new Error("Serviço de notificação indisponível no momento.");
      const device = await enablePush(publicKey);
      await save({
        data: {
          endpoint: device.endpoint,
          p256dh: device.p256dh,
          auth: device.auth,
          storeId: storeId ?? null,
          audience,
          userAgent: device.userAgent,
        },
      });
      toast.success("Notificações ativadas neste aparelho.");
      void queryClient.invalidateQueries({ queryKey: ["push-status"] });
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function deactivate() {
    setBusy(true);
    try {
      const endpoint = await disablePush();
      if (endpoint) await remove({ data: { endpoint } });
      toast.success("Notificações desativadas neste aparelho.");
      void queryClient.invalidateQueries({ queryKey: ["push-status"] });
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function sendTest() {
    setBusy(true);
    try {
      const result = await test({});
      if (result.sent > 0) toast.success("Enviamos uma notificação de teste.");
      else toast.error("Nenhum aparelho recebeu. Ative as notificações novamente.");
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const disabled = busy || status === "unsupported" || status === "denied";

  return (
    <div className={compact ? "space-y-2" : "rounded-xl border border-border p-4"}>
      <div className="flex items-center gap-2">
        <Smartphone className="size-4 text-muted-foreground" aria-hidden="true" />
        <p className="text-sm font-medium text-foreground">Notificações no celular</p>
      </div>
      <p className="text-xs text-muted-foreground">{STATUS_TEXT[status]}</p>

      <div className="flex flex-wrap gap-2 pt-1">
        {status === "on" ? (
          <>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => void deactivate()}>
              {busy ? (
                <Loader2 className="mr-1 size-3.5 animate-spin" aria-hidden="true" />
              ) : (
                <BellOff className="mr-1 size-3.5" aria-hidden="true" />
              )}
              Desativar
            </Button>
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => void sendTest()}>
              Enviar teste
            </Button>
          </>
        ) : (
          <Button size="sm" disabled={disabled} onClick={() => void activate()}>
            {busy ? (
              <Loader2 className="mr-1 size-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <BellRing className="mr-1 size-3.5" aria-hidden="true" />
            )}
            Ativar neste aparelho
          </Button>
        )}
      </div>
    </div>
  );
}
