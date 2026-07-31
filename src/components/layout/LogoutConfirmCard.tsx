import { useEffect, useRef, useState, type RefObject } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useAuth } from '@/contexts/AuthContext'

interface LogoutConfirmCardProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  collapsed: boolean
  triggerRef?: RefObject<HTMLButtonElement | null>
}

export function LogoutConfirmCard({
  open,
  onOpenChange,
  collapsed,
  triggerRef,
}: LogoutConfirmCardProps) {
  const { logout } = useAuth()
  const [loggingOut, setLoggingOut] = useState(false)
  const cardRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open || loggingOut) return

    const handleMouseDown = (event: MouseEvent) => {
      const target = event.target as Node
      if (cardRef.current?.contains(target)) return
      if (triggerRef?.current?.contains(target)) return
      onOpenChange(false)
    }

    document.addEventListener('mousedown', handleMouseDown)
    return () => document.removeEventListener('mousedown', handleMouseDown)
  }, [open, loggingOut, onOpenChange, triggerRef])

  const handleLogout = async () => {
    setLoggingOut(true)
    try {
      await logout()
      toast.success('Sessão encerrada')
      onOpenChange(false)
    } finally {
      setLoggingOut(false)
    }
  }

  return (
    <div
      className={cn(
        'grid transition-all duration-300 ease-out',
        open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0 pointer-events-none',
      )}
      aria-hidden={!open}
    >
      <div className="overflow-hidden">
        <div className={cn('px-3 pb-3', collapsed && 'px-2')}>
          <div className="rounded-xl border border-sidebar-foreground/20 bg-card p-3 text-card-foreground shadow-lg" ref={cardRef}>
            {!collapsed ? (
              <>
                <p className="text-sm font-semibold leading-none">Sair da conta?</p>
                <p className="mt-2 text-xs text-muted-foreground">
                  Tem certeza que deseja encerrar sua sessão?
                </p>
                <div className="mt-3 flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="cursor-pointer flex-1"
                    onClick={() => onOpenChange(false)}
                    disabled={loggingOut}
                  >
                    Cancelar
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    className="cursor-pointer flex-1 bg-[#8B0000] text-white hover:bg-[#6B0000]"
                    disabled={loggingOut}
                    onClick={() => void handleLogout()}
                  >
                    {loggingOut ? 'Saindo...' : 'Sair'}
                  </Button>
                </div>
              </>
            ) : (
              <div className="flex flex-col gap-2">
                <p className="text-center text-xs font-semibold">Sair?</p>
                <div className="flex gap-1">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="cursor-pointer flex-1 px-1"
                    onClick={() => onOpenChange(false)}
                    disabled={loggingOut}
                    title="Cancelar"
                  >
                    ✕
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    className="cursor-pointer flex-1 bg-[#8B0000] px-1 text-white hover:bg-[#6B0000]"
                    disabled={loggingOut}
                    onClick={() => void handleLogout()}
                    title="Sair"
                  >
                    {loggingOut ? '…' : '✓'}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
