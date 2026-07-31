import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { toastMovedToTrash } from '@/lib/toast'
import { addDays, format } from 'date-fns'
import { Calendar, MapPin, Plus } from 'lucide-react'
import { PageHeader, EmptyState } from '@/components/shared/PageHeader'
import { WeeklyAgenda, getWeekStart } from '@/components/agenda/WeeklyAgenda'
import { ConfirmDeleteDialog, useConfirmDelete } from '@/components/shared/ConfirmDeleteDialog'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useAuth } from '@/contexts/AuthContext'
import { activitySchema, type ActivityInput } from '@/lib/validations'
import { activitiesOverlap, formatDate } from '@/lib/utils'
import { listVisits } from '@/services/visits'
import {
  createActivity,
  deleteActivity,
  listActivities,
  updateActivity,
} from '@/services/activities'
import type { Activity, Visit } from '@/types'

export function AgendaPage() {
  const { user, isAdmin, role, canWrite } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const [visits, setVisits] = useState<Visit[]>([])
  const [activities, setActivities] = useState<Activity[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingActivities, setLoadingActivities] = useState(false)
  const [dayFilter, setDayFilter] = useState('')
  const [viewMode, setViewMode] = useState<'list' | 'week'>('week')
  const [weekStart, setWeekStart] = useState(() => getWeekStart())
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Activity | null>(null)
  const [saving, setSaving] = useState(false)
  const deleteDialog = useConfirmDelete<{ id: string; name: string }>()

  const visitId = searchParams.get('visita') ?? ''

  const form = useForm<ActivityInput>({
    resolver: zodResolver(activitySchema),
    defaultValues: {
      title: '',
      description: '',
      location: '',
      date: '',
      startTime: '',
      endTime: '',
      responsibleNames: '',
      visitorNames: '',
    },
  })

  useEffect(() => {
    if (!user) return
    void (async () => {
      setLoading(true)
      try {
        setVisits(await listVisits(user.uid, isAdmin, role))
      } finally {
        setLoading(false)
      }
    })()
  }, [user, isAdmin])

  const loadActivities = useCallback(async () => {
    if (!visitId || !user) {
      setActivities([])
      return
    }
    const ownerIdForQuery =
      visits.find((v) => v.id === visitId)?.ownerId ?? user.uid
    setLoadingActivities(true)
    try {
      setActivities(await listActivities(visitId, ownerIdForQuery, isAdmin))
    } catch (error) {
      console.error(error)
      toast.error('Erro ao carregar agenda')
    } finally {
      setLoadingActivities(false)
    }
  }, [visitId, user, isAdmin, visits])

  useEffect(() => {
    void loadActivities()
  }, [loadActivities])

  const filtered = useMemo(() => {
    if (!dayFilter) return activities
    return activities.filter((a) => a.date === dayFilter)
  }, [activities, dayFilter])

  const selectedVisit = visits.find((v) => v.id === visitId)

  const openCreate = () => {
    setEditing(null)
    form.reset({
      title: '',
      description: '',
      location: '',
      date: '',
      startTime: '',
      endTime: '',
      responsibleNames: '',
      visitorNames: '',
    })
    setOpen(true)
  }

  const openEdit = (activity: Activity) => {
    setEditing(activity)
    form.reset({
      title: activity.title,
      description: activity.description ?? '',
      location: activity.location ?? '',
      date: activity.date,
      startTime: activity.startTime.slice(11, 16) || activity.startTime,
      endTime: activity.endTime.slice(11, 16) || activity.endTime,
      responsibleNames: activity.responsibleNames.join(', '),
      visitorNames: activity.visitorNames.join(', '),
    })
    setOpen(true)
  }

  const checkConflict = (candidate: ActivityInput, excludeId?: string) => {
    const startTime = `${candidate.date}T${candidate.startTime}:00`
    const endTime = `${candidate.date}T${candidate.endTime}:00`
    const conflict = activities.find(
      (a) =>
        a.id !== excludeId &&
        activitiesOverlap(
          { date: candidate.date, startTime, endTime },
          { date: a.date, startTime: a.startTime, endTime: a.endTime },
        ),
    )
    if (conflict) {
      toast.warning(`Conflito de horário com "${conflict.title}"`)
      return true
    }
    return false
  }

  const onSubmit = form.handleSubmit(async (values) => {
    if (!user || !visitId) return
    if (values.endTime <= values.startTime) {
      toast.error('Horário fim deve ser após o início')
      return
    }
    if (checkConflict(values, editing?.id)) return

    setSaving(true)
    const payload = {
      title: values.title,
      description: values.description,
      location: values.location,
      date: values.date,
      startTime: `${values.date}T${values.startTime}:00`,
      endTime: `${values.date}T${values.endTime}:00`,
      responsibleNames: values.responsibleNames
        ? values.responsibleNames.split(',').map((s) => s.trim()).filter(Boolean)
        : [],
      visitorNames: values.visitorNames
        ? values.visitorNames.split(',').map((s) => s.trim()).filter(Boolean)
        : [],
    }
    try {
      if (editing) {
        await updateActivity(editing.id, payload)
        toast.success('Atividade atualizada')
      } else {
        await createActivity(user.uid, { visitId, ...payload })
        toast.success('Atividade criada')
      }
      setOpen(false)
      setEditing(null)
      form.reset()
      await loadActivities()
    } catch (error) {
      console.error(error)
      toast.error('Não foi possível salvar a atividade')
    } finally {
      setSaving(false)
    }
  })

  const handleMoveActivity = async (
    activity: Activity,
    next: { date: string; startTime: string; endTime: string },
  ) => {
    const conflict = activities.find(
      (a) =>
        a.id !== activity.id &&
        activitiesOverlap(
          { date: next.date, startTime: next.startTime, endTime: next.endTime },
          { date: a.date, startTime: a.startTime, endTime: a.endTime },
        ),
    )
    if (conflict) {
      toast.warning(`Conflito de horário com "${conflict.title}"`)
      return
    }
    try {
      await updateActivity(activity.id, next)
      toast.success('Atividade movida')
      await loadActivities()
    } catch (error) {
      console.error(error)
      toast.error('Não foi possível mover a atividade')
    }
  }

  return (
    <div>
      <PageHeader
        title="Agenda"
        description="Visualize a programação detalhada de uma visita específica."
      />

      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <Label className="text-xs">Visita para visualizar a agenda</Label>
          <Select
            value={visitId || '_unset'}
            onValueChange={(value) => {
              if (value === '_unset') {
                setSearchParams({})
                return
              }
              setSearchParams({ visita: value })
            }}
          >
            <SelectTrigger className="w-full sm:w-72">
              <SelectValue placeholder="Selecione uma visita" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="_unset">Selecione uma visita</SelectItem>
              {visits.map((visit) => (
                <SelectItem key={visit.id} value={visit.id}>
                  {visit.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex rounded-lg border p-1">
            <Button
              type="button"
              size="sm"
              variant={viewMode === 'week' ? 'default' : 'ghost'}
              onClick={() => setViewMode('week')}
            >
              Semana
            </Button>
            <Button
              type="button"
              size="sm"
              variant={viewMode === 'list' ? 'default' : 'ghost'}
              onClick={() => setViewMode('list')}
            >
              Lista
            </Button>
          </div>
          {viewMode === 'week' ? (
            <div className="flex gap-1">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setWeekStart((d) => addDays(d, -7))}
              >
                ←
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setWeekStart(getWeekStart())}
              >
                Hoje
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setWeekStart((d) => addDays(d, 7))}
              >
                →
              </Button>
            </div>
          ) : (
            <div className="space-y-1">
              <Label className="text-xs">Filtrar por dia (opcional)</Label>
              <Input
                type="date"
                value={dayFilter}
                onChange={(e) => setDayFilter(e.target.value)}
                className="w-full sm:w-44"
              />
            </div>
          )}
          <Button disabled={!visitId || !canWrite} onClick={openCreate}>
            <Plus className="h-4 w-4" />
            Nova atividade
          </Button>
        </div>
      </div>

      {loading ? (
        <Skeleton className="h-64 w-full" />
      ) : !visitId ? (
        <EmptyState
          icon={Calendar}
          title="Selecione uma visita"
          description="Selecione uma visita para visualizar a agenda de atividades."
        />
      ) : loadingActivities ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-28 w-full" />
          ))}
        </div>
      ) : viewMode === 'week' ? (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Semana de {format(weekStart, 'dd/MM/yyyy')}
            {selectedVisit ? ` · ${selectedVisit.title}` : ''}
          </p>
          {activities.length === 0 ? (
            <EmptyState
              icon={Calendar}
              title="Nenhuma atividade nesta visita"
              description="Crie a primeira atividade ou mude para a visualização em lista."
              action={
                canWrite ? (
                  <Button onClick={openCreate}>
                    <Plus className="h-4 w-4" />
                    Nova atividade
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <WeeklyAgenda
              weekStart={weekStart}
              activities={activities}
              canWrite={canWrite}
              onActivityClick={openEdit}
              onMoveActivity={(activity, next) => void handleMoveActivity(activity, next)}
            />
          )}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Calendar}
          title="Nenhuma atividade"
          description="Crie a primeira atividade para esta visita."
          action={
            canWrite ? (
            <Button onClick={openCreate}>
              <Plus className="h-4 w-4" />
              Nova atividade
            </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {filtered.length} atividade(s)
            {selectedVisit ? ` · ${selectedVisit.title}` : ''}
          </p>
          {filtered.map((activity) => {
            const start = activity.startTime.slice(11, 16) || activity.startTime
            const end = activity.endTime.slice(11, 16) || activity.endTime
            return (
              <Card key={activity.id} className="relative overflow-hidden">
                <div className="absolute bottom-4 left-4 top-4 w-1.5 rounded-full bg-primary/30" />
                <CardContent className="flex flex-col gap-2 p-5 pl-8 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-muted-foreground">
                      {start} - {end}
                    </p>
                    <h3 className="mt-1 text-base font-semibold">{activity.title}</h3>
                    {activity.description ? (
                      <p className="mt-1 text-sm text-muted-foreground">
                        {activity.description}
                      </p>
                    ) : null}
                    <div className="mt-3 flex flex-wrap gap-2">
                      {activity.responsibleNames.map((name) => (
                        <span
                          key={name}
                          className="rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground"
                        >
                          Responsáveis: {name}
                        </span>
                      ))}
                      {activity.visitorNames.map((name) => (
                        <span
                          key={name}
                          className="rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground"
                        >
                          Visitantes envolvidos: {name}
                        </span>
                      ))}
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">
                      {formatDate(activity.date)}
                    </p>
                  </div>
                  <div className="flex items-start gap-3">
                    {activity.location ? (
                      <div className="flex items-center gap-1 text-sm text-muted-foreground">
                        <MapPin className="h-4 w-4" />
                        {activity.location}
                      </div>
                    ) : null}
                    {canWrite ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => openEdit(activity)}
                    >
                      Editar
                    </Button>
                    ) : null}
                    {canWrite ? (
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() =>
                        deleteDialog.requestDelete({ id: activity.id, name: activity.title })
                      }
                    >
                      Excluir
                    </Button>
                    ) : null}
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      <Dialog
        open={open}
        onOpenChange={(value) => {
          setOpen(value)
          if (!value) setEditing(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? 'Editar atividade' : 'Nova atividade'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={onSubmit} className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label>Título *</Label>
              <Input {...form.register('title')} />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>Descrição</Label>
              <Input {...form.register('description')} />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>Local</Label>
              <Input {...form.register('location')} />
            </div>
            <div className="space-y-2">
              <Label>Data *</Label>
              <Input type="date" {...form.register('date')} />
            </div>
            <div className="space-y-2">
              <Label>Início *</Label>
              <Input type="time" {...form.register('startTime')} />
            </div>
            <div className="space-y-2">
              <Label>Fim *</Label>
              <Input type="time" {...form.register('endTime')} />
            </div>
            <div className="space-y-2">
              <Label>Responsáveis (vírgula)</Label>
              <Input {...form.register('responsibleNames')} />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>Visitantes (vírgula)</Label>
              <Input {...form.register('visitorNames')} />
            </div>
            <div className="flex justify-end gap-2 sm:col-span-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? 'Salvando...' : 'Salvar'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDeleteDialog
        open={deleteDialog.open}
        onOpenChange={deleteDialog.handleOpenChange}
        itemName={deleteDialog.target?.name}
        loading={deleteDialog.loading}
        onConfirm={() => {
          void deleteDialog.confirm(async (item) => {
            if (!user) return
            await deleteActivity(item.id, user.uid)
            toastMovedToTrash('Atividade movida para a lixeira')
            await loadActivities()
          })
        }}
      />
    </div>
  )
}
