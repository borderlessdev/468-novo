import type { NotificationType } from '@/types'

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
}

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  taskDueSoon: true,
  financeNfDue: true,
  financeApproval: true,
  visitStatusChanged: true,
  visitCreated: true,
  taskCreated: true,
  taskStatusChanged: true,
  documentUploaded: true,
  teamUpdated: true,
  activitySoon: true,
  taskOverdue: true,
  visitSoon: true,
  documentPending: true,
  financeNfOverdue: true,
  guestConfirmed: true,
}

export const NOTIFICATION_PREFERENCE_ITEMS: {
  key: keyof NotificationPreferences
  label: string
  description: string
}[] = [
  {
    key: 'taskDueSoon',
    label: 'Prazos de tarefas',
    description: 'Avisos quando uma tarefa estiver perto do vencimento',
  },
  {
    key: 'taskOverdue',
    label: 'Tarefas atrasadas',
    description: 'Quando uma tarefa passar do prazo sem conclusão',
  },
  {
    key: 'financeNfDue',
    label: 'Vencimento de NF',
    description: 'Lembretes de notas fiscais com data de vencimento próxima',
  },
  {
    key: 'financeNfOverdue',
    label: 'NF atrasada',
    description: 'Quando a nota fiscal já passou do vencimento e não foi recebida',
  },
  {
    key: 'financeApproval',
    label: 'Aprovação financeira',
    description: 'Quando uma linha financeira for aprovada ou rejeitada',
  },
  {
    key: 'visitSoon',
    label: 'Visitas próximas',
    description: 'Avisos de visitas que começam em até 2 dias',
  },
  {
    key: 'documentPending',
    label: 'Documentos pendentes',
    description: 'Placeholders sem arquivo ou visitas ativas sem documentos',
  },
  {
    key: 'guestConfirmed',
    label: 'Confirmação do portal',
    description: 'Quando o visitante confirma ou recusa pelo link do portal',
  },
  {
    key: 'visitStatusChanged',
    label: 'Status de visitas',
    description: 'Quando o status de uma visita for alterado',
  },
  {
    key: 'visitCreated',
    label: 'Novas visitas',
    description: 'Quando uma nova visita for criada na sua equipe',
  },
  {
    key: 'taskCreated',
    label: 'Novas tarefas',
    description: 'Quando uma tarefa for adicionada a uma visita',
  },
  {
    key: 'taskStatusChanged',
    label: 'Status de tarefas',
    description: 'Quando uma tarefa mudar de status',
  },
  {
    key: 'documentUploaded',
    label: 'Documentos',
    description: 'Quando um documento for enviado a uma visita',
  },
  {
    key: 'teamUpdated',
    label: 'Equipe',
    description: 'Quando a equipe de uma visita for atualizada',
  },
  {
    key: 'activitySoon',
    label: 'Programação próxima',
    description: 'Avisos de atividades nas próximas 24 horas',
  },
]

const TYPE_TO_PREFERENCE: Record<NotificationType, keyof NotificationPreferences> = {
  task_due_soon: 'taskDueSoon',
  task_overdue: 'taskOverdue',
  finance_nf_due: 'financeNfDue',
  finance_nf_overdue: 'financeNfOverdue',
  finance_approval: 'financeApproval',
  visit_status_changed: 'visitStatusChanged',
  visit_created: 'visitCreated',
  visit_soon: 'visitSoon',
  task_created: 'taskCreated',
  task_status_changed: 'taskStatusChanged',
  document_uploaded: 'documentUploaded',
  document_pending: 'documentPending',
  team_updated: 'teamUpdated',
  activity_soon: 'activitySoon',
  guest_confirmed: 'guestConfirmed',
}

export function mergeNotificationPreferences(
  partial?: Partial<NotificationPreferences> | null,
): NotificationPreferences {
  return { ...DEFAULT_NOTIFICATION_PREFERENCES, ...partial }
}

export function isNotificationTypeEnabled(
  type: NotificationType,
  preferences: NotificationPreferences,
): boolean {
  const key = TYPE_TO_PREFERENCE[type]
  return preferences[key] ?? true
}
