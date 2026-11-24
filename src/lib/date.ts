export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00`)
  d.setDate(d.getDate() + days)
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

export function diffDays(from: string, to: string): number {
  const a = new Date(`${from}T00:00:00`)
  const b = new Date(`${to}T00:00:00`)
  return Math.round((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24))
}

/** Dias inclusivos entre start e end (YYYY-MM-DD). */
export function datesBetween(startDate: string, endDate: string): string[] {
  if (!startDate || !endDate || endDate < startDate) return []
  const dates: string[] = []
  const cursor = new Date(`${startDate}T12:00:00`)
  const end = new Date(`${endDate}T12:00:00`)
  while (cursor <= end) {
    dates.push(cursor.toISOString().slice(0, 10))
    cursor.setDate(cursor.getDate() + 1)
  }
  return dates
}

/** Mantém só vagas cujas datas caem no período da visita. */
export function pruneCommunityDailyCapacity(
  capacity: Record<string, number> | undefined | null,
  startDate: string,
  endDate: string,
): Record<string, number> | undefined {
  if (!capacity || typeof capacity !== 'object') return undefined
  const allowed = new Set(datesBetween(startDate, endDate))
  const pruned = Object.fromEntries(
    Object.entries(capacity).filter(
      ([date, value]) => allowed.has(date) && typeof value === 'number' && value >= 1,
    ),
  )
  return Object.keys(pruned).length > 0 ? pruned : undefined
}

export function normalizeHm(value?: string): string {
  const raw = (value ?? '').trim()
  if (/^\d{2}:\d{2}/.test(raw)) return raw.slice(0, 5)
  return '09:00'
}

export function addMinutesToHm(startHHmm: string, minutes: number): string {
  const [hours, mins] = normalizeHm(startHHmm).split(':').map((part) => Number(part) || 0)
  const total = Math.max(0, hours * 60 + mins + minutes)
  const clamped = Math.min(total, 23 * 60 + 59)
  const hh = Math.floor(clamped / 60)
  const mm = clamped % 60
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`
}

export function toActivityDateTime(date: string, hhmm: string): string {
  return `${date}T${normalizeHm(hhmm)}:00`
}
