import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { getVisitChildDocs } from '@/lib/firestore-visit-query'
import { listVisits } from '@/services/visits'
import type {
  RevenueItem,
  RevenueNatureType,
  RevenueSourceType,
  RevenueTicketSaleDay,
  UserRole,
  Visit,
} from '@/types'

const col = collection(db, 'revenueItems')

const SOURCE_TYPES: RevenueSourceType[] = [
  'ingressos',
  'apoio_areas',
  'recursos_proprios',
  'patrocinio',
]

const NATURE_TYPES: RevenueNatureType[] = [
  'centro_custos',
  'conta_contabil',
  'rubrica',
  'dotacao_orcamentaria',
]

function mapTicketSales(value: unknown): RevenueTicketSaleDay[] | undefined {
  if (!Array.isArray(value)) return undefined
  const days = value.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return []
    const row = entry as Record<string, unknown>
    const date = String(row.date ?? '')
    const amount = Number(row.amount ?? 0)
    if (!date || !Number.isFinite(amount)) return []
    return [
      {
        date,
        amount,
        quantity:
          row.quantity != null && Number.isFinite(Number(row.quantity))
            ? Number(row.quantity)
            : undefined,
        notes: row.notes ? String(row.notes) : undefined,
      },
    ]
  })
  return days.length > 0 ? days : undefined
}

function mapItem(id: string, data: Record<string, unknown>): RevenueItem {
  const sourceType = SOURCE_TYPES.includes(data.sourceType as RevenueSourceType)
    ? (data.sourceType as RevenueSourceType)
    : 'recursos_proprios'
  const natureType = NATURE_TYPES.includes(data.natureType as RevenueNatureType)
    ? (data.natureType as RevenueNatureType)
    : 'centro_custos'
  return {
    id,
    visitId: String(data.visitId ?? ''),
    sourceType,
    natureType,
    natureLabel: String(data.natureLabel ?? ''),
    entryDate: String(data.entryDate ?? ''),
    amount: Number(data.amount ?? 0),
    notes: data.notes ? String(data.notes) : undefined,
    ticketSales: mapTicketSales(data.ticketSales),
    ownerId: String(data.ownerId ?? ''),
    orgId: String(data.orgId ?? ''),
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
  }
}

export async function listRevenueItems(
  visitId: string,
  ownerId: string,
  isAdmin: boolean,
): Promise<RevenueItem[]> {
  return getVisitChildDocs(col, visitId, ownerId, isAdmin, (d) =>
    mapItem(d.id, d.data()),
  )
}

export async function listRevenueItemsByOwner(
  orgId: string,
  ownerId: string,
  isPlatformAdmin: boolean,
  role: UserRole = 'user',
  visits?: Visit[],
): Promise<RevenueItem[]> {
  const visitList = visits ?? (await listVisits(orgId, ownerId, isPlatformAdmin, role))
  if (visitList.length === 0) return []
  const perVisit = await Promise.all(
    visitList.map((visit) => listRevenueItems(visit.id, visit.ownerId, isPlatformAdmin)),
  )
  return perVisit.flat()
}

export async function createRevenueItem(
  ownerId: string,
  orgId: string,
  data: Omit<RevenueItem, 'id' | 'ownerId' | 'orgId' | 'createdAt' | 'updatedAt'>,
): Promise<string> {
  const ref = await addDoc(col, {
    visitId: data.visitId,
    sourceType: data.sourceType,
    natureType: data.natureType,
    natureLabel: data.natureLabel,
    entryDate: data.entryDate,
    amount: data.amount,
    notes: data.notes ?? null,
    ticketSales: data.ticketSales ?? [],
    ownerId,
    orgId,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
  return ref.id
}

export async function updateRevenueItem(
  id: string,
  data: Partial<
    Omit<RevenueItem, 'id' | 'ownerId' | 'orgId' | 'createdAt' | 'updatedAt'>
  >,
): Promise<void> {
  const payload: Record<string, unknown> = { ...data, updatedAt: serverTimestamp() }
  for (const key of Object.keys(payload)) {
    if (payload[key] === undefined) payload[key] = null
  }
  await updateDoc(doc(col, id), payload)
}

export async function deleteRevenueItem(id: string): Promise<void> {
  await deleteDoc(doc(col, id))
}
