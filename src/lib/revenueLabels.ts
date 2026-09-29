import type {
  FinanceCostCategory,
  RevenueNatureType,
  RevenueSourceType,
} from '@/types'

export const REVENUE_SOURCE_LABEL: Record<RevenueSourceType, string> = {
  ingressos: 'Venda de ingressos',
  apoio_areas: 'Apoio de áreas operacionais',
  recursos_proprios: 'Recursos próprios',
  patrocinio: 'Patrocínio',
}

export const REVENUE_NATURE_LABEL: Record<RevenueNatureType, string> = {
  centro_custos: 'Centro de custos',
  conta_contabil: 'Conta contábil',
  rubrica: 'Rubrica',
  dotacao_orcamentaria: 'Dotação orçamentária',
}

export const FINANCE_COST_CATEGORY_LABEL: Record<FinanceCostCategory, string> = {
  recursos_humanos: 'Recursos Humanos',
  servicos_terceiros: 'Serviços de terceiros',
  logistica: 'Serviços de logística',
  criacao_producao: 'Criação e produção de peças',
  a_e_b: 'A&B',
  comunicacao: 'Serviços de comunicação',
  custos_extras: 'Custos extras',
  despesas_tributaveis: 'Despesas tributáveis',
}

/** Categorias usadas em relatórios de eventos. */
export const EVENT_COST_CATEGORIES: FinanceCostCategory[] = [
  'recursos_humanos',
  'servicos_terceiros',
  'logistica',
  'criacao_producao',
  'a_e_b',
  'comunicacao',
]

/** Categorias usadas em relatórios de visitas. */
export const VISIT_COST_CATEGORIES: FinanceCostCategory[] = [
  'criacao_producao',
  'servicos_terceiros',
  'custos_extras',
  'despesas_tributaveis',
]

export const ALL_COST_CATEGORIES: FinanceCostCategory[] = [
  ...new Set([...EVENT_COST_CATEGORIES, ...VISIT_COST_CATEGORIES]),
]
