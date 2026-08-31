import { Bot } from 'lucide-react'
import { cn } from '@/lib/utils'

interface HelpChatTypingIndicatorProps {
  compact?: boolean
}

export function HelpChatTypingIndicator({ compact = false }: HelpChatTypingIndicatorProps) {
  return (
    <div className={cn('flex items-center gap-2', compact ? 'gap-1.5' : 'gap-3')}>
      <div
        className={cn(
          'flex shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground',
          compact ? 'h-6 w-6' : 'h-8 w-8',
        )}
        aria-hidden
      >
        <Bot className={compact ? 'h-3 w-3' : 'h-4 w-4'} />
      </div>
      <div
        className={cn(
          'flex items-center gap-1 rounded-2xl bg-muted px-4 py-3',
          compact && 'rounded-xl px-3 py-2',
        )}
        role="status"
        aria-label="Assistente está digitando"
      >
        <span className="sr-only">Pensando…</span>
        {[0, 1, 2].map((dot) => (
          <span
            key={dot}
            className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground/70"
            style={{ animationDelay: `${dot * 150}ms` }}
          />
        ))}
      </div>
    </div>
  )
}
