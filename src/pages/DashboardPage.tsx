import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  CalendarDays,
  Clock3,
  DollarSign,
  TrendingUp,
  Users,
  AlertTriangle,
  MapPin,
  RotateCcw,
} from 'lucide-react'
import { toast } from 'sonner'
import { PageHeader, EmptyState } from '@/components/shared/PageHeader'
import { VisitStatusBadge, TaskStatusBadge } from '@/components/shared/StatusBadge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { useAuth } from '@/contexts/AuthContext'
import { getCurrentCycle } from '@/lib/constants'
import { formatCurrency, formatDate } from '@/lib/utils'
import { listVisits } from '@/services/visits'
import { listPendingTasks } from '@/services/tasks'
import { listFinanceItemsByOwner } from '@/services/finance'
import { listVisitVisitors } from '@/services/visitVisitors'
import type { FinanceItem, Task, Visit } from '@/types'

function formatCycleLabel(startIso: string, endIso: string) {
  return `${formatDate(startIso)} a ${formatDate(endIso)}`
}

export function DashboardPage() {
  const { user, isAdmin, role, isClient } = useAuth()
  const defaultCycle = useMemo(() => getCurrentCycle(), [])
  const [cycleStart, setCycleStart] = useState(defaultCycle.startIso)
  const [cycleEnd, setCycleEnd] = useState(defaultCycle.endIso)
  const [loading, setLoading] = useState(true)
  const [visits, setVisits] = useState<Visit[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [financeItems, setFinanceItems] = useState<FinanceItem[]>([])
  const [visitorCount, setVisitorCount] = useState(0)

  const cycleLabel = formatCycleLabel(cycleStart, cycleEnd)
  const isDefaultCycle =
    cycleStart === defaultCycle.startIso && cycleEnd === defaultCycle.endIso

  const resetCycle = () => {
    setCycleStart(defaultCycle.startIso)
    setCycleEnd(defaultCycle.endIso)
  }

  const load = useCallback(async () => {
    if (!user) return
    setLoading(true)
    try {
      const [visitsData, tasksData, financeData] = await Promise.all([
        listVisits(user.uid, isAdmin, role),
        listPendingTasks(user.uid, isAdmin, role),
        listFinanceItemsByOwner(user.uid, isAdmin, role),
      ])
      setVisits(visitsData)
      setTasks(tasksData.slice(0, 8))
      setFinanceItems(financeData)
    } catch (error) {
      console.error(error)
      toast.error('Erro ao carregar o dashboard')
    } finally {
      setLoading(false)
    }
  }, [user, isAdmin, role])

  useEffect(() => {
    void load()
  }, [load])

  const cycleVisits = useMemo(() => {
    const start = cycleStart <= cycleEnd ? cycleStart : cycleEnd
    const end = cycleStart <= cycleEnd ? cycleEnd : cycleStart
    return visits.filter((v) => v.startDate >= start && v.startDate <= end)
  }, [visits, cycleStart, cycleEnd])

  const cycleSpend = useMemo(() => {
    const ids = new Set(cycleVisits.map((v) => v.id))
    return financeItems
      .filter((item) => ids.has(item.visitId))
      .reduce((sum, item) => sum + (item.serviceValue ?? 0), 0)
  }, [cycleVisits, financeItems])

  useEffect(() => {
    if (!user || cycleVisits.length === 0) {
      setVisitorCount(0)
      return
    }
    let cancelled = false
    void (async () => {
      try {
        const links = await Promise.all(
          cycleVisits.map((v) => listVisitVisitors(v.id, user.uid, isAdmin)),
        )
        if (!cancelled) {
          setVisitorCount(new Set(links.flat().map((l) => l.visitorId)).size)
        }
      } catch (error) {
        console.error(error)
        if (!cancelled) setVisitorCount(0)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [cycleVisits, user, isAdmin])

  const planning = cycleVisits.filter((v) => v.status === 'planejamento').length
  const ongoing = cycleVisits.filter((v) => v.status === 'em_andamento').length
  const upcoming = [...cycleVisits]
    .sort((a, b) => a.startDate.localeCompare(b.startDate))
    .slice(0, 5)

  const visitById = useMemo(() => new Map(visits.map((v) => [v.id, v])), [visits])

  const kpis = [
    {
      label: 'Visitas no ciclo',
      value: String(cycleVisits.length),
      hint: `Ciclo ${cycleLabel}`,
      icon: CalendarDays,
    },
    { label: 'Em planejamento', value: String(planning), icon: Clock3 },
    { label: 'Em andamento', value: String(ongoing), icon: TrendingUp },
    { label: 'Total de visitantes', value: String(visitorCount), icon: Users },
    ...(!isClient
      ? [
          {
            label: 'Gastos do ciclo',
            value: formatCurrency(cycleSpend),
            hint: `Ciclo ${cycleLabel}`,
            icon: DollarSign,
          },
        ]
      : []),
  ]

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description={`Visão geral das operações (Ciclo de medição: ${cycleLabel})`}
        actions={
          <div className="flex w-full flex-col items-stretch gap-2 sm:w-auto sm:items-end">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="space-y-1">
                <Label htmlFor="cycle-start" className="text-xs text-muted-foreground">
                  Início do ciclo
                </Label>
                <Input
                  id="cycle-start"
                  type="date"
                  value={cycleStart}
                  onChange={(e) => setCycleStart(e.target.value)}
                  className="w-full sm:w-44"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="cycle-end" className="text-xs text-muted-foreground">
                  Fim do ciclo
                </Label>
                <Input
                  id="cycle-end"
                  type="date"
                  value={cycleEnd}
                  onChange={(e) => setCycleEnd(e.target.value)}
                  className="w-full sm:w-44"
                />
              </div>
            </div>
            <Button
              type="button"
              variant="link"
              size="sm"
              className="h-auto justify-end px-0 text-muted-foreground"
              onClick={resetCycle}
              disabled={isDefaultCycle}
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Resetar ciclo
            </Button>
          </div>
        }
      />

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-28 w-full" />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          {kpis.map((kpi) => (
            <Card key={kpi.label}>
              <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {kpi.label}
                </CardTitle>
                <kpi.icon className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-semibold">{kpi.value}</div>
                {kpi.hint ? (
                  <p className="mt-1 text-xs text-muted-foreground">{kpi.hint}</p>
                ) : null}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>Próximas Visitas</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {loading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))
            ) : upcoming.length === 0 ? (
              <EmptyState
                icon={MapPin}
                title="Nenhuma visita no ciclo"
                description="Ajuste o período do ciclo ou crie uma nova visita."
              />
            ) : (
              upcoming.map((visit) => (
                <Link
                  key={visit.id}
                  to={`/visitas/${visit.id}`}
                  className="flex flex-col gap-2 rounded-lg border border-border px-4 py-3 transition-colors hover:bg-muted/40 sm:flex-row sm:items-center sm:justify-between sm:gap-3"
                >
                  <div className="min-w-0">
                    <p className="font-medium">{visit.title}</p>
                    <p className="text-sm text-muted-foreground">
                      {formatDate(visit.startDate)}
                      {visit.city ? ` · ${visit.city}` : ''}
                    </p>
                  </div>
                  <VisitStatusBadge status={visit.status} />
                </Link>
              ))
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-warning" />
            <CardTitle>Tarefas pendentes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {loading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))
            ) : tasks.length === 0 ? (
              <EmptyState
                icon={Clock3}
                title="Nenhuma tarefa pendente"
                description="As tarefas do planejamento aparecerão aqui."
              />
            ) : (
              tasks.map((task) => {
                const visit = visitById.get(task.visitId)
                return (
                <Link
                  key={task.id}
                  to={`/planejamento?visita=${task.visitId}`}
                  className="flex flex-col gap-2 rounded-lg border border-border px-4 py-3 transition-colors hover:bg-muted/40 sm:flex-row sm:items-center sm:justify-between sm:gap-3"
                >
                  <div className="min-w-0">
                    <p className="font-medium">{task.title}</p>
                    <p className="text-sm text-muted-foreground">
                      {visit ? `${visit.title} · ` : ''}
                      Prazo: {task.dueDate ? formatDate(task.dueDate) : 'Sem prazo'}
                    </p>
                  </div>
                  <TaskStatusBadge status={task.status} />
                </Link>
                )
              })
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
