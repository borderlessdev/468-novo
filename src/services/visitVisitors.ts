import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  serverTimestamp,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { getVisitChildDocs } from '@/lib/firestore-visit-query'
import { listVisits } from '@/services/visits'
import type { UserRole, VisitVisitor } from '@/types'

const col = collection(db, 'visitVisitors')

export async function listVisitVisitors(
  visitId: string,
  ownerId?: string,
  isAdmin?: boolean,
): Promise<VisitVisitor[]> {
  return getVisitChildDocs(col, visitId, ownerId, isAdmin, (d) => {
    const data = d.data()
    return {
      id: d.id,
      visitId: String(data.visitId),
      visitorId: String(data.visitorId),
      ownerId: String(data.ownerId),
      createdAt: data.createdAt,
    }
  })
}

export async function linkVisitorToVisit(
  ownerId: string,
  visitId: string,
  visitorId: string,
): Promise<string> {
  const existing = await listVisitVisitors(visitId, ownerId, false)
  if (existing.some((item) => item.visitorId === visitorId)) {
    return existing.find((item) => item.visitorId === visitorId)!.id
  }
  const ref = await addDoc(col, {
    visitId,
    visitorId,
    ownerId,
    createdAt: serverTimestamp(),
  })
  return ref.id
}

export async function listVisitIdsForVisitor(
  visitorId: string,
  ownerId: string,
  isAdmin: boolean,
  role: UserRole = 'user',
): Promise<string[]> {
  const visits = await listVisits(ownerId, isAdmin, role)
  const visitIds: string[] = []

  await Promise.all(
    visits.map(async (visit) => {
      const links = await listVisitVisitors(visit.id, visit.ownerId, isAdmin)
      if (links.some((link) => link.visitorId === visitorId)) {
        visitIds.push(visit.id)
      }
    }),
  )

  return visitIds
}

export async function unlinkVisitVisitor(id: string): Promise<void> {
  await deleteDoc(doc(col, id))
}
