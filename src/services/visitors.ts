import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { isActiveRecord } from '@/lib/trash'
import { softDeleteEntity } from '@/services/trash'
import type { Visitor, VisitorFlightInfo, VisitorSex } from '@/types'

const visitorsCol = collection(db, 'visitors')

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
  flight: VisitorFlightInfo | undefined | null,
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

function mapVisitor(id: string, data: Record<string, unknown>): Visitor {
  const giftsRaw = Array.isArray(data.gifts) ? data.gifts : []
  return {
    id,
    name: String(data.name ?? ''),
    document: String(data.document ?? ''),
    cpf: data.cpf ? String(data.cpf) : undefined,
    company: data.company ? String(data.company) : undefined,
    role: data.role ? String(data.role) : undefined,
    country: data.country ? String(data.country) : undefined,
    nationality: data.nationality ? String(data.nationality) : undefined,
    sex: mapSex(data.sex),
    birthDate: data.birthDate ? String(data.birthDate) : undefined,
    phone: data.phone ? String(data.phone) : undefined,
    email: data.email ? String(data.email) : undefined,
    emergencyPhone: data.emergencyPhone ? String(data.emergencyPhone) : undefined,
    weightKg: data.weightKg != null ? Number(data.weightKg) : undefined,
    shoeSize: data.shoeSize != null ? Number(data.shoeSize) : undefined,
    shirtSize: data.shirtSize ? String(data.shirtSize) : undefined,
    neighborhood: data.neighborhood ? String(data.neighborhood) : undefined,
    dietaryHasRestriction:
      data.dietaryHasRestriction == null
        ? undefined
        : data.dietaryHasRestriction === true,
    dietaryRestriction: data.dietaryRestriction
      ? String(data.dietaryRestriction)
      : undefined,
    language: data.language ? String(data.language) : undefined,
    whatsapp: data.whatsapp ? String(data.whatsapp) : undefined,
    mobilityReduced: data.mobilityReduced === true,
    mobilityNotes: data.mobilityNotes ? String(data.mobilityNotes) : undefined,
    comorbidity: data.comorbidity === true,
    comorbidityNotes: data.comorbidityNotes
      ? String(data.comorbidityNotes)
      : undefined,
    specialAttention: data.specialAttention === true,
    specialAttentionNotes: data.specialAttentionNotes
      ? String(data.specialAttentionNotes)
      : undefined,
    fliesByAir: data.fliesByAir === true,
    hasFlightData: data.hasFlightData === true,
    arrivalFlight: mapFlight(data.arrivalFlight),
    departureFlight: mapFlight(data.departureFlight),
    hotelName: data.hotelName ? String(data.hotelName) : undefined,
    notes: data.notes ? String(data.notes) : undefined,
    gifts: giftsRaw.map((g) => {
      const item = g as Record<string, unknown>
      return {
        name: String(item.name ?? ''),
        quantity: item.quantity != null ? Number(item.quantity) : undefined,
        notes: item.notes ? String(item.notes) : undefined,
      }
    }),
    lgpdConsent: data.lgpdConsent === true,
    lgpdConsentAt: data.lgpdConsentAt ? String(data.lgpdConsentAt) : undefined,
    ownerId: String(data.ownerId ?? ''),
    orgId: String(data.orgId ?? ''),
    isDeleted: data.isDeleted === true,
    deletedAt: data.deletedAt,
    deletedBy: data.deletedBy ? String(data.deletedBy) : undefined,
    expiresAt: data.expiresAt,
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
  }
}

export async function getVisitor(id: string): Promise<Visitor | null> {
  const snap = await getDoc(doc(visitorsCol, id))
  if (!snap.exists()) return null
  const data = snap.data() as Record<string, unknown>
  if (!isActiveRecord(data)) return null
  return mapVisitor(snap.id, data)
}

export async function getVisitorsByIds(ids: string[]): Promise<Visitor[]> {
  const unique = [...new Set(ids.filter(Boolean))]
  if (unique.length === 0) return []
  const results = await Promise.all(unique.map((id) => getVisitor(id)))
  return results
    .filter((v): v is Visitor => v != null)
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
}

export async function listVisitors(orgId: string): Promise<Visitor[]> {
  if (!orgId) return []
  const snap = await getDocs(query(visitorsCol, where('orgId', '==', orgId)))
  return snap.docs
    .filter((d) => isActiveRecord(d.data()))
    .map((d) => mapVisitor(d.id, d.data()))
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
}

function sanitizeGifts(
  gifts: Visitor['gifts'] | undefined,
): { name: string; quantity: number | null; notes: string | null }[] {
  return (gifts ?? [])
    .filter((g) => g.name?.trim())
    .map((g) => ({
      name: g.name.trim(),
      quantity: g.quantity != null && Number.isFinite(g.quantity) ? g.quantity : null,
      notes: g.notes?.trim() ? g.notes.trim() : null,
    }))
}

function omitUndefined<T extends Record<string, unknown>>(data: T): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(data).filter(([, value]) => value !== undefined),
  )
}

function visitorWritePayload(
  data: Partial<Omit<Visitor, 'id' | 'ownerId' | 'orgId' | 'createdAt' | 'updatedAt'>>,
): Record<string, unknown> {
  return omitUndefined({
    name: data.name,
    document: data.document,
    cpf: data.cpf !== undefined ? data.cpf || null : undefined,
    company: data.company !== undefined ? data.company || null : undefined,
    role: data.role !== undefined ? data.role || null : undefined,
    country: data.country !== undefined ? data.country || null : undefined,
    nationality:
      data.nationality !== undefined ? data.nationality || null : undefined,
    sex: data.sex !== undefined ? data.sex || null : undefined,
    birthDate: data.birthDate !== undefined ? data.birthDate || null : undefined,
    phone: data.phone !== undefined ? data.phone || null : undefined,
    email: data.email !== undefined ? data.email || null : undefined,
    emergencyPhone:
      data.emergencyPhone !== undefined ? data.emergencyPhone || null : undefined,
    whatsapp: data.whatsapp !== undefined ? data.whatsapp || null : undefined,
    language: data.language !== undefined ? data.language || null : undefined,
    neighborhood:
      data.neighborhood !== undefined ? data.neighborhood || null : undefined,
    weightKg: data.weightKg !== undefined ? data.weightKg ?? null : undefined,
    shoeSize: data.shoeSize !== undefined ? data.shoeSize ?? null : undefined,
    shirtSize: data.shirtSize !== undefined ? data.shirtSize || null : undefined,
    dietaryHasRestriction:
      data.dietaryHasRestriction !== undefined
        ? data.dietaryHasRestriction
        : undefined,
    dietaryRestriction:
      data.dietaryRestriction !== undefined
        ? data.dietaryRestriction || null
        : undefined,
    mobilityReduced:
      data.mobilityReduced !== undefined ? data.mobilityReduced : undefined,
    mobilityNotes:
      data.mobilityNotes !== undefined ? data.mobilityNotes || null : undefined,
    comorbidity: data.comorbidity !== undefined ? data.comorbidity : undefined,
    comorbidityNotes:
      data.comorbidityNotes !== undefined
        ? data.comorbidityNotes || null
        : undefined,
    specialAttention:
      data.specialAttention !== undefined ? data.specialAttention : undefined,
    specialAttentionNotes:
      data.specialAttentionNotes !== undefined
        ? data.specialAttentionNotes || null
        : undefined,
    fliesByAir: data.fliesByAir !== undefined ? data.fliesByAir : undefined,
    hasFlightData:
      data.hasFlightData !== undefined ? data.hasFlightData : undefined,
    arrivalFlight:
      data.arrivalFlight !== undefined
        ? cleanFlight(data.arrivalFlight)
        : undefined,
    departureFlight:
      data.departureFlight !== undefined
        ? cleanFlight(data.departureFlight)
        : undefined,
    hotelName: data.hotelName !== undefined ? data.hotelName || null : undefined,
    notes: data.notes !== undefined ? data.notes || null : undefined,
    gifts: data.gifts !== undefined ? sanitizeGifts(data.gifts) : undefined,
    lgpdConsent: data.lgpdConsent !== undefined ? data.lgpdConsent : undefined,
    lgpdConsentAt:
      data.lgpdConsentAt !== undefined ? data.lgpdConsentAt || null : undefined,
  })
}

export async function createVisitor(
  ownerId: string,
  orgId: string,
  data: Omit<Visitor, 'id' | 'ownerId' | 'orgId' | 'createdAt' | 'updatedAt'>,
): Promise<string> {
  const ref = await addDoc(visitorsCol, {
    ...visitorWritePayload({
      ...data,
      mobilityReduced: data.mobilityReduced ?? false,
      dietaryHasRestriction:
        data.dietaryHasRestriction ?? Boolean(data.dietaryRestriction?.trim()),
      comorbidity: data.comorbidity ?? false,
      specialAttention: data.specialAttention ?? false,
      fliesByAir: data.fliesByAir ?? false,
      hasFlightData: data.hasFlightData ?? false,
      gifts: data.gifts,
      lgpdConsent: data.lgpdConsent ?? false,
      lgpdConsentAt: data.lgpdConsentAt,
      whatsapp: data.whatsapp,
    }),
    name: data.name,
    document: data.document,
    ownerId,
    orgId,
    isDeleted: false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
  return ref.id
}

export async function updateVisitor(
  id: string,
  data: Partial<Omit<Visitor, 'id' | 'ownerId' | 'orgId' | 'createdAt'>>,
): Promise<void> {
  const payload = {
    ...visitorWritePayload(data),
    updatedAt: serverTimestamp(),
  }
  await updateDoc(doc(visitorsCol, id), payload as Record<string, unknown> as never)
}

export async function deleteVisitor(id: string, deletedBy: string): Promise<void> {
  await softDeleteEntity('visitor', id, deletedBy)
}
