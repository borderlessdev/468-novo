import { useCallback, useEffect, useState } from 'react'
import { jsPDF } from 'jspdf'
import { toast } from 'sonner'
import {
  BarChart3,
  DollarSign,
  Download,
  FileText,
  MapPin,
  Users,
} from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
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
import { downloadCsv, formatCurrency, formatDate } from '@/lib/utils'
import { getCurrentCycle } from '@/lib/constants'
import { listVisits } from '@/services/visits'
import { listVisitors } from '@/services/visitors'
import { listFinanceItemsByOwner } from '@/services/finance'
import { listVisitVisitors } from '@/services/visitVisitors'
import type { FinanceItem, Visit, Visitor } from '@/types'

export function ReportsPage() {
  const { user, isAdmin, role } = useAuth()
  const [visits, setVisits] = useState<Visit[]>([])
  const [visitors, setVisitors] = useState<Visitor[]>([])
  const [financeItems, setFinanceItems] = useState<FinanceItem[]>([])
  const [nfStart, setNfStart] = useState('')
  const [nfEnd, setNfEnd] = useState('')
  const [nfStatus, setNfStatus] = useState('todos')

  const load = useCallback(async () => {
    if (!user) return
    try {
      const [visitsData, visitorsData, financeData] = await Promise.all([
        listVisits(user.uid, isAdmin, role),
        listVisitors(user.uid, isAdmin),
        listFinanceItemsByOwner(user.uid, isAdmin),
      ])
      setVisits(visitsData)
      setVisitors(visitorsData)
      setFinanceItems(financeData)
    } catch (error) {
      console.error(error)
      toast.error('Erro ao carregar dados dos relatórios')
    }
  }, [user, isAdmin])

  useEffect(() => {
    void load()
  }, [load])

  const exportNfCsv = () => {
    const rows = financeItems.filter((item) => {
      if (!item.nfDueDate) return false
      if (nfStart && item.nfDueDate < nfStart) return false
      if (nfEnd && item.nfDueDate > nfEnd) return false
      if (nfStatus === 'recebida' && !item.nfReceived) return false
      if (nfStatus === 'pendente' && item.nfReceived) return false
      return true
    })

    downloadCsv('relatorio-vencimento-nfs.csv', [
      ['Serviço', 'Valor', 'Empresa', 'NF recebida', 'Vencimento', 'Visita'],
      ...rows.map((item) => [
        item.serviceName,
        String(item.serviceValue ?? 0),
        item.winningCompany ?? '',
        item.nfReceived ? 'Sim' : 'Não',
        formatDate(item.nfDueDate),
        visits.find((v) => v.id === item.visitId)?.title ?? item.visitId,
      ]),
    ])
    toast.success('CSV exportado')
  }

  const exportMonthVisits = (asPdf = false) => {
    const cycle = getCurrentCycle()
    const rows = visits.filter(
      (v) => v.startDate >= cycle.startIso && v.startDate <= cycle.endIso,
    )
    if (asPdf) {
      const doc = new jsPDF()
      doc.setFontSize(14)
      doc.text('Visitas do ciclo', 14, 20)
      rows.forEach((visit, index) => {
        doc.setFontSize(10)
        doc.text(
          `${visit.title} | ${formatDate(visit.startDate)} | ${visit.city ?? '—'} | ${visit.status}`,
          14,
          32 + index * 8,
        )
      })
      doc.save('visitas-do-ciclo.pdf')
    } else {
      downloadCsv('visitas-do-ciclo.csv', [
        ['Título', 'Início', 'Fim', 'Local', 'Estado', 'Status'],
        ...rows.map((v) => [
          v.title,
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

  const exportRecurringVisitors = async (asPdf = false) => {
    const counts = new Map<string, number>()
    await Promise.all(
      visits.map(async (visit) => {
        const links = await listVisitVisitors(visit.id, user!.uid, isAdmin)
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
            <FileText className="mt-0.5 h-5 w-5 text-primary" />
            <div>
              <CardTitle>Relatório de vencimento das NFs</CardTitle>
              <CardDescription>
                Notas fiscais com data de vencimento. Filtre por período e status e
                exporte em CSV.
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
          <Button variant="outline" onClick={exportNfCsv}>
            <Download className="h-4 w-4" />
            Exportar CSV
          </Button>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <ReportCard
          icon={BarChart3}
          title="Visitas do Mês"
          description="Relatório de todas as visitas realizadas no ciclo corrente."
          onCsv={() => exportMonthVisits(false)}
          onPdf={() => exportMonthVisits(true)}
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
  onCsv,
  onPdf,
}: {
  icon: typeof BarChart3
  title: string
  description: string
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
      <CardContent className="flex gap-2">
        <Button variant="outline" size="sm" onClick={onCsv}>
          CSV
        </Button>
        <Button variant="outline" size="sm" onClick={onPdf}>
          PDF
        </Button>
      </CardContent>
    </Card>
  )
}
