import { useEffect, useRef } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { toast } from 'sonner'
import { useAuth } from '@/contexts/AuthContext'
import { isNavAllowed } from '@/lib/access'
import { Skeleton } from '@/components/ui/skeleton'

export function ProtectedRoute() {
  const { user, loading, role, isAdmin, profile } = useAuth()
  const location = useLocation()
  const deniedPath = useRef<string | null>(null)

  const allowed =
    !user ||
    loading ||
    isNavAllowed(location.pathname, role, isAdmin, profile?.modulePermissions)

  useEffect(() => {
    if (loading || !user || allowed) return
    if (deniedPath.current === location.pathname) return
    deniedPath.current = location.pathname
    toast.error('Você não tem permissão para acessar esta página')
  }, [allowed, loading, user, location.pathname])

  if (loading) {
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

  return <Outlet />
}

export function PublicOnlyRoute() {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Skeleton className="h-40 w-80" />
      </div>
    )
  }

  if (user) {
    return <Navigate to="/" replace />
  }

  return <Outlet />
}
