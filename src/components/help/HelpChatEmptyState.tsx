import { CircleHelp } from 'lucide-react'
import { HelpChatSuggestions } from './HelpChatSuggestions'

interface HelpChatEmptyStateProps {
  onSelect: (suggestion: string) => void
}

export function HelpChatEmptyState({ onSelect }: HelpChatEmptyStateProps) {
  return (
    <div className="flex flex-col items-center py-8 text-center md:py-12">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
        <CircleHelp className="h-7 w-7" />
      </div>
      <h2 className="font-display text-xl font-semibold tracking-tight">Como posso ajudar?</h2>
      <p className="mt-2 max-w-md text-sm text-muted-foreground">
        Tire dúvidas sobre agenda, visitas, portal do visitante, integrações e playbooks — com
        caminhos curtos de tela a tela.
      </p>
      <div className="mt-8 w-full max-w-2xl text-left">
        <HelpChatSuggestions onSelect={onSelect} />
      </div>
    </div>
  )
}
