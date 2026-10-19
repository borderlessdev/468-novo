/**
 * Publicação do orçamento e decisão do cliente.
 * A decisão comercial (`decision`) não é a aprovação interna do Financeiro (`approvalStatus`).
 * A criação do lançamento acontece depois da decisão, com id fixo, para falha não apagar
 * a decisão nem duplicar o documento.
 */
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { FieldValue, getFirestore } from 'firebase-admin/firestore'
import { callerIsPlatformAdmin } from './platformAdmin'

const db = getFirestore()

function financeDocId(budgetItemId: string): string {
  return `budget_${budgetItemId}`
}

function lineAmount(quantity: number, unitAmount: number): number {
  return Math.round(quantity * unitAmount * 100) / 100
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
  const decision = request.data?.decision
  if (!budgetItemId || (decision !== 'approved' && decision !== 'rejected')) {
    throw new HttpsError('invalid-argument', 'Decisão inválida.')
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

  if (current.decision === 'pending') {
    const budgetSnap = await db.collection('budgets').doc(String(current.budgetId)).get()
    const visitSnap = await db.collection('visits').doc(String(current.visitId)).get()
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

    await db.runTransaction(async (transaction) => {
      const fresh = await transaction.get(itemRef)
      const data = fresh.data() ?? {}
      if (data.decision === decision) return
      if (data.decision !== 'pending') {
        throw new HttpsError('failed-precondition', 'Esta linha já teve uma decisão e não pode ser alterada.')
      }
      transaction.update(itemRef, {
        decision,
        decidedBy: uid,
        decidedAt: new Date().toISOString(),
        integrationStatus: decision === 'approved' ? 'pending' : 'none',
        updatedAt: FieldValue.serverTimestamp(),
      })
    })
  }

  if (decision === 'rejected') {
    return { ok: true, integrationStatus: 'none' as const }
  }

  if (current.integrationStatus === 'created' && current.financeItemId) {
    return {
      ok: true,
      financeItemId: String(current.financeItemId),
      integrationStatus: 'created' as const,
    }
  }

  try {
    const financeItemId = await linkFinanceItem(budgetItemId, uid)
    return { ok: true, financeItemId, integrationStatus: 'created' as const }
  } catch (error) {
    await itemRef.set({
      integrationStatus: 'failed',
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true })
    if (error instanceof HttpsError) throw error
    throw new HttpsError(
      'internal',
      'A aprovação foi registrada, mas o lançamento financeiro não foi criado. Tente novamente.',
    )
  }
})
