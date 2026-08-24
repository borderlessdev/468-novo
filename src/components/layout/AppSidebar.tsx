import { useEffect, useState, useRef } from 'react'
import { Link, NavLink } from 'react-router-dom'
import {
  BarChart3,
  Calendar,
  ClipboardList,
  DollarSign,
  LayoutDashboard,
  ListTodo,
  LogOut,
  MapPin,
  PanelLeft,
  Settings,
  Users,
  X,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { isNavAllowed } from '@/lib/access'
import { NAV_ITEMS } from '@/lib/constants'
import { LogoutConfirmCard } from '@/components/layout/LogoutConfirmCard'
import type { ModulePermissions, UserRole } from '@/types'

const icons = {
  LayoutDashboard,
  ClipboardList,
  MapPin,
  Calendar,
  Users,
  ListTodo,
  DollarSign,
  BarChart3,
  Settings,
} as const

interface AppSidebarProps {
  open: boolean
  onClose: () => void
  collapsed: boolean
  onToggleCollapse: () => void
  onExpand: () => void
  role: UserRole
  isAdmin: boolean
  modulePermissions?: Partial<ModulePermissions> | null
}

export function AppSidebar({
  open,
  onClose,
  collapsed,
  onToggleCollapse,
  onExpand,
  role,
  isAdmin,
  modulePermissions,
}: AppSidebarProps) {
  const [logoutOpen, setLogoutOpen] = useState(false)
  const sairButtonRef = useRef<HTMLButtonElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    closeButtonRef.current?.focus()

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)

    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [open, onClose])

  const expandIfCollapsed = () => {
    if (collapsed) onExpand()
  }

  return (
    <>
      <div
        className={cn(
          'fixed inset-0 z-40 bg-black/50 backdrop-blur-[2px] transition-opacity lg:hidden',
          open ? 'opacity-100' : 'pointer-events-none opacity-0',
        )}
        onClick={onClose}
        aria-hidden={!open}
      />
      <aside
        aria-label="Navegação principal"
        className={cn(
          'fixed top-0 bottom-0 left-0 z-50 flex h-dvh min-h-dvh flex-col bg-sidebar text-sidebar-foreground shadow-[4px_0_24px_rgba(0,0,0,0.12)] transition-all duration-200',
          collapsed ? 'w-[72px]' : 'w-64',
          open ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
        )}
        onClick={expandIfCollapsed}
      >
        <div
          className={cn(
            'flex h-16 items-center gap-2 border-b border-white/8',
            collapsed ? 'justify-center px-2' : 'px-3',
          )}
        >
          <Link
            to="/"
            onClick={(event) => {
              event.stopPropagation()
              onClose()
            }}
            className={cn(
              'flex shrink-0 items-center transition-opacity hover:opacity-90',
              collapsed ? 'h-9 w-9 justify-center overflow-hidden rounded-lg' : 'min-w-0 flex-1',
            )}
            aria-label="Ir para a página inicial"
            title="Página inicial"
          >
            <img
              src="/logo.png"
              alt="Promover Experience"
              className={cn(
                'object-contain object-left mix-blend-lighten',
                collapsed ? 'h-9 w-9 scale-[2.4] object-left' : 'h-10 w-auto max-w-[168px]',
              )}
            />
          </Link>
          {!collapsed ? (
            <button
              type="button"
              className="hidden shrink-0 cursor-pointer rounded-md p-1.5 text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent/60 hover:text-white lg:inline-flex"
              onClick={(event) => {
                event.stopPropagation()
                onToggleCollapse()
              }}
              aria-label="Recolher menu"
            >
              <PanelLeft className="h-4 w-4" />
            </button>
          ) : null}
          <button
            ref={closeButtonRef}
            type="button"
            className="cursor-pointer rounded-md p-1 text-sidebar-foreground/80 lg:hidden"
            onClick={(event) => {
              event.stopPropagation()
              onClose()
            }}
            aria-label="Fechar menu"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <nav className="scrollbar-thin min-h-0 flex-1 space-y-0.5 overflow-y-auto px-2.5 py-4">
          {NAV_ITEMS
            .filter((item) => isNavAllowed(item.to, role, isAdmin, modulePermissions))
            .map((item) => {
              const Icon = icons[item.icon]
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === '/'}
                  onClick={() => {
                    if (collapsed) onExpand()
                    onClose()
                  }}
                  className={({ isActive }) =>
                    cn(
                      'group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-150',
                      collapsed && 'justify-center px-2',
                      isActive
                        ? 'bg-sidebar-accent text-sidebar-accent-foreground shadow-sm'
                        : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-white',
                    )
                  }
                  title={item.label}
                >
                  {({ isActive }) => (
                    <>
                      {isActive ? (
                        <span className="absolute top-1/2 left-0 h-5 w-0.5 -translate-y-1/2 rounded-r-full bg-brand" />
                      ) : null}
                      <Icon
                        className={cn(
                          'h-4 w-4 shrink-0 transition-colors',
                          isActive ? 'text-brand' : 'group-hover:text-white/90',
                        )}
                      />
                      {!collapsed ? <span>{item.label}</span> : null}
                    </>
                  )}
                </NavLink>
              )
            })}
        </nav>

        <div className="shrink-0">
          <LogoutConfirmCard
            open={logoutOpen}
            onOpenChange={setLogoutOpen}
            collapsed={collapsed}
            triggerRef={sairButtonRef}
          />
          <div className="border-t border-white/8 p-2.5">
            <button
              ref={sairButtonRef}
              type="button"
              onClick={(event) => {
                event.stopPropagation()
                if (collapsed) onExpand()
                setLogoutOpen(true)
              }}
              className={cn(
                'flex w-full cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                'text-red-300/80 hover:bg-red-400/10 hover:text-red-200',
                collapsed && 'justify-center px-2',
              )}
              title="Sair da conta"
            >
              <LogOut className="h-4 w-4 shrink-0" />
              {!collapsed ? <span>Sair</span> : null}
            </button>
          </div>
        </div>
      </aside>
    </>
  )
}
