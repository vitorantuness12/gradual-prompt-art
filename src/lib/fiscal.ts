/**
 * Tipos e rótulos do módulo de Nota fiscal.
 * Arquivo seguro para o navegador: nenhuma credencial passa por aqui.
 */
import type { Database } from "@/integrations/supabase/types";

export type FiscalSettingsRow = Database["public"]["Tables"]["fiscal_settings"]["Row"];
export type FiscalInvoiceRow = Database["public"]["Tables"]["fiscal_invoices"]["Row"];

/** Emissores suportados. `manual` só gera o registro interno, sem enviar à prefeitura. */
export const FISCAL_PROVIDERS = [
  { value: "manual", label: "Sem emissor (registro interno)", needsCompany: false },
  { value: "focus_nfe", label: "Focus NFe", needsCompany: false },
  { value: "nfe_io", label: "NFe.io", needsCompany: true },
  { value: "enotas", label: "eNotas", needsCompany: true },
] as const;

export type FiscalProvider = (typeof FISCAL_PROVIDERS)[number]["value"];

export const FISCAL_PROVIDER_LABEL: Record<string, string> = Object.fromEntries(
  FISCAL_PROVIDERS.map((provider) => [provider.value, provider.label]),
);

export function providerNeedsCompany(provider: string): boolean {
  return FISCAL_PROVIDERS.find((item) => item.value === provider)?.needsCompany ?? false;
}

export const FISCAL_STATUS_LABEL: Record<string, string> = {
  pending: "Em processamento",
  issued: "Emitida",
  error: "Com erro",
  cancelled: "Cancelada",
};

export const FISCAL_STATUS_TONE: Record<string, string> = {
  pending: "bg-muted text-muted-foreground",
  issued: "bg-primary/10 text-primary",
  error: "bg-destructive/10 text-destructive",
  cancelled: "bg-muted text-muted-foreground line-through",
};

export const FISCAL_ENVIRONMENTS = [
  { value: "homologacao", label: "Teste (homologação)" },
  { value: "producao", label: "Produção (nota válida)" },
] as const;

export const TAX_REGIMES = [
  { value: "simples_nacional", label: "Simples Nacional" },
  { value: "mei", label: "MEI" },
  { value: "lucro_presumido", label: "Lucro presumido" },
  { value: "lucro_real", label: "Lucro real" },
] as const;

/** Situação da conexão exibida no painel. */
export interface FiscalConnection {
  provider: string;
  configured: boolean;
  companyId: string | null;
  maskedKey: string | null;
}

export interface FiscalConfig {
  settings: FiscalSettingsRow | null;
  connection: FiscalConnection;
}

export interface FiscalOrderOption {
  id: string;
  code: string | null;
  customerName: string | null;
  total: number;
  createdAt: string;
  paymentStatus: string;
  invoiceStatus: string | null;
}

export function fiscalConfigKey(storeId: string | undefined) {
  return ["fiscal-config", storeId] as const;
}

export function fiscalInvoicesKey(storeId: string | undefined) {
  return ["fiscal-invoices", storeId] as const;
}

export function fiscalOrdersKey(storeId: string | undefined) {
  return ["fiscal-orders", storeId] as const;
}

/** Somente dígitos — usado em CNPJ, CPF e inscrição municipal. */
export function onlyDigits(value: string | null | undefined): string {
  return (value ?? "").replace(/\D/g, "");
}

export function isValidDocument(value: string | null | undefined): boolean {
  const digits = onlyDigits(value);
  return digits.length === 11 || digits.length === 14;
}
