import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { askHelpAssistant, type HelpChatMessage } from '@/services/ai'
import {
  loadHelpChat,
  saveHelpChat,
  type StoredHelpMessage,
} from '@/services/helpChat'

export type { StoredHelpMessage }

export const HELP_SUGGESTIONS = [
  'Como altero a logo whitelabel da empresa?',
  'Como registro um compromisso na agenda?',
  'Como importo a programação de um arquivo?',
  'Como gero o link do portal do visitante?',
  'Como vejo todas as experiências de um período?',
  'Como conecto o Google Calendar?',
] as const

function createId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

function sessionKey(uid: string) {
  return `pe-help-chat-v2:${uid}`
}

function readSession(uid: string): StoredHelpMessage[] | null {
  try {
    const raw = sessionStorage.getItem(sessionKey(uid))
    if (!raw) return null
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return null
    return parsed as StoredHelpMessage[]
  } catch {
    return null
  }
}

function writeSession(uid: string, messages: StoredHelpMessage[]) {
  try {
    sessionStorage.setItem(sessionKey(uid), JSON.stringify(messages.slice(-40)))
  } catch {
    /* ignore quota */
  }
}

function clearLegacySharedSession() {
  try {
    sessionStorage.removeItem('pe-help-chat-v1')
  } catch {
    /* ignore */
  }
}

export function useHelpChat(route?: string) {
  const { user } = useAuth()
  const uid = user?.uid ?? null
  const [messages, setMessages] = useState<StoredHelpMessage[]>([])
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ready, setReady] = useState(false)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    clearLegacySharedSession()
  }, [])

  useEffect(() => {
    if (!uid) {
      setMessages([])
      setReady(false)
      setError(null)
      return
    }

    let cancelled = false
    setReady(false)
    setError(null)

    const cached = readSession(uid)
    if (cached && cached.length > 0) {
      setMessages(cached)
    } else {
      setMessages([])
    }

    void loadHelpChat(uid)
      .then((fromDb) => {
        if (cancelled) return
        setMessages(fromDb)
        writeSession(uid, fromDb)
      })
      .catch((err) => {
        console.error(err)
        if (!cancelled && cached) setMessages(cached)
      })
      .finally(() => {
        if (!cancelled) setReady(true)
      })

    return () => {
      cancelled = true
    }
  }, [uid])

  useEffect(() => {
    if (!uid || !ready) return
    writeSession(uid, messages)
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      void saveHelpChat(uid, messages).catch(console.error)
    }, 400)
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current)
    }
  }, [messages, uid, ready])

  const clear = useCallback(() => {
    setMessages([])
    setError(null)
    if (uid) {
      writeSession(uid, [])
      void saveHelpChat(uid, []).catch(console.error)
    }
  }, [uid])

  const send = useCallback(
    async (text: string) => {
      const message = text.trim()
      if (!message || sending || !uid) return

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
    [route, sending, uid],
  )

  return { messages, sending, error, send, clear }
}
