import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { AlertCircle, Trash2 } from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { HelpChatEmptyState } from '@/components/help/HelpChatEmptyState'
import { HelpChatInput } from '@/components/help/HelpChatInput'
import { HelpChatMessage } from '@/components/help/HelpChatMessage'
import { HelpChatTypingIndicator } from '@/components/help/HelpChatTypingIndicator'
import { AiProviderBadge } from '@/components/help/AiProviderBadge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { useHelpChat } from '@/hooks/useHelpChat'
import { useAiStatus } from '@/hooks/useAiStatus'

export function HelpPage() {
  const location = useLocation()
  const { messages, sending, error, send, clear } = useHelpChat(location.pathname)
  const aiStatus = useAiStatus()
  const [draft, setDraft] = useState('')
  const [confirmClear, setConfirmClear] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, sending])

  const handleSend = () => {
    const text = draft
    setDraft('')
    void send(text)
  }

  const handleClear = () => {
    if (!confirmClear) {
      setConfirmClear(true)
      return
    }
    clear()
    setConfirmClear(false)
  }

  return (
    <div className="flex h-[calc(100dvh-8rem)] min-h-[420px] flex-col">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <PageHeader
            title="Assistente"
            description="Pergunte sobre os processos do app — caminhos curtos de tela a tela."
          />
          <AiProviderBadge status={aiStatus} />
        </div>
        <Button
          type="button"
          variant={confirmClear ? 'destructive' : 'outline'}
          onClick={handleClear}
          disabled={messages.length === 0}
          onBlur={() => window.setTimeout(() => setConfirmClear(false), 150)}
        >
          <Trash2 className="h-4 w-4" />
          {confirmClear ? 'Confirmar limpeza' : 'Limpar conversa'}
        </Button>
      </div>

      <Card className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <CardContent className="flex min-h-0 flex-1 flex-col gap-4 p-4 md:p-6">
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
            {messages.length === 0 ? (
              <HelpChatEmptyState onSelect={(s) => void send(s)} />
            ) : (
              messages.map((msg) => <HelpChatMessage key={msg.id} message={msg} />)
            )}
            {sending ? <HelpChatTypingIndicator /> : null}
            {error ? (
              <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <p>{error}</p>
              </div>
            ) : null}
            <div ref={bottomRef} />
          </div>

          <div className="border-t pt-4">
            <HelpChatInput
              value={draft}
              onChange={setDraft}
              onSubmit={handleSend}
              disabled={sending}
              showSendLabel
            />
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
