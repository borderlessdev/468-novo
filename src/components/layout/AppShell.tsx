import { useEffect, useState } from 'react'
import { Outlet } from 'react-router-dom'
import { AppSidebar } from '@/components/layout/AppSidebar'
import { AppHeader } from '@/components/layout/AppHeader'
import { NewVisitDialog } from '@/features/visits/NewVisitDialog'
import { HelpWidget } from '@/components/help/HelpWidget'
import { useAuth } from '@/contexts/AuthContext'
import { useOrg } from '@/contexts/OrgContext'
import { VisitDialogProvider } from '@/contexts/VisitDialogContext'
import { scanDueReminders } from '@/services/notificationReminders'
import { cn } from '@/lib/utils'

export function AppShell() {
  const { user, role, isPlatformAdmin, profile } = useAuth()
  const { activeOrgId } = useOrg()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    if (!user || !activeOrgId) return
    void scanDueReminders(activeOrgId, user.uid, isPlatformAdmin, role)
  }, [activeOrgId, user, isPlatformAdmin, role])

  return (
    <VisitDialogProvider>
      <div className="flex min-h-dvh items-start bg-background">
        <a
          href="#conteudo-principal"
          className="fixed left-4 top-3 z-[100] -translate-y-20 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-lg transition-transform focus:translate-y-0"
        >
          Pular para o conteúdo
        </a>
        <AppSidebar
          open={mobileOpen}
          onClose={() => setMobileOpen(false)}
          collapsed={collapsed}
          onToggleCollapse={() => setCollapsed((prev) => !prev)}
          onExpand={() => setCollapsed(false)}
          role={role}
          isAdmin={isPlatformAdmin}
          modulePermissions={profile?.modulePermissions}
        />
        <div
          className={cn(
            'flex min-w-0 flex-1 flex-col transition-all duration-200',
            collapsed ? 'lg:ml-[72px]' : 'lg:ml-64',
          )}
        >
          <AppHeader onMenuClick={() => setMobileOpen(true)} />
          <main
            id="conteudo-principal"
            tabIndex={-1}
            className="w-full overflow-x-hidden p-4 md:p-6 lg:p-8 lg:pt-7"
            key={refreshKey}
          >
            <div className="mx-auto w-full max-w-[1600px]">
              <Outlet />
            </div>
          </main>
        </div>
      </div>
      <NewVisitDialog onCreated={() => setRefreshKey((k) => k + 1)} />
      <HelpWidget />
    </VisitDialogProvider>
  )
}
