import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { setCustomerNotifications, type StorePrefs } from "@/lib/cliente.functions";

/**
 * Avisos automáticos por loja. O cliente só recebe depois de confirmar o
 * telefone, e pode desligar aqui a qualquer momento.
 */
interface Props {
  session: string;
  stores: StorePrefs[];
  onSaved: () => void;
}

export function NotificationPrefsCard({ session, stores, onSaved }: Props) {
  const save = useServerFn(setCustomerNotifications);
  const [busy, setBusy] = useState<string | null>(null);

  async function update(storeId: string, patch: { whatsapp?: boolean; email?: boolean }) {
    setBusy(storeId);
    try {
      const result = await save({ data: { session, storeId, ...patch } });
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success(result.message);
      onSaved();
    } catch {
      toast.error("Não foi possível salvar agora.");
    } finally {
      setBusy(null);
    }
  }

  if (stores.length === 0) return null;

  return (
    <Card className="border-border/70">
      <CardHeader>
        <CardTitle className="text-lg">Avisos de mudança no pedido</CardTitle>
        <CardDescription>
          Escolha como cada loja pode avisar você quando o pedido mudar de etapa.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {stores.map((store) => (
          <div key={store.storeId} className="space-y-3 rounded-xl border border-border p-4">
            <p className="text-sm font-medium text-foreground">{store.storeName}</p>
            <div className="flex items-center justify-between gap-3">
              <label htmlFor={`wa-${store.storeId}`} className="text-sm text-muted-foreground">
                WhatsApp
              </label>
              <Switch
                id={`wa-${store.storeId}`}
                checked={store.whatsapp}
                disabled={busy === store.storeId}
                onCheckedChange={(value) => void update(store.storeId, { whatsapp: value })}
              />
            </div>
            <div className="flex items-center justify-between gap-3">
              <label htmlFor={`mail-${store.storeId}`} className="text-sm text-muted-foreground">
                E-mail {store.hasEmail ? "" : "(cadastre um e-mail na próxima compra)"}
              </label>
              <Switch
                id={`mail-${store.storeId}`}
                checked={store.email}
                disabled={busy === store.storeId || !store.hasEmail}
                onCheckedChange={(value) => void update(store.storeId, { email: value })}
              />
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
