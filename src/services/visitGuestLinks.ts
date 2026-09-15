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
import { resolveVisitorFormVariant } from '@/features/visitors/visitorFormConfig'
import { createVisitor, updateVisitor } from '@/services/visitors'
import { linkVisitorToVisit } from '@/services/visitVisitors'
import type {
  Activity,
  GuestAgendaItem,
  GuestConfirmationStatus,
  GuestVisitorDraft,
  VisitEventKind,
  VisitGuestLink,
  Visitor,
  VisitorFlightInfo,
  VisitorFormVariant,
  VisitorSex,
} from '@/types'

const col = collection(db, 'visitGuestLinks')

const LINK_VALIDITY_DAYS = 14

const CONFIRMATION_STATUSES: GuestConfirmationStatus[] = [
  'pending',
  'confirmed',
  'declined',
]

const FORM_VARIANTS: VisitorFormVariant[] = ['vip', 'comunidade', 'geral']

function mapFlight(raw: unknown): VisitorFlightInfo | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const data = raw as Record<string, unknown>
  const info: VisitorFlightInfo = {
    origin: data.origin ? String(data.origin) : undefined,
    date: data.date ? String(data.date) : undefined,
    airline: data.airline ? String(data.airline) : undefined,
    flightNumber: data.flightNumber ? String(data.flightNumber) : undefined,
    time: data.time ? String(data.time) : undefined,
  }
  if (
    !info.origin &&
    !info.date &&
    !info.airline &&
    !info.flightNumber &&
    !info.time
  ) {
    return undefined
  }
  return info
}

function cleanFlight(
  flight: VisitorFlightInfo | undefined,
): Record<string, string | null> | null {
  if (!flight) return null
  return {
    origin: flight.origin?.trim() || null,
    date: flight.date?.trim() || null,
    airline: flight.airline?.trim() || null,
    flightNumber: flight.flightNumber?.trim() || null,
    time: flight.time?.trim() || null,
  }
}

function mapSex(value: unknown): VisitorSex | undefined {
  if (
    value === 'feminino' ||
    value === 'masculino' ||
    value === 'outro' ||
    value === 'prefiro_nao_informar'
  ) {
    return value
  }
  return undefined
}

function mapFormVariant(value: unknown): VisitorFormVariant | undefined {
  if (typeof value === 'string' && FORM_VARIANTS.includes(value as VisitorFormVariant)) {
    return value as VisitorFormVariant
  }
  return undefined
}

/**
 * O token é usado como ID do documento: a rota pública consegue fazer `get`
 * direto sem precisar de permissão de `list` na coleção.
 */
function mapGuestLink(id: string, data: Record<string, unknown>): VisitGuestLink {
  const status = data.confirmationStatus as GuestConfirmationStatus
  const draftRaw = data.visitorDraft as Record<string, unknown> | null | undefined
  const agendaRaw = Array.isArray(data.agenda) ? data.agenda : []
  const eventKind = data.eventKind as VisitEventKind | undefined
  const formVariant =
    mapFormVariant(data.formVariant) ??
    (eventKind ? resolveVisitorFormVariant(eventKind) : undefined)

  return {
    id,
    token: String(data.token ?? id),
    visitId: String(data.visitId ?? ''),
    visitorId: data.visitorId ? String(data.visitorId) : undefined,
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
    eventKind,
    formVariant,
    orgName: data.orgName ? String(data.orgName) : undefined,
    orgLogoUrl: data.orgLogoUrl ? String(data.orgLogoUrl) : undefined,
    confirmationStatus: CONFIRMATION_STATUSES.includes(status) ? status : 'pending',
    visitorDraft: draftRaw ? mapDraft(draftRaw) : undefined,
    visitorDrafts: Array.isArray(data.visitorDrafts)
      ? data.visitorDrafts
          .filter((entry): entry is Record<string, unknown> => !!entry && typeof entry === 'object')
          .map((entry) => mapDraft(entry))
      : undefined,
    lastAppliedAt: data.lastAppliedAt ? String(data.lastAppliedAt) : undefined,
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
  }
}

function mapDraft(data: Record<string, unknown>): GuestVisitorDraft {
  return {
    name: data.name ? String(data.name) : undefined,
    document: data.document ? String(data.document) : undefined,
    cpf: data.cpf ? String(data.cpf) : undefined,
    company: data.company ? String(data.company) : undefined,
    role: data.role ? String(data.role) : undefined,
    nationality: data.nationality ? String(data.nationality) : undefined,
    sex: mapSex(data.sex),
    birthDate: data.birthDate ? String(data.birthDate) : undefined,
    phone: data.phone ? String(data.phone) : undefined,
    email: data.email ? String(data.email) : undefined,
    emergencyPhone: data.emergencyPhone ? String(data.emergencyPhone) : undefined,
    neighborhood: data.neighborhood ? String(data.neighborhood) : undefined,
    weightKg: data.weightKg != null ? Number(data.weightKg) : undefined,
    shoeSize: data.shoeSize != null ? Number(data.shoeSize) : undefined,
    shirtSize: data.shirtSize ? String(data.shirtSize) : undefined,
    dietaryHasRestriction:
      data.dietaryHasRestriction == null
        ? undefined
        : data.dietaryHasRestriction === true,
    dietaryRestriction: data.dietaryRestriction
      ? String(data.dietaryRestriction)
      : undefined,
    mobilityReduced:
      data.mobilityReduced == null ? undefined : data.mobilityReduced === true,
    mobilityNotes: data.mobilityNotes ? String(data.mobilityNotes) : undefined,
    comorbidity: data.comorbidity == null ? undefined : data.comorbidity === true,
    comorbidityNotes: data.comorbidityNotes
      ? String(data.comorbidityNotes)
      : undefined,
    specialAttention:
      data.specialAttention == null ? undefined : data.specialAttention === true,
    specialAttentionNotes: data.specialAttentionNotes
      ? String(data.specialAttentionNotes)
      : undefined,
    fliesByAir: data.fliesByAir == null ? undefined : data.fliesByAir === true,
    hasFlightData:
      data.hasFlightData == null ? undefined : data.hasFlightData === true,
    arrivalFlight: mapFlight(data.arrivalFlight),
    departureFlight: mapFlight(data.departureFlight),
    hotelName: data.hotelName ? String(data.hotelName) : undefined,
    language: data.language ? String(data.language) : undefined,
    whatsapp: data.whatsapp ? String(data.whatsapp) : undefined,
    notes: data.notes ? String(data.notes) : undefined,
    lgpdConsent: data.lgpdConsent === true,
    lgpdConsentAt: data.lgpdConsentAt ? String(data.lgpdConsentAt) : undefined,
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
  result.cpf = text(draft.cpf)
  result.company = text(draft.company)
  result.role = text(draft.role)
  result.nationality = text(draft.nationality)
  result.sex = draft.sex ?? null
  result.birthDate = text(draft.birthDate)
  result.phone = text(draft.phone)
  result.email = text(draft.email)
  result.emergencyPhone = text(draft.emergencyPhone)
  result.neighborhood = text(draft.neighborhood)
  result.weightKg = draft.weightKg ?? null
  result.shoeSize = draft.shoeSize ?? null
  result.shirtSize = text(draft.shirtSize)
  result.dietaryHasRestriction = draft.dietaryHasRestriction === true
  result.dietaryRestriction = text(draft.dietaryRestriction)
  result.language = text(draft.language)
  result.whatsapp = text(draft.whatsapp)
  result.notes = text(draft.notes)
  result.mobilityReduced = draft.mobilityReduced === true
  result.mobilityNotes = text(draft.mobilityNotes)
  result.comorbidity = draft.comorbidity === true
  result.comorbidityNotes = text(draft.comorbidityNotes)
  result.specialAttention = draft.specialAttention === true
  result.specialAttentionNotes = text(draft.specialAttentionNotes)
  result.fliesByAir = draft.fliesByAir === true
  result.hasFlightData = draft.hasFlightData === true
  result.arrivalFlight = cleanFlight(draft.arrivalFlight)
  result.departureFlight = cleanFlight(draft.departureFlight)
  result.hotelName = text(draft.hotelName)
  result.lgpdConsent = draft.lgpdConsent === true
  result.lgpdConsentAt = draft.lgpdConsent === true
    ? (draft.lgpdConsentAt?.trim() || new Date().toISOString())
    : null
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

/** Link de pré-cadastro da visita (sem visitante pré-vinculado). */
export function isVisitIntakeLink(link: VisitGuestLink): boolean {
  return !link.visitorId
}

/** Rascunhos pendentes: array (intake) ou rascunho único (compat). */
export function getGuestDrafts(link: VisitGuestLink): GuestVisitorDraft[] {
  if (link.visitorDrafts && link.visitorDrafts.length > 0) {
    return link.visitorDrafts
  }
  if (link.visitorDraft) return [link.visitorDraft]
  return []
}

function latestDraftUpdatedAt(link: VisitGuestLink): string | undefined {
  const stamps = getGuestDrafts(link)
    .map((draft) => draft.updatedAt)
    .filter((value): value is string => Boolean(value))
  if (stamps.length === 0) return undefined
  return stamps.sort().at(-1)
}

/** O visitante enviou dados que o operador ainda não aplicou no CRM. */
export function hasPendingGuestDraft(link: VisitGuestLink): boolean {
  const draftUpdatedAt = latestDraftUpdatedAt(link)
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
  orgName?: string
  orgLogoUrl?: string
  eventKind?: VisitEventKind
  formVariant?: VisitorFormVariant
}

export interface CreateGuestLinkInput extends GuestLinkSnapshot {
  visitId: string
  visitorId: string
  createdBy: string
  ownerId: string
}

export interface CreateVisitIntakeLinkInput extends GuestLinkSnapshot {
  visitId: string
  createdBy: string
  ownerId: string
}

function snapshotPayload(snapshot: GuestLinkSnapshot): Record<string, unknown> {
  const formVariant =
    snapshot.formVariant ??
    (snapshot.eventKind
      ? resolveVisitorFormVariant(snapshot.eventKind)
      : undefined)
  return {
    visitTitle: snapshot.visitTitle,
    startDate: snapshot.startDate,
    endDate: snapshot.endDate,
    visitorName: snapshot.visitorName,
    company: snapshot.company ?? null,
    city: snapshot.city ?? null,
    arrivalInstructions: snapshot.arrivalInstructions ?? null,
    agenda: snapshot.agenda ?? [],
    orgName: snapshot.orgName ?? null,
    orgLogoUrl: snapshot.orgLogoUrl ?? null,
    eventKind: snapshot.eventKind ?? null,
    formVariant: formVariant ?? null,
  }
}

export async function createGuestLink(
  input: CreateGuestLinkInput,
): Promise<VisitGuestLink> {
  const token = crypto.randomUUID().replace(/-/g, '')
  const expires = new Date()
  expires.setDate(expires.getDate() + LINK_VALIDITY_DAYS)
  const expiresAt = expires.toISOString()
  const formVariant =
    input.formVariant ??
    (input.eventKind ? resolveVisitorFormVariant(input.eventKind) : undefined)

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
    eventKind: input.eventKind,
    formVariant,
    orgName: input.orgName,
    orgLogoUrl: input.orgLogoUrl,
    confirmationStatus: 'pending',
  }
}

/** Link público de pré-cadastro ligado à visita (sem visitorId). */
export async function createVisitIntakeLink(
  input: CreateVisitIntakeLinkInput,
): Promise<VisitGuestLink> {
  const token = crypto.randomUUID().replace(/-/g, '')
  const expires = new Date()
  expires.setDate(expires.getDate() + LINK_VALIDITY_DAYS)
  const expiresAt = expires.toISOString()
  const formVariant =
    input.formVariant ??
    (input.eventKind ? resolveVisitorFormVariant(input.eventKind) : undefined)
  const visitorName = input.visitorName?.trim() || 'Pré-cadastro da visita'

  await setDoc(doc(col, token), {
    token,
    visitId: input.visitId,
    visitorId: '',
    ownerId: input.ownerId,
    createdBy: input.createdBy,
    expiresAt,
    expiresAtTs: Timestamp.fromDate(expires),
    revoked: false,
    ...snapshotPayload({ ...input, visitorName }),
    confirmationStatus: 'pending',
    visitorDraft: null,
    visitorDrafts: [],
    lastAppliedAt: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })

  return {
    id: token,
    token,
    visitId: input.visitId,
    ownerId: input.ownerId,
    createdBy: input.createdBy,
    expiresAt,
    revoked: false,
    visitTitle: input.visitTitle,
    startDate: input.startDate,
    endDate: input.endDate,
    visitorName,
    company: input.company,
    city: input.city,
    arrivalInstructions: input.arrivalInstructions,
    agenda: input.agenda ?? [],
    eventKind: input.eventKind,
    formVariant,
    orgName: input.orgName,
    orgLogoUrl: input.orgLogoUrl,
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

/** Atualização feita pela rota pública: só confirmação e rascunho(s). */
export async function updateGuestPortal(
  tokenOrId: string,
  input: {
    confirmationStatus?: GuestConfirmationStatus
    visitorDraft?: GuestVisitorDraft
    visitorDrafts?: GuestVisitorDraft[]
  },
): Promise<void> {
  const payload: Record<string, unknown> = { updatedAt: serverTimestamp() }
  if (input.confirmationStatus) {
    payload.confirmationStatus = input.confirmationStatus
  }

  const now = new Date().toISOString()
  if (input.visitorDrafts && input.visitorDrafts.length > 1) {
    const cleaned = input.visitorDrafts.map((draft) => ({
      ...cleanDraft(draft),
      updatedAt: now,
    }))
    payload.visitorDrafts = cleaned
    payload.visitorDraft = cleaned[0]
  } else if (input.visitorDrafts && input.visitorDrafts.length === 1) {
    // 1 draft: só visitorDraft (compatível com rules antigas sem visitorDrafts)
    payload.visitorDraft = {
      ...cleanDraft(input.visitorDrafts[0]),
      updatedAt: now,
    }
  } else if (input.visitorDraft) {
    payload.visitorDraft = {
      ...cleanDraft(input.visitorDraft),
      updatedAt: now,
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

function draftToVisitorUpdate(
  draft: GuestVisitorDraft,
): Partial<Omit<Visitor, 'id' | 'ownerId' | 'createdAt'>> {
  const payload: Partial<Omit<Visitor, 'id' | 'ownerId' | 'createdAt'>> = {}
  if (draft.name) payload.name = draft.name
  if (draft.document) payload.document = draft.document
  if (draft.cpf) payload.cpf = draft.cpf
  if (draft.company) payload.company = draft.company
  if (draft.role) payload.role = draft.role
  if (draft.nationality) payload.nationality = draft.nationality
  if (draft.sex) payload.sex = draft.sex
  if (draft.birthDate) payload.birthDate = draft.birthDate
  if (draft.phone) payload.phone = draft.phone
  if (draft.email) payload.email = draft.email
  if (draft.emergencyPhone) payload.emergencyPhone = draft.emergencyPhone
  if (draft.neighborhood) payload.neighborhood = draft.neighborhood
  if (draft.weightKg != null) payload.weightKg = draft.weightKg
  if (draft.shoeSize != null) payload.shoeSize = draft.shoeSize
  if (draft.shirtSize) payload.shirtSize = draft.shirtSize
  if (draft.dietaryHasRestriction != null) {
    payload.dietaryHasRestriction = draft.dietaryHasRestriction
  }
  if (draft.dietaryRestriction) payload.dietaryRestriction = draft.dietaryRestriction
  if (draft.language) payload.language = draft.language
  if (draft.whatsapp) payload.whatsapp = draft.whatsapp
  if (draft.notes) payload.notes = draft.notes
  if (draft.mobilityReduced != null) payload.mobilityReduced = draft.mobilityReduced
  if (draft.mobilityNotes) payload.mobilityNotes = draft.mobilityNotes
  if (draft.comorbidity != null) payload.comorbidity = draft.comorbidity
  if (draft.comorbidityNotes) payload.comorbidityNotes = draft.comorbidityNotes
  if (draft.specialAttention != null) payload.specialAttention = draft.specialAttention
  if (draft.specialAttentionNotes) {
    payload.specialAttentionNotes = draft.specialAttentionNotes
  }
  if (draft.fliesByAir != null) payload.fliesByAir = draft.fliesByAir
  if (draft.hasFlightData != null) payload.hasFlightData = draft.hasFlightData
  if (draft.arrivalFlight) payload.arrivalFlight = draft.arrivalFlight
  if (draft.departureFlight) payload.departureFlight = draft.departureFlight
  if (draft.hotelName) payload.hotelName = draft.hotelName
  if (draft.lgpdConsent === true) {
    payload.lgpdConsent = true
    payload.lgpdConsentAt =
      draft.lgpdConsentAt?.trim() || new Date().toISOString()
  }
  return payload
}

/** Copia o rascunho do portal para o cadastro do visitante e marca como aplicado. */
export async function applyVisitorDraft(
  linkId: string,
  visitorId: string,
): Promise<void> {
  const link = await getGuestLinkByToken(linkId)
  const draft = getGuestDrafts(link ?? ({} as VisitGuestLink))[0] ?? link?.visitorDraft
  if (!link || !draft) {
    throw new Error('Nenhum dado enviado pelo visitante para aplicar')
  }

  const payload = draftToVisitorUpdate(draft)
  if (Object.keys(payload).length > 0) {
    await updateVisitor(visitorId, payload)
  }

  await updateDoc(doc(col, link.id), {
    lastAppliedAt: new Date().toISOString(),
    updatedAt: serverTimestamp(),
  })
}

/**
 * Aplica N rascunhos do link de pré-cadastro da visita:
 * cria/atualiza visitors, vincula à visita e marca lastAppliedAt.
 */
export async function applyVisitIntakeDrafts(input: {
  linkId: string
  ownerId: string
  orgId: string
  /** Se o link for por visitante único, atualiza este ID em vez de criar. */
  existingVisitorId?: string
}): Promise<{ visitorIds: string[] }> {
  const link = await getGuestLinkByToken(input.linkId)
  if (!link) throw new Error('Link do portal não encontrado')

  const drafts = getGuestDrafts(link)
  if (drafts.length === 0) {
    throw new Error('Nenhum dado enviado pelo visitante para aplicar')
  }

  const visitorIds: string[] = []

  for (let index = 0; index < drafts.length; index += 1) {
    const draft = drafts[index]
    const payload = draftToVisitorUpdate(draft)
    const name = payload.name?.trim()
    const document = payload.document?.trim()
    if (!name || !document) {
      throw new Error(
        `Visitante ${index + 1}: informe nome e documento antes de aplicar`,
      )
    }

    const targetVisitorId =
      index === 0 && (input.existingVisitorId || link.visitorId)
        ? (input.existingVisitorId || link.visitorId)!
        : null

    if (targetVisitorId) {
      await updateVisitor(targetVisitorId, payload)
      await linkVisitorToVisit(input.ownerId, link.visitId, targetVisitorId)
      visitorIds.push(targetVisitorId)
    } else {
      const createdId = await createVisitor(input.ownerId, input.orgId, {
        name,
        document,
        ...payload,
      })
      await linkVisitorToVisit(input.ownerId, link.visitId, createdId)
      visitorIds.push(createdId)
    }
  }

  await updateDoc(doc(col, link.id), {
    lastAppliedAt: new Date().toISOString(),
    updatedAt: serverTimestamp(),
  })

  return { visitorIds }
}
