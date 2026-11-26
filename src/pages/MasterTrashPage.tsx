import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { RotateCcw, Trash2 } from 'lucide-react'
import { PageHeader, EmptyState } from '@/components/shared/PageHeader'
import { ConfirmDeleteDialog, useConfirmDelete } from '@/components/shared/ConfirmDeleteDialog'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useAuth } from '@/contexts/AuthContext'
import { canCreateOrganization } from '@/lib/access'
import { getDaysUntilExpiry, TRASH_RETENTION_DAYS } from '@/lib/trash'
import { formatDate } from '@/lib/utils'
import {
  deleteOrganization,
  listDeletedOrganizations,
  restoreOrganization,
} from '@/services/organizations'
import {
  listDeletedUsers,
  permanentDeleteUserProfile,
  restoreUser,
} from '@/services/users'
import type { Organization, UserProfile } from '@/types'

type MasterTrashCategory = 'all' | 'pastas' | 'usuarios'

type TrashTarget =
  | { kind: 'pasta'; item: Organization }
  | { kind: 'usuario'; item: UserProfile }

const CATEGORY_LABELS: Record<Exclude<MasterTrashCategory, 'all'>, string> = {
  pastas: 'Pastas',
  usuarios: 'Usuários',
}

function formatTrashDate(value: unknown): string {
  if (value && typeof value === 'object' && 'toDate' in value) {
    return formatDate((value as { toDate: () => Date }).toDate())
  }
  return '—'
}

function roleLabel(role: UserProfile['role']): string {
  if (role === 'admin') return 'Administrador'
  if (role === 'client') return 'Cliente'
  if (role === 'team') return 'Equipe'
  return 'Usuário'
}

export function MasterTrashPage() {
  const { isPlatformAdmin } = useAuth()
  const [loading, setLoading] = useState(true)
  const [pastas, setPastas] = useState<Organization[]>([])
  const [usuarios, setUsuarios] = useState<UserProfile[]>([])
  const [activeCategory, setActiveCategory] = useState<MasterTrashCategory>('all')
  const [restoringKey, setRestoringKey] = useState<string | null>(null)
  const permanentDialog = useConfirmDelete<TrashTarget & { id: string; name?: string }>()

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [deletedOrgs, deletedUsers] = await Promise.all([
        listDeletedOrganizations(),
        listDeletedUsers(true),
      ])
      setPastas(deletedOrgs)
      setUsuarios(deletedUsers)
    } catch (error) {
      console.error(error)
      toast.error('Erro ao carregar lixeira')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!canCreateOrganization(isPlatformAdmin)) return
    void load()
  }, [isPlatformAdmin, load])

  const totalCount = pastas.length + usuarios.length

  const categoryCounts = useMemo(
    () => ({
      pastas: pastas.length,
      usuarios: usuarios.length,
    }),
    [pastas.length, usuarios.length],
  )

  const handleRestorePasta = async (org: Organization) => {
    setRestoringKey(`pasta:${org.id}`)
    try {
      await restoreOrganization(org.id)
      toast.success(`Pasta "${org.name}" restaurada`)
      await load()
    } catch (error) {
      console.error(error)
      toast.error('Não foi possível restaurar a pasta')
    } finally {
      setRestoringKey(null)
    }
  }

  const handleRestoreUsuario = async (user: UserProfile) => {
    setRestoringKey(`usuario:${user.uid}`)
    try {
      await restoreUser(user.uid)
      toast.success(`Usuário "${user.name}" restaurado`)
      await load()
    } catch (error) {
      console.error(error)
      toast.error('Não foi possível restaurar o usuário')
    } finally {
      setRestoringKey(null)
    }
  }

  const handlePermanentDelete = () => {
    void permanentDialog.confirm(async (target) => {
      try {
        if (target.kind === 'pasta') {
          await deleteOrganization(target.item.id)
          toast.success('Pasta apagada permanentemente')
        } else {
          await permanentDeleteUserProfile(target.item.uid)
          toast.success('Usuário apagado permanentemente')
        }
        await load()
      } catch (error) {
        console.error(error)
        toast.error('Não foi possível apagar')
        throw error
      }
    })
  }

  if (!canCreateOrganization(isPlatformAdmin)) {
    return null
  }

  const showPastas = activeCategory === 'all' || activeCategory === 'pastas'
  const showUsuarios = activeCategory === 'all' || activeCategory === 'usuarios'
  const visibleEmpty =
    (activeCategory === 'all' && totalCount === 0) ||
    (activeCategory === 'pastas' && pastas.length === 0) ||
    (activeCategory === 'usuarios' && usuarios.length === 0)

  return (
    <div className="space-y-6">
      <PageHeader
        title="Lixeira"
        description={`Itens excluídos ficam disponíveis por ${TRASH_RETENTION_DAYS} dias antes da remoção automática.`}
      />

      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant={activeCategory === 'all' ? 'default' : 'outline'}
          onClick={() => setActiveCategory('all')}
        >
          Todos ({totalCount})
        </Button>
        {(Object.keys(CATEGORY_LABELS) as Array<keyof typeof CATEGORY_LABELS>).map((key) => (
          <Button
            key={key}
            size="sm"
            variant={activeCategory === key ? 'default' : 'outline'}
            onClick={() => setActiveCategory(key)}
          >
            {CATEGORY_LABELS[key]} ({categoryCounts[key]})
          </Button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      ) : visibleEmpty ? (
        <EmptyState
          icon={Trash2}
          title="Lixeira vazia"
          description={
            activeCategory === 'all'
              ? 'Nenhum item excluído no momento.'
              : `Nenhum item em ${CATEGORY_LABELS[activeCategory]}.`
          }
        />
      ) : (
        <div className="space-y-6">
          {showPastas && pastas.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  {CATEGORY_LABELS.pastas} ({pastas.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {pastas.map((org) => {
                  const daysLeft = getDaysUntilExpiry(org.expiresAt)
                  return (
                    <div
                      key={org.id}
                      className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="min-w-0">
                        <p className="font-medium">{org.name}</p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          Pasta · Excluída em {formatTrashDate(org.deletedAt)}
                          {daysLeft != null ? ` · ${daysLeft} dia(s) restante(s)` : ''}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={restoringKey === `pasta:${org.id}`}
                          onClick={() => void handleRestorePasta(org)}
                        >
                          <RotateCcw className="h-4 w-4" />
                          {restoringKey === `pasta:${org.id}` ? 'Restaurando…' : 'Restaurar'}
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() =>
                            permanentDialog.requestDelete({
                              id: org.id,
                              name: org.name,
                              kind: 'pasta',
                              item: org,
                            })
                          }
                        >
                          <Trash2 className="h-4 w-4" />
                          Apagar
                        </Button>
                      </div>
                    </div>
                  )
                })}
              </CardContent>
            </Card>
          ) : null}

          {showUsuarios && usuarios.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  {CATEGORY_LABELS.usuarios} ({usuarios.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {usuarios.map((user) => {
                  const daysLeft = getDaysUntilExpiry(user.expiresAt)
                  return (
                    <div
                      key={user.uid}
                      className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="min-w-0">
                        <p className="font-medium">{user.name}</p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {roleLabel(user.role)} · {user.email}
                          {' · '}
                          Excluído em {formatTrashDate(user.deletedAt)}
                          {daysLeft != null ? ` · ${daysLeft} dia(s) restante(s)` : ''}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={restoringKey === `usuario:${user.uid}`}
                          onClick={() => void handleRestoreUsuario(user)}
                        >
                          <RotateCcw className="h-4 w-4" />
                          {restoringKey === `usuario:${user.uid}` ? 'Restaurando…' : 'Restaurar'}
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() =>
                            permanentDialog.requestDelete({
                              id: user.uid,
                              name: user.name,
                              kind: 'usuario',
                              item: user,
                            })
                          }
                        >
                          <Trash2 className="h-4 w-4" />
                          Apagar
                        </Button>
                      </div>
                    </div>
                  )
                })}
              </CardContent>
            </Card>
          ) : null}
        </div>
      )}

      <ConfirmDeleteDialog
        open={permanentDialog.open}
        onOpenChange={permanentDialog.handleOpenChange}
        title="Apagar permanentemente?"
        description={
          permanentDialog.target
            ? permanentDialog.target.kind === 'pasta'
              ? `A pasta "${permanentDialog.target.name}" será removida de forma definitiva. Esta ação não pode ser desfeita.`
              : `O usuário "${permanentDialog.target.name}" será removido de forma definitiva. A conta de login Auth não é apagada automaticamente.`
            : undefined
        }
        itemName={permanentDialog.target?.name}
        confirmLabel="Apagar permanentemente"
        loading={permanentDialog.loading}
        onConfirm={handlePermanentDelete}
      />
    </div>
  )
}
