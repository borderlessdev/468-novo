import type { FinanceItem } from '@/types'
import { isNfAttention, isNfOverdue, todayIso } from '@/lib/operations'

/** Limiar de alerta para desvio contratado vs previsto (10%). */
export const FINANCE_DEVIATION_WARN_RATIO = 0.1

/** Horizonte em dias para NF "a vencer" (mesmo da Central). */
export const FINANCE_NF_ATTENTION_DAYS = 7

/**
 * previsto: menor valor entre budget1/2/3 existentes.
 * Despesa tributável não tem orçamento → sem previsto.
 * contratado: serviceValue.
 * realizado: actualValue; se ausente e NF recebida, usa serviceValue; senão undefined.
 */
export function getPlannedValue(item: FinanceItem): number | undefined {
  if (item.serviceType === 'despesa_tributavel') return undefined
  const budgets = [item.budget1, item.budget2, item.budget3].filter(
    (value): value is number => value != null && !Number.isNaN(value),
  )
  if (budgets.length === 0) return undefined
  return Math.min(...budgets)
}

export function getContractedValue(item: FinanceItem): number | undefined {
  return item.serviceValue != null && !Number.isNaN(item.serviceValue)
    ? item.serviceValue
    : undefined
}

export function getRealizedValue(item: FinanceItem): number | undefined {
  if (item.actualValue != null && !Number.isNaN(item.actualValue)) {
    return item.actualValue
  }
  if (item.nfReceived) {
    return getContractedValue(item)
  }
  return undefined
}

export function deviationContractedVsPlanned(item: FinanceItem): number | undefined {
  const planned = getPlannedValue(item)
  const contracted = getContractedValue(item)
  if (planned == null || planned <= 0 || contracted == null) return undefined
  return (contracted - planned) / planned
}

export function deviationRealizedVsContracted(item: FinanceItem): number | undefined {
  const contracted = getContractedValue(item)
  const realized = getRealizedValue(item)
  if (contracted == null || contracted <= 0 || realized == null) return undefined
  return (realized - contracted) / contracted
}

export function isAbovePlanned(item: FinanceItem): boolean {
  const planned = getPlannedValue(item)
  const contracted = getContractedValue(item)
  return planned != null && contracted != null && contracted > planned
}

export function isRealizedOverrun(item: FinanceItem): boolean {
  const contracted = getContractedValue(item)
  const realized = getRealizedValue(item)
  return contracted != null && realized != null && realized > contracted
}

export function overrunAmount(item: FinanceItem): number {
  const contracted = getContractedValue(item) ?? 0
  const realized = getRealizedValue(item) ?? 0
  const delta = realized - contracted
  return delta > 0 ? delta : 0
}

export function sumPlanned(items: FinanceItem[]): number {
  return items.reduce((sum, item) => sum + (getPlannedValue(item) ?? 0), 0)
}

export function sumContracted(items: FinanceItem[]): number {
  return items.reduce((sum, item) => sum + (getContractedValue(item) ?? 0), 0)
}

export function sumRealized(items: FinanceItem[]): number {
  return items.reduce((sum, item) => sum + (getRealizedValue(item) ?? 0), 0)
}

export function sumOverruns(items: FinanceItem[]): number {
  return items.reduce((sum, item) => sum + overrunAmount(item), 0)
}

export function countPendingApproval(items: FinanceItem[]): number {
  return items.filter((item) => (item.approvalStatus ?? 'pending') === 'pending').length
}

export function countOverdueNf(items: FinanceItem[], today = todayIso()): number {
  return items.filter((item) => isNfOverdue(item, today)).length
}

export type FinancePendingTag =
  | 'sem_aprovacao'
  | 'nf_vencida'
  | 'nf_a_vencer'
  | 'desvio'

export function financePendingTags(
  item: FinanceItem,
  today = todayIso(),
): FinancePendingTag[] {
  const tags: FinancePendingTag[] = []
  if ((item.approvalStatus ?? 'pending') === 'pending') tags.push('sem_aprovacao')
  if (isNfOverdue(item, today)) tags.push('nf_vencida')
  else if (isNfAttention(item, today, FINANCE_NF_ATTENTION_DAYS) && !item.nfReceived) {
    tags.push('nf_a_vencer')
  }
  const deviation = deviationContractedVsPlanned(item)
  if (
    item.serviceType !== 'despesa_tributavel' &&
    deviation != null &&
    deviation > FINANCE_DEVIATION_WARN_RATIO
  ) {
    tags.push('desvio')
  }
  return tags
}

export function formatDeviationPercent(ratio: number | undefined): string {
  if (ratio == null || Number.isNaN(ratio)) return '—'
  const percent = ratio * 100
  const sign = percent > 0 ? '+' : ''
  return `${sign}${percent.toFixed(0)}%`
}
