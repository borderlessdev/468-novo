import { addDays, format } from 'date-fns'
import { listDocumentPlaceholders } from '@/services/documentPlaceholders'
import { listDocuments } from '@/services/documents'
import type { DocumentPlaceholder, FinanceItem, Task, Visit, VisitDocument } from '@/types'

export function todayIso(reference = new Date()): string {
  return format(reference, 'yyyy-MM-dd')
}

export function addDaysIso(days: number, reference = new Date()): string {
  return format(addDays(reference, days), 'yyyy-MM-dd')
}

export function isOverdueTask(task: Task, today = todayIso()): boolean {
  return task.status !== 'completed' && Boolean(task.dueDate) && task.dueDate! < today
}

export function isUpcomingVisit(visit: Visit, today = todayIso(), horizon = 7): boolean {
  if (visit.status === 'cancelada') return false
  const until = addDaysIso(horizon, new Date(`${today}T00:00:00`))
  return visit.startDate >= today && visit.startDate <= until
}

export function isVisitSoon(visit: Visit, today = todayIso()): boolean {
  if (visit.status !== 'planejamento' && visit.status !== 'em_andamento') return false
  const until = addDaysIso(2, new Date(`${today}T00:00:00`))
  return visit.startDate >= today && visit.startDate <= until
}

export function isNfAttention(item: FinanceItem, today = todayIso(), horizon = 7): boolean {
  if (item.nfReceived) return false
  if (item.nfDueDate) {
    const until = addDaysIso(horizon, new Date(`${today}T00:00:00`))
    return item.nfDueDate <= until
  }
  return item.serviceValue != null && item.serviceValue > 0
}

export function isNfOverdue(item: FinanceItem, today = todayIso()): boolean {
  return !item.nfReceived && Boolean(item.nfDueDate) && item.nfDueDate! < today
}

export type PendingDocumentRow = {
  visitId: string
  visitTitle: string
  label: string
  kind: 'placeholder' | 'no_documents'
  placeholder?: DocumentPlaceholder
}

/**
 * Placeholder sem arquivo: casa 1:1 com documento da mesma categoria.
 * Não usa título (matching frágil). Um upload cobre um placeholder da categoria.
 */
export function unmatchedPlaceholders(
  placeholders: DocumentPlaceholder[],
  documents: VisitDocument[],
): DocumentPlaceholder[] {
  const remaining = [...documents]
  return placeholders.filter((placeholder) => {
    const index = remaining.findIndex((doc) => doc.category === placeholder.category)
    if (index === -1) return true
    remaining.splice(index, 1)
    return false
  })
}

/**
 * Critério de documento pendente:
 * 1) Se a visita tem placeholders de playbook, só entram os ainda sem arquivo
 *    (categoria sem documento correspondente).
 * 2) Senão, visitas em planejamento/em_andamento com ZERO documentos na coleção documents.
 */
export async function collectPendingDocuments(
  visits: Visit[],
  isAdmin: boolean,
): Promise<PendingDocumentRow[]> {
  const active = visits.filter(
    (visit) => visit.status === 'planejamento' || visit.status === 'em_andamento',
  )
  const groups = await Promise.all(
    active.map(async (visit) => {
      const [placeholders, documents] = await Promise.all([
        listDocumentPlaceholders(visit.id, visit.ownerId, isAdmin),
        listDocuments(visit.id, visit.ownerId, isAdmin),
      ])
      if (placeholders.length > 0) {
        return unmatchedPlaceholders(placeholders, documents).map((placeholder) => ({
          visitId: visit.id,
          visitTitle: visit.title,
          label: placeholder.title,
          kind: 'placeholder' as const,
          placeholder,
        }))
      }
      if (documents.length === 0) {
        return [
          {
            visitId: visit.id,
            visitTitle: visit.title,
            label: 'Nenhum documento enviado',
            kind: 'no_documents' as const,
          },
        ]
      }
      return [] as PendingDocumentRow[]
    }),
  )
  return groups.flat()
}

export function pendingDocumentVisitIds(rows: PendingDocumentRow[]): string[] {
  return [...new Set(rows.map((row) => row.visitId))]
}
