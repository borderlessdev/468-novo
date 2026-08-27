import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  serverTimestamp,
  writeBatch,
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

export async function createDocumentPlaceholders(
  ownerId: string,
  items: Array<Omit<DocumentPlaceholder, 'id' | 'ownerId' | 'createdAt'>>,
): Promise<void> {
  if (items.length === 0) return
  const CHUNK = 450
  for (let i = 0; i < items.length; i += CHUNK) {
    const chunk = items.slice(i, i + CHUNK)
    const batch = writeBatch(db)
    chunk.forEach((item) => {
      batch.set(doc(col), {
        visitId: item.visitId,
        title: item.title,
        category: item.category,
        phase: item.phase ?? null,
        ownerId,
        createdAt: serverTimestamp(),
      })
    })
    await batch.commit()
  }
}

export async function deleteDocumentPlaceholder(id: string): Promise<void> {
  await deleteDoc(doc(col, id))
}
