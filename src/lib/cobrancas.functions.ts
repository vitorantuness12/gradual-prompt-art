import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Pontes RPC da tela de cobranças. Toda regra vive em `cobrancas.server.ts`. */

async function assertStaff(
  context: { supabase: { rpc: (fn: string, args: unknown) => Promise<{ data: unknown }> }; userId: string },
  storeId: string,
) {
  const { data } = await context.supabase.rpc("is_store_staff", { _store_id: storeId, _user_id: context.userId });
  if (data !== true) throw new Error("Sem permissão nesta loja.");
}

/** Transações da loja no período. */
export const listStoreCharges = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { storeId: string; from?: string | null; to?: string | null; status?: string | null }) => input)
  .handler(async ({ data, context }) => {
    await assertStaff(context as never, data.storeId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { listCharges } = await import("@/lib/cobrancas.server");
    return listCharges(supabaseAdmin, data);
  });

/** Muda a situação da cobrança (e libera o acesso digital quando pago). */
export const settleStoreCharge = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: { storeId: string; paymentId: string; status: "pending" | "paid" | "failed" | "refunded"; note?: string | null }) =>
      input,
  )
  .handler(async ({ data, context }) => {
    await assertStaff(context as never, data.storeId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { settleCharge } = await import("@/lib/cobrancas.server");
    return settleCharge(supabaseAdmin, data);
  });
