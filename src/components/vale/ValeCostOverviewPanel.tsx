import { useMemo, useState } from 'react'
import ReactECharts from 'echarts-for-react'
import type { EChartsOption } from 'echarts'
import { cn, formatCurrency } from '@/lib/utils'
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
  /** Soma dos valores contratados (serviceValue) no ciclo. */
  contractTotal?: number
  /** Soma dos gastos realizados no ciclo. */
  spendTotal?: number
}

export type ValeVpChartRow = {
  label: string
  count: number
}

/** Overview do dashboard Vale — números reais + barras por VP. */
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
    {
      value: String(stats.totalVisits),
      label: 'Total operacional',
      hint: 'Sem canceladas',
      color: VALE_BRAND.white,
    },
  ]

  const chartRows = useMemo(() => {
    // TODO: remover mocks locais após validar o layout do gráfico.
    const MOCK_VP_COUNTS: Record<string, number> = {
      'VP - Sustentabilidade': 8,
      'VP - Comercial Novos Neg.': 14,
      'VP - Pessoas': 5,
      'VP - Assuntos Jurídicos': 3,
      'VP - Operações': 18,
      'VP - Finanças e RI': 7,
      'VP - Técnica': 11,
    }
    const useMock = import.meta.env.DEV
    const byLabel = new Map(vpRows.map((row) => [row.label, row.count]))
    return VALE_VPS.map((label) => ({
      label,
      count: useMock ? (MOCK_VP_COUNTS[label] ?? 0) : (byLabel.get(label) ?? 0),
    }))
  }, [vpRows])

  // TODO: remover mocks financeiros locais após validar o layout.
  const financeValues = useMemo(() => {
    if (import.meta.env.DEV) {
      return {
        contractTotal: 285_000,
        spendTotal: 192_400,
      }
    }
    return {
      contractTotal: stats.contractTotal ?? 0,
      spendTotal: stats.spendTotal ?? 0,
    }
  }, [stats.contractTotal, stats.spendTotal])

  const moneyBarOption = useMemo<EChartsOption>(() => {
    const rows = [
      {
        label: 'Valor do contrato',
        value: financeValues.contractTotal,
        color: VALE_BRAND.green,
      },
      {
        label: 'Gasto no ciclo',
        value: financeValues.spendTotal,
        color: VALE_BRAND.yellow,
      },
    ].reverse()

    return {
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        formatter: (params: unknown) => {
          const row = Array.isArray(params) ? params[0] : null
          if (!row || typeof row !== 'object') return ''
          const item = row as { name?: string; value?: number }
          return `${item.name ?? ''}<br/><b>${formatCurrency(item.value ?? 0)}</b>`
        },
      },
      grid: { left: 120, right: 72, top: 8, bottom: 8 },
      xAxis: {
        type: 'value',
        axisLabel: {
          color: '#747678',
          fontSize: 10,
          formatter: (value: number) =>
            value >= 1000 ? `${Math.round(value / 1000)}k` : String(value),
        },
        splitLine: { lineStyle: { color: 'rgba(0,0,0,0.06)' } },
      },
      yAxis: {
        type: 'category',
        data: rows.map((row) => row.label),
        axisLabel: {
          color: '#003D3A',
          fontSize: 11,
          width: 110,
          overflow: 'truncate',
          align: 'left',
          margin: 112,
        },
        axisTick: { show: false },
        axisLine: { show: false },
      },
      series: [
        {
          type: 'bar',
          data: rows.map((row) => ({
            value: row.value,
            itemStyle: { color: row.color, borderRadius: [0, 8, 8, 0] },
          })),
          barMaxWidth: 28,
          label: {
            show: true,
            position: 'right',
            color: '#003D3A',
            fontWeight: 600,
            fontSize: 11,
            formatter: (params: { value?: number }) =>
              formatCurrency(Number(params.value ?? 0)),
          },
        },
      ],
    }
  }, [financeValues])

  const contractGaugeOption = useMemo<EChartsOption>(() => {
    const max = Math.max(financeValues.contractTotal, financeValues.spendTotal, 1)
    return {
      series: [
        {
          type: 'gauge',
          startAngle: 180,
          endAngle: 0,
          min: 0,
          max,
          radius: '100%',
          center: ['50%', '70%'],
          progress: { show: true, width: 14, itemStyle: { color: VALE_BRAND.green } },
          axisLine: { lineStyle: { width: 14, color: [[1, 'rgba(0,0,0,0.08)']] } },
          pointer: { show: false },
          axisTick: { show: false },
          splitLine: { show: false },
          axisLabel: { show: false },
          detail: {
            valueAnimation: true,
            offsetCenter: [0, '-10%'],
            fontSize: 18,
            fontWeight: 700,
            color: VALE_BRAND.greenDeep,
            formatter: (value: number) => formatCurrency(value),
          },
          data: [{ value: financeValues.contractTotal }],
        },
      ],
    }
  }, [financeValues])

  const spendGaugeOption = useMemo<EChartsOption>(() => {
    const max = Math.max(financeValues.contractTotal, financeValues.spendTotal, 1)
    return {
      series: [
        {
          type: 'gauge',
          startAngle: 180,
          endAngle: 0,
          min: 0,
          max,
          radius: '100%',
          center: ['50%', '70%'],
          progress: { show: true, width: 14, itemStyle: { color: VALE_BRAND.yellow } },
          axisLine: { lineStyle: { width: 14, color: [[1, 'rgba(0,0,0,0.08)']] } },
          pointer: { show: false },
          axisTick: { show: false },
          splitLine: { show: false },
          axisLabel: { show: false },
          detail: {
            valueAnimation: true,
            offsetCenter: [0, '-10%'],
            fontSize: 18,
            fontWeight: 700,
            color: '#8A6500',
            formatter: (value: number) => formatCurrency(value),
          },
          data: [{ value: financeValues.spendTotal }],
        },
      ],
    }
  }, [financeValues])

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
          overview · ciclo {stats.cycleLabel}
        </p>
        <h2 className="text-2xl font-semibold tracking-tight text-white sm:text-[1.85rem]">
          Operações do ciclo
        </h2>
        <p className="text-sm leading-relaxed text-white/80">
          Indicadores reais das visitas do período — realizadas, a realizar e visitantes
          vinculados.
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

      <div className="mt-10 grid gap-6 lg:grid-cols-2">
        <div className="relative min-w-0 rounded-2xl bg-white px-4 py-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)] sm:px-5">
          <p className="text-sm font-semibold text-[#003D3A]">Visitas por VP</p>
          <p className="mt-0.5 text-xs text-[#005F5B]/80">
            Totais por vice-presidência no ciclo {stats.cycleLabel}
          </p>
          <div
            className="relative"
            onMouseLeave={() => setAxisTip(null)}
          >
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

        <div className="min-w-0 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl bg-white px-4 py-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
              <p className="text-sm font-semibold text-[#003D3A]">
                Total do valor do contrato
              </p>
              <p className="mt-0.5 text-xs text-[#005F5B]/80">Contratado no ciclo</p>
              <ReactECharts
                option={contractGaugeOption}
                style={{ height: 140 }}
                opts={{ renderer: 'svg' }}
              />
            </div>
            <div className="rounded-2xl bg-white px-4 py-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
              <p className="text-sm font-semibold text-[#003D3A]">Total gasto no ciclo</p>
              <p className="mt-0.5 text-xs text-[#005F5B]/80">Realizado / pago</p>
              <ReactECharts
                option={spendGaugeOption}
                style={{ height: 140 }}
                opts={{ renderer: 'svg' }}
              />
            </div>
          </div>
          <div className="rounded-2xl bg-white px-4 py-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
            <p className="text-sm font-semibold text-[#003D3A]">Contrato × gasto</p>
            <p className="mt-0.5 text-xs text-[#005F5B]/80">
              Comparativo financeiro do ciclo {stats.cycleLabel}
            </p>
            <ReactECharts
              option={moneyBarOption}
              style={{ height: 140 }}
              opts={{ renderer: 'svg' }}
            />
          </div>
        </div>
      </div>
    </section>
  )
}
