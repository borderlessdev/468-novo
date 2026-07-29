import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import type { Notification, NotificationType, Visit } from '@/types'

const col = collection(db, 'notifications')

function mapNotification(id: string, data: Record<string, unknown>): Notification {
  return {
    id,
    recipientId: String(data.recipientId ?? ''),
    type: (data.type as NotificationType) ?? 'visit_created',
    title: String(data.title ?? ''),
    body: String(data.body ?? ''),
    visitId: data.visitId ? String(data.visitId) : undefined,
    entityId: data.entityId ? String(data.entityId) : undefined,
    href: data.href ? String(data.href) : undefined,
    read: Boolean(data.read),
    actorId: data.actorId ? String(data.actorId) : undefined,
    actorName: data.actorName ? String(data.actorName) : undefined,
    dedupeKey: data.dedupeKey ? String(data.dedupeKey) : undefined,
    createdAt: data.createdAt,
  }
}

function getVisitStakeholderIds(visit: Visit, excludeUid?: string): string[] {
  const ids = new Set([visit.ownerId, ...visit.teamMemberIds, ...visit.clientUserIds])
  if (excludeUid) ids.delete(excludeUid)
  return [...ids].filter(Boolean)
}

export type CreateNotificationInput = Omit<
  Notification,
  'id' | 'read' | 'createdAt'
> & { read?: boolean }

export async function createNotification(
  input: CreateNotificationInput,
): Promise<string> {
  const ref = await addDoc(col, {
    recipientId: input.recipientId,
    type: input.type,
    title: input.title,
    body: input.body,
    visitId: input.visitId ?? null,
    entityId: input.entityId ?? null,
    href: input.href ?? null,
    read: input.read ?? false,
    actorId: input.actorId ?? null,
    actorName: input.actorName ?? null,
    dedupeKey: input.dedupeKey ?? null,
    createdAt: serverTimestamp(),
  })
  return ref.id
}

export async function notifyVisitStakeholders(
  visit: Visit,
  notification: Omit<CreateNotificationInput, 'recipientId'>,
): Promise<void> {
  const recipientIds = getVisitStakeholderIds(visit, notification.actorId)
  if (recipientIds.length === 0) return

  await Promise.all(
    recipientIds.map((recipientId) =>
      createNotification({ ...notification, recipientId }),
    ),
  )
}

export async function notificationExistsByDedupeKey(
  recipientId: string,
  dedupeKey: string,
): Promise<boolean> {
  const snap = await getDocs(
    query(
      col,
      where('recipientId', '==', recipientId),
      where('dedupeKey', '==', dedupeKey),
      limit(1),
    ),
  )
  return !snap.empty
}

export function subscribeNotifications(
  recipientId: string,
  callback: (notifications: Notification[]) => void,
  onError?: (error: Error) => void,
): () => void {
  const q = query(
    col,
    where('recipientId', '==', recipientId),
    orderBy('createdAt', 'desc'),
    limit(50),
  )

  return onSnapshot(
    q,
    (snap) => {
      callback(snap.docs.map((d) => mapNotification(d.id, d.data())))
    },
    (error) => {
      console.error('notifications snapshot error', error)
      onError?.(error)
    },
  )
}

export async function markNotificationRead(id: string): Promise<void> {
  await updateDoc(doc(col, id), { read: true })
}

export async function markAllNotificationsRead(
  notifications: Notification[],
): Promise<void> {
  const unread = notifications.filter((n) => !n.read)
  if (unread.length === 0) return

  const batch = writeBatch(db)
  unread.forEach((n) => {
    batch.update(doc(col, n.id), { read: true })
  })
  await batch.commit()
}

export async function deleteNotification(id: string): Promise<void> {
  await deleteDoc(doc(col, id))
}
