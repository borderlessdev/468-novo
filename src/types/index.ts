export type UserRole = 'user' | 'team' | 'client' | 'admin'

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
  createdAt?: unknown
  updatedAt?: unknown
}

export interface Visit {
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

export interface Visitor {
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

export interface Activity {
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

export interface Task {
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

export interface FinanceItem {
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

export interface VisitDocument {
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
