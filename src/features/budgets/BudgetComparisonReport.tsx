import { useEffect, useMemo, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { getRealizedValue } from '@/lib/financeMetrics'
import { formatCurrency } from '@/lib/utils'
import { listBudgetItemsByOrg } from '@/services/budgets'
import type { BudgetItem, FinanceItem, Visit } from '@/types'

function textMoney(value: number | null): string {
  if (value == null) return '—'
  return formatCurrency(value)
}

function percent(orcado: number, realizado: number | null): string {
  if (realizado == null || orcado === 0) return '—'
  const value = ((realizado - orcado) / orcado) * 100
  return `${value.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`
}

export function BudgetComparisonReport({
  orgId,
  visits,
  financeItems,
}: {
  orgId: string
  visits: Visit[]
  financeItems: FinanceItem[]
}) {
  const [items, setItems] = useState<BudgetItem[]>([])
  const [visitId, setVisitId] = useState('todas')

  useEffect(() => {
    let cancelled = false
    void listBudgetItemsByOrg(orgId)
      .then((next) => {
        if (!cancelled) setItems(next.filter((item) => item.budgetStatus === 'published'))
      })
      .catch((error) => console.error(error))
    return () => {
      cancelled = true
    }
  }, [orgId])

  const financeById = useMemo(
    () => new Map(financeItems.map((item) => [item.id, item])),
    [financeItems],
  )

  const rows = useMemo(() => {
    return items
      .filter((item) => visitId === 'todas' || item.visitId === visitId)
      .map((item) => {
        const finance = item.financeItemId ? financeById.get(item.financeItemId) : undefined
        const orcado = item.lineAmount
        const aprovado = item.decision === 'approved' ? item.lineAmount : null
        const realizado = finance ? (getRealizedValue(finance) ?? null) : null
        return {
          item,
          orcado,
          aprovado,
          realizado,
          diferenca: realizado == null ? null : realizado - orcado,
        }
      })
  }, [items, visitId, financeById])

  const totals = useMemo(() => {
    const orcado = rows.reduce((sum, row) => sum + row.orcado, 0)
    const realizedRows = rows.filter((row) => row.realizado != null)
    return {
      orcado: rows.length === 0 ? null : orcado,
      aprovado: rows.length === 0
        ? null
        : rows.reduce((sum, row) => sum + (row.aprovado ?? 0), 0),
      realizado: realizedRows.length > 0
        ? realizedRows.reduce((sum, row) => sum + (row.realizado ?? 0), 0)
        : null,
    }
  }, [rows])

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle>Orçado x executado</CardTitle>
        <CardDescription>
          Compara a estimativa publicada ao cliente com o gasto realizado no Financeiro.
          Cotações de fornecedores não entram como despesa.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Select value={visitId} onValueChange={setVisitId}>
          <SelectTrigger className="sm:w-72"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Todas as visitas</SelectItem>
            {visits.map((visit) => (
              <SelectItem key={visit.id} value={visit.id}>{visit.title}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="grid gap-3 sm:grid-cols-3">
          <p className="text-sm">Orçado: <strong>{textMoney(totals.orcado)}</strong></p>
          <p className="text-sm">Aprovado: <strong>{textMoney(totals.aprovado)}</strong></p>
          <p className="text-sm">Realizado: <strong>{textMoney(totals.realizado)}</strong></p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="py-2 pr-3 font-medium">Visita</th>
                <th className="py-2 pr-3 font-medium">Item</th>
                <th className="py-2 pr-3 font-medium">Situação</th>
                <th className="py-2 pr-3 font-medium">Orçado</th>
                <th className="py-2 pr-3 font-medium">Aprovado</th>
                <th className="py-2 pr-3 font-medium">Realizado</th>
                <th className="py-2 pr-3 font-medium">Diferença</th>
                <th className="py-2 font-medium">%</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td className="py-4 text-muted-foreground" colSpan={8}>Nenhum item publicado neste filtro.</td>
                </tr>
              ) : rows.map((row) => (
                <tr key={row.item.id} className="border-b">
                  <td className="py-2 pr-3">{visits.find((visit) => visit.id === row.item.visitId)?.title ?? 'Visita'}</td>
                  <td className="py-2 pr-3">{row.item.description}</td>
                  <td className="py-2 pr-3">
                    {row.item.decision === 'approved'
                      ? 'Aprovado'
                      : row.item.decision === 'rejected'
                        ? 'Rejeitado'
                        : row.item.decision === 'changes_requested'
                          ? 'Mudanças solicitadas'
                          : 'Pendente'}
                  </td>
                  <td className="py-2 pr-3">{textMoney(row.orcado)}</td>
                  <td className="py-2 pr-3">{textMoney(row.aprovado)}</td>
                  <td className="py-2 pr-3">{textMoney(row.realizado)}</td>
                  <td className="py-2 pr-3">{textMoney(row.diferenca)}</td>
                  <td className="py-2">{percent(row.orcado, row.realizado)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  )
}
