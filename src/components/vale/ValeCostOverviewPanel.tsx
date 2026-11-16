import { cn } from '@/lib/utils'

const SABORES = '#E8873A'
const PRODUCAO = '#2EC99A'

const DAY_SLOTS = [
  { time: '09h', title: 'Masterclass sabores · 20 vagas', color: SABORES },
  { time: '11h', title: 'Masterclass sabores · 20 vagas', color: SABORES },
  { time: '14h', title: 'Masterclass produção · 20 vagas', color: PRODUCAO },
  { time: '16h', title: 'Masterclass produção · 20 vagas', color: PRODUCAO },
] as const

const CYCLES = [
  { month: 'JUN', product: 'queijo', detail: '8 aulas · 160 vagas' },
  { month: 'JUL', product: 'porco', detail: '8 aulas · 160 vagas' },
  { month: 'NOV', product: 'goiaba', detail: '8 aulas · 160 vagas' },
  { month: 'DEZ', product: 'a definir', detail: '8 aulas · 160 vagas' },
] as const

export type ValeCostOverviewStats = {
  totalVisits: number
  totalEvents: number
  vipVisits: number
  communityVisits: number
  cycleLabel: string
}

/** Painel overview da dashboard Vale — números do ciclo vêm das visitas reais. */
export function ValeCostOverviewPanel({
  stats,
  className,
}: {
  stats: ValeCostOverviewStats
  className?: string
}) {
  const metrics = [
    {
      value: String(stats.totalVisits),
      label: 'total de visitas do ciclo',
      hint: `Ciclo ${stats.cycleLabel}`,
      color: SABORES,
    },
    {
      value: String(stats.totalEvents),
      label: 'total do evento do ciclo',
      hint: `Ciclo ${stats.cycleLabel}`,
      color: PRODUCAO,
    },
    {
      value: String(stats.vipVisits),
      label: 'visitas VIP',
      hint: `Ciclo ${stats.cycleLabel}`,
      color: SABORES,
    },
    {
      value: String(stats.communityVisits),
      label: 'visitas comunidade',
      hint: 'Prioritária + comunidade',
      color: PRODUCAO,
    },
  ]

  return (
    <section
      className={cn(
        'overflow-hidden rounded-2xl border border-black/[0.04] bg-[#F3F3F1] px-5 py-6 sm:px-7 sm:py-8',
        className,
      )}
    >
      <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 max-w-2xl space-y-2">
          <p className="text-[11px] font-medium tracking-[0.14em] text-neutral-500 uppercase">
            overview
          </p>
          <h2 className="text-2xl font-semibold tracking-tight text-neutral-950 sm:text-[1.85rem]">
            Vale demais otimização de custos
          </h2>
          <p className="text-sm leading-relaxed text-neutral-600">
            Dois pilares, uma mesma estrutura: sabores e produção dividem a agenda, o espaço e a
            montagem.
          </p>
        </div>

        <div className="flex shrink-0 flex-wrap gap-2">
          <span
            className="inline-flex items-center rounded-full px-3.5 py-1.5 text-xs font-medium text-white"
            style={{ backgroundColor: SABORES }}
          >
            sabores
          </span>
          <span
            className="inline-flex items-center rounded-full px-3.5 py-1.5 text-xs font-medium text-white"
            style={{ backgroundColor: PRODUCAO }}
          >
            produção
          </span>
        </div>
      </div>

      <div className="mt-8 grid gap-6 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map((metric) => (
          <div key={metric.label} className="min-w-0">
            <p
              className="text-4xl font-semibold tracking-tight tabular-nums sm:text-5xl"
              style={{ color: metric.color }}
            >
              {metric.value}
            </p>
            <p className="mt-1 text-sm font-medium text-neutral-800">{metric.label}</p>
            <p className="text-xs text-neutral-500">{metric.hint}</p>
          </div>
        ))}
      </div>

      <div className="mt-10 grid gap-8 lg:grid-cols-2 lg:gap-12">
        <div className="space-y-4">
          <h3 className="text-base font-semibold text-neutral-900">Um dia de agenda</h3>
          <ul className="space-y-2.5">
            {DAY_SLOTS.map((slot) => (
              <li key={slot.time} className="flex items-center gap-3">
                <span className="w-9 shrink-0 text-sm font-medium tabular-nums text-neutral-700">
                  {slot.time}
                </span>
                <div
                  className="min-w-0 flex-1 rounded-full px-4 py-2.5 text-sm font-medium text-white"
                  style={{ backgroundColor: slot.color }}
                >
                  {slot.title}
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div className="space-y-4">
          <h3 className="text-base font-semibold text-neutral-900">
            4 ciclos no ano, cada um com um produto de Minas
          </h3>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {CYCLES.map((cycle) => (
              <div
                key={cycle.month}
                className="rounded-2xl bg-white px-3.5 py-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)]"
              >
                <p className="text-[11px] font-semibold tracking-[0.12em] text-neutral-500 uppercase">
                  {cycle.month}
                </p>
                <p className="mt-1 text-sm font-semibold" style={{ color: PRODUCAO }}>
                  {cycle.product}
                </p>
                <p className="mt-1 text-[11px] leading-snug text-neutral-500">{cycle.detail}</p>
              </div>
            ))}
          </div>
          <p className="text-xs leading-relaxed text-neutral-500">
            Onde está a economia: uma única montagem por ciclo atende os dois pilares, o mesmo
            espaço recebe 4 turmas por dia e a equipe trabalha em blocos concentrados de 2 dias,
            sem custo de remontagem a cada aula.
          </p>
        </div>
      </div>
    </section>
  )
}
