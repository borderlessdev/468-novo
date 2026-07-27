import { Badge } from '@/components/ui/badge'
import type { VisitStatus, TaskStatus } from '@/types'

const visitLabels: Record<VisitStatus, string> = {
  planejamento: 'Planejamento',
  em_andamento: 'Em andamento',
  concluida: 'Concluída',
  cancelada: 'Cancelada',
}

const visitVariants: Record<VisitStatus, 'warning' | 'default' | 'success' | 'muted'> = {
  planejamento: 'warning',
  em_andamento: 'default',
  concluida: 'success',
  cancelada: 'muted',
}

export function VisitStatusBadge({ status }: { status: VisitStatus }) {
  return <Badge variant={visitVariants[status]}>{visitLabels[status]}</Badge>
}

export function TaskStatusBadge({ status }: { status: TaskStatus }) {
  const label =
    status === 'backlog'
      ? 'Pendente'
      : status === 'in_progress'
        ? 'Em andamento'
        : 'Concluída'
  const variant =
    status === 'backlog' ? 'muted' : status === 'in_progress' ? 'warning' : 'success'
  return <Badge variant={variant}>{label}</Badge>
}
