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

export interface NotificationPreferences {
  taskDueSoon: boolean
  financeNfDue: boolean
  visitStatusChanged: boolean
  visitCreated: boolean
  taskCreated: boolean
  taskStatusChanged: boolean
  documentUploaded: boolean
  teamUpdated: boolean
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
  pvNumber?: string
  progress: number
  teamMemberIds: string[]
  clientUserIds: string[]
  ownerId: string
  createdAt?: unknown
  updatedAt?: unknown
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
  ownerId: string
  createdAt?: unknown
  updatedAt?: unknown
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
