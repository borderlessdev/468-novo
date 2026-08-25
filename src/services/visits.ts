import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { isActiveRecord } from '@/lib/trash'
import { softDeleteEntity } from '@/services/trash'
import type { UserRole, Visit, VisitStatus } from '@/types'

const visitsCol = collection(db, 'visits')

function mapVisit(id: string, data: Record<string, unknown>): Visit {
  return {
    id,
    title: String(data.title ?? ''),
    company: data.company ? String(data.company) : undefined,
    state: data.state ? String(data.state) : undefined,
    city: data.city ? String(data.city) : undefined,
    startDate: String(data.startDate ?? ''),
    endDate: String(data.endDate ?? ''),
    status: (data.status as VisitStatus) ?? 'planejamento',
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
    isTemplate: data.isTemplate === true,
    ownerId: String(data.ownerId ?? ''),
    isDeleted: data.isDeleted === true,
    deletedAt: data.deletedAt,
    deletedBy: data.deletedBy ? String(data.deletedBy) : undefined,
    expiresAt: data.expiresAt,
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
  }
}

function mergeVisits(visits: Visit[]): Visit[] {
  const byId = new Map(visits.map((visit) => [visit.id, visit]))
  return Array.from(byId.values()).sort((a, b) =>
    b.startDate.localeCompare(a.startDate),
  )
}

export async function getVisit(id: string): Promise<Visit | null> {
  const snap = await getDoc(doc(visitsCol, id))
  if (!snap.exists()) return null
  const data = snap.data()
  if (!isActiveRecord(data)) return null
  return mapVisit(snap.id, data)
}

export async function listVisits(
  uid: string,
  isAdmin: boolean,
  role: UserRole = 'user',
): Promise<Visit[]> {
  if (isAdmin) {
    const snap = await getDocs(query(visitsCol, orderBy('startDate', 'desc')))
    return snap.docs
      .filter((d) => isActiveRecord(d.data()) && d.data().isTemplate !== true)
      .map((d) => mapVisit(d.id, d.data()))
  }

  if (role === 'client') {
    const snap = await getDocs(
      query(
        visitsCol,
        where('clientUserIds', 'array-contains', uid),
        orderBy('startDate', 'desc'),
      ),
    )
    return snap.docs
      .filter((d) => isActiveRecord(d.data()) && d.data().isTemplate !== true)
      .map((d) => mapVisit(d.id, d.data()))
  }

  if (role === 'team') {
    const [ownedSnap, teamSnap] = await Promise.all([
      getDocs(
        query(
          visitsCol,
          where('ownerId', '==', uid),
          orderBy('startDate', 'desc'),
        ),
      ),
      getDocs(
        query(
          visitsCol,
          where('teamMemberIds', 'array-contains', uid),
          orderBy('startDate', 'desc'),
        ),
      ),
    ])
    return mergeVisits([
      ...ownedSnap.docs
        .filter((d) => isActiveRecord(d.data()) && d.data().isTemplate !== true)
        .map((d) => mapVisit(d.id, d.data())),
      ...teamSnap.docs
        .filter((d) => isActiveRecord(d.data()) && d.data().isTemplate !== true)
        .map((d) => mapVisit(d.id, d.data())),
    ])
  }

  const snap = await getDocs(
    query(visitsCol, where('ownerId', '==', uid), orderBy('startDate', 'desc')),
  )
  return snap.docs
    .filter((d) => isActiveRecord(d.data()) && d.data().isTemplate !== true)
    .map((d) => mapVisit(d.id, d.data()))
}

export async function listVisitTemplates(
  uid: string,
  isAdmin: boolean,
): Promise<Visit[]> {
  const snap = await getDocs(
    isAdmin
      ? query(visitsCol, where('isTemplate', '==', true))
      : query(
          visitsCol,
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
  data: Omit<
    Visit,
    | 'id'
    | 'ownerId'
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
    startDate: data.startDate,
    endDate: data.endDate,
    status: data.status,
    objective: data.objective ?? null,
    language: data.language ?? null,
    arrivalInstructions: data.arrivalInstructions ?? null,
    pvNumber: data.pvNumber ?? crypto.randomUUID(),
    progress: data.progress ?? 0,
    teamMemberIds: data.teamMemberIds ?? [],
    clientUserIds: data.clientUserIds ?? [],
    isTemplate: data.isTemplate === true,
    ownerId,
    isDeleted: false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
  return ref.id
}

export async function updateVisit(
  id: string,
  data: Partial<Omit<Visit, 'id' | 'ownerId' | 'createdAt'>>,
): Promise<void> {
  await updateDoc(doc(visitsCol, id), {
    ...data,
    updatedAt: serverTimestamp(),
  })
}

export async function deleteVisit(id: string, deletedBy: string): Promise<void> {
  await softDeleteEntity('visit', id, deletedBy)
}

export async function syncVisitProgress(visitId: string, progress: number): Promise<void> {
  await updateVisit(visitId, { progress })
}
