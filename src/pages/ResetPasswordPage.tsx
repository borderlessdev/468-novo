import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { MailCheck } from 'lucide-react'
import { toast } from 'sonner'
import { AuthLayout } from '@/components/layout/AuthLayout'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAuth } from '@/contexts/AuthContext'
import { resetPasswordSchema } from '@/lib/validations'
import type { z } from 'zod'

type ResetInput = z.infer<typeof resetPasswordSchema>

export function ResetPasswordPage() {
  const { resetPassword } = useAuth()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const [sentEmail, setSentEmail] = useState<string | null>(null)
  const form = useForm<ResetInput>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { email: '' },
  })

  const onSubmit = form.handleSubmit(async (values) => {
    setLoading(true)
    try {
      const email = values.email.trim().toLowerCase()
      await resetPassword(email)
      setSentEmail(email)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Falha ao enviar e-mail')
    } finally {
      setLoading(false)
    }
  })

  if (sentEmail) {
    return (
      <AuthLayout
        title="E-mail enviado"
        subtitle="Se houver uma conta com este endereço, o link de redefinição já foi enviado."
      >
        <div className="space-y-6">
          <div className="flex flex-col items-center gap-3 rounded-xl border border-border bg-muted/40 px-4 py-6 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
              <MailCheck className="h-6 w-6" />
            </div>
            <p className="text-sm text-muted-foreground">
              Enviamos o link para{' '}
              <span className="font-medium text-foreground">{sentEmail}</span>.
              Confira a caixa de entrada e o spam.
            </p>
          </div>
          <Button type="button" className="w-full cursor-pointer" onClick={() => navigate('/login')}>
            OK
          </Button>
        </div>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout
      title="Recuperar senha"
      subtitle="Informe seu e-mail para receber o link de redefinição."
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="email">E-mail</Label>
          <Input id="email" type="email" autoComplete="email" {...form.register('email')} />
          {form.formState.errors.email ? (
            <p className="text-xs text-destructive">{form.formState.errors.email.message}</p>
          ) : null}
        </div>
        <Button type="submit" className="w-full cursor-pointer" disabled={loading}>
          {loading ? 'Enviando...' : 'Enviar link'}
        </Button>
      </form>
      <p className="mt-4 text-center text-sm text-muted-foreground">
        <Link to="/login" className="font-medium text-primary hover:underline">
          Voltar ao login
        </Link>
      </p>
    </AuthLayout>
  )
}
