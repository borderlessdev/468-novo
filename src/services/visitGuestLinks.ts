import {
  Timestamp,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { updateVisitor } from '@/services/visitors'
import type {
  Activity,
  GuestAgendaItem,
  GuestConfirmationStatus,
  GuestVisitorDraft,
  VisitGuestLink,
  Visitor,
} from '@/types'

const col = collection(db, 'visitGuestLinks')

const LINK_VALIDITY_DAYS = 14

const CONFIRMATION_STATUSES: GuestConfirmationStatus[] = [
  'pending',
  'confirmed',
  'declined',
]

/**
 * O token é usado como ID do documento: a rota pública consegue fazer `get`
 * direto sem precisar de permissão de `list` na coleção.
 */
function mapGuestLink(id: string, data: Record<string, unknown>): VisitGuestLink {
  const status = data.confirmationStatus as GuestConfirmationStatus
  const draftRaw = data.visitorDraft as Record<string, unknown> | null | undefined
  const agendaRaw = Array.isArray(data.agenda) ? data.agenda : []

  return {
    id,
    token: String(data.token ?? id),
    visitId: String(data.visitId ?? ''),
    visitorId: String(data.visitorId ?? ''),
    ownerId: String(data.ownerId ?? ''),
    createdBy: String(data.createdBy ?? ''),
    expiresAt: String(data.expiresAt ?? ''),
    revoked: data.revoked === true,
    visitTitle: String(data.visitTitle ?? ''),
    startDate: String(data.startDate ?? ''),
    endDate: String(data.endDate ?? ''),
    visitorName: String(data.visitorName ?? ''),
    company: data.company ? String(data.company) : undefined,
    city: data.city ? String(data.city) : undefined,
    arrivalInstructions: data.arrivalInstructions
      ? String(data.arrivalInstructions)
      : undefined,
    agenda: agendaRaw.map((entry) => {
      const item = entry as Record<string, unknown>
      return {
        date: String(item.date ?? ''),
        startTime: String(item.startTime ?? ''),
        endTime: String(item.endTime ?? ''),
        title: String(item.title ?? ''),
        location: item.location ? String(item.location) : undefined,
      }
    }),
    confirmationStatus: CONFIRMATION_STATUSES.includes(status) ? status : 'pending',
    visitorDraft: draftRaw ? mapDraft(draftRaw) : undefined,
    lastAppliedAt: data.lastAppliedAt ? String(data.lastAppliedAt) : undefined,
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
  }
}

function mapDraft(data: Record<string, unknown>): GuestVisitorDraft {
  return {
    name: data.name ? String(data.name) : undefined,
    document: data.document ? String(data.document) : undefined,
    company: data.company ? String(data.company) : undefined,
    role: data.role ? String(data.role) : undefined,
    dietaryRestriction: data.dietaryRestriction
      ? String(data.dietaryRestriction)
      : undefined,
    mobilityReduced:
      data.mobilityReduced == null ? undefined : data.mobilityReduced === true,
    language: data.language ? String(data.language) : undefined,
    notes: data.notes ? String(data.notes) : undefined,
    updatedAt: data.updatedAt ? String(data.updatedAt) : undefined,
  }
}

/** Firestore rejeita `undefined`: remove campos vazios antes de gravar. */
function cleanDraft(draft: GuestVisitorDraft): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  const text = (value?: string) => {
    const trimmed = value?.trim()
    return trimmed ? trimmed : null
  }

  result.name = text(draft.name)
  result.document = text(draft.document)
  result.company = text(draft.company)
  result.role = text(draft.role)
  result.dietaryRestriction = text(draft.dietaryRestriction)
  result.language = text(draft.language)
  result.notes = text(draft.notes)
  result.mobilityReduced = draft.mobilityReduced === true
  return result
}

export function buildGuestAgenda(activities: Activity[]): GuestAgendaItem[] {
  return activities
    .filter((activity) => !activity.isDeleted)
    .map((activity) => {
      const item: GuestAgendaItem = {
        date: activity.date,
        startTime: activity.startTime,
        endTime: activity.endTime,
        title: activity.title,
      }
      if (activity.location) item.location = activity.location
      return item
    })
    .sort((a, b) => `${a.date}${a.startTime}`.localeCompare(`${b.date}${b.startTime}`))
}

export type GuestLinkAvailability = 'ok' | 'revoked' | 'expired'

export function getGuestLinkAvailability(link: VisitGuestLink): GuestLinkAvailability {
  if (link.revoked) return 'revoked'
  const expires = new Date(link.expiresAt).getTime()
  if (Number.isFinite(expires) && expires < Date.now()) return 'expired'
  return 'ok'
}

/** O visitante enviou dados que o operador ainda não aplicou no CRM. */
export function hasPendingGuestDraft(link: VisitGuestLink): boolean {
  const draftUpdatedAt = link.visitorDraft?.updatedAt
  if (!draftUpdatedAt) return false
  if (!link.lastAppliedAt) return true
  return draftUpdatedAt > link.lastAppliedAt
}

export function buildGuestPortalUrl(token: string): string {
  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  return `${origin}/portal/${token}`
}

export interface GuestLinkSnapshot {
  visitTitle: string
  startDate: string
  endDate: string
  visitorName: string
  company?: string
  city?: string
  arrivalInstructions?: string
  agenda?: GuestAgendaItem[]
}

export interface CreateGuestLinkInput extends GuestLinkSnapshot {
  visitId: string
  visitorId: string
  createdBy: string
  ownerId: string
}

function snapshotPayload(snapshot: GuestLinkSnapshot): Record<string, unknown> {
  return {
    visitTitle: snapshot.visitTitle,
    startDate: snapshot.startDate,
    endDate: snapshot.endDate,
    visitorName: snapshot.visitorName,
    company: snapshot.company ?? null,
    city: snapshot.city ?? null,
    arrivalInstructions: snapshot.arrivalInstructions ?? null,
    agenda: snapshot.agenda ?? [],
  }
}

export async function createGuestLink(
  input: CreateGuestLinkInput,
): Promise<VisitGuestLink> {
  const token = crypto.randomUUID().replace(/-/g, '')
  const expires = new Date()
  expires.setDate(expires.getDate() + LINK_VALIDITY_DAYS)
  const expiresAt = expires.toISOString()

  await setDoc(doc(col, token), {
    token,
    visitId: input.visitId,
    visitorId: input.visitorId,
    ownerId: input.ownerId,
    createdBy: input.createdBy,
    expiresAt,
    // Duplicado como Timestamp para as regras validarem a expiração no servidor.
    expiresAtTs: Timestamp.fromDate(expires),
    revoked: false,
    ...snapshotPayload(input),
    confirmationStatus: 'pending',
    visitorDraft: null,
    lastAppliedAt: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })

  return {
    id: token,
    token,
    visitId: input.visitId,
    visitorId: input.visitorId,
    ownerId: input.ownerId,
    createdBy: input.createdBy,
    expiresAt,
    revoked: false,
    visitTitle: input.visitTitle,
    startDate: input.startDate,
    endDate: input.endDate,
    visitorName: input.visitorName,
    company: input.company,
    city: input.city,
    arrivalInstructions: input.arrivalInstructions,
    agenda: input.agenda ?? [],
    confirmationStatus: 'pending',
  }
}

export async function getGuestLinkByToken(
  token: string,
): Promise<VisitGuestLink | null> {
  const trimmed = token.trim()
  if (!trimmed) return null

  try {
    const snap = await getDoc(doc(col, trimmed))
    if (snap.exists()) return mapGuestLink(snap.id, snap.data())
  } catch (error) {
    console.warn('Falha ao ler o link do portal pelo ID', error)
  }

  try {
    const snap = await getDocs(query(col, where('token', '==', trimmed)))
    if (snap.empty) return null
    return mapGuestLink(snap.docs[0].id, snap.docs[0].data())
  } catch {
    return null
  }
}

export async function listLinksForVisit(visitId: string): Promise<VisitGuestLink[]> {
  const snap = await getDocs(query(col, where('visitId', '==', visitId)))
  return snap.docs
    .map((d) => mapGuestLink(d.id, d.data()))
    .sort((a, b) => b.expiresAt.localeCompare(a.expiresAt))
}

export async function listLinksByOwner(ownerId: string): Promise<VisitGuestLink[]> {
  const snap = await getDocs(query(col, where('ownerId', '==', ownerId)))
  return snap.docs
    .map((d) => mapGuestLink(d.id, d.data()))
    .sort((a, b) => b.expiresAt.localeCompare(a.expiresAt))
}

export async function revokeLink(id: string): Promise<void> {
  await updateDoc(doc(col, id), {
    revoked: true,
    updatedAt: serverTimestamp(),
  })
}

/** Atualização feita pela rota pública: só confirmação e rascunho. */
export async function updateGuestPortal(
  tokenOrId: string,
  input: {
    confirmationStatus?: GuestConfirmationStatus
    visitorDraft?: GuestVisitorDraft
  },
): Promise<void> {
  const payload: Record<string, unknown> = { updatedAt: serverTimestamp() }
  if (input.confirmationStatus) {
    payload.confirmationStatus = input.confirmationStatus
  }
  if (input.visitorDraft) {
    payload.visitorDraft = {
      ...cleanDraft(input.visitorDraft),
      updatedAt: new Date().toISOString(),
    }
  }
  await updateDoc(doc(col, tokenOrId), payload)
}

export async function refreshGuestLinkSnapshot(
  id: string,
  snapshot: GuestLinkSnapshot,
): Promise<void> {
  await updateDoc(doc(col, id), {
    ...snapshotPayload(snapshot),
    updatedAt: serverTimestamp(),
  })
}

/** Copia o rascunho do portal para o cadastro do visitante e marca como aplicado. */
export async function applyVisitorDraft(
  linkId: string,
  visitorId: string,
): Promise<void> {
  const link = await getGuestLinkByToken(linkId)
  const draft = link?.visitorDraft
  if (!link || !draft) {
    throw new Error('Nenhum dado enviado pelo visitante para aplicar')
  }

  const payload: Partial<Omit<Visitor, 'id' | 'ownerId' | 'createdAt'>> = {}
  if (draft.name) payload.name = draft.name
  if (draft.document) payload.document = draft.document
  if (draft.company) payload.company = draft.company
  if (draft.role) payload.role = draft.role
  if (draft.dietaryRestriction) payload.dietaryRestriction = draft.dietaryRestriction
  if (draft.language) payload.language = draft.language
  if (draft.notes) payload.notes = draft.notes
  if (draft.mobilityReduced != null) payload.mobilityReduced = draft.mobilityReduced

  if (Object.keys(payload).length > 0) {
    await updateVisitor(visitorId, payload)
  }

  await updateDoc(doc(col, link.id), {
    lastAppliedAt: new Date().toISOString(),
    updatedAt: serverTimestamp(),
  })
}
