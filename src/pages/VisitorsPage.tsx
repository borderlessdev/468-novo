import { useCallback, useEffect, useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { toastMovedToTrash } from '@/lib/toast'
import { Building2, Columns3, Gift, Globe2, LayoutGrid, List, Plus, Search, Utensils, Users } from 'lucide-react'
import { Link } from 'react-router-dom'
import { PageHeader, EmptyState } from '@/components/shared/PageHeader'
import { ConfirmDeleteDialog, useConfirmDelete } from '@/components/shared/ConfirmDeleteDialog'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useAuth } from '@/contexts/AuthContext'
import { visitorSchema, parseOptionalNumber, type VisitorInput } from '@/lib/validations'
import { formatWeightKgInput, formatWeightKgNumber, parseWeightKg } from '@/lib/utils'
import { createVisitor, deleteVisitor, listVisitors, updateVisitor } from '@/services/visitors'
import { listVisitIdsForVisitor } from '@/services/visitVisitors'
import { getVisit } from '@/services/visits'
import type { Visitor } from '@/types'

type ViewMode = 'table' | 'cards' | 'company'

export function VisitorsPage() {
  const { user, isAdmin, role, canWrite } = useAuth()
  const [loading, setLoading] = useState(true)
  const [visitors, setVisitors] = useState<Visitor[]>([])
  const [search, setSearch] = useState('')
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    const saved = localStorage.getItem('visitors-view-mode')
    return saved === 'table' || saved === 'cards' || saved === 'company' ? saved : 'table'
  })
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Visitor | null>(null)
  const [visitHistory, setVisitHistory] = useState<{ id: string; title: string }[]>([])
  const [saving, setSaving] = useState(false)
  const [gifts, setGifts] = useState<{ name: string; quantity: string; notes: string }[]>([])
  const deleteDialog = useConfirmDelete<{ id: string; name: string }>()

  const changeViewMode = (mode: ViewMode) => {
    setViewMode(mode)
    localStorage.setItem('visitors-view-mode', mode)
  }

  const form = useForm<VisitorInput>({
    resolver: zodResolver(visitorSchema),
    defaultValues: {
      name: '',
      document: '',
      company: '',
      role: '',
      country: 'Brasil',
      weightKg: '',
      shoeSize: '',
      dietaryRestriction: '',
      notes: '',
      language: '',
      mobilityReduced: false,
    },
  })

  const load = useCallback(async (options?: { showLoading?: boolean }) => {
    if (!user) return
    const showLoading = options?.showLoading ?? false
    if (showLoading) setLoading(true)
    try {
      setVisitors(await listVisitors(user.uid, isAdmin))
    } catch (error) {
      console.error(error)
      toast.error('Erro ao carregar visitantes')
    } finally {
      if (showLoading) setLoading(false)
    }
  }, [user, isAdmin])

  useEffect(() => {
    void load({ showLoading: true })
  }, [load])

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return visitors
    return visitors.filter(
      (v) =>
        v.name.toLowerCase().includes(term) ||
        v.document.toLowerCase().includes(term) ||
        (v.company ?? '').toLowerCase().includes(term) ||
        (v.gifts ?? []).some((g) => g.name.toLowerCase().includes(term)),
    )
  }, [visitors, search])

  const openCreate = () => {
    if (!canWrite) return
    setEditing(null)
    setVisitHistory([])
    setGifts([])
    form.reset({
      name: '',
      document: '',
      company: '',
      role: '',
      country: 'Brasil',
      weightKg: '',
      shoeSize: '',
      dietaryRestriction: '',
      notes: '',
      language: '',
      mobilityReduced: false,
    })
    setOpen(true)
  }

  const openEdit = async (visitor: Visitor) => {
    if (!canWrite) return
    setEditing(visitor)
    setGifts(
      (visitor.gifts ?? []).map((g) => ({
        name: g.name,
        quantity: g.quantity != null ? String(g.quantity) : '',
        notes: g.notes ?? '',
      })),
    )
    form.reset({
      name: visitor.name,
      document: visitor.document,
      company: visitor.company ?? '',
      role: visitor.role ?? '',
      country: visitor.country ?? '',
      weightKg: visitor.weightKg != null ? formatWeightKgNumber(visitor.weightKg) : '',
      shoeSize: visitor.shoeSize != null ? String(visitor.shoeSize) : '',
      dietaryRestriction: visitor.dietaryRestriction ?? '',
      notes: visitor.notes ?? '',
      language: visitor.language ?? '',
      mobilityReduced: visitor.mobilityReduced ?? false,
    })
    setOpen(true)
    if (user) {
      try {
        const ids = await listVisitIdsForVisitor(visitor.id, user.uid, isAdmin, role)
        const visits = await Promise.all(ids.map((id) => getVisit(id)))
        setVisitHistory(
          visits
            .filter(Boolean)
            .map((v) => ({ id: v!.id, title: v!.title })),
        )
      } catch {
        setVisitHistory([])
      }
    }
  }

  const onSubmit = form.handleSubmit(async (values) => {
    if (!user || !canWrite) return
    setSaving(true)
    const payload = {
      name: values.name,
      document: values.document,
      company: values.company,
      role: values.role,
      country: values.country,
      weightKg: parseWeightKg(values.weightKg),
      shoeSize: parseOptionalNumber(values.shoeSize),
      dietaryRestriction: values.dietaryRestriction,
      language: values.language,
      mobilityReduced: values.mobilityReduced,
      notes: values.notes,
      gifts: gifts
        .filter((g) => g.name.trim())
        .map((g) => ({
          name: g.name.trim(),
          quantity: parseOptionalNumber(g.quantity),
          notes: g.notes || undefined,
        })),
    }
    try {
      if (editing) {
        await updateVisitor(editing.id, payload)
        toast.success('Visitante atualizado')
      } else {
        await createVisitor(user.uid, payload)
        toast.success('Visitante criado')
      }
      setOpen(false)
      await load()
    } catch (error) {
      console.error(error)
      toast.error('Não foi possível salvar')
    } finally {
      setSaving(false)
    }
  })

  const handleDeleteConfirm = () => {
    void deleteDialog.confirm(async (item) => {
      if (!user || !canWrite) return
      try {
        await deleteVisitor(item.id, user.uid)
        toastMovedToTrash('Visitante movido para a lixeira')
        await load()
      } catch (error) {
        console.error(error)
        toast.error('Não foi possível excluir')
        throw error
      }
    })
  }

  return (
    <div>
      <PageHeader
        title="CRM de Visitantes"
        description="Base de dados de todos os visitantes"
        actions={
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9 sm:w-80"
                placeholder="Buscar por nome ou documento"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            {canWrite ? (
              <Button onClick={openCreate}>
                <Plus className="h-4 w-4" />
                Novo visitante
              </Button>
            ) : null}
          </div>
        }
      />

      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {filtered.length} {filtered.length === 1 ? 'visitante' : 'visitantes'}
        </p>
        <div className="flex items-center gap-1 rounded-lg border bg-muted/30 p-1" aria-label="Modo de visualização">
          {([
            { value: 'table', label: 'Tabela', icon: List },
            { value: 'cards', label: 'Cards', icon: LayoutGrid },
            { value: 'company', label: 'Por empresa', icon: Columns3 },
          ] as const).map(({ value, label, icon: Icon }) => (
            <Button
              key={value}
              type="button"
              variant={viewMode === value ? 'secondary' : 'ghost'}
              size="sm"
              className="gap-2"
              onClick={() => changeViewMode(value)}
              aria-pressed={viewMode === value}
            >
              <Icon className="h-4 w-4" />
              <span className="hidden sm:inline">{label}</span>
            </Button>
          ))}
        </div>
      </div>

      <Card className={viewMode === 'company' ? 'border-0 bg-transparent shadow-none' : undefined}>
        <CardContent className="p-0">
          {loading ? (
            <div className="space-y-3 p-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-4">
              <EmptyState
                icon={Users}
                title="Nenhum visitante"
                description="Cadastre visitantes para associá-los às visitas."
                action={
                  canWrite ? (
                    <Button onClick={openCreate}>
                      <Plus className="h-4 w-4" />
                      Novo visitante
                    </Button>
                  ) : undefined
                }
              />
            </div>
          ) : viewMode === 'cards' ? (
            <div className="grid gap-4 p-4 sm:grid-cols-2 xl:grid-cols-3">
              {filtered.map((visitor) => (
                <article key={visitor.id} className="flex min-h-56 flex-col rounded-xl border border-border/70 bg-card p-5 transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md">
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 font-semibold text-primary">
                      {visitor.name.trim().charAt(0).toUpperCase() || '?'}
                    </div>
                    <div className="min-w-0">
                      <h2 className="truncate font-semibold">{visitor.name}</h2>
                      <p className="truncate text-sm text-muted-foreground">{visitor.role || 'Cargo não informado'}</p>
                    </div>
                  </div>
                  <div className="mt-5 space-y-2 text-sm text-muted-foreground">
                    <div className="flex items-center gap-2"><Building2 className="h-4 w-4" />{visitor.company || 'Empresa não informada'}</div>
                    <div className="flex items-center gap-2"><Globe2 className="h-4 w-4" />{visitor.country || 'País não informado'}</div>
                    {visitor.dietaryRestriction ? <div className="flex items-start gap-2 text-amber-700 dark:text-amber-400"><Utensils className="mt-0.5 h-4 w-4 shrink-0" />{visitor.dietaryRestriction}</div> : null}
                    {(visitor.gifts?.length ?? 0) > 0 ? <div className="flex items-start gap-2 text-primary"><Gift className="mt-0.5 h-4 w-4 shrink-0" />{visitor.gifts!.map((gift) => gift.name).join(', ')}</div> : null}
                  </div>
                  {canWrite ? (
                    <div className="mt-auto flex gap-2 pt-5">
                      <Button size="sm" variant="outline" className="flex-1" onClick={() => void openEdit(visitor)}>Editar</Button>
                      <Button size="sm" variant="destructive" className="flex-1" onClick={() => deleteDialog.requestDelete({ id: visitor.id, name: visitor.name })}>Excluir</Button>
                    </div>
                  ) : null}
                </article>
              ))}
            </div>
          ) : viewMode === 'company' ? (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {Array.from(new Set(filtered.map((visitor) => visitor.company?.trim() || 'Sem empresa')))
                .sort((a, b) => a.localeCompare(b, 'pt-BR'))
                .map((company) => {
                  const companyVisitors = filtered.filter((visitor) => (visitor.company?.trim() || 'Sem empresa') === company)
                  return (
                    <section key={company} className="rounded-xl border bg-muted/20 p-3">
                      <header className="mb-3 flex items-center justify-between gap-2 px-1">
                        <div className="flex min-w-0 items-center gap-2">
                          <Building2 className="h-4 w-4 shrink-0 text-primary" />
                          <h2 className="truncate text-sm font-semibold">{company}</h2>
                        </div>
                        <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">{companyVisitors.length}</span>
                      </header>
                      <div className="space-y-3">
                        {companyVisitors.map((visitor) => (
                          <article key={visitor.id} className="rounded-lg border bg-card p-3 shadow-sm transition-all hover:border-primary/30 hover:shadow-md">
                            <div className="flex items-start gap-2">
                              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">{visitor.name.trim().charAt(0).toUpperCase() || '?'}</div>
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-medium">{visitor.name}</p>
                                <p className="truncate text-xs text-muted-foreground">{visitor.role || visitor.country || 'Sem detalhes'}</p>
                              </div>
                            </div>
                            {canWrite ? (
                              <div className="mt-3 flex gap-2 border-t pt-3">
                                <Button size="sm" variant="ghost" className="h-7 flex-1" onClick={() => void openEdit(visitor)}>Editar</Button>
                                <Button size="sm" variant="ghost" className="h-7 flex-1 text-destructive hover:text-destructive" onClick={() => deleteDialog.requestDelete({ id: visitor.id, name: visitor.name })}>Excluir</Button>
                              </div>
                            ) : null}
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
              {filtered.map((visitor) => (
                <div
                  key={visitor.id}
                  className="rounded-lg border border-border p-4"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium">{visitor.name}</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {visitor.company || '—'}
                        {visitor.role ? ` · ${visitor.role}` : ''}
                      </p>
                      {(visitor.gifts?.length ?? 0) > 0 ? (
                        <p className="mt-1 text-xs text-primary">
                          {visitor.gifts!.length} brinde(s):{' '}
                          {visitor.gifts!.map((g) => g.name).join(', ')}
                        </p>
                      ) : null}
                      <p className="mt-1 text-xs text-muted-foreground">
                        {visitor.country || 'Brasil'}
                        {visitor.dietaryRestriction
                          ? ` · ${visitor.dietaryRestriction}`
                          : ''}
                      </p>
                    </div>
                  </div>
                  {canWrite ? (
                    <div className="mt-3 flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-1"
                        onClick={() => void openEdit(visitor)}
                      >
                        Editar
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        className="flex-1"
                        onClick={() => deleteDialog.requestDelete({ id: visitor.id, name: visitor.name })}
                      >
                        Excluir
                      </Button>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
            <div className="hidden overflow-x-auto md:block">
              <table className="min-w-full text-sm">
                <thead className="border-b bg-muted/40 text-left text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-medium">Nome</th>
                    <th className="px-4 py-3 font-medium">Empresa</th>
                    <th className="px-4 py-3 font-medium">Cargo</th>
                    <th className="px-4 py-3 font-medium">País</th>
                    <th className="px-4 py-3 font-medium">Peso</th>
                    <th className="px-4 py-3 font-medium">Nº calçado</th>
                    <th className="px-4 py-3 font-medium">Restrição alimentar</th>
                    <th className="px-4 py-3 font-medium">Brindes</th>
                    {canWrite ? (
                      <th className="px-4 py-3 font-medium">Ações</th>
                    ) : null}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((visitor) => (
                    <tr key={visitor.id} className="border-b last:border-0">
                      <td className="px-4 py-3 font-medium">{visitor.name}</td>
                      <td className="px-4 py-3">{visitor.company || '—'}</td>
                      <td className="px-4 py-3">{visitor.role || '—'}</td>
                      <td className="px-4 py-3">{visitor.country || '—'}</td>
                      <td className="px-4 py-3">
                        {visitor.weightKg != null ? `${formatWeightKgNumber(visitor.weightKg)} kg` : '—'}
                      </td>
                      <td className="px-4 py-3">{visitor.shoeSize ?? '—'}</td>
                      <td className="px-4 py-3">
                        {visitor.dietaryRestriction || 'Nenhuma'}
                      </td>
                      <td className="px-4 py-3">
                        {(visitor.gifts?.length ?? 0) > 0
                          ? visitor.gifts!.map((g) => g.name).join(', ')
                          : '—'}
                      </td>
                      {canWrite ? (
                        <td className="px-4 py-3">
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => void openEdit(visitor)}
                            >
                              Editar
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => deleteDialog.requestDelete({ id: visitor.id, name: visitor.name })}
                            >
                              Excluir
                            </Button>
                          </div>
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            </>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editing ? 'Editar visitante' : 'Novo visitante'}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={onSubmit} className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label>Nome *</Label>
              <Input {...form.register('name')} />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>Documento *</Label>
              <Input {...form.register('document')} />
            </div>
            <div className="space-y-2">
              <Label>Empresa</Label>
              <Input {...form.register('company')} />
            </div>
            <div className="space-y-2">
              <Label>Cargo</Label>
              <Input {...form.register('role')} />
            </div>
            <div className="space-y-2">
              <Label>País</Label>
              <Input {...form.register('country')} />
            </div>
            <div className="space-y-2">
              <Label>Peso (kg)</Label>
              <Input
                inputMode="decimal"
                placeholder="0,0"
                value={form.watch('weightKg')}
                onChange={(e) => {
                  form.setValue('weightKg', formatWeightKgInput(e.target.value), {
                    shouldDirty: true,
                  })
                }}
              />
            </div>
            <div className="space-y-2">
              <Label>Nº calçado</Label>
              <Input type="number" {...form.register('shoeSize')} />
            </div>
            <div className="space-y-2">
              <Label>Restrição alimentar</Label>
              <Input {...form.register('dietaryRestriction')} />
            </div>
            <div className="space-y-2">
              <Label>Idioma</Label>
              <Input {...form.register('language')} placeholder="Português, Inglês..." />
            </div>
            <label className="flex items-center gap-2 text-sm sm:col-span-2">
              <Checkbox
                checked={form.watch('mobilityReduced')}
                onCheckedChange={(checked) =>
                  form.setValue('mobilityReduced', checked === true)
                }
              />
              Mobilidade reduzida
            </label>
            <div className="space-y-2 sm:col-span-2">
              <Label>Observações</Label>
              <Textarea {...form.register('notes')} rows={3} />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <div className="flex items-center justify-between">
                <Label>Brindes</Label>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    setGifts((prev) => [...prev, { name: '', quantity: '', notes: '' }])
                  }
                >
                  Adicionar
                </Button>
              </div>
              {gifts.length === 0 ? (
                <p className="text-xs text-muted-foreground">Nenhum brinde cadastrado.</p>
              ) : (
                <div className="space-y-2">
                  {gifts.map((gift, index) => (
                    <div key={index} className="grid gap-2 rounded-lg border p-2 sm:grid-cols-3">
                      <Input
                        placeholder="Nome"
                        value={gift.name}
                        onChange={(e) =>
                          setGifts((prev) =>
                            prev.map((g, i) =>
                              i === index ? { ...g, name: e.target.value } : g,
                            ),
                          )
                        }
                      />
                      <Input
                        placeholder="Qtd"
                        value={gift.quantity}
                        onChange={(e) =>
                          setGifts((prev) =>
                            prev.map((g, i) =>
                              i === index ? { ...g, quantity: e.target.value } : g,
                            ),
                          )
                        }
                      />
                      <div className="flex gap-2">
                        <Input
                          placeholder="Obs"
                          value={gift.notes}
                          onChange={(e) =>
                            setGifts((prev) =>
                              prev.map((g, i) =>
                                i === index ? { ...g, notes: e.target.value } : g,
                              ),
                            )
                          }
                        />
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => setGifts((prev) => prev.filter((_, i) => i !== index))}
                        >
                          Remover
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            {editing && visitHistory.length > 0 ? (
              <div className="space-y-2 sm:col-span-2">
                <Label>Histórico de visitas</Label>
                <ul className="space-y-1 rounded-lg border p-3 text-sm">
                  {visitHistory.map((visit) => (
                    <li key={visit.id}>
                      <Link to={`/visitas/${visit.id}`} className="text-primary hover:underline">
                        {visit.title}
                      </Link>
                    </li>
                  ))}
                </ul>
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
