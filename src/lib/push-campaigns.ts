export const PUSH_AUDIENCES = [
  { value: "all", label: "Todos os inscritos" },
  { value: "new", label: "Clientes novos" },
  { value: "active", label: "Clientes ativos" },
  { value: "recurring", label: "Clientes recorrentes" },
  { value: "inactive", label: "Clientes inativos" },
  { value: "birthday", label: "Aniversariantes" },
  { value: "abandoned_cart", label: "Carrinho abandonado" },
  { value: "post_purchase", label: "Pós-compra" },
] as const;

export const PUSH_SCHEDULES = [
  { value: "now", label: "Enviar agora" },
  { value: "scheduled", label: "Data e hora" },
  { value: "recurring", label: "Recorrente" },
  { value: "automatic", label: "Automático" },
] as const;

export type PushAudienceType = (typeof PUSH_AUDIENCES)[number]["value"];
export type PushScheduleType = (typeof PUSH_SCHEDULES)[number]["value"];
export type PushCampaignStatus =
  "draft" | "scheduled" | "sending" | "sent" | "paused" | "cancelled";

export interface PushCampaignSummary {
  id: string;
  name: string;
  title: string;
  body: string;
  audienceType: PushAudienceType;
  audienceConfig: { inactiveDays?: number };
  scheduleType: PushScheduleType;
  scheduledAt: string | null;
  recurrence: { days?: number[]; time?: string };
  status: PushCampaignStatus;
  nextRunAt: string | null;
  sentCount: number;
  failedCount: number;
  removedCount: number;
  createdAt: string;
}

export const pushCampaignsKey = (storeId?: string) => ["push-campaigns", storeId] as const;

export const PUSH_STATUS_LABEL: Record<PushCampaignStatus, string> = {
  draft: "Rascunho",
  scheduled: "Agendada",
  sending: "Enviando",
  sent: "Enviada",
  paused: "Pausada",
  cancelled: "Cancelada",
};
