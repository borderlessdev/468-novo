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
import { Clock, GripVertical, Plus, Users } from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
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
import { listVisits } from '@/services/visits'
import { createTask, listTasks, updateTask } from '@/services/tasks'
import type { Task, TaskStatus, Visit } from '@/types'

const COLUMNS: { id: TaskStatus; label: string }[] = [
  { id: 'backlog', label: 'Backlog' },
  { id: 'in_progress', label: 'Em andamento' },
  { id: 'completed', label: 'Concluídas' },
]

function SortableTaskCard({ task }: { task: Task }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: task.id, data: { type: 'task', status: task.status } })

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
      className={`rounded-lg border bg-card p-3 shadow-sm ${isDragging ? 'opacity-40' : ''}`}
    >
      <div className="flex items-start gap-2">
        <button
          type="button"
          className="mt-0.5 cursor-grab text-muted-foreground active:cursor-grabbing"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-4 w-4" />
        </button>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">{task.title}</p>
          {task.dueDate ? (
            <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
              <Clock className="h-3 w-3" />
              {formatDateShort(task.dueDate)}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  )
}

function KanbanColumn({
  id,
  label,
  tasks,
}: {
  id: TaskStatus
  label: string
  tasks: Task[]
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
              tasks.map((task) => <SortableTaskCard key={task.id} task={task} />)
            )}
          </div>
        </SortableContext>
      </CardContent>
    </Card>
  )
}

export function PlanningPage() {
  const { user, isAdmin } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const [visits, setVisits] = useState<Visit[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [activeTask, setActiveTask] = useState<Task | null>(null)

  const visitId = searchParams.get('visita') ?? ''
  const selectedVisit = visits.find((v) => v.id === visitId)

  const form = useForm<TaskInput>({
    resolver: zodResolver(taskSchema),
    defaultValues: { title: '', dueDate: '', status: 'backlog' },
  })

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  )

  useEffect(() => {
    if (!user) return
    void (async () => {
      setLoading(true)
      try {
        setVisits(await listVisits(user.uid, isAdmin))
      } finally {
        setLoading(false)
      }
    })()
  }, [user, isAdmin])

  const loadTasks = useCallback(async () => {
    if (!visitId || !user) {
      setTasks([])
      return
    }
    try {
      setTasks(await listTasks(visitId, user.uid, isAdmin))
    } catch (error) {
      console.error(error)
      toast.error('Erro ao carregar tarefas')
    }
  }, [visitId, user, isAdmin])

  useEffect(() => {
    void loadTasks()
  }, [loadTasks])

  const grouped = useMemo(() => {
    const map: Record<TaskStatus, Task[]> = {
      backlog: [],
      in_progress: [],
      completed: [],
    }
    tasks.forEach((task) => map[task.status].push(task))
    return map
  }, [tasks])

  const resolveStatus = (overId: string | number): TaskStatus | null => {
    if (COLUMNS.some((c) => c.id === overId)) return overId as TaskStatus
    const overTask = tasks.find((t) => t.id === overId)
    return overTask?.status ?? null
  }

  const onDragStart = (event: DragStartEvent) => {
    setActiveTask(tasks.find((t) => t.id === event.active.id) ?? null)
  }

  const onDragEnd = async (event: DragEndEvent) => {
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
      await loadTasks()
    }
  }

  const onSubmit = form.handleSubmit(async (values) => {
    if (!user || !visitId) return
    setSaving(true)
    try {
      await createTask(user.uid, {
        visitId,
        title: values.title,
        status: values.status,
        order: grouped[values.status].length,
        dueDate: values.dueDate || undefined,
      })
      toast.success('Tarefa criada')
      setOpen(false)
      form.reset({ title: '', dueDate: '', status: 'backlog' })
      await loadTasks()
    } catch (error) {
      console.error(error)
      toast.error('Não foi possível criar a tarefa')
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
            <Button disabled={!visitId} onClick={() => setOpen(true)}>
              <Plus className="h-4 w-4" />
              Nova tarefa
            </Button>
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
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={onDragStart}
          onDragEnd={(e) => void onDragEnd(e)}
        >
          <div className="grid gap-4 lg:grid-cols-3">
            {COLUMNS.map((column) => (
              <KanbanColumn
                key={column.id}
                id={column.id}
                label={column.label}
                tasks={grouped[column.id]}
              />
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
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nova tarefa</DialogTitle>
          </DialogHeader>
          <form onSubmit={onSubmit} className="space-y-3">
            <div className="space-y-2">
              <Label>Título *</Label>
              <Input {...form.register('title')} />
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
    </div>
  )
}
