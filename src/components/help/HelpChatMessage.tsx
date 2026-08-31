import { useState } from 'react'
import { Bot, Check, Copy, User } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { HelpChatMessage as HelpMessage } from '@/services/ai'
import { formatHelpContent } from './formatHelpContent'

interface HelpChatMessageProps {
  message: HelpMessage
  compact?: boolean
}

export function HelpChatMessage({ message, compact = false }: HelpChatMessageProps) {
  const [copied, setCopied] = useState(false)
  const isUser = message.role === 'user'

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(message.content)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      /* ignore */
    }
  }

  return (
    <div
      className={cn('group flex gap-2', isUser ? 'flex-row-reverse' : 'flex-row', compact ? 'gap-1.5' : 'gap-3')}
    >
      <div
        className={cn(
          'flex shrink-0 items-center justify-center rounded-full',
          compact ? 'h-6 w-6' : 'h-8 w-8',
          isUser ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground',
        )}
        aria-hidden
      >
        {isUser ? (
          <User className={compact ? 'h-3 w-3' : 'h-4 w-4'} />
        ) : (
          <Bot className={compact ? 'h-3 w-3' : 'h-4 w-4'} />
        )}
      </div>

      <div className={cn('flex min-w-0 flex-col gap-1', isUser ? 'items-end' : 'items-start')}>
        <div
          className={cn(
            'relative max-w-[min(100%,42rem)] text-sm',
            compact ? 'max-w-[90%] rounded-xl px-3 py-2' : 'rounded-2xl px-4 py-3',
            isUser
              ? 'bg-primary text-primary-foreground'
              : 'bg-muted text-foreground',
          )}
        >
          {isUser ? (
            <p className="whitespace-pre-wrap">{message.content}</p>
          ) : (
            <div className="help-content">{formatHelpContent(message.content)}</div>
          )}
        </div>

        {!isUser ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className={cn(
              'h-6 gap-1 px-2 text-[11px] text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100',
              compact && 'h-5',
            )}
            onClick={() => void onCopy()}
          >
            {copied ? (
              <>
                <Check className="h-3 w-3" />
                Copiado
              </>
            ) : (
              <>
                <Copy className="h-3 w-3" />
                Copiar
              </>
            )}
          </Button>
        ) : null}
      </div>
    </div>
  )
}
