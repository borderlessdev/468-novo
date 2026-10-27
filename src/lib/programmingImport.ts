import { format } from 'date-fns'
import * as XLSX from 'xlsx'
import type { Activity } from '@/types'

export type ImportedActivity = Pick<
  Activity,
  | 'title'
  | 'description'
  | 'location'
  | 'date'
  | 'startTime'
  | 'endTime'
  | 'responsibleNames'
  | 'visitorNames'
>

const normalize = (value: unknown) =>
  String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()

const aliases = {
  title: ['titulo', 'atividade', 'evento', 'nome'],
  date: ['data', 'dia'],
  startTime: ['inicio', 'hora inicio', 'horario inicio', 'de'],
  endTime: ['fim', 'hora fim', 'horario fim', 'ate'],
  description: ['descricao', 'observacao', 'detalhes'],
  location: ['local', 'localizacao'],
  responsibleNames: ['responsaveis', 'responsavel'],
  visitorNames: ['visitantes', 'visitante'],
} as const

function toDate(value: unknown): string {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    // Datas-serial Excel viram Date; anos < 1970 são só horário.
    if (value.getFullYear() < 1970) return ''
    return format(value, 'yyyy-MM-dd')
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    const parsed = XLSX.SSF.parse_date_code(value)
    if (parsed && parsed.y >= 1970) {
      return `${parsed.y}-${String(parsed.m).padStart(2, '0')}-${String(parsed.d).padStart(2, '0')}`
    }
    return ''
  }
  const text = String(value ?? '').trim()
  const br = text.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/)
  if (br) return `${br[3]}-${br[2].padStart(2, '0')}-${br[1].padStart(2, '0')}`
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : ''
}

function toTime(value: unknown): string {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return format(value, 'HH:mm')
  if (typeof value === 'number') {
    const minutes = Math.round((((value % 1) + 1) % 1) * 24 * 60) % (24 * 60)
    return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`
  }
  const match = String(value ?? '').trim().match(/^(\d{1,2}):([0-5]\d)/)
  return match ? `${match[1].padStart(2, '0')}:${match[2]}` : ''
}

const toNames = (value: unknown) =>
  String(value ?? '').split(/[,;\n]/).map((name) => name.trim()).filter(Boolean)

function parseTabularSheet(sheet: XLSX.WorkSheet): ImportedActivity[] | null {
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' })
  if (rows.length === 0) return null
  const headers = Object.keys(rows[0]).map(normalize)
  if (!aliases.title.some((name) => headers.includes(name)) ||
      !aliases.date.some((name) => headers.includes(name))) return null

  const read = (row: Record<string, unknown>, field: keyof typeof aliases) => {
    const entry = Object.entries(row).find(([key]) => aliases[field].includes(normalize(key) as never))
    return entry?.[1] ?? ''
  }

  return rows.map((row, index) => {
    const date = toDate(read(row, 'date'))
    const start = toTime(read(row, 'startTime'))
    const end = toTime(read(row, 'endTime'))
    const title = String(read(row, 'title')).trim()
    if (!title || !date || !start || !end || end <= start) {
      throw new Error(`Linha ${index + 2}: confira título, data e horários`)
    }
    return {
      title,
      date,
      startTime: `${date}T${start}:00`,
      endTime: `${date}T${end}:00`,
      description: String(read(row, 'description')).trim(),
      location: String(read(row, 'location')).trim(),
      responsibleNames: toNames(read(row, 'responsibleNames')),
      visitorNames: toNames(read(row, 'visitorNames')),
    }
  })
}

const months: Record<string, number> = {
  january: 1, janeiro: 1, february: 2, fevereiro: 2, march: 3, marco: 3,
  april: 4, abril: 4, may: 5, maio: 5, june: 6, junho: 6,
  july: 7, julho: 7, august: 8, agosto: 8, september: 9, setembro: 9,
  october: 10, outubro: 10, november: 11, novembro: 11, december: 12, dezembro: 12,
}

function headingDate(value: unknown, year: number): string {
  if (value instanceof Date || typeof value === 'number') {
    const fromValue = toDate(value)
    if (fromValue) return fromValue
  }
  const text = normalize(value)
  if (!text) return ''

  // Intervalo tipo "12 a 14 de agosto" / "august 12th to 14th" — não é cabeçalho de um dia.
  if (/\b\d{1,2}\s*(a|to|ate|-|–)\s*\d{1,2}\b/.test(text) && !/\(\s*[a-z]/.test(text)) {
    return ''
  }

  const iso = text.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/)
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`

  const br = text.match(/\b(\d{1,2})[/-](\d{1,2})[/-](20\d{2})\b/)
  if (br) return `${br[3]}-${br[2].padStart(2, '0')}-${br[1].padStart(2, '0')}`

  const portuguese = text.match(/\b(\d{1,2})\s+de\s+([a-z]+)\b/)
  if (portuguese && months[portuguese[2]]) {
    const day = Number(portuguese[1])
    if (day >= 1 && day <= 31) {
      return `${year}-${String(months[portuguese[2]]).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    }
  }

  // "August 12th", "august, 12", "wednesday august 13th"
  const english = text.match(/\b([a-z]+),?\s+(\d{1,2})(?:st|nd|rd|th)?\b/)
  if (english && months[english[1]]) {
    const day = Number(english[2])
    if (day >= 1 && day <= 31) {
      return `${year}-${String(months[english[1]]).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    }
  }

  return ''
}

function rowHeadingDate(row: unknown[], year: number): string {
  for (let i = 0; i < Math.min(row.length, 8); i += 1) {
    const found = headingDate(row[i], year)
    if (found) return found
  }
  return ''
}

function parseProgramSheet(sheet: XLSX.WorkSheet, fallbackYear: number): ImportedActivity[] {
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '', raw: true })
  const allText = rows.flat().map(String).join(' ')
  const explicitYear = allText.match(/\b(20\d{2})\b/)?.[1]
  const year = explicitYear ? Number(explicitYear) : fallbackYear
  const result: ImportedActivity[] = []
  let date = ''
  let dayDescription = ''
  let group = ''

  for (const row of rows) {
    const columnC = row[2]
    const columnF = row[5]
    const columnG = String(row[6] ?? '').trim()
    const nextDate = rowHeadingDate(row, year)
    if (nextDate) {
      // Só troca o dia corrente quando o cabeçalho traz uma data nova.
      if (nextDate !== date) {
        date = nextDate
        dayDescription = ''
        group = ''
      }
      continue
    }
    if (!date) continue

    const start = toTime(columnC)
    const end = toTime(columnF)
    if (start && end && columnG && end > start) {
      result.push({
        title: columnG,
        description: [dayDescription, group].filter(Boolean).join(' · '),
        location: '',
        date,
        startTime: `${date}T${start}:00`,
        endTime: `${date}T${end}:00`,
        responsibleNames: [],
        visitorNames: [],
      })
      continue
    }

    const label = String(columnC ?? '').trim()
    if (!label) continue
    if (/^(group|grupo)\b/i.test(normalize(label))) group = label
    else if (!/^(note|nota|legal notice)/i.test(normalize(label))) dayDescription = label
  }
  return result
}

export function parseProgrammingWorkbook(
  workbook: XLSX.WorkBook,
  fallbackYear = new Date().getFullYear(),
): ImportedActivity[] {
  for (const sheetName of workbook.SheetNames) {
    const parsed = parseTabularSheet(workbook.Sheets[sheetName])
    if (parsed) return parsed
  }

  const candidates = workbook.SheetNames
    .filter((name) => /(^|\s)pv(\s|$)|program/i.test(normalize(name)))
    .map((name) => ({ name, activities: parseProgramSheet(workbook.Sheets[name], fallbackYear) }))
    .filter(({ activities }) => activities.length > 0)
    .sort((a, b) => b.activities.length - a.activities.length)

  if (candidates.length === 0) {
    throw new Error('Nenhuma programação com data e horários foi encontrada no arquivo')
  }
  return candidates[0].activities
}

const MAX_AI_CSV_CHARS = 80_000
const MAX_AI_CSV_ROWS = 200

/** Serializa a primeira sheet útil como CSV truncado para a Cloud Function de import IA. */
export function workbookToCsvForAi(workbook: XLSX.WorkBook): {
  sheetCsv: string
  headers: string
  sheetName: string
} {
  const preferred =
    workbook.SheetNames.find((name) => /(^|\s)pv(\s|$)|program/i.test(normalize(name))) ??
    workbook.SheetNames[0]
  if (!preferred) {
    throw new Error('Planilha vazia')
  }
  const sheet = workbook.Sheets[preferred]
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: '',
    raw: false,
  }) as unknown[][]
  const capped = rows.slice(0, MAX_AI_CSV_ROWS)
  const lines = capped.map((row) =>
    (Array.isArray(row) ? row : [])
      .map((cell) => {
        const text = String(cell ?? '').replace(/"/g, '""')
        return text.includes(',') || text.includes('"') || text.includes('\n')
          ? `"${text}"`
          : text
      })
      .join(','),
  )
  let sheetCsv = lines.join('\n')
  if (sheetCsv.length > MAX_AI_CSV_CHARS) {
    sheetCsv = sheetCsv.slice(0, MAX_AI_CSV_CHARS)
  }
  const headerRow = capped[0] ?? []
  const headers = (Array.isArray(headerRow) ? headerRow : [])
    .map((cell) => String(cell ?? '').trim())
    .filter(Boolean)
    .join(' | ')
  return { sheetCsv, headers, sheetName: preferred }
}
