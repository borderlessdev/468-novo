import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  where,
} from 'firebase/firestore'
import {
  deleteObject,
  getDownloadURL,
  ref,
  uploadBytes,
} from 'firebase/storage'
import { db, storage } from '@/lib/firebase'
import type { DocumentCategory, VisitDocument } from '@/types'

const col = collection(db, 'documents')

const MAX_FILE_SIZE = 10 * 1024 * 1024
const ALLOWED_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
]

function mapDocument(id: string, data: Record<string, unknown>): VisitDocument {
  return {
    id,
    visitId: String(data.visitId ?? ''),
    name: String(data.name ?? ''),
    category: (data.category as DocumentCategory) ?? 'outro',
    storagePath: String(data.storagePath ?? ''),
    contentType: String(data.contentType ?? ''),
    size: Number(data.size ?? 0),
    ownerId: String(data.ownerId ?? ''),
    createdAt: data.createdAt,
  }
}

export async function listDocuments(
  visitId: string,
  ownerId: string,
  isAdmin: boolean,
): Promise<VisitDocument[]> {
  const constraints = isAdmin
    ? [where('visitId', '==', visitId)]
    : [where('ownerId', '==', ownerId), where('visitId', '==', visitId)]

  const snap = await getDocs(query(col, ...constraints))
  return snap.docs
    .map((d) => mapDocument(d.id, d.data()))
    .sort((a, b) => String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? '')))
}

export async function uploadDocument(
  ownerId: string,
  visitId: string,
  file: File,
  category: DocumentCategory,
): Promise<string> {
  if (!ALLOWED_TYPES.includes(file.type)) {
    throw new Error('Tipo de arquivo não permitido. Use PDF, JPG ou PNG.')
  }
  if (file.size > MAX_FILE_SIZE) {
    throw new Error('Arquivo muito grande. Máximo 10 MB.')
  }

  const docRef = doc(col)
  const storagePath = `visits/${visitId}/${docRef.id}/${file.name}`
  const storageRef = ref(storage, storagePath)

  await uploadBytes(storageRef, file, { contentType: file.type })

  await setDoc(docRef, {
    visitId,
    name: file.name,
    category,
    storagePath,
    contentType: file.type,
    size: file.size,
    ownerId,
    createdAt: serverTimestamp(),
  })

  return docRef.id
}

export async function getDocumentDownloadUrl(storagePath: string): Promise<string> {
  return getDownloadURL(ref(storage, storagePath))
}

export async function deleteDocument(document: VisitDocument): Promise<void> {
  try {
    await deleteObject(ref(storage, document.storagePath))
  } catch {
    // Arquivo pode já ter sido removido manualmente no Storage
  }
  await deleteDoc(doc(col, document.id))
}
