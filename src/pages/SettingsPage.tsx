import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import {
  Bell,
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
import { useTheme, type Theme } from '@/contexts/ThemeContext'
import { mergeModulePermissions } from '@/lib/access'
import {
  mergeNotificationPreferences,
  NOTIFICATION_PREFERENCE_ITEMS,
  type NotificationPreferences,
} from '@/lib/notificationPreferences'
import { TRASH_RETENTION_DAYS } from '@/lib/trash'
import { cn } from '@/lib/utils'
import { createInvite } from '@/services/invites'
import { listEmailLogs } from '@/services/emailLogs'
import {
  listUsers,
  updateUserModulePermissions,
} from '@/services/users'
import type { EmailLog, ModulePermissions, UserProfile } from '@/types'

const THEME_OPTIONS: { value: Theme; label: string; icon: typeof Sun }[] = [
  { value: 'light', label: 'Claro', icon: Sun },
  { value: 'dark', label: 'Escuro', icon: Moon },
  { value: 'system', label: 'Sistema', icon: Monitor },
]

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
    canWrite,
    user,
  } = useAuth()
  const { theme, setTheme } = useTheme()
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<'team' | 'client'>('team')
  const [inviting, setInviting] = useState(false)
  const [lastInviteLink, setLastInviteLink] = useState('')
  const [users, setUsers] = useState<UserProfile[]>([])
  const [emailLogs, setEmailLogs] = useState<EmailLog[]>([])
  const [sendingReset, setSendingReset] = useState(false)
  const [notificationPrefs, setNotificationPrefs] = useState<NotificationPreferences>(
    () => mergeNotificationPreferences(profile?.notificationPreferences),
  )
  const [savingPrefs, setSavingPrefs] = useState(false)

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

  const handleInvite = async () => {
    if (!user || !inviteEmail.trim()) return
    setInviting(true)
    try {
      const created = await createInvite({
        email: inviteEmail,
        role: inviteRole,
        createdBy: user.uid,
      })
      setLastInviteLink(created.link)
      toast.success(
        created.mailtoOpened
          ? 'Convite criado — cliente de e-mail aberto'
          : 'Convite criado — copie o link abaixo',
      )
      setInviteEmail('')
      setEmailLogs(await listEmailLogs(user.uid, isAdmin))
    } catch (error) {
      console.error(error)
      toast.error('Não foi possível convidar')
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

      <div className="grid gap-6 lg:grid-cols-2">
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

      {canWrite && !isClient ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5" />
              Convidar usuário
            </CardTitle>
            <CardDescription>
              Envia link de cadastro para equipe ou cliente.
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
            <div className="space-y-2">
              <Label htmlFor="invite-role">Perfil</Label>
              <Select
                value={inviteRole}
                onValueChange={(v) => setInviteRole(v as 'team' | 'client')}
              >
                <SelectTrigger id="invite-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="team">Equipe</SelectItem>
                  <SelectItem value="client">Cliente</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button type="submit" disabled={inviting || !inviteEmail.trim()}>
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
