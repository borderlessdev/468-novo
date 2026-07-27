import { useCallback, useEffect, useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { Plus, Search, Users } from 'lucide-react'
import { PageHeader, EmptyState } from '@/components/shared/PageHeader'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useAuth } from '@/contexts/AuthContext'
import { visitorSchema, parseOptionalNumber, type VisitorInput } from '@/lib/validations'
import { createVisitor, deleteVisitor, listVisitors, updateVisitor } from '@/services/visitors'
import type { Visitor } from '@/types'

export function VisitorsPage() {
  const { user, isAdmin } = useAuth()
  const [loading, setLoading] = useState(true)
  const [visitors, setVisitors] = useState<Visitor[]>([])
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Visitor | null>(null)
  const [saving, setSaving] = useState(false)

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
    },
  })

  const load = useCallback(async () => {
    if (!user) return
    setLoading(true)
    try {
      setVisitors(await listVisitors(user.uid, isAdmin))
    } catch (error) {
      console.error(error)
      toast.error('Erro ao carregar visitantes')
    } finally {
      setLoading(false)
    }
  }, [user, isAdmin])

  useEffect(() => {
    void load()
  }, [load])

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return visitors
    return visitors.filter(
      (v) =>
        v.name.toLowerCase().includes(term) ||
        v.document.toLowerCase().includes(term) ||
        (v.company ?? '').toLowerCase().includes(term),
    )
  }, [visitors, search])

  const openCreate = () => {
    setEditing(null)
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
    })
    setOpen(true)
  }

  const openEdit = (visitor: Visitor) => {
    setEditing(visitor)
    form.reset({
      name: visitor.name,
      document: visitor.document,
      company: visitor.company ?? '',
      role: visitor.role ?? '',
      country: visitor.country ?? '',
      weightKg: visitor.weightKg != null ? String(visitor.weightKg) : '',
      shoeSize: visitor.shoeSize != null ? String(visitor.shoeSize) : '',
      dietaryRestriction: visitor.dietaryRestriction ?? '',
      notes: visitor.notes ?? '',
    })
    setOpen(true)
  }

  const onSubmit = form.handleSubmit(async (values) => {
    if (!user) return
    setSaving(true)
    const payload = {
      name: values.name,
      document: values.document,
      company: values.company,
      role: values.role,
      country: values.country,
      weightKg: parseOptionalNumber(values.weightKg),
      shoeSize: parseOptionalNumber(values.shoeSize),
      dietaryRestriction: values.dietaryRestriction,
      notes: values.notes,
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

  const onDelete = async (id: string) => {
    if (!confirm('Excluir este visitante?')) return
    try {
      await deleteVisitor(id)
      toast.success('Visitante excluído')
      await load()
    } catch (error) {
      console.error(error)
      toast.error('Não foi possível excluir')
    }
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
                className="pl-9 sm:w-64"
                placeholder="Buscar por nome ou documento"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <Button onClick={openCreate}>
              <Plus className="h-4 w-4" />
              Novo visitante
            </Button>
          </div>
        }
      />

      <Card>
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
                  <Button onClick={openCreate}>
                    <Plus className="h-4 w-4" />
                    Novo visitante
                  </Button>
                }
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
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
                    <th className="px-4 py-3 font-medium">Ações</th>
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
                        {visitor.weightKg != null ? `${visitor.weightKg} kg` : '—'}
                      </td>
                      <td className="px-4 py-3">{visitor.shoeSize ?? '—'}</td>
                      <td className="px-4 py-3">
                        {visitor.dietaryRestriction || 'Nenhuma'}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => openEdit(visitor)}
                          >
                            Editar
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => void onDelete(visitor.id)}
                          >
                            Excluir
                          </Button>
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
              <Input type="number" step="0.1" {...form.register('weightKg')} />
            </div>
            <div className="space-y-2">
              <Label>Nº calçado</Label>
              <Input type="number" {...form.register('shoeSize')} />
            </div>
            <div className="space-y-2">
              <Label>Restrição alimentar</Label>
              <Input {...form.register('dietaryRestriction')} />
            </div>
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
