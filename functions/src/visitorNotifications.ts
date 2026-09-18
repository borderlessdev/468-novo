/**
 * DIA 3 CRM — confirmação automática após cadastro no portal.
 *
 * Ponto único de disparo: onDocumentWritten em visitGuestLinks quando o
 * visitante envia rascunho(s) (LGPD) ou confirma presença. O portal anônimo
 * NÃO escreve em `mail` — só esta Function (Admin SDK).
 *
 * Setup SMS/WhatsApp (Twilio):
 * 1. Defina TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN e TWILIO_FROM (ou
 *    TWILIO_WHATSAPP_FROM) em functions/.env
 * 2. Deploy: npm --prefix functions run deploy
 * Sem credenciais: grava status `skipped_no_provider` e segue o fluxo.
 */
import { onDocumentWritten } from 'firebase-functions/v2/firestore'
import { logger } from 'firebase-functions'
import { FieldValue, getFirestore, type DocumentData } from 'firebase-admin/firestore'
import { sendTwilioMessage, type TwilioSendResult } from './twilio'

const db = getFirestore()

type Draft = Record<string, unknown>

interface NotifyChannelResult {
  channel: 'email' | 'sms' | 'whatsapp'
  to?: string
  status:
    | 'queued'
    | 'sent'
    | 'skipped_no_email'
    | 'skipped_no_phone'
    | 'skipped_no_provider'
    | 'error'
  detail?: string
  sid?: string
}

function toNotifyResult(result: TwilioSendResult): NotifyChannelResult {
  return {
    channel: result.channel,
    to: result.to,
    status: result.status,
    detail: result.detail,
    sid: result.sid,
  }
}

function asDrafts(data: DocumentData): Draft[] {
  if (Array.isArray(data.visitorDrafts) && data.visitorDrafts.length > 0) {
    return data.visitorDrafts.filter((d): d is Draft => !!d && typeof d === 'object')
  }
  if (data.visitorDraft && typeof data.visitorDraft === 'object') {
    return [data.visitorDraft as Draft]
  }
  return []
}

function draftFingerprint(data: DocumentData): string {
  const drafts = asDrafts(data)
  const draftPart = drafts
    .map((d) =>
      [
        String(d.name ?? ''),
        String(d.email ?? ''),
        String(d.phone ?? ''),
        String(d.whatsapp ?? ''),
        String(d.updatedAt ?? ''),
        d.lgpdConsent === true ? '1' : '0',
      ].join('|'),
    )
    .join('||')
  return `${String(data.confirmationStatus ?? 'pending')}::${draftPart}`
}

function isVip(data: DocumentData): boolean {
  if (data.formVariant === 'vip') return true
  if (data.formVariant === 'comunidade') return false
  return data.eventKind === 'visita_vip'
}

function isCommunity(data: DocumentData): boolean {
  if (data.formVariant === 'comunidade') return true
  return (
    data.eventKind === 'comunidade_prioritaria' ||
    data.eventKind === 'visita_comunidade'
  )
}

function draftLocale(draft: Draft): 'pt' | 'en' {
  const lang = String(draft.language ?? '').toLowerCase()
  if (lang.startsWith('en') || lang === 'english' || lang === 'inglês' || lang === 'ingles') {
    return 'en'
  }
  return 'pt'
}

function buildVisitorConfirmEmail(draft: Draft, visitTitle: string): { subject: string; text: string } {
  const name = String(draft.name ?? '').trim() || 'visitante'
  const locale = draftLocale(draft)
  if (locale === 'en') {
    return {
      subject: `Registration confirmed — ${visitTitle}`,
      text: [
        `Hello ${name},`,
        '',
        `We received your registration for "${visitTitle}".`,
        'Our team will review your details and get in touch if needed.',
        '',
        'Thank you,',
        'Promover Experience',
      ].join('\n'),
    }
  }
  return {
    subject: `Cadastro confirmado — ${visitTitle}`,
    text: [
      `Olá ${name},`,
      '',
      `Recebemos seu cadastro para a visita "${visitTitle}".`,
      'Nossa equipe vai revisar os dados e entrar em contato se precisar.',
      '',
      'Obrigado,',
      'Promover Experience',
    ].join('\n'),
  }
}

function buildOwnerEmail(
  visitTitle: string,
  drafts: Draft[],
  confirmationStatus: string,
): { subject: string; text: string } {
  const names = drafts
    .map((d) => String(d.name ?? '').trim())
    .filter(Boolean)
    .join(', ')
  const statusLabel =
    confirmationStatus === 'confirmed'
      ? 'confirmou presença'
      : confirmationStatus === 'declined'
        ? 'recusou o convite'
        : 'enviou cadastro'
  return {
    subject: `Portal: ${statusLabel} — ${visitTitle}`,
    text: [
      `Atualização no portal da visita "${visitTitle}".`,
      `Status: ${confirmationStatus}`,
      `Visitante(s): ${names || '—'}`,
      `Quantidade: ${drafts.length}`,
      '',
      'Abra o detalhe da visita para aplicar os dados no CRM, se ainda não aplicou.',
    ].join('\n'),
  }
}

async function queueMail(input: {
  to: string
  subject: string
  text: string
  visitId?: string
  kind: string
  createdBy: string
}): Promise<void> {
  await db.collection('mail').add({
    to: [input.to],
    message: {
      subject: input.subject,
      text: input.text,
    },
    visitId: input.visitId ?? null,
    createdAt: FieldValue.serverTimestamp(),
  })
  await db.collection('emailLogs').add({
    to: [input.to],
    subject: input.subject,
    visitId: input.visitId ?? null,
    kind: input.kind,
    status: 'queued',
    createdBy: input.createdBy,
    createdAt: FieldValue.serverTimestamp(),
  })
}

async function createOwnerNotification(input: {
  ownerId: string
  visitId: string
  linkId: string
  title: string
  body: string
  type: 'guest_confirmed' | 'guest_registration'
  dedupeKey: string
}): Promise<void> {
  const prefsSnap = await db.collection('users').doc(input.ownerId).get()
  const prefs = (prefsSnap.get('notificationPreferences') ?? {}) as Record<
    string,
    boolean
  >
  const prefKey =
    input.type === 'guest_confirmed' ? 'guestConfirmed' : 'guestRegistration'
  if (prefs[prefKey] === false) return

  const recent = await db
    .collection('notifications')
    .where('recipientId', '==', input.ownerId)
    .where('dedupeKey', '==', input.dedupeKey)
    .limit(1)
    .get()
  if (!recent.empty) return

  await db.collection('notifications').add({
    recipientId: input.ownerId,
    type: input.type,
    title: input.title,
    body: input.body,
    visitId: input.visitId,
    entityId: input.linkId,
    href: `/visitas/${input.visitId}`,
    read: false,
    dedupeKey: input.dedupeKey,
    createdAt: FieldValue.serverTimestamp(),
  })
}

export const onVisitGuestLinkWritten = onDocumentWritten(
  'visitGuestLinks/{linkId}',
  async (event) => {
    const after = event.data?.after
    if (!after?.exists) return

    const linkId = event.params.linkId
    const afterData = after.data()!
    if (afterData.revoked === true) return

    const drafts = asDrafts(afterData)
    const hasName = drafts.some((d) => String(d.name ?? '').trim().length > 0)
    if (!hasName) return

    const shouldNotify =
      afterData.confirmationStatus === 'confirmed' ||
      drafts.some((d) => d.lgpdConsent === true)
    if (!shouldNotify) return

    const fingerprint = draftFingerprint(afterData)
    const previous = afterData.visitorNotify as { dispatchFingerprint?: string } | undefined
    if (previous?.dispatchFingerprint === fingerprint) {
      return
    }

    const before = event.data?.before
    if (before?.exists) {
      const beforeFp = draftFingerprint(before.data()!)
      if (beforeFp === fingerprint) return
    }

    const visitId = String(afterData.visitId ?? '')
    const ownerId = String(afterData.ownerId ?? '')
    const visitTitle = String(afterData.visitTitle ?? 'Visita')
    const confirmationStatus = String(afterData.confirmationStatus ?? 'pending')
    const results: NotifyChannelResult[] = []

    // 1) Visitante: e-mail (VIP) ou SMS (Comunidade)
    if (confirmationStatus !== 'declined') {
      if (isVip(afterData) || (!isCommunity(afterData) && afterData.formVariant !== 'comunidade')) {
        // VIP / geral → e-mail
        for (const draft of drafts) {
          const email = String(draft.email ?? '').trim()
          if (!email) {
            results.push({ channel: 'email', status: 'skipped_no_email' })
            continue
          }
          try {
            const message = buildVisitorConfirmEmail(draft, visitTitle)
            await queueMail({
              to: email,
              subject: message.subject,
              text: message.text,
              visitId,
              kind: 'visitor_registration_confirm',
              createdBy: ownerId || 'system',
            })
            results.push({ channel: 'email', to: email, status: 'queued' })
          } catch (error) {
            logger.error('Falha ao enfileirar e-mail VIP', error)
            results.push({
              channel: 'email',
              to: email,
              status: 'error',
              detail: error instanceof Error ? error.message : 'mail failed',
            })
          }
        }
      }

      if (isCommunity(afterData)) {
        for (const draft of drafts) {
          const phone = String(draft.whatsapp ?? draft.phone ?? '').trim()
          if (!phone) {
            results.push({ channel: 'sms', status: 'skipped_no_phone' })
            continue
          }
          const locale = draftLocale(draft)
          const name = String(draft.name ?? '').trim() || 'visitante'
          const body =
            locale === 'en'
              ? `Hello ${name}, your registration for "${visitTitle}" was received. Thank you!`
              : `Olá ${name}, recebemos seu cadastro para "${visitTitle}". Obrigado!`
          const smsResult = toNotifyResult(await sendTwilioMessage(phone, body))
          results.push(smsResult)
        }
      }
    }

    // 2) Responsável: notificação in-app (+ e-mail resumo, 1 por submit)
    if (ownerId && visitId) {
      const names = drafts
        .map((d) => String(d.name ?? '').trim())
        .filter(Boolean)
        .join(', ')
      const confirmed = confirmationStatus === 'confirmed'
      const declined = confirmationStatus === 'declined'
      const type = confirmed || declined ? 'guest_confirmed' : 'guest_registration'
      const title = confirmed
        ? 'Visitante confirmou presença'
        : declined
          ? 'Visitante recusou o convite'
          : 'Novo cadastro pelo portal'
      const body = `${names || 'Visitante'} — ${visitTitle}${
        drafts.length > 1 ? ` (${drafts.length} visitantes)` : ''
      }`

      try {
        await createOwnerNotification({
          ownerId,
          visitId,
          linkId,
          title,
          body,
          type,
          dedupeKey: `${type}:${linkId}:${fingerprint.slice(0, 80)}`,
        })
      } catch (error) {
        logger.error('Falha ao notificar owner', error)
      }

      // E-mail opcional ao owner (1 resumo por submit) se houver e-mail no perfil
      try {
        const ownerSnap = await db.collection('users').doc(ownerId).get()
        const ownerEmail = String(ownerSnap.get('email') ?? '').trim()
        if (ownerEmail) {
          const message = buildOwnerEmail(visitTitle, drafts, confirmationStatus)
          await queueMail({
            to: ownerEmail,
            subject: message.subject,
            text: message.text,
            visitId,
            kind: 'visitor_registration_owner',
            createdBy: 'system',
          })
          results.push({ channel: 'email', to: ownerEmail, status: 'queued' })
        }
      } catch (error) {
        logger.warn('E-mail ao owner pulado', error)
      }
    }

    await after.ref.set(
      {
        visitorNotify: {
          dispatchFingerprint: fingerprint,
          dispatchedAt: FieldValue.serverTimestamp(),
          results,
        },
      },
      { merge: true },
    )

    logger.info('visitorNotifications: disparo concluído', {
      linkId,
      visitId,
      results: results.map((r) => r.status),
    })
  },
)
