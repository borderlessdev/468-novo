import type { NotificationType } from '@/types'

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

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  taskDueSoon: true,
  financeNfDue: true,
  visitStatusChanged: true,
  visitCreated: true,
  taskCreated: true,
  taskStatusChanged: true,
  documentUploaded: true,
  teamUpdated: true,
  activitySoon: true,
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
    key: 'financeNfDue',
    label: 'Vencimento de NF',
    description: 'Lembretes de notas fiscais com data de vencimento próxima',
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
  finance_nf_due: 'financeNfDue',
  visit_status_changed: 'visitStatusChanged',
  visit_created: 'visitCreated',
  task_created: 'taskCreated',
  task_status_changed: 'taskStatusChanged',
  document_uploaded: 'documentUploaded',
  team_updated: 'teamUpdated',
  activity_soon: 'activitySoon',
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
