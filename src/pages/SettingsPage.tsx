import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { Trash2 } from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAuth } from '@/contexts/AuthContext'
import { TRASH_RETENTION_DAYS } from '@/lib/trash'
import { profileSchema, type ProfileInput } from '@/lib/validations'

export function SettingsPage() {
  const { profile, updateProfileData } = useAuth()
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

      <Card className="max-w-lg">
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

      <Card className="mt-6 max-w-lg">
        <CardHeader>
          <CardTitle>Lixeira</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Visitas, visitantes, agenda, tarefas, financeiro e documentos excluídos
            ficam na lixeira por {TRASH_RETENTION_DAYS} dias. Você pode restaurar ou apagar
            permanentemente.
          </p>
          <Button variant="outline" asChild>
            <Link to="/configuracoes/lixeira">
              <Trash2 className="h-4 w-4" />
              Abrir lixeira
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
