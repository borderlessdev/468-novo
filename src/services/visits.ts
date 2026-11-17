import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import {
  collectDistinctPvNumbers,
  normalizePvNumber,
  suggestNextPvNumber,
} from '@/lib/pvNumber'
import { isActiveRecord } from '@/lib/trash'
import { softDeleteEntity } from '@/services/trash'
import type {
  UserRole,
  Visit,
  VisitEventKind,
  VisitEventScope,
  VisitModuleEditorFlags,
  VisitStatus,
  VisitVipSubtype,
} from '@/types'

function mapModuleEditors(
  value: unknown,
): Record<string, Partial<VisitModuleEditorFlags>> | undefined {
  if (!value || typeof value !== 'object') return undefined
  const result: Record<string, Partial<VisitModuleEditorFlags>> = {}
  for (const [uid, flags] of Object.entries(value as Record<string, unknown>)) {
    if (!uid || !flags || typeof flags !== 'object') continue
    const raw = flags as Record<string, unknown>
    result[uid] = {
      planning: raw.planning === true,
      agenda: raw.agenda === true,
      visitors: raw.visitors === true,
      finance: raw.finance === true,
    }
  }
  return Object.keys(result).length > 0 ? result : undefined
}

const visitsCol = collection(db, 'visits')

function mapVisit(id: string, data: Record<string, unknown>): Visit {
  return {
    id,
    title: String(data.title ?? ''),
    company: data.company ? String(data.company) : undefined,
    state: data.state ? String(data.state) : undefined,
    city: data.city ? String(data.city) : undefined,
    vp: data.vp ? String(data.vp) : undefined,
    vipAudience: data.vipAudience ? String(data.vipAudience) : undefined,
    visitorCountry: data.visitorCountry ? String(data.visitorCountry) : undefined,
    hasPlanting: data.hasPlanting === true,
    planterName: data.planterName ? String(data.planterName) : undefined,
    postVisitInfo: data.postVisitInfo ? String(data.postVisitInfo) : undefined,
    startDate: String(data.startDate ?? ''),
    endDate: String(data.endDate ?? ''),
    status: (data.status as VisitStatus) ?? 'planejamento',
    eventKind: data.eventKind ? (data.eventKind as VisitEventKind) : undefined,
    vipSubtype: data.vipSubtype ? (data.vipSubtype as VisitVipSubtype) : undefined,
    eventScope: data.eventScope ? (data.eventScope as VisitEventScope) : undefined,
    objective: data.objective ? String(data.objective) : undefined,
    language: data.language ? String(data.language) : undefined,
    pvNumber: data.pvNumber ? String(data.pvNumber) : undefined,
    arrivalInstructions: data.arrivalInstructions
      ? String(data.arrivalInstructions)
      : undefined,
    progress: Number(data.progress ?? 0),
    teamMemberIds: Array.isArray(data.teamMemberIds)
      ? (data.teamMemberIds as string[])
      : [],
    clientUserIds: Array.isArray(data.clientUserIds)
      ? (data.clientUserIds as string[])
      : [],
    moduleEditors: mapModuleEditors(data.moduleEditors),
    isTemplate: data.isTemplate === true,
    hasTicketSales: data.hasTicketSales === true,
    communityDailyCapacity:
      data.communityDailyCapacity && typeof data.communityDailyCapacity === 'object'
        ? Object.fromEntries(
            Object.entries(data.communityDailyCapacity as Record<string, unknown>)
              .filter(([, value]) => typeof value === 'number')
              .map(([date, value]) => [date, Number(value)]),
          )
        : undefined,
    communityDailyOccupancy:
      data.communityDailyOccupancy && typeof data.communityDailyOccupancy === 'object'
        ? Object.fromEntries(
            Object.entries(data.communityDailyOccupancy as Record<string, unknown>)
              .filter(([, value]) => typeof value === 'number')
              .map(([date, value]) => [date, Number(value)]),
          )
        : undefined,
    ownerId: String(data.ownerId ?? ''),
    orgId: String(data.orgId ?? ''),
    isDeleted: data.isDeleted === true,
    deletedAt: data.deletedAt,
    deletedBy: data.deletedBy ? String(data.deletedBy) : undefined,
    expiresAt: data.expiresAt,
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
  }
}

export async function getVisit(id: string): Promise<Visit | null> {
  const snap = await getDoc(doc(visitsCol, id))
  if (!snap.exists()) return null
  const data = snap.data()
  if (!isActiveRecord(data)) return null
  return mapVisit(snap.id, data)
}

export async function listVisits(
  orgId: string,
  uid: string,
  _isPlatformAdmin: boolean,
  role: UserRole = 'user',
): Promise<Visit[]> {
  if (!orgId) return []
  const snap = await getDocs(
    role === 'client'
      ? query(
          visitsCol,
          where('orgId', '==', orgId),
          where('clientUserIds', 'array-contains', uid),
        )
      : query(visitsCol, where('orgId', '==', orgId)),
  )
  return snap.docs
    .filter((d) => isActiveRecord(d.data()) && d.data().isTemplate !== true)
    .map((d) => mapVisit(d.id, d.data()))
    .sort((a, b) => b.startDate.localeCompare(a.startDate))
}

/** PVs distintas já usadas na organização (visitas ativas, sem templates). */
export async function listOrgPvNumbers(orgId: string): Promise<string[]> {
  if (!orgId) return []
  const snap = await getDocs(query(visitsCol, where('orgId', '==', orgId)))
  const values = snap.docs
    .filter((d) => isActiveRecord(d.data()) && d.data().isTemplate !== true)
    .map((d) => {
      const raw = d.data().pvNumber
      return raw == null ? undefined : String(raw)
    })
  return collectDistinctPvNumbers(values)
}

/** Próximo número de PV sugerido para a organização. */
export async function getSuggestedPvNumber(orgId: string): Promise<string> {
  const existing = await listOrgPvNumbers(orgId)
  return suggestNextPvNumber(existing)
}

export async function listVisitTemplates(
  orgId: string,
  uid: string,
  isPlatformAdmin: boolean,
): Promise<Visit[]> {
  if (!orgId) return []
  const snap = await getDocs(
    isPlatformAdmin
      ? query(
          visitsCol,
          where('orgId', '==', orgId),
          where('isTemplate', '==', true),
        )
      : query(
          visitsCol,
          where('orgId', '==', orgId),
          where('ownerId', '==', uid),
          where('isTemplate', '==', true),
        ),
  )
  return snap.docs
    .filter((d) => isActiveRecord(d.data()))
    .map((d) => mapVisit(d.id, d.data()))
    .sort((a, b) => a.title.localeCompare(b.title, 'pt-BR'))
}

export async function createVisit(
  ownerId: string,
  orgId: string,
  data: Omit<
    Visit,
    | 'id'
    | 'ownerId'
    | 'orgId'
    | 'createdAt'
    | 'updatedAt'
    | 'progress'
    | 'teamMemberIds'
    | 'clientUserIds'
    | 'pvNumber'
  > & {
    progress?: number
    teamMemberIds?: string[]
    clientUserIds?: string[]
    pvNumber?: string
    isTemplate?: boolean
  },
): Promise<string> {
  const ref = await addDoc(visitsCol, {
    title: data.title,
    company: data.company ?? null,
    state: data.state ?? null,
    city: data.city ?? null,
    vp: data.vp ?? null,
    vipAudience: data.vipAudience ?? null,
    visitorCountry: data.visitorCountry ?? null,
    hasPlanting: data.hasPlanting === true,
    planterName: data.hasPlanting ? (data.planterName ?? null) : null,
    postVisitInfo: data.postVisitInfo ?? null,
    startDate: data.startDate,
    endDate: data.endDate,
    status: data.status,
    eventKind: data.eventKind ?? null,
    vipSubtype: data.eventKind === 'visita_vip' ? (data.vipSubtype ?? null) : null,
    eventScope: data.eventKind === 'evento' ? (data.eventScope ?? null) : null,
    objective: data.objective ?? null,
    language: data.language ?? null,
    arrivalInstructions: data.arrivalInstructions ?? null,
    pvNumber: normalizePvNumber(data.pvNumber) || null,
    progress: data.progress ?? 0,
    teamMemberIds: data.teamMemberIds ?? [],
    clientUserIds: data.clientUserIds ?? [],
    moduleEditors: data.moduleEditors ?? null,
    isTemplate: data.isTemplate === true,
    hasTicketSales: data.hasTicketSales === true,
    communityDailyCapacity: data.communityDailyCapacity ?? null,
    communityDailyOccupancy: data.communityDailyOccupancy ?? null,
    ownerId,
    orgId,
    isDeleted: false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
  return ref.id
}

export async function updateVisit(
  id: string,
  data: Partial<Omit<Visit, 'id' | 'ownerId' | 'orgId' | 'createdAt'>>,
): Promise<void> {
  const payload: Record<string, unknown> = {
    ...data,
    updatedAt: serverTimestamp(),
  }
  if ('eventKind' in data) {
    payload.vipSubtype =
      data.eventKind === 'visita_vip' ? (data.vipSubtype ?? null) : null
    payload.eventScope =
      data.eventKind === 'evento' ? (data.eventScope ?? null) : null
    if (data.eventKind !== 'visita_vip') payload.vipAudience = null
  }
  if ('hasPlanting' in data && data.hasPlanting !== true) {
    payload.planterName = null
  }
  // Firestore rejects `undefined`; empty optional strings arrive as undefined from the form.
  for (const key of Object.keys(payload)) {
    if (payload[key] === undefined) payload[key] = null
  }
  await updateDoc(doc(visitsCol, id), payload)
}

export async function deleteVisit(id: string, deletedBy: string): Promise<void> {
  await softDeleteEntity('visit', id, deletedBy)
}

export async function syncVisitProgress(visitId: string, progress: number): Promise<void> {
  await updateVisit(visitId, { progress })
}
