import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { LogOut } from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAuth } from '@/contexts/AuthContext'
import { profileSchema, type ProfileInput } from '@/lib/validations'

export function SettingsPage() {
  const { profile, logout, updateProfileData } = useAuth()
  const [saving, setSaving] = useState(false)

  const form = useForm<ProfileInput>({
    resolver: zodResolver(profileSchema),
    values: {
      name: profile?.name ?? '',
      photoURL: profile?.photoURL ?? '',
    },
  })

  const onSubmit = form.handleSubmit(async (values) => {
    setSaving(true)
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
      setSaving(false)
    }
  })

  return (
    <div>
      <PageHeader
        title="Configurações"
        description="Gerencie seu perfil e preferências da conta."
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Perfil</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={onSubmit} className="space-y-4">
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
              <Button type="submit" disabled={saving}>
                {saving ? 'Salvando...' : 'Salvar alterações'}
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Sessão</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Encerre a sessão neste dispositivo com segurança.
            </p>
            <Button
              variant="destructive"
              onClick={() => {
                void logout().then(() => toast.success('Sessão encerrada'))
              }}
            >
              <LogOut className="h-4 w-4" />
              Sair da conta
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
