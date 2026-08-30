/**
 * E-mails automáticos da assinatura recorrente.
 *
 * Só roda no servidor (usa LOVABLE_API_KEY via sendTemplateEmail). Nunca lança:
 * um e-mail que falha não pode derrubar a criação da assinatura nem a rotina
 * agendada que gera os pedidos.
 */
import { SUBSCRIPTION_PERIOD_LABEL, isSubscriptionPeriod } from "@/lib/assinaturas";

export type SubscriptionEmailEvent = "created" | "paused" | "resumed" | "canceled" | "order_generated";

export interface SubscriptionEmailInput {
  event: SubscriptionEmailEvent;
  to: string | null | undefined;
  customerName: string | null | undefined;
  storeName: string | null | undefined;
  period?: string | null;
  nextOrderAt?: string | null;
  total?: number | null;
  orderCode?: string | null;
  trackingToken?: string | null;
}

function siteUrl(): string {
  return process.env["PUBLIC_SITE_URL"] ?? "https://oseupedido.com.br";
}

const money = (value: number) =>
  value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const dateBR = (iso: string) =>
  new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });

/** Frase e título por evento, em português e sem jargão. */
function copyFor(input: SubscriptionEmailInput): { headline: string; sentence: string } {
  switch (input.event) {
    case "created":
      return {
        headline: "Assinatura criada",
        sentence: `sua assinatura na ${input.storeName ?? "loja"} foi criada. A cada ciclo geramos o pedido automaticamente — sem cobrança automática.`,
      };
    case "paused":
      return {
        headline: "Assinatura pausada",
        sentence: "sua assinatura foi pausada e nenhum pedido novo será gerado até você retomar.",
      };
    case "resumed":
      return { headline: "Assinatura retomada", sentence: "sua assinatura voltou a valer e o próximo pedido já está agendado." };
    case "canceled":
      return { headline: "Assinatura cancelada", sentence: "sua assinatura foi cancelada e não vamos gerar novos pedidos." };
    case "order_generated":
      return {
        headline: `Pedido da assinatura ${input.orderCode ?? ""}`.trim(),
        sentence: `o pedido da sua assinatura na ${input.storeName ?? "loja"} foi gerado e já está com a loja.`,
      };
  }
}

/** Linha de detalhes (ciclo, próxima data e valor previsto). */
function detailFor(input: SubscriptionEmailInput): string | null {
  const parts: string[] = [];
  if (input.period && isSubscriptionPeriod(input.period)) parts.push(SUBSCRIPTION_PERIOD_LABEL[input.period]);
  if (input.nextOrderAt) parts.push(`Próximo pedido: ${dateBR(input.nextOrderAt)}`);
  if (typeof input.total === "number" && input.total > 0) parts.push(money(input.total));
  return parts.length ? parts.join(" · ") : null;
}

export async function sendSubscriptionEmail(input: SubscriptionEmailInput): Promise<boolean> {
  const to = (input.to ?? "").trim();
  if (!to || !to.includes("@")) return false;

  try {
    const { sendTemplateEmail } = await import("@/lib/email-templates/send-email");
    const { headline, sentence } = copyFor(input);
    const base = siteUrl();
    const tracking = input.event === "order_generated" && input.trackingToken;

    const result = await sendTemplateEmail("subscription-update", to, {
      templateData: {
        customerName: (input.customerName ?? "").trim().split(" ")[0] || "Olá",
        storeName: input.storeName ?? "loja",
        headline,
        sentence,
        detail: detailFor(input),
        actionUrl: tracking
          ? `${base}/acompanhar?codigo=${encodeURIComponent(input.trackingToken as string)}`
          : `${base}/meus-pedidos`,
        actionLabel: tracking ? "Acompanhar pedido" : "Ver minha assinatura",
      },
    });

    return result.sent;
  } catch (error) {
    console.error("[assinaturas] e-mail não enviado", error);
    return false;
  }
}
