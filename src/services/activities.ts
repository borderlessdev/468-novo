import {
  addDoc,
  writeBatch,
  collection,
  doc,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { getVisitChildDocs } from '@/lib/firestore-visit-query'
import { softDeleteEntity } from '@/services/trash'
import type { Activity, PlaybookPhase } from '@/types'

const col = collection(db, 'activities')
const PHASES: PlaybookPhase[] = ['preparacao', 'durante', 'encerramento']

function mapActivity(id: string, data: Record<string, unknown>): Activity {
  const phase = PHASES.includes(data.phase as PlaybookPhase)
    ? (data.phase as PlaybookPhase)
    : undefined
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
    phase,
    googleEventId: data.googleEventId ? String(data.googleEventId) : undefined,
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
  const activities = await getVisitChildDocs(col, visitId, ownerId, isAdmin, (d) =>
    mapActivity(d.id, d.data()),
  )
  return activities
    .filter((activity) => !activity.isDeleted)
    .sort((a, b) => a.startTime.localeCompare(b.startTime))
}

export async function createActivity(
  ownerId: string,
  data: Omit<Activity, 'id' | 'ownerId' | 'createdAt' | 'updatedAt'>,
): Promise<string> {
  const ref = await addDoc(col, {
    visitId: data.visitId,
    title: data.title,
    description: data.description ?? null,
    location: data.location ?? null,
    date: data.date,
    startTime: data.startTime,
    endTime: data.endTime,
    responsibleNames: data.responsibleNames ?? [],
    visitorNames: data.visitorNames ?? [],
    phase: data.phase ?? null,
    ownerId,
    isDeleted: false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
  return ref.id
}

export async function createActivities(
  ownerId: string,
  activities: Array<Omit<Activity, 'id' | 'ownerId' | 'createdAt' | 'updatedAt'>>,
): Promise<void> {
  if (activities.length === 0) return
  if (activities.length > 500) throw new Error('O arquivo excede o limite de 500 atividades')
  const CHUNK = 450
  for (let i = 0; i < activities.length; i += CHUNK) {
    const chunk = activities.slice(i, i + CHUNK)
    const batch = writeBatch(db)
    for (const activity of chunk) {
      batch.set(doc(col), {
        visitId: activity.visitId,
        title: activity.title,
        description: activity.description ?? null,
        location: activity.location ?? null,
        date: activity.date,
        startTime: activity.startTime,
        endTime: activity.endTime,
        responsibleNames: activity.responsibleNames ?? [],
        visitorNames: activity.visitorNames ?? [],
        phase: activity.phase ?? null,
        ownerId,
        isDeleted: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
    }
    await batch.commit()
  }
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
