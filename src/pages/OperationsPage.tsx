import { useCallback, useEffect, useState } from 'react'
import {
  AlertTriangle,
  CalendarDays,
  ClipboardList,
  FileText,
  Receipt,
} from 'lucide-react'
import { toast } from 'sonner'
import { EmptyState, PageHeader } from '@/components/shared/PageHeader'
import { ListRowLink, SectionCardHeader } from '@/components/shared/ListRow'
import { TaskStatusBadge, VisitStatusBadge } from '@/components/shared/StatusBadge'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
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
      const visits = await listVisits(user.uid, isAdmin, role)
      const [tasks, finance] = await Promise.all([
        listPendingTasks(user.uid, isAdmin, role, visits),
        isClient
          ? Promise.resolve([] as FinanceItem[])
          : listFinanceItemsByOwner(user.uid, isAdmin, role, visits),
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
    <div className="animate-fade-in space-y-6">
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
          <Card className="overflow-hidden">
            <SectionCardHeader
              title="Tarefas atrasadas"
              icon={AlertTriangle}
              count={overdueTasks.length}
            />
            <CardContent>
              {overdueTasks.length === 0 ? (
                <EmptyState
                  compact
                  icon={ClipboardList}
                  title="Nada atrasado"
                  description="Não há tarefas com prazo vencido."
                />
              ) : (
                <ul className="space-y-2">
                  {overdueTasks.map((task) => (
                    <li key={task.id}>
                      <ListRowLink
                        to={`/planejamento?visita=${task.visitId}`}
                        title={task.title}
                        meta={[
                          visitsById.get(task.visitId)?.title ?? 'Visita',
                          task.dueDate ? `prazo ${formatDate(task.dueDate)}` : null,
                          task.assigneeName,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                        trailing={<TaskStatusBadge status={task.status} />}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card className="overflow-hidden">
            <SectionCardHeader
              title="Visitas nos próximos 7 dias"
              icon={CalendarDays}
              count={upcomingVisits.length}
            />
            <CardContent>
              {upcomingVisits.length === 0 ? (
                <EmptyState
                  compact
                  icon={CalendarDays}
                  title="Nenhuma visita próxima"
                  description="Não há visitas com início nos próximos 7 dias."
                />
              ) : (
                <ul className="space-y-2">
                  {upcomingVisits.map((visit) => (
                    <li key={visit.id}>
                      <ListRowLink
                        to={`/visitas/${visit.id}`}
                        title={visit.title}
                        meta={`${formatDate(visit.startDate)}${
                          visit.endDate !== visit.startDate
                            ? ` a ${formatDate(visit.endDate)}`
                            : ''
                        }`}
                        trailing={<VisitStatusBadge status={visit.status} />}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card className="overflow-hidden">
            <SectionCardHeader
              title="Documentos pendentes"
              icon={FileText}
              count={pendingDocs.length}
            />
            <CardContent>
              {pendingDocs.length === 0 ? (
                <EmptyState
                  compact
                  icon={FileText}
                  title="Documentação em dia"
                  description="Não há placeholders nem visitas ativas sem documento."
                />
              ) : (
                <ul className="space-y-2">
                  {pendingDocs.map((row) => (
                    <li key={`${row.visitId}-${row.placeholder?.id ?? row.kind}`}>
                      <ListRowLink
                        to={`/visitas/${row.visitId}`}
                        title={row.label}
                        meta={`${row.visitTitle} · ${
                          row.kind === 'placeholder'
                            ? 'arquivo do playbook'
                            : 'visita sem documentos'
                        }`}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          {!isClient ? (
            <Card className="overflow-hidden">
              <SectionCardHeader
                title="Pendências financeiras"
                icon={Receipt}
                count={financePending.length}
              />
              <CardContent>
                {financePending.length === 0 ? (
                  <EmptyState
                    compact
                    icon={Receipt}
                    title="Financeiro em dia"
                    description="Sem aprovação pendente, NF em atraso ou desvio relevante."
                  />
                ) : (
                  <ul className="space-y-2">
                    {financePending.map(({ item, tags }) => (
                      <li key={item.id}>
                        <ListRowLink
                          to={`/financeiro?visita=${item.visitId}`}
                          title={item.serviceName}
                          meta={[
                            visitsById.get(item.visitId)?.title ?? 'Visita',
                            item.nfDueDate ? `vence ${formatDate(item.nfDueDate)}` : null,
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                          trailing={
                            <>
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
                            </>
                          }
                        />
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
