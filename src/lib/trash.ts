import { addDays } from 'date-fns'
import { Timestamp } from 'firebase/firestore'
import type { TrashEntityType } from '@/types'

export const TRASH_RETENTION_DAYS = 30

export const TRASH_CATEGORY_LABELS: Record<TrashEntityType, string> = {
  visit: 'Visitas',
  visitor: 'Visitantes',
  activity: 'Programação',
  task: 'Tarefas',
  financeItem: 'Financeiro',
  document: 'Documentos',
}

export const TRASH_ENTITY_COLLECTIONS: Record<TrashEntityType, string> = {
  visit: 'visits',
  visitor: 'visitors',
  activity: 'activities',
  task: 'tasks',
  financeItem: 'financeItems',
  document: 'documents',
}

export function isActiveRecord(data: Record<string, unknown>): boolean {
  return data.isDeleted !== true
}

export function getTrashExpiresAt(from = new Date()): Timestamp {
  return Timestamp.fromDate(addDays(from, TRASH_RETENTION_DAYS))
}

export function getTrashItemTitle(
  entityType: TrashEntityType,
  data: Record<string, unknown>,
): string {
  switch (entityType) {
    case 'visit':
      return String(data.title ?? 'Visita sem título')
    case 'visitor':
      return String(data.name ?? 'Visitante sem nome')
    case 'activity':
      return String(data.title ?? 'Atividade sem título')
    case 'task':
      return String(data.title ?? 'Tarefa sem título')
    case 'financeItem':
      return String(data.serviceName ?? 'Item financeiro')
    case 'document':
      return String(data.name ?? 'Documento')
    default:
      return 'Item excluído'
  }
}

export function getDaysUntilExpiry(expiresAt: unknown): number | null {
  if (!expiresAt || typeof expiresAt !== 'object' || !('toDate' in expiresAt)) {
    return null
  }
  const expires = (expiresAt as { toDate: () => Date }).toDate()
  const diff = expires.getTime() - Date.now()
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)))
}
