/**
 * Regras de automação de marketing da loja (tabela `automation_rules`).
 * Client-safe: rótulos, valores padrão e leitura da configuração extra.
 */
import type { Database } from "@/integrations/supabase/types";

export type AutomationRuleRow = Database["public"]["Tables"]["automation_rules"]["Row"];

export const AUTOMATION_EVENTS = [
  {
    key: "birthday",
    label: "Aniversário do cliente",
    help: "Mensagem no dia do aniversário, com cupom opcional.",
    defaultMessage:
      "Feliz aniversário, {cliente}! 🎉 A {loja} preparou um presente pra você: use o cupom {cupom} no próximo pedido.",
  },
  {
    key: "inactive",
    label: "Cliente inativo",
    help: "Reativa quem não compra há alguns dias.",
    defaultMessage:
      "Oi {cliente}, sentimos sua falta na {loja}! Volte com o cupom {cupom} e aproveite.",
  },
  {
    key: "post_purchase",
    label: "Pós-compra",
    help: "Agradece e pede avaliação depois da entrega.",
    defaultMessage:
      "Obrigado pelo pedido, {cliente}! Conta pra gente como foi? Sua opinião ajuda muito a {loja}.",
  },
] as const;

export type AutomationEvent = (typeof AUTOMATION_EVENTS)[number]["key"];

export const AUTOMATION_EVENT_LABEL: Record<string, string> = Object.fromEntries(
  AUTOMATION_EVENTS.map((item) => [item.key, item.label]),
);

export const AUTOMATION_CHANNELS = [
  { value: "whatsapp", label: "WhatsApp" },
  { value: "email", label: "E-mail" },
] as const;

/** Configuração extra guardada em `config` (jsonb). */
export interface AutomationConfig {
  message?: string | undefined;
  couponCode?: string | undefined;
  inactiveDays?: number | undefined;
  /** Somente clientes que aceitaram receber mensagens. */
  requireConsent?: boolean | undefined;
}

export function readAutomationConfig(value: unknown): AutomationConfig {
  if (!value || typeof value !== "object") return {};
  const raw = value as Record<string, unknown>;
  const days = Number(raw["inactiveDays"]);
  return {
    message: typeof raw["message"] === "string" ? raw["message"] : undefined,
    couponCode: typeof raw["couponCode"] === "string" ? raw["couponCode"] : undefined,
    inactiveDays: Number.isFinite(days) && days > 0 ? days : undefined,
    requireConsent: raw["requireConsent"] !== false,
  };
}

export function defaultMessageFor(event: string): string {
  return AUTOMATION_EVENTS.find((item) => item.key === event)?.defaultMessage ?? "";
}

export function automationsKey(storeId: string | undefined) {
  return ["automacoes-marketing", storeId] as const;
}

/** Substitui as marcações simples da mensagem. */
export function renderAutomationMessage(
  message: string,
  vars: { cliente: string; loja: string; cupom: string },
): string {
  return message
    .replaceAll("{cliente}", vars.cliente)
    .replaceAll("{loja}", vars.loja)
    .replaceAll("{cupom}", vars.cupom);
}
