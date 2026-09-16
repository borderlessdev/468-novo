import { useEffect, useRef, useState } from 'react'
import { Link, Navigate, Outlet, useLocation, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { useAuth } from '@/contexts/AuthContext'
import { useOrg } from '@/contexts/OrgContext'
import { isNavAllowed } from '@/lib/access'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'

function extractInviteToken(raw: string): string | null {
  const value = raw.trim()
  if (!value) return null
  try {
    if (value.includes('invite=')) {
      const url = new URL(value, window.location.origin)
      return url.searchParams.get('invite')
    }
  } catch {
    // ignore — pode ser só o token
  }
  const match = value.match(/[?&]invite=([^&#]+)/i)
  if (match?.[1]) return decodeURIComponent(match[1])
  return value.replace(/\s+/g, '')
}

export function ProtectedRoute() {
  const {
    user,
    loading,
    role,
    isPlatformAdmin,
    profile,
    logout,
    acceptInviteLink,
    refreshProfile,
  } = useAuth()
  const { activeOrgId, loading: orgLoading, refreshOrg } = useOrg()
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  const deniedPath = useRef<string | null>(null)
  const [loggingOut, setLoggingOut] = useState(false)
  const [inviteInput, setInviteInput] = useState('')
  const [linking, setLinking] = useState(false)
  const autoInviteTried = useRef<string | null>(null)

  const inviteFromUrl = searchParams.get('invite')

  const allowed =
    !user ||
    loading ||
    orgLoading ||
    isNavAllowed(location.pathname, role, isPlatformAdmin, profile?.modulePermissions)

  useEffect(() => {
    if (loading || orgLoading || !user || allowed) return
    if (deniedPath.current === location.pathname) return
    deniedPath.current = location.pathname
    // /empresas é só do Master — redireciona em silêncio para o dashboard da empresa
    const isEmpresas =
      location.pathname === '/empresas' || location.pathname.startsWith('/empresas/')
    if (!isEmpresas) {
      toast.error('Você não tem permissão para acessar esta página')
    }
  }, [allowed, loading, orgLoading, user, location.pathname])

  useEffect(() => {
    if (
      loading ||
      orgLoading ||
      !user ||
      isPlatformAdmin ||
      activeOrgId ||
      !inviteFromUrl ||
      autoInviteTried.current === inviteFromUrl
    ) {
      return
    }
    autoInviteTried.current = inviteFromUrl
    setLinking(true)
    void acceptInviteLink(inviteFromUrl)
      .then(async () => {
        await refreshProfile()
        await refreshOrg()
        toast.success('Empresa vinculada com sucesso')
        const next = new URLSearchParams(searchParams)
        next.delete('invite')
        setSearchParams(next, { replace: true })
      })
      .catch((error) => {
        toast.error(error instanceof Error ? error.message : 'Não foi possível aceitar o convite')
      })
      .finally(() => setLinking(false))
  }, [
    loading,
    orgLoading,
    user,
    isPlatformAdmin,
    activeOrgId,
    inviteFromUrl,
    acceptInviteLink,
    refreshProfile,
    refreshOrg,
    searchParams,
    setSearchParams,
  ])

  if (loading || orgLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-6">
        <div className="w-full max-w-md space-y-3">
          <Skeleton className="h-10 w-2/3" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location }} />
  }

  if (!allowed) {
    return <Navigate to="/" replace />
  }

  const isOrganizationsRoute =
    location.pathname === '/empresas' || location.pathname.startsWith('/empresas/')
  const isMasterAllowedWithoutOrg =
    isOrganizationsRoute || location.pathname === '/perfil'

  if (isPlatformAdmin && !activeOrgId && !isMasterAllowedWithoutOrg) {
    return <Navigate to="/empresas" replace />
  }

  if (!isPlatformAdmin && !activeOrgId && !isOrganizationsRoute) {
    const handleLogout = async () => {
      setLoggingOut(true)
      try {
        await logout()
        toast.success('Sessão encerrada')
      } finally {
        setLoggingOut(false)
      }
    }

    const handleLinkInvite = async () => {
      const token = extractInviteToken(inviteInput)
      if (!token) {
        toast.error('Cole o link do convite ou o token')
        return
      }
      setLinking(true)
      try {
        await acceptInviteLink(token)
        await refreshProfile()
        await refreshOrg()
        toast.success('Empresa vinculada com sucesso')
        setInviteInput('')
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Não foi possível vincular')
      } finally {
        setLinking(false)
      }
    }

    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-6">
        <div className="w-full max-w-md text-center">
          <h1 className="text-lg font-semibold">Conta sem empresa</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Sua conta existe, mas ainda não está vinculada a uma pasta. Cole o link do
            convite enviado pelo administrador (ou peça um novo).
          </p>
          <div className="mt-6 space-y-2 text-left">
            <Label htmlFor="invite-link">Link ou token do convite</Label>
            <Input
              id="invite-link"
              value={inviteInput}
              onChange={(event) => setInviteInput(event.target.value)}
              placeholder="https://…/cadastro?invite=… ou o token"
              disabled={linking}
            />
            <Button
              type="button"
              className="w-full"
              disabled={linking || !inviteInput.trim()}
              onClick={() => void handleLinkInvite()}
            >
              {linking ? 'Vinculando…' : 'Vincular à empresa'}
            </Button>
          </div>
          <div className="mt-4 flex flex-col gap-2">
            <Button type="button" variant="outline" disabled={loggingOut} onClick={handleLogout}>
              {loggingOut ? 'Saindo…' : 'Sair da conta'}
            </Button>
            <p className="text-xs text-muted-foreground">
              Precisa de um convite novo? Peça ao Master/admin em{' '}
              <span className="font-medium">Empresas → Convites</span>.
            </p>
            <Link to="/perfil" className="text-xs text-primary hover:underline">
              Abrir perfil
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return <Outlet />
}

export function PublicOnlyRoute() {
  const { user, loading, isPlatformAdmin } = useAuth()
  const { activeOrgId, loading: orgLoading } = useOrg()
  const [searchParams] = useSearchParams()
  const inviteToken = searchParams.get('invite')

  if (loading || (user && orgLoading)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Skeleton className="h-40 w-80" />
      </div>
    )
  }

  if (user) {
    if (isPlatformAdmin && !activeOrgId) {
      return <Navigate to="/empresas" replace />
    }
    // Conta sem empresa: deixa cadastro/login com convite processarem o vínculo.
    if (!activeOrgId && !isPlatformAdmin && inviteToken) {
      return <Outlet />
    }
    if (!activeOrgId && !isPlatformAdmin) {
      return <Navigate to="/" replace />
    }
    return <Navigate to="/" replace />
  }

  return <Outlet />
}
