import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { format, parseISO, isValid } from 'date-fns'
import { ptBR } from 'date-fns/locale'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDate(value?: string | Date | null): string {
  if (!value) return '—'
  const date = typeof value === 'string' ? parseISO(value) : value
  if (!isValid(date)) return '—'
  return format(date, 'dd/MM/yyyy', { locale: ptBR })
}

export function formatDateShort(value?: string | Date | null): string {
  if (!value) return '—'
  const date = typeof value === 'string' ? parseISO(value) : value
  if (!isValid(date)) return '—'
  return format(date, 'dd/MM', { locale: ptBR })
}

export function formatCurrency(value?: number | null): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value ?? 0)
}

/** Formata peso (kg) para exibição: 75.5 → "75,5" */
export function formatWeightKgNumber(value: number): string {
  return value.toLocaleString('pt-BR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
  })
}

/** Formata o valor digitado no campo de peso (kg) com vírgula decimal. */
export function formatWeightKgInput(raw: string): string {
  let value = raw.replace(/[^\d,.]/g, '').replace(/\./g, ',')

  const commaIndex = value.indexOf(',')
  if (commaIndex === -1) {
    return value.replace(/\D/g, '')
  }

  const intPart = value.slice(0, commaIndex).replace(/\D/g, '')
  const decPart = value.slice(commaIndex + 1).replace(/\D/g, '').slice(0, 1)

  if (raw.endsWith(',') && decPart === '') {
    return `${intPart},`
  }

  return decPart ? `${intPart},${decPart}` : intPart
}

/** Converte texto do campo de peso (kg) para número. */
export function parseWeightKg(value?: string): number | undefined {
  if (!value || value.trim() === '' || value.trim() === ',') return undefined
  const num = Number(value.trim().replace(',', '.'))
  return Number.isFinite(num) ? num : undefined
}

/** Formata número para campo monetário: 1500.5 → "1.500,50" */
export function formatCurrencyNumber(value: number): string {
  return value.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

/** Formata digitação em tempo real como valor monetário (pt-BR). */
export function formatCurrencyInput(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  if (!digits) return ''

  const cents = Number.parseInt(digits, 10)
  if (!Number.isFinite(cents)) return ''

  return (cents / 100).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

/** Converte texto monetário (pt-BR) para número. */
export function parseCurrencyInput(value?: string): number | undefined {
  if (!value || value.trim() === '') return undefined
  const normalized = value.trim().replace(/\./g, '').replace(',', '.')
  const num = Number(normalized)
  return Number.isFinite(num) ? num : undefined
}

export function getAuthErrorMessage(code: string): string {
  const map: Record<string, string> = {
    'auth/email-already-in-use': 'Este e-mail já está em uso.',
    'auth/invalid-email': 'E-mail inválido.',
    'auth/weak-password': 'A senha deve ter pelo menos 6 caracteres.',
    'auth/user-not-found': 'Usuário não encontrado.',
    'auth/wrong-password': 'Senha incorreta.',
    'auth/invalid-credential': 'E-mail ou senha inválidos.',
    'auth/too-many-requests': 'Muitas tentativas. Tente novamente mais tarde.',
    'auth/network-request-failed': 'Falha de rede. Verifique sua conexão.',
    'auth/missing-email': 'Informe o e-mail.',
  }
  return map[code] ?? 'Ocorreu um erro. Tente novamente.'
}

export function calculateVisitProgress(
  tasks: { status: string }[],
): number {
  if (tasks.length === 0) return 0
  const completed = tasks.filter((t) => t.status === 'completed').length
  return Math.round((completed / tasks.length) * 100)
}

export function activitiesOverlap(
  a: { date: string; startTime: string; endTime: string },
  b: { date: string; startTime: string; endTime: string },
): boolean {
  if (a.date !== b.date) return false
  const aStart = a.startTime.slice(11) || a.startTime
  const aEnd = a.endTime.slice(11) || a.endTime
  const bStart = b.startTime.slice(11) || b.startTime
  const bEnd = b.endTime.slice(11) || b.endTime
  return aStart < bEnd && bStart < aEnd
}

export function downloadCsv(filename: string, rows: string[][]) {
  const content = rows
    .map((row) =>
      row
        .map((cell) => {
          const value = String(cell ?? '')
          if (value.includes(',') || value.includes('"') || value.includes('\n')) {
            return `"${value.replace(/"/g, '""')}"`
          }
          return value
        })
        .join(','),
    )
    .join('\n')

  const blob = new Blob(['\uFEFF' + content], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}
