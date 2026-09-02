import { Menu, ArrowLeftRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { NotificationBell } from '@/components/notifications/NotificationBell'
import { useAuth } from '@/contexts/AuthContext'
import { useOrg } from '@/contexts/OrgContext'

interface AppHeaderProps {
  onMenuClick: () => void
}

export function AppHeader({ onMenuClick }: AppHeaderProps) {
  const { profile, isPlatformAdmin } = useAuth()
  const { activeOrg } = useOrg()
  const firstName = (profile?.name ?? 'Usuário').split(' ')[0]
  const initials = (profile?.name ?? 'U')
    .split(' ')
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

  const roleLabel =
    profile?.role === 'admin'
      ? 'Administrador'
      : profile?.role === 'client'
        ? 'Cliente'
        : profile?.role === 'team'
          ? 'Equipe'
          : profile?.role === 'user'
            ? 'Usuário'
            : null

  return (
    <header className="sticky top-0 z-30 border-b border-border/70 bg-card/85 backdrop-blur-md">
      {activeOrg ? (
        <div className="flex items-center justify-between gap-3 border-b border-border/60 px-4 py-2 text-sm md:px-6">
          <p className="truncate text-muted-foreground">
            Empresa: <span className="font-medium text-foreground">{activeOrg.name}</span>
          </p>
          {isPlatformAdmin ? (
            <Button asChild variant="outline" size="sm" className="shrink-0">
              <Link to="/empresas">
                <ArrowLeftRight className="h-4 w-4" />
                Trocar empresa
              </Link>
            </Button>
          ) : null}
        </div>
      ) : null}
      <div className="flex h-14 items-center justify-between gap-3 px-4 md:h-16 md:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            className="shrink-0 lg:hidden"
            onClick={onMenuClick}
            aria-label="Abrir menu"
          >
            <Menu className="h-5 w-5" />
          </Button>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium leading-tight text-foreground">
              Olá, {firstName}
            </p>
            {roleLabel ? (
              <p className="truncate text-xs leading-tight text-muted-foreground">{roleLabel}</p>
            ) : null}
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-2.5">
          <NotificationBell />
          <Link
            to="/perfil"
            className="flex items-center gap-2.5 rounded-full border border-border/60 bg-muted/30 py-1 pr-3 pl-1 transition-colors hover:bg-muted/55"
            aria-label="Abrir perfil"
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
              {profile?.name ?? 'Usuário'}
            </span>
          </Link>
        </div>
      </div>
    </header>
  )
}
