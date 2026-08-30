import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Painel do lojista: recuperação de carrinho abandonado + regras de upsell.
 *
 * Tudo passa pelo cliente autenticado (`context.supabase`), então a RLS de
 * `store_checkout_settings` e do catálogo continua valendo — não há acesso
 * privilegiado aqui de propósito.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function assertPermission(supabase: any, storeId: string, userId: string) {
  const { data } = await supabase.rpc("has_store_permission", {
    _store_id: storeId,
    _user_id: userId,
    _area: "settings",
  });
  if (data !== true) throw new Error("Você não tem permissão para esta ação.");
}

export interface RecoverySettings {
  abandonedCartEnabled: boolean;
  abandonedCartDelayMinutes: number;
  abandonedCartCouponCode: string | null;
  upsellEnabled: boolean;
  upsellMaxItems: number;
}

export interface UpsellPreviewLine {
  /** Produto que o cliente colocou no carrinho (gatilho da sugestão). */
  trigger: string;
  /** Sugestões que apareceriam no carrinho e no checkout. */
  suggestions: { name: string; price: number }[];
}

export interface RecoveryPanelData {
  settings: RecoverySettings;
  /** Cupons ativos que podem ser usados na mensagem de recuperação. */
  coupons: { code: string; description: string | null }[];
  /** Carrinhos abandonados abertos (para o lojista ver o impacto). */
  pending: number;
  /** Carrinhos recuperados nos últimos 30 dias. */
  recovered: number;
  preview: UpsellPreviewLine[];
  /** Última execução da rotina automática de lembretes. */
  lastRunAt: string | null;
}

const storeInput = z.object({ storeId: z.string().uuid() });

export const recoveryPanelData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => storeInput.parse(data))
  .handler(async ({ data, context }): Promise<RecoveryPanelData> => {
    await assertPermission(context.supabase, data.storeId, context.userId);
    const { buildUpsellSuggestions } = await import("@/lib/upsell");

    const since = new Date(Date.now() - 30 * 86_400_000).toISOString();

    const [{ data: settingsRow }, { data: coupons }, { data: carts }, { data: products }, { data: related }] =
      await Promise.all([
        context.supabase
          .from("store_checkout_settings")
          .select(
            "abandoned_cart_enabled, abandoned_cart_delay_minutes, abandoned_cart_coupon_code, upsell_enabled, upsell_max_items",
          )
          .eq("store_id", data.storeId)
          .maybeSingle(),
        context.supabase
          .from("promotions")
          .select("code, description")
          .eq("store_id", data.storeId)
          .eq("is_active", true)
          .order("code"),
        context.supabase
          .from("abandoned_carts")
          .select("id, recovered_at, created_at")
          .eq("store_id", data.storeId)
          .gte("created_at", since),
        context.supabase
          .from("products")
          .select("id, name, price, image_url, is_available, track_stock, stock_quantity, kind")
          .eq("store_id", data.storeId)
          .eq("is_available", true)
          .limit(400),
        context.supabase
          .from("product_related")
          .select("product_id, related_product_id, sort_order")
          .eq("store_id", data.storeId)
          .limit(600),
      ]);

    const settings: RecoverySettings = {
      abandonedCartEnabled: settingsRow?.abandoned_cart_enabled ?? true,
      abandonedCartDelayMinutes: settingsRow?.abandoned_cart_delay_minutes ?? 30,
      abandonedCartCouponCode: settingsRow?.abandoned_cart_coupon_code ?? null,
      upsellEnabled: settingsRow?.upsell_enabled ?? true,
      upsellMaxItems: settingsRow?.upsell_max_items ?? 4,
    };

    // Prévia: simula um carrinho com cada produto que tem relacionados e mostra
    // exatamente o que o cliente veria, com o limite configurado.
    const productList = products ?? [];
    const relations = related ?? [];
    const triggers = [...new Set(relations.map((row) => row.product_id))].slice(0, 4);
    const preview: UpsellPreviewLine[] = triggers.flatMap((productId) => {
      const trigger = productList.find((row) => row.id === productId);
      if (!trigger) return [];
      const suggestions = buildUpsellSuggestions({
        products: productList,
        related: relations,
        cartProductIds: [productId],
        requiresChoiceIds: [],
        max: settings.upsellMaxItems,
      });
      if (suggestions.length === 0) return [];
      return [
        {
          trigger: trigger.name,
          suggestions: suggestions.map((item) => ({ name: item.product.name, price: item.price })),
        },
      ];
    });

    const { data: cron } = await context.supabase
      .from("cron_tokens")
      .select("last_run_at")
      .eq("name", "carrinho_abandonado")
      .maybeSingle();

    return {
      settings,
      coupons: (coupons ?? []).map((row) => ({ code: row.code, description: row.description })),
      pending: (carts ?? []).filter((row) => !row.recovered_at).length,
      recovered: (carts ?? []).filter((row) => Boolean(row.recovered_at)).length,
      preview,
      lastRunAt: cron?.last_run_at ?? null,
    };
  });

const saveInput = z.object({
  storeId: z.string().uuid(),
  abandonedCartEnabled: z.boolean(),
  abandonedCartDelayMinutes: z.number().int().min(10).max(1440),
  abandonedCartCouponCode: z.string().trim().max(40).optional(),
  upsellEnabled: z.boolean(),
  upsellMaxItems: z.number().int().min(1).max(8),
});

export const saveRecoverySettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => saveInput.parse(data))
  .handler(async ({ data, context }): Promise<{ ok: boolean; message: string }> => {
    await assertPermission(context.supabase, data.storeId, context.userId);

    const code = (data.abandonedCartCouponCode ?? "").trim().toUpperCase();

    // Um cupom inexistente na mensagem de recuperação frustra o cliente:
    // validamos antes de salvar.
    if (code) {
      const { data: promo } = await context.supabase
        .from("promotions")
        .select("code")
        .eq("store_id", data.storeId)
        .eq("code", code)
        .eq("is_active", true)
        .maybeSingle();
      if (!promo) {
        return { ok: false, message: `O cupom ${code} não existe ou está inativo nesta loja.` };
      }
    }

    const { error } = await context.supabase.from("store_checkout_settings").upsert(
      {
        store_id: data.storeId,
        abandoned_cart_enabled: data.abandonedCartEnabled,
        abandoned_cart_delay_minutes: data.abandonedCartDelayMinutes,
        abandoned_cart_coupon_code: code || null,
        upsell_enabled: data.upsellEnabled,
        upsell_max_items: data.upsellMaxItems,
      },
      { onConflict: "store_id" },
    );
    if (error) return { ok: false, message: error.message };

    return { ok: true, message: "Configurações de recuperação e upsell salvas." };
  });
