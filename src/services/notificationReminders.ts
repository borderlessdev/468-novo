import { differenceInCalendarDays, format, parseISO } from 'date-fns'
import { listActivities } from '@/services/activities'
import { listFinanceItemsByOwner } from '@/services/finance'
import {
  createNotification,
  notificationExistsByDedupeKey,
} from '@/services/notifications'
import { listPendingTasks } from '@/services/tasks'
import { listVisits } from '@/services/visits'
import {
  collectPendingDocuments,
  isNfOverdue,
  isOverdueTask,
  isVisitSoon,
  pendingDocumentVisitIds,
  todayIso,
} from '@/lib/operations'
import type { UserRole } from '@/types'

const TASK_DUE_DAYS = 3
const NF_DUE_DAYS = 7

function daysUntil(dateStr: string): number {
  const date = parseISO(dateStr)
  if (Number.isNaN(date.getTime())) return Infinity
  return differenceInCalendarDays(date, new Date())
}

function formatDueLabel(days: number): string {
  if (days <= 0) return 'vence hoje'
  if (days === 1) return 'vence amanhã'
  return `vence em ${days} dias`
}

/**
 * Escaneia pendências e cria notificações no cliente.
 * Só roda com o app aberto (chamado pelo AppShell) — sem Cloud Functions.
 */
export async function scanDueReminders(
  userId: string,
  isAdmin: boolean,
  role: UserRole,
): Promise<void> {
  try {
    const isClient = role === 'client'
    const today = todayIso()
    const [tasks, financeItems, visits] = await Promise.all([
      listPendingTasks(userId, isAdmin, role),
      isClient
        ? Promise.resolve([])
        : listFinanceItemsByOwner(userId, isAdmin, role),
      listVisits(userId, isAdmin, role),
    ])

    const visitMap = new Map(visits.map((v) => [v.id, v]))

    for (const task of tasks) {
      if (!task.dueDate) continue
      const days = daysUntil(task.dueDate)
      const visit = visitMap.get(task.visitId)
      const visitTitle = visit?.title ?? 'uma visita'

      if (!isClient && isOverdueTask(task, today)) {
        const dedupeKey = `task_overdue:${task.id}:${task.dueDate}`
        const exists = await notificationExistsByDedupeKey(userId, dedupeKey)
        if (!exists) {
          await createNotification({
            recipientId: userId,
            type: 'task_overdue',
            title: 'Tarefa atrasada',
            body: `"${task.title}" em ${visitTitle} — prazo ${format(parseISO(task.dueDate), 'dd/MM/yyyy')}`,
            visitId: task.visitId,
            entityId: task.id,
            href: `/planejamento?visita=${task.visitId}`,
            dedupeKey,
          })
        }
        continue
      }

      if (days < 0 || days > TASK_DUE_DAYS) continue

      const dedupeKey = `task_due:${task.id}:${task.dueDate}`
      const exists = await notificationExistsByDedupeKey(userId, dedupeKey)
      if (exists) continue

      await createNotification({
        recipientId: userId,
        type: 'task_due_soon',
        title: 'Tarefa com prazo próximo',
        body: `"${task.title}" em ${visitTitle} — ${formatDueLabel(days)}`,
        visitId: task.visitId,
        entityId: task.id,
        href: `/planejamento?visita=${task.visitId}`,
        dedupeKey,
      })
    }

    for (const item of financeItems) {
      if (item.nfReceived) continue
      const visit = visitMap.get(item.visitId)
      const visitTitle = visit?.title ?? 'uma visita'

      if (isNfOverdue(item, today) && item.nfDueDate) {
        const dedupeKey = `finance_nf_overdue:${item.id}:${item.nfDueDate}`
        const exists = await notificationExistsByDedupeKey(userId, dedupeKey)
        if (!exists) {
          await createNotification({
            recipientId: userId,
            type: 'finance_nf_overdue',
            title: 'NF atrasada',
            body: `"${item.serviceName}" em ${visitTitle} — venceu em ${format(parseISO(item.nfDueDate), 'dd/MM/yyyy')}`,
            visitId: item.visitId,
            entityId: item.id,
            href: `/financeiro?visita=${item.visitId}`,
            dedupeKey,
          })
        }
        continue
      }

      if (!item.nfDueDate) continue
      const days = daysUntil(item.nfDueDate)
      if (days < 0 || days > NF_DUE_DAYS) continue

      const dedupeKey = `finance_nf_due:${item.id}:${item.nfDueDate}`
      const exists = await notificationExistsByDedupeKey(userId, dedupeKey)
      if (exists) continue

      await createNotification({
        recipientId: userId,
        type: 'finance_nf_due',
        title: 'NF com vencimento próximo',
        body: `"${item.serviceName}" em ${visitTitle} — ${formatDueLabel(days)}`,
        visitId: item.visitId,
        entityId: item.id,
        href: `/financeiro?visita=${item.visitId}`,
        dedupeKey,
      })
    }

    for (const visit of visits) {
      if (!isVisitSoon(visit, today)) continue
      const dedupeKey = `visit_soon:${visit.id}:${visit.startDate}`
      const exists = await notificationExistsByDedupeKey(userId, dedupeKey)
      if (exists) continue
      const days = daysUntil(visit.startDate)
      await createNotification({
        recipientId: userId,
        type: 'visit_soon',
        title: 'Visita próxima',
        body: `"${visit.title}" ${formatDueLabel(days).replace('vence', 'começa')}`,
        visitId: visit.id,
        entityId: visit.id,
        href: `/visitas/${visit.id}`,
        dedupeKey,
      })
    }

    const pendingDocs = await collectPendingDocuments(visits, isAdmin)
    for (const visitId of pendingDocumentVisitIds(pendingDocs)) {
      const visit = visitMap.get(visitId)
      const dedupeKey = `document_pending:${visitId}:${today}`
      const exists = await notificationExistsByDedupeKey(userId, dedupeKey)
      if (exists) continue
      await createNotification({
        recipientId: userId,
        type: 'document_pending',
        title: 'Documentos pendentes',
        body: `"${visit?.title ?? 'Uma visita'}" precisa de atenção na documentação`,
        visitId,
        entityId: visitId,
        href: `/visitas/${visitId}`,
        dedupeKey,
      })
    }

    const now = Date.now()
    const in24h = now + 24 * 60 * 60 * 1000
    for (const visit of visits) {
      const activities = await listActivities(visit.id, visit.ownerId, isAdmin)
      for (const activity of activities) {
        const start = parseISO(activity.startTime).getTime()
        if (Number.isNaN(start) || start < now || start > in24h) continue
        const dedupeKey = `activity_soon:${activity.id}:${activity.startTime}`
        const exists = await notificationExistsByDedupeKey(userId, dedupeKey)
        if (exists) continue
        await createNotification({
          recipientId: userId,
          type: 'activity_soon',
          title: 'Atividade nas próximas 24h',
          body: `"${activity.title}" em ${visit.title}`,
          visitId: visit.id,
          entityId: activity.id,
          href: `/agenda?visita=${visit.id}`,
          dedupeKey,
        })
      }
    }
  } catch (error) {
    console.warn('Failed to scan due reminders', error)
  }
}
