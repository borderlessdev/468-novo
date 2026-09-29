import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { Download, Loader2, Plus, Trash2, Wallet } from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { ConfirmDeleteDialog, useConfirmDelete } from '@/components/shared/ConfirmDeleteDialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useAuth } from '@/contexts/AuthContext'
import { useOrg } from '@/contexts/OrgContext'
import { canAccessRevenue } from '@/lib/access'
import { cn } from '@/lib/utils'
import {
  FINANCE_COST_CATEGORY_LABEL,
  REVENUE_NATURE_LABEL,
  REVENUE_SOURCE_LABEL,
} from '@/lib/revenueLabels'
import {
  getApprovedCostAmount,
  resolveCostCategory,
  revenueBalance,
  sumApprovedCosts,
  sumRevenue,
} from '@/lib/revenueMetrics'
import { visitEventKindLabel, visitEventLabel } from '@/lib/visitEvent'
import {
  formatCurrency,
  formatCurrencyInput,
  formatCurrencyNumber,
  formatDate,
  parseCurrencyInput,
} from '@/lib/utils'
import { exportTable } from '@/lib/export'
import { revenueItemSchema, type RevenueItemInput } from '@/lib/validations'
import { listFinanceItemsByOwner } from '@/services/finance'
import {
  createRevenueItem,
  deleteRevenueItem,
  listRevenueItemsByOwner,
  updateRevenueItem,
} from '@/services/revenue'
import { listVisits, updateVisit } from '@/services/visits'
import type {
  FinanceCostCategory,
  FinanceItem,
  RevenueItem,
  RevenueNatureType,
  RevenueSourceType,
  RevenueTicketSaleDay,
  Visit,
} from '@/types'

type MainTab = 'lancamentos' | 'ingressos' | 'relatorios'
type TicketDraft = { date: string; amount: string; quantity: string; notes: string }

const emptyTicket = (): TicketDraft => ({
  date: '',
  amount: '',
  quantity: '',
  notes: '',
})

export function RevenuePage() {
  const { user, isPlatformAdmin, profile } = useAuth()
  const { activeOrgId } = useOrg()
  const [searchParams, setSearchParams] = useSearchParams()
  const allowed = canAccessRevenue(isPlatformAdmin, profile?.modulePermissions)

  const [tab, setTab] = useState<MainTab>('lancamentos')
  const [visits, setVisits] = useState<Visit[]>([])
  const [revenues, setRevenues] = useState<RevenueItem[]>([])
  const [financeItems, setFinanceItems] = useState<FinanceItem[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<RevenueItem | null>(null)
  const [ticketDrafts, setTicketDrafts] = useState<TicketDraft[]>([])
  const [filterVisitId, setFilterVisitId] = useState(searchParams.get('visita') ?? 'all')
  const [periodStart, setPeriodStart] = useState('')
  const [periodEnd, setPeriodEnd] = useState('')
  const [reportVisitId, setReportVisitId] = useState('all')
  const deleteDialog = useConfirmDelete<{ id: string; name: string }>()

  const form = useForm<RevenueItemInput>({
    resolver: zodResolver(revenueItemSchema),
    defaultValues: {
      visitId: '',
      sourceType: 'recursos_proprios',
      natureType: 'centro_custos',
      natureLabel: '',
      entryDate: new Date().toISOString().slice(0, 10),
      amount: '',
      notes: '',
    },
  })

  const watchedVisitId = form.watch('visitId')
  const watchedSource = form.watch('sourceType')
  const selectedVisit = visits.find((v) => v.id === watchedVisitId)
  const ticketsEnabled =
    watchedSource === 'ingressos' && selectedVisit?.hasTicketSales === true

  const load = useCallback(async () => {
    if (!user || !activeOrgId || !allowed) return
    setLoading(true)
    try {
      const visitsData = await listVisits(
        activeOrgId,
        user.uid,
        isPlatformAdmin,
        profile?.role ?? 'user',
      )
      const activeVisits = visitsData.filter((v) => !v.isTemplate)
      const [rev, fin] = await Promise.all([
        listRevenueItemsByOwner(
          activeOrgId,
          user.uid,
          isPlatformAdmin,
          profile?.role ?? 'user',
          activeVisits,
        ),
        listFinanceItemsByOwner(
          activeOrgId,
          user.uid,
          isPlatformAdmin,
          profile?.role ?? 'user',
          activeVisits,
        ),
      ])
      setVisits(activeVisits)
      setRevenues(rev)
      setFinanceItems(fin)
    } catch {
      toast.error('Erro ao carregar gestão de receitas')
    } finally {
      setLoading(false)
    }
  }, [user, activeOrgId, allowed, isPlatformAdmin, profile?.role])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    const visita = searchParams.get('visita')
    if (visita) setFilterVisitId(visita)
  }, [searchParams])

  const filteredRevenues = useMemo(() => {
    return revenues.filter((item) => {
      if (filterVisitId !== 'all' && item.visitId !== filterVisitId) return false
      if (periodStart && item.entryDate < periodStart) return false
      if (periodEnd && item.entryDate > periodEnd) return false
      return true
    })
  }, [revenues, filterVisitId, periodStart, periodEnd])

  const costsForFilter = useMemo(() => {
    if (filterVisitId !== 'all') {
      return financeItems.filter((f) => f.visitId === filterVisitId)
    }
    if (periodStart || periodEnd) {
      return financeItems.filter((f) => {
        const visit = visits.find((v) => v.id === f.visitId)
        if (!visit) return false
        if (periodEnd && visit.startDate > periodEnd) return false
        if (periodStart && visit.endDate < periodStart) return false
        return true
      })
    }
    return financeItems
  }, [financeItems, filterVisitId, periodStart, periodEnd, visits])

  const totals = useMemo(() => {
    const receita = sumRevenue(filteredRevenues)
    const custos = sumApprovedCosts(costsForFilter)
    return { receita, custos, saldo: receita - custos }
  }, [filteredRevenues, costsForFilter])

  const visitTitle = useCallback(
    (visitId: string) => visits.find((v) => v.id === visitId)?.title ?? 'Visita',
    [visits],
  )

  function openCreate() {
    setEditing(null)
    form.reset({
      visitId: filterVisitId !== 'all' ? filterVisitId : '',
      sourceType: 'recursos_proprios',
      natureType: 'centro_custos',
      natureLabel: '',
      entryDate: new Date().toISOString().slice(0, 10),
      amount: '',
      notes: '',
    })
    setTicketDrafts([])
    setDialogOpen(true)
  }

  function openEdit(item: RevenueItem) {
    setEditing(item)
    form.reset({
      visitId: item.visitId,
      sourceType: item.sourceType,
      natureType: item.natureType,
      natureLabel: item.natureLabel,
      entryDate: item.entryDate,
      amount: formatCurrencyNumber(item.amount),
      notes: item.notes ?? '',
    })
    setTicketDrafts(
      (item.ticketSales ?? []).map((day) => ({
        date: day.date,
        amount: formatCurrencyNumber(day.amount),
        quantity: day.quantity != null ? String(day.quantity) : '',
        notes: day.notes ?? '',
      })),
    )
    setDialogOpen(true)
  }

  async function onSubmit(values: RevenueItemInput) {
    if (!user || !activeOrgId) return
    const amount = parseCurrencyInput(values.amount)
    if (amount == null || amount < 0) {
      toast.error('Informe um valor válido')
      return
    }
    if (values.sourceType === 'ingressos') {
      const visit = visits.find((v) => v.id === values.visitId)
      if (!visit?.hasTicketSales) {
        toast.error('Esta visita/evento não está marcada para venda de ingressos')
        return
      }
    }

    let ticketSales: RevenueTicketSaleDay[] | undefined
    if (values.sourceType === 'ingressos' && ticketDrafts.length > 0) {
      ticketSales = []
      for (const row of ticketDrafts) {
        if (!row.date && !row.amount) continue
        const dayAmount = parseCurrencyInput(row.amount)
        if (!row.date || dayAmount == null) {
          toast.error('Preencha data e valor em cada dia de ingresso')
          return
        }
        ticketSales.push({
          date: row.date,
          amount: dayAmount,
          quantity: row.quantity ? Number(row.quantity) : undefined,
          notes: row.notes || undefined,
        })
      }
    }

    setSaving(true)
    try {
      const payload = {
        visitId: values.visitId,
        sourceType: values.sourceType as RevenueSourceType,
        natureType: values.natureType as RevenueNatureType,
        natureLabel: values.natureLabel.trim(),
        entryDate: values.entryDate,
        amount,
        notes: values.notes?.trim() || undefined,
        ticketSales,
      }
      if (editing) {
        await updateRevenueItem(editing.id, payload)
        toast.success('Recurso atualizado')
      } else {
        await createRevenueItem(user.uid, activeOrgId, payload)
        toast.success('Recurso lançado')
      }
      setDialogOpen(false)
      await load()
    } catch {
      toast.error('Não foi possível salvar o recurso')
    } finally {
      setSaving(false)
    }
  }

  async function handleDeleteConfirm() {
    await deleteDialog.confirm(async (item) => {
      await deleteRevenueItem(item.id)
      toast.success('Lançamento excluído')
      await load()
    })
  }

  async function toggleTicketSales(visit: Visit, checked: boolean) {
    try {
      await updateVisit(visit.id, { hasTicketSales: checked })
      setVisits((prev) =>
        prev.map((v) => (v.id === visit.id ? { ...v, hasTicketSales: checked } : v)),
      )
      toast.success(
        checked
          ? 'Venda de ingressos liberada nesta experiência'
          : 'Venda de ingressos desativada nesta experiência',
      )
    } catch {
      toast.error('Não foi possível atualizar a experiência')
    }
  }

  const reportRows = useMemo(() => {
    const visitFilter = reportVisitId === 'all' ? null : reportVisitId
    const rev = revenues.filter((r) => {
      if (visitFilter && r.visitId !== visitFilter) return false
      if (periodStart && r.entryDate < periodStart) return false
      if (periodEnd && r.entryDate > periodEnd) return false
      return true
    })
    const fin = financeItems.filter((f) => {
      if (f.approvalStatus !== 'approved') return false
      if (visitFilter && f.visitId !== visitFilter) return false
      const visit = visits.find((v) => v.id === f.visitId)
      if (!visit) return false
      if (periodStart && visit.endDate < periodStart) return false
      if (periodEnd && visit.startDate > periodEnd) return false
      return true
    })
    return { rev, fin }
  }, [revenues, financeItems, visits, reportVisitId, periodStart, periodEnd])

  async function exportByExperience() {
    const byVisit = new Map<string, { receita: number; custo: number }>()
    for (const r of reportRows.rev) {
      const cur = byVisit.get(r.visitId) ?? { receita: 0, custo: 0 }
      cur.receita += r.amount
      byVisit.set(r.visitId, cur)
    }
    for (const f of reportRows.fin) {
      const cur = byVisit.get(f.visitId) ?? { receita: 0, custo: 0 }
      cur.custo += getApprovedCostAmount(f)
      byVisit.set(f.visitId, cur)
    }
    const headers = [
      'Experiência',
      'Tipo',
      'Período',
      'Receita',
      'Custos aprovados',
      'Saldo',
    ]
    const rows = [...byVisit.entries()].map(([visitId, sums]) => {
      const visit = visits.find((v) => v.id === visitId)
      return [
        visit?.title ?? visitId,
        visit?.eventKind ? visitEventKindLabel(visit.eventKind) : '—',
        visit ? `${formatDate(visit.startDate)} – ${formatDate(visit.endDate)}` : '—',
        formatCurrency(sums.receita),
        formatCurrency(sums.custo),
        formatCurrency(sums.receita - sums.custo),
      ]
    })
    await exportTable('xlsx', {
      filenameBase: 'receitas-por-experiencia',
      title: 'Receitas por experiência',
      headers,
      rows,
    })
    toast.success('Relatório exportado')
  }

  async function exportBySource() {
    const sums = new Map<RevenueSourceType, number>()
    for (const r of reportRows.rev) {
      sums.set(r.sourceType, (sums.get(r.sourceType) ?? 0) + r.amount)
    }
    await exportTable('xlsx', {
      filenameBase: 'receitas-por-origem',
      title: 'Receitas por origem',
      headers: ['Origem do recurso', 'Valor'],
      rows: (Object.keys(REVENUE_SOURCE_LABEL) as RevenueSourceType[]).map((key) => [
        REVENUE_SOURCE_LABEL[key],
        formatCurrency(sums.get(key) ?? 0),
      ]),
    })
    toast.success('Relatório exportado')
  }

  async function exportByCostCategory() {
    const sums = new Map<FinanceCostCategory, number>()
    for (const f of reportRows.fin) {
      const cat = resolveCostCategory(f)
      sums.set(cat, (sums.get(cat) ?? 0) + getApprovedCostAmount(f))
    }
    await exportTable('xlsx', {
      filenameBase: 'custos-por-tipo-servico',
      title: 'Custos aprovados por tipo de serviço',
      headers: ['Tipo de serviço', 'Valor aprovado'],
      rows: [...sums.entries()].map(([key, value]) => [
        FINANCE_COST_CATEGORY_LABEL[key],
        formatCurrency(value),
      ]),
    })
    toast.success('Relatório exportado')
  }

  async function exportDetail() {
    await exportTable('xlsx', {
      filenameBase: 'receitas-detalhe',
      title: 'Detalhe dos lançamentos de receita',
      headers: ['Experiência', 'Origem', 'Natureza', 'Data', 'Valor', 'Observações'],
      rows: reportRows.rev.map((r) => [
        visitTitle(r.visitId),
        REVENUE_SOURCE_LABEL[r.sourceType],
        `${REVENUE_NATURE_LABEL[r.natureType]}: ${r.natureLabel}`,
        r.entryDate,
        formatCurrency(r.amount),
        r.notes ?? '',
      ]),
    })
    toast.success('Relatório exportado')
  }

  if (!allowed) {
    return (
      <div className="space-y-4">
        <PageHeader
          title="Gestão de Receitas"
          description="Acesso exclusivo do Gestor de Recursos."
        />
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Você não tem permissão para este módulo. Peça ao administrador da empresa para
            liberar Gestão de Receitas em Configurações → Permissões.
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Gestão de Receitas"
        description="Captação de recursos por experiência. Custos aprovados no Financeiro abatem o saldo automaticamente."
        actions={
          <Button onClick={openCreate}>
            <Plus className="mr-2 size-4" />
            Novo recurso
          </Button>
        }
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Receita</CardDescription>
            <CardTitle className="text-2xl tabular-nums">
              {formatCurrency(totals.receita)}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Custos aprovados</CardDescription>
            <CardTitle className="text-2xl tabular-nums">
              {formatCurrency(totals.custos)}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Saldo</CardDescription>
            <CardTitle
              className={cn(
                'text-2xl tabular-nums',
                totals.saldo < 0 ? 'text-destructive' : 'text-emerald-700',
              )}
            >
              {formatCurrency(totals.saldo)}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      <div className="flex flex-wrap gap-2 border-b pb-2">
        {(
          [
            ['lancamentos', 'Lançamentos'],
            ['ingressos', 'Ingressos por experiência'],
            ['relatorios', 'Relatórios'],
          ] as const
        ).map(([id, label]) => (
          <Button
            key={id}
            type="button"
            size="sm"
            variant={tab === id ? 'default' : 'ghost'}
            onClick={() => setTab(id)}
          >
            {label}
          </Button>
        ))}
      </div>

      {tab === 'lancamentos' ? (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-3">
            <div className="space-y-1">
              <Label>Experiência</Label>
              <Select
                value={filterVisitId}
                onValueChange={(value) => {
                  setFilterVisitId(value)
                  const next = new URLSearchParams(searchParams)
                  if (value === 'all') next.delete('visita')
                  else next.set('visita', value)
                  setSearchParams(next, { replace: true })
                }}
              >
                <SelectTrigger className="w-[260px]">
                  <SelectValue placeholder="Todas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  {visits.map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      {v.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>De</Label>
              <Input
                type="date"
                value={periodStart}
                onChange={(e) => setPeriodStart(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label>Até</Label>
              <Input
                type="date"
                value={periodEnd}
                onChange={(e) => setPeriodEnd(e.target.value)}
              />
            </div>
          </div>

          {loading ? (
            <Skeleton className="h-40 w-full" />
          ) : filteredRevenues.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center gap-2 py-12 text-center text-sm text-muted-foreground">
                <Wallet className="size-8 opacity-40" />
                Nenhum recurso lançado neste filtro.
              </CardContent>
            </Card>
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full min-w-[720px] text-sm">
                <thead className="bg-muted/50 text-left">
                  <tr>
                    <th className="px-3 py-2 font-medium">Data</th>
                    <th className="px-3 py-2 font-medium">Experiência</th>
                    <th className="px-3 py-2 font-medium">Origem</th>
                    <th className="px-3 py-2 font-medium">Natureza</th>
                    <th className="px-3 py-2 font-medium text-right">Valor</th>
                    <th className="px-3 py-2 font-medium" />
                  </tr>
                </thead>
                <tbody>
                  {filteredRevenues
                    .slice()
                    .sort((a, b) => b.entryDate.localeCompare(a.entryDate))
                    .map((item) => (
                      <tr key={item.id} className="border-t">
                        <td className="px-3 py-2">{formatDate(item.entryDate)}</td>
                        <td className="px-3 py-2">{visitTitle(item.visitId)}</td>
                        <td className="px-3 py-2">
                          <Badge variant="secondary">
                            {REVENUE_SOURCE_LABEL[item.sourceType]}
                          </Badge>
                        </td>
                        <td className="px-3 py-2">
                          <span className="text-muted-foreground">
                            {REVENUE_NATURE_LABEL[item.natureType]}:
                          </span>{' '}
                          {item.natureLabel}
                        </td>
                        <td className="px-3 py-2 text-right font-medium tabular-nums">
                          {formatCurrency(item.amount)}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <Button variant="ghost" size="sm" onClick={() => openEdit(item)}>
                            Editar
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              deleteDialog.requestDelete({
                                id: item.id,
                                name: `${REVENUE_SOURCE_LABEL[item.sourceType]} · ${formatCurrency(item.amount)}`,
                              })
                            }
                          >
                            <Trash2 className="size-4 text-destructive" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : null}

      {tab === 'ingressos' ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Venda de ingressos por experiência</CardTitle>
            <CardDescription>
              Só experiências marcadas aqui liberam a origem “Venda de ingressos” nos
              lançamentos.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {visits.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma experiência cadastrada.</p>
            ) : (
              visits.map((visit) => (
                <label
                  key={visit.id}
                  className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm"
                >
                  <div>
                    <p className="font-medium">{visit.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {visitEventLabel(visit)} · {formatDate(visit.startDate)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">Tem ingressos</span>
                    <Checkbox
                      checked={visit.hasTicketSales === true}
                      onCheckedChange={(checked) =>
                        void toggleTicketSales(visit, checked === true)
                      }
                    />
                  </div>
                </label>
              ))
            )}
          </CardContent>
        </Card>
      ) : null}

      {tab === 'relatorios' ? (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-3">
            <div className="space-y-1">
              <Label>Experiência</Label>
              <Select value={reportVisitId} onValueChange={setReportVisitId}>
                <SelectTrigger className="w-[260px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  {visits.map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      {v.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>De</Label>
              <Input
                type="date"
                value={periodStart}
                onChange={(e) => setPeriodStart(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label>Até</Label>
              <Input
                type="date"
                value={periodEnd}
                onChange={(e) => setPeriodEnd(e.target.value)}
              />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Button variant="outline" onClick={() => void exportByExperience()}>
              <Download className="mr-2 size-4" />
              Por experiência
            </Button>
            <Button variant="outline" onClick={() => void exportBySource()}>
              <Download className="mr-2 size-4" />
              Por origem do recurso
            </Button>
            <Button variant="outline" onClick={() => void exportByCostCategory()}>
              <Download className="mr-2 size-4" />
              Por tipo de serviço
            </Button>
            <Button variant="outline" onClick={() => void exportDetail()}>
              <Download className="mr-2 size-4" />
              Detalhe dos lançamentos
            </Button>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Prévia do filtro</CardTitle>
              <CardDescription>
                Receita {formatCurrency(sumRevenue(reportRows.rev))} · Custos aprovados{' '}
                {formatCurrency(sumApprovedCosts(reportRows.fin))} · Saldo{' '}
                {formatCurrency(revenueBalance(reportRows.rev, reportRows.fin))}
              </CardDescription>
            </CardHeader>
          </Card>
        </div>
      ) : null}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? 'Editar recurso' : 'Novo recurso'}</DialogTitle>
          </DialogHeader>
          <form className="space-y-3" onSubmit={form.handleSubmit(onSubmit)}>
            <div className="space-y-1">
              <Label>Experiência *</Label>
              <Select
                value={form.watch('visitId') || undefined}
                onValueChange={(value) =>
                  form.setValue('visitId', value, { shouldValidate: true })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {visits.map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      {v.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {form.formState.errors.visitId ? (
                <p className="text-xs text-destructive">
                  {form.formState.errors.visitId.message}
                </p>
              ) : null}
            </div>

            <div className="space-y-1">
              <Label>Origem do recurso *</Label>
              <Select
                value={form.watch('sourceType')}
                onValueChange={(value) =>
                  form.setValue('sourceType', value as RevenueSourceType, {
                    shouldValidate: true,
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(REVENUE_SOURCE_LABEL) as RevenueSourceType[]).map((key) => {
                    const disabled =
                      key === 'ingressos' && selectedVisit && !selectedVisit.hasTicketSales
                    return (
                      <SelectItem key={key} value={key} disabled={Boolean(disabled)}>
                        {REVENUE_SOURCE_LABEL[key]}
                        {disabled ? ' (não liberado nesta experiência)' : ''}
                      </SelectItem>
                    )
                  })}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label>Tipo de natureza *</Label>
                <Select
                  value={form.watch('natureType')}
                  onValueChange={(value) =>
                    form.setValue('natureType', value as RevenueNatureType, {
                      shouldValidate: true,
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(REVENUE_NATURE_LABEL) as RevenueNatureType[]).map((key) => (
                      <SelectItem key={key} value={key}>
                        {REVENUE_NATURE_LABEL[key]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Natureza *</Label>
                <Input
                  placeholder="Ex.: CC 1201 / Rubrica X"
                  {...form.register('natureLabel')}
                />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label>Data da entrada *</Label>
                <Input type="date" {...form.register('entryDate')} />
              </div>
              <div className="space-y-1">
                <Label>Valor *</Label>
                <Input
                  inputMode="decimal"
                  value={form.watch('amount')}
                  onChange={(e) =>
                    form.setValue('amount', formatCurrencyInput(e.target.value), {
                      shouldValidate: true,
                    })
                  }
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label>Observações</Label>
              <Textarea rows={2} {...form.register('notes')} />
            </div>

            {ticketsEnabled ? (
              <div className="space-y-2 rounded-lg border p-3">
                <div className="flex items-center justify-between">
                  <Label>Resumo da venda diária</Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setTicketDrafts((prev) => [...prev, emptyTicket()])}
                  >
                    <Plus className="mr-1 size-3" />
                    Dia
                  </Button>
                </div>
                {ticketDrafts.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    Opcional: detalhe vendas por dia.
                  </p>
                ) : (
                  ticketDrafts.map((row, index) => (
                    <div key={index} className="grid gap-2 sm:grid-cols-4">
                      <Input
                        type="date"
                        value={row.date}
                        onChange={(e) =>
                          setTicketDrafts((prev) =>
                            prev.map((r, i) =>
                              i === index ? { ...r, date: e.target.value } : r,
                            ),
                          )
                        }
                      />
                      <Input
                        placeholder="Valor"
                        value={row.amount}
                        onChange={(e) =>
                          setTicketDrafts((prev) =>
                            prev.map((r, i) =>
                              i === index
                                ? { ...r, amount: formatCurrencyInput(e.target.value) }
                                : r,
                            ),
                          )
                        }
                      />
                      <Input
                        placeholder="Qtd"
                        value={row.quantity}
                        onChange={(e) =>
                          setTicketDrafts((prev) =>
                            prev.map((r, i) =>
                              i === index ? { ...r, quantity: e.target.value } : r,
                            ),
                          )
                        }
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          setTicketDrafts((prev) => prev.filter((_, i) => i !== index))
                        }
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  ))
                )}
              </div>
            ) : null}

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
                Salvar
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDeleteDialog
        open={deleteDialog.open}
        onOpenChange={deleteDialog.handleOpenChange}
        title="Excluir lançamento?"
        description="O recurso será removido permanentemente da gestão de receitas."
        itemName={deleteDialog.target?.name}
        loading={deleteDialog.loading}
        onConfirm={() => void handleDeleteConfirm()}
      />
    </div>
  )
}
