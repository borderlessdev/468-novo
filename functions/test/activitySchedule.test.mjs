import assert from 'node:assert/strict'

function toMinutes(value) {
  const time = value.includes('T') ? value.slice(11, 16) : value.slice(0, 5)
  const [hours, minutes] = time.split(':').map(Number)
  return hours * 60 + minutes
}

function fromMinutes(date, totalMinutes) {
  const clamped = Math.max(0, Math.min(totalMinutes, 23 * 60 + 59))
  const hours = Math.floor(clamped / 60)
  const minutes = clamped % 60
  return `${date}T${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00`
}

function duration(activity) {
  return Math.max(0, toMinutes(activity.endTime) - toMinutes(activity.startTime))
}

/** Espelho da lógica em src/lib/activitySchedule.ts */
function plan(activities, editedId, next) {
  const edited = activities.find((a) => a.id === editedId)
  const nextStart = next.startTime.includes('T')
    ? next.startTime
    : `${next.date}T${next.startTime.slice(0, 5)}:00`
  const nextEnd = next.endTime.includes('T')
    ? next.endTime
    : `${next.date}T${next.endTime.slice(0, 5)}:00`
  if (!edited || edited.date !== next.date) {
    return [{ id: editedId, date: next.date, startTime: nextStart, endTime: nextEnd }]
  }
  const day = activities
    .filter((a) => a.date === next.date)
    .slice()
    .sort((a, b) => toMinutes(a.startTime) - toMinutes(b.startTime) || a.id.localeCompare(b.id))
  const index = day.findIndex((a) => a.id === editedId)
  const updates = [{ id: editedId, date: next.date, startTime: nextStart, endTime: nextEnd }]
  let cursorEnd = toMinutes(nextEnd)
  for (let i = index + 1; i < day.length; i += 1) {
    const activity = day[i]
    const d = duration(activity)
    if (d <= 0) continue
    if (cursorEnd + d > 24 * 60) break
    const startTime = fromMinutes(next.date, cursorEnd)
    const endTime = fromMinutes(next.date, cursorEnd + d)
    if (startTime !== activity.startTime || endTime !== activity.endTime) {
      updates.push({ id: activity.id, date: next.date, startTime, endTime })
    }
    cursorEnd += d
  }
  return updates
}

const day = '2026-10-20'
const activities = [
  {
    id: 'a1',
    date: day,
    startTime: `${day}T10:00:00`,
    endTime: `${day}T10:30:00`,
    title: 'Traslado',
  },
  {
    id: 'a2',
    date: day,
    startTime: `${day}T10:30:00`,
    endTime: `${day}T11:00:00`,
    title: 'Coffee',
  },
  {
    id: 'a3',
    date: day,
    startTime: `${day}T11:00:00`,
    endTime: `${day}T12:00:00`,
    title: 'Reunião',
  },
]

const cascaded = plan(activities, 'a1', {
  date: day,
  startTime: '10:15',
  endTime: '10:45',
})

assert.equal(cascaded.length, 3)
assert.equal(cascaded[0].startTime, `${day}T10:15:00`)
assert.equal(cascaded[0].endTime, `${day}T10:45:00`)
assert.equal(cascaded[1].id, 'a2')
assert.equal(cascaded[1].startTime, `${day}T10:45:00`)
assert.equal(cascaded[1].endTime, `${day}T11:15:00`)
assert.equal(cascaded[2].id, 'a3')
assert.equal(cascaded[2].startTime, `${day}T11:15:00`)
assert.equal(cascaded[2].endTime, `${day}T12:15:00`)

const dateChange = plan(activities, 'a1', {
  date: '2026-10-21',
  startTime: '10:15',
  endTime: '10:45',
})
assert.equal(dateChange.length, 1)
assert.equal(dateChange[0].date, '2026-10-21')

console.log('activitySchedule: cascata de horários ok')
