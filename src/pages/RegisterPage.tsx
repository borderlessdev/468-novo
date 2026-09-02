import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { AuthLayout } from '@/components/layout/AuthLayout'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { useAuth } from '@/contexts/AuthContext'
import { registerSchema, type RegisterInput } from '@/lib/validations'
import { inviteRoleToUserRole } from '@/lib/org'
import { getInviteByToken } from '@/services/invites'
import type { Invite } from '@/types'

export function RegisterPage() {
  const { register: registerUser } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const inviteToken = searchParams.get('invite')
  const [loading, setLoading] = useState(false)
  const [inviteLoading, setInviteLoading] = useState(Boolean(inviteToken))
  const [invite, setInvite] = useState<Invite | null>(null)
  const [inviteInvalid, setInviteInvalid] = useState(false)
  const form = useForm<RegisterInput>({
    resolver: zodResolver(registerSchema),
    defaultValues: { name: '', email: '', password: '', confirmPassword: '' },
  })

  useEffect(() => {
    if (!inviteToken) {
      setInviteLoading(false)
      return
    }
    setInviteLoading(true)
    void getInviteByToken(inviteToken)
      .then((found) => {
        if (!found) {
          setInviteInvalid(true)
          toast.error('Convite inválido ou expirado')
          return
        }
        setInvite(found)
        setInviteInvalid(false)
        form.setValue('email', found.email)
      })
      .finally(() => setInviteLoading(false))
  }, [inviteToken, form])

  const onSubmit = form.handleSubmit(async (values) => {
    if (inviteToken && (inviteInvalid || !invite)) {
      toast.error('Use um convite válido ou cadastre-se sem o parâmetro invite')
      return
    }
    setLoading(true)
    try {
      await registerUser(values.name, values.email, values.password, {
        role: invite ? inviteRoleToUserRole(invite.role) : 'user',
        inviteId: invite?.id,
      })
      toast.success('Conta criada com sucesso')
      navigate('/')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Falha no cadastro')
    } finally {
      setLoading(false)
    }
  })

  if (inviteLoading) {
    return (
      <AuthLayout title="Criar conta" subtitle="Validando convite...">
        <div className="space-y-3">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      </AuthLayout>
    )
  }

  if (inviteToken && inviteInvalid) {
    return (
      <AuthLayout
        title="Convite inválido"
        subtitle="Este link expirou ou já foi utilizado."
      >
        <div className="space-y-4 text-center">
          <p className="text-sm text-muted-foreground">
            Peça um novo convite ao operador ou crie uma conta padrão.
          </p>
          <Button asChild className="w-full">
            <Link to="/cadastro">Criar conta sem convite</Link>
          </Button>
          <p className="text-sm text-muted-foreground">
            Já tem conta?{' '}
            <Link to="/login" className="font-medium text-primary hover:underline">
              Entrar
            </Link>
          </p>
        </div>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout
      title="Criar conta"
      subtitle={
        invite
          ? `Convite como ${invite.role === 'team' ? 'equipe' : 'cliente'}.`
          : 'Cadastre-se para começar a organizar visitas.'
      }
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="name">Nome</Label>
          <Input id="name" {...form.register('name')} />
          {form.formState.errors.name ? (
            <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>
          ) : null}
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">E-mail</Label>
          <Input
            id="email"
            type="email"
            {...form.register('email')}
            readOnly={Boolean(invite)}
          />
          {form.formState.errors.email ? (
            <p className="text-xs text-destructive">{form.formState.errors.email.message}</p>
          ) : null}
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Senha</Label>
          <Input id="password" type="password" {...form.register('password')} />
          {form.formState.errors.password ? (
            <p className="text-xs text-destructive">{form.formState.errors.password.message}</p>
          ) : null}
        </div>
        <div className="space-y-2">
          <Label htmlFor="confirmPassword">Confirmar senha</Label>
          <Input id="confirmPassword" type="password" {...form.register('confirmPassword')} />
          {form.formState.errors.confirmPassword ? (
            <p className="text-xs text-destructive">
              {form.formState.errors.confirmPassword.message}
            </p>
          ) : null}
        </div>
        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? 'Criando...' : 'Criar conta'}
        </Button>
      </form>
      <p className="mt-4 text-center text-sm text-muted-foreground">
        Já tem conta?{' '}
        <Link to="/login" className="font-medium text-primary hover:underline">
          Entrar
        </Link>
      </p>
    </AuthLayout>
  )
}
