import { getContractedValue, getRealizedValue } from '@/lib/financeMetrics'
import type { FinanceCostCategory, FinanceItem, RevenueItem } from '@/types'

/** Valor do custo aprovado que abate a receita (contratado; senão realizado). */
export function getApprovedCostAmount(item: FinanceItem): number {
  if (item.approvalStatus !== 'approved') return 0
  return getContractedValue(item) ?? getRealizedValue(item) ?? 0
}

export function sumRevenue(items: RevenueItem[]): number {
  return items.reduce((sum, item) => sum + (Number.isFinite(item.amount) ? item.amount : 0), 0)
}

export function sumApprovedCosts(items: FinanceItem[]): number {
  return items.reduce((sum, item) => sum + getApprovedCostAmount(item), 0)
}

/** Saldo = receitas − custos aprovados. Pode ficar negativo. */
export function revenueBalance(revenues: RevenueItem[], financeItems: FinanceItem[]): number {
  return sumRevenue(revenues) - sumApprovedCosts(financeItems)
}

export function resolveCostCategory(item: FinanceItem): FinanceCostCategory {
  if (item.costCategory) return item.costCategory
  return item.serviceType === 'despesa_tributavel'
    ? 'despesas_tributaveis'
    : 'servicos_terceiros'
}

export function sumTicketSales(item: RevenueItem): number {
  if (!item.ticketSales?.length) return 0
  return item.ticketSales.reduce(
    (sum, day) => sum + (Number.isFinite(day.amount) ? day.amount : 0),
    0,
  )
}
