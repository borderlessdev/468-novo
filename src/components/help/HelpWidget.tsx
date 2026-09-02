import { useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { CircleHelp, Maximize2, MessageCircle, Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { HelpChatInput } from '@/components/help/HelpChatInput'
import { HelpChatMessage } from '@/components/help/HelpChatMessage'
import { HelpChatSuggestions } from '@/components/help/HelpChatSuggestions'
import { HelpChatTypingIndicator } from '@/components/help/HelpChatTypingIndicator'
import { AiProviderBadge } from '@/components/help/AiProviderBadge'
import { cn } from '@/lib/utils'
import { useHelpChat } from '@/hooks/useHelpChat'
import { useAiStatus } from '@/hooks/useAiStatus'

export function HelpWidget() {
  const location = useLocation()
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState('')
  const [lastSeenCount, setLastSeenCount] = useState(0)
  const [confirmClear, setConfirmClear] = useState(false)
  const { messages, sending, error, send, clear } = useHelpChat(location.pathname)
  const aiStatus = useAiStatus()
  const bottomRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  const unreadCount = open ? 0 : Math.max(0, messages.length - lastSeenCount)

  useEffect(() => {
    if (open) {
      setLastSeenCount(messages.length)
      setConfirmClear(false)
    }
  }, [open, messages.length])

  useEffect(() => {
    if (!open) return
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, open, sending])

  useEffect(() => {
    if (!open) return

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open])

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
    <div className="pointer-events-none fixed right-4 bottom-4 z-50 flex flex-col items-end gap-3 sm:right-6 sm:bottom-6">
      {open ? (
        <div
          ref={panelRef}
          className={cn(
            'pointer-events-auto flex w-[min(100vw-2rem,380px)] flex-col overflow-hidden rounded-2xl border bg-card shadow-xl',
            'h-[min(70vh,520px)]',
          )}
          role="dialog"
          aria-label="Assistente de ajuda"
          aria-modal="false"
        >
          <div className="flex items-center gap-2 border-b bg-muted/40 px-3 py-2.5">
            <CircleHelp className="h-4 w-4 text-primary" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="text-sm font-semibold leading-tight">Assistente</p>
                <AiProviderBadge status={aiStatus} compact />
              </div>
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
              <Link to="/assistente" onClick={() => setOpen(false)}>
                <Maximize2 className="h-4 w-4" />
              </Link>
            </Button>
            <Button
              type="button"
              variant={confirmClear ? 'destructive' : 'ghost'}
              size="icon"
              className="h-8 w-8"
              onClick={handleClear}
              onBlur={() => window.setTimeout(() => setConfirmClear(false), 150)}
              title={confirmClear ? 'Clique de novo para confirmar' : 'Limpar conversa'}
              aria-label={confirmClear ? 'Confirmar limpeza da conversa' : 'Limpar conversa'}
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
                <HelpChatSuggestions compact limit={4} onSelect={(s) => void send(s)} />
              ) : (
                messages.map((msg) => <HelpChatMessage key={msg.id} message={msg} compact />)
              )}
              {sending ? <HelpChatTypingIndicator compact /> : null}
              {error ? (
                <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                  {error}
                </p>
              ) : null}
              <div ref={bottomRef} />
            </div>
          </ScrollArea>

          <div className="border-t p-2.5">
            <HelpChatInput
              value={draft}
              onChange={setDraft}
              onSubmit={handleSend}
              disabled={sending}
              compact
              autoFocus={open}
            />
          </div>
        </div>
      ) : null}

      <div className="relative pointer-events-auto">
        {unreadCount > 0 ? (
          <span
            className="absolute -top-1 -right-1 z-10 flex h-5 min-w-5 items-center justify-center rounded-full bg-brand px-1 text-[10px] font-bold text-brand-foreground shadow-sm"
            aria-label={`${unreadCount} nova(s) mensagem(ns)`}
          >
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        ) : null}
        <Button
          type="button"
          size="icon"
          className="h-12 w-12 rounded-full shadow-lg"
          onClick={() => setOpen((prev) => !prev)}
          aria-label={open ? 'Fechar assistente' : 'Abrir assistente de ajuda'}
          aria-expanded={open}
        >
          {open ? <X className="h-5 w-5" /> : <MessageCircle className="h-5 w-5" />}
        </Button>
      </div>
    </div>
  )
}
