import { useEffect, useRef, useState } from 'react'
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
import { clearPendingInviteToken, resolveInviteToken } from '@/lib/inviteSession'
import { registerSchema, type RegisterInput } from '@/lib/validations'
import { inviteRoleToUserRole } from '@/lib/org'
import { getInviteByToken, type PublicInvite } from '@/services/invites'

export function RegisterPage() {
  const { register: registerUser, user, acceptInviteLink, refreshProfile, logout } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const inviteFromUrl = searchParams.get('invite')
  const inviteToken = resolveInviteToken(inviteFromUrl)
  const [loading, setLoading] = useState(false)
  const [inviteLoading, setInviteLoading] = useState(Boolean(inviteToken))
  const [invite, setInvite] = useState<PublicInvite | null>(null)
  const [inviteInvalid, setInviteInvalid] = useState(false)
  const [inviteAcceptError, setInviteAcceptError] = useState<string | null>(null)
  const [switchingAccount, setSwitchingAccount] = useState(false)
  const acceptRequestId = useRef(0)
  const form = useForm<RegisterInput>({
    resolver: zodResolver(registerSchema),
    defaultValues: { name: '', email: '', password: '', confirmPassword: '' },
  })

  const loggedInEmail = user?.email?.trim().toLowerCase() ?? ''
  const inviteEmail = invite?.email.trim().toLowerCase() ?? ''
  const emailMismatch = Boolean(
    user && invite && inviteEmail && loggedInEmail && inviteEmail !== loggedInEmail,
  )

  useEffect(() => {
    if (!inviteToken) {
      setInviteLoading(false)
      setInvite(null)
      setInviteInvalid(false)
      return
    }
    setInviteLoading(true)
    void getInviteByToken(inviteToken)
      .then((found) => {
        if (!found) {
          setInviteInvalid(true)
          setInvite(null)
          clearPendingInviteToken()
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
        setInvite(null)
        clearPendingInviteToken()
        toast.error('Não foi possível validar o convite')
      })
      .finally(() => setInviteLoading(false))
  }, [inviteToken, form])

  // Conta já logada: aceita o convite só se o e-mail for o do convite.
  useEffect(() => {
    if (!user || !inviteToken || inviteLoading || inviteInvalid || !invite) return
    if (emailMismatch) {
      setInviteAcceptError(
        `Este convite é para ${invite.email}. Você está logado como ${user.email}.`,
      )
      return
    }

    const requestId = ++acceptRequestId.current
    setLoading(true)
    setInviteAcceptError(null)
    void acceptInviteLink(inviteToken)
      .then(async () => {
        if (acceptRequestId.current !== requestId) return
        await refreshProfile()
        clearPendingInviteToken()
        toast.success('Conta vinculada à empresa')
        navigate('/')
      })
      .catch((error) => {
        if (acceptRequestId.current !== requestId) return
        const message =
          error instanceof Error ? error.message : 'Não foi possível aceitar o convite'
        if (/já utilizado|inválido|expirado/i.test(message)) {
          void refreshProfile().then(() => {
            clearPendingInviteToken()
            toast.message('Convite já utilizado', {
              description: 'Se a empresa já estiver vinculada, continue no painel.',
            })
            navigate('/')
          })
          return
        }
        setInviteAcceptError(message)
      })
      .finally(() => {
        if (acceptRequestId.current === requestId) setLoading(false)
      })
  }, [
    user,
    inviteToken,
    inviteLoading,
    inviteInvalid,
    invite,
    emailMismatch,
    acceptInviteLink,
    refreshProfile,
    navigate,
  ])

  const switchToInviteAccount = async () => {
    if (!inviteToken || !invite) return
    setSwitchingAccount(true)
    try {
      await logout()
      navigate(
        `/login?invite=${encodeURIComponent(inviteToken)}&email=${encodeURIComponent(invite.email.trim().toLowerCase())}&notice=wrong-account`,
      )
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível sair da conta')
    } finally {
      setSwitchingAccount(false)
    }
  }

  const continueWithoutInvite = () => {
    clearPendingInviteToken()
    setInvite(null)
    setInviteInvalid(false)
    setInviteAcceptError(null)
    navigate('/cadastro', { replace: true })
  }

  const onSubmit = form.handleSubmit(async (values) => {
    if (inviteToken && (inviteInvalid || !invite)) {
      toast.error('Use um convite válido ou cadastre-se sem o parâmetro invite')
      return
    }
    setLoading(true)
    try {
      await registerUser(values.name, values.email, values.password, {
        role: invite ? inviteRoleToUserRole(invite.role) : 'user',
        inviteToken: invite ? inviteToken ?? undefined : undefined,
      })
      clearPendingInviteToken()
      toast.success(invite ? 'Empresa vinculada com sucesso' : 'Conta criada com sucesso')
      navigate('/')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Falha no cadastro'
      if (inviteToken && /já tem conta|senha atual|Esqueceu a senha/i.test(message)) {
        const email = values.email.trim().toLowerCase()
        navigate(
          `/login?invite=${encodeURIComponent(inviteToken)}&email=${encodeURIComponent(email)}&notice=existing`,
        )
        return
      }
      toast.error(message)
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
            <Link
              to={`/login${inviteFromUrl ? `?invite=${encodeURIComponent(inviteFromUrl)}` : ''}`}
              onClick={() => clearPendingInviteToken()}
            >
              Já tenho conta — Entrar
            </Link>
          </Button>
          <Button type="button" className="w-full" onClick={continueWithoutInvite}>
            Continuar sem convite
          </Button>
        </div>
      </AuthLayout>
    )
  }

  if (user && inviteToken && invite) {
    if (emailMismatch || inviteAcceptError) {
      const isMismatch = emailMismatch || /Este convite é para/i.test(inviteAcceptError ?? '')
      return (
        <AuthLayout
          title={isMismatch ? 'Conta diferente do convite' : 'Não foi possível vincular'}
          subtitle={
            isMismatch
              ? `Este convite é para ${invite.email}.`
              : inviteAcceptError ?? 'Tente novamente ou peça um novo convite.'
          }
        >
          <div className="space-y-4">
            {isMismatch ? (
              <p className="text-sm text-muted-foreground">
                Você está logado como{' '}
                <span className="font-medium text-foreground">{user.email}</span>. Para
                vincular a empresa, saia e entre com o e-mail do convite.
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">{inviteAcceptError}</p>
            )}
            {isMismatch ? (
              <Button
                type="button"
                className="w-full cursor-pointer"
                disabled={switchingAccount}
                onClick={() => void switchToInviteAccount()}
              >
                {switchingAccount ? 'Saindo...' : 'Sair e entrar com o e-mail do convite'}
              </Button>
            ) : null}
            <Button asChild variant="outline" className="w-full">
              <Link to="/">Continuar nesta conta</Link>
            </Button>
          </div>
        </AuthLayout>
      )
    }

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
            }. Se este e-mail já tem senha, use-a abaixo — o sistema vincula a empresa automaticamente.`
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
          {loading ? 'Criando...' : invite ? 'Criar conta ou vincular' : 'Criar conta'}
        </Button>
      </form>
      <p className="mt-4 text-center text-sm text-muted-foreground">
        Já tem conta?{' '}
        <Link
          to={
            inviteToken
              ? `/login?invite=${encodeURIComponent(inviteToken)}${
                  invite?.email ? `&email=${encodeURIComponent(invite.email)}` : ''
                }`
              : '/login'
          }
          className="font-medium text-primary hover:underline"
        >
          {inviteToken ? 'Entrar e vincular empresa' : 'Entrar'}
        </Link>
      </p>
    </AuthLayout>
  )
}
