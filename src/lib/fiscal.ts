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

/** Modelos de documento suportados na configuração da loja. */
export const INVOICE_MODELS = [
  { value: "nfse", label: "NFS-e (serviços)" },
  { value: "nfe", label: "NF-e (produtos)" },
  { value: "nfce", label: "NFC-e (consumidor)" },
] as const;

export const INVOICE_MODEL_LABEL: Record<string, string> = Object.fromEntries(
  INVOICE_MODELS.map((item) => [item.value, item.label]),
);

/** Parâmetros que definem a base de cálculo da nota. */
export interface FiscalBaseParams {
  includeShipping: boolean;
  discountReducesBase: boolean;
  deductionPercent: number;
  taxPercent: number;
}

export interface FiscalBaseBreakdown {
  /** Valor total do pedido (o que o cliente pagou). */
  total: number;
  /** Valor deduzido antes de aplicar o imposto. */
  deduction: number;
  /** Base sobre a qual o imposto incide. */
  base: number;
  /** Imposto calculado. */
  tax: number;
}

/**
 * Calcula a base de cálculo e o imposto de um pedido.
 *
 * Ordem: parte do subtotal, aplica (ou não) frete e desconto, desconta o
 * percentual de dedução e só então aplica a alíquota. Todos os valores são
 * arredondados a 2 casas para bater com o que o emissor recebe.
 */
export function calcFiscalBase(
  order: { subtotal?: number | null; deliveryFee?: number | null; discount?: number | null; total?: number | null },
  params: FiscalBaseParams,
): FiscalBaseBreakdown {
  const round = (value: number) => Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;
  const subtotal = Number(order.subtotal ?? 0);
  const shipping = Number(order.deliveryFee ?? 0);
  const discount = Number(order.discount ?? 0);

  let gross = subtotal;
  if (params.includeShipping) gross += shipping;
  if (params.discountReducesBase) gross -= discount;
  gross = Math.max(0, gross);

  const deduction = round((gross * Math.max(0, Math.min(100, params.deductionPercent))) / 100);
  const base = round(Math.max(0, gross - deduction));
  const tax = round((base * Math.max(0, Math.min(100, params.taxPercent))) / 100);

  return { total: round(Number(order.total ?? gross)), deduction, base, tax };
}
