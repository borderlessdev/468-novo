import { FirebaseError } from 'firebase/app'
import { httpsCallable } from 'firebase/functions'
import { toast } from 'sonner'
import { functions } from '@/lib/firebase'
import type { CalendarConnectionStatus } from '@/types'

/**
 * Integração de calendários externos (Cloud Functions em functions/).
 *
 * Tudo aqui é tolerante a falha: se as Functions não estiverem publicadas ou se
 * faltarem GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET, a agenda continua funcionando
 * normalmente e o status volta como desconectado.
 *
 * Outlook — próximos passos (hoje é só um stub):
 * 1. Registrar o app no Azure AD (App Registration) e gerar client secret.
 * 2. Pedir o escopo `Calendars.ReadWrite` (+ `offline_access` para refresh token).
 * 3. Replicar o fluxo do Google nas Functions: start → callback → refresh token
 *    gravado pelo Admin SDK → sync das atividades via Microsoft Graph.
 */

const DISCONNECTED_GOOGLE: CalendarConnectionStatus = { provider: 'google', connected: false }
const DISCONNECTED_OUTLOOK: CalendarConnectionStatus = { provider: 'outlook', connected: false }

export interface CalendarStatuses {
  google: CalendarConnectionStatus
  outlook: CalendarConnectionStatus
  credentialsConfigured: boolean
}

export interface CalendarSyncOutcome {
  ok: boolean
  /** Google apontou outro compromisso no mesmo horário (o evento foi criado assim mesmo). */
  conflict: boolean
  needsReauth: boolean
  notConnected: boolean
  error?: string
}

export interface CalendarBulkSyncOutcome extends CalendarSyncOutcome {
  total: number
  synced: number
  conflicts: number
  failed: number
}

const callStatus = httpsCallable<void, CalendarStatuses>(functions, 'getCalendarStatus')
const callStart = httpsCallable<void, { url?: string }>(functions, 'googleCalendarOAuthStart')
const callDisconnect = httpsCallable<void, { ok: boolean }>(functions, 'googleCalendarDisconnect')
const callSyncActivity = httpsCallable<
  { activityId: string },
  { ok: boolean; eventId?: string; conflict?: boolean }
>(functions, 'syncActivityToGoogle')
const callDeleteEvent = httpsCallable<{ activityId: string }, { ok: boolean; skipped?: boolean }>(
  functions,
  'deleteGoogleEvent',
)
const callSyncVisit = httpsCallable<
  { visitId: string },
  { ok: boolean; total?: number; synced?: number; conflicts?: number; failed?: number }
>(functions, 'syncVisitActivitiesToGoogle')

function messageOf(error: unknown): string {
  if (error instanceof FirebaseError) return error.message
  if (error instanceof Error) return error.message
  return ''
}

export function isReauthError(error: unknown): boolean {
  return messageOf(error).includes('calendar_reauth_required')
}

function isNotConnectedError(error: unknown): boolean {
  return messageOf(error).includes('calendar_not_connected')
}

function isMissingCredentialsError(error: unknown): boolean {
  return messageOf(error).includes('GOOGLE_CLIENT_ID')
}

/** Mensagem em português para qualquer falha vinda das callables. */
function friendlyMessage(error: unknown): string {
  if (isMissingCredentialsError(error)) {
    return 'Defina GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET nas Functions do Firebase.'
  }
  if (isReauthError(error)) return 'Reconecte o Google Calendar em Configurações.'
  if (isNotConnectedError(error)) {
    return 'Conecte sua conta Google em Configurações antes de sincronizar.'
  }
  if (error instanceof FirebaseError) {
    if (error.code === 'functions/permission-denied' || error.code === 'functions/unauthenticated') {
      return error.message
    }
    if (error.code === 'functions/unimplemented') return error.message
    if (error.code === 'functions/not-found' || error.code === 'functions/internal') {
      return 'Serviço de calendário indisponível. Publique as Cloud Functions e tente de novo.'
    }
  }
  return 'Não foi possível falar com o serviço de calendário.'
}

function toOutcome(error: unknown): CalendarSyncOutcome {
  const needsReauth = isReauthError(error)
  if (needsReauth) toast.error('Reconecte o Google Calendar em Configurações.')
  return {
    ok: false,
    conflict: false,
    needsReauth,
    notConnected: isNotConnectedError(error),
    error: friendlyMessage(error),
  }
}

export async function getCalendarStatuses(): Promise<CalendarStatuses> {
  try {
    const { data } = await callStatus()
    return {
      google: data?.google ?? DISCONNECTED_GOOGLE,
      outlook: data?.outlook ?? DISCONNECTED_OUTLOOK,
      credentialsConfigured: data?.credentialsConfigured ?? false,
    }
  } catch (error) {
    if (isReauthError(error)) {
      return {
        google: { ...DISCONNECTED_GOOGLE, needsReauth: true },
        outlook: DISCONNECTED_OUTLOOK,
        credentialsConfigured: true,
      }
    }
    console.error(error)
    return {
      google: DISCONNECTED_GOOGLE,
      outlook: DISCONNECTED_OUTLOOK,
      credentialsConfigured: false,
    }
  }
}

/** Status do Google — nunca lança: sem Functions, devolve desconectado. */
export async function getCalendarStatus(): Promise<CalendarConnectionStatus> {
  return (await getCalendarStatuses()).google
}

export async function startGoogleOAuth(): Promise<void> {
  let url = ''
  try {
    const { data } = await callStart()
    url = data?.url ?? ''
  } catch (error) {
    throw new Error(friendlyMessage(error))
  }
  if (!url) throw new Error('O Google não devolveu a URL de consentimento.')
  window.location.assign(url)
}

export async function disconnectGoogle(): Promise<void> {
  try {
    await callDisconnect()
  } catch (error) {
    throw new Error(friendlyMessage(error))
  }
}

export async function syncActivityToGoogle(activityId: string): Promise<CalendarSyncOutcome> {
  try {
    const { data } = await callSyncActivity({ activityId })
    return {
      ok: data?.ok !== false,
      conflict: data?.conflict === true,
      needsReauth: false,
      notConnected: false,
    }
  } catch (error) {
    return toOutcome(error)
  }
}

export async function deleteGoogleEvent(activityId: string): Promise<CalendarSyncOutcome> {
  try {
    const { data } = await callDeleteEvent({ activityId })
    return { ok: data?.ok !== false, conflict: false, needsReauth: false, notConnected: false }
  } catch (error) {
    return toOutcome(error)
  }
}

export async function syncVisitToGoogle(visitId: string): Promise<CalendarBulkSyncOutcome> {
  try {
    const { data } = await callSyncVisit({ visitId })
    const conflicts = data?.conflicts ?? 0
    return {
      ok: data?.ok !== false,
      conflict: conflicts > 0,
      needsReauth: false,
      notConnected: false,
      total: data?.total ?? 0,
      synced: data?.synced ?? 0,
      conflicts,
      failed: data?.failed ?? 0,
    }
  } catch (error) {
    return { ...toOutcome(error), total: 0, synced: 0, conflicts: 0, failed: 0 }
  }
}
