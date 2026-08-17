import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { toastMovedToTrash } from '@/lib/toast'
import { Building2, CalendarDays, CheckCircle2, Columns3, ExternalLink, FileText, LayoutGrid, List, Loader2, Plus, Trash2, Paperclip, ReceiptText, Upload, X } from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { ConfirmDeleteDialog, useConfirmDelete } from '@/components/shared/ConfirmDeleteDialog'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
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
import { financeItemSchema, type FinanceItemInput } from '@/lib/validations'
import {
  formatCurrencyInput,
  formatCurrencyNumber,
  formatCurrency,
  formatDate,
  parseCurrencyInput,
} from '@/lib/utils'
import { listVisits } from '@/services/visits'
import {
  createFinanceItem,
  deleteFinanceItem,
  getFinanceAttachmentUrl,
  listFinanceItems,
  removeFinanceAttachment,
  removeFinanceFile,
  updateFinanceItem,
  uploadFinanceAttachment,
  uploadFinanceFile,
} from '@/services/finance'
import { notifyVisitStakeholders } from '@/services/notifications'
import type { FinanceAttachment, FinanceItem, Visit } from '@/types'

type ViewMode = 'table' | 'cards' | 'invoice'

function formatFileSize(size: number) {
  if (!size) return ''
  return size < 1024 * 1024
    ? `${Math.ceil(size / 1024)} KB`
    : `${(size / (1024 * 1024)).toFixed(1)} MB`
}

function FinanceFiles({
  item,
  canWrite,
  onChanged,
}: {
  item: FinanceItem
  canWrite: boolean
  onChanged: () => Promise<void>
}) {
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const budgets = item.budgetAttachments ?? []
  const invoice = item.invoiceAttachment

  const openFile = async (attachment: FinanceAttachment) => {
    try {
      const url = await getFinanceAttachmentUrl(attachment.storagePath)
      window.open(url, '_blank', 'noopener,noreferrer')
    } catch (error) {
      console.error(error)
      toast.error('Não foi possível abrir o arquivo')
    }
  }

  const upload = async (file: File, kind: 'budget' | 'invoice') => {
    setBusyKey(kind)
    try {
      await uploadFinanceFile(item, file, kind)
      toast.success(kind === 'budget' ? 'Orçamento enviado' : 'Nota fiscal enviada')
      await onChanged()
    } catch (error) {
      console.error(error)
      toast.error(error instanceof Error ? error.message : 'Falha no envio')
    } finally {
      setBusyKey(null)
    }
  }

  const remove = async (
    attachment: FinanceAttachment,
    kind: 'budget' | 'invoice',
  ) => {
    setBusyKey(attachment.id)
    try {
      await removeFinanceFile(item, attachment, kind)
      toast.success(kind === 'budget' ? 'Orçamento removido' : 'Nota fiscal removida')
      await onChanged()
    } catch (error) {
      console.error(error)
      toast.error('Não foi possível remover o arquivo')
    } finally {
      setBusyKey(null)
    }
  }

  const fileRow = (attachment: FinanceAttachment, kind: 'budget' | 'invoice') => (
    <div
      key={attachment.id}
      className="flex min-w-0 items-center gap-1 rounded-md border bg-muted/20 py-1 pl-2 pr-1"
    >
      <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <button
        type="button"
        className="min-w-0 flex-1 truncate text-left text-xs font-medium hover:text-primary hover:underline"
        title={`${attachment.name}${attachment.size ? ` · ${formatFileSize(attachment.size)}` : ''}`}
        onClick={() => void openFile(attachment)}
      >
        {attachment.name}
      </button>
      <Button
        type="button"
        size="icon"
        variant="ghost"
        className="h-6 w-6"
        title="Abrir arquivo"
        onClick={() => void openFile(attachment)}
      >
        <ExternalLink className="h-3 w-3" />
      </Button>
      {canWrite ? (
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="h-6 w-6 text-destructive hover:text-destructive"
          title="Remover arquivo"
          disabled={busyKey !== null}
          onClick={() => void remove(attachment, kind)}
        >
          {busyKey === attachment.id ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <X className="h-3 w-3" />
          )}
        </Button>
      ) : null}
    </div>
  )

  return (
    <div className="grid min-w-64 gap-3 sm:grid-cols-2">
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium">Orçamentos</span>
          <span className="text-[11px] text-muted-foreground">{budgets.length}/3</span>
        </div>
        {budgets.length ? (
          <div className="space-y-1">{budgets.map((file) => fileRow(file, 'budget'))}</div>
        ) : (
          <p className="text-xs text-muted-foreground">Nenhum arquivo</p>
        )}
        {canWrite && budgets.length < 3 ? (
          <label className="inline-flex h-8 w-full cursor-pointer items-center justify-center gap-1.5 rounded-md border border-dashed px-2 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-primary">
            <input
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,.webp"
              className="sr-only"
              disabled={busyKey !== null}
              onChange={(event) => {
                const file = event.target.files?.[0]
                if (file) void upload(file, 'budget')
                event.target.value = ''
              }}
            />
            {busyKey === 'budget' ? <Loader2 className="animate-spin" /> : <Upload />}
            Enviar orçamento
          </label>
        ) : null}
      </div>
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium">Nota fiscal</span>
          <span className="text-[11px] text-muted-foreground">{invoice ? '1/1' : '0/1'}</span>
        </div>
        {invoice ? fileRow(invoice, 'invoice') : <p className="text-xs text-muted-foreground">Nenhum arquivo</p>}
        {canWrite && !invoice ? (
          <label className="inline-flex h-8 w-full cursor-pointer items-center justify-center gap-1.5 rounded-md border border-dashed border-amber-500/40 bg-amber-500/5 px-2 text-xs font-medium text-amber-700 transition-colors hover:bg-amber-500/10 dark:text-amber-400">
            <input
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,.webp"
              className="sr-only"
              disabled={busyKey !== null}
              onChange={(event) => {
                const file = event.target.files?.[0]
                if (file) void upload(file, 'invoice')
                event.target.value = ''
              }}
            />
            {busyKey === 'invoice' ? <Loader2 className="animate-spin" /> : <ReceiptText />}
            Enviar nota fiscal
          </label>
        ) : null}
      </div>
    </div>
  )
}

export function FinancePage() {
  const { user, isAdmin, role, canWrite, profile } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const [visits, setVisits] = useState<Visit[]>([])
  const [items, setItems] = useState<FinanceItem[]>([])
  const [loading, setLoading] = useState(true)
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    const saved = localStorage.getItem('finance-view-mode')
    return saved === 'table' || saved === 'cards' || saved === 'invoice' ? saved : 'table'
  })
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<FinanceItem | null>(null)
  const [saving, setSaving] = useState(false)
  const [pendingNfFile, setPendingNfFile] = useState<File | null>(null)
  const [removePendingAttachment, setRemovePendingAttachment] = useState(false)
  const nfFileInputRef = useRef<HTMLInputElement>(null)
  const deleteDialog = useConfirmDelete<{ id: string; name: string }>()

  const visitId = searchParams.get('visita') ?? ''
  const selectedVisit = visits.find((v) => v.id === visitId)

  const form = useForm<FinanceItemInput>({
    resolver: zodResolver(financeItemSchema),
    defaultValues: {
      serviceName: '',
      budget1: '',
      budget2: '',
      budget3: '',
      serviceValue: '',
      winningCompany: '',
      nfReceived: false,
      nfDueDate: '',
    },
  })

  useEffect(() => {
    if (!user) return
    void (async () => {
      setLoading(true)
      try {
        setVisits(await listVisits(user.uid, isAdmin, role))
      } finally {
        setLoading(false)
      }
    })()
  }, [user, isAdmin, role])

  const loadItems = useCallback(async () => {
    if (!visitId || !user) {
      setItems([])
      return
    }
    const ownerIdForQuery =
      visits.find((v) => v.id === visitId)?.ownerId ?? user.uid
    try {
      setItems(await listFinanceItems(visitId, ownerIdForQuery, isAdmin))
    } catch (error) {
      console.error(error)
      toast.error('Erro ao carregar financeiro')
    }
  }, [visitId, user, isAdmin, visits])

  useEffect(() => {
    void loadItems()
  }, [loadItems])

  const total = useMemo(
    () => items.reduce((sum, item) => sum + (item.serviceValue ?? 0), 0),
    [items],
  )

  const changeViewMode = (mode: ViewMode) => {
    setViewMode(mode)
    localStorage.setItem('finance-view-mode', mode)
  }

  const resetNfAttachmentState = () => {
    setPendingNfFile(null)
    setRemovePendingAttachment(false)
    if (nfFileInputRef.current) nfFileInputRef.current.value = ''
  }

  const openCreate = () => {
    setEditing(null)
    resetNfAttachmentState()
    form.reset({
      serviceName: '',
      budget1: '',
      budget2: '',
      budget3: '',
      serviceValue: '',
      winningCompany: '',
      nfReceived: false,
      nfDueDate: '',
    })
    setOpen(true)
  }

  const openEdit = (item: FinanceItem) => {
    setEditing(item)
    resetNfAttachmentState()
    form.reset({
      serviceName: item.serviceName,
      budget1: item.budget1 != null ? formatCurrencyNumber(item.budget1) : '',
      budget2: item.budget2 != null ? formatCurrencyNumber(item.budget2) : '',
      budget3: item.budget3 != null ? formatCurrencyNumber(item.budget3) : '',
      serviceValue: item.serviceValue != null ? formatCurrencyNumber(item.serviceValue) : '',
      winningCompany: item.winningCompany ?? '',
      nfReceived: item.nfReceived,
      nfDueDate: item.nfDueDate ?? '',
    })
    setOpen(true)
  }

  const handleDeleteConfirm = () => {
    void deleteDialog.confirm(async (item) => {
      if (!user) return
      await deleteFinanceItem(item.id, user.uid)
      toastMovedToTrash()
      await loadItems()
    })
  }

  const onSubmit = form.handleSubmit(async (values) => {
    if (!user || !visitId) return
    setSaving(true)
    const payload = {
      serviceName: values.serviceName,
      budget1: parseCurrencyInput(values.budget1),
      budget2: parseCurrencyInput(values.budget2),
      budget3: parseCurrencyInput(values.budget3),
      serviceValue: parseCurrencyInput(values.serviceValue),
      winningCompany: values.winningCompany,
      nfReceived: values.nfReceived,
      nfDueDate: values.nfDueDate || undefined,
    }
    try {
      let itemId = editing?.id

      if (editing) {
        await updateFinanceItem(editing.id, payload)
        itemId = editing.id
      } else {
        itemId = await createFinanceItem(user.uid, { visitId, ...payload })
      }

      if (itemId) {
        if (removePendingAttachment && editing?.attachmentPath) {
          await removeFinanceAttachment(editing)
        }
        if (payload.nfReceived && pendingNfFile) {
          await uploadFinanceAttachment(
            {
              ...(editing ?? {
                id: itemId,
                visitId,
                serviceName: payload.serviceName,
                nfReceived: payload.nfReceived,
                ownerId: user.uid,
              }),
              id: itemId,
              visitId,
              serviceName: payload.serviceName,
              nfReceived: payload.nfReceived,
            },
            pendingNfFile,
          )
        }
      }

      const visit = visits.find((v) => v.id === visitId)
      const nfDueDateSet = Boolean(payload.nfDueDate)
      const nfDueDateChanged =
        nfDueDateSet && payload.nfDueDate !== (editing?.nfDueDate ?? undefined)
      if (visit && nfDueDateSet && !payload.nfReceived && nfDueDateChanged) {
        try {
          await notifyVisitStakeholders(visit, {
            type: 'finance_nf_due',
            title: 'NF com vencimento definido',
            body: `"${payload.serviceName}" — vencimento em ${payload.nfDueDate}`,
            visitId,
            href: `/financeiro?visita=${visitId}`,
            actorId: user.uid,
            actorName: profile?.name,
          })
        } catch (error) {
          console.warn('Failed to send finance_nf_due notification', error)
        }
      }

      toast.success(editing ? 'Linha atualizada' : 'Linha adicionada')

      setOpen(false)
      setEditing(null)
      resetNfAttachmentState()
      form.reset({
        serviceName: '',
        budget1: '',
        budget2: '',
        budget3: '',
        serviceValue: '',
        winningCompany: '',
        nfReceived: false,
        nfDueDate: '',
      })
      await loadItems()
    } catch (error) {
      console.error(error)
      toast.error('Não foi possível salvar')
    } finally {
      setSaving(false)
    }
  })

  return (
    <div>
      <PageHeader
        title="Financeiro"
        description="Controle de gastos e status financeiro por visita"
        actions={
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <div className="space-y-1">
              <Label className="text-xs">Visita</Label>
              <Select
                value={visitId || '_unset'}
                onValueChange={(value) => {
                  if (value === '_unset') {
                    setSearchParams({})
                    return
                  }
                  setSearchParams({ visita: value })
                }}
              >
                <SelectTrigger className="w-full sm:w-72">
                  <SelectValue placeholder="Selecione uma visita" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_unset">Selecione uma visita</SelectItem>
                  {visits.map((visit) => (
                    <SelectItem key={visit.id} value={visit.id}>
                      {visit.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button disabled={!visitId || !canWrite} onClick={openCreate}>
              <Plus className="h-4 w-4" />
              Nova linha
            </Button>
          </div>
        }
      />

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Total geral (visita selecionada)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-3xl font-semibold">{formatCurrency(total)}</p>
        </CardContent>
      </Card>

      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {items.length} {items.length === 1 ? 'lançamento' : 'lançamentos'}
        </p>
        <div className="flex items-center gap-1 rounded-lg border bg-muted/30 p-1" aria-label="Modo de visualização">
          {([
            { value: 'table', label: 'Tabela', icon: List },
            { value: 'cards', label: 'Cards', icon: LayoutGrid },
            { value: 'invoice', label: 'Por nota fiscal', icon: Columns3 },
          ] as const).map(({ value, label, icon: Icon }) => (
            <Button key={value} type="button" variant={viewMode === value ? 'secondary' : 'ghost'} size="sm" className="gap-2" onClick={() => changeViewMode(value)} aria-pressed={viewMode === value}>
              <Icon className="h-4 w-4" />
              <span className="hidden sm:inline">{label}</span>
            </Button>
          ))}
        </div>
      </div>

      <Card className={viewMode === 'invoice' ? 'border-0 bg-transparent shadow-none' : undefined}>
        <CardHeader>
          <CardTitle className="text-base">
            Planilha de status financeiro
            {selectedVisit ? ` — ${selectedVisit.title}` : ''}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-4">
              <Skeleton className="h-40 w-full" />
            </div>
          ) : !visitId ? (
            <p className="p-6 text-sm text-muted-foreground">
              Selecione uma visita para visualizar a planilha.
            </p>
          ) : items.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">
              Nenhum item. Clique em &quot;Nova linha&quot; para adicionar.
            </p>
          ) : viewMode === 'cards' ? (
            <div className="grid gap-4 p-4 sm:grid-cols-2 xl:grid-cols-3">
              {items.map((item) => (
                <article key={item.id} className="flex min-h-64 flex-col rounded-xl border border-border/70 bg-card p-5 transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><ReceiptText className="h-5 w-5" /></div>
                    <span className={item.nfReceived ? 'rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-400' : 'rounded-full bg-amber-500/10 px-2.5 py-1 text-xs font-medium text-amber-700 dark:text-amber-400'}>
                      {item.nfReceived ? 'NF recebida' : 'NF pendente'}
                    </span>
                  </div>
                  <h2 className="mt-4 line-clamp-2 font-semibold">{item.serviceName}</h2>
                  <p className="mt-1 text-2xl font-semibold text-primary">{formatCurrency(item.serviceValue)}</p>
                  <div className="mt-4 space-y-2 text-sm text-muted-foreground">
                    <div className="flex items-center gap-2"><Building2 className="h-4 w-4" />{item.winningCompany || 'Empresa não informada'}</div>
                    <div className="flex items-center gap-2"><CalendarDays className="h-4 w-4" />Vencimento: {formatDate(item.nfDueDate)}</div>
                    {item.attachmentName ? <div className="flex items-center gap-2"><Paperclip className="h-4 w-4" /><span className="truncate">{item.attachmentName}</span></div> : null}
                  </div>
                  <div className="mt-4 border-t pt-4">
                    <FinanceFiles item={item} canWrite={canWrite} onChanged={loadItems} />
                  </div>
                  {canWrite ? (
                    <div className="mt-auto flex gap-2 pt-5">
                      <Button size="sm" variant="outline" className="flex-1" onClick={() => openEdit(item)}>Editar</Button>
                      <Button size="sm" variant="destructive" onClick={() => deleteDialog.requestDelete({ id: item.id, name: item.serviceName })}><Trash2 className="h-4 w-4" /><span className="sr-only">Excluir</span></Button>
                    </div>
                  ) : null}
                </article>
              ))}
            </div>
          ) : viewMode === 'invoice' ? (
            <div className="grid gap-4 lg:grid-cols-2">
              {([
                { received: false, title: 'Notas pendentes', icon: ReceiptText, tone: 'text-amber-600' },
                { received: true, title: 'Notas recebidas', icon: CheckCircle2, tone: 'text-emerald-600' },
              ] as const).map((group) => {
                const groupItems = items.filter((item) => item.nfReceived === group.received)
                const subtotal = groupItems.reduce((sum, item) => sum + (item.serviceValue ?? 0), 0)
                const Icon = group.icon
                return (
                  <section key={group.title} className="rounded-xl border bg-muted/20 p-3">
                    <header className="mb-3 flex items-start justify-between gap-3 px-1">
                      <div className="flex items-center gap-2"><Icon className={`h-4 w-4 ${group.tone}`} /><div><h2 className="text-sm font-semibold">{group.title}</h2><p className="text-xs text-muted-foreground">{formatCurrency(subtotal)}</p></div></div>
                      <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">{groupItems.length}</span>
                    </header>
                    <div className="space-y-3">
                      {groupItems.length === 0 ? <div className="rounded-lg border border-dashed p-6 text-center text-xs text-muted-foreground">Nenhum lançamento</div> : groupItems.map((item) => (
                        <article key={item.id} className="rounded-lg border bg-card p-4 shadow-sm transition-all hover:border-primary/30 hover:shadow-md">
                          <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate text-sm font-medium">{item.serviceName}</p><p className="mt-1 truncate text-xs text-muted-foreground">{item.winningCompany || 'Empresa não informada'}</p></div><p className="shrink-0 text-sm font-semibold">{formatCurrency(item.serviceValue)}</p></div>
                          <div className="mt-3 border-t pt-3">
                            <FinanceFiles item={item} canWrite={canWrite} onChanged={loadItems} />
                          </div>
                          <div className="mt-3 flex items-center justify-between gap-2 border-t pt-3"><span className="text-xs text-muted-foreground">Vencimento: {formatDate(item.nfDueDate)}</span>{canWrite ? <Button size="sm" variant="ghost" className="h-7" onClick={() => openEdit(item)}>Editar</Button> : null}</div>
                        </article>
                      ))}
                    </div>
                  </section>
                )
              })}
            </div>
          ) : (
            <>
            <div className="space-y-3 p-4 md:hidden">
              {items.map((item) => (
                <div key={item.id} className="rounded-lg border border-border p-4">
                  <p className="font-medium">{item.serviceName}</p>
                  <p className="mt-1 text-lg font-semibold">
                    {formatCurrency(item.serviceValue)}
                  </p>
                  <div className="mt-2 space-y-1 text-sm text-muted-foreground">
                    <p>Empresa: {item.winningCompany || '—'}</p>
                    <p>NF: {item.nfReceived ? 'Recebida' : 'Pendente'}</p>
                    <p>Vencimento: {formatDate(item.nfDueDate)}</p>
                    {item.attachmentName ? (
                      <p>Comprovante: {item.attachmentName}</p>
                    ) : null}
                  </div>
                  <div className="mt-4 border-t pt-4">
                    <FinanceFiles item={item} canWrite={canWrite} onChanged={loadItems} />
                  </div>
                  {canWrite ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button size="sm" variant="outline" onClick={() => openEdit(item)}>
                        Editar
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() =>
                          deleteDialog.requestDelete({ id: item.id, name: item.serviceName })
                        }
                      >
                        Excluir
                      </Button>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-max min-w-full text-sm">
                <thead className="border-y bg-muted/40 text-left text-muted-foreground">
                  <tr>
                    <th className="whitespace-nowrap px-4 py-3 font-medium">Serviços contratados</th>
                    <th className="whitespace-nowrap px-4 py-3 font-medium">Primeiro orçamento</th>
                    <th className="whitespace-nowrap px-4 py-3 font-medium">Segundo orçamento</th>
                    <th className="whitespace-nowrap px-4 py-3 font-medium">Terceiro orçamento</th>
                    <th className="whitespace-nowrap px-4 py-3 font-medium">Valor do serviço</th>
                    <th className="whitespace-nowrap px-4 py-3 font-medium">Empresa vencedora</th>
                    <th className="whitespace-nowrap px-4 py-3 font-medium">Nota fiscal recebida</th>
                    <th className="whitespace-nowrap px-4 py-3 font-medium">
                      Vencimento do pagamento da nota fiscal
                    </th>
                    <th className="whitespace-nowrap px-4 py-3 font-medium">Arquivos</th>
                    <th className="whitespace-nowrap px-4 py-3 text-center font-medium">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item.id} className="border-b last:border-0">
                      <td className="whitespace-nowrap px-4 py-3 font-medium">{item.serviceName}</td>
                      <td className="whitespace-nowrap px-4 py-3">{formatCurrency(item.budget1)}</td>
                      <td className="whitespace-nowrap px-4 py-3">{formatCurrency(item.budget2)}</td>
                      <td className="whitespace-nowrap px-4 py-3">{formatCurrency(item.budget3)}</td>
                      <td className="whitespace-nowrap px-4 py-3">{formatCurrency(item.serviceValue)}</td>
                      <td className="whitespace-nowrap px-4 py-3">{item.winningCompany || '—'}</td>
                      <td className="whitespace-nowrap px-4 py-3">{item.nfReceived ? 'Sim' : 'Não'}</td>
                      <td className="whitespace-nowrap px-4 py-3">{formatDate(item.nfDueDate)}</td>
                      <td className="px-4 py-3 align-top">
                        <FinanceFiles item={item} canWrite={canWrite} onChanged={loadItems} />
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <div className="flex items-center justify-center gap-1">
                          {canWrite ? (
                          <>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => openEdit(item)}
                          >
                            Editar
                          </Button>
                          <Button
                            size="icon"
                            variant="destructive"
                            onClick={() =>
                              deleteDialog.requestDelete({ id: item.id, name: item.serviceName })
                            }
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                          </>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            </>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={open}
        onOpenChange={(value) => {
          setOpen(value)
          if (!value) {
            setEditing(null)
            resetNfAttachmentState()
          }
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? 'Editar linha financeira' : 'Nova linha financeira'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={onSubmit} className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label>Serviço *</Label>
              <Input {...form.register('serviceName')} />
            </div>
            <div className="space-y-2">
              <Label>Orçamento 1</Label>
              <Input
                inputMode="decimal"
                placeholder="0,00"
                value={form.watch('budget1')}
                onChange={(e) => {
                  form.setValue('budget1', formatCurrencyInput(e.target.value), {
                    shouldDirty: true,
                  })
                }}
              />
            </div>
            <div className="space-y-2">
              <Label>Orçamento 2</Label>
              <Input
                inputMode="decimal"
                placeholder="0,00"
                value={form.watch('budget2')}
                onChange={(e) => {
                  form.setValue('budget2', formatCurrencyInput(e.target.value), {
                    shouldDirty: true,
                  })
                }}
              />
            </div>
            <div className="space-y-2">
              <Label>Orçamento 3</Label>
              <Input
                inputMode="decimal"
                placeholder="0,00"
                value={form.watch('budget3')}
                onChange={(e) => {
                  form.setValue('budget3', formatCurrencyInput(e.target.value), {
                    shouldDirty: true,
                  })
                }}
              />
            </div>
            <div className="space-y-2">
              <Label>Valor do serviço</Label>
              <Input
                inputMode="decimal"
                placeholder="0,00"
                value={form.watch('serviceValue')}
                onChange={(e) => {
                  form.setValue('serviceValue', formatCurrencyInput(e.target.value), {
                    shouldDirty: true,
                  })
                }}
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>Empresa vencedora</Label>
              <Input {...form.register('winningCompany')} />
            </div>
            <div className="space-y-2">
              <Label>Venc. pagamento NF</Label>
              <Input type="date" {...form.register('nfDueDate')} />
            </div>
            <label className="flex items-center gap-2 self-end text-sm">
              <Checkbox
                checked={form.watch('nfReceived')}
                onCheckedChange={(checked) => {
                  const received = checked === true
                  form.setValue('nfReceived', received)
                  if (!received) {
                    setPendingNfFile(null)
                    setRemovePendingAttachment(false)
                    if (nfFileInputRef.current) nfFileInputRef.current.value = ''
                  }
                }}
              />
              NF recebida
            </label>
            {form.watch('nfReceived') ? (
            <div className="space-y-2 sm:col-span-2">
              <Label>Arquivo da NF (opcional)</Label>
              <p className="text-xs text-muted-foreground">
                Envie a nota fiscal em PDF, JPG ou PNG. Máximo 10 MB.
              </p>
              {editing?.attachmentPath && !removePendingAttachment && !pendingNfFile ? (
                <div className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm">
                  <span className="min-w-0 truncate">{editing.attachmentName}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setRemovePendingAttachment(true)}
                  >
                    Remover
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  <label className="inline-flex cursor-pointer items-center justify-center rounded-lg border border-[#f0c27a] bg-[#fff3e0] px-4 py-2 text-sm font-medium text-[#a65f00] transition-colors hover:bg-[#ffe8c7]">
                    <input
                      ref={nfFileInputRef}
                      type="file"
                      accept=".pdf,.jpg,.jpeg,.png,.webp"
                      className="sr-only"
                      onChange={(e) => {
                        const file = e.target.files?.[0] ?? null
                        setPendingNfFile(file)
                        if (file) setRemovePendingAttachment(false)
                      }}
                    />
                    Escolher arquivo
                  </label>
                  {pendingNfFile ? (
                    <div className="flex cursor-default items-center justify-between gap-2 rounded-lg border bg-muted/30 px-3 py-2 text-sm">
                      <span className="min-w-0 truncate">{pendingNfFile.name}</span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setPendingNfFile(null)
                          if (nfFileInputRef.current) nfFileInputRef.current.value = ''
                        }}
                      >
                        Remover
                      </Button>
                    </div>
                  ) : null}
                </div>
              )}
            </div>
            ) : null}
            <div className="flex justify-end gap-2 sm:col-span-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? 'Salvando...' : 'Salvar'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDeleteDialog
        open={deleteDialog.open}
        onOpenChange={deleteDialog.handleOpenChange}
        itemName={deleteDialog.target?.name}
        loading={deleteDialog.loading}
        onConfirm={handleDeleteConfirm}
      />
    </div>
  )
}
