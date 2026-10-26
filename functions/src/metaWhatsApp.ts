/**
 * Cliente WhatsApp Cloud API (Meta) — sem Twilio.
 *
 * Variáveis em functions/.env (nunca commitar):
 *   META_WA_PHONE_NUMBER_ID
 *   META_WA_BUSINESS_ACCOUNT_ID
 *   META_WA_ACCESS_TOKEN
 *   META_WA_APP_ID
 *   META_WA_APP_SECRET
 *   META_WA_VERIFY_TOKEN
 *   META_WA_API_VERSION          (default v21.0)
 *   META_WA_INVITE_TEMPLATE_NAME (default convite_evento_cliente)
 *   META_WA_INVITE_TEMPLATE_LANG (default pt_BR)
 *
 * Sem token/phone id: envios retornam skipped_no_provider (não quebra o fluxo).
 */
import { createHmac, timingSafeEqual } from 'node:crypto'
import { logger } from 'firebase-functions'
import { normalizePhoneE164 } from './twilio'

export { normalizePhoneE164 }

export type MetaWaSendStatus =
  | 'sent'
  | 'skipped_no_phone'
  | 'skipped_no_provider'
  | 'error'

export interface MetaWaSendResult {
  to?: string
  status: MetaWaSendStatus
  detail?: string
  messageId?: string
}

export interface MetaWaConfigStatus {
  configured: boolean
  ready: boolean
  hasPhoneNumberId: boolean
  hasBusinessAccountId: boolean
  hasAccessToken: boolean
  hasAppId: boolean
  hasAppSecret: boolean
  hasVerifyToken: boolean
  apiVersion: string
  inviteTemplateName: string
  inviteTemplateLang: string
  hint?: string
}

function env(name: string): string {
  return process.env[name]?.trim() ?? ''
}

export function getMetaWhatsAppConfigStatus(): MetaWaConfigStatus {
  const hasPhoneNumberId = Boolean(env('META_WA_PHONE_NUMBER_ID'))
  const hasBusinessAccountId = Boolean(env('META_WA_BUSINESS_ACCOUNT_ID'))
  const hasAccessToken = Boolean(env('META_WA_ACCESS_TOKEN'))
  const hasAppId = Boolean(env('META_WA_APP_ID'))
  const hasAppSecret = Boolean(env('META_WA_APP_SECRET'))
  const hasVerifyToken = Boolean(env('META_WA_VERIFY_TOKEN'))
  const apiVersion = env('META_WA_API_VERSION') || 'v21.0'
  const inviteTemplateName = env('META_WA_INVITE_TEMPLATE_NAME') || 'convite_evento_cliente'
  const inviteTemplateLang = env('META_WA_INVITE_TEMPLATE_LANG') || 'pt_BR'

  const configured = hasPhoneNumberId && hasAccessToken
  const ready = configured

  let hint: string | undefined
  if (!configured) {
    hint =
      'Defina META_WA_PHONE_NUMBER_ID e META_WA_ACCESS_TOKEN em functions/.env e faça deploy.'
  } else if (!hasAppSecret || !hasVerifyToken) {
    hint =
      'Envio ok. Para o webhook, defina META_WA_APP_SECRET e META_WA_VERIFY_TOKEN.'
  }

  return {
    configured,
    ready,
    hasPhoneNumberId,
    hasBusinessAccountId,
    hasAccessToken,
    hasAppId,
    hasAppSecret,
    hasVerifyToken,
    apiVersion,
    inviteTemplateName,
    inviteTemplateLang,
    hint,
  }
}

function graphUrl(path: string): string {
  const version = env('META_WA_API_VERSION') || 'v21.0'
  return `https://graph.facebook.com/${version}/${path}`
}

async function postMessages(payload: Record<string, unknown>): Promise<MetaWaSendResult> {
  const phoneNumberId = env('META_WA_PHONE_NUMBER_ID')
  const token = env('META_WA_ACCESS_TOKEN')
  const to = typeof payload.to === 'string' ? payload.to : undefined

  if (!phoneNumberId || !token) {
    logger.info('metaWhatsApp: stub (credenciais ausentes)', {
      hasPhoneNumberId: Boolean(phoneNumberId),
      hasToken: Boolean(token),
    })
    return {
      to,
      status: 'skipped_no_provider',
      detail: 'META_WA_PHONE_NUMBER_ID / META_WA_ACCESS_TOKEN ausente',
    }
  }

  try {
    const response = await fetch(graphUrl(`${phoneNumberId}/messages`), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ messaging_product: 'whatsapp', ...payload }),
    })
    const text = await response.text()
    if (!response.ok) {
      logger.error('metaWhatsApp API error', {
        status: response.status,
        text: text.slice(0, 500),
      })
      return {
        to,
        status: 'error',
        detail: `meta ${response.status}: ${text.slice(0, 200)}`,
      }
    }

    let messageId: string | undefined
    try {
      const parsed = JSON.parse(text) as {
        messages?: Array<{ id?: string }>
      }
      messageId = parsed.messages?.[0]?.id
    } catch {
      // ignore
    }

    logger.info('metaWhatsApp: mensagem enviada', { to, messageId })
    return { to, status: 'sent', messageId }
  } catch (error) {
    logger.error('metaWhatsApp request failed', error)
    return {
      to,
      status: 'error',
      detail: error instanceof Error ? error.message : 'fetch failed',
    }
  }
}

/** Destino Graph API: dígitos sem + (ex. 5511999999999). */
export function toWhatsAppRecipient(raw: string): string | null {
  const e164 = normalizePhoneE164(raw)
  if (!e164) return null
  return e164.replace(/\D/g, '')
}

export async function sendTemplateMessage(input: {
  to: string
  templateName?: string
  languageCode?: string
  bodyParameters?: string[]
}): Promise<MetaWaSendResult> {
  const to = toWhatsAppRecipient(input.to)
  if (!to) {
    return { status: 'skipped_no_phone', detail: 'telefone inválido' }
  }

  const status = getMetaWhatsAppConfigStatus()
  const name = input.templateName || status.inviteTemplateName
  const languageCode = input.languageCode || status.inviteTemplateLang
  const bodyParameters = input.bodyParameters ?? []

  const components =
    bodyParameters.length > 0
      ? [
          {
            type: 'body',
            parameters: bodyParameters.map((text) => ({ type: 'text', text })),
          },
        ]
      : undefined

  return postMessages({
    to,
    type: 'template',
    template: {
      name,
      language: { code: languageCode },
      ...(components ? { components } : {}),
    },
  })
}

export async function sendTextMessage(toRaw: string, body: string): Promise<MetaWaSendResult> {
  const to = toWhatsAppRecipient(toRaw)
  if (!to) {
    return { status: 'skipped_no_phone', detail: 'telefone inválido' }
  }
  return postMessages({
    to,
    type: 'text',
    text: { preview_url: true, body },
  })
}

/** Botões interativos (só dentro da janela de 24h após o usuário responder). */
export async function sendInteractiveButtons(input: {
  to: string
  bodyText: string
  buttons: Array<{ id: string; title: string }>
}): Promise<MetaWaSendResult> {
  const to = toWhatsAppRecipient(input.to)
  if (!to) {
    return { status: 'skipped_no_phone', detail: 'telefone inválido' }
  }
  const buttons = input.buttons.slice(0, 3).map((btn) => ({
    type: 'reply',
    reply: {
      id: btn.id.slice(0, 256),
      title: btn.title.slice(0, 20),
    },
  }))
  return postMessages({
    to,
    type: 'interactive',
    interactive: {
      type: 'button',
      body: { text: input.bodyText.slice(0, 1024) },
      action: { buttons },
    },
  })
}

/**
 * Valida X-Hub-Signature-256 do webhook Meta.
 * Retorna true se o secret não estiver configurado (dev) — em produção configure o secret.
 */
export function verifyMetaWebhookSignature(
  rawBody: string | Buffer,
  signatureHeader: string | undefined,
): boolean {
  const secret = env('META_WA_APP_SECRET')
  if (!secret) {
    logger.warn('metaWhatsApp: META_WA_APP_SECRET ausente — assinatura não verificada')
    return true
  }
  if (!signatureHeader?.startsWith('sha256=')) return false
  const expected = signatureHeader.slice('sha256='.length)
  const digest = createHmac('sha256', secret)
    .update(typeof rawBody === 'string' ? rawBody : rawBody)
    .digest('hex')
  try {
    const a = Buffer.from(expected, 'hex')
    const b = Buffer.from(digest, 'hex')
    if (a.length !== b.length) return false
    return timingSafeEqual(a, b)
  } catch {
    return false
  }
}

export function getMetaVerifyToken(): string {
  return env('META_WA_VERIFY_TOKEN')
}
