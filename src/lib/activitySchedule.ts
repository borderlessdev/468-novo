import type { Activity } from '@/types'

export type ActivityTimeUpdate = {
  id: string
  date: string
  startTime: string
  endTime: string
}

/** Minutos desde 00:00 a partir de `HH:mm` ou `YYYY-MM-DDTHH:mm:ss`. */
export function activityTimeToMinutes(value: string): number {
  const time = value.includes('T') ? value.slice(11, 16) : value.slice(0, 5)
  const [hours, minutes] = time.split(':').map(Number)
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return 0
  return hours * 60 + minutes
}

export function minutesToActivityTime(date: string, totalMinutes: number): string {
  const clamped = Math.max(0, Math.min(totalMinutes, 23 * 60 + 59))
  const hours = Math.floor(clamped / 60)
  const minutes = clamped % 60
  return `${date}T${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00`
}

export function activityDurationMinutes(activity: {
  startTime: string
  endTime: string
}): number {
  return Math.max(
    0,
    activityTimeToMinutes(activity.endTime) - activityTimeToMinutes(activity.startTime),
  )
}

function sortByStart(a: Activity, b: Activity): number {
  const byStart = activityTimeToMinutes(a.startTime) - activityTimeToMinutes(b.startTime)
  if (byStart !== 0) return byStart
  return a.id.localeCompare(b.id)
}

/**
 * Ao alterar o horário de uma atividade, as seguintes no mesmo dia são
 * reencadeadas: cada uma começa quando a anterior termina e mantém a duração.
 * Mudança de data não desloca as demais (só a atividade editada).
 */
export function planScheduleCascade(
  activities: Activity[],
  editedId: string,
  next: { date: string; startTime: string; endTime: string },
): ActivityTimeUpdate[] {
  const edited = activities.find((activity) => activity.id === editedId)
  const nextStart = next.startTime.includes('T')
    ? next.startTime
    : `${next.date}T${next.startTime.slice(0, 5)}:00`
  const nextEnd = next.endTime.includes('T')
    ? next.endTime
    : `${next.date}T${next.endTime.slice(0, 5)}:00`

  if (!edited || edited.date !== next.date) {
    return [
      {
        id: editedId,
        date: next.date,
        startTime: nextStart,
        endTime: nextEnd,
      },
    ]
  }

  const dayActivities = activities
    .filter((activity) => activity.date === next.date)
    .slice()
    .sort(sortByStart)

  const index = dayActivities.findIndex((activity) => activity.id === editedId)
  if (index < 0) {
    return [
      {
        id: editedId,
        date: next.date,
        startTime: nextStart,
        endTime: nextEnd,
      },
    ]
  }

  const updates: ActivityTimeUpdate[] = [
    {
      id: editedId,
      date: next.date,
      startTime: nextStart,
      endTime: nextEnd,
    },
  ]

  let cursorEnd = activityTimeToMinutes(nextEnd)
  for (let i = index + 1; i < dayActivities.length; i += 1) {
    const activity = dayActivities[i]
    const duration = activityDurationMinutes(activity)
    if (duration <= 0) continue
    if (cursorEnd + duration > 24 * 60) break
    const startTime = minutesToActivityTime(next.date, cursorEnd)
    const endTime = minutesToActivityTime(next.date, cursorEnd + duration)
    if (startTime !== activity.startTime || endTime !== activity.endTime) {
      updates.push({
        id: activity.id,
        date: next.date,
        startTime,
        endTime,
      })
    }
    cursorEnd += duration
  }

  return updates
}
