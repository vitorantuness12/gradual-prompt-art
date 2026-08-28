/** Configuração do menu lateral adaptativo por ramo de atividade. */

export const FEATURE_KEYS = [
  "dashboard",
  "pedidos",
  "encomendas",
  "pdv",
  "salao",
  "kds",
  "produtos",
  "estoque",
  "digitais",
  "personalizar",
  "entregas",
  "entregadores",
  "frete",
  "agendamentos",
  "clientes",
  "avaliacoes",
  "promocoes",
  "fidelidade",
  "relatorios",
  "pagamentos",
  "whatsapp",
  "impressao",
  "integracoes",
  "equipe",
  "assinatura",
  "privacidade",
  "configuracoes",
  "suporte",
] as const;

export type FeatureKey = (typeof FEATURE_KEYS)[number];

/** Funções administrativas que nunca podem ser desativadas. */
export const ESSENTIAL_FEATURES: FeatureKey[] = [
  "dashboard",
  "personalizar",
  "relatorios",
  "pagamentos",
  "equipe",
  "assinatura",
  "privacidade",
  "configuracoes",
  "suporte",
];

export const FEATURE_LABEL: Record<FeatureKey, string> = {
  dashboard: "Dashboard",
  pedidos: "Pedidos",
  encomendas: "Encomendas e eventos",
  pdv: "PDV / Caixa",
  salao: "Mesas",
  kds: "KDS",
  produtos: "Catálogo",
  estoque: "Estoque",
  digitais: "Produtos digitais",
  personalizar: "Personalizar loja",
  entregas: "Entregas",
  entregadores: "Entregadores",
  frete: "Frete e áreas",
  agendamentos: "Agenda",
  clientes: "Clientes",
  avaliacoes: "Avaliações",
  promocoes: "Marketing",
  fidelidade: "Fidelidade e CRM",
  relatorios: "Relatórios",
  pagamentos: "Financeiro",
  whatsapp: "WhatsApp da loja",
  impressao: "Impressão",
  integracoes: "Integrações e API",
  equipe: "Equipe",
  assinatura: "Assinatura",
  privacidade: "Privacidade",
  configuracoes: "Configurações",
  suporte: "Suporte",
};

/** Grupos visuais do menu lateral, na ordem de exibição. */
export const FEATURE_GROUPS: { title: string; keys: FeatureKey[] }[] = [
  { title: "Operação", keys: ["dashboard", "pedidos", "encomendas", "pdv", "salao", "kds", "agendamentos"] },
  { title: "Catálogo", keys: ["produtos", "estoque", "digitais", "personalizar"] },
  { title: "Logística", keys: ["entregas", "entregadores", "frete"] },
  { title: "Clientes", keys: ["clientes", "avaliacoes", "promocoes", "fidelidade"] },
  { title: "Gestão", keys: ["relatorios", "pagamentos"] },
  { title: "Canais", keys: ["whatsapp", "impressao", "integracoes"] },
  { title: "Conta", keys: ["equipe", "assinatura", "privacidade", "configuracoes", "suporte"] },
];

export type SegmentGroupId = "alimentacao" | "varejo" | "conveniencia" | "servicos" | "digital" | "encomendas";

export interface SegmentGroup {
  id: SegmentGroupId;
  label: string;
  description: string;
  examples: string[];
  /** Funções ocultas por padrão neste segmento. */
  hidden: FeatureKey[];
  /** Funções em destaque no dashboard. */
  highlights: FeatureKey[];
  /** Estilo de cards do dashboard. */
  dashboard: "alimentacao" | "varejo" | "servicos" | "digital";
}

export const SEGMENT_GROUPS: SegmentGroup[] = [
  {
    id: "alimentacao",
    label: "Alimentação e delivery rápido",
    description: "Pedidos em tempo real, cozinha e entregas.",
    examples: ["Restaurante", "Hamburgueria", "Pizzaria", "Açaí", "Pastelaria", "Marmitaria", "Doceria", "Padaria"],
    hidden: ["digitais", "encomendas"],
    highlights: ["pedidos", "pdv", "kds", "salao", "entregas"],
    dashboard: "alimentacao",
  },
  {
    id: "varejo",
    label: "Varejo e lojas físicas/online",
    description: "Vitrine, estoque e vendas no balcão.",
    examples: ["Roupas", "Calçados", "Eletrônicos", "Utilidades", "Tabacaria", "Cosméticos", "Presentes"],
    hidden: ["salao", "kds", "agendamentos", "digitais", "encomendas"],
    highlights: ["produtos", "estoque", "pedidos"],
    dashboard: "varejo",
  },
  {
    id: "conveniencia",
    label: "Saúde e conveniência",
    description: "Alto giro de itens com entrega rápida.",
    examples: ["Drogaria", "Farmácia", "Mercadinho", "Hortifruti", "Açougue", "Pet shop"],
    hidden: ["salao", "kds", "agendamentos", "digitais", "encomendas"],
    highlights: ["pdv", "estoque", "entregas"],
    dashboard: "varejo",
  },
  {
    id: "servicos",
    label: "Serviços e agendamentos",
    description: "Agenda por profissional e relacionamento.",
    examples: ["Barbearia", "Salão de beleza", "Clínica", "Consultório", "Estética", "Banho e tosa"],
    hidden: ["salao", "kds", "entregas", "entregadores", "frete", "impressao", "estoque", "digitais", "encomendas"],
    highlights: ["agendamentos", "clientes", "produtos"],
    dashboard: "servicos",
  },
  {
    id: "digital",
    label: "Produtos digitais e infoprodutos",
    description: "Vendas online sem estoque nem entrega.",
    examples: ["Curso online", "Mentoria", "E-book", "Consultoria", "Software"],
    hidden: [
      "pdv",
      "salao",
      "kds",
      "estoque",
      "entregas",
      "entregadores",
      "frete",
      "impressao",
      "agendamentos",
      "encomendas",
    ],
    highlights: ["digitais", "produtos", "pagamentos"],
    dashboard: "digital",
  },
  {
    id: "encomendas",
    label: "Encomendas e eventos",
    description: "Pedidos programados com data de entrega.",
    examples: ["Confeitaria", "Buffet", "Aluguel de equipamentos", "Decoração"],
    hidden: ["salao", "kds", "entregadores", "frete", "digitais"],
    highlights: ["encomendas", "agendamentos", "pedidos"],
    dashboard: "varejo",
  },
];

export function segmentGroupById(id: string | null | undefined): SegmentGroup | null {
  return SEGMENT_GROUPS.find((group) => group.id === id) ?? null;
}

/** Palavras-chave para sugerir o grupo a partir do segmento digitado no onboarding. */
const KEYWORDS: { group: SegmentGroupId; terms: string[] }[] = [
  {
    group: "alimentacao",
    terms: ["restaur", "hamb", "pizza", "açaí", "acai", "pastel", "marmit", "doce", "padar", "lanch", "bar", "food"],
  },
  { group: "conveniencia", terms: ["drogar", "farm", "mercad", "hortifruti", "açougue", "acougue", "pet"] },
  { group: "servicos", terms: ["barbe", "salão", "salao", "clínic", "clinic", "consult", "estét", "estet", "tosa"] },
  { group: "digital", terms: ["curso", "mentor", "e-book", "ebook", "software", "digital", "assinatura"] },
  { group: "encomendas", terms: ["confeit", "buffet", "aluguel", "decora", "encomend", "event"] },
  { group: "varejo", terms: ["roupa", "calçad", "calcad", "eletr", "utilidad", "tabac", "cosmét", "cosmet", "present", "loja"] },
];

export function suggestSegmentGroup(rawSegment: string | null | undefined): SegmentGroupId {
  const term = (rawSegment ?? "").trim().toLowerCase();
  if (!term) return "alimentacao";
  for (const rule of KEYWORDS) {
    if (rule.terms.some((keyword) => term.includes(keyword))) return rule.group;
  }
  return "varejo";
}

/** Lista de funções ativas sugerida para um grupo. */
export function defaultFeaturesFor(groupId: SegmentGroupId): FeatureKey[] {
  const group = segmentGroupById(groupId);
  const hidden = new Set<FeatureKey>(group?.hidden ?? []);
  return FEATURE_KEYS.filter((key) => ESSENTIAL_FEATURES.includes(key) || !hidden.has(key));
}

/** Garante que essenciais estejam sempre presentes e remove chaves desconhecidas. */
export function normalizeFeatures(values: readonly string[] | null | undefined, groupId?: string | null): FeatureKey[] {
  if (!values || values.length === 0) return defaultFeaturesFor(suggestOrDefault(groupId));
  const set = new Set(values.filter((value): value is FeatureKey => FEATURE_KEYS.includes(value as FeatureKey)));
  for (const key of ESSENTIAL_FEATURES) set.add(key);
  return FEATURE_KEYS.filter((key) => set.has(key));
}

function suggestOrDefault(groupId?: string | null): SegmentGroupId {
  return segmentGroupById(groupId)?.id ?? "alimentacao";
}

export function isFeatureEnabled(features: readonly FeatureKey[], key: FeatureKey): boolean {
  if (ESSENTIAL_FEATURES.includes(key)) return true;
  return features.includes(key);
}
