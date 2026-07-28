import { addDoc, collection, serverTimestamp } from 'firebase/firestore'
import { db } from '@/lib/firebase'

export type EmailDeliveryMode = 'mailto' | 'firestore'

export function getEmailDeliveryMode(): EmailDeliveryMode {
  const mode = import.meta.env.VITE_EMAIL_MODE
  return mode === 'firestore' ? 'firestore' : 'mailto'
}

export function isFirestoreEmailEnabled(): boolean {
  return getEmailDeliveryMode() === 'firestore'
}

export interface VisitSummaryEmailInput {
  to: string
  subject: string
  body: string
  visitId?: string
}

export async function sendVisitSummaryEmail(input: VisitSummaryEmailInput): Promise<'firestore' | 'mailto'> {
  const to = input.to.trim()
  if (!to) {
    throw new Error('Informe o e-mail do destinatário')
  }

  if (isFirestoreEmailEnabled()) {
    await addDoc(collection(db, 'mail'), {
      to: [to],
      message: {
        subject: input.subject,
        text: input.body,
      },
      ...(input.visitId ? { visitId: input.visitId } : {}),
      createdAt: serverTimestamp(),
    })
    return 'firestore'
  }

  const subject = encodeURIComponent(input.subject)
  const body = encodeURIComponent(input.body)
  window.location.href = `mailto:${to}?subject=${subject}&body=${body}`
  return 'mailto'
}
