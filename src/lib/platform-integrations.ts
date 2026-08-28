/**
 * Campos de configuração de cada provedor global da plataforma.
 * Usado tanto pelo formulário do superadmin quanto pela validação no servidor.
 * Campos marcados como `secret` nunca voltam para o navegador.
 */

export interface ProviderField {
  key: string;
  label: string;
  placeholder?: string;
  secret?: boolean;
  required?: boolean;
  hint?: string;
}

export const PROVIDER_FIELDS: Record<string, ProviderField[]> = {
  manual: [
    { key: "pix_key", label: "Chave Pix padrão", placeholder: "email, telefone ou CNPJ", hint: "Usada como exemplo para novas lojas." },
  ],
  mercadopago: [
    { key: "access_token", label: "Access token", placeholder: "APP_USR-...", secret: true, required: true },
    { key: "public_key", label: "Public key", placeholder: "APP_USR-..." },
    { key: "webhook_secret", label: "Segredo do webhook", secret: true },
  ],
  stripe: [
    { key: "secret_key", label: "Secret key", placeholder: "sk_live_...", secret: true, required: true },
    { key: "publishable_key", label: "Publishable key", placeholder: "pk_live_..." },
    { key: "webhook_secret", label: "Signing secret do webhook", placeholder: "whsec_...", secret: true },
  ],
  google_maps: [{ key: "api_key", label: "API key", secret: true, required: true }],
  mapbox: [{ key: "access_token", label: "Access token", placeholder: "pk....", secret: true, required: true }],
  focus_nfe: [
    { key: "token", label: "Token", secret: true, required: true },
    { key: "environment", label: "Ambiente", placeholder: "producao ou homologacao" },
  ],
  nfe_io: [{ key: "api_key", label: "API key", secret: true, required: true }],
  enotas: [{ key: "api_key", label: "API key", secret: true, required: true }],
  resend: [
    { key: "api_key", label: "API key", placeholder: "re_...", secret: true, required: true },
    { key: "from", label: "Remetente padrão", placeholder: "Loja <contato@dominio.com>" },
  ],
  sendgrid: [
    { key: "api_key", label: "API key", placeholder: "SG....", secret: true, required: true },
    { key: "from", label: "Remetente padrão", placeholder: "contato@dominio.com" },
  ],
  ses: [
    { key: "region", label: "Região", placeholder: "us-east-1", required: true },
    { key: "access_key_id", label: "Access key ID", secret: true, required: true },
    { key: "secret_access_key", label: "Secret access key", secret: true, required: true },
  ],
  lovable_cloud: [{ key: "bucket", label: "Bucket", placeholder: "store-images" }],
  cloudinary: [
    { key: "cloud_name", label: "Cloud name", required: true },
    { key: "api_key", label: "API key", secret: true, required: true },
    { key: "api_secret", label: "API secret", secret: true, required: true },
  ],
  s3: [
    { key: "bucket", label: "Bucket", required: true },
    { key: "region", label: "Região", placeholder: "us-east-1", required: true },
    { key: "access_key_id", label: "Access key ID", secret: true, required: true },
    { key: "secret_access_key", label: "Secret access key", secret: true, required: true },
  ],
  ga4: [{ key: "measurement_id", label: "Measurement ID", placeholder: "G-XXXXXXX", required: true }],
  meta_pixel: [{ key: "pixel_id", label: "Pixel ID", required: true }],
  plausible: [{ key: "domain", label: "Domínio", placeholder: "minhaloja.com.br", required: true }],
  camera: [],
  usb_scanner: [{ key: "prefix", label: "Prefixo do leitor", hint: "Deixe vazio se o leitor não envia prefixo." }],
  browser: [],
  escpos_bridge: [{ key: "endpoint", label: "Endereço da ponte", placeholder: "http://localhost:9100", required: true }],
};

export function providerFields(provider: string): ProviderField[] {
  return PROVIDER_FIELDS[provider] ?? [];
}

export const INTEGRATION_STATUS_TONE: Record<string, string> = {
  not_configured: "bg-muted text-muted-foreground",
  configured: "bg-accent/15 text-accent-foreground",
  connected: "bg-primary/10 text-primary",
  error: "bg-destructive/10 text-destructive",
};

export const PLATFORM_STATUS_LABEL: Record<string, string> = {
  not_configured: "Não configurada",
  configured: "Configurada",
  connected: "Conectada",
  error: "Com erro",
};
