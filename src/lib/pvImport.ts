import * as XLSX from 'xlsx'
import { isGeneratedPvToken, normalizePvNumber } from '@/lib/pvNumber'

/** Linha do histórico de PVs (planilha 2023–2026). */
export type ImportedPv = {
  pvNumber: string
  year?: string
  state?: string
  note?: string
}

export type PvWorkbookResult = {
  rows: ImportedPv[]
  warnings: string[]
}

const normalize = (value: unknown) =>
  String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()

const aliases = {
  pv: ['pv', 'n pv', 'n da pv', 'no pv', 'numero pv', 'numero da pv', 'pv number', 'numero'],
  year: ['ano', 'year'],
  state: ['estado', 'uf', 'state'],
  note: ['visita', 'titulo', 'descricao', 'evento', 'observacao', 'observacoes', 'nome da visita'],
} as const

type AliasKey = keyof typeof aliases

function pickColumn(headers: string[], key: AliasKey): number {
  const wanted: readonly string[] = aliases[key]
  return headers.findIndex((header) => wanted.includes(header))
}

function cellText(row: unknown[], index: number): string {
  if (index < 0) return ''
  const value = row[index]
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return String(value.getFullYear())
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value)
  }
  return String(value ?? '').trim()
}

/** "PV 123", "PV-123", "pv: 123" → "123". Mantém códigos alfanuméricos como estão. */
export function cleanImportedPv(raw: string): string {
  const withoutPrefix = raw.replace(/^pv\s*[-.:#º°]?\s*/i, '')
  return normalizePvNumber(withoutPrefix)
}

/**
 * Lê uma planilha de histórico de PVs.
 * Aceita cabeçalho com coluna "PV" / "Número da PV"; sem cabeçalho reconhecido usa a primeira coluna.
 */
export function parsePvWorkbook(buffer: ArrayBuffer): PvWorkbookResult {
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: true })
  const warnings: string[] = []
  const merged = new Map<string, ImportedPv>()

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName]
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      defval: '',
      raw: true,
    })
    if (rows.length === 0) continue

    const headers = (rows[0] ?? []).map((value) => normalize(value))
    let pvIdx = pickColumn(headers, 'pv')
    let start = 1
    if (pvIdx < 0) {
      pvIdx = 0
      // Sem cabeçalho reconhecido: a primeira linha já é dado se parecer um número de PV.
      const firstCell = cellText(rows[0] ?? [], 0)
      start = /\d/.test(firstCell) ? 0 : 1
      if (rows.length > 0 && start === 1) {
        warnings.push(
          `Aba "${sheetName}": coluna de PV não identificada pelo cabeçalho; usei a primeira coluna.`,
        )
      }
    }
    const yearIdx = pickColumn(headers, 'year')
    const stateIdx = pickColumn(headers, 'state')
    const noteIdx = pickColumn(headers, 'note')

    for (const raw of rows.slice(start)) {
      if (!Array.isArray(raw)) continue
      const pvNumber = cleanImportedPv(cellText(raw, pvIdx))
      if (!pvNumber || isGeneratedPvToken(pvNumber)) continue
      if (merged.has(pvNumber)) continue
      merged.set(pvNumber, {
        pvNumber,
        year: cellText(raw, yearIdx) || undefined,
        state: cellText(raw, stateIdx) || undefined,
        note: cellText(raw, noteIdx) || undefined,
      })
    }
  }

  const rows = [...merged.values()]
  if (rows.length === 0) {
    warnings.push('Nenhum número de PV encontrado na planilha.')
  }
  return { rows, warnings }
}

/** Planilha-modelo para o cliente preencher. */
export function buildPvTemplateWorkbook(): ArrayBuffer {
  const sheet = XLSX.utils.aoa_to_sheet([
    ['PV', 'Ano', 'Estado', 'Descrição'],
    ['1', '2023', 'PA', 'Exemplo de visita'],
    ['2', '2024', 'MG', ''],
  ])
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, sheet, 'PVs')
  return XLSX.write(workbook, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer
}
