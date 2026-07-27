import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import type { Activity } from '@/types'

const col = collection(db, 'activities')

function mapActivity(id: string, data: Record<string, unknown>): Activity {
  return {
    id,
    visitId: String(data.visitId ?? ''),
    title: String(data.title ?? ''),
    description: data.description ? String(data.description) : undefined,
    location: data.location ? String(data.location) : undefined,
    date: String(data.date ?? ''),
    startTime: String(data.startTime ?? ''),
    endTime: String(data.endTime ?? ''),
    responsibleNames: Array.isArray(data.responsibleNames)
      ? (data.responsibleNames as string[])
      : [],
    visitorNames: Array.isArray(data.visitorNames)
      ? (data.visitorNames as string[])
      : [],
    ownerId: String(data.ownerId ?? ''),
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
  }
}

export async function listActivities(
  visitId: string,
  ownerId: string,
  isAdmin: boolean,
): Promise<Activity[]> {
  const constraints = isAdmin
    ? [where('visitId', '==', visitId)]
    : [where('ownerId', '==', ownerId), where('visitId', '==', visitId)]

  const snap = await getDocs(query(col, ...constraints))
  return snap.docs
    .map((d) => mapActivity(d.id, d.data()))
    .sort((a, b) => a.startTime.localeCompare(b.startTime))
}

export async function createActivity(
  ownerId: string,
  data: Omit<Activity, 'id' | 'ownerId' | 'createdAt' | 'updatedAt'>,
): Promise<string> {
  const ref = await addDoc(col, {
    ...data,
    ownerId,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
  return ref.id
}

export async function updateActivity(
  id: string,
  data: Partial<Omit<Activity, 'id' | 'ownerId' | 'createdAt'>>,
): Promise<void> {
  await updateDoc(doc(col, id), {
    ...data,
    updatedAt: serverTimestamp(),
  })
}

export async function deleteActivity(id: string): Promise<void> {
  await deleteDoc(doc(col, id))
}
