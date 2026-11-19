import { isGeneratedPvToken } from '@/lib/pvNumber'
import { VALE_VPS, valeVpLabel } from '@/lib/valeVp'
import { visitOverlapsPeriod } from '@/lib/visitEvent'
import type { Visit } from '@/types'

/** Colunas extras exportadas para organizações Vale (VP, Público, País etc.). */
export const VALE_EXPORT_HEADERS = [
  'PV',
  'VP solicitante',
  'Público',
  'País do visitante',
  'Ponto focal solicitante',
  'Responsável pela aprovação',
  'Plantio',
  'Quem vai plantar',
  'Informações pós-visita',
] as const

export function valeExportColumns(visit: Visit): string[] {
  return [
    visit.pvNumber && !isGeneratedPvToken(visit.pvNumber) ? visit.pvNumber : '',
    visit.vp ?? '',
    visit.vipAudience ?? '',
    visit.visitorCountry ?? '',
    visit.requesterContact ?? '',
    visit.approverName ?? '',
    visit.hasPlanting ? 'Sim' : 'Não',
    visit.hasPlanting ? (visit.planterName ?? '') : '',
    visit.postVisitInfo ?? '',
  ]
}

/** Linhas "Campo: valor" (só as preenchidas) para PDFs de relatórios da Vale. */
export function valeDetailLines(visit: Visit): string[] {
  const values = valeExportColumns(visit)
  return VALE_EXPORT_HEADERS.map((header, index) => ({ header, value: values[index] }))
    .filter((item) => item.value.trim() !== '')
    .map((item) => `${item.header}: ${item.value}`)
}

/** Visitas do ciclo que contam na operação (mesma regra do dashboard: sem canceladas). */
export function operationalVisitsInCycle(
  visits: Visit[],
  startIso: string,
  endIso: string,
): Visit[] {
  return visits.filter(
    (visit) =>
      visit.status !== 'cancelada' && visitOverlapsPeriod(visit, startIso, endIso),
  )
}

export type DistributionRow = {
  label: string
  total: number
  realized: number
  pending: number
}

function distribute(
  visits: Visit[],
  keyOf: (visit: Visit) => string,
  seedKeys: readonly string[] = [],
): DistributionRow[] {
  const map = new Map<string, DistributionRow>()
  for (const key of seedKeys) {
    map.set(key, { label: key, total: 0, realized: 0, pending: 0 })
  }
  for (const visit of visits) {
    const key = keyOf(visit)
    const row = map.get(key) ?? { label: key, total: 0, realized: 0, pending: 0 }
    row.total += 1
    if (visit.status === 'concluida') row.realized += 1
    else row.pending += 1
    map.set(key, row)
  }
  return [...map.values()].sort(
    (a, b) => b.total - a.total || a.label.localeCompare(b.label, 'pt-BR'),
  )
}

export function visitsByState(visits: Visit[]): DistributionRow[] {
  return distribute(visits, (visit) => visit.state?.trim() || 'Sem estado')
}

export function visitsByVp(visits: Visit[]): DistributionRow[] {
  return distribute(visits, (visit) => valeVpLabel(visit.vp), VALE_VPS).filter(
    (row) => row.total > 0 || (VALE_VPS as readonly string[]).includes(row.label),
  )
}
