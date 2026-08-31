import { useEffect, useRef, type FormEvent, type KeyboardEvent } from 'react'
import { Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'

interface HelpChatInputProps {
  value: string
  onChange: (value: string) => void
  onSubmit: () => void
  disabled?: boolean
  compact?: boolean
  showSendLabel?: boolean
  autoFocus?: boolean
}

export function HelpChatInput({
  value,
  onChange,
  onSubmit,
  disabled = false,
  compact = false,
  showSendLabel = false,
  autoFocus = false,
}: HelpChatInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (!autoFocus) return
    const timer = window.setTimeout(() => textareaRef.current?.focus(), 50)
    return () => window.clearTimeout(timer)
  }, [autoFocus])

  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    const maxHeight = compact ? 96 : 128
    el.style.height = `${Math.min(el.scrollHeight, maxHeight)}px`
  }, [value, compact])

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      if (!disabled && value.trim()) onSubmit()
    }
  }

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    if (!disabled && value.trim()) onSubmit()
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-1.5">
      <div className={cn('flex items-end gap-2', compact ? '' : 'gap-2')}>
        <Textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Como faço para…?"
          disabled={disabled}
          rows={1}
          className={cn(
            'min-h-0 resize-none py-2 leading-snug',
            compact ? 'max-h-24 min-h-9 text-sm' : 'max-h-32 min-h-11',
          )}
        />
        <Button
          type="submit"
          size={compact ? 'icon' : 'default'}
          className={cn('shrink-0', compact ? 'h-9 w-9' : 'h-11')}
          disabled={disabled || !value.trim()}
          aria-label="Enviar mensagem"
        >
          <Send className="h-4 w-4" />
          {showSendLabel ? <span className="ml-1.5">Enviar</span> : null}
        </Button>
      </div>
      <p className="text-[11px] text-muted-foreground">
        Enter para enviar · Shift+Enter para nova linha
      </p>
    </form>
  )
}
