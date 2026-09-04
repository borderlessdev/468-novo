import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import ReactECharts from 'echarts-for-react'
import { toast } from 'sonner'
import {
  ArrowRight,
  FolderOpen,
  Plus,
  Search,
  Users,
  Building2,
  Gauge,
} from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useAuth } from '@/contexts/AuthContext'
import { useOrg } from '@/contexts/OrgContext'
import { canCreateOrganization } from '@/lib/access'
import {
  countOrganizationSeats,
  countPendingInvites,
  createOrganization,
  listOrganizations,
} from '@/services/organizations'
import type { Organization } from '@/types'

type OrgRow = Organization & {
  seats: number
  pending: number
}

const CHART_COLORS = ['#0f2f2a', '#1a6b4a', '#d4a017', '#3d9b87', '#c47a0a', '#5c6b66']

export function OrganizationsPage() {
  const { user, isPlatformAdmin } = useAuth()
  const { setActiveOrgId, refreshOrg } = useOrg()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState<OrgRow[]>([])
  const [query, setQuery] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [name, setName] = useState('')
  const [maxUsers, setMaxUsers] = useState('10')
  const [creating, setCreating] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const orgs = await listOrganizations()
      const enriched = await Promise.all(
        orgs.map(async (org) => {
          const [seats, pending] = await Promise.all([
            countOrganizationSeats(org.id),
            countPendingInvites(org.id),
          ])
          return { ...org, seats, pending }
        }),
      )
      setRows(enriched)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!canCreateOrganization(isPlatformAdmin)) return
    void load()
  }, [isPlatformAdmin, load])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return rows
    return rows.filter((org) => org.name.toLowerCase().includes(q))
  }, [rows, query])

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

  const enterOrganization = (orgId: string) => {
    setActiveOrgId(orgId)
    navigate('/')
  }

  const handleCreate = async () => {
    if (!name.trim()) return
    const parsedMax = Number(maxUsers)
    if (!Number.isFinite(parsedMax) || parsedMax < 1) {
      toast.error('Informe um limite de acessos válido')
      return
    }
    setCreating(true)
    try {
      const id = await createOrganization({
        name: name.trim(),
        maxUsers: parsedMax,
        createdBy: user!.uid,
      })
      toast.success('Pasta do cliente criada')
      setName('')
      setMaxUsers('10')
      setCreateOpen(false)
      await load()
      await refreshOrg()
      navigate(`/empresas/${id}`)
    } catch (error) {
      console.error(error)
      const code =
        error && typeof error === 'object' && 'code' in error
          ? String((error as { code?: string }).code)
          : ''
      toast.error(
        code === 'permission-denied'
          ? 'Sem permissão para criar pasta. Confirme o login master e se as rules foram publicadas.'
          : 'Não foi possível criar a pasta',
      )
    } finally {
      setCreating(false)
    }
  }

  if (!canCreateOrganization(isPlatformAdmin)) {
    return null
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title="Pastas de trabalho"
        description="Cada cliente tem a própria pasta. Entre no sistema de visitas e eventos dele, com limite de acessos por empresa."
        actions={
          <Button
            onClick={() => {
              setName('')
              setMaxUsers('10')
              setCreateOpen(true)
            }}
          >
            <Plus className="h-4 w-4" />
            Nova pasta de cliente
          </Button>
        }
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
          <CardHeader>
            <CardTitle className="text-base">Acessos por cliente</CardTitle>
            <CardDescription>
              Uso atual versus limite contratado (ex.: 10, 20, 3 acessos).
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-72 w-full rounded-xl" />
            ) : rows.length === 0 ? (
              <p className="py-16 text-center text-sm text-muted-foreground">
                Crie a primeira pasta para ver o gráfico.
              </p>
            ) : (
              <ReactECharts option={seatsBarOption} style={{ height: 300 }} opts={{ renderer: 'svg' }} />
            )}
          </CardContent>
        </Card>

        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Distribuição de capacidade</CardTitle>
            <CardDescription>Quanto cada cliente possui do total de acessos.</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-72 w-full rounded-xl" />
            ) : (
              <ReactECharts
                option={distributionOption}
                style={{ height: 300 }}
                opts={{ renderer: 'svg' }}
              />
            )}
          </CardContent>
        </Card>
      </div>

      <section id="pastas" className="scroll-mt-24 space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="font-display text-xl font-semibold tracking-tight">
              Pastas dos clientes
            </h2>
            <p className="text-sm text-muted-foreground">
              Cliente → pasta → sistema de visitas e eventos só daquela empresa.
            </p>
          </div>
          <div className="relative w-full sm:w-72">
            <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Buscar cliente…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
        </div>

        {loading ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 3 }).map((_, index) => (
              <Skeleton key={index} className="h-52 w-full rounded-xl" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <FolderOpen className="h-6 w-6" />
              </div>
              <div>
                <p className="font-medium">Nenhuma pasta encontrada</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {rows.length === 0
                    ? 'Crie a pasta do Cliente 1, Cliente 2… com o limite de acessos de cada um.'
                    : 'Ajuste a busca ou limpe o filtro.'}
                </p>
              </div>
              {rows.length === 0 ? (
                <Button
                  onClick={() => {
                    setName('')
                    setMaxUsers('10')
                    setCreateOpen(true)
                  }}
                >
                  <Plus className="h-4 w-4" />
                  Criar primeira pasta
                </Button>
              ) : null}
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {filtered.map((org) => {
              const clientNumber = rows.findIndex((row) => row.id === org.id) + 1
              const used = org.seats + org.pending
              const pct = org.maxUsers > 0 ? Math.min(100, Math.round((used / org.maxUsers) * 100)) : 0
              const atLimit = used >= org.maxUsers
              return (
                <Card
                  key={org.id}
                  className="group relative overflow-hidden border-border/80 transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md"
                >
                  <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-primary via-brand to-primary/40 opacity-80" />
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 items-start gap-3">
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#0f2f2a]/[0.08] text-primary">
                          <FolderOpen className="h-5 w-5" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                            Cliente {clientNumber}
                          </p>
                          <CardTitle className="truncate text-lg">{org.name}</CardTitle>
                          <div className="mt-1.5 flex flex-wrap gap-1.5">
                            <Badge variant={org.status === 'active' ? 'success' : 'muted'}>
                              {org.status === 'active' ? 'Ativa' : 'Suspensa'}
                            </Badge>
                            {atLimit ? <Badge variant="warning">Limite atingido</Badge> : null}
                          </div>
                        </div>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <div className="mb-1.5 flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">Acessos</span>
                        <span className="font-medium tabular-nums">
                          {used}/{org.maxUsers}
                          {org.pending > 0 ? (
                            <span className="text-muted-foreground"> ({org.pending} pend.)</span>
                          ) : null}
                        </span>
                      </div>
                      <Progress value={pct} className="h-2" />
                    </div>
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <Button asChild variant="outline" className="flex-1">
                        <Link to={`/empresas/${org.id}`}>
                          Abrir pasta
                          <ArrowRight className="h-4 w-4" />
                        </Link>
                      </Button>
                      <Button
                        className="flex-1"
                        disabled={org.status !== 'active'}
                        onClick={() => enterOrganization(org.id)}
                      >
                        Entrar no sistema
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        )}
      </section>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Nova pasta de cliente</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4">
            <p className="text-sm text-muted-foreground">
              Defina o nome do cliente e quantos acessos a empresa poderá usar (ex.: 10, 20 ou 3).
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="org-name">Nome do cliente *</Label>
              <Input
                id="org-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Ex.: Cliente Alpha"
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="org-max-users">Limite de acessos *</Label>
              <Input
                id="org-max-users"
                type="number"
                min={1}
                value={maxUsers}
                onChange={(event) => setMaxUsers(event.target.value)}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
                Cancelar
              </Button>
              <Button
                type="button"
                disabled={creating || !name.trim()}
                onClick={() => void handleCreate()}
              >
                {creating ? 'Criando…' : 'Criar pasta'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
