/**
 * Callables Twilio — status e teste de envio (admin / platform admin).
 */
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { getTwilioConfigStatus, sendTwilioMessage } from './twilio'

function requireAdmin(auth: { uid: string; token: Record<string, unknown> } | undefined): void {
  if (!auth?.uid) throw new HttpsError('unauthenticated', 'Faça login.')
  const token = auth.token ?? {}
  const isAdmin =
    token.admin === true ||
    token.platformAdmin === true ||
    token.role === 'admin'
  if (!isAdmin) {
    throw new HttpsError(
      'permission-denied',
      'Apenas administradores podem testar o Twilio.',
    )
  }
}

/** Status das credenciais Twilio (sem expor secrets). */
export const getTwilioStatus = onCall(async (request) => {
  requireAdmin(request.auth)
  return getTwilioConfigStatus()
})

/**
 * Envia SMS/WhatsApp de teste.
 * Body: { to: string, message?: string }
 * Trial Twilio: o destino precisa estar verificado na conta.
 */
export const sendTwilioTestMessage = onCall(async (request) => {
  requireAdmin(request.auth)
  const to = String(request.data?.to ?? '').trim()
  if (!to) {
    throw new HttpsError('invalid-argument', 'Informe o telefone de destino (to).')
  }
  const message = String(
    request.data?.message ??
      'Teste Promover Experience / Vale — confirmação Twilio OK.',
  ).trim()

  const result = await sendTwilioMessage(to, message)
  if (result.status === 'skipped_no_provider') {
    throw new HttpsError(
      'failed-precondition',
      result.detail ??
        'Twilio incompleto: defina SID, token e TWILIO_FROM ou TWILIO_WHATSAPP_FROM.',
    )
  }
  if (result.status === 'skipped_no_phone') {
    throw new HttpsError('invalid-argument', 'Telefone inválido.')
  }
  if (result.status === 'error') {
    throw new HttpsError('internal', result.detail ?? 'Falha ao enviar via Twilio.')
  }
  return result
})
