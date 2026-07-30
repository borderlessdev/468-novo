import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import {
  Bell,
  KeyRound,
  Monitor,
  Moon,
  Sun,
  Trash2,
} from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { useAuth } from '@/contexts/AuthContext'
import { useTheme, type Theme } from '@/contexts/ThemeContext'
import {
  mergeNotificationPreferences,
  NOTIFICATION_PREFERENCE_ITEMS,
  type NotificationPreferences,
} from '@/lib/notificationPreferences'
import { TRASH_RETENTION_DAYS } from '@/lib/trash'
import { cn } from '@/lib/utils'
import { profileSchema, type ProfileInput } from '@/lib/validations'

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
  const { profile, updateProfileData, updateNotificationPreferences, resetPassword } =
    useAuth()
  const { theme, setTheme } = useTheme()
  const [savingProfile, setSavingProfile] = useState(false)
  const [sendingReset, setSendingReset] = useState(false)
  const [notificationPrefs, setNotificationPrefs] = useState<NotificationPreferences>(
    () => mergeNotificationPreferences(profile?.notificationPreferences),
  )
  const [savingPrefs, setSavingPrefs] = useState(false)

  const form = useForm<ProfileInput>({
    resolver: zodResolver(profileSchema),
    values: {
      name: profile?.name ?? '',
      photoURL: profile?.photoURL ?? '',
    },
  })

  useEffect(() => {
    setNotificationPrefs(mergeNotificationPreferences(profile?.notificationPreferences))
  }, [profile?.notificationPreferences])

  const onSubmitProfile = form.handleSubmit(async (values) => {
    setSavingProfile(true)
    try {
      await updateProfileData({
        name: values.name,
        photoURL: values.photoURL || undefined,
      })
      toast.success('Perfil atualizado')
    } catch (error) {
      console.error(error)
      toast.error('Não foi possível atualizar o perfil')
    } finally {
      setSavingProfile(false)
    }
  })

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
            <CardTitle>Perfil</CardTitle>
            <CardDescription>Informações básicas da sua conta.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={onSubmitProfile} className="space-y-4">
              <div className="space-y-2">
                <Label>Nome</Label>
                <Input {...form.register('name')} />
              </div>
              <div className="space-y-2">
                <Label>E-mail</Label>
                <Input value={profile?.email ?? ''} disabled />
              </div>
              <div className="space-y-2">
                <Label>URL da foto</Label>
                <Input {...form.register('photoURL')} placeholder="https://" />
              </div>
              <div className="space-y-2">
                <Label>Papel</Label>
                <Input value={profile?.role ?? 'user'} disabled />
              </div>
              <Button type="submit" disabled={savingProfile}>
                {savingProfile ? 'Salvando...' : 'Salvar alterações'}
              </Button>
            </form>
          </CardContent>
        </Card>

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
    </div>
  )
}
