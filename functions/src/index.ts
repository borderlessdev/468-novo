import './loadEnv'

/**
 * Cloud Functions do Promover Experience — integração com Google Calendar.
 *
 * Credenciais ficam em functions/.env (GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET,
 * APP_ORIGIN) e nunca chegam ao cliente. O refresh token é gravado em
 * `calendarSecrets/{uid}`, coleção negada nas rules e acessível somente pelo
 * Admin SDK. O cliente enxerga apenas `calendarConnections/{uid}`, que não
 * contém token.
 *
 * O evento é sempre criado no calendário de quem está logado: se a atividade
 * pertence a outra pessoa da equipe, o evento aparece na agenda Google do
 * usuário que disparou o sync, não na do dono da atividade.
 */
import { setGlobalOptions } from 'firebase-functions/v2'
import { HttpsError, onCall, onRequest } from 'firebase-functions/v2/https'
import { logger } from 'firebase-functions'
import { initializeApp } from 'firebase-admin/app'
import { FieldValue, getFirestore } from 'firebase-admin/firestore'
import { google } from 'googleapis'
import { randomUUID } from 'node:crypto'

setGlobalOptions({ maxInstances: 10 })

initializeApp()
const db = getFirestore()

const SECRETS_COLLECTION = 'calendarSecrets'
const CONNECTIONS_COLLECTION = 'calendarConnections'
const OAUTH_STATES_COLLECTION = 'calendarOAuthStates'

const TIME_ZONE = 'America/Sao_Paulo'
/** Atividades guardam `YYYY-MM-DDTHH:mm:ss` sem offset; o Brasil não usa mais horário de verão. */
const UTC_OFFSET = '-03:00'

const SCOPES = [
  'https://www.googleapis.com/auth/calendar.events',
  'openid',
  'email',
]

const OAUTH_STATE_TTL_MS = 10 * 60 * 1000

const CREDENTIALS_MESSAGE =
  'Integração indisponível: defina GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET nas Functions.'
const NOT_CONNECTED_MESSAGE =
  'calendar_not_connected: conecte sua conta Google em Configurações.'
const REAUTH_MESSAGE = 'calendar_reauth_required'

interface GoogleConfig {
  clientId: string
  clientSecret: string
  appOrigin: string
  redirectUri: string
}

interface Caller {
  uid: string
  isAdmin: boolean
}

interface ActivityDoc {
  visitId?: string
  title?: string
  description?: string | null
  location?: string | null
  date?: string
  startTime?: string
  endTime?: string
  googleEventId?: string | null
  ownerId?: string
  isDeleted?: boolean
}

function readConfig(): GoogleConfig | null {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim()
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim()
  if (!clientId || !clientSecret) return null

  const appOrigin = (process.env.APP_ORIGIN?.trim() || 'http://localhost:5173').replace(
    /\/+$/,
    '',
  )
  const projectId =
    process.env.GCLOUD_PROJECT ?? process.env.GOOGLE_CLOUD_PROJECT ?? 'localhost'
  const region = process.env.FUNCTIONS_REGION?.trim() || 'us-central1'
  const redirectUri =
    process.env.GOOGLE_REDIRECT_URI?.trim() ||
    `https://${region}-${projectId}.cloudfunctions.net/googleCalendarOAuthCallback`

  return { clientId, clientSecret, appOrigin, redirectUri }
}

/** Sem credenciais as callables respondem erro claro em vez de derrubar o deploy. */
function requireConfig(): GoogleConfig {
  const config = readConfig()
  if (!config) throw new HttpsError('failed-precondition', CREDENTIALS_MESSAGE)
  return config
}

function appOrigin(): string {
  return (process.env.APP_ORIGIN?.trim() || 'http://localhost:5173').replace(/\/+$/, '')
}

function createOAuthClient(config: GoogleConfig) {
  return new google.auth.OAuth2(config.clientId, config.clientSecret, config.redirectUri)
}

type OAuthClient = ReturnType<typeof createOAuthClient>

function calendarFor(auth: OAuthClient) {
  return google.calendar({ version: 'v3', auth })
}

type CalendarApi = ReturnType<typeof calendarFor>

function requireCaller(auth: { uid: string; token: Record<string, unknown> } | undefined): Caller {
  if (!auth?.uid) {
    throw new HttpsError('unauthenticated', 'Faça login para usar a integração de calendário.')
  }
  return { uid: auth.uid, isAdmin: auth.token?.admin === true }
}

async function getRole(uid: string): Promise<string> {
  const snap = await db.collection('users').doc(uid).get()
  const role = snap.get('role')
  return typeof role === 'string' ? role : 'user'
}

async function assertNotClient(caller: Caller): Promise<void> {
  if (caller.isAdmin) return
  if ((await getRole(caller.uid)) === 'client') {
    throw new HttpsError(
      'permission-denied',
      'Perfis do tipo cliente não podem conectar ou sincronizar calendários.',
    )
  }
}

async function assertCanWriteVisit(caller: Caller, visitId: string): Promise<void> {
  await assertNotClient(caller)
  if (caller.isAdmin) return

  const snap = await db.collection('visits').doc(visitId).get()
  if (!snap.exists) throw new HttpsError('not-found', 'Visita não encontrada.')

  const ownerId = snap.get('ownerId')
  const teamMemberIds = snap.get('teamMemberIds')
  const isMember = Array.isArray(teamMemberIds) && teamMemberIds.includes(caller.uid)
  if (ownerId !== caller.uid && !isMember) {
    throw new HttpsError('permission-denied', 'Você não tem acesso de escrita nesta visita.')
  }
}

/** A googleapis expõe o status ora em `code`, ora em `response.status`. */
function httpStatusOf(error: unknown): number {
  if (!error || typeof error !== 'object') return 0
  const candidate = error as { code?: unknown; status?: unknown; response?: { status?: unknown } }
  const raw = candidate.response?.status ?? candidate.status ?? candidate.code
  const status = typeof raw === 'string' ? Number(raw) : raw
  return typeof status === 'number' && Number.isFinite(status) ? status : 0
}

function isMissingEvent(error: unknown): boolean {
  const status = httpStatusOf(error)
  return status === 404 || status === 410
}

function isInvalidGrant(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const candidate = error as { message?: unknown; response?: { data?: unknown } }
  const parts: string[] = []
  if (typeof candidate.message === 'string') parts.push(candidate.message)
  const data = candidate.response?.data
  if (typeof data === 'string') parts.push(data)
  else if (data) parts.push(JSON.stringify(data))
  return parts.some((part) => part.includes('invalid_grant'))
}

async function clearConnection(uid: string): Promise<void> {
  const batch = db.batch()
  batch.delete(db.collection(SECRETS_COLLECTION).doc(uid))
  batch.delete(db.collection(CONNECTIONS_COLLECTION).doc(uid))
  await batch.commit()
}

/**
 * Token revogado/expirado: apaga a conexão e devolve `calendar_reauth_required`
 * para o frontend pedir uma nova autorização (sem loop de retry).
 */
async function rethrowGoogleError(uid: string, error: unknown): Promise<never> {
  if (error instanceof HttpsError) throw error
  if (isInvalidGrant(error)) {
    await clearConnection(uid).catch((cleanupError) =>
      logger.error('Falha ao limpar conexão inválida', cleanupError),
    )
    throw new HttpsError('failed-precondition', REAUTH_MESSAGE)
  }
  logger.error('Erro na API do Google Calendar', error)
  throw new HttpsError('internal', 'Falha ao comunicar com o Google Calendar.')
}

async function getAuthorizedClient(uid: string): Promise<OAuthClient> {
  const config = requireConfig()
  const snap = await db.collection(SECRETS_COLLECTION).doc(uid).get()
  const refreshToken = snap.get('refreshToken')
  if (!snap.exists || typeof refreshToken !== 'string' || !refreshToken) {
    throw new HttpsError('failed-precondition', NOT_CONNECTED_MESSAGE)
  }
  const client = createOAuthClient(config)
  client.setCredentials({ refresh_token: refreshToken })
  return client
}

function toRfc3339(localDateTime: string): string {
  return `${localDateTime}${UTC_OFFSET}`
}

async function buildEventBody(activity: ActivityDoc) {
  let visitTitle = ''
  if (activity.visitId) {
    const visitSnap = await db.collection('visits').doc(activity.visitId).get()
    const title = visitSnap.get('title')
    if (typeof title === 'string') visitTitle = title
  }

  const description = [visitTitle ? `Visita: ${visitTitle}` : '', activity.description ?? '']
    .filter(Boolean)
    .join('\n\n')

  return {
    summary: activity.title || 'Atividade',
    description: description || undefined,
    location: activity.location || undefined,
    start: { dateTime: activity.startTime, timeZone: TIME_ZONE },
    end: { dateTime: activity.endTime, timeZone: TIME_ZONE },
  }
}

/**
 * Aviso de conflito (não bloqueia a criação). Se o escopo não permitir freebusy,
 * seguimos apenas com o conflito interno detectado na AgendaPage.
 */
async function hasFreeBusyConflict(
  calendar: CalendarApi,
  startTime: string,
  endTime: string,
): Promise<boolean> {
  try {
    const response = await calendar.freebusy.query({
      requestBody: {
        timeMin: toRfc3339(startTime),
        timeMax: toRfc3339(endTime),
        timeZone: TIME_ZONE,
        items: [{ id: 'primary' }],
      },
    })
    const busy = response.data.calendars?.primary?.busy ?? []
    return busy.length > 0
  } catch (error) {
    logger.info('freebusy indisponível — mantendo apenas o conflito interno', error)
    return false
  }
}

async function loadActivity(activityId: string): Promise<ActivityDoc> {
  const snap = await db.collection('activities').doc(activityId).get()
  if (!snap.exists) throw new HttpsError('not-found', 'Atividade não encontrada.')
  return snap.data() as ActivityDoc
}

interface SyncResult {
  ok: true
  eventId: string
  conflict: boolean
}

async function syncActivity(caller: Caller, activityId: string): Promise<SyncResult> {
  const activity = await loadActivity(activityId)
  if (!activity.visitId) throw new HttpsError('failed-precondition', 'Atividade sem visita.')
  if (!activity.startTime || !activity.endTime) {
    throw new HttpsError('failed-precondition', 'Atividade sem horário definido.')
  }
  await assertCanWriteVisit(caller, activity.visitId)

  const auth = await getAuthorizedClient(caller.uid)
  const calendar = calendarFor(auth)
  const requestBody = await buildEventBody(activity)
  const existingEventId = activity.googleEventId || ''

  try {
    let conflict = false
    if (!existingEventId) {
      conflict = await hasFreeBusyConflict(calendar, activity.startTime, activity.endTime)
    }

    let eventId = existingEventId
    if (existingEventId) {
      try {
        const updated = await calendar.events.update({
          calendarId: 'primary',
          eventId: existingEventId,
          requestBody,
        })
        eventId = updated.data.id ?? existingEventId
      } catch (error) {
        // Evento apagado direto no Google: recria em vez de falhar.
        if (!isMissingEvent(error)) throw error
        const created = await calendar.events.insert({ calendarId: 'primary', requestBody })
        eventId = created.data.id ?? ''
      }
    } else {
      const created = await calendar.events.insert({ calendarId: 'primary', requestBody })
      eventId = created.data.id ?? ''
    }

    if (eventId && eventId !== existingEventId) {
      await db.collection('activities').doc(activityId).update({
        googleEventId: eventId,
        updatedAt: FieldValue.serverTimestamp(),
      })
    }

    return { ok: true, eventId, conflict }
  } catch (error) {
    return rethrowGoogleError(caller.uid, error)
  }
}

export const googleCalendarOAuthStart = onCall(async (request) => {
  const caller = requireCaller(request.auth)
  await assertNotClient(caller)
  const config = requireConfig()

  const state = randomUUID()
  await db
    .collection(OAUTH_STATES_COLLECTION)
    .doc(state)
    .set({
      uid: caller.uid,
      createdAt: FieldValue.serverTimestamp(),
      expiresAt: new Date(Date.now() + OAUTH_STATE_TTL_MS),
    })

  const url = createOAuthClient(config).generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: true,
    scope: SCOPES,
    state,
  })

  return { url }
})

export const googleCalendarOAuthCallback = onRequest(async (req, res) => {
  const origin = appOrigin()
  const redirect = (query: string) => res.redirect(`${origin}/configuracoes?${query}`)

  const config = readConfig()
  if (!config) {
    redirect('calendar=error&reason=credenciais')
    return
  }

  const code = typeof req.query.code === 'string' ? req.query.code : ''
  const state = typeof req.query.state === 'string' ? req.query.state : ''
  if (req.query.error || !code || !state) {
    redirect('calendar=error&reason=consentimento')
    return
  }

  const stateRef = db.collection(OAUTH_STATES_COLLECTION).doc(state)
  const stateSnap = await stateRef.get()
  const uid = stateSnap.get('uid')
  const expiresAt = stateSnap.get('expiresAt')
  const expired =
    expiresAt && typeof expiresAt.toDate === 'function' ? expiresAt.toDate() < new Date() : false

  if (!stateSnap.exists || typeof uid !== 'string' || expired) {
    await stateRef.delete().catch(() => undefined)
    redirect('calendar=error&reason=estado')
    return
  }
  await stateRef.delete().catch(() => undefined)

  try {
    const client = createOAuthClient(config)
    const { tokens } = await client.getToken(code)

    if (!tokens.refresh_token) {
      // Sem refresh token não conseguimos sincronizar depois que o access token expira.
      redirect('calendar=error&reason=sem_refresh_token')
      return
    }

    let email = ''
    if (tokens.id_token) {
      try {
        const ticket = await client.verifyIdToken({
          idToken: tokens.id_token,
          audience: config.clientId,
        })
        email = ticket.getPayload()?.email ?? ''
      } catch (error) {
        logger.info('Não foi possível ler o e-mail do id_token', error)
      }
    }

    const now = FieldValue.serverTimestamp()
    const batch = db.batch()
    batch.set(db.collection(SECRETS_COLLECTION).doc(uid), {
      refreshToken: tokens.refresh_token,
      email,
      provider: 'google',
      updatedAt: now,
    })
    batch.set(db.collection(CONNECTIONS_COLLECTION).doc(uid), {
      ownerId: uid,
      provider: 'google',
      email,
      connected: true,
      connectedAt: now,
    })
    await batch.commit()

    redirect('calendar=connected')
  } catch (error) {
    logger.error('Falha ao trocar o código OAuth do Google', error)
    redirect('calendar=error&reason=token')
  }
})

export const getCalendarStatus = onCall(async (request) => {
  const caller = requireCaller(request.auth)

  const [secretSnap, connectionSnap] = await Promise.all([
    db.collection(SECRETS_COLLECTION).doc(caller.uid).get(),
    db.collection(CONNECTIONS_COLLECTION).doc(caller.uid).get(),
  ])

  const refreshToken = secretSnap.get('refreshToken')
  const connected = secretSnap.exists && typeof refreshToken === 'string' && refreshToken.length > 0

  const connectedAt = connectionSnap.get('connectedAt')
  const connectedAtIso =
    connectedAt && typeof connectedAt.toDate === 'function'
      ? connectedAt.toDate().toISOString()
      : undefined

  return {
    google: {
      provider: 'google' as const,
      connected,
      email: connected ? (connectionSnap.get('email') ?? secretSnap.get('email') ?? '') : undefined,
      connectedAt: connected ? connectedAtIso : undefined,
    },
    outlook: { provider: 'outlook' as const, connected: false },
    credentialsConfigured: readConfig() != null,
  }
})

export const googleCalendarDisconnect = onCall(async (request) => {
  const caller = requireCaller(request.auth)

  const snap = await db.collection(SECRETS_COLLECTION).doc(caller.uid).get()
  const refreshToken = snap.get('refreshToken')
  const config = readConfig()

  if (config && typeof refreshToken === 'string' && refreshToken) {
    try {
      await createOAuthClient(config).revokeToken(refreshToken)
    } catch (error) {
      // Token já revogado do lado do Google: seguimos apagando localmente.
      logger.info('Não foi possível revogar o token no Google', error)
    }
  }

  await clearConnection(caller.uid)
  return { ok: true }
})

export const syncActivityToGoogle = onCall<{ activityId?: string }>(async (request) => {
  const caller = requireCaller(request.auth)
  const activityId = request.data?.activityId
  if (!activityId) throw new HttpsError('invalid-argument', 'Informe o activityId.')
  return syncActivity(caller, activityId)
})

export const deleteGoogleEvent = onCall<{ activityId?: string }>(async (request) => {
  const caller = requireCaller(request.auth)
  const activityId = request.data?.activityId
  if (!activityId) throw new HttpsError('invalid-argument', 'Informe o activityId.')

  const activity = await loadActivity(activityId)
  if (!activity.googleEventId) return { ok: true, skipped: true }
  if (activity.visitId) await assertCanWriteVisit(caller, activity.visitId)

  try {
    const calendar = calendarFor(await getAuthorizedClient(caller.uid))
    await calendar.events.delete({ calendarId: 'primary', eventId: activity.googleEventId })
  } catch (error) {
    // 404/410: o evento já não existe no Google — só limpamos a referência local.
    if (!isMissingEvent(error)) return rethrowGoogleError(caller.uid, error)
  }

  await db.collection('activities').doc(activityId).update({
    googleEventId: FieldValue.delete(),
    updatedAt: FieldValue.serverTimestamp(),
  })

  return { ok: true, skipped: false }
})

export const syncVisitActivitiesToGoogle = onCall<{ visitId?: string }>(async (request) => {
  const caller = requireCaller(request.auth)
  const visitId = request.data?.visitId
  if (!visitId) throw new HttpsError('invalid-argument', 'Informe o visitId.')

  await assertCanWriteVisit(caller, visitId)

  const snap = await db.collection('activities').where('visitId', '==', visitId).get()
  const pending = snap.docs.filter((doc) => doc.get('isDeleted') !== true)

  let synced = 0
  let conflicts = 0
  let failed = 0

  for (const doc of pending) {
    try {
      const result = await syncActivity(caller, doc.id)
      synced += 1
      if (result.conflict) conflicts += 1
    } catch (error) {
      // Reautenticação necessária interrompe o lote: adianta pouco insistir.
      if (error instanceof HttpsError && error.message === REAUTH_MESSAGE) throw error
      failed += 1
      logger.error(`Falha ao sincronizar atividade ${doc.id}`, error)
    }
  }

  return { ok: true, total: pending.length, synced, conflicts, failed }
})

/**
 * Esqueleto do Outlook. Próximos passos: registrar o app no Azure AD,
 * pedir o escopo Calendars.ReadWrite e replicar o fluxo do Google
 * (start → callback → refresh token no Admin SDK → sync de atividades).
 */
export const outlookCalendarOAuthStart = onCall(async (request) => {
  requireCaller(request.auth)
  throw new HttpsError(
    'unimplemented',
    'A integração com Outlook ainda não está disponível.',
  )
})

export {
  askHelpAssistant,
  draftCommunication,
  getAiStatus,
  mapProgrammingImport,
} from './ai/callables'
