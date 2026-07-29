import {
  addDoc,
  collection,
  doc,
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { isActiveRecord } from '@/lib/trash'
import { softDeleteEntity } from '@/services/trash'
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
    isDeleted: data.isDeleted === true,
    deletedAt: data.deletedAt,
    deletedBy: data.deletedBy ? String(data.deletedBy) : undefined,
    expiresAt: data.expiresAt,
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
    .filter((d) => isActiveRecord(d.data()))
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
    isDeleted: false,
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

export async function deleteActivity(id: string, deletedBy: string): Promise<void> {
  await softDeleteEntity('activity', id, deletedBy)
}
