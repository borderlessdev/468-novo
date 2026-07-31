import { differenceInCalendarDays, parseISO } from 'date-fns'
import { listActivities } from '@/services/activities'
import { listFinanceItemsByOwner } from '@/services/finance'
import {
  createNotification,
  notificationExistsByDedupeKey,
} from '@/services/notifications'
import { listPendingTasks } from '@/services/tasks'
import { listVisits } from '@/services/visits'
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

export async function scanDueReminders(
  userId: string,
  isAdmin: boolean,
  role: UserRole,
): Promise<void> {
  try {
    const [tasks, financeItems, visits] = await Promise.all([
      listPendingTasks(userId, isAdmin, role),
      listFinanceItemsByOwner(userId, isAdmin, role),
      listVisits(userId, isAdmin, role),
    ])

    const visitMap = new Map(visits.map((v) => [v.id, v]))

    for (const task of tasks) {
      if (!task.dueDate) continue
      const days = daysUntil(task.dueDate)
      if (days < 0 || days > TASK_DUE_DAYS) continue

      const visit = visitMap.get(task.visitId)
      const visitTitle = visit?.title ?? 'uma visita'
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
      if (!item.nfDueDate || item.nfReceived) continue
      const days = daysUntil(item.nfDueDate)
      if (days < 0 || days > NF_DUE_DAYS) continue

      const visit = visitMap.get(item.visitId)
      const visitTitle = visit?.title ?? 'uma visita'
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
