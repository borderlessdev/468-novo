import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { toastMovedToTrash } from '@/lib/toast'
import { Clock, Plus, Users } from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { ConfirmDeleteDialog, useConfirmDelete } from '@/components/shared/ConfirmDeleteDialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
import { taskSchema, type TaskInput } from '@/lib/validations'
import { formatDateShort } from '@/lib/utils'
import { calculateVisitProgress } from '@/lib/utils'
import { listVisits, syncVisitProgress } from '@/services/visits'
import { createTask, deleteTask, listTasks, updateTask } from '@/services/tasks'
import { notifyVisitStakeholders } from '@/services/notifications'
import { getUsersByIds } from '@/services/users'
import type { Task, TaskStatus, UserProfile, Visit } from '@/types'

const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  backlog: 'Pendente',
  in_progress: 'Em andamento',
  completed: 'Concluída',
}

const COLUMNS: { id: TaskStatus; label: string }[] = [
  { id: 'backlog', label: 'Backlog' },
  { id: 'in_progress', label: 'Em andamento' },
  { id: 'completed', label: 'Concluídas' },
]

function SortableTaskCard({
  task,
  onEdit,
  onDelete,
  canWrite,
}: {
  task: Task
  onEdit: (task: Task) => void
  onDelete: (task: Task) => void
  canWrite: boolean
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: task.id, data: { type: 'task', status: task.status } })

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
      className={`cursor-grab rounded-lg border bg-card p-3 shadow-sm active:cursor-grabbing ${
        isDragging ? 'opacity-40' : ''
      }`}
      {...attributes}
      {...listeners}
    >
      <p className="text-sm font-medium">{task.title}</p>
      {task.assigneeName ? (
        <p className="mt-1 text-xs text-muted-foreground">Resp.: {task.assigneeName}</p>
      ) : null}
      {task.dueDate ? (
        <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
          <Clock className="h-3 w-3" />
          {formatDateShort(task.dueDate)}
        </p>
      ) : null}
      {canWrite ? (
        <div
          className="mt-2 flex gap-1"
          onPointerDown={(e) => e.stopPropagation()}
        >
          <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => onEdit(task)}>
            Editar
          </Button>
          <Button
            size="sm"
            variant="destructive"
            className="h-7 px-2"
            onClick={() => onDelete(task)}
          >
            Excluir
          </Button>
        </div>
      ) : null}
    </div>
  )
}

function KanbanColumn({
  id,
  label,
  tasks,
  onEdit,
  onDelete,
  canWrite,
}: {
  id: TaskStatus
  label: string
  tasks: Task[]
  onEdit: (task: Task) => void
  onDelete: (task: Task) => void
  canWrite: boolean
}) {
  const { setNodeRef, isOver } = useDroppable({ id })

  return (
    <Card className="min-h-[320px]">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="text-sm font-semibold">{label}</CardTitle>
        <Badge variant="secondary">{tasks.length}</Badge>
      </CardHeader>
      <CardContent>
        <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
          <div
            ref={setNodeRef}
            className={`min-h-[240px] space-y-2 rounded-lg p-2 transition-colors ${
              isOver ? 'bg-primary/5' : 'bg-muted/30'
            }`}
          >
            {tasks.length === 0 ? (
              <p className="px-2 py-8 text-center text-xs text-muted-foreground">
                Nenhuma tarefa neste status.
              </p>
            ) : (
              tasks.map((task) => (
                <SortableTaskCard
                  key={task.id}
                  task={task}
                  onEdit={onEdit}
                  onDelete={onDelete}
                  canWrite={canWrite}
                />
              ))
            )}
          </div>
        </SortableContext>
      </CardContent>
    </Card>
  )
}

export function PlanningPage() {
  const { user, isAdmin, role, canWrite, profile } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const [visits, setVisits] = useState<Visit[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Task | null>(null)
  const [saving, setSaving] = useState(false)
  const deleteDialog = useConfirmDelete<{ id: string; name: string }>()
  const [activeTask, setActiveTask] = useState<Task | null>(null)
  const [assigneeFilter, setAssigneeFilter] = useState('todos')
  const [teamMembers, setTeamMembers] = useState<UserProfile[]>([])

  const visitId = searchParams.get('visita') ?? ''
  const selectedVisit = visits.find((v) => v.id === visitId)

  const form = useForm<TaskInput>({
    resolver: zodResolver(taskSchema),
    defaultValues: {
      title: '',
      dueDate: '',
      assigneeName: '',
      assigneeId: '',
      status: 'backlog',
    },
  })

  const refreshProgress = useCallback(async () => {
    if (!visitId || !user) return
    const ownerIdForQuery = selectedVisit?.ownerId ?? user.uid
    const all = await listTasks(visitId, ownerIdForQuery, isAdmin)
    await syncVisitProgress(visitId, calculateVisitProgress(all))
  }, [visitId, user, isAdmin, selectedVisit?.ownerId])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  )

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

  const loadTasks = useCallback(async () => {
    if (!visitId || !user) {
      setTasks([])
      return
    }
    const ownerIdForQuery = selectedVisit?.ownerId ?? user.uid
    try {
      setTasks(await listTasks(visitId, ownerIdForQuery, isAdmin))
    } catch (error) {
      console.error(error)
      toast.error('Erro ao carregar tarefas')
    }
  }, [visitId, user, isAdmin, selectedVisit?.ownerId])

  useEffect(() => {
    void loadTasks()
  }, [loadTasks])

  useEffect(() => {
    if (!selectedVisit) {
      setTeamMembers([])
      return
    }
    const ids = [
      selectedVisit.ownerId,
      ...selectedVisit.teamMemberIds,
    ]
    void getUsersByIds(ids).then(setTeamMembers)
  }, [selectedVisit])

  const filteredTasks = useMemo(() => {
    if (assigneeFilter === 'todos') return tasks
    if (assigneeFilter === '_none') {
      return tasks.filter((t) => !t.assigneeId && !t.assigneeName)
    }
    return tasks.filter(
      (t) => t.assigneeId === assigneeFilter || t.assigneeName === assigneeFilter,
    )
  }, [tasks, assigneeFilter])

  const assigneeOptions = useMemo(() => {
    const fromTasks = tasks
      .map((t) => ({ id: t.assigneeId, name: t.assigneeName }))
      .filter((t) => t.id || t.name)
    const map = new Map<string, string>()
    for (const member of teamMembers) {
      map.set(member.uid, member.name)
    }
    for (const item of fromTasks) {
      if (item.id) map.set(item.id, item.name || item.id)
      else if (item.name) map.set(item.name, item.name)
    }
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }))
  }, [tasks, teamMembers])

  const grouped = useMemo(() => {
    const map: Record<TaskStatus, Task[]> = {
      backlog: [],
      in_progress: [],
      completed: [],
    }
    filteredTasks.forEach((task) => map[task.status].push(task))
    return map
  }, [filteredTasks])

  const resolveStatus = (overId: string | number): TaskStatus | null => {
    if (COLUMNS.some((c) => c.id === overId)) return overId as TaskStatus
    const overTask = tasks.find((t) => t.id === overId)
    return overTask?.status ?? null
  }

  const onDragStart = (event: DragStartEvent) => {
    setActiveTask(tasks.find((t) => t.id === event.active.id) ?? null)
  }

  const onDragEnd = async (event: DragEndEvent) => {
    if (!canWrite) return
    setActiveTask(null)
    const { active, over } = event
    if (!over) return

    const task = tasks.find((t) => t.id === active.id)
    if (!task) return

    const newStatus = resolveStatus(over.id)
    if (!newStatus || newStatus === task.status) return

    setTasks((prev) =>
      prev.map((t) => (t.id === task.id ? { ...t, status: newStatus } : t)),
    )
    try {
      await updateTask(task.id, { status: newStatus })
    } catch (error) {
      console.error(error)
      toast.error('Falha ao mover tarefa')
      setTasks((prev) =>
        prev.map((t) => (t.id === task.id ? { ...t, status: task.status } : t)),
      )
      return
    }

    if (selectedVisit && user) {
      try {
        await notifyVisitStakeholders(selectedVisit, {
          type: 'task_status_changed',
          title: 'Tarefa atualizada',
          body: `"${task.title}" — ${TASK_STATUS_LABELS[newStatus]}`,
          visitId: selectedVisit.id,
          entityId: task.id,
          href: `/planejamento?visita=${selectedVisit.id}`,
          actorId: user.uid,
          actorName: profile?.name,
        })
      } catch (error) {
        console.warn('Failed to send task_status_changed notification', error)
      }
    }

    try {
      await refreshProgress()
    } catch (error) {
      // O status da tarefa já foi persistido; uma falha no progresso agregado
      // não deve desfazer o Kanban nem informar que a movimentação falhou.
      console.warn('Failed to sync visit progress after moving task', error)
    }
  }

  const openCreate = () => {
    setEditing(null)
    form.reset({
      title: '',
      dueDate: '',
      assigneeName: '',
      assigneeId: '',
      status: 'backlog',
    })
    setOpen(true)
  }

  const openEdit = (task: Task) => {
    setEditing(task)
    form.reset({
      title: task.title,
      dueDate: task.dueDate ?? '',
      assigneeName: task.assigneeName ?? '',
      assigneeId: task.assigneeId ?? '',
      status: task.status,
    })
    setOpen(true)
  }

  const handleDeleteRequest = (task: Task) => {
    deleteDialog.requestDelete({ id: task.id, name: task.title })
  }

  const handleDeleteConfirm = () => {
    void deleteDialog.confirm(async (item) => {
      if (!user) return
      try {
        await deleteTask(item.id, user.uid)
        toastMovedToTrash('Tarefa movida para a lixeira')
        await loadTasks()
        await refreshProgress()
      } catch (error) {
        console.error(error)
        toast.error('Não foi possível excluir')
        throw error
      }
    })
  }

  const onSubmit = form.handleSubmit(async (values) => {
    if (!user || !visitId) return
    setSaving(true)
    try {
      if (editing) {
        await updateTask(editing.id, {
          title: values.title,
          dueDate: values.dueDate || undefined,
          assigneeId: values.assigneeId || undefined,
          assigneeName: values.assigneeName || undefined,
          status: values.status,
        })
        toast.success('Tarefa atualizada')
      } else {
        const taskId = await createTask(user.uid, {
          visitId,
          title: values.title,
          status: values.status,
          order: grouped[values.status].length,
          dueDate: values.dueDate || undefined,
          assigneeId: values.assigneeId || undefined,
          assigneeName: values.assigneeName || undefined,
        })
        if (selectedVisit) {
          try {
            await notifyVisitStakeholders(selectedVisit, {
              type: 'task_created',
              title: 'Nova tarefa criada',
              body: `"${values.title}" foi adicionada ao planejamento`,
              visitId,
              entityId: taskId,
              href: `/planejamento?visita=${visitId}`,
              actorId: user.uid,
              actorName: profile?.name,
            })
          } catch (error) {
            console.warn('Failed to send task_created notification', error)
          }
        }
        toast.success('Tarefa criada')
      }
      setOpen(false)
      setEditing(null)
      form.reset({ title: '', dueDate: '', assigneeName: '', status: 'backlog' })
      await loadTasks()
      await refreshProgress()
    } catch (error) {
      console.error(error)
      toast.error('Não foi possível salvar a tarefa')
    } finally {
      setSaving(false)
    }
  })

  return (
    <div>
      <PageHeader
        title="Planejamento"
        description="Selecione uma visita para visualizar e organizar o planejamento."
        actions={
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <div className="space-y-1">
              <Label className="text-xs">Visita em planejamento</Label>
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
            <Button disabled={!visitId || !canWrite} onClick={openCreate}>
              <Plus className="h-4 w-4" />
              Nova tarefa
            </Button>
            {visitId ? (
              <Select value={assigneeFilter} onValueChange={setAssigneeFilter}>
                <SelectTrigger className="w-full sm:w-48">
                  <SelectValue placeholder="Responsável" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos responsáveis</SelectItem>
                  <SelectItem value="_none">Sem responsável</SelectItem>
                  {assigneeOptions.map((opt) => (
                    <SelectItem key={opt.id} value={opt.id}>
                      {opt.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : null}
          </div>
        }
      />

      <Card className="mb-6">
        <CardContent className="flex items-center justify-between gap-4 p-5">
          <div className="flex items-start gap-3">
            <Users className="mt-0.5 h-4 w-4 text-muted-foreground" />
            <div>
              <p className="font-medium">Equipe envolvida</p>
              <p className="text-sm text-muted-foreground">
                {selectedVisit?.teamMemberIds?.length
                  ? `${selectedVisit.teamMemberIds.length} pessoa(s)`
                  : 'Nenhuma equipe cadastrada para esta visita'}
              </p>
            </div>
          </div>
          <p className="text-sm text-muted-foreground">
            {selectedVisit?.teamMemberIds?.length ?? 0} pessoa(s)
          </p>
        </CardContent>
      </Card>

      {loading ? (
        <Skeleton className="h-80 w-full" />
      ) : !visitId ? (
        <Card>
          <CardContent className="p-10 text-center text-sm text-muted-foreground">
            Selecione uma visita para visualizar o Kanban de tarefas.
          </CardContent>
        </Card>
      ) : (
        <>
          {tasks.length > 0 && filteredTasks.length === 0 ? (
            <p className="mb-3 text-sm text-muted-foreground">
              Nenhuma tarefa corresponde ao filtro de responsável.
            </p>
          ) : null}
          <DndContext
            sensors={sensors}
            collisionDetection={closestCorners}
            onDragStart={onDragStart}
            onDragEnd={(e) => void onDragEnd(e)}
          >
            <div className="-mx-4 flex gap-4 overflow-x-auto px-4 pb-2 lg:mx-0 lg:grid lg:grid-cols-3 lg:overflow-visible lg:px-0 lg:pb-0">
              {COLUMNS.map((column) => (
                <div key={column.id} className="min-w-[280px] shrink-0 lg:min-w-0">
                  <KanbanColumn
                    id={column.id}
                    label={column.label}
                    tasks={grouped[column.id]}
                    onEdit={openEdit}
                    onDelete={handleDeleteRequest}
                    canWrite={canWrite}
                  />
                </div>
              ))}
            </div>
            <DragOverlay>
              {activeTask ? (
                <div className="rounded-lg border bg-card p-3 shadow-lg">
                  <p className="text-sm font-medium">{activeTask.title}</p>
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>
        </>
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
            <DialogTitle>{editing ? 'Editar tarefa' : 'Nova tarefa'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={onSubmit} className="space-y-3">
            <div className="space-y-2">
              <Label>Título *</Label>
              <Input {...form.register('title')} />
            </div>
            <div className="space-y-2">
              <Label>Responsável</Label>
              <Select
                value={form.watch('assigneeId') || '_none'}
                onValueChange={(value) => {
                  if (value === '_none') {
                    form.setValue('assigneeId', '')
                    form.setValue('assigneeName', '')
                    return
                  }
                  const member = teamMembers.find((m) => m.uid === value)
                  form.setValue('assigneeId', value)
                  form.setValue('assigneeName', member?.name ?? value)
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecionar responsável" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">Sem responsável</SelectItem>
                  {teamMembers.map((member) => (
                    <SelectItem key={member.uid} value={member.uid}>
                      {member.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Prazo</Label>
              <Input type="date" {...form.register('dueDate')} />
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select
                value={form.watch('status')}
                onValueChange={(value) => form.setValue('status', value as TaskStatus)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="backlog">Backlog</SelectItem>
                  <SelectItem value="in_progress">Em andamento</SelectItem>
                  <SelectItem value="completed">Concluídas</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end gap-2">
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
        onConfirm={handleDeleteConfirm}
      />
    </div>
  )
}
