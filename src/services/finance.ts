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
import { deleteObject, getDownloadURL, ref, uploadBytes } from 'firebase/storage'
import { db, storage } from '@/lib/firebase'
import { getVisitChildDocs } from '@/lib/firestore-visit-query'
import { isActiveRecord } from '@/lib/trash'
import { softDeleteEntity } from '@/services/trash'
import type { FinanceItem } from '@/types'

const col = collection(db, 'financeItems')

function mapItem(id: string, data: Record<string, unknown>): FinanceItem {
  return {
    id,
    visitId: String(data.visitId ?? ''),
    serviceName: String(data.serviceName ?? ''),
    budget1: data.budget1 != null ? Number(data.budget1) : undefined,
    budget2: data.budget2 != null ? Number(data.budget2) : undefined,
    budget3: data.budget3 != null ? Number(data.budget3) : undefined,
    serviceValue: data.serviceValue != null ? Number(data.serviceValue) : undefined,
    winningCompany: data.winningCompany ? String(data.winningCompany) : undefined,
    nfReceived: Boolean(data.nfReceived),
    nfDueDate: data.nfDueDate ? String(data.nfDueDate) : undefined,
    attachmentPath: data.attachmentPath ? String(data.attachmentPath) : undefined,
    attachmentName: data.attachmentName ? String(data.attachmentName) : undefined,
    ownerId: String(data.ownerId ?? ''),
    isDeleted: data.isDeleted === true,
    deletedAt: data.deletedAt,
    deletedBy: data.deletedBy ? String(data.deletedBy) : undefined,
    expiresAt: data.expiresAt,
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
  }
}

export async function listFinanceItems(
  visitId: string,
  ownerId: string,
  isAdmin: boolean,
): Promise<FinanceItem[]> {
  const items = await getVisitChildDocs(col, visitId, ownerId, isAdmin, (d) =>
    mapItem(d.id, d.data()),
  )
  return items.filter((item) => !item.isDeleted)
}

export async function listFinanceItemsByOwner(
  ownerId: string,
  isAdmin: boolean,
): Promise<FinanceItem[]> {
  if (isAdmin) {
    const snap = await getDocs(col)
    return snap.docs
      .filter((d) => isActiveRecord(d.data()))
      .map((d) => mapItem(d.id, d.data()))
  }

  const snap = await getDocs(query(col, where('ownerId', '==', ownerId)))
  return snap.docs
    .filter((d) => isActiveRecord(d.data()))
    .map((d) => mapItem(d.id, d.data()))
}

export async function createFinanceItem(
  ownerId: string,
  data: Omit<FinanceItem, 'id' | 'ownerId' | 'createdAt' | 'updatedAt'>,
): Promise<string> {
  const ref = await addDoc(col, {
    visitId: data.visitId,
    serviceName: data.serviceName,
    budget1: data.budget1 ?? null,
    budget2: data.budget2 ?? null,
    budget3: data.budget3 ?? null,
    serviceValue: data.serviceValue ?? null,
    winningCompany: data.winningCompany ?? null,
    nfReceived: data.nfReceived,
    nfDueDate: data.nfDueDate ?? null,
    attachmentPath: data.attachmentPath ?? null,
    attachmentName: data.attachmentName ?? null,
    ownerId,
    isDeleted: false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
  return ref.id
}

export async function updateFinanceItem(
  id: string,
  data: Partial<Omit<FinanceItem, 'id' | 'ownerId' | 'createdAt'>>,
): Promise<void> {
  await updateDoc(doc(col, id), {
    ...data,
    updatedAt: serverTimestamp(),
  })
}

export async function deleteFinanceItem(id: string, deletedBy: string): Promise<void> {
  await softDeleteEntity('financeItem', id, deletedBy)
}

const FINANCE_ALLOWED_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
const FINANCE_MAX_SIZE = 10 * 1024 * 1024

export async function uploadFinanceAttachment(
  item: FinanceItem,
  file: File,
): Promise<void> {
  if (!FINANCE_ALLOWED_TYPES.includes(file.type)) {
    throw new Error('Use PDF, JPG ou PNG.')
  }
  if (file.size > FINANCE_MAX_SIZE) {
    throw new Error('Arquivo muito grande. Máximo 10 MB.')
  }

  const storagePath = `visits/${item.visitId}/finance/${item.id}/${file.name}`
  await uploadBytes(ref(storage, storagePath), file, { contentType: file.type })
  await updateFinanceItem(item.id, {
    attachmentPath: storagePath,
    attachmentName: file.name,
  })
}

export async function getFinanceAttachmentUrl(storagePath: string): Promise<string> {
  return getDownloadURL(ref(storage, storagePath))
}

export async function removeFinanceAttachment(item: FinanceItem): Promise<void> {
  if (item.attachmentPath) {
    try {
      await deleteObject(ref(storage, item.attachmentPath))
    } catch {
      // ignore missing file
    }
  }
  await updateFinanceItem(item.id, {
    attachmentPath: undefined,
    attachmentName: undefined,
  })
}
