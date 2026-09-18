import { httpsCallable } from 'firebase/functions'
import { functions } from '@/lib/firebase'

export interface TwilioConfigStatus {
  configured: boolean
  hasAccountSid: boolean
  hasAuthToken: boolean
  hasSmsFrom: boolean
  hasWhatsAppFrom: boolean
  preferredChannel: 'sms' | 'whatsapp' | null
  ready: boolean
  hint?: string
}

export interface TwilioSendResult {
  channel: 'sms' | 'whatsapp'
  to?: string
  status: string
  detail?: string
  sid?: string
}

const callStatus = httpsCallable<void, TwilioConfigStatus>(functions, 'getTwilioStatus')
const callTest = httpsCallable<{ to: string; message?: string }, TwilioSendResult>(
  functions,
  'sendTwilioTestMessage',
)

/** Status Twilio (só admin). Não expõe secrets. */
export async function getTwilioStatus(): Promise<TwilioConfigStatus> {
  const { data } = await callStatus()
  return data
}

/** Envia SMS/WhatsApp de teste (só admin). Trial: destino precisa estar verificado. */
export async function sendTwilioTestMessage(
  to: string,
  message?: string,
): Promise<TwilioSendResult> {
  const { data } = await callTest({ to, message })
  return data
}
