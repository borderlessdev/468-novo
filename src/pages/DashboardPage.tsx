import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import ReactECharts from 'echarts-for-react'
import type { EChartsOption } from 'echarts'
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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { ValeCostOverviewPanel } from '@/components/vale/ValeCostOverviewPanel'
import { ValeFinancePanel } from '@/components/vale/ValeFinancePanel'
import { useAuth } from '@/contexts/AuthContext'
import { useOrg } from '@/contexts/OrgContext'
import { useCyclePeriod } from '@/hooks/useCyclePeriod'
import { usesValeDashboard } from '@/lib/orgDashboard'
import { sumContracted, sumRealized } from '@/lib/financeMetrics'
import { VALE_BRAND } from '@/lib/valeBrand'
import { VALE_VPS, valeVpLabel } from '@/lib/valeVp'
import { formatCurrency, formatDate } from '@/lib/utils'
import {
  VISIT_EVENT_KINDS,
  visitEventKindLabel,
  visitEventLabel,
  visitOverlapsPeriod,
  visitsPeriodHref,
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
      aria-label={`${value}. Exibir experiências no painel do ciclo`}
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
  const { activeOrgId, activeOrg, isOrgAdmin } = useOrg()
  const isValeDash = usesValeDashboard(activeOrg)
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
  const canViewAllPendingTasks = isPlatformAdmin || isOrgAdmin || role === 'admin'
  const [loading, setLoading] = useState(true)
  const [visits, setVisits] = useState<Visit[]>([])
  const [allPendingTasks, setAllPendingTasks] = useState<Task[]>([])
  const [showAllPendingTasks, setShowAllPendingTasks] = useState(true)
  const [financeItems, setFinanceItems] = useState<FinanceItem[]>([])
  const [visitorCount, setVisitorCount] = useState(0)
  const [newVisitorsInCycle, setNewVisitorsInCycle] = useState(0)
  const [previewRecordIds, setPreviewRecordIds] = useState<string[] | null>(null)

  const load = useCallback(async () => {
    if (!user || !activeOrgId) return
    setLoading(true)
    try {
      const visitsData = await listVisits(activeOrgId, user.uid, isPlatformAdmin, role)
      const assigneeFilter = canViewAllPendingTasks ? 'all' : 'me'
      const [tasksData, financeData, visitorsData] = await Promise.all([
        listPendingTasks(activeOrgId, user.uid, isPlatformAdmin, role, visitsData, {
          assigneeFilter,
        }),
        listFinanceItemsByOwner(activeOrgId, user.uid, isPlatformAdmin, role, visitsData),
        listVisitors(activeOrgId),
      ])
      setVisits(visitsData)
      setAllPendingTasks(tasksData)
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
  }, [
    user,
    activeOrgId,
    isPlatformAdmin,
    role,
    canViewAllPendingTasks,
    range.startIso,
    range.endIso,
  ])

  const tasks = useMemo(() => {
    if (!user) return []
    const scoped =
      canViewAllPendingTasks && showAllPendingTasks
        ? allPendingTasks
        : allPendingTasks.filter((task) => task.assigneeId === user.uid)
    return scoped.slice(0, 8)
  }, [allPendingTasks, canViewAllPendingTasks, showAllPendingTasks, user])

  useEffect(() => {
    void load()
  }, [load])

  const cycleVisits = useMemo(() => {
    return visits.filter((v) => visitOverlapsPeriod(v, range.startIso, range.endIso))
  }, [visits, range.endIso, range.startIso])

  /** Realizadas = concluídas. A realizar = planejamento + em andamento. Canceladas fora. */
  const realizedVisits = useMemo(
    () => cycleVisits.filter((v) => v.status === 'concluida'),
    [cycleVisits],
  )
  const pendingVisits = useMemo(
    () =>
      cycleVisits.filter(
        (v) => v.status === 'planejamento' || v.status === 'em_andamento',
      ),
    [cycleVisits],
  )
  const operationalCycleVisits = useMemo(
    () => [...realizedVisits, ...pendingVisits],
    [realizedVisits, pendingVisits],
  )

  const cycleFinanceItems = useMemo(() => {
    const ids = new Set(cycleVisits.map((v) => v.id))
    return financeItems.filter((item) => ids.has(item.visitId))
  }, [cycleVisits, financeItems])

  const cycleContractTotal = useMemo(
    () => sumContracted(cycleFinanceItems),
    [cycleFinanceItems],
  )

  /** Gasto do ciclo: realizado (pago / NF). Fallback visual: contratado se ainda sem realizado. */
  const cycleSpend = useMemo(() => sumRealized(cycleFinanceItems), [cycleFinanceItems])

  const visitorSourceVisits = isValeDash ? operationalCycleVisits : cycleVisits

  useEffect(() => {
    if (!user || visitorSourceVisits.length === 0) {
      setVisitorCount(0)
      return
    }
    let cancelled = false
    void (async () => {
      try {
        const links = await Promise.all(
          visitorSourceVisits.map((v) =>
            listVisitVisitors(v.id, user.uid, isPlatformAdmin),
          ),
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
  }, [visitorSourceVisits, user, isPlatformAdmin])

  const planningVisits = cycleVisits.filter((v) => v.status === 'planejamento')
  const ongoingVisits = cycleVisits.filter((v) => v.status === 'em_andamento')
  const vipCommercialVisits = cycleVisits.filter(
    (v) => v.eventKind === 'visita_vip' && v.vipSubtype === 'comercial',
  )

  const visitsByState = useMemo(() => {
    const map = new Map<string, Visit[]>()
    for (const visit of operationalCycleVisits) {
      const key = visit.state?.trim() || 'Sem estado'
      const list = map.get(key) ?? []
      list.push(visit)
      map.set(key, list)
    }
    return [...map.entries()]
      .map(([label, items]) => ({ label, items, count: items.length }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'pt-BR'))
  }, [operationalCycleVisits])

  const visitsByVp = useMemo(() => {
    const map = new Map<string, Visit[]>()
    for (const vp of VALE_VPS) map.set(vp, [])
    map.set('Sem VP', [])
    for (const visit of operationalCycleVisits) {
      const raw = visit.vp?.trim() ?? ''
      const key =
        raw && (VALE_VPS as readonly string[]).includes(raw) ? raw : valeVpLabel(visit.vp)
      const list = map.get(key) ?? []
      list.push(visit)
      map.set(key, list)
    }
    return [...map.entries()]
      .map(([label, items]) => ({ label, items, count: items.length }))
      .filter(
        (row) =>
          row.count > 0 || (VALE_VPS as readonly string[]).includes(row.label),
      )
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'pt-BR'))
  }, [operationalCycleVisits])

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
  const upcoming = [...cycleVisits].sort((a, b) => a.startDate.localeCompare(b.startDate))
  const periodHref = visitsPeriodHref(range.startIso, range.endIso)

  const visitById = useMemo(() => new Map(visits.map((v) => [v.id, v])), [visits])
  const displayedVisits = previewRecordIds
    ? previewRecordIds.flatMap((id) => {
        const visit = visitById.get(id)
        return visit ? [visit] : []
      })
    : upcoming

  const eventKindTone: Record<VisitEventKind, string> = isValeDash
    ? {
        visita_vip: 'bg-[#ECB11F]/15 text-[#8A6500]',
        comunidade_prioritaria: 'bg-[#007E7A]/12 text-[#005F5B]',
        visita_comunidade: 'bg-[#007E7A]/10 text-[#007E7A]',
        evento: 'bg-[#003D3A]/10 text-[#003D3A]',
      }
    : {
        visita_vip: 'bg-amber-500/10 text-amber-800 dark:text-amber-400',
        comunidade_prioritaria: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
        visita_comunidade: 'bg-teal-500/10 text-teal-700 dark:text-teal-400',
        evento: 'bg-indigo-500/10 text-indigo-700 dark:text-indigo-400',
      }

  const valeKpis = [
    {
      label: 'Visitas realizadas do ciclo',
      value: String(realizedVisits.length),
      records: toKpiRecords(realizedVisits),
      hint: `Status concluída · ciclo ${cycleLabel}`,
      icon: CalendarDays,
      tone: 'bg-[#007E7A]/15 text-[#005F5B]',
    },
    {
      label: 'Visitas a realizar',
      value: String(pendingVisits.length),
      records: toKpiRecords(pendingVisits),
      hint: `Planejamento + em andamento · ciclo ${cycleLabel}`,
      icon: Clock3,
      tone: 'bg-[#ECB11F]/15 text-[#8A6500]',
    },
    {
      label: 'Visitantes do ciclo',
      value: String(visitorCount),
      hint: `Realizadas + a realizar · ciclo ${cycleLabel}`,
      icon: Users,
      tone: 'bg-[#003D3A]/10 text-[#003D3A]',
    },
  ]

  const defaultKpis = [
    {
      label: 'Experiências do ciclo',
      value: String(cycleVisits.length),
      records: toKpiRecords(cycleVisits),
      hint: `Todas as experiências · ciclo ${cycleLabel}`,
      icon: CalendarDays,
      tone: 'bg-brand/15 text-brand-foreground dark:text-brand',
    },
    ...VISIT_EVENT_KINDS.map((kind) => ({
      label: visitEventKindLabel(kind),
      value: String(eventKindCounts[kind].length),
      records: toKpiRecords(eventKindCounts[kind]),
      hint: `Tipo de experiência · ciclo ${cycleLabel}`,
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

  const kpis = isValeDash ? valeKpis : defaultKpis

  const stateBarOption = useMemo<EChartsOption>(() => {
    const rows = [...visitsByState].reverse()
    const total = visitsByState.reduce((sum, row) => sum + row.count, 0)
    return {
      title: {
        text: 'Total de visitas por estado',
        subtext: `${total} visita(s) no ciclo`,
        left: 0,
        textStyle: { color: '#003D3A', fontSize: 14, fontWeight: 600 },
        subtextStyle: { color: '#747678', fontSize: 12 },
      },
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        formatter: (params: unknown) => {
          const row = Array.isArray(params) ? params[0] : null
          if (!row || typeof row !== 'object') return ''
          const item = row as { name?: string; value?: number }
          return `${item.name ?? ''}<br/>Visitas: <b>${item.value ?? 0}</b>`
        },
      },
      grid: { left: 48, right: 36, top: 56, bottom: 28 },
      xAxis: {
        type: 'value',
        minInterval: 1,
        axisLabel: { color: '#747678' },
        splitLine: { lineStyle: { color: '#E8E8E8' } },
      },
      yAxis: {
        type: 'category',
        data: rows.map((row) => row.label),
        axisLabel: { color: '#003D3A' },
        axisTick: { show: false },
        axisLine: { show: false },
      },
      series: [
        {
          name: 'Total de visitas por estado',
          type: 'bar',
          data: rows.map((row) => row.count),
          barMaxWidth: 22,
          itemStyle: {
            color: VALE_BRAND.green,
            borderRadius: [0, 6, 6, 0],
          },
          label: { show: true, position: 'right', color: '#005F5B' },
        },
      ],
    }
  }, [visitsByState])

  const vpBarOption = useMemo<EChartsOption>(() => {
    const rows = [...visitsByVp].reverse()
    const total = visitsByVp.reduce((sum, row) => sum + row.count, 0)
    return {
      title: {
        text: 'Visitas por VP',
        subtext: `${total} visita(s) no ciclo`,
        left: 0,
        textStyle: { color: '#003D3A', fontSize: 14, fontWeight: 600 },
        subtextStyle: { color: '#747678', fontSize: 12 },
      },
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        formatter: (params: unknown) => {
          const row = Array.isArray(params) ? params[0] : null
          if (!row || typeof row !== 'object') return ''
          const item = row as { name?: string; value?: number }
          return `${item.name ?? ''}<br/>Visitas: <b>${item.value ?? 0}</b>`
        },
      },
      grid: { left: 130, right: 36, top: 56, bottom: 28 },
      xAxis: {
        type: 'value',
        minInterval: 1,
        axisLabel: { color: '#747678' },
        splitLine: { lineStyle: { color: '#E8E8E8' } },
      },
      yAxis: {
        type: 'category',
        data: rows.map((row) => row.label),
        axisLabel: {
          color: '#003D3A',
          width: 118,
          overflow: 'truncate',
        },
        axisTick: { show: false },
        axisLine: { show: false },
      },
      series: [
        {
          name: 'Visitas por VP',
          type: 'bar',
          data: rows.map((row) => row.count),
          barMaxWidth: 22,
          itemStyle: {
            color: VALE_BRAND.yellow,
            borderRadius: [0, 6, 6, 0],
          },
          label: { show: true, position: 'right', color: '#8A6500' },
        },
      ],
    }
  }, [visitsByVp])

  const cycleActions = (
    <CyclePeriodFields
      className="sm:w-auto sm:items-end"
      cycleStart={cycleStart}
      cycleEnd={cycleEnd}
      isDefaultCycle={isDefaultCycle}
      onStartChange={setCycleStart}
      onEndChange={setCycleEnd}
      onReset={resetCycle}
    />
  )

  return (
    <div className="animate-fade-in space-y-6">
      {isValeDash ? (
        <ValeCostOverviewPanel
          stats={{
            totalVisits: operationalCycleVisits.length,
            cycleLabel,
            realizedVisits: realizedVisits.length,
            pendingVisits: pendingVisits.length,
            visitorCount,
          }}
          vpRows={visitsByVp.map((row) => ({
            label: row.label,
            count: row.count,
          }))}
        />
      ) : null}

      <PageHeader
        className={isValeDash ? 'sm:items-start' : undefined}
        title={isValeDash ? 'Operações' : 'Dashboard'}
        description={`Visão geral das operações · Ciclo ${cycleLabel}`}
        actions={cycleActions}
      />

      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({
            length: isValeDash ? 3 : isClient ? 9 : 10,
          }).map((_, i) => (
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

      {isValeDash && !loading ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Total de visitas por estado</CardTitle>
              <CardDescription>
                {visitsByState.reduce((sum, row) => sum + row.count, 0)} visita(s) · ciclo{' '}
                {cycleLabel}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {visitsByState.length === 0 ? (
                <EmptyState
                  compact
                  icon={MapPin}
                  title="Nenhuma visita no ciclo"
                  description="Cadastre visitas com UF para ver o total por estado."
                />
              ) : (
                <ReactECharts
                  option={stateBarOption}
                  style={{
                    height: Math.max(280, visitsByState.length * 36 + 72),
                  }}
                  opts={{ renderer: 'svg' }}
                  onEvents={{
                    click: (params: { name?: string }) => {
                      const row = visitsByState.find((item) => item.label === params.name)
                      if (row) setPreviewRecordIds(row.items.map((visit) => visit.id))
                    },
                  }}
                />
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Visitas por VP</CardTitle>
              <CardDescription>
                {visitsByVp.reduce((sum, row) => sum + row.count, 0)} visita(s) por
                vice-presidência · ciclo {cycleLabel}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ReactECharts
                option={vpBarOption}
                style={{
                  height: Math.max(320, visitsByVp.length * 40 + 72),
                }}
                opts={{ renderer: 'svg' }}
                onEvents={{
                  click: (params: { name?: string }) => {
                    const row = visitsByVp.find((item) => item.label === params.name)
                    if (row) setPreviewRecordIds(row.items.map((visit) => visit.id))
                  },
                }}
              />
            </CardContent>
          </Card>
        </div>
      ) : null}

      {isValeDash && !isClient && !loading ? (
        <ValeFinancePanel
          stats={{
            cycleLabel,
            contractTotal: cycleContractTotal,
            spendTotal: cycleSpend,
          }}
        />
      ) : null}

      <div className="grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <SectionCardHeader
            title={
              previewRecordIds
                ? 'Eventos selecionados'
                : isValeDash
                  ? 'Visitas do ciclo'
                  : 'Experiências do ciclo'
            }
            icon={MapPin}
            count={loading ? undefined : displayedVisits.length}
            action={
              <Link
                to={periodHref}
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
                description="Ajuste o período do ciclo ou cadastre uma nova experiência."
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
            action={
              canViewAllPendingTasks ? (
                <div className="flex items-center gap-2">
                  <Label
                    htmlFor="dashboard-pending-tasks-scope"
                    className="cursor-pointer text-xs font-medium text-muted-foreground"
                  >
                    {showAllPendingTasks ? 'Todas' : 'Minhas'}
                  </Label>
                  <Switch
                    id="dashboard-pending-tasks-scope"
                    checked={showAllPendingTasks}
                    onCheckedChange={setShowAllPendingTasks}
                    aria-label={
                      showAllPendingTasks
                        ? 'Mostrando todas as tarefas. Alternar para só as minhas.'
                        : 'Mostrando só as minhas tarefas. Alternar para todas.'
                    }
                  />
                </div>
              ) : undefined
            }
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
                description={
                  canViewAllPendingTasks && !showAllPendingTasks
                    ? 'Você não tem tarefas atribuídas no momento.'
                    : 'As tarefas do planejamento aparecerão aqui.'
                }
              />
            ) : (
              tasks.map((task) => {
                const visit = visitById.get(task.visitId)
                return (
                  <ListRowLink
                    key={task.id}
                    to={`/planejamento?visita=${task.visitId}`}
                    title={task.title}
                    meta={[
                      visit?.title,
                      task.assigneeName &&
                      canViewAllPendingTasks &&
                      showAllPendingTasks
                        ? task.assigneeName
                        : null,
                      `Prazo: ${task.dueDate ? formatDate(task.dueDate) : 'Sem prazo'}`,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
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
