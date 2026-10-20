import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Users } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  DEFAULT_VISIT_MODULE_EDITOR_FLAGS,
  VISIT_EDITABLE_MODULES,
  hasAnyVisitModuleEdit,
  teamMemberIdsFromModuleEditors,
} from '@/lib/access'
import { listOrganizationMembers } from '@/services/organizations'
import { updateVisit } from '@/services/visits'
import type {
  OrganizationMember,
  Visit,
  VisitEditableModule,
  VisitModuleEditorFlags,
} from '@/types'

interface VisitEditorsPanelProps {
  visit: Visit
  canManage: boolean
  onUpdated: (visit: Visit) => void
}

function cloneEditors(
  source?: Record<string, Partial<VisitModuleEditorFlags>> | null,
): Record<string, VisitModuleEditorFlags> {
  const next: Record<string, VisitModuleEditorFlags> = {}
  if (!source) return next
  for (const [uid, flags] of Object.entries(source)) {
    next[uid] = {
      planning: flags.planning === true,
      agenda: flags.agenda === true,
      visitors: flags.visitors === true,
      finance: flags.finance === true,
    }
  }
  return next
}

export function VisitEditorsPanel({ visit, canManage, onUpdated }: VisitEditorsPanelProps) {
  const [members, setMembers] = useState<OrganizationMember[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [editors, setEditors] = useState(() => cloneEditors(visit.moduleEditors))
  const [clientIds, setClientIds] = useState<string[]>(() => [...visit.clientUserIds])

  useEffect(() => {
    setEditors(cloneEditors(visit.moduleEditors))
    setClientIds([...visit.clientUserIds])
  }, [visit.id, visit.moduleEditors, visit.clientUserIds])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    void listOrganizationMembers(visit.orgId)
      .then((list) => {
        if (!cancelled) setMembers(list)
      })
      .catch((error) => {
        console.error(error)
        if (!cancelled) toast.error('Não foi possível carregar os membros da empresa')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [visit.orgId])

  const internalMembers = useMemo(
    () =>
      members
        .filter((member) => member.orgRole !== 'client')
        .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')),
    [members],
  )
  const clientMembers = useMemo(
    () =>
      members
        .filter((member) => member.orgRole === 'client')
        .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')),
    [members],
  )

  const toggleModule = (uid: string, module: VisitEditableModule, checked: boolean) => {
    setEditors((prev) => {
      const current = prev[uid] ?? {
        planning: false,
        agenda: false,
        visitors: false,
        finance: false,
      }
      const nextFlags: VisitModuleEditorFlags = { ...current, [module]: checked }
      const next = { ...prev }
      if (!hasAnyVisitModuleEdit(nextFlags)) {
        delete next[uid]
      } else {
        next[uid] = nextFlags
      }
      return next
    })
  }

  const enableAllModules = (uid: string, enabled: boolean) => {
    setEditors((prev) => {
      const next = { ...prev }
      if (!enabled) {
        delete next[uid]
        return next
      }
      next[uid] = { ...DEFAULT_VISIT_MODULE_EDITOR_FLAGS }
      return next
    })
  }

  const toggleClient = (uid: string, checked: boolean) => {
    setClientIds((prev) => {
      if (checked) return prev.includes(uid) ? prev : [...prev, uid]
      return prev.filter((id) => id !== uid)
    })
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const moduleEditors = Object.fromEntries(
        Object.entries(editors).filter(([, flags]) => hasAnyVisitModuleEdit(flags)),
      )
      const teamMemberIds = teamMemberIdsFromModuleEditors(moduleEditors)
      await updateVisit(visit.id, {
        moduleEditors,
        teamMemberIds,
        clientUserIds: clientIds,
      })
      onUpdated({
        ...visit,
        moduleEditors,
        teamMemberIds,
        clientUserIds: clientIds,
      })
      toast.success('Organizadores da visita atualizados')
    } catch (error) {
      console.error(error)
      toast.error(
        error instanceof Error ? error.message : 'Não foi possível salvar os organizadores',
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Users className="size-4" />
          Organizadores e módulos
        </CardTitle>
        <CardDescription>
          O criador da visita libera quem pode editar planejamento, programação, visitantes e
          financeiro nesta experiência. Admin da empresa e master já têm acesso total.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <p className="text-sm text-muted-foreground">Carregando membros…</p>
        ) : internalMembers.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum membro interno na empresa.</p>
        ) : (
          <div className="space-y-3">
            {internalMembers.map((member) => {
              const isOwner = member.uid === visit.ownerId
              const flags = editors[member.uid]
              const enabled = hasAnyVisitModuleEdit(flags)
              return (
                <div key={member.id} className="rounded-lg border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium">{member.name}</p>
                      <p className="text-xs text-muted-foreground">{member.email}</p>
                    </div>
                    {isOwner ? (
                      <Badge variant="secondary">Criador · acesso total</Badge>
                    ) : canManage ? (
                      <label className="flex items-center gap-2 text-sm">
                        <span>Pode editar</span>
                        <Switch
                          checked={enabled}
                          onCheckedChange={(checked) => enableAllModules(member.uid, checked)}
                          aria-label={`Liberar edição para ${member.name}`}
                        />
                      </label>
                    ) : enabled ? (
                      <Badge variant="outline">Editor</Badge>
                    ) : (
                      <Badge variant="muted">Sem edição</Badge>
                    )}
                  </div>
                  {!isOwner && enabled ? (
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      {VISIT_EDITABLE_MODULES.map(({ key, label }) => (
                        <label key={key} className="flex items-center justify-between gap-2 text-sm">
                          <span>{label}</span>
                          {canManage ? (
                            <Switch
                              checked={flags?.[key] === true}
                              onCheckedChange={(checked) =>
                                toggleModule(member.uid, key, checked)
                              }
                              aria-label={`${label} para ${member.name}`}
                            />
                          ) : (
                            <span className="text-xs text-muted-foreground">
                              {flags?.[key] === true ? 'Liberado' : 'Bloqueado'}
                            </span>
                          )}
                        </label>
                      ))}
                    </div>
                  ) : null}
                </div>
              )
            })}
          </div>
        )}

        {clientMembers.length > 0 ? (
          <div className="space-y-2 border-t pt-4">
            <Label>Clientes com acesso a esta visita</Label>
            <div className="space-y-2">
              {clientMembers.map((member) => (
                <label key={member.id} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={clientIds.includes(member.uid)}
                    disabled={!canManage}
                    onCheckedChange={(checked) => toggleClient(member.uid, checked === true)}
                  />
                  <span>
                    {member.name}{' '}
                    <span className="text-muted-foreground">({member.email})</span>
                  </span>
                </label>
              ))}
            </div>
          </div>
        ) : null}

        {canManage ? (
          <Button type="button" disabled={saving || loading} onClick={() => void handleSave()}>
            {saving ? 'Salvando…' : 'Salvar organizadores'}
          </Button>
        ) : null}
      </CardContent>
    </Card>
  )
}
