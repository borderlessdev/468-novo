/**
 * Webhook HTTPS da WhatsApp Cloud API (Meta).
 *
 * GET  — verificação (hub.challenge) com META_WA_VERIFY_TOKEN
 * POST — mensagens / button_reply → aceite ou recusa de convite de evento
 *
 * URL (produção): https://us-central1-<project>.cloudfunctions.net/whatsappWebhook
 */
import { onRequest } from 'firebase-functions/v2/https'
import { logger } from 'firebase-functions'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore, type DocumentData } from 'firebase-admin/firestore'
import { HttpsError } from 'firebase-functions/v2/https'
import {
  acceptInviteAsAdmin,
  declineInviteById,
} from './inviteAcceptance'
import { parseInviteButtonId } from './inviteWhatsApp'
import {
  getMetaVerifyToken,
  normalizePhoneE164,
  sendTextMessage,
  verifyMetaWebhookSignature,
} from './metaWhatsApp'

const db = getFirestore()

function appOrigin(): string {
  return (process.env.APP_ORIGIN || 'https://app.promoverexperience.com.br').replace(/\/+$/, '')
}

function inviteCadastroLink(token: string): string {
  return `${appOrigin()}/cadastro?invite=${encodeURIComponent(token)}`
}

async function findPendingInviteForWhatsApp(input: {
  inviteId?: string
  phoneE164: string | null
}): Promise<{ id: string; data: DocumentData } | null> {
  if (input.inviteId) {
    const snap = await db.collection('invites').doc(input.inviteId).get()
    if (snap.exists && snap.get('status') === 'pending') {
      return { id: snap.id, data: snap.data() ?? {} }
    }
  }
  if (!input.phoneE164) return null
  const byPhone = await db
    .collection('invites')
    .where('phoneE164', '==', input.phoneE164)
    .where('status', '==', 'pending')
    .limit(5)
    .get()
  if (byPhone.empty) return null
  // Prefer client+visit invites
  const client = byPhone.docs.find((d) => d.get('role') === 'client' && d.get('visitId'))
  const doc = client ?? byPhone.docs[0]
  return { id: doc.id, data: doc.data() }
}

function extractButtonPayload(message: Record<string, unknown>): string | null {
  const interactive = message.interactive as Record<string, unknown> | undefined
  if (interactive?.type === 'button_reply') {
    const reply = interactive.button_reply as { id?: string; title?: string } | undefined
    return reply?.id || reply?.title || null
  }
  if (message.type === 'button') {
    const button = message.button as { payload?: string; text?: string } | undefined
    return button?.payload || button?.text || null
  }
  const textBody = (message.text as { body?: string } | undefined)?.body?.trim()
  if (textBody && /^(aceitar|sim|confirmar|accept)$/i.test(textBody)) return 'ACCEPT_INVITE'
  if (textBody && /^(recusar|não|nao|decline|recuso)$/i.test(textBody)) return 'DECLINE_INVITE'
  return null
}

async function handleInviteAccept(invite: {
  id: string
  data: DocumentData
}, fromE164: string | null): Promise<void> {
  const token = String(invite.data.token ?? '')
  const email = String(invite.data.email ?? '').trim().toLowerCase()
  const phoneE164 =
    fromE164 ||
    normalizePhoneE164(String(invite.data.phoneE164 ?? invite.data.phone ?? ''))

  if (!token || !email) {
    if (phoneE164) {
      await sendTextMessage(
        phoneE164,
        'Não foi possível processar este convite. Peça um novo link à organização.',
      )
    }
    return
  }

  try {
    const authUser = await getAuth().getUserByEmail(email)
    await acceptInviteAsAdmin({
      token,
      uid: authUser.uid,
      email,
      name: authUser.displayName || undefined,
      acceptedVia: 'whatsapp',
      phoneE164,
    })
    if (phoneE164) {
      await sendTextMessage(
        phoneE164,
        'Convite aceito! Você já está vinculado ao evento no Promover Experience.',
      )
    }
  } catch (error) {
    const code =
      error && typeof error === 'object' && 'code' in error
        ? String((error as { code: unknown }).code)
        : ''
    // Conta ainda não existe → link de cadastro
    if (code === 'auth/user-not-found' || /user-not-found/i.test(String(error))) {
      const link = inviteCadastroLink(token)
      if (phoneE164) {
        await sendTextMessage(
          phoneE164,
          `Para aceitar, crie sua conta (ou entre) neste link:\n${link}`,
        )
      }
      return
    }
    if (error instanceof HttpsError) {
      if (phoneE164) {
        await sendTextMessage(phoneE164, error.message)
      }
      return
    }
    logger.error('whatsappWebhook accept failed', error)
    if (phoneE164) {
      const link = inviteCadastroLink(token)
      await sendTextMessage(
        phoneE164,
        `Não foi possível aceitar automaticamente. Abra o link para concluir:\n${link}`,
      )
    }
  }
}

async function handleInviteDecline(inviteId: string, phoneE164: string | null): Promise<void> {
  try {
    const result = await declineInviteById({ inviteId, declinedVia: 'whatsapp' })
    if (phoneE164) {
      await sendTextMessage(
        phoneE164,
        result.status === 'already_closed'
          ? 'Este convite já estava encerrado.'
          : 'Convite recusado. Obrigado pela resposta.',
      )
    }
  } catch (error) {
    logger.error('whatsappWebhook decline failed', error)
    if (phoneE164) {
      const message =
        error instanceof HttpsError
          ? error.message
          : 'Não foi possível recusar o convite. Tente pelo link do e-mail.'
      await sendTextMessage(phoneE164, message)
    }
  }
}

async function processInboundMessage(message: Record<string, unknown>, waId: string): Promise<void> {
  const phoneE164 = normalizePhoneE164(waId)
  const payload = extractButtonPayload(message)
  if (!payload) {
    logger.info('whatsappWebhook: mensagem ignorada (sem botão/comando)', {
      type: message.type,
      from: waId,
    })
    return
  }

  const parsed = parseInviteButtonId(payload)
  const action =
    parsed?.action ??
    (/accept|aceitar/i.test(payload) ? 'accept' : /decline|recusar/i.test(payload) ? 'decline' : null)
  if (!action) return

  const invite = await findPendingInviteForWhatsApp({
    inviteId: parsed?.inviteId || undefined,
    phoneE164,
  })
  if (!invite) {
    if (phoneE164) {
      await sendTextMessage(
        phoneE164,
        'Não encontrei um convite pendente para este número. Se recebeu o e-mail, use o link de lá.',
      )
    }
    return
  }

  if (action === 'decline') {
    await handleInviteDecline(invite.id, phoneE164)
    return
  }
  await handleInviteAccept(invite, phoneE164)
}

export const whatsappWebhook = onRequest({ invoker: 'public' }, async (req, res) => {
  if (req.method === 'GET') {
    const mode = String(req.query['hub.mode'] ?? '')
    const token = String(req.query['hub.verify_token'] ?? '')
    const challenge = String(req.query['hub.challenge'] ?? '')
    const expected = getMetaVerifyToken()
    if (mode === 'subscribe' && expected && token === expected) {
      res.status(200).send(challenge)
      return
    }
    res.status(403).send('Forbidden')
    return
  }

  if (req.method !== 'POST') {
    res.status(405).send('Method Not Allowed')
    return
  }

  const rawBody =
    typeof req.rawBody !== 'undefined'
      ? req.rawBody
      : typeof req.body === 'string'
        ? req.body
        : JSON.stringify(req.body ?? {})
  const signature = req.get('x-hub-signature-256') ?? undefined
  if (!verifyMetaWebhookSignature(rawBody, signature)) {
    res.status(401).send('Invalid signature')
    return
  }

  const body = typeof req.body === 'object' && req.body ? req.body : {}
  try {
    const entries = Array.isArray((body as { entry?: unknown }).entry)
      ? ((body as { entry: unknown[] }).entry as Array<Record<string, unknown>>)
      : []
    for (const entry of entries) {
      const changes = Array.isArray(entry.changes) ? entry.changes : []
      for (const change of changes as Array<Record<string, unknown>>) {
        const value = change.value as Record<string, unknown> | undefined
        const messages = Array.isArray(value?.messages) ? value!.messages : []
        for (const message of messages as Array<Record<string, unknown>>) {
          const from = String(message.from ?? '')
          if (!from) continue
          await processInboundMessage(message, from)
        }
      }
    }
  } catch (error) {
    logger.error('whatsappWebhook processing error', error)
  }

  // Sempre 200 para a Meta não reenviar em loop por erro de negócio
  res.status(200).json({ ok: true })
})
