import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
  type QueryConstraint,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import type { Visit, VisitStatus } from '@/types'

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
    pvNumber: data.pvNumber ? String(data.pvNumber) : undefined,
    progress: Number(data.progress ?? 0),
    teamMemberIds: Array.isArray(data.teamMemberIds)
      ? (data.teamMemberIds as string[])
      : [],
    ownerId: String(data.ownerId ?? ''),
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
  }
}

export async function listVisits(
  ownerId: string,
  isAdmin: boolean,
): Promise<Visit[]> {
  const constraints: QueryConstraint[] = isAdmin
    ? [orderBy('startDate', 'desc')]
    : [where('ownerId', '==', ownerId), orderBy('startDate', 'desc')]

  const snap = await getDocs(query(visitsCol, ...constraints))
  return snap.docs.map((d) => mapVisit(d.id, d.data()))
}

export async function createVisit(
  ownerId: string,
  data: Omit<Visit, 'id' | 'ownerId' | 'createdAt' | 'updatedAt' | 'progress' | 'teamMemberIds' | 'pvNumber'> & {
    progress?: number
    teamMemberIds?: string[]
    pvNumber?: string
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
    pvNumber: data.pvNumber ?? crypto.randomUUID(),
    progress: data.progress ?? 0,
    teamMemberIds: data.teamMemberIds ?? [],
    ownerId,
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

export async function deleteVisit(id: string): Promise<void> {
  await deleteDoc(doc(visitsCol, id))
}
