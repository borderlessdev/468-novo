import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { Plus, Trash2, Paperclip } from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
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
import { financeItemSchema, parseOptionalNumber, type FinanceItemInput } from '@/lib/validations'
import { formatCurrency, formatDate } from '@/lib/utils'
import { listVisits } from '@/services/visits'
import {
  createFinanceItem,
  deleteFinanceItem,
  getFinanceAttachmentUrl,
  listFinanceItems,
  removeFinanceAttachment,
  updateFinanceItem,
  uploadFinanceAttachment,
} from '@/services/finance'
import type { FinanceItem, Visit } from '@/types'

export function FinancePage() {
  const { user, isAdmin, role, canWrite } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const [visits, setVisits] = useState<Visit[]>([])
  const [items, setItems] = useState<FinanceItem[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<FinanceItem | null>(null)
  const [saving, setSaving] = useState(false)

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
  }, [user, isAdmin])

  const loadItems = useCallback(async () => {
    if (!visitId || !user) {
      setItems([])
      return
    }
    try {
      setItems(await listFinanceItems(visitId, user.uid, isAdmin))
    } catch (error) {
      console.error(error)
      toast.error('Erro ao carregar financeiro')
    }
  }, [visitId, user, isAdmin])

  useEffect(() => {
    void loadItems()
  }, [loadItems])

  const total = useMemo(
    () => items.reduce((sum, item) => sum + (item.serviceValue ?? 0), 0),
    [items],
  )

  const openCreate = () => {
    setEditing(null)
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
    form.reset({
      serviceName: item.serviceName,
      budget1: item.budget1 != null ? String(item.budget1) : '',
      budget2: item.budget2 != null ? String(item.budget2) : '',
      budget3: item.budget3 != null ? String(item.budget3) : '',
      serviceValue: item.serviceValue != null ? String(item.serviceValue) : '',
      winningCompany: item.winningCompany ?? '',
      nfReceived: item.nfReceived,
      nfDueDate: item.nfDueDate ?? '',
    })
    setOpen(true)
  }

  const onSubmit = form.handleSubmit(async (values) => {
    if (!user || !visitId) return
    setSaving(true)
    const payload = {
      serviceName: values.serviceName,
      budget1: parseOptionalNumber(values.budget1),
      budget2: parseOptionalNumber(values.budget2),
      budget3: parseOptionalNumber(values.budget3),
      serviceValue: parseOptionalNumber(values.serviceValue),
      winningCompany: values.winningCompany,
      nfReceived: values.nfReceived,
      nfDueDate: values.nfDueDate || undefined,
    }
    try {
      if (editing) {
        await updateFinanceItem(editing.id, payload)
        toast.success('Linha atualizada')
      } else {
        await createFinanceItem(user.uid, { visitId, ...payload })
        toast.success('Linha adicionada')
      }
      setOpen(false)
      setEditing(null)
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

      <Card>
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
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="border-y bg-muted/40 text-left text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-medium">Serviços contratados</th>
                    <th className="px-4 py-3 font-medium">Orçamento 1</th>
                    <th className="px-4 py-3 font-medium">Orçamento 2</th>
                    <th className="px-4 py-3 font-medium">Orçamento 3</th>
                    <th className="px-4 py-3 font-medium">Valor do serviço</th>
                    <th className="px-4 py-3 font-medium">Empresa vencedora</th>
                    <th className="px-4 py-3 font-medium">NF recebida</th>
                    <th className="px-4 py-3 font-medium">Venc. pagamento NF</th>
                    <th className="px-4 py-3 font-medium">Comprovante</th>
                    <th className="px-4 py-3 font-medium">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item.id} className="border-b last:border-0">
                      <td className="px-4 py-3 font-medium">{item.serviceName}</td>
                      <td className="px-4 py-3">{formatCurrency(item.budget1)}</td>
                      <td className="px-4 py-3">{formatCurrency(item.budget2)}</td>
                      <td className="px-4 py-3">{formatCurrency(item.budget3)}</td>
                      <td className="px-4 py-3">{formatCurrency(item.serviceValue)}</td>
                      <td className="px-4 py-3">{item.winningCompany || '—'}</td>
                      <td className="px-4 py-3">{item.nfReceived ? 'Sim' : 'Não'}</td>
                      <td className="px-4 py-3">{formatDate(item.nfDueDate)}</td>
                      <td className="px-4 py-3">
                        {item.attachmentName ? (
                          <Button
                            size="sm"
                            variant="link"
                            className="h-auto p-0"
                            onClick={() => {
                              void (async () => {
                                if (!item.attachmentPath) return
                                const url = await getFinanceAttachmentUrl(item.attachmentPath)
                                window.open(url, '_blank', 'noopener,noreferrer')
                              })()
                            }}
                          >
                            {item.attachmentName}
                          </Button>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1">
                          {canWrite ? (
                          <>
                          <label
                            title="Anexar comprovante"
                            className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-md hover:bg-muted"
                          >
                            <input
                              type="file"
                              accept=".pdf,.jpg,.jpeg,.png,.webp"
                              className="hidden"
                              onChange={(e) => {
                                const file = e.target.files?.[0]
                                if (!file) return
                                void (async () => {
                                  try {
                                    await uploadFinanceAttachment(item, file)
                                    toast.success('Comprovante anexado')
                                    await loadItems()
                                  } catch (error) {
                                    toast.error(
                                      error instanceof Error ? error.message : 'Falha no upload',
                                    )
                                  }
                                  e.target.value = ''
                                })()
                              }}
                            />
                            <Paperclip className="h-4 w-4" />
                          </label>
                          {item.attachmentPath ? (
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => {
                                void (async () => {
                                  await removeFinanceAttachment(item)
                                  toast.success('Comprovante removido')
                                  await loadItems()
                                })()
                              }}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          ) : null}
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => openEdit(item)}
                          >
                            Editar
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => {
                              void (async () => {
                                await deleteFinanceItem(item.id)
                                toast.success('Linha removida')
                                await loadItems()
                              })()
                            }}
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
          )}
        </CardContent>
      </Card>

      <Dialog
        open={open}
        onOpenChange={(value) => {
          setOpen(value)
          if (!value) setEditing(null)
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
              <Input type="number" step="0.01" {...form.register('budget1')} />
            </div>
            <div className="space-y-2">
              <Label>Orçamento 2</Label>
              <Input type="number" step="0.01" {...form.register('budget2')} />
            </div>
            <div className="space-y-2">
              <Label>Orçamento 3</Label>
              <Input type="number" step="0.01" {...form.register('budget3')} />
            </div>
            <div className="space-y-2">
              <Label>Valor do serviço</Label>
              <Input type="number" step="0.01" {...form.register('serviceValue')} />
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
                onCheckedChange={(checked) =>
                  form.setValue('nfReceived', checked === true)
                }
              />
              NF recebida
            </label>
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
    </div>
  )
}
