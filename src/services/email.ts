import { addDoc, collection, serverTimestamp } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { createEmailLog } from '@/services/emailLogs'

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
  createdBy?: string
}

export async function sendVisitSummaryEmail(
  input: VisitSummaryEmailInput,
): Promise<'firestore' | 'mailto'> {
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
    if (input.createdBy) {
      await createEmailLog({
        to: [to],
        subject: input.subject,
        visitId: input.visitId,
        kind: 'visit_summary',
        status: 'queued',
        createdBy: input.createdBy,
      })
    }
    return 'firestore'
  }

  const subject = encodeURIComponent(input.subject)
  const body = encodeURIComponent(input.body)
  window.location.href = `mailto:${to}?subject=${subject}&body=${body}`
  if (input.createdBy) {
    await createEmailLog({
      to: [to],
      subject: input.subject,
      visitId: input.visitId,
      kind: 'visit_summary',
      status: 'mailto',
      createdBy: input.createdBy,
    })
  }
  return 'mailto'
}
