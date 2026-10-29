import { useCallback, useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { toast } from 'sonner'
import { Copy, Trash2, UserPlus, Users } from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { ConfirmDeleteDialog, useConfirmDelete } from '@/components/shared/ConfirmDeleteDialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { useAuth } from '@/contexts/AuthContext'
import { useOrg } from '@/contexts/OrgContext'
import { canManageOrgUsers, mergeModulePermissions } from '@/lib/access'
import { resolveDisplayedAccountType } from '@/lib/accountType'
import {
  CARGO_REGION_OPTIONS,
  EMPLOYEE_CARGO_OPTIONS,
  formatMemberCargo,
  normalizeCargoInput,
} from '@/lib/cargo'
import { ChangeAccountTypeControl } from '@/features/users/ChangeAccountTypeControl'
import { ChangeCargoControl } from '@/features/users/ChangeCargoControl'
import { orgRoleLabel } from '@/lib/org'
import {
  createInvite,
  cancelInvite,
  listPendingInvitesByOrg,
  subscribePendingInvitesByOrg,
} from '@/services/invites'
import {
  countOrganizationSeats,
  countPendingInvites,
  listOrganizationMembers,
  removeOrganizationMember,
  subscribeOrganizationMembers,
} from '@/services/organizations'
import { listUsers, updateUserModulePermissions } from '@/services/users'
import type {
  CargoRegion,
  EmployeeCargo,
  Invite,
  InviteRole,
  ModulePermissions,
  OrganizationMember,
  UserProfile,
} from '@/types'

function inviteRoleLabel(role: InviteRole): string {
  switch (role) {
    case 'org_admin':
      return 'Admin da empresa'
    case 'team':
      return 'Funcionário'
    case 'client':
      return 'Cliente'
    default:
      return 'Usuário'
  }
}

export function UsersPage() {
  const { user, isPlatformAdmin, isAdmin } = useAuth()
  const { activeOrgId, activeOrg, isOrgAdmin } = useOrg()
  const canManage = canManageOrgUsers(isPlatformAdmin, isOrgAdmin)

  const [members, setMembers] = useState<OrganizationMember[]>([])
  const [pendingInvites, setPendingInvites] = useState<Invite[]>([])
  const [seatUsage, setSeatUsage] = useState({ members: 0, pending: 0 })
  const [users, setUsers] = useState<UserProfile[]>([])
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteCargo, setInviteCargo] = useState<EmployeeCargo | ''>('')
  const [inviteCargoRegion, setInviteCargoRegion] = useState<CargoRegion | ''>('')
  const [inviting, setInviting] = useState(false)
  const [lastInvite, setLastInvite] = useState<{ id: string; link: string } | null>(null)
  const [loading, setLoading] = useState(true)
  const removeMemberDialog = useConfirmDelete<OrganizationMember>()

  const reload = useCallback(async () => {
    if (!activeOrgId || !canManage) return
    setLoading(true)
    try {
      const [memberList, invites, seats, pending] = await Promise.all([
        listOrganizationMembers(activeOrgId),
        listPendingInvitesByOrg(activeOrgId),
        countOrganizationSeats(activeOrgId),
        countPendingInvites(activeOrgId),
      ])
      setMembers(memberList)
      setPendingInvites(invites)
      setSeatUsage({ members: seats, pending })
      if (isPlatformAdmin) {
        setUsers(await listUsers(true))
      }
    } catch (error) {
      console.error(error)
      toast.error('Não foi possível carregar os usuários')
    } finally {
      setLoading(false)
    }
  }, [activeOrgId, canManage, isPlatformAdmin])

  useEffect(() => {
    void reload()
  }, [reload])

  useEffect(() => {
    if (!activeOrgId || !canManage) return
    const unsubscribeMembers = subscribeOrganizationMembers(
      activeOrgId,
      (nextMembers) => {
        setMembers(nextMembers)
        setSeatUsage((current) => ({ ...current, members: nextMembers.length }))
      },
      (error) => console.error('Não foi possível acompanhar os membros', error),
    )
    const unsubscribeInvites = subscribePendingInvitesByOrg(
      activeOrgId,
      (nextInvites) => {
        setPendingInvites(nextInvites)
        setSeatUsage((current) => ({ ...current, pending: nextInvites.length }))
      },
      (error) => console.error('Não foi possível acompanhar os convites', error),
    )
    return () => {
      unsubscribeMembers()
      unsubscribeInvites()
    }
  }, [activeOrgId, canManage])

  if (!canManage) {
    return <Navigate to="/" replace />
  }

  const atCapacity = activeOrg
    ? seatUsage.members + seatUsage.pending >= activeOrg.maxUsers
    : false

  const handleInvite = async () => {
    if (!user || !activeOrgId || !inviteEmail.trim()) return
    const cargoResult = normalizeCargoInput(inviteCargo, inviteCargoRegion)
    if ('error' in cargoResult) {
      toast.error(cargoResult.error)
      return
    }
    setInviting(true)
    try {
      const created = await createInvite({
        email: inviteEmail,
        role: 'team',
        createdBy: user.uid,
        orgId: activeOrgId,
        cargo: cargoResult.cargo,
        cargoRegion: cargoResult.cargoRegion ?? undefined,
      })
      setLastInvite({ id: created.id, link: created.link })
      toast.success(
        created.emailSent
          ? `Convite enviado para ${created.email}`
          : 'Convite criado, mas o e-mail não foi enviado — copie o link abaixo',
      )
      setInviteEmail('')
      setInviteCargo('')
      setInviteCargoRegion('')
      await reload()
    } catch (error) {
      console.error(error)
      toast.error(error instanceof Error ? error.message : 'Não foi possível convidar')
    } finally {
      setInviting(false)
    }
  }

  const canChangeCargo = (member: OrganizationMember) => {
    if (isPlatformAdmin) return true
    if (!isOrgAdmin) return false
    if (member.orgRole === 'org_admin' && member.uid !== user?.uid) return false
    return true
  }

  const handleCancelInvite = async (inviteId: string) => {
    try {
      await cancelInvite(inviteId)
      toast.success('Convite cancelado — vaga liberada')
      if (lastInvite?.id === inviteId) setLastInvite(null)
      await reload()
    } catch (error) {
      console.error(error)
      toast.error('Não foi possível cancelar o convite')
    }
  }

  const canDeleteMember = (member: OrganizationMember) => {
    if (user?.uid === member.uid) return false
    if (isPlatformAdmin) return true
    // Admin da empresa: exclui funcionários (equipe/usuário/cliente), não outros admins
    return member.orgRole !== 'org_admin'
  }

  const handleRemoveMember = () => {
    void removeMemberDialog.confirm(async (member) => {
      try {
        await removeOrganizationMember(member.orgId, member.uid)
        toast.success(
          member.orgRole === 'team'
            ? 'Funcionário excluído da empresa'
            : 'Usuário excluído da empresa',
        )
        await reload()
      } catch (error) {
        console.error(error)
        toast.error(
          error instanceof Error ? error.message : 'Não foi possível excluir o usuário',
        )
        throw error
      }
    })
  }

  const handleModuleToggle = async (
    uid: string,
    key: keyof ModulePermissions,
    checked: boolean,
  ) => {
    const target = users.find((u) => u.uid === uid)
    if (!target) return
    const next = { ...mergeModulePermissions(target.modulePermissions), [key]: checked }
    try {
      await updateUserModulePermissions(uid, next)
      setUsers((prev) =>
        prev.map((u) => (u.uid === uid ? { ...u, modulePermissions: next } : u)),
      )
      toast.success('Permissões atualizadas')
    } catch (error) {
      console.error(error)
      toast.error('Não foi possível atualizar as permissões')
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Usuários"
        description={
          isPlatformAdmin
            ? 'Convide funcionários com cargo do organograma, altere cargos e o tipo de cada membro.'
            : 'Convide funcionários com cargo do organograma. Só o admin da empresa altera cargos e exclui membros.'
        }
      />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <UserPlus className="size-5" />
            Convidar funcionário
          </CardTitle>
          <CardDescription>
            {activeOrg
              ? `${seatUsage.members + seatUsage.pending}/${activeOrg.maxUsers} acessos em uso (${seatUsage.members} ativos, ${seatUsage.pending} pendentes).`
              : 'Informe o e-mail e envie o convite.'}
            {' '}
            Isto cria um <strong>usuário da empresa</strong>, não um visitante do CRM.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="space-y-3"
            onSubmit={(event) => {
              event.preventDefault()
              void handleInvite()
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="users-invite-email">E-mail *</Label>
              <Input
                id="users-invite-email"
                type="email"
                required
                autoComplete="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="funcionario@empresa.com"
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="users-invite-cargo">Cargo *</Label>
                <Select
                  value={inviteCargo || undefined}
                  onValueChange={(v) => {
                    setInviteCargo(v as EmployeeCargo)
                    if (v !== 'analista') setInviteCargoRegion('')
                  }}
                >
                  <SelectTrigger id="users-invite-cargo">
                    <SelectValue placeholder="Selecione o cargo" />
                  </SelectTrigger>
                  <SelectContent>
                    {EMPLOYEE_CARGO_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Perfil fixo: funcionário. Clientes entram pelo convite na visita.
                </p>
              </div>
              {inviteCargo === 'analista' ? (
                <div className="space-y-2">
                  <Label htmlFor="users-invite-region">Região *</Label>
                  <Select
                    value={inviteCargoRegion || undefined}
                    onValueChange={(v) => setInviteCargoRegion(v as CargoRegion)}
                  >
                    <SelectTrigger id="users-invite-region">
                      <SelectValue placeholder="MA/PA, MG ou RS" />
                    </SelectTrigger>
                    <SelectContent>
                      {CARGO_REGION_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : null}
            </div>
            <Button
              type="submit"
              disabled={
                inviting ||
                !inviteEmail.trim() ||
                !inviteCargo ||
                (inviteCargo === 'analista' && !inviteCargoRegion) ||
                atCapacity
              }
            >
              {inviting ? 'Enviando...' : 'Enviar convite'}
            </Button>
            {atCapacity ? (
              <p className="text-xs text-destructive">
                Limite de acessos atingido. Peça ao Admin Master para aumentar o limite.
              </p>
            ) : null}
            {lastInvite ? (
              <div className="space-y-2 rounded-lg border bg-muted/40 p-3" role="status">
                <Label htmlFor="users-invite-link">Link do convite</Label>
                <Input
                  id="users-invite-link"
                  readOnly
                  value={lastInvite.link}
                  className="font-mono text-xs"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    void navigator.clipboard.writeText(lastInvite.link)
                    toast.success('Link copiado')
                  }}
                >
                  <Copy className="size-3.5" />
                  Copiar link
                </Button>
              </div>
            ) : null}
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Users className="size-5" />
            Membros da empresa
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading ? (
            <p className="text-sm text-muted-foreground">Carregando…</p>
          ) : members.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum membro ainda.</p>
          ) : (
            <div className="space-y-2">
              {members.map((member) => {
                const isSelf = user?.uid === member.uid
                const showDelete = canDeleteMember(member)
                return (
                  <div
                    key={member.id}
                    className="flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div>
                      <p className="text-sm font-medium">{member.name}</p>
                      <p className="text-xs text-muted-foreground">{member.email}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {isPlatformAdmin ? (
                        <ChangeAccountTypeControl
                          uid={member.uid}
                          name={member.name}
                          orgId={member.orgId}
                          currentType={resolveDisplayedAccountType(
                            users.find((profile) => profile.uid === member.uid)?.role,
                            member.orgRole,
                          )}
                          onChanged={() => void reload()}
                        />
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          {member.orgRole === 'team'
                            ? 'Funcionário'
                            : orgRoleLabel(member.orgRole)}
                        </span>
                      )}
                      {canChangeCargo(member) ? (
                        <ChangeCargoControl
                          uid={member.uid}
                          name={member.name}
                          orgId={member.orgId}
                          currentCargo={member.cargo}
                          currentRegion={member.cargoRegion}
                          onChanged={() => void reload()}
                        />
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          {formatMemberCargo(member.cargo, member.cargoRegion)}
                          {!member.cargo && member.department
                            ? ` · ${member.department}`
                            : ''}
                        </span>
                      )}
                      {isSelf ? (
                        <Badge variant="secondary">Você</Badge>
                      ) : showDelete ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="text-destructive hover:text-destructive"
                          onClick={() => removeMemberDialog.requestDelete(member)}
                        >
                          <Trash2 className="size-3.5" />
                          Excluir
                        </Button>
                      ) : (
                        <Badge variant="outline">Admin</Badge>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {pendingInvites.length > 0 ? (
            <div className="space-y-2 border-t pt-4">
              <p className="text-xs font-medium text-muted-foreground">
                Convites pendentes
              </p>
              {pendingInvites.map((invite) => (
                <div
                  key={invite.id}
                  className="flex flex-col gap-2 rounded-lg border border-dashed p-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="text-sm font-medium">{invite.email}</p>
                    <p className="text-xs text-muted-foreground">
                      {inviteRoleLabel(invite.role)}
                      {invite.cargo
                        ? ` · ${formatMemberCargo(invite.cargo, invite.cargoRegion)}`
                        : ''}{' '}
                      · aguardando aceite
                    </p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="text-destructive hover:text-destructive"
                    onClick={() => void handleCancelInvite(invite.id)}
                  >
                    Cancelar convite
                  </Button>
                </div>
              ))}
            </div>
          ) : null}
        </CardContent>
      </Card>

      {isAdmin || isPlatformAdmin ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Permissões por módulo</CardTitle>
            <CardDescription>
              Controle o acesso dos funcionários aos módulos. Gestão de Receitas fica
              desligada por padrão.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {users.filter((u) => u.role === 'team' || u.role === 'user').length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nenhum funcionário listado ainda (aparecem após aceitarem o convite).
              </p>
            ) : (
              users
                .filter((u) => u.role === 'team' || u.role === 'user')
                .map((u) => {
                  const perms = mergeModulePermissions(u.modulePermissions)
                  return (
                    <div key={u.uid} className="rounded-lg border p-3">
                      <p className="mb-2 text-sm font-medium">
                        {u.name}{' '}
                        <span className="text-muted-foreground">({u.email})</span>
                      </p>
                      <div className="grid gap-2 sm:grid-cols-2">
                        {(
                          [
                            ['visitors', 'Visitantes'],
                            ['planning', 'Planejamento'],
                            ['finance', 'Financeiro'],
                            ['revenue', 'Gestão de Receitas'],
                            ['reports', 'Relatórios'],
                          ] as const
                        ).map(([key, label]) => (
                          <label
                            key={key}
                            className="flex items-center justify-between text-sm"
                          >
                            <span>{label}</span>
                            <Switch
                              aria-label={`${label} para ${u.name}`}
                              checked={perms[key]}
                              onCheckedChange={(checked) =>
                                void handleModuleToggle(u.uid, key, checked)
                              }
                            />
                          </label>
                        ))}
                      </div>
                    </div>
                  )
                })
            )}
          </CardContent>
        </Card>
      ) : null}

      <ConfirmDeleteDialog
        open={removeMemberDialog.open}
        onOpenChange={removeMemberDialog.handleOpenChange}
        title={
          removeMemberDialog.target?.orgRole === 'team'
            ? 'Excluir funcionário da empresa?'
            : 'Excluir usuário da empresa?'
        }
        description={
          removeMemberDialog.target
            ? `"${removeMemberDialog.target.name}" (${removeMemberDialog.target.email}) perderá o acesso a esta empresa. A conta de login continua existindo.`
            : undefined
        }
        itemName={removeMemberDialog.target?.name}
        confirmLabel="Excluir"
        loading={removeMemberDialog.loading}
        onConfirm={handleRemoveMember}
      />
    </div>
  )
}
