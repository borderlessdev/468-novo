/**
 * Cliente Twilio (SMS / WhatsApp) para Functions.
 *
 * Variáveis em functions/.env (nunca commitar):
 *   TWILIO_ACCOUNT_SID
 *   TWILIO_AUTH_TOKEN
 *   TWILIO_FROM            — número SMS E.164 (+5511...)
 *   TWILIO_WHATSAPP_FROM   — opcional; se setado, preferido (ex. whatsapp:+14155238886)
 *
 * Sem SID/token ou sem FROM: retorna skipped_no_provider (não quebra o fluxo).
 */
import { logger } from 'firebase-functions'

export type TwilioChannel = 'sms' | 'whatsapp'

export type TwilioSendStatus =
  | 'sent'
  | 'skipped_no_phone'
  | 'skipped_no_provider'
  | 'error'

export interface TwilioSendResult {
  channel: TwilioChannel
  to?: string
  status: TwilioSendStatus
  detail?: string
  sid?: string
}

export interface TwilioConfigStatus {
  configured: boolean
  hasAccountSid: boolean
  hasAuthToken: boolean
  hasSmsFrom: boolean
  hasWhatsAppFrom: boolean
  /** Canal que será usado se enviar agora. */
  preferredChannel: TwilioChannel | null
  ready: boolean
  hint?: string
}

function env(name: string): string {
  return process.env[name]?.trim() ?? ''
}

export function getTwilioConfigStatus(): TwilioConfigStatus {
  const hasAccountSid = Boolean(env('TWILIO_ACCOUNT_SID'))
  const hasAuthToken = Boolean(env('TWILIO_AUTH_TOKEN'))
  const hasSmsFrom = Boolean(env('TWILIO_FROM'))
  const hasWhatsAppFrom = Boolean(env('TWILIO_WHATSAPP_FROM'))
  const configured = hasAccountSid && hasAuthToken
  const preferredChannel: TwilioChannel | null = hasWhatsAppFrom
    ? 'whatsapp'
    : hasSmsFrom
      ? 'sms'
      : null
  const ready = configured && preferredChannel != null

  let hint: string | undefined
  if (!configured) {
    hint = 'Defina TWILIO_ACCOUNT_SID e TWILIO_AUTH_TOKEN em functions/.env e faça deploy.'
  } else if (!preferredChannel) {
    hint =
      'Credenciais ok. Falta TWILIO_FROM (SMS) ou TWILIO_WHATSAPP_FROM (WhatsApp sandbox/produção).'
  }

  return {
    configured,
    hasAccountSid,
    hasAuthToken,
    hasSmsFrom,
    hasWhatsAppFrom,
    preferredChannel,
    ready,
    hint,
  }
}

/** Normaliza celular BR para E.164 (+55...). */
export function normalizePhoneE164(raw: string): string | null {
  const digits = raw.replace(/\D/g, '')
  if (digits.length < 10) return null
  if (digits.startsWith('55')) return `+${digits}`
  if (digits.length === 10 || digits.length === 11) return `+55${digits}`
  return `+${digits}`
}

/**
 * Envia SMS ou WhatsApp via API REST da Twilio (sem SDK).
 * Prefere WhatsApp se TWILIO_WHATSAPP_FROM estiver definido.
 */
export async function sendTwilioMessage(
  toRaw: string,
  body: string,
): Promise<TwilioSendResult> {
  const accountSid = env('TWILIO_ACCOUNT_SID')
  const authToken = env('TWILIO_AUTH_TOKEN')
  const fromSms = env('TWILIO_FROM')
  const fromWa = env('TWILIO_WHATSAPP_FROM')

  const to = normalizePhoneE164(toRaw)
  if (!to) {
    return { channel: 'sms', status: 'skipped_no_phone', detail: 'telefone inválido' }
  }

  if (!accountSid || !authToken || (!fromSms && !fromWa)) {
    logger.info('twilio: stub (credenciais ou FROM ausentes)', {
      to,
      hasSid: Boolean(accountSid),
      hasFrom: Boolean(fromSms || fromWa),
    })
    return {
      channel: fromWa ? 'whatsapp' : 'sms',
      to,
      status: 'skipped_no_provider',
      detail: !accountSid || !authToken
        ? 'TWILIO_ACCOUNT_SID/AUTH_TOKEN ausente'
        : 'TWILIO_FROM / TWILIO_WHATSAPP_FROM ausente',
    }
  }

  const useWhatsApp = Boolean(fromWa)
  const from = useWhatsApp ? fromWa : fromSms
  const toAddr = useWhatsApp ? `whatsapp:${to}` : to
  const fromAddr = useWhatsApp
    ? from.startsWith('whatsapp:')
      ? from
      : `whatsapp:${from}`
    : from

  const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`
  const params = new URLSearchParams({
    To: toAddr,
    From: fromAddr,
    Body: body,
  })

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization:
          'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    })

    const text = await response.text()
    if (!response.ok) {
      logger.error('twilio API error', { status: response.status, text: text.slice(0, 500) })
      return {
        channel: useWhatsApp ? 'whatsapp' : 'sms',
        to,
        status: 'error',
        detail: `twilio ${response.status}: ${text.slice(0, 200)}`,
      }
    }

    let sid: string | undefined
    try {
      const parsed = JSON.parse(text) as { sid?: string }
      sid = parsed.sid
    } catch {
      // ignore
    }

    logger.info('twilio: mensagem enviada', { to, channel: useWhatsApp ? 'whatsapp' : 'sms', sid })
    return {
      channel: useWhatsApp ? 'whatsapp' : 'sms',
      to,
      status: 'sent',
      sid,
    }
  } catch (error) {
    logger.error('twilio request failed', error)
    return {
      channel: useWhatsApp ? 'whatsapp' : 'sms',
      to,
      status: 'error',
      detail: error instanceof Error ? error.message : 'fetch failed',
    }
  }
}
