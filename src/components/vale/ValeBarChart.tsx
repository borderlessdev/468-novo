import { useMemo } from 'react'
import ReactECharts from 'echarts-for-react'
import type { EChartsOption } from 'echarts'

export type ValeBarRow = {
  key: string
  /** Texto do eixo (já curto). */
  label: string
  value: number
  color: string
  /** Texto do tooltip (padrão: label). */
  tooltipLabel?: string
}

/** Mistura a cor (#RRGGBB) com branco — usado no começo do degradê das barras. */
function lighten(hex: string, amount: number): string {
  const match = /^#([0-9a-f]{6})$/i.exec(hex)
  if (!match) return hex
  const n = parseInt(match[1], 16)
  const mix = (c: number) => Math.round(c + (255 - c) * amount)
  const r = mix((n >> 16) & 255)
  const g = mix((n >> 8) & 255)
  const b = mix(n & 255)
  return `#${[r, g, b].map((c) => c.toString(16).padStart(2, '0')).join('')}`
}

type Props = {
  /** Folga do eixo além do maior valor (1.08 = barra quase até o fim; 1.4 = barra mais curta). */
  axisHeadroom?: number
  /** Degradê horizontal (mais claro no início da barra). */
  gradient?: boolean
  rows: ValeBarRow[]
  theme?: 'dark' | 'light'
  /** Largura reservada aos nomes (px). */
  labelWidth?: number
  rowHeight?: number
  /** Ex.: (n) => `${n} visitas`. */
  tooltipValue?: (value: number) => string
  onSelect?: (key: string) => void
  className?: string
}

/** Barras horizontais no padrão visual do dashboard Vale (nomes à esquerda, valor na ponta). */
export function ValeBarChart({
  axisHeadroom = 1.08,
  gradient = false,
  rows,
  theme = 'light',
  labelWidth = 120,
  rowHeight = 28,
  tooltipValue = (n) => `${n} visita${n === 1 ? '' : 's'}`,
  onSelect,
  className,
}: Props) {
  const dark = theme === 'dark'
  const labelColor = dark ? '#FFFFFF' : '#0F3D38'
  const valueColor = dark ? '#FFFFFF' : '#0F3D38'

  const option = useMemo<EChartsOption>(() => {
    const byKey = new Map(rows.map((row) => [row.key, row]))
    const max = Math.max(1, ...rows.map((row) => row.value))
    const left = labelWidth + 12
    return {
      animationDuration: 400,
      tooltip: {
        trigger: 'item',
        backgroundColor: '#0B2623',
        borderColor: 'rgba(255,255,255,0.35)',
        borderWidth: 1,
        padding: [6, 10],
        textStyle: { color: '#FFFFFF', fontSize: 12 },
        formatter: (params: unknown) => {
          const key = String((params as { name?: unknown })?.name ?? '')
          const row = byKey.get(key)
          if (!row) return ''
          return `<b>${row.tooltipLabel ?? row.label}</b><br/>${tooltipValue(row.value)}`
        },
      },
      grid: { left, right: 34, top: 2, bottom: 2 },
      xAxis: { type: 'value', show: false, min: 0, max: Math.ceil(max * axisHeadroom) },
      yAxis: {
        type: 'category',
        inverse: true,
        data: rows.map((row) => row.key),
        triggerEvent: Boolean(onSelect),
        axisTick: { show: false },
        axisLine: { show: dark ? true : false, lineStyle: { color: 'rgba(255,255,255,0.35)' } },
        axisLabel: {
          color: labelColor,
          fontSize: 12,
          width: labelWidth,
          overflow: 'truncate',
          ellipsis: '…',
          align: 'left',
          margin: left - 4,
          formatter: (key: string) => byKey.get(key)?.label ?? key,
        },
      },
      series: [
        {
          type: 'bar',
          cursor: onSelect ? 'pointer' : 'default',
          barWidth: Math.max(8, Math.round(rowHeight * 0.5)),
          data: rows.map((row) => ({
            name: row.key,
            value: row.value,
            itemStyle: {
              color: gradient
                ? {
                    type: 'linear' as const,
                    x: 0,
                    y: 0,
                    x2: 1,
                    y2: 0,
                    colorStops: [
                      { offset: 0, color: row.color },
                      { offset: 1, color: lighten(row.color, 0.3) },
                    ],
                  }
                : row.color,
              borderRadius: [0, 6, 6, 0],
            },
          })),
          label: {
            show: true,
            position: 'right',
            color: valueColor,
            fontWeight: 600,
            fontSize: 12,
          },
        },
      ],
    }
  }, [
    rows,
    labelWidth,
    rowHeight,
    dark,
    labelColor,
    valueColor,
    tooltipValue,
    onSelect,
    axisHeadroom,
    gradient,
  ])

  const onEvents = useMemo(
    () => ({
      click: (params: { componentType?: string; name?: string; value?: string | number }) => {
        if (!onSelect) return
        const key =
          params.componentType === 'yAxis' ? String(params.value ?? '') : String(params.name ?? '')
        if (key) onSelect(key)
      },
    }),
    [onSelect],
  )

  return (
    <ReactECharts
      className={className}
      option={option}
      style={{ height: Math.max(rowHeight * rows.length + 8, 60) }}
      opts={{ renderer: 'svg' }}
      onEvents={onEvents}
      notMerge
    />
  )
}
