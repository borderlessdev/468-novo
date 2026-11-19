import { sumContracted, sumRealized } from '@/lib/financeMetrics'
import { valeVpLabel } from '@/lib/valeVp'
import { VISIT_EVENT_KINDS, visitEventKindLabel } from '@/lib/visitEvent'
import type { FinanceItem, Visit, VisitEventKind } from '@/types'

export const OTHERS_KEY = '__others__'
export const NO_STATE_LABEL = 'Sem estado'
export const NO_VP_LABEL = 'Sem VP'
export const NO_KIND_KEY = '__sem_tipo__'

/** "VP - Sustentabilidade" → "Sustentabilidade" (rótulo curto dos gráficos). */
export function shortVpLabel(label: string): string {
  return label.replace(/^VP\s*-\s*/i, '').trim() || label
}

export type CountRow = { key: string; label: string; count: number }

export type CollapsedRow = CountRow & {
  /** Chaves originais representadas pela linha (várias em "Outros"). */
  memberKeys: string[]
}

/**
 * Resumo para cards compactos: as `topN` maiores + "Outros" agregado.
 * Linhas "fixas" (ex.: Sem estado / Sem VP) nunca entram em "Outros".
 * Entrada deve vir ordenada do maior para o menor.
 */
export function collapseRows(
  rows: CountRow[],
  topN: number,
  pinnedKeys: string[] = [],
): CollapsedRow[] {
  const pinned = rows.filter((row) => pinnedKeys.includes(row.key) && row.count > 0)
  const regular = rows.filter((row) => !pinnedKeys.includes(row.key))
  const withMembers = (row: CountRow): CollapsedRow => ({ ...row, memberKeys: [row.key] })

  if (regular.length <= topN) {
    return [...regular.map(withMembers), ...pinned.map(withMembers)]
  }

  const top = regular.slice(0, topN).map(withMembers)
  const rest = regular.slice(topN)
  const restCount = rest.reduce((sum, row) => sum + row.count, 0)
  const others: CollapsedRow[] =
    restCount > 0
      ? [
          {
            key: OTHERS_KEY,
            label: 'Outros',
            count: restCount,
            memberKeys: rest.filter((row) => row.count > 0).map((row) => row.key),
          },
        ]
      : []
  return [...top, ...others, ...pinned.map(withMembers)]
}

const MONTH_LABELS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']

export type MonthRow = { key: string; label: string; count: number; items: Visit[] }

/** Visitas por mês de início dentro do ciclo (fora do ciclo entra no primeiro/último mês). */
export function visitsByMonth(visits: Visit[], startIso: string, endIso: string): MonthRow[] {
  const startKey = startIso.slice(0, 7)
  const endKey = endIso.slice(0, 7)
  if (!/^\d{4}-\d{2}$/.test(startKey) || !/^\d{4}-\d{2}$/.test(endKey)) return []

  const keys: string[] = []
  let year = Number(startKey.slice(0, 4))
  let month = Number(startKey.slice(5, 7))
  while (`${year}-${String(month).padStart(2, '0')}` <= endKey && keys.length < 60) {
    keys.push(`${year}-${String(month).padStart(2, '0')}`)
    month += 1
    if (month > 12) {
      month = 1
      year += 1
    }
  }

  const longSpan = keys.length > 12
  const rows = new Map<string, MonthRow>(
    keys.map((key) => {
      const monthName = MONTH_LABELS[Number(key.slice(5, 7)) - 1] ?? key
      return [
        key,
        {
          key,
          label: longSpan ? `${monthName}/${key.slice(2, 4)}` : monthName,
          count: 0,
          items: [],
        },
      ]
    }),
  )

  for (const visit of visits) {
    let key = (visit.startDate ?? '').slice(0, 7)
    if (!key) continue
    if (key < startKey) key = startKey
    if (key > endKey) key = endKey
    const row = rows.get(key)
    if (!row) continue
    row.count += 1
    row.items.push(visit)
  }
  return [...rows.values()]
}

export type KindRow = { key: string; label: string; count: number; items: Visit[] }

export function visitsByEventKind(visits: Visit[]): KindRow[] {
  const map = new Map<string, KindRow>(
    VISIT_EVENT_KINDS.map((kind) => [
      kind,
      { key: kind, label: visitEventKindLabel(kind), count: 0, items: [] },
    ]),
  )
  for (const visit of visits) {
    const kind: VisitEventKind | null =
      visit.eventKind && map.has(visit.eventKind) ? visit.eventKind : null
    const key = kind ?? NO_KIND_KEY
    let row = map.get(key)
    if (!row) {
      row = { key, label: 'Sem tipo', count: 0, items: [] }
      map.set(key, row)
    }
    row.count += 1
    row.items.push(visit)
  }
  return [...map.values()].filter(
    (row) => row.count > 0 || (VISIT_EVENT_KINDS as string[]).includes(row.key),
  )
}

export type VpFinanceRow = { key: string; label: string; contracted: number; realized: number }

/** Contratado × gasto por VP (itens financeiros agrupados pela VP da visita). */
export function financeByVp(
  items: FinanceItem[],
  visitById: Map<string, Visit>,
): VpFinanceRow[] {
  const groups = new Map<string, FinanceItem[]>()
  for (const item of items) {
    const label = valeVpLabel(visitById.get(item.visitId)?.vp)
    const list = groups.get(label) ?? []
    list.push(item)
    groups.set(label, list)
  }
  return [...groups.entries()]
    .map(([label, list]) => ({
      key: label,
      label,
      contracted: sumContracted(list),
      realized: sumRealized(list),
    }))
    .filter((row) => row.contracted !== 0 || row.realized !== 0)
    .sort((a, b) => b.realized - a.realized || b.contracted - a.contracted)
}

/** R$ 1,5M · R$ 982,4k · R$ 850 */
export function formatCurrencyCompact(value: number): string {
  const sign = value < 0 ? '-' : ''
  const abs = Math.abs(value)
  const fmt = (n: number, suffix: string) =>
    `${sign}R$ ${n.toLocaleString('pt-BR', { maximumFractionDigits: 1, minimumFractionDigits: 0 })}${suffix}`
  if (abs >= 1_000_000) return fmt(abs / 1_000_000, 'M')
  if (abs >= 1_000) return fmt(abs / 1_000, 'k')
  return `${sign}R$ ${abs.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}`
}
