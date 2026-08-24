import { addDays, addMinutesToHm, diffDays, normalizeHm, toActivityDateTime } from '@/lib/date'
import { writeActivityLog } from '@/services/activityLogs'
import { createActivity, listActivities } from '@/services/activities'
import { createDocumentPlaceholder, listDocumentPlaceholders } from '@/services/documentPlaceholders'
import { listDocuments } from '@/services/documents'
import { createPlaybook, getPlaybook } from '@/services/playbooks'
import { createTask, listTasks } from '@/services/tasks'
import { getVisit } from '@/services/visits'
import type { PlaybookItem, PlaybookPhase } from '@/types'

export interface ApplyPlaybookResult {
  playbookName: string
  tasks: number
  activities: number
  documents: number
}

function resolvePhase(phase?: PlaybookPhase): PlaybookPhase {
  return phase ?? 'durante'
}

function activityStartHm(startTime: string): string {
  if (startTime.includes('T')) {
    const timePart = startTime.split('T')[1] ?? ''
    return normalizeHm(timePart.slice(0, 5))
  }
  return normalizeHm(startTime)
}

function activityDurationMinutes(startTime: string, endTime: string): number {
  const start = activityStartHm(startTime)
  const end = activityStartHm(endTime)
  const [sh, sm] = start.split(':').map((part) => Number(part) || 0)
  const [eh, em] = end.split(':').map((part) => Number(part) || 0)
  const diff = eh * 60 + em - (sh * 60 + sm)
  return diff > 0 ? diff : 60
}

export async function applyPlaybookToVisit(input: {
  playbookId: string
  visitId: string
  ownerId: string
  startDate: string
  isAdmin: boolean
  actorId: string
  actorName?: string
}): Promise<ApplyPlaybookResult> {
  const playbook = await getPlaybook(input.playbookId)
  if (!playbook) throw new Error('Playbook não encontrado')

  const existingTasks = await listTasks(input.visitId, input.ownerId, input.isAdmin)
  const orderBase =
    existingTasks.length === 0
      ? 0
      : Math.max(...existingTasks.map((task) => task.order)) + 1

  const items = [...playbook.items].sort((a, b) => a.order - b.order)
  let taskCount = 0
  let activityCount = 0
  let documentCount = 0
  let taskIndex = 0

  for (const item of items) {
    const date = addDays(input.startDate, item.offsetDays)

    if (item.kind === 'task') {
      await createTask(input.ownerId, {
        visitId: input.visitId,
        title: item.title,
        status: 'backlog',
        order: orderBase + taskIndex,
        dueDate: date,
        assigneeName: item.assigneeName,
        phase: item.phase,
      })
      taskIndex += 1
      taskCount += 1
      continue
    }

    if (item.kind === 'activity') {
      const startHm = normalizeHm(item.startTime)
      const duration = item.durationMinutes && item.durationMinutes > 0 ? item.durationMinutes : 60
      const endHm = addMinutesToHm(startHm, duration)
      await createActivity(input.ownerId, {
        visitId: input.visitId,
        title: item.title,
        description: item.description,
        location: item.location,
        date,
        startTime: toActivityDateTime(date, startHm),
        endTime: toActivityDateTime(date, endHm),
        responsibleNames: item.assigneeName ? [item.assigneeName] : [],
        visitorNames: [],
        phase: item.phase,
      })
      activityCount += 1
      continue
    }

    await createDocumentPlaceholder(input.ownerId, {
      visitId: input.visitId,
      title: item.title,
      category: item.documentCategory ?? 'outro',
      phase: item.phase,
    })
    documentCount += 1
  }

  await writeActivityLog({
    entityType: 'visit',
    entityId: input.visitId,
    visitId: input.visitId,
    action: 'apply_playbook',
    summary: `Playbook "${playbook.name}" aplicado (${taskCount} tarefas, ${activityCount} atividades, ${documentCount} documentos)`,
    actorId: input.actorId,
    actorName: input.actorName,
  })

  return {
    playbookName: playbook.name,
    tasks: taskCount,
    activities: activityCount,
    documents: documentCount,
  }
}

export async function saveVisitAsPlaybook(
  visitId: string,
  ownerId: string,
  isAdmin: boolean,
): Promise<string> {
  const visit = await getVisit(visitId)
  if (!visit) throw new Error('Visita não encontrada')

  const [tasks, activities, placeholders, documents] = await Promise.all([
    listTasks(visitId, visit.ownerId, isAdmin),
    listActivities(visitId, visit.ownerId, isAdmin),
    listDocumentPlaceholders(visitId, visit.ownerId, isAdmin),
    listDocuments(visitId, visit.ownerId, isAdmin),
  ])

  const items: PlaybookItem[] = []
  let order = 0

  for (const task of tasks) {
    items.push({
      id: crypto.randomUUID(),
      kind: 'task',
      phase: resolvePhase(task.phase),
      title: task.title,
      offsetDays: task.dueDate ? diffDays(visit.startDate, task.dueDate) : 0,
      assigneeName: task.assigneeName,
      order: order++,
    })
  }

  for (const activity of activities) {
    items.push({
      id: crypto.randomUUID(),
      kind: 'activity',
      phase: resolvePhase(activity.phase),
      title: activity.title,
      description: activity.description,
      location: activity.location,
      offsetDays: activity.date ? diffDays(visit.startDate, activity.date) : 0,
      startTime: activityStartHm(activity.startTime),
      durationMinutes: activityDurationMinutes(activity.startTime, activity.endTime),
      assigneeName: activity.responsibleNames[0],
      order: order++,
    })
  }

  for (const placeholder of placeholders) {
    items.push({
      id: crypto.randomUUID(),
      kind: 'document',
      phase: resolvePhase(placeholder.phase),
      title: placeholder.title,
      offsetDays: 0,
      documentCategory: placeholder.category,
      order: order++,
    })
  }

  for (const document of documents) {
    items.push({
      id: crypto.randomUUID(),
      kind: 'document',
      phase: 'durante',
      title: document.name,
      offsetDays: 0,
      documentCategory: document.category,
      order: order++,
    })
  }

  return createPlaybook(ownerId, {
    name: `Playbook: ${visit.title}`,
    visitType: visit.company || 'Geral',
    description: visit.objective,
    items,
  })
}
