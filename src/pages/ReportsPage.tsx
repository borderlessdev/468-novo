import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { jsPDF } from 'jspdf'
import { toast } from 'sonner'
import {
  BarChart3,
  ChevronDown,
  DollarSign,
  Download,
  FileText,
  MapPin,
  Users,
} from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { CyclePeriodFields } from '@/components/shared/CyclePeriodFields'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useAuth } from '@/contexts/AuthContext'
import { useOrg } from '@/contexts/OrgContext'
import { useCyclePeriod } from '@/hooks/useCyclePeriod'
import { visitEventLabel, visitVipSubtypeLabel } from '@/lib/visitEvent'
import { downloadCsv, formatCurrency, formatDate } from '@/lib/utils'
import {
  exportTable,
  getExportFormatLabel,
  type TableExportFormat,
} from '@/lib/export'
import { listVisits } from '@/services/visits'
import { listVisitors } from '@/services/visitors'
import { listFinanceItemsByOwner } from '@/services/finance'
import {
  listVisitIdsForVisitor,
  listVisitVisitors,
} from '@/services/visitVisitors'
import type { FinanceItem, Visit, Visitor } from '@/types'

function visitorCreatedIso(visitor: Visitor): string | null {
  const raw = visitor.createdAt
  if (!raw) return null
  if (typeof raw === 'object' && raw !== null && 'toDate' in raw) {
    const date = (raw as { toDate: () => Date }).toDate()
    if (Number.isNaN(date.getTime())) return null
    return date.toISOString().slice(0, 10)
  }
  const date = new Date(String(raw))
  if (Number.isNaN(date.getTime())) return null
  return date.toISOString().slice(0, 10)
}

export function ReportsPage() {
  const { user, isPlatformAdmin, role } = useAuth()
  const { activeOrgId } = useOrg()
  const {
    cycleLabel,
    isDefaultCycle,
    range,
    cycleStart,
    cycleEnd,
    setCycleStart,
    setCycleEnd,
    resetCycle,
  } = useCyclePeriod({ notify: true })
  const [visits, setVisits] = useState<Visit[]>([])
  const [visitors, setVisitors] = useState<Visitor[]>([])
  const [financeItems, setFinanceItems] = useState<FinanceItem[]>([])
  const [nfStart, setNfStart] = useState('')
  const [nfEnd, setNfEnd] = useState('')
  const [nfStatus, setNfStatus] = useState('todos')
  const [visitorFilterId, setVisitorFilterId] = useState('todos')
  const [visitorSearch, setVisitorSearch] = useState('')
  const [visitorHistory, setVisitorHistory] = useState<Visit[]>([])
  const [loadingHistory, setLoadingHistory] = useState(false)

  const load = useCallback(async () => {
    if (!user || !activeOrgId) return
    try {
      const visitsData = await listVisits(activeOrgId, user.uid, isPlatformAdmin, role)
      const [visitorsData, financeData] = await Promise.all([
        listVisitors(activeOrgId),
        listFinanceItemsByOwner(activeOrgId, user.uid, isPlatformAdmin, role, visitsData),
      ])
      setVisits(visitsData)
      setVisitors(visitorsData)
      setFinanceItems(financeData)
    } catch (error) {
      console.error(error)
      toast.error('Erro ao carregar dados dos relatórios')
    }
  }, [user, activeOrgId, isPlatformAdmin, role])

  useEffect(() => {
    void load()
  }, [load])

  const visitorsInCycle = useMemo(() => {
    return visitors.filter((visitor) => {
      const created = visitorCreatedIso(visitor)
      if (!created) return true
      return created >= range.startIso && created <= range.endIso
    })
  }, [visitors, range.endIso, range.startIso])

  const filteredVisitorOptions = useMemo(() => {
    const q = visitorSearch.trim().toLowerCase()
    const base = visitorsInCycle.length > 0 ? visitorsInCycle : visitors
    if (!q) return base.slice(0, 80)
    return base
      .filter(
        (v) =>
          v.name.toLowerCase().includes(q) ||
          (v.document ?? '').toLowerCase().includes(q) ||
          (v.company ?? '').toLowerCase().includes(q),
      )
      .slice(0, 80)
  }, [visitors, visitorsInCycle, visitorSearch])

  useEffect(() => {
    if (!user || !activeOrgId || visitorFilterId === 'todos') {
      setVisitorHistory([])
      return
    }
    let cancelled = false
    setLoadingHistory(true)
    void (async () => {
      try {
        const visitIds = await listVisitIdsForVisitor(
          visitorFilterId,
          activeOrgId,
          user.uid,
          isPlatformAdmin,
          role,
        )
        if (cancelled) return
        const matched = visits
          .filter((v) => visitIds.includes(v.id))
          .filter((v) => v.startDate >= range.startIso && v.startDate <= range.endIso)
          .sort((a, b) => b.startDate.localeCompare(a.startDate))
        setVisitorHistory(matched)
      } catch (error) {
        console.error(error)
        if (!cancelled) {
          setVisitorHistory([])
          toast.error('Erro ao carregar histórico do visitante')
        }
      } finally {
        if (!cancelled) setLoadingHistory(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [
    visitorFilterId,
    user,
    activeOrgId,
    isPlatformAdmin,
    role,
    visits,
    range.startIso,
    range.endIso,
  ])

  const getVisitorReportRows = () => {
    if (visitorFilterId !== 'todos' && visitorHistory.length > 0) {
      return {
        headers: [
          'Visitante',
          'Documento',
          'Visita',
          'Tipo',
          'Início',
          'Fim',
          'Cidade',
          'Status',
        ],
        rows: visitorHistory.map((visit) => {
          const visitor = visitors.find((v) => v.id === visitorFilterId)
          return [
            visitor?.name ?? '',
            visitor?.document ?? visitor?.cpf ?? '',
            visit.title,
            visitEventLabel(visit),
            formatDate(visit.startDate),
            formatDate(visit.endDate),
            visit.city ?? '',
            visit.status,
          ]
        }),
        title: `Histórico de visitas — ${
          visitors.find((v) => v.id === visitorFilterId)?.name ?? 'visitante'
        } (${cycleLabel})`,
      }
    }

    const selected =
      visitorFilterId === 'todos'
        ? visitorsInCycle
        : visitors.filter((v) => v.id === visitorFilterId)

    return {
      headers: [
        'Nome',
        'Documento',
        'Empresa',
        'E-mail',
        'Telefone',
        'Visitas no ciclo',
        'Cadastrado em',
      ],
      rows: selected.map((visitor) => [
        visitor.name,
        visitor.document ?? visitor.cpf ?? '',
        visitor.company ?? '',
        visitor.email ?? '',
        visitor.phone ?? visitor.whatsapp ?? '',
        visitorFilterId === 'todos' ? '—' : String(visitorHistory.length),
        visitorCreatedIso(visitor) ? formatDate(visitorCreatedIso(visitor)!) : '—',
      ]),
      title: `Visitantes cadastrados (${cycleLabel})`,
    }
  }

  const exportVisitorReport = async (format: TableExportFormat) => {
    const { headers, rows, title } = getVisitorReportRows()
    await exportTable(format, {
      filenameBase: 'relatorio-visitantes',
      title,
      headers,
      rows,
    })
    toast.success(`${getExportFormatLabel(format)} exportado`)
  }

  const getNfReportRows = () => {
    const items = financeItems.filter((item) => {
      if (!item.nfDueDate) return false
      if (nfStart && item.nfDueDate < nfStart) return false
      if (nfEnd && item.nfDueDate > nfEnd) return false
      if (nfStatus === 'recebida' && !item.nfReceived) return false
      if (nfStatus === 'pendente' && item.nfReceived) return false
      return true
    })

    const headers = ['Serviço', 'Valor', 'Empresa', 'NF recebida', 'Vencimento', 'Visita']
    const rows = items.map((item) => [
      item.serviceName,
      String(item.serviceValue ?? 0),
      item.winningCompany ?? '',
      item.nfReceived ? 'Sim' : 'Não',
      formatDate(item.nfDueDate!),
      visits.find((v) => v.id === item.visitId)?.title ?? item.visitId,
    ])

    return { headers, rows }
  }

  const exportNfReport = async (format: TableExportFormat) => {
    const { headers, rows } = getNfReportRows()
    await exportTable(format, {
      filenameBase: 'relatorio-vencimento-nfs',
      title: 'Relatório de vencimento das NFs',
      headers,
      rows,
    })
    toast.success(`${getExportFormatLabel(format)} exportado`)
  }

  const exportMonthVisits = (asPdf = false) => {
    const rows = visits.filter(
      (v) => v.startDate >= range.startIso && v.startDate <= range.endIso,
    )
    if (asPdf) {
      const doc = new jsPDF()
      doc.setFontSize(14)
      doc.text(`Visitas do ciclo (${cycleLabel})`, 14, 20)
      rows.forEach((visit, index) => {
        doc.setFontSize(10)
        doc.text(
          `${visit.title} | ${visitEventLabel(visit)} | ${formatDate(visit.startDate)} | ${visit.city ?? '—'} | ${visit.status}`,
          14,
          32 + index * 8,
        )
      })
      doc.save('visitas-do-ciclo.pdf')
    } else {
      downloadCsv('visitas-do-ciclo.csv', [
        ['Título', 'Tipo de evento', 'Início', 'Fim', 'Local', 'Estado', 'Status'],
        ...rows.map((v) => [
          v.title,
          visitEventLabel(v),
          formatDate(v.startDate),
          formatDate(v.endDate),
          v.city ?? '',
          v.state ?? '',
          v.status,
        ]),
      ])
    }
    toast.success(asPdf ? 'PDF exportado' : 'CSV exportado')
  }

  const exportVipVisits = (onlyCommercial: boolean, asPdf = false) => {
    const rows = visits.filter(
      (v) =>
        v.startDate >= range.startIso &&
        v.startDate <= range.endIso &&
        v.eventKind === 'visita_vip' &&
        (!onlyCommercial || v.vipSubtype === 'comercial'),
    )
    const title = onlyCommercial
      ? `Visitas VIP comerciais (${cycleLabel})`
      : `Visitas VIP (${cycleLabel})`
    const filenameBase = onlyCommercial ? 'visitas-vip-comerciais' : 'visitas-vip'

    if (asPdf) {
      const doc = new jsPDF()
      doc.setFontSize(14)
      doc.text(title, 14, 20)
      rows.forEach((visit, index) => {
        doc.setFontSize(10)
        doc.text(
          `${visit.title} | ${visitVipSubtypeLabel(visit.vipSubtype)} | ${formatDate(visit.startDate)} | ${visit.city ?? '—'} | ${visit.status}`,
          14,
          32 + index * 8,
        )
      })
      doc.save(`${filenameBase}.pdf`)
    } else {
      downloadCsv(`${filenameBase}.csv`, [
        ['Título', 'Subtipo VIP', 'Início', 'Fim', 'Local', 'Estado', 'Status'],
        ...rows.map((v) => [
          v.title,
          visitVipSubtypeLabel(v.vipSubtype),
          formatDate(v.startDate),
          formatDate(v.endDate),
          v.city ?? '',
          v.state ?? '',
          v.status,
        ]),
      ])
    }
    toast.success(
      asPdf
        ? `PDF exportado (${rows.length} visita${rows.length === 1 ? '' : 's'})`
        : `CSV exportado (${rows.length} visita${rows.length === 1 ? '' : 's'})`,
    )
  }

  const exportRecurringVisitors = async (asPdf = false) => {
    const counts = new Map<string, number>()
    await Promise.all(
      visits.map(async (visit) => {
        const links = await listVisitVisitors(visit.id, user!.uid, isPlatformAdmin)
        links.forEach((link) => {
          counts.set(link.visitorId, (counts.get(link.visitorId) ?? 0) + 1)
        })
      }),
    )
    const recurring = visitors
      .map((visitor) => ({
        visitor,
        count: counts.get(visitor.id) ?? 0,
      }))
      .filter((item) => item.count > 1)

    if (asPdf) {
      const doc = new jsPDF()
      doc.setFontSize(14)
      doc.text('Visitantes recorrentes', 14, 20)
      recurring.forEach((item, index) => {
        doc.setFontSize(10)
        doc.text(
          `${item.visitor.name} | ${item.visitor.company ?? '—'} | ${item.count} visitas`,
          14,
          32 + index * 8,
        )
      })
      doc.save('visitantes-recorrentes.pdf')
    } else {
      downloadCsv('visitantes-recorrentes.csv', [
        ['Nome', 'Documento', 'Empresa', 'Visitas'],
        ...recurring.map((item) => [
          item.visitor.name,
          item.visitor.document,
          item.visitor.company ?? '',
          String(item.count),
        ]),
      ])
    }
    toast.success(asPdf ? 'PDF exportado' : 'CSV exportado')
  }

  const exportSpendByState = (asPdf = false) => {
    const byState = new Map<string, number>()
    financeItems.forEach((item) => {
      const visit = visits.find((v) => v.id === item.visitId)
      const state = visit?.state || 'N/A'
      byState.set(state, (byState.get(state) ?? 0) + (item.serviceValue ?? 0))
    })
    const rows = [...byState.entries()]

    if (asPdf) {
      const doc = new jsPDF()
      doc.setFontSize(14)
      doc.text('Gastos por estado', 14, 20)
      rows.forEach(([state, value], index) => {
        doc.setFontSize(10)
        doc.text(`${state}: ${formatCurrency(value)}`, 14, 32 + index * 8)
      })
      doc.save('gastos-por-estado.pdf')
    } else {
      downloadCsv('gastos-por-estado.csv', [
        ['Estado', 'Total'],
        ...rows.map(([state, value]) => [state, String(value)]),
      ])
    }
    toast.success(asPdf ? 'PDF exportado' : 'CSV exportado')
  }

  const exportSpendByCategory = (asPdf = false) => {
    const byService = new Map<string, number>()
    financeItems.forEach((item) => {
      byService.set(
        item.serviceName,
        (byService.get(item.serviceName) ?? 0) + (item.serviceValue ?? 0),
      )
    })
    const rows = [...byService.entries()]

    if (asPdf) {
      const doc = new jsPDF()
      doc.setFontSize(14)
      doc.text('Gastos por categoria', 14, 20)
      rows.forEach(([name, value], index) => {
        doc.setFontSize(10)
        doc.text(`${name}: ${formatCurrency(value)}`, 14, 32 + index * 8)
      })
      doc.save('gastos-por-categoria.pdf')
    } else {
      downloadCsv('gastos-por-categoria.csv', [
        ['Categoria', 'Total'],
        ...rows.map(([name, value]) => [name, String(value)]),
      ])
    }
    toast.success(asPdf ? 'PDF exportado' : 'CSV exportado')
  }

  return (
    <div>
      <PageHeader title="Relatórios" description="Relatórios exportáveis do sistema" />

      <Card className="mb-6">
        <CardHeader>
          <div className="flex items-start gap-3">
            <Users className="mt-0.5 h-5 w-5 text-primary" />
            <div>
              <CardTitle>Relatório de visitantes</CardTitle>
              <CardDescription>
                Filtre pelo ciclo e por visitante. Veja o histórico de visitas e
                exporte em CSV, PDF, Excel ou Word.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <CyclePeriodFields
            cycleStart={cycleStart}
            cycleEnd={cycleEnd}
            isDefaultCycle={isDefaultCycle}
            onStartChange={setCycleStart}
            onEndChange={setCycleEnd}
            onReset={resetCycle}
            idPrefix="reports-visitors-cycle"
          />
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="space-y-1 sm:w-48">
              <Label className="text-xs">Busca</Label>
              <Input
                placeholder="Nome, documento…"
                value={visitorSearch}
                onChange={(e) => setVisitorSearch(e.target.value)}
              />
            </div>
            <div className="space-y-1 flex-1">
              <Label className="text-xs">Visitante</Label>
              <Select value={visitorFilterId} onValueChange={setVisitorFilterId}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">
                    Todos ({visitorsInCycle.length} no ciclo)
                  </SelectItem>
                  {filteredVisitorOptions.map((visitor) => (
                    <SelectItem key={visitor.id} value={visitor.id}>
                      {visitor.name}
                      {visitor.company ? ` · ${visitor.company}` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline">
                  <Download className="h-4 w-4" />
                  Exportar
                  <ChevronDown className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => void exportVisitorReport('csv')}>
                  CSV (.csv)
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => void exportVisitorReport('pdf')}>
                  PDF (.pdf)
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => void exportVisitorReport('xlsx')}>
                  Excel (.xlsx)
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => void exportVisitorReport('docx')}>
                  Word (.docx)
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <div className="rounded-md border text-sm">
            <div className="border-b bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
              {visitorFilterId === 'todos'
                ? `${visitorsInCycle.length} visitante(s) com cadastro no ciclo ${cycleLabel}`
                : loadingHistory
                  ? 'Carregando histórico…'
                  : `${visitorHistory.length} visita(s) no ciclo para o visitante selecionado`}
            </div>
            {visitorFilterId !== 'todos' && !loadingHistory && visitorHistory.length === 0 ? (
              <p className="px-3 py-4 text-muted-foreground">
                Nenhuma visita vinculada neste ciclo.
              </p>
            ) : null}
            {visitorFilterId !== 'todos' && visitorHistory.length > 0 ? (
              <ul className="max-h-56 divide-y overflow-auto">
                {visitorHistory.map((visit) => (
                  <li
                    key={visit.id}
                    className="flex flex-wrap items-center justify-between gap-2 px-3 py-2"
                  >
                    <span className="font-medium">{visit.title}</span>
                    <span className="text-muted-foreground">
                      {formatDate(visit.startDate)} · {visitEventLabel(visit)} ·{' '}
                      {visit.status}
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
            {visitorFilterId === 'todos' && visitorsInCycle.length > 0 ? (
              <ul className="max-h-56 divide-y overflow-auto">
                {visitorsInCycle.slice(0, 30).map((visitor) => (
                  <li
                    key={visitor.id}
                    className="flex flex-wrap items-center justify-between gap-2 px-3 py-2"
                  >
                    <span className="font-medium">{visitor.name}</span>
                    <span className="text-muted-foreground">
                      {visitor.company ?? '—'}
                      {visitorCreatedIso(visitor)
                        ? ` · ${formatDate(visitorCreatedIso(visitor)!)}`
                        : ''}
                    </span>
                  </li>
                ))}
                {visitorsInCycle.length > 30 ? (
                  <li className="px-3 py-2 text-xs text-muted-foreground">
                    +{visitorsInCycle.length - 30} outros — use Exportar para a lista
                    completa
                  </li>
                ) : null}
              </ul>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader>
          <div className="flex items-start gap-3">
            <FileText className="mt-0.5 h-5 w-5 text-primary" />
            <div>
              <CardTitle>Relatório de vencimento das NFs</CardTitle>
              <CardDescription>
                Notas fiscais com data de vencimento. Filtre por período e status e
                exporte em CSV, PDF, Excel ou Word.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="space-y-1">
            <Label className="text-xs">Data início</Label>
            <Input type="date" value={nfStart} onChange={(e) => setNfStart(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Data fim</Label>
            <Input type="date" value={nfEnd} onChange={(e) => setNfEnd(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Status</Label>
            <Select value={nfStatus} onValueChange={setNfStatus}>
              <SelectTrigger className="w-full sm:w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                <SelectItem value="recebida">Recebida</SelectItem>
                <SelectItem value="pendente">Pendente</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline">
                <Download className="h-4 w-4" />
                Exportar
                <ChevronDown className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => void exportNfReport('csv')}>
                CSV (.csv)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => void exportNfReport('pdf')}>
                PDF (.pdf)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => void exportNfReport('xlsx')}>
                Excel (.xlsx)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => void exportNfReport('docx')}>
                Word (.docx)
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <ReportCard
          icon={BarChart3}
          title="Visitas do Mês"
          description={`Relatório de visitas no ciclo ${cycleLabel}.`}
          footer={
            <CyclePeriodFields
              cycleStart={cycleStart}
              cycleEnd={cycleEnd}
              isDefaultCycle={isDefaultCycle}
              onStartChange={setCycleStart}
              onEndChange={setCycleEnd}
              onReset={resetCycle}
              idPrefix="reports-cycle"
              className="mb-3"
            />
          }
          onCsv={() => exportMonthVisits(false)}
          onPdf={() => exportMonthVisits(true)}
        />
        <ReportCard
          icon={Users}
          title="Visitas VIP do Mês"
          description={`Quantidade e lista de Visitas VIP no ciclo ${cycleLabel}.`}
          onCsv={() => exportVipVisits(false, false)}
          onPdf={() => exportVipVisits(false, true)}
        />
        <ReportCard
          icon={BarChart3}
          title="Visitas VIP Comerciais"
          description={`Visitas VIP do subtipo Comercial no ciclo ${cycleLabel}.`}
          onCsv={() => exportVipVisits(true, false)}
          onPdf={() => exportVipVisits(true, true)}
        />
        <ReportCard
          icon={Users}
          title="Visitantes Recorrentes"
          description="Lista de visitantes com mais de uma visita registrada."
          onCsv={() => void exportRecurringVisitors(false)}
          onPdf={() => void exportRecurringVisitors(true)}
        />
        <ReportCard
          icon={MapPin}
          title="Gastos por Estado"
          description="Análise de gastos segmentada por estado de realização."
          onCsv={() => exportSpendByState(false)}
          onPdf={() => exportSpendByState(true)}
        />
        <ReportCard
          icon={DollarSign}
          title="Gastos por Categoria"
          description="Breakdown de gastos por tipo de despesa."
          onCsv={() => exportSpendByCategory(false)}
          onPdf={() => exportSpendByCategory(true)}
        />
      </div>
    </div>
  )
}

function ReportCard({
  icon: Icon,
  title,
  description,
  footer,
  onCsv,
  onPdf,
}: {
  icon: typeof BarChart3
  title: string
  description: string
  footer?: ReactNode
  onCsv: () => void
  onPdf: () => void
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
            <Icon className="h-5 w-5 text-primary" />
          </div>
          <div>
            <CardTitle className="text-base">{title}</CardTitle>
            <CardDescription>{description}</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {footer}
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={onCsv}>
            CSV
          </Button>
          <Button variant="outline" size="sm" onClick={onPdf}>
            PDF
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
