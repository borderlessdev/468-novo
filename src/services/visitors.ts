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
import type { Visitor } from '@/types'

const visitorsCol = collection(db, 'visitors')

function mapVisitor(id: string, data: Record<string, unknown>): Visitor {
  return {
    id,
    name: String(data.name ?? ''),
    document: String(data.document ?? ''),
    company: data.company ? String(data.company) : undefined,
    role: data.role ? String(data.role) : undefined,
    country: data.country ? String(data.country) : undefined,
    weightKg: data.weightKg != null ? Number(data.weightKg) : undefined,
    shoeSize: data.shoeSize != null ? Number(data.shoeSize) : undefined,
    dietaryRestriction: data.dietaryRestriction
      ? String(data.dietaryRestriction)
      : undefined,
    language: data.language ? String(data.language) : undefined,
    mobilityReduced: data.mobilityReduced === true,
    notes: data.notes ? String(data.notes) : undefined,
    ownerId: String(data.ownerId ?? ''),
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
  }
}

export async function listVisitors(
  ownerId: string,
  isAdmin: boolean,
): Promise<Visitor[]> {
  const constraints: QueryConstraint[] = isAdmin
    ? [orderBy('name', 'asc')]
    : [where('ownerId', '==', ownerId), orderBy('name', 'asc')]
  const snap = await getDocs(query(visitorsCol, ...constraints))
  return snap.docs.map((d) => mapVisitor(d.id, d.data()))
}

export async function createVisitor(
  ownerId: string,
  data: Omit<Visitor, 'id' | 'ownerId' | 'createdAt' | 'updatedAt'>,
): Promise<string> {
  const ref = await addDoc(visitorsCol, {
    name: data.name,
    document: data.document,
    company: data.company ?? null,
    role: data.role ?? null,
    country: data.country ?? null,
    weightKg: data.weightKg ?? null,
    shoeSize: data.shoeSize ?? null,
    dietaryRestriction: data.dietaryRestriction ?? null,
    language: data.language ?? null,
    mobilityReduced: data.mobilityReduced ?? false,
    notes: data.notes ?? null,
    ownerId,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
  return ref.id
}

export async function updateVisitor(
  id: string,
  data: Partial<Omit<Visitor, 'id' | 'ownerId' | 'createdAt'>>,
): Promise<void> {
  await updateDoc(doc(visitorsCol, id), {
    ...data,
    updatedAt: serverTimestamp(),
  })
}

export async function deleteVisitor(id: string): Promise<void> {
  await deleteDoc(doc(visitorsCol, id))
}
