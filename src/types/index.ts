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

export interface ModulePermissions {
  visitors: boolean
  planning: boolean
  finance: boolean
  reports: boolean
}

export interface NotificationPreferences {
  taskDueSoon: boolean
  financeNfDue: boolean
  visitStatusChanged: boolean
  visitCreated: boolean
  taskCreated: boolean
  taskStatusChanged: boolean
  documentUploaded: boolean
  teamUpdated: boolean
  activitySoon: boolean
}

export type VisitStatus =
  | 'planejamento'
  | 'em_andamento'
  | 'concluida'
  | 'cancelada'

export type TaskStatus = 'backlog' | 'in_progress' | 'completed'

export interface UserProfile {
  uid: string
  name: string
  email: string
  photoURL?: string
  role: UserRole
  notificationPreferences?: Partial<NotificationPreferences>
  modulePermissions?: Partial<ModulePermissions>
  createdAt?: unknown
  updatedAt?: unknown
}

export interface Visit extends SoftDeletable {
  id: string
  title: string
  company?: string
  state?: string
  city?: string
  startDate: string
  endDate: string
  status: VisitStatus
  objective?: string
  language?: string
  pvNumber?: string
  progress: number
  teamMemberIds: string[]
  clientUserIds: string[]
  isTemplate?: boolean
  ownerId: string
  createdAt?: unknown
  updatedAt?: unknown
}

export interface VisitorGift {
  name: string
  quantity?: number
  notes?: string
}

export interface Visitor extends SoftDeletable {
  id: string
  name: string
  document: string
  company?: string
  role?: string
  country?: string
  language?: string
  weightKg?: number
  shoeSize?: number
  dietaryRestriction?: string
  mobilityReduced?: boolean
  notes?: string
  gifts?: VisitorGift[]
  ownerId: string
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
  ownerId: string
  createdAt?: unknown
  updatedAt?: unknown
}

export interface FinanceItem extends SoftDeletable {
  id: string
  visitId: string
  serviceName: string
  budget1?: number
  budget2?: number
  budget3?: number
  serviceValue?: number
  winningCompany?: string
  nfReceived: boolean
  nfDueDate?: string
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

export type DocumentCategory =
  | 'contrato'
  | 'boarding'
  | 'briefing'
  | 'comprovante'
  | 'outro'

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

export type NotificationType =
  | 'visit_created'
  | 'visit_status_changed'
  | 'task_created'
  | 'task_status_changed'
  | 'task_due_soon'
  | 'document_uploaded'
  | 'finance_nf_due'
  | 'team_updated'
  | 'activity_soon'

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

export type InviteRole = 'team' | 'client'
export type InviteStatus = 'pending' | 'accepted' | 'expired' | 'cancelled'

export interface Invite {
  id: string
  email: string
  role: InviteRole
  token: string
  status: InviteStatus
  createdBy: string
  visitId?: string
  expiresAt: string
  createdAt?: unknown
  acceptedAt?: unknown
  acceptedBy?: string
}

export type EmailLogKind = 'visit_summary' | 'invite'
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
