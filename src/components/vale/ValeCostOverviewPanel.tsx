import { useMemo, useState } from 'react'
import ReactECharts from 'echarts-for-react'
import type { EChartsOption } from 'echarts'
import { cn } from '@/lib/utils'
import { VALE_BRAND } from '@/lib/valeBrand'
import { VALE_VPS } from '@/lib/valeVp'

const LABEL_WIDTH_PX = 156

const VP_COLORS = [
  '#007E7A',
  '#ECB11F',
  '#5B4DB8',
  '#E8873A',
  '#2EC99A',
  '#C94C4C',
  '#3D7EA6',
  '#747678',
] as const

export type ValeCostOverviewStats = {
  totalVisits: number
  cycleLabel: string
  realizedVisits: number
  pendingVisits: number
  visitorCount: number
}

export type ValeVpChartRow = {
  label: string
  count: number
}

/** Overview de visitas do dashboard Vale — números reais, barras por VP e distribuição. */
export function ValeCostOverviewPanel({
  stats,
  vpRows = [],
  className,
}: {
  stats: ValeCostOverviewStats
  vpRows?: ValeVpChartRow[]
  className?: string
}) {
  const [axisTip, setAxisTip] = useState<{
    text: string
    x: number
    y: number
  } | null>(null)

  // Fundo saturado → tipografia clara; amarelo só como acento de destaque.
  const metrics = [
    {
      value: String(stats.totalVisits),
      label: 'Total de visitas do ciclo',
      hint: 'Realizadas + a realizar (sem canceladas)',
      color: VALE_BRAND.white,
    },
    {
      value: String(stats.realizedVisits),
      label: 'Visitas realizadas',
      hint: 'Status concluída',
      color: VALE_BRAND.white,
    },
    {
      value: String(stats.pendingVisits),
      label: 'Visitas a realizar',
      hint: 'Planejamento + em andamento',
      color: VALE_BRAND.yellowBright,
    },
    {
      value: String(stats.visitorCount),
      label: 'Visitantes do ciclo',
      hint: 'Realizadas + a realizar',
      color: VALE_BRAND.white,
    },
  ]

  const chartRows = useMemo(() => {
    const byLabel = new Map(vpRows.map((row) => [row.label, row.count]))
    return VALE_VPS.map((label) => ({
      label,
      count: byLabel.get(label) ?? 0,
    }))
  }, [vpRows])

  const statusDonutOption = useMemo<EChartsOption>(() => {
    const data = [
      {
        name: 'Realizadas',
        value: stats.realizedVisits,
        itemStyle: { color: VALE_BRAND.green },
      },
      {
        name: 'A realizar',
        value: stats.pendingVisits,
        itemStyle: { color: VALE_BRAND.yellow },
      },
    ].filter((item) => item.value > 0)

    return {
      tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
      legend: { bottom: 0, textStyle: { color: '#005F5B' } },
      series: [
        {
          type: 'pie',
          radius: ['48%', '72%'],
          center: ['50%', '45%'],
          avoidLabelOverlap: true,
          itemStyle: { borderRadius: 6, borderColor: '#fff', borderWidth: 2 },
          label: { formatter: '{b}\n{c}', color: '#003D3A' },
          data:
            data.length > 0
              ? data
              : [{ name: 'Sem visitas', value: 1, itemStyle: { color: '#D4D4D4' } }],
        },
      ],
    }
  }, [stats.realizedVisits, stats.pendingVisits])

  const vpBarOption = useMemo<EChartsOption>(() => {
    const rows = [...chartRows].reverse()
    return {
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        formatter: (params: unknown) => {
          const row = Array.isArray(params) ? params[0] : null
          if (!row || typeof row !== 'object') return ''
          const item = row as { name?: string; value?: number }
          return `${item.name ?? ''}<br/>Visitas: <b>${item.value ?? 0}</b>`
        },
      },
      grid: { left: 168, right: 40, top: 8, bottom: 8 },
      xAxis: {
        type: 'value',
        minInterval: 1,
        axisLabel: { color: '#747678', fontSize: 11 },
        splitLine: { lineStyle: { color: 'rgba(0,0,0,0.06)' } },
      },
      yAxis: {
        type: 'category',
        data: rows.map((row) => row.label),
        // Permite hover no rótulo para tooltip do nome completo.
        triggerEvent: true,
        axisLabel: {
          color: '#003D3A',
          fontSize: 11,
          width: LABEL_WIDTH_PX,
          overflow: 'truncate',
          ellipsis: '…',
          // Todos os nomes começam na mesma coluna à esquerda.
          align: 'left',
          margin: 160,
        },
        axisTick: { show: false },
        axisLine: { show: false },
      },
      series: [
        {
          name: 'Visitas por VP',
          type: 'bar',
          data: rows.map((row) => {
            const vpIndex = (VALE_VPS as readonly string[]).indexOf(row.label)
            const color =
              VP_COLORS[vpIndex >= 0 ? vpIndex % VP_COLORS.length : VP_COLORS.length - 1]
            return {
              value: row.count,
              itemStyle: {
                color,
                borderRadius: [0, 8, 8, 0],
              },
            }
          }),
          barMaxWidth: 18,
          label: {
            show: true,
            position: 'right',
            color: '#003D3A',
            fontWeight: 600,
            fontSize: 12,
          },
        },
      ],
    }
  }, [chartRows])

  return (
    <section
      className={cn(
        'overflow-hidden rounded-2xl border border-white/10 bg-[#003D3A] px-5 py-6 text-white sm:px-7 sm:py-8',
        className,
      )}
    >
      <div className="min-w-0 max-w-2xl space-y-2">
        <p className="text-[11px] font-medium tracking-[0.14em] text-white/70 uppercase">
          visitas · ciclo {stats.cycleLabel}
        </p>
        <h2 className="text-2xl font-semibold tracking-tight text-white sm:text-[1.85rem]">
          Operações do ciclo
        </h2>
        <p className="text-sm leading-relaxed text-white/80">
          Indicadores reais das visitas do período — realizadas, a realizar, visitantes
          recebidos e áreas solicitantes.
        </p>
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
            <p className="mt-1 text-sm font-medium text-white">{metric.label}</p>
            <p className="text-xs text-white/70">{metric.hint}</p>
          </div>
        ))}
      </div>

      <div className="mt-10 grid gap-6 lg:grid-cols-5">
        <div className="relative min-w-0 rounded-2xl bg-white px-4 py-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)] sm:px-5 lg:col-span-3">
          <p className="text-sm font-semibold text-[#003D3A]">Visitas por VP / demandante</p>
          <p className="mt-0.5 text-xs text-[#005F5B]/80">
            Quantas visitas cada área solicitou no ciclo {stats.cycleLabel}
          </p>
          <div className="relative" onMouseLeave={() => setAxisTip(null)}>
            <ReactECharts
              option={vpBarOption}
              style={{ height: Math.max(260, chartRows.length * 34 + 24) }}
              opts={{ renderer: 'svg' }}
              onEvents={{
                mouseover: (params: {
                  componentType?: string
                  value?: string | number
                  event?: { offsetX?: number; offsetY?: number }
                }) => {
                  if (params.componentType !== 'yAxis') {
                    setAxisTip(null)
                    return
                  }
                  const text = String(params.value ?? '').trim()
                  if (!text) {
                    setAxisTip(null)
                    return
                  }
                  setAxisTip({
                    text,
                    x: Number(params.event?.offsetX ?? 0) + 12,
                    y: Number(params.event?.offsetY ?? 0) - 8,
                  })
                },
                globalout: () => setAxisTip(null),
              }}
            />
            {axisTip ? (
              <div
                role="tooltip"
                className="pointer-events-none absolute z-20 max-w-[240px] rounded-md bg-neutral-900 px-2.5 py-1.5 text-xs font-medium text-white shadow-lg"
                style={{ left: axisTip.x, top: axisTip.y }}
              >
                {axisTip.text}
              </div>
            ) : null}
          </div>
        </div>

        <div className="min-w-0 rounded-2xl bg-white px-4 py-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)] sm:px-5 lg:col-span-2">
          <p className="text-sm font-semibold text-[#003D3A]">Realizadas × a realizar</p>
          <p className="mt-0.5 text-xs text-[#005F5B]/80">
            Distribuição operacional do ciclo {stats.cycleLabel}
          </p>
          <ReactECharts
            option={statusDonutOption}
            style={{ height: 300 }}
            opts={{ renderer: 'svg' }}
          />
        </div>
      </div>
    </section>
  )
}
