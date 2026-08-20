import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import type {
  DocumentCategory,
  Playbook,
  PlaybookItem,
  PlaybookItemKind,
  PlaybookPhase,
} from '@/types'

const col = collection(db, 'playbooks')

const PHASES: PlaybookPhase[] = ['preparacao', 'durante', 'encerramento']
const KINDS: PlaybookItemKind[] = ['task', 'activity', 'document']
const DOCUMENT_CATEGORIES: DocumentCategory[] = [
  'contrato',
  'boarding',
  'briefing',
  'comprovante',
  'outro',
]

function mapItem(value: unknown, index: number): PlaybookItem | null {
  if (!value || typeof value !== 'object') return null
  const data = value as Record<string, unknown>
  const kind = KINDS.includes(data.kind as PlaybookItemKind)
    ? (data.kind as PlaybookItemKind)
    : 'task'
  const phase = PHASES.includes(data.phase as PlaybookPhase)
    ? (data.phase as PlaybookPhase)
    : 'preparacao'
  const title = String(data.title ?? '').trim()
  if (!title) return null

  const offsetDays = Number(data.offsetDays ?? 0)
  const durationMinutes =
    data.durationMinutes != null && data.durationMinutes !== ''
      ? Number(data.durationMinutes)
      : undefined
  const documentCategory = DOCUMENT_CATEGORIES.includes(
    data.documentCategory as DocumentCategory,
  )
    ? (data.documentCategory as DocumentCategory)
    : undefined

  return {
    id: String(data.id ?? crypto.randomUUID()),
    kind,
    phase,
    title,
    description: data.description ? String(data.description) : undefined,
    offsetDays: Number.isFinite(offsetDays) ? offsetDays : 0,
    durationMinutes:
      durationMinutes != null && Number.isFinite(durationMinutes)
        ? durationMinutes
        : undefined,
    startTime: data.startTime ? String(data.startTime) : undefined,
    location: data.location ? String(data.location) : undefined,
    documentCategory: kind === 'document' ? (documentCategory ?? 'outro') : undefined,
    assigneeName: data.assigneeName ? String(data.assigneeName) : undefined,
    order: Number.isFinite(Number(data.order)) ? Number(data.order) : index,
  }
}

function serializeItems(items: PlaybookItem[]): Record<string, unknown>[] {
  return items
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((item, index) => ({
      id: item.id,
      kind: item.kind,
      phase: item.phase,
      title: item.title,
      description: item.description ?? null,
      offsetDays: item.offsetDays,
      durationMinutes: item.kind === 'activity' ? (item.durationMinutes ?? null) : null,
      startTime: item.kind === 'activity' ? (item.startTime ?? null) : null,
      location: item.kind === 'activity' ? (item.location ?? null) : null,
      documentCategory: item.kind === 'document' ? (item.documentCategory ?? 'outro') : null,
      assigneeName: item.assigneeName ?? null,
      order: index,
    }))
}

function mapPlaybook(id: string, data: Record<string, unknown>): Playbook {
  const items = Array.isArray(data.items)
    ? data.items
        .flatMap((value, index) => {
          const item = mapItem(value, index)
          return item ? [item] : []
        })
        .sort((a, b) => a.order - b.order)
    : []

  return {
    id,
    name: String(data.name ?? ''),
    description: data.description ? String(data.description) : undefined,
    visitType: String(data.visitType ?? ''),
    items,
    ownerId: String(data.ownerId ?? ''),
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
  }
}

export async function listPlaybooks(
  ownerId: string,
  isAdmin: boolean,
): Promise<Playbook[]> {
  const snap = await getDocs(
    isAdmin ? col : query(col, where('ownerId', '==', ownerId)),
  )
  return snap.docs
    .map((d) => mapPlaybook(d.id, d.data()))
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
}

export async function getPlaybook(id: string): Promise<Playbook | null> {
  const snap = await getDoc(doc(col, id))
  if (!snap.exists()) return null
  return mapPlaybook(snap.id, snap.data())
}

export async function createPlaybook(
  ownerId: string,
  data: Omit<Playbook, 'id' | 'ownerId' | 'createdAt' | 'updatedAt'>,
): Promise<string> {
  const ref = await addDoc(col, {
    name: data.name,
    description: data.description ?? null,
    visitType: data.visitType,
    items: serializeItems(data.items),
    ownerId,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
  return ref.id
}

export async function updatePlaybook(
  id: string,
  data: Partial<Omit<Playbook, 'id' | 'ownerId' | 'createdAt'>>,
): Promise<void> {
  const payload: Record<string, unknown> = {
    updatedAt: serverTimestamp(),
  }
  if (data.name != null) payload.name = data.name
  if (data.description !== undefined) payload.description = data.description ?? null
  if (data.visitType != null) payload.visitType = data.visitType
  if (data.items) payload.items = serializeItems(data.items)

  await updateDoc(doc(col, id), payload)
}

export async function deletePlaybook(id: string): Promise<void> {
  await deleteDoc(doc(col, id))
}
