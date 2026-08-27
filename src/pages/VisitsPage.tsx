import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { CalendarDays, Columns3, Filter, LayoutGrid, List, MapPin, Plus } from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { EmptyState } from '@/components/shared/PageHeader'
import { VisitStatusBadge } from '@/components/shared/StatusBadge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useAuth } from '@/contexts/AuthContext'
import { useVisitDialog } from '@/contexts/VisitDialogContext'
import { BRAZILIAN_STATES } from '@/lib/constants'
import { formatDate } from '@/lib/utils'
import { listVisits } from '@/services/visits'
import type { Visit, VisitStatus } from '@/types'

type ViewMode = 'table' | 'cards' | 'status'

const STATUS_COLUMNS: Array<{ value: VisitStatus; label: string }> = [
  { value: 'planejamento', label: 'Planejamento' },
  { value: 'em_andamento', label: 'Em andamento' },
  { value: 'concluida', label: 'Concluídas' },
  { value: 'cancelada', label: 'Canceladas' },
]

function dateValue(value: string, endOfDay = false) {
  if (!value) return null
  const time = new Date(`${value}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}`).getTime()
  return Number.isNaN(time) ? null : time
}

export function VisitsPage() {
  const { user, isAdmin, role, canWrite } = useAuth()
  const { setOpen } = useVisitDialog()
  const [loading, setLoading] = useState(true)
  const [visits, setVisits] = useState<Visit[]>([])
  const [statusFilter, setStatusFilter] = useState<string>('todos')
  const [stateFilter, setStateFilter] = useState<string>('todos')
  const [startDateFilter, setStartDateFilter] = useState('')
  const [endDateFilter, setEndDateFilter] = useState('')
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    const saved = localStorage.getItem('visits-view-mode')
    return saved === 'table' || saved === 'cards' || saved === 'status' ? saved : 'table'
  })

  const changeViewMode = (mode: ViewMode) => {
    setViewMode(mode)
    localStorage.setItem('visits-view-mode', mode)
  }

  const load = useCallback(async () => {
    if (!user) return
    setLoading(true)
    try {
      setVisits(await listVisits(user.uid, isAdmin, role))
    } catch (error) {
      console.error(error)
    } finally {
      setLoading(false)
    }
  }, [user, isAdmin, role])

  useEffect(() => {
    void load()
  }, [load])

  const filtered = useMemo(() => {
    const periodStart = dateValue(startDateFilter)
    const periodEnd = dateValue(endDateFilter, true)

    return visits.filter((visit) => {
      const statusOk =
        statusFilter === 'todos' || visit.status === (statusFilter as VisitStatus)
      const stateOk = stateFilter === 'todos' || visit.state === stateFilter
      const visitStart = dateValue(visit.startDate)
      const visitEnd = dateValue(visit.endDate, true)
      const startsWithinPeriod =
        periodStart === null || (visitStart !== null && visitStart >= periodStart)
      const endsWithinPeriod =
        periodEnd === null || (visitEnd !== null && visitEnd <= periodEnd)

      return statusOk && stateOk && startsWithinPeriod && endsWithinPeriod
    })
  }, [visits, statusFilter, stateFilter, startDateFilter, endDateFilter])

  return (
    <div className="animate-fade-in space-y-5">
      <PageHeader
        title="Visitas"
        description={`${filtered.length} de ${visits.length} visita${visits.length === 1 ? '' : 's'}`}
        actions={
          canWrite ? (
          <Button onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4" />
            Nova Visita
          </Button>
          ) : undefined
        }
      />

      <Card>
        <CardContent className="flex flex-col gap-4 p-4 lg:flex-row lg:items-end lg:gap-3">
          <div className="flex h-9 shrink-0 items-center gap-2 text-sm font-medium text-muted-foreground">
            <Filter className="h-4 w-4" />
            Filtros
          </div>
          <div className="grid flex-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os status</SelectItem>
                <SelectItem value="planejamento">Planejamento</SelectItem>
                <SelectItem value="em_andamento">Em andamento</SelectItem>
                <SelectItem value="concluida">Concluída</SelectItem>
                <SelectItem value="cancelada">Cancelada</SelectItem>
              </SelectContent>
            </Select>
            <Select value={stateFilter} onValueChange={setStateFilter}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Estado" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os estados</SelectItem>
                {BRAZILIAN_STATES.map((uf) => (
                  <SelectItem key={uf} value={uf}>
                    {uf}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="space-y-1.5">
              <Label htmlFor="visits-start-date" className="text-xs text-muted-foreground">
                Data de início
              </Label>
              <Input
                id="visits-start-date"
                type="date"
                value={startDateFilter}
                max={endDateFilter || undefined}
                onChange={(event) => setStartDateFilter(event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="visits-end-date" className="text-xs text-muted-foreground">
                Data final
              </Label>
              <Input
                id="visits-end-date"
                type="date"
                value={endDateFilter}
                min={startDateFilter || undefined}
                onChange={(event) => setEndDateFilter(event.target.value)}
              />
            </div>
          </div>
          <div className="flex items-center gap-1 rounded-lg border border-border/70 bg-muted/25 p-1 lg:ml-auto" aria-label="Modo de visualização">
            {([
              { value: 'table', label: 'Tabela', icon: List },
              { value: 'cards', label: 'Cards', icon: LayoutGrid },
              { value: 'status', label: 'Por status', icon: Columns3 },
            ] as const).map(({ value, label, icon: Icon }) => (
              <Button
                key={value}
                type="button"
                variant={viewMode === value ? 'secondary' : 'ghost'}
                size="sm"
                className="flex-1 gap-2 lg:flex-none"
                onClick={() => changeViewMode(value)}
                aria-pressed={viewMode === value}
              >
                <Icon className="h-4 w-4" />
                <span className="hidden sm:inline">{label}</span>
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card className={viewMode === 'status' ? 'border-0 bg-transparent shadow-none' : 'overflow-hidden'}>
        <CardContent className="p-0">
          {loading ? (
            <div className="space-y-3 p-5">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full rounded-lg" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-5">
              <EmptyState
                icon={MapPin}
                title="Nenhuma visita encontrada"
                description="Ajuste os filtros ou crie uma nova visita."
                action={canWrite ? (
                  <Button onClick={() => setOpen(true)}>
                    <Plus className="h-4 w-4" />
                    Nova Visita
                  </Button>
                ) : undefined}
              />
            </div>
          ) : viewMode === 'cards' ? (
            <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-3">
              {filtered.map((visit) => (
                <Link
                  key={visit.id}
                  to={`/visitas/${visit.id}`}
                  className="group flex min-h-52 flex-col rounded-xl border border-border/70 bg-card p-5 transition-all hover:-translate-y-0.5 hover:border-border hover:shadow-[0_4px_14px_rgba(15,47,42,0.06)]"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="line-clamp-2 font-semibold transition-opacity group-hover:opacity-90">{visit.title}</p>
                      {visit.pvNumber ? <p className="mt-1 font-mono text-xs text-muted-foreground">PV {visit.pvNumber}</p> : null}
                    </div>
                    <VisitStatusBadge status={visit.status} />
                  </div>
                  <div className="mt-5 space-y-2 text-sm text-muted-foreground">
                    <div className="flex items-center gap-2"><CalendarDays className="h-4 w-4 shrink-0 opacity-70" />{formatDate(visit.startDate)} — {formatDate(visit.endDate)}</div>
                    <div className="flex items-center gap-2"><MapPin className="h-4 w-4 shrink-0 opacity-70" />{[visit.city, visit.state].filter(Boolean).join(' · ') || 'Local não informado'}</div>
                  </div>
                  <div className="mt-auto pt-5">
                    <div className="mb-2 flex justify-between text-xs text-muted-foreground"><span>Progresso</span><span className="tabular-nums">{visit.progress}%</span></div>
                    <Progress value={visit.progress} />
                  </div>
                </Link>
              ))}
            </div>
          ) : viewMode === 'status' ? (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {STATUS_COLUMNS.map((column) => {
                const columnVisits = filtered.filter((visit) => visit.status === column.value)
                return (
                  <section key={column.value} className="rounded-xl border border-border/70 bg-muted/15 p-3">
                    <header className="mb-3 flex items-center justify-between px-1">
                      <h2 className="text-sm font-semibold">{column.label}</h2>
                      <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-muted px-1.5 text-[11px] font-medium tabular-nums text-muted-foreground">{columnVisits.length}</span>
                    </header>
                    <div className="space-y-2.5">
                      {columnVisits.length === 0 ? (
                        <div className="rounded-lg border border-dashed border-border/70 p-5 text-center text-xs text-muted-foreground">Nenhuma visita</div>
                      ) : columnVisits.map((visit) => (
                        <Link key={visit.id} to={`/visitas/${visit.id}`} className="block rounded-lg border border-border/70 bg-card p-3 transition-all hover:border-border hover:shadow-[0_2px_8px_rgba(15,47,42,0.05)]">
                          <p className="line-clamp-2 text-sm font-medium">{visit.title}</p>
                          {visit.pvNumber ? <p className="mt-1 font-mono text-[11px] text-muted-foreground">PV {visit.pvNumber}</p> : null}
                          <div className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground"><CalendarDays className="h-3.5 w-3.5 opacity-70" />{formatDate(visit.startDate)}</div>
                          <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground"><MapPin className="h-3.5 w-3.5 opacity-70" />{[visit.city, visit.state].filter(Boolean).join(' · ') || '—'}</div>
                          <div className="mt-3 flex items-center gap-2"><Progress value={visit.progress} className="flex-1" /><span className="text-[11px] tabular-nums text-muted-foreground">{visit.progress}%</span></div>
                        </Link>
                      ))}
                    </div>
                  </section>
                )
              })}
            </div>
          ) : (
            <>
            <div className="space-y-2.5 p-4 md:hidden">
              {filtered.map((visit) => (
                <Link
                  key={visit.id}
                  to={`/visitas/${visit.id}`}
                  className="block rounded-xl border border-border/70 bg-muted/10 p-4 transition-all hover:bg-muted/35 hover:shadow-[0_1px_2px_rgba(15,47,42,0.04)]"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">{visit.title}</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {formatDate(visit.startDate)} — {formatDate(visit.endDate)}
                      </p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {[visit.state, visit.city].filter(Boolean).join(' · ') || '—'}
                      </p>
                      {visit.pvNumber ? (
                        <p className="mt-1 font-mono text-xs text-muted-foreground">
                          PV: {visit.pvNumber}
                        </p>
                      ) : null}
                    </div>
                    <VisitStatusBadge status={visit.status} />
                  </div>
                  <div className="mt-3 flex items-center gap-2">
                    <Progress value={visit.progress} className="flex-1" />
                    <span className="text-xs tabular-nums text-muted-foreground">{visit.progress}%</span>
                  </div>
                </Link>
              ))}
            </div>
            <div className="hidden overflow-x-auto md:block">
              <table className="min-w-full text-sm">
                <thead className="border-b border-border/70 bg-muted/25 text-left text-xs tracking-wide text-muted-foreground uppercase">
                  <tr>
                    <th className="px-4 py-3 font-medium">Estado</th>
                    <th className="px-4 py-3 font-medium">Número da PV</th>
                    <th className="px-4 py-3 font-medium">Título da visita</th>
                    <th className="px-4 py-3 font-medium">Data início</th>
                    <th className="px-4 py-3 font-medium">Data fim</th>
                    <th className="px-4 py-3 font-medium">Local</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">Progresso</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((visit) => (
                    <tr
                      key={visit.id}
                      className="border-b border-border/50 last:border-0 transition-colors hover:bg-muted/20"
                    >
                      <td className="px-4 py-3.5 text-muted-foreground">{visit.state || '—'}</td>
                      <td className="max-w-[140px] truncate px-4 py-3.5 font-mono text-xs text-muted-foreground">
                        {visit.pvNumber || '—'}
                      </td>
                      <td className="px-4 py-3.5 font-medium">
                        <Link
                          to={`/visitas/${visit.id}`}
                          className="underline-offset-4 hover:underline"
                        >
                          {visit.title}
                        </Link>
                      </td>
                      <td className="px-4 py-3.5 tabular-nums">{formatDate(visit.startDate)}</td>
                      <td className="px-4 py-3.5 tabular-nums">{formatDate(visit.endDate)}</td>
                      <td className="px-4 py-3.5 text-muted-foreground">{visit.city || '—'}</td>
                      <td className="px-4 py-3.5">
                        <VisitStatusBadge status={visit.status} />
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="flex w-28 items-center gap-2">
                          <Progress value={visit.progress} className="flex-1" />
                          <span className="text-[11px] tabular-nums text-muted-foreground">{visit.progress}%</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
