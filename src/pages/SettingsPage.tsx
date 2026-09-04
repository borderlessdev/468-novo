import { useCallback, useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import {
  Bell,
  CalendarDays,
  ClipboardList,
  KeyRound,
  Monitor,
  Moon,
  Sun,
  Trash2,
  UserPlus,
} from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useAuth } from '@/contexts/AuthContext'
import { useOrg } from '@/contexts/OrgContext'
import { canManageOrgUsers } from '@/lib/access'
import { orgRoleLabel } from '@/lib/org'
import { useTheme, type Theme } from '@/contexts/ThemeContext'
import { mergeModulePermissions } from '@/lib/access'
import {
  mergeNotificationPreferences,
  NOTIFICATION_PREFERENCE_ITEMS,
  type NotificationPreferences,
} from '@/lib/notificationPreferences'
import { TRASH_RETENTION_DAYS } from '@/lib/trash'
import { cn } from '@/lib/utils'
import {
  disconnectGoogle,
  getCalendarStatuses,
  startGoogleOAuth,
  type CalendarStatuses,
} from '@/services/calendar'
import { createInvite } from '@/services/invites'
import {
  countOrganizationSeats,
  countPendingInvites,
  listOrganizationMembers,
} from '@/services/organizations'
import { listEmailLogs } from '@/services/emailLogs'
import {
  listUsers,
  updateUserModulePermissions,
} from '@/services/users'
import type { EmailLog, InviteRole, ModulePermissions, OrganizationMember, UserProfile } from '@/types'

const THEME_OPTIONS: { value: Theme; label: string; icon: typeof Sun }[] = [
  { value: 'light', label: 'Claro', icon: Sun },
  { value: 'dark', label: 'Escuro', icon: Moon },
  { value: 'system', label: 'Sistema', icon: Monitor },
]

const CALENDAR_ERROR_MESSAGES: Record<string, string> = {
  credenciais: 'Defina GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET nas Functions.',
  consentimento: 'Autorização cancelada no Google.',
  estado: 'A autorização expirou. Tente conectar novamente.',
  sem_refresh_token:
    'O Google não devolveu um token de atualização. Remova o acesso do app na sua conta Google e conecte de novo.',
  token: 'Não foi possível concluir a conexão com o Google.',
}

function ThemePreview({ variant }: { variant: Theme }) {
  if (variant === 'light') {
    return (
      <div className="relative h-16 w-full overflow-hidden rounded-md bg-gradient-to-br from-[#f7f8f6] to-[#e8ece9]">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_20%,rgba(15,47,42,0.06),transparent_55%)]" />
        <div className="absolute left-2 top-2 h-full w-5 rounded-sm bg-[#0f2f2a]/90" />
        <div className="absolute left-9 top-2 h-2 w-10 rounded-sm bg-white/90 shadow-sm" />
        <div className="absolute left-9 top-6 h-7 w-14 rounded-sm bg-white/70 shadow-sm" />
        <div className="absolute bottom-2 right-2 h-2 w-6 rounded-full bg-[#0f2f2a]/15" />
      </div>
    )
  }

  if (variant === 'dark') {
    return (
      <div className="relative h-16 w-full overflow-hidden rounded-md bg-gradient-to-br from-[#0a1210] to-[#152019]">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_80%,rgba(61,155,135,0.18),transparent_50%)]" />
        <div className="absolute left-2 top-2 h-full w-5 rounded-sm bg-[#0f2f2a]" />
        <div className="absolute left-9 top-2 h-2 w-10 rounded-sm bg-[#1a2824] shadow-sm" />
        <div className="absolute left-9 top-6 h-7 w-14 rounded-sm bg-[#111a17]/90 shadow-sm" />
        <div className="absolute bottom-2 right-2 h-2 w-6 rounded-full bg-[#3d9b87]/40" />
      </div>
    )
  }

  return (
    <div className="relative h-16 w-full overflow-hidden rounded-md">
      <div className="absolute inset-0 bg-gradient-to-br from-[#f7f8f6] to-[#e8ece9]" />
      <div className="absolute inset-0 bg-gradient-to-br from-[#0a1210] to-[#152019] [clip-path:polygon(52%_0,100%_0,100%_100%,38%_100%)]" />
      <div className="absolute left-1.5 top-2 h-full w-4 rounded-sm bg-[#0f2f2a]/85" />
      <div className="absolute left-7 top-2 h-1.5 w-8 rounded-sm bg-white/85" />
      <div className="absolute left-[52%] top-2 h-1.5 w-8 rounded-sm bg-[#1a2824]" />
      <div className="absolute left-7 top-5 h-6 w-11 rounded-sm bg-white/65" />
      <div className="absolute left-[52%] top-5 h-6 w-11 rounded-sm bg-[#111a17]/90" />
    </div>
  )
}

export function SettingsPage() {
  const {
    profile,
    updateNotificationPreferences,
    resetPassword,
    isClient,
    isAdmin,
    user,
  } = useAuth()
  const { activeOrgId, activeOrg, isOrgAdmin } = useOrg()
  const { theme, setTheme } = useTheme()
  const [searchParams, setSearchParams] = useSearchParams()
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<InviteRole>('team')
  const [inviteDepartment, setInviteDepartment] = useState('')
  const [orgMembers, setOrgMembers] = useState<OrganizationMember[]>([])
  const [seatUsage, setSeatUsage] = useState({ members: 0, pending: 0 })
  const [inviting, setInviting] = useState(false)
  const [lastInviteLink, setLastInviteLink] = useState('')
  const [users, setUsers] = useState<UserProfile[]>([])
  const [emailLogs, setEmailLogs] = useState<EmailLog[]>([])
  const [sendingReset, setSendingReset] = useState(false)
  const [notificationPrefs, setNotificationPrefs] = useState<NotificationPreferences>(
    () => mergeNotificationPreferences(profile?.notificationPreferences),
  )
  const [savingPrefs, setSavingPrefs] = useState(false)
  const [calendar, setCalendar] = useState<CalendarStatuses | null>(null)
  const [calendarLoading, setCalendarLoading] = useState(true)
  const [calendarBusy, setCalendarBusy] = useState(false)

  // profile editing moved to Profile page

  useEffect(() => {
    setNotificationPrefs(mergeNotificationPreferences(profile?.notificationPreferences))
  }, [profile?.notificationPreferences])

  useEffect(() => {
    if (!user) return
    if (isAdmin) {
      void listUsers(true).then(setUsers).catch(console.error)
    }
    void listEmailLogs(user.uid, isAdmin).then(setEmailLogs).catch(console.error)
  }, [user, isAdmin])

  useEffect(() => {
    if (!user || !activeOrgId || !canManageOrgUsers(isAdmin, isOrgAdmin)) return
    void Promise.all([
      listOrganizationMembers(activeOrgId),
      countOrganizationSeats(activeOrgId),
      countPendingInvites(activeOrgId),
    ]).then(([members, membersCount, pendingCount]) => {
      setOrgMembers(members)
      setSeatUsage({ members: membersCount, pending: pendingCount })
    })
  }, [user, activeOrgId, isAdmin, isOrgAdmin, lastInviteLink])

  // As credenciais GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET moram em functions/.env
  // (ou no Secret Manager). Sem elas as callables respondem erro tratado e o card
  // apenas informa o que falta configurar — a página não quebra.
  const loadCalendar = useCallback(async () => {
    if (!user || isClient) {
      setCalendarLoading(false)
      return
    }
    setCalendarLoading(true)
    try {
      setCalendar(await getCalendarStatuses())
    } finally {
      setCalendarLoading(false)
    }
  }, [user, isClient])

  useEffect(() => {
    void loadCalendar()
  }, [loadCalendar])

  useEffect(() => {
    const result = searchParams.get('calendar')
    if (!result) return
    if (result === 'connected') {
      toast.success('Google Calendar conectado')
    } else {
      const reason = searchParams.get('reason') ?? ''
      toast.error(CALENDAR_ERROR_MESSAGES[reason] ?? 'Não foi possível conectar o Google Calendar.')
    }
    const next = new URLSearchParams(searchParams)
    next.delete('calendar')
    next.delete('reason')
    setSearchParams(next, { replace: true })
  }, [searchParams, setSearchParams])

  const handleConnectGoogle = async () => {
    setCalendarBusy(true)
    try {
      await startGoogleOAuth()
    } catch (error) {
      console.error(error)
      toast.error(error instanceof Error ? error.message : 'Não foi possível conectar')
      setCalendarBusy(false)
    }
  }

  const handleDisconnectGoogle = async () => {
    setCalendarBusy(true)
    try {
      await disconnectGoogle()
      toast.success('Google Calendar desconectado')
      await loadCalendar()
    } catch (error) {
      console.error(error)
      toast.error(error instanceof Error ? error.message : 'Não foi possível desconectar')
    } finally {
      setCalendarBusy(false)
    }
  }

  const handleInvite = async () => {
    if (!user || !activeOrgId || !inviteEmail.trim()) return
    setInviting(true)
    try {
      const created = await createInvite({
        email: inviteEmail,
        role: inviteRole,
        createdBy: user.uid,
        orgId: activeOrgId,
        department: inviteDepartment.trim() || undefined,
      })
      setLastInviteLink(created.link)
      toast.success(
        created.mailtoOpened
          ? 'Convite criado — cliente de e-mail aberto'
          : 'Convite criado — copie o link abaixo',
      )
      setInviteEmail('')
      setInviteDepartment('')
      setEmailLogs(await listEmailLogs(user.uid, isAdmin))
    } catch (error) {
      console.error(error)
      toast.error(
        error instanceof Error ? error.message : 'Não foi possível convidar',
      )
    } finally {
      setInviting(false)
    }
  }

  const handleModuleToggle = async (
    uid: string,
    key: keyof ModulePermissions,
    checked: boolean,
  ) => {
    const target = users.find((u) => u.uid === uid)
    if (!target) return
    const next = {
      ...mergeModulePermissions(target.modulePermissions),
      [key]: checked,
    }
    try {
      await updateUserModulePermissions(uid, next)
      setUsers((prev) =>
        prev.map((u) => (u.uid === uid ? { ...u, modulePermissions: next } : u)),
      )
      toast.success('Permissões atualizadas')
    } catch (error) {
      console.error(error)
      toast.error('Falha ao atualizar permissões')
    }
  }

  // profile update handled on /perfil

  const handleNotificationToggle = async (
    key: keyof NotificationPreferences,
    checked: boolean,
  ) => {
    const next = { ...notificationPrefs, [key]: checked }
    setNotificationPrefs(next)
    setSavingPrefs(true)
    try {
      await updateNotificationPreferences(next)
      toast.success('Preferências de notificação atualizadas')
    } catch (error) {
      console.error(error)
      setNotificationPrefs(notificationPrefs)
      toast.error('Não foi possível salvar as preferências')
    } finally {
      setSavingPrefs(false)
    }
  }

  const handleResetPassword = async () => {
    if (!profile?.email) return
    setSendingReset(true)
    try {
      await resetPassword(profile.email)
      toast.success('E-mail de redefinição enviado. Verifique sua caixa de entrada.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Falha ao enviar e-mail')
    } finally {
      setSendingReset(false)
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Configurações"
        description="Gerencie seu perfil, aparência, notificações e segurança."
      />

      <div className="grid items-start gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <KeyRound className="h-5 w-5" />
              Segurança
            </CardTitle>
            <CardDescription>
              Proteja o acesso à sua conta.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Enviaremos um link para <strong>{profile?.email}</strong> com
              instruções para criar uma nova senha.
            </p>
            <Button
              variant="outline"
              onClick={() => void handleResetPassword()}
              disabled={sendingReset || !profile?.email}
            >
              {sendingReset ? 'Enviando...' : 'Redefinir senha por e-mail'}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Aparência</CardTitle>
            <CardDescription>Escolha o tema da interface.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-3">
              {THEME_OPTIONS.map(({ value, label, icon: Icon }) => {
                const selected = theme === value
                return (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={selected}
                    aria-label={`Usar tema ${label}`}
                    onClick={() => setTheme(value)}
                    className={cn(
                      'group flex flex-col gap-2.5 rounded-xl border p-2.5 text-left transition-all',
                      selected
                        ? 'border-primary bg-primary/5 shadow-sm ring-2 ring-primary/20'
                        : 'border-border hover:border-primary/30 hover:bg-muted/50',
                    )}
                  >
                    <ThemePreview variant={value} />
                    <span
                      className={cn(
                        'flex items-center justify-center gap-1.5 text-sm font-medium',
                        selected ? 'text-primary' : 'text-foreground',
                      )}
                    >
                      <Icon className="h-3.5 w-3.5" />
                      {label}
                    </span>
                  </button>
                )
              })}
            </div>
          </CardContent>
        </Card>

        {!isClient ? (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ClipboardList className="h-5 w-5" />
                Playbooks
              </CardTitle>
              <CardDescription>
                Modelos operacionais por tipo de visita, com tarefas, atividades e documentos.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Crie checklists de preparação e encerramento reutilizáveis. A aplicação na visita
                será feita a partir destes modelos.
              </p>
              <Button asChild variant="outline">
                <Link to="/configuracoes/playbooks">
                  <ClipboardList className="h-4 w-4" />
                  Gerenciar playbooks
                </Link>
              </Button>
            </CardContent>
          </Card>
        ) : null}

        {!isClient ? (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Trash2 className="h-5 w-5" />
                Lixeira
              </CardTitle>
              <CardDescription>
                Itens excluídos ficam disponíveis por {TRASH_RETENTION_DAYS} dias.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Visitas, visitantes, agenda, tarefas, financeiro e documentos excluídos
                podem ser restaurados ou apagados permanentemente.
              </p>
              <Button
                asChild
                className="bg-red-300 text-red-900 hover:bg-red-200"
              >
                <Link to="/configuracoes/lixeira">
                  <Trash2 className="h-4 w-4" />
                  Abrir lixeira
                </Link>
              </Button>
            </CardContent>
          </Card>
        ) : null}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            Notificações
          </CardTitle>
          <CardDescription>
            Escolha quais alertas deseja receber no sino do cabeçalho.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="divide-y">
            {NOTIFICATION_PREFERENCE_ITEMS.map((item) => (
              <div
                key={item.key}
                className="flex items-center justify-between gap-4 py-4 first:pt-0 last:pb-0"
              >
                <div className="space-y-0.5">
                  <Label htmlFor={`notif-${item.key}`} className="text-sm font-medium">
                    {item.label}
                  </Label>
                  <p className="text-sm text-muted-foreground">{item.description}</p>
                </div>
                <Switch
                  id={`notif-${item.key}`}
                  checked={notificationPrefs[item.key]}
                  disabled={savingPrefs}
                  onCheckedChange={(checked) =>
                    void handleNotificationToggle(item.key, checked)
                  }
                />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarDays className="h-5 w-5" />
            Calendários externos
          </CardTitle>
          <CardDescription>
            Envie as atividades da programação para a sua agenda pessoal.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {isClient ? (
            <p className="text-sm text-muted-foreground">
              A conexão com calendários externos é feita pela equipe organizadora.
            </p>
          ) : (
            <>
              <div className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-1">
                  <p className="text-sm font-medium">Google Calendar</p>
                  {calendarLoading ? (
                    <p className="text-sm text-muted-foreground">Verificando conexão...</p>
                  ) : calendar?.google.connected ? (
                    <p className="text-sm text-muted-foreground">
                      Conectado
                      {calendar.google.email ? ` como ${calendar.google.email}` : ''}
                    </p>
                  ) : (
                    <p className="text-sm text-muted-foreground">Nenhuma conta conectada.</p>
                  )}
                  {calendar?.google.needsReauth ? (
                    <p className="text-sm font-medium text-amber-600">
                      A autorização expirou. Reconecte o Google Calendar.
                    </p>
                  ) : null}
                </div>
                {calendar?.google.connected ? (
                  <Button
                    variant="outline"
                    disabled={calendarBusy || calendarLoading}
                    onClick={() => void handleDisconnectGoogle()}
                  >
                    {calendarBusy ? 'Aguarde...' : 'Desconectar'}
                  </Button>
                ) : (
                  <Button
                    disabled={calendarBusy || calendarLoading}
                    onClick={() => void handleConnectGoogle()}
                  >
                    {calendarBusy ? 'Abrindo consentimento...' : 'Conectar'}
                  </Button>
                )}
              </div>

              <div className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-1">
                  <p className="text-sm font-medium">Outlook</p>
                  <p className="text-sm text-muted-foreground">
                    Integração com Microsoft 365 ainda em desenvolvimento.
                  </p>
                </div>
                <Button variant="outline" disabled>
                  Em breve
                </Button>
              </div>

              {!calendarLoading && calendar && !calendar.credentialsConfigured ? (
                <p className="text-xs text-muted-foreground">
                  Defina GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET nas Functions para habilitar a
                  conexão.
                </p>
              ) : null}
            </>
          )}
        </CardContent>
      </Card>

      {canManageOrgUsers(isAdmin, isOrgAdmin) && activeOrgId ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5" />
              Usuários da empresa
            </CardTitle>
            <CardDescription>
              {activeOrg
                ? `${seatUsage.members + seatUsage.pending}/${activeOrg.maxUsers} acessos utilizados (${seatUsage.members} ativos, ${seatUsage.pending} convites pendentes). O Master define o limite; aqui você convida funcionários até esse teto.`
                : 'Gerencie convites e membros da empresa.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {orgMembers.length > 0 ? (
              <div className="space-y-2">
                {orgMembers.map((member) => (
                  <div
                    key={member.id}
                    className="flex flex-col gap-1 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div>
                      <p className="text-sm font-medium">{member.name}</p>
                      <p className="text-xs text-muted-foreground">{member.email}</p>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {orgRoleLabel(member.orgRole)}
                      {member.department ? ` · ${member.department}` : ''}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Nenhum membro cadastrado ainda.</p>
            )}

            <form
              className="space-y-3 border-t pt-4"
              onSubmit={(event) => {
                event.preventDefault()
                void handleInvite()
              }}
            >
            <div className="space-y-2">
              <Label htmlFor="invite-email">E-mail</Label>
              <Input
                id="invite-email"
                type="email"
                required
                autoComplete="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="pessoa@empresa.com"
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="invite-role">Perfil</Label>
                <Select
                  value={inviteRole}
                  onValueChange={(v) => setInviteRole(v as InviteRole)}
                >
                  <SelectTrigger id="invite-role">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(isAdmin || isOrgAdmin) && (
                      <SelectItem value="org_admin">Admin da empresa</SelectItem>
                    )}
                    <SelectItem value="user">Usuário</SelectItem>
                    <SelectItem value="team">Equipe</SelectItem>
                    <SelectItem value="client">Cliente</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="invite-department">Setor (opcional)</Label>
                <Input
                  id="invite-department"
                  value={inviteDepartment}
                  onChange={(e) => setInviteDepartment(e.target.value)}
                  placeholder="Comercial, Eventos..."
                />
              </div>
            </div>
            <Button
              type="submit"
              disabled={
                inviting ||
                !inviteEmail.trim() ||
                (activeOrg
                  ? seatUsage.members + seatUsage.pending >= activeOrg.maxUsers
                  : false)
              }
            >
              {inviting ? 'Enviando...' : 'Convidar'}
            </Button>
            {lastInviteLink ? (
              <div className="space-y-2 rounded-lg border bg-muted/40 p-3" role="status">
                <Label htmlFor="invite-link">Link do convite</Label>
                <Input id="invite-link" readOnly value={lastInviteLink} className="font-mono text-xs" />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    void navigator.clipboard.writeText(lastInviteLink)
                    toast.success('Link copiado')
                  }}
                >
                  Copiar link
                </Button>
              </div>
            ) : null}
            </form>
          </CardContent>
        </Card>
      ) : null}

      {isAdmin ? (
        <Card>
          <CardHeader>
            <CardTitle>Permissões por módulo</CardTitle>
            <CardDescription>
              Controle o acesso de usuários da equipe aos módulos.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {users.filter((u) => u.role === 'team' || u.role === 'user').length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum usuário listado.</p>
            ) : (
              users
                .filter((u) => u.role === 'team' || u.role === 'user')
                .map((u) => {
                  const perms = mergeModulePermissions(u.modulePermissions)
                  return (
                    <div key={u.uid} className="rounded-lg border p-3">
                      <p className="mb-2 text-sm font-medium">
                        {u.name} <span className="text-muted-foreground">({u.email})</span>
                      </p>
                      <div className="grid gap-2 sm:grid-cols-2">
                        {(
                          [
                            ['visitors', 'Visitantes'],
                            ['planning', 'Planejamento'],
                            ['finance', 'Financeiro'],
                            ['reports', 'Relatórios'],
                          ] as const
                        ).map(([key, label]) => (
                          <label key={key} className="flex items-center justify-between text-sm">
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

      {!isClient ? (
        <Card>
          <CardHeader>
            <CardTitle>Log de e-mails</CardTitle>
            <CardDescription>Envios recentes (resumo e convites).</CardDescription>
          </CardHeader>
          <CardContent>
            {emailLogs.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum envio registrado.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {emailLogs.slice(0, 20).map((log) => (
                  <li key={log.id} className="rounded-lg border px-3 py-2">
                    <p className="font-medium">{log.subject}</p>
                    <p className="text-xs text-muted-foreground">
                      {log.to.join(', ')} · {log.kind} · {log.status}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}
