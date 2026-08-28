import { Banknote, CreditCard, Globe, QrCode, Store } from "lucide-react";
import type { ComponentType } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { PaymentMethods } from "@/lib/store-config";

/**
 * Seleção da forma de pagamento em blocos grandes (estilo cardápio digital).
 *
 * Os métodos que acontecem pela internet ficam agrupados em "Online": ao
 * escolher esse bloco, aparece uma segunda linha com Pix e cartão online.
 * "Dinheiro" abre a pergunta do troco.
 */
export type PaymentKey = keyof PaymentMethods;

const ONLINE_KEYS: PaymentKey[] = ["pix", "card_online"];

interface TileMeta {
  title: string;
  hint: string;
  Icon: ComponentType<{ className?: string }>;
}

const META: Record<PaymentKey, TileMeta> = {
  cash: { title: "Dinheiro", hint: "Informe o troco abaixo", Icon: Banknote },
  card_on_delivery: { title: "Cartão", hint: "Pague na maquininha", Icon: CreditCard },
  pay_on_pickup: { title: "Na retirada", hint: "Pague ao buscar o pedido", Icon: Store },
  pix: { title: "Pix", hint: "Pague pelo QR Code", Icon: QrCode },
  card_online: { title: "Cartão online", hint: "Pague pela internet", Icon: Globe },
};

interface Props {
  enabled: PaymentKey[];
  value: string;
  onChange: (key: PaymentKey) => void;
  /** Desconto em % aplicado pela loja ao pagamento em dinheiro, se houver. */
  cashDiscountPercent?: number;
  needsChange: boolean;
  onNeedsChangeToggle: (value: boolean) => void;
  changeFor: string;
  onChangeForChange: (value: string) => void;
}

function Tile({
  meta,
  selected,
  badge,
  onSelect,
}: {
  meta: TileMeta;
  selected: boolean;
  badge?: string | undefined;
  onSelect: () => void;
}) {
  const { Icon } = meta;
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        "relative flex min-h-24 flex-col items-center justify-center gap-1 rounded-xl border px-3 py-4 text-center transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        selected
          ? "border-primary bg-primary text-primary-foreground shadow-sm"
          : "border-border/70 bg-card text-foreground hover:bg-accent",
      )}
    >
      {badge ? (
        <span className="absolute -top-2 right-2 rounded-full bg-destructive px-2 py-0.5 text-[10px] font-bold uppercase text-destructive-foreground">
          {badge}
        </span>
      ) : null}
      <span className="flex items-center gap-2">
        <Icon className="size-5" />
        <span className="text-sm font-bold uppercase tracking-wide">{meta.title}</span>
      </span>
      <span className={cn("text-xs", selected ? "opacity-90" : "text-muted-foreground")}>
        {meta.hint}
      </span>
    </button>
  );
}

export function PaymentMethodPicker({
  enabled,
  value,
  onChange,
  cashDiscountPercent = 0,
  needsChange,
  onNeedsChangeToggle,
  changeFor,
  onChangeForChange,
}: Props) {
  const onlineOptions = enabled.filter((key) => ONLINE_KEYS.includes(key));
  const directOptions = enabled.filter((key) => !ONLINE_KEYS.includes(key));
  const onlineSelected = ONLINE_KEYS.includes(value as PaymentKey);

  return (
    <div className="space-y-3">
      <Label className="text-xs font-bold uppercase tracking-wide">Forma de pagamento</Label>

      <div className="grid gap-3 sm:grid-cols-3">
        {directOptions.map((key) => (
          <Tile
            key={key}
            meta={META[key]}
            selected={value === key}
            badge={key === "cash" && cashDiscountPercent > 0 ? `${cashDiscountPercent}% off` : undefined}
            onSelect={() => onChange(key)}
          />
        ))}

        {onlineOptions.length > 0 ? (
          <Tile
            meta={{ title: "Online", hint: "Pague através da internet", Icon: Globe }}
            selected={onlineSelected}
            onSelect={() => onChange(onlineOptions[0] as PaymentKey)}
          />
        ) : null}
      </div>

      {onlineSelected && onlineOptions.length > 1 ? (
        <div className="grid gap-3 sm:grid-cols-2 sm:px-8">
          {onlineOptions.map((key) => (
            <Tile
              key={key}
              meta={META[key]}
              selected={value === key}
              onSelect={() => onChange(key)}
            />
          ))}
        </div>
      ) : null}

      {value === "cash" ? (
        <div className="space-y-3 rounded-xl border border-border/70 bg-muted/40 p-3">
          <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
            Precisa de troco?
          </p>
          <div className="flex flex-wrap items-center gap-4 text-sm">
            {[
              { label: "Sim", checked: needsChange, next: true },
              { label: "Não", checked: !needsChange, next: false },
            ].map((option) => (
              <button
                key={option.label}
                type="button"
                onClick={() => onNeedsChangeToggle(option.next)}
                aria-pressed={option.checked}
                className="flex items-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    "flex size-4 items-center justify-center rounded-full border",
                    option.checked ? "border-primary" : "border-muted-foreground/50",
                  )}
                >
                  {option.checked ? <span className="size-2 rounded-full bg-primary" /> : null}
                </span>
                <span className={option.checked ? "font-medium text-foreground" : "text-muted-foreground"}>
                  {option.label}
                </span>
              </button>
            ))}
          </div>

          {needsChange ? (
            <div className="space-y-1.5">
              <Label htmlFor="troco-para">Troco para quanto?</Label>
              <Input
                id="troco-para"
                inputMode="decimal"
                placeholder="Ex.: 50,00"
                value={changeFor}
                onChange={(event) => onChangeForChange(event.target.value)}
                className="max-w-40"
              />
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
