import { httpsCallable } from 'firebase/functions'
import { functions } from '@/lib/firebase'

export interface VisitSummaryEmailInput {
  to: string
  subject: string
  body: string
  visitId?: string
  createdBy?: string
}

export async function sendVisitSummaryEmail(
  input: VisitSummaryEmailInput,
): Promise<'resend'> {
  const to = input.to.trim()
  if (!to) {
    throw new Error('Informe o e-mail do destinatário')
  }

  const send = httpsCallable<VisitSummaryEmailInput, { ok: boolean }>(
    functions,
    'sendVisitSummaryEmail',
  )
  await send({ ...input, to })
  return 'resend'
}
