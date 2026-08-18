import { useMemo } from 'react'
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  type DragEndEvent,
} from '@dnd-kit/core'
import { addDays, format, startOfWeek, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { cn } from '@/lib/utils'
import type { Activity } from '@/types'

function timeToMinutes(iso: string): number {
  const d = parseISO(iso)
  if (Number.isNaN(d.getTime())) return 0
  return d.getHours() * 60 + d.getMinutes()
}

function minutesToTimeOnDate(date: string, minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${date}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`
}

function durationMinutes(start: string, end: string): number {
  return Math.max(30, timeToMinutes(end) - timeToMinutes(start))
}

function DraggableActivity({
  activity,
  onClick,
  disabled,
}: {
  activity: Activity
  onClick: () => void
  disabled?: boolean
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: activity.id,
    data: { activity },
    disabled: Boolean(disabled),
  })
  return (
    <button
      type="button"
      ref={setNodeRef}
      {...(disabled ? {} : listeners)}
      {...(disabled ? {} : attributes)}
      onClick={onClick}
      className={cn(
        'w-full rounded-md border bg-primary/10 px-2 py-2 text-left text-xs font-medium leading-snug text-primary shadow-sm transition-colors hover:bg-primary/15',
        isDragging && 'opacity-60',
        disabled ? 'cursor-pointer' : 'cursor-grab active:cursor-grabbing',
      )}
      style={{ transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined }}
    >
      {activity.title}
    </button>
  )
}

function DayColumn({
  date,
  activities,
  onActivityClick,
  canWrite,
}: {
  date: string
  activities: Activity[]
  onActivityClick: (activity: Activity) => void
  canWrite: boolean
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `day:${date}`, disabled: !canWrite })
  return (
    <div
      ref={setNodeRef}
      className={cn(
        'min-h-32 min-w-[150px] flex-1 space-y-2 border-l border-border p-2',
        isOver && 'bg-primary/5',
      )}
    >
      {activities.map((activity) => (
        <DraggableActivity
          key={activity.id}
          activity={activity}
          disabled={!canWrite}
          onClick={() => onActivityClick(activity)}
        />
      ))}
    </div>
  )
}

interface WeeklyAgendaProps {
  weekStart: Date
  activities: Activity[]
  canWrite: boolean
  onActivityClick: (activity: Activity) => void
  onMoveActivity: (
    activity: Activity,
    next: { date: string; startTime: string; endTime: string },
  ) => void
}

export function WeeklyAgenda({
  weekStart,
  activities,
  canWrite,
  onActivityClick,
  onMoveActivity,
}: WeeklyAgendaProps) {
  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart],
  )

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  )

  const byDate = useMemo(() => {
    const map = new Map<string, Activity[]>()
    for (const day of days) {
      map.set(format(day, 'yyyy-MM-dd'), [])
    }
    for (const activity of activities) {
      const list = map.get(activity.date)
      if (list) list.push(activity)
    }
    return map
  }, [activities, days])

  const handleDragEnd = (event: DragEndEvent) => {
    if (!canWrite) return
    const activity = event.active.data.current?.activity as Activity | undefined
    const overId = event.over?.id
    if (!activity || typeof overId !== 'string' || !overId.startsWith('day:')) return
    const nextDate = overId.replace('day:', '')
    const duration = durationMinutes(activity.startTime, activity.endTime)
    const startMinutes = timeToMinutes(activity.startTime)
    const nextStart = minutesToTimeOnDate(nextDate, startMinutes)
    const nextEnd = minutesToTimeOnDate(nextDate, startMinutes + duration)
    if (
      nextDate === activity.date &&
      nextStart === activity.startTime &&
      nextEnd === activity.endTime
    ) {
      return
    }
    onMoveActivity(activity, {
      date: nextDate,
      startTime: nextStart,
      endTime: nextEnd,
    })
  }

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <div className="space-y-2">
        {canWrite ? (
          <p className="text-xs text-muted-foreground">
            Arraste uma atividade para outro dia para remarcar. Clique para editar.
          </p>
        ) : null}
        <div className="overflow-x-auto rounded-xl border border-border">
          <div className="flex min-w-[1050px] items-stretch">
              {days.map((day) => {
                const date = format(day, 'yyyy-MM-dd')
                return (
                  <div key={date} className="flex min-w-0 flex-1 flex-col">
                    <div className="flex h-10 items-center justify-center border-b border-l border-border bg-muted/30 text-xs font-medium">
                      {format(day, 'EEE dd/MM', { locale: ptBR })}
                    </div>
                    <DayColumn
                      date={date}
                      activities={byDate.get(date) ?? []}
                      onActivityClick={onActivityClick}
                      canWrite={canWrite}
                    />
                  </div>
                )
              })}
          </div>
        </div>
      </div>
    </DndContext>
  )
}

export function getWeekStart(anchor: Date = new Date()): Date {
  return startOfWeek(anchor, { weekStartsOn: 1 })
}
