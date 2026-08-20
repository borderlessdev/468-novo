import { addDays, addMinutesToHm, normalizeHm, toActivityDateTime } from '@/lib/date'
import { writeActivityLog } from '@/services/activityLogs'
import { createActivity } from '@/services/activities'
import { createDocumentPlaceholder } from '@/services/documentPlaceholders'
import { getPlaybook } from '@/services/playbooks'
import { createTask, listTasks } from '@/services/tasks'

export interface ApplyPlaybookResult {
  playbookName: string
  tasks: number
  activities: number
  documents: number
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
