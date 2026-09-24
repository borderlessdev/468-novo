import { z } from 'zod'

export const loginSchema = z.object({
  email: z.email('E-mail inválido'),
  password: z.string().min(6, 'Mínimo de 6 caracteres'),
})

export const registerSchema = z
  .object({
    name: z.string().min(2, 'Informe seu nome'),
    email: z.email('E-mail inválido'),
    password: z.string().min(6, 'Mínimo de 6 caracteres'),
    confirmPassword: z.string().min(6, 'Confirme a senha'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'As senhas não coincidem',
    path: ['confirmPassword'],
  })

export const resetPasswordSchema = z.object({
  email: z.email('E-mail inválido'),
})

const visitEventKindSchema = z.enum([
  'visita_vip',
  'comunidade_prioritaria',
  'visita_comunidade',
  'evento',
])

const visitVipSubtypeSchema = z.enum([
  'institucional',
  'comercial',
  'investidores',
  'governamental',
  'imprensa',
  'influenciadores',
])

const visitEventScopeSchema = z.enum(['interno', 'externo'])

const visitBaseSchema = z.object({
  title: z.string().min(2, 'Título obrigatório'),
  company: z.string().optional(),
  state: z.string().optional(),
  city: z.string().optional(),
  startDate: z.string().min(1, 'Data início obrigatória'),
  endDate: z.string().min(1, 'Data fim obrigatória'),
  status: z.enum(['planejamento', 'em_andamento', 'concluida', 'cancelada']),
  eventKind: visitEventKindSchema,
  vipSubtype: visitVipSubtypeSchema.optional(),
  eventScope: visitEventScopeSchema.optional(),
  objective: z.string().optional(),
  language: z.string().optional(),
  arrivalInstructions: z.string().optional(),
  pvNumber: z.string().trim().min(1, 'Número da PV obrigatório').optional(),
  templateId: z.string().optional(),
  playbookId: z.string().optional(),
  startWithChecklist: z.boolean(),
})

export const visitSchema = visitBaseSchema
  .refine(
    (data) => !data.startDate || !data.endDate || data.endDate >= data.startDate,
    {
      message: 'Data fim deve ser igual ou posterior à data início',
      path: ['endDate'],
    },
  )
  .refine(
    (data) => data.eventKind !== 'visita_vip' || Boolean(data.vipSubtype),
    {
      message: 'Selecione o subtipo da Visita VIP',
      path: ['vipSubtype'],
    },
  )
  .refine(
    (data) => data.eventKind !== 'evento' || Boolean(data.eventScope),
    {
      message: 'Selecione se o evento é interno ou externo',
      path: ['eventScope'],
    },
  )

export const visitEditSchema = visitBaseSchema
  .omit({
    startWithChecklist: true,
    templateId: true,
    playbookId: true,
  })
  .refine(
    (data) => !data.startDate || !data.endDate || data.endDate >= data.startDate,
    {
      message: 'Data fim deve ser igual ou posterior à data início',
      path: ['endDate'],
    },
  )
  .refine(
    (data) => data.eventKind !== 'visita_vip' || Boolean(data.vipSubtype),
    {
      message: 'Selecione o subtipo da Visita VIP',
      path: ['vipSubtype'],
    },
  )
  .refine(
    (data) => data.eventKind !== 'evento' || Boolean(data.eventScope),
    {
      message: 'Selecione se o evento é interno ou externo',
      path: ['eventScope'],
    },
  )

export const visitorGiftSchema = z.object({
  name: z.string().min(1, 'Nome do brinde obrigatório'),
  quantity: z.string().optional(),
  notes: z.string().optional(),
})

export const visitorFlightSchema = z.object({
  origin: z.string().optional(),
  date: z.string().optional(),
  airline: z.string().optional(),
  flightNumber: z.string().optional(),
  time: z.string().optional(),
})

export const visitorSchema = z.object({
  name: z.string().min(2, 'Nome obrigatório'),
  document: z.string().min(3, 'Documento obrigatório'),
  cpf: z.string().optional(),
  company: z.string().optional(),
  role: z.string().optional(),
  country: z.string().optional(),
  nationality: z.string().optional(),
  sex: z
    .enum(['', 'feminino', 'masculino', 'outro', 'prefiro_nao_informar'])
    .optional(),
  birthDate: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().optional(),
  emergencyPhone: z.string().optional(),
  whatsapp: z.string().optional(),
  language: z.string().optional(),
  neighborhood: z.string().optional(),
  weightKg: z.string().optional(),
  shoeSize: z.string().optional(),
  shirtSize: z.string().optional(),
  dietaryHasRestriction: z.boolean().optional(),
  dietaryRestriction: z.string().optional(),
  mobilityReduced: z.boolean().optional(),
  mobilityNotes: z.string().optional(),
  comorbidity: z.boolean().optional(),
  comorbidityNotes: z.string().optional(),
  specialAttention: z.boolean().optional(),
  specialAttentionNotes: z.string().optional(),
  fliesByAir: z.boolean().optional(),
  hasFlightData: z.boolean().optional(),
  hotelName: z.string().optional(),
  notes: z.string().optional(),
  gifts: z.array(visitorGiftSchema).optional(),
  lgpdConsent: z.boolean().optional(),
})

export const quickVisitorSchema = z.object({
  name: z.string().min(2, 'Nome obrigatório'),
  document: z.string().min(3, 'Documento obrigatório'),
  company: z.string().optional(),
})

export const activitySchema = z.object({
  title: z.string().min(2, 'Título obrigatório'),
  description: z.string().optional(),
  location: z.string().optional(),
  date: z.string().min(1, 'Data obrigatória'),
  startTime: z.string().min(1, 'Horário início obrigatório'),
  endTime: z.string().min(1, 'Horário fim obrigatório'),
  responsibleNames: z.string().optional(),
  visitorNames: z.string().optional(),
})

export const taskSchema = z.object({
  title: z.string().min(2, 'Título obrigatório'),
  dueDate: z.string().optional(),
  assigneeName: z.string().optional(),
  assigneeId: z.string().optional(),
  status: z.enum(['backlog', 'in_progress', 'completed']),
})

export const inviteSchema = z.object({
  email: z.email('E-mail inválido'),
  role: z.enum(['team', 'client']),
  visitId: z.string().optional(),
})

export const financeItemSchema = z.object({
  serviceType: z.enum(['terceiro', 'despesa_tributavel']),
  serviceName: z.string().min(2, 'Serviço obrigatório'),
  budget1: z.string().optional(),
  budget2: z.string().optional(),
  budget3: z.string().optional(),
  serviceValue: z.string().optional(),
  actualValue: z.string().optional(),
  winningCompany: z.string().optional(),
  nfReceived: z.boolean(),
  nfDueDate: z.string().optional(),
})

export const playbookItemSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(['task', 'activity', 'document']),
  phase: z.enum(['preparacao', 'durante', 'encerramento']),
  title: z.string().min(2, 'Título obrigatório'),
  description: z.string().optional(),
  offsetDays: z.coerce.number().int('Use um número inteiro de dias'),
  durationMinutes: z.preprocess(
    (value) => (value === '' || value == null ? undefined : value),
    z.number().int().positive().optional(),
  ),
  startTime: z.preprocess(
    (value) => (value === '' || value == null ? undefined : value),
    z.string().optional(),
  ),
  location: z.string().optional(),
  documentCategory: z
    .enum(['contrato', 'boarding', 'briefing', 'comprovante', 'programacao', 'outro'])
    .optional(),
  assigneeName: z.string().optional(),
  order: z.coerce.number().int(),
})

export const playbookSchema = z.object({
  name: z.string().min(2, 'Nome obrigatório'),
  visitType: z.string().min(2, 'Tipo de visita obrigatório'),
  description: z.string().optional(),
  items: z.array(playbookItemSchema),
})

export const profileSchema = z.object({
  name: z.string().min(2, 'Nome obrigatório'),
})

export function parseOptionalNumber(value?: string): number | undefined {
  if (!value || value.trim() === '') return undefined
  const num = Number(value)
  return Number.isFinite(num) ? num : undefined
}

export type LoginInput = z.infer<typeof loginSchema>
export type RegisterInput = z.infer<typeof registerSchema>
export type VisitInput = z.infer<typeof visitSchema>
export type VisitEditInput = z.infer<typeof visitEditSchema>
export type VisitorInput = z.infer<typeof visitorSchema>
export type QuickVisitorInput = z.infer<typeof quickVisitorSchema>
export type ActivityInput = z.infer<typeof activitySchema>
export type TaskInput = z.infer<typeof taskSchema>
export type FinanceItemInput = z.infer<typeof financeItemSchema>
export type ProfileInput = z.infer<typeof profileSchema>
export type InviteInput = z.infer<typeof inviteSchema>
export type PlaybookInput = z.infer<typeof playbookSchema>
export type PlaybookItemInput = z.infer<typeof playbookItemSchema>
