import {
  addDoc,
  collection,
  deleteField,
  doc,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore'
import { deleteObject, getDownloadURL, ref, uploadBytes } from 'firebase/storage'
import { db, storage } from '@/lib/firebase'
import { getVisitChildDocs } from '@/lib/firestore-visit-query'
import { softDeleteEntity } from '@/services/trash'
import { listVisits } from '@/services/visits'
import type { FinanceAttachment, FinanceItem, UserRole } from '@/types'

const col = collection(db, 'financeItems')

function mapItem(id: string, data: Record<string, unknown>): FinanceItem {
  const mapAttachment = (value: unknown): FinanceAttachment | undefined => {
    if (!value || typeof value !== 'object') return undefined
    const attachment = value as Record<string, unknown>
    if (!attachment.storagePath || !attachment.name) return undefined
    return {
      id: String(attachment.id ?? attachment.storagePath),
      name: String(attachment.name),
      storagePath: String(attachment.storagePath),
      contentType: String(attachment.contentType ?? ''),
      size: Number(attachment.size ?? 0),
      uploadedAt: String(attachment.uploadedAt ?? ''),
    }
  }
  const budgetAttachments = Array.isArray(data.budgetAttachments)
    ? data.budgetAttachments.flatMap((value) => {
        const attachment = mapAttachment(value)
        return attachment ? [attachment] : []
      })
    : []
  const storedInvoiceAttachment = mapAttachment(data.invoiceAttachment)
  const legacyInvoiceAttachment = data.attachmentPath
    ? {
        id: String(data.attachmentPath),
        name: String(data.attachmentName ?? 'Nota fiscal'),
        storagePath: String(data.attachmentPath),
        contentType: '',
        size: 0,
        uploadedAt: '',
      }
    : undefined
  return {
    id,
    visitId: String(data.visitId ?? ''),
    serviceName: String(data.serviceName ?? ''),
    budget1: data.budget1 != null ? Number(data.budget1) : undefined,
    budget2: data.budget2 != null ? Number(data.budget2) : undefined,
    budget3: data.budget3 != null ? Number(data.budget3) : undefined,
    serviceValue: data.serviceValue != null ? Number(data.serviceValue) : undefined,
    actualValue: data.actualValue != null ? Number(data.actualValue) : undefined,
    winningCompany: data.winningCompany ? String(data.winningCompany) : undefined,
    nfReceived: Boolean(data.nfReceived),
    nfDueDate: data.nfDueDate ? String(data.nfDueDate) : undefined,
    approvalStatus:
      data.approvalStatus === 'approved' || data.approvalStatus === 'rejected'
        ? data.approvalStatus
        : 'pending',
    approvedBy: data.approvedBy ? String(data.approvedBy) : undefined,
    approvedByName: data.approvedByName ? String(data.approvedByName) : undefined,
    approvedAt: data.approvedAt ? String(data.approvedAt) : undefined,
    rejectionReason: data.rejectionReason ? String(data.rejectionReason) : undefined,
    attachmentPath: data.attachmentPath ? String(data.attachmentPath) : undefined,
    attachmentName: data.attachmentName ? String(data.attachmentName) : undefined,
    budgetAttachments,
    invoiceAttachment: storedInvoiceAttachment ?? legacyInvoiceAttachment,
    ownerId: String(data.ownerId ?? ''),
    isDeleted: data.isDeleted === true,
    deletedAt: data.deletedAt,
    deletedBy: data.deletedBy ? String(data.deletedBy) : undefined,
    expiresAt: data.expiresAt,
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
  }
}

export async function listFinanceItems(
  visitId: string,
  ownerId: string,
  isAdmin: boolean,
): Promise<FinanceItem[]> {
  const items = await getVisitChildDocs(col, visitId, ownerId, isAdmin, (d) =>
    mapItem(d.id, d.data()),
  )
  return items.filter((item) => !item.isDeleted)
}

export async function listFinanceItemsByOwner(
  ownerId: string,
  isAdmin: boolean,
  role: UserRole = 'user',
): Promise<FinanceItem[]> {
  const visits = await listVisits(ownerId, isAdmin, role)
  if (visits.length === 0) return []

  const itemsPerVisit = await Promise.all(
    visits.map((visit) => listFinanceItems(visit.id, visit.ownerId, isAdmin)),
  )

  return itemsPerVisit.flat()
}

export async function createFinanceItem(
  ownerId: string,
  data: Omit<FinanceItem, 'id' | 'ownerId' | 'createdAt' | 'updatedAt'>,
): Promise<string> {
  const ref = await addDoc(col, {
    visitId: data.visitId,
    serviceName: data.serviceName,
    budget1: data.budget1 ?? null,
    budget2: data.budget2 ?? null,
    budget3: data.budget3 ?? null,
    serviceValue: data.serviceValue ?? null,
    actualValue: data.actualValue ?? null,
    winningCompany: data.winningCompany ?? null,
    nfReceived: data.nfReceived,
    nfDueDate: data.nfDueDate ?? null,
    approvalStatus: data.approvalStatus ?? 'pending',
    approvedBy: data.approvedBy ?? null,
    approvedByName: data.approvedByName ?? null,
    approvedAt: data.approvedAt ?? null,
    rejectionReason: data.rejectionReason ?? null,
    attachmentPath: data.attachmentPath ?? null,
    attachmentName: data.attachmentName ?? null,
    budgetAttachments: data.budgetAttachments ?? [],
    invoiceAttachment: data.invoiceAttachment ?? null,
    ownerId,
    isDeleted: false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
  return ref.id
}

export async function updateFinanceItem(
  id: string,
  data: Partial<Omit<FinanceItem, 'id' | 'ownerId' | 'createdAt'>>,
): Promise<void> {
  await updateDoc(doc(col, id), {
    ...data,
    updatedAt: serverTimestamp(),
  })
}

export async function setFinanceApproval(
  id: string,
  input: {
    approvalStatus: 'approved' | 'rejected'
    approvedBy: string
    approvedByName?: string
    rejectionReason?: string
  },
): Promise<void> {
  await updateDoc(doc(col, id), {
    approvalStatus: input.approvalStatus,
    approvedBy: input.approvedBy,
    approvedByName: input.approvedByName ?? null,
    approvedAt: new Date().toISOString(),
    rejectionReason:
      input.approvalStatus === 'rejected' ? (input.rejectionReason ?? null) : null,
    updatedAt: serverTimestamp(),
  })
}

export async function deleteFinanceItem(id: string, deletedBy: string): Promise<void> {
  await softDeleteEntity('financeItem', id, deletedBy)
}

const FINANCE_ALLOWED_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
const FINANCE_MAX_SIZE = 10 * 1024 * 1024

export type FinanceAttachmentKind = 'budget' | 'invoice'

function validateFinanceFile(file: File) {
  if (!FINANCE_ALLOWED_TYPES.includes(file.type)) {
    throw new Error('Use PDF, JPG, PNG ou WEBP.')
  }
  if (file.size >= FINANCE_MAX_SIZE) {
    throw new Error('Arquivo muito grande. Máximo 10 MB.')
  }
}

function safeFileName(name: string) {
  return name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9._-]/g, '_')
}

export async function uploadFinanceFile(
  item: FinanceItem,
  file: File,
  kind: FinanceAttachmentKind,
): Promise<void> {
  validateFinanceFile(file)
  if (kind === 'budget' && (item.budgetAttachments?.length ?? 0) >= 3) {
    throw new Error('Cada linha permite no máximo 3 orçamentos.')
  }
  if (kind === 'invoice' && item.invoiceAttachment) {
    throw new Error('Remova a nota fiscal atual antes de enviar outra.')
  }

  const id = crypto.randomUUID()
  const folder = kind === 'budget' ? 'budgets' : 'invoice'
  const storagePath = `visits/${item.visitId}/finance/${item.id}/${folder}/${id}-${safeFileName(file.name)}`
  const attachment: FinanceAttachment = {
    id,
    name: file.name,
    storagePath,
    contentType: file.type,
    size: file.size,
    uploadedAt: new Date().toISOString(),
  }

  await uploadBytes(ref(storage, storagePath), file, { contentType: file.type })
  try {
    if (kind === 'budget') {
      await updateFinanceItem(item.id, {
        budgetAttachments: [...(item.budgetAttachments ?? []), attachment],
      })
    } else {
      await updateFinanceItem(item.id, {
        invoiceAttachment: attachment,
        attachmentPath: attachment.storagePath,
        attachmentName: attachment.name,
      })
    }
  } catch (error) {
    await deleteObject(ref(storage, storagePath)).catch(() => undefined)
    throw error
  }
}

export async function removeFinanceFile(
  item: FinanceItem,
  attachment: FinanceAttachment,
  kind: FinanceAttachmentKind,
): Promise<void> {
  if (kind === 'budget') {
    await updateFinanceItem(item.id, {
      budgetAttachments: (item.budgetAttachments ?? []).filter(
        (current) => current.id !== attachment.id,
      ),
    })
  } else {
    await updateDoc(doc(col, item.id), {
      invoiceAttachment: deleteField(),
      attachmentPath: deleteField(),
      attachmentName: deleteField(),
      updatedAt: serverTimestamp(),
    })
  }
  await deleteObject(ref(storage, attachment.storagePath)).catch(() => undefined)
}

export async function uploadFinanceAttachment(
  item: FinanceItem,
  file: File,
): Promise<void> {
  validateFinanceFile(file)

  const storagePath = `visits/${item.visitId}/finance/${item.id}/${file.name}`
  await uploadBytes(ref(storage, storagePath), file, { contentType: file.type })
  await updateFinanceItem(item.id, {
    attachmentPath: storagePath,
    attachmentName: file.name,
  })
}

export async function getFinanceAttachmentUrl(storagePath: string): Promise<string> {
  return getDownloadURL(ref(storage, storagePath))
}

export async function removeFinanceAttachment(item: FinanceItem): Promise<void> {
  if (item.attachmentPath) {
    try {
      await deleteObject(ref(storage, item.attachmentPath))
    } catch {
      // ignore missing file
    }
  }
  await updateDoc(doc(col, item.id), {
    invoiceAttachment: deleteField(),
    attachmentPath: deleteField(),
    attachmentName: deleteField(),
    updatedAt: serverTimestamp(),
  })
}
