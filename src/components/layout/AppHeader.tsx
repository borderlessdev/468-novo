import { Menu } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { NotificationBell } from '@/components/notifications/NotificationBell'
import { useAuth } from '@/contexts/AuthContext'

interface AppHeaderProps {
  onMenuClick: () => void
}

export function AppHeader({ onMenuClick }: AppHeaderProps) {
  const { profile } = useAuth()
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
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-3 border-b border-border/80 bg-card/80 px-4 backdrop-blur-md md:px-6">
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
          <p className="truncate text-sm font-medium text-foreground">
            Olá, {firstName}
          </p>
          {roleLabel ? (
            <p className="truncate text-xs text-muted-foreground">{roleLabel}</p>
          ) : null}
        </div>
      </div>

      <div className="flex items-center gap-2 sm:gap-3">
        <NotificationBell />
        <Link
          to="/perfil"
          className="flex items-center gap-2.5 rounded-full border border-border/70 bg-muted/40 py-1 pr-3 pl-1 hover:opacity-95"
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
          <span className="hidden max-w-[120px] truncate text-sm font-medium sm:inline">
            {profile?.name ?? 'Usuário'}
          </span>
        </Link>
      </div>
    </header>
  )
}
