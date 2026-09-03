import { useEffect, useState, useRef } from 'react'
import { Link, NavLink, Outlet } from 'react-router-dom'
import {
  FolderKanban,
  LayoutDashboard,
  LogOut,
  PanelLeft,
  Shield,
  X,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { LogoutConfirmCard } from '@/components/layout/LogoutConfirmCard'
import { useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'

const MASTER_NAV = [
  { to: '/empresas', label: 'Visão geral', icon: LayoutDashboard, end: true },
  { to: '/empresas#pastas', label: 'Pastas de clientes', icon: FolderKanban, end: false },
] as const

export function MasterShell() {
  const { profile } = useAuth()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const [logoutOpen, setLogoutOpen] = useState(false)
  const sairButtonRef = useRef<HTMLButtonElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!mobileOpen) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    closeButtonRef.current?.focus()
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMobileOpen(false)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [mobileOpen])

  const firstName = (profile?.name ?? 'Master').split(' ')[0]
  const initials = (profile?.name ?? 'M')
    .split(' ')
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

  return (
    <div className="flex min-h-dvh items-start bg-background">
      <div
        className={cn(
          'fixed inset-0 z-40 bg-black/50 backdrop-blur-[2px] transition-opacity lg:hidden',
          mobileOpen ? 'opacity-100' : 'pointer-events-none opacity-0',
        )}
        onClick={() => setMobileOpen(false)}
        aria-hidden={!mobileOpen}
      />

      <aside
        aria-label="Console master"
        className={cn(
          'fixed top-0 bottom-0 left-0 z-50 flex h-dvh min-h-dvh flex-col bg-sidebar text-sidebar-foreground shadow-[4px_0_24px_rgba(0,0,0,0.12)] transition-all duration-200',
          collapsed ? 'w-[72px]' : 'w-64',
          mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
        )}
      >
        <div
          className={cn(
            'flex h-16 items-center gap-2 border-b border-white/8',
            collapsed ? 'justify-center px-2' : 'px-3',
          )}
        >
          <Link
            to="/empresas"
            onClick={() => setMobileOpen(false)}
            className={cn(
              'flex shrink-0 items-center transition-opacity hover:opacity-90',
              collapsed ? 'h-9 w-9 justify-center overflow-hidden rounded-lg' : 'min-w-0 flex-1',
            )}
            aria-label="Console master"
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
              onClick={() => setCollapsed(true)}
              aria-label="Recolher menu"
            >
              <PanelLeft className="h-4 w-4" />
            </button>
          ) : null}
          <button
            ref={closeButtonRef}
            type="button"
            className="cursor-pointer rounded-md p-1 text-sidebar-foreground/80 lg:hidden"
            onClick={() => setMobileOpen(false)}
            aria-label="Fechar menu"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {!collapsed ? (
          <div className="border-b border-white/8 px-4 py-3">
            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-brand" />
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-sidebar-foreground/60">
                  Console
                </p>
                <p className="text-sm font-semibold text-white">Admin Master</p>
              </div>
            </div>
          </div>
        ) : null}

        <nav className="scrollbar-thin space-y-1 overflow-y-auto px-2.5 py-4">
          {MASTER_NAV.map((item) => {
            const Icon = item.icon
            return (
              <NavLink
                key={item.label}
                to={item.to}
                end={item.end}
                onClick={() => {
                  if (collapsed) setCollapsed(false)
                  setMobileOpen(false)
                }}
                className={({ isActive }) => {
                  const onPastasHash =
                    item.to.includes('#pastas') &&
                    typeof window !== 'undefined' &&
                    window.location.hash === '#pastas'
                  const active = item.end ? isActive : onPastasHash || (isActive && !item.end)
                  return cn(
                    'group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-150',
                    collapsed && 'justify-center px-2',
                    active
                      ? 'bg-sidebar-accent text-sidebar-accent-foreground shadow-sm'
                      : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-white',
                  )
                }}
                title={item.label}
              >
                <Icon className="h-4 w-4 shrink-0 text-inherit" />
                {!collapsed ? <span className="truncate">{item.label}</span> : null}
              </NavLink>
            )
          })}
        </nav>

        <div className="mt-auto shrink-0">
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
              onClick={() => {
                if (collapsed) setCollapsed(false)
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

      <div
        className={cn(
          'flex min-w-0 flex-1 flex-col transition-all duration-200',
          collapsed ? 'lg:ml-[72px]' : 'lg:ml-64',
        )}
      >
        <header className="sticky top-0 z-30 border-b border-border/70 bg-card/85 backdrop-blur-md">
          <div className="flex h-14 items-center justify-between gap-3 px-4 md:h-16 md:px-6">
            <div className="flex min-w-0 items-center gap-3">
              <Button
                variant="ghost"
                size="icon"
                className="shrink-0 lg:hidden"
                onClick={() => setMobileOpen(true)}
                aria-label="Abrir menu"
              >
                <PanelLeft className="h-5 w-5" />
              </Button>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium leading-tight">Olá, {firstName}</p>
                <p className="truncate text-xs text-muted-foreground">
                  Pastas de trabalho por cliente
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="hidden gap-1 sm:inline-flex">
                <Shield className="h-3 w-3 text-brand" />
                Master
              </Badge>
              <Link
                to="/perfil"
                className="flex items-center gap-2.5 rounded-full border border-border/60 bg-muted/30 py-1 pr-3 pl-1 transition-colors hover:bg-muted/55"
              >
                <Avatar className="h-8 w-8 ring-2 ring-brand/20">
                  {profile?.photoURL ? (
                    <AvatarImage src={profile.photoURL} alt={profile.name} />
                  ) : null}
                  <AvatarFallback className="bg-primary text-[11px] font-semibold text-primary-foreground">
                    {initials}
                  </AvatarFallback>
                </Avatar>
                <span className="hidden max-w-[140px] truncate text-sm font-medium sm:inline">
                  {profile?.name ?? 'Master'}
                </span>
              </Link>
            </div>
          </div>
        </header>

        <main className="w-full overflow-x-hidden p-4 md:p-6 lg:p-8 lg:pt-7">
          <div className="mx-auto w-full max-w-[1600px] animate-fade-in">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}
