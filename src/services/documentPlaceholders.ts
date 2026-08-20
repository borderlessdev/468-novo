import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  serverTimestamp,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { getVisitChildDocs, isFirestorePermissionDenied } from '@/lib/firestore-visit-query'
import type { DocumentCategory, DocumentPlaceholder, PlaybookPhase } from '@/types'

const col = collection(db, 'documentPlaceholders')

function mapPlaceholder(id: string, data: Record<string, unknown>): DocumentPlaceholder {
  return {
    id,
    visitId: String(data.visitId ?? ''),
    title: String(data.title ?? ''),
    category: (data.category as DocumentCategory) ?? 'outro',
    phase: data.phase as PlaybookPhase | undefined,
    ownerId: String(data.ownerId ?? ''),
    createdAt: data.createdAt,
  }
}

export async function listDocumentPlaceholders(
  visitId: string,
  ownerId?: string,
  isAdmin?: boolean,
): Promise<DocumentPlaceholder[]> {
  try {
    const items = await getVisitChildDocs(col, visitId, ownerId, isAdmin, (d) =>
      mapPlaceholder(d.id, d.data()),
    )
    return items.sort((a, b) => a.title.localeCompare(b.title, 'pt-BR'))
  } catch (error) {
    if (isFirestorePermissionDenied(error)) {
      console.warn(
        'Placeholders de documento indisponíveis. Publique as regras: npm run deploy:rules',
      )
      return []
    }
    throw error
  }
}

export async function createDocumentPlaceholder(
  ownerId: string,
  data: Omit<DocumentPlaceholder, 'id' | 'ownerId' | 'createdAt'>,
): Promise<string> {
  const ref = await addDoc(col, {
    visitId: data.visitId,
    title: data.title,
    category: data.category,
    phase: data.phase ?? null,
    ownerId,
    createdAt: serverTimestamp(),
  })
  return ref.id
}

export async function deleteDocumentPlaceholder(id: string): Promise<void> {
  await deleteDoc(doc(col, id))
}
