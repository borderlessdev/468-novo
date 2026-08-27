import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useLocation } from 'react-router-dom'
import { Send, Trash2 } from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { HELP_SUGGESTIONS, useHelpChat } from '@/hooks/useHelpChat'

export function HelpPage() {
  const location = useLocation()
  const { messages, sending, error, send, clear } = useHelpChat(location.pathname)
  const [draft, setDraft] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, sending])

  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    const text = draft
    setDraft('')
    void send(text)
  }

  return (
    <div className="flex h-[calc(100dvh-8rem)] min-h-[420px] flex-col">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <PageHeader
          title="Assistente"
          description="Pergunte sobre os processos do app — caminhos curtos de tela a tela."
        />
        <Button type="button" variant="outline" onClick={() => clear()} disabled={messages.length === 0}>
          <Trash2 className="h-4 w-4" />
          Limpar conversa
        </Button>
      </div>

      <Card className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <CardContent className="flex min-h-0 flex-1 flex-col gap-4 p-4 md:p-6">
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
            {messages.length === 0 ? (
              <div className="space-y-4 py-6">
                <p className="text-sm text-muted-foreground">
                  Exemplos do que você pode perguntar:
                </p>
                <div className="flex flex-wrap gap-2">
                  {HELP_SUGGESTIONS.map((suggestion) => (
                    <button
                      key={suggestion}
                      type="button"
                      className="cursor-pointer rounded-lg border bg-background px-3 py-2 text-left text-sm hover:bg-muted"
                      onClick={() => void send(suggestion)}
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map((msg, index) => (
                <div
                  key={`${msg.role}-${index}`}
                  className={cn(
                    'max-w-[min(100%,42rem)] rounded-2xl px-4 py-3 text-sm whitespace-pre-wrap',
                    msg.role === 'user'
                      ? 'ml-auto bg-primary text-primary-foreground'
                      : 'mr-auto bg-muted',
                  )}
                >
                  {msg.content}
                </div>
              ))
            )}
            {sending ? <p className="text-sm text-muted-foreground">Pensando…</p> : null}
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            <div ref={bottomRef} />
          </div>

          <form onSubmit={onSubmit} className="flex gap-2 border-t pt-4">
            <Input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Como faço para…?"
              disabled={sending}
              className="h-11"
            />
            <Button type="submit" className="h-11 shrink-0" disabled={sending || !draft.trim()}>
              <Send className="h-4 w-4" />
              Enviar
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
