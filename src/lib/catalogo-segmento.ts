/**
 * Presets de criação de catálogo por ramo de atividade.
 * Cada segmento tem abas, textos, tipo padrão de item e instruções de IA próprias,
 * para que um estúdio de infoprodutos não veja telas pensadas para delivery.
 */
import type { ProductKind } from "@/lib/catalog";
import type { SegmentGroupId } from "@/lib/painel-segmentos";

export const CATALOG_TABS = [
  "itens",
  "categorias",
  "grade",
  "colecoes",
  "ia",
  "precificacao",
  "montador",
  "agenda",
  "csv",
] as const;

export type CatalogTabKey = (typeof CATALOG_TABS)[number];

export interface CatalogSegmentPreset {
  /** Título e subtítulo da página de catálogo. */
  pageTitle: string;
  pageDescription: string;
  /** Abas exibidas, na ordem. */
  tabs: CatalogTabKey[];
  /** Rótulos específicos das abas quando o ramo pede outro nome. */
  tabLabels?: Partial<Record<CatalogTabKey, string>>;
  /** Tipo de item criado por padrão. */
  defaultKind: ProductKind;
  /** Tipos oferecidos na revisão da IA. */
  kinds: ProductKind[];
  /** Como o ramo chama um item (singular / plural). */
  itemNoun: string;
  itemNounPlural: string;
  /** Criação por foto faz sentido neste ramo? */
  allowPhoto: boolean;
  photoTitle: string;
  photoHint: string;
  textTitle: string;
  textHint: string;
  textPlaceholder: string;
  /** Instruções extras enviadas à IA. */
  aiInstructions: string;
  /** Mostra o campo de duração na revisão (serviços). */
  showDuration: boolean;
  /** Unidade padrão dos itens criados. */
  defaultUnit: string;
}

const PRESETS: Record<SegmentGroupId, CatalogSegmentPreset> = {
  alimentacao: {
    pageTitle: "Cardápio",
    pageDescription: "Pratos, bebidas, combos e adicionais do seu delivery ou salão.",
    tabs: ["itens", "categorias", "ia", "montador", "precificacao", "csv"],
    tabLabels: { itens: "Itens do cardápio", ia: "Criar cardápio com IA" },
    defaultKind: "product",
    kinds: ["product", "combo"],
    itemNoun: "item do cardápio",
    itemNounPlural: "itens do cardápio",
    allowPhoto: true,
    photoTitle: "Fotografar cardápio",
    photoHint:
      "Fotografe o cardápio impresso, a tabela de preços ou o quadro da parede. A IA identifica prato, preço e seção.",
    textTitle: "Colar cardápio em texto",
    textHint: "Cole a lista do WhatsApp ou do PDF. Ex.: “Pizza calabresa 54,90”.",
    textPlaceholder: "Pizzas\nCalabresa 54,90\nMussarela 49,90\n\nBebidas\nCoca 2L 12,00",
    aiInstructions:
      "É um cardápio de alimentação. Use kind product para pratos e bebidas e combo para promoções fechadas. categoryName é a seção do cardápio (Pizzas, Lanches, Bebidas, Sobremesas).",
    showDuration: false,
    defaultUnit: "un",
  },
  varejo: {
    pageTitle: "Catálogo da loja",
    pageDescription:
      "Produtos com marca, código de barras, custo e margem, grade de variações por SKU, coleções e etiquetas.",
    tabs: ["itens", "categorias", "grade", "colecoes", "ia", "precificacao", "csv"],
    tabLabels: { itens: "Produtos", ia: "Criar catálogo com IA" },
    defaultKind: "product",
    kinds: ["product", "combo"],
    itemNoun: "produto",
    itemNounPlural: "produtos",
    allowPhoto: true,
    photoTitle: "Fotografar produtos ou lista",
    photoHint:
      "Fotografe a prateleira, a etiqueta de gôndola ou a planilha de preços. A IA reconhece nome, preço e categoria.",
    textTitle: "Colar lista de produtos",
    textHint: "Cole a lista do fornecedor ou digite livremente. Ex.: “Camiseta básica preta 79,90”.",
    textPlaceholder: "Camisetas\nBásica preta 79,90\nEstampada 89,90\n\nCalçados\nTênis casual 199,90",
    aiInstructions:
      "É um catálogo de varejo físico/online. Use kind product (combo apenas para kits fechados). Comece o nome pela marca/fabricante quando ela aparecer (ex.: Nike Camiseta Dri-Fit). Quando houver tamanho ou cor, mantenha no nome e liste em tags. unit em un, pç, cx ou kg conforme a venda. categoryName é o departamento (Camisetas, Calçados, Acessórios).",
    showDuration: false,
    defaultUnit: "un",
  },
  conveniencia: {
    pageTitle: "Catálogo de itens",
    pageDescription: "Itens de alto giro, grade de embalagens e controle de preços.",
    tabs: ["itens", "categorias", "grade", "ia", "precificacao", "csv"],
    tabLabels: { itens: "Itens", ia: "Criar catálogo com IA" },
    defaultKind: "product",
    kinds: ["product", "combo"],
    itemNoun: "item",
    itemNounPlural: "itens",
    allowPhoto: true,
    photoTitle: "Fotografar prateleira ou nota",
    photoHint:
      "Fotografe a prateleira, a nota de compra ou a tabela de preços. A IA identifica item, embalagem e preço.",
    textTitle: "Colar lista de itens",
    textHint: "Cole a lista do fornecedor. Ex.: “Dipirona 500mg 20cp 12,90”.",
    textPlaceholder: "Medicamentos\nDipirona 500mg 20cp 12,90\n\nHigiene\nSabonete 90g 3,50",
    aiInstructions:
      "É um mix de conveniência/saúde. Use kind product. Registre a unidade de venda em unit (un, kg, l, cx, pct) quando aparecer.",
    showDuration: false,
    defaultUnit: "un",
  },
  servicos: {
    pageTitle: "Catálogo de serviços",
    pageDescription: "Serviços, duração, profissionais e pacotes atendidos pela agenda.",
    tabs: ["itens", "categorias", "agenda", "ia", "precificacao", "csv"],
    tabLabels: {
      itens: "Serviços",
      categorias: "Especialidades",
      ia: "Criar serviços com IA",
      agenda: "Agenda e profissionais",
    },
    defaultKind: "service",
    kinds: ["service", "subscription", "combo"],
    itemNoun: "serviço",
    itemNounPlural: "serviços",
    allowPhoto: true,
    photoTitle: "Fotografar tabela de serviços",
    photoHint:
      "Fotografe a tabela de preços do salão, clínica ou barbearia. A IA identifica serviço, duração e valor.",
    textTitle: "Colar lista de serviços",
    textHint: "Cole ou digite sua tabela. Ex.: “Corte masculino 45 min 50,00”.",
    textPlaceholder:
      "Cabelo\nCorte masculino 45 min 50,00\nBarba 30 min 35,00\n\nEstética\nLimpeza de pele 60 min 120,00",
    aiInstructions:
      "É uma tabela de serviços com hora marcada. Use SEMPRE kind service (use subscription apenas para planos mensais explícitos e combo para pacotes fechados). Quando houver duração em minutos ou horas, devolva em durationMinutes. unit deve ser 'hora' quando cobrado por hora, senão 'un'. categoryName é a especialidade (Cabelo, Barba, Estética, Odontologia).",
    showDuration: true,
    defaultUnit: "un",
  },
  digital: {
    pageTitle: "Catálogo digital",
    pageDescription: "Cursos, e-books, mentorias e assinaturas entregues online.",
    tabs: ["itens", "categorias", "csv"],
    tabLabels: { itens: "Infoprodutos", categorias: "Trilhas e coleções" },
    defaultKind: "digital",
    kinds: ["digital", "subscription", "combo", "service"],
    itemNoun: "infoproduto",
    itemNounPlural: "infoprodutos",
    allowPhoto: false,
    photoTitle: "Enviar print da oferta",
    photoHint: "Envie o print da página de vendas ou da grade de módulos.",
    textTitle: "Descrever seus infoprodutos",
    textHint:
      "Cole a estrutura do curso, a lista de e-books ou descreva a oferta. A IA monta nome, promessa e preço.",
    textPlaceholder:
      "Curso completo de confeitaria 497,00 (de 697,00)\nE-book 30 receitas 47,00\nMentoria individual mensal 890,00",
    aiInstructions:
      "É um catálogo de produtos digitais/infoprodutos. Use kind digital para arquivos, cursos e e-books; subscription para acesso recorrente (mensal, anual); combo para bundles de vários produtos. Nunca use kind product. unit sempre 'un'. description deve ser uma promessa curta de resultado. categoryName é a trilha ou coleção (Cursos, E-books, Mentorias).",
    showDuration: false,
    defaultUnit: "un",
  },
  encomendas: {
    pageTitle: "Catálogo de encomendas",
    pageDescription: "Itens sob encomenda, pacotes de eventos e personalizações.",
    tabs: ["itens", "categorias", "ia", "precificacao", "agenda", "csv"],
    tabLabels: { itens: "Encomendas", ia: "Criar encomendas com IA", agenda: "Capacidade e equipe" },
    defaultKind: "preorder",
    kinds: ["preorder", "product", "combo", "service"],
    itemNoun: "item sob encomenda",
    itemNounPlural: "itens sob encomenda",
    allowPhoto: true,
    photoTitle: "Fotografar tabela de encomendas",
    photoHint: "Fotografe seu catálogo de bolos, kits ou pacotes de evento com os valores.",
    textTitle: "Colar tabela de encomendas",
    textHint: "Cole sua tabela. Ex.: “Bolo 2 andares 380,00 (por kg)”.",
    textPlaceholder: "Bolos\nAndar simples kg 120,00\n2 andares 380,00\n\nKits festa\nKit 50 pessoas 890,00",
    aiInstructions:
      "É um catálogo de encomendas com data futura. Use kind preorder para itens produzidos sob demanda e combo para kits fechados. Registre unit como kg quando o preço for por quilo.",
    showDuration: false,
    defaultUnit: "un",
  },
};

export function catalogPreset(segment: SegmentGroupId | undefined | null): CatalogSegmentPreset {
  return PRESETS[segment ?? "alimentacao"] ?? PRESETS.alimentacao;
}

const BASE_TAB_LABEL: Record<CatalogTabKey, string> = {
  itens: "Itens",
  categorias: "Categorias",
  grade: "Grade e etiquetas",
  colecoes: "Coleções",
  ia: "Criar com IA",
  precificacao: "Precificação",
  montador: "Montador",
  agenda: "Agenda e equipe",
  csv: "Importar / exportar",
};

export function catalogTabLabel(preset: CatalogSegmentPreset, tab: CatalogTabKey): string {
  return preset.tabLabels?.[tab] ?? BASE_TAB_LABEL[tab];
}
