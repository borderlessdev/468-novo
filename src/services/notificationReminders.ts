import { differenceInCalendarDays, format, parseISO } from 'date-fns'
import { listActivities } from '@/services/activities'
import { listFinanceItemsByOwner } from '@/services/finance'
import {
  createNotification,
  listRecentDedupeKeys,
  type CreateNotificationInput,
} from '@/services/notifications'
import { listPendingTasks } from '@/services/tasks'
import { getUserNotificationPreferences } from '@/services/users'
import { listLinksForVisit } from '@/services/visitGuestLinks'
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
const SCAN_THROTTLE_MS = 15 * 60 * 1000
const CREATE_CONCURRENCY = 8

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

function throttleKey(userId: string) {
  return `reminderScan:${userId}`
}

function shouldSkipScan(userId: string): boolean {
  try {
    const raw = sessionStorage.getItem(throttleKey(userId))
    if (!raw) return false
    const last = Number(raw)
    return Number.isFinite(last) && Date.now() - last < SCAN_THROTTLE_MS
  } catch {
    return false
  }
}

function markScanDone(userId: string) {
  try {
    sessionStorage.setItem(throttleKey(userId), String(Date.now()))
  } catch {
    // ignore quota / private mode
  }
}

async function mapPool<T>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  if (items.length === 0) return
  let index = 0
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (index < items.length) {
      const current = items[index]
      index += 1
      await worker(current)
    }
  })
  await Promise.all(runners)
}

/**
 * Escaneia pendências e cria notificações no cliente.
 * Só roda com o app aberto (chamado pelo AppShell) — sem Cloud Functions.
 */
export async function scanDueReminders(
  orgId: string,
  userId: string,
  isPlatformAdmin: boolean,
  role: UserRole,
): Promise<void> {
  if (shouldSkipScan(userId)) return

  try {
    const isClient = role === 'client'
    const today = todayIso()
    const visits = await listVisits(orgId, userId, isPlatformAdmin, role)
    const visitMap = new Map(visits.map((v) => [v.id, v]))

    const [tasks, financeItems, preferences, knownDedupeKeys, pendingDocs] =
      await Promise.all([
        listPendingTasks(orgId, userId, isPlatformAdmin, role, visits),
        isClient
          ? Promise.resolve([])
          : listFinanceItemsByOwner(orgId, userId, isPlatformAdmin, role, visits),
        getUserNotificationPreferences(userId),
        listRecentDedupeKeys(userId),
        collectPendingDocuments(visits, isPlatformAdmin),
      ])

    const [activitiesByVisit, linksByVisit] = await Promise.all([
      Promise.all(
        visits.map(async (visit) => ({
          visit,
          activities: await listActivities(visit.id, visit.ownerId, isPlatformAdmin),
        })),
      ),
      isClient
        ? Promise.resolve([])
        : Promise.all(
            visits.map(async (visit) => ({
              visit,
              links: await listLinksForVisit(visit.id).catch(() => []),
            })),
          ),
    ])

    const candidates: CreateNotificationInput[] = []

    for (const task of tasks) {
      if (!task.dueDate) continue
      const days = daysUntil(task.dueDate)
      const visit = visitMap.get(task.visitId)
      const visitTitle = visit?.title ?? 'uma visita'

      if (!isClient && isOverdueTask(task, today)) {
        candidates.push({
          recipientId: userId,
          type: 'task_overdue',
          title: 'Tarefa atrasada',
          body: `"${task.title}" em ${visitTitle} — prazo ${format(parseISO(task.dueDate), 'dd/MM/yyyy')}`,
          visitId: task.visitId,
          entityId: task.id,
          href: `/planejamento?visita=${task.visitId}`,
          dedupeKey: `task_overdue:${task.id}:${task.dueDate}`,
        })
        continue
      }

      if (days < 0 || days > TASK_DUE_DAYS) continue
      candidates.push({
        recipientId: userId,
        type: 'task_due_soon',
        title: 'Tarefa com prazo próximo',
        body: `"${task.title}" em ${visitTitle} — ${formatDueLabel(days)}`,
        visitId: task.visitId,
        entityId: task.id,
        href: `/planejamento?visita=${task.visitId}`,
        dedupeKey: `task_due:${task.id}:${task.dueDate}`,
      })
    }

    for (const item of financeItems) {
      if (item.nfReceived) continue
      const visit = visitMap.get(item.visitId)
      const visitTitle = visit?.title ?? 'uma visita'

      if (isNfOverdue(item, today) && item.nfDueDate) {
        candidates.push({
          recipientId: userId,
          type: 'finance_nf_overdue',
          title: 'NF atrasada',
          body: `"${item.serviceName}" em ${visitTitle} — venceu em ${format(parseISO(item.nfDueDate), 'dd/MM/yyyy')}`,
          visitId: item.visitId,
          entityId: item.id,
          href: `/financeiro?visita=${item.visitId}`,
          dedupeKey: `finance_nf_overdue:${item.id}:${item.nfDueDate}`,
        })
        continue
      }

      if (!item.nfDueDate) continue
      const days = daysUntil(item.nfDueDate)
      if (days < 0 || days > NF_DUE_DAYS) continue
      candidates.push({
        recipientId: userId,
        type: 'finance_nf_due',
        title: 'NF com vencimento próximo',
        body: `"${item.serviceName}" em ${visitTitle} — ${formatDueLabel(days)}`,
        visitId: item.visitId,
        entityId: item.id,
        href: `/financeiro?visita=${item.visitId}`,
        dedupeKey: `finance_nf_due:${item.id}:${item.nfDueDate}`,
      })
    }

    for (const visit of visits) {
      if (!isVisitSoon(visit, today)) continue
      const days = daysUntil(visit.startDate)
      candidates.push({
        recipientId: userId,
        type: 'visit_soon',
        title: 'Visita próxima',
        body: `"${visit.title}" ${formatDueLabel(days).replace('vence', 'começa')}`,
        visitId: visit.id,
        entityId: visit.id,
        href: `/visitas/${visit.id}`,
        dedupeKey: `visit_soon:${visit.id}:${visit.startDate}`,
      })
    }

    for (const visitId of pendingDocumentVisitIds(pendingDocs)) {
      const visit = visitMap.get(visitId)
      candidates.push({
        recipientId: userId,
        type: 'document_pending',
        title: 'Documentos pendentes',
        body: `"${visit?.title ?? 'Uma visita'}" precisa de atenção na documentação`,
        visitId,
        entityId: visitId,
        href: `/visitas/${visitId}`,
        dedupeKey: `document_pending:${visitId}:${today}`,
      })
    }

    const now = Date.now()
    const in24h = now + 24 * 60 * 60 * 1000
    for (const { visit, activities } of activitiesByVisit) {
      for (const activity of activities) {
        const start = parseISO(activity.startTime).getTime()
        if (Number.isNaN(start) || start < now || start > in24h) continue
        candidates.push({
          recipientId: userId,
          type: 'activity_soon',
          title: 'Atividade nas próximas 24h',
          body: `"${activity.title}" em ${visit.title}`,
          visitId: visit.id,
          entityId: activity.id,
          href: `/programacao?visita=${visit.id}`,
          dedupeKey: `activity_soon:${activity.id}:${activity.startTime}`,
        })
      }
    }

    for (const { visit, links } of linksByVisit) {
      for (const link of links) {
        if (link.confirmationStatus === 'pending') continue
        const confirmed = link.confirmationStatus === 'confirmed'
        candidates.push({
          recipientId: userId,
          type: 'guest_confirmed',
          title: confirmed
            ? 'Visitante confirmou presença'
            : 'Visitante recusou o convite',
          body: `${link.visitorName} — ${visit.title}`,
          visitId: visit.id,
          entityId: link.id,
          href: `/visitas/${visit.id}`,
          dedupeKey: `guest_confirmed:${link.id}:${link.confirmationStatus}`,
        })
      }
    }

    const pendingCreates = candidates.filter(
      (candidate) => !candidate.dedupeKey || !knownDedupeKeys.has(candidate.dedupeKey),
    )

    await mapPool(pendingCreates, CREATE_CONCURRENCY, async (candidate) => {
      await createNotification(candidate, { preferences, knownDedupeKeys })
    })

    markScanDone(userId)
  } catch (error) {
    console.warn('Failed to scan due reminders', error)
  }
}
