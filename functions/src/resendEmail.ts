import { createHash } from 'node:crypto'
import { logger } from 'firebase-functions'
import { FieldValue, getFirestore } from 'firebase-admin/firestore'
import { Resend } from 'resend'

const db = getFirestore()

export type ResendEmailKind =
  | 'visit_summary'
  | 'invite'
  | 'visitor_registration_confirm'
  | 'visitor_registration_owner'
  | 'notification'
  | 'community_registration'

export interface ResendEmailInput {
  to: string | string[]
  subject: string
  html?: string
  text: string
  kind: ResendEmailKind
  createdBy: string
  visitId?: string
  dedupeKey?: string
}

function deliveryId(key: string): string {
  return createHash('sha256').update(key).digest('hex')
}

/**
 * Único ponto de entrega para e-mails de produto. O documento de entrega é
 * criado antes da chamada ao Resend, tornando replays do mesmo evento idempotentes.
 */
export async function sendResendEmail(input: ResendEmailInput): Promise<{ id: string | null; skipped: boolean }> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) throw new Error('RESEND_API_KEY não configurada.')

  const to = (Array.isArray(input.to) ? input.to : [input.to])
    .map((item) => item.trim())
    .filter(Boolean)
  if (to.length === 0) throw new Error('Destinatário de e-mail ausente.')

  const ref = input.dedupeKey
    ? db.collection('emailDeliveries').doc(deliveryId(input.dedupeKey))
    : db.collection('emailDeliveries').doc()
  const delivery = {
    to,
    subject: input.subject,
    kind: input.kind,
    visitId: input.visitId ?? null,
    createdBy: input.createdBy,
    dedupeKey: input.dedupeKey ?? null,
  }

  if (input.dedupeKey) {
    try {
      await ref.create({ ...delivery, status: 'sending', createdAt: FieldValue.serverTimestamp() })
    } catch (error) {
      const existing = await ref.get()
      if (existing.exists) return { id: String(existing.get('resendId') ?? '') || null, skipped: true }
      throw error
    }
  } else {
    await ref.set({ ...delivery, status: 'sending', createdAt: FieldValue.serverTimestamp() })
  }

  try {
    const resend = new Resend(apiKey)
    const { data, error } = await resend.emails.send({
      from: process.env.RESEND_FROM || 'convites@app.promoverexperience.com.br',
      to,
      subject: input.subject,
      text: input.text,
      ...(input.html ? { html: input.html } : {}),
    })
    if (error) throw new Error(error.message || 'Resend recusou o envio.')

    await Promise.all([
      ref.update({ status: 'sent', resendId: data?.id ?? null, sentAt: FieldValue.serverTimestamp() }),
      db.collection('emailLogs').add({
        to,
        subject: input.subject,
        visitId: input.visitId ?? null,
        kind: input.kind,
        status: 'sent',
        createdBy: input.createdBy,
        createdAt: FieldValue.serverTimestamp(),
      }),
    ])
    return { id: data?.id ?? null, skipped: false }
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 500) : 'Falha desconhecida'
    await Promise.all([
      ref.update({ status: 'failed', error: message, failedAt: FieldValue.serverTimestamp() }),
      db.collection('emailLogs').add({
        to,
        subject: input.subject,
        visitId: input.visitId ?? null,
        kind: input.kind,
        status: 'failed',
        createdBy: input.createdBy,
        createdAt: FieldValue.serverTimestamp(),
      }),
    ])
    logger.error('Falha no envio Resend', { kind: input.kind, deliveryId: ref.id, error: message })
    throw error
  }
}

export function escapeEmailHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
