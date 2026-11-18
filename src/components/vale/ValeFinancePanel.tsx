import { useMemo } from 'react'
import ReactECharts from 'echarts-for-react'
import type { EChartsOption } from 'echarts'
import { Landmark, PiggyBank, Wallet } from 'lucide-react'
import { cn, formatCurrency } from '@/lib/utils'
import { VALE_BRAND } from '@/lib/valeBrand'

export type ValeFinanceStats = {
  cycleLabel: string
  /** Soma dos valores contratados (serviceValue) das visitas do ciclo. */
  contractTotal: number
  /** Soma dos gastos realizados das visitas do ciclo. */
  spendTotal: number
}

/** Área financeira do dashboard Vale — separada dos indicadores de visitas. */
export function ValeFinancePanel({
  stats,
  className,
}: {
  stats: ValeFinanceStats
  className?: string
}) {
  const balance = stats.contractTotal - stats.spendTotal
  const consumedPct =
    stats.contractTotal > 0 ? (stats.spendTotal / stats.contractTotal) * 100 : 0
  const overBudget = balance < 0

  const tiles = [
    {
      label: 'Valor total do contrato',
      hint: 'Contratado nas visitas do ciclo',
      value: formatCurrency(stats.contractTotal),
      icon: Landmark,
      tone: 'bg-[#007E7A]/12 text-[#005F5B]',
      valueClass: 'text-[#003D3A]',
    },
    {
      label: 'Total gasto no ciclo',
      hint: 'Realizado / pago',
      value: formatCurrency(stats.spendTotal),
      icon: Wallet,
      tone: 'bg-[#ECB11F]/20 text-[#8A6500]',
      valueClass: 'text-[#8A6500]',
    },
    {
      label: 'Saldo disponível do contrato',
      hint: overBudget ? 'Gasto acima do contratado' : 'Contratado − gasto',
      value: formatCurrency(balance),
      icon: PiggyBank,
      tone: overBudget ? 'bg-red-500/10 text-red-700' : 'bg-[#007E7A]/12 text-[#005F5B]',
      valueClass: overBudget ? 'text-red-700' : 'text-[#005F5B]',
    },
  ]

  const barOption = useMemo<EChartsOption>(() => {
    const rows = [
      { label: 'Valor do contrato', value: stats.contractTotal, color: VALE_BRAND.green },
      { label: 'Gasto no ciclo', value: stats.spendTotal, color: VALE_BRAND.yellow },
      {
        label: 'Saldo disponível',
        value: balance,
        color: overBudget ? '#C94C4C' : VALE_BRAND.greenDark,
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
      grid: { left: 130, right: 90, top: 8, bottom: 8 },
      xAxis: {
        type: 'value',
        axisLabel: {
          color: '#747678',
          fontSize: 10,
          formatter: (value: unknown) => {
            const n = Number(value)
            return Math.abs(n) >= 1000 ? `${Math.round(n / 1000)}k` : String(n)
          },
        },
        splitLine: { lineStyle: { color: 'rgba(0,0,0,0.06)' } },
      },
      yAxis: {
        type: 'category',
        data: rows.map((row) => row.label),
        axisLabel: {
          color: '#003D3A',
          fontSize: 11,
          width: 120,
          overflow: 'truncate',
          align: 'left',
          margin: 122,
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
          barMaxWidth: 26,
          label: {
            show: true,
            position: 'right',
            color: '#003D3A',
            fontWeight: 600,
            fontSize: 11,
            formatter: (params: unknown) => {
              const raw = (params as { value?: unknown } | null)?.value
              return formatCurrency(Number(raw ?? 0))
            },
          },
        },
      ],
    }
  }, [stats.contractTotal, stats.spendTotal, balance, overBudget])

  return (
    <section
      className={cn(
        'rounded-2xl border border-[#007E7A]/20 bg-[#F4F8F7] px-5 py-6 sm:px-7 sm:py-8',
        className,
      )}
    >
      <div className="min-w-0 max-w-2xl space-y-2">
        <p className="text-[11px] font-medium tracking-[0.14em] text-[#005F5B] uppercase">
          financeiro · ciclo {stats.cycleLabel}
        </p>
        <h2 className="text-2xl font-semibold tracking-tight text-[#003D3A] sm:text-[1.85rem]">
          Contrato e gastos do ciclo
        </h2>
        <p className="text-sm leading-relaxed text-[#005F5B]/85">
          Quanto do contrato já foi consumido e quanto ainda está disponível.
        </p>
      </div>

      <div className="mt-8 grid gap-4 md:grid-cols-3">
        {tiles.map((tile) => (
          <div
            key={tile.label}
            className="rounded-2xl bg-white px-4 py-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)]"
          >
            <div className="flex items-start justify-between gap-3">
              <p className="text-sm font-medium text-[#003D3A]">{tile.label}</p>
              <span
                className={cn(
                  'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
                  tile.tone,
                )}
              >
                <tile.icon className="h-4 w-4" />
              </span>
            </div>
            <p
              className={cn(
                'mt-3 text-2xl font-semibold tracking-tight tabular-nums sm:text-3xl',
                tile.valueClass,
              )}
            >
              {tile.value}
            </p>
            <p className="mt-1 text-xs text-[#005F5B]/80">{tile.hint}</p>
          </div>
        ))}
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-5">
        <div className="rounded-2xl bg-white px-4 py-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)] lg:col-span-2">
          <p className="text-sm font-semibold text-[#003D3A]">Contrato consumido</p>
          <p className="mt-0.5 text-xs text-[#005F5B]/80">Percentual do valor contratado já gasto</p>
          <p
            className={cn(
              'mt-4 text-4xl font-semibold tabular-nums',
              overBudget ? 'text-red-700' : 'text-[#003D3A]',
            )}
          >
            {stats.contractTotal > 0 ? `${consumedPct.toFixed(1)}%` : '—'}
          </p>
          <div className="mt-3 h-3 w-full overflow-hidden rounded-full bg-[#007E7A]/12">
            <div
              className={cn('h-full rounded-full', overBudget ? 'bg-red-500' : 'bg-[#007E7A]')}
              style={{ width: `${Math.min(consumedPct, 100)}%` }}
            />
          </div>
          {stats.contractTotal === 0 ? (
            <p className="mt-3 text-xs text-[#005F5B]/80">
              Nenhum valor contratado lançado nas visitas do ciclo.
            </p>
          ) : null}
        </div>

        <div className="rounded-2xl bg-white px-4 py-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)] lg:col-span-3">
          <p className="text-sm font-semibold text-[#003D3A]">Contrato × gasto × saldo</p>
          <p className="mt-0.5 text-xs text-[#005F5B]/80">
            Comparativo financeiro do ciclo {stats.cycleLabel}
          </p>
          <ReactECharts option={barOption} style={{ height: 170 }} opts={{ renderer: 'svg' }} />
        </div>
      </div>
    </section>
  )
}
