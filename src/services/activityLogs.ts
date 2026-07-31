import {
  addDoc,
  collection,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  where,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import type { ActivityLog, ActivityLogEntityType } from '@/types'

const col = collection(db, 'activityLogs')

function mapLog(id: string, data: Record<string, unknown>): ActivityLog {
  return {
    id,
    entityType: data.entityType as ActivityLogEntityType,
    entityId: String(data.entityId ?? ''),
    visitId: data.visitId ? String(data.visitId) : undefined,
    action: String(data.action ?? ''),
    changes: data.changes as ActivityLog['changes'],
    summary: data.summary ? String(data.summary) : undefined,
    actorId: String(data.actorId ?? ''),
    actorName: data.actorName ? String(data.actorName) : undefined,
    createdAt: data.createdAt,
  }
}

export async function writeActivityLog(input: {
  entityType: ActivityLogEntityType
  entityId: string
  visitId?: string
  action: string
  changes?: ActivityLog['changes']
  summary?: string
  actorId: string
  actorName?: string
}): Promise<string> {
  const ref = await addDoc(col, {
    entityType: input.entityType,
    entityId: input.entityId,
    visitId: input.visitId ?? null,
    action: input.action,
    changes: input.changes ?? null,
    summary: input.summary ?? null,
    actorId: input.actorId,
    actorName: input.actorName ?? null,
    createdAt: serverTimestamp(),
  })
  return ref.id
}

export async function listActivityLogsForVisit(visitId: string): Promise<ActivityLog[]> {
  const snap = await getDocs(
    query(col, where('visitId', '==', visitId), orderBy('createdAt', 'desc')),
  )
  return snap.docs.map((d) => mapLog(d.id, d.data()))
}
