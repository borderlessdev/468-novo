import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { toastMovedToTrash } from '@/lib/toast'
import { addDays, format, parseISO } from 'date-fns'
import { Calendar, MapPin, Plus, Search, Upload } from 'lucide-react'
import * as XLSX from 'xlsx'
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
import { parseProgrammingWorkbook, type ImportedActivity } from '@/lib/programmingImport'
import { listVisits } from '@/services/visits'
import {
  createActivity,
  createActivities,
  deleteActivity,
  listActivities,
  updateActivity,
} from '@/services/activities'
import {
  deleteGoogleEvent,
  getCalendarStatus,
  syncActivityToGoogle,
  syncVisitToGoogle,
} from '@/services/calendar'
import type { Activity, Visit } from '@/types'

export function AgendaPage() {
  const { user, isAdmin, role, canWrite } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const [visits, setVisits] = useState<Visit[]>([])
  const [activities, setActivities] = useState<Activity[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingActivities, setLoadingActivities] = useState(false)
  const [dayFilter, setDayFilter] = useState('')
  const [eventSearch, setEventSearch] = useState('')
  const [viewMode, setViewMode] = useState<'list' | 'week'>('week')
  const [weekStart, setWeekStart] = useState(() => getWeekStart())
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Activity | null>(null)
  const [saving, setSaving] = useState(false)
  const [importing, setImporting] = useState(false)
  const [savingImport, setSavingImport] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [importFileName, setImportFileName] = useState('')
  const [importPreview, setImportPreview] = useState<ImportedActivity[]>([])
  const importInputRef = useRef<HTMLInputElement>(null)
  const deleteDialog = useConfirmDelete<{ id: string; name: string }>()
  const [googleConnected, setGoogleConnected] = useState(false)
  const [syncingVisit, setSyncingVisit] = useState(false)

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
  }, [user, isAdmin, role])

  useEffect(() => {
    if (!user || !canWrite) {
      setGoogleConnected(false)
      return
    }
    void getCalendarStatus().then((status) => setGoogleConnected(status.connected))
  }, [user, canWrite])

  /**
   * Sync com o Google é sempre fire-and-forget: uma falha lá não desfaz o que já
   * foi salvo no Firestore.
   */
  const syncToGoogle = useCallback(
    (activityId: string) => {
      if (!canWrite || !googleConnected) return
      void syncActivityToGoogle(activityId).then((result) => {
        if (result.needsReauth) {
          setGoogleConnected(false)
          return
        }
        if (!result.ok) {
          toast.error(result.error ?? 'Não foi possível sincronizar com o Google Calendar')
          return
        }
        if (result.conflict) {
          toast.warning('Conflito no Google Calendar: já existe compromisso neste horário')
        }
      })
    },
    [canWrite, googleConnected],
  )

  const removeFromGoogle = useCallback(
    (activityId: string) => {
      if (!canWrite || !googleConnected) return
      void deleteGoogleEvent(activityId).then((result) => {
        if (result.needsReauth) {
          setGoogleConnected(false)
          return
        }
        if (!result.ok) {
          toast.error(result.error ?? 'Não foi possível remover o evento do Google Calendar')
        }
      })
    },
    [canWrite, googleConnected],
  )

  const handleSyncVisitToGoogle = async () => {
    if (!visitId) return
    setSyncingVisit(true)
    try {
      const result = await syncVisitToGoogle(visitId)
      if (result.needsReauth) {
        setGoogleConnected(false)
        return
      }
      if (!result.ok) {
        toast.error(result.error ?? 'Não foi possível enviar a programação ao Google')
        return
      }
      toast.success(`${result.synced} de ${result.total} atividade(s) enviada(s) ao Google`)
      if (result.conflicts > 0) {
        toast.warning(`${result.conflicts} atividade(s) com conflito no Google Calendar`)
      }
      if (result.failed > 0) {
        toast.error(`${result.failed} atividade(s) não puderam ser enviadas`)
      }
    } finally {
      setSyncingVisit(false)
    }
  }

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

  const searchedActivities = useMemo(() => {
    const normalizeSearch = (value: string) =>
      value
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLocaleLowerCase('pt-BR')
    const search = normalizeSearch(eventSearch.trim())
    if (!search) return activities
    return activities.filter((activity) =>
      normalizeSearch(activity.title).includes(search),
    )
  }, [activities, eventSearch])

  useEffect(() => {
    if (!eventSearch.trim() || searchedActivities.length === 0) return
    setWeekStart(getWeekStart(parseISO(searchedActivities[0].date)))
  }, [eventSearch, searchedActivities])

  const filtered = useMemo(() => {
    if (!dayFilter) return searchedActivities
    return searchedActivities.filter((activity) => activity.date === dayFilter)
  }, [searchedActivities, dayFilter])

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
        syncToGoogle(editing.id)
      } else {
        const createdId = await createActivity(user.uid, { visitId, ...payload })
        toast.success('Atividade criada')
        syncToGoogle(createdId)
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
      syncToGoogle(activity.id)
      await loadActivities()
    } catch (error) {
      console.error(error)
      toast.error('Não foi possível mover a atividade')
    }
  }

  const handleImport = async (file: File) => {
    if (!user || !visitId) return
    setImporting(true)
    try {
      const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true })
      const fallbackYear = Number(selectedVisit?.startDate.slice(0, 4)) || new Date().getFullYear()
      const parsed = parseProgrammingWorkbook(workbook, fallbackYear)

      setImportPreview(parsed)
      setImportFileName(file.name)
      setImportOpen(true)
      toast.success(`${parsed.length} atividade(s) extraída(s) para conferência`)
    } catch (error) {
      console.error(error)
      toast.error(error instanceof Error ? error.message : 'Não foi possível importar o arquivo')
    } finally {
      setImporting(false)
      if (importInputRef.current) importInputRef.current.value = ''
    }
  }

  const saveImportedActivities = async () => {
    if (!user || !visitId || importPreview.length === 0) return
    setSavingImport(true)
    try {
      await createActivities(
        user.uid,
        importPreview.map((activity) => ({ visitId, ...activity })),
      )
      toast.success(`${importPreview.length} atividade(s) salva(s)`)
      setImportOpen(false)
      setImportPreview([])
      setImportFileName('')
      await loadActivities()
      // A criação em lote não devolve os ids: reenviamos a programação inteira da visita.
      if (googleConnected) await handleSyncVisitToGoogle()
    } catch (error) {
      console.error(error)
      toast.error('Não foi possível salvar as atividades')
    } finally {
      setSavingImport(false)
    }
  }

  return (
    <div>
      <PageHeader
        title="Programação"
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
                aria-label="Voltar um dia"
                onClick={() => setWeekStart((d) => addDays(d, -1))}
              >
                ← Dia
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
                aria-label="Avançar um dia"
                onClick={() => setWeekStart((d) => addDays(d, 1))}
              >
                Dia →
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
          <input
            ref={importInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (file) void handleImport(file)
            }}
          />
          <Button
            type="button"
            variant="outline"
            disabled={!visitId || !canWrite || importing}
            onClick={() => importInputRef.current?.click()}
          >
            <Upload className="h-4 w-4" />
            {importing ? 'Importando...' : 'Importar arquivo'}
          </Button>
          {visitId && canWrite && googleConnected ? (
            <Button
              type="button"
              variant="outline"
              disabled={syncingVisit}
              onClick={() => void handleSyncVisitToGoogle()}
            >
              <Calendar className="h-4 w-4" />
              {syncingVisit ? 'Enviando...' : 'Enviar programação desta visita ao Google'}
            </Button>
          ) : null}
          <Button disabled={!visitId || !canWrite || importing} onClick={openCreate}>
            <Plus className="h-4 w-4" />
            Nova atividade
          </Button>
        </div>
      </div>

      {visitId ? (
        <div className="relative mb-4 max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={eventSearch}
            onChange={(event) => setEventSearch(event.target.value)}
            placeholder="Pesquisar evento pelo título..."
            aria-label="Pesquisar evento pelo título"
            className="pl-9"
          />
        </div>
      ) : null}

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
            Período de {format(weekStart, 'dd/MM/yyyy')} a{' '}
            {format(addDays(weekStart, 6), 'dd/MM/yyyy')}
            {selectedVisit ? ` · ${selectedVisit.title}` : ''}
          </p>
          {searchedActivities.length === 0 ? (
            <EmptyState
              icon={Calendar}
              title={eventSearch ? 'Nenhum evento encontrado' : 'Nenhuma atividade nesta visita'}
              description={eventSearch ? 'Tente pesquisar por outro título.' : 'Crie a primeira atividade ou mude para a visualização em lista.'}
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
              activities={searchedActivities}
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

      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Conferir programação extraída</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-lg bg-muted/60 px-4 py-3 text-sm">
              <p className="font-medium">{importFileName}</p>
              <p className="text-muted-foreground">
                {importPreview.length} atividade(s) encontrada(s). O arquivo não será armazenado.
              </p>
            </div>

            <div className="max-h-[50vh] space-y-2 overflow-y-auto pr-1">
              {importPreview.map((activity, index) => (
                <Card key={`${activity.date}-${activity.startTime}-${index}`}>
                  <CardContent className="p-4">
                    <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <p className="font-semibold">{activity.title}</p>
                        <p className="text-sm text-muted-foreground">
                          {formatDate(activity.date)} · {activity.startTime.slice(11, 16)}–{activity.endTime.slice(11, 16)}
                        </p>
                      </div>
                      {activity.location ? (
                        <span className="text-sm text-muted-foreground">{activity.location}</span>
                      ) : null}
                    </div>
                    {activity.description ? (
                      <p className="mt-2 text-sm text-muted-foreground">{activity.description}</p>
                    ) : null}
                    {activity.responsibleNames.length > 0 ? (
                      <p className="mt-2 text-xs text-muted-foreground">
                        Responsáveis: {activity.responsibleNames.join(', ')}
                      </p>
                    ) : null}
                    {activity.visitorNames.length > 0 ? (
                      <p className="mt-1 text-xs text-muted-foreground">
                        Visitantes: {activity.visitorNames.join(', ')}
                      </p>
                    ) : null}
                  </CardContent>
                </Card>
              ))}
            </div>

            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="outline"
                disabled={importing || savingImport}
                onClick={() => importInputRef.current?.click()}
              >
                <Upload className="h-4 w-4" />
                {importing ? 'Lendo arquivo...' : 'Escolher outro arquivo'}
              </Button>
              <Button
                type="button"
                disabled={savingImport || importing || importPreview.length === 0}
                onClick={() => void saveImportedActivities()}
              >
                {savingImport ? 'Salvando...' : 'Salvar programação'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

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
            <div className="flex flex-col-reverse gap-2 sm:col-span-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                {editing && canWrite ? (
                  <Button
                    type="button"
                    variant="destructive"
                    onClick={() => {
                      const activity = editing
                      setOpen(false)
                      setEditing(null)
                      deleteDialog.requestDelete({ id: activity.id, name: activity.title })
                    }}
                  >
                    Mover para lixeira
                  </Button>
                ) : null}
              </div>
              <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? 'Salvando...' : 'Salvar'}
              </Button>
              </div>
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
            removeFromGoogle(item.id)
            await loadActivities()
          })
        }}
      />
    </div>
  )
}
