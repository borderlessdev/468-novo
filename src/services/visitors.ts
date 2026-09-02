import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { isActiveRecord } from '@/lib/trash'
import { softDeleteEntity } from '@/services/trash'
import type { Visitor } from '@/types'

const visitorsCol = collection(db, 'visitors')

function mapVisitor(id: string, data: Record<string, unknown>): Visitor {
  const giftsRaw = Array.isArray(data.gifts) ? data.gifts : []
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
    gifts: giftsRaw.map((g) => {
      const item = g as Record<string, unknown>
      return {
        name: String(item.name ?? ''),
        quantity: item.quantity != null ? Number(item.quantity) : undefined,
        notes: item.notes ? String(item.notes) : undefined,
      }
    }),
    ownerId: String(data.ownerId ?? ''),
    orgId: String(data.orgId ?? ''),
    isDeleted: data.isDeleted === true,
    deletedAt: data.deletedAt,
    deletedBy: data.deletedBy ? String(data.deletedBy) : undefined,
    expiresAt: data.expiresAt,
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
  }
}

export async function getVisitor(id: string): Promise<Visitor | null> {
  const snap = await getDoc(doc(visitorsCol, id))
  if (!snap.exists()) return null
  const data = snap.data() as Record<string, unknown>
  if (!isActiveRecord(data)) return null
  return mapVisitor(snap.id, data)
}

export async function getVisitorsByIds(ids: string[]): Promise<Visitor[]> {
  const unique = [...new Set(ids.filter(Boolean))]
  if (unique.length === 0) return []
  const results = await Promise.all(unique.map((id) => getVisitor(id)))
  return results
    .filter((v): v is Visitor => v != null)
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
}

export async function listVisitors(orgId: string): Promise<Visitor[]> {
  if (!orgId) return []
  const snap = await getDocs(query(visitorsCol, where('orgId', '==', orgId)))
  return snap.docs
    .filter((d) => isActiveRecord(d.data()))
    .map((d) => mapVisitor(d.id, d.data()))
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
}

export async function createVisitor(
  ownerId: string,
  orgId: string,
  data: Omit<Visitor, 'id' | 'ownerId' | 'orgId' | 'createdAt' | 'updatedAt'>,
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
    gifts: (data.gifts ?? []).map((g) => ({
      name: g.name,
      quantity: g.quantity ?? null,
      notes: g.notes ?? null,
    })),
    ownerId,
    orgId,
    isDeleted: false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
  return ref.id
}

export async function updateVisitor(
  id: string,
  data: Partial<Omit<Visitor, 'id' | 'ownerId' | 'orgId' | 'createdAt'>>,
): Promise<void> {
  await updateDoc(doc(visitorsCol, id), {
    ...data,
    updatedAt: serverTimestamp(),
  })
}

export async function deleteVisitor(id: string, deletedBy: string): Promise<void> {
  await softDeleteEntity('visitor', id, deletedBy)
}
