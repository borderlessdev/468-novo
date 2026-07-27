import {
  addDoc,
  collection,
  deleteDoc,
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
    pvNumber: data.pvNumber ? String(data.pvNumber) : undefined,
    progress: Number(data.progress ?? 0),
    teamMemberIds: Array.isArray(data.teamMemberIds)
      ? (data.teamMemberIds as string[])
      : [],
    clientUserIds: Array.isArray(data.clientUserIds)
      ? (data.clientUserIds as string[])
      : [],
    ownerId: String(data.ownerId ?? ''),
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
  return mapVisit(snap.id, snap.data())
}

export async function listVisits(
  uid: string,
  isAdmin: boolean,
  role: UserRole = 'user',
): Promise<Visit[]> {
  if (isAdmin) {
    const snap = await getDocs(query(visitsCol, orderBy('startDate', 'desc')))
    return snap.docs.map((d) => mapVisit(d.id, d.data()))
  }

  if (role === 'client') {
    const snap = await getDocs(
      query(
        visitsCol,
        where('clientUserIds', 'array-contains', uid),
        orderBy('startDate', 'desc'),
      ),
    )
    return snap.docs.map((d) => mapVisit(d.id, d.data()))
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
      ...ownedSnap.docs.map((d) => mapVisit(d.id, d.data())),
      ...teamSnap.docs.map((d) => mapVisit(d.id, d.data())),
    ])
  }

  const snap = await getDocs(
    query(visitsCol, where('ownerId', '==', uid), orderBy('startDate', 'desc')),
  )
  return snap.docs.map((d) => mapVisit(d.id, d.data()))
}

export async function createVisit(
  ownerId: string,
  data: Omit<Visit, 'id' | 'ownerId' | 'createdAt' | 'updatedAt' | 'progress' | 'teamMemberIds' | 'clientUserIds' | 'pvNumber'> & {
    progress?: number
    teamMemberIds?: string[]
    clientUserIds?: string[]
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
    clientUserIds: data.clientUserIds ?? [],
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

export async function syncVisitProgress(visitId: string, progress: number): Promise<void> {
  await updateVisit(visitId, { progress })
}
