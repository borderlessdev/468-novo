import { Bell, Menu, PanelLeft, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { useAuth } from '@/contexts/AuthContext'
import { useVisitDialog } from '@/contexts/VisitDialogContext'

interface AppHeaderProps {
  onMenuClick: () => void
  onToggleCollapse: () => void
}

export function AppHeader({ onMenuClick, onToggleCollapse }: AppHeaderProps) {
  const { profile } = useAuth()
  const { setOpen } = useVisitDialog()
  const initials = (profile?.name ?? 'U')
    .split(' ')
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-border bg-card/90 px-4 backdrop-blur md:px-6">
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          className="lg:hidden"
          onClick={onMenuClick}
          aria-label="Abrir menu"
        >
          <Menu className="h-5 w-5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="hidden lg:inline-flex"
          onClick={onToggleCollapse}
          aria-label="Recolher menu"
        >
          <PanelLeft className="h-5 w-5" />
        </Button>
      </div>

      <div className="flex items-center gap-2 sm:gap-3">
        <Button onClick={() => setOpen(true)} className="gap-1.5">
          <Plus className="h-4 w-4" />
          <span className="hidden sm:inline">Nova Visita</span>
        </Button>
        <Button variant="ghost" size="icon" className="relative" aria-label="Notificações">
          <Bell className="h-5 w-5" />
          <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-red-500" />
        </Button>
        <Avatar>
          {profile?.photoURL ? <AvatarImage src={profile.photoURL} alt={profile.name} /> : null}
          <AvatarFallback>{initials}</AvatarFallback>
        </Avatar>
      </div>
    </header>
  )
}
