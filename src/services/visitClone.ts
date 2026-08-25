import { createActivity, listActivities } from '@/services/activities'
import { createTask, listTasks } from '@/services/tasks'
import {
  createVisit,
  getVisit,
} from '@/services/visits'
import {
  linkVisitorToVisit,
  listVisitVisitors,
} from '@/services/visitVisitors'
import { addDays, diffDays } from '@/lib/date'
import type { Visit } from '@/types'

async function cloneVisitChildren(
  sourceId: string,
  sourceOwnerId: string,
  newVisitId: string,
  ownerId: string,
  options?: { shiftDates?: { startDate: string; endDate: string } },
): Promise<void> {
  const [links, activities, tasks] = await Promise.all([
    listVisitVisitors(sourceId, sourceOwnerId, false),
    listActivities(sourceId, sourceOwnerId, false),
    listTasks(sourceId, sourceOwnerId, false),
  ])

  const dateOffsetDays =
    options?.shiftDates && activities[0]
      ? diffDays(activities[0].date, options.shiftDates.startDate)
      : 0

  await Promise.all([
    ...links.map((link) => linkVisitorToVisit(ownerId, newVisitId, link.visitorId)),
    ...activities.map((activity) =>
      createActivity(ownerId, {
        visitId: newVisitId,
        title: activity.title,
        description: activity.description,
        location: activity.location,
        date: options?.shiftDates
          ? addDays(activity.date, dateOffsetDays)
          : activity.date,
        startTime: activity.startTime,
        endTime: activity.endTime,
        responsibleNames: activity.responsibleNames,
        visitorNames: activity.visitorNames,
      }),
    ),
    ...tasks.map((task, index) =>
      createTask(ownerId, {
        visitId: newVisitId,
        title: task.title,
        status: 'backlog',
        order: index,
        dueDate: undefined,
        assigneeName: task.assigneeName,
        assigneeId: task.assigneeId,
      }),
    ),
  ])
}

export async function saveVisitAsTemplate(
  sourceId: string,
  ownerId: string,
): Promise<string> {
  const source = await getVisit(sourceId)
  if (!source) throw new Error('Visita não encontrada')

  const templateId = await createVisit(ownerId, {
    title: `Modelo: ${source.title}`,
    company: source.company,
    state: source.state,
    city: source.city,
    startDate: source.startDate,
    endDate: source.endDate,
    status: 'planejamento',
    objective: source.objective,
    language: source.language,
    arrivalInstructions: source.arrivalInstructions,
    progress: 0,
    teamMemberIds: [],
    clientUserIds: [],
    isTemplate: true,
  })

  await cloneVisitChildren(sourceId, source.ownerId, templateId, ownerId)
  return templateId
}

export async function duplicateVisit(
  sourceId: string,
  ownerId: string,
  overrides?: Partial<Pick<Visit, 'title' | 'startDate' | 'endDate'>>,
): Promise<string> {
  const source = await getVisit(sourceId)
  if (!source) throw new Error('Visita não encontrada')

  const startDate = overrides?.startDate ?? source.startDate
  const endDate = overrides?.endDate ?? source.endDate

  const newId = await createVisit(ownerId, {
    title: overrides?.title ?? `${source.title} (cópia)`,
    company: source.company,
    state: source.state,
    city: source.city,
    startDate,
    endDate,
    status: 'planejamento',
    objective: source.objective,
    language: source.language,
    arrivalInstructions: source.arrivalInstructions,
    progress: 0,
    teamMemberIds: [...source.teamMemberIds],
    clientUserIds: [...source.clientUserIds],
    isTemplate: false,
  })

  await cloneVisitChildren(sourceId, source.ownerId, newId, ownerId, {
    shiftDates: { startDate, endDate },
  })

  return newId
}

export async function createVisitFromTemplate(
  templateId: string,
  ownerId: string,
  overrides: Pick<Visit, 'title' | 'startDate' | 'endDate'> &
    Partial<Pick<Visit, 'company' | 'state' | 'city' | 'objective' | 'language' | 'pvNumber'>>,
): Promise<string> {
  const template = await getVisit(templateId)
  if (!template || !template.isTemplate) throw new Error('Template não encontrado')

  const newId = await createVisit(ownerId, {
    title: overrides.title,
    company: overrides.company ?? template.company,
    state: overrides.state ?? template.state,
    city: overrides.city ?? template.city,
    startDate: overrides.startDate,
    endDate: overrides.endDate,
    status: 'planejamento',
    objective: overrides.objective ?? template.objective,
    language: overrides.language ?? template.language,
    arrivalInstructions: template.arrivalInstructions,
    pvNumber: overrides.pvNumber,
    progress: 0,
    teamMemberIds: [],
    clientUserIds: [],
    isTemplate: false,
  })

  await cloneVisitChildren(templateId, template.ownerId, newId, ownerId, {
    shiftDates: {
      startDate: overrides.startDate,
      endDate: overrides.endDate,
    },
  })

  return newId
}
