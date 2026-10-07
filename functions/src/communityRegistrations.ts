import { createHash, randomUUID } from 'node:crypto'
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { FieldValue, Timestamp, getFirestore } from 'firebase-admin/firestore'
import { getTwilioConfigStatus, sendTwilioMessage } from './twilio'

const db = getFirestore()
const COMMUNITY_KINDS = new Set(['visita_comunidade', 'comunidade_prioritaria'])
const CONFIRMATION_VALIDITY_DAYS = 14

type Draft = Record<string, unknown>

function string(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function registrationId(visitId: string, document: string): string {
  return createHash('sha256')
    .update(`${visitId}:${document.replace(/\W/g, '').toLowerCase()}`)
    .digest('hex')
}

function isCommunityIntake(data: FirebaseFirestore.DocumentData): boolean {
  return data.purpose === 'community_intake' && COMMUNITY_KINDS.has(String(data.eventKind ?? ''))
}

function cleanDraft(raw: unknown): Draft {
  if (!raw || typeof raw !== 'object') return {}
  const allowed = [
    'name', 'document', 'cpf', 'company', 'role', 'nationality', 'sex', 'birthDate',
    'phone', 'email', 'emergencyPhone', 'neighborhood', 'weightKg', 'shoeSize',
    'shirtSize', 'dietaryHasRestriction', 'dietaryRestriction', 'mobilityReduced',
    'mobilityNotes', 'comorbidity', 'comorbidityNotes', 'specialAttention',
    'specialAttentionNotes', 'whatsapp', 'notes', 'lgpdConsent', 'lgpdConsentAt',
  ]
  const input = raw as Record<string, unknown>
  return Object.fromEntries(allowed.filter((key) => input[key] !== undefined).map((key) => [key, input[key]]))
}

function confirmationExpiry() {
  const date = new Date()
  date.setDate(date.getDate() + CONFIRMATION_VALIDITY_DAYS)
  return date
}

async function loadCommunityIntake(token: string) {
  const ref = db.collection('visitGuestLinks').doc(token)
  const snap = await ref.get()
  if (!snap.exists || !isCommunityIntake(snap.data()!)) {
    throw new HttpsError('not-found', 'Link de inscrição não encontrado.')
  }
  const data = snap.data()!
  if (data.revoked === true) throw new HttpsError('failed-precondition', 'Link de inscrição cancelado.')
  const expires = data.expiresAtTs as Timestamp | undefined
  if (expires && expires.toDate().getTime() < Date.now()) {
    throw new HttpsError('failed-precondition', 'Link de inscrição expirado.')
  }
  return { ref, data }
}

function availableDates(visit: FirebaseFirestore.DocumentData) {
  const capacity = (visit.communityDailyCapacity ?? {}) as Record<string, unknown>
  const occupancy = (visit.communityDailyOccupancy ?? {}) as Record<string, unknown>
  return Object.entries(capacity)
    .map(([date, raw]) => ({
      date,
      capacity: Number(raw ?? 0),
      occupied: Number(occupancy[date] ?? 0),
    }))
    .filter((item) => item.capacity > item.occupied)
    .sort((a, b) => a.date.localeCompare(b.date))
}

export const getCommunityRegistrationAvailability = onCall(async (request) => {
  const token = string(request.data?.token)
  if (!token) throw new HttpsError('invalid-argument', 'Link de inscrição inválido.')
  const { data } = await loadCommunityIntake(token)
  const visitSnap = await db.collection('visits').doc(String(data.visitId)).get()
  if (!visitSnap.exists) throw new HttpsError('not-found', 'Experiência não encontrada.')
  return { dates: availableDates(visitSnap.data()!) }
})

export const submitCommunityRegistration = onCall(async (request) => {
  const token = string(request.data?.token)
  const registrationDate = string(request.data?.registrationDate)
  const draft = cleanDraft(request.data?.draft)
  const name = string(draft.name)
  const document = string(draft.document)
  if (!token || !registrationDate || !name || !document || draft.lgpdConsent !== true) {
    throw new HttpsError('invalid-argument', 'Preencha nome, documento, data e aceite LGPD.')
  }

  const { data: intake } = await loadCommunityIntake(token)
  const visitId = String(intake.visitId)
  const linkId = registrationId(visitId, document)
  const registrationRef = db.collection('visitGuestLinks').doc(linkId)
  const result = await db.runTransaction(async (transaction) => {
    const [visitSnap, existingSnap] = await Promise.all([
      transaction.get(db.collection('visits').doc(visitId)),
      transaction.get(registrationRef),
    ])
    if (!visitSnap.exists) throw new HttpsError('not-found', 'Experiência não encontrada.')
    const visit = visitSnap.data()!
    if (!COMMUNITY_KINDS.has(String(visit.eventKind ?? ''))) {
      throw new HttpsError('failed-precondition', 'Esta experiência não aceita inscrições de comunidade.')
    }
    if (existingSnap.exists) {
      return { registrationLinkId: existingSnap.id, alreadyRegistered: true }
    }
    const capacity = Number((visit.communityDailyCapacity ?? {})[registrationDate] ?? 0)
    const occupied = Number((visit.communityDailyOccupancy ?? {})[registrationDate] ?? 0)
    if (!capacity) throw new HttpsError('invalid-argument', 'Data de inscrição indisponível.')
    if (occupied >= capacity) throw new HttpsError('resource-exhausted', 'Esta data acabou de atingir o limite de vagas.')

    const visitorRef = db.collection('visitors').doc()
    const visitVisitorRef = db.collection('visitVisitors').doc()
    const confirmationToken = randomUUID().replace(/-/g, '')
    const now = new Date().toISOString()
    transaction.create(visitorRef, {
      ...draft,
      name,
      document,
      ownerId: String(visit.ownerId ?? intake.ownerId),
      orgId: String(visit.orgId),
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    })
    transaction.create(visitVisitorRef, {
      visitId,
      visitorId: visitorRef.id,
      ownerId: String(visit.ownerId ?? intake.ownerId),
      registrationStatus: 'pending_review',
      registrationDate,
      registrationLinkId: linkId,
      createdAt: FieldValue.serverTimestamp(),
    })
    transaction.create(registrationRef, {
      token: confirmationToken,
      confirmationToken,
      visitId,
      visitorId: visitorRef.id,
      visitVisitorId: visitVisitorRef.id,
      ownerId: String(visit.ownerId ?? intake.ownerId),
      createdBy: 'community-portal',
      sourceLinkId: token,
      purpose: 'community_registration',
      registrationStatus: 'pending_review',
      registrationDate,
      confirmationStatus: 'pending',
      expiresAt: '',
      revoked: false,
      visitTitle: String(visit.title ?? intake.visitTitle ?? ''),
      startDate: String(visit.startDate ?? intake.startDate ?? ''),
      endDate: String(visit.endDate ?? intake.endDate ?? ''),
      visitorName: name,
      company: string(draft.company) || null,
      city: String(visit.city ?? intake.city ?? '') || null,
      orgName: intake.orgName ?? null,
      orgLogoUrl: intake.orgLogoUrl ?? null,
      eventKind: visit.eventKind,
      formVariant: 'comunidade',
      visitorDraft: { ...draft, name, document, updatedAt: now },
      lastAppliedAt: now,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    })
    transaction.update(visitSnap.ref, {
      [`communityDailyOccupancy.${registrationDate}`]: occupied + 1,
      updatedAt: FieldValue.serverTimestamp(),
    })
    return { registrationLinkId: linkId, alreadyRegistered: false }
  })
  return result
})

async function requireReviewer(auth: { uid: string; token: Record<string, unknown> } | undefined, visit: FirebaseFirestore.DocumentData) {
  if (!auth?.uid) throw new HttpsError('unauthenticated', 'Faça login para analisar inscrições.')
  const token = auth.token ?? {}
  if (token.admin === true || token.platformAdmin === true || token.role === 'admin') return
  const memberId = `${String(visit.orgId)}_${auth.uid}`
  const member = await db.collection('organizationMembers').doc(memberId).get()
  if (member.exists && member.get('orgRole') === 'org_admin') return
  throw new HttpsError('permission-denied', 'Apenas Master ou Admin podem analisar inscrições.')
}

async function registrationForReview(linkId: string, auth: { uid: string; token: Record<string, unknown> } | undefined) {
  const ref = db.collection('visitGuestLinks').doc(linkId)
  const snap = await ref.get()
  if (!snap.exists || snap.get('purpose') !== 'community_registration') {
    throw new HttpsError('not-found', 'Inscrição não encontrada.')
  }
  const visitSnap = await db.collection('visits').doc(String(snap.get('visitId'))).get()
  if (!visitSnap.exists) throw new HttpsError('not-found', 'Experiência não encontrada.')
  await requireReviewer(auth, visitSnap.data()!)
  return { ref, data: snap.data()!, visit: visitSnap.data()! }
}

export const reviewCommunityRegistration = onCall(async (request) => {
  const linkId = string(request.data?.linkId)
  const decision = string(request.data?.decision)
  if (!linkId || (decision !== 'approve' && decision !== 'reject')) {
    throw new HttpsError('invalid-argument', 'Decisão de análise inválida.')
  }
  const { ref, data } = await registrationForReview(linkId, request.auth)
  if (data.registrationStatus !== 'pending_review') {
    throw new HttpsError('failed-precondition', 'Esta inscrição já foi analisada.')
  }
  if (decision === 'reject') {
    await db.runTransaction(async (transaction) => {
      const visitRef = db.collection('visits').doc(String(data.visitId))
      const visitSnap = await transaction.get(visitRef)
      const occupied = Number((visitSnap.get('communityDailyOccupancy') ?? {})[data.registrationDate] ?? 0)
      transaction.update(visitRef, {
        [`communityDailyOccupancy.${data.registrationDate}`]: Math.max(0, occupied - 1),
        updatedAt: FieldValue.serverTimestamp(),
      })
      transaction.update(ref, { registrationStatus: 'rejected', updatedAt: FieldValue.serverTimestamp() })
      transaction.update(db.collection('visitVisitors').doc(String(data.visitVisitorId)), { registrationStatus: 'rejected' })
    })
    return { status: 'rejected' }
  }
  const expires = confirmationExpiry()
  await db.runTransaction(async (transaction) => {
    transaction.update(ref, {
      registrationStatus: 'approved_pending_confirmation',
      expiresAt: expires.toISOString(),
      expiresAtTs: Timestamp.fromDate(expires),
      updatedAt: FieldValue.serverTimestamp(),
    })
    transaction.update(db.collection('visitVisitors').doc(String(data.visitVisitorId)), {
      registrationStatus: 'approved_pending_confirmation',
    })
  })
  return { status: 'approved_pending_confirmation' }
})

export const getCommunityConfirmation = onCall(async (request) => {
  const token = string(request.data?.token)
  const snap = await db.collection('visitGuestLinks').where('confirmationToken', '==', token).limit(1).get()
  const doc = snap.docs[0]
  if (!doc || doc.get('purpose') !== 'community_registration') throw new HttpsError('not-found', 'Link de confirmação inválido.')
  const data = doc.data()
  const expires = data.expiresAtTs as Timestamp | undefined
  if (data.revoked || !expires || expires.toDate().getTime() < Date.now()) throw new HttpsError('failed-precondition', 'Link de confirmação expirado ou cancelado.')
  return {
    visitorName: String(data.visitorName ?? ''),
    visitTitle: String(data.visitTitle ?? ''),
    registrationDate: String(data.registrationDate ?? ''),
    status: String(data.registrationStatus ?? ''),
  }
})

export const confirmCommunityPresence = onCall(async (request) => {
  const token = string(request.data?.token)
  const snap = await db.collection('visitGuestLinks').where('confirmationToken', '==', token).limit(1).get()
  const doc = snap.docs[0]
  if (!doc || doc.get('purpose') !== 'community_registration') throw new HttpsError('not-found', 'Link de confirmação inválido.')
  const data = doc.data()
  const expires = data.expiresAtTs as Timestamp | undefined
  if (data.revoked || !expires || expires.toDate().getTime() < Date.now()) throw new HttpsError('failed-precondition', 'Link de confirmação expirado ou cancelado.')
  if (data.registrationStatus === 'confirmed') return { status: 'confirmed', alreadyConfirmed: true }
  if (data.registrationStatus !== 'approved_pending_confirmation') throw new HttpsError('failed-precondition', 'Esta inscrição ainda não está liberada para confirmação.')
  await db.runTransaction(async (transaction) => {
    transaction.update(doc.ref, { registrationStatus: 'confirmed', confirmationStatus: 'confirmed', updatedAt: FieldValue.serverTimestamp() })
    transaction.update(db.collection('visitVisitors').doc(String(data.visitVisitorId)), { registrationStatus: 'confirmed' })
  })
  return { status: 'confirmed', alreadyConfirmed: false }
})

export const sendCommunityConfirmationWhatsApp = onCall(async (request) => {
  const linkId = string(request.data?.linkId)
  const { ref, data } = await registrationForReview(linkId, request.auth)
  if (data.registrationStatus !== 'approved_pending_confirmation') {
    throw new HttpsError('failed-precondition', 'A inscrição precisa estar aprovada e aguardando confirmação.')
  }
  const phone = string(data.visitorDraft?.whatsapp) || string(data.visitorDraft?.phone)
  const config = getTwilioConfigStatus()
  if (!config.configured || !config.hasWhatsAppFrom) {
    await ref.update({ confirmationSendStatus: 'not_configured', updatedAt: FieldValue.serverTimestamp() })
    throw new HttpsError('failed-precondition', 'WhatsApp Business ainda não está configurado.')
  }
  const origin = process.env.APP_ORIGIN?.trim() || 'https://programa-visitas-72be9.web.app'
  const url = `${origin}/confirmar-presenca/${String(data.confirmationToken)}`
  const result = await sendTwilioMessage(phone, `Olá ${String(data.visitorName ?? '')}, sua inscrição foi aprovada. Confirme sua presença: ${url}`)
  await ref.update({
    confirmationSendStatus: result.status === 'sent' ? 'sent' : 'error',
    confirmationSentAt: new Date().toISOString(),
    updatedAt: FieldValue.serverTimestamp(),
  })
  if (result.status !== 'sent') throw new HttpsError('internal', result.detail ?? 'Não foi possível enviar pelo WhatsApp.')
  return { status: 'sent' }
})
