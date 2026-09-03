import { useEffect, useRef } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { toast } from 'sonner'
import { useAuth } from '@/contexts/AuthContext'
import { useOrg } from '@/contexts/OrgContext'
import { isNavAllowed } from '@/lib/access'
import { Skeleton } from '@/components/ui/skeleton'

export function ProtectedRoute() {
  const { user, loading, role, isPlatformAdmin, profile } = useAuth()
  const { activeOrgId, loading: orgLoading } = useOrg()
  const location = useLocation()
  const deniedPath = useRef<string | null>(null)

  const allowed =
    !user ||
    loading ||
    orgLoading ||
    isNavAllowed(location.pathname, role, isPlatformAdmin, profile?.modulePermissions)

  useEffect(() => {
    if (loading || orgLoading || !user || allowed) return
    if (deniedPath.current === location.pathname) return
    deniedPath.current = location.pathname
    toast.error('Você não tem permissão para acessar esta página')
  }, [allowed, loading, orgLoading, user, location.pathname])

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
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-6">
        <div className="max-w-md text-center">
          <h1 className="text-lg font-semibold">Conta sem empresa</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Peça um convite ao administrador da sua empresa para acessar o sistema.
          </p>
        </div>
      </div>
    )
  }

  return <Outlet />
}

export function PublicOnlyRoute() {
  const { user, loading, isPlatformAdmin } = useAuth()
  const { activeOrgId, loading: orgLoading } = useOrg()

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
    return <Navigate to="/" replace />
  }

  return <Outlet />
}
