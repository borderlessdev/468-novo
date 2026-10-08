import { onSchedule } from 'firebase-functions/v2/scheduler'
import { FieldValue, getFirestore } from 'firebase-admin/firestore'
import { sendResendEmail } from './resendEmail'

const db = getFirestore()
const DAY = 86_400_000

const preferenceByType: Record<string, string> = {
  task_due_soon: 'taskDueSoon', task_overdue: 'taskOverdue',
  finance_nf_due: 'financeNfDue', finance_nf_overdue: 'financeNfOverdue',
  visit_soon: 'visitSoon', activity_soon: 'activitySoon', document_pending: 'documentPending',
}

function dateOnly(value: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(value)
}

function daysUntil(value: string, today: string): number {
  return Math.round((Date.parse(`${value}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / DAY)
}

function enabled(profile: FirebaseFirestore.DocumentData, type: string, channel: 'email' | 'inapp') {
  const field = channel === 'email' ? 'emailNotificationPreferences' : 'notificationPreferences'
  const prefs = profile[field] as Record<string, unknown> | undefined
  return prefs?.[preferenceByType[type]] !== false
}

async function recipientsFor(visit: FirebaseFirestore.DocumentData, includeAdmins = true) {
  const orgId = String(visit.orgId ?? '')
  const memberSnap = await db.collection('organizationMembers').where('orgId', '==', orgId).get()
  const eligible = memberSnap.docs.filter((member) => ['org_admin', 'team', 'user'].includes(String(member.get('orgRole'))))
  const profiles = await Promise.all(eligible.map(async (member) => {
    const uid = String(member.get('uid') ?? '')
    const profile = await db.collection('users').doc(uid).get()
    return profile.exists ? { uid, orgRole: String(member.get('orgRole')), profile: profile.data()! } : null
  }))
  const involved = new Set<string>([String(visit.ownerId ?? ''), ...(Array.isArray(visit.teamMemberIds) ? visit.teamMemberIds : [])])
  return profiles.filter((item): item is NonNullable<typeof item> => Boolean(item) && (includeAdmins ? involved.has(item!.uid) || item!.orgRole === 'org_admin' : involved.has(item!.uid)))
}

async function deliver(input: {
  recipient: { uid: string; profile: FirebaseFirestore.DocumentData }
  visitId: string
  type: keyof typeof preferenceByType
  entityId: string
  title: string
  body: string
  href: string
  dedupeKey: string
}) {
  const { recipient, ...notification } = input
  if (enabled(recipient.profile, input.type, 'inapp')) {
    await db.collection('notifications').add({
      recipientId: recipient.uid, ...notification, read: false, createdAt: FieldValue.serverTimestamp(),
    })
  }
  if (!enabled(recipient.profile, input.type, 'email')) return
  const email = String(recipient.profile.email ?? '').trim()
  if (!email) return
  const origin = (process.env.APP_ORIGIN || '').replace(/\/+$/, '')
  const url = origin ? `${origin}${input.href}` : input.href
  await sendResendEmail({
    to: email,
    subject: input.title,
    text: `${input.body}\n\nAbrir no sistema: ${url}`,
    kind: 'notification',
    createdBy: 'system',
    visitId: input.visitId,
    dedupeKey: `reminder:${recipient.uid}:${input.dedupeKey}`,
  })
}

/** Roda mesmo sem alguém com o app aberto; o fuso evita alertas fora do horário esperado. */
export const sendDailyOperationalReminders = onSchedule(
  { schedule: '0 8 * * *', timeZone: 'America/Sao_Paulo', retryCount: 1 },
  async () => {
    const today = dateOnly(new Date())
    const visits = await db.collection('visits').get()
    for (const visitDoc of visits.docs) {
      const visit = visitDoc.data()
      if (visit.isDeleted === true || !['planejamento', 'em_andamento'].includes(String(visit.status))) continue
      const visitId = visitDoc.id
      const recipients = await recipientsFor(visit)
      const title = String(visit.title ?? 'Visita')
      const sendTo = (type: keyof typeof preferenceByType, entityId: string, subject: string, body: string, href: string, key: string, recipientsOverride = recipients) =>
        Promise.all(recipientsOverride.map((recipient) => deliver({ recipient, visitId, type, entityId, title: subject, body, href, dedupeKey: key })))

      const startIn = daysUntil(String(visit.startDate ?? ''), today)
      if (startIn >= 0 && startIn <= 2) {
        await sendTo('visit_soon', visitId, 'Visita próxima', `“${title}” começa ${startIn === 0 ? 'hoje' : `em ${startIn} dia(s)`}.`, `/visitas/${visitId}`, `visit-soon:${visitId}:${visit.startDate}`)
      }

      const [tasks, finance, activities, placeholders, documents] = await Promise.all([
        db.collection('tasks').where('visitId', '==', visitId).get(),
        db.collection('financeItems').where('visitId', '==', visitId).get(),
        db.collection('activities').where('visitId', '==', visitId).get(),
        db.collection('documentPlaceholders').where('visitId', '==', visitId).get(),
        db.collection('documents').where('visitId', '==', visitId).get(),
      ])
      for (const task of tasks.docs) {
        const item = task.data(); const due = String(item.dueDate ?? '')
        if (item.isDeleted === true || item.status === 'completed' || !due) continue
        const days = daysUntil(due, today)
        if (days < 0) await sendTo('task_overdue', task.id, 'Tarefa atrasada', `“${String(item.title ?? 'Tarefa')}” em ${title} venceu em ${due}.`, `/planejamento?visita=${visitId}`, `task-overdue:${task.id}:${due}`)
        else if (days <= 3) await sendTo('task_due_soon', task.id, 'Tarefa com prazo próximo', `“${String(item.title ?? 'Tarefa')}” em ${title} vence em ${days} dia(s).`, `/planejamento?visita=${visitId}`, `task-due:${task.id}:${due}`)
      }
      const financeRecipients = await recipientsFor(visit, true)
      for (const itemDoc of finance.docs) {
        const item = itemDoc.data(); const due = String(item.nfDueDate ?? '')
        if (item.isDeleted === true || item.nfReceived || !due) continue
        const days = daysUntil(due, today)
        if (days < 0) await sendTo('finance_nf_overdue', itemDoc.id, 'NF atrasada', `“${String(item.serviceName ?? 'Item financeiro')}” em ${title} venceu em ${due}.`, `/financeiro?visita=${visitId}`, `nf-overdue:${itemDoc.id}:${due}`, financeRecipients)
        else if (days <= 7) await sendTo('finance_nf_due', itemDoc.id, 'NF com vencimento próximo', `“${String(item.serviceName ?? 'Item financeiro')}” em ${title} vence em ${days} dia(s).`, `/financeiro?visita=${visitId}`, `nf-due:${itemDoc.id}:${due}`, financeRecipients)
      }
      for (const activity of activities.docs) {
        const item = activity.data(); const when = Date.parse(`${String(item.date ?? '')}T${String(item.startTime ?? '')}:00`)
        if (item.isDeleted === true || Number.isNaN(when) || when < Date.now() || when > Date.now() + DAY) continue
        await sendTo('activity_soon', activity.id, 'Atividade nas próximas 24h', `“${String(item.title ?? 'Atividade')}” em ${title}.`, `/programacao?visita=${visitId}`, `activity:${activity.id}:${item.startTime}`)
      }
      const categories = new Set(documents.docs.filter((doc) => doc.get('isDeleted') !== true).map((doc) => String(doc.get('category') ?? '')))
      const missing = placeholders.docs.some((doc) => !categories.has(String(doc.get('category') ?? '')))
      if (missing || (placeholders.empty && documents.empty)) {
        await sendTo('document_pending', visitId, 'Documentos pendentes', `“${title}” precisa de atenção na documentação.`, `/visitas/${visitId}`, `documents:${visitId}:${today}`)
      }
    }
  },
)
