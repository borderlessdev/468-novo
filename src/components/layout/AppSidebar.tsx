import { NavLink } from 'react-router-dom'
import {
  BarChart3,
  Calendar,
  Compass,
  DollarSign,
  LayoutDashboard,
  ListTodo,
  MapPin,
  Settings,
  Users,
  X,
} from 'lucide-react'
import { cn } from '@/lib/utils'

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
}

export function AppSidebar({ open, onClose, collapsed }: AppSidebarProps) {
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
          'fixed inset-y-0 left-0 z-50 flex flex-col bg-sidebar text-sidebar-foreground transition-all duration-200 lg:static',
          collapsed ? 'w-[72px]' : 'w-64',
          open ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
        )}
      >
        <div className={cn('flex h-16 items-center gap-3 px-4', collapsed && 'justify-center px-2')}>
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#D4A017] text-sidebar">
            <Compass className="h-5 w-5" />
          </div>
          {!collapsed ? (
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-white">Promover Experience</p>
              <p className="truncate text-xs text-sidebar-foreground/70">Operações de visitas</p>
            </div>
          ) : null}
          <button
            type="button"
            className="rounded-md p-1 text-sidebar-foreground/80 lg:hidden"
            onClick={onClose}
            aria-label="Fechar menu"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <nav className="flex-1 space-y-1 px-3 py-4">
          {items.map((item) => {
            const Icon = icons[item.icon]
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                onClick={onClose}
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
      </aside>
    </>
  )
}
