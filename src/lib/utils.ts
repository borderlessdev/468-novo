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
