/**
 * Rotina de lembretes automáticos de horário (24h e 2h antes), fila de envio,
 * confirmação e reagendamento do cliente pelo link. Roda só no servidor,
 * com a chave administrativa.
 */
import { sendWhatsappMessage } from "@/lib/whatsapp/send.server";

type Admin = Awaited<typeof import("@/integrations/supabase/client.server")>["supabaseAdmin"];

const DEFAULT_TEMPLATE =
  "Olá, {{nome_cliente}}! Lembrete do seu horário na {{nome_loja}}: {{data}} às {{hora}}. Confirme em um clique: {{link}}";

export interface ReminderResult {
  checked: number;
  sent: number;
  failed: number;
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

function formatTime(value: string) {
  return new Date(value).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

/**
 * Garante que todo horário próximo tenha o lembrete na fila. O agendador do
 * banco também faz isso a cada 5 minutos; aqui repetimos para o disparo manual.
 */
async function enqueuePending(admin: Admin, storeId: string | undefined, now: Date) {
  const limit = new Date(now.getTime() + 25 * 3_600_000).toISOString();
  let query = admin
    .from("appointments")
    .select("id, store_id, starts_at, customer_phone, reminder_24h_sent_at, reminder_2h_sent_at")
    .in("status", ["scheduled", "confirmed"])
    .gte("starts_at", now.toISOString())
    .lte("starts_at", limit)
    .limit(500);
  if (storeId) query = query.eq("store_id", storeId);

  const { data: rows } = await query;
  const pending = (rows ?? []).filter((row) => row.customer_phone);
  if (pending.length === 0) return;

  const storeIds = [...new Set(pending.map((row) => row.store_id))];
  const { data: settings } = await admin
    .from("scheduling_settings")
    .select("store_id, reminder_24h, reminder_2h")
    .in("store_id", storeIds);

  const items: {
    store_id: string;
    appointment_id: string;
    kind: string;
    scheduled_for: string;
  }[] = [];

  for (const row of pending) {
    const config = (settings ?? []).find((item) => item.store_id === row.store_id);
    const hours = (new Date(row.starts_at).getTime() - now.getTime()) / 3_600_000;
    if ((config?.reminder_24h ?? true) && hours <= 24 && !row.reminder_24h_sent_at) {
      items.push({
        store_id: row.store_id,
        appointment_id: row.id,
        kind: "24h",
        scheduled_for: new Date(new Date(row.starts_at).getTime() - 24 * 3_600_000).toISOString(),
      });
    }
    if ((config?.reminder_2h ?? true) && hours <= 2 && !row.reminder_2h_sent_at) {
      items.push({
        store_id: row.store_id,
        appointment_id: row.id,
        kind: "2h",
        scheduled_for: new Date(new Date(row.starts_at).getTime() - 2 * 3_600_000).toISOString(),
      });
    }
  }

  if (items.length > 0) {
    await admin
      .from("appointment_reminder_queue")
      .upsert(items as never, { onConflict: "appointment_id,kind", ignoreDuplicates: true });
  }
}

/**
 * Drena a fila de lembretes: envia os pendentes já vencidos, registra falhas
 * para nova tentativa e marca o horário como avisado.
 */
export async function runAppointmentReminders(
  admin: Admin,
  options: { storeId?: string | undefined; baseUrl: string; now?: Date },
): Promise<ReminderResult> {
  const now = options.now ?? new Date();
  await enqueuePending(admin, options.storeId, now);

  let queueQuery = admin
    .from("appointment_reminder_queue")
    .select("*")
    .eq("status", "pending")
    .lte("scheduled_for", now.toISOString())
    .lt("attempts", 5)
    .order("scheduled_for", { ascending: true })
    .limit(200);
  if (options.storeId) queueQuery = queueQuery.eq("store_id", options.storeId);

  const { data: queue } = await queueQuery;
  const items = queue ?? [];
  const result: ReminderResult = { checked: items.length, sent: 0, failed: 0 };
  if (items.length === 0) return result;

  const appointmentIds = items.map((item) => item.appointment_id);
  const storeIds = [...new Set(items.map((item) => item.store_id))];
  const [{ data: appointments }, { data: stores }, { data: settings }] = await Promise.all([
    admin.from("appointments").select("*").in("id", appointmentIds),
    admin.from("stores").select("id, name").in("id", storeIds),
    admin.from("scheduling_settings").select("*").in("store_id", storeIds),
  ]);

  for (const item of items) {
    const appointment = (appointments ?? []).find((row) => row.id === item.appointment_id);
    if (!appointment || !appointment.customer_phone || !["scheduled", "confirmed"].includes(appointment.status)) {
      await admin
        .from("appointment_reminder_queue")
        .update({ status: "skipped", last_error: "Horário não está mais ativo." })
        .eq("id", item.id);
      continue;
    }

    const config = (settings ?? []).find((row) => row.store_id === appointment.store_id);
    const storeName = (stores ?? []).find((store) => store.id === appointment.store_id)?.name ?? "nossa loja";
    const link = `${options.baseUrl.replace(/\/$/, "")}/agendamento/${appointment.confirmation_token}`;
    const body = (config?.reminder_template || DEFAULT_TEMPLATE)
      .replace(/\{\{\s*nome_cliente\s*\}\}/g, appointment.customer_name)
      .replace(/\{\{\s*nome_loja\s*\}\}/g, storeName)
      .replace(/\{\{\s*data\s*\}\}/g, formatDate(appointment.starts_at))
      .replace(/\{\{\s*hora\s*\}\}/g, formatTime(appointment.starts_at))
      .replace(/\{\{\s*link\s*\}\}/g, link);

    const outcome = await sendWhatsappMessage(admin, {
      storeId: appointment.store_id,
      phone: appointment.customer_phone,
      body,
      messageType: "transactional",
      templateKey: item.kind === "2h" ? "appointment_reminder_2h" : "appointment_reminder_24h",
    });

    if (outcome.ok) {
      result.sent += 1;
      await Promise.all([
        admin
          .from("appointment_reminder_queue")
          .update({ status: "sent", sent_at: now.toISOString(), attempts: item.attempts + 1, last_error: null })
          .eq("id", item.id),
        admin
          .from("appointments")
          .update(
            item.kind === "2h"
              ? { reminder_2h_sent_at: now.toISOString() }
              : { reminder_24h_sent_at: now.toISOString() },
          )
          .eq("id", appointment.id),
      ]);
    } else {
      result.failed += 1;
      const attempts = item.attempts + 1;
      await admin
        .from("appointment_reminder_queue")
        .update({
          status: attempts >= 5 ? "failed" : "pending",
          attempts,
          last_error: outcome.message,
        })
        .eq("id", item.id);
    }
  }

  return result;
}

/* ------------------------------------------------------------------ */
/* Link do cliente: consulta, resposta e reagendamento                 */
/* ------------------------------------------------------------------ */

export interface TokenAppointment {
  id: string;
  customerName: string;
  startsAt: string;
  endsAt: string;
  status: string;
  storeName: string;
  storeSlug: string;
  cancellationHours: number;
  cancellationPolicy: string | null;
  depositAmount: number;
  depositStatus: string;
  allowReschedule: boolean;
  rescheduleMinHours: number;
  remainingReschedules: number;
}

/** Dados públicos do agendamento a partir do link de confirmação. */
export async function loadAppointmentByToken(admin: Admin, token: string): Promise<TokenAppointment | null> {
  const { data } = await admin
    .from("appointments")
    .select(
      "id, store_id, customer_name, starts_at, ends_at, status, price, deposit_amount, deposit_status, reschedule_count",
    )
    .eq("confirmation_token", token)
    .maybeSingle();
  if (!data) return null;

  const [{ data: store }, { data: config }] = await Promise.all([
    admin.from("stores").select("name, slug").eq("id", data.store_id).maybeSingle(),
    admin.from("scheduling_settings").select("*").eq("store_id", data.store_id).maybeSingle(),
  ]);

  const maxReschedules = config?.max_reschedules ?? 2;
  return {
    id: data.id,
    customerName: data.customer_name,
    startsAt: data.starts_at,
    endsAt: data.ends_at ?? data.starts_at,
    status: data.status,
    storeName: store?.name ?? "",
    storeSlug: store?.slug ?? "",
    cancellationHours: config?.cancellation_hours ?? 24,
    cancellationPolicy: config?.cancellation_policy ?? null,
    depositAmount: Number(data.deposit_amount ?? 0),
    depositStatus: data.deposit_status ?? "none",
    allowReschedule: config?.allow_reschedule ?? true,
    rescheduleMinHours: config?.reschedule_min_hours ?? 6,
    remainingReschedules: Math.max(0, maxReschedules - Number(data.reschedule_count ?? 0)),
  };
}

/** Confirma ou cancela o horário pelo link enviado ao cliente. */
export async function respondToAppointment(
  admin: Admin,
  token: string,
  action: "confirm" | "cancel",
  reason?: string,
): Promise<{ ok: boolean; message: string }> {
  const { data } = await admin
    .from("appointments")
    .select("id, store_id, customer_name, starts_at, status, deposit_amount, deposit_status")
    .eq("confirmation_token", token)
    .maybeSingle();
  if (!data) return { ok: false, message: "Agendamento não encontrado." };
  if (data.status === "done") return { ok: false, message: "Este atendimento já foi concluído." };

  const now = new Date();
  const nowIso = now.toISOString();

  if (action === "confirm") {
    const { error } = await admin
      .from("appointments")
      .update({ status: "confirmed", confirmed_at: nowIso })
      .eq("id", data.id);
    if (error) return { ok: false, message: "Não foi possível atualizar agora." };
    await notifyStore(admin, data.store_id, "appointment_confirmed", "Horário confirmado pelo cliente", data);
    return { ok: true, message: "Presença confirmada. Até logo!" };
  }

  // Cancelamento: aplica a política de sinal conforme a antecedência.
  const { data: config } = await admin
    .from("scheduling_settings")
    .select("cancellation_hours")
    .eq("store_id", data.store_id)
    .maybeSingle();
  const hours = (new Date(data.starts_at).getTime() - now.getTime()) / 3_600_000;
  const lateCancel = hours < (config?.cancellation_hours ?? 24);
  const deposit = Number(data.deposit_amount ?? 0);
  const paid = data.deposit_status === "paid";

  const patch = {
    status: "cancelled" as const,
    cancelled_at: nowIso,
    cancel_reason: reason?.trim() || (lateCancel ? "Cancelado fora do prazo" : "Cancelado pelo cliente"),
    cancelled_by: "customer",
    charged_amount: paid && lateCancel ? deposit : 0,
    refunded_amount: paid && !lateCancel ? deposit : 0,
    deposit_status: paid ? (lateCancel ? "paid" : "refunded") : data.deposit_status,
  };

  const { error } = await admin.from("appointments").update(patch).eq("id", data.id);
  if (error) return { ok: false, message: "Não foi possível atualizar agora." };
  await notifyStore(admin, data.store_id, "appointment_cancelled", "Horário cancelado pelo cliente", data);

  return {
    ok: true,
    message:
      paid && lateCancel
        ? "Horário cancelado. Conforme a política, o sinal fica retido."
        : "Horário cancelado. Obrigado por avisar.",
  };
}

async function notifyStore(
  admin: Admin,
  storeId: string,
  event: string,
  title: string,
  data: { id: string; customer_name: string; starts_at: string },
) {
  await admin.from("notifications").insert({
    store_id: storeId,
    event,
    title,
    body: `${data.customer_name} — ${new Date(data.starts_at).toLocaleString("pt-BR")}`,
    payload: { appointment_id: data.id } as never,
  });
}

/* ------------------------------------------------------------------ */
/* Janelas livres e reagendamento                                      */
/* ------------------------------------------------------------------ */

export interface SlotOption {
  startsAt: string;
  label: string;
}

function toMinutes(value: string | null | undefined, fallback: number) {
  if (!value) return fallback;
  const [h = "0", m = "0"] = value.split(":");
  return Number(h) * 60 + Number(m);
}

/** Horários livres nos próximos dias, respeitando bloqueios e agenda ocupada. */
export async function availableSlots(
  admin: Admin,
  token: string,
  days = 14,
): Promise<SlotOption[]> {
  const { data: appointment } = await admin
    .from("appointments")
    .select("id, store_id, professional_id, starts_at, ends_at")
    .eq("confirmation_token", token)
    .maybeSingle();
  if (!appointment) return [];

  const [{ data: config }, { data: blocks }, { data: busy }] = await Promise.all([
    admin.from("scheduling_settings").select("*").eq("store_id", appointment.store_id).maybeSingle(),
    admin.from("schedule_blocks").select("*").eq("store_id", appointment.store_id),
    admin
      .from("appointments")
      .select("id, professional_id, starts_at, ends_at")
      .eq("store_id", appointment.store_id)
      .in("status", ["scheduled", "confirmed"])
      .gte("starts_at", new Date().toISOString()),
  ]);

  const step = Math.max(10, config?.slot_minutes ?? 30);
  const open = toMinutes(config?.open_time, 9 * 60);
  const close = toMinutes(config?.close_time, 18 * 60);
  const minHours = config?.reschedule_min_hours ?? 6;
  const durationMs =
    new Date(appointment.ends_at ?? appointment.starts_at).getTime() - new Date(appointment.starts_at).getTime() ||
    step * 60_000;

  const now = new Date();
  const earliest = now.getTime() + minHours * 3_600_000;
  const taken = (busy ?? []).filter(
    (row) =>
      row.id !== appointment.id &&
      (!appointment.professional_id || row.professional_id === appointment.professional_id),
  );

  const slots: SlotOption[] = [];
  for (let day = 0; day < days && slots.length < 60; day += 1) {
    const base = new Date(now.getFullYear(), now.getMonth(), now.getDate() + day);
    for (let minutes = open; minutes + step <= close; minutes += step) {
      const start = new Date(base.getTime() + minutes * 60_000);
      const end = new Date(start.getTime() + durationMs);
      if (start.getTime() < earliest) continue;

      const blocked = (blocks ?? []).some((block) => {
        if (block.professional_id && block.professional_id !== appointment.professional_id) return false;
        if (block.is_recurring) {
          if (block.weekday !== start.getDay()) return false;
          const value = start.getHours() * 60 + start.getMinutes();
          return value >= toMinutes(block.start_time, 0) && value < toMinutes(block.end_time, 0);
        }
        return (
          start.getTime() < new Date(block.ends_at).getTime() &&
          end.getTime() > new Date(block.starts_at).getTime()
        );
      });
      if (blocked) continue;

      const conflict = taken.some(
        (row) =>
          start.getTime() < new Date(row.ends_at ?? row.starts_at).getTime() &&
          end.getTime() > new Date(row.starts_at).getTime(),
      );
      if (conflict) continue;

      slots.push({
        startsAt: start.toISOString(),
        label: start.toLocaleString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }),
      });
      if (slots.length >= 60) break;
    }
  }
  return slots;
}

/** Reagenda o horário pelo link do cliente, mantendo o sinal já pago. */
export async function rescheduleByToken(
  admin: Admin,
  token: string,
  startsAt: string,
): Promise<{ ok: boolean; message: string }> {
  const { data } = await admin
    .from("appointments")
    .select("id, store_id, customer_name, starts_at, ends_at, status, reschedule_count")
    .eq("confirmation_token", token)
    .maybeSingle();
  if (!data) return { ok: false, message: "Agendamento não encontrado." };
  if (!["scheduled", "confirmed"].includes(data.status)) {
    return { ok: false, message: "Este horário não pode mais ser alterado." };
  }

  const { data: config } = await admin
    .from("scheduling_settings")
    .select("allow_reschedule, max_reschedules, reschedule_min_hours")
    .eq("store_id", data.store_id)
    .maybeSingle();
  if (config && config.allow_reschedule === false) {
    return { ok: false, message: "A loja não permite reagendamento pelo link." };
  }
  const max = config?.max_reschedules ?? 2;
  if (Number(data.reschedule_count ?? 0) >= max) {
    return { ok: false, message: "Limite de reagendamentos atingido. Fale com a loja." };
  }

  const options = await availableSlots(admin, token);
  if (!options.some((slot) => slot.startsAt === startsAt)) {
    return { ok: false, message: "Esse horário acabou de ser ocupado. Escolha outro." };
  }

  const duration = new Date(data.ends_at ?? data.starts_at).getTime() - new Date(data.starts_at).getTime();
  const start = new Date(startsAt);
  const now = new Date().toISOString();

  const { error } = await admin
    .from("appointments")
    .update({
      starts_at: start.toISOString(),
      ends_at: new Date(start.getTime() + duration).toISOString(),
      previous_starts_at: data.starts_at,
      rescheduled_at: now,
      reschedule_count: Number(data.reschedule_count ?? 0) + 1,
      status: "scheduled",
      confirmed_at: null,
      reminder_24h_sent_at: null,
      reminder_2h_sent_at: null,
    })
    .eq("id", data.id);
  if (error) return { ok: false, message: "Não foi possível reagendar agora." };

  // Fila de lembretes recomeça para o novo horário.
  await admin.from("appointment_reminder_queue").delete().eq("appointment_id", data.id);

  await admin.from("notifications").insert({
    store_id: data.store_id,
    event: "appointment_rescheduled",
    title: "Horário remarcado pelo cliente",
    body: `${data.customer_name}: ${new Date(data.starts_at).toLocaleString("pt-BR")} → ${start.toLocaleString("pt-BR")}`,
    payload: { appointment_id: data.id } as never,
  });

  return { ok: true, message: `Pronto! Novo horário: ${start.toLocaleString("pt-BR")}.` };
}
