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

export type StoredHelpMessage = HelpChatMessage & { id: string }

function createId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

function normalizeMessage(item: unknown): StoredHelpMessage | null {
  if (!item || typeof item !== 'object') return null
  const row = item as Record<string, unknown>
  const role = row.role === 'assistant' ? 'assistant' : row.role === 'user' ? 'user' : null
  const content = typeof row.content === 'string' ? row.content : ''
  const id = typeof row.id === 'string' ? row.id : createId()
  if (!role || !content.trim()) return null
  return { role, content, id }
}

function readStored(): StoredHelpMessage[] {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.flatMap((item) => {
      const message = normalizeMessage(item)
      return message ? [message] : []
    }).slice(-40)
  } catch {
    return []
  }
}

function writeStored(messages: StoredHelpMessage[]) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-40)))
  } catch {
    /* ignore quota */
  }
}

export function useHelpChat(route?: string) {
  const [messages, setMessages] = useState<StoredHelpMessage[]>(() =>
    typeof window !== 'undefined' ? readStored() : [],
  )
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    writeStored(messages)
  }, [messages])

  useEffect(() => {
    const syncFromStorage = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEY) return
      setMessages(readStored())
    }

    window.addEventListener('storage', syncFromStorage)
    return () => window.removeEventListener('storage', syncFromStorage)
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
      const userMessage: StoredHelpMessage = { role: 'user', content: message, id: createId() }

      let historyForApi: HelpChatMessage[] = []
      setMessages((prev) => {
        historyForApi = prev.slice(-8).map(({ role, content }) => ({ role, content }))
        return [...prev, userMessage]
      })
      setSending(true)

      try {
        const { reply } = await askHelpAssistant({
          message,
          route,
          history: historyForApi,
        })
        const assistantMessage: StoredHelpMessage = {
          role: 'assistant',
          content: reply,
          id: createId(),
        }
        setMessages((prev) => [...prev, assistantMessage])
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Falha ao consultar o assistente'
        setError(msg)
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            id: createId(),
            content:
              msg.includes('unauthenticated') || msg.includes('login')
                ? 'Faça login para usar o assistente.'
                : 'Não consegui responder agora. Verifique sua conexão ou se as Cloud Functions estão publicadas com a chave da API Claude configurada (`ANTHROPIC_API_KEY` em `functions/.env`) e tente de novo.',
          },
        ])
      } finally {
        setSending(false)
      }
    },
    [route, sending],
  )

  return { messages, sending, error, send, clear }
}
