import { Link } from "@tanstack/react-router";
import { Lock, Sparkles } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useLimitCheck } from "@/hooks/useSubscription";
import type { LimitKey } from "@/lib/plans";
import { LIMIT_KEYS, formatLimit } from "@/lib/plans";

interface LimitGateProps {
  storeId: string | undefined;
  limitKey: LimitKey;
  children: ReactNode;
  /** Texto curto da ação bloqueada, ex.: "adicionar mais produtos". */
  action?: string;
}

/**
 * Mostra o conteúdo normalmente enquanto houver saldo no plano.
 * Ao atingir o limite, explica o motivo e leva para o upgrade.
 */
export function LimitGate({ storeId, limitKey, children, action }: LimitGateProps) {
  const { blocked, limit, current, plan, isLoading } = useLimitCheck(storeId, limitKey);
  if (isLoading || !blocked) return <>{children}</>;

  const label = LIMIT_KEYS.find((item) => item.key === limitKey)?.label ?? "recurso";

  return (
    <div className="rounded-2xl border border-dashed border-primary/40 bg-primary/5 p-6 text-center">
      <div className="mx-auto flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary">
        <Lock className="size-5" aria-hidden="true" />
      </div>
      <h3 className="mt-3 text-base font-semibold text-foreground">
        Limite do plano {plan?.name} atingido
      </h3>
      <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
        Seu plano inclui {formatLimit(limit)} em {label.toLowerCase()} e você já está usando {current}. Faça upgrade
        para {action ?? "continuar"} sem interrupção — nada do que já existe é apagado.
      </p>
      <Progress value={100} className="mx-auto mt-4 h-2 max-w-xs" />
      <Button asChild className="mt-5 bg-accent text-accent-foreground hover:bg-accent/90">
        <Link to="/painel/assinatura">
          <Sparkles className="mr-2 size-4" aria-hidden="true" />
          Ver planos e fazer upgrade
        </Link>
      </Button>
    </div>
  );
}

/** Aviso compacto de uso, para colocar acima de listas. */
export function LimitMeter({ storeId, limitKey }: { storeId: string | undefined; limitKey: LimitKey }) {
  const { limit, current, isLoading } = useLimitCheck(storeId, limitKey);
  if (isLoading || limit < 0) return null;
  const label = LIMIT_KEYS.find((item) => item.key === limitKey)?.label ?? "";
  const pct = limit > 0 ? Math.min(100, Math.round((current / limit) * 100)) : 100;
  return (
    <div className="flex items-center gap-3 text-xs text-muted-foreground">
      <span>
        {label}: {current} de {formatLimit(limit)}
      </span>
      <Progress value={pct} className="h-1.5 w-24" />
    </div>
  );
}
