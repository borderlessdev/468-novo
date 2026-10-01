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
import { clearPendingInviteToken, resolveInviteToken } from '@/lib/inviteSession'
import { loginSchema, type LoginInput } from '@/lib/validations'
import { getInviteByToken } from '@/services/invites'

export function LoginPage() {
  const { login, acceptInviteLink, user, logout } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const inviteFromUrl = searchParams.get('invite')
  const inviteToken = resolveInviteToken(inviteFromUrl)
  const emailFromQuery = searchParams.get('email')?.trim().toLowerCase() ?? ''
  const notice = searchParams.get('notice')
  const existingAccountNotice = notice === 'existing'
  const wrongAccountNotice = notice === 'wrong-account'
  const [loading, setLoading] = useState(false)
  const [inviteLoading, setInviteLoading] = useState(Boolean(inviteToken))
  const [inviteEmail, setInviteEmail] = useState(emailFromQuery)
  const [inviteInvalid, setInviteInvalid] = useState(false)
  const [switchingAccount, setSwitchingAccount] = useState(false)
  const form = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: emailFromQuery, password: '' },
  })

  useEffect(() => {
    if (!inviteToken) {
      setInviteLoading(false)
      setInviteInvalid(false)
      return
    }
    setInviteLoading(true)
    void getInviteByToken(inviteToken)
      .then((found) => {
        if (!found) {
          setInviteInvalid(true)
          clearPendingInviteToken()
          toast.error('Convite inválido ou expirado')
          return
        }
        setInviteInvalid(false)
        const email = found.email.trim().toLowerCase()
        setInviteEmail(email)
        form.setValue('email', email)
      })
      .catch((error) => {
        console.error(error)
        setInviteInvalid(true)
        clearPendingInviteToken()
      })
      .finally(() => setInviteLoading(false))
  }, [inviteToken, form])

  useEffect(() => {
    if (existingAccountNotice) {
      toast.message('Este e-mail já tem conta', {
        description:
          'Use a senha atual ou clique em “Esqueceu a senha?”. O convite da empresa será mantido.',
      })
      return
    }
    if (wrongAccountNotice) {
      toast.message('Entre com o e-mail do convite', {
        description:
          'O convite é para outro e-mail. Faça login com a conta correta para vincular a empresa.',
      })
    }
  }, [existingAccountNotice, wrongAccountNotice])

  // Já logado + convite: PublicOnlyRoute redireciona para /?invite= — fallback se montar aqui.
  useEffect(() => {
    if (!user || !inviteToken || inviteLoading || inviteInvalid) return
    navigate(`/?invite=${encodeURIComponent(inviteToken)}`, { replace: true })
  }, [user, inviteToken, inviteLoading, inviteInvalid, navigate])

  const lockedEmail = inviteEmail || emailFromQuery
  const emailLocked = Boolean(inviteToken && (lockedEmail || inviteLoading))
  const resetHref = lockedEmail
    ? `/recuperar-senha?email=${encodeURIComponent(lockedEmail)}${
        inviteToken ? `&invite=${encodeURIComponent(inviteToken)}` : ''
      }`
    : inviteToken
      ? `/recuperar-senha?invite=${encodeURIComponent(inviteToken)}`
      : '/recuperar-senha'

  const onSubmit = form.handleSubmit(async (values) => {
    if (inviteToken && inviteLoading) return
    if (inviteToken && inviteInvalid) {
      toast.error('Use um convite válido')
      return
    }
    setLoading(true)
    try {
      const email = values.email.trim().toLowerCase()
      if (inviteEmail && email !== inviteEmail) {
        toast.error(`Este convite é para ${inviteEmail}. Entre com esse e-mail.`)
        return
      }
      await login(email, values.password)
      if (inviteToken) {
        try {
          await acceptInviteLink(inviteToken)
          clearPendingInviteToken()
          toast.success('Login realizado e empresa vinculada')
        } catch (inviteError) {
          toast.error(
            inviteError instanceof Error
              ? inviteError.message
              : 'Login ok, mas o convite não pôde ser aceito',
          )
          navigate(`/?invite=${encodeURIComponent(inviteToken)}`)
          return
        }
      } else {
        toast.success('Login realizado')
      }
      navigate('/')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Falha no login')
    } finally {
      setLoading(false)
    }
  })

  if (inviteLoading) {
    return (
      <AuthLayout title="Entrar" subtitle="Validando convite...">
        <Skeleton className="h-10 w-full" />
      </AuthLayout>
    )
  }

  if (inviteToken && inviteInvalid) {
    return (
      <AuthLayout title="Convite inválido" subtitle="Este link expirou ou já foi utilizado.">
        <div className="space-y-4">
          <Button
            type="button"
            className="w-full"
            onClick={() => {
              clearPendingInviteToken()
              navigate('/login', { replace: true })
            }}
          >
            Continuar sem convite
          </Button>
        </div>
      </AuthLayout>
    )
  }

  if (user && inviteToken) {
    return (
      <AuthLayout title="Vincular empresa" subtitle="Redirecionando para aceitar o convite...">
        <Skeleton className="h-10 w-full" />
        <Button
          type="button"
          variant="outline"
          className="mt-4 w-full"
          disabled={switchingAccount}
          onClick={() => {
            setSwitchingAccount(true)
            void logout().finally(() => setSwitchingAccount(false))
          }}
        >
          {switchingAccount ? 'Saindo...' : 'Sair da conta atual'}
        </Button>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout
      title="Entrar"
      subtitle={
        inviteToken
          ? wrongAccountNotice
            ? 'Saia da conta anterior e entre com o e-mail do convite para vincular a empresa.'
            : existingAccountNotice
              ? 'Este e-mail já possui conta. Digite a senha atual ou use “Esqueceu a senha?” para redefinir — o convite continua válido.'
              : 'Este e-mail já possui conta. Entre com a senha atual (a que o administrador enviou) para vincular à empresa.'
          : 'Acesse sua conta para gerenciar as operações.'
      }
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="email">E-mail</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            readOnly={emailLocked}
            {...form.register('email')}
          />
          {form.formState.errors.email ? (
            <p className="text-xs text-destructive">{form.formState.errors.email.message}</p>
          ) : null}
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="password">Senha</Label>
            <Link to={resetHref} className="text-xs text-primary hover:underline">
              Esqueceu a senha?
            </Link>
          </div>
          <PasswordInput
            id="password"
            autoComplete="current-password"
            {...form.register('password')}
          />
          {form.formState.errors.password ? (
            <p className="text-xs text-destructive">{form.formState.errors.password.message}</p>
          ) : null}
        </div>
        <Button type="submit" className="w-full" disabled={loading || Boolean(inviteToken && inviteLoading)}>
          {loading ? 'Entrando...' : inviteToken ? 'Entrar e vincular empresa' : 'Entrar'}
        </Button>
      </form>
      <p className="mt-4 text-center text-sm text-muted-foreground">
        Não tem conta?{' '}
        <Link
          to={inviteToken ? `/cadastro?invite=${encodeURIComponent(inviteToken)}` : '/cadastro'}
          className="font-medium text-primary hover:underline"
        >
          Criar conta
        </Link>
      </p>
    </AuthLayout>
  )
}
