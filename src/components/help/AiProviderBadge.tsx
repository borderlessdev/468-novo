import { Sparkles } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { AiStatus } from '@/hooks/useAiStatus'

interface AiProviderBadgeProps {
  status: AiStatus | null
  compact?: boolean
  className?: string
}

export function AiProviderBadge({ status, compact = false, className }: AiProviderBadgeProps) {
  if (!status) {
    return (
      <Badge variant="outline" className={cn('font-normal', compact && 'text-[10px]', className)}>
        …
      </Badge>
    )
  }

  if (status.provider === 'mock' || !status.configured) {
    return (
      <Badge
        variant="outline"
        className={cn('font-normal text-muted-foreground', compact && 'text-[10px]', className)}
        title="Respostas de demonstração — configure ANTHROPIC_API_KEY nas Cloud Functions"
      >
        Modo demo
      </Badge>
    )
  }

  const label =
    status.provider === 'anthropic'
      ? 'Claude'
      : status.provider === 'openai'
        ? 'OpenAI'
        : 'IA'

  return (
    <Badge
      className={cn(
        'gap-1 border-brand/30 bg-brand/10 font-normal text-brand-foreground hover:bg-brand/10',
        compact && 'text-[10px]',
        className,
      )}
      title={status.model ? `Modelo: ${status.model}` : undefined}
    >
      <Sparkles className={cn(compact ? 'h-2.5 w-2.5' : 'h-3 w-3')} />
      {label}
    </Badge>
  )
}
