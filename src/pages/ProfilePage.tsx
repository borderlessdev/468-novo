import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { PageHeader } from '@/components/shared/PageHeader'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { useAuth } from '@/contexts/AuthContext'
import { profileSchema, type ProfileInput } from '@/lib/validations'

export function ProfilePage() {
  const { profile, updateProfileData, resetPassword } = useAuth()
  const [saving, setSaving] = useState(false)
  const [sendingReset, setSendingReset] = useState(false)

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
      await updateProfileData({ name: values.name, photoURL: values.photoURL || undefined })
      toast.success('Perfil salvo')
    } catch (error) {
      console.error(error)
      toast.error('Não foi possível salvar o perfil')
    } finally {
      setSaving(false)
    }
  })

  const handleReset = async () => {
    if (!profile?.email) return
    setSendingReset(true)
    try {
      await resetPassword(profile.email)
      toast.success('E-mail de redefinição enviado')
    } catch (error) {
      toast.error('Falha ao enviar e-mail')
    } finally {
      setSendingReset(false)
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Perfil" description="Visualize e edite os dados da sua conta." />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Informações</CardTitle>
            <CardDescription>Nome, foto e e-mail.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-4">
                <Avatar className="h-20 w-20">
                  {profile?.photoURL ? (
                    <AvatarImage src={profile.photoURL} alt={profile.name} />
                  ) : null}
                  <AvatarFallback className="bg-primary text-[18px] font-semibold text-primary-foreground">
                    {profile?.name ? profile.name.split(' ').map(p=>p[0]).join('').slice(0,2).toUpperCase() : 'U'}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="text-lg font-medium">{profile?.name}</p>
                  <p className="text-sm text-muted-foreground">{profile?.email}</p>
                </div>
              </div>

              <form onSubmit={onSubmit} className="space-y-3">
                <div className="space-y-2">
                  <Label>Nome</Label>
                  <Input {...form.register('name')} />
                </div>
                <div className="space-y-2">
                  <Label>URL da foto</Label>
                  <Input {...form.register('photoURL')} placeholder="https://" />
                </div>
                <div className="flex gap-2">
                  <Button type="submit" disabled={saving}>{saving ? 'Salvando...' : 'Salvar'}</Button>
                  <Button variant="outline" onClick={handleReset} disabled={sendingReset || !profile?.email}>
                    {sendingReset ? 'Enviando...' : 'Redefinir senha'}
                  </Button>
                </div>
              </form>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Preferências</CardTitle>
            <CardDescription>Atalhos e preferências pessoais.</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">Você pode ajustar tema e notificações em Configurações.</p>
            <div className="mt-4 text-sm">
              <p className="mb-2 font-medium">Papel</p>
              <p className="text-sm text-muted-foreground">{profile?.role ?? 'Usuário'}</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

export default ProfilePage
