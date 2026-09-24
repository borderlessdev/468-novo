export type TrashEntityType =
  | 'visit'
  | 'visitor'
  | 'activity'
  | 'task'
  | 'financeItem'
  | 'document'

export interface SoftDeletable {
  isDeleted?: boolean
  deletedAt?: unknown
  deletedBy?: string
  expiresAt?: unknown
}

export interface TrashItem {
  id: string
  entityType: TrashEntityType
  title: string
  ownerId: string
  deletedAt?: unknown
  expiresAt?: unknown
  visitId?: string
}

export type UserRole = 'user' | 'team' | 'client' | 'admin'

export type OrganizationStatus = 'active' | 'suspended'

export type OrgRole = 'org_admin' | 'user' | 'team' | 'client'

export interface Organization {
  id: string
  name: string
  maxUsers: number
  status: OrganizationStatus
  createdBy: string
  /** Whitelabel: logo da pasta. Definida por Master/Admin; funcionários herdam via activeOrg. */
  logoUrl?: string
  logoStoragePath?: string
  createdAt?: unknown
  updatedAt?: unknown
}

export interface OrganizationMember {
  id: string
  orgId: string
  uid: string
  email: string
  name: string
  orgRole: OrgRole
  department?: string
  invitedBy?: string
  joinedAt?: unknown
}

export interface ModulePermissions {
  visitors: boolean
  planning: boolean
  finance: boolean
  reports: boolean
}

export interface NotificationPreferences {
  taskDueSoon: boolean
  financeNfDue: boolean
  financeApproval: boolean
  visitStatusChanged: boolean
  visitCreated: boolean
  taskCreated: boolean
  taskStatusChanged: boolean
  documentUploaded: boolean
  teamUpdated: boolean
  activitySoon: boolean
  taskOverdue: boolean
  visitSoon: boolean
  documentPending: boolean
  financeNfOverdue: boolean
  guestConfirmed: boolean
  guestRegistration: boolean
}

export type VisitStatus =
  | 'planejamento'
  | 'em_andamento'
  | 'concluida'
  | 'cancelada'

export type TaskStatus = 'backlog' | 'in_progress' | 'completed'

export type PlaybookPhase = 'preparacao' | 'durante' | 'encerramento'
export type PlaybookItemKind = 'task' | 'activity' | 'document'

export type DocumentCategory =
  | 'contrato'
  | 'boarding'
  | 'briefing'
  | 'comprovante'
  | 'programacao'
  | 'outro'

export interface UserProfile {
  uid: string
  name: string
  email: string
  photoURL?: string
  /** Caminho no Storage para limpar a foto anterior no upload. */
  photoStoragePath?: string
  role: UserRole
  /** Empresa à qual o usuário pertence (usuários comuns). */
  orgId?: string
  notificationPreferences?: Partial<NotificationPreferences>
  modulePermissions?: Partial<ModulePermissions>
  createdAt?: unknown
  updatedAt?: unknown
}

export type VisitEventKind =
  | 'visita_vip'
  | 'comunidade_prioritaria'
  | 'visita_comunidade'
  | 'evento'

export type VisitVipSubtype =
  | 'institucional'
  | 'comercial'
  | 'investidores'
  | 'governamental'
  | 'imprensa'
  | 'influenciadores'

export type VisitEventScope = 'interno' | 'externo'

export interface Visit extends SoftDeletable {
  id: string
  title: string
  company?: string
  state?: string
  city?: string
  startDate: string
  endDate: string
  status: VisitStatus
  /** Classificação operacional (tipo de experiência). Visitas antigas podem não ter. */
  eventKind?: VisitEventKind
  /** Obrigatório quando eventKind === 'visita_vip'. */
  vipSubtype?: VisitVipSubtype
  /** Obrigatório quando eventKind === 'evento'. */
  eventScope?: VisitEventScope
  objective?: string
  language?: string
  pvNumber?: string
  /** Instruções de chegada exibidas no portal do visitante. */
  arrivalInstructions?: string
  progress: number
  teamMemberIds: string[]
  clientUserIds: string[]
  isTemplate?: boolean
  ownerId: string
  orgId: string
  createdAt?: unknown
  updatedAt?: unknown
}

export type FinanceApprovalStatus = 'pending' | 'approved' | 'rejected'

/** Serviço de Terceiro: com orçamentos. Despesa Tributável: sem orçamento (recibo/NF direto). */
export type FinanceServiceType = 'terceiro' | 'despesa_tributavel'

export type GuestConfirmationStatus = 'pending' | 'confirmed' | 'declined'

export type CalendarProvider = 'google' | 'outlook'

export interface CalendarConnectionStatus {
  provider: CalendarProvider
  connected: boolean
  email?: string
  connectedAt?: string
  needsReauth?: boolean
}

export interface VisitorGift {
  name: string
  quantity?: number
  notes?: string
}

/** Perfil do formulário CRM/portal (VIP vs Comunidade). */
export type VisitorFormVariant = 'vip' | 'comunidade' | 'geral'

export type VisitorSex =
  | 'feminino'
  | 'masculino'
  | 'outro'
  | 'prefiro_nao_informar'

/** Dados de voo (chegada ou partida). */
export interface VisitorFlightInfo {
  origin?: string
  date?: string
  airline?: string
  flightNumber?: string
  time?: string
}

export interface Visitor extends SoftDeletable {
  id: string
  name: string
  /** RG, passaporte ou documento principal de identificação. */
  document: string
  /** CPF quando informado à parte do documento principal. */
  cpf?: string
  company?: string
  role?: string
  country?: string
  nationality?: string
  sex?: VisitorSex
  /** YYYY-MM-DD */
  birthDate?: string
  phone?: string
  email?: string
  emergencyPhone?: string
  language?: string
  whatsapp?: string
  /** Bairro — formulário Comunidade. */
  neighborhood?: string
  weightKg?: number
  /** Número da bota / calçado. */
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
  fliesByAir?: boolean
  hasFlightData?: boolean
  arrivalFlight?: VisitorFlightInfo
  departureFlight?: VisitorFlightInfo
  hotelName?: string
  notes?: string
  gifts?: VisitorGift[]
  /** Aceite LGPD do titular (portal ou CRM). */
  lgpdConsent?: boolean
  /** ISO timestamp do aceite. */
  lgpdConsentAt?: string
  ownerId: string
  orgId: string
  createdAt?: unknown
  updatedAt?: unknown
}

export interface VisitVisitor {
  id: string
  visitId: string
  visitorId: string
  ownerId: string
  createdAt?: unknown
}

export interface Activity extends SoftDeletable {
  id: string
  visitId: string
  title: string
  description?: string
  location?: string
  date: string
  startTime: string
  endTime: string
  responsibleNames: string[]
  visitorNames: string[]
  phase?: PlaybookPhase
  /** ID do evento no Google Calendar (sync via Cloud Functions). */
  googleEventId?: string
  ownerId: string
  createdAt?: unknown
  updatedAt?: unknown
}

export interface Task extends SoftDeletable {
  id: string
  visitId: string
  title: string
  status: TaskStatus
  order: number
  dueDate?: string
  assigneeName?: string
  assigneeId?: string
  phase?: PlaybookPhase
  ownerId: string
  createdAt?: unknown
  updatedAt?: unknown
}

export interface FinanceItem extends SoftDeletable {
  id: string
  visitId: string
  /** Linhas antigas sem o campo são tratadas como `terceiro`. */
  serviceType?: FinanceServiceType
  serviceName: string
  budget1?: number
  budget2?: number
  budget3?: number
  serviceValue?: number
  /** Valor pago / realizado (opcional). */
  actualValue?: number
  winningCompany?: string
  nfReceived: boolean
  nfDueDate?: string
  approvalStatus: FinanceApprovalStatus
  approvedBy?: string
  approvedByName?: string
  approvedAt?: string
  rejectionReason?: string
  attachmentPath?: string
  attachmentName?: string
  budgetAttachments?: FinanceAttachment[]
  invoiceAttachment?: FinanceAttachment
  ownerId: string
  createdAt?: unknown
  updatedAt?: unknown
}

export interface FinanceAttachment {
  id: string
  name: string
  storagePath: string
  contentType: string
  size: number
  uploadedAt: string
}

export interface PlaybookItem {
  id: string
  kind: PlaybookItemKind
  phase: PlaybookPhase
  title: string
  description?: string
  offsetDays: number
  durationMinutes?: number
  startTime?: string
  location?: string
  documentCategory?: DocumentCategory
  assigneeName?: string
  order: number
}

export interface Playbook {
  id: string
  name: string
  description?: string
  visitType: string
  items: PlaybookItem[]
  ownerId: string
  orgId: string
  createdAt?: unknown
  updatedAt?: unknown
}

export interface VisitDocument extends SoftDeletable {
  id: string
  visitId: string
  name: string
  category: DocumentCategory
  storagePath: string
  contentType: string
  size: number
  ownerId: string
  createdAt?: unknown
}

export interface DocumentPlaceholder {
  id: string
  visitId: string
  title: string
  category: DocumentCategory
  phase?: PlaybookPhase
  ownerId: string
  createdAt?: unknown
}

export type NotificationType =
  | 'visit_created'
  | 'visit_status_changed'
  | 'task_created'
  | 'task_status_changed'
  | 'task_due_soon'
  | 'task_overdue'
  | 'document_uploaded'
  | 'document_pending'
  | 'finance_nf_due'
  | 'finance_nf_overdue'
  | 'finance_approval'
  | 'team_updated'
  | 'activity_soon'
  | 'visit_soon'
  | 'guest_confirmed'
  | 'guest_registration'

export interface Notification {
  id: string
  recipientId: string
  type: NotificationType
  title: string
  body: string
  visitId?: string
  entityId?: string
  href?: string
  read: boolean
  actorId?: string
  actorName?: string
  dedupeKey?: string
  createdAt?: unknown
}

export type ActivityLogEntityType =
  | 'visit'
  | 'task'
  | 'financeItem'
  | 'activity'
  | 'visitor'
  | 'document'

export interface ActivityLog {
  id: string
  entityType: ActivityLogEntityType
  entityId: string
  visitId?: string
  action: string
  changes?: Record<string, { from?: unknown; to?: unknown }>
  summary?: string
  actorId: string
  actorName?: string
  createdAt?: unknown
}

export type InviteRole = 'team' | 'client' | 'user' | 'org_admin'
export type InviteStatus = 'pending' | 'accepted' | 'expired' | 'cancelled'

export interface Invite {
  id: string
  email: string
  role: InviteRole
  token: string
  status: InviteStatus
  createdBy: string
  orgId: string
  department?: string
  visitId?: string
  expiresAt: string
  createdAt?: unknown
  acceptedAt?: unknown
  acceptedBy?: string
}

export type EmailLogKind =
  | 'visit_summary'
  | 'invite'
  | 'visitor_registration_confirm'
  | 'visitor_registration_owner'
export type EmailLogStatus = 'queued' | 'mailto'

export interface EmailLog {
  id: string
  to: string[]
  subject: string
  visitId?: string
  kind: EmailLogKind
  status: EmailLogStatus
  createdBy: string
  createdAt?: unknown
}

/** Agenda denormalizada no link do portal (sem abrir activities ao público). */
export interface GuestAgendaItem {
  date: string
  startTime: string
  endTime: string
  title: string
  location?: string
}

/** Rascunho editável pelo visitante no portal; operador aplica no CRM. */
export interface GuestVisitorDraft {
  name?: string
  document?: string
  cpf?: string
  company?: string
  role?: string
  nationality?: string
  sex?: VisitorSex
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
  fliesByAir?: boolean
  hasFlightData?: boolean
  arrivalFlight?: VisitorFlightInfo
  departureFlight?: VisitorFlightInfo
  hotelName?: string
  language?: string
  whatsapp?: string
  notes?: string
  /** Consentimento LGPD para uso dos dados neste evento. */
  lgpdConsent?: boolean
  lgpdConsentAt?: string
  updatedAt?: string
}

export interface VisitGuestLink {
  id: string
  token: string
  visitId: string
  /**
   * Presente nos links por visitante. Vazio/ausente = link de pré-cadastro da visita
   * (intake), que pode cadastrar N visitantes.
   */
  visitorId?: string
  ownerId: string
  createdBy: string
  expiresAt: string
  revoked?: boolean
  /** Snapshot denormalizado para a rota pública. */
  visitTitle: string
  startDate: string
  endDate: string
  visitorName: string
  company?: string
  city?: string
  arrivalInstructions?: string
  agenda?: GuestAgendaItem[]
  /** Tipo da visita no momento da geração do link (portal escolhe o form). */
  eventKind?: VisitEventKind
  /** Variante de formulário denormalizada (vip | comunidade | geral). */
  formVariant?: VisitorFormVariant
  /** Marca da empresa organizadora (white-label no portal). */
  orgName?: string
  orgLogoUrl?: string
  confirmationStatus: GuestConfirmationStatus
  /** Rascunho único (links antigos / primeiro visitante). */
  visitorDraft?: GuestVisitorDraft
  /** Vários rascunhos no link de cadastro da visita (Dia 2). */
  visitorDrafts?: GuestVisitorDraft[]
  lastAppliedAt?: string
  createdAt?: unknown
  updatedAt?: unknown
}

export interface VisitFeedback {
  id: string
  visitId: string
  guestLinkId: string
  visitorId?: string
  rating: number
  comment?: string
  token: string
  submittedAt: string
}
