/**
 * Catálogo de adaptadores de integração da loja.
 * Cada item descreve um ponto de extensão já preparado no sistema: quando o
 * lojista conecta um provedor, o módulo correspondente passa a usá-lo; sem
 * conexão, tudo continua funcionando em modo interno/demonstração.
 */

export type IntegrationKind =
  | "payment"
  | "maps"
  | "fiscal"
  | "email"
  | "storage"
  | "analytics"
  | "barcode"
  | "printer";

export interface IntegrationDefinition {
  kind: IntegrationKind;
  label: string;
  description: string;
  providers: string[];
  fallback: string;
}

export const INTEGRATIONS: IntegrationDefinition[] = [
  {
    kind: "payment",
    label: "Gateway de pagamento",
    description: "Cobrança Pix e cartão online.",
    providers: ["manual", "mercadopago", "stripe"],
    fallback: "Pix direto pela chave da loja.",
  },
  {
    kind: "maps",
    label: "Mapas e rotas",
    description: "Distância, rota e rastreamento do entregador.",
    providers: ["google_maps", "mapbox"],
    fallback: "Etapas simuladas registradas pelo entregador.",
  },
  {
    kind: "fiscal",
    label: "Emissão fiscal",
    description: "NFC-e / NFS-e a partir dos pedidos.",
    providers: ["focus_nfe", "nfe_io", "enotas"],
    fallback: "Somente cupom não fiscal de conferência.",
  },
  {
    kind: "email",
    label: "Envio de e-mail",
    description: "Confirmações e avisos por e-mail.",
    providers: ["resend", "sendgrid", "ses"],
    fallback: "Mensagens simuladas na central de notificações.",
  },
  {
    kind: "storage",
    label: "Armazenamento de imagens",
    description: "Fotos de produtos, logo e comprovantes.",
    providers: ["lovable_cloud", "cloudinary", "s3"],
    fallback: "Armazenamento interno da plataforma.",
  },
  {
    kind: "analytics",
    label: "Analytics",
    description: "Acompanhamento de visitas e conversão da loja.",
    providers: ["ga4", "meta_pixel", "plausible"],
    fallback: "Relatórios internos de pedidos.",
  },
  {
    kind: "barcode",
    label: "Leitor de código de barras",
    description: "Leitura de EAN para estoque e balcão.",
    providers: ["camera", "usb_scanner"],
    fallback: "Digitação manual do código.",
  },
  {
    kind: "printer",
    label: "Impressora",
    description: "Cupom térmico e folha comum.",
    providers: ["browser", "escpos_bridge"],
    fallback: "Impressão pelo navegador.",
  },
];

export const PROVIDER_LABEL: Record<string, string> = {
  manual: "Pix direto",
  mercadopago: "Mercado Pago",
  stripe: "Stripe",
  google_maps: "Google Maps",
  mapbox: "Mapbox",
  focus_nfe: "Focus NFe",
  nfe_io: "NFe.io",
  enotas: "eNotas",
  resend: "Resend",
  sendgrid: "SendGrid",
  ses: "Amazon SES",
  lovable_cloud: "Armazenamento da plataforma",
  cloudinary: "Cloudinary",
  s3: "Amazon S3",
  ga4: "Google Analytics 4",
  meta_pixel: "Meta Pixel",
  plausible: "Plausible",
  camera: "Câmera do dispositivo",
  usb_scanner: "Leitor USB",
  browser: "Navegador",
  escpos_bridge: "Ponte ESC/POS",
};

export const INTEGRATION_STATUS_LABEL: Record<string, string> = {
  not_configured: "Não configurada",
  demo: "Demonstração",
  connected: "Conectada",
  error: "Com erro",
};
