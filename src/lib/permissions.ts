import type { Database } from "@/integrations/supabase/types";

export type AppRole = Database["public"]["Enums"]["app_role"];

/** Áreas do painel que podem ser liberadas individualmente por membro. */
export const PERMISSION_AREAS = [
  { key: "orders", label: "Pedidos", description: "Ver e movimentar pedidos, KDS e impressão." },
  { key: "catalog", label: "Catálogo", description: "Produtos, serviços, categorias e combos." },
  { key: "inventory", label: "Estoque", description: "Movimentações, insumos e alertas de mínimo." },
  { key: "customers", label: "Clientes", description: "Cadastro, histórico e atendimento." },
  { key: "finance", label: "Financeiro", description: "Pagamentos, faturas e conciliação." },
  { key: "reports", label: "Relatórios", description: "Indicadores e exportações." },
  { key: "settings", label: "Configurações", description: "Dados da loja, canais e integrações." },
  { key: "pos", label: "PDV / Caixa", description: "Abrir venda rápida e registrar vendas presenciais." },
  { key: "pos_discount", label: "PDV: desconto", description: "Autorizar desconto em uma venda." },
  { key: "pos_cancel", label: "PDV: cancelar venda", description: "Cancelar venda concluída e devolver o estoque." },
  { key: "pos_reopen", label: "PDV: reabrir venda", description: "Reabrir uma venda para ajustes." },
  { key: "pos_withdrawal", label: "PDV: sangria e saída", description: "Retirar dinheiro do caixa." },
  { key: "pos_close", label: "PDV: fechar caixa", description: "Conferir e encerrar o turno." },
] as const;

export type PermissionArea = (typeof PERMISSION_AREAS)[number]["key"];

export type PermissionMap = Partial<Record<PermissionArea, boolean>>;

/** Permissões padrão sugeridas para cada papel. */
export const ROLE_DEFAULT_PERMISSIONS: Record<string, PermissionMap> = {
  owner: {
    orders: true,
    catalog: true,
    inventory: true,
    customers: true,
    finance: true,
    reports: true,
    settings: true,
    pos: true,
    pos_discount: true,
    pos_cancel: true,
    pos_reopen: true,
    pos_withdrawal: true,
    pos_close: true,
  },
  manager: {
    orders: true,
    catalog: true,
    inventory: true,
    customers: true,
    finance: true,
    reports: true,
    settings: true,
    pos: true,
    pos_discount: true,
    pos_cancel: true,
    pos_reopen: true,
    pos_withdrawal: true,
    pos_close: true,
  },
  staff: {
    orders: true,
    catalog: false,
    inventory: true,
    customers: true,
    finance: false,
    reports: false,
    settings: false,
    pos: true,
    pos_discount: false,
    pos_cancel: false,
    pos_reopen: false,
    pos_withdrawal: false,
    pos_close: false,
  },
  delivery_person: { orders: true },
};

export const ASSIGNABLE_ROLES: AppRole[] = ["owner", "manager", "staff", "delivery_person"];

/** Papéis owner e manager sempre têm acesso total; os demais seguem o mapa. */
export function hasPermission(
  role: AppRole | undefined,
  permissions: PermissionMap | null | undefined,
  area: PermissionArea,
): boolean {
  if (!role) return false;
  if (role === "owner" || role === "manager" || role === "super_admin") return true;
  return Boolean(permissions?.[area]);
}

export function normalizePermissions(value: unknown): PermissionMap {
  if (!value || typeof value !== "object") return {};
  const source = value as Record<string, unknown>;
  const result: PermissionMap = {};
  for (const area of PERMISSION_AREAS) {
    if (typeof source[area.key] === "boolean") result[area.key] = source[area.key] as boolean;
  }
  return result;
}

export function permissionSummary(role: AppRole, permissions: PermissionMap): string {
  if (role === "owner" || role === "manager") return "Acesso completo";
  const enabled = PERMISSION_AREAS.filter((area) => permissions[area.key]);
  if (enabled.length === 0) return "Sem áreas liberadas";
  return enabled.map((area) => area.label).join(", ");
}
