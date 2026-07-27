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
    ownerId: String(data.ownerId ?? ''),
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
  }
}

export async function listFinanceItems(
  visitId: string,
  ownerId: string,
  isAdmin: boolean,
): Promise<FinanceItem[]> {
  const constraints = isAdmin
    ? [where('visitId', '==', visitId)]
    : [where('ownerId', '==', ownerId), where('visitId', '==', visitId)]

  const snap = await getDocs(query(col, ...constraints))
  return snap.docs.map((d) => mapItem(d.id, d.data()))
}

export async function listFinanceItemsByOwner(
  ownerId: string,
  isAdmin: boolean,
): Promise<FinanceItem[]> {
  if (isAdmin) {
    const snap = await getDocs(col)
    return snap.docs.map((d) => mapItem(d.id, d.data()))
  }

  const snap = await getDocs(query(col, where('ownerId', '==', ownerId)))
  return snap.docs.map((d) => mapItem(d.id, d.data()))
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
    ownerId,
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

export async function deleteFinanceItem(id: string): Promise<void> {
  await deleteDoc(doc(col, id))
}
