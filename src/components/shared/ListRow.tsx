import { Link } from 'react-router-dom'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ListRowLinkProps {
  to: string
  title: string
  meta?: string
  trailing?: React.ReactNode
  className?: string
}

/** Linha clicável padronizada para listas de operação/dashboard. */
export function ListRowLink({ to, title, meta, trailing, className }: ListRowLinkProps) {
  return (
    <Link
      to={to}
      className={cn(
        'group flex flex-col gap-2 rounded-xl border border-border/70 bg-muted/10 px-4 py-3 transition-all',
        'hover:border-border hover:bg-muted/35 hover:shadow-[0_1px_2px_rgba(15,47,42,0.04)]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30',
        'sm:flex-row sm:items-center sm:justify-between sm:gap-3',
        className,
      )}
    >
      <div className="min-w-0">
        <p className="truncate text-sm font-medium transition-opacity group-hover:opacity-90">
          {title}
        </p>
        {meta ? (
          <p className="mt-0.5 truncate text-xs leading-relaxed text-muted-foreground">{meta}</p>
        ) : null}
      </div>
      {trailing ? <div className="flex shrink-0 flex-wrap items-center gap-1.5">{trailing}</div> : null}
    </Link>
  )
}

interface SectionCardHeaderProps {
  title: string
  icon?: LucideIcon
  count?: number
  action?: React.ReactNode
  className?: string
}

export function SectionCardHeader({
  title,
  icon: Icon,
  count,
  action,
  className,
}: SectionCardHeaderProps) {
  return (
    <div
      className={cn(
        'flex flex-row items-center justify-between gap-3 space-y-0 p-5 pb-3',
        className,
      )}
    >
      <div className="flex min-w-0 items-center gap-2.5">
        {Icon ? (
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted/70 ring-1 ring-border/60">
            <Icon className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
          </div>
        ) : null}
        <h3 className="truncate text-base font-semibold leading-none">{title}</h3>
        {typeof count === 'number' ? (
          <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-muted px-1.5 text-[11px] font-medium tabular-nums text-muted-foreground">
            {count}
          </span>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  )
}
