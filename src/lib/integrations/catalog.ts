/**
 * Catálogo da central de integrações.
 *
 * Cada conector descreve: campos de credencial, provedores aceitos, eventos
 * que emite/recebe e instruções em português. Client-safe — não contém
 * segredos nem chamadas externas.
 */

export type CredentialField = {
  key: "apiKey" | "apiSecret" | "accessToken" | "refreshToken" | "webhookSecret" | "extra";
  label: string;
  help?: string;
  /** Campos secretos nunca voltam do servidor: só indicamos se estão preenchidos. */
  secret: boolean;
  optional?: boolean;
};

export type ConnectorCategory =
  "mensagens" | "pagamentos" | "marketplace" | "digital" | "mapas" | "fiscal" | "comunicacao";

export interface Connector {
  kind: string;
  label: string;
  category: ConnectorCategory;
  summary: string;
  providers: { key: string; label: string }[];
  fields: CredentialField[];
  /** Eventos que o conector recebe por webhook. */
  inboundEvents: string[];
  /** Eventos que o sistema emite para os webhooks da loja. */
  outboundEvents: string[];
  /** Recebe webhook assinado no endereço /api/public/integracoes/{kind}/{storeId}. */
  hasWebhook: boolean;
  docsUrl?: string;
  instructions: string[];
  /** Sem credenciais, o conector opera em modo demonstração. */
  fallback: string;
}

const secret = (
  key: CredentialField["key"],
  label: string,
  help?: string,
  optional = false,
): CredentialField => ({
  key,
  label,
  secret: true,
  ...(help ? { help } : {}),
  ...(optional ? { optional } : {}),
});

export const CONNECTORS: Connector[] = [
  {
    kind: "whatsapp",
    label: "WhatsApp Business Cloud API",
    category: "mensagens",
    summary: "Mensagens, modelos e eventos de entrega pela API oficial da Meta.",
    providers: [{ key: "meta_cloud", label: "Meta Cloud API" }],
    fields: [
      secret("accessToken", "Token de acesso permanente"),
      secret("webhookSecret", "App secret (assinatura do webhook)"),
      { key: "extra", label: "ID do número de telefone", secret: false },
    ],
    inboundEvents: ["mensagem_recebida", "status_mensagem", "opt_out"],
    outboundEvents: ["pedido.criado", "pedido.status", "atendimento.mensagem"],
    hasWebhook: true,
    docsUrl: "https://developers.facebook.com/docs/whatsapp/cloud-api",
    instructions: [
      "Crie um app do tipo Business no painel de desenvolvedores da Meta e adicione o produto WhatsApp.",
      "Gere um token permanente para o número da loja e copie o ID do número de telefone.",
      "Cadastre o endereço de webhook mostrado nesta tela e use o token de verificação exibido.",
      "Assine os eventos messages e message_status.",
    ],
    fallback: "Mensagens simuladas na central de atendimento.",
  },
  {
    kind: "mercadopago",
    label: "Mercado Pago",
    category: "pagamentos",
    summary: "Pix, cartão e link de pagamento com confirmação automática.",
    providers: [{ key: "mercadopago", label: "Mercado Pago" }],
    fields: [
      secret("accessToken", "Access token"),
      secret("webhookSecret", "Chave secreta do webhook"),
      { key: "extra", label: "Public key", secret: false },
    ],
    inboundEvents: ["payment.created", "payment.updated"],
    outboundEvents: ["pagamento.confirmado", "pagamento.estornado"],
    hasWebhook: true,
    docsUrl: "https://www.mercadopago.com.br/developers",
    instructions: [
      "Acesse Suas integrações no painel do Mercado Pago e crie uma aplicação.",
      "Copie o access token de produção (ou de teste, se estiver em ambiente de testes).",
      "Cadastre a URL de webhook desta tela e ative as notificações de pagamento.",
    ],
    fallback: "Pix direto pela chave da loja e confirmação manual.",
  },
  {
    kind: "pagseguro",
    label: "PagBank / PagSeguro",
    category: "pagamentos",
    summary: "Pix e cartão com antifraude e conciliação.",
    providers: [{ key: "pagseguro", label: "PagBank" }],
    fields: [
      secret("apiKey", "Token da conta"),
      secret("webhookSecret", "Segredo de notificação", undefined, true),
    ],
    inboundEvents: ["TRANSACTION", "CHARGE"],
    outboundEvents: ["pagamento.confirmado", "pagamento.estornado"],
    hasWebhook: true,
    docsUrl: "https://dev.pagbank.uol.com.br",
    instructions: [
      "No painel do PagBank, gere um token de integração para a sua conta.",
      "Informe a URL de notificação desta tela em Configurações de notificação.",
    ],
    fallback: "Pagamento na entrega e Pix manual.",
  },
  {
    kind: "asaas",
    label: "Asaas",
    category: "pagamentos",
    summary: "Cobranças, boletos, carnê e assinaturas recorrentes.",
    providers: [{ key: "asaas", label: "Asaas" }],
    fields: [secret("apiKey", "Chave de API"), secret("webhookSecret", "Token do webhook")],
    inboundEvents: ["PAYMENT_RECEIVED", "PAYMENT_OVERDUE", "PAYMENT_REFUNDED"],
    outboundEvents: ["cobranca.paga", "cobranca.vencida", "assinatura.renovada"],
    hasWebhook: true,
    docsUrl: "https://docs.asaas.com",
    instructions: [
      "No Asaas, vá em Integrações e gere a chave de API.",
      "Cadastre a URL de webhook desta tela e defina um token de autenticação.",
      "Assine os eventos de cobrança paga, vencida e estornada.",
    ],
    fallback: "Cobranças registradas manualmente no financeiro.",
  },
  {
    kind: "ifood",
    label: "iFood e marketplaces",
    category: "marketplace",
    summary: "Importa pedidos do marketplace pelo adaptador oficial, conforme liberação de API.",
    providers: [
      { key: "ifood", label: "iFood" },
      { key: "rappi", label: "Rappi" },
      { key: "outro", label: "Outro marketplace" },
    ],
    fields: [
      secret("apiKey", "Client ID"),
      secret("apiSecret", "Client secret"),
      { key: "extra", label: "ID do merchant", secret: false },
    ],
    inboundEvents: ["PLACED", "CONFIRMED", "CANCELLED", "CONCLUDED"],
    outboundEvents: ["pedido.criado", "pedido.status"],
    hasWebhook: true,
    docsUrl: "https://developer.ifood.com.br",
    instructions: [
      "Solicite acesso ao portal do desenvolvedor do marketplace e obtenha client ID e secret.",
      "Informe o ID do merchant da sua loja.",
      "A importação de pedidos só é ativada após a homologação do marketplace.",
    ],
    fallback: "Pedidos do marketplace lançados manualmente no painel.",
  },
  {
    kind: "hotmart",
    label: "Hotmart",
    category: "digital",
    summary: "Produtos digitais: confirma a compra e libera o acesso automaticamente.",
    providers: [{ key: "hotmart", label: "Hotmart" }],
    fields: [
      secret("accessToken", "Token de acesso"),
      secret("webhookSecret", "Hottok (assinatura)"),
    ],
    inboundEvents: ["PURCHASE_APPROVED", "PURCHASE_REFUNDED", "SUBSCRIPTION_CANCELLATION"],
    outboundEvents: ["entrega_digital.liberada"],
    hasWebhook: true,
    docsUrl: "https://developers.hotmart.com",
    instructions: [
      "Na Hotmart, acesse Ferramentas > Webhook (Postback) e cadastre a URL desta tela.",
      "Copie o Hottok gerado e cole no campo de assinatura.",
      "A liberação do produto digital acontece assim que a compra é aprovada.",
    ],
    fallback: "Liberação manual do link do produto digital.",
  },
  {
    kind: "maps",
    label: "Mapas, endereço e rotas",
    category: "mapas",
    summary: "Autocompletar endereço, calcular distância e traçar rota de entrega.",
    providers: [
      { key: "google_maps", label: "Google Maps" },
      { key: "mapbox", label: "Mapbox" },
    ],
    fields: [secret("apiKey", "Chave de API")],
    inboundEvents: [],
    outboundEvents: ["entrega.rota_calculada"],
    hasWebhook: false,
    docsUrl: "https://developers.google.com/maps",
    instructions: [
      "Crie um projeto no provedor escolhido e ative as APIs de Places, Distance Matrix e Directions.",
      "Restrinja a chave por domínio antes de usá-la em produção.",
    ],
    fallback: "Distância estimada por bairro cadastrado nas zonas de entrega.",
  },
  {
    kind: "fiscal",
    label: "Emissão fiscal (NFC-e / NF-e)",
    category: "fiscal",
    summary: "Emite nota a partir dos pedidos, conforme o provedor autorizado.",
    providers: [
      { key: "focus_nfe", label: "Focus NFe" },
      { key: "nfe_io", label: "NFe.io" },
      { key: "enotas", label: "eNotas" },
    ],
    fields: [
      secret("apiKey", "Token de API"),
      { key: "extra", label: "CNPJ emitente", secret: false },
    ],
    inboundEvents: ["nota_autorizada", "nota_rejeitada", "nota_cancelada"],
    outboundEvents: ["fiscal.autorizada", "fiscal.rejeitada"],
    hasWebhook: true,
    instructions: [
      "Contrate o provedor fiscal e envie o certificado digital A1 diretamente para ele.",
      "Gere o token de API e informe o CNPJ emitente.",
      "Emita uma nota em ambiente de homologação antes de ativar a produção.",
    ],
    fallback: "Cupom não fiscal de conferência.",
  },
  {
    kind: "email",
    label: "E-mail transacional",
    category: "comunicacao",
    summary: "Confirmações de pedido, recibos e avisos por e-mail.",
    providers: [
      { key: "resend", label: "Resend" },
      { key: "sendgrid", label: "SendGrid" },
      { key: "ses", label: "Amazon SES" },
    ],
    fields: [
      secret("apiKey", "Chave de API"),
      { key: "extra", label: "Remetente (e-mail)", secret: false },
    ],
    inboundEvents: ["entregue", "bounce", "reclamacao"],
    outboundEvents: ["email.enviado"],
    hasWebhook: true,
    instructions: [
      "Verifique o domínio de envio no provedor escolhido.",
      "Gere a chave de API e informe o remetente verificado.",
    ],
    fallback: "Mensagens simuladas na central de notificações.",
  },
  {
    kind: "push",
    label: "Notificações push",
    category: "comunicacao",
    summary: "Avisos de pedido no aplicativo instalado do cliente.",
    providers: [
      { key: "fcm", label: "Firebase Cloud Messaging" },
      { key: "onesignal", label: "OneSignal" },
    ],
    fields: [
      secret("apiKey", "Chave do servidor"),
      { key: "extra", label: "ID do projeto/app", secret: false },
    ],
    inboundEvents: ["entregue", "clique"],
    outboundEvents: ["push.enviado"],
    hasWebhook: false,
    instructions: [
      "Crie o projeto no provedor e copie a chave do servidor.",
      "O aplicativo instalável do cliente usa essa chave para receber avisos de pedido.",
    ],
    fallback: "Avisos apenas dentro do painel e da loja.",
  },
  {
    kind: "analytics",
    label: "Analytics",
    category: "comunicacao",
    summary: "Visitas, conversão e funil da loja pública.",
    providers: [
      { key: "ga4", label: "Google Analytics 4" },
      { key: "meta_pixel", label: "Meta Pixel" },
      { key: "plausible", label: "Plausible" },
    ],
    fields: [{ key: "extra", label: "ID de medição", secret: false }],
    inboundEvents: [],
    outboundEvents: ["analytics.evento"],
    hasWebhook: false,
    instructions: ["Copie o ID de medição do provedor e cole aqui. Nenhum dado pessoal é enviado."],
    fallback: "Relatórios internos de pedidos.",
  },
];

/**
 * Conectores que não aparecem para o lojista: mapas/rotas já funcionam de graça
 * via OpenStreetMap, e-mail/push são cuidados pela plataforma e WhatsApp é
 * gerenciado no módulo de atendimento (não na central de integrações).
 */
export const MERCHANT_HIDDEN_KINDS = ["maps", "email", "push", "whatsapp"];

export const MERCHANT_CONNECTORS: Connector[] = CONNECTORS.filter(
  (connector) => !MERCHANT_HIDDEN_KINDS.includes(connector.kind),
);

export const CONNECTOR_BY_KIND: Record<string, Connector> = Object.fromEntries(
  CONNECTORS.map((connector) => [connector.kind, connector]),
);

export const CATEGORY_LABEL: Record<ConnectorCategory, string> = {
  mensagens: "Mensagens",
  pagamentos: "Pagamentos",
  marketplace: "Marketplaces",
  digital: "Produtos digitais",
  mapas: "Mapas e rotas",
  fiscal: "Fiscal",
  comunicacao: "Comunicação e dados",
};

export const STATUS_LABEL: Record<string, string> = {
  not_configured: "Não configurada",
  demo: "Modo demonstração",
  connected: "Conectada",
  error: "Com erro",
};

export const STATUS_TONE: Record<string, string> = {
  not_configured: "bg-muted text-muted-foreground",
  demo: "bg-amber-500/15 text-amber-700",
  connected: "bg-emerald-500/15 text-emerald-700",
  error: "bg-destructive/15 text-destructive",
};

/** Eventos que a loja pode assinar nos webhooks de saída. */
export const OUTBOUND_EVENTS = [
  "pedido.criado",
  "pedido.status",
  "pedido.cancelado",
  "pagamento.confirmado",
  "pagamento.estornado",
  "entrega.atualizada",
  "cliente.criado",
  "estoque.baixo",
] as const;

/** Escopos disponíveis para as chaves da API pública. */
export const API_SCOPES = [
  { key: "lojas:ler", label: "Lojas (leitura)" },
  { key: "catalogo:ler", label: "Catálogo (leitura)" },
  { key: "catalogo:escrever", label: "Catálogo (escrita)" },
  { key: "clientes:ler", label: "Clientes (leitura)" },
  { key: "pedidos:ler", label: "Pedidos (leitura)" },
  { key: "pedidos:escrever", label: "Pedidos (escrita)" },
  { key: "pagamentos:ler", label: "Pagamentos (leitura)" },
  { key: "entregas:ler", label: "Entregas (leitura)" },
  { key: "mesas:ler", label: "Mesas (leitura)" },
  { key: "estoque:ler", label: "Estoque (leitura)" },
  { key: "estoque:escrever", label: "Estoque (escrita)" },
  { key: "cupons:ler", label: "Cupons (leitura)" },
  { key: "webhooks:gerenciar", label: "Webhooks (gerenciar)" },
] as const;

export type ApiScope = (typeof API_SCOPES)[number]["key"];

/** Endereço público do webhook de entrada de um conector. */
export function webhookUrl(origin: string, kind: string, storeId: string): string {
  return `${origin}/api/public/integracoes/${kind}/${storeId}`;
}

/** Intervalo (em segundos) de cada retentativa — recuo exponencial com teto. */
export const RETRY_BACKOFF_SECONDS = [30, 120, 600, 3600, 21600];

export function nextRetryDelay(attempts: number): number | null {
  if (attempts >= RETRY_BACKOFF_SECONDS.length) return null;
  return RETRY_BACKOFF_SECONDS[attempts] ?? null;
}
