import { useCallback, useEffect, useState } from 'react'
import { askHelpAssistant, type HelpChatMessage } from '@/services/ai'

const STORAGE_KEY = 'pe-help-chat-v1'

export const HELP_SUGGESTIONS = [
  'Como registro um compromisso na agenda?',
  'Como importo a programação de um arquivo?',
  'Como gero o link do portal do visitante?',
  'Como conecto o Google Calendar?',
  'Onde crio e aplico um playbook?',
] as const

function readStored(): HelpChatMessage[] {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed
      .flatMap((item): HelpChatMessage[] => {
        if (!item || typeof item !== 'object') return []
        const row = item as Record<string, unknown>
        const role = row.role === 'assistant' ? 'assistant' : row.role === 'user' ? 'user' : null
        const content = typeof row.content === 'string' ? row.content : ''
        if (!role || !content.trim()) return []
        return [{ role, content }]
      })
      .slice(-40)
  } catch {
    return []
  }
}

function writeStored(messages: HelpChatMessage[]) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-40)))
  } catch {
    /* ignore quota */
  }
}

export function useHelpChat(route?: string) {
  const [messages, setMessages] = useState<HelpChatMessage[]>(() =>
    typeof window !== 'undefined' ? readStored() : [],
  )
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    writeStored(messages)
  }, [messages])

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY) setMessages(readStored())
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const clear = useCallback(() => {
    setMessages([])
    setError(null)
    writeStored([])
  }, [])

  const send = useCallback(
    async (text: string) => {
      const message = text.trim()
      if (!message || sending) return

      setError(null)
      const nextHistory = [...messages, { role: 'user' as const, content: message }]
      setMessages(nextHistory)
      setSending(true)

      try {
        const { reply } = await askHelpAssistant({
          message,
          route,
          history: messages.slice(-8),
        })
        setMessages([...nextHistory, { role: 'assistant', content: reply }])
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Falha ao consultar o assistente'
        setError(msg)
        setMessages([
          ...nextHistory,
          {
            role: 'assistant',
            content:
              'Não consegui responder agora. Verifique sua conexão ou se as Cloud Functions estão publicadas e tente de novo.',
          },
        ])
      } finally {
        setSending(false)
      }
    },
    [messages, route, sending],
  )

  return { messages, sending, error, send, clear }
}
