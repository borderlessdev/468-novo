import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { CircleHelp, Maximize2, MessageCircle, Send, Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import { HELP_SUGGESTIONS, useHelpChat } from '@/hooks/useHelpChat'

export function HelpWidget() {
  const location = useLocation()
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState('')
  const { messages, sending, send, clear } = useHelpChat(location.pathname)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, open, sending])

  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    const text = draft
    setDraft('')
    void send(text)
  }

  return (
    <div className="pointer-events-none fixed right-4 bottom-4 z-50 flex flex-col items-end gap-3 sm:right-6 sm:bottom-6">
      {open ? (
        <div
          className={cn(
            'pointer-events-auto flex w-[min(100vw-2rem,380px)] flex-col overflow-hidden rounded-2xl border bg-card shadow-xl',
            'h-[min(70vh,520px)]',
          )}
          role="dialog"
          aria-label="Assistente de ajuda"
        >
          <div className="flex items-center gap-2 border-b bg-muted/40 px-3 py-2.5">
            <CircleHelp className="h-4 w-4 text-primary" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold leading-tight">Assistente</p>
              <p className="text-[11px] text-muted-foreground">Dúvidas sobre o uso do app</p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              asChild
              title="Abrir em tela cheia"
            >
              <Link to="/ajuda" onClick={() => setOpen(false)}>
                <Maximize2 className="h-4 w-4" />
              </Link>
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => clear()}
              title="Limpar conversa"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setOpen(false)}
              aria-label="Fechar assistente"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          <ScrollArea className="min-h-0 flex-1 px-3 py-3">
            <div className="space-y-3">
              {messages.length === 0 ? (
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    Pergunte como fazer algo no sistema. Exemplos:
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {HELP_SUGGESTIONS.slice(0, 3).map((suggestion) => (
                      <button
                        key={suggestion}
                        type="button"
                        className="cursor-pointer rounded-lg border bg-background px-2.5 py-1.5 text-left text-xs hover:bg-muted"
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
                      'max-w-[90%] rounded-xl px-3 py-2 text-sm whitespace-pre-wrap',
                      msg.role === 'user'
                        ? 'ml-auto bg-primary text-primary-foreground'
                        : 'mr-auto bg-muted text-foreground',
                    )}
                  >
                    {msg.content}
                  </div>
                ))
              )}
              {sending ? (
                <p className="text-xs text-muted-foreground">Pensando…</p>
              ) : null}
              <div ref={bottomRef} />
            </div>
          </ScrollArea>

          <form onSubmit={onSubmit} className="flex gap-2 border-t p-2.5">
            <Input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Como faço para…?"
              disabled={sending}
              className="h-9"
            />
            <Button type="submit" size="icon" className="h-9 w-9 shrink-0" disabled={sending || !draft.trim()}>
              <Send className="h-4 w-4" />
            </Button>
          </form>
        </div>
      ) : null}

      <Button
        type="button"
        size="icon"
        className="pointer-events-auto h-12 w-12 rounded-full shadow-lg"
        onClick={() => setOpen((prev) => !prev)}
        aria-label={open ? 'Fechar assistente' : 'Abrir assistente de ajuda'}
        aria-expanded={open}
      >
        {open ? <X className="h-5 w-5" /> : <MessageCircle className="h-5 w-5" />}
      </Button>
    </div>
  )
}
