import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { AuthLayout } from '@/components/layout/AuthLayout'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PasswordInput } from '@/components/ui/password-input'
import { Skeleton } from '@/components/ui/skeleton'
import { useAuth } from '@/contexts/AuthContext'
import { registerSchema, type RegisterInput } from '@/lib/validations'
import { inviteRoleToUserRole } from '@/lib/org'
import { getInviteByToken } from '@/services/invites'
import type { Invite } from '@/types'

export function RegisterPage() {
  const { register: registerUser, user, acceptInviteLink, refreshProfile } = useAuth()
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
      .catch((error) => {
        console.error(error)
        setInviteInvalid(true)
        toast.error('Não foi possível validar o convite')
      })
      .finally(() => setInviteLoading(false))
  }, [inviteToken, form])

  // Conta já logada sem empresa: aceita o convite sem criar Auth de novo.
  useEffect(() => {
    if (!user || !inviteToken || inviteLoading || inviteInvalid || !invite) return
    let cancelled = false
    setLoading(true)
    void acceptInviteLink(inviteToken)
      .then(async () => {
        if (cancelled) return
        await refreshProfile()
        toast.success('Conta vinculada à empresa')
        navigate('/')
      })
      .catch((error) => {
        if (cancelled) return
        toast.error(error instanceof Error ? error.message : 'Não foi possível aceitar o convite')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [
    user,
    inviteToken,
    inviteLoading,
    inviteInvalid,
    invite,
    acceptInviteLink,
    refreshProfile,
    navigate,
  ])

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
      const message = error instanceof Error ? error.message : 'Falha no cadastro'
      toast.error(message)
      if (inviteToken && /já tem conta|já está em uso/i.test(message)) {
        navigate(`/login?invite=${encodeURIComponent(inviteToken)}`)
      }
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
            Peça um novo convite ao operador. Se você já criou a conta, entre e use o
            link novo para vincular à empresa.
          </p>
          <Button asChild className="w-full" variant="outline">
            <Link to={inviteToken ? `/login?invite=${encodeURIComponent(inviteToken)}` : '/login'}>
              Já tenho conta — Entrar
            </Link>
          </Button>
          <p className="text-sm text-muted-foreground">
            Sem convite?{' '}
            <Link to="/cadastro" className="font-medium text-primary hover:underline">
              Criar conta padrão
            </Link>
          </p>
        </div>
      </AuthLayout>
    )
  }

  if (user && inviteToken && invite) {
    return (
      <AuthLayout title="Vincular empresa" subtitle="Aceitando convite na sua conta...">
        <Skeleton className="h-10 w-full" />
      </AuthLayout>
    )
  }

  return (
    <AuthLayout
      title="Criar conta"
      subtitle={
        invite
          ? `Convite como ${
              invite.role === 'org_admin'
                ? 'admin da empresa'
                : invite.role === 'team'
                  ? 'equipe'
                  : invite.role === 'user'
                    ? 'usuário'
                    : 'cliente'
            }.`
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
          <PasswordInput
            id="password"
            autoComplete="new-password"
            allowGenerate
            {...form.register('password')}
            onGenerated={(password) => {
              form.setValue('password', password, { shouldValidate: true })
              form.setValue('confirmPassword', password, { shouldValidate: true })
            }}
          />
          {form.formState.errors.password ? (
            <p className="text-xs text-destructive">{form.formState.errors.password.message}</p>
          ) : null}
        </div>
        <div className="space-y-2">
          <Label htmlFor="confirmPassword">Confirmar senha</Label>
          <PasswordInput
            id="confirmPassword"
            autoComplete="new-password"
            {...form.register('confirmPassword')}
          />
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
        <Link
          to={inviteToken ? `/login?invite=${encodeURIComponent(inviteToken)}` : '/login'}
          className="font-medium text-primary hover:underline"
        >
          Entrar
        </Link>
      </p>
    </AuthLayout>
  )
}
