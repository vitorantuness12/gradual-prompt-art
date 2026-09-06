import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";

/**
 * Solicitações de dados (LGPD) recebidas pela loja.
 *
 * Regras:
 * - só a equipe com permissão em "settings" enxerga e responde;
 * - toda resposta guarda quem tratou e quando;
 * - a exclusão real dos dados do cliente é feita pelo lojista e registrada aqui.
 */

export type DataRequestRow = Database["public"]["Tables"]["data_requests"]["Row"];

export const DATA_REQUEST_KINDS = [
  { value: "export", label: "Cópia dos dados" },
  { value: "delete", label: "Exclusão dos dados" },
  { value: "correction", label: "Correção de dados" },
  { value: "opt_out", label: "Parar de receber mensagens" },
] as const;

export const DATA_REQUEST_STATUS_LABEL: Record<string, string> = {
  pending: "Aguardando resposta",
  in_progress: "Em análise",
  done: "Concluída",
  rejected: "Recusada",
};

export function dataRequestsKey(storeId: string | undefined) {
  return ["solicitacoes-dados", storeId] as const;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function assertPermission(supabase: any, storeId: string, userId: string) {
  const { data } = await supabase.rpc("has_store_permission", {
    _store_id: storeId,
    _user_id: userId,
    _area: "settings",
  });
  if (data !== true) throw new Error("Você não tem permissão para tratar solicitações desta loja.");
}

const storeInput = z.object({ storeId: z.string().uuid() });

export const listStoreDataRequests = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => storeInput.parse(data))
  .handler(async ({ data, context }): Promise<DataRequestRow[]> => {
    await assertPermission(context.supabase, data.storeId, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows } = await supabaseAdmin
      .from("data_requests")
      .select("*")
      .eq("store_id", data.storeId)
      .order("created_at", { ascending: false })
      .limit(200);
    return rows ?? [];
  });

const registerInput = z.object({
  storeId: z.string().uuid(),
  kind: z.enum(["export", "delete", "correction", "opt_out"]),
  contact: z.string().trim().min(3).max(160),
  note: z.string().trim().max(600).optional(),
});

/** Registra um pedido recebido por telefone, e-mail ou balcão. */
export const registerDataRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => registerInput.parse(data))
  .handler(async ({ data, context }) => {
    await assertPermission(context.supabase, data.storeId, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { error } = await supabaseAdmin.from("data_requests").insert({
      store_id: data.storeId,
      user_id: context.userId,
      kind: data.kind,
      status: "pending",
      contact: data.contact,
      note: data.note ?? null,
      details: { registered_by_staff: true },
    });
    if (error) return { ok: false, message: error.message };
    return { ok: true, message: "Solicitação registrada." };
  });

const resolveInput = z.object({
  storeId: z.string().uuid(),
  requestId: z.string().uuid(),
  status: z.enum(["pending", "in_progress", "done", "rejected"]),
  note: z.string().trim().max(600).optional(),
});

export const resolveDataRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => resolveInput.parse(data))
  .handler(async ({ data, context }) => {
    await assertPermission(context.supabase, data.storeId, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const finished = data.status === "done" || data.status === "rejected";
    const { error } = await supabaseAdmin
      .from("data_requests")
      .update({
        status: data.status,
        note: data.note ?? null,
        handled_by: context.userId,
        handled_at: finished ? new Date().toISOString() : null,
      })
      .eq("id", data.requestId)
      .eq("store_id", data.storeId);
    if (error) return { ok: false, message: error.message };

    await supabaseAdmin.from("audit_logs").insert({
      store_id: data.storeId,
      user_id: context.userId,
      action: "data_request.update",
      entity: "data_requests",
      entity_id: data.requestId,
      metadata: { status: data.status },
    });

    return { ok: true, message: "Solicitação atualizada." };
  });
