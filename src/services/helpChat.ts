import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import type { HelpChatMessage } from '@/services/ai'

export type StoredHelpMessage = HelpChatMessage & { id: string }

const MAX_MESSAGES = 40

function helpChatRef(uid: string) {
  return doc(db, 'helpChats', uid)
}

export async function loadHelpChat(uid: string): Promise<StoredHelpMessage[]> {
  const snap = await getDoc(helpChatRef(uid))
  if (!snap.exists()) return []
  const raw = snap.data().messages
  if (!Array.isArray(raw)) return []
  return raw
    .flatMap((item) => {
      if (!item || typeof item !== 'object') return []
      const row = item as Record<string, unknown>
      const role = row.role === 'assistant' || row.role === 'user' ? row.role : null
      const content = typeof row.content === 'string' ? row.content : ''
      const id = typeof row.id === 'string' ? row.id : `${Date.now()}`
      if (!role || !content.trim()) return []
      return [{ role, content, id } satisfies StoredHelpMessage]
    })
    .slice(-MAX_MESSAGES)
}

export async function saveHelpChat(
  uid: string,
  messages: StoredHelpMessage[],
): Promise<void> {
  await setDoc(
    helpChatRef(uid),
    {
      uid,
      messages: messages.slice(-MAX_MESSAGES).map(({ id, role, content }) => ({
        id,
        role,
        content,
      })),
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  )
}
