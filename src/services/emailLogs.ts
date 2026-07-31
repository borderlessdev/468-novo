import {
  addDoc,
  collection,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  where,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import type { EmailLog, EmailLogKind, EmailLogStatus } from '@/types'

const col = collection(db, 'emailLogs')

function mapLog(id: string, data: Record<string, unknown>): EmailLog {
  return {
    id,
    to: Array.isArray(data.to) ? (data.to as string[]) : [],
    subject: String(data.subject ?? ''),
    visitId: data.visitId ? String(data.visitId) : undefined,
    kind: data.kind as EmailLogKind,
    status: data.status as EmailLogStatus,
    createdBy: String(data.createdBy ?? ''),
    createdAt: data.createdAt,
  }
}

export async function createEmailLog(input: {
  to: string[]
  subject: string
  visitId?: string
  kind: EmailLogKind
  status: EmailLogStatus
  createdBy: string
}): Promise<string> {
  const ref = await addDoc(col, {
    to: input.to,
    subject: input.subject,
    visitId: input.visitId ?? null,
    kind: input.kind,
    status: input.status,
    createdBy: input.createdBy,
    createdAt: serverTimestamp(),
  })
  return ref.id
}

export async function listEmailLogs(
  createdBy: string,
  isAdmin: boolean,
): Promise<EmailLog[]> {
  const snap = await getDocs(
    isAdmin
      ? query(col, orderBy('createdAt', 'desc'))
      : query(col, where('createdBy', '==', createdBy), orderBy('createdAt', 'desc')),
  )
  return snap.docs.map((d) => mapLog(d.id, d.data()))
}
