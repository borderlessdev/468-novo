import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { PageHeader, EmptyState } from '@/components/shared/PageHeader'
import { Plus, Receipt, Trash2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useAuth } from '@/contexts/AuthContext'
import { useOrg } from '@/contexts/OrgContext'
import { formatCurrency } from '@/lib/utils'
import {
  computeLineAmount,
  createBudget,
  createBudgetItem,
  decideBudgetItem,
  deleteBudget,
  deleteBudgetItem,
  listBudgetItems,
  listBudgetsByOrg,
  listPublishedBudgetItemsForClient,
  listPublishedBudgetsForClient,
  publishBudget,
  reviseBudgetItem,
  updateBudgetItem,
} from '@/services/budgets'
import { listOrganizationMembers } from '@/services/organizations'
import { listVisits } from '@/services/visits'
import type { Budget, BudgetDecision, BudgetItem, OrganizationMember, Visit } from '@/types'

const DECISION_LABEL: Record<BudgetDecision, string> = {
  pending: 'Pendente',
  approved: 'Aprovado',
  rejected: 'Rejeitado',
  changes_requested: 'Mudanças solicitadas',
}

function decisionVariant(decision: BudgetDecision): 'secondary' | 'default' | 'warning' | 'outline' | 'success' {
  if (decision === 'approved') return 'success'
  if (decision === 'rejected') return 'warning'
  if (decision === 'changes_requested') return 'outline'
  return 'secondary'
}

function money(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return '—'
  return formatCurrency(value)
}

export function BudgetPage() {
  const { user, role, isPlatformAdmin } = useAuth()
  const { activeOrgId } = useOrg()
  const isClient = !isPlatformAdmin && role === 'client'
  const [budgets, setBudgets] = useState<Budget[]>([])
  const [items, setItems] = useState<BudgetItem[]>([])
  const [visits, setVisits] = useState<Visit[]>([])
  const [clients, setClients] = useState<OrganizationMember[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [visitId, setVisitId] = useState('')
  const [clientUserId, setClientUserId] = useState('')
  const [description, setDescription] = useState('')
  const [quantity, setQuantity] = useState('1')
  const [unitAmount, setUnitAmount] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [changeNote, setChangeNote] = useState('')
  const [pendingDecision, setPendingDecision] = useState<{
    item: BudgetItem
    decision: 'approved' | 'rejected' | 'changes_requested'
  } | null>(null)

  const selected = budgets.find((budget) => budget.id === selectedId) ?? null
  const visit = visits.find((item) => item.id === (selected?.visitId ?? visitId))
  const client = clients.find((item) => item.uid === (selected?.clientUserId ?? clientUserId))
  const locked = selected?.status === 'published'
  const revisingAfterRequest = Boolean(
    editingId && items.some((item) => item.id === editingId && item.decision === 'changes_requested'),
  )
  const total = items.reduce((sum, item) => sum + item.lineAmount, 0)
  const approvedTotal = items
    .filter((item) => item.decision === 'approved')
    .reduce((sum, item) => sum + item.lineAmount, 0)

  const loadBudgets = useCallback(async () => {
    if (!user || !activeOrgId) return
    setLoading(true)
    try {
      const [budgetResult, visitResult, memberResult] = await Promise.allSettled([
        isClient
          ? listPublishedBudgetsForClient(activeOrgId, user.uid)
          : listBudgetsByOrg(activeOrgId),
        listVisits(activeOrgId, user.uid, isPlatformAdmin, role),
        isClient ? Promise.resolve([]) : listOrganizationMembers(activeOrgId),
      ])
      if (budgetResult.status === 'fulfilled') {
        setBudgets(budgetResult.value)
        setSelectedId((current) => current || budgetResult.value[0]?.id || '')
      } else {
        console.error(budgetResult.reason)
        toast.error('Não foi possível carregar os orçamentos')
      }
      if (visitResult.status === 'fulfilled') {
        setVisits(visitResult.value)
      } else {
        console.error(visitResult.reason)
        toast.error('Não foi possível carregar as visitas')
      }
      if (memberResult.status === 'fulfilled') {
        setClients(memberResult.value.filter((member) => member.orgRole === 'client'))
      } else {
        console.error(memberResult.reason)
        toast.error('Não foi possível carregar os clientes')
      }
    } catch (error) {
      console.error(error)
      toast.error('Não foi possível carregar os orçamentos')
    } finally {
      setLoading(false)
    }
  }, [user, activeOrgId, isClient, isPlatformAdmin, role])

  const loadItems = useCallback(async () => {
    if (!selected || !user) {
      setItems([])
      return
    }
    try {
      setItems(
        isClient
          ? await listPublishedBudgetItemsForClient(selected.id, selected.orgId, user.uid)
          : await listBudgetItems(selected.id, selected.orgId),
      )
    } catch (error) {
      console.error(error)
      toast.error('Não foi possível carregar os itens')
    }
  }, [selected, user, isClient])

  useEffect(() => {
    void loadBudgets()
  }, [loadBudgets])

  useEffect(() => {
    void loadItems()
  }, [loadItems])

  const visitTitle = useMemo(() => visit?.title ?? 'Visita', [visit])

  const resetItemForm = () => {
    setEditingId(null)
    setDescription('')
    setQuantity('1')
    setUnitAmount('')
  }

  const handleCreateBudget = async () => {
    if (!user || !activeOrgId || !visitId || !clientUserId) return
    setSaving(true)
    try {
      const id = await createBudget({
        orgId: activeOrgId,
        visitId,
        clientUserId,
        createdBy: user.uid,
      })
      toast.success('Orçamento criado')
      setVisitId('')
      setClientUserId('')
      await loadBudgets()
      setSelectedId(id)
    } catch (error) {
      console.error(error)
      toast.error(error instanceof Error ? error.message : 'Não foi possível criar o orçamento')
    } finally {
      setSaving(false)
    }
  }

  const handleSaveItem = async () => {
    if (!selected) return
    if (locked && !revisingAfterRequest) return
    const parsedQuantity = Number(quantity.replace(',', '.'))
    const parsedUnit = Number(unitAmount.replace(',', '.'))
    setSaving(true)
    try {
      if (editingId && revisingAfterRequest) {
        await reviseBudgetItem(editingId, {
          description,
          quantity: parsedQuantity,
          unitAmount: parsedUnit,
        })
        toast.success('Item atualizado — aguardando nova decisão do cliente')
      } else if (editingId) {
        await updateBudgetItem(editingId, {
          description,
          quantity: parsedQuantity,
          unitAmount: parsedUnit,
        })
        toast.success('Item atualizado')
      } else {
        await createBudgetItem({
          budgetId: selected.id,
          orgId: selected.orgId,
          visitId: selected.visitId,
          clientUserId: selected.clientUserId,
          description,
          quantity: parsedQuantity,
          unitAmount: parsedUnit,
        })
        toast.success('Item adicionado')
      }
      resetItemForm()
      await loadItems()
    } catch (error) {
      console.error(error)
      toast.error(error instanceof Error ? error.message : 'Não foi possível salvar o item')
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteItem = async (item: BudgetItem) => {
    if (locked) return
    setSaving(true)
    try {
      await deleteBudgetItem(item.id)
      toast.success('Item removido')
      await loadItems()
    } catch (error) {
      console.error(error)
      toast.error('Não foi possível remover o item')
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteBudget = async () => {
    if (!selected || locked) return
    setSaving(true)
    try {
      await deleteBudget(selected.id, selected.orgId)
      toast.success('Orçamento removido')
      setSelectedId('')
      await loadBudgets()
    } catch (error) {
      console.error(error)
      toast.error('Não foi possível remover o orçamento')
    } finally {
      setSaving(false)
    }
  }

  const handlePublish = async () => {
    if (!selected) return
    setSaving(true)
    try {
      await publishBudget(selected.id)
      toast.success('Orçamento disponibilizado ao cliente')
      await loadBudgets()
      await loadItems()
    } catch (error) {
      console.error(error)
      toast.error(error instanceof Error ? error.message : 'Não foi possível publicar')
    } finally {
      setSaving(false)
    }
  }

  const handleConfirmDecision = async () => {
    if (!pendingDecision) return
    if (pendingDecision.decision === 'changes_requested' && changeNote.trim().length < 3) {
      toast.error('Descreva a mudança desejada')
      return
    }
    setSaving(true)
    try {
      const result = await decideBudgetItem(
        pendingDecision.item.id,
        pendingDecision.decision,
        pendingDecision.decision === 'changes_requested' ? changeNote.trim() : undefined,
      )
      if (pendingDecision.decision === 'approved' && result.integrationStatus !== 'created') {
        toast.error('A decisão foi salva, mas o lançamento financeiro não foi criado. Tente novamente.')
      } else {
        toast.success(
          pendingDecision.decision === 'approved'
            ? 'Item aprovado'
            : pendingDecision.decision === 'rejected'
              ? 'Item rejeitado'
              : 'Pedido de mudança enviado',
        )
      }
      setPendingDecision(null)
      setChangeNote('')
      await loadItems()
    } catch (error) {
      console.error(error)
      toast.error(error instanceof Error ? error.message : 'Não foi possível registrar a decisão')
      await loadItems()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Orçamento"
        description={
          isClient
            ? 'Consulte o orçamento disponibilizado. Você pode aprovar, rejeitar ou solicitar mudanças em cada item.'
            : 'Monte a estimativa inicial da visita e disponibilize ao cliente. As cotações de fornecedores continuam no Financeiro.'
        }
      />

      {loading ? <p className="text-sm text-muted-foreground">Carregando…</p> : null}

      {!isClient && !loading ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Novo orçamento</CardTitle>
            <CardDescription>Vincule uma visita da empresa a um cliente já cadastrado.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Visita, evento ou projeto</Label>
              <Select value={visitId} onValueChange={setVisitId}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {visits.map((item) => (
                    <SelectItem key={item.id} value={item.id}>{item.title}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Cliente</Label>
              <Select value={clientUserId} onValueChange={setClientUserId}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {clients.map((item) => (
                    <SelectItem key={item.uid} value={item.uid}>{item.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              className="sm:col-span-2 w-fit"
              disabled={saving || !visitId || !clientUserId}
              onClick={() => void handleCreateBudget()}
            >
              Criar rascunho
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {loading ? <p className="text-sm text-muted-foreground">Carregando…</p> : null}

      {!loading && budgets.length === 0 ? (
        <EmptyState
          icon={Receipt}
          title={isClient ? 'Nenhum orçamento disponível' : 'Nenhum orçamento nesta empresa'}
          description={
            isClient
              ? 'Quando a equipe publicar um orçamento da sua visita, ele aparece aqui para você aprovar ou rejeitar cada item.'
              : 'Crie um rascunho, informe os itens e só então disponibilize ao cliente.'
          }
        />
      ) : null}

      {budgets.length > 0 ? (
        <Card>
          <CardHeader className="gap-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <CardTitle className="text-base">{visitTitle}</CardTitle>
                <CardDescription>
                  {client ? `Cliente: ${client.name}` : 'Cliente vinculado'}
                  {' · '}
                  {selected?.status === 'published' ? 'Disponibilizado' : 'Rascunho'}
                </CardDescription>
              </div>
              <Select value={selectedId} onValueChange={setSelectedId}>
                <SelectTrigger className="sm:w-72"><SelectValue placeholder="Orçamento" /></SelectTrigger>
                <SelectContent>
                  {budgets.map((budget) => {
                    const budgetVisit = visits.find((item) => item.id === budget.visitId)
                    return (
                      <SelectItem key={budget.id} value={budget.id}>
                        {budgetVisit?.title ?? 'Visita'} · {budget.status === 'published' ? 'Publicado' : 'Rascunho'}
                      </SelectItem>
                    )
                  })}
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl bg-muted/40 px-4 py-3">
                <p className="text-xs text-muted-foreground">Total orçado</p>
                <p className="mt-1 text-lg font-semibold">{money(total)}</p>
              </div>
              <div className="rounded-xl bg-muted/40 px-4 py-3">
                <p className="text-xs text-muted-foreground">Aprovado pelo cliente</p>
                <p className="mt-1 text-lg font-semibold">{money(approvedTotal)}</p>
              </div>
              <div className="rounded-xl bg-muted/40 px-4 py-3">
                <p className="text-xs text-muted-foreground">Itens pendentes</p>
                <p className="mt-1 text-lg font-semibold">{items.filter((item) => item.decision === 'pending').length}</p>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="py-2 pr-3 font-medium">Descrição</th>
                    <th className="py-2 pr-3 font-medium">Qtd.</th>
                    <th className="py-2 pr-3 font-medium">Valor unitário</th>
                    <th className="py-2 pr-3 font-medium">Total</th>
                    <th className="py-2 pr-3 font-medium">Situação</th>
                    <th className="py-2 font-medium">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {items.length === 0 ? (
                    <tr>
                      <td className="py-4 text-muted-foreground" colSpan={6}>Nenhum item neste orçamento.</td>
                    </tr>
                  ) : items.map((item) => (
                    <tr key={item.id} className="border-b">
                      <td className="py-2 pr-3">{item.description}</td>
                      <td className="py-2 pr-3">{item.quantity}</td>
                      <td className="py-2 pr-3">{money(item.unitAmount)}</td>
                      <td className="py-2 pr-3">{money(item.lineAmount)}</td>
                      <td className="py-2 pr-3">
                        <Badge variant={decisionVariant(item.decision)}>{DECISION_LABEL[item.decision]}</Badge>
                        {item.decision === 'changes_requested' && item.changeRequestNote ? (
                          <p className="mt-1 max-w-xs text-xs text-muted-foreground">
                            Pedido: {item.changeRequestNote}
                          </p>
                        ) : null}
                        {item.integrationStatus === 'failed' ? (
                          <p className="mt-1 text-xs text-destructive">Falha ao criar o lançamento financeiro</p>
                        ) : null}
                      </td>
                      <td className="py-2">
                        {isClient && item.decision === 'pending' ? (
                          <div className="flex flex-wrap gap-2">
                            <Button size="sm" disabled={saving} onClick={() => { setChangeNote(''); setPendingDecision({ item, decision: 'approved' }) }}>Aprovar</Button>
                            <Button size="sm" variant="outline" disabled={saving} onClick={() => { setChangeNote(''); setPendingDecision({ item, decision: 'rejected' }) }}>Rejeitar</Button>
                            <Button size="sm" variant="secondary" disabled={saving} onClick={() => { setChangeNote(''); setPendingDecision({ item, decision: 'changes_requested' }) }}>Solicitar mudanças</Button>
                          </div>
                        ) : null}
                        {isClient && item.decision === 'approved' && item.integrationStatus === 'failed' ? (
                          <Button size="sm" variant="outline" disabled={saving} onClick={() => setPendingDecision({ item, decision: 'approved' })}>
                            Tentar novamente
                          </Button>
                        ) : null}
                        {!isClient && (!locked || item.decision === 'changes_requested') ? (
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setEditingId(item.id)
                                setDescription(item.description)
                                setQuantity(String(item.quantity))
                                setUnitAmount(String(item.unitAmount))
                              }}
                            >
                              {item.decision === 'changes_requested' ? 'Responder pedido' : 'Editar'}
                            </Button>
                            {!locked ? (
                              <Button size="sm" variant="ghost" onClick={() => void handleDeleteItem(item)}>
                                <Trash2 className="size-3.5" />
                              </Button>
                            ) : null}
                          </div>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {!isClient && selected && (!locked || revisingAfterRequest) ? (
              <form
                className="grid gap-3 border-t pt-4 sm:grid-cols-4"
                onSubmit={(event) => {
                  event.preventDefault()
                  void handleSaveItem()
                }}
              >
                {revisingAfterRequest ? (
                  <p className="sm:col-span-4 text-sm text-muted-foreground">
                    Ajuste o item conforme o pedido do cliente. Ao salvar, a linha volta para pendente para nova decisão.
                  </p>
                ) : null}
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="budget-description">Descrição</Label>
                  <Input id="budget-description" value={description} onChange={(event) => setDescription(event.target.value)} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="budget-quantity">Quantidade</Label>
                  <Input id="budget-quantity" inputMode="decimal" value={quantity} onChange={(event) => setQuantity(event.target.value)} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="budget-unit">Valor unitário</Label>
                  <Input id="budget-unit" inputMode="decimal" value={unitAmount} onChange={(event) => setUnitAmount(event.target.value)} required />
                </div>
                <p className="sm:col-span-4 text-xs text-muted-foreground">
                  Total da linha: {money(computeLineAmount(Number(quantity.replace(',', '.')) || 0, Number(unitAmount.replace(',', '.')) || 0))}
                </p>
                <div className="flex flex-wrap gap-2 sm:col-span-4">
                  <Button type="submit" disabled={saving}>
                    <Plus className="size-4" />
                    {revisingAfterRequest ? 'Enviar revisão ao cliente' : editingId ? 'Salvar item' : 'Adicionar item'}
                  </Button>
                  {revisingAfterRequest ? (
                    <Button type="button" variant="ghost" disabled={saving} onClick={resetItemForm}>
                      Cancelar revisão
                    </Button>
                  ) : null}
                  {!locked ? (
                    <>
                      <Button type="button" variant="outline" disabled={saving || items.length === 0} onClick={() => void handlePublish()}>
                        Disponibilizar ao cliente
                      </Button>
                      <Button type="button" variant="ghost" disabled={saving} onClick={() => void handleDeleteBudget()}>
                        Excluir rascunho
                      </Button>
                    </>
                  ) : null}
                </div>
              </form>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      <Dialog open={Boolean(pendingDecision)} onOpenChange={(open) => { if (!open) { setPendingDecision(null); setChangeNote('') } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {pendingDecision?.decision === 'approved'
                ? 'Aprovar item'
                : pendingDecision?.decision === 'rejected'
                  ? 'Rejeitar item'
                  : 'Solicitar mudanças'}
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {pendingDecision?.item.integrationStatus === 'failed'
              ? `Tentar de novo a criação do lançamento financeiro de "${pendingDecision.item.description}"? A aprovação já está registrada.`
              : pendingDecision?.decision === 'changes_requested'
                ? `Descreva o que precisa mudar em "${pendingDecision.item.description}". A equipe poderá revisar e devolver a linha para nova decisão.`
                : pendingDecision
                  ? `Confirmar ${pendingDecision.decision === 'approved' ? 'a aprovação' : 'a rejeição'} de "${pendingDecision.item.description}"? Essa decisão não poderá ser desfeita.`
                  : null}
          </p>
          {pendingDecision?.decision === 'changes_requested' ? (
            <div className="space-y-2">
              <Label htmlFor="change-note">O que você gostaria de alterar?</Label>
              <Textarea
                id="change-note"
                value={changeNote}
                onChange={(event) => setChangeNote(event.target.value)}
                placeholder="Ex.: reduzir quantidade, trocar descrição, ajustar valor…"
                rows={3}
              />
            </div>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => { setPendingDecision(null); setChangeNote('') }}>Cancelar</Button>
            <Button disabled={saving} onClick={() => void handleConfirmDecision()}>
              {saving ? 'Salvando...' : 'Confirmar'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
