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
import { useAuth } from '@/contexts/AuthContext'
import { loginSchema, type LoginInput } from '@/lib/validations'
import { getInviteByToken } from '@/services/invites'

export function LoginPage() {
  const { login, acceptInviteLink } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const inviteToken = searchParams.get('invite')
  const emailFromQuery = searchParams.get('email')?.trim().toLowerCase() ?? ''
  const [loading, setLoading] = useState(false)
  const [inviteEmail, setInviteEmail] = useState(emailFromQuery)
  const form = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: emailFromQuery, password: '' },
  })

  useEffect(() => {
    if (!inviteToken) return
    void getInviteByToken(inviteToken)
      .then((found) => {
        if (!found) return
        const email = found.email.trim().toLowerCase()
        setInviteEmail(email)
        form.setValue('email', email)
      })
      .catch((error) => {
        console.error(error)
      })
  }, [inviteToken, form])

  const lockedEmail = inviteEmail || emailFromQuery
  const resetHref = lockedEmail
    ? `/recuperar-senha?email=${encodeURIComponent(lockedEmail)}${
        inviteToken ? `&invite=${encodeURIComponent(inviteToken)}` : ''
      }`
    : inviteToken
      ? `/recuperar-senha?invite=${encodeURIComponent(inviteToken)}`
      : '/recuperar-senha'

  const onSubmit = form.handleSubmit(async (values) => {
    setLoading(true)
    try {
      const email = values.email.trim().toLowerCase()
      await login(email, values.password)
      if (inviteToken) {
        try {
          await acceptInviteLink(inviteToken)
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

  return (
    <AuthLayout
      title="Entrar"
      subtitle={
        inviteToken
          ? 'Este e-mail já possui conta. Entre com a senha atual (a que o administrador enviou) para vincular à empresa.'
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
            readOnly={Boolean(inviteToken && lockedEmail)}
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
        <Button type="submit" className="w-full" disabled={loading}>
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
