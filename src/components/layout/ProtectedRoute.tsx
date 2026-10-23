import { useEffect, useRef, useState } from 'react'
import { Navigate, Outlet, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { useAuth } from '@/contexts/AuthContext'
import { useOrg } from '@/contexts/OrgContext'
import { clientHomePath, isNavAllowed } from '@/lib/access'
import { clearPendingInviteToken, resolveInviteToken } from '@/lib/inviteSession'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { getInviteByToken } from '@/services/invites'

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
  const { activeOrgId, loading: orgLoading, refreshOrg, isOrgAdmin } = useOrg()
  const location = useLocation()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const deniedPath = useRef<string | null>(null)
  const [loggingOut, setLoggingOut] = useState(false)
  const [inviteInput, setInviteInput] = useState('')
  const [linking, setLinking] = useState(false)
  const [inviteMismatchEmail, setInviteMismatchEmail] = useState<string | null>(null)
  const [switchingAccount, setSwitchingAccount] = useState(false)
  const autoInviteTried = useRef<string | null>(null)

  const inviteFromUrl = resolveInviteToken(searchParams.get('invite'))

  const isMaster = isPlatformAdmin || profile?.role === 'admin'
  const clientHome = Boolean(user) && !isMaster && role === 'client'
  const allowed =
    !user ||
    loading ||
    orgLoading ||
    isNavAllowed(
      location.pathname,
      role,
      isPlatformAdmin,
      profile?.modulePermissions,
      isOrgAdmin,
    )

  useEffect(() => {
    if (loading || orgLoading || !user || allowed) return
    if (clientHome && location.pathname === '/') return
    if (deniedPath.current === location.pathname) return
    deniedPath.current = location.pathname
    const isEmpresas =
      location.pathname === '/empresas' || location.pathname.startsWith('/empresas/')
    if (!isEmpresas) {
      toast.error('Você não tem permissão para acessar esta página')
    }
  }, [allowed, clientHome, loading, orgLoading, user, location.pathname])

  useEffect(() => {
    if (loading || orgLoading || !user || isMaster || !inviteFromUrl) return
    if (autoInviteTried.current === inviteFromUrl) {
      const next = new URLSearchParams(searchParams)
      if (next.has('invite') && activeOrgId) {
        next.delete('invite')
        setSearchParams(next, { replace: true })
        clearPendingInviteToken()
      }
      return
    }
    autoInviteTried.current = inviteFromUrl

    let cancelled = false
    setLinking(true)
    setInviteMismatchEmail(null)

    void (async () => {
      try {
        const invite = await getInviteByToken(inviteFromUrl)
        if (cancelled) return

        if (!invite) {
          clearPendingInviteToken()
          const next = new URLSearchParams(searchParams)
          next.delete('invite')
          setSearchParams(next, { replace: true })
          if (!activeOrgId) {
            toast.error('Convite inválido, expirado ou já utilizado')
          }
          return
        }

        const userEmail = user.email?.trim().toLowerCase() ?? ''
        const inviteEmail = invite.email.trim().toLowerCase()
        if (userEmail && inviteEmail && userEmail !== inviteEmail) {
          autoInviteTried.current = inviteFromUrl
          setInviteMismatchEmail(invite.email)
          return
        }

        const joined = await acceptInviteLink(inviteFromUrl)
        if (cancelled) return
        await refreshProfile()
        await refreshOrg()
        clearPendingInviteToken()
        toast.success(
          activeOrgId && activeOrgId !== invite.orgId
            ? 'Empresa vinculada — pasta atualizada'
            : joined.visitId
              ? 'Convite aceito — evento vinculado'
              : 'Empresa vinculada com sucesso',
        )
        const next = new URLSearchParams(searchParams)
        next.delete('invite')
        setSearchParams(next, { replace: true })
        if (joined.visitId) {
          navigate(`/planejamento?visita=${encodeURIComponent(joined.visitId)}`, { replace: true })
        }
      } catch (error) {
        if (cancelled) return
        const message =
          error instanceof Error ? error.message : 'Não foi possível aceitar o convite'
        if (/já utilizado|expirado/i.test(message) && activeOrgId) {
          clearPendingInviteToken()
          const next = new URLSearchParams(searchParams)
          next.delete('invite')
          setSearchParams(next, { replace: true })
          return
        }
        if (/Este convite é para/i.test(message)) {
          const match = message.match(/Este convite é para ([^\s.]+)/i)
          setInviteMismatchEmail(match?.[1] ?? 'outro e-mail')
          return
        }
        toast.error(message)
      } finally {
        setLinking(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [
    loading,
    orgLoading,
    user,
    isMaster,
    activeOrgId,
    inviteFromUrl,
    acceptInviteLink,
    refreshProfile,
    refreshOrg,
    searchParams,
    setSearchParams,
    navigate,
  ])

  const switchToInviteAccount = async () => {
    if (!inviteFromUrl || !inviteMismatchEmail) return
    setSwitchingAccount(true)
    try {
      await logout()
      clearPendingInviteToken()
      resolveInviteToken(inviteFromUrl)
      window.location.assign(
        `/login?invite=${encodeURIComponent(inviteFromUrl)}&email=${encodeURIComponent(inviteMismatchEmail)}&notice=wrong-account`,
      )
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível sair da conta')
      setSwitchingAccount(false)
    }
  }

  if (loading || orgLoading || linking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-6">
        <div className="w-full max-w-md space-y-3">
          <Skeleton className="h-10 w-2/3" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
          <p className="text-center text-sm text-muted-foreground">
            {linking ? 'Vinculando empresa…' : 'Carregando sua sessão…'}
          </p>
        </div>
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location }} />
  }

  if (inviteMismatchEmail && inviteFromUrl) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-6">
        <div className="w-full max-w-md space-y-4 text-center">
          <h1 className="text-lg font-semibold">Conta diferente do convite</h1>
          <p className="text-sm text-muted-foreground">
            Este convite é para{' '}
            <span className="font-medium text-foreground">{inviteMismatchEmail}</span>. Você
            está logado como{' '}
            <span className="font-medium text-foreground">{user.email}</span>.
          </p>
          <Button
            type="button"
            className="w-full cursor-pointer"
            disabled={switchingAccount}
            onClick={() => void switchToInviteAccount()}
          >
            {switchingAccount ? 'Saindo...' : 'Sair e entrar com o e-mail do convite'}
          </Button>
          {activeOrgId ? (
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={() => {
                clearPendingInviteToken()
                setInviteMismatchEmail(null)
                const next = new URLSearchParams(searchParams)
                next.delete('invite')
                setSearchParams(next, { replace: true })
              }}
            >
              Continuar nesta conta
            </Button>
          ) : null}
        </div>
      </div>
    )
  }

  if (!allowed) {
    if (!clientHome) return <Navigate to="/" replace />
    const next = new URLSearchParams(searchParams)
    const query = next.toString()
    const target = clientHomePath()
    return <Navigate to={query ? `${target}?${query}` : target} replace />
  }

  const isOrganizationsRoute =
    location.pathname === '/empresas' || location.pathname.startsWith('/empresas/')
  const isMasterAllowedWithoutOrg =
    isOrganizationsRoute || location.pathname === '/perfil'

  if (isMaster && !activeOrgId && !isMasterAllowedWithoutOrg) {
    return <Navigate to="/empresas" replace />
  }

  if (!isMaster && !activeOrgId && !isOrganizationsRoute) {
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
        const invite = await getInviteByToken(token)
        if (!invite) {
          toast.error('Convite inválido, expirado ou já utilizado')
          return
        }
        const userEmail = user.email?.trim().toLowerCase() ?? ''
        const inviteEmail = invite.email.trim().toLowerCase()
        if (userEmail && inviteEmail && userEmail !== inviteEmail) {
          setInviteMismatchEmail(invite.email)
          resolveInviteToken(token)
          return
        }
        const joined = await acceptInviteLink(token)
        await refreshProfile()
        await refreshOrg()
        clearPendingInviteToken()
        toast.success(
          joined.visitId ? 'Convite aceito — evento vinculado' : 'Empresa vinculada com sucesso',
        )
        setInviteInput('')
        if (joined.visitId) {
          navigate(`/planejamento?visita=${encodeURIComponent(joined.visitId)}`, { replace: true })
        }
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
          </div>
        </div>
      </div>
    )
  }

  return <Outlet />
}

export function PublicOnlyRoute() {
  const { user, loading, isPlatformAdmin, role } = useAuth()
  const { activeOrgId, loading: orgLoading } = useOrg()
  const [searchParams] = useSearchParams()
  const inviteToken = resolveInviteToken(searchParams.get('invite'))

  if (loading || (user && orgLoading)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Skeleton className="h-40 w-80" />
      </div>
    )
  }

  if (user) {
    const home =
      !isPlatformAdmin && role === 'client' && activeOrgId ? clientHomePath() : '/'
    // Com convite pendente: processa no app (mesmo se já tiver empresa).
    const isMaster = isPlatformAdmin || role === 'admin'
    if (inviteToken && !isMaster) {
      return <Navigate to={`${home}?invite=${encodeURIComponent(inviteToken)}`} replace />
    }
    if (isMaster && !activeOrgId) {
      return <Navigate to="/empresas" replace />
    }
    if (!activeOrgId && !isMaster) {
      return <Navigate to="/" replace />
    }
    return <Navigate to={home} replace />
  }

  return <Outlet />
}
