import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Filter, Plus } from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { EmptyState } from '@/components/shared/PageHeader'
import { VisitStatusBadge } from '@/components/shared/StatusBadge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
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
import { MapPin } from 'lucide-react'

export function VisitsPage() {
  const { user, isAdmin, role, canWrite } = useAuth()
  const { setOpen } = useVisitDialog()
  const [loading, setLoading] = useState(true)
  const [visits, setVisits] = useState<Visit[]>([])
  const [statusFilter, setStatusFilter] = useState<string>('todos')
  const [stateFilter, setStateFilter] = useState<string>('todos')

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
    return visits.filter((visit) => {
      const statusOk =
        statusFilter === 'todos' || visit.status === (statusFilter as VisitStatus)
      const stateOk = stateFilter === 'todos' || visit.state === stateFilter
      return statusOk && stateOk
    })
  }, [visits, statusFilter, stateFilter])

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Visitas"
        description="Gerenciar visitas corporativas"
        actions={
          canWrite ? (
          <Button onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4" />
            Nova Visita
          </Button>
          ) : undefined
        }
      />

      <Card className="mb-4">
        <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <Filter className="h-4 w-4" />
            Filtros
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full sm:w-48">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              <SelectItem value="planejamento">Planejamento</SelectItem>
              <SelectItem value="em_andamento">Em andamento</SelectItem>
              <SelectItem value="concluida">Concluída</SelectItem>
              <SelectItem value="cancelada">Cancelada</SelectItem>
            </SelectContent>
          </Select>
          <Select value={stateFilter} onValueChange={setStateFilter}>
            <SelectTrigger className="w-full sm:w-40">
              <SelectValue placeholder="Estado" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              {BRAZILIAN_STATES.map((uf) => (
                <SelectItem key={uf} value={uf}>
                  {uf}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="space-y-3 p-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-4">
              <EmptyState
                icon={MapPin}
                title="Nenhuma visita encontrada"
                description="Ajuste os filtros ou crie uma nova visita."
                action={
                  <Button onClick={() => setOpen(true)}>
                    <Plus className="h-4 w-4" />
                    Nova Visita
                  </Button>
                }
              />
            </div>
          ) : (
            <>
            <div className="space-y-3 p-4 md:hidden">
              {filtered.map((visit) => (
                <Link
                  key={visit.id}
                  to={`/visitas/${visit.id}`}
                  className="block rounded-xl border border-border/70 bg-muted/10 p-4 transition-all hover:border-primary/20 hover:bg-muted/40 hover:shadow-sm"
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
                    <span className="text-xs text-muted-foreground">{visit.progress}%</span>
                  </div>
                </Link>
              ))}
            </div>
            <div className="hidden overflow-x-auto md:block">
              <table className="min-w-full text-sm">
                <thead className="border-b border-border/80 bg-muted/30 text-left text-xs tracking-wide text-muted-foreground uppercase">
                  <tr>
                    <th className="px-4 py-3.5 font-medium">Estado</th>
                    <th className="px-4 py-3.5 font-medium">Número da PV</th>
                    <th className="px-4 py-3.5 font-medium">Título da visita</th>
                    <th className="px-4 py-3.5 font-medium">Data início</th>
                    <th className="px-4 py-3.5 font-medium">Data fim</th>
                    <th className="px-4 py-3.5 font-medium">Local</th>
                    <th className="px-4 py-3.5 font-medium">Status</th>
                    <th className="px-4 py-3.5 font-medium">Progresso</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((visit) => (
                    <tr
                      key={visit.id}
                      className="border-b border-border/60 last:border-0 transition-colors hover:bg-muted/25"
                    >
                      <td className="px-4 py-3">{visit.state || '—'}</td>
                      <td className="max-w-[140px] truncate px-4 py-3 font-mono text-xs">
                        {visit.pvNumber || '—'}
                      </td>
                      <td className="px-4 py-3 font-medium">
                        <Link
                          to={`/visitas/${visit.id}`}
                          className="text-primary hover:underline"
                        >
                          {visit.title}
                        </Link>
                      </td>
                      <td className="px-4 py-3">{formatDate(visit.startDate)}</td>
                      <td className="px-4 py-3">{formatDate(visit.endDate)}</td>
                      <td className="px-4 py-3">{visit.city || '—'}</td>
                      <td className="px-4 py-3">
                        <VisitStatusBadge status={visit.status} />
                      </td>
                      <td className="px-4 py-3">
                        <div className="w-28">
                          <Progress value={visit.progress} />
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
