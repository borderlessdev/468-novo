import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useAuth } from '@/contexts/AuthContext'
import { useVisitDialog } from '@/contexts/VisitDialogContext'
import { BRAZILIAN_STATES, DEFAULT_CHECKLIST } from '@/lib/constants'
import {
  quickVisitorSchema,
  visitSchema,
  type QuickVisitorInput,
  type VisitInput,
} from '@/lib/validations'
import { createVisit } from '@/services/visits'
import { createVisitor, listVisitors } from '@/services/visitors'
import { linkVisitorToVisit } from '@/services/visitVisitors'
import { createTasksBatch } from '@/services/tasks'
import type { Visitor } from '@/types'
import { Search, UserPlus, X } from 'lucide-react'

interface NewVisitDialogProps {
  onCreated?: () => void
}

export function NewVisitDialog({ onCreated }: NewVisitDialogProps) {
  const { open, setOpen } = useVisitDialog()
  const { user, isAdmin } = useAuth()
  const [saving, setSaving] = useState(false)
  const [visitors, setVisitors] = useState<Visitor[]>([])
  const [selectedVisitors, setSelectedVisitors] = useState<Visitor[]>([])
  const [search, setSearch] = useState('')
  const [searchResults, setSearchResults] = useState<Visitor[]>([])

  const form = useForm<VisitInput>({
    resolver: zodResolver(visitSchema),
    defaultValues: {
      title: '',
      company: '',
      state: '',
      city: '',
      startDate: '',
      endDate: '',
      status: 'planejamento',
      objective: '',
      startWithChecklist: true,
    },
  })

  const quickForm = useForm<QuickVisitorInput>({
    resolver: zodResolver(quickVisitorSchema),
    defaultValues: { name: '', document: '', company: '' },
  })

  useEffect(() => {
    if (!open || !user) return
    void listVisitors(user.uid, isAdmin).then(setVisitors)
  }, [open, user, isAdmin])

  const handleSearch = () => {
    const term = search.trim().toLowerCase()
    if (!term) {
      setSearchResults([])
      return
    }
    setSearchResults(
      visitors.filter(
        (v) =>
          v.name.toLowerCase().includes(term) ||
          v.document.toLowerCase().includes(term),
      ),
    )
  }

  const addVisitor = (visitor: Visitor) => {
    if (selectedVisitors.some((v) => v.id === visitor.id)) return
    setSelectedVisitors((prev) => [...prev, visitor])
  }

  const removeVisitor = (id: string) => {
    setSelectedVisitors((prev) => prev.filter((v) => v.id !== id))
  }

  const onQuickCreate = quickForm.handleSubmit(async (values) => {
    if (!user) return
    try {
      const id = await createVisitor(user.uid, {
        name: values.name,
        document: values.document,
        company: values.company,
      })
      const created: Visitor = {
        id,
        name: values.name,
        document: values.document,
        company: values.company,
        ownerId: user.uid,
      }
      setVisitors((prev) => [...prev, created])
      addVisitor(created)
      quickForm.reset()
      toast.success('Visitante criado e adicionado')
    } catch (error) {
      console.error(error)
      toast.error('Não foi possível criar o visitante')
    }
  })

  const onSubmit = form.handleSubmit(async (values) => {
    if (!user) return
    setSaving(true)
    try {
      const visitId = await createVisit(user.uid, {
        title: values.title,
        company: values.company,
        state: values.state,
        city: values.city,
        startDate: values.startDate,
        endDate: values.endDate,
        status: values.status,
        objective: values.objective,
        progress: 0,
        teamMemberIds: [],
      })

      await Promise.all(
        selectedVisitors.map((visitor) =>
          linkVisitorToVisit(user.uid, visitId, visitor.id),
        ),
      )

      if (values.startWithChecklist) {
        await createTasksBatch(user.uid, visitId, DEFAULT_CHECKLIST)
      }

      toast.success('Visita criada com sucesso')
      form.reset()
      setSelectedVisitors([])
      setSearch('')
      setSearchResults([])
      setOpen(false)
      onCreated?.()
    } catch (error) {
      console.error(error)
      const code = (error as { code?: string }).code
      toast.error(
        code === 'permission-denied'
          ? 'Sem permissão no Firestore. Confirme se as regras foram publicadas.'
          : 'Não foi possível criar a visita',
      )
    } finally {
      setSaving(false)
    }
  })

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle>Nova Visita</DialogTitle>
          <DialogDescription>
            Preencha os dados da visita e associe visitantes.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="title">Título da visita *</Label>
              <Input id="title" {...form.register('title')} />
              {form.formState.errors.title ? (
                <p className="text-xs text-destructive">{form.formState.errors.title.message}</p>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="company">Empresa</Label>
              <Input id="company" {...form.register('company')} />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Estado</Label>
                <Select
                  value={form.watch('state') || '_unset'}
                  onValueChange={(value) =>
                    form.setValue('state', value === '_unset' ? '' : value)
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="UF" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_unset">UF</SelectItem>
                    {BRAZILIAN_STATES.map((uf) => (
                      <SelectItem key={uf} value={uf}>
                        {uf}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="city">Local / Cidade</Label>
                <Input id="city" {...form.register('city')} />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="startDate">Data início *</Label>
                <Input id="startDate" type="date" {...form.register('startDate')} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="endDate">Data fim *</Label>
                <Input id="endDate" type="date" {...form.register('endDate')} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select
                value={form.watch('status')}
                onValueChange={(value) =>
                  form.setValue('status', value as VisitInput['status'])
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="planejamento">PLANEJAMENTO</SelectItem>
                  <SelectItem value="em_andamento">EM ANDAMENTO</SelectItem>
                  <SelectItem value="concluida">CONCLUÍDA</SelectItem>
                  <SelectItem value="cancelada">CANCELADA</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="objective">Objetivo</Label>
              <Input id="objective" {...form.register('objective')} />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={form.watch('startWithChecklist')}
                onCheckedChange={(checked) =>
                  form.setValue('startWithChecklist', checked === true)
                }
              />
              Iniciar com check-list básico
            </label>
          </div>

          <div className="space-y-4 rounded-xl border border-border bg-muted/30 p-4">
            <div>
              <h3 className="font-semibold">Visitantes desta visita</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Busque visitantes existentes ou cadastre um novo rapidamente.
              </p>
            </div>

            <div className="flex gap-2">
              <Input
                placeholder="Buscar por nome ou documento"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <Button type="button" variant="outline" onClick={handleSearch}>
                <Search className="h-4 w-4" />
                Buscar
              </Button>
            </div>

            {searchResults.length > 0 ? (
              <div className="space-y-2">
                {searchResults.map((visitor) => (
                  <button
                    key={visitor.id}
                    type="button"
                    onClick={() => addVisitor(visitor)}
                    className="flex w-full items-center justify-between rounded-lg border bg-card px-3 py-2 text-left text-sm hover:bg-muted"
                  >
                    <span>
                      {visitor.name}
                      <span className="ml-2 text-muted-foreground">{visitor.document}</span>
                    </span>
                    <UserPlus className="h-4 w-4" />
                  </button>
                ))}
              </div>
            ) : null}

            {selectedVisitors.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {selectedVisitors.map((visitor) => (
                  <span
                    key={visitor.id}
                    className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-3 py-1 text-xs text-primary"
                  >
                    {visitor.name}
                    <button type="button" onClick={() => removeVisitor(visitor.id)}>
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            ) : null}

            <div className="space-y-3 border-t border-border pt-4">
              <h4 className="text-sm font-medium">Cadastrar novo visitante rápido</h4>
              <div className="space-y-2">
                <Label>Nome do visitante *</Label>
                <Input {...quickForm.register('name')} />
              </div>
              <div className="space-y-2">
                <Label>Documento (CPF/passaporte) *</Label>
                <Input {...quickForm.register('document')} />
              </div>
              <div className="space-y-2">
                <Label>Empresa (opcional)</Label>
                <Input {...quickForm.register('company')} />
              </div>
              <Button type="button" variant="secondary" onClick={onQuickCreate}>
                Criar e adicionar à visita
              </Button>
            </div>
          </div>

          <div className="flex justify-end gap-2 lg:col-span-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? 'Salvando...' : 'Salvar visita'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
