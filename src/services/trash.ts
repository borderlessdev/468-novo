import {
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
  where,
  type CollectionReference,
} from 'firebase/firestore'
import { deleteObject, ref } from 'firebase/storage'
import { db, storage } from '@/lib/firebase'
import {
  getTrashExpiresAt,
  getTrashItemTitle,
  isActiveRecord,
  TRASH_ENTITY_COLLECTIONS,
} from '@/lib/trash'
import { listVisits } from '@/services/visits'
import type { TrashEntityType, TrashItem, UserRole } from '@/types'

const CHILD_ENTITY_TYPES: TrashEntityType[] = [
  'activity',
  'task',
  'financeItem',
  'document',
]

const collections: Record<TrashEntityType, CollectionReference> = {
  visit: collection(db, 'visits'),
  visitor: collection(db, 'visitors'),
  activity: collection(db, 'activities'),
  task: collection(db, 'tasks'),
  financeItem: collection(db, 'financeItems'),
  document: collection(db, 'documents'),
}

function mapTrashItem(
  entityType: TrashEntityType,
  id: string,
  data: Record<string, unknown>,
): TrashItem {
  return {
    id,
    entityType,
    title: getTrashItemTitle(entityType, data),
    ownerId: String(data.ownerId ?? ''),
    deletedAt: data.deletedAt,
    expiresAt: data.expiresAt,
    visitId: data.visitId ? String(data.visitId) : undefined,
  }
}

function isNotExpired(data: Record<string, unknown>): boolean {
  if (!data.expiresAt || typeof data.expiresAt !== 'object' || !('toDate' in data.expiresAt)) {
    return true
  }
  const expires = (data.expiresAt as { toDate: () => Date }).toDate()
  return expires.getTime() > Date.now()
}

export async function softDeleteEntity(
  entityType: TrashEntityType,
  id: string,
  deletedBy: string,
): Promise<void> {
  const col = collections[entityType]
  const payload: Record<string, unknown> = {
    isDeleted: true,
    deletedAt: serverTimestamp(),
    deletedBy,
    expiresAt: getTrashExpiresAt(),
  }
  if (entityType !== 'document') {
    payload.updatedAt = serverTimestamp()
  }
  await updateDoc(doc(col, id), payload)
}

export async function restoreEntity(
  entityType: TrashEntityType,
  id: string,
): Promise<void> {
  const col = collections[entityType]
  const payload: Record<string, unknown> = {
    isDeleted: false,
    deletedAt: deleteField(),
    deletedBy: deleteField(),
    expiresAt: deleteField(),
  }
  if (entityType !== 'document') {
    payload.updatedAt = serverTimestamp()
  }
  await updateDoc(doc(col, id), payload)
}

export async function permanentDeleteEntity(
  entityType: TrashEntityType,
  id: string,
): Promise<void> {
  const col = collections[entityType]

  if (entityType === 'document' || entityType === 'financeItem') {
    const snap = await getDoc(doc(col, id))
    if (snap.exists()) {
      const data = snap.data()
      const storagePaths = new Set<string>()
      if (entityType === 'document' && typeof data.storagePath === 'string') {
        storagePaths.add(data.storagePath)
      }
      if (entityType === 'financeItem') {
        if (typeof data.attachmentPath === 'string') storagePaths.add(data.attachmentPath)
        if (typeof data.invoiceAttachment?.storagePath === 'string') {
          storagePaths.add(data.invoiceAttachment.storagePath)
        }
        if (Array.isArray(data.budgetAttachments)) {
          for (const attachment of data.budgetAttachments) {
            if (typeof attachment?.storagePath === 'string') {
              storagePaths.add(attachment.storagePath)
            }
          }
        }
      }
      for (const storagePath of storagePaths) {
        try {
          await deleteObject(ref(storage, storagePath))
        } catch {
          // Arquivo pode já ter sido removido manualmente
        }
      }
    }
  }

  await deleteDoc(doc(col, id))
}

async function getAccessibleVisitIds(
  uid: string,
  isAdmin: boolean,
  role: UserRole,
): Promise<string[]> {
  const ids = new Set<string>()

  const activeVisits = await listVisits(uid, isAdmin, role)
  activeVisits.forEach((visit) => ids.add(visit.id))

  const visitCol = collections.visit

  if (isAdmin) {
    const deletedSnap = await getDocs(query(visitCol, where('isDeleted', '==', true)))
    deletedSnap.docs.forEach((d) => ids.add(d.id))
  } else {
    const ownedDeletedSnap = await getDocs(
      query(visitCol, where('ownerId', '==', uid), where('isDeleted', '==', true)),
    )
    ownedDeletedSnap.docs.forEach((d) => ids.add(d.id))

    if (role === 'team') {
      const teamSnap = await getDocs(
        query(visitCol, where('teamMemberIds', 'array-contains', uid)),
      )
      teamSnap.docs
        .filter((d) => d.data().isDeleted === true)
        .forEach((d) => ids.add(d.id))
    }

    if (role === 'client') {
      const clientSnap = await getDocs(
        query(visitCol, where('clientUserIds', 'array-contains', uid)),
      )
      clientSnap.docs
        .filter((d) => d.data().isDeleted === true)
        .forEach((d) => ids.add(d.id))
    }
  }

  return [...ids]
}

async function listVisitChildTrash(
  entityType: TrashEntityType,
  visitIds: string[],
): Promise<TrashItem[]> {
  if (visitIds.length === 0) return []

  const col = collections[entityType]
  const items: TrashItem[] = []

  await Promise.all(
    visitIds.map(async (visitId) => {
      const snap = await getDocs(query(col, where('visitId', '==', visitId)))
      snap.docs
        .filter((d) => d.data().isDeleted === true && isNotExpired(d.data()))
        .forEach((d) => items.push(mapTrashItem(entityType, d.id, d.data())))
    }),
  )

  return items
}

async function listTrashByType(
  entityType: TrashEntityType,
  ownerId: string,
  isAdmin: boolean,
  visitIds: string[],
): Promise<TrashItem[]> {
  if (CHILD_ENTITY_TYPES.includes(entityType)) {
    return listVisitChildTrash(entityType, visitIds)
  }

  const col = collections[entityType]
  const constraints = isAdmin
    ? [where('isDeleted', '==', true)]
    : [where('ownerId', '==', ownerId), where('isDeleted', '==', true)]

  const snap = await getDocs(query(col, ...constraints))
  return snap.docs
    .filter((d) => isNotExpired(d.data()))
    .map((d) => mapTrashItem(entityType, d.id, d.data()))
}

export async function listTrashItems(
  ownerId: string,
  isAdmin: boolean,
  role: UserRole = 'user',
): Promise<Record<TrashEntityType, TrashItem[]>> {
  const visitIds = await getAccessibleVisitIds(ownerId, isAdmin, role)
  const types = Object.keys(TRASH_ENTITY_COLLECTIONS) as TrashEntityType[]
  const results = await Promise.all(
    types.map(async (entityType) => ({
      entityType,
      items: await listTrashByType(entityType, ownerId, isAdmin, visitIds),
    })),
  )

  return results.reduce(
    (acc, { entityType, items }) => {
      acc[entityType] = items
      return acc
    },
    {
      visit: [],
      visitor: [],
      activity: [],
      task: [],
      financeItem: [],
      document: [],
    } as Record<TrashEntityType, TrashItem[]>,
  )
}

export function filterActive<T extends { isDeleted?: boolean }>(items: T[]): T[] {
  return items.filter((item) => item.isDeleted !== true)
}

export function filterActiveData<T>(
  docs: { id: string; data: Record<string, unknown> }[],
  mapper: (id: string, data: Record<string, unknown>) => T,
): T[] {
  return docs
    .filter(({ data }) => isActiveRecord(data))
    .map(({ id, data }) => mapper(id, data))
}

export { Timestamp }
