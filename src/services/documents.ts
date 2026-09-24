import {
  collection,
  doc,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore'
import {
  getDownloadURL,
  ref,
  uploadBytes,
} from 'firebase/storage'
import { db, storage } from '@/lib/firebase'
import { getVisitChildDocs, isFirestorePermissionDenied } from '@/lib/firestore-visit-query'
import { softDeleteEntity } from '@/services/trash'
import type { DocumentCategory, VisitDocument } from '@/types'

const col = collection(db, 'documents')

const MAX_FILE_SIZE = 10 * 1024 * 1024
const ALLOWED_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
]

const SPREADSHEET_TYPES = [
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'application/vnd.ms-excel.sheet.macroEnabled.12',
  'text/csv',
  'application/csv',
  'text/plain',
  'application/vnd.oasis.opendocument.spreadsheet',
]

function inferContentType(file: File): string {
  if (file.type) return file.type
  const name = file.name.toLowerCase()
  if (name.endsWith('.xlsx')) return SPREADSHEET_TYPES[0]
  if (name.endsWith('.xlsm')) return 'application/vnd.ms-excel.sheet.macroEnabled.12'
  if (name.endsWith('.xls')) return 'application/vnd.ms-excel'
  if (name.endsWith('.csv')) return 'text/csv'
  if (name.endsWith('.ods')) return 'application/vnd.oasis.opendocument.spreadsheet'
  return file.type
}

function isSpreadsheetFile(file: File): boolean {
  const type = inferContentType(file)
  const name = file.name.toLowerCase()
  return (
    SPREADSHEET_TYPES.includes(type) ||
    /\.(xlsx|xlsm|xls|csv|ods)$/.test(name)
  )
}

async function persistVisitFile(
  ownerId: string,
  visitId: string,
  file: File,
  category: DocumentCategory,
): Promise<string> {
  const docRef = doc(col)
  const storagePath = `visits/${visitId}/${docRef.id}/${file.name}`
  const contentType = inferContentType(file)
  await uploadBytes(ref(storage, storagePath), file, { contentType })
  await setDoc(docRef, {
    visitId,
    name: file.name,
    category,
    storagePath,
    contentType,
    size: file.size,
    ownerId,
    isDeleted: false,
    createdAt: serverTimestamp(),
  })
  return docRef.id
}

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
    isDeleted: data.isDeleted === true,
    deletedAt: data.deletedAt,
    deletedBy: data.deletedBy ? String(data.deletedBy) : undefined,
    expiresAt: data.expiresAt,
    createdAt: data.createdAt,
  }
}

export async function listDocuments(
  visitId: string,
  ownerId?: string,
  isAdmin?: boolean,
): Promise<VisitDocument[]> {
  try {
    const docs = await getVisitChildDocs(col, visitId, ownerId, isAdmin, (d) =>
      mapDocument(d.id, d.data()),
    )
    return docs
      .filter((doc) => !doc.isDeleted)
      .sort((a, b) => String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? '')))
  } catch (error) {
    if (isFirestorePermissionDenied(error)) {
      console.warn(
        'Documentos da visita indisponíveis. Publique as regras do Firestore: npm run deploy:rules',
      )
      return []
    }
    throw error
  }
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

  return persistVisitFile(ownerId, visitId, file, category)
}

/** Arquivo-fonte da importação de programação (Excel/CSV). */
export async function uploadProgrammingSource(
  ownerId: string,
  visitId: string,
  file: File,
): Promise<string> {
  if (!isSpreadsheetFile(file)) {
    throw new Error('Tipo de arquivo não permitido. Use XLSX, XLS ou CSV.')
  }
  if (file.size > MAX_FILE_SIZE) {
    throw new Error('Arquivo muito grande. Máximo 10 MB.')
  }

  return persistVisitFile(ownerId, visitId, file, 'programacao')
}

export async function getDocumentDownloadUrl(storagePath: string): Promise<string> {
  return getDownloadURL(ref(storage, storagePath))
}

export async function deleteDocument(
  document: VisitDocument,
  deletedBy: string,
): Promise<void> {
  await softDeleteEntity('document', document.id, deletedBy)
}
