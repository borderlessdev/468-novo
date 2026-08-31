import { Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'
import { HELP_SUGGESTIONS } from '@/hooks/useHelpChat'

interface HelpChatSuggestionsProps {
  onSelect: (suggestion: string) => void
  compact?: boolean
  limit?: number
}

export function HelpChatSuggestions({ onSelect, compact = false, limit }: HelpChatSuggestionsProps) {
  const suggestions = limit ? HELP_SUGGESTIONS.slice(0, limit) : HELP_SUGGESTIONS

  return (
    <div className={cn('space-y-3', !compact && 'space-y-4 py-2')}>
      <div className="flex items-center gap-2 text-muted-foreground">
        <Sparkles className={cn('text-brand', compact ? 'h-3.5 w-3.5' : 'h-4 w-4')} />
        <p className={cn('font-medium', compact ? 'text-xs' : 'text-sm')}>
          {compact ? 'Sugestões rápidas:' : 'Exemplos do que você pode perguntar:'}
        </p>
      </div>
      <div className={cn('flex flex-wrap', compact ? 'gap-1.5' : 'gap-2')}>
        {suggestions.map((suggestion) => (
          <button
            key={suggestion}
            type="button"
            className={cn(
              'cursor-pointer rounded-lg border bg-background text-left transition-colors hover:border-primary/30 hover:bg-muted',
              compact ? 'px-2.5 py-1.5 text-xs' : 'px-3 py-2 text-sm',
            )}
            onClick={() => onSelect(suggestion)}
          >
            {suggestion}
          </button>
        ))}
      </div>
    </div>
  )
}
