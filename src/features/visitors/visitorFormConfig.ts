import type { VisitEventKind, VisitorFormVariant } from '@/types'

export type PortalLocale = 'pt' | 'en'

/**
 * Mapeia o tipo da visita para o formulário de visitante.
 * - visita_vip → VIP
 * - comunidade_* → Comunidade
 * - evento / sem kind → geral (união dos campos; na prática = VIP + bairro)
 */
export function resolveVisitorFormVariant(
  eventKind?: VisitEventKind | null,
): VisitorFormVariant {
  if (eventKind === 'visita_vip') return 'vip'
  if (
    eventKind === 'comunidade_prioritaria' ||
    eventKind === 'visita_comunidade'
  ) {
    return 'comunidade'
  }
  return 'geral'
}

export function isVipLikeVariant(variant: VisitorFormVariant): boolean {
  return variant === 'vip' || variant === 'geral'
}

export function isComunidadeLikeVariant(variant: VisitorFormVariant): boolean {
  return variant === 'comunidade' || variant === 'geral'
}

export const VISITOR_SEX_OPTIONS: {
  value: string
  label: Record<PortalLocale, string>
}[] = [
  { value: 'feminino', label: { pt: 'Feminino', en: 'Female' } },
  { value: 'masculino', label: { pt: 'Masculino', en: 'Male' } },
  { value: 'outro', label: { pt: 'Outro', en: 'Other' } },
  {
    value: 'prefiro_nao_informar',
    label: { pt: 'Prefiro não informar', en: 'Prefer not to say' },
  },
]

type CopyBlock = Record<PortalLocale, string>

export const portalIntroCopy: Record<
  VisitorFormVariant,
  { title: CopyBlock; body: CopyBlock }
> = {
  vip: {
    title: {
      pt: 'Que bom ter você conosco!',
      en: 'Great to have you with us!',
    },
    body: {
      pt: 'Antes da sua visita, precisamos coletar algumas informações para preparar tudo da melhor forma possível: traslado, hospedagem, acesso às instalações e demais detalhes da sua programação.\n\nO preenchimento é rápido e seus dados serão tratados com total segurança, seguindo as diretrizes da LGPD.\n\nContamos com você e esperamos recebê-lo(a) em breve!',
      en: 'Before your visit, we need a few details to prepare everything properly: transfers, accommodation, site access and your schedule.\n\nIt is quick to complete and your data will be handled securely under applicable privacy rules (LGPD).\n\nWe look forward to welcoming you soon!',
    },
  },
  comunidade: {
    title: {
      pt: 'Que bom ter você conosco!',
      en: 'Great to have you with us!',
    },
    body: {
      pt: 'Antes da sua visita, precisamos coletar algumas informações para preparar tudo da melhor forma possível: traslado, acesso às instalações e demais detalhes da sua programação.\n\nO preenchimento é rápido e seus dados serão tratados com total segurança, seguindo as diretrizes da LGPD.\n\nContamos com você e esperamos recebê-lo(a) em breve!',
      en: 'Before your visit, we need a few details to prepare everything properly: transfers, site access and your schedule.\n\nIt is quick to complete and your data will be handled securely under applicable privacy rules (LGPD).\n\nWe look forward to welcoming you soon!',
    },
  },
  geral: {
    title: {
      pt: 'Que bom ter você conosco!',
      en: 'Great to have you with us!',
    },
    body: {
      pt: 'Antes da sua visita, precisamos coletar algumas informações para preparar tudo da melhor forma possível.\n\nO preenchimento é rápido e seus dados serão tratados com total segurança, seguindo as diretrizes da LGPD.\n\nContamos com você e esperamos recebê-lo(a) em breve!',
      en: 'Before your visit, we need a few details to prepare everything properly.\n\nIt is quick to complete and your data will be handled securely under applicable privacy rules (LGPD).\n\nWe look forward to welcoming you soon!',
    },
  },
}

export const visitorFormLabels = {
  fullName: { pt: 'Nome completo', en: 'Full name' },
  document: { pt: 'RG ou Passaporte', en: 'ID or Passport' },
  documentComunidade: { pt: 'RG', en: 'ID document' },
  cpf: { pt: 'CPF', en: 'CPF / Tax ID' },
  company: { pt: 'Empresa', en: 'Company' },
  role: { pt: 'Cargo', en: 'Role / Title' },
  country: { pt: 'País', en: 'Country' },
  nationality: { pt: 'Nacionalidade', en: 'Nationality' },
  sex: { pt: 'Sexo', en: 'Gender' },
  birthDate: { pt: 'Data de nascimento', en: 'Date of birth' },
  phone: { pt: 'Celular', en: 'Mobile phone' },
  email: { pt: 'E-mail', en: 'Email' },
  emergencyPhone: { pt: 'Telefone de emergência', en: 'Emergency phone' },
  whatsapp: { pt: 'WhatsApp', en: 'WhatsApp' },
  language: { pt: 'Idioma preferido', en: 'Preferred language' },
  neighborhood: { pt: 'Bairro', en: 'Neighborhood' },
  weightKg: { pt: 'Peso (kg)', en: 'Weight (kg)' },
  shoeSize: { pt: 'Número da bota / calçado', en: 'Boot / shoe size' },
  shirtSize: { pt: 'Número da camisa', en: 'Shirt size' },
  dietaryHasRestriction: {
    pt: 'Restrição alimentar',
    en: 'Dietary restriction',
  },
  dietaryNotes: {
    pt: 'Descreva a restrição alimentar',
    en: 'Describe the dietary restriction',
  },
  mobilityReduced: {
    pt: 'Restrição de locomoção',
    en: 'Mobility restriction',
  },
  mobilityNotes: {
    pt: 'Descreva a restrição de locomoção',
    en: 'Describe the mobility restriction',
  },
  comorbidity: { pt: 'Comorbidade', en: 'Comorbidity' },
  comorbidityNotes: {
    pt: 'Descreva a comorbidade',
    en: 'Describe the comorbidity',
  },
  specialAttention: { pt: 'Atenção especial', en: 'Special attention' },
  specialAttentionNotes: {
    pt: 'Descreva a atenção especial necessária',
    en: 'Describe the special attention needed',
  },
  fliesByAir: { pt: 'Virá de aéreo?', en: 'Will you travel by air?' },
  hasFlightData: {
    pt: 'Já possui os dados do voo?',
    en: 'Do you already have flight details?',
  },
  arrivalFlight: {
    pt: 'Dados do voo de chegada',
    en: 'Arrival flight details',
  },
  departureFlight: {
    pt: 'Dados do voo de partida',
    en: 'Departure flight details',
  },
  flightOrigin: { pt: 'Local de partida', en: 'Departure city / airport' },
  flightDate: { pt: 'Data', en: 'Date' },
  flightAirline: { pt: 'Companhia aérea', en: 'Airline' },
  flightNumber: { pt: 'Número do voo', en: 'Flight number' },
  flightTime: { pt: 'Horário', en: 'Time' },
  hotelName: { pt: 'Nome do hotel', en: 'Hotel name' },
  notes: { pt: 'Observações', en: 'Notes' },
  yes: { pt: 'Sim', en: 'Yes' },
  no: { pt: 'Não', en: 'No' },
  yourData: { pt: 'Seus dados', en: 'Your details' },
  yourDataHint: {
    pt: 'Revise as informações abaixo. A organização recebe suas alterações e aplica no cadastro da visita.',
    en: 'Review the information below. The host organization will receive your updates and apply them to the visit record.',
  },
  lgpdLabel: {
    pt: 'Aceite LGPD (obrigatório para confirmar)',
    en: 'LGPD consent (required to confirm)',
  },
  lgpdBody: {
    pt: 'Autorizo o tratamento dos meus dados pessoais pela organização responsável pela visita/evento, com a finalidade de organizar a presença, logística, comunicação e segurança do evento. Os dados serão acessados apenas por usuários autorizados e poderão ser atualizados ou excluídos mediante solicitação, conforme a LGPD.',
    en: 'I authorize the host organization to process my personal data for organizing attendance, logistics, communication and event safety. Data will only be accessed by authorized users and may be updated or deleted upon request, in line with LGPD.',
  },
  sendData: { pt: 'Enviar dados', en: 'Send details' },
  sending: { pt: 'Enviando...', en: 'Sending...' },
  confirmPresence: { pt: 'Confirmar presença', en: 'Confirm attendance' },
  declinePresence: { pt: 'Não vou participar', en: 'I will not attend' },
  confirmationTitle: {
    pt: 'Confirmação de presença',
    en: 'Attendance confirmation',
  },
  confirmationHint: {
    pt: 'Confirme após revisar seus dados e aceitar o uso das informações neste evento.',
    en: 'Confirm after reviewing your details and accepting the use of your information for this event.',
  },
  formProfile: { pt: 'Perfil do formulário', en: 'Form profile' },
  profileVip: { pt: 'VIP', en: 'VIP' },
  profileComunidade: { pt: 'Comunidade', en: 'Community' },
  profileGeral: { pt: 'Geral (todos os campos)', en: 'General (all fields)' },
} as const

export function t(
  key: keyof typeof visitorFormLabels,
  locale: PortalLocale,
): string {
  return visitorFormLabels[key][locale]
}
