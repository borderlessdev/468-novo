import {
  addMonths,
  endOfDay,
  format,
  setDate,
  startOfDay,
  subMonths,
} from 'date-fns'

/** Ciclo de medição: dia 20 até dia 19 do mês seguinte. */
export function getCurrentCycle(reference = new Date()) {
  const day = reference.getDate()
  const cycleStart =
    day >= 20
      ? startOfDay(setDate(reference, 20))
      : startOfDay(setDate(subMonths(reference, 1), 20))
  const cycleEnd = endOfDay(setDate(addMonths(cycleStart, 1), 19))

  return {
    start: cycleStart,
    end: cycleEnd,
    label: `${format(cycleStart, 'dd/MM')} a ${format(cycleEnd, 'dd/MM')}`,
    startIso: format(cycleStart, 'yyyy-MM-dd'),
    endIso: format(cycleEnd, 'yyyy-MM-dd'),
  }
}

export const BRAZILIAN_STATES = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA',
  'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN',
  'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
] as const

export const VISIT_STATUSES = [
  'planejamento',
  'em_andamento',
  'concluida',
  'cancelada',
] as const

export const TASK_STATUSES = ['backlog', 'in_progress', 'completed'] as const

export const DEFAULT_CHECKLIST = [
  'Confirmar transporte',
  'Reservar hotel',
  'Enviar convites formais',
  'Organizar apresentação institucional',
  'Verificar acessibilidade do local',
  'Reservar restaurante para jantar',
  'Preparar materiais de boas-vindas',
  'Confirmar agenda com stakeholders',
] as const

export const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', icon: 'LayoutDashboard' },
  { to: '/visitas', label: 'Visitas', icon: 'MapPin' },
  { to: '/agenda', label: 'Agenda', icon: 'Calendar' },
  { to: '/visitantes', label: 'Visitantes', icon: 'Users' },
  { to: '/planejamento', label: 'Planejamento', icon: 'ListTodo' },
  { to: '/financeiro', label: 'Financeiro', icon: 'DollarSign' },
  { to: '/relatorios', label: 'Relatórios', icon: 'BarChart3' },
  { to: '/configuracoes', label: 'Configurações', icon: 'Settings' },
] as const
