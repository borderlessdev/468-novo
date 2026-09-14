import type {
  GuestVisitorDraft,
  Visitor,
  VisitorFlightInfo,
  VisitorFormVariant,
  VisitorSex,
} from '@/types'
import { parseOptionalNumber } from '@/lib/validations'
import { formatWeightKgNumber, parseWeightKg } from '@/lib/utils'

/** Valores controlados do formulário VIP/Comunidade (CRM e portal). */
export interface VisitorProfileFormValues {
  name: string
  document: string
  cpf: string
  company: string
  role: string
  country: string
  nationality: string
  sex: string
  birthDate: string
  phone: string
  email: string
  emergencyPhone: string
  whatsapp: string
  language: string
  neighborhood: string
  weightKg: string
  shoeSize: string
  shirtSize: string
  dietaryHasRestriction: boolean
  dietaryRestriction: string
  mobilityReduced: boolean
  mobilityNotes: string
  comorbidity: boolean
  comorbidityNotes: string
  specialAttention: boolean
  specialAttentionNotes: string
  fliesByAir: boolean
  hasFlightData: boolean
  arrivalOrigin: string
  arrivalDate: string
  arrivalAirline: string
  arrivalFlightNumber: string
  arrivalTime: string
  departureOrigin: string
  departureDate: string
  departureAirline: string
  departureFlightNumber: string
  departureTime: string
  hotelName: string
  notes: string
  lgpdConsent: boolean
}

export const EMPTY_VISITOR_PROFILE: VisitorProfileFormValues = {
  name: '',
  document: '',
  cpf: '',
  company: '',
  role: '',
  country: 'Brasil',
  nationality: '',
  sex: '',
  birthDate: '',
  phone: '',
  email: '',
  emergencyPhone: '',
  whatsapp: '',
  language: '',
  neighborhood: '',
  weightKg: '',
  shoeSize: '',
  shirtSize: '',
  dietaryHasRestriction: false,
  dietaryRestriction: '',
  mobilityReduced: false,
  mobilityNotes: '',
  comorbidity: false,
  comorbidityNotes: '',
  specialAttention: false,
  specialAttentionNotes: '',
  fliesByAir: false,
  hasFlightData: false,
  arrivalOrigin: '',
  arrivalDate: '',
  arrivalAirline: '',
  arrivalFlightNumber: '',
  arrivalTime: '',
  departureOrigin: '',
  departureDate: '',
  departureAirline: '',
  departureFlightNumber: '',
  departureTime: '',
  hotelName: '',
  notes: '',
  lgpdConsent: false,
}

function flightFromParts(
  origin: string,
  date: string,
  airline: string,
  flightNumber: string,
  time: string,
): VisitorFlightInfo | undefined {
  if (!origin && !date && !airline && !flightNumber && !time) return undefined
  return {
    origin: origin || undefined,
    date: date || undefined,
    airline: airline || undefined,
    flightNumber: flightNumber || undefined,
    time: time || undefined,
  }
}

function sexValue(value?: string): VisitorSex | undefined {
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

export function visitorToProfileForm(visitor: Visitor): VisitorProfileFormValues {
  return {
    ...EMPTY_VISITOR_PROFILE,
    name: visitor.name,
    document: visitor.document,
    cpf: visitor.cpf ?? '',
    company: visitor.company ?? '',
    role: visitor.role ?? '',
    country: visitor.country ?? 'Brasil',
    nationality: visitor.nationality ?? '',
    sex: visitor.sex ?? '',
    birthDate: visitor.birthDate ?? '',
    phone: visitor.phone ?? '',
    email: visitor.email ?? '',
    emergencyPhone: visitor.emergencyPhone ?? '',
    whatsapp: visitor.whatsapp ?? '',
    language: visitor.language ?? '',
    neighborhood: visitor.neighborhood ?? '',
    weightKg:
      visitor.weightKg != null ? formatWeightKgNumber(visitor.weightKg) : '',
    shoeSize: visitor.shoeSize != null ? String(visitor.shoeSize) : '',
    shirtSize: visitor.shirtSize ?? '',
    dietaryHasRestriction:
      visitor.dietaryHasRestriction === true ||
      Boolean(visitor.dietaryRestriction?.trim()),
    dietaryRestriction: visitor.dietaryRestriction ?? '',
    mobilityReduced: visitor.mobilityReduced === true,
    mobilityNotes: visitor.mobilityNotes ?? '',
    comorbidity: visitor.comorbidity === true,
    comorbidityNotes: visitor.comorbidityNotes ?? '',
    specialAttention: visitor.specialAttention === true,
    specialAttentionNotes: visitor.specialAttentionNotes ?? '',
    fliesByAir: visitor.fliesByAir === true,
    hasFlightData: visitor.hasFlightData === true,
    arrivalOrigin: visitor.arrivalFlight?.origin ?? '',
    arrivalDate: visitor.arrivalFlight?.date ?? '',
    arrivalAirline: visitor.arrivalFlight?.airline ?? '',
    arrivalFlightNumber: visitor.arrivalFlight?.flightNumber ?? '',
    arrivalTime: visitor.arrivalFlight?.time ?? '',
    departureOrigin: visitor.departureFlight?.origin ?? '',
    departureDate: visitor.departureFlight?.date ?? '',
    departureAirline: visitor.departureFlight?.airline ?? '',
    departureFlightNumber: visitor.departureFlight?.flightNumber ?? '',
    departureTime: visitor.departureFlight?.time ?? '',
    hotelName: visitor.hotelName ?? '',
    notes: visitor.notes ?? '',
    lgpdConsent: visitor.lgpdConsent === true,
  }
}

export function draftToProfileForm(
  draft: GuestVisitorDraft | undefined,
  fallback?: { name?: string; company?: string },
): VisitorProfileFormValues {
  return {
    ...EMPTY_VISITOR_PROFILE,
    name: draft?.name ?? fallback?.name ?? '',
    document: draft?.document ?? '',
    cpf: draft?.cpf ?? '',
    company: draft?.company ?? fallback?.company ?? '',
    role: draft?.role ?? '',
    nationality: draft?.nationality ?? '',
    sex: draft?.sex ?? '',
    birthDate: draft?.birthDate ?? '',
    phone: draft?.phone ?? '',
    email: draft?.email ?? '',
    emergencyPhone: draft?.emergencyPhone ?? '',
    whatsapp: draft?.whatsapp ?? '',
    language: draft?.language ?? '',
    neighborhood: draft?.neighborhood ?? '',
    weightKg:
      draft?.weightKg != null ? formatWeightKgNumber(draft.weightKg) : '',
    shoeSize: draft?.shoeSize != null ? String(draft.shoeSize) : '',
    shirtSize: draft?.shirtSize ?? '',
    dietaryHasRestriction:
      draft?.dietaryHasRestriction === true ||
      Boolean(draft?.dietaryRestriction?.trim()),
    dietaryRestriction: draft?.dietaryRestriction ?? '',
    mobilityReduced: draft?.mobilityReduced === true,
    mobilityNotes: draft?.mobilityNotes ?? '',
    comorbidity: draft?.comorbidity === true,
    comorbidityNotes: draft?.comorbidityNotes ?? '',
    specialAttention: draft?.specialAttention === true,
    specialAttentionNotes: draft?.specialAttentionNotes ?? '',
    fliesByAir: draft?.fliesByAir === true,
    hasFlightData: draft?.hasFlightData === true,
    arrivalOrigin: draft?.arrivalFlight?.origin ?? '',
    arrivalDate: draft?.arrivalFlight?.date ?? '',
    arrivalAirline: draft?.arrivalFlight?.airline ?? '',
    arrivalFlightNumber: draft?.arrivalFlight?.flightNumber ?? '',
    arrivalTime: draft?.arrivalFlight?.time ?? '',
    departureOrigin: draft?.departureFlight?.origin ?? '',
    departureDate: draft?.departureFlight?.date ?? '',
    departureAirline: draft?.departureFlight?.airline ?? '',
    departureFlightNumber: draft?.departureFlight?.flightNumber ?? '',
    departureTime: draft?.departureFlight?.time ?? '',
    hotelName: draft?.hotelName ?? '',
    notes: draft?.notes ?? '',
    lgpdConsent: draft?.lgpdConsent === true,
  }
}

/** Payload para create/update Visitor (sem gifts/owner). */
export function profileFormToVisitorPayload(
  values: VisitorProfileFormValues,
  options?: { includeLgpd?: boolean },
): Omit<Visitor, 'id' | 'ownerId' | 'orgId' | 'createdAt' | 'updatedAt' | 'gifts'> {
  const arrivalFlight = values.fliesByAir && values.hasFlightData
    ? flightFromParts(
        values.arrivalOrigin,
        values.arrivalDate,
        values.arrivalAirline,
        values.arrivalFlightNumber,
        values.arrivalTime,
      )
    : undefined
  const departureFlight = values.fliesByAir && values.hasFlightData
    ? flightFromParts(
        values.departureOrigin,
        values.departureDate,
        values.departureAirline,
        values.departureFlightNumber,
        values.departureTime,
      )
    : undefined

  const payload: Omit<
    Visitor,
    'id' | 'ownerId' | 'orgId' | 'createdAt' | 'updatedAt' | 'gifts'
  > = {
    name: values.name.trim(),
    document: values.document.trim(),
    cpf: values.cpf.trim() || undefined,
    company: values.company.trim() || undefined,
    role: values.role.trim() || undefined,
    country: values.country.trim() || undefined,
    nationality: values.nationality.trim() || undefined,
    sex: sexValue(values.sex),
    birthDate: values.birthDate.trim() || undefined,
    phone: values.phone.trim() || undefined,
    email: values.email.trim() || undefined,
    emergencyPhone: values.emergencyPhone.trim() || undefined,
    whatsapp: values.whatsapp.trim() || undefined,
    language: values.language.trim() || undefined,
    neighborhood: values.neighborhood.trim() || undefined,
    weightKg: parseWeightKg(values.weightKg),
    shoeSize: parseOptionalNumber(values.shoeSize),
    shirtSize: values.shirtSize.trim() || undefined,
    dietaryHasRestriction: values.dietaryHasRestriction,
    dietaryRestriction: values.dietaryHasRestriction
      ? values.dietaryRestriction.trim() || undefined
      : undefined,
    mobilityReduced: values.mobilityReduced,
    mobilityNotes: values.mobilityReduced
      ? values.mobilityNotes.trim() || undefined
      : undefined,
    comorbidity: values.comorbidity,
    comorbidityNotes: values.comorbidity
      ? values.comorbidityNotes.trim() || undefined
      : undefined,
    specialAttention: values.specialAttention,
    specialAttentionNotes: values.specialAttention
      ? values.specialAttentionNotes.trim() || undefined
      : undefined,
    fliesByAir: values.fliesByAir,
    hasFlightData: values.fliesByAir ? values.hasFlightData : false,
    arrivalFlight,
    departureFlight,
    hotelName: values.hotelName.trim() || undefined,
    notes: values.notes.trim() || undefined,
  }

  if (options?.includeLgpd) {
    payload.lgpdConsent = values.lgpdConsent
    payload.lgpdConsentAt = values.lgpdConsent
      ? new Date().toISOString()
      : undefined
  }

  return payload
}

export function profileFormToDraft(
  values: VisitorProfileFormValues,
): GuestVisitorDraft {
  const base = profileFormToVisitorPayload(values, { includeLgpd: true })
  return {
    name: base.name,
    document: base.document,
    cpf: base.cpf,
    company: base.company,
    role: base.role,
    nationality: base.nationality,
    sex: base.sex,
    birthDate: base.birthDate,
    phone: base.phone,
    email: base.email,
    emergencyPhone: base.emergencyPhone,
    neighborhood: base.neighborhood,
    weightKg: base.weightKg,
    shoeSize: base.shoeSize,
    shirtSize: base.shirtSize,
    dietaryHasRestriction: base.dietaryHasRestriction,
    dietaryRestriction: base.dietaryRestriction,
    mobilityReduced: base.mobilityReduced,
    mobilityNotes: base.mobilityNotes,
    comorbidity: base.comorbidity,
    comorbidityNotes: base.comorbidityNotes,
    specialAttention: base.specialAttention,
    specialAttentionNotes: base.specialAttentionNotes,
    fliesByAir: base.fliesByAir,
    hasFlightData: base.hasFlightData,
    arrivalFlight: base.arrivalFlight,
    departureFlight: base.departureFlight,
    hotelName: base.hotelName,
    language: base.language,
    whatsapp: base.whatsapp,
    notes: base.notes,
    lgpdConsent: base.lgpdConsent,
    lgpdConsentAt: base.lgpdConsentAt,
  }
}

export function mergeProfilePatch(
  current: VisitorProfileFormValues,
  patch: Partial<VisitorProfileFormValues>,
): VisitorProfileFormValues {
  return { ...current, ...patch }
}

/** Campos VIP (e geral). Comunidade omite estes blocos. */
export function showVipLogistics(variant: VisitorFormVariant): boolean {
  return variant === 'vip' || variant === 'geral'
}

export function showComunidadeFields(variant: VisitorFormVariant): boolean {
  return variant === 'comunidade' || variant === 'geral'
}

export function showCompanyRole(variant: VisitorFormVariant): boolean {
  return variant === 'vip' || variant === 'geral'
}
