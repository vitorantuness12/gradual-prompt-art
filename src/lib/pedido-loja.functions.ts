/**
 * Server function do envio de pedido da loja (delivery/restaurante).
 *
 * Arquivo fino de propósito: apenas validação de entrada e delegação.
 */
import { createServerFn } from "@tanstack/react-start";

import type { PedidoLojaResult } from "@/lib/pedido-loja";
import { validatePedidoLoja } from "@/lib/pedido-loja-validation.server";

export const enviarPedidoLoja = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => data)
  .handler(async ({ data }): Promise<PedidoLojaResult> => {
    const validation = validatePedidoLoja(data);
    if (!validation.success) return { ok: false, message: validation.message };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { gravarPedidoLoja } = await import("@/lib/pedido-loja.server");
    return gravarPedidoLoja(supabaseAdmin, validation.data);
  });
