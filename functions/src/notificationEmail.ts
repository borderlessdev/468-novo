import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { getFirestore } from 'firebase-admin/firestore'
import { escapeEmailHtml, sendResendEmail } from './resendEmail'

const db = getFirestore()
const TYPES = new Set([
  'visit_created', 'visit_status_changed', 'task_created', 'task_status_changed',
  'task_due_soon', 'task_overdue', 'document_uploaded', 'document_pending',
  'finance_nf_due', 'finance_nf_overdue', 'finance_approval', 'team_updated',
  'activity_soon', 'visit_soon', 'guest_confirmed', 'guest_registration',
])

function enabled(data: FirebaseFirestore.DocumentData, type: string): boolean {
  const preferences = data.emailNotificationPreferences as Record<string, unknown> | undefined
  return preferences?.[typeToPreference(type)] !== false
}

function typeToPreference(type: string): string {
  return ({
    task_due_soon: 'taskDueSoon', task_overdue: 'taskOverdue',
    finance_nf_due: 'financeNfDue', finance_nf_overdue: 'financeNfOverdue',
    finance_approval: 'financeApproval', visit_status_changed: 'visitStatusChanged',
    visit_created: 'visitCreated', visit_soon: 'visitSoon', task_created: 'taskCreated',
    task_status_changed: 'taskStatusChanged', document_uploaded: 'documentUploaded',
    document_pending: 'documentPending', team_updated: 'teamUpdated', activity_soon: 'activitySoon',
    guest_confirmed: 'guestConfirmed', guest_registration: 'guestRegistration',
  } as Record<string, string>)[type] ?? type
}

export const dispatchNotificationEmail = onCall(async (request) => {
  if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Faça login.')
  const input = request.data ?? {}
  const type = String(input.type ?? '')
  const recipientId = String(input.recipientId ?? '')
  const title = String(input.title ?? '').trim().slice(0, 180)
  const body = String(input.body ?? '').trim().slice(0, 1_000)
  const visitId = String(input.visitId ?? '').trim()
  if (!TYPES.has(type) || !recipientId || !title || !body) {
    throw new HttpsError('invalid-argument', 'Evento de notificação inválido.')
  }

  const [recipientSnap, visitSnap] = await Promise.all([
    db.collection('users').doc(recipientId).get(),
    visitId ? db.collection('visits').doc(visitId).get() : Promise.resolve(null),
  ])
  if (!recipientSnap.exists) throw new HttpsError('not-found', 'Destinatário não encontrado.')
  const recipient = recipientSnap.data()!
  const email = String(recipient.email ?? '').trim()
  if (!email || !enabled(recipient, type)) return { ok: true, skipped: 'preference' }

  let href = String(input.href ?? '').trim()
  if (visitId) {
    if (!visitSnap?.exists) throw new HttpsError('not-found', 'Visita não encontrada.')
    const visit = visitSnap.data()!
    const orgId = String(visit.orgId ?? '')
    const callerMember = await db.collection('organizationMembers').doc(`${orgId}_${request.auth.uid}`).get()
    const callerAllowed = request.auth.uid === visit.ownerId || (Array.isArray(visit.teamMemberIds) && visit.teamMemberIds.includes(request.auth.uid)) || callerMember.get('orgRole') === 'org_admin' || request.auth.token.platformAdmin === true
    if (!callerAllowed) throw new HttpsError('permission-denied', 'Sem acesso à visita.')
    const recipientMember = await db.collection('organizationMembers').doc(`${orgId}_${recipientId}`).get()
    const role = String(recipientMember.get('orgRole') ?? '')
    if (!recipientMember.exists || !['org_admin', 'team', 'user'].includes(role)) {
      return { ok: true, skipped: 'recipient_not_internal' }
    }
    // Financeiro também alcança administradores internos; demais eventos só partes da visita.
    const involved = recipientId === visit.ownerId || (visit.teamMemberIds ?? []).includes(recipientId)
    if (!involved && !(type.startsWith('finance_') || type === 'finance_approval') && role !== 'org_admin') {
      return { ok: true, skipped: 'recipient_not_involved' }
    }
  }

  const origin = (process.env.APP_ORIGIN || '').replace(/\/+$/, '')
  if (href && !/^https?:\/\//i.test(href) && origin) href = `${origin}${href.startsWith('/') ? '' : '/'}${href}`
  const text = `${title}\n\n${body}${href ? `\n\nAbrir no Promover Experience: ${href}` : ''}`
  const html = `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto"><h2>${escapeEmailHtml(title)}</h2><p>${escapeEmailHtml(body)}</p>${href ? `<p><a href="${escapeEmailHtml(href)}" style="display:inline-block;padding:12px 18px;background:#003d3a;color:#fff;border-radius:6px;text-decoration:none">Abrir no sistema</a></p>` : ''}</div>`
  await sendResendEmail({
    to: email, subject: title, text, html, kind: 'notification', createdBy: request.auth.uid,
    visitId: visitId || undefined,
    dedupeKey: `notification:${recipientId}:${type}:${String(input.dedupeKey || input.entityId || Date.now())}`,
  })
  return { ok: true }
})

export const sendVisitSummaryEmail = onCall(async (request) => {
  if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Faça login.')
  const input = request.data ?? {}
  const to = String(input.to ?? '').trim()
  const subject = String(input.subject ?? '').trim().slice(0, 180)
  const text = String(input.body ?? '').trim().slice(0, 10_000)
  const visitId = String(input.visitId ?? '').trim()
  if (!to || !subject || !text) throw new HttpsError('invalid-argument', 'Resumo de visita inválido.')
  if (visitId) {
    const visitSnap = await db.collection('visits').doc(visitId).get()
    if (!visitSnap.exists) throw new HttpsError('not-found', 'Visita não encontrada.')
    const visit = visitSnap.data()!
    const member = await db.collection('organizationMembers').doc(`${String(visit.orgId)}_${request.auth.uid}`).get()
    const allowed = request.auth.uid === visit.ownerId || (visit.teamMemberIds ?? []).includes(request.auth.uid) || member.get('orgRole') === 'org_admin' || request.auth.token.platformAdmin === true
    if (!allowed) throw new HttpsError('permission-denied', 'Sem acesso à visita.')
  }
  const result = await sendResendEmail({
    to, subject, text, kind: 'visit_summary', createdBy: request.auth.uid,
    visitId: visitId || undefined,
    dedupeKey: `visit-summary:${request.auth.uid}:${visitId}:${subject}:${text.length}`,
  })
  return { ok: true, id: result.id, skipped: result.skipped }
})
