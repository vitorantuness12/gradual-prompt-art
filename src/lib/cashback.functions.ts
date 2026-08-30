import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";

/**
 * Funções públicas do cashback em R$ e do programa "indique e ganhe".
 *
 * São chamadas pela loja pública (checkout / área do cliente), portanto:
 * - nunca recebem ids internos, só o slug da loja e o telefone;
 * - passam por rate limit, porque expõem consulta por telefone;
 * - devolvem apenas saldo, validade e código de indicação do próprio cliente.
 */

function digits(value: string | null | undefined) {
  return (value ?? "").replace(/\D/g, "");
}

const statusInput = z.object({
  storeSlug: z.string().trim().min(1).max(60),
  phone: z.string().trim().min(8).max(30),
});

export interface CashbackStatus {
  /** O programa de cashback está ativo na loja. */
  enabled: boolean;
  /** Saldo utilizável agora (já descontado saldo vencido). */
  balance: number;
  /** Validade do saldo (ISO) ou null quando não expira. */
  expiresAt: string | null;
  /** Percentual do pedido que pode ser pago com cashback (100 = livre). */
  maxPercentUse: number;
  /** Percentual de cashback que a loja devolve por pedido. */
  earnPercent: number;
  /** Pedido mínimo para ganhar cashback. */
  minOrder: number;
  /** Código de indicação do cliente (para ele compartilhar). */
  referralCode: string | null;
  /** Indicações já convertidas. */
  referralCount: number;
  /** O programa de indicação está ativo. */
  referralEnabled: boolean;
  /** Créditos previstos para cada lado da indicação. */
  referralRewards: { referrer: number; referred: number };
  /** O cliente já foi indicado por alguém (não pode usar outro código). */
  referredAlready: boolean;
}

const emptyStatus: CashbackStatus = {
  enabled: false,
  balance: 0,
  expiresAt: null,
  maxPercentUse: 100,
  earnPercent: 0,
  minOrder: 0,
  referralCode: null,
  referralCount: 0,
  referralEnabled: false,
  referralRewards: { referrer: 0, referred: 0 },
  referredAlready: false,
};

export const publicCashbackStatus = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => statusInput.parse(data))
  .handler(async ({ data }): Promise<CashbackStatus> => {
    const { clientIdentifier, consumeRateLimit } = await import("@/lib/security.server");
    const limit = await consumeRateLimit("tracking", clientIdentifier(getRequest()?.headers));
    if (!limit.allowed) return emptyStatus;

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { loadCashbackAccount } = await import("@/lib/cashback.server");

    return loadCashbackAccount(supabaseAdmin, data.storeSlug, digits(data.phone));
  });

const applyInput = z.object({
  storeSlug: z.string().trim().min(1).max(60),
  phone: z.string().trim().min(8).max(30),
  code: z.string().trim().min(4).max(20),
});

export interface ApplyReferralResult {
  ok: boolean;
  message: string;
  /** Crédito que o cliente recebe quando o pedido for concluído. */
  reward: number;
}

/**
 * Vincula o cliente ao código de quem o indicou.
 * O crédito só é pago quando o pedido do indicado é concluído — aqui apenas
 * registramos o vínculo, para não abrir espaço para fraude.
 */
export const applyReferralCode = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => applyInput.parse(data))
  .handler(async ({ data }): Promise<ApplyReferralResult> => {
    const { clientIdentifier, consumeRateLimit, rateLimitMessage } =
      await import("@/lib/security.server");
    const limit = await consumeRateLimit(
      "coupon",
      `${clientIdentifier(getRequest()?.headers)}:${data.storeSlug}`,
    );
    if (!limit.allowed) return { ok: false, message: rateLimitMessage(limit), reward: 0 };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { linkReferral } = await import("@/lib/cashback.server");

    return linkReferral(supabaseAdmin, data.storeSlug, digits(data.phone), data.code);
  });
