import { useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Camera, Trash2 } from 'lucide-react'
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
  const { profile, updateProfileData, uploadAvatar, removeAvatar, resetPassword } = useAuth()
  const [saving, setSaving] = useState(false)
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  const [sendingReset, setSendingReset] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const form = useForm<ProfileInput>({
    resolver: zodResolver(profileSchema),
    values: {
      name: profile?.name ?? '',
    },
  })

  const initials = profile?.name
    ? profile.name
        .split(' ')
        .map((part) => part[0])
        .join('')
        .slice(0, 2)
        .toUpperCase()
    : 'U'

  const onSubmit = form.handleSubmit(async (values) => {
    setSaving(true)
    try {
      await updateProfileData({ name: values.name })
      toast.success('Perfil salvo')
    } catch (error) {
      console.error(error)
      toast.error('Não foi possível salvar o perfil')
    } finally {
      setSaving(false)
    }
  })

  const handlePhotoChange = async (file: File | undefined) => {
    if (!file) return
    setUploadingPhoto(true)
    try {
      await uploadAvatar(file)
      toast.success('Foto atualizada')
    } catch (error) {
      console.error(error)
      toast.error(error instanceof Error ? error.message : 'Falha no upload da foto')
    } finally {
      setUploadingPhoto(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleRemovePhoto = async () => {
    setUploadingPhoto(true)
    try {
      await removeAvatar()
      toast.success('Foto removida')
    } catch (error) {
      console.error(error)
      toast.error('Não foi possível remover a foto')
    } finally {
      setUploadingPhoto(false)
    }
  }

  const handleReset = async () => {
    if (!profile?.email) return
    setSendingReset(true)
    try {
      await resetPassword(profile.email)
      toast.success('E-mail de redefinição enviado')
    } catch {
      toast.error('Falha ao enviar e-mail')
    } finally {
      setSendingReset(false)
    }
  }

  return (
    <div className="animate-fade-in space-y-6">
      <PageHeader title="Perfil" description="Visualize e edite os dados da sua conta." />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Informações</CardTitle>
            <CardDescription>Nome, foto e e-mail.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-5">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                <Avatar className="h-20 w-20">
                  {profile?.photoURL ? (
                    <AvatarImage src={profile.photoURL} alt={profile.name} />
                  ) : null}
                  <AvatarFallback className="bg-primary text-[18px] font-semibold text-primary-foreground">
                    {initials}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1 space-y-3">
                  <div>
                    <p className="text-lg font-medium">{profile?.name}</p>
                    <p className="text-sm text-muted-foreground">{profile?.email}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/gif"
                      className="hidden"
                      onChange={(event) => {
                        void handlePhotoChange(event.target.files?.[0])
                      }}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={uploadingPhoto}
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <Camera className="h-4 w-4" />
                      {uploadingPhoto ? 'Enviando...' : 'Enviar foto'}
                    </Button>
                    {profile?.photoURL ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={uploadingPhoto}
                        onClick={() => void handleRemovePhoto()}
                      >
                        <Trash2 className="h-4 w-4" />
                        Remover
                      </Button>
                    ) : null}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    JPG, PNG, WEBP ou GIF · até 5 MB. Salva no Storage e no perfil.
                  </p>
                </div>
              </div>

              <form onSubmit={onSubmit} className="space-y-3">
                <div className="space-y-2">
                  <Label>Nome</Label>
                  <Input {...form.register('name')} />
                  {form.formState.errors.name ? (
                    <p className="text-xs text-destructive">
                      {form.formState.errors.name.message}
                    </p>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button type="submit" disabled={saving}>
                    {saving ? 'Salvando...' : 'Salvar'}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void handleReset()}
                    disabled={sendingReset || !profile?.email}
                  >
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
            <p className="text-sm text-muted-foreground">
              Você pode ajustar tema e notificações em Configurações.
            </p>
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
