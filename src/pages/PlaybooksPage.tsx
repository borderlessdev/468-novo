import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import {
  ChevronDown,
  ChevronUp,
  ClipboardList,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react'
import { PageHeader, EmptyState } from '@/components/shared/PageHeader'
import { ConfirmDeleteDialog, useConfirmDelete } from '@/components/shared/ConfirmDeleteDialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { useAuth } from '@/contexts/AuthContext'
import { useOrg } from '@/contexts/OrgContext'
import {
  DOCUMENT_CATEGORIES,
  PLAYBOOK_ITEM_KINDS,
  PLAYBOOK_PHASES,
} from '@/lib/constants'
import { playbookSchema } from '@/lib/validations'
import {
  createPlaybook,
  deletePlaybook,
  listPlaybooks,
  updatePlaybook,
} from '@/services/playbooks'
import type {
  DocumentCategory,
  Playbook,
  PlaybookItem,
  PlaybookItemKind,
  PlaybookPhase,
} from '@/types'

type PlaybookDraft = {
  name: string
  visitType: string
  description: string
  items: PlaybookItem[]
}

const emptyDraft = (): PlaybookDraft => ({
  name: '',
  visitType: '',
  description: '',
  items: [],
})

function newItem(order: number): PlaybookItem {
  return {
    id: crypto.randomUUID(),
    kind: 'task',
    phase: 'preparacao',
    title: '',
    offsetDays: 0,
    order,
  }
}

function kindLabel(kind: PlaybookItemKind) {
  return PLAYBOOK_ITEM_KINDS.find((item) => item.value === kind)?.label ?? kind
}

function phaseLabel(phase: PlaybookPhase) {
  return PLAYBOOK_PHASES.find((item) => item.value === phase)?.label ?? phase
}

function formatOffset(days: number) {
  if (days === 0) return 'no dia da visita'
  if (days > 0) return `${days} dia${days === 1 ? '' : 's'} depois`
  const abs = Math.abs(days)
  return `${abs} dia${abs === 1 ? '' : 's'} antes`
}

export function PlaybooksPage() {
  const { user, canWrite, isClient } = useAuth()
  const { activeOrgId } = useOrg()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [playbooks, setPlaybooks] = useState<Playbook[]>([])
  const [editorOpen, setEditorOpen] = useState(false)
  const [editing, setEditing] = useState<Playbook | null>(null)
  const [draft, setDraft] = useState<PlaybookDraft>(emptyDraft)
  const [formError, setFormError] = useState<string | null>(null)
  const deleteDialog = useConfirmDelete<Playbook>()

  const load = useCallback(async () => {
    if (!user || !activeOrgId) return
    setLoading(true)
    try {
      setPlaybooks(await listPlaybooks(activeOrgId))
    } catch (error) {
      console.error(error)
      toast.error('Erro ao carregar playbooks')
    } finally {
      setLoading(false)
    }
  }, [user, activeOrgId])

  useEffect(() => {
    void load()
  }, [load])

  const openCreate = () => {
    setEditing(null)
    setDraft(emptyDraft())
    setFormError(null)
    setEditorOpen(true)
  }

  const openEdit = (playbook: Playbook) => {
    setEditing(playbook)
    setDraft({
      name: playbook.name,
      visitType: playbook.visitType,
      description: playbook.description ?? '',
      items: playbook.items.map((item, index) => ({ ...item, order: index })),
    })
    setFormError(null)
    setEditorOpen(true)
  }

  const updateItem = (id: string, patch: Partial<PlaybookItem>) => {
    setDraft((prev) => ({
      ...prev,
      items: prev.items.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    }))
  }

  const moveItem = (index: number, direction: -1 | 1) => {
    setDraft((prev) => {
      const next = [...prev.items]
      const target = index + direction
      if (target < 0 || target >= next.length) return prev
      const [removed] = next.splice(index, 1)
      next.splice(target, 0, removed)
      return { ...prev, items: next.map((item, order) => ({ ...item, order })) }
    })
  }

  const handleSave = async () => {
    if (!user) return
    setFormError(null)
    const parsed = playbookSchema.safeParse({
      name: draft.name.trim(),
      visitType: draft.visitType.trim(),
      description: draft.description.trim() || undefined,
      items: draft.items.map((item, order) => ({
        ...item,
        title: item.title.trim(),
        description: item.description?.trim() || undefined,
        assigneeName: item.assigneeName?.trim() || undefined,
        location: item.kind === 'activity' ? item.location?.trim() || undefined : undefined,
        startTime: item.kind === 'activity' ? item.startTime || undefined : undefined,
        durationMinutes:
          item.kind === 'activity' && item.durationMinutes
            ? item.durationMinutes
            : undefined,
        documentCategory: item.kind === 'document' ? item.documentCategory ?? 'outro' : undefined,
        order,
      })),
    })
    if (!parsed.success) {
      setFormError(parsed.error.issues[0]?.message ?? 'Revise os campos do playbook')
      return
    }

    if (!user || !activeOrgId) return

    setSaving(true)
    try {
      const payload = {
        name: parsed.data.name,
        visitType: parsed.data.visitType,
        description: parsed.data.description,
        items: parsed.data.items.map((item, order) => ({
          ...item,
          order,
        })),
      }
      if (editing) {
        await updatePlaybook(editing.id, payload)
        toast.success('Playbook atualizado')
      } else {
        await createPlaybook(user.uid, activeOrgId, payload)
        toast.success('Playbook criado')
      }
      setEditorOpen(false)
      setEditing(null)
      await load()
    } catch (error) {
      console.error(error)
      toast.error('Não foi possível salvar o playbook')
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteConfirm = () => {
    void deleteDialog.confirm(async (item) => {
      try {
        await deletePlaybook(item.id)
        toast.success('Playbook excluído')
        await load()
      } catch (error) {
        console.error(error)
        toast.error('Não foi possível excluir o playbook')
        throw error
      }
    })
  }

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Playbooks"
        description="Modelos operacionais por tipo de visita. A aplicação na visita entra no dia 2."
        actions={
          <div className="flex flex-wrap gap-2">
            {canWrite && !isClient ? (
              <Button onClick={openCreate}>
                <Plus className="h-4 w-4" />
                Novo playbook
              </Button>
            ) : null}
          </div>
        }
      />

      {loading ? (
        <div className="grid gap-4 md:grid-cols-2">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-36 w-full rounded-xl" />
          ))}
        </div>
      ) : playbooks.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title="Nenhum playbook"
          description="Crie um modelo operacional com tarefas, atividades e documentos para reutilizar nas visitas."
          action={
            canWrite && !isClient ? (
              <Button onClick={openCreate}>
                <Plus className="h-4 w-4" />
                Novo playbook
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {playbooks.map((playbook) => (
            <Card key={playbook.id}>
              <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
                <div className="min-w-0 space-y-1">
                  <CardTitle className="truncate text-base">{playbook.name}</CardTitle>
                  <p className="text-sm text-muted-foreground">{playbook.visitType}</p>
                </div>
                <Badge variant="secondary">{playbook.items.length} itens</Badge>
              </CardHeader>
              <CardContent className="space-y-3">
                {playbook.description ? (
                  <p className="line-clamp-2 text-sm text-muted-foreground">
                    {playbook.description}
                  </p>
                ) : null}
                <div className="flex flex-wrap gap-1.5">
                  {PLAYBOOK_PHASES.map((phase) => {
                    const count = playbook.items.filter((item) => item.phase === phase.value).length
                    if (!count) return null
                    return (
                      <Badge key={phase.value} variant="outline">
                        {phase.label}: {count}
                      </Badge>
                    )
                  })}
                </div>
                {canWrite && !isClient ? (
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => openEdit(playbook)}>
                      <Pencil className="h-3.5 w-3.5" />
                      Editar
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => deleteDialog.requestDelete(playbook)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Excluir
                    </Button>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{editing ? 'Editar playbook' : 'Novo playbook'}</DialogTitle>
            <DialogDescription>
              Defina o tipo de visita e os itens com prazo relativo à data de início.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="playbook-name">Nome</Label>
              <Input
                id="playbook-name"
                value={draft.name}
                onChange={(event) => setDraft((prev) => ({ ...prev, name: event.target.value }))}
                placeholder="Visita institucional"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="playbook-type">Tipo de visita</Label>
              <Input
                id="playbook-type"
                value={draft.visitType}
                onChange={(event) =>
                  setDraft((prev) => ({ ...prev, visitType: event.target.value }))
                }
                placeholder="Institucional"
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="playbook-description">Descrição</Label>
              <Textarea
                id="playbook-description"
                value={draft.description}
                onChange={(event) =>
                  setDraft((prev) => ({ ...prev, description: event.target.value }))
                }
                placeholder="Quando usar este modelo operacional"
              />
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <Label>Itens</Label>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() =>
                  setDraft((prev) => ({
                    ...prev,
                    items: [...prev.items, newItem(prev.items.length)],
                  }))
                }
              >
                <Plus className="h-3.5 w-3.5" />
                Adicionar item
              </Button>
            </div>

            {draft.items.length === 0 ? (
              <p className="rounded-lg border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
                Nenhum item. Adicione tarefas, atividades ou documentos.
              </p>
            ) : (
              <div className="space-y-3">
                {draft.items.map((item, index) => (
                  <div key={item.id} className="space-y-3 rounded-xl border p-3">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-medium">
                        {item.title.trim() || `Item ${index + 1}`}
                        <span className="ml-2 font-normal text-muted-foreground">
                          {kindLabel(item.kind)} · {phaseLabel(item.phase)} ·{' '}
                          {formatOffset(item.offsetDays)}
                        </span>
                      </p>
                      <div className="flex shrink-0 gap-1">
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8"
                          disabled={index === 0}
                          onClick={() => moveItem(index, -1)}
                          aria-label="Mover para cima"
                        >
                          <ChevronUp className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8"
                          disabled={index === draft.items.length - 1}
                          onClick={() => moveItem(index, 1)}
                          aria-label="Mover para baixo"
                        >
                          <ChevronDown className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8"
                          onClick={() =>
                            setDraft((prev) => ({
                              ...prev,
                              items: prev.items
                                .filter((current) => current.id !== item.id)
                                .map((current, order) => ({ ...current, order })),
                            }))
                          }
                          aria-label="Remover item"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-2 sm:col-span-2">
                        <Label htmlFor={`item-title-${item.id}`}>Título</Label>
                        <Input
                          id={`item-title-${item.id}`}
                          value={item.title}
                          onChange={(event) => updateItem(item.id, { title: event.target.value })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Tipo</Label>
                        <Select
                          value={item.kind}
                          onValueChange={(value) =>
                            updateItem(item.id, { kind: value as PlaybookItemKind })
                          }
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {PLAYBOOK_ITEM_KINDS.map((kind) => (
                              <SelectItem key={kind.value} value={kind.value}>
                                {kind.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Fase</Label>
                        <Select
                          value={item.phase}
                          onValueChange={(value) =>
                            updateItem(item.id, { phase: value as PlaybookPhase })
                          }
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {PLAYBOOK_PHASES.map((phase) => (
                              <SelectItem key={phase.value} value={phase.value}>
                                {phase.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor={`item-offset-${item.id}`}>Prazo relativo (dias)</Label>
                        <Input
                          id={`item-offset-${item.id}`}
                          type="number"
                          step={1}
                          value={item.offsetDays}
                          onChange={(event) =>
                            updateItem(item.id, {
                              offsetDays: Number(event.target.value || 0),
                            })
                          }
                        />
                        <p className="text-xs text-muted-foreground">
                          Negativo = antes da visita. Ex.: -7 é uma semana antes.
                        </p>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor={`item-assignee-${item.id}`}>Responsável</Label>
                        <Input
                          id={`item-assignee-${item.id}`}
                          value={item.assigneeName ?? ''}
                          onChange={(event) =>
                            updateItem(item.id, { assigneeName: event.target.value })
                          }
                          placeholder="Nome livre"
                        />
                      </div>
                      {item.kind === 'activity' ? (
                        <>
                          <div className="space-y-2">
                            <Label htmlFor={`item-time-${item.id}`}>Horário (HH:mm)</Label>
                            <Input
                              id={`item-time-${item.id}`}
                              type="time"
                              value={item.startTime ?? ''}
                              onChange={(event) =>
                                updateItem(item.id, { startTime: event.target.value })
                              }
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor={`item-duration-${item.id}`}>Duração (minutos)</Label>
                            <Input
                              id={`item-duration-${item.id}`}
                              type="number"
                              min={1}
                              value={item.durationMinutes ?? ''}
                              onChange={(event) =>
                                updateItem(item.id, {
                                  durationMinutes: event.target.value
                                    ? Number(event.target.value)
                                    : undefined,
                                })
                              }
                            />
                          </div>
                          <div className="space-y-2 sm:col-span-2">
                            <Label htmlFor={`item-location-${item.id}`}>Local</Label>
                            <Input
                              id={`item-location-${item.id}`}
                              value={item.location ?? ''}
                              onChange={(event) =>
                                updateItem(item.id, { location: event.target.value })
                              }
                            />
                          </div>
                        </>
                      ) : null}
                      {item.kind === 'document' ? (
                        <div className="space-y-2">
                          <Label>Categoria do documento</Label>
                          <Select
                            value={item.documentCategory ?? 'outro'}
                            onValueChange={(value) =>
                              updateItem(item.id, {
                                documentCategory: value as DocumentCategory,
                              })
                            }
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {DOCUMENT_CATEGORIES.map((category) => (
                                <SelectItem key={category.value} value={category.value}>
                                  {category.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      ) : null}
                      <div className="space-y-2 sm:col-span-2">
                        <Label htmlFor={`item-description-${item.id}`}>Observação</Label>
                        <Textarea
                          id={`item-description-${item.id}`}
                          value={item.description ?? ''}
                          onChange={(event) =>
                            updateItem(item.id, { description: event.target.value })
                          }
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {formError ? <p className="text-sm text-destructive">{formError}</p> : null}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setEditorOpen(false)}>
              Cancelar
            </Button>
            <Button type="button" onClick={() => void handleSave()} disabled={saving}>
              {saving ? 'Salvando...' : 'Salvar playbook'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDeleteDialog
        open={deleteDialog.open}
        onOpenChange={deleteDialog.handleOpenChange}
        itemName={deleteDialog.target?.name}
        description={
          deleteDialog.target
            ? `O playbook "${deleteDialog.target.name}" será excluído permanentemente. Isso não apaga visitas já criadas.`
            : undefined
        }
        loading={deleteDialog.loading}
        onConfirm={handleDeleteConfirm}
      />
    </div>
  )
}
