import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/**
 * Área do cliente: saldo de cashback por loja, validade e histórico de
 * créditos/resgates.
 *
 * A leitura usa a sessão assinada por telefone (mesma da página
 * /meus-pedidos) e roda com o cliente privilegiado apenas para cruzar
 * `customers` → `loyalty_accounts` → `loyalty_transactions` do próprio
 * telefone verificado. Nenhum dado de outro cliente é retornado.
 */

const sessionInput = z.object({ session: z.string().trim().min(10).max(600) });

/** Uma linha do extrato: crédito (positivo) ou resgate (negativo). */
export interface CashbackEntry {
  id: string;
  createdAt: string;
  amount: number;
  description: string;
  orderCode: string | null;
}

export interface CashbackStoreBalance {
  storeId: string;
  storeName: string;
  storeSlug: string;
  balance: number;
  expiresAt: string | null;
  /** Saldo vence nos próximos 7 dias. */
  expiringSoon: boolean;
  entries: CashbackEntry[];
  /** Código do cliente para indicar amigos ("indique e ganhe"). */
  referralCode: string | null;
  /** Indicações já convertidas em pedido. */
  referralCount: number;
  /** O programa de indicação está ativo nesta loja. */
  referralEnabled: boolean;
  /** Crédito que o cliente ganha por indicação convertida. */
  referralReward: number;
}

export interface CustomerCashbackOverview {
  ok: boolean;
  message: string;
  total: number;
  stores: CashbackStoreBalance[];
}

const EXPIRING_WINDOW_DAYS = 7;

export const customerCashback = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => sessionInput.parse(data))
  .handler(async ({ data }): Promise<CustomerCashbackOverview> => {
    const helpers = await import("@/lib/cliente.server");
    const session = helpers.readSession(data.session);
    if (!session.ok) {
      return { ok: false, message: session.message, total: 0, stores: [] };
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Clientes que compartilham o telefone verificado (um por loja).
    const { data: customers } = await supabaseAdmin
      .from("customers")
      .select("id, phone")
      .limit(500);

    const customerIds = (customers ?? [])
      .filter((row) => helpers.samePhone(row.phone ?? "", session.phoneE164))
      .map((row) => row.id);

    if (customerIds.length === 0) {
      return { ok: true, message: "Você ainda não tem cashback acumulado.", total: 0, stores: [] };
    }

    const { data: accounts } = await supabaseAdmin
      .from("loyalty_accounts")
      .select(
        "id, store_id, customer_id, cashback_balance, cashback_expires_at, referral_code, referral_count, store:stores(name, slug)",
      )
      .in("customer_id", customerIds);

    const { data: transactions } = await supabaseAdmin
      .from("loyalty_transactions")
      .select("id, store_id, customer_id, cashback_amount, description, created_at, order:orders(code)")
      .in("customer_id", customerIds)
      .not("cashback_amount", "is", null)
      .order("created_at", { ascending: false })
      .limit(200);

    const { data: settingsRows } = await supabaseAdmin
      .from("loyalty_settings")
      .select("store_id, is_enabled, referral_enabled, referral_cashback_referrer")
      .in("store_id", (accounts ?? []).map((account) => account.store_id));

    const now = Date.now();
    const stores: CashbackStoreBalance[] = (accounts ?? [])
      .map((account) => {
        const store = account.store as { name: string; slug: string } | null;
        const balance = Number(account.cashback_balance ?? 0);
        const expiresAt = account.cashback_expires_at;
        const entries: CashbackEntry[] = (transactions ?? [])
          .filter(
            (tx) =>
              tx.store_id === account.store_id &&
              tx.customer_id === account.customer_id &&
              Number(tx.cashback_amount ?? 0) !== 0,
          )
          .slice(0, 20)
          .map((tx) => ({
            id: tx.id,
            createdAt: tx.created_at,
            amount: Number(tx.cashback_amount ?? 0),
            description: tx.description ?? "Movimentação de cashback",
            orderCode: (tx.order as { code: string } | null)?.code ?? null,
          }));

        return {
          storeId: account.store_id,
          storeName: store?.name ?? "Loja",
          storeSlug: store?.slug ?? "",
          balance,
          expiresAt,
          expiringSoon: Boolean(
            balance > 0 &&
              expiresAt &&
              new Date(expiresAt).getTime() > now &&
              new Date(expiresAt).getTime() <= now + EXPIRING_WINDOW_DAYS * 86_400_000,
          ),
          entries,
          referralCode: account.referral_code ?? null,
          referralCount: Number(account.referral_count ?? 0),
          referralEnabled: Boolean(
            (settingsRows ?? []).find((row) => row.store_id === account.store_id)?.is_enabled &&
              (settingsRows ?? []).find((row) => row.store_id === account.store_id)
                ?.referral_enabled,
          ),
          referralReward: Math.max(
            0,
            Number(
              (settingsRows ?? []).find((row) => row.store_id === account.store_id)
                ?.referral_cashback_referrer ?? 0,
            ),
          ),
        };
      })
      .filter(
        (store) =>
          store.balance > 0 ||
          store.entries.length > 0 ||
          (store.referralEnabled && Boolean(store.referralCode)),
      )
      .sort((a, b) => b.balance - a.balance);

    return {
      ok: true,
      message: stores.length ? "" : "Você ainda não tem cashback acumulado.",
      total: stores.reduce((sum, store) => sum + Math.max(0, store.balance), 0),
      stores,
    };
  });
