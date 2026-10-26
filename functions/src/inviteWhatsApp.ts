/**
 * Envio de convite de cliente do evento via WhatsApp Cloud API (Meta).
 */
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { FieldValue, getFirestore, type DocumentData } from 'firebase-admin/firestore'
import { callerIsPlatformAdmin } from './platformAdmin'
import {
  getMetaWhatsAppConfigStatus,
  normalizePhoneE164,
  sendInteractiveButtons,
  sendTemplateMessage,
} from './metaWhatsApp'

const db = getFirestore()

export type WhatsAppInviteSendStatus =
  | 'pending'
  | 'sent'
  | 'error'
  | 'skipped_no_provider'
  | 'skipped_no_phone'

async function assertCanSendInvite(
  auth: { uid: string; token: Record<string, unknown> } | undefined,
  invite: DocumentData,
): Promise<void> {
  if (!auth?.uid) throw new HttpsError('unauthenticated', 'Faça login.')
  const allowed =
    invite.createdBy === auth.uid || (await callerIsPlatformAdmin(auth.uid, auth.token))
  if (!allowed) {
    throw new HttpsError('permission-denied', 'Sem permissão para enviar este convite.')
  }
}

/** Payload ids estáveis para botões interativos (janela 24h). */
export function inviteAcceptButtonId(inviteId: string): string {
  return `invite_accept:${inviteId}`
}

export function inviteDeclineButtonId(inviteId: string): string {
  return `invite_decline:${inviteId}`
}

export function parseInviteButtonId(
  raw: string,
): { action: 'accept' | 'decline'; inviteId: string } | null {
  const value = raw.trim()
  const accept = /^invite_accept:(.+)$/i.exec(value)
  if (accept?.[1]) return { action: 'accept', inviteId: accept[1] }
  const decline = /^invite_decline:(.+)$/i.exec(value)
  if (decline?.[1]) return { action: 'decline', inviteId: decline[1] }
  // Títulos/payloads fixos do template Meta
  if (/^(accept_invite|aceitar)$/i.test(value)) return { action: 'accept', inviteId: '' }
  if (/^(decline_invite|recusar)$/i.test(value)) return { action: 'decline', inviteId: '' }
  return null
}

export async function sendInviteWhatsAppMessage(inviteId: string): Promise<{
  status: WhatsAppInviteSendStatus
  messageId?: string
  detail?: string
}> {
  const snap = await db.collection('invites').doc(inviteId).get()
  if (!snap.exists) throw new HttpsError('not-found', 'Convite não encontrado.')
  const invite = snap.data() ?? {}
  if (invite.status !== 'pending') {
    throw new HttpsError('failed-precondition', 'Convite não está pendente.')
  }

  const phoneRaw = String(invite.phone ?? invite.phoneE164 ?? '').trim()
  const phoneE164 = normalizePhoneE164(phoneRaw)
  if (!phoneE164) {
    await snap.ref.update({
      whatsappSendStatus: 'skipped_no_phone',
      whatsappError: 'telefone inválido ou ausente',
      updatedAt: FieldValue.serverTimestamp(),
    })
    return { status: 'skipped_no_phone', detail: 'telefone inválido ou ausente' }
  }

  const config = getMetaWhatsAppConfigStatus()
  if (!config.ready) {
    await snap.ref.update({
      whatsappSendStatus: 'skipped_no_provider',
      whatsappError: config.hint ?? 'Meta WhatsApp não configurado',
      phoneE164,
      updatedAt: FieldValue.serverTimestamp(),
    })
    return {
      status: 'skipped_no_provider',
      detail: config.hint ?? 'Meta WhatsApp não configurado',
    }
  }

  let visitTitle = ''
  const visitId = invite.visitId ? String(invite.visitId) : ''
  if (visitId) {
    const visit = await db.collection('visits').doc(visitId).get()
    visitTitle = String(visit.data()?.title ?? '').trim()
  }
  let orgName = ''
  if (invite.orgId) {
    const org = await db.collection('organizations').doc(String(invite.orgId)).get()
    orgName = String(org.data()?.name ?? '').trim()
  }

  const bodyParam =
    visitTitle || orgName || 'Promover Experience'

  const templateResult = await sendTemplateMessage({
    to: phoneE164,
    bodyParameters: [bodyParam.slice(0, 60)],
  })

  if (templateResult.status === 'sent') {
    // Reforço com botões dinâmicos (funciona se a janela já estiver aberta;
    // se falhar, o template com quick-reply Aceitar/Recusar cobre o fluxo).
    await sendInteractiveButtons({
      to: phoneE164,
      bodyText: `Confirme sua participação${visitTitle ? ` em “${visitTitle}”` : ''}.`,
      buttons: [
        { id: inviteAcceptButtonId(inviteId), title: 'Aceitar' },
        { id: inviteDeclineButtonId(inviteId), title: 'Recusar' },
      ],
    }).catch(() => undefined)

    await snap.ref.update({
      phoneE164,
      whatsappSendStatus: 'sent',
      whatsappMessageId: templateResult.messageId ?? null,
      whatsappSentAt: new Date().toISOString(),
      whatsappError: FieldValue.delete(),
      updatedAt: FieldValue.serverTimestamp(),
    })
    return { status: 'sent', messageId: templateResult.messageId }
  }

  const status: WhatsAppInviteSendStatus =
    templateResult.status === 'skipped_no_provider'
      ? 'skipped_no_provider'
      : templateResult.status === 'skipped_no_phone'
        ? 'skipped_no_phone'
        : 'error'

  await snap.ref.update({
    phoneE164,
    whatsappSendStatus: status,
    whatsappError: templateResult.detail ?? status,
    updatedAt: FieldValue.serverTimestamp(),
  })
  return { status, detail: templateResult.detail, messageId: templateResult.messageId }
}

export const getMetaWhatsAppStatus = onCall(async (request) => {
  if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Faça login.')
  if (!(await callerIsPlatformAdmin(request.auth.uid, request.auth.token))) {
    throw new HttpsError(
      'permission-denied',
      'Apenas administradores podem ver o status do WhatsApp Meta.',
    )
  }
  return getMetaWhatsAppConfigStatus()
})

export const sendInviteWhatsApp = onCall(async (request) => {
  const inviteId = String(request.data?.inviteId ?? '').trim()
  if (!inviteId) throw new HttpsError('invalid-argument', 'inviteId obrigatório.')

  const snap = await db.collection('invites').doc(inviteId).get()
  if (!snap.exists) throw new HttpsError('not-found', 'Convite não encontrado.')
  await assertCanSendInvite(request.auth, snap.data() ?? {})

  const result = await sendInviteWhatsAppMessage(inviteId)
  if (result.status === 'error') {
    throw new HttpsError('internal', result.detail ?? 'Falha ao enviar WhatsApp.')
  }
  return result
})
