import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { toastMovedToTrash } from '@/lib/toast'
import { Plus, Trash2, Paperclip } from 'lucide-react'
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
  updateFinanceItem,
  uploadFinanceAttachment,
} from '@/services/finance'
import { notifyVisitStakeholders } from '@/services/notifications'
import type { FinanceItem, Visit } from '@/types'

export function FinancePage() {
  const { user, isAdmin, role, canWrite, profile } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const [visits, setVisits] = useState<Visit[]>([])
  const [items, setItems] = useState<FinanceItem[]>([])
  const [loading, setLoading] = useState(true)
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
                  {canWrite ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button size="sm" variant="outline" onClick={() => openEdit(item)}>
                        Editar
                      </Button>
                      <label className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted">
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
                        Anexar
                      </label>
                      {item.attachmentPath ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            void (async () => {
                              await removeFinanceAttachment(item)
                              toast.success('Comprovante removido')
                              await loadItems()
                            })()
                          }}
                        >
                          Remover anexo
                        </Button>
                      ) : null}
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
                    <th className="whitespace-nowrap px-4 py-3 font-medium">Comprovante da nota fiscal</th>
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
                      <td className="whitespace-nowrap px-4 py-3">
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
                      <td className="whitespace-nowrap px-4 py-3">
                        <div className="flex items-center justify-center gap-1">
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
