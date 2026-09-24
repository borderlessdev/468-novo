import type { Visit, VisitEventKind, VisitEventScope, VisitVipSubtype } from '@/types'

export const VISIT_EVENT_KINDS: VisitEventKind[] = [
  'visita_vip',
  'comunidade_prioritaria',
  'visita_comunidade',
  'evento',
]

export const VISIT_VIP_SUBTYPES: VisitVipSubtype[] = [
  'institucional',
  'comercial',
  'investidores',
  'governamental',
  'imprensa',
  'influenciadores',
]

export const VISIT_EVENT_SCOPES: VisitEventScope[] = ['interno', 'externo']

export type ExperienceTab = 'visitas' | 'eventos' | 'periodo'

export const VISIT_EXPERIENCE_KINDS: VisitEventKind[] = [
  'visita_vip',
  'comunidade_prioritaria',
  'visita_comunidade',
]

export function kindsForExperienceTab(tab: ExperienceTab): VisitEventKind[] {
  if (tab === 'eventos') return ['evento']
  if (tab === 'periodo') return VISIT_EVENT_KINDS
  return VISIT_EXPERIENCE_KINDS
}

/** Experiência cruza o intervalo (início/fim inclusivos, ISO yyyy-MM-dd). */
export function visitOverlapsPeriod(
  visit: Pick<Visit, 'startDate' | 'endDate'>,
  startIso: string,
  endIso: string,
) {
  const visitEnd = visit.endDate || visit.startDate
  return Boolean(visit.startDate && visitEnd >= startIso && visit.startDate <= endIso)
}

export function visitsPeriodHref(startIso: string, endIso: string) {
  const params = new URLSearchParams({
    tab: 'periodo',
    de: startIso,
    ate: endIso,
  })
  return `/visitas?${params.toString()}`
}

export function visitEventKindLabel(kind?: VisitEventKind | null): string {
  switch (kind) {
    case 'visita_vip':
      return 'Visita VIP'
    case 'comunidade_prioritaria':
      return 'Comunidade Prioritária'
    case 'visita_comunidade':
      return 'Visita Comunidade'
    case 'evento':
      return 'Evento'
    default:
      return 'Não classificado'
  }
}

export function visitVipSubtypeLabel(subtype?: VisitVipSubtype | null): string {
  switch (subtype) {
    case 'institucional':
      return 'Institucional'
    case 'comercial':
      return 'Comercial'
    case 'investidores':
      return 'Investidores'
    case 'governamental':
      return 'Governamental'
    case 'imprensa':
      return 'Imprensa'
    case 'influenciadores':
      return 'Influenciadores'
    default:
      return '—'
  }
}

export function visitEventScopeLabel(scope?: VisitEventScope | null): string {
  switch (scope) {
    case 'interno':
      return 'Interno'
    case 'externo':
      return 'Externo'
    default:
      return '—'
  }
}

/** Rótulo completo para listagens (ex.: "Visita VIP · Comercial"). */
export function visitEventLabel(visit: Pick<Visit, 'eventKind' | 'vipSubtype' | 'eventScope'>): string {
  if (!visit.eventKind) return visitEventKindLabel(null)
  if (visit.eventKind === 'visita_vip') {
    const sub = visitVipSubtypeLabel(visit.vipSubtype)
    return sub !== '—' ? `${visitEventKindLabel(visit.eventKind)} · ${sub}` : visitEventKindLabel(visit.eventKind)
  }
  if (visit.eventKind === 'evento') {
    const scope = visitEventScopeLabel(visit.eventScope)
    return scope !== '—' ? `${visitEventKindLabel(visit.eventKind)} · ${scope}` : visitEventKindLabel(visit.eventKind)
  }
  return visitEventKindLabel(visit.eventKind)
}
