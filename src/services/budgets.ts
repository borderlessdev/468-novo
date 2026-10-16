import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { db, functions } from '@/lib/firebase'
import type {
  Budget,
  BudgetDecision,
  BudgetIntegrationStatus,
  BudgetItem,
  BudgetStatus,
} from '@/types'

const budgetsCol = collection(db, 'budgets')
const itemsCol = collection(db, 'budgetItems')

const callPublishBudget = httpsCallable<{ budgetId: string }, { ok: boolean }>(
  functions,
  'publishBudget',
)
const callDecideBudgetItem = httpsCallable<
  { budgetItemId: string; decision: 'approved' | 'rejected' },
  { ok: boolean; financeItemId?: string; integrationStatus: BudgetIntegrationStatus }
>(functions, 'decideBudgetItem')

function asStatus(value: unknown): BudgetStatus {
  return value === 'published' ? 'published' : 'draft'
}

function asDecision(value: unknown): BudgetDecision {
  if (value === 'approved' || value === 'rejected') return value
  return 'pending'
}

function asIntegration(value: unknown): BudgetIntegrationStatus {
  if (value === 'pending' || value === 'created' || value === 'failed') return value
  return 'none'
}

export function computeLineAmount(quantity: number, unitAmount: number): number {
  return Math.round(quantity * unitAmount * 100) / 100
}

function mapBudget(id: string, data: Record<string, unknown>): Budget {
  return {
    id,
    orgId: String(data.orgId ?? ''),
    visitId: String(data.visitId ?? ''),
    clientUserId: String(data.clientUserId ?? ''),
    status: asStatus(data.status),
    createdBy: String(data.createdBy ?? ''),
    publishedAt: data.publishedAt ? String(data.publishedAt) : undefined,
    publishedBy: data.publishedBy ? String(data.publishedBy) : undefined,
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
  }
}

function mapItem(id: string, data: Record<string, unknown>): BudgetItem {
  return {
    id,
    budgetId: String(data.budgetId ?? ''),
    orgId: String(data.orgId ?? ''),
    visitId: String(data.visitId ?? ''),
    clientUserId: String(data.clientUserId ?? ''),
    description: String(data.description ?? ''),
    quantity: Number(data.quantity ?? 0),
    unitAmount: Number(data.unitAmount ?? 0),
    lineAmount: Number(data.lineAmount ?? 0),
    budgetStatus: asStatus(data.budgetStatus),
    decision: asDecision(data.decision),
    decidedBy: data.decidedBy ? String(data.decidedBy) : undefined,
    decidedAt: data.decidedAt ? String(data.decidedAt) : undefined,
    financeItemId: data.financeItemId ? String(data.financeItemId) : undefined,
    integrationStatus: asIntegration(data.integrationStatus),
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
  }
}

export async function listBudgetsByOrg(orgId: string): Promise<Budget[]> {
  const snap = await getDocs(query(budgetsCol, where('orgId', '==', orgId)))
  return snap.docs
    .map((item) => mapBudget(item.id, item.data()))
    .sort((a, b) => String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? '')))
}

export async function listPublishedBudgetsForClient(
  orgId: string,
  clientUserId: string,
): Promise<Budget[]> {
  const snap = await getDocs(
    query(
      budgetsCol,
      where('orgId', '==', orgId),
      where('clientUserId', '==', clientUserId),
      where('status', '==', 'published'),
    ),
  )
  return snap.docs.map((item) => mapBudget(item.id, item.data()))
}

export async function listBudgetItems(budgetId: string, orgId: string): Promise<BudgetItem[]> {
  const snap = await getDocs(
    query(itemsCol, where('budgetId', '==', budgetId), where('orgId', '==', orgId)),
  )
  return snap.docs
    .map((item) => mapItem(item.id, item.data()))
    .sort((a, b) => a.description.localeCompare(b.description, 'pt-BR'))
}

export async function listPublishedBudgetItemsForClient(
  budgetId: string,
  orgId: string,
  clientUserId: string,
): Promise<BudgetItem[]> {
  const snap = await getDocs(
    query(
      itemsCol,
      where('budgetId', '==', budgetId),
      where('orgId', '==', orgId),
      where('clientUserId', '==', clientUserId),
      where('budgetStatus', '==', 'published'),
    ),
  )
  return snap.docs
    .map((item) => mapItem(item.id, item.data()))
    .sort((a, b) => a.description.localeCompare(b.description, 'pt-BR'))
}

export async function listBudgetItemsByOrg(orgId: string): Promise<BudgetItem[]> {
  const snap = await getDocs(query(itemsCol, where('orgId', '==', orgId)))
  return snap.docs.map((item) => mapItem(item.id, item.data()))
}

export async function createBudget(input: {
  orgId: string
  visitId: string
  clientUserId: string
  createdBy: string
}): Promise<string> {
  const ref = await addDoc(budgetsCol, {
    orgId: input.orgId,
    visitId: input.visitId,
    clientUserId: input.clientUserId,
    status: 'draft',
    createdBy: input.createdBy,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
  return ref.id
}

export async function createBudgetItem(input: {
  budgetId: string
  orgId: string
  visitId: string
  clientUserId: string
  description: string
  quantity: number
  unitAmount: number
}): Promise<string> {
  const description = input.description.trim()
  if (description.length < 2) throw new Error('Descrição obrigatória')
  if (!Number.isFinite(input.quantity) || input.quantity <= 0) {
    throw new Error('Quantidade deve ser maior que zero')
  }
  if (!Number.isFinite(input.unitAmount) || input.unitAmount < 0) {
    throw new Error('Valor unitário inválido')
  }
  const ref = await addDoc(itemsCol, {
    budgetId: input.budgetId,
    orgId: input.orgId,
    visitId: input.visitId,
    clientUserId: input.clientUserId,
    description,
    quantity: input.quantity,
    unitAmount: input.unitAmount,
    lineAmount: computeLineAmount(input.quantity, input.unitAmount),
    budgetStatus: 'draft',
    decision: 'pending',
    integrationStatus: 'none',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
  return ref.id
}

export async function updateBudgetItem(
  id: string,
  input: { description: string; quantity: number; unitAmount: number },
): Promise<void> {
  const description = input.description.trim()
  if (description.length < 2) throw new Error('Descrição obrigatória')
  if (!Number.isFinite(input.quantity) || input.quantity <= 0) {
    throw new Error('Quantidade deve ser maior que zero')
  }
  if (!Number.isFinite(input.unitAmount) || input.unitAmount < 0) {
    throw new Error('Valor unitário inválido')
  }
  await updateDoc(doc(itemsCol, id), {
    description,
    quantity: input.quantity,
    unitAmount: input.unitAmount,
    lineAmount: computeLineAmount(input.quantity, input.unitAmount),
    updatedAt: serverTimestamp(),
  })
}

export async function deleteBudgetItem(id: string): Promise<void> {
  await deleteDoc(doc(itemsCol, id))
}

export async function deleteBudget(id: string, orgId: string): Promise<void> {
  const items = await listBudgetItems(id, orgId)
  await Promise.all(items.map((item) => deleteDoc(doc(itemsCol, item.id))))
  await deleteDoc(doc(budgetsCol, id))
}

export async function publishBudget(budgetId: string): Promise<void> {
  try {
    await callPublishBudget({ budgetId })
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : 'Não foi possível publicar')
  }
}

export async function decideBudgetItem(
  budgetItemId: string,
  decision: 'approved' | 'rejected',
): Promise<{ financeItemId?: string; integrationStatus: BudgetIntegrationStatus }> {
  try {
    const { data } = await callDecideBudgetItem({ budgetItemId, decision })
    return data
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : 'Não foi possível registrar a decisão')
  }
}
