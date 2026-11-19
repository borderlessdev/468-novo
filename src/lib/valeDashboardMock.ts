/**
 * DADOS DE EXEMPLO — SOMENTE EM DESENVOLVIMENTO LOCAL (`pnpm dev`).
 * Só o gráfico "Visitas por mês" usa isto. No build de produção `import.meta.env.DEV` é falso
 * e a constante vira `null`, então nunca vai ao ar. Para ver o gráfico real localmente,
 * abra o dashboard com `?mock=0`.
 */
import type { MonthRow } from '@/lib/valeDashboardData'

const MONTH_LABELS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
const MONTH_COUNTS = [12, 18, 22, 25, 28, 29, 38, 45, 55, 66, 50, 40]

export const VALE_MONTH_MOCK: MonthRow[] | null =
  import.meta.env.DEV &&
  typeof window !== 'undefined' &&
  new URLSearchParams(window.location.search).get('mock') !== '0'
    ? MONTH_LABELS.map((label, index) => ({
        key: `2026-${String(index + 1).padStart(2, '0')}`,
        label,
        count: MONTH_COUNTS[index],
        items: [],
      }))
    : null
