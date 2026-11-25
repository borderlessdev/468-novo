import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import ReactECharts from 'echarts-for-react'
import { toast } from 'sonner'
import {
  BarChart3,
  Building2,
  FolderOpen,
  Gauge,
  PieChart,
  Users,
} from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useAuth } from '@/contexts/AuthContext'
import { canCreateOrganization } from '@/lib/access'
import {
  getOrganizationSeatUsage,
  listOrganizations,
} from '@/services/organizations'
import type { Organization } from '@/types'

type OrgRow = Organization & {
  seats: number
  pending: number
}

const CHART_COLORS = ['#0f2f2a', '#1a6b4a', '#d4a017', '#3d9b87', '#c47a0a', '#5c6b66']

export function OrganizationsPage() {
  const { isPlatformAdmin } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState<OrgRow[]>([])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const orgs = await listOrganizations()
      const enriched = await Promise.all(
        orgs.map(async (org) => {
          const { seats, pending } = await getOrganizationSeatUsage(org.id)
          return { ...org, seats, pending }
        }),
      )
      setRows(enriched)
    } catch (error) {
      console.error(error)
      toast.error('Não foi possível carregar os dados das pastas')
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!canCreateOrganization(isPlatformAdmin)) return
    void load()
  }, [isPlatformAdmin, load])

  useEffect(() => {
    if (location.hash === '#pastas') {
      navigate('/empresas/pastas', { replace: true })
    }
  }, [location.hash, navigate])

  const metrics = useMemo(() => {
    const clients = rows.length
    const seatsUsed = rows.reduce((sum, row) => sum + row.seats + row.pending, 0)
    const seatsCap = rows.reduce((sum, row) => sum + row.maxUsers, 0)
    const full = rows.filter((row) => row.seats + row.pending >= row.maxUsers).length
    return { clients, seatsUsed, seatsCap, full }
  }, [rows])

  const seatsBarOption = useMemo(() => {
    const data = [...rows].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
    return {
      color: CHART_COLORS,
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        formatter: (params: { seriesName: string; value: number; name: string }[]) => {
          const used = params.find((p) => p.seriesName === 'Em uso')?.value ?? 0
          const free = params.find((p) => p.seriesName === 'Disponíveis')?.value ?? 0
          return `<strong>${params[0]?.name ?? ''}</strong><br/>Em uso: ${used}<br/>Disponíveis: ${free}`
        },
      },
      legend: { data: ['Em uso', 'Disponíveis'], bottom: 0 },
      grid: { left: 12, right: 12, top: 24, bottom: 40, containLabel: true },
      xAxis: {
        type: 'category',
        data: data.map((row) => row.name),
        axisLabel: { interval: 0, rotate: data.length > 4 ? 28 : 0, fontSize: 11 },
      },
      yAxis: { type: 'value', minInterval: 1, name: 'Acessos' },
      series: [
        {
          name: 'Em uso',
          type: 'bar',
          stack: 'seats',
          barMaxWidth: 42,
          data: data.map((row) => row.seats + row.pending),
          itemStyle: { borderRadius: [0, 0, 0, 0] },
        },
        {
          name: 'Disponíveis',
          type: 'bar',
          stack: 'seats',
          barMaxWidth: 42,
          data: data.map((row) => Math.max(0, row.maxUsers - row.seats - row.pending)),
          itemStyle: { borderRadius: [6, 6, 0, 0], opacity: 0.45 },
        },
      ],
    }
  }, [rows])

  const distributionOption = useMemo(() => {
    const data = rows
      .map((row) => ({
        name: row.name,
        value: row.maxUsers,
      }))
      .filter((item) => item.value > 0)
    return {
      color: CHART_COLORS,
      tooltip: { trigger: 'item', formatter: '{b}: {c} acessos ({d}%)' },
      legend: { type: 'scroll', bottom: 0, left: 'center' },
      series: [
        {
          type: 'pie',
          radius: ['42%', '68%'],
          center: ['50%', '45%'],
          avoidLabelOverlap: true,
          itemStyle: { borderRadius: 6, borderColor: '#fff', borderWidth: 2 },
          label: { show: false },
          data: data.length
            ? data
            : [{ name: 'Sem clientes', value: 1, itemStyle: { color: '#d8e0dc' } }],
        },
      ],
    }
  }, [rows])

  if (!canCreateOrganization(isPlatformAdmin)) {
    return null
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title="Visão geral"
        description="Resumo das pastas de clientes, acessos e capacidade contratada."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          {
            label: 'Clientes',
            value: String(metrics.clients),
            hint: 'Pastas ativas no console',
            icon: Building2,
          },
          {
            label: 'Acessos em uso',
            value: String(metrics.seatsUsed),
            hint: 'Membros + convites pendentes',
            icon: Users,
          },
          {
            label: 'Capacidade total',
            value: String(metrics.seatsCap),
            hint: 'Soma dos limites contratados',
            icon: Gauge,
          },
          {
            label: 'Pastas no limite',
            value: String(metrics.full),
            hint: 'Sem vagas para novos acessos',
            icon: FolderOpen,
          },
        ].map((metric) => {
          const Icon = metric.icon
          return (
            <Card key={metric.label} className="overflow-hidden">
              <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {metric.label}
                </CardTitle>
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Icon className="h-4 w-4" />
                </div>
              </CardHeader>
              <CardContent>
                <p className="font-display text-3xl font-semibold tabular-nums tracking-tight">
                  {metric.value}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">{metric.hint}</p>
              </CardContent>
            </Card>
          )
        })}
      </div>

      <div className="grid gap-4 xl:grid-cols-5">
        <Card className="xl:col-span-3">
          <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
            <div className="space-y-1.5">
              <CardTitle className="text-base">Acessos por cliente</CardTitle>
              <CardDescription>
                Uso atual versus limite contratado (ex.: 10, 20, 3 acessos).
              </CardDescription>
            </div>
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <BarChart3 className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-72 w-full rounded-xl" />
            ) : rows.length === 0 ? (
              <p className="py-16 text-center text-sm text-muted-foreground">
                Crie a primeira pasta para ver o gráfico.
              </p>
            ) : (
              <ReactECharts
                key={`seats-${rows.map((row) => `${row.id}:${row.seats}:${row.pending}:${row.maxUsers}`).join('|')}`}
                option={seatsBarOption}
                style={{ height: 300 }}
                opts={{ renderer: 'svg' }}
                notMerge
              />
            )}
          </CardContent>
        </Card>

        <Card className="xl:col-span-2">
          <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
            <div className="space-y-1.5">
              <CardTitle className="text-base">Distribuição de capacidade</CardTitle>
              <CardDescription>Quanto cada cliente possui do total de acessos.</CardDescription>
            </div>
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <PieChart className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-72 w-full rounded-xl" />
            ) : rows.length === 0 ? (
              <p className="py-16 text-center text-sm text-muted-foreground">
                Crie a primeira pasta para ver o gráfico.
              </p>
            ) : (
              <ReactECharts
                key={`dist-${rows.map((row) => `${row.id}:${row.maxUsers}`).join('|')}`}
                option={distributionOption}
                style={{ height: 300 }}
                opts={{ renderer: 'svg' }}
                notMerge
              />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
