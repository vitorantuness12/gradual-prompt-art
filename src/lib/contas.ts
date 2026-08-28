/** Tipos de conta suportados pela plataforma e utilidades de redirecionamento. */

export type AccountKind = "cliente" | "motoboy" | "lojista";

export interface AccountKindInfo {
  key: AccountKind;
  label: string;
  description: string;
}

export const ACCOUNT_KINDS: AccountKindInfo[] = [
  {
    key: "cliente",
    label: "Cliente",
    description: "Faça pedidos, acompanhe entregas e repita suas compras.",
  },
  {
    key: "motoboy",
    label: "Motoboy",
    description: "Receba e gerencie entregas, rotas e ganhos.",
  },
  {
    key: "lojista",
    label: "Lojista",
    description: "Cadastre sua loja, receba pedidos e gerencie sua operação.",
  },
];

export interface AccountKindsResult {
  customer: boolean;
  courier: boolean;
  courier_status: string | null;
  merchant: boolean;
  super_admin: boolean;
}

export const COURIER_STATUS_LABEL: Record<string, string> = {
  draft: "Rascunho",
  awaiting_verification: "Aguardando verificação",
  awaiting_approval: "Aguardando aprovação",
  approved: "Aprovado",
  active: "Ativo",
  offline: "Offline",
  on_delivery: "Em entrega",
  suspended: "Suspenso",
  rejected: "Rejeitado",
  disabled: "Desativado",
};

/** Situações em que o motoboy pode ficar online e receber entregas. */
export const COURIER_WORKING_STATUS = ["approved", "active", "offline", "on_delivery"];

export function courierCanWork(status: string | null | undefined): boolean {
  return Boolean(status && COURIER_WORKING_STATUS.includes(status));
}

/** Decide para onde levar a pessoa depois do login. */
export function redirectForAccount(
  kinds: AccountKindsResult,
  preferred?: AccountKind | null,
  fallbackUrl?: string | null,
): string {
  const available: AccountKind[] = [];
  if (kinds.customer) available.push("cliente");
  if (kinds.courier) available.push("motoboy");
  if (kinds.merchant) available.push("lojista");

  if (kinds.super_admin && (!preferred || preferred === "lojista")) {
    if (!kinds.merchant) return "/admin";
  }

  const chosen = preferred && available.includes(preferred) ? preferred : available[0];

  if (!chosen) return "/completar-cadastro";
  if (chosen === "motoboy") {
    return courierCanWork(kinds.courier_status) ? "/entregador" : "/entregador/status";
  }
  if (chosen === "lojista") return "/painel";
  return fallbackUrl && fallbackUrl.startsWith("/") ? fallbackUrl : "/minha-conta";
}

export function availableKinds(kinds: AccountKindsResult): AccountKind[] {
  const list: AccountKind[] = [];
  if (kinds.customer) list.push("cliente");
  if (kinds.courier) list.push("motoboy");
  if (kinds.merchant) list.push("lojista");
  return list;
}

/** Mascara dados sensíveis para exibição (Pix, CPF, telefone). */
export function maskSensitive(value: string | null | undefined): string {
  if (!value) return "—";
  const raw = value.trim();
  if (raw.length <= 4) return `••••${raw.slice(-1)}`;
  return `${raw.slice(0, 2)}••••••${raw.slice(-3)}`;
}

export const VEHICLE_TYPES = [
  { value: "moto", label: "Moto" },
  { value: "carro", label: "Carro" },
  { value: "bicicleta", label: "Bicicleta" },
  { value: "outro", label: "Outro" },
];

export const COURIER_DOCUMENT_KINDS = [
  { value: "cnh", label: "CNH", hint: "Frente e verso legíveis, em JPG ou PNG (até 5 MB)." },
  { value: "identidade", label: "Documento de identificação", hint: "RG ou CPF digitalizado." },
  { value: "veiculo", label: "Documento do veículo", hint: "CRLV atualizado, quando aplicável." },
  { value: "comprovante", label: "Comprovante de residência", hint: "Emitido nos últimos 3 meses." },
];
