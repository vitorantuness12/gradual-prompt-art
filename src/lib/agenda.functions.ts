import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Dispara os lembretes pendentes da loja (botão "enviar agora" do painel). */
export const sendAppointmentRemindersNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { storeId: string; baseUrl: string }) => input)
  .handler(async ({ data, context }) => {
    const { data: allowed } = await context.supabase.rpc("is_store_staff", {
      _store_id: data.storeId,
      _user_id: context.userId,
    });
    if (!allowed) throw new Error("Sem permissão nesta loja.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { runAppointmentReminders } = await import("@/lib/agenda.server");
    return runAppointmentReminders(supabaseAdmin, { storeId: data.storeId, baseUrl: data.baseUrl });
  });

/** Leitura pública do horário pelo link de confirmação (sem expor a loja). */
export const getAppointmentByToken = createServerFn({ method: "GET" })
  .inputValidator((input: { token: string }) => input)
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { loadAppointmentByToken } = await import("@/lib/agenda.server");
    return loadAppointmentByToken(supabaseAdmin, data.token);
  });

/** Confirmação ou cancelamento do cliente com um clique. */
export const respondAppointment = createServerFn({ method: "POST" })
  .inputValidator((input: { token: string; action: "confirm" | "cancel"; reason?: string }) => input)
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { respondToAppointment } = await import("@/lib/agenda.server");
    return respondToAppointment(supabaseAdmin, data.token, data.action, data.reason);
  });

/** Horários livres oferecidos ao cliente no reagendamento pelo link. */
export const getRescheduleOptions = createServerFn({ method: "GET" })
  .inputValidator((input: { token: string }) => input)
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { availableSlots } = await import("@/lib/agenda.server");
    return availableSlots(supabaseAdmin, data.token);
  });

/** Reagendamento em um clique pelo link do cliente. */
export const rescheduleAppointment = createServerFn({ method: "POST" })
  .inputValidator((input: { token: string; startsAt: string }) => input)
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { rescheduleByToken } = await import("@/lib/agenda.server");
    return rescheduleByToken(supabaseAdmin, data.token, data.startsAt);
  });
