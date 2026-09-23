import * as XLSX from 'xlsx'
import type { Visitor, VisitorSex } from '@/types'

export type ImportedVisitor = Omit<
  Visitor,
  'id' | 'ownerId' | 'orgId' | 'createdAt' | 'updatedAt' | 'isDeleted'
>

const normalize = (value: unknown) =>
  String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()

const aliases = {
  name: ['nome', 'nome completo', 'name', 'full name', 'visitante'],
  document: ['documento', 'rg', 'passaporte', 'passport', 'document', 'id'],
  cpf: ['cpf'],
  company: ['empresa', 'company', 'organizacao'],
  role: ['cargo', 'funcao', 'role', 'title'],
  country: ['pais', 'country'],
  nationality: ['nacionalidade', 'nationality'],
  sex: ['sexo', 'genero', 'gender', 'sex'],
  birthDate: ['nascimento', 'data de nascimento', 'birth date', 'birthday'],
  phone: ['telefone', 'celular', 'phone', 'mobile'],
  email: ['email', 'e-mail'],
  emergencyPhone: ['emergencia', 'telefone de emergencia', 'emergency'],
  whatsapp: ['whatsapp', 'whats app'],
  language: ['idioma', 'language'],
  neighborhood: ['bairro', 'neighborhood'],
  weightKg: ['peso', 'peso kg', 'weight'],
  shoeSize: ['bota', 'calcado', 'numero da bota', 'shoe', 'shoe size'],
  shirtSize: ['camisa', 'numero da camisa', 'shirt'],
  dietaryRestriction: ['restricao alimentar', 'dieta', 'dietary'],
  hotelName: ['hotel', 'hospedagem'],
  notes: ['observacoes', 'obs', 'notes', 'observacao'],
} as const

type AliasKey = keyof typeof aliases

function pickColumn(
  headers: string[],
  key: AliasKey,
): number {
  const wanted = aliases[key]
  return headers.findIndex((header) => wanted.includes(header))
}

function cell(row: unknown[], index: number): string {
  if (index < 0) return ''
  const value = row[index]
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10)
  }
  return String(value ?? '').trim()
}

function toNumber(value: string): number | undefined {
  if (!value) return undefined
  const parsed = Number(value.replace(',', '.'))
  return Number.isFinite(parsed) ? parsed : undefined
}

function toSex(value: string): VisitorSex | undefined {
  const normalized = normalize(value)
  if (normalized.startsWith('fem')) return 'feminino'
  if (normalized.startsWith('masc')) return 'masculino'
  if (normalized.includes('nao informar') || normalized.includes('prefer')) {
    return 'prefiro_nao_informar'
  }
  if (normalized === 'outro' || normalized === 'other') return 'outro'
  return undefined
}

function toBirthDate(value: string): string | undefined {
  if (!value) return undefined
  const br = value.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/)
  if (br) return `${br[3]}-${br[2].padStart(2, '0')}-${br[1].padStart(2, '0')}`
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value
  return undefined
}

export function parseVisitorWorkbook(buffer: ArrayBuffer): ImportedVisitor[] {
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: true })
  const sheetName = workbook.SheetNames[0]
  if (!sheetName) return []
  const sheet = workbook.Sheets[sheetName]
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: '',
    raw: true,
  })
  if (rows.length < 2) return []

  const headers = (rows[0] ?? []).map((value) => normalize(value))
  const nameIdx = pickColumn(headers, 'name')
  const documentIdx = pickColumn(headers, 'document')
  if (nameIdx < 0 || documentIdx < 0) {
    throw new Error('A planilha precisa das colunas Nome e Documento (RG/Passaporte).')
  }

  const indexes = Object.fromEntries(
    (Object.keys(aliases) as AliasKey[]).map((key) => [key, pickColumn(headers, key)]),
  ) as Record<AliasKey, number>

  const imported: ImportedVisitor[] = []
  for (const raw of rows.slice(1)) {
    if (!Array.isArray(raw)) continue
    const name = cell(raw, nameIdx)
    const document = cell(raw, documentIdx)
    if (!name || !document) continue
    const dietary = cell(raw, indexes.dietaryRestriction)
    imported.push({
      name,
      document,
      cpf: cell(raw, indexes.cpf) || undefined,
      company: cell(raw, indexes.company) || undefined,
      role: cell(raw, indexes.role) || undefined,
      country: cell(raw, indexes.country) || undefined,
      nationality: cell(raw, indexes.nationality) || undefined,
      sex: toSex(cell(raw, indexes.sex)),
      birthDate: toBirthDate(cell(raw, indexes.birthDate)),
      phone: cell(raw, indexes.phone) || undefined,
      email: cell(raw, indexes.email) || undefined,
      emergencyPhone: cell(raw, indexes.emergencyPhone) || undefined,
      whatsapp: cell(raw, indexes.whatsapp) || undefined,
      language: cell(raw, indexes.language) || undefined,
      neighborhood: cell(raw, indexes.neighborhood) || undefined,
      weightKg: toNumber(cell(raw, indexes.weightKg)),
      shoeSize: toNumber(cell(raw, indexes.shoeSize)),
      shirtSize: cell(raw, indexes.shirtSize) || undefined,
      dietaryHasRestriction: Boolean(dietary),
      dietaryRestriction: dietary || undefined,
      hotelName: cell(raw, indexes.hotelName) || undefined,
      notes: cell(raw, indexes.notes) || undefined,
    })
  }

  return imported
}
