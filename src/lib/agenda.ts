/**
 * Módulo de serviços e agendamentos: bloqueios de agenda, sinal, comissão,
 * lista de espera e ficha do cliente.
 *
 * Toda a leitura roda com o usuário logado (RLS por loja).
 */
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type Appointment = Database["public"]["Tables"]["appointments"]["Row"];
export type Professional = Database["public"]["Tables"]["professionals"]["Row"];
export type ScheduleBlock = Database["public"]["Tables"]["schedule_blocks"]["Row"];
export type WaitlistEntry = Database["public"]["Tables"]["appointment_waitlist"]["Row"];
export type SchedulingSettings = Database["public"]["Tables"]["scheduling_settings"]["Row"];
export type CustomerRecord = Database["public"]["Tables"]["customer_records"]["Row"];
export type RecordPhoto = Database["public"]["Tables"]["customer_record_photos"]["Row"];

export const WEEKDAYS = [
  { value: 0, label: "Domingo" },
  { value: 1, label: "Segunda" },
  { value: 2, label: "Terça" },
  { value: 3, label: "Quarta" },
  { value: 4, label: "Quinta" },
  { value: 5, label: "Sexta" },
  { value: 6, label: "Sábado" },
] as const;

export const WAITLIST_STATUS: Record<string, string> = {
  waiting: "Aguardando encaixe",
  notified: "Cliente avisado",
  scheduled: "Encaixado",
  cancelled: "Desistiu",
};

export const DEPOSIT_STATUS: Record<string, string> = {
  none: "Sem sinal",
  pending: "Sinal pendente",
  paid: "Sinal pago",
  refunded: "Sinal devolvido",
};

/* ------------------------------------------------------------------ */
/* Profissionais e bloqueios                                           */
/* ------------------------------------------------------------------ */

export function professionalsKey(storeId: string | undefined) {
  return ["agenda-profissionais", storeId] as const;
}

export async function fetchProfessionals(storeId: string): Promise<Professional[]> {
  const { data, error } = await supabase
    .from("professionals")
    .select("*")
    .eq("store_id", storeId)
    .order("name");
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function updateCommissionRate(professionalId: string, rate: number) {
  const { error } = await supabase
    .from("professionals")
    .update({ commission_rate: Math.max(0, Math.min(100, rate)) })
    .eq("id", professionalId);
  if (error) throw new Error(error.message);
}

export function blocksKey(storeId: string | undefined) {
  return ["agenda-bloqueios", storeId] as const;
}

export async function fetchBlocks(storeId: string): Promise<ScheduleBlock[]> {
  const { data, error } = await supabase
    .from("schedule_blocks")
    .select("*")
    .eq("store_id", storeId)
    .order("starts_at", { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export interface BlockInput {
  storeId: string;
  professionalId: string | null;
  reason: string;
  /** Folga recorrente por dia da semana (almoço, folga fixa). */
  recurring: boolean;
  weekday?: number;
  startTime?: string;
  endTime?: string;
  startsAt?: string | undefined;
  endsAt?: string | undefined;
}

export async function createBlock(input: BlockInput) {
  const base = {
    store_id: input.storeId,
    professional_id: input.professionalId,
    reason: input.reason.trim() || (input.recurring ? "Folga recorrente" : "Bloqueio"),
    is_recurring: input.recurring,
  };
  const payload = input.recurring
    ? {
        ...base,
        weekday: input.weekday ?? 1,
        start_time: input.startTime || "12:00",
        end_time: input.endTime || "13:00",
        // Colunas obrigatórias herdadas do bloqueio por data: guardam a referência da criação.
        starts_at: new Date().toISOString(),
        ends_at: new Date(Date.now() + 3_600_000).toISOString(),
      }
    : { ...base, starts_at: input.startsAt!, ends_at: input.endsAt! };

  const { error } = await supabase.from("schedule_blocks").insert(payload);
  if (error) throw new Error(error.message);
}

export async function deleteBlock(id: string) {
  const { error } = await supabase.from("schedule_blocks").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

/** Diz se um horário cai dentro de um bloqueio (data fixa ou folga recorrente). */
export function isBlocked(block: ScheduleBlock, when: Date): boolean {
  if (block.is_recurring) {
    if (block.weekday !== when.getDay()) return false;
    const minutes = when.getHours() * 60 + when.getMinutes();
    const toMinutes = (value: string | null) => {
      const [h = "0", m = "0"] = (value ?? "").split(":");
      return Number(h) * 60 + Number(m);
    };
    return minutes >= toMinutes(block.start_time) && minutes < toMinutes(block.end_time);
  }
  const time = when.getTime();
  return time >= new Date(block.starts_at).getTime() && time < new Date(block.ends_at).getTime();
}

export function blockLabel(block: ScheduleBlock): string {
  if (block.is_recurring) {
    const day = WEEKDAYS.find((item) => item.value === block.weekday)?.label ?? "Todo dia";
    return `${day}, ${(block.start_time ?? "").slice(0, 5)} às ${(block.end_time ?? "").slice(0, 5)} (toda semana)`;
  }
  const format = (value: string) => new Date(value).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
  return `${format(block.starts_at)} até ${format(block.ends_at)}`;
}

/* ------------------------------------------------------------------ */
/* Configuração da agenda (sinal e política de cancelamento)           */
/* ------------------------------------------------------------------ */

export function schedulingSettingsKey(storeId: string | undefined) {
  return ["agenda-config", storeId] as const;
}

export async function fetchSchedulingSettings(storeId: string): Promise<SchedulingSettings | null> {
  const { data, error } = await supabase
    .from("scheduling_settings")
    .select("*")
    .eq("store_id", storeId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

export interface SettingsInput {
  storeId: string;
  requireDeposit: boolean;
  depositPercent: number;
  cancellationHours: number;
  cancellationPolicy: string;
  reminder24h: boolean;
  reminder2h: boolean;
  reminderTemplate: string;
  allowReschedule: boolean;
  rescheduleMinHours: number;
  maxReschedules: number;
  slotMinutes: number;
  openTime: string;
  closeTime: string;
}

export async function saveSchedulingSettings(input: SettingsInput) {
  const { error } = await supabase.from("scheduling_settings").upsert(
    {
      store_id: input.storeId,
      require_deposit: input.requireDeposit,
      deposit_percent: input.depositPercent,
      cancellation_hours: input.cancellationHours,
      cancellation_policy: input.cancellationPolicy.trim() || null,
      reminder_24h: input.reminder24h,
      reminder_2h: input.reminder2h,
      reminder_template: input.reminderTemplate.trim() || null,
      allow_reschedule: input.allowReschedule,
      reschedule_min_hours: input.rescheduleMinHours,
      max_reschedules: input.maxReschedules,
      slot_minutes: input.slotMinutes,
      open_time: input.openTime,
      close_time: input.closeTime,
    },
    { onConflict: "store_id" },
  );
  if (error) throw new Error(error.message);
}

/** Valor do sinal sugerido para um serviço, conforme a política da loja. */
export function depositFor(price: number, settings: SchedulingSettings | null): number {
  if (!settings?.require_deposit) return 0;
  return Math.round(price * (Number(settings.deposit_percent) / 100) * 100) / 100;
}

/** Fila de lembretes de WhatsApp (24h e 2h) da loja. */
export function reminderQueueKey(storeId: string | undefined) {
  return ["agenda-fila-lembretes", storeId] as const;
}

export async function fetchReminderQueue(storeId: string) {
  const { data, error } = await supabase
    .from("appointment_reminder_queue")
    .select("*")
    .eq("store_id", storeId)
    .order("scheduled_for", { ascending: false })
    .limit(50);
  if (error) throw new Error(error.message);
  return data ?? [];
}

/* ------------------------------------------------------------------ */
/* Lista de espera / encaixe                                           */
/* ------------------------------------------------------------------ */

export function waitlistKey(storeId: string | undefined) {
  return ["agenda-espera", storeId] as const;
}

export async function fetchWaitlist(storeId: string): Promise<WaitlistEntry[]> {
  const { data, error } = await supabase
    .from("appointment_waitlist")
    .select("*")
    .eq("store_id", storeId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function addToWaitlist(input: {
  storeId: string;
  customerName: string;
  customerPhone: string;
  productId: string | null;
  professionalId: string | null;
  preferredDate: string | null;
  preferredPeriod: string | null;
  notes: string;
}) {
  const { error } = await supabase.from("appointment_waitlist").insert({
    store_id: input.storeId,
    customer_name: input.customerName.trim(),
    customer_phone: input.customerPhone.trim() || null,
    product_id: input.productId,
    professional_id: input.professionalId,
    preferred_date: input.preferredDate,
    preferred_period: input.preferredPeriod,
    notes: input.notes.trim() || null,
  });
  if (error) throw new Error(error.message);
}

export async function updateWaitlistStatus(id: string, status: string) {
  const patch: { status: string; notified_at?: string } = { status };
  if (status === "notified") patch.notified_at = new Date().toISOString();
  const { error } = await supabase.from("appointment_waitlist").update(patch).eq("id", id);
  if (error) throw new Error(error.message);
}

export async function deleteWaitlistEntry(id: string) {
  const { error } = await supabase.from("appointment_waitlist").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

/** Clientes na espera compatíveis com um horário que vagou. */
export function waitlistMatches(entries: WaitlistEntry[], appointment: Appointment): WaitlistEntry[] {
  const day = appointment.starts_at.slice(0, 10);
  return entries.filter(
    (entry) =>
      entry.status === "waiting" &&
      (!entry.preferred_date || entry.preferred_date === day) &&
      (!entry.professional_id || entry.professional_id === appointment.professional_id),
  );
}

/* ------------------------------------------------------------------ */
/* Comissão por profissional                                           */
/* ------------------------------------------------------------------ */

export interface CommissionRow {
  professionalId: string;
  name: string;
  rate: number;
  services: number;
  revenue: number;
  commission: number;
}

/** Fechamento de repasse: soma dos atendimentos concluídos no período. */
export function commissionReport(
  appointments: Appointment[],
  professionals: Professional[],
  from: Date,
  to: Date,
): CommissionRow[] {
  const rows = new Map<string, CommissionRow>();
  for (const professional of professionals) {
    rows.set(professional.id, {
      professionalId: professional.id,
      name: professional.name,
      rate: Number(professional.commission_rate ?? 0),
      services: 0,
      revenue: 0,
      commission: 0,
    });
  }

  for (const appointment of appointments) {
    if (appointment.status !== "done" || !appointment.professional_id) continue;
    const when = new Date(appointment.starts_at).getTime();
    if (when < from.getTime() || when > to.getTime()) continue;
    const row = rows.get(appointment.professional_id);
    if (!row) continue;
    const price = Number(appointment.price ?? 0);
    const rate = Number(appointment.commission_rate ?? 0) || row.rate;
    row.services += 1;
    row.revenue += price;
    row.commission += Math.round(price * (rate / 100) * 100) / 100;
  }

  return [...rows.values()].filter((row) => row.services > 0).sort((a, b) => b.commission - a.commission);
}

/* ------------------------------------------------------------------ */
/* Ficha do cliente                                                    */
/* ------------------------------------------------------------------ */

export function recordsKey(storeId: string | undefined) {
  return ["agenda-fichas", storeId] as const;
}

export interface RecordWithPhotos extends CustomerRecord {
  photos: RecordPhoto[];
}

export async function fetchRecords(storeId: string): Promise<RecordWithPhotos[]> {
  const [records, photos] = await Promise.all([
    supabase.from("customer_records").select("*").eq("store_id", storeId).order("customer_name"),
    supabase
      .from("customer_record_photos")
      .select("*")
      .eq("store_id", storeId)
      .order("created_at", { ascending: false }),
  ]);
  if (records.error) throw new Error(records.error.message);
  if (photos.error) throw new Error(photos.error.message);
  return (records.data ?? []).map((record) => ({
    ...record,
    photos: (photos.data ?? []).filter((photo) => photo.record_id === record.id),
  }));
}

export async function saveRecord(input: {
  id?: string;
  storeId: string;
  customerName: string;
  customerPhone: string;
  allergies: string;
  anamnesis: string;
  notes: string;
}) {
  const payload = {
    store_id: input.storeId,
    customer_name: input.customerName.trim(),
    customer_phone: input.customerPhone.trim() || null,
    allergies: input.allergies.trim() || null,
    anamnesis: input.anamnesis.trim() || null,
    notes: input.notes.trim() || null,
  };
  const query = input.id
    ? supabase.from("customer_records").update(payload).eq("id", input.id)
    : supabase.from("customer_records").insert(payload);
  const { error } = await query;
  if (error) throw new Error(error.message);
}

export async function deleteRecord(id: string) {
  const { error } = await supabase.from("customer_records").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export async function addRecordPhoto(input: {
  storeId: string;
  recordId: string;
  kind: "before" | "after";
  imageUrl: string;
  caption: string;
}) {
  const { error } = await supabase.from("customer_record_photos").insert({
    store_id: input.storeId,
    record_id: input.recordId,
    kind: input.kind,
    image_url: input.imageUrl,
    caption: input.caption.trim() || null,
  });
  if (error) throw new Error(error.message);
}

export async function deleteRecordPhoto(id: string) {
  const { error } = await supabase.from("customer_record_photos").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

/** Histórico de atendimentos do cliente pelo telefone ou nome. */
export function recordHistory(record: CustomerRecord, appointments: Appointment[]): Appointment[] {
  const phone = (record.customer_phone ?? "").replace(/\D/g, "");
  return appointments
    .filter((appointment) =>
      phone
        ? (appointment.customer_phone ?? "").replace(/\D/g, "") === phone
        : appointment.customer_name.toLowerCase() === record.customer_name.toLowerCase(),
    )
    .sort((a, b) => b.starts_at.localeCompare(a.starts_at));
}

/* ------------------------------------------------------------------ */
/* Comissão detalhada por agendamento                                  */
/* ------------------------------------------------------------------ */

export const PAYOUT_STATUS: Record<string, string> = {
  pending: "A repassar",
  closed: "Repassado",
};

export interface CommissionDetail {
  appointmentId: string;
  date: string;
  customer: string;
  professionalId: string | null;
  professionalName: string;
  status: string;
  price: number;
  rate: number;
  commission: number;
  deposit: number;
  depositStatus: string;
  charged: number;
  refunded: number;
  lossReason: string;
  payoutStatus: string;
}

const STATUS_PT: Record<string, string> = {
  scheduled: "Agendado",
  confirmed: "Confirmado",
  done: "Concluído",
  cancelled: "Cancelado",
  no_show: "Não compareceu",
};

/** Linha a linha: atendimentos concluídos, cancelados e faltas do período. */
export function commissionDetails(
  appointments: Appointment[],
  professionals: Professional[],
  from: Date,
  to: Date,
): CommissionDetail[] {
  const byId = new Map(professionals.map((item) => [item.id, item]));
  return appointments
    .filter((appointment) => {
      const when = new Date(appointment.starts_at).getTime();
      if (when < from.getTime() || when > to.getTime()) return false;
      return ["done", "cancelled", "no_show"].includes(appointment.status);
    })
    .map((appointment) => {
      const professional = appointment.professional_id ? byId.get(appointment.professional_id) : undefined;
      const price = Number(appointment.price ?? 0);
      const rate = Number(appointment.commission_rate ?? 0) || Number(professional?.commission_rate ?? 0);
      const done = appointment.status === "done";
      return {
        appointmentId: appointment.id,
        date: appointment.starts_at,
        customer: appointment.customer_name,
        professionalId: appointment.professional_id,
        professionalName: professional?.name ?? "Sem profissional",
        status: STATUS_PT[appointment.status] ?? appointment.status,
        price,
        rate,
        commission: done ? Math.round(price * (rate / 100) * 100) / 100 : 0,
        deposit: Number(appointment.deposit_amount ?? 0),
        depositStatus: DEPOSIT_STATUS[appointment.deposit_status ?? "none"] ?? "—",
        charged: Number(appointment.charged_amount ?? 0),
        refunded: Number(appointment.refunded_amount ?? 0),
        lossReason: done
          ? ""
          : appointment.cancel_reason ||
            (appointment.status === "no_show" ? "Cliente não compareceu" : "Cancelado"),
        payoutStatus: PAYOUT_STATUS[appointment.payout_status ?? "pending"] ?? "A repassar",
      };
    })
    .sort((a, b) => b.date.localeCompare(a.date));
}

/* ------------------------------------------------------------------ */
/* Histórico financeiro do cliente                                     */
/* ------------------------------------------------------------------ */

export interface CustomerFinanceRow {
  key: string;
  customer: string;
  phone: string;
  services: number;
  cancellations: number;
  noShows: number;
  revenue: number;
  depositsPaid: number;
  charged: number;
  refunded: number;
  pendingPayout: number;
  lastVisit: string | null;
}

/** Agrupa pagamentos, cancelamentos e estornos por cliente no período. */
export function customerFinance(appointments: Appointment[], from: Date, to: Date): CustomerFinanceRow[] {
  const rows = new Map<string, CustomerFinanceRow>();

  for (const appointment of appointments) {
    const when = new Date(appointment.starts_at).getTime();
    if (when < from.getTime() || when > to.getTime()) continue;

    const phone = (appointment.customer_phone ?? "").replace(/\D/g, "");
    const key = phone || appointment.customer_name.toLowerCase();
    const row =
      rows.get(key) ??
      ({
        key,
        customer: appointment.customer_name,
        phone: appointment.customer_phone ?? "",
        services: 0,
        cancellations: 0,
        noShows: 0,
        revenue: 0,
        depositsPaid: 0,
        charged: 0,
        refunded: 0,
        pendingPayout: 0,
        lastVisit: null,
      } satisfies CustomerFinanceRow);

    if (appointment.status === "done") {
      row.services += 1;
      row.revenue += Number(appointment.price ?? 0);
      if (!row.lastVisit || appointment.starts_at > row.lastVisit) row.lastVisit = appointment.starts_at;
      if ((appointment.payout_status ?? "pending") !== "closed") {
        const rate = Number(appointment.commission_rate ?? 0);
        row.pendingPayout += Math.round(Number(appointment.price ?? 0) * (rate / 100) * 100) / 100;
      }
    }
    if (appointment.status === "cancelled") row.cancellations += 1;
    if (appointment.status === "no_show") row.noShows += 1;
    if (appointment.deposit_status === "paid") row.depositsPaid += Number(appointment.deposit_amount ?? 0);
    row.charged += Number(appointment.charged_amount ?? 0);
    row.refunded += Number(appointment.refunded_amount ?? 0);

    rows.set(key, row);
  }

  return [...rows.values()].sort((a, b) => b.revenue - a.revenue);
}

/** Marca os atendimentos do período como repassados no fechamento. */
export async function closePayout(storeId: string, from: string, to: string) {
  const { error } = await supabase
    .from("appointments")
    .update({ payout_status: "closed", payout_closed_at: new Date().toISOString() })
    .eq("store_id", storeId)
    .eq("status", "done")
    .eq("payout_status", "pending")
    .gte("starts_at", `${from}T00:00:00`)
    .lte("starts_at", `${to}T23:59:59`);
  if (error) throw new Error(error.message);
}
