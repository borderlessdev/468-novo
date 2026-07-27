import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import { AppSidebar } from '@/components/layout/AppSidebar'
import { AppHeader } from '@/components/layout/AppHeader'
import { NewVisitDialog } from '@/features/visits/NewVisitDialog'
import { useAuth } from '@/contexts/AuthContext'
import { VisitDialogProvider } from '@/contexts/VisitDialogContext'
import { cn } from '@/lib/utils'

export function AppShell() {
  const { role, isAdmin } = useAuth()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)

  return (
    <VisitDialogProvider>
      <div className="flex min-h-screen bg-background">
        <AppSidebar
          open={mobileOpen}
          onClose={() => setMobileOpen(false)}
          collapsed={collapsed}
          role={role}
          isAdmin={isAdmin}
        />
        <div className={cn('flex min-w-0 flex-1 flex-col')}>
          <AppHeader
            onMenuClick={() => setMobileOpen(true)}
            onToggleCollapse={() => setCollapsed((prev) => !prev)}
          />
          <main className="flex-1 p-4 md:p-6" key={refreshKey}>
            <Outlet />
          </main>
        </div>
      </div>
      <NewVisitDialog onCreated={() => setRefreshKey((k) => k + 1)} />
    </VisitDialogProvider>
  )
}
