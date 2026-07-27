import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  serverTimestamp,
  where,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import type { VisitVisitor } from '@/types'

const col = collection(db, 'visitVisitors')

export async function listVisitVisitors(
  visitId: string,
  ownerId: string,
  isAdmin: boolean,
): Promise<VisitVisitor[]> {
  const constraints = isAdmin
    ? [where('visitId', '==', visitId)]
    : [where('ownerId', '==', ownerId), where('visitId', '==', visitId)]

  const snap = await getDocs(query(col, ...constraints))
  return snap.docs.map((d) => {
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

export async function unlinkVisitVisitor(id: string): Promise<void> {
  await deleteDoc(doc(col, id))
}
