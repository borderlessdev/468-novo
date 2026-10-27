/**
 * Publicação do orçamento e decisão do cliente.
 * A decisão comercial (`decision`) não é a aprovação interna do Financeiro (`approvalStatus`).
 * A criação do lançamento acontece depois da decisão, com id fixo, para falha não apagar
 * a decisão nem duplicar o documento.
 */
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { FieldValue, getFirestore } from 'firebase-admin/firestore'
import { callerIsPlatformAdmin } from './platformAdmin'
import { escapeEmailHtml, sendResendEmail } from './resendEmail'

const db = getFirestore()

type BudgetDecision = 'approved' | 'rejected' | 'changes_requested'

function financeDocId(budgetItemId: string): string {
  return `budget_${budgetItemId}`
}

function lineAmount(quantity: number, unitAmount: number): number {
  return Math.round(quantity * unitAmount * 100) / 100
}

function decisionLabel(decision: BudgetDecision): string {
  if (decision === 'approved') return 'aprovado'
  if (decision === 'rejected') return 'rejeitado'
  return 'com mudanças solicitadas'
}

function formatMoney(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

/**
 * Comprovante para o cliente + aviso para quem criou o orçamento.
 * Falha de e-mail não reverte a decisão (caller deve .catch).
 */
async function sendBudgetDecisionEmails(input: {
  budgetItemId: string
  decision: BudgetDecision
  note?: string
  clientUid: string
  budgetCreatedBy: string
  visitId: string
  visitTitle: string
  description: string
  quantity: number
  unitAmount: number
  lineAmount: number
}): Promise<void> {
  const [clientSnap, creatorSnap] = await Promise.all([
    db.collection('users').doc(input.clientUid).get(),
    input.budgetCreatedBy && input.budgetCreatedBy !== input.clientUid
      ? db.collection('users').doc(input.budgetCreatedBy).get()
      : Promise.resolve(null),
  ])

  const clientEmail = String(clientSnap.get('email') ?? '').trim()
  const clientName = String(clientSnap.get('name') ?? '').trim() || 'Cliente'
  const status = decisionLabel(input.decision)
  const amount = formatMoney(input.lineAmount)
  const origin = (process.env.APP_ORIGIN?.trim() || 'https://app.promoverexperience.com.br').replace(
    /\/+$/,
    '',
  )
  const orcamentoUrl = `${origin}/orcamento`
  const noteLine =
    input.decision === 'changes_requested' && input.note
      ? `\nPedido de mudança: ${input.note}`
      : ''

  const detailText = [
    `Visita: ${input.visitTitle}`,
    `Item: ${input.description}`,
    `Quantidade: ${input.quantity}`,
    `Valor unitário: ${formatMoney(input.unitAmount)}`,
    `Total: ${amount}`,
    `Decisão: ${status}`,
  ].join('\n')

  if (clientEmail) {
    const subject =
      input.decision === 'approved'
        ? `Confirmação do orçamento — ${input.visitTitle}`
        : `Atualização do orçamento — ${input.visitTitle}`
    const greeting = `Olá ${clientName},`
    const body =
      input.decision === 'approved'
        ? `${greeting}\n\nRegistramos a confirmação do item abaixo no orçamento.\n\n${detailText}\n\nAcompanhe em: ${orcamentoUrl}`
        : `${greeting}\n\nSua decisão sobre o item abaixo foi registrada (${status}).\n\n${detailText}${noteLine}\n\nAcompanhe em: ${orcamentoUrl}`
    const html = `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto">
      <h2>${escapeEmailHtml(subject)}</h2>
      <p>${escapeEmailHtml(greeting)}</p>
      <p>${
        input.decision === 'approved'
          ? 'Registramos a confirmação do item abaixo no orçamento.'
          : `Sua decisão sobre o item abaixo foi registrada (${escapeEmailHtml(status)}).`
      }</p>
      <ul>
        <li><strong>Visita:</strong> ${escapeEmailHtml(input.visitTitle)}</li>
        <li><strong>Item:</strong> ${escapeEmailHtml(input.description)}</li>
        <li><strong>Quantidade:</strong> ${input.quantity}</li>
        <li><strong>Valor unitário:</strong> ${escapeEmailHtml(formatMoney(input.unitAmount))}</li>
        <li><strong>Total:</strong> ${escapeEmailHtml(amount)}</li>
        <li><strong>Decisão:</strong> ${escapeEmailHtml(status)}</li>
      </ul>
      ${
        input.decision === 'changes_requested' && input.note
          ? `<p><strong>Pedido de mudança:</strong> ${escapeEmailHtml(input.note)}</p>`
          : ''
      }
      <p><a href="${escapeEmailHtml(orcamentoUrl)}" style="display:inline-block;padding:12px 18px;background:#003d3a;color:#fff;border-radius:6px;text-decoration:none">Abrir orçamento</a></p>
    </div>`
    await sendResendEmail({
      to: clientEmail,
      subject,
      text: body,
      html,
      kind: 'budget_decision',
      createdBy: input.clientUid,
      visitId: input.visitId,
      dedupeKey: `budget-decision:${input.budgetItemId}:${input.decision}:${clientEmail}`,
    })
  }

  const creatorEmail = creatorSnap ? String(creatorSnap.get('email') ?? '').trim() : ''
  if (creatorEmail && creatorEmail.toLowerCase() !== clientEmail.toLowerCase()) {
    const creatorName = String(creatorSnap?.get('name') ?? '').trim() || 'Equipe'
    const subject = `Cliente ${status} item do orçamento — ${input.visitTitle}`
    const text = `Olá ${creatorName},\n\n${clientName} registrou a decisão "${status}" no orçamento.\n\n${detailText}${noteLine}\n\nAbrir: ${orcamentoUrl}`
    const html = `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto">
      <h2>${escapeEmailHtml(subject)}</h2>
      <p>Olá ${escapeEmailHtml(creatorName)},</p>
      <p><strong>${escapeEmailHtml(clientName)}</strong> registrou a decisão “${escapeEmailHtml(status)}” no orçamento.</p>
      <ul>
        <li><strong>Visita:</strong> ${escapeEmailHtml(input.visitTitle)}</li>
        <li><strong>Item:</strong> ${escapeEmailHtml(input.description)}</li>
        <li><strong>Total:</strong> ${escapeEmailHtml(amount)}</li>
      </ul>
      ${
        input.decision === 'changes_requested' && input.note
          ? `<p><strong>Pedido de mudança:</strong> ${escapeEmailHtml(input.note)}</p>`
          : ''
      }
      <p><a href="${escapeEmailHtml(orcamentoUrl)}" style="display:inline-block;padding:12px 18px;background:#003d3a;color:#fff;border-radius:6px;text-decoration:none">Abrir orçamento</a></p>
    </div>`
    await sendResendEmail({
      to: creatorEmail,
      subject,
      text,
      html,
      kind: 'budget_decision',
      createdBy: input.clientUid,
      visitId: input.visitId,
      dedupeKey: `budget-decision:${input.budgetItemId}:${input.decision}:${creatorEmail}`,
    })
  }
}

async function assertOrgStaff(uid: string, orgId: string, token: Record<string, unknown>) {
  if (await callerIsPlatformAdmin(uid, token)) return
  const member = await db.collection('organizationMembers').doc(`${orgId}_${uid}`).get()
  const role = String(member.get('orgRole') ?? '')
  if (!member.exists || !['org_admin', 'team', 'user'].includes(role)) {
    throw new HttpsError('permission-denied', 'Sem permissão para gerenciar este orçamento.')
  }
  if (role === 'org_admin') return
  const profile = await db.collection('users').doc(uid).get()
  const permissions = profile.get('modulePermissions') as { finance?: boolean } | undefined
  if (permissions?.finance === false) {
    throw new HttpsError('permission-denied', 'O módulo financeiro não está liberado para este usuário.')
  }
}

export const publishBudget = onCall({ cors: true, invoker: 'public' }, async (request) => {
  if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Faça login.')
  const budgetId = String(request.data?.budgetId ?? '').trim()
  if (!budgetId) throw new HttpsError('invalid-argument', 'Orçamento obrigatório.')
  const uid = request.auth.uid

  const budgetRef = db.collection('budgets').doc(budgetId)
  const budgetSnap = await budgetRef.get()
  if (!budgetSnap.exists) throw new HttpsError('not-found', 'Orçamento não encontrado.')
  const budget = budgetSnap.data() ?? {}
  if (budget.status === 'published') return { ok: true }
  if (budget.status !== 'draft') {
    throw new HttpsError('failed-precondition', 'Este orçamento não pode ser publicado.')
  }

  const orgId = String(budget.orgId ?? '')
  const visitId = String(budget.visitId ?? '')
  const clientUserId = String(budget.clientUserId ?? '')
  if (!orgId || !visitId || !clientUserId) {
    throw new HttpsError('failed-precondition', 'Orçamento sem visita ou cliente.')
  }

  await assertOrgStaff(uid, orgId, request.auth.token as unknown as Record<string, unknown>)

  const [visitSnap, clientMember, itemSnap] = await Promise.all([
    db.collection('visits').doc(visitId).get(),
    db.collection('organizationMembers').doc(`${orgId}_${clientUserId}`).get(),
    db.collection('budgetItems').where('budgetId', '==', budgetId).get(),
  ])

  if (!visitSnap.exists || String(visitSnap.get('orgId') ?? '') !== orgId || visitSnap.get('isDeleted') === true) {
    throw new HttpsError('failed-precondition', 'A visita não pertence a esta empresa.')
  }
  if (!clientMember.exists || clientMember.get('orgRole') !== 'client' || clientMember.get('orgId') !== orgId) {
    throw new HttpsError('failed-precondition', 'O cliente informado não pertence a esta empresa.')
  }
  if (itemSnap.empty) throw new HttpsError('failed-precondition', 'Inclua ao menos um item antes de publicar.')

  const items = itemSnap.docs.map((item) => {
    const data = item.data()
    const description = String(data.description ?? '').trim()
    const quantity = Number(data.quantity)
    const unitAmount = Number(data.unitAmount)
    if (description.length < 2 || !Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(unitAmount) || unitAmount < 0) {
      throw new HttpsError('failed-precondition', 'Há itens com descrição, quantidade ou valor inválidos.')
    }
    if (data.orgId !== orgId || data.visitId !== visitId || data.clientUserId !== clientUserId) {
      throw new HttpsError('failed-precondition', 'Há itens que não pertencem a esta visita e cliente.')
    }
    if (data.decision !== 'pending') {
      throw new HttpsError('failed-precondition', 'Não é possível publicar um item que já teve decisão.')
    }
    return { ref: item.ref, lineAmount: lineAmount(quantity, unitAmount) }
  })

  const publishedAt = new Date().toISOString()
  await db.runTransaction(async (transaction) => {
    const current = await transaction.get(budgetRef)
    if (!current.exists) throw new HttpsError('not-found', 'Orçamento não encontrado.')
    if (current.get('status') === 'published') return
    transaction.update(budgetRef, {
      status: 'published',
      publishedAt,
      publishedBy: uid,
      updatedAt: FieldValue.serverTimestamp(),
    })
    for (const item of items) {
      transaction.update(item.ref, {
        lineAmount: item.lineAmount,
        budgetStatus: 'published',
        updatedAt: FieldValue.serverTimestamp(),
      })
    }
    transaction.update(db.collection('visits').doc(visitId), {
      clientUserIds: FieldValue.arrayUnion(clientUserId),
      updatedAt: FieldValue.serverTimestamp(),
    })
  })

  return { ok: true }
})

async function linkFinanceItem(budgetItemId: string, uid: string) {
  const itemRef = db.collection('budgetItems').doc(budgetItemId)
  const financeRef = db.collection('financeItems').doc(financeDocId(budgetItemId))

  await db.runTransaction(async (transaction) => {
    const itemSnap = await transaction.get(itemRef)
    const financeSnap = await transaction.get(financeRef)
    if (!itemSnap.exists) throw new HttpsError('not-found', 'Item não encontrado.')
    const item = itemSnap.data() ?? {}
    if (item.decision !== 'approved') {
      throw new HttpsError('failed-precondition', 'Só um item aprovado gera lançamento financeiro.')
    }
    if (item.clientUserId !== uid) {
      throw new HttpsError('permission-denied', 'Este item pertence a outro cliente.')
    }

    if (!financeSnap.exists) {
      const budgetSnap = await transaction.get(db.collection('budgets').doc(String(item.budgetId)))
      transaction.set(financeRef, {
        visitId: item.visitId,
        serviceType: 'terceiro',
        serviceName: String(item.description ?? ''),
        budget1: null,
        budget2: null,
        budget3: null,
        serviceValue: null,
        actualValue: null,
        winningCompany: null,
        nfReceived: false,
        nfDueDate: null,
        approvalStatus: 'pending',
        clientBudgetAmount: Number(item.lineAmount ?? 0),
        budgetItemId,
        ownerId: String(budgetSnap.get('createdBy') ?? uid),
        isDeleted: false,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      })
    }

    transaction.update(itemRef, {
      financeItemId: financeRef.id,
      integrationStatus: 'created',
      updatedAt: FieldValue.serverTimestamp(),
    })
  })

  return financeRef.id
}

export const decideBudgetItem = onCall({ cors: true, invoker: 'public' }, async (request) => {
  if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Faça login.')
  const budgetItemId = String(request.data?.budgetItemId ?? '').trim()
  const decision = request.data?.decision as BudgetDecision
  const note = String(request.data?.note ?? '').trim()
  const validDecision =
    decision === 'approved' || decision === 'rejected' || decision === 'changes_requested'
  if (!budgetItemId || !validDecision) {
    throw new HttpsError('invalid-argument', 'Decisão inválida.')
  }
  if (decision === 'changes_requested' && note.length < 3) {
    throw new HttpsError('invalid-argument', 'Descreva a mudança desejada (mínimo 3 caracteres).')
  }
  const uid = request.auth.uid
  const itemRef = db.collection('budgetItems').doc(budgetItemId)

  const preview = await itemRef.get()
  if (!preview.exists) throw new HttpsError('not-found', 'Item não encontrado.')
  const current = preview.data() ?? {}
  if (current.clientUserId !== uid) {
    throw new HttpsError('permission-denied', 'Este item pertence a outro cliente.')
  }
  if (current.budgetStatus !== 'published') {
    throw new HttpsError('failed-precondition', 'Este orçamento ainda não foi disponibilizado.')
  }
  if (current.decision !== 'pending' && current.decision !== decision) {
    throw new HttpsError('failed-precondition', 'Esta linha já teve uma decisão e não pode ser alterada.')
  }

  const wasPending = current.decision === 'pending'
  let budgetCreatedBy = ''
  let visitTitle = 'sua visita'
  const visitId = String(current.visitId ?? '')

  if (wasPending) {
    const budgetSnap = await db.collection('budgets').doc(String(current.budgetId)).get()
    const visitSnap = await db.collection('visits').doc(visitId).get()
    if (!budgetSnap.exists || budgetSnap.get('status') !== 'published' || budgetSnap.get('clientUserId') !== uid) {
      throw new HttpsError('failed-precondition', 'Orçamento não disponível para este cliente.')
    }
    if (!visitSnap.exists || visitSnap.get('orgId') !== current.orgId || visitSnap.get('orgId') !== budgetSnap.get('orgId')) {
      throw new HttpsError('failed-precondition', 'A visita não pertence à empresa deste orçamento.')
    }
    const profile = await db.collection('users').doc(uid).get()
    if (profile.get('orgId') !== current.orgId || profile.get('role') !== 'client') {
      throw new HttpsError('permission-denied', 'Somente o cliente desta empresa pode decidir.')
    }
    budgetCreatedBy = String(budgetSnap.get('createdBy') ?? '')
    visitTitle = String(visitSnap.get('title') ?? '').trim() || visitTitle

    await db.runTransaction(async (transaction) => {
      const fresh = await transaction.get(itemRef)
      const data = fresh.data() ?? {}
      if (data.decision === decision) return
      if (data.decision !== 'pending') {
        throw new HttpsError('failed-precondition', 'Esta linha já teve uma decisão e não pode ser alterada.')
      }
      const patch: Record<string, unknown> = {
        decision,
        decidedBy: uid,
        decidedAt: new Date().toISOString(),
        integrationStatus: decision === 'approved' ? 'pending' : 'none',
        updatedAt: FieldValue.serverTimestamp(),
      }
      if (decision === 'changes_requested') {
        patch.changeRequestNote = note
      } else {
        patch.changeRequestNote = FieldValue.delete()
      }
      transaction.update(itemRef, patch)
    })
  }

  const notifyIfFirstDecision = async () => {
    if (!wasPending) return
    await sendBudgetDecisionEmails({
      budgetItemId,
      decision,
      note: decision === 'changes_requested' ? note : undefined,
      clientUid: uid,
      budgetCreatedBy,
      visitId,
      visitTitle,
      description: String(current.description ?? ''),
      quantity: Number(current.quantity) || 0,
      unitAmount: Number(current.unitAmount) || 0,
      lineAmount: Number(current.lineAmount) || 0,
    }).catch(() => undefined)
  }

  if (decision === 'rejected' || decision === 'changes_requested') {
    await notifyIfFirstDecision()
    return { ok: true, integrationStatus: 'none' as const }
  }

  if (current.integrationStatus === 'created' && current.financeItemId) {
    await notifyIfFirstDecision()
    return {
      ok: true,
      financeItemId: String(current.financeItemId),
      integrationStatus: 'created' as const,
    }
  }

  try {
    const financeItemId = await linkFinanceItem(budgetItemId, uid)
    await notifyIfFirstDecision()
    return { ok: true, financeItemId, integrationStatus: 'created' as const }
  } catch (error) {
    await itemRef.set({
      integrationStatus: 'failed',
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true })
    // Decisão já gravada: ainda envia o comprovante.
    await notifyIfFirstDecision()
    if (error instanceof HttpsError) throw error
    throw new HttpsError(
      'internal',
      'A aprovação foi registrada, mas o lançamento financeiro não foi criado. Tente novamente.',
    )
  }
})

/**
 * Equipe responde a um pedido de mudança: atualiza a linha e volta a decisão para pending.
 */
export const reviseBudgetItem = onCall({ cors: true, invoker: 'public' }, async (request) => {
  if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Faça login.')
  const budgetItemId = String(request.data?.budgetItemId ?? '').trim()
  const description = String(request.data?.description ?? '').trim()
  const quantity = Number(request.data?.quantity)
  const unitAmount = Number(request.data?.unitAmount)
  if (!budgetItemId || description.length < 2) {
    throw new HttpsError('invalid-argument', 'Item e descrição são obrigatórios.')
  }
  if (!Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(unitAmount) || unitAmount < 0) {
    throw new HttpsError('invalid-argument', 'Quantidade ou valor inválidos.')
  }

  const uid = request.auth.uid
  const itemRef = db.collection('budgetItems').doc(budgetItemId)
  const itemSnap = await itemRef.get()
  if (!itemSnap.exists) throw new HttpsError('not-found', 'Item não encontrado.')
  const item = itemSnap.data() ?? {}
  if (item.budgetStatus !== 'published' || item.decision !== 'changes_requested') {
    throw new HttpsError(
      'failed-precondition',
      'Só é possível revisar um item publicado com mudanças solicitadas pelo cliente.',
    )
  }

  const orgId = String(item.orgId ?? '')
  await assertOrgStaff(uid, orgId, request.auth.token as unknown as Record<string, unknown>)

  const amount = lineAmount(quantity, unitAmount)
  await itemRef.update({
    description,
    quantity,
    unitAmount,
    lineAmount: amount,
    decision: 'pending',
    decidedBy: FieldValue.delete(),
    decidedAt: FieldValue.delete(),
    changeRequestNote: FieldValue.delete(),
    integrationStatus: 'none',
    updatedAt: FieldValue.serverTimestamp(),
  })

  return { ok: true, lineAmount: amount }
})
