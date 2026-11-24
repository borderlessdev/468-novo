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
import { addDays, diffDays, pruneCommunityDailyCapacity } from '@/lib/date'
import type { Visit } from '@/types'

const COMMUNITY_KINDS = new Set(['visita_comunidade', 'comunidade_prioritaria'])

async function cloneVisitChildren(
  sourceId: string,
  sourceOwnerId: string,
  sourceStartDate: string,
  newVisitId: string,
  ownerId: string,
  options?: { shiftDates?: { startDate: string; endDate: string } },
): Promise<void> {
  const [links, activities, tasks] = await Promise.all([
    listVisitVisitors(sourceId, sourceOwnerId, false),
    listActivities(sourceId, sourceOwnerId, false),
    listTasks(sourceId, sourceOwnerId, false),
  ])

  const dateOffsetDays = options?.shiftDates
    ? diffDays(sourceStartDate, options.shiftDates.startDate)
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
        phase: activity.phase,
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
        phase: task.phase,
      }),
    ),
  ])
}

function communityCapacityForClone(
  eventKind: Visit['eventKind'],
  capacity: Visit['communityDailyCapacity'],
  startDate: string,
  endDate: string,
): Record<string, number> | undefined {
  if (!eventKind || !COMMUNITY_KINDS.has(eventKind)) return undefined
  return pruneCommunityDailyCapacity(capacity, startDate, endDate)
}

export async function saveVisitAsTemplate(
  sourceId: string,
  ownerId: string,
): Promise<string> {
  const source = await getVisit(sourceId)
  if (!source) throw new Error('Visita não encontrada')

  const templateId = await createVisit(ownerId, source.orgId, {
    title: `Modelo: ${source.title}`,
    company: source.company,
    state: source.state,
    city: source.city,
    vp: source.vp,
    vipAudience: source.vipAudience,
    visitorCountry: source.visitorCountry,
    hasPlanting: source.hasPlanting === true,
    planterName: source.hasPlanting ? source.planterName : undefined,
    postVisitInfo: source.postVisitInfo,
    requesterContact: source.requesterContact,
    approverName: source.approverName,
    startDate: source.startDate,
    endDate: source.endDate,
    status: 'planejamento',
    eventKind: source.eventKind,
    vipSubtype: source.vipSubtype,
    eventScope: source.eventScope,
    objective: source.objective,
    language: source.language,
    arrivalInstructions: source.arrivalInstructions,
    hasTicketSales: source.hasTicketSales === true,
    communityDailyCapacity: communityCapacityForClone(
      source.eventKind,
      source.communityDailyCapacity,
      source.startDate,
      source.endDate,
    ),
    progress: 0,
    teamMemberIds: [],
    clientUserIds: [],
    isTemplate: true,
  })

  await cloneVisitChildren(
    sourceId,
    source.ownerId,
    source.startDate,
    templateId,
    ownerId,
  )
  return templateId
}

export async function duplicateVisit(
  sourceId: string,
  ownerId: string,
  overrides?: Partial<Pick<Visit, 'title' | 'startDate' | 'endDate' | 'pvNumber'>>,
): Promise<string> {
  const source = await getVisit(sourceId)
  if (!source) throw new Error('Visita não encontrada')

  const startDate = overrides?.startDate ?? source.startDate
  const endDate = overrides?.endDate ?? source.endDate

  const newId = await createVisit(ownerId, source.orgId, {
    title: overrides?.title ?? `${source.title} (cópia)`,
    company: source.company,
    state: source.state,
    city: source.city,
    vp: source.vp,
    // Só a Vale informa a PV ao duplicar; nas demais organizações segue o comportamento original.
    pvNumber: overrides?.pvNumber,
    vipAudience: source.vipAudience,
    visitorCountry: source.visitorCountry,
    hasPlanting: source.hasPlanting === true,
    planterName: source.hasPlanting ? source.planterName : undefined,
    postVisitInfo: source.postVisitInfo,
    requesterContact: source.requesterContact,
    approverName: source.approverName,
    startDate,
    endDate,
    status: 'planejamento',
    eventKind: source.eventKind,
    vipSubtype: source.vipSubtype,
    eventScope: source.eventScope,
    objective: source.objective,
    language: source.language,
    arrivalInstructions: source.arrivalInstructions,
    hasTicketSales: source.hasTicketSales === true,
    communityDailyCapacity: communityCapacityForClone(
      source.eventKind,
      source.communityDailyCapacity,
      startDate,
      endDate,
    ),
    progress: 0,
    teamMemberIds: [...source.teamMemberIds],
    clientUserIds: [...source.clientUserIds],
    isTemplate: false,
  })

  await cloneVisitChildren(sourceId, source.ownerId, source.startDate, newId, ownerId, {
    shiftDates: { startDate, endDate },
  })

  return newId
}

export async function createVisitFromTemplate(
  templateId: string,
  ownerId: string,
  overrides: Pick<Visit, 'title' | 'startDate' | 'endDate'> &
    Partial<
      Pick<
        Visit,
        | 'company'
        | 'state'
        | 'city'
        | 'vp'
        | 'vipAudience'
        | 'visitorCountry'
        | 'hasPlanting'
        | 'planterName'
        | 'postVisitInfo'
        | 'requesterContact'
        | 'approverName'
        | 'objective'
        | 'language'
        | 'pvNumber'
        | 'eventKind'
        | 'vipSubtype'
        | 'eventScope'
        | 'status'
        | 'hasTicketSales'
        | 'communityDailyCapacity'
      >
    >,
): Promise<string> {
  const template = await getVisit(templateId)
  if (!template || !template.isTemplate) throw new Error('Template não encontrado')

  const eventKind = overrides.eventKind ?? template.eventKind
  const hasPlanting = overrides.hasPlanting ?? template.hasPlanting === true
  const startDate = overrides.startDate
  const endDate = overrides.endDate
  const hasTicketSales =
    overrides.hasTicketSales ?? template.hasTicketSales === true
  const communityDailyCapacity =
    overrides.communityDailyCapacity !== undefined
      ? communityCapacityForClone(eventKind, overrides.communityDailyCapacity, startDate, endDate)
      : communityCapacityForClone(
          eventKind,
          template.communityDailyCapacity,
          startDate,
          endDate,
        )

  const newId = await createVisit(ownerId, template.orgId, {
    title: overrides.title,
    company: overrides.company ?? template.company,
    state: overrides.state ?? template.state,
    city: overrides.city ?? template.city,
    vp: overrides.vp ?? template.vp,
    vipAudience:
      eventKind === 'visita_vip'
        ? (overrides.vipAudience ?? template.vipAudience)
        : undefined,
    visitorCountry: overrides.visitorCountry ?? template.visitorCountry,
    hasPlanting,
    planterName: hasPlanting
      ? (overrides.planterName ?? template.planterName)
      : undefined,
    postVisitInfo: overrides.postVisitInfo ?? template.postVisitInfo,
    requesterContact: overrides.requesterContact ?? template.requesterContact,
    approverName: overrides.approverName ?? template.approverName,
    startDate,
    endDate,
    status: overrides.status ?? 'planejamento',
    eventKind,
    vipSubtype:
      eventKind === 'visita_vip'
        ? (overrides.vipSubtype ?? template.vipSubtype)
        : undefined,
    eventScope:
      eventKind === 'evento'
        ? (overrides.eventScope ?? template.eventScope)
        : undefined,
    objective: overrides.objective ?? template.objective,
    language: overrides.language ?? template.language,
    arrivalInstructions: template.arrivalInstructions,
    pvNumber: overrides.pvNumber,
    hasTicketSales: hasTicketSales === true,
    communityDailyCapacity,
    progress: 0,
    teamMemberIds: [],
    clientUserIds: [],
    isTemplate: false,
  })

  await cloneVisitChildren(templateId, template.ownerId, template.startDate, newId, ownerId, {
    shiftDates: {
      startDate: overrides.startDate,
      endDate: overrides.endDate,
    },
  })

  return newId
}
