/**
 * Regras puras do cashback em reais e do programa "indique e ganhe".
 *
 * Ficam aqui (sem banco nem rede) para serem usadas no navegador (checkout),
 * no painel e nas funções de servidor com o mesmo comportamento — e para
 * poderem ser testadas isoladamente.
 *
 * Decisões de negócio importantes:
 * - o saldo tem UMA validade por cliente, renovada a cada novo crédito
 *   (mais simples de explicar ao cliente do que lotes com validades diferentes);
 * - saldo vencido vale zero, mas nunca fica negativo;
 * - a loja pode limitar quanto do pedido pode ser pago com cashback.
 */

/** Arredonda para centavos evitando ruído de ponto flutuante. */
export function toCents(value: number): number {
  return Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;
}

/** Saldo realmente utilizável: zero quando a validade já passou. */
export function effectiveCashback(
  balance: number | string | null | undefined,
  expiresAt: string | null | undefined,
  now: number = Date.now(),
): number {
  const value = toCents(Number(balance ?? 0));
  if (value <= 0) return 0;
  if (expiresAt) {
    const deadline = new Date(expiresAt).getTime();
    if (Number.isFinite(deadline) && deadline <= now) return 0;
  }
  return value;
}

/**
 * Quanto do pedido pode ser pago com cashback agora.
 * `maxPercentUse` limita a fatia do subtotal (100 = sem limite).
 */
export function maxRedeemable(
  balance: number,
  amountDue: number,
  maxPercentUse: number | string | null | undefined = 100,
): number {
  const due = Math.max(0, toCents(amountDue));
  const available = Math.max(0, toCents(balance));
  if (due === 0 || available === 0) return 0;

  const percent = Number(maxPercentUse ?? 100);
  const cap = Number.isFinite(percent) && percent > 0 && percent < 100 ? (due * percent) / 100 : due;

  return toCents(Math.min(available, due, cap));
}

/** Cashback gerado por um pedido, respeitando o pedido mínimo da loja. */
export function cashbackEarned(
  orderTotal: number,
  percent: number | string | null | undefined,
  minOrder: number | string | null | undefined = 0,
): number {
  const total = toCents(orderTotal);
  const rate = Number(percent ?? 0);
  if (!Number.isFinite(rate) || rate <= 0) return 0;
  if (total < Number(minOrder ?? 0)) return 0;
  return toCents((total * rate) / 100);
}

/**
 * Nova validade do saldo depois de um crédito.
 * `days = 0` significa "não expira" e limpa a validade anterior.
 */
export function renewExpiry(days: number | string | null | undefined, now: number = Date.now()): string | null {
  const value = Number(days ?? 0);
  if (!Number.isFinite(value) || value <= 0) return null;
  return new Date(now + value * 86_400_000).toISOString();
}

/** Dias restantes (arredondados para cima) até o saldo vencer. */
export function daysUntilExpiry(expiresAt: string | null | undefined, now: number = Date.now()): number | null {
  if (!expiresAt) return null;
  const deadline = new Date(expiresAt).getTime();
  if (!Number.isFinite(deadline)) return null;
  return Math.max(0, Math.ceil((deadline - now) / 86_400_000));
}

/** Código de indicação amigável (sem caracteres ambíguos). */
export function referralCodeFor(seed?: string): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const source = (seed ?? "").replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  let code = "";
  for (let index = 0; index < 6; index += 1) {
    const pick = source[index]
      ? alphabet[source.charCodeAt(index) % alphabet.length]
      : alphabet[Math.floor(Math.random() * alphabet.length)];
    code += pick;
  }
  return `IND${code}`;
}

/** Normaliza o código digitado pelo cliente. */
export function normalizeReferralCode(value: string | null | undefined): string {
  return (value ?? "").trim().toUpperCase().replace(/\s+/g, "");
}

export interface ReferralRewards {
  referrer: number;
  referred: number;
}

/** Créditos das duas pontas da indicação (nunca negativos). */
export function referralRewards(settings: {
  referral_enabled?: boolean | null;
  referral_cashback_referrer?: number | string | null;
  referral_cashback_referred?: number | string | null;
}): ReferralRewards {
  if (!settings.referral_enabled) return { referrer: 0, referred: 0 };
  return {
    referrer: Math.max(0, toCents(Number(settings.referral_cashback_referrer ?? 0))),
    referred: Math.max(0, toCents(Number(settings.referral_cashback_referred ?? 0))),
  };
}
