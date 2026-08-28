/**
 * Modelos editáveis das mensagens de produtos digitais (e-mail e WhatsApp),
 * com variáveis e pré-visualização. Client-safe.
 */

export type DigitalMessageEvent =
  | "entrega_digital"
  | "assinatura_activated"
  | "assinatura_charged"
  | "assinatura_reactivated"
  | "assinatura_past_due"
  | "assinatura_canceled";

export type DigitalChannel = "email" | "whatsapp";

export const DIGITAL_EVENT_LABEL: Record<DigitalMessageEvent, string> = {
  entrega_digital: "Entrega digital liberada",
  assinatura_activated: "Assinatura ativada",
  assinatura_charged: "Pagamento confirmado",
  assinatura_reactivated: "Assinatura reativada",
  assinatura_past_due: "Cobrança pendente (inadimplência)",
  assinatura_canceled: "Assinatura cancelada",
};

export const DIGITAL_VARIABLES = [
  { key: "cliente", description: "Nome do comprador" },
  { key: "produto", description: "Nome do produto ou plano" },
  { key: "valor", description: "Valor formatado" },
  { key: "validade", description: "Data limite do link de entrega" },
  { key: "downloads", description: "Downloads restantes" },
  { key: "proximos_passos", description: "Instruções cadastradas no produto" },
  { key: "link", description: "Link de entrega/download" },
  { key: "loja", description: "Nome da loja" },
  { key: "status", description: "Situação do acesso" },
  { key: "proxima_cobranca", description: "Data da próxima cobrança" },
] as const;

export interface DigitalVars {
  cliente?: string;
  produto?: string;
  valor?: string;
  validade?: string;
  downloads?: string;
  proximos_passos?: string;
  link?: string;
  loja?: string;
  status?: string;
  proxima_cobranca?: string;
}

/** Substitui {{variavel}} pelos valores informados e limpa linhas vazias sobrando. */
export function renderDigitalTemplate(body: string, vars: DigitalVars): string {
  return body
    .replace(/\{\{\s*([a-zA-Z_]+)\s*\}\}/g, (_match, key: string) => {
      const value = (vars as Record<string, string | undefined>)[key];
      return value ?? "";
    })
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export interface DigitalTemplate {
  event: DigitalMessageEvent;
  channel: DigitalChannel;
  subject: string;
  body: string;
}

/** Chave usada na tabela de modelos de mensagem. */
export function templateKey(event: DigitalMessageEvent, channel: DigitalChannel): string {
  return `digital:${channel}:${event}`;
}

export const DEFAULT_DIGITAL_TEMPLATES: DigitalTemplate[] = [
  {
    event: "entrega_digital",
    channel: "email",
    subject: "Seu acesso a {{produto}} está liberado",
    body: "Olá, {{cliente}}!\n\nSeu acesso a {{produto}} está liberado.\nBaixe aqui: {{link}}\n\nValidade do link: {{validade}}\nDownloads restantes: {{downloads}}\n\nPróximos passos: {{proximos_passos}}\n\n— {{loja}}",
  },
  {
    event: "entrega_digital",
    channel: "whatsapp",
    subject: "",
    body: "Olá, {{cliente}}! Seu acesso a {{produto}} está liberado ✅\nBaixe aqui: {{link}}\nValidade: {{validade}} · Downloads restantes: {{downloads}}",
  },
  {
    event: "assinatura_activated",
    channel: "email",
    subject: "Assinatura de {{produto}} ativada",
    body: "Olá, {{cliente}}!\n\nSua assinatura de {{produto}} está ativa ({{valor}}).\nPróxima cobrança: {{proxima_cobranca}}\nAcesse o conteúdo: {{link}}\n\n— {{loja}}",
  },
  {
    event: "assinatura_activated",
    channel: "whatsapp",
    subject: "",
    body: "Oi, {{cliente}}! Sua assinatura de {{produto}} está ativa 🎉\nValor: {{valor}} · Próxima cobrança: {{proxima_cobranca}}\nAcesse: {{link}}",
  },
  {
    event: "assinatura_charged",
    channel: "email",
    subject: "Pagamento confirmado — {{produto}}",
    body: "Olá, {{cliente}}!\n\nRecebemos o pagamento de {{valor}} da assinatura de {{produto}}.\nPróxima cobrança: {{proxima_cobranca}}\nSeu acesso segue liberado: {{link}}\n\n— {{loja}}",
  },
  {
    event: "assinatura_charged",
    channel: "whatsapp",
    subject: "",
    body: "{{cliente}}, recebemos o pagamento de {{valor}} da sua assinatura de {{produto}} ✅\nAcesso liberado: {{link}}",
  },
  {
    event: "assinatura_reactivated",
    channel: "email",
    subject: "Acesso reativado — {{produto}}",
    body: "Olá, {{cliente}}!\n\nSua cobrança foi confirmada e o acesso a {{produto}} voltou a funcionar.\nStatus do download: {{status}}\nBaixe aqui: {{link}}\n\n— {{loja}}",
  },
  {
    event: "assinatura_reactivated",
    channel: "whatsapp",
    subject: "",
    body: "Boas notícias, {{cliente}}! Sua assinatura de {{produto}} foi reativada 🔓\nStatus do download: {{status}}\nBaixe aqui: {{link}}",
  },
  {
    event: "assinatura_past_due",
    channel: "email",
    subject: "Não conseguimos confirmar sua cobrança — {{produto}}",
    body: "Olá, {{cliente}}!\n\nA cobrança de {{valor}} da assinatura de {{produto}} ficou pendente.\nStatus do download: {{status}}\nRegularize para manter o acesso: {{link}}\n\n— {{loja}}",
  },
  {
    event: "assinatura_past_due",
    channel: "whatsapp",
    subject: "",
    body: "{{cliente}}, a cobrança de {{valor}} da sua assinatura de {{produto}} ficou pendente ⚠️\nStatus do download: {{status}}\nRegularize aqui: {{link}}",
  },
  {
    event: "assinatura_canceled",
    channel: "email",
    subject: "Assinatura de {{produto}} cancelada",
    body: "Olá, {{cliente}}!\n\nSua assinatura de {{produto}} foi cancelada e o acesso ao conteúdo foi encerrado.\nStatus do download: {{status}}\n\n— {{loja}}",
  },
  {
    event: "assinatura_canceled",
    channel: "whatsapp",
    subject: "",
    body: "{{cliente}}, sua assinatura de {{produto}} foi cancelada. Status do download: {{status}}",
  },
];

export function defaultTemplate(event: DigitalMessageEvent, channel: DigitalChannel): DigitalTemplate {
  return (
    DEFAULT_DIGITAL_TEMPLATES.find((item) => item.event === event && item.channel === channel) ?? {
      event,
      channel,
      subject: "",
      body: "",
    }
  );
}

/** Dados de exemplo usados na pré-visualização do painel. */
export const PREVIEW_VARS: DigitalVars = {
  cliente: "Ana Souza",
  produto: "Curso de Confeitaria",
  valor: "R$ 97,00",
  validade: "10/09/2026 às 23:59",
  downloads: "3",
  proximos_passos: "Acesse pelo computador e salve o arquivo antes de expirar.",
  link: "https://sualoja.com.br/entrega/exemplo-token",
  loja: "Minha Loja",
  status: "Liberado",
  proxima_cobranca: "10/10/2026",
};
