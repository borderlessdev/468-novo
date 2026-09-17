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
} from 'lucide-react'
import { toast } from 'sonner'
import { CyclePeriodFields } from '@/components/shared/CyclePeriodFields'
import { PageHeader, EmptyState } from '@/components/shared/PageHeader'
import { ListRowLink, SectionCardHeader } from '@/components/shared/ListRow'
import { VisitStatusBadge, TaskStatusBadge } from '@/components/shared/StatusBadge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useAuth } from '@/contexts/AuthContext'
import { useOrg } from '@/contexts/OrgContext'
import { useCyclePeriod } from '@/hooks/useCyclePeriod'
import { formatCurrency, formatDate } from '@/lib/utils'
import {
  VISIT_EVENT_KINDS,
  visitEventKindLabel,
  visitEventLabel,
} from '@/lib/visitEvent'
import { listVisits } from '@/services/visits'
import { listPendingTasks } from '@/services/tasks'
import { listFinanceItemsByOwner } from '@/services/finance'
import { listVisitVisitors } from '@/services/visitVisitors'
import { listVisitors } from '@/services/visitors'
import type { FinanceItem, Task, Visit, VisitEventKind, Visitor } from '@/types'
import { Badge } from '@/components/ui/badge'

function visitorCreatedIso(visitor: Visitor): string | null {
  const raw = visitor.createdAt
  if (!raw) return null
  if (typeof raw === 'object' && raw !== null && 'toDate' in raw) {
    const date = (raw as { toDate: () => Date }).toDate()
    if (Number.isNaN(date.getTime())) return null
    return date.toISOString().slice(0, 10)
  }
  const date = new Date(String(raw))
  if (Number.isNaN(date.getTime())) return null
  return date.toISOString().slice(0, 10)
}

type KpiRecord = {
  id: string
  name: string
  href: string
}

function KpiValue({
  value,
  records,
  onPreview,
}: {
  value: string
  records?: KpiRecord[]
  onPreview?: (records: KpiRecord[]) => void
}) {
  if (!records) {
    return <div className="font-display text-2xl font-semibold tracking-tight tabular-nums">{value}</div>
  }

  return (
    <button
      type="button"
      aria-label={`${value}. Exibir visitas no painel Próximas visitas`}
      onMouseEnter={() => onPreview?.(records)}
      onFocus={() => onPreview?.(records)}
      onClick={() => onPreview?.(records)}
      className="cursor-pointer border-b border-dashed border-current/35 font-display text-2xl font-semibold tracking-tight tabular-nums outline-none transition-opacity hover:opacity-80 focus-visible:opacity-80"
    >
      {value}
    </button>
  )
}

export function DashboardPage() {
  const { user, isPlatformAdmin, role, isClient } = useAuth()
  const { activeOrgId } = useOrg()
  const {
    cycleLabel,
    isDefaultCycle,
    range,
    cycleStart,
    cycleEnd,
    setCycleStart,
    setCycleEnd,
    resetCycle,
  } = useCyclePeriod({ notify: true })
  const [loading, setLoading] = useState(true)
  const [visits, setVisits] = useState<Visit[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [financeItems, setFinanceItems] = useState<FinanceItem[]>([])
  const [visitorCount, setVisitorCount] = useState(0)
  const [newVisitorsInCycle, setNewVisitorsInCycle] = useState(0)
  const [previewRecordIds, setPreviewRecordIds] = useState<string[] | null>(null)

  const load = useCallback(async () => {
    if (!user || !activeOrgId) return
    setLoading(true)
    try {
      const visitsData = await listVisits(activeOrgId, user.uid, isPlatformAdmin, role)
      const [tasksData, financeData, visitorsData] = await Promise.all([
        listPendingTasks(activeOrgId, user.uid, isPlatformAdmin, role, visitsData),
        listFinanceItemsByOwner(activeOrgId, user.uid, isPlatformAdmin, role, visitsData),
        listVisitors(activeOrgId),
      ])
      setVisits(visitsData)
      setTasks(tasksData.slice(0, 8))
      setFinanceItems(financeData)
      setNewVisitorsInCycle(
        visitorsData.filter((visitor) => {
          const created = visitorCreatedIso(visitor)
          if (!created) return false
          return created >= range.startIso && created <= range.endIso
        }).length,
      )
    } catch (error) {
      console.error(error)
      toast.error('Erro ao carregar o dashboard')
    } finally {
      setLoading(false)
    }
  }, [user, activeOrgId, isPlatformAdmin, role, range.startIso, range.endIso])

  useEffect(() => {
    void load()
  }, [load])

  const cycleVisits = useMemo(() => {
    return visits.filter(
      (v) => v.startDate >= range.startIso && v.startDate <= range.endIso,
    )
  }, [visits, range.endIso, range.startIso])

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
          cycleVisits.map((v) => listVisitVisitors(v.id, user.uid, isPlatformAdmin)),
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
  }, [cycleVisits, user, isPlatformAdmin])

  const planningVisits = cycleVisits.filter((v) => v.status === 'planejamento')
  const ongoingVisits = cycleVisits.filter((v) => v.status === 'em_andamento')
  const vipCommercialVisits = cycleVisits.filter(
    (v) => v.eventKind === 'visita_vip' && v.vipSubtype === 'comercial',
  )

  const eventKindCounts = useMemo(() => {
    const counts = Object.fromEntries(
      VISIT_EVENT_KINDS.map((kind) => [kind, [] as Visit[]]),
    ) as Record<VisitEventKind, Visit[]>
    for (const visit of cycleVisits) {
      if (visit.eventKind && counts[visit.eventKind]) {
        counts[visit.eventKind].push(visit)
      }
    }
    return counts
  }, [cycleVisits])

  const toKpiRecords = (items: Visit[]): KpiRecord[] =>
    [...items]
      .sort((a, b) => a.startDate.localeCompare(b.startDate))
      .map((visit) => ({
        id: visit.id,
        name: visit.title,
        href: `/visitas/${visit.id}`,
      }))
  const upcoming = [...cycleVisits]
    .sort((a, b) => a.startDate.localeCompare(b.startDate))
    .slice(0, 5)

  const visitById = useMemo(() => new Map(visits.map((v) => [v.id, v])), [visits])
  const displayedVisits = previewRecordIds
    ? previewRecordIds.flatMap((id) => {
        const visit = visitById.get(id)
        return visit ? [visit] : []
      })
    : upcoming

  const eventKindTone: Record<VisitEventKind, string> = {
    visita_vip: 'bg-amber-500/10 text-amber-800 dark:text-amber-400',
    comunidade_prioritaria: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
    visita_comunidade: 'bg-teal-500/10 text-teal-700 dark:text-teal-400',
    evento: 'bg-indigo-500/10 text-indigo-700 dark:text-indigo-400',
  }

  const kpis = [
    ...VISIT_EVENT_KINDS.map((kind) => ({
      label: visitEventKindLabel(kind),
      value: String(eventKindCounts[kind].length),
      records: toKpiRecords(eventKindCounts[kind]),
      hint: `Tipo de evento · ciclo ${cycleLabel}`,
      icon: CalendarDays,
      tone: eventKindTone[kind],
    })),
    {
      label: 'VIP comerciais',
      value: String(vipCommercialVisits.length),
      records: toKpiRecords(vipCommercialVisits),
      hint: `Subtipo Comercial · ciclo ${cycleLabel}`,
      icon: TrendingUp,
      tone: 'bg-orange-500/10 text-orange-700 dark:text-orange-400',
    },
    {
      label: 'Em planejamento',
      value: String(planningVisits.length),
      records: toKpiRecords(planningVisits),
      icon: Clock3,
      tone: 'bg-warning/10 text-warning',
    },
    {
      label: 'Em andamento',
      value: String(ongoingVisits.length),
      records: toKpiRecords(ongoingVisits),
      icon: TrendingUp,
      tone: 'bg-sky-500/10 text-sky-700 dark:text-sky-400',
    },
    {
      label: 'Total de visitantes',
      value: String(visitorCount),
      hint: `Vinculados às visitas do ciclo ${cycleLabel}`,
      icon: Users,
      tone: 'bg-violet-500/10 text-violet-700 dark:text-violet-400',
    },
    {
      label: 'Novos no CRM',
      value: String(newVisitorsInCycle),
      hint: `Cadastrados no ciclo ${cycleLabel}`,
      icon: Users,
      tone: 'bg-fuchsia-500/10 text-fuchsia-700 dark:text-fuchsia-400',
    },
    ...(!isClient
      ? [
          {
            label: 'Gastos do ciclo',
            value: formatCurrency(cycleSpend),
            hint: `Ciclo ${cycleLabel}`,
            icon: DollarSign,
            tone: 'bg-brand/15 text-brand-foreground dark:text-brand',
          },
        ]
      : []),
  ]

  return (
    <div className="animate-fade-in space-y-6">
      <PageHeader
        title="Dashboard"
        description={`Visão geral das operações · Ciclo ${cycleLabel}`}
        actions={
          <CyclePeriodFields
            className="sm:w-auto sm:items-end"
            cycleStart={cycleStart}
            cycleEnd={cycleEnd}
            isDefaultCycle={isDefaultCycle}
            onStartChange={setCycleStart}
            onEndChange={setCycleEnd}
            onReset={resetCycle}
          />
        }
      />

      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: isClient ? 8 : 9 }).map((_, i) => (
            <Skeleton key={i} className="h-28 w-full rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {kpis.map((kpi, index) => (
            <Card
              key={kpi.label}
              className="relative animate-fade-in-up transition-shadow hover:shadow-[0_2px_8px_rgba(15,47,42,0.06)] hover:z-50 focus-within:z-50"
              style={{ animationDelay: `${index * 40}ms` }}
            >
              <CardHeader className="flex flex-row items-start justify-between space-y-0">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {kpi.label}
                </CardTitle>
                <div
                  className={`flex h-8 w-8 items-center justify-center rounded-lg ${kpi.tone}`}
                >
                  <kpi.icon className="h-4 w-4" />
                </div>
              </CardHeader>
              <CardContent>
                <KpiValue
                  value={kpi.value}
                  records={kpi.records}
                  onPreview={(records) => setPreviewRecordIds(records.map((record) => record.id))}
                />
                {kpi.hint ? (
                  <p className="mt-1.5 text-xs text-muted-foreground">{kpi.hint}</p>
                ) : null}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <SectionCardHeader
            title={previewRecordIds ? 'Eventos selecionados' : 'Próximos eventos'}
            icon={MapPin}
            count={loading ? undefined : displayedVisits.length}
            action={
              <Link
                to="/visitas"
                className="text-xs font-medium text-primary underline-offset-4 hover:underline"
              >
                Ver todos
              </Link>
            }
          />
          <CardContent className="space-y-2">
            {loading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full rounded-xl" />
              ))
            ) : displayedVisits.length === 0 ? (
              <EmptyState
                compact
                icon={MapPin}
                title="Nenhum evento no ciclo"
                description="Ajuste o período do ciclo ou cadastre uma nova visita com tipo de evento."
              />
            ) : (
              displayedVisits.map((visit) => (
                <ListRowLink
                  key={visit.id}
                  to={`/visitas/${visit.id}`}
                  title={visit.title}
                  meta={`${visitEventLabel(visit)} · ${formatDate(visit.startDate)}${visit.city ? ` · ${visit.city}` : ''}`}
                  trailing={
                    <div className="flex flex-col items-end gap-1">
                      <VisitStatusBadge status={visit.status} />
                      <Badge variant="secondary" className="font-normal text-[10px]">
                        {visitEventKindLabel(visit.eventKind)}
                      </Badge>
                    </div>
                  }
                />
              ))
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <SectionCardHeader
            title="Tarefas pendentes"
            icon={AlertTriangle}
            count={loading ? undefined : tasks.length}
          />
          <CardContent className="space-y-2">
            {loading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full rounded-xl" />
              ))
            ) : tasks.length === 0 ? (
              <EmptyState
                compact
                icon={Clock3}
                title="Nenhuma tarefa pendente"
                description="As tarefas do planejamento aparecerão aqui."
              />
            ) : (
              tasks.map((task) => {
                const visit = visitById.get(task.visitId)
                return (
                  <ListRowLink
                    key={task.id}
                    to={`/planejamento?visita=${task.visitId}`}
                    title={task.title}
                    meta={`${visit ? `${visit.title} · ` : ''}Prazo: ${task.dueDate ? formatDate(task.dueDate) : 'Sem prazo'}`}
                    trailing={<TaskStatusBadge status={task.status} />}
                  />
                )
              })
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
