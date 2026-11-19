import { useMemo, useState, type ReactNode } from 'react'
import ReactECharts from 'echarts-for-react'
import type { EChartsOption } from 'echarts'
import { CalendarDays, Maximize2, MapPin, Users } from 'lucide-react'
import { ValeBarChart, type ValeBarRow } from '@/components/vale/ValeBarChart'
import { Card } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  NO_STATE_LABEL,
  NO_VP_LABEL,
  shortVpLabel,
  type CountRow,
  type MonthRow,
} from '@/lib/valeDashboardData'

const STATE_COLOR = '#1CAF94'
const STATE_COLOR_TOP = '#0B6F5E'
const VP_COLOR = '#F5B82E'
const MUTED_COLOR = '#94A3B8'

type Props = {
  stateRows: CountRow[]
  vpRows: CountRow[]
  monthRows: MonthRow[]
  /** Recebe todas as chaves originais da linha (várias em "Outros"). */
  onSelectStates: (keys: string[]) => void
  onSelectVps: (keys: string[]) => void
  onSelectMonth: (key: string) => void
}

function CardTitleRow({
  icon: Icon,
  title,
  action,
}: {
  icon: typeof MapPin
  title: string
  /** Controle no fim da linha (ex.: ícone de tela cheia). */
  action?: ReactNode
}) {
  return (
    <div className="mb-3 flex items-center gap-2">
      <Icon className="h-4 w-4 shrink-0 text-[#005F5B]" aria-hidden />
      <h3 className="min-w-0 flex-1 truncate text-sm font-semibold text-[#0F3D38]">{title}</h3>
      {action}
    </div>
  )
}

/** Segunda linha do dashboard: visitas por estado, por demandante (todos listados) e por mês. */
export function ValeBreakdownCards({
  stateRows,
  vpRows,
  monthRows,
  onSelectStates,
  onSelectVps,
  onSelectMonth,
}: Props) {
  const stateChartRows = useMemo(() => {
    // Lista todos os estados, mesmo sem visitas (as linhas já vêm ordenadas).
    const rows: (ValeBarRow & { memberKeys: string[] })[] = stateRows.map((row, index) => ({
      key: row.key,
      label: row.label,
      value: row.count,
      memberKeys: [row.key],
      color:
        row.key === NO_STATE_LABEL ? MUTED_COLOR : index === 0 ? STATE_COLOR_TOP : STATE_COLOR,
      tooltipLabel: row.label,
    }))
    return rows
  }, [stateRows])

  const vpChartRows = useMemo(() => {
    // Lista todos os demandantes, mesmo sem visitas.
    const rows: (ValeBarRow & { memberKeys: string[] })[] = vpRows.map((row) => ({
      key: row.key,
      label: shortVpLabel(row.label),
      value: row.count,
      memberKeys: [row.key],
      color: row.key === NO_VP_LABEL ? MUTED_COLOR : VP_COLOR,
      tooltipLabel: row.label,
    }))
    return rows
  }, [vpRows])

  const monthOption = useMemo<EChartsOption>(() => {
    const byKey = new Map(monthRows.map((row) => [row.key, row]))
    return {
      tooltip: {
        trigger: 'axis',
        backgroundColor: '#0B2623',
        borderColor: 'rgba(255,255,255,0.35)',
        textStyle: { color: '#FFFFFF', fontSize: 12 },
        formatter: (params: unknown) => {
          const first = Array.isArray(params) ? params[0] : null
          const key = String((first as { name?: unknown } | null)?.name ?? '')
          const row = byKey.get(key)
          if (!row) return ''
          return `<b>${row.label}</b><br/>${row.count} visita${row.count === 1 ? '' : 's'}`
        },
      },
      grid: { left: 36, right: 16, top: 16, bottom: 28 },
      xAxis: {
        type: 'category',
        boundaryGap: false,
        data: monthRows.map((row) => row.key),
        axisTick: { show: false },
        axisLine: { lineStyle: { color: '#D5DDDB' } },
        axisLabel: {
          color: '#4B5B58',
          fontSize: 11,
          formatter: (key: string) => byKey.get(key)?.label ?? key,
        },
      },
      yAxis: {
        type: 'value',
        minInterval: 1,
        min: 0,
        axisLabel: { color: '#4B5B58', fontSize: 11 },
        splitLine: { lineStyle: { color: 'rgba(0,0,0,0.07)' } },
      },
      series: [
        {
          type: 'line',
          smooth: true,
          symbol: 'circle',
          symbolSize: 7,
          cursor: 'pointer',
          lineStyle: { color: '#0E8F7C', width: 2.5 },
          itemStyle: { color: '#0E8F7C', borderColor: '#FFFFFF', borderWidth: 2 },
          areaStyle: {
            color: {
              type: 'linear',
              x: 0,
              y: 0,
              x2: 0,
              y2: 1,
              colorStops: [
                { offset: 0, color: 'rgba(14,143,124,0.30)' },
                { offset: 1, color: 'rgba(14,143,124,0.02)' },
              ],
            },
          },
          data: monthRows.map((row) => ({ name: row.key, value: row.count })),
        },
      ],
    }
  }, [monthRows])

  const monthEvents = useMemo(
    () => ({
      click: (params: { name?: string }) => {
        if (params.name) onSelectMonth(params.name)
      },
    }),
    [onSelectMonth],
  )

  const [statesFullscreen, setStatesFullscreen] = useState(false)

  // Recolhido: só os maiores, no máximo a mesma quantidade de linhas de "Visitas por demandante".
  const visibleStateRows = stateChartRows.slice(0, Math.max(vpChartRows.length, 1))

  const stateByKey = new Map(stateChartRows.map((row) => [row.key, row]))
  const vpByKey = new Map(vpChartRows.map((row) => [row.key, row]))

  return (
    <div className="grid gap-4 lg:grid-cols-5">
      <Card className="border-slate-200 bg-white p-5 text-[#0F3D38] lg:col-span-3">
        <div className="grid gap-6 sm:grid-cols-2 sm:gap-0">
          <div className="min-w-0 sm:pr-5">
            <CardTitleRow
              icon={MapPin}
              title="Total de visitas por Estado"
              action={
                <button
                  type="button"
                  onClick={() => setStatesFullscreen(true)}
                  aria-label="Abrir todos os estados em tela cheia"
                  title="Ver todos os estados"
                  className="shrink-0 rounded-md p-1 text-[#0F3D38] transition-colors hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0E8F7C]"
                >
                  <Maximize2 className="h-4 w-4" aria-hidden />
                </button>
              }
            />
            {stateChartRows.length === 0 ? (
              <p className="py-8 text-center text-sm text-[#4B5B58]">
                Nenhuma visita no ciclo.
              </p>
            ) : (
              <ValeBarChart
                rows={visibleStateRows}
                labelWidth={90}
                onSelect={(key) => {
                  const row = stateByKey.get(key)
                  if (row) onSelectStates(row.memberKeys)
                }}
              />
            )}
          </div>

          <div className="min-w-0 sm:border-l sm:border-slate-200 sm:pl-5">
            <CardTitleRow icon={Users} title="Visitas por demandante" />
            {vpChartRows.length === 0 ? (
              <p className="py-8 text-center text-sm text-[#4B5B58]">
                Nenhuma visita no ciclo.
              </p>
            ) : (
              <ValeBarChart
                rows={vpChartRows}
                labelWidth={130}
                onSelect={(key) => {
                  const row = vpByKey.get(key)
                  if (row) onSelectVps(row.memberKeys)
                }}
              />
            )}
          </div>
        </div>
      </Card>

      <Card className="border-slate-200 bg-white p-5 text-[#0F3D38] lg:col-span-2">
        <div className="mb-2 flex items-center gap-2">
          <CalendarDays className="h-4 w-4 text-[#005F5B]" aria-hidden />
          <h3 className="text-sm font-semibold text-[#0F3D38]">Visitas por mês</h3>
        </div>
        <ReactECharts
          option={monthOption}
          style={{ height: 250 }}
          opts={{ renderer: 'svg' }}
          onEvents={monthEvents}
          notMerge
        />
      </Card>

      <Dialog open={statesFullscreen} onOpenChange={setStatesFullscreen}>
        {/* Fundo claro fixo: o gráfico usa cores escuras de texto. */}
        <DialogContent
          className="max-w-3xl bg-white text-[#0F3D38]"
          closeClassName="bg-red-600 text-white opacity-100 hover:bg-red-700"
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-[#0F3D38]">
              <MapPin className="h-5 w-5 text-[#005F5B]" aria-hidden />
              Total de visitas por Estado
            </DialogTitle>
            <DialogDescription className="text-[#4B5B58]">
              Todos os estados, inclusive os sem visitas no ciclo. Clique numa barra para ver as
              visitas.
            </DialogDescription>
          </DialogHeader>
          <ValeBarChart
            rows={stateChartRows}
            labelWidth={70}
            rowHeight={34}
            onSelect={(key) => {
              const row = stateByKey.get(key)
              if (!row) return
              setStatesFullscreen(false)
              onSelectStates(row.memberKeys)
            }}
          />
        </DialogContent>
      </Dialog>
    </div>
  )
}
