import { Fragment, useMemo } from 'react'
import ReactECharts from 'echarts-for-react'
import type { EChartsOption } from 'echarts'
import { CalendarDays, CheckCircle2, Clock3, Users } from 'lucide-react'
import { ValeBarChart, type ValeBarRow } from '@/components/vale/ValeBarChart'
import { cn } from '@/lib/utils'
import { NO_VP_LABEL } from '@/lib/valeDashboardData'
import { VALE_VPS } from '@/lib/valeVp'

/** Uma cor por VP, na ordem de `VALE_VPS`. */
const VP_PALETTE = [
  '#19B3A0',
  '#3B82F6',
  '#8B5CF6',
  '#F472B6',
  '#FB923C',
  '#38BDF8',
  '#34D399',
  '#A78BFA',
  '#4ADE80',
  '#FACC15',
  '#FBBF24',
  '#94A3B8',
] as const

/** Título dos dois gráficos do painel (mesmo tamanho, alinhado à esquerda). */
const CHART_TITLE = 'text-left text-lg font-semibold leading-tight text-white'

/** Verde do cabeçalho — usado como traço dos ícones preenchidos. */
const HEADER_BG = '#00443F'
const REALIZED_COLOR = '#1FB89C'
const PENDING_COLOR = '#FFC94D'

export type ValeCostOverviewStats = {
  totalVisits: number
  realizedVisits: number
  pendingVisits: number
  visitorCount: number
}

export type ValeVpChartRow = {
  label: string
  count: number
}

export type ValeKpiKind = 'total' | 'realized' | 'pending'

function vpColor(label: string): string {
  if (label === NO_VP_LABEL) return '#64748B'
  const index = (VALE_VPS as readonly string[]).indexOf(label)
  return VP_PALETTE[index >= 0 ? index % VP_PALETTE.length : VP_PALETTE.length - 1]
}

/** Painel "Operações do ciclo": KPIs, visitas por VP e realizadas × a realizar. */
export function ValeCostOverviewPanel({
  stats,
  vpRows = [],
  onSelectVp,
  onSelectKpi,
  className,
}: {
  stats: ValeCostOverviewStats
  vpRows?: ValeVpChartRow[]
  /** Clique na barra ou no nome da VP — abre a lista das visitas dessa área. */
  onSelectVp?: (label: string) => void
  /** Clique nos KPIs / rosca — abre a lista correspondente. */
  onSelectKpi?: (kind: ValeKpiKind) => void
  className?: string
}) {
  const kpis: {
    kind: ValeKpiKind | null
    value: string
    label: string
    color: string
    icon: typeof CalendarDays
    /** Cor do ícone (contorno) e do preenchimento — ícones "sólidos" como na referência. */
    iconColor: string
    iconFill: string
    /** Traço do ícone; padrão = verde do cabeçalho (ícones preenchidos). */
    iconStroke?: string
    /** Quebra o rótulo em duas linhas (ex.: "Total de visitas / do ciclo"). */
    wrapLabel?: boolean
  }[] = [
    {
      kind: 'total',
      value: String(stats.totalVisits),
      label: 'Total de visitas do ciclo',
      color: '#FFFFFF',
      icon: CalendarDays,
      iconColor: '#5EE0CB',
      iconFill: '#5EE0CB',
      wrapLabel: true,
    },
    {
      kind: 'realized',
      value: String(stats.realizedVisits),
      label: 'Visitas realizadas',
      color: '#FFFFFF',
      icon: CheckCircle2,
      iconColor: '#34D399',
      iconFill: '#34D399',
    },
    {
      kind: 'pending',
      value: String(stats.pendingVisits),
      label: 'Visitas a realizar',
      color: PENDING_COLOR,
      icon: Clock3,
      iconColor: PENDING_COLOR,
      iconFill: PENDING_COLOR,
    },
    {
      kind: null,
      value: stats.visitorCount.toLocaleString('pt-BR'),
      label: 'Visitantes do ciclo',
      color: '#FFFFFF',
      icon: Users,
      iconColor: '#5EE0CB',
      // Ícone de pessoas fica só com contorno (o preenchimento deforma o desenho).
      iconFill: 'none',
      iconStroke: '#5EE0CB',
    },
  ]

  // Só as VPs ("VP - nome"), mesmo zeradas; demandantes (Presidência, DI. …) e "Sem VP"
  // ficam no painel "Visitas por demandante". Maior → menor.
  const barRows = useMemo<ValeBarRow[]>(() => {
    const byLabel = new Map(vpRows.map((row) => [row.label, row.count]))
    const labels = VALE_VPS.filter((label) => label.startsWith('VP - '))
    return labels
      .map((label, order) => ({ label, order, count: byLabel.get(label) ?? 0 }))
      .sort((a, b) => b.count - a.count || a.order - b.order)
      .map((row) => ({
        key: row.label,
        label: row.label,
        tooltipLabel: row.label,
        value: row.count,
        color: vpColor(row.label),
      }))
  }, [vpRows])

  const total = stats.realizedVisits + stats.pendingVisits
  const realizedPct = total > 0 ? Math.round((stats.realizedVisits / total) * 100) : 0
  const pendingPct = total > 0 ? 100 - realizedPct : 0

  const donutOption = useMemo<EChartsOption>(() => {
    const data =
      total > 0
        ? [
            { name: 'Realizadas', value: stats.realizedVisits, itemStyle: { color: REALIZED_COLOR } },
            { name: 'A realizar', value: stats.pendingVisits, itemStyle: { color: PENDING_COLOR } },
          ].filter((item) => item.value > 0)
        : [{ name: 'Sem visitas', value: 1, itemStyle: { color: 'rgba(255,255,255,0.18)' } }]
    return {
      tooltip: {
        trigger: 'item',
        backgroundColor: '#0B2623',
        borderColor: 'rgba(255,255,255,0.35)',
        textStyle: { color: '#FFFFFF', fontSize: 12 },
        formatter: (params: unknown) => {
          const p = params as { name?: string; value?: number; percent?: number }
          if (total === 0) return 'Sem visitas no ciclo'
          return `<b>${p.name ?? ''}</b><br/>${p.value ?? 0} visita(s) · ${Math.round(p.percent ?? 0)}%`
        },
      },
      title: {
        text: String(total),
        subtext: 'Total',
        left: 'center',
        top: 'center',
        itemGap: 2,
        textStyle: { color: '#FFFFFF', fontSize: 34, fontWeight: 700 },
        subtextStyle: { color: '#FFFFFF', fontSize: 14 },
      },
      series: [
        {
          type: 'pie',
          radius: ['56%', '92%'],
          center: ['50%', '50%'],
          avoidLabelOverlap: false,
          label: { show: false },
          labelLine: { show: false },
          cursor: onSelectKpi ? 'pointer' : 'default',
          itemStyle: { borderColor: '#00463F', borderWidth: 4 },
          data,
        },
      ],
    }
  }, [stats.realizedVisits, stats.pendingVisits, total, onSelectKpi])

  const donutEvents = useMemo(
    () => ({
      click: (params: { name?: string }) => {
        if (params.name === 'Realizadas') onSelectKpi?.('realized')
        else if (params.name === 'A realizar') onSelectKpi?.('pending')
      },
    }),
    [onSelectKpi],
  )

  const legend = [
    { label: 'Realizadas', pct: realizedPct, value: stats.realizedVisits, color: REALIZED_COLOR, kind: 'realized' as const },
    { label: 'A realizar', pct: pendingPct, value: stats.pendingVisits, color: PENDING_COLOR, kind: 'pending' as const },
  ]

  return (
    <section
      className={cn(
        // @container: o cabeçalho se adapta à largura do painel (não da tela, que inclui a sidebar).
        '@container overflow-hidden rounded-2xl bg-gradient-to-br from-[#003D3A] via-[#00443F] to-[#005249] px-5 py-6 text-white shadow-sm sm:px-7',
        className,
      )}
    >
      <div className="flex flex-col gap-4 @min-[56rem]:flex-row @min-[56rem]:items-center">
        <div className="flex shrink-0 items-center gap-3 @min-[56rem]:pr-4 @min-[70rem]:gap-4 @min-[70rem]:pr-5">
          <svg
            viewBox="0 0 28 28"
            className="h-7 w-7 shrink-0 @min-[70rem]:h-9 @min-[70rem]:w-9"
            aria-hidden
          >
            <rect x="2" y="15" width="6" height="11" rx="1.5" fill="#2EC99A" />
            <rect x="11" y="9" width="6" height="17" rx="1.5" fill="#2EC99A" />
            <rect x="20" y="2" width="6" height="24" rx="1.5" fill="#2EC99A" />
          </svg>
          <h2 className="whitespace-nowrap text-lg font-semibold tracking-tight text-white @min-[70rem]:text-2xl">
            Operações do ciclo
          </h2>
        </div>

        {/* Cada KPI começa com uma barra vertical (a primeira separa o título dos indicadores). */}
        <div className="grid flex-1 grid-cols-2 gap-x-4 gap-y-4 @min-[40rem]:grid-cols-4 @min-[56rem]:flex @min-[56rem]:items-stretch @min-[56rem]:justify-end @min-[56rem]:gap-0">
          {kpis.map((kpi) => {
            const content = (
              <>
                <kpi.icon
                  className="mt-0.5 h-6 w-6 shrink-0 @min-[70rem]:h-7 @min-[70rem]:w-7"
                  style={{
                    color: kpi.iconColor,
                    fill: kpi.iconFill,
                    stroke: kpi.iconStroke ?? HEADER_BG,
                  }}
                  strokeWidth={kpi.iconStroke ? 2 : 1.8}
                  aria-hidden
                />
                <div className="min-w-0 text-left">
                  <p
                    className="whitespace-nowrap text-[13px] leading-tight text-white @min-[70rem]:text-sm"
                  >
                    {kpi.wrapLabel ? (
                      <>
                        Total de visitas
                        <br />
                        do ciclo
                      </>
                    ) : (
                      kpi.label
                    )}
                  </p>
                  <p
                    className="text-2xl font-bold leading-tight tracking-tight tabular-nums @min-[70rem]:text-3xl"
                    style={{ color: kpi.color }}
                  >
                    {kpi.value}
                  </p>
                </div>
              </>
            )
            const base =
              'flex items-start gap-2 @min-[56rem]:px-4 @min-[70rem]:gap-3 @min-[70rem]:px-6'
            return (
              <Fragment key={kpi.label}>
                {/* Barra vertical antes de cada indicador (a primeira separa do título). */}
                <span
                  aria-hidden
                  className="hidden w-px shrink-0 self-stretch bg-white/55 @min-[56rem]:block"
                />
                {kpi.kind && onSelectKpi ? (
                  <button
                    type="button"
                    onClick={() => onSelectKpi(kpi.kind as ValeKpiKind)}
                    className={cn(
                      base,
                      'rounded-lg outline-none transition-opacity hover:opacity-85 focus-visible:ring-2 focus-visible:ring-white/60',
                    )}
                  >
                    {content}
                  </button>
                ) : (
                  <div className={base}>{content}</div>
                )}
              </Fragment>
            )
          })}
        </div>
      </div>

      <div className="mt-7 grid gap-6 @min-[56rem]:grid-cols-[1.15fr_1px_1fr] @min-[56rem]:gap-0">
        <div className="min-w-0 @min-[56rem]:pr-8">
          <h3 className={CHART_TITLE}>Visitas por VP</h3>
          <div className="mt-3">
            {barRows.length > 0 ? (
              <ValeBarChart
                rows={barRows}
                theme="dark"
                labelWidth={185}
                rowHeight={30}
                axisHeadroom={1.4}
                gradient
                onSelect={onSelectVp}
              />
            ) : (
              <p className="py-10 text-center text-sm text-white/70">Nenhuma visita no ciclo.</p>
            )}
          </div>
        </div>

        {/* Barra vertical de 1px separando os dois gráficos (horizontal quando empilhados). */}
        <div aria-hidden className="h-px w-full bg-white/60 @min-[56rem]:h-auto @min-[56rem]:w-px" />

        <div className="flex min-w-0 flex-col @min-[56rem]:pl-8">
          <h3 className={CHART_TITLE}>Realizadas × a realizar</h3>
          {/* flex-1 + items-center: rosca e legenda centralizadas na altura restante do painel. */}
          <div className="mt-4 flex flex-1 flex-col items-center justify-center gap-4 sm:flex-row @min-[70rem]:gap-6">
            {/* Rosca menor em painéis estreitos, para o rótulo "Realizadas (68%)" caber numa linha. */}
            <div className="h-[210px] w-[210px] shrink-0 @min-[70rem]:h-[250px] @min-[70rem]:w-[250px]">
              <ReactECharts
                option={donutOption}
                style={{ height: '100%', width: '100%' }}
                opts={{ renderer: 'svg' }}
                onEvents={donutEvents}
              />
            </div>
            <ul className="shrink-0 space-y-5">
              {legend.map((item) => {
                const body = (
                  <>
                    <span className="mt-1 h-4 w-4 shrink-0 rounded-full" style={{ backgroundColor: item.color }} />
                    <span className="text-left">
                      <span className="block whitespace-nowrap text-base leading-tight text-white">
                        {item.label} ({item.pct}%)
                      </span>
                      <span className="block text-3xl font-bold leading-tight tabular-nums text-white">{item.value}</span>
                    </span>
                  </>
                )
                return (
                  <li key={item.label}>
                    {onSelectKpi ? (
                      <button
                        type="button"
                        onClick={() => onSelectKpi(item.kind)}
                        className="flex items-start gap-3 rounded-lg outline-none transition-opacity hover:opacity-85 focus-visible:ring-2 focus-visible:ring-white/60"
                      >
                        {body}
                      </button>
                    ) : (
                      <div className="flex items-start gap-3">{body}</div>
                    )}
                  </li>
                )
              })}
            </ul>
          </div>
        </div>
      </div>
    </section>
  )
}
