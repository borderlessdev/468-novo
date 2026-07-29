import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { formatDistanceToNow } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import {
  Bell,
  BellOff,
  CalendarDays,
  CheckSquare,
  DollarSign,
  FileText,
  Users,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import { useAuth } from '@/contexts/AuthContext'
import { useNotifications } from '@/hooks/useNotifications'
import { cn } from '@/lib/utils'
import type { Notification, NotificationType } from '@/types'

function formatNotificationTime(notification: Notification): string {
  if (!notification.createdAt) return ''
  const date =
    typeof notification.createdAt === 'object' &&
    notification.createdAt !== null &&
    'toDate' in notification.createdAt &&
    typeof notification.createdAt.toDate === 'function'
      ? notification.createdAt.toDate()
      : new Date(String(notification.createdAt))

  if (Number.isNaN(date.getTime())) return ''

  return formatDistanceToNow(date, { addSuffix: true, locale: ptBR })
}

function NotificationIcon({ type }: { type: NotificationType }) {
  const className = 'h-4 w-4 shrink-0'
  switch (type) {
    case 'visit_created':
    case 'visit_status_changed':
      return <CalendarDays className={className} />
    case 'task_created':
    case 'task_status_changed':
    case 'task_due_soon':
      return <CheckSquare className={className} />
    case 'document_uploaded':
      return <FileText className={className} />
    case 'finance_nf_due':
      return <DollarSign className={className} />
    case 'team_updated':
      return <Users className={className} />
    default:
      return <Bell className={className} />
  }
}

function iconBgClass(type: NotificationType): string {
  switch (type) {
    case 'visit_created':
    case 'visit_status_changed':
      return 'bg-blue-500/10 text-blue-600 dark:text-blue-400'
    case 'task_created':
    case 'task_status_changed':
    case 'task_due_soon':
      return 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
    case 'document_uploaded':
      return 'bg-violet-500/10 text-violet-600 dark:text-violet-400'
    case 'finance_nf_due':
      return 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
    case 'team_updated':
      return 'bg-orange-500/10 text-orange-600 dark:text-orange-400'
    default:
      return 'bg-muted text-muted-foreground'
  }
}

export function NotificationBell() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { notifications, unreadCount, loading, markRead, markAllRead } =
    useNotifications(user?.uid)

  const [open, setOpen] = useState(false)
  const [showDot, setShowDot] = useState(false)
  const initialized = useRef(false)
  const prevUnreadCount = useRef(0)

  useEffect(() => {
    if (loading) return

    if (!initialized.current) {
      initialized.current = true
      if (unreadCount > 0) setShowDot(true)
      prevUnreadCount.current = unreadCount
      return
    }

    if (!open && unreadCount > prevUnreadCount.current) {
      setShowDot(true)
    }
    prevUnreadCount.current = unreadCount
  }, [unreadCount, open, loading])

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen)
    if (nextOpen) {
      setShowDot(false)
    }
  }

  const handleNotificationClick = async (notification: Notification) => {
    if (!notification.read) {
      await markRead(notification.id)
    }
    if (notification.href) {
      navigate(notification.href)
      setOpen(false)
    }
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn(
            'relative cursor-pointer transition-colors',
            open && 'bg-muted',
          )}
          aria-label="Notificações"
        >
          <Bell className={cn('h-5 w-5 transition-transform', open && 'scale-110')} />
          {showDot ? (
            <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-red-500 ring-2 ring-card" />
          ) : null}
        </Button>
      </PopoverTrigger>

      <PopoverContent
        className="w-[min(calc(100vw-2rem),22rem)] overflow-hidden p-0 shadow-xl"
        align="end"
        side="bottom"
        sideOffset={10}
      >
        <div className="flex items-center justify-between border-b border-border bg-muted/30 px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Bell className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-sm font-semibold leading-none">Notificações</h3>
              {unreadCount > 0 ? (
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  {unreadCount} não {unreadCount === 1 ? 'lida' : 'lidas'}
                </p>
              ) : (
                <p className="mt-0.5 text-[11px] text-muted-foreground">Tudo em dia</p>
              )}
            </div>
          </div>
          {unreadCount > 0 ? (
            <Button
              variant="ghost"
              size="sm"
              className="h-auto px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
              onClick={() => void markAllRead()}
            >
              Marcar todas
            </Button>
          ) : null}
        </div>

        {loading ? (
          <div className="space-y-2 p-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full rounded-lg" />
            ))}
          </div>
        ) : notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 px-6 py-10 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
              <BellOff className="h-5 w-5 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium">Nenhuma notificação</p>
            <p className="text-xs text-muted-foreground">
              Você será avisado sobre visitas, tarefas e documentos aqui.
            </p>
          </div>
        ) : (
          <ScrollArea className="max-h-[min(24rem,60vh)]">
            <ul className="p-2">
              {notifications.map((notification) => {
                const time = formatNotificationTime(notification)
                return (
                  <li key={notification.id} className="mb-1 last:mb-0">
                    <button
                      type="button"
                      className={cn(
                        'group flex w-full gap-3 rounded-lg px-3 py-2.5 text-left transition-all',
                        notification.read
                          ? 'opacity-70 hover:bg-muted/50 hover:opacity-100'
                          : 'bg-primary/[0.04] hover:bg-primary/[0.08]',
                      )}
                      onClick={() => void handleNotificationClick(notification)}
                    >
                      <div
                        className={cn(
                          'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
                          iconBgClass(notification.type),
                        )}
                      >
                        <NotificationIcon type={notification.type} />
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <p
                            className={cn(
                              'text-sm leading-snug',
                              notification.read
                                ? 'font-normal text-foreground/80'
                                : 'font-semibold text-foreground',
                            )}
                          >
                            {notification.title}
                          </p>
                          {!notification.read ? (
                            <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" />
                          ) : null}
                        </div>
                        <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground line-clamp-2">
                          {notification.body}
                        </p>
                        {time ? (
                          <p className="mt-1 text-[11px] text-muted-foreground/80">{time}</p>
                        ) : null}
                      </div>
                    </button>
                  </li>
                )
              })}
            </ul>
          </ScrollArea>
        )}
      </PopoverContent>
    </Popover>
  )
}
