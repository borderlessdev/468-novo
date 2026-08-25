import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertTriangle,
  CalendarDays,
  ClipboardList,
  FileText,
  Receipt,
} from 'lucide-react'
import { toast } from 'sonner'
import { EmptyState, PageHeader } from '@/components/shared/PageHeader'
import { TaskStatusBadge, VisitStatusBadge } from '@/components/shared/StatusBadge'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useAuth } from '@/contexts/AuthContext'
import {
  financePendingTags,
  type FinancePendingTag,
} from '@/lib/financeMetrics'
import {
  collectPendingDocuments,
  isOverdueTask,
  isUpcomingVisit,
  todayIso,
  type PendingDocumentRow,
} from '@/lib/operations'
import { formatDate } from '@/lib/utils'
import { listFinanceItemsByOwner } from '@/services/finance'
import { listPendingTasks } from '@/services/tasks'
import { listVisits } from '@/services/visits'
import type { FinanceItem, Task, Visit } from '@/types'

const FINANCE_TAG_LABEL: Record<FinancePendingTag, string> = {
  sem_aprovacao: 'Sem aprovação',
  nf_vencida: 'Vencida',
  nf_a_vencer: 'A vencer',
  desvio: 'Desvio',
}

type FinancePendingRow = {
  item: FinanceItem
  tags: FinancePendingTag[]
}

export function OperationsPage() {
  const { user, isAdmin, role, isClient } = useAuth()
  const [loading, setLoading] = useState(true)
  const [overdueTasks, setOverdueTasks] = useState<Task[]>([])
  const [upcomingVisits, setUpcomingVisits] = useState<Visit[]>([])
  const [pendingDocs, setPendingDocs] = useState<PendingDocumentRow[]>([])
  const [financePending, setFinancePending] = useState<FinancePendingRow[]>([])
  const [visitsById, setVisitsById] = useState<Map<string, Visit>>(new Map())

  const load = useCallback(async () => {
    if (!user) return
    setLoading(true)
    try {
      const today = todayIso()
      const [visits, tasks, finance] = await Promise.all([
        listVisits(user.uid, isAdmin, role),
        listPendingTasks(user.uid, isAdmin, role),
        isClient
          ? Promise.resolve([] as FinanceItem[])
          : listFinanceItemsByOwner(user.uid, isAdmin, role),
      ])
      setVisitsById(new Map(visits.map((visit) => [visit.id, visit])))
      setOverdueTasks(tasks.filter((task) => isOverdueTask(task, today)))
      setUpcomingVisits(
        visits
          .filter((visit) => isUpcomingVisit(visit, today, 7))
          .sort((a, b) => a.startDate.localeCompare(b.startDate)),
      )
      setPendingDocs(await collectPendingDocuments(visits, isAdmin))
      setFinancePending(
        finance
          .map((item) => ({ item, tags: financePendingTags(item, today) }))
          .filter((row) => row.tags.length > 0),
      )
    } catch (error) {
      console.error(error)
      toast.error('Erro ao carregar a central de operações')
    } finally {
      setLoading(false)
    }
  }, [user, isAdmin, role, isClient])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Central de operações"
        description="Pendências que pedem atenção agora. Alertas também aparecem no sino do cabeçalho."
      />

      {loading ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-64 w-full rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base">Tarefas atrasadas</CardTitle>
              <AlertTriangle className="h-4 w-4 text-destructive" />
            </CardHeader>
            <CardContent>
              {overdueTasks.length === 0 ? (
                <EmptyState
                  icon={ClipboardList}
                  title="Nada atrasado"
                  description="Não há tarefas com prazo vencido."
                />
              ) : (
                <ul className="space-y-2">
                  {overdueTasks.map((task) => (
                    <li key={task.id}>
                      <Link
                        to={`/planejamento?visita=${task.visitId}`}
                        className="block rounded-lg border px-3 py-2 transition-colors hover:bg-muted/50"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-sm font-medium">{task.title}</p>
                          <TaskStatusBadge status={task.status} />
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {visitsById.get(task.visitId)?.title ?? 'Visita'}
                          {task.dueDate ? ` · prazo ${formatDate(task.dueDate)}` : ''}
                          {task.assigneeName ? ` · ${task.assigneeName}` : ''}
                        </p>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base">Visitas nos próximos 7 dias</CardTitle>
              <CalendarDays className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              {upcomingVisits.length === 0 ? (
                <EmptyState
                  icon={CalendarDays}
                  title="Nenhuma visita próxima"
                  description="Não há visitas com início nos próximos 7 dias."
                />
              ) : (
                <ul className="space-y-2">
                  {upcomingVisits.map((visit) => (
                    <li key={visit.id}>
                      <Link
                        to={`/visitas/${visit.id}`}
                        className="block rounded-lg border px-3 py-2 transition-colors hover:bg-muted/50"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-sm font-medium">{visit.title}</p>
                          <VisitStatusBadge status={visit.status} />
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {formatDate(visit.startDate)}
                          {visit.endDate !== visit.startDate
                            ? ` a ${formatDate(visit.endDate)}`
                            : ''}
                        </p>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base">Documentos pendentes</CardTitle>
              <FileText className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {pendingDocs.length === 0 ? (
                <EmptyState
                  icon={FileText}
                  title="Documentação em dia"
                  description="Não há placeholders nem visitas ativas sem documento."
                />
              ) : (
                <ul className="space-y-2">
                  {pendingDocs.map((row) => (
                    <li key={`${row.visitId}-${row.placeholder?.id ?? row.kind}`}>
                      <Link
                        to={`/visitas/${row.visitId}`}
                        className="block rounded-lg border px-3 py-2 transition-colors hover:bg-muted/50"
                      >
                        <p className="text-sm font-medium">{row.label}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {row.visitTitle}
                          {row.kind === 'placeholder'
                            ? ' · arquivo do playbook'
                            : ' · visita sem documentos'}
                        </p>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          {!isClient ? (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0">
                <CardTitle className="text-base">Pendências financeiras</CardTitle>
                <Receipt className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                {financePending.length === 0 ? (
                  <EmptyState
                    icon={Receipt}
                    title="Financeiro em dia"
                    description="Sem aprovação pendente, NF em atraso ou desvio relevante."
                  />
                ) : (
                  <ul className="space-y-2">
                    {financePending.map(({ item, tags }) => (
                      <li key={item.id}>
                        <Link
                          to={`/financeiro?visita=${item.visitId}`}
                          className="block rounded-lg border px-3 py-2 transition-colors hover:bg-muted/50"
                        >
                          <p className="text-sm font-medium">{item.serviceName}</p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {visitsById.get(item.visitId)?.title ?? 'Visita'}
                            {item.nfDueDate
                              ? ` · vence ${formatDate(item.nfDueDate)}`
                              : ''}
                          </p>
                          <div className="mt-2 flex flex-wrap gap-1">
                            {tags.map((tag) => (
                              <Badge
                                key={tag}
                                variant={
                                  tag === 'nf_vencida' || tag === 'desvio'
                                    ? 'warning'
                                    : 'secondary'
                                }
                                className="text-[10px]"
                              >
                                {FINANCE_TAG_LABEL[tag]}
                              </Badge>
                            ))}
                          </div>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          ) : null}
        </div>
      )}
    </div>
  )
}
