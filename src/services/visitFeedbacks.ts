import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  where,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import type { VisitFeedback } from '@/types'

const col = collection(db, 'visitFeedbacks')

function mapFeedback(id: string, data: Record<string, unknown>): VisitFeedback {
  return {
    id,
    visitId: String(data.visitId ?? ''),
    guestLinkId: String(data.guestLinkId ?? ''),
    visitorId: data.visitorId ? String(data.visitorId) : undefined,
    rating: Number(data.rating ?? 0),
    comment: data.comment ? String(data.comment) : undefined,
    token: String(data.token ?? ''),
    submittedAt: String(data.submittedAt ?? ''),
  }
}

export interface SubmitFeedbackInput {
  visitId: string
  guestLinkId: string
  visitorId?: string
  rating: number
  comment?: string
  token: string
}

/**
 * O ID do documento é o `guestLinkId`, então uma segunda tentativa vira update —
 * as regras negam e o visitante só consegue avaliar uma vez por link.
 */
export async function submitFeedback(input: SubmitFeedbackInput): Promise<void> {
  const rating = Math.round(input.rating)
  if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
    throw new Error('Escolha uma nota de 1 a 5')
  }

  const payload: Record<string, unknown> = {
    visitId: input.visitId,
    guestLinkId: input.guestLinkId,
    rating,
    token: input.token,
    submittedAt: new Date().toISOString(),
  }
  const comment = input.comment?.trim()
  if (comment) payload.comment = comment
  if (input.visitorId) payload.visitorId = input.visitorId

  await setDoc(doc(col, input.guestLinkId), payload)
}

export async function listFeedbacksForVisit(
  visitId: string,
  _ownerId?: string,
  _isAdmin?: boolean,
): Promise<VisitFeedback[]> {
  const snap = await getDocs(query(col, where('visitId', '==', visitId)))
  return snap.docs
    .map((d) => mapFeedback(d.id, d.data()))
    .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt))
}

export async function getFeedbackByGuestLinkId(
  guestLinkId: string,
): Promise<VisitFeedback | null> {
  try {
    const snap = await getDoc(doc(col, guestLinkId))
    if (!snap.exists()) return null
    return mapFeedback(snap.id, snap.data())
  } catch {
    return null
  }
}

export function averageRating(feedbacks: VisitFeedback[]): number | null {
  const rated = feedbacks.filter((item) => item.rating > 0)
  if (rated.length === 0) return null
  const sum = rated.reduce((total, item) => total + item.rating, 0)
  return sum / rated.length
}
