/**
 * Catálogo de eventos, variáveis e modelos do WhatsApp (Evolution API).
 * Client-safe: usado no painel e nas funções de servidor.
 */

export type AutomationCategory = "transactional" | "support" | "marketing";

export interface AutomationEventDef {
  key: string;
  label: string;
  group: "Pedidos" | "Clientes" | "Operação";
  category: AutomationCategory;
  suggestion: string;
}

export const AUTOMATION_EVENTS: AutomationEventDef[] = [
  // Pedidos
  { key: "order_created", label: "Novo pedido recebido", group: "Pedidos", category: "transactional", suggestion: "Olá, {{nome_cliente}}! Recebemos o pedido #{{numero_pedido}} na {{nome_loja}}. Estamos preparando tudo." },
  { key: "order_confirmed", label: "Pedido confirmado", group: "Pedidos", category: "transactional", suggestion: "Seu pedido #{{numero_pedido}} foi confirmado. Tempo estimado: {{tempo_estimado}}." },
  { key: "payment_approved", label: "Pagamento aprovado", group: "Pedidos", category: "transactional", suggestion: "Pagamento do pedido #{{numero_pedido}} aprovado. Valor: {{valor_total}}." },
  { key: "payment_pending", label: "Pagamento pendente", group: "Pedidos", category: "transactional", suggestion: "Estamos aguardando a confirmação do pagamento do pedido #{{numero_pedido}}." },
  { key: "payment_failed", label: "Pagamento recusado", group: "Pedidos", category: "transactional", suggestion: "O pagamento do pedido #{{numero_pedido}} não foi aprovado. Pode tentar novamente por aqui: {{link_acompanhamento}}" },
  { key: "order_preparing", label: "Pedido em preparo", group: "Pedidos", category: "transactional", suggestion: "Seu pedido #{{numero_pedido}} entrou em preparo. 👩‍🍳" },
  { key: "order_ready", label: "Pedido pronto", group: "Pedidos", category: "transactional", suggestion: "Seu pedido #{{numero_pedido}} está pronto!" },
  { key: "order_out_for_delivery", label: "Saiu para entrega", group: "Pedidos", category: "transactional", suggestion: "Seu pedido #{{numero_pedido}} saiu para entrega. Acompanhe por aqui: {{link_acompanhamento}}." },
  { key: "order_delivered", label: "Pedido entregue", group: "Pedidos", category: "transactional", suggestion: "Pedido #{{numero_pedido}} entregue. Bom apetite!" },
  { key: "order_ready_pickup", label: "Disponível para retirada", group: "Pedidos", category: "transactional", suggestion: "Seu pedido #{{numero_pedido}} está pronto para retirada na {{nome_loja}}." },
  { key: "order_completed", label: "Pedido concluído", group: "Pedidos", category: "transactional", suggestion: "Obrigado pela preferência, {{nome_cliente}}! Quando puder, avalie seu pedido." },
  { key: "order_cancelled", label: "Pedido cancelado", group: "Pedidos", category: "transactional", suggestion: "O pedido #{{numero_pedido}} foi cancelado. Qualquer dúvida, estamos por aqui." },
  { key: "order_rejected", label: "Pedido recusado", group: "Pedidos", category: "transactional", suggestion: "Não conseguimos aceitar o pedido #{{numero_pedido}} agora. Desculpe pelo transtorno." },
  { key: "order_delayed", label: "Pedido atrasado", group: "Pedidos", category: "transactional", suggestion: "Seu pedido #{{numero_pedido}} está levando um pouco mais de tempo. Novo prazo: {{tempo_estimado}}." },
  { key: "order_scheduled_soon", label: "Agendamento próximo", group: "Pedidos", category: "transactional", suggestion: "Lembrete: seu pedido #{{numero_pedido}} está agendado para {{data_agendada}} às {{horario_agendado}}." },
  // Clientes
  { key: "customer_new", label: "Novo cliente", group: "Clientes", category: "transactional", suggestion: "Seja bem-vindo à {{nome_loja}}, {{nome_cliente}}!" },
  { key: "cart_abandoned", label: "Carrinho abandonado", group: "Clientes", category: "marketing", suggestion: "Olá, {{nome_cliente}}! Você deixou itens no carrinho da {{nome_loja}}. Se quiser continuar, acesse: {{link_acompanhamento}}." },
  { key: "customer_inactive", label: "Cliente inativo", group: "Clientes", category: "marketing", suggestion: "Sentimos sua falta, {{nome_cliente}}! Dá uma olhada nas novidades da {{nome_loja}}." },
  { key: "customer_birthday", label: "Aniversário do cliente", group: "Clientes", category: "marketing", suggestion: "Feliz aniversário, {{nome_cliente}}! 🎉 A {{nome_loja}} preparou um mimo para você." },
  { key: "loyalty_cashback", label: "Cliente recebeu cashback", group: "Clientes", category: "transactional", suggestion: "Você recebeu cashback na {{nome_loja}}! Use no próximo pedido." },
  { key: "loyalty_reward", label: "Nova recompensa liberada", group: "Clientes", category: "transactional", suggestion: "Parabéns, {{nome_cliente}}! Você liberou uma nova recompensa na {{nome_loja}}." },
  { key: "loyalty_milestone", label: "Marca de pedidos atingida", group: "Clientes", category: "marketing", suggestion: "{{nome_cliente}}, você já é figurinha carimbada na {{nome_loja}}. Obrigado!" },
  // Operação
  { key: "stock_low", label: "Estoque baixo", group: "Operação", category: "support", suggestion: "Atenção: itens com estoque baixo na {{nome_loja}}." },
  { key: "stock_out", label: "Produto esgotado", group: "Operação", category: "support", suggestion: "Um produto da {{nome_loja}} ficou esgotado." },
  { key: "cash_closed", label: "Caixa fechado", group: "Operação", category: "support", suggestion: "O caixa da {{nome_loja}} foi fechado." },
  { key: "courier_assigned", label: "Entregador atribuído", group: "Operação", category: "transactional", suggestion: "{{nome_entregador}} vai levar o pedido #{{numero_pedido}} até {{endereco_entrega}}." },
  { key: "courier_started", label: "Entregador iniciou a rota", group: "Operação", category: "transactional", suggestion: "{{nome_entregador}} saiu com o seu pedido #{{numero_pedido}}." },
  { key: "payment_error", label: "Falha de pagamento", group: "Operação", category: "support", suggestion: "Houve uma falha de pagamento no pedido #{{numero_pedido}}." },
  { key: "store_open_close", label: "Loja aberta ou fechada", group: "Operação", category: "support", suggestion: "A {{nome_loja}} mudou o status de funcionamento." },
];

export function eventLabel(key: string): string {
  return AUTOMATION_EVENTS.find((event) => event.key === key)?.label ?? key;
}

export function eventCategory(key: string): AutomationCategory {
  return AUTOMATION_EVENTS.find((event) => event.key === key)?.category ?? "transactional";
}

export const MESSAGE_VARIABLES = [
  { key: "nome_cliente", description: "Nome do cliente" },
  { key: "nome_loja", description: "Nome da loja" },
  { key: "numero_pedido", description: "Número/código do pedido" },
  { key: "valor_total", description: "Valor total formatado" },
  { key: "status_pedido", description: "Situação atual do pedido" },
  { key: "tempo_estimado", description: "Tempo estimado de preparo/entrega" },
  { key: "link_acompanhamento", description: "Link de acompanhamento do pedido" },
  { key: "endereco_entrega", description: "Endereço de entrega" },
  { key: "nome_entregador", description: "Nome do entregador" },
  { key: "codigo_confirmacao", description: "Código de confirmação" },
  { key: "data_agendada", description: "Data agendada" },
  { key: "horario_agendado", description: "Horário agendado" },
] as const;

export type MessageVars = Partial<Record<(typeof MESSAGE_VARIABLES)[number]["key"], string>>;

/** Substitui {{variavel}} pelos valores informados (variáveis desconhecidas viram vazio). */
export function renderWhatsappTemplate(body: string, vars: MessageVars): string {
  return body.replace(/\{\{\s*([a-zA-Z_]+)\s*\}\}/g, (_match, key: string) => {
    const value = (vars as Record<string, string | undefined>)[key];
    return value ?? "";
  });
}

export const CONNECTION_STATUS_LABEL: Record<string, string> = {
  open: "Conectado",
  connecting: "Aguardando leitura do QR Code",
  close: "Desconectado",
  error: "Erro de conexão",
  expired: "QR Code expirado",
};

/** Mascara um telefone para exibição/registro: mantém DDD e 2 dígitos finais. */
export function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 6) return "••••";
  return `${digits.slice(0, 4)}••••${digits.slice(-2)}`;
}
