import { Banknote, CreditCard, QrCode, ShoppingBag, Wallet } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { PAYMENT_METHOD_LABEL, type PaymentMethods } from "@/lib/store-config";

const ICONS: Record<keyof PaymentMethods, LucideIcon> = {
  pix: QrCode,
  card_online: CreditCard,
  cash: Banknote,
  card_on_delivery: Wallet,
  pay_on_pickup: ShoppingBag,
};

const HINTS: Record<keyof PaymentMethods, string> = {
  pix: "Cliente paga por Pix e envia o comprovante no pedido.",
  card_online: "Requer integração de pagamento ativa na sua conta.",
  cash: "Pagamento em dinheiro no momento da entrega.",
  card_on_delivery: "Maquininha levada pelo entregador.",
  pay_on_pickup: "Cliente paga ao retirar no balcão.",
};

export interface PaymentMethodsEditorProps {
  value: PaymentMethods;
  onChange: (value: PaymentMethods) => void;
}

/** Seleção das formas de recebimento aceitas pela loja. */
export function PaymentMethodsEditor({ value, onChange }: PaymentMethodsEditorProps) {
  const keys = Object.keys(PAYMENT_METHOD_LABEL) as (keyof PaymentMethods)[];

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {keys.map((key) => {
        const Icon = ICONS[key];
        return (
          <div key={key} className="flex items-start gap-3 rounded-xl border border-border/70 p-3">
            <Icon className="mt-0.5 size-5 text-primary" aria-hidden="true" />
            <div className="flex-1">
              <Label htmlFor={`pagamento-${key}`} className="cursor-pointer text-sm font-medium">
                {PAYMENT_METHOD_LABEL[key]}
              </Label>
              <p className="text-xs text-muted-foreground">{HINTS[key]}</p>
            </div>
            <Switch
              id={`pagamento-${key}`}
              checked={value[key]}
              onCheckedChange={(checked) => onChange({ ...value, [key]: checked })}
            />
          </div>
        );
      })}
    </div>
  );
}
