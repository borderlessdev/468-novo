import {
  addDoc,
  collection,
  doc,
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import {
  getEmailDeliveryMode,
  isFirestoreEmailEnabled,
} from '@/services/email'
import { createEmailLog } from '@/services/emailLogs'
import type { Invite, InviteRole, InviteStatus } from '@/types'

const col = collection(db, 'invites')

function mapInvite(id: string, data: Record<string, unknown>): Invite {
  return {
    id,
    email: String(data.email ?? ''),
    role: data.role as InviteRole,
    token: String(data.token ?? ''),
    status: (data.status as InviteStatus) ?? 'pending',
    createdBy: String(data.createdBy ?? ''),
    visitId: data.visitId ? String(data.visitId) : undefined,
    expiresAt: String(data.expiresAt ?? ''),
    createdAt: data.createdAt,
    acceptedAt: data.acceptedAt,
    acceptedBy: data.acceptedBy ? String(data.acceptedBy) : undefined,
  }
}

export async function createInvite(input: {
  email: string
  role: InviteRole
  createdBy: string
  visitId?: string
  createdByName?: string
}): Promise<Invite & { link: string; mailtoOpened: boolean }> {
  const token = crypto.randomUUID().replace(/-/g, '')
  const expires = new Date()
  expires.setDate(expires.getDate() + 14)
  const expiresAt = expires.toISOString()

  const ref = await addDoc(col, {
    email: input.email.trim().toLowerCase(),
    role: input.role,
    token,
    status: 'pending',
    createdBy: input.createdBy,
    visitId: input.visitId ?? null,
    expiresAt,
    createdAt: serverTimestamp(),
  })

  const invite: Invite = {
    id: ref.id,
    email: input.email.trim().toLowerCase(),
    role: input.role,
    token,
    status: 'pending',
    createdBy: input.createdBy,
    visitId: input.visitId,
    expiresAt,
  }

  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  const link = `${origin}/cadastro?invite=${token}`
  const subject = 'Convite — Promover Experience'
  const body = [
    `Você foi convidado como ${input.role === 'team' ? 'equipe' : 'cliente'}.`,
    '',
    `Acesse o link para criar sua conta:`,
    link,
    '',
    `Este convite expira em 14 dias.`,
  ].join('\n')

  let mailtoOpened = false
  if (isFirestoreEmailEnabled()) {
    await addDoc(collection(db, 'mail'), {
      to: [invite.email],
      message: { subject, text: body },
      createdAt: serverTimestamp(),
    })
    await createEmailLog({
      to: [invite.email],
      subject,
      visitId: input.visitId,
      kind: 'invite',
      status: 'queued',
      createdBy: input.createdBy,
    })
  } else {
    await createEmailLog({
      to: [invite.email],
      subject,
      visitId: input.visitId,
      kind: 'invite',
      status: 'mailto',
      createdBy: input.createdBy,
    })
    // Não redireciona a página — abre em nova aba/janela se o browser permitir
    const mailto = `mailto:${invite.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
    const opened = window.open(mailto, '_blank')
    mailtoOpened = opened != null
  }

  return { ...invite, link, mailtoOpened }
}

export async function getInviteByToken(token: string): Promise<Invite | null> {
  const snap = await getDocs(query(col, where('token', '==', token)))
  if (snap.empty) return null
  const invite = mapInvite(snap.docs[0].id, snap.docs[0].data())
  if (invite.status !== 'pending') return null
  if (new Date(invite.expiresAt).getTime() < Date.now()) return null
  return invite
}

export async function acceptInvite(inviteId: string, uid: string): Promise<void> {
  await updateDoc(doc(col, inviteId), {
    status: 'accepted',
    acceptedBy: uid,
    acceptedAt: serverTimestamp(),
  })
}

export async function listInvitesByCreator(createdBy: string): Promise<Invite[]> {
  const snap = await getDocs(query(col, where('createdBy', '==', createdBy)))
  return snap.docs
    .map((d) => mapInvite(d.id, d.data()))
    .sort((a, b) => b.expiresAt.localeCompare(a.expiresAt))
}

export { getEmailDeliveryMode }
