import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { logger } from 'firebase-functions'
import { getFirestore } from 'firebase-admin/firestore'

const db = getFirestore()

const WINDOW_MS = 60_000
const MAX_PER_WINDOW = 12
const buckets = new Map<string, { count: number; resetAt: number }>()

function assertLookupRateLimit(key: string): void {
  const now = Date.now()
  const current = buckets.get(key)
  if (!current || now >= current.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + WINDOW_MS })
    return
  }
  if (current.count >= MAX_PER_WINDOW) {
    throw new HttpsError(
      'resource-exhausted',
      'Muitas buscas. Aguarde um momento e tente de novo.',
    )
  }
  current.count += 1
}

function normalizeName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

export interface GuestLookupResult {
  found: boolean
  visitor?: {
    name: string
    document?: string
    cpf?: string
    company?: string
    role?: string
    nationality?: string
    sex?: string
    birthDate?: string
    phone?: string
    email?: string
    emergencyPhone?: string
    neighborhood?: string
    weightKg?: number
    shoeSize?: number
    shirtSize?: string
    dietaryHasRestriction?: boolean
    dietaryRestriction?: string
    mobilityReduced?: boolean
    mobilityNotes?: string
    comorbidity?: boolean
    comorbidityNotes?: string
    specialAttention?: boolean
    specialAttentionNotes?: string
    language?: string
    whatsapp?: string
    hotelName?: string
    notes?: string
  }
}

/**
 * Lookup público (sem auth) protegido pelo token do portal.
 * Não lista visitantes: só devolve match por nome normalizado na mesma org.
 */
export const guestLookupVisitorByName = onCall(
  { invoker: 'public' },
  async (request): Promise<GuestLookupResult> => {
    const token = String(request.data?.token ?? '').trim()
    const fullName = String(request.data?.fullName ?? '').trim()

    if (!token || token.length < 16) {
      throw new HttpsError('invalid-argument', 'Token do portal inválido.')
    }
    if (fullName.length < 3) {
      throw new HttpsError('invalid-argument', 'Informe o nome completo.')
    }

    assertLookupRateLimit(`lookup:${token}`)

    const linkSnap = await db.collection('visitGuestLinks').doc(token).get()
    if (!linkSnap.exists) {
      throw new HttpsError('not-found', 'Link do portal não encontrado.')
    }

    const link = linkSnap.data() ?? {}
    if (link.revoked === true) {
      throw new HttpsError('failed-precondition', 'Link cancelado.')
    }

    const expiresAtTs = link.expiresAtTs?.toMillis?.()
      ?? (link.expiresAt ? Date.parse(String(link.expiresAt)) : NaN)
    if (Number.isFinite(expiresAtTs) && expiresAtTs < Date.now()) {
      throw new HttpsError('failed-precondition', 'Link expirado.')
    }

    const visitId = String(link.visitId ?? '')
    if (!visitId) {
      throw new HttpsError('failed-precondition', 'Link sem visita vinculada.')
    }

    const visitSnap = await db.collection('visits').doc(visitId).get()
    if (!visitSnap.exists) {
      throw new HttpsError('not-found', 'Visita não encontrada.')
    }
    const orgId = String(visitSnap.get('orgId') ?? '')
    if (!orgId) {
      throw new HttpsError('failed-precondition', 'Visita sem organização.')
    }

    const needle = normalizeName(fullName)
    const visitorsSnap = await db
      .collection('visitors')
      .where('orgId', '==', orgId)
      .get()

    const match = visitorsSnap.docs.find((docSnap) => {
      const data = docSnap.data()
      if (data.isDeleted === true) return false
      return normalizeName(String(data.name ?? '')) === needle
    })

    if (!match) {
      logger.info('guestLookupVisitorByName: sem match', { token, orgId })
      return { found: false }
    }

    const data = match.data()
    return {
      found: true,
      visitor: {
        name: String(data.name ?? ''),
        document: data.document ? String(data.document) : undefined,
        cpf: data.cpf ? String(data.cpf) : undefined,
        company: data.company ? String(data.company) : undefined,
        role: data.role ? String(data.role) : undefined,
        nationality: data.nationality ? String(data.nationality) : undefined,
        sex: data.sex ? String(data.sex) : undefined,
        birthDate: data.birthDate ? String(data.birthDate) : undefined,
        phone: data.phone ? String(data.phone) : undefined,
        email: data.email ? String(data.email) : undefined,
        emergencyPhone: data.emergencyPhone
          ? String(data.emergencyPhone)
          : undefined,
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
        comorbidity:
          data.comorbidity == null ? undefined : data.comorbidity === true,
        comorbidityNotes: data.comorbidityNotes
          ? String(data.comorbidityNotes)
          : undefined,
        specialAttention:
          data.specialAttention == null
            ? undefined
            : data.specialAttention === true,
        specialAttentionNotes: data.specialAttentionNotes
          ? String(data.specialAttentionNotes)
          : undefined,
        language: data.language ? String(data.language) : undefined,
        whatsapp: data.whatsapp ? String(data.whatsapp) : undefined,
        hotelName: data.hotelName ? String(data.hotelName) : undefined,
        notes: data.notes ? String(data.notes) : undefined,
      },
    }
  },
)
