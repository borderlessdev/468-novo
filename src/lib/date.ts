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
