import { useState, useRef } from 'react'
import { Link, NavLink } from 'react-router-dom'
import {
  BarChart3,
  Calendar,
  Compass,
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
import { LogoutConfirmCard } from '@/components/layout/LogoutConfirmCard'
import type { ModulePermissions, UserRole } from '@/types'

const icons = {
  LayoutDashboard,
  MapPin,
  Calendar,
  Users,
  ListTodo,
  DollarSign,
  BarChart3,
  Settings,
} as const

const items = [
  { to: '/', label: 'Dashboard', icon: 'LayoutDashboard' },
  { to: '/visitas', label: 'Visitas', icon: 'MapPin' },
  { to: '/agenda', label: 'Agenda', icon: 'Calendar' },
  { to: '/visitantes', label: 'Visitantes', icon: 'Users' },
  { to: '/planejamento', label: 'Planejamento', icon: 'ListTodo' },
  { to: '/financeiro', label: 'Financeiro', icon: 'DollarSign' },
  { to: '/relatorios', label: 'Relatórios', icon: 'BarChart3' },
  { to: '/configuracoes', label: 'Configurações', icon: 'Settings' },
] as const

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

  const expandIfCollapsed = () => {
    if (collapsed) onExpand()
  }

  return (
    <>
      <div
        className={cn(
          'fixed inset-0 z-40 bg-black/40 lg:hidden',
          open ? 'block' : 'hidden',
        )}
        onClick={onClose}
      />
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex h-screen flex-col bg-sidebar text-sidebar-foreground transition-all duration-200',
          collapsed ? 'w-[72px]' : 'w-64',
          open ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
        )}
        onClick={expandIfCollapsed}
      >
        <div
          className={cn(
            'flex h-16 items-center gap-2 border-b border-sidebar-foreground/10',
            collapsed ? 'justify-center px-2' : 'px-3',
          )}
        >
          <Link
            to="/"
            onClick={(event) => {
              event.stopPropagation()
              onClose()
            }}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#D4A017] text-sidebar transition-opacity hover:opacity-90"
            aria-label="Ir para a página inicial"
            title="Página inicial"
          >
            <Compass className="h-5 w-5" />
          </Link>
          {!collapsed ? (
            <>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-white">Promover Experience</p>
                <p className="truncate text-xs text-sidebar-foreground/70">Operações de visitas</p>
              </div>
              <button
                type="button"
                className="hidden cursor-pointer rounded-md p-1.5 text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent/60 hover:text-white lg:inline-flex"
                onClick={(event) => {
                  event.stopPropagation()
                  onToggleCollapse()
                }}
                aria-label="Recolher menu"
              >
                <PanelLeft className="h-4 w-4" />
              </button>
            </>
          ) : null}
          <button
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

        <nav className="flex-1 overflow-y-auto space-y-1 px-3 py-4">
          {items
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
                    'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                    collapsed && 'justify-center px-2',
                    isActive
                      ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                      : 'text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-white',
                  )
                }
                title={item.label}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {!collapsed ? <span>{item.label}</span> : null}
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
          <div className="border-t border-sidebar-foreground/10 p-3">
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
                'bg-red-300/10 text-red-200 hover:bg-red-300/20 hover:text-red-100',
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
