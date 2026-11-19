import { Coins, DollarSign, FileText, Wallet } from 'lucide-react'
import { cn, formatCurrency } from '@/lib/utils'
import { formatCurrencyCompact } from '@/lib/valeDashboardData'

export type ValeFinanceStats = {
  /** Soma dos valores contratados das visitas do ciclo. */
  contractTotal: number
  /** Soma dos gastos realizados das visitas do ciclo. */
  spendTotal: number
}

const YELLOW = '#F5B82E'

/** Painel financeiro do dashboard Vale — separado dos indicadores de visitas. */
export function ValeFinancePanel({
  stats,
  className,
}: {
  stats: ValeFinanceStats
  className?: string
}) {
  const balance = stats.contractTotal - stats.spendTotal
  const overBudget = balance < 0
  const consumedPct = stats.contractTotal > 0 ? (stats.spendTotal / stats.contractTotal) * 100 : 0

  const tiles = [
    {
      label: 'Valor total do contrato',
      value: formatCurrency(stats.contractTotal),
      icon: FileText,
      iconClass: 'text-[#0E8F7C]',
      valueClass: 'text-[#0F3D38]',
      hint: undefined as string | undefined,
    },
    {
      label: 'Total gasto',
      value: formatCurrency(stats.spendTotal),
      icon: Coins,
      iconClass: 'text-[#D99A0B]',
      valueClass: 'text-[#0F3D38]',
      hint: undefined,
    },
    {
      label: 'Saldo disponível',
      value: formatCurrency(balance),
      icon: Wallet,
      iconClass: overBudget ? 'text-red-600' : 'text-[#0E8F7C]',
      valueClass: overBudget ? 'text-red-600' : 'text-[#0E8F7C]',
      hint: overBudget ? 'Gasto acima do contratado' : undefined,
    },
  ]

  const comparison = [
    // Cores claras: o painel tem fundo verde-escuro.
    { label: 'Contrato', value: stats.contractTotal, color: '#2EC99A' },
    { label: 'Gasto', value: stats.spendTotal, color: YELLOW },
    {
      label: 'Saldo',
      value: balance,
      color: overBudget ? '#F87171' : '#8FE9D6',
    },
  ]
  const comparisonMax = Math.max(1, ...comparison.map((row) => Math.abs(row.value)))

  return (
    <section
      className={cn(
        // @container: layout pela largura do painel (a tela inclui a sidebar).
        // Mesmo fundo do painel "Operações do ciclo".
        '@container overflow-hidden rounded-2xl bg-gradient-to-br from-[#003D3A] via-[#00443F] to-[#005249] px-5 py-6 text-white shadow-sm sm:px-7',
        className,
      )}
    >
      {/* O título fica só na coluna esquerda: a barra vertical sobe até a linha dele e os
          blocos da direita começam no topo, sem aumentar a altura do painel. */}
      <div className="grid gap-5 @min-[56rem]:grid-cols-[1.4fr_1px_1fr] @min-[56rem]:gap-0">
        <div className="min-w-0 @min-[56rem]:pr-6">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#2EC99A] text-[#00443F]">
              <DollarSign className="h-5 w-5" aria-hidden />
            </span>
            <h2 className="text-xl font-semibold tracking-tight text-white">Painel financeiro</h2>
          </div>

          <div className="mt-3 grid gap-3 @min-[34rem]:grid-cols-3">
            {tiles.map((tile) => (
              <div
                key={tile.label}
                className="min-w-0 rounded-2xl bg-white px-4 py-3.5 shadow-[0_1px_2px_rgba(15,23,42,0.05)]"
              >
                <div className="flex items-center gap-2">
                  <tile.icon className={cn('h-6 w-6 shrink-0', tile.iconClass)} aria-hidden />
                  <p className="text-xs leading-tight text-[#4B5B58]">{tile.label}</p>
                </div>
                <p
                  className={cn(
                    'mt-2 whitespace-nowrap text-lg font-bold tracking-tight tabular-nums @min-[70rem]:text-xl',
                    tile.valueClass,
                  )}
                >
                  {tile.value}
                </p>
                {tile.hint ? (
                  <p className="text-[11px] font-medium text-red-600">{tile.hint}</p>
                ) : null}
              </div>
            ))}
          </div>
        </div>

        {/* Barra vertical de 1px (horizontal quando empilhado). */}
        <div
          aria-hidden
          className="h-px w-full bg-white/55 @min-[56rem]:h-auto @min-[56rem]:w-px"
        />

        <div className="space-y-5 @min-[56rem]:pl-6">
          <div>
            <p className="text-sm font-semibold text-white">Contrato consumido</p>
            <div className="mt-2 flex items-center gap-4">
              <div className="h-3 flex-1 overflow-hidden rounded-full bg-white/20">
                <div
                  className={cn('h-full rounded-full', overBudget ? 'bg-red-400' : 'bg-[#2EC99A]')}
                  style={{ width: `${Math.min(consumedPct, 100)}%` }}
                />
              </div>
              <span
                className={cn(
                  'w-16 text-right text-2xl font-bold tabular-nums',
                  overBudget ? 'text-red-300' : 'text-white',
                )}
              >
                {stats.contractTotal > 0 ? `${Math.round(consumedPct)}%` : '—'}
              </span>
            </div>
            {stats.contractTotal === 0 ? (
              <p className="mt-1 text-xs text-white/70">
                Nenhum valor contratado lançado nas visitas do ciclo.
              </p>
            ) : null}
          </div>

          <div>
            <p className="text-sm font-semibold text-white">Contrato × Gasto × Saldo</p>
            <div className="mt-2 space-y-2">
              {comparison.map((row) => (
                <div key={row.label} className="flex items-center gap-3 text-xs">
                  <span className="w-14 shrink-0 text-white">{row.label}</span>
                  <div className="h-2.5 flex-1">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${Math.max((Math.abs(row.value) / comparisonMax) * 100, row.value !== 0 ? 2 : 0)}%`,
                        backgroundColor: row.color,
                      }}
                    />
                  </div>
                  <span
                    className={cn(
                      'w-20 shrink-0 text-right tabular-nums text-white',
                      row.label === 'Saldo' && overBudget && 'font-semibold text-red-300',
                    )}
                  >
                    {formatCurrencyCompact(row.value)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
