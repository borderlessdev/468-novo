import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
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
  const [loading, setLoading] = useState(false)
  const form = useForm<ResetInput>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { email: '' },
  })

  const onSubmit = form.handleSubmit(async (values) => {
    setLoading(true)
    try {
      await resetPassword(values.email)
      toast.success('E-mail de recuperação enviado')
      form.reset()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Falha ao enviar e-mail')
    } finally {
      setLoading(false)
    }
  })

  return (
    <AuthLayout
      title="Recuperar senha"
      subtitle="Informe seu e-mail para receber o link de redefinição."
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="email">E-mail</Label>
          <Input id="email" type="email" {...form.register('email')} />
          {form.formState.errors.email ? (
            <p className="text-xs text-destructive">{form.formState.errors.email.message}</p>
          ) : null}
        </div>
        <Button type="submit" className="w-full" disabled={loading}>
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
